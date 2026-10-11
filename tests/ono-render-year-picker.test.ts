import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { JSDOM } from 'jsdom';
import { CANDIDATES, CANDIDATE, STATE, ISSUE13_STATE, getCandidate, verifySource } from '../tooling/ono/render-pilot/candidates.mjs';
import { render, validateRenderContext, verifyIssue13State, sha256 } from '../tooling/ono/render-pilot/render.mjs';
import { prepareDispatch, parseArgs } from '../tooling/ono/render-pilot/prepare-dispatch.mjs';
import { checkManifest, publish } from '../tooling/ono/render-pilot/publish.mjs';
import { encodeRgba, normalizePng } from '../tooling/ono/render-pilot/png.mjs';
import { RenderDiagnosticError, classifyError } from '../tooling/ono/render-pilot/diagnostics.mjs';

// All browser and GitHub operations are mocks. Generated PNGs are unit fixtures,
// never screenshots, uploaded evidence, visual review or product acceptance.
const candidate = getCandidate(ISSUE13_STATE);
const source = readFileSync(candidate.source);
const sha = 'a'.repeat(40);
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'zhshenry/onosan_workbench', GITHUB_REPOSITORY_ID: '1372377655',
  GITHUB_ACTOR: 'zhshenry', GITHUB_ACTOR_ID: '54107847', GITHUB_TRIGGERING_ACTOR: 'zhshenry',
  GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha, APPROVED_SHA: sha,
  GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1', PROTOTYPE_STATE: ISSUE13_STATE,
  RUNNER_TEMP: '/synthetic/issue13', PATH: '/synthetic/bin', HOME: '/synthetic/home', PLAYWRIGHT_BROWSERS_PATH: '/synthetic/browsers',
  TARGET_ISSUE: '13', POST_ATTACHMENT: 'true', APPROVAL_ID: 'year-picker-test-approval',
};
const base = { approved_sha: sha, current_main_sha: sha, prototype_state: ISSUE13_STATE };
const attachment = 'https://github.com/user-attachments/assets/12345678-1234-1234-1234-123456789abc';

function domPage(dom: JSDOM) {
  return {
    locator(selector: string) {
      const all = () => [...dom.window.document.querySelectorAll(selector)] as HTMLElement[];
      const one = () => { assert.equal(all().length, 1); return all()[0]; };
      return {
        async waitFor() { if (!all().length) throw Object.assign(new Error('fixture not ready'), { name: 'TimeoutError' }); },
        async count() { return all().length; },
        async textContent() { return one().textContent; },
        async inputValue() { return (one() as HTMLInputElement).value; },
        async getAttribute(name: string) { return one().getAttribute(name); },
        async isVisible() { return all().length === 1 && !one().closest('[hidden]'); },
      };
    },
  };
}
const loadDom = () => new JSDOM(source.toString('utf8'), { runScripts: 'dangerously' });

