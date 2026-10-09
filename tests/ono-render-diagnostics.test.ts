import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { render, CANDIDATE, STATE } from '../tooling/ono/render-pilot/render.mjs';
import { STAGES, ERROR_CODES, classifyError, RenderDiagnosticError, formatDiagnostic, runStage } from '../tooling/ono/render-pilot/diagnostics.mjs';

// Browser, image and filesystem values below are synthetic fixtures. These tests
// never launch Chromium, access credentials, publish, or write render artifacts.
const sha = 'a'.repeat(40);
const privateMarker = 'SYNTHETIC_PRIVATE_DIAGNOSTIC_MARKER';
const env = {
  GITHUB_EVENT_NAME: 'workflow_dispatch', GITHUB_REPOSITORY: 'zhshenry/onosan_workbench',
  GITHUB_REPOSITORY_ID: '1372377655', GITHUB_ACTOR: 'zhshenry', GITHUB_ACTOR_ID: '54107847',
  GITHUB_TRIGGERING_ACTOR: 'zhshenry', GITHUB_REF: 'refs/heads/main', GITHUB_SHA: sha,
  APPROVED_SHA: sha, PROTOTYPE_STATE: STATE, GITHUB_RUN_ID: '123', GITHUB_RUN_ATTEMPT: '1',
  RUNNER_TEMP: `/synthetic/${privateMarker}/temp`, HOME: `/synthetic/${privateMarker}/home`,
  PATH: `/synthetic/${privateMarker}/bin`, PLAYWRIGHT_BROWSERS_PATH: `/synthetic/${privateMarker}/browsers`,
  UNRELATED_PRIVATE_VALUE: privateMarker,
};
const source = `<html><head></head><body>${privateMarker}</body></html>`;
const raw = Buffer.from(`raw-screenshot-${privateMarker}`);
const normalized = {
  width: 1440, height: 1024,
  bytes: Buffer.from(`normalized-png-${privateMarker}`),
  pixels: Buffer.from(`rgba-pixels-${privateMarker}`),
};
const digest = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');

