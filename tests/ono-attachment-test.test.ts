import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { executeProbe, validateContext, validatePreflight, makePng } from '../tooling/ono/attachment-test.mjs';
const sha = 'a'.repeat(40);
const env = { GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'zhshenry/onosan_workbench', GITHUB_REPOSITORY_ID: '1372377655', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, APPROVED_SHA: sha, TARGET_ISSUE: '42', APPROVAL_ID: 'test-approval-20261008', POST_ATTACHMENT: 'false', GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', GH_TOKEN: 'fake-for-unit-tests-only' };
const response = () => ({ data: { viewer: { login: 'zhshenry' }, repository: { databaseId: 1372377655, nameWithOwner: 'zhshenry/onosan_workbench', isArchived: false, viewerPermission: 'WRITE', defaultBranchRef: { name: 'main', target: { oid: sha } }, issue: { number: 42, state: 'OPEN', locked: false } } } });
function stub({ failWrite = false, existing = false, failQueryAfterWrite = false } = {}) {
  const calls: string[][] = []; let wrote = false;
  const run = (args: string[]) => {
    calls.push(args);
    if (args[0] === 'issue') { wrote = true; if (failWrite) throw new Error('simulated ambiguous timeout'); return 'suppressed'; }
    if (args[1] === 'graphql') return JSON.stringify(response());
    if (wrote && failQueryAfterWrite) throw new Error('query failed');
    const comments = existing || wrote ? [{ id: 5, user: { login: 'zhshenry' }, body: '<!-- ono-attachment-test:test-approval-20261008 -->\n![test](https://github.com/user-attachments/assets/example)' }] : [];
    return JSON.stringify([comments]);
  };
  return { run, calls };
}
test('context rejects missing secret, invalid input, wrong event/repo/ref and changed SHA', () => {
  for (const patch of [{ GH_TOKEN: '' }, { TARGET_ISSUE: '' }, { TARGET_ISSUE: '1; echo bad' }, { TARGET_ISSUE: '-1' }, { APPROVAL_ID: '../foo' }, { POST_ATTACHMENT: '' }, { GITHUB_EVENT_NAME: 'pull_request' }, { GITHUB_REPOSITORY_ID: '7' }, { GITHUB_REPOSITORY: 'fork/repo' }, { GITHUB_REF: 'refs/heads/feature' }, { APPROVED_SHA: 'b'.repeat(40) }, { GITHUB_RUN_ATTEMPT: '' }]) assert.throws(() => validateContext({ ...env, ...patch }));
});
test('PAT preflight checks identity, write permission, issue status, and current main', () => {
  const ctx = validateContext(env); validatePreflight(response(), ctx);
  for (const mutation of [(r: any) => r.data.viewer.login = 'other', (r: any) => r.data.repository.databaseId = 7, (r: any) => r.data.repository.viewerPermission = 'READ', (r: any) => r.data.repository.defaultBranchRef.target.oid = 'b'.repeat(40), (r: any) => r.data.repository.issue = null, (r: any) => r.data.repository.issue.locked = true, (r: any) => r.data.repository.issue.state = 'CLOSED', (r: any) => r.errors = ['denied']]) { const data = response(); mutation(data); assert.throws(() => validatePreflight(data, ctx)); }
});
test('read-only is default and never invokes comment or writes image', () => { const fake = stub(); assert.equal(executeProbe(env, fake.run, () => {}).status, 'preflight'); assert.equal(fake.calls.length, 2); assert.ok(fake.calls.every(args => args[0] === 'api')); });
test('one explicit upload uses fixed repo, body file, one attachment, no shell', () => { const fake = stub(); assert.equal(executeProbe({ ...env, POST_ATTACHMENT: 'true' }, fake.run, () => {}).status, 'comment-recorded'); const writes = fake.calls.filter(args => args[0] === 'issue'); assert.equal(writes.length, 1); assert.deepEqual(writes[0].slice(0, 5), ['issue', 'comment', '42', '--repo', 'zhshenry/onosan_workbench']); assert.equal(writes[0][5], '--body-file'); assert.equal(writes[0][7], '--attach'); });
test('existing marker or rerun never produces another comment', () => { for (const [fake, patch] of [[stub({ existing: true }), {}], [stub(), { GITHUB_RUN_ATTEMPT: '2' }]] as const) { assert.throws(() => executeProbe({ ...env, POST_ATTACHMENT: 'true', ...patch }, fake.run, () => {})); assert.ok(fake.calls.every(args => args[0] !== 'issue')); } });
test('partial write failure queries results and never retries even if comment exists', () => { const fake = stub({ failWrite: true }); assert.throws(() => executeProbe({ ...env, POST_ATTACHMENT: 'true' }, fake.run, () => {}), /uncertain/); assert.equal(fake.calls.filter(args => args[0] === 'issue').length, 1); assert.equal(fake.calls.at(-1)?.[0], 'api'); });
test('failed recovery read never retries upload', () => { const fake = stub({ failQueryAfterWrite: true }); assert.throws(() => executeProbe({ ...env, POST_ATTACHMENT: 'true' }, fake.run, () => {}), /Upload outcome uncertain; reconciliation query failed; do not retry/); assert.equal(fake.calls.filter(args => args[0] === 'issue').length, 1); });
test('synthetic PNG is small, deterministic, and contains valid 16x16 RGBA data', () => { const png = makePng(); assert.ok(png.length < 2048); assert.deepEqual(png, makePng()); assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a'); assert.equal(png.readUInt32BE(16), 16); assert.equal(png.readUInt32BE(20), 16); const idatLength = png.readUInt32BE(33); assert.equal(png.toString('ascii', 37, 41), 'IDAT'); assert.equal(inflateSync(png.subarray(41, 41 + idatLength)).length, 16 * 65); });
test('workflow static contract isolates secret, pins binary, disallows unattended trigger and backups', () => {
  const yaml = readFileSync(new URL('../.github/workflows/ono-attachment-test.yml', import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
  assert.ok(yaml.includes('  workflow_dispatch:')); assert.doesNotMatch(yaml, /pull_request|schedule:|\n  push:|upload-artifact|npm ci|npm install/);
  assert.equal((yaml.match(/secrets\.ONOSAN_GH_TOKEN/g) ?? []).length, 1);
  assert.ok(yaml.includes("github.ref == 'refs/heads/main'")); assert.ok(yaml.includes('ref: ${{ github.sha }}')); assert.ok(yaml.includes('persist-credentials: false'));
  assert.ok(yaml.includes('default: false')); assert.ok(yaml.includes('cancel-in-progress: false')); assert.ok(yaml.includes('permissions:\n  contents: read'));
  assert.ok(yaml.includes('bb766f710eef8ede859c18578c72c327597cd4c8a85b06001b1f3843c6019386'));
  assert.ok(yaml.includes('sha256sum --check --strict'));
  assert.equal((yaml.match(/uses: .+@[a-f0-9]{40}/g) ?? []).length, 2);
  assert.ok(yaml.indexOf('secrets.ONOSAN_GH_TOKEN') > yaml.indexOf('name: Preflight and explicitly approved'));
  const script = readFileSync(new URL('../tooling/ono/attachment-test.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(script, /shell:\s*true|auth login|secret set|issue.*create|console\.log\(env/);
});
