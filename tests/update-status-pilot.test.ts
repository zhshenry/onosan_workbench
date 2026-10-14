import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  UPDATE_STATUS_MATRIX, UPDATE_STATUS_SCREENSHOTS, UPDATE_STATUS_ERROR, UPDATE_STATUS_LONG_ERROR,
  updaterStatusFixtures, assertUpdateStatusGeometry, injectUpdaterFixture,
  inspectUpdaterFixture, settleUpdaterActions, restoreUpdaterFixture,
} from '../tooling/update-status-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

const originals = () => ({ enabled: false, phase: 'idle', version: '', progress: 0, message: 'Real isolated updater is disabled.' });
const fixture = (key = 'idle', extra = {}) => ({ senderId: 34, originalStatus: originals(), status: updaterStatusFixtures().find(value => value.key === key)!.status, ...extra });
function fakeRuntime() {
  const channels = ['updater:status', 'updater:check', 'updater:install'];
  let realCalls = 0;
  const realHandlers = Object.fromEntries(channels.map(channel => [channel, () => { realCalls++; throw new Error('Live updater handler must never execute'); }]));
  const unrelated = () => { throw new Error('Unrelated handler must never execute'); };
  const handlers = new Map<string, (...args: any[]) => any>([...channels.map(channel => [channel, realHandlers[channel]] as [string, (...args: any[]) => any]), ['todo:state', unrelated]]);
  const sends: Array<{ channel: string; status: unknown }> = [];
  const mutations: string[] = [];
  const mainFrame = {};
  const webContents = { id: 34, mainFrame, isDestroyed: () => false,
    send: (channel: string, status: unknown) => sends.push({ channel, status: structuredClone(status) }) };
  const target = { webContents, isDestroyed: () => false };
  const runtime = { ipcMain: {
    _invokeHandlers: handlers,
    removeHandler: (channel: string) => { mutations.push(`remove:${channel}`); handlers.delete(channel); },
    handle: (channel: string, handler: (...args: any[]) => any) => { mutations.push(`handle:${channel}`); assert.equal(handlers.has(channel), false); handlers.set(channel, handler); },
  }, BrowserWindow: { getAllWindows: () => [target] } };
  const application = { evaluate: async (callback: (...args: any[]) => any, input?: any) => callback(runtime, input) };
  const event = { sender: webContents, senderFrame: mainFrame };
  return { runtime, application, event, handlers, realHandlers, unrelated, target, sends, mutations, realCalls: () => realCalls };
}

test('Updater native matrix covers three themes at actual 1280/1024 sizes, normal and reduced motion', () => {
  assert.ok(Object.isFrozen(UPDATE_STATUS_MATRIX)); assert.ok(UPDATE_STATUS_MATRIX.every(Object.isFrozen));
  assert.equal(UPDATE_STATUS_MATRIX.length, 6);
  for (const theme of ['mist', 'cool', 'warm']) for (const [width, height] of [[1280, 820], [1024, 680]]) {
    const entries = UPDATE_STATUS_MATRIX.filter(value => value.theme === theme && value.width === width && value.height === height);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].reducedMotion, width === 1024 ? 'reduce' : 'no-preference');
  }
});

