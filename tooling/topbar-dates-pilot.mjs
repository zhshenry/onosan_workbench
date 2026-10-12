// Issue #24 acceptance in the actual installed app. Persisted fixtures are made
// through normal UI actions. Unsupported legacy ranges use a temporary, clearly
// reported todo:state READ response only; they never become database/CRUD proof.
import assert from 'node:assert/strict';

export const TOPBAR_DATES_SCREENSHOTS = Object.freeze([
  'topbar-dates-persisted.png', 'topbar-dates-relaunched.png',
  ...['mist', 'cool', 'warm'].flatMap(theme => [
    `topbar-dates-${theme}-todo-1024-zoom125.png`, `topbar-dates-${theme}-schedule-1024-zoom125.png`,
  ]),
]);
export const TOPBAR_DATES_MATRIX = Object.freeze([
  ['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾'],
].flatMap(([theme, label]) => [[1280, 820], [1024, 680]].flatMap(([width, height]) => [1, 1.25].map(zoom => Object.freeze({ theme, label, width, height, zoom })))));
const state = page => page.evaluate(() => window.workbench.todo.state());
const chatList = page => page.evaluate(() => window.workbench.ai.chatList());
export const TOPBAR_AI_JOB_ID = '00000000-0000-4000-8000-00000000a124';
export function topbarAiJobEvents() {
  const chat = { id: TOPBAR_AI_JOB_ID, title: 'CI renderer-only topbar job', module: 'todo', updatedAt: '2000-01-01T00:00:00.000Z' };
  const entry = { id: '00000000-0000-4000-8000-00000000e124', role: 'assistant', content: 'Synthetic layout event only; no provider request.' };
  return [
    { ...chat, entries: [{ ...entry, streaming: true }] },
    { ...chat, entries: [{ ...entry, streaming: false, error: 'Synthetic layout failure only.' }] },
  ];
}
async function injectTopbarAiJob(application, page) {
  const window = await application.browserWindow(page);
  const [running, failed] = topbarAiJobEvents();
  // Send the normal preload event to this renderer only. No chat/provider API write.
  await window.evaluate((win, chat) => win.webContents.send('ai:chat', chat), running);
  await page.getByRole('button', { name: '助手生成中', exact: true }).waitFor({ state: 'visible' });
  await window.evaluate((win, chat) => win.webContents.send('ai:chat', chat), failed);
  await page.getByRole('button', { name: '助手请求失败', exact: true }).waitFor({ state: 'visible' });
}
const stamp = (day, time) => new Date(`${day}T${time}:00`).toISOString();
const dateLabel = (day, year) => day.startsWith(`${year}-`) ? day.slice(5) : day;
const menu = (page, kind) => page.locator(kind === 'todo' ? '.ipop-todo' : '.ipop-sched');