function harness(patch: { source?: Uint8Array; mutate?: (dom: JSDOM) => void; blocked?: boolean; socket?: boolean; scriptError?: boolean; screenshotError?: boolean } = {}) {
  const calls: string[] = [], writes = new Map<string, any>(), logs: string[] = [];
  let dom: JSDOM | undefined, launchOptions: any, contextOptions: any;
  const raw = Buffer.from('synthetic raw screenshot'), png = { width: 1440, height: 1024, bytes: Buffer.from('synthetic normalized PNG'), pixels: Buffer.from('synthetic pixels') };
  const page = {
    on(_name: string, callback: (error: Error) => void) { if (patch.scriptError) callback(new Error('private fixture')); },
    async setContent(content: string) { calls.push('content'); assert.match(content, /<head><meta http-equiv="Content-Security-Policy"/); dom = new JSDOM(content, { runScripts: 'dangerously' }); patch.mutate?.(dom); },
    locator(selector: string) { return domPage(dom!).locator(selector); },
    async evaluate() {},
    async screenshot() { calls.push('screenshot'); if (patch.screenshotError) throw new Error('private fixture'); return raw; },
  };
  const browser = {
    version() { return '154.0.8037.97'; },
    async newContext(options: any) {
      contextOptions = options;
      return {
        async route(pattern: string, handler: (route: any) => unknown) { assert.equal(pattern, '**/*'); if (patch.blocked) await handler({ abort() { calls.push('abort'); } }); },
        async routeWebSocket(pattern: string, handler: (socket: any) => unknown) { assert.equal(pattern, '**/*'); if (patch.socket) await handler({ close() { calls.push('socket-close'); } }); },
        async newPage() { return page; },
      };
    },
    async close() { calls.push('close'); dom?.window.close(); },
  };
  const adapters = {
    async loadPlaywright() { return { chromium: { async launch(options: any) { calls.push('launch'); launchOptions = options; return browser; } } }; },
    readSource() { calls.push('read'); return patch.source ?? source; },
    createOutput() { calls.push('mkdir'); },
    verifyChrome() { calls.push('verifyChrome'); return { executablePath: '/opt/google/chrome/chrome', version: browser.version(), uid: 1001 }; },
    normalizeImage() { return png; },
    writeOutput(path: string, value: any) { writes.set(path, value); },
    log(value: string) { logs.push(value); },
  };
  return { adapters, calls, writes, logs, raw, png, launchOptions: () => launchOptions, contextOptions: () => contextOptions };
}

test('candidate registry is an immutable exact allowlist with backward-compatible historical defaults', () => {
  assert.deepEqual(Object.keys(CANDIDATES), [STATE, ISSUE13_STATE]);
  assert.equal(CANDIDATE, 'design/mockups/design-a-glass.html');
  assert.equal(STATE, 'historical-design-a-home');
  assert.ok(Object.isFrozen(CANDIDATES));
  for (const entry of Object.values(CANDIDATES)) assert.ok(Object.isFrozen(entry));
  assert.equal(candidate.source, 'design/mockups/issue-13-year-picker-v1.html');
  assert.equal(candidate.issue, '13'); assert.equal(candidate.purpose, 'issue-13-design-prototype');
  assert.equal(candidate.width, 1440); assert.equal(candidate.height, 1024);
  for (const state of [undefined, null, '', '__proto__', 'constructor', 'toString', '../other.html', candidate.source,
    'https://example.test', `${ISSUE13_STATE} `, ISSUE13_STATE.toUpperCase(), [ISSUE13_STATE], { toString: () => ISSUE13_STATE }]) {
    assert.throws(() => getCandidate(state), /UNSUPPORTED_STATE/);
  }
});