test('Updater screenshots add only four exact names to the existing aggregate artifact guard and retention', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-update-status-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.ok(Object.isFrozen(UPDATE_STATUS_SCREENSHOTS));
  assert.deepEqual(UPDATE_STATUS_SCREENSHOTS, [
    'update-status-mist-latest-1280x820.png', 'update-status-cool-downloading-1024x680.png',
    'update-status-warm-ready-1024x680.png', 'update-status-error-details-1024x680.png',
  ]);
  // These are signature-only unit fixtures, never claimed as native screenshots.
  for (const name of UPDATE_STATUS_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await inspectPilotArtifacts(directory);
  assert.equal(result.files.length, 4); assert.equal(result.bytes, 32);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000); assert.equal(result.uploadCeilingBytes, 20_000_000); assert.equal(result.retentionDays, 3);
  await assert.rejects(inspectPilotArtifacts(directory, 31), /exceed/);
  await writeFile(path.join(directory, 'update-status-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Updater fixtures cover all unchanged backend phases plus disabled with representative error and separate bounded stress detail', () => {
  const entries = updaterStatusFixtures();
  assert.deepEqual(entries.map(value => value.key), ['disabled', 'idle', 'checking', 'latest', 'downloading', 'ready', 'error']);
  assert.deepEqual([...new Set(entries.map(value => value.status.phase))].sort(), ['checking', 'downloading', 'error', 'idle', 'latest', 'ready']);
  assert.equal(entries.filter(value => !value.status.enabled).length, 1);
  assert.equal(entries.find(value => value.key === 'downloading')!.status.progress, 42);
  assert.equal(entries.find(value => value.key === 'ready')!.action, '重启并安装');
  assert.equal(entries.find(value => value.key === 'error')!.status.message, UPDATE_STATUS_ERROR);
  assert.equal(UPDATE_STATUS_ERROR, '连接更新服务失败，请检查网络或代理后重试。');
  assert.ok(!UPDATE_STATUS_ERROR.includes('SYNTHETIC_'));
  assert.notEqual(UPDATE_STATUS_ERROR, UPDATE_STATUS_LONG_ERROR);
  assert.match(UPDATE_STATUS_LONG_ERROR, /^SYNTHETIC_UPDATER_DETAIL:/);
  assert.ok(UPDATE_STATUS_LONG_ERROR.length > 1000 && UPDATE_STATUS_LONG_ERROR.length < 12_000);
  assert.match(UPDATE_STATUS_LONG_ERROR, /\nSYNTHETIC_UNBROKEN_DETAIL_(?:SYNTHETIC_UNBROKEN_DETAIL_){20}/);
  assert.ok(entries.every(value => value.status.version.length < 80 && value.status.message.length < 12_000));
});

function geometry() {
  return { viewport: { x: 0, y: 0, width: 1024, height: 680 }, row: { x: 410, y: 200, width: 560, height: 82 },
    heading: { x: 430, y: 215, width: 360, height: 22 },
    title: { bounds: { x: 430, y: 215, width: 56, height: 22 }, text: '应用更新', fontSize: 14, tokenSize: 14, complete: true },
    status: { bounds: { x: 502, y: 215, width: 72, height: 22 }, text: '下载 42%', fontSize: 14, tokenSize: 14, complete: true },
    action: { bounds: { x: 830, y: 215, width: 120, height: 32 }, text: '下载中…', fontSize: 13, tokenSize: 13, complete: true, disabled: true, busy: true, hit: true },
    progress: { bounds: { x: 430, y: 257, width: 360, height: 6 }, value: 42, max: 100 },
    rowClientWidth: 560, rowScrollWidth: 560, detailsVisible: false };
}
const downloading = () => updaterStatusFixtures().find(value => value.key === 'downloading')!;

test('Updater geometry accepts every phase with complete same-row short status and fixed right actions', () => {
  for (const expected of updaterStatusFixtures()) {
    const value = geometry();
    value.status.text = expected.labels[0]; value.action.text = expected.action;
    value.action.disabled = expected.disabled; value.action.busy = ['checking', 'downloading'].includes(expected.key);
    if (expected.key !== 'downloading') value.progress = null as any;
    assert.doesNotThrow(() => assertUpdateStatusGeometry(value, expected), expected.key);
  }
});

test('Updater geometry rejects overflow, smaller typography, non-inline status, overlaps and wrong action/progress states', () => {
  const cases: Array<[string, (value: ReturnType<typeof geometry>) => void, RegExp]> = [
    ['outside viewport', value => { value.row.x = 700; }, /clipped|outside/],
    ['invalid row', value => { value.row.height = Number.NaN; }, /invalid/],
    ['empty status', value => { value.status.bounds.width = 0; }, /empty/],
    ['title clipped', value => { value.title.complete = false; }, /complete readable/],
    ['status clipped', value => { value.status.complete = false; }, /complete readable/],
    ['button clipped', value => { value.action.complete = false; }, /complete readable/],
    ['shrink status', value => { value.status.fontSize = 13; }, /do not shrink/],
    ['change status token', value => { value.status.fontSize = 15; }, /shared typography token/],
    ['shrink title', value => { value.title.fontSize = 13; }, /do not shrink/],
    ['shrink button', value => { value.action.fontSize = 12; }, /do not shrink/],
    ['overlap title', value => { value.status.bounds.x = 470; }, /inline and disjoint/],
    ['status below title', value => { value.heading.height = 42; value.status.bounds.y = 235; }, /beside the title/],
    ['action overlaps heading', value => { value.heading.width = 415; }, /to the right/],
    ['occluded action', value => { value.action.hit = false; }, /occluded/],
    ['horizontal overflow', value => { value.rowScrollWidth++; }, /horizontally/],
    ['wrong short status', value => { value.status.text = UPDATE_STATUS_LONG_ERROR; }, /Unexpected updater short status/],
    ['changed button', value => { value.action.text = '更新'; }, /Existing updater action label/],
    ['busy enabled', value => { value.action.disabled = false; }, /Disabled\/busy/],
    ['lost accessible busy', value => { value.action.busy = false; }, /Busy phase/],
    ['progress absent', value => { value.progress = null as any; }, /progress remains inside/],
    ['progress outside', value => { value.progress.bounds.y = 280; }, /clipped|outside/],
    ['wrong progress', value => { value.progress.value = 0; }, /strictly equal/],
    ['wrong maximum', value => { value.progress.max = 1; }, /strictly equal/],
    ['detail initially exposed', value => { value.detailsVisible = true; }, /starts collapsed/],
  ];
  for (const [name, modify, expected] of cases) { const value = geometry(); modify(value); assert.throws(() => assertUpdateStatusGeometry(value, downloading()), expected, name); }
});

test('Safe updater hook replaces only exact three handlers and emits solely to the exact main renderer', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture());
    for (const channel of Object.keys(env.realHandlers)) assert.notEqual(env.handlers.get(channel), env.realHandlers[channel]);
    assert.equal(env.handlers.get('todo:state'), env.unrelated);
    assert.deepEqual(env.handlers.get('updater:status')!(env.event), fixture().status);
    assert.equal(env.sends.length, 1); assert.equal(env.sends[0].channel, 'updater:status');
    assert.equal(env.realCalls(), 0);
    assert.deepEqual(await inspectUpdaterFixture(env.application), { installed: true, calls: { status: 1, check: 0, install: 0 }, pendingReads: 0, pendingActions: 0 });
  } finally { await restoreUpdaterFixture(env.application); }
  for (const channel of Object.keys(env.realHandlers)) assert.equal(env.handlers.get(channel), env.realHandlers[channel]);
  assert.deepEqual(await inspectUpdaterFixture(env.application), { installed: false });
  assert.deepEqual(env.sends.at(-1)!.status, originals());
  assert.equal(env.realCalls(), 0);
  await restoreUpdaterFixture(env.application);
});

