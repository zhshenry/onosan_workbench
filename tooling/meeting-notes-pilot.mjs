// Browser plugin not available: use the project's isolated Playwright Electron workflow.
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url), output = path.resolve('test-results/meeting-notes');
await mkdir(output, { recursive: true });
const data = await mkdtemp(path.join(output, 'data-'));
const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: data, WORKBENCH_ISOLATED: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[key];
const report = { passed: false, checks: [], screenshots: [], errors: [], geometry: [], data, browser: 'Browser plugin not available; isolated Playwright Electron' };
let app, page, win, meetingId, morningId, historicalId, linkedId;
const noteEditor = () => page.getByRole('textbox', { name: '会议纪要', exact: true });
const overview = () => page.locator('#view-todo > .todo-panel');
const check = async (name, run) => { await run(); report.checks.push(name); console.log(`PASS ${name}`); };
const persisted = async () => page.evaluate(id => window.workbench.meetingNotes.list().then(notes => notes.find(note => note.meetingId === id)), meetingId);
async function waitNote(matches) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const note = await persisted(); if (matches(note)) return note;
    await page.waitForTimeout(100);
  }
  assert.fail('meeting note was not durably saved');
}
const waitBody = text => waitNote(note => note?.body.includes(text));
async function screenshot(name) {
  await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(280);
  const file = path.join(output, name);
  const png = await win.evaluate(async win => (await win.capturePage()).toPNG().toString('base64'));
  await writeFile(file, Buffer.from(png, 'base64')); report.screenshots.push(file);
}
async function launch() {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--force-device-scale-factor=1', '--disable-backgrounding-occluded-windows'], cwd: process.cwd(), env, timeout: 45000, chromiumSandbox: true });
  for (let attempt = 0; attempt < 250; attempt++) { page = app.windows().find(candidate => /\/dist\/index\.html$/.test(candidate.url())); if (page) break; await new Promise(resolve => setTimeout(resolve, 100)); }
  assert.ok(page, 'isolated main page'); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
  assert.ok((await app.evaluate(({ app }) => app.getPath('userData'))).startsWith(data));
  win = await app.browserWindow(page); await win.evaluate(win => { win.setTitle('ONO · 会议纪要验收'); win.setContentSize(1568, 1003); });
  await page.addInitScript(() => { localStorage.setItem('wb.bot.mode', 'floating'); localStorage.setItem('wb.bot.nav.expanded', '0'); });
  await page.reload(); await page.waitForFunction(() => Boolean(window.workbench?.meetingNotes));
  await page.evaluate(() => window.workbench.settings.patch({ uiTheme: 'mist', navigationStyle: 'floating', glassIntensity: 'normal', launchAtLogin: false }));
  await page.reload(); await page.locator('[data-workbench="todo"].ritem').click();
  await page.locator('#view-todo .greet h1').waitFor();
  const hint = page.locator('.ai-setup-hint[data-ai-hint="setup"]');
  await hint.waitFor({ state: 'visible', timeout: 4000 }).catch(() => {});
  if (await hint.isVisible()) await hint.locator('header button').click();
}
async function openMeeting(title = '产品设计评审') {
  await page.locator('.week-agenda-title').filter({ hasText: title }).click(); await noteEditor().waitFor();
}
async function back() { await page.locator('.meeting-directory .meeting-back').click(); await overview().waitFor({ state: 'visible' }); }
try {
  await launch();
  const ids = await page.evaluate(async () => {
    const api = window.workbench.todo, now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const base = { kind: 'meeting', status: 'todo', priority: 'medium', dateAt: day, remindAt: null, categoryId: null, progress: null, note: '目标：确认纪要记录与会后跟进流程' };
    const make = async (title, start, end, extra = {}) => { const before = new Set((await api.state()).tasks.map(task => task.id)); const state = await api.create({ ...base, title, dateAt: start.toISOString(), endAt: end.toISOString(), ...extra }); return state.tasks.find(task => !before.has(task.id)).id; };
    const morning = new Date(`${day}T09:00:00`), morningEnd = new Date(`${day}T09:30:00`);
    const start = new Date(now.getTime() + 10 * 60000), end = new Date(now.getTime() + 40 * 60000);
    const main = await make('产品设计评审', start, end);
    const early = await make('晨间同步', morning, morningEnd, { status: 'done' });
    await make('项目进度同步', new Date(`${day}T16:30:00`), new Date(`${day}T17:00:00`));
    const yesterday = new Date(`${day}T12:00:00`); yesterday.setDate(yesterday.getDate() - 1);
    const oldDay = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const old = await make('历史项目周会', new Date(`${oldDay}T15:00:00`), new Date(`${oldDay}T16:00:00`), { dateAt: oldDay, status: 'done' });
    for (const [index, title] of ['确认纪要编辑交互', '整理设计评审反馈', '补充项目验收清单', '更新会议跟进事项'].entries()) await api.create({ ...base, title, kind: 'task', dateAt: null, endAt: null, status: index === 0 ? 'done' : 'todo', note: '' });
    return { main, early, old };
  });
  meetingId = ids.main; morningId = ids.early; historicalId = ids.old;
  await page.getByRole('button', { name: '打开日程 产品设计评审', exact: true }).waitFor();
  await check('daily toolbar is compact; completed schedules remain visible; there are no workspace tabs', async () => {
    assert.equal(await page.locator('.week-strip:visible').count(), 0);
    assert.equal(await page.getByRole('button', { name: '打开日程 晨间同步', exact: true }).count(), 1);
    const header = await page.locator('.week-schedule-header').boundingBox(); assert.ok(header.height < 90);
    assert.equal(await page.locator('.bot-workspace-header').getByRole('button', { name: '会议纪要', exact: true }).count(), 0);
  });
  await check('reminder reuses the existing title card without moving either content panel; dismiss does not complete the meeting', async () => {
    const before = await page.locator('.today-board').boundingBox();
    await page.evaluate(async id => { const task = (await window.workbench.todo.state()).tasks.find(task => task.id === id); await window.workbench.todo.update(id, { remindAt: new Date(Date.now() - 1000).toISOString() }, task.updatedAt); }, meetingId);
    await page.locator('.schedule-header-reminder').waitFor();
    const after = await page.locator('.today-board').boundingBox(); report.geometry.push({ state: 'reminder', before, after });
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) <= 1, `stable ${key}`);
    assert.equal(await page.locator('.reminder-strip:visible').count(), 0);
    assert.equal(await page.locator('.greet .schedule-header-reminder').count(), 1);
    await screenshot('01-reminder-overview.png');
    await page.getByRole('button', { name: '收起本次提醒', exact: true }).click();
    assert.equal((await page.evaluate(() => window.workbench.todo.state())).tasks.find(task => task.id === meetingId).status, 'todo');
  });
  await check('snooze changes only reminder time and preserves the meeting range', async () => {
    await page.evaluate(async id => { const task = (await window.workbench.todo.state()).tasks.find(task => task.id === id); await window.workbench.todo.update(id, { remindAt: new Date(Date.now() - 2000).toISOString() }, task.updatedAt); }, meetingId);
    await page.getByRole('button', { name: '稍后10分钟', exact: true }).click();
    const task = (await page.evaluate(() => window.workbench.todo.state())).tasks.find(task => task.id === meetingId);
    assert.ok(Date.parse(task.remindAt) - Date.now() > 8 * 60000); assert.ok(task.dateAt && task.endAt);
  });
  await check('meeting opens one unified detail surface and arrangement editing still uses the shared modal', async () => {
    await openMeeting();
    assert.equal(await page.locator('.meeting-workspace').count(), 1);
    assert.equal(await page.locator('.greet:visible').count(), 0);
    assert.equal(await page.locator('.meeting-directory').getByRole('button', { name: '返回首页', exact: true }).count(), 1);
    await page.getByRole('button', { name: '编辑安排', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^(?:编辑事项|编辑日程|编辑待办|日程详情)$/ }); await dialog.waitFor();
    await dialog.getByRole('button', { name: '关闭', exact: true }).click(); await noteEditor().waitFor();
  });
  await check('rich text paste is sanitized, autosaved and not limited by the original 5000-character note', async () => {
    await noteEditor().focus();
    await noteEditor().evaluate(node => { const data = new DataTransfer(); data.setData('text/html', '<h2 onclick="window.__meetingPoison=1">讨论记录</h2><p>关键决议：保留原始记录</p><script>window.__meetingPoison=1</script>'); node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
    await waitBody('关键决议'); assert.equal(await page.evaluate(() => window.__meetingPoison), undefined);
    assert.doesNotMatch((await persisted()).body, /script|onclick/);
    const longText = '会议长记录'.repeat(1200); await noteEditor().fill(longText); await waitBody(longText);
    assert.ok((await persisted()).body.length > 5000);
    assert.equal((await page.evaluate(() => window.workbench.todo.state())).tasks.find(task => task.id === meetingId).note, '目标：确认纪要记录与会后跟进流程');
    await noteEditor().fill('关键决议：真实记录，切换会议前应保存。');
    await page.locator('.meeting-directory-item').filter({ hasText: '晨间同步' }).click();
    await page.locator('.meeting-heading h1').filter({ hasText: '晨间同步' }).waitFor();
    await waitBody('切换会议前应保存');
    assert.equal(await noteEditor().innerText(), '');
    await page.locator('.meeting-directory-item').filter({ hasText: '产品设计评审' }).click();
    await page.locator('.meeting-heading h1').filter({ hasText: '产品设计评审' }).waitFor();
    assert.match(await noteEditor().innerText(), /关键决议/);
  });
  await check('historical schedule and minutes search can find completed meetings and clear the filter', async () => {
    await page.evaluate(async id => window.workbench.meetingNotes.save(id, { body: '<p>历史唯一关键词</p>', organized: true, actions: [] }, 0), historicalId);
    await page.getByRole('textbox', { name: '搜索日程', exact: true }).fill('历史唯一关键词');
    await page.locator('.meeting-directory-item').filter({ hasText: '历史项目周会' }).waitFor();
    assert.equal(await page.locator('.meeting-directory-item').count(), 1);
    await page.getByRole('button', { name: '清空日程搜索', exact: true }).click();
    assert.ok(await page.locator('.meeting-directory-item').count() >= 4);
  });
  await check('formatting toolbar preserves editor selection, supports undo and inserts a safe link', async () => {
    await noteEditor().fill('格式工具检查');
    await page.getByRole('button', { name: '切换二级标题', exact: true }).click();
    assert.equal(await noteEditor().locator('h2').count(), 0);
    await noteEditor().evaluate(node => { const range = document.createRange(); range.selectNodeContents(node); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range); node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); });
    await page.getByRole('button', { name: '加粗', exact: true }).click();
    assert.match(await noteEditor().innerHTML(), /<(b|strong)>/);
    await page.getByRole('button', { name: '撤销编辑', exact: true }).click();
    assert.doesNotMatch(await noteEditor().innerHTML(), /<(b|strong)>/);
    await page.getByRole('button', { name: '插入链接', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '插入链接', exact: true });
    await dialog.getByRole('textbox', { name: '链接地址', exact: true }).fill('https://example.com/meeting');
    await dialog.getByRole('button', { name: '插入链接', exact: true }).click();
    await noteEditor().locator('a[href="https://example.com/meeting"]').waitFor();
    await noteEditor().fill('');
    await noteEditor().evaluate(node => { const data = new DataTransfer(); data.setData('text/html', '<h2>讨论记录</h2><p>围绕日程安排、会议记录和会后跟进，确认本次优化的主要流程。</p><ul><li>日期操作集中在一行，给当天日程留出空间。</li><li>会议纪要从对应日程进入，保留历史回查。</li><li>提醒整合进标题卡，不挤占工作区。</li></ul><h2>会议结论</h2><p>关键决议：保留连续的纪要编辑空间，后续行动确认后再转为真实待办。</p>'); node.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true })); });
    await waitBody('关键决议');
  });
  await check('action conversion uses the same centered create dialog and links exactly one real todo', async () => {
    await page.getByRole('button', { name: '添加后续行动', exact: true }).click();
    await page.getByRole('textbox', { name: '行动项1', exact: true }).fill('跟进 · 输出评审修订稿');
    await page.getByRole('button', { name: '转为待办', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: /^(?:新增事项|新建日程|新建待办)$/ }); await dialog.waitFor();
    await dialog.evaluate(node => Promise.all(node.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const bounds = await dialog.boundingBox(), viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    assert.ok(Math.abs(bounds.x + bounds.width / 2 - viewport.width / 2) < 2); assert.ok(Math.abs(bounds.y + bounds.height / 2 - viewport.height / 2) < 2);
    assert.equal(await dialog.getByRole('textbox', { name: '待办名称', exact: true }).inputValue(), '跟进 · 输出评审修订稿');
    await screenshot('04-convert-action-modal.png');
    await dialog.getByRole('button', { name: '创建', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    linkedId = (await persisted()).actions[0].taskId; assert.ok(linkedId);
    assert.equal((await page.evaluate(() => window.workbench.todo.state())).tasks.filter(task => task.title === '跟进 · 输出评审修订稿').length, 1);
    await page.getByRole('button', { name: '查看待办', exact: true }).click();
    const edit = page.getByRole('dialog', { name: /^(?:编辑事项|编辑日程|编辑待办|日程详情)$/ });
    await edit.locator('.task-meeting-source button').click(); await noteEditor().waitFor(); assert.equal(await edit.count(), 0);
  });
  await check('completion uses existing confirmation and synchronizes the linked action status', async () => {
    await back();
    await page.getByRole('button', { name: '完成 跟进 · 输出评审修订稿', exact: true }).click();
    await page.getByRole('button', { name: '确认完成', exact: true }).click();
    await openMeeting();
    await page.locator('.meeting-action-row.is-done').filter({ hasText: '跟进 · 输出评审修订稿' }).waitFor();
    await page.getByRole('button', { name: '标记已整理', exact: true }).click();
    await waitNote(note => note?.organized);
  });
  await check('return restores the browsed date and global schedule entry opens the same minutes detail', async () => {
    await back(); await page.getByRole('button', { name: '下一天', exact: true }).click();
    const label = await page.getByRole('button', { name: /^(?:选择日程日期|选择日历日期)$/ }).innerText();
    await page.locator('.schip[title="产品设计评审"]').click();
    await page.locator('.ipop-sched').getByRole('button', { name: '产品设计评审', exact: true }).click();
    await noteEditor().waitFor();
    await back(); assert.equal(await page.getByRole('button', { name: /^(?:选择日程日期|选择日历日期)$/ }).innerText(), label);
    await page.getByRole('button', { name: '今天', exact: true }).click(); await openMeeting();
  });
  await check('three materials keep the same detail geometry and narrow workspaces expose schedule navigation', async () => {
    const baseline = await page.locator('.meeting-workspace').boundingBox();
    for (const material of ['solid', 'normal', 'strong']) {
      await page.evaluate(material => document.documentElement.dataset.glass = material, material);
      const current = await page.locator('.meeting-workspace').boundingBox();
      for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(baseline[key] - current[key]) <= 1);
      const paint = await page.locator('.meeting-workspace').evaluate(node => ({ material: document.documentElement.dataset.glass, filter: getComputedStyle(node).backdropFilter, reducedTransparency: matchMedia('(prefers-reduced-transparency: reduce)').matches, supportsFilter: CSS.supports('backdrop-filter', 'blur(1px)') }));
      report.materials ??= []; report.materials.push(paint);
      assert.equal(paint.filter === 'none', material === 'solid' || paint.reducedTransparency || !paint.supportsFilter, JSON.stringify(paint));
    }
    await win.evaluate(win => win.setContentSize(1024, 680));
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    await page.getByRole('button', { name: '日程列表', exact: true }).click();
    await page.getByRole('button', { name: '返回当前纪要', exact: true }).click();
    assert.ok(await noteEditor().isVisible());
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await screenshot('03-narrow-meeting.png');
    await page.locator('.meeting-compact-navigation .meeting-back').click();
    await overview().waitFor({ state: 'visible' });
    const beforeReminder = await page.locator('.today-board').boundingBox();
    await page.evaluate(async id => { const task = (await window.workbench.todo.state()).tasks.find(task => task.id === id); await window.workbench.todo.update(id, { remindAt: new Date(Date.now() - 3000).toISOString() }, task.updatedAt); }, meetingId);
    await page.locator('.schedule-reminder-toggle').click();
    await page.getByRole('button', { name: '打开日程', exact: true }).waitFor();
    const afterReminder = await page.locator('.today-board').boundingBox();
    report.geometry.push({ state: 'narrow reminder', before: beforeReminder, after: afterReminder });
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(beforeReminder[key] - afterReminder[key]) <= 1);
    await screenshot('05-narrow-reminder.png');
    await page.getByRole('button', { name: '打开日程', exact: true }).click(); await noteEditor().waitFor();
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click();
    await win.evaluate(win => win.setContentSize(1568, 1003)); await page.evaluate(() => document.documentElement.dataset.glass = 'normal');
  });
  await screenshot('02-meeting-detail.png');
  await check('real process restart retains notes and the action link', async () => {
    const before = await persisted(); await app.close(); app = null;
    await launch(); await openMeeting();
    assert.equal((await persisted()).body, before.body); assert.equal((await persisted()).actions[0].taskId, linkedId);
    assert.ok(await page.locator('.meeting-action-row.is-done').count());
  });
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) {
  report.failure = error?.stack ?? String(error); console.error(report.failure); process.exitCode = 1;
  if (page && win) await screenshot('failure.png').catch(() => {});
} finally {
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  if (app) await app.close().catch(() => {});
}