type HarnessOptions = {
  failAt?: string;
  failure?: unknown;
  closeFailure?: unknown;
  count?: number;
  blockedRequest?: boolean;
  blockedSocket?: boolean;
  pageError?: boolean;
  latePageError?: boolean;
  lateBlockedRequest?: boolean;
  image?: typeof normalized;
};
function harness(options: HarnessOptions = {}) {
  const calls: string[] = [], logs: string[] = [];
  const written: { path: string; value: string | Uint8Array; options: any }[] = [];
  const created: { path: string; options: any }[] = [];
  let launchOptions: any, contextOptions: any, contentOptions: any, screenshotOptions: any, pageContent: string | undefined;
  const call = (name: string) => {
    calls.push(name);
    if (options.failAt === name) throw options.failure ?? new Error(privateMarker);
  };
  let pageErrorHandler: ((value: unknown) => void) | undefined;
  let requestHandler: ((route: { abort: () => void }) => unknown) | undefined;
  const page = {
    on(name: string, callback: (value: unknown) => void) {
      call('page.on');
      assert.equal(name, 'pageerror');
      pageErrorHandler = callback;
      if (options.pageError) callback(new Error(privateMarker));
    },
    async setContent(value: string, settings: any) {
      call('page.setContent'); pageContent = value; contentOptions = settings;
    },
    locator(selector: string) {
      call(`page.locator:${selector}`);
      return {
        async waitFor() { call('locator.waitFor'); },
        async count() { call('locator.count'); return options.count ?? 3; },
      };
    },
    async evaluate(_callback: unknown) { call('page.evaluate'); },
    async screenshot(settings: any) {
      call('page.screenshot'); screenshotOptions = settings;
      if (options.latePageError) pageErrorHandler?.(new Error(privateMarker));
      if (options.lateBlockedRequest) await requestHandler?.({ abort: () => { call('route.abort'); } });
      return raw;
    },
  };
  const context = {
    async route(pattern: string, handler: (route: { abort: () => void }) => unknown) {
      call('context.route'); assert.equal(pattern, '**/*'); requestHandler = handler;
      if (options.blockedRequest) await handler({ abort: () => { call('route.abort'); } });
    },
    async routeWebSocket(pattern: string, handler: (socket: { close: () => void }) => unknown) {
      call('context.routeWebSocket'); assert.equal(pattern, '**/*');
      if (options.blockedSocket) await handler({ close: () => { call('socket.close'); } });
    },
    async newPage() { call('context.newPage'); return page; },
  };
  const browser = {
    async newContext(settings: any) { call('browser.newContext'); contextOptions = settings; return context; },
    version() { call('browser.version'); return '123.0.0.0'; },
    async close() {
      call('browser.close');
      if ('closeFailure' in options) throw options.closeFailure;
    },
  };
  const adapters = {
    async loadPlaywright() {
      call('loadPlaywright');
      return { chromium: { async launch(settings: any) { call('chromium.launch'); launchOptions = settings; return browser; } } };
    },
    verifyChrome() { call('verifyChrome'); return { executablePath: '/opt/google/chrome/chrome', version: '123.0.0.0', uid: 1001, gid: 1001 }; },
    readSource() { call('readSource'); return source; },
    createOutput(path: string, settings: any) { call('createOutput'); created.push({ path, options: settings }); },
    writeOutput(path: string, value: string | Uint8Array, settings: any) {
      call(path.endsWith('manifest.json') ? 'writeManifest' : 'writeImage');
      written.push({ path, value, options: settings });
    },
    normalizeImage(value: Uint8Array) { call('normalizeImage'); assert.equal(value, raw); return options.image ?? normalized; },
    log(...values: unknown[]) {
      // A structured object must not accidentally be forwarded to console for
      // recursive inspection; the diagnostics sink accepts only safe strings.
      assert.ok(values.every(value => typeof value === 'string'));
      logs.push(values.join(' '));
    },
  };
  return {
    adapters, calls, logs, written, created,
    launchOptions: () => launchOptions, contextOptions: () => contextOptions,
    contentOptions: () => contentOptions, screenshotOptions: () => screenshotOptions,
    pageContent: () => pageContent,
  };
}

function assertRedacted(values: unknown) {
  const text = JSON.stringify(values);
  assert.ok(!text.includes(privateMarker), 'private fixture data must not appear in diagnostics');
  assert.ok(!text.includes('<html>'));
  assert.ok(!text.includes('at FakeBrowser.launch'));
}

function assertSafeLogs(logs: string[]) {
  assertRedacted(logs);
  for (const line of logs) {
    const progress = /^Prototype render stage=([a-z_]+); status=(start|passed)$/.exec(line);
    if (progress) { assert.ok(STAGES.includes(progress[1])); continue; }
    const failure = /^Prototype render stopped: stage=([a-z_]+); code=([A-Z_]+)\. Raw exception details suppressed\.$/.exec(line);
    if (failure) { assert.ok(STAGES.includes(failure[1])); assert.ok(ERROR_CODES.includes(failure[2])); continue; }
    assert.equal(line, `Render decoded and normalized: ${STATE}; 1440x1024; SHA256=${digest(normalized.bytes)}. Visual fidelity not yet reviewed.`);
  }
}

async function expectFailure(promise: Promise<unknown>, stage: string, code: string) {
  let observed: any;
  await assert.rejects(promise, error => {
    observed = error;
    assert.ok(error instanceof RenderDiagnosticError);
    assert.equal(error.stage, stage);
    assert.equal(error.code, code);
    assert.equal(error.message, 'Prototype render failed');
    assert.equal('cause' in error, false, 'raw exceptions must not be retained as a printable cause');
    assertRedacted(error);
    assertRedacted(formatDiagnostic(error));
    return true;
  });
  return observed;
}