test('new source has a literal reviewed byte pin; any byte change or line-ending change fails closed', () => {
  assert.match(candidate.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(verifySource(candidate, source), candidate.sourceSha256);
  for (const bytes of [Buffer.concat([source, Buffer.from('\n')]), Buffer.from(source.toString('utf8').replaceAll('\n', '\r\n')), Buffer.from('<html><head></head></html>')]) {
    assert.throws(() => verifySource(candidate, bytes), /SOURCE_HASH_MISMATCH/);
  }
  assert.match(readFileSync('.gitattributes', 'utf8'), /design\/mockups\/issue-13-year-picker-v1\.html text eol=lf/);
});

test('preparation supports only the exact new state and publication issue 13', () => {
  assert.deepEqual(prepareDispatch(base), { ref: 'main', inputs: { approved_sha: sha, prototype_state: ISSUE13_STATE, post_attachment: false, target_issue: '', approval_id: '' } });
  const publishInput = { ...base, publish: true, target_issue: '13', approval_id: env.APPROVAL_ID };
  assert.equal(prepareDispatch(publishInput).inputs.target_issue, '13');
  assert.deepEqual(parseArgs(['--approved-sha', sha, '--current-main-sha', sha, '--prototype-state', ISSUE13_STATE, '--publish', '--target-issue', '13', '--approval-id', env.APPROVAL_ID]), publishInput);
  for (const target_issue of ['7', '42', '013', 13, undefined]) assert.throws(() => prepareDispatch({ ...publishInput, target_issue }));
  for (const prototype_state of [null, '', '__proto__', candidate.source, 'https://example.test', `${ISSUE13_STATE}\n`]) assert.throws(() => prepareDispatch({ ...base, prototype_state }));
  for (const [key, value] of Object.entries({ source: candidate.source, sourceSha256: sha256(source), width: 1440, height: 1024, selector: '#state-calendar', url: 'https://example.test', issue: '13', purpose: candidate.purpose })) assert.throws(() => prepareDispatch({ ...base, [key]: value }), /UNKNOWN_FIELD/);
});

test('new fixed state retains every render-context identity and no-token guard', () => {
  assert.equal(validateRenderContext(env), candidate);
  for (const patch of [{ GITHUB_REPOSITORY: 'other/repo' }, { GITHUB_REPOSITORY_ID: '1' }, { GITHUB_ACTOR_ID: '1' },
    { GITHUB_ACTOR: 'other' }, { GITHUB_TRIGGERING_ACTOR: 'other' }, { GITHUB_REF: 'refs/heads/feature' }, { GITHUB_EVENT_NAME: 'push' },
    { APPROVED_SHA: 'b'.repeat(40) }, { GH_TOKEN: 'synthetic' }, { GITHUB_TOKEN: 'synthetic' }]) assert.throws(() => validateRenderContext({ ...env, ...patch }));
});

test('fixed DOM assertions accept only the exact initialized three-state board', async () => {
  const dom = loadDom();
  try { await verifyIssue13State(domPage(dom)); } finally { dom.window.close(); }
});

const corruptions: [string, (doc: Document) => void][] = [
  ['readiness', doc => doc.querySelector('#issue13-review')!.setAttribute('data-ready', 'false')],
  ['extra state', doc => doc.querySelector('#issue13-review')!.append(doc.createElement('article'))],
  ['missing state', doc => doc.querySelector('#state-jumped')!.remove()],
  ['duplicate state', doc => doc.querySelector('#issue13-review')!.append(doc.querySelector('#state-years')!.cloneNode(true))],
  ['wrong state data', doc => doc.querySelector('#state-calendar')!.setAttribute('data-state', 'calendar-2025-10')],
  ['wrong preview data', doc => doc.querySelector('#state-years')!.setAttribute('data-preview', 'calendar')],
  ['selected birthday', doc => doc.querySelector('#state-jumped .date-value')!.textContent = '1990年10月11日'],
  ['initial year', doc => doc.querySelector('#state-calendar [data-ui="view-year"]')!.textContent = '2025年'],
  ['initial month', doc => doc.querySelector('#state-calendar [data-ui="view-month"]')!.textContent = '9月'],
  ['wrong decade', doc => doc.querySelector('#state-years .decade-label')!.textContent = '1990–1999'],
  ['wrong input', doc => (doc.querySelector('#state-years .year-input') as HTMLInputElement).value = '1989'],
  ['jumped year', doc => doc.querySelector('#state-jumped [data-ui="view-year"]')!.textContent = '1991年'],
  ['jumped month', doc => doc.querySelector('#state-jumped [data-ui="view-month"]')!.textContent = '11月'],
  ['hidden year picker', doc => (doc.querySelector('#state-years [data-ui="year-view"]') as HTMLElement).hidden = true],
  ['wrong visible view', doc => (doc.querySelector('#state-years [data-ui="calendar-view"]') as HTMLElement).hidden = false],
];
for (const [name, mutate] of corruptions) test(`fixed DOM assertions reject ${name}`, async () => {
  const dom = loadDom();
  try { mutate(dom.window.document); await assert.rejects(verifyIssue13State(domPage(dom))); } finally { dom.window.close(); }
});

test('new source mismatch stops before browser verification, launch, output creation or writes', async () => {
  const fake = harness({ source: Buffer.concat([source, Buffer.from('changed')]) });
  await assert.rejects(render(env, fake.adapters), (error: any) => error instanceof RenderDiagnosticError && error.stage === 'environment' && error.code === 'SOURCE_HASH_MISMATCH');
  assert.deepEqual(fake.calls, ['read']); assert.equal(fake.writes.size, 0);
});

test('new render checks all three states and binds source, issue, SHA, run, dimensions and purpose', async () => {
  const fake = harness(); await render(env, fake.adapters);
  const manifest = JSON.parse(fake.writes.get(join(env.RUNNER_TEMP, 'ono-render-output/manifest.json')));
  assert.deepEqual(manifest, { source: candidate.source, state: ISSUE13_STATE, issue: '13', sha,
    run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sourceSha256: candidate.sourceSha256,
    width: 1440, height: 1024, rawSha256: sha256(fake.raw), pixelSha256: sha256(fake.png.pixels), imageSha256: sha256(fake.png.bytes),
    browser: '154.0.8037.97', browserSource: 'system-google-chrome-stable', browserExecutable: '/opt/google/chrome/chrome', browserUid: 1001,
    sandboxProfile: 'chrome', visualReview: 'not-performed', purpose: 'issue-13-design-prototype' });
  assert.equal(fake.launchOptions().chromiumSandbox, true);
  assert.deepEqual(fake.launchOptions().env, { PATH: env.PATH, HOME: env.HOME, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH });
  assert.deepEqual(fake.contextOptions(), { viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', serviceWorkers: 'block', offline: true, acceptDownloads: false, permissions: [] });
  assert.equal(fake.writes.size, 2); assert.equal(fake.calls.filter(call => call === 'close').length, 1);
});

for (const [name, patch, code] of [
  ['request', { blocked: true }, 'PAGE_REQUEST_BLOCKED'], ['socket', { socket: true }, 'PAGE_REQUEST_BLOCKED'],
  ['script', { scriptError: true }, 'PAGE_SCRIPT_ERROR'], ['screenshot', { screenshotError: true }, 'OPERATION_FAILED'],
  ['state', { mutate: (dom: JSDOM) => dom.window.document.querySelector('#state-years')!.remove() }, 'ISSUE_STATE_NOT_READY'],
] as const) test(`new render ${name} failure closes the browser once and emits no output`, async () => {
  const fake = harness(patch); await assert.rejects(render(env, fake.adapters), (error: any) => error.code === code);
  assert.equal(fake.writes.size, 0); assert.equal(fake.calls.filter(call => call === 'close').length, 1);
});

function outputFixture(t: any) {
  const directory = mkdtempSync(join(tmpdir(), 'ono-year-render-unit-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const output = join(directory, 'ono-render-output'); mkdirSync(output);
  const pixels = Buffer.alloc(1440 * 1024 * 4), bytes = encodeRgba(1440, 1024, pixels);
  const publicationEnv = { ...env, RUNNER_TEMP: directory, GH_TOKEN: 'unit-test-placeholder' };
  const manifest = { source: candidate.source, state: candidate.state, issue: '13', sha, run: env.GITHUB_RUN_ID, attempt: '1',
    width: 1440, height: 1024, sourceSha256: candidate.sourceSha256, imageSha256: sha256(bytes), pixelSha256: sha256(normalizePng(bytes).pixels),
    rawSha256: sha256(bytes), browser: '154.0.8037.97', visualReview: 'not-performed', purpose: candidate.purpose };
  writeFileSync(join(output, 'prototype.png'), bytes); writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest));
  return { directory, output, env: publicationEnv, manifest, bytes };
}
function mockGithub(patch: { duplicate?: number; failWrite?: boolean; mutateSecond?: () => void } = {}) {
  const calls: string[][] = []; let body = '', preflights = 0, finds = 0;
  const run = (args: string[]) => {
    calls.push(args);
    if (args[0] === 'issue') { body = readFileSync(args[args.indexOf('--body-file') + 1], 'utf8'); if (patch.failWrite) throw new Error('uncertain'); return ''; }
    if (args[1] === 'graphql') {
      if (++preflights === 2) patch.mutateSecond?.();
      return JSON.stringify({ data: { viewer: { login: 'zhshenry' }, repository: { databaseId: 1372377655, nameWithOwner: 'zhshenry/onosan_workbench', isArchived: false, viewerPermission: 'WRITE', defaultBranchRef: { name: 'main', target: { oid: sha } }, issue: { number: 13, state: 'OPEN', locked: false } } } });
    }
    if (!body && ++finds !== patch.duplicate) return '[[]]';
    return JSON.stringify([[{ id: 99, user: { login: 'zhshenry' }, body: `${body || `<!-- ono-prototype-render:${env.APPROVAL_ID} -->`}\n![fixture](${attachment})` }]]);
  };
  return { run, calls, writes: () => calls.filter(args => args[0] === 'issue') };
}

test('new publication validates every binding, including fixed issue and reviewed source hash', t => {
  const f = outputFixture(t); checkManifest(f.manifest, f.bytes, f.env);
  for (const patch of [{ issue: '7' }, { issue: 13 }, { issue: undefined }, { state: STATE }, { source: CANDIDATE },
    { sha: 'b'.repeat(40) }, { sourceSha256: '0'.repeat(64) }, { run: '124' }, { attempt: '2' }, { width: 1 }, { height: 1 },
    { purpose: 'historical-prototype-render-pilot' }, { visualReview: 'approved' }]) assert.throws(() => checkManifest({ ...f.manifest, ...patch }, f.bytes, f.env));
  for (const TARGET_ISSUE of ['7', '42', '013', '']) {
    const fake = mockGithub(); assert.throws(() => publish({ ...f.env, TARGET_ISSUE }, fake.run)); assert.equal(fake.calls.length, 0);
  }
});

test('new publication still makes exactly one write after two preflights and duplicate guards', t => {
  const f = outputFixture(t), fake = mockGithub();
  assert.deepEqual(publish(f.env, fake.run), { commentId: 99, url: attachment, sha256: f.manifest.imageSha256 });
  assert.equal(fake.writes().length, 1); assert.equal(fake.writes()[0][2], '13');
  assert.equal(fake.calls.filter(args => args[1] === 'graphql').length, 2);
  assert.equal(fake.calls.filter(args => args[1] !== 'graphql' && args[0] === 'api').length, 3);
  const body = readFileSync(join(f.output, 'comment.txt'), 'utf8');
  for (const value of [candidate.source, ISSUE13_STATE, 'Issue #13', 'not product implementation, product acceptance or plan approval', 'Visual review: pending', 'no second image upload']) assert.ok(body.includes(value));
  for (const duplicate of [1, 2]) {
    const dupe = mockGithub({ duplicate }); assert.throws(() => publish(f.env, dupe.run), /MARKER_/); assert.equal(dupe.writes().length, 0);
  }
  const uncertain = mockGithub({ failWrite: true }); assert.throws(() => publish(f.env, uncertain.run), /UPLOAD_UNCERTAIN_NO_RETRY/); assert.equal(uncertain.writes().length, 1);
});

test('source-byte tampering at either publication check prevents upload', t => {
  const f = outputFixture(t), cwd = process.cwd();
  const sourcePath = join(f.directory, candidate.source); mkdirSync(dirname(sourcePath), { recursive: true });
  try {
    process.chdir(f.directory);
    writeFileSync(sourcePath, Buffer.concat([source, Buffer.from('\n')]));
    const changed = mockGithub(); assert.throws(() => publish(f.env, changed.run), /SOURCE_HASH_MISMATCH/); assert.equal(changed.calls.length, 0);
    writeFileSync(sourcePath, source);
    const late = mockGithub({ mutateSecond: () => writeFileSync(sourcePath, Buffer.concat([source, Buffer.from('\n')])) });
    assert.throws(() => publish(f.env, late.run), /SOURCE_HASH_MISMATCH/); assert.equal(late.writes().length, 0);
    assert.equal(late.calls.filter(args => args[1] === 'graphql').length, 2);
  } finally { process.chdir(cwd); }
});

test('new diagnostics remain finite and raw-source-free', () => {
  for (const code of ['SOURCE_HASH_MISMATCH', 'SOURCE_CSP_REQUIRED', 'ISSUE_STATE_NOT_READY']) assert.equal(classifyError('environment', new Error(code)), code);
  assert.equal(classifyError('environment', new Error('SOURCE_HASH_MISMATCH private source')), 'OPERATION_FAILED');
});
