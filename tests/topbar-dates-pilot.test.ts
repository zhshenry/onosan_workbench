import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { TOPBAR_DATES_MATRIX, TOPBAR_DATES_SCREENSHOTS, assertTopbarDatesGeometry, topbarReadFixtures, injectTopbarReadState, restoreTopbarReadState, topbarCalendarMonthStep } from '../tooling/topbar-dates-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';
import { topbarScheduleDate, topbarTodoDate } from '../src/topbar-dates';
import { taskInputSchema, activeToday } from '../shared/todo-contracts';

const geometry = () => ({
  viewport: { x: 0, y: 0, width: 819, height: 544 },
  menu: { x: 300, y: 60, width: 320, height: 260 }, scrollWidth: 318, clientWidth: 318,
  rows: [{
    bounds: { x: 312, y: 110, width: 296, height: 48 },
    title: { x: 346, y: 118, width: 94, height: 18 },
    time: { x: 450, y: 116, width: 140, height: 34 },
    timeComplete: true, titleText: '完整合成标题', titleTooltip: '完整合成标题', hitTitle: true,
    check: { x: 320, y: 125, width: 18, height: 18 }, hitCheck: true,
  }],
});

test('Topbar matrix covers all themes at real 1280/1024 windows and actual 100%/125% Electron zoom', () => {
  assert.equal(TOPBAR_DATES_MATRIX.length, 12);
  assert.ok(Object.isFrozen(TOPBAR_DATES_MATRIX)); assert.ok(TOPBAR_DATES_MATRIX.every(Object.isFrozen));
  for (const theme of ['mist', 'cool', 'warm']) for (const size of ['1280x820', '1024x680']) for (const zoom of [1, 1.25]) {
    assert.equal(TOPBAR_DATES_MATRIX.filter(value => value.theme === theme && `${value.width}x${value.height}` === size && value.zoom === zoom).length, 1);
  }
});