test('diagnostic stage and code allowlists are frozen finite values', () => {
  assert.deepEqual(STAGES, ['preflight', 'import', 'environment', 'system_chrome', 'browser_launch', 'page_load', 'assets', 'screenshot', 'png', 'output', 'cleanup']);
  assert.ok(Object.isFrozen(STAGES)); assert.ok(Object.isFrozen(ERROR_CODES));
  assert.equal(new Set(ERROR_CODES).size, ERROR_CODES.length);
  for (const code of ERROR_CODES) assert.match(code, /^[A-Z_]+$/);
});

const classifications: [string, unknown, string][] = [
  ['assets', { name: 'TimeoutError', message: privateMarker }, 'TIMEOUT'],
  ['screenshot', { code: 'ETIMEDOUT', message: privateMarker }, 'TIMEOUT'],
  ['environment', { code: 'EACCES', message: privateMarker }, 'PERMISSION_DENIED'],
  ['output', { code: 'EPERM', message: privateMarker }, 'PERMISSION_DENIED'],
  ['environment', { code: 'ENOENT', message: privateMarker }, 'FILE_NOT_FOUND'],
  ['import', { code: 'ERR_MODULE_NOT_FOUND', message: privateMarker }, 'MODULE_NOT_FOUND'],
  ['import', { code: 'MODULE_NOT_FOUND', message: privateMarker }, 'MODULE_NOT_FOUND'],
  ['environment', { code: 'ERR_INVALID_ARG_TYPE', message: privateMarker }, 'INVALID_ARGUMENT'],
  ['environment', { code: 'ERR_INVALID_ARG_VALUE', message: privateMarker }, 'INVALID_ARGUMENT'],
  ['browser_launch', new Error(`No usable sandbox! ${privateMarker}`), 'BROWSER_SANDBOX_UNAVAILABLE'],
  ['browser_launch', new Error(`Running as root without --no-sandbox is not supported ${privateMarker}`), 'BROWSER_SANDBOX_UNAVAILABLE'],
  ['browser_launch', new Error(`Failed to move to new namespace ${privateMarker}`), 'BROWSER_NAMESPACE_FAILED'],
  ['browser_launch', new Error(`Executable doesn't exist at /synthetic/${privateMarker}`), 'BROWSER_EXECUTABLE_MISSING'],
  ['page_load', new Error(`No usable sandbox! ${privateMarker}`), 'OPERATION_FAILED'],
  ['assets', new Error(`Failed to move to new namespace ${privateMarker}`), 'OPERATION_FAILED'],
  ['output', new Error(`Executable doesn't exist at /synthetic/${privateMarker}`), 'OPERATION_FAILED'],
  ['png', new Error('PNG_SIGNATURE'), 'PNG_SIGNATURE'],
  ['png', new Error(`PNG_SIGNATURE ${privateMarker}`), 'OPERATION_FAILED'],
  ['preflight', new Error('OWNER_ACTOR_REQUIRED'), 'OWNER_ACTOR_REQUIRED'],
  ['cleanup', { code: privateMarker, message: privateMarker, stack: privateMarker }, 'OPERATION_FAILED'],
];
for (const [index, [stage, error, expected]] of classifications.entries()) {
  test(`diagnostic classification ${index + 1}: ${stage} yields only ${expected}`, () => {
    assert.equal(classifyError(stage, error), expected);
    assertRedacted(formatDiagnostic(new RenderDiagnosticError(stage, classifyError(stage, error))));
  });
}

test('arbitrary thrown values and hostile property getters cannot escape finite diagnostics', () => {
  const hostile = new Proxy({}, { get() { throw new Error(privateMarker); } });
  const noCoercion = { toString() { throw new Error(privateMarker); }, toJSON() { throw new Error(privateMarker); } };
  for (const error of [undefined, null, false, 0, 1n, privateMarker, Symbol(privateMarker), hostile, noCoercion]) {
    assert.equal(classifyError('browser_launch', error), 'OPERATION_FAILED');
    assert.equal(formatDiagnostic(error), 'Prototype render stopped: stage=preflight; code=OPERATION_FAILED. Raw exception details suppressed.');
  }
});