test('Safe updater hook rejects other windows and non-main frames before counting or actions', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture());
    for (const channel of Object.keys(env.realHandlers)) {
      for (const event of [undefined, { sender: {}, senderFrame: env.event.senderFrame }, { sender: env.event.sender, senderFrame: {} }]) {
        assert.throws(() => env.handlers.get(channel)!(event), /exact main frame/);
      }
    }
    assert.deepEqual((await inspectUpdaterFixture(env.application)).calls, { status: 0, check: 0, install: 0 });
    assert.equal(env.realCalls(), 0);
  } finally { await restoreUpdaterFixture(env.application); }
});

test('Safe check has delayed settlement and synthetic checking events, while safe install never invokes originals', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture('idle', { holdCheck: true }));
    const pending = env.handlers.get('updater:check')!(env.event);
    assert.equal(env.sends.at(-1)!.status.phase, 'checking');
    assert.equal((await inspectUpdaterFixture(env.application)).pendingActions, 1);
    await settleUpdaterActions(env.application); await pending;
    await injectUpdaterFixture(env.application, fixture('ready'));
    assert.equal(env.handlers.get('updater:install')!(env.event), undefined);
    assert.deepEqual((await inspectUpdaterFixture(env.application)).calls, { status: 0, check: 1, install: 1 });
    assert.equal(env.realCalls(), 0);
  } finally { await restoreUpdaterFixture(env.application); }
});