test('Topbar screenshots have exact bounded names and retain the one aggregate run budget', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-topbar-pilot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.ok(Object.isFrozen(TOPBAR_DATES_SCREENSHOTS));
  assert.deepEqual(TOPBAR_DATES_SCREENSHOTS, [
    'topbar-dates-persisted.png', 'topbar-dates-relaunched.png',
    'topbar-dates-mist-todo-1024-zoom125.png', 'topbar-dates-mist-schedule-1024-zoom125.png',
    'topbar-dates-cool-todo-1024-zoom125.png', 'topbar-dates-cool-schedule-1024-zoom125.png',
    'topbar-dates-warm-todo-1024-zoom125.png', 'topbar-dates-warm-schedule-1024-zoom125.png',
  ]);
  // Signature bytes are unit fixtures, never claimed as app screenshots.
  for (const name of TOPBAR_DATES_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await inspectPilotArtifacts(directory);
  assert.equal(result.files.length, 8); assert.equal(result.bytes, 64);
  assert.equal(result.retentionDays, 3); assert.equal(result.uploadCeilingBytes, 20_000_000);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000);
  await assert.rejects(inspectPilotArtifacts(directory, 63), /exceed/);
  await writeFile(path.join(directory, 'topbar-dates-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Renderer fixtures have independent exact expectations for current, old-year, same/cross-day/year and absent values', () => {
  const fixtures = topbarReadFixtures('2026-10-12');
  assert.deepEqual(fixtures.todo.map(entry => entry.expected), ['10-12 09:00', '2025-12-31 08:30', '10-12 · 不限时', '未设置']);
  assert.deepEqual(fixtures.schedule.map(entry => entry.expected), ['10-12 14:00–15:00', '01-01 23:30–\n01-02 00:30', '2025-12-31 23:30–\n2026-01-01 00:30', '10-12 · 时间待定']);
  assert.deepEqual(fixtures.edges.map(entry => entry.expected), ['10-12 · 不限时', '10-12 · 时间待定', '未设置', '未设置', '10-12 14:00–时间待定']);
  const all = [...fixtures.todo, ...fixtures.schedule, ...fixtures.edges];
  assert.equal(new Set(all.map(entry => entry.task.id)).size, all.length);
  assert.ok(all.every(entry => entry.task.title.startsWith('CI renderer-only ') && entry.task.title.length <= 200));
  assert.ok(all.every(entry => entry.task.note.includes('never persisted')));
  assert.ok(fixtures.todo[0].task.title.length > 100);
});

test('Acceptance fixture expectations agree with product output across calendar boundaries without changing schema or filters', () => {
  for (const today of ['2026-01-01', '2026-02-28', '2026-10-12', '2027-12-31']) {
    const fixtures = topbarReadFixtures(today);
    const now = new Date(`${today}T12:00:00`);
    for (const entry of fixtures.todo) assert.equal(topbarTodoDate(entry.task, now), entry.expected);
    for (const entry of fixtures.schedule) assert.equal(topbarScheduleDate(entry.task, now), entry.expected);
    for (const entry of fixtures.edges) assert.equal((entry.task.kind === 'meeting' ? topbarScheduleDate : topbarTodoDate)(entry.task, now), entry.expected);
    for (const list of [fixtures.todo, fixtures.schedule, fixtures.edges]) {
      assert.equal(activeToday(list.map(entry => entry.task), today).length, list.length, 'Fixtures must exercise existing filters without replacing them');
    }
    for (const index of [1, 2]) {
      const { id, createdAt, updatedAt, completedAt, notifiedFor, deletedAt, ...input } = fixtures.schedule[index].task;
      assert.equal(taskInputSchema.safeParse(input).success, false, 'Cross-day/year fixture is intentionally renderer-only, not schema-valid persisted CRUD');
    }
  }
});

test('Topbar geometry accepts complete multiline times and retained title/completion hit targets', () => {
  assert.doesNotThrow(() => assertTopbarDatesGeometry(geometry()));
  const schedule = geometry(); delete (schedule.rows[0] as Partial<typeof schedule.rows[0]>).check;
  assert.doesNotThrow(() => assertTopbarDatesGeometry(schedule));
});

test('Topbar geometry rejects clipped, zero-sized, nonfinite, overlapping or undersized content', () => {
  const samples: Array<[string, (value: ReturnType<typeof geometry>) => void, RegExp]> = [
    ['outside viewport', value => { value.menu.x = 700; }, /clipped|outside/],
    ['wrong fixed width', value => { value.menu.width = 325; }, /320/],
    ['horizontal overflow', value => { value.scrollWidth++; }, /horizontally/],
    ['missing client width', value => { value.clientWidth = Number.NaN; }, /horizontally/],
    ['no visible rows', value => { value.rows = []; }, /actual visible rows/],
    ['empty time', value => { value.rows[0].time.width = 0; }, /empty/],
    ['invalid time', value => { value.rows[0].time.y = Number.NaN; }, /invalid/],
    ['time outside row', value => { value.rows[0].time.x = 610; }, /clipped|outside/],
    ['row outside menu', value => { value.rows[0].bounds.y = 350; }, /clipped|outside/],
    ['clipped text', value => { value.rows[0].timeComplete = false; }, /complete/],
    ['lost title', value => { value.rows[0].title.width = 12; }, /usable click target/],
    ['lost tooltip', value => { value.rows[0].titleTooltip = ''; }, /full tooltip/],
    ['occluded title', value => { value.rows[0].hitTitle = false; }, /pointer hits/],
    ['title/time overlap', value => { value.rows[0].time.x = 400; }, /overlap/],
    ['occluded check', value => { value.rows[0].hitCheck = false; }, /pointer hits/],
  ];
  for (const [name, modify, expected] of samples) { const value = geometry(); modify(value); assert.throws(() => assertTopbarDatesGeometry(value), expected, name); }
});

test('Installed topbar acceptance preserves normal UI writes, isolates synthetic reads, restores finally and checks real relaunch', async () => {
  const source = await readFile(new URL('../tooling/topbar-dates-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /workbench\.(?:todo\.(?:create|update|remove)|settings\.(?:set|update)|ai\.(?:ask|apply|saveProvider))\(|localStorage\.setItem|setContent\(|addInitScript\(|setInputFiles\(|writeFile\(|fetch\(|https?:\/\//);
  assert.match(source, /session\.wrapper = \(\) => session\.value/);
  assert.match(source, /ipcMain\.handle\('todo:state', session\.original\)/);
  assert.match(source, /finally \{\s*await restoreTopbarReadState\(application\)/);
  assert.match(source, /assert\.deepEqual\(await state\(page\), beforeSynthetic\)/);
  assert.match(source, /await page\.reload\(\)/);
  assert.match(source, /win\.webContents\.setZoomFactor/);
  assert.match(source, /win\.setContentSize/);
  assert.match(source, /document\.elementFromPoint/);
  assert.match(source, /bounds\.right <= track\.right/);
  assert.match(source, /same installed executable relaunch/);
  assert.match(source, /not persisted CRUD or migration coverage/);
  assert.ok(entry.indexOf('birthdayFixture = await runYearDropdownPilot(') < entry.indexOf('topbarDatesFixture = await runTopbarDatesPilot('));
  assert.ok(entry.indexOf('topbarDatesFixture = await runTopbarDatesPilot(') < entry.indexOf('aiCardsFixture = await runAiCardsPilot('));
  assert.ok(entry.indexOf('topbarDatesFixture = await runTopbarDatesPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyTopbarDatesRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
});


test('Renderer-only read hook preserves the exact real handler, allows replacement fixtures and restores after failure', async () => {
  const original = () => ({ tasks: [{ id: 'real-ui-created' }], categories: [] });
  const writer = () => { throw new Error('Mutating handlers must never be called'); };
  const handlers = new Map<string, () => unknown>([['todo:state', original], ['todo:create', writer], ['todo:update', writer]]);
  const sends: string[] = [];
  const runtime = {
    ipcMain: {
      _invokeHandlers: handlers,
      removeHandler: (channel: string) => { handlers.delete(channel); },
      handle: (channel: string, handler: () => unknown) => { assert.equal(handlers.has(channel), false); handlers.set(channel, handler); },
    },
    BrowserWindow: { getAllWindows: () => [{ webContents: { send: (channel: string) => { sends.push(channel); } } }] },
  };
  type Runtime = typeof runtime;
  const application = { evaluate: async (callback: (runtime: Runtime, fixture?: unknown) => unknown, fixture?: unknown) => callback(runtime, fixture) };
  const first = { tasks: [{ id: 'read-only-1' }], categories: [] };
  const second = { tasks: [{ id: 'read-only-2' }], categories: [] };
  await assert.rejects(async () => {
    try {
      await injectTopbarReadState(application, first);
      const wrapper = handlers.get('todo:state');
      assert.notEqual(wrapper, original); assert.deepEqual(wrapper?.(), first);
      await injectTopbarReadState(application, second);
      assert.equal(handlers.get('todo:state'), wrapper); assert.deepEqual(wrapper?.(), second);
      throw new Error('Simulated assertion failure');
    } finally { await restoreTopbarReadState(application); }
  }, /Simulated assertion failure/);
  assert.equal(handlers.get('todo:state'), original); assert.deepEqual(handlers.get('todo:state')?.(), original());
  assert.equal(handlers.get('todo:create'), writer); assert.equal(handlers.get('todo:update'), writer);
  assert.deepEqual(sends, ['todo:changed', 'todo:changed', 'todo:changed']);
  await restoreTopbarReadState(application); // Safe no-op when never installed/already restored.
  assert.equal(handlers.get('todo:state'), original);
});

test('Renderer-only read hook fails closed if the pinned Electron handler API is unavailable', async () => {
  let changed = false;
  const application = { evaluate: async (callback: (runtime: unknown, fixture: unknown) => unknown, fixture: unknown) => callback({
    ipcMain: { removeHandler: () => { changed = true; }, handle: () => { changed = true; } },
    BrowserWindow: { getAllWindows: () => [] },
  }, fixture) };
  await assert.rejects(injectTopbarReadState(application, { tasks: [], categories: [] }), /inspection unavailable/);
  assert.equal(changed, false);
});


test('Normal UI date selection navigates month and year boundaries before locating yesterday', () => {
  for (const [displayed, target, expected] of [
    ['2026年6月', '2026-05-31', -1], // June 1 is Monday: the grid has no May cells.
    ['2026年1月', '2025-12-31', -1],
    ['2024年3月', '2024-02-29', -1],
    ['2026年3月', '2026-02-28', -1],
    ['2026年10月', '2026-10-11', 0],
    ['2026年10月', '2026-10-12', 0],
    ['2026年12月', '2027-01-01', 1],
  ] as const) assert.equal(topbarCalendarMonthStep(displayed, target), expected);
  assert.throws(() => topbarCalendarMonthStep('2026年6月', '2025-12-31'), /within one calendar month/);
  assert.throws(() => topbarCalendarMonthStep('June 2026', '2026-05-31'), /recognizable/);
  assert.throws(() => topbarCalendarMonthStep('2026年13月', '2026-12-31'), /Invalid calendar month/);
});