test('classification reads allowlisted error messages only once', () => {
  let reads = 0;
  const error = { get message() { return ++reads === 1 ? 'PNG_SIGNATURE' : privateMarker; } };
  assert.equal(classifyError('png', error), 'PNG_SIGNATURE');
  assert.equal(reads, 1);
});

test('formatting revalidates forged, mutated and alternating stage/code properties without leaks', () => {
  const fallback = 'Prototype render stopped: stage=preflight; code=OPERATION_FAILED. Raw exception details suppressed.';
  assert.equal(formatDiagnostic(new RenderDiagnosticError(privateMarker, privateMarker)), fallback);
  const mutated = new RenderDiagnosticError('output', 'FILE_NOT_FOUND');
  mutated.stage = privateMarker; mutated.code = privateMarker;
  assert.equal(formatDiagnostic(mutated), fallback);
  const forged = { stage: 'output', code: 'FILE_NOT_FOUND', message: privateMarker };
  assert.equal(formatDiagnostic(forged), fallback);
  const alternating = new RenderDiagnosticError('png', 'PNG_SIGNATURE');
  let stageReads = 0, codeReads = 0;
  Object.defineProperties(alternating, {
    stage: { get() { return ++stageReads === 1 ? 'png' : privateMarker; } },
    code: { get() { return ++codeReads === 1 ? 'PNG_SIGNATURE' : privateMarker; } },
  });
  assert.equal(formatDiagnostic(alternating), 'Prototype render stopped: stage=png; code=PNG_SIGNATURE. Raw exception details suppressed.');
  assert.equal(stageReads, 1); assert.equal(codeReads, 1);
  const throwing = new RenderDiagnosticError('png', 'PNG_SIGNATURE');
  Object.defineProperty(throwing, 'stage', { get() { throw new Error(privateMarker); } });
  assert.equal(formatDiagnostic(throwing), fallback);
});

test('runStage reports start/pass only for successful work and returns its value', async () => {
  const logs: string[] = [], value = { privateMarker };
  assert.equal(await runStage('environment', () => value, (line: string) => logs.push(line)), value);
  assert.deepEqual(logs, ['Prototype render stage=environment; status=start', 'Prototype render stage=environment; status=passed']);
  assertSafeLogs(logs);
});

test('runStage wraps sync and async failures without retaining raw errors or logging their contents', async () => {
  for (const operation of [() => { throw new Error(privateMarker); }, async () => { throw Object.assign(new Error(privateMarker), { code: 'ETIMEDOUT' }); }]) {
    const logs: string[] = [];
    const failure = await runStage('assets', operation, (line: string) => logs.push(line)).catch((error: unknown) => error);
    assert.ok(failure instanceof RenderDiagnosticError);
    assert.equal(failure.stage, 'assets');
    assert.ok(['OPERATION_FAILED', 'TIMEOUT'].includes(failure.code));
    assert.deepEqual(logs, ['Prototype render stage=assets; status=start']);
    assert.equal('cause' in failure, false); assertRedacted(failure); assertSafeLogs(logs);
  }
});

test('invalid stage names stop before invoking the operation or logger', async () => {
  let operated = false, logged = false;
  await expectFailure(runStage(privateMarker, () => { operated = true; }, () => { logged = true; }), 'preflight', 'INVALID_ARGUMENT');
  assert.equal(operated, false); assert.equal(logged, false);
});