test('Delayed no-event check preserves idle until explicit event and can be rejected safely', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture('idle', { holdCheck: true, emitChecking: false }));
    const count = env.sends.length;
    const pending = env.handlers.get('updater:check')!(env.event);
    const rejected = assert.rejects(pending, /SYNTHETIC_DELAYED_FAILURE/);
    assert.equal(env.sends.length, count);
    assert.equal(env.handlers.get('updater:status')!(env.event).phase, 'idle');
    await settleUpdaterActions(env.application, 'SYNTHETIC_DELAYED_FAILURE'); await rejected;
    assert.equal((await inspectUpdaterFixture(env.application)).pendingActions, 0);
    assert.equal(env.realCalls(), 0);
  } finally { await restoreUpdaterFixture(env.application); }
});

test('Held status reads settle from next fixture event and restoration preserves the original disabled result', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture('idle', { holdRead: true, announce: false }));
    const read = env.handlers.get('updater:status')!(env.event);
    assert.equal(env.sends.length, 0);
    assert.equal((await inspectUpdaterFixture(env.application)).pendingReads, 1);
    await injectUpdaterFixture(env.application, fixture('latest'));
    assert.deepEqual(await read, fixture('latest').status);
    await injectUpdaterFixture(env.application, fixture('idle', { holdRead: true }));
    const restoredRead = env.handlers.get('updater:status')!(env.event);
    await restoreUpdaterFixture(env.application);
    assert.deepEqual(await restoredRead, originals());
  } finally { await restoreUpdaterFixture(env.application); }
  assert.equal(env.realCalls(), 0);
});

test('Controlled status/check/install failures are synthetic and leave genuine updater functions untouched', async () => {
  const env = fakeRuntime();
  try {
    await injectUpdaterFixture(env.application, fixture('ready', { rejectRead: 'READ_FIXTURE', rejectCheck: 'CHECK_FIXTURE', rejectInstall: 'INSTALL_FIXTURE' }));
    for (const [channel, expected] of [['updater:status', /READ_FIXTURE/], ['updater:check', /CHECK_FIXTURE/], ['updater:install', /INSTALL_FIXTURE/]] as const) {
      assert.throws(() => env.handlers.get(channel)!(env.event), expected);
    }
    assert.equal(env.realCalls(), 0);
  } finally { await restoreUpdaterFixture(env.application); }
});

test('Fixture assertion failure still restores pending safe actions and exact real functions in finally', async () => {
  const env = fakeRuntime(); let pending: Promise<unknown>;
  await assert.rejects(async () => {
    try {
      await injectUpdaterFixture(env.application, fixture('idle', { holdCheck: true }));
      pending = env.handlers.get('updater:check')!(env.event);
      throw new Error('Synthetic UI assertion failure');
    } finally { await restoreUpdaterFixture(env.application); }
  }, /Synthetic UI assertion failure/);
  await pending!;
  for (const channel of Object.keys(env.realHandlers)) assert.equal(env.handlers.get(channel), env.realHandlers[channel]);
  assert.equal(env.realCalls(), 0);
});

test('Missing pinned map or any original handler, unsafe sender or enabled genuine updater fails before mutation', async () => {
  const samples = [
    { change: (env: ReturnType<typeof fakeRuntime>) => { (env.runtime.ipcMain as any)._invokeHandlers = undefined; }, input: fixture(), error: /inspection unavailable/ },
    { change: (env: ReturnType<typeof fakeRuntime>) => { env.handlers.delete('updater:install'); }, input: fixture(), error: /Original updater handler missing/ },
    { change: () => {}, input: fixture('idle', { senderId: 999 }), error: /Main renderer is unavailable/ },
    { change: () => {}, input: fixture('idle', { senderId: 0 }), error: /identity required/ },
    { change: () => {}, input: fixture('idle', { originalStatus: { ...originals(), enabled: true } }), error: /Real updater must be disabled/ },
  ];
  for (const sample of samples) {
    const env = fakeRuntime(); sample.change(env);
    await assert.rejects(injectUpdaterFixture(env.application, sample.input), sample.error);
    assert.deepEqual(env.mutations, []); assert.equal(env.realCalls(), 0);
    assert.deepEqual(await inspectUpdaterFixture(env.application), { installed: false });
  }
});