// Kept independent of production formatting helpers so expected strings cannot
// accidentally repeat the implementation's bug. The host and renderer both use
// the installed runner's local timezone; no fixed UTC calendar assumption.
export function topbarReadFixtures(today) {
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/);
  const year = Number(today.slice(0, 4));
  const previous = `${year - 1}-12-31`;
  const startOfYear = `${year}-01-01`;
  const secondDay = `${year}-01-02`;
  const longTitle = 'CI renderer-only 合成日期验收 · ' + '较长标题仍应保留完整日期和可点击标题区域 '.repeat(6);
  let sequence = 0;
  const make = (title, kind, plannedDate, dueAt, endAt = null) => ({
    id: `00000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
    title, kind, status: 'todo', priority: 'medium', plannedDate, dueAt, endAt,
    remindAt: null, categoryId: null, progress: null,
    note: 'Renderer-only synthetic read response; never persisted.',
    createdAt: stamp(startOfYear, '00:00'), updatedAt: stamp(startOfYear, '00:00'),
    completedAt: null, notifiedFor: null, deletedAt: null,
  });
  const entry = (task, expected) => ({ task, expected });
  return {
    todo: [
      entry(make(`${longTitle}当天`, 'task', today, stamp(today, '09:00')), `${today.slice(5)} 09:00`),
      entry(make('CI renderer-only 上年待办', 'task', previous, stamp(previous, '08:30')), `${previous} 08:30`),
      entry(make('CI renderer-only 仅计划日期', 'task', today, null), `${today.slice(5)} · 不限时`),
      entry(make('CI renderer-only 无日期', 'task', '', null), '未设置'),
    ],
    schedule: [
      entry(make(`${longTitle}同日`, 'meeting', today, stamp(today, '14:00'), stamp(today, '15:00')), `${today.slice(5)} 14:00–15:00`),
      entry(make('CI renderer-only 跨日日程', 'meeting', startOfYear, stamp(startOfYear, '23:30'), stamp(secondDay, '00:30')), '01-01 23:30–\n01-02 00:30'),
      entry(make('CI renderer-only 跨年日程', 'meeting', previous, stamp(previous, '23:30'), stamp(startOfYear, '00:30')), `${previous} 23:30–\n${startOfYear} 00:30`),
      entry(make('CI renderer-only 日程时间待定', 'meeting', today, null), `${today.slice(5)} · 时间待定`),
    ],
    edges: [
      entry(make('CI renderer-only 无效待办时间', 'task', today, 'invalid-timestamp'), `${today.slice(5)} · 不限时`),
      // A valid end avoids exercising unrelated legacy meetingEndAt callers.
      entry(make('CI renderer-only 无效日程时间', 'meeting', today, 'invalid-timestamp', stamp(today, '15:00')), `${today.slice(5)} · 时间待定`),
      entry(make('CI renderer-only 无日期日程', 'meeting', '', null), '未设置'),
      entry(make('CI renderer-only 无效计划日期', 'task', 'invalid-date', null), '未设置'),
      entry(make('CI renderer-only 无效结束时间', 'meeting', today, stamp(today, '14:00'), 'invalid-timestamp'), `${today.slice(5)} 14:00–时间待定`),
    ],
  };
}

function inside(inner, outer, description) {
  for (const value of [inner, outer]) {
    assert.ok(value && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(value[key])), `${description}: invalid bounds`);
    assert.ok(value.width > 0 && value.height > 0, `${description}: empty bounds`);
  }
  assert.ok(inner.x >= outer.x - 1 && inner.y >= outer.y - 1
    && inner.x + inner.width <= outer.x + outer.width + 1
    && inner.y + inner.height <= outer.y + outer.height + 1, `${description}: clipped or outside boundary`);
}
function disjoint(first, second, description) {
  const overlapX = Math.min(first.x + first.width, second.x + second.width) - Math.max(first.x, second.x);
  const overlapY = Math.min(first.y + first.height, second.y + second.height) - Math.max(first.y, second.y);
  assert.ok(overlapX <= 1 || overlapY <= 1, `${description}: overlapping controls`);
}
export function assertTopbarControlGeometry(value, requireAiJob = false) {
  inside(value.topbar, value.viewport, 'Topbar');
  inside(value.schedule, value.topbar, 'Schedule capsule');
  inside(value.scheduleTrigger, value.schedule, 'Schedule trigger');
  inside(value.todoTrigger, value.topbar, 'Todo trigger');
  inside(value.right, value.topbar, 'Right toolbar');
  disjoint(value.schedule, value.todoTrigger, 'Schedule and todo');
  disjoint(value.schedule, value.right, 'Schedule and right toolbar');
  disjoint(value.todoTrigger, value.right, 'Todo and right toolbar');
  disjoint(value.scheduleTrigger, value.todoTrigger, 'Schedule trigger and todo');
  disjoint(value.scheduleTrigger, value.right, 'Schedule trigger and right toolbar');
  assert.equal(value.hitSchedule, true, 'Schedule trigger must receive pointer hits');
  assert.equal(value.hitTodo, true, 'Todo trigger must receive pointer hits');
  if (requireAiJob) assert.ok(value.aiJob, 'Synthetic AI job must remain visible throughout the crowded-state checks');
  if (value.aiJob) {
    inside(value.aiJob.bounds, value.right, 'AI job button');
    assert.equal(value.aiJob.text, '助手请求失败', 'AI job must show the complete longest status label');
    assert.equal(value.aiJob.complete, true, 'AI job label must be fully readable');
    assert.equal(value.aiJob.hit, true, 'AI job button must receive pointer hits');
  }
  assert.equal(value.labels.schedule.text, '日程', 'Schedule label must retain its title');
  assert.equal(value.labels.todo.text, '待办', 'Todo label must retain its title');
  assert.match(value.labels.count.text, /^\d+\/\d+$/, 'Todo count must remain readable');
  for (const [name, label] of Object.entries(value.labels)) {
    inside(label.bounds, name === 'schedule' ? value.schedule : value.todoTrigger, `${name} label`);
    assert.equal(label.complete, true, `${name} label must show complete readable text`);
  }
}
async function inspectTopbarControls(page, requireAiJob = false) {
  const geometry = await page.locator('.topbar').evaluate(element => {
    const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
    const hit = node => { const bounds = node.getBoundingClientRect(); const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); return target === node || node.contains(target); };
    const label = node => {
      const bounds = node.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(node);
      const textRects = [...range.getClientRects()].filter(text => text.width > 0 && text.height > 0);
      return { text: node.textContent.trim(), bounds: rect(node), complete: textRects.length > 0
        && textRects.every(text => text.left >= bounds.left - 1 && text.right <= bounds.right + 1 && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1) };
    };
    const schedule = element.querySelector('.sched'); const scheduleTrigger = element.querySelector('.smore');
    const todo = element.querySelector('.todopill'); const aiJob = element.querySelector('.ai-job-btn');
    return {
      viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, topbar: rect(element),
      schedule: rect(schedule), scheduleTrigger: rect(scheduleTrigger), todoTrigger: rect(todo), right: rect(element.querySelector('.tb-right')),
      hitSchedule: hit(scheduleTrigger), hitTodo: hit(todo),
      aiJob: aiJob ? { ...label(aiJob), hit: hit(aiJob) } : null,
      labels: { schedule: label(element.querySelector('.sched-label .lbl')), todo: label(todo.querySelector('.lbl')), count: label(todo.querySelector('.num')) },
    };
  });
  assertTopbarControlGeometry(geometry, requireAiJob);
  return geometry;
}
export function assertTopbarDatesGeometry(value) {
  inside(value.menu, value.viewport, 'Topbar popover');
  assert.ok(Math.abs(value.menu.width - 320) <= 1, 'Topbar popover must remain 320 CSS pixels');
  assert.ok(Number.isFinite(value.clientWidth) && value.clientWidth > 0
    && Number.isFinite(value.scrollWidth) && value.scrollWidth <= value.clientWidth, 'Topbar popover must not overflow horizontally');
  assert.ok(value.rows.length > 0, 'Topbar acceptance needs actual visible rows');
  for (const row of value.rows) {
    inside(row.bounds, value.menu, 'Topbar row');
    inside(row.time, row.bounds, 'Complete date/time');
    inside(row.title, row.bounds, 'Clickable title');
    assert.ok(row.title.width >= 24, 'Long title must keep a usable click target');
    assert.equal(row.timeComplete, true, 'Date/time must be complete, not ellipsized or clipped');
    assert.equal(row.titleTooltip, row.titleText, 'Truncated titles retain their full tooltip');
    assert.equal(row.hitTitle, true, 'Title must receive pointer hits');
    const overlapX = Math.min(row.time.x + row.time.width, row.title.x + row.title.width) - Math.max(row.time.x, row.title.x);
    const overlapY = Math.min(row.time.y + row.time.height, row.title.y + row.title.height) - Math.max(row.time.y, row.title.y);
    assert.ok(overlapX <= 1 || overlapY <= 1, 'Date/time and title must not overlap');
    if (row.check) { inside(row.check, row.bounds, 'Completion button'); assert.equal(row.hitCheck, true, 'Completion button must receive pointer hits'); }
  }
}
async function inspectGeometry(page, kind) {
  await page.waitForFunction(selector => !document.querySelector(selector)?.getAnimations({ subtree: true }).some(animation => animation.playState === 'running'), kind === 'todo' ? '.ipop-todo' : '.ipop-sched');
  const geometry = await menu(page, kind).evaluate(element => {
    const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
    const hit = node => { const bounds = node.getBoundingClientRect(); const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2); return target === node || node.contains(target); };
    const complete = node => {
      const bounds = node.getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(node);
      return node.scrollWidth <= node.clientWidth && node.scrollHeight <= node.clientHeight
        && [...range.getClientRects()].filter(text => text.width > 0 && text.height > 0).every(text => text.left >= bounds.left - 1 && text.right <= bounds.right + 1 && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1);
    };
    return {
      viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, menu: rect(element),
      scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
      rows: [...element.querySelectorAll('.ipop-row')].map(row => {
        const title = row.querySelector('.ipop-title'); const time = row.querySelector('.ipop-time'); const check = row.querySelector('.ipop-check');
        return { bounds: rect(row), title: rect(title), time: rect(time), timeComplete: complete(time),
          titleText: title.textContent, titleTooltip: title.getAttribute('title'), hitTitle: hit(title),
          ...(check ? { check: rect(check), hitCheck: hit(check) } : {}) };
      }),
    };
  });
  assertTopbarDatesGeometry(geometry);
  return geometry;
}
async function resize(application, page, { width, height, zoom = 1 }) {
  const window = await application.browserWindow(page);
  await window.evaluate((win, value) => { win.webContents.setZoomFactor(value.zoom); win.setContentSize(value.width, value.height); }, { width, height, zoom });
  await page.waitForFunction(value => Math.abs(innerWidth - value.width / value.zoom) <= 1 && Math.abs(innerHeight - value.height / value.zoom) <= 1, { width, height, zoom });
  assert.equal(await window.evaluate(win => win.webContents.getZoomFactor()), zoom);
}
async function dismiss(page) { await page.keyboard.press('Escape'); await page.locator('.ipop').waitFor({ state: 'hidden' }); }
async function openMenu(page, kind, requireAiJob = false) {
  if (await menu(page, kind).isVisible()) return;
  await inspectTopbarControls(page, requireAiJob);
  await page.locator(kind === 'todo' ? '.todopill' : '.smore').click();
  await menu(page, kind).waitFor({ state: 'visible' });
}
async function assertLabels(page, kind, entries, requireAiJob = false) {
  await openMenu(page, kind, requireAiJob);
  for (const { task, expected } of entries) {
    const row = menu(page, kind).locator('.ipop-row').filter({ has: page.getByRole('button', { name: task.title, exact: true }) });
    await row.waitFor({ state: 'visible' });
    assert.equal(await row.locator('.ipop-time').textContent(), expected, `${kind}: ${task.title}`);
  }
  assert.doesNotMatch(await menu(page, kind).innerText(), /Invalid Date|NaN|undefined/);
}
async function localCalendar(page) {
  return page.evaluate(() => {
    const day = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const now = new Date(); const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12);
    return { today: day(now), yesterday: day(yesterday), year: now.getFullYear(), timezone: Intl.DateTimeFormat().resolvedOptions().timeZone };
  });
}
// Today's new-task calendar may omit the previous month's days entirely when
// the month starts on the first weekday. Navigate the real header before picking
// yesterday; do not assume an adjacent-month grid cell is present.
export function topbarCalendarMonthStep(displayedMonth, targetDay) {
  const shown = /^(\d{4})年(\d{1,2})月$/.exec(displayedMonth.trim());
  const target = /^(\d{4})-(\d{2})-\d{2}$/.exec(targetDay);
  assert.ok(shown && target, 'Topbar fixture requires recognizable calendar dates');
  const shownMonth = Number(shown[2]); const targetMonth = Number(target[2]);
  assert.ok(shownMonth >= 1 && shownMonth <= 12 && targetMonth >= 1 && targetMonth <= 12, 'Invalid calendar month');
  const steps = (Number(target[1]) - Number(shown[1])) * 12 + targetMonth - shownMonth;
  assert.ok(Math.abs(steps) <= 1, 'Topbar today/yesterday fixture must remain within one calendar month');
  return steps;
}

async function createFixture(page, input) {
  await openMenu(page, input.kind === 'meeting' ? 'schedule' : 'todo');
  await menu(page, input.kind === 'meeting' ? 'schedule' : 'todo').getByRole('button', { name: input.kind === 'meeting' ? '+ 新增日程' : '+ 新增待办', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '新增事项', exact: true });
  await dialog.getByRole('textbox', { name: input.kind === 'meeting' ? '日程名称' : '待办名称', exact: true }).fill(input.title);
  await dialog.getByRole('button', { name: /^时间安排：/ }).click();
  await dialog.locator('#task-date').click();
  const calendar = page.getByRole('dialog', { name: '选择日期', exact: true });
  const monthStep = topbarCalendarMonthStep(await calendar.locator('.date-head > span').textContent(), input.day);
  if (monthStep !== 0) await calendar.getByRole('button', { name: monthStep < 0 ? '上个月' : '下个月', exact: true }).click();
  await calendar.getByRole('gridcell', { name: input.day, exact: true }).click();
  if (input.start) {
    await dialog.locator('#task-time').click();
    if (input.kind === 'meeting') {
      await page.getByRole('option', { name: `${input.start.slice(0, 2)}时`, exact: true }).click();
      await page.getByRole('option', { name: `${input.start.slice(3)}分`, exact: true }).click();
      await dialog.locator('#task-end-time').click();
      await page.getByRole('option', { name: `${input.end.slice(0, 2)}时`, exact: true }).click();
      await page.getByRole('option', { name: `${input.end.slice(3)}分`, exact: true }).click();
    } else await page.getByRole('option', { name: input.start, exact: true }).click();
  }
  await dialog.getByRole('button', { name: '收起', exact: true }).click();
  await dialog.getByRole('button', { name: '更多设置：未设置', exact: true }).click();
  await dialog.getByRole('textbox', { name: '备注 / 进展', exact: true }).fill('Synthetic topbar acceptance. Saved through the normal editor.');
  await dialog.getByRole('button', { name: '创建', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  const matches = (await state(page)).tasks.filter(task => task.title === input.title);
  assert.equal(matches.length, 1, 'Topbar fixture must be created exactly once');
  const task = matches[0];
  assert.equal(task.kind, input.kind); assert.equal(task.plannedDate, input.day);
  assert.equal(task.dueAt, input.start ? stamp(input.day, input.start) : null);
  assert.equal(task.endAt, input.end ? stamp(input.day, input.end) : null);
  assert.equal(task.note, 'Synthetic topbar acceptance. Saved through the normal editor.');
  assert.ok(Number.isFinite(Date.parse(task.createdAt)) && Number.isFinite(Date.parse(task.updatedAt)));
  return task;
}

// Electron's pinned runtime exposes its invocation-handler map. This is confined
// to the acceptance harness: retain the exact original function, wrap only reads,
// verify identity on restoration, and fail closed if the runtime API changes.
export async function injectTopbarReadState(application, value) {
  await application.evaluate(({ ipcMain, BrowserWindow }, fixture) => {
    const key = '__onoTopbarReadPilot';
    const handlers = ipcMain._invokeHandlers;
    if (!(handlers instanceof Map)) throw new Error('Pinned Electron read-handler inspection unavailable');
    let session = globalThis[key];
    if (!session) {
      const original = handlers.get('todo:state');
      if (typeof original !== 'function') throw new Error('Original todo:state read handler missing');
      session = { original, value: fixture };
      session.wrapper = () => session.value;
      globalThis[key] = session;
      ipcMain.removeHandler('todo:state'); ipcMain.handle('todo:state', session.wrapper);
    } else {
      if (handlers.get('todo:state') !== session.wrapper) throw new Error('Read handler changed during acceptance');
      session.value = fixture;
    }
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('todo:changed');
  }, value);
}
export async function restoreTopbarReadState(application) {
  await application.evaluate(({ ipcMain, BrowserWindow }) => {
    const key = '__onoTopbarReadPilot'; const session = globalThis[key];
    if (!session) return;
    if (ipcMain._invokeHandlers?.get('todo:state') !== session.wrapper) throw new Error('Cannot safely restore changed todo:state handler');
    ipcMain.removeHandler('todo:state'); ipcMain.handle('todo:state', session.original);
    if (ipcMain._invokeHandlers.get('todo:state') !== session.original) throw new Error('Original read handler not restored');
    delete globalThis[key];
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('todo:changed');
  });
}
async function syntheticRows(application, page, kind, entries, requireAiJob = false) {
  await dismiss(page);
  await injectTopbarReadState(application, { tasks: entries.map(entry => entry.task), categories: [] });
  await assertLabels(page, kind, entries, requireAiJob);
  assert.equal(await menu(page, kind).locator('.ipop-row').count(), entries.length);
  // Rows prove the injected read response reached React before checking controls.
  return inspectTopbarControls(page, requireAiJob);
}

export async function runTopbarDatesPilot({ application, page, check, screenshot, runId, report }) {
  const calendar = await localCalendar(page);
  const persisted = [];
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await resize(application, page, { width: 1280, height: 820 });
  if (await page.locator('#workbench-ai-panel').getAttribute('aria-hidden') === 'false') await page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true }).click();
  await page.locator('.rail [data-workbench="home"]').click();
  await check('Topbar dates: create timed, overdue, untimed todo and same-day schedule through normal UI', async () => {
    for (const input of [
      { title: `CI topbar 今日待办 ${runId}`, kind: 'task', day: calendar.today, start: '09:00' },
      { title: `CI topbar 逾期待办 ${runId}`, kind: 'task', day: calendar.yesterday, start: '08:30' },
      { title: `CI topbar 不限时 ${runId}`, kind: 'task', day: calendar.today },
      { title: `CI topbar 日程 ${runId}`, kind: 'meeting', day: calendar.today, start: '14:00', end: '15:00' },
    ]) persisted.push(await createFixture(page, input));
  });
  const todoEntries = persisted.map(task => ({ task, expected: task.dueAt
    ? `${dateLabel(task.plannedDate, calendar.year)} ${task.kind === 'meeting' ? '14:00' : task.title.includes('逾期') ? '08:30' : '09:00'}`
    : `${dateLabel(task.plannedDate, calendar.year)} · 不限时` }));
  const meeting = persisted.find(task => task.kind === 'meeting');
  const scheduleEntries = [{ task: meeting, expected: `${dateLabel(meeting.plannedDate, calendar.year)} 14:00–15:00` }];
  await check('Topbar dates: real persisted labels, capsule parity and original click/dismiss/complete actions', async () => {
    await assertLabels(page, 'todo', todoEntries);
    await screenshot('topbar-dates-persisted.png');
    // Edit opens from the original title button; cancel does not modify data.
    await menu(page, 'todo').getByRole('button', { name: persisted[0].title, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑事项', exact: true });
    await dialog.waitFor({ state: 'visible' });
    await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.deepEqual((await state(page)).tasks.find(task => task.id === persisted[0].id), persisted[0]);
    await assertLabels(page, 'schedule', scheduleEntries);
    await menu(page, 'schedule').getByRole('button', { name: meeting.title, exact: true }).click();
    await dialog.waitFor({ state: 'visible' }); await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await dismiss(page);
    assert.equal(await page.locator('.schip').filter({ has: page.locator('.n', { hasText: meeting.title }) }).locator('.t').textContent(), scheduleEntries[0].expected);
    await page.locator('.schip').filter({ has: page.locator('.n', { hasText: meeting.title }) }).click();
    await dialog.waitFor({ state: 'visible' }); await dialog.getByRole('button', { name: '关闭', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    await openMenu(page, 'todo'); await dismiss(page); await openMenu(page, 'todo');
    await page.locator('.rail [data-workbench="home"]').click(); await menu(page, 'todo').waitFor({ state: 'hidden' });
    // Retain and exercise the topbar's existing direct completion action.
    await openMenu(page, 'todo');
    const row = menu(page, 'todo').locator('.ipop-row').filter({ has: page.getByRole('button', { name: persisted[1].title, exact: true }) });
    await row.locator('.ipop-check').click();
    await page.waitForFunction(id => window.workbench.todo.state().then(value => value.tasks.some(task => task.id === id && task.status === 'done')), persisted[1].id);
    await row.waitFor({ state: 'hidden' });
    const completed = (await state(page)).tasks.find(task => task.id === persisted[1].id);
    for (const key of ['id', 'title', 'plannedDate', 'dueAt', 'createdAt', 'note']) assert.equal(completed[key], persisted[1][key]);
    persisted[1] = completed;
    await dismiss(page);
  });
  const beforeSynthetic = await state(page);
  const beforeChats = await chatList(page);
  assert.equal(beforeChats.some(chat => chat.id === TOPBAR_AI_JOB_ID), false, 'Synthetic job ID must not already exist');
  report.topbarDates = {
    synthetic: true, timezone: calendar.timezone, localDay: calendar.today,
    persistedUiFixtureIds: persisted.map(task => task.id), matrix: [],
    aiJobFixture: { chatId: TOPBAR_AI_JOB_ID, label: '助手请求失败', transport: 'Synthetic ai:chat renderer events only; no provider request or chat database write.' },
    rendererReadFixtures: 'Temporary todo:state read-response injection only. Cross-day/year, absent/invalid legacy data and long-title geometry are not persisted CRUD or migration coverage.',
  };
  const fixtures = topbarReadFixtures(calendar.today);
  try {
    // Settings keeps unsupported legacy data out of unrelated home-view widgets.
    await page.locator('.rail [data-workbench="settings"]').click();
    await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click();
    await check('Topbar dates: synthetic AI status event shows crowded toolbar without provider or chat writes', async () => {
      await injectTopbarAiJob(application, page);
      await inspectTopbarControls(page, true);
      assert.deepEqual(await chatList(page), beforeChats);
    });
    await check('Topbar dates: renderer-only invalid or absent dates have sane fallbacks without persistence', async () => {
      for (const entry of fixtures.edges) await syntheticRows(application, page, entry.task.kind === 'meeting' ? 'schedule' : 'todo', [entry], true);
      await dismiss(page);
    });
    for (const fixture of TOPBAR_DATES_MATRIX) {
      await check(`Topbar dates: renderer-only ${fixture.theme} ${fixture.width}x${fixture.height} zoom ${fixture.zoom}`, async () => {
        await dismiss(page);
        await page.getByRole('radio', { name: fixture.label, exact: true }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, fixture.theme);
        await resize(application, page, fixture);
        assert.equal(await page.locator('.sched-track').isVisible(), fixture.width / fixture.zoom > 1180, 'Preserve existing narrow-window schedule collapse');
        const geometries = {};
        for (const kind of ['todo', 'schedule']) {
          const controls = await syntheticRows(application, page, kind, fixtures[kind], true);
          geometries[kind] = { ...await inspectGeometry(page, kind), controls };
          if (fixture.width === 1024 && fixture.zoom === 1.25) await screenshot(`topbar-dates-${fixture.theme}-${kind}-1024-zoom125.png`);
          await dismiss(page);
        }
        report.topbarDates.matrix.push({ ...fixture, geometries });
      });
    }
    await check('Topbar dates: renderer-only capsule/popover parity for same-day, cross-day and cross-year ranges', async () => {
      for (const width of [1280, 1181]) {
        await resize(application, page, { width, height: 820 });
        for (const entry of fixtures.schedule) {
          await syntheticRows(application, page, 'schedule', [entry], true); await dismiss(page);
          const capsule = page.locator('.schip').filter({ has: page.locator('.n', { hasText: entry.task.title }) });
          assert.equal(await capsule.locator('.t').textContent(), entry.expected);
          const visible = await capsule.locator('.t').evaluate(node => {
            const range = document.createRange(); range.selectNodeContents(node);
            const bounds = node.getBoundingClientRect(); const track = node.closest('.sched-track').getBoundingClientRect();
            const button = node.closest('.schip'); const capsule = button.getBoundingClientRect(); const topbar = node.closest('.topbar').getBoundingClientRect();
            const title = button.querySelector('.n'); const titleBounds = title.getBoundingClientRect();
            const right = document.querySelector('.tb-right').getBoundingClientRect();
            const hit = document.elementFromPoint(titleBounds.x + titleBounds.width / 2, titleBounds.y + titleBounds.height / 2);
            return node.scrollWidth <= node.clientWidth && bounds.width > 0 && bounds.left >= track.left - 1 && bounds.right <= track.right + 1
              && capsule.top >= topbar.top - 1 && capsule.bottom <= topbar.bottom + 1 && capsule.right <= right.left + 1
              && titleBounds.width >= 24 && button.title === title.textContent && (hit === button || button.contains(hit))
              && [...range.getClientRects()].filter(rect => rect.width > 0).every(rect => rect.left >= bounds.left - 1 && rect.right <= bounds.right + 1 && rect.top >= bounds.top - 1 && rect.bottom <= bounds.bottom + 1);
          });
          assert.equal(visible, true, `Capsule must show its complete date/time range at ${width}px`);
        }
      }
    });
  } finally {
    await restoreTopbarReadState(application);
    await resize(application, page, { width: 1280, height: 820 });
    await dismiss(page);
  }
  await check('Topbar dates: restore real read handler and verify all stored tasks/categories unchanged by renderer fixtures', async () => {
    assert.deepEqual(await state(page), beforeSynthetic);
    assert.deepEqual(await chatList(page), beforeChats, 'Synthetic AI events must not change chat storage');
    // A renderer reload must read real storage again after the temporary hook is gone.
    await page.reload(); await page.locator('.topbar').waitFor({ state: 'visible' });
    await page.locator('.ai-job-btn').waitFor({ state: 'hidden' });
    assert.deepEqual(await chatList(page), beforeChats);
    assert.equal((await chatList(page)).some(chat => chat.id === TOPBAR_AI_JOB_ID), false, 'Renderer-only job ID must never persist');
    assert.deepEqual(await state(page), beforeSynthetic);
    await assertLabels(page, 'schedule', scheduleEntries); await dismiss(page);
  });
  return { persisted, calendar, scheduleEntries };
}

export async function verifyTopbarDatesRelaunch({ page, check, screenshot, fixture }) {
  await check('Topbar dates: same installed executable relaunch retains exact UI-created records and date labels', async () => {
    const real = await state(page);
    for (const task of fixture.persisted) assert.deepEqual(real.tasks.find(value => value.id === task.id), task);
    assert.equal(real.tasks.some(task => task.id.startsWith('00000000-0000-4000-8000-')), false, 'Renderer-only fixtures must never reach persistence');
    await assertLabels(page, 'schedule', fixture.scheduleEntries);
    await screenshot('topbar-dates-relaunched.png'); await dismiss(page);
  });
}