test('successful mock render reports every stage while preserving sandbox, network and output contracts', async () => {
  const fake = harness();
  await render(env, fake.adapters);
  assert.deepEqual(fake.logs.filter(line => line.startsWith('Prototype render stage=')), STAGES.flatMap(stage => [
    `Prototype render stage=${stage}; status=start`, `Prototype render stage=${stage}; status=passed`,
  ]));
  assertSafeLogs(fake.logs);
  assert.deepEqual(fake.launchOptions(), { channel: 'chrome', executablePath: '/opt/google/chrome/chrome', chromiumSandbox: true, env: {
    PATH: env.PATH, HOME: env.HOME, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH,
  } });
  assert.deepEqual(fake.contextOptions(), {
    viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC',
    colorScheme: 'light', serviceWorkers: 'block', offline: true, acceptDownloads: false, permissions: [],
  });
  assert.deepEqual(fake.contentOptions(), { waitUntil: 'load', timeout: 15000 });
  assert.deepEqual(fake.screenshotOptions(), { type: 'png', animations: 'disabled', fullPage: false, timeout: 15000 });
  assert.match(fake.pageContent()!, /Content-Security-Policy/);
  for (const directive of ["default-src 'none'", "img-src 'none'", "connect-src 'none'", "font-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) assert.ok(fake.pageContent()!.includes(directive));
  assert.equal(fake.created.length, 1); assert.equal(fake.created[0].path, join(env.RUNNER_TEMP, 'ono-render-output'));
  assert.deepEqual(fake.written.map(item => item.path), ['prototype.png', 'manifest.json'].map(name => join(env.RUNNER_TEMP, 'ono-render-output', name)));
  assert.equal(fake.written[0].value, normalized.bytes);
  assert.deepEqual(JSON.parse(fake.written[1].value as string), {
    source: CANDIDATE, state: STATE, sha, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT,
    sourceSha256: digest(source), width: 1440, height: 1024, rawSha256: digest(raw), pixelSha256: digest(normalized.pixels),
    imageSha256: digest(normalized.bytes), browser: '123.0.0.0', browserSource: 'system-google-chrome-stable', browserExecutable: '/opt/google/chrome/chrome', browserUid: 1001, sandboxProfile: 'chrome', visualReview: 'not-performed', purpose: 'historical-prototype-render-pilot',
  });
  assert.equal(fake.calls.filter(name => name === 'browser.close').length, 1);
});

const guardFailures: [Record<string, string>, string][] = [
  [{ GITHUB_EVENT_NAME: 'pull_request' }, 'MANUAL_REPOSITORY_REQUIRED'],
  [{ GITHUB_REPOSITORY: 'fork/repo' }, 'MANUAL_REPOSITORY_REQUIRED'],
  [{ GITHUB_REPOSITORY_ID: '1' }, 'MANUAL_REPOSITORY_REQUIRED'],
  [{ GITHUB_ACTOR: 'other' }, 'OWNER_ACTOR_REQUIRED'],
  [{ GITHUB_ACTOR_ID: '1' }, 'OWNER_ACTOR_REQUIRED'],
  [{ GITHUB_TRIGGERING_ACTOR: 'other' }, 'OWNER_ACTOR_REQUIRED'],
  [{ GITHUB_REF: 'refs/heads/other' }, 'APPROVED_MAIN_REQUIRED'],
  [{ GITHUB_SHA: 'b'.repeat(40) }, 'APPROVED_MAIN_REQUIRED'],
  [{ APPROVED_SHA: '' }, 'APPROVED_MAIN_REQUIRED'],
  [{ APPROVED_SHA: 'A'.repeat(40) }, 'APPROVED_MAIN_REQUIRED'],
  [{ PROTOTYPE_STATE: privateMarker }, 'UNSUPPORTED_STATE'],
  [{ GITHUB_RUN_ID: '' }, 'RUN_ID_REQUIRED'],
  [{ GITHUB_RUN_ATTEMPT: '0' }, 'RUN_ID_REQUIRED'],
  [{ GH_TOKEN: privateMarker }, 'RENDER_MUST_NOT_HAVE_TOKEN'],
  [{ GITHUB_TOKEN: privateMarker }, 'RENDER_MUST_NOT_HAVE_TOKEN'],
];
for (const [patch, code] of guardFailures) {
  test(`render preflight retains ${Object.keys(patch)[0]} guard before imports and I/O`, async () => {
    const fake = harness();
    await expectFailure(render({ ...env, ...patch }, fake.adapters), 'preflight', code);
    assert.deepEqual(fake.calls, []); assert.deepEqual(fake.written, []);
    assert.deepEqual(fake.logs, ['Prototype render stage=preflight; status=start']); assertSafeLogs(fake.logs);
  });
}

const failurePoints: [string, string][] = [
  ['loadPlaywright', 'import'], ['readSource', 'environment'], ['createOutput', 'environment'],
  ['verifyChrome', 'system_chrome'], ['chromium.launch', 'browser_launch'], ['browser.newContext', 'page_load'], ['context.route', 'page_load'],
  ['context.routeWebSocket', 'page_load'], ['context.newPage', 'page_load'], ['page.on', 'page_load'],
  ['page.setContent', 'page_load'], ['page.locator:#view-home.on', 'assets'], ['locator.waitFor', 'assets'],
  ['page.locator:#tree .nsub', 'assets'], ['locator.count', 'assets'], ['page.evaluate', 'assets'],
  ['page.screenshot', 'screenshot'], ['normalizeImage', 'png'], ['writeImage', 'output'],
  ['browser.version', 'page_load'], ['writeManifest', 'output'], ['browser.close', 'cleanup'],
];
for (const [failAt, stage] of failurePoints) {
  test(`render reports ${stage} when ${failAt} fails without exposing raw data`, async () => {
    const failure = Object.assign(new Error(`${privateMarker}; https://example.invalid/?secret=${privateMarker}; <html>${privateMarker}</html>`), {
      stack: `Error: ${privateMarker}\n    at FakeBrowser.launch (/synthetic/${privateMarker}/source:1:1)`,
    });
    const fake = harness({ failAt, failure });
    await expectFailure(render(env, fake.adapters), stage, 'OPERATION_FAILED');
    assert.ok(fake.logs.includes(`Prototype render stage=${stage}; status=start`));
    assert.ok(!fake.logs.includes(`Prototype render stage=${stage}; status=passed`));
    assertSafeLogs(fake.logs);
    assert.equal(fake.calls.filter(name => name === 'browser.close').length, ['import', 'environment', 'system_chrome', 'browser_launch'].includes(stage) ? 0 : 1);
    if (!['output', 'cleanup'].includes(stage)) assert.equal(fake.written.length, 0);
  });
}

test('environment path validation failures are attributed before launching a browser', async () => {
  const fake = harness();
  await expectFailure(render({ ...env, RUNNER_TEMP: undefined }, fake.adapters), 'environment', 'INVALID_ARGUMENT');
  assert.ok(!fake.calls.includes('chromium.launch')); assertSafeLogs(fake.logs);
});

const contentFailures: [HarnessOptions, string, string][] = [
  [{ count: 2 }, 'assets', 'INITIAL_STATE_NOT_READY'],
  [{ blockedRequest: true }, 'assets', 'PAGE_REQUEST_BLOCKED'],
  [{ blockedSocket: true }, 'assets', 'PAGE_REQUEST_BLOCKED'],
  [{ pageError: true }, 'assets', 'PAGE_SCRIPT_ERROR'],
  [{ lateBlockedRequest: true }, 'png', 'PAGE_REQUEST_BLOCKED'],
  [{ latePageError: true }, 'png', 'PAGE_SCRIPT_ERROR'],
  [{ image: { ...normalized, width: 1 } }, 'png', 'RENDER_CHECK_FAILED'],
  [{ image: { ...normalized, height: 1 } }, 'png', 'RENDER_CHECK_FAILED'],
  [{ failAt: 'normalizeImage', failure: new Error('PNG_CRC') }, 'png', 'PNG_CRC'],
];
for (const [index, [options, stage, code]] of contentFailures.entries()) {
  test(`render content check ${index + 1} safely reports ${stage}/${code}`, async () => {
    const fake = harness(options);
    await expectFailure(render(env, fake.adapters), stage, code);
    assert.equal(fake.written.length, 0); assertSafeLogs(fake.logs);
    assert.equal(fake.calls.filter(name => name === 'browser.close').length, 1);
  });
}

test('cleanup-only failure produces a cleanup diagnostic after closing exactly once', async () => {
  const fake = harness({ closeFailure: Object.assign(new Error(privateMarker), { code: 'EPERM' }) });
  await expectFailure(render(env, fake.adapters), 'cleanup', 'PERMISSION_DENIED');
  assert.equal(fake.written.length, 2); assert.equal(fake.calls.filter(name => name === 'browser.close').length, 1);
  assertSafeLogs(fake.logs);
});

test('cleanup failure preserves the primary render failure and separately logs only its safe code', async () => {
  const fake = harness({ failAt: 'page.screenshot', failure: Object.assign(new Error(privateMarker), { name: 'TimeoutError' }), closeFailure: Object.assign(new Error(privateMarker), { code: 'EPERM' }) });
  await expectFailure(render(env, fake.adapters), 'screenshot', 'TIMEOUT');
  assert.ok(fake.logs.includes('Prototype render stopped: stage=cleanup; code=PERMISSION_DENIED. Raw exception details suppressed.'));
  assert.equal(fake.calls.filter(name => name === 'browser.close').length, 1);
  assert.equal(fake.written.length, 0); assertSafeLogs(fake.logs);
});

test('malformed Playwright imports fail in the import stage before environment or browser access', async () => {
  for (const module of [undefined, null, {}, { chromium: null }, { chromium: {} }, { chromium: { launch: privateMarker } }]) {
    const fake = harness();
    const adapters = { ...fake.adapters, loadPlaywright: async () => module };
    await expectFailure(render(env, adapters), 'import', 'PLAYWRIGHT_MODULE_INVALID');
    assert.deepEqual(fake.calls, []); assert.deepEqual(fake.written, []);
    assert.deepEqual(fake.logs, [
      'Prototype render stage=preflight; status=start', 'Prototype render stage=preflight; status=passed',
      'Prototype render stage=import; status=start',
    ]);
    assertSafeLogs(fake.logs);
  }
});

test('a throwing Playwright import property is sanitized inside the import stage', async () => {
  const fake = harness();
  const adapters = { ...fake.adapters, loadPlaywright: async () => ({ get chromium() { throw new Error(privateMarker); } }) };
  await expectFailure(render(env, adapters), 'import', 'OPERATION_FAILED');
  assert.deepEqual(fake.calls, []); assertSafeLogs(fake.logs);
});

test('system browser eligibility failure stops before launch and preserves bounded diagnostics', async () => {
  const fake = harness();
  fake.adapters.verifyChrome = () => { throw new Error('SYSTEM_CHROME_PROFILE_NOT_LOADED'); };
  await expectFailure(render(env, fake.adapters), 'system_chrome', 'SYSTEM_CHROME_PROFILE_NOT_LOADED');
  assert.ok(!fake.calls.includes('chromium.launch'));
  assert.equal(fake.written.length, 0); assertSafeLogs(fake.logs);
});

test('launched system browser version mismatch is rejected before any page or screenshot', async () => {
  const fake = harness();
  fake.adapters.verifyChrome = () => ({ executablePath: '/opt/google/chrome/chrome', version: '124.0.0.0', uid: 1001, gid: 1001 });
  await expectFailure(render(env, fake.adapters), 'page_load', 'SYSTEM_CHROME_RUNTIME_VERSION_MISMATCH');
  assert.ok(!fake.calls.includes('browser.newContext'));
  assert.ok(!fake.calls.includes('page.screenshot'));
  assert.equal(fake.calls.filter(name => name === 'browser.close').length, 1);
  assert.equal(fake.written.length, 0); assertSafeLogs(fake.logs);
});