test('Unbounded or malformed synthetic status cannot install any hook', async () => {
  for (const status of [null, { ...fixture().status, enabled: 'yes' }, { ...fixture().status, phase: 'unknown' },
    { ...fixture().status, progress: Number.NaN }, { ...fixture().status, progress: 101 },
    { ...fixture().status, version: 'v'.repeat(81) }, { ...fixture().status, message: 'x'.repeat(12_001) }]) {
    const env = fakeRuntime();
    await assert.rejects(injectUpdaterFixture(env.application, fixture('idle', { status })), /Unbounded or invalid/);
    assert.deepEqual(env.mutations, []);
  }
});

test('Handler registration failure rolls back every replaced channel without leaving a partial fixture', async () => {
  const env = fakeRuntime(); const register = env.runtime.ipcMain.handle;
  let failed = false;
  env.runtime.ipcMain.handle = (channel, handler) => {
    if (channel === 'updater:check' && !failed) { failed = true; throw new Error('Synthetic registration failure'); }
    register(channel, handler);
  };
  await assert.rejects(injectUpdaterFixture(env.application, fixture()), /Synthetic registration failure/);
  for (const channel of Object.keys(env.realHandlers)) assert.equal(env.handlers.get(channel), env.realHandlers[channel]);
  assert.deepEqual(await inspectUpdaterFixture(env.application), { installed: false });
  assert.equal(env.realCalls(), 0);
});

test('Any channel drift blocks reinjection, settlement and restoration before overwriting another handler', async () => {
  const env = fakeRuntime();
  await injectUpdaterFixture(env.application, fixture());
  const safeInstall = env.handlers.get('updater:install')!;
  const replacement = () => {};
  env.handlers.set('updater:install', replacement);
  const before = [...env.handlers]; const mutations = env.mutations.length;
  try {
    await assert.rejects(injectUpdaterFixture(env.application, fixture('latest')), /handler or renderer changed/);
    await assert.rejects(inspectUpdaterFixture(env.application), /handler changed/);
    await assert.rejects(settleUpdaterActions(env.application), /handler changed/);
    await assert.rejects(restoreUpdaterFixture(env.application), /Cannot safely restore changed/);
    assert.deepEqual([...env.handlers], before); assert.equal(env.mutations.length, mutations);
  } finally { env.handlers.set('updater:install', safeInstall); await restoreUpdaterFixture(env.application); }
});

test('Native pilot uses normal installed UI/preload transport, bounded fixture and finally restoration without live updater or persistence writes', async () => {
  const source = await readFile(new URL('../tooling/update-status-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\.quitAndInstall\(|\.checkForUpdates\(|workbench\.(?:todo\.(?:create|update|remove)|settings\.(?:patch|set)|ai\.(?:ask|apply))\(|localStorage\.setItem|setContent\(|addInitScript\(|writeFile\(|fetch\(|https?:\/\//);
  assert.match(source, /const originalStatus = await page\.evaluate\(\(\) => window\.workbench\.updater\.status\(\)\)/);
  assert.match(source, /assert\.equal\(originalStatus\.enabled, false/);
  assert.match(source, /event\?\.sender !== target\.webContents \|\| event\?\.senderFrame !== target\.webContents\.mainFrame/);
  assert.match(source, /target\.webContents\.send\('updater:status'/);
  assert.match(source, /finally \{\s*await restoreUpdaterFixture\(application\)/);
  assert.match(source, /Genuine disabled updater read must be restored/);
  assert.match(source, /win\.setContentSize/);
  assert.match(source, /document\.elementFromPoint/);
  assert.match(source, /await page\.keyboard\.press\('Enter'\); await page\.keyboard\.press\('Enter'\); await page\.keyboard\.press\('Space'\)/);
  assert.match(source, /Opening details retains keyboard focus/);
  assert.match(source, /Closing details retains keyboard focus/);
  assert.match(source, /Escape closes updater details without losing focus/);
  assert.match(source, /Unmatched rows cannot leak expanded updater detail/);
  assert.match(source, /read loading\/rejection and check\/install rejections/);
  assert.match(source, /Transport probe requires safe synthetic handlers/);
  assert.match(source, /action\.getAttribute\('aria-busy'\) === 'true'\) === expected\.busy/);
  assert.doesNotMatch(source, /force:\s*true/);
  assert.ok(entry.indexOf('await runUpdateStatusPilot(') > entry.indexOf('floatGroupFixture = await runFloatGroupPilot('));
  assert.ok(entry.indexOf('await runUpdateStatusPilot(') < entry.indexOf("await check('Choose exit-on-close"));
});
