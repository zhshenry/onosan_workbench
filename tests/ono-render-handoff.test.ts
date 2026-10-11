import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prepareDispatch, parseArgs, STATE, WORKFLOW } from '../tooling/ono/render-pilot/prepare-dispatch.mjs';

const sha = 'a'.repeat(40);
const base = { approved_sha: sha, current_main_sha: sha };
const publication = { ...base, publish: true, target_issue: '42', approval_id: 'test-only-approval' };
const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8').replace(/\r\n?/g, '\n');
const script = fileURLToPath(new URL('../tooling/ono/render-pilot/prepare-dispatch.mjs', import.meta.url));

test('default preparation emits only exact existing workflow inputs and no upload', () => {
  assert.equal(WORKFLOW, 'ono-prototype-render.yml');
  assert.equal(STATE, 'historical-design-a-home');
  assert.deepEqual(prepareDispatch(base), { ref: 'main', inputs: {
    approved_sha: sha, prototype_state: STATE, post_attachment: false,
    target_issue: '', approval_id: '',
  } });
  assert.deepEqual(base, { approved_sha: sha, current_main_sha: sha });
});

test('explicit publication includes exact target and marker without extra command fields', () => {
  assert.deepEqual(prepareDispatch(publication), { ref: 'main', inputs: {
    approved_sha: sha, prototype_state: STATE, post_attachment: true,
    target_issue: '42', approval_id: 'test-only-approval',
  } });
});

for (const [name, input] of [
  ['null', null], ['array', []], ['no SHA', {}],
  ['short SHA', { ...base, approved_sha: 'aaaaaaa' }],
  ['uppercase SHA', { ...base, approved_sha: 'A'.repeat(40), current_main_sha: 'A'.repeat(40) }],
  ['changed main', { ...base, current_main_sha: 'b'.repeat(40) }],
  ['missing current main', { approved_sha: sha }],
  ['boolean string', { ...base, publish: 'true' }],
  ['numeric boolean', { ...base, publish: 1 }],
  ['implicit destination', { ...base, target_issue: '7' }],
  ['implicit marker', { ...base, approval_id: 'old-approval' }],
  ['explicit false destination', { ...base, publish: false, target_issue: '7' }],
  ['missing issue', { ...publication, target_issue: undefined }],
  ['numeric issue', { ...publication, target_issue: 42 }],
  ['zero issue', { ...publication, target_issue: '0' }],
  ['leading zero issue', { ...publication, target_issue: '042' }],
  ['oversized issue', { ...publication, target_issue: '1000000000' }],
  ['issue URL', { ...publication, target_issue: 'https://github.com/zhshenry/onosan_workbench/issues/7' }],
  ['missing marker', { ...publication, approval_id: undefined }],
  ['short marker', { ...publication, approval_id: 'short' }],
  ['oversized marker', { ...publication, approval_id: 'a'.repeat(65) }],
  ['marker newline', { ...publication, approval_id: 'approval\nanything' }],
  ['marker shell text', { ...publication, approval_id: '$(touch file)' }],
  ['alternate ref', { ...base, ref: 'feature' }],
  ['alternate state', { ...base, prototype_state: 'current-product' }],
  ['alternate repository', { ...base, repository: 'other/repo' }],
  ['token field', { ...base, token: 'not-a-real-token' }],
] as const) {
  test(`preparation refuses ${name}`, () => assert.throws(() => prepareDispatch(input)));
}

test('CLI parsing preserves values and publication is opt-in', () => {
  assert.deepEqual(parseArgs(['--approved-sha', sha, '--current-main-sha', sha]), base);
  assert.deepEqual(parseArgs(['--publish', '--target-issue', '42', '--approval-id', 'test-only-approval',
    '--approved-sha', sha, '--current-main-sha', sha]), publication);
});

for (const args of [
  ['--approved-sha'], ['--approved-sha', '--publish'], ['--unknown', 'value'],
  ['--approved-sha', sha, '--approved-sha', sha], ['--publish', '--publish'],
  ['--publish=true'], ['--approval-id', 'a'.repeat(65)], Array(10).fill('--publish'),
]) {
  test(`CLI rejects malformed arguments ${JSON.stringify(args)}`, () => assert.throws(() => parseArgs(args)));
}

test('CLI emits parseable payload plus explicit non-dispatch status', () => {
  const result = spawnSync(process.execPath, [script, '--approved-sha', sha, '--current-main-sha', sha], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), prepareDispatch(base));
  assert.match(result.stderr, /parameters only\. No dispatch performed/);
});

test('CLI refusal has no payload and never echoes arguments', () => {
  const result = spawnSync(process.execPath, [script, '--token', 'accidental-sensitive-test-value'], {
    encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.doesNotMatch(result.stderr, /accidental-sensitive-test-value/);
});

test('helper stays preparation-only and matches the workflow input names', () => {
  const source = read('tooling/ono/render-pilot/prepare-dispatch.mjs');
  const imports = [...source.matchAll(/^import .* from '([^']+)';$/gm)].map(match => match[1]);
  assert.deepEqual(imports, ['node:path', 'node:url', './candidates.mjs']);
  assert.doesNotMatch(source, /process\.env|\bfetch\s*\(|child_process|https?:\/\//);
  const workflow = read(`.github/workflows/${WORKFLOW}`);
  const inputNames = [...workflow.matchAll(/^      ([a-z_]+):$/gm)].map(match => match[1]);
  assert.deepEqual(Object.keys(prepareDispatch(base).inputs), inputNames);
  assert.match(workflow, /options: \[historical-design-a-home, issue-13-year-picker-v1\]/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.doesNotMatch(workflow, /^  (?:issue_comment|push|repository_dispatch):/m);
});

test('historical record embeds the same existing native URL with explicit source and version', () => {
  // Text-only facts independently read from original comment 6073909178 and
  // run 37881203730. No stored image or live-image/visual validation is implied.
  const record = read('docs/ONO-HISTORICAL-DESIGN-A-RECORD.md');
  const sourceSha = '7313fddf62f69561c492d553ca02548b7b704126';
  const asset = 'https://github.com/user-attachments/assets/5a50874f-d48c-416a-bd7f-ce0d517890a9';
  const images = [...record.matchAll(/^!\[([^\]\n]+)\]\((https:[^)]+)\)$/gm)];
  assert.equal(images.length, 1);
  assert.equal(images[0][2], asset);
  assert.ok(images[0][1].includes(`${STATE}@${sourceSha}`));
  assert.doesNotMatch(record, /```|data:image|mockups\/_shots/);
  for (const value of [
    '记录版本：v1', `historical-design-a-home@${sourceSha}`,
    `blob/${sourceSha}/design/mockups/design-a-glass.html`,
    'e5841f61e2edd7c4c60e50bec7edd999e6d23e8e6f06d9fcea2ec92e3f136d8d',
    'b3ea95d3363593d98e3380fbedde82742bd52cd1599a639282a52a4cbd93f7e8',
    '/issues/7#issuecomment-6073909178', '/actions/runs/37881203730',
    'attempt 1', 'ono-render-20261009-7313fdd', 'Visual review: pending',
  ]) assert.ok(record.includes(value), `Missing historical binding: ${value}`);
});
