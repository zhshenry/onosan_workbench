// Real Electron UI/IPC in a task-owned data directory. Never opens the installed profile.
import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp, readFile } from 'node:fs/promises';
import { createHash, randomBytes } from 'node:crypto';
import { createServer as createNetServer } from 'node:net';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';
import { createServer } from 'node:http';

const require = createRequire(import.meta.url), output = path.resolve(process.env.BOT_UI_OUTPUT || 'test-results/bot-ui');
await mkdir(output, { recursive: true });
const data = await mkdtemp(path.join(output, 'data-'));
const report = { passed: false, checks: [], screenshots: [], errors: [], data };
const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: data, WORKBENCH_ISOLATED: '1' };
for (const name of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[name];
const devUrl = process.env.BOT_UI_DEV_URL;
if (devUrl) env.WORKBENCH_DEV_URL = devUrl;
const mainPage = url => devUrl ? url.replace(/\/$/, '') === devUrl.replace(/\/$/, '') : /\/dist\/index\.html$/.test(url);
let legacyServer, legacyShutdown = false;
const legacyCalls = [], legacySockets = new Set();
if (process.env.BOT_UI_LEGACY_HOST === '1') {
  const directory = path.join(data, 'OnoWorkbench', 'isolated'), secret = randomBytes(32).toString('hex');
  await mkdir(directory, { recursive: true }); await writeFile(path.join(directory, 'bot-host.secret'), secret);
  const name = createHash('sha256').update(path.resolve(directory).toLowerCase()).digest('hex').slice(0, 24);
  const address = process.platform === 'win32' ? String.raw`\\.\pipe\ono-bot-${name}` : path.join(directory, 'bot-host.sock');
  legacyServer = createNetServer(socket => {
    let buffer = '', authorized = false; legacySockets.add(socket); socket.setEncoding('utf8');
    socket.on('close', () => legacySockets.delete(socket)); socket.on('error', () => {});
    socket.on('data', data => {
      buffer += data; let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const frame = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
        if (!authorized && (frame.method !== 'hello' || frame.secret !== secret)) { socket.destroy(); return; }
        authorized = true; legacyCalls.push(frame.method === 'bot' ? frame.args[0] : frame.method);
        let value;
        if (frame.method === 'hello') value = { version: 1, contractVersion: 'bot-workbench/v3' };
        else if (frame.method === 'bot' && frame.args[0] === 'getHostState') value = { connected: true, running: true, independent: true, pid: process.pid, activeTasks: 0, queuedTasks: 0, startedAt: new Date().toISOString(), supervised: false };
        else if (frame.method === 'shutdown') { value = true; legacyShutdown = true; setTimeout(() => { legacyServer.close(); for (const client of legacySockets) client.end(); }, 20); }
        else { report.errors.push(`Legacy Host unexpectedly received ${frame.method}`); socket.destroy(); return; }
        socket.write(JSON.stringify({ id: frame.id, value }) + '\n');
      }
    });
  });
  await new Promise(resolve => legacyServer.listen(address, resolve));
}
let app, page;
let fixtureRequests = 0;
const model = createServer(async (req, res) => {
  if (req.method === 'GET') {
    if (req.url === '/fixture') fixtureRequests++;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html lang="zh-CN"><title>资源桥验收</title><h1>资源桥测试页面</h1><p>仅隔离测试使用。</p></html>');
    return;
  }
  let raw = ''; for await (const chunk of req) raw += chunk;
  if (req.headers.authorization !== 'Bearer isolated-fixture-key') { report.errors.push('fixture authorization mismatch'); res.writeHead(401); res.end('fixture authorization mismatch'); return; }
  const input = JSON.parse(raw), latest = [...input.messages].reverse().find(message => message.role === 'user');
  if (JSON.stringify(latest).includes('请求失败验收')) {
    res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { message: '隔离测试：请求未完成' } })); return;
  }
  if (JSON.stringify(latest).includes('浮动流式验收') || JSON.stringify(latest).includes('浮动停止验收')) {
    const stopping = JSON.stringify(latest).includes('浮动停止验收');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const parts = ['# 当前这一轮的答复\n\n', ...Array.from({ length: stopping ? 80 : 25 }, (_, index) => `第${index + 1}段：这是隔离模型实际分批返回的内容，用于核对浮动答复的滚动、历史范围和停止操作。保留当前工作区的可见面积。\n\n`)];
    for (const content of parts) { if (res.destroyed) return; res.write(`data: ${JSON.stringify({ id: 'stream-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\n`); await new Promise(resolve => setTimeout(resolve, 100)); }
    res.end(`data: ${JSON.stringify({ id: 'stream-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`); return;
  }
  if (JSON.stringify(latest).includes('你好') || JSON.stringify(latest).includes('你能联系其他助手吗')) {
    await new Promise(resolve => setTimeout(resolve, JSON.stringify(latest).includes('双入口验收') ? 2500 : 500));
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.write(`data: ${JSON.stringify({ id: 'chat-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: { content: JSON.stringify(latest).includes('你好') ? '你好，我们就在这条对话里继续。' : '可以在这条对话中继续讨论，需要执行时再查看具体进度。' }, finish_reason: 'stop' }] })}\n\n`);
    res.end('data: [DONE]\n\n'); return;
  }
  if (JSON.stringify(latest).includes('浏览器资源桥验收')) {
    const turnStart = input.messages.lastIndexOf(latest);
    const turn = input.messages.slice(turnStart);
    const calls = turn.flatMap(message => message.tool_calls ?? []), last = calls.at(-1)?.function?.name;
    const results = turn.filter(message => message.role === 'tool');
    const text = results.map(message => typeof message.content === 'string' ? message.content : message.content.map(item => item.text ?? '').join('\n')).join('\n');
    const tabId = /"id"\s*:\s*"([a-f0-9-]{36})"/.exec(text)?.[1];
    let name;
    if (!last) name = 'browser_tabs';
    else if (tabId && last === 'browser_tabs') name = 'browser_observe';
    else if (tabId && last === 'browser_observe') name = 'browser_check';
    const content = tabId ? '已经在本次授权内打开并核验资源桥测试页面。' : '未能打开资源桥测试页面。';
    const args = name === 'browser_tabs' ? { operation: 'open', url: `http://127.0.0.1:${model.address().port}/fixture` } : name === 'browser_observe' ? { tabId } : { tabId, condition: { type: 'text', text: '资源桥测试页面' } };
    const delta = name ? { tool_calls: [{ index: 0, id: `browser-${turnStart}-${calls.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } : { content };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [value, reason] of [[delta, null], [{}, name ? 'tool_calls' : 'stop']]) res.write(`data: ${JSON.stringify({ id: 'browser-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    res.end('data: [DONE]\n\n'); return;
  }
  const memoryQuote = '隔离验收：以后周报先列风险';
  if (JSON.stringify(latest).includes(memoryQuote)) {
    const saved = input.messages.slice(input.messages.lastIndexOf(latest) + 1).some(message => message.role === 'tool' && /"saved"\s*:\s*true/.test(message.content));
    const delta = saved ? { content: '已保存周报约定。' } : { tool_calls: [{ index: 0, id: 'memory-ui-' + randomBytes(6).toString('hex'), type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text: '周报先列风险。', title: '周报顺序', topic: '写作', scope: 'private', quote: memoryQuote }),
    } }] };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [value, reason] of [[delta, null], [{}, saved ? 'stop' : 'tool_calls']]) {
      res.write('data: ' + JSON.stringify({ id: 'memory-ui', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] }) + '\n\n');
    }
    res.end('data: [DONE]\n\n'); return;
  }
  const questionCase = ['行内选择验收', '行内其他回答验收', '行内自由回答验收', '行内跳过验收'].find(value => JSON.stringify(latest).includes(value));
  if (questionCase) {
    const resumed = JSON.stringify(latest).includes('用户对'), proposed = input.messages.some(message => (message.tool_calls ?? []).some(call => call.function?.name === 'propose_create' && call.function.arguments.includes('行内选择验收事项')));
    const name = !resumed ? 'ask_user' : questionCase === '行内选择验收' && !proposed ? 'propose_create' : undefined;
    const args = name === 'ask_user' ? { question: questionCase + '：这条工作归到哪个方向？', ...(questionCase === '行内自由回答验收' ? {} : { options: [{ label: '学习', description: '整理课程、学习资料和汇报材料' }, { label: '工作', description: '归到当前工作安排' }] }) } : { title: '行内选择验收事项', categoryId: null, note: '已回答方向：学习', dateAt: '2026-11-26' };
    const delta = name ? { tool_calls: [{ index: 0, id: 'ui-inline-' + randomBytes(6).toString('hex'), type: 'function', function: { name, arguments: JSON.stringify(args) } }] } : { content: questionCase === '行内选择验收' ? '待办建议已准备，请在当前对话确认。' : '已收到你的回答，我们在当前对话继续。' };
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [value, reason] of [[delta, null], [{}, name ? 'tool_calls' : 'stop']]) res.write(`data: ${JSON.stringify({ id: 'inline-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    res.end('data: [DONE]\n\n'); return;
  }
  const artifact = JSON.stringify(latest).includes('交付件验收'), tool = artifact ? 'save_artifact' : 'propose_create';
  const used = input.messages.some(message => message.role === 'tool' && (artifact ? JSON.stringify(message).includes('saved') : JSON.stringify(message).includes('已记录新建建议')));
  const delta = used ? { content: artifact ? '交付件已经保存，可以查看。' : '待办建议已准备，请确认后应用。' } : { tool_calls: [{ index: 0, id: `ui-${tool}`, type: 'function', function: { name: tool, arguments: JSON.stringify(artifact ? { title: '文章整理建议', content: '# 文章整理建议\n\n保留原文思路，按开始、实践和回顾三个部分整理。' } : { title: '界面确认验收', categoryId: null, note: '隔离测试' }) } }] };
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [value, reason] of [[delta, null], [{}, used ? 'stop' : 'tool_calls']]) res.write(`data: ${JSON.stringify({ id: 'ui-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise(resolve => model.listen(0, '127.0.0.1', resolve));
async function check(name, job) { await job(); report.checks.push(name); console.log(`PASS ${name}`); }
async function waitForState(predicate, target = page) { for (let i = 0; i < 150; i++) { if (await target.evaluate(predicate)) return; await new Promise(resolve => setTimeout(resolve, 100)); } assert.fail('Persisted state did not reach the expected value'); }
async function shot(name) { await page.evaluate(() => document.fonts.ready); const win = await app.browserWindow(page); const png = await win.evaluate(async win => (await win.capturePage()).toPNG().toString('base64')); await writeFile(path.join(output, `${name}.png`), Buffer.from(png, 'base64')); report.screenshots.push(`${name}.png`); }
async function openBotDetails(target = page) {
  const sidebar = target.locator('#bot-inspector'), badge = target.locator('.bot-identity-pill');
  if (await badge.getAttribute('aria-expanded') !== 'true') await badge.click();
  await sidebar.getByRole('radio', { name: '详情', exact: true }).click();
  const back = sidebar.getByRole('button', { name: '返回详情', exact: true });
  if (await back.isVisible()) await back.click();
  return sidebar;
}
const activityPanel = () => page.locator('.bot-activity');
async function openActivity() {
  const sidebar = await openBotDetails();
  await sidebar.getByRole('button', { name: '工作与对话', exact: true }).click();
  const activity = activityPanel();
  await activity.getByRole('heading', { name: '工作与对话', exact: true }).waitFor();
  return activity;
}
async function closeActivity() {
  await page.locator('#bot-inspector').getByRole('button', { name: '关闭 Bot 侧栏', exact: true }).click();
  await activityPanel().waitFor({ state: 'hidden' });
}
async function openFloatingActivity() {
  await openActivity();
  await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click();
  await page.getByRole('option', { name: '悬浮', exact: true }).click();
  const pill = page.locator('.bot-floating-pill');
  if (await pill.isVisible()) await pill.click();
  await activityPanel().waitFor();
}
async function openLibrary(target = page) {
  const sidebar = await openBotDetails(target);
  await sidebar.getByRole('radio', { name: '资料库', exact: true }).click();
}
async function openWorkspace() {
  if (await page.locator('#bot-workspace').getAttribute('aria-hidden') !== 'true') return;
  const sidebar = await openBotDetails();
  await sidebar.getByRole('button', { name: '工作台', exact: true }).click();
  await page.locator('#bot-workspace:not([inert])').waitFor();
}
async function appearance(options) { await page.locator('.rail [data-workbench="settings"]').click(); const dialog = page.getByRole('dialog', { name: '设置', exact: true }); await dialog.locator('.settings-sections').getByRole('button', { name: '个性化', exact: true }).click(); for (const [key, label] of Object.entries(options)) { await dialog.locator(`[data-setting-key="${key}"]`).getByRole('radio', { name: new RegExp(`^${label}`) }).locator('..').click(); await dialog.locator('.appearance-save').waitFor({ state: 'hidden' }); } await dialog.getByRole('button', { name: '关闭', exact: true }).click(); }
async function waitDraft(p, value) { for (let i = 0; i < 100; i++) { const text = await p.locator('.bot-compose textarea').inputValue(); if (text === value) return; await new Promise(r => setTimeout(r, 50)); } assert.equal(await p.locator('.bot-compose textarea').inputValue(), value); }
try {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--force-device-scale-factor=1', '--disable-backgrounding-occluded-windows'], cwd: process.cwd(), env, timeout: 45000, chromiumSandbox: true });
  for (let i = 0; i < 200; i++) { page = app.windows().find(p => mainPage(p.url())); if (page) break; await new Promise(r => setTimeout(r, 100)); }
  assert.ok(page, 'main window'); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
  assert.ok((await app.evaluate(({ app }) => app.getPath('userData'))).startsWith(data));
  const win = await app.browserWindow(page); await win.evaluate(win => { win.webContents.setBackgroundThrottling(false); win.setContentSize(1544, 1018); });
  await check('a fresh profile opens the fixed conversation without a mode prompt', async () => {
    await page.locator('#workbench-ai-panel .bot-compose textarea').waitFor();
    assert.equal(await page.locator('.bot-shell').getAttribute('data-assistant-mode'), 'parallel');
    assert.equal(await page.getByRole('dialog', { name: '选择助手展开方式' }).count(), 0);
  });
  if (legacyServer) await check('stale legacy Host is replaced before the new renderer reads a draft', async () => {
    await page.locator('.bot-contact').last().waitFor();
    assert.equal(legacyShutdown, true); assert.deepEqual(legacyCalls, ['hello', 'getHostState', 'shutdown']);
    const draft = await page.evaluate(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return window.workbench.bot.getDraft(bot.mainChatId); });
    assert.equal(draft.surface, 'main'); assert.deepEqual(draft.resources, []); assert.equal(draft.text, '');
    assert.deepEqual(report.errors, []); await shot('legacy-host-upgraded');
  });
  await check('eight contacts and todo is its own workspace', async () => { await page.locator('.bot-contact').last().waitFor(); assert.equal(await page.locator('.bot-contact').count(), 8); await page.locator('[data-workbench="todo"].ritem').click(); await openWorkspace(); await page.locator('#view-todo').waitFor(); });
  await page.clock.setSystemTime(new Date(2026, 10, 16, 14, 11)); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await appearance({ uiTheme: '窗影', navigationStyle: '经典', glassIntensity: '强玻璃' });
  await page.evaluate(() => window.workbench.copy.save({ title: '让 AI 成为日常工作的好搭档', body: '最近，我开始把 AI 放进日常工作里。\n\n先从一件重复的小事开始：把脑中的想法记下来，整理成清晰的结构，再检查表达是否准确、简洁。\n\n比如写文章时，我会先写下零散的想法，再请 AI 帮忙梳理提纲和结构。成稿后，再检查语句，看看有没有更好的表达方式。' }));
  await page.locator('[data-workbench="media"].ritem').click();
  await page.locator('.bot-compose textarea').waitFor();
  await check('draft survives real save and Bot switch', async () => { await page.locator('.bot-compose textarea').fill('整理这篇文章，周五上午提醒我发布。'); await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(b => b.seedKey === 'media'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '整理这篇文章，周五上午提醒我发布。'; }); await page.locator('[data-workbench="home"].ritem').click(); await page.locator('[data-workbench="media"].ritem').click(); await waitDraft(page, '整理这篇文章，周五上午提醒我发布。'); });
  await shot('classic-parallel');
  const aiMenu = page.getByRole('combobox', { name: 'AI 助手', exact: true });
  await aiMenu.click(); assert.equal(await page.getByRole('option', { name: '固定', exact: true }).getAttribute('aria-selected'), 'true'); await shot('topbar-mode-menu-classic');
  await page.keyboard.press('Escape'); assert.equal(await aiMenu.getAttribute('aria-expanded'), 'false'); assert.ok(await aiMenu.evaluate(node => node === document.activeElement));
  assert.equal(await page.locator('.bot-panel .bot-mode-select').count(), 0);
  await check('contact menu opens the selected Bot in the chat sidebar', async () => {
    await page.locator('[data-workbench="todo"].ritem').click({ button: 'right' });
    const menu = page.getByRole('menu');
    assert.equal(await menu.getByRole('menuitem').count(), 1);
    assert.equal(await page.locator('.bot-shell').getAttribute('data-workbench'), 'media');
    await shot('profile-menu'); await menu.getByRole('menuitem', { name: '编辑 Bot' }).click();
    const sidebar = page.locator('#bot-inspector');
    await sidebar.getByLabel('Bot 名称', { exact: true }).fill('小历测试'); await shot('profile-edit');
    assert.equal(await sidebar.getByRole('button', { name: '保存修改', exact: true }).count(), 0);
    await sidebar.getByLabel('Bot 名称', { exact: true }).press('Enter');
    await page.locator('.bot-identity-pill').getByText('小历测试', { exact: true }).waitFor();
    assert.equal(await page.locator('.bot-shell').getAttribute('data-workbench'), 'todo');
    await sidebar.getByRole('button', { name: '关闭 Bot 侧栏' }).click();
  });
  await check('profile schedule rows open focused editors and preserve the chat', async () => {
    const sidebar = await openBotDetails(), panel = await sidebar.boundingBox();
    await sidebar.getByRole('button', { name: '新建定时任务' }).click();
    const create = page.getByRole('dialog', { name: '新建定时任务' });
    await create.getByRole('textbox', { name: '任务名称' }).fill('定时任务验收');
    await create.getByRole('textbox', { name: '工作内容' }).fill('读取今日待办并总结');
    await create.getByRole('radio', { name: '固定间隔' }).click();
    await create.getByRole('button', { name: '创建定时任务' }).click();
    const toggle = sidebar.getByRole('switch', { name: '定时任务验收', exact: true });
    await toggle.click();
    await waitForState(async () => { const b = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'schedule'); return (await window.workbench.bot.listSchedules(b.id)).find(s => s.title === '定时任务验收')?.enabled === false; });
    const row = sidebar.getByRole('button', { name: '定时任务验收的操作' });
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '编辑' }).click();
    const editor = page.getByRole('dialog', { name: '编辑定时任务' });
    assert.equal(await editor.getByRole('textbox', { name: '工作内容' }).inputValue(), '读取今日待办并总结');
    await editor.getByRole('textbox', { name: '工作内容' }).fill('整理今天新增的待办');
    await editor.getByRole('button', { name: '保存修改' }).click();
    await editor.waitFor({ state: 'hidden' });
    assert.equal(await toggle.getAttribute('aria-checked'), 'false');
    await row.click({ button: 'right' });
    await page.getByRole('menuitem', { name: '删除' }).click();
    await page.getByRole('dialog', { name: '删除定时任务' }).getByRole('button', { name: '确认删除' }).click();
    await row.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.bot-shell').getAttribute('data-workbench'), 'todo');
    const bounds = await sidebar.boundingBox(); for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(bounds[key] - panel[key]) <= 1);
    await sidebar.getByRole('button', { name: '关闭 Bot 侧栏' }).click();
    await page.locator('[data-workbench="media"].ritem').click(); await waitDraft(page, '整理这篇文章，周五上午提醒我发布。');
  });
  await check('floating mode opens only a compact composer and retains the same draft', async () => {
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click();
    const pill = await page.locator('.bot-floating-pill').boundingBox(); assert.equal(pill.width, 300); assert.equal(pill.height, 44); assert.ok(Math.abs(pill.x + pill.width / 2 - await page.evaluate(() => innerWidth / 2)) < 1, 'floating pill centers in the whole window'); await shot('floating-pill');
    await page.locator('.bot-floating-pill').click(); await waitDraft(page, '整理这篇文章，周五上午提醒我发布。');
    assert.equal(await page.locator('.bot-reply-surface').isVisible(), false); await page.waitForTimeout(650);
    const compose = await page.locator('.bot-compose').boundingBox(); assert.ok(compose.height < 220, 'compact composer includes model setup guidance'); assert.ok(Math.abs(compose.x + compose.width / 2 - await page.evaluate(() => innerWidth / 2)) < 1, 'floating composer centers in the whole window'); await shot('floating-expanded');
    await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor(); await shot('floating-collapsed');
    await page.locator('.bot-floating-pill').click(); await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: /固定/ }).click();
  });
  await appearance({ navigationStyle: '悬浮' }); await openWorkspace(); await shot('floating-navigation-parallel');
  await aiMenu.click(); await shot('topbar-mode-menu-floating'); await page.keyboard.press('Escape');
  await check('narrow viewport keeps both panels usable', async () => { await win.evaluate(win => win.setContentSize(1024, 680)); await page.waitForTimeout(350); const geometry = await page.evaluate(() => { const a = document.querySelector('.bot-panel').getBoundingClientRect(), w = document.querySelector('.bot-workspace').getBoundingClientRect(), c = document.querySelector('.bot-compose').getBoundingClientRect(); return { overlap: a.right > w.left, width: w.width, top: Math.abs(a.top - w.top), bottom: c.bottom, height: innerHeight }; }); assert.equal(geometry.overlap, false); assert.ok(geometry.width > 420); assert.ok(geometry.top <= 1); assert.ok(geometry.bottom < geometry.height); await shot('narrow-parallel'); });
  await win.evaluate(win => win.setContentSize(1544, 1018));
  await check('workspace and assistant collapse preserve native content and draft', async () => {
    await page.getByRole('button', { name: '收起工作台', exact: true }).click();
    assert.equal(await page.locator('.bot-workspace').getAttribute('aria-hidden'), 'true');
    assert.equal(await page.locator('.bot-panel-header').getByRole('button', { name: '收起助手', exact: true }).count(), 0);
    await page.locator('.bot-identity-pill').waitFor();
    const memorySidebar = await openBotDetails();
    await memorySidebar.getByRole('button', { name: '记忆', exact: true }).click();
    await memorySidebar.getByRole('button', { name: '＋ 添加记忆', exact: true }).click();
    await page.getByRole('textbox', { name: '想记住的内容' }).waitFor();
    assert.equal(await memorySidebar.count(), 0, 'the sidebar is removed when the memory composer opens');
    await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '想记住的内容');
    await page.getByRole('button', { name: '退出添加记忆', exact: true }).click();
    await openWorkspace();
    assert.equal(await page.locator('.bot-panel-header').getByRole('button', { name: '收起助手', exact: true }).count(), 0);
    await aiMenu.click(); await page.getByRole('option', { name: '收起助手', exact: true }).click();
    assert.equal(await page.locator('#workbench-ai-panel, .bot-reopen-pill, .bot-floating-pill').count(), 0);
    await aiMenu.click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    await waitDraft(page, '整理这篇文章，周五上午提醒我发布。');
    await aiMenu.click(); await page.getByRole('option', { name: '收起助手', exact: true }).click(); assert.equal(await page.locator('#workbench-ai-panel, .bot-reopen-pill, .bot-floating-pill').count(), 0); await shot('assistant-hidden');
    await aiMenu.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Home'); await page.keyboard.press('Enter'); await waitDraft(page, '整理这篇文章，周五上午提醒我发布。');
  });
  await check('actual task confirmation and deliverable preview through UI', async () => {
    await page.evaluate(async endpoint => {
      const { ai, bot } = window.workbench;
      const config = await ai.saveProvider({ kind: 'custom', name: '界面验收模型', endpoint, protocol: 'openai-chat', apiKey: 'isolated-fixture-key' });
      const configured = await ai.saveModel({ providerId: config.providers[0].id, name: 'ui-fixture' });
      for (const card of await bot.list()) {
        const { bot: { name, description, avatar, instructions } } = await bot.open(card.id);
        await bot.updateProfile(card.id, card.revision, { name, description, avatar, instructions, modelId: configured.models[0].id });
      }
    }, `http://127.0.0.1:${model.address().port}/v1`);
    const directory = await app.evaluate(({ app }) => app.getPath('userData'));
    const config = JSON.parse(await readFile(path.join(directory, 'ai-config.json'), 'utf8'));
    assert.equal(await app.evaluate(({ safeStorage }, encrypted) => safeStorage.decryptString(Buffer.from(encrypted, 'base64')), config.providers[0].apiKey), 'isolated-fixture-key', 'fresh profile credentials work in Host and main process');
    await check('memory addition uses the Agent, preserves the draft and opens the committed entry', async () => {
      await page.locator('[data-workbench="todo"].ritem').click();
      const editor = page.locator('.bot-compose textarea');
      await editor.fill('记忆验收的普通草稿');
      const dialog = await openBotDetails();
      await dialog.getByRole('button', { name: '记忆', exact: true }).click();
      await dialog.getByRole('button', { name: '＋ 添加记忆', exact: true }).click();
      assert.equal(await page.getByRole('button', { name: '发送记忆请求', exact: true }).isDisabled(), true);
      assert.equal(await editor.inputValue(), '');
      await editor.fill('隔离验收：以后周报先列风险');
      await page.getByRole('button', { name: '发送记忆请求', exact: true }).click();
      const receipt = page.locator('.bot-memory-receipt').filter({ hasText: '已保存当前 Bot 的「周报顺序」' });
      await receipt.getByRole('button', { name: '查看记忆', exact: true }).click();
      assert.equal(await editor.inputValue(), '记忆验收的普通草稿');
      await dialog.locator('.bot-memory-text').filter({ hasText: '周报先列风险。' }).waitFor();
      await dialog.getByRole('button', { name: '编辑', exact: true }).click();
      await dialog.getByRole('textbox', { name: '记忆内容', exact: true }).fill('隔离验收：记忆更新');
      await dialog.getByRole('button', { name: '保存记忆', exact: true }).click();
      await dialog.locator('.bot-memory-text').filter({ hasText: '记忆更新' }).waitFor();
      await shot('memory-save-edit');
      await dialog.getByRole('button', { name: '删除', exact: true }).click();
      await dialog.getByRole('button', { name: '取消', exact: true }).click();
      assert.equal(await dialog.locator('.bot-memory-text').count(), 1);
      await dialog.getByRole('button', { name: '删除', exact: true }).click();
      await dialog.getByRole('button', { name: '确认删除', exact: true }).click();
      await dialog.getByText('还没有保存记忆。可以记录你的习惯或偏好。', { exact: true }).waitFor();
      await dialog.getByRole('button', { name: '关闭 Bot 侧栏', exact: true }).click();
    });
    await page.locator('[data-workbench="todo"].ritem').click(); await page.locator('.bot-compose textarea').fill('界面确认验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    const confirmation = page.locator('.bot-chat-actions').getByRole('button', { name: '确认创建', exact: true });
    await confirmation.waitFor(); assert.equal(await page.locator('.bot-task-card, .bot-task-notice').count(), 0); await shot('chat-pending-confirmation');
    await openWorkspace();
    const workspaceBeforeProgress = await page.locator('#bot-workspace').boundingBox();
    const activity = await openActivity();
    const attention = activity.getByRole('region', { name: '需要关注', exact: true });
    await attention.getByRole('button', { name: /^界面确认验收/ }).waitFor(); await shot('progress-pending-confirmation');
    assert.equal(await page.locator('#bot-workspace').getAttribute('aria-hidden'), null);
    assert.deepEqual(await page.locator('#bot-workspace').boundingBox(), workspaceBeforeProgress);
    await attention.getByRole('button', { name: /^界面确认验收/ }).click(); await activity.getByRole('button', { name: '确认创建', exact: true }).waitFor(); await shot('task-confirmation');
    assert.deepEqual(await page.locator('#bot-workspace').boundingBox(), workspaceBeforeProgress);
    await closeActivity();
    await openFloatingActivity();
    await attention.getByRole('button', { name: /^界面确认验收/ }).click();
    await activity.getByRole('button', { name: '确认创建', exact: true }).waitFor();
    await page.locator('.bot-compose textarea').click();
    await shot('floating-task-approval');
    await closeActivity();
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    await page.locator('.bot-chat-actions').getByRole('button', { name: '确认创建', exact: true }).click();
    await waitForState(async () => (await window.workbench.todo.state()).tasks.some(task => task.title === '界面确认验收'));
    await page.locator('.bot-chat-actions .bot-operation-card').getByText('已创建', { exact: true }).waitFor();
    await page.locator('[data-workbench="media"].ritem').click(); await page.locator('.bot-compose textarea').fill('交付件验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const media = (await window.workbench.bot.list()).find(b => b.seedKey === 'media'); return (await window.workbench.bot.listArtifacts(media.id)).length > 0; });
    await openWorkspace();
    const workspaceBeforeArtifact = await page.locator('#bot-workspace').boundingBox();
    await openLibrary(); await page.locator('.bot-delivery-row').first().waitFor();
    assert.equal(await page.locator('#bot-workspace').getAttribute('aria-hidden'), null);
    assert.deepEqual(await page.locator('#bot-workspace').boundingBox(), workspaceBeforeArtifact);
    await page.locator('.bot-delivery-row > .bot-work-row').first().click(); await page.getByRole('region', { name: '交付件预览' }).waitFor(); await shot('deliverables-preview');
    assert.deepEqual(await page.locator('#bot-workspace').boundingBox(), workspaceBeforeArtifact);
    assert.equal(await page.locator('#bot-workspace .bot-artifact-preview').count(), 0);
    await page.getByRole('button', { name: '返回交付件', exact: true }).click();
  });
  await check('inline choices survive reload and apply once without leaving the main conversation', async () => {
    const win = await app.browserWindow(page); await win.evaluate(win => win.setContentSize(1024, 680));
    await page.locator('[data-workbench="todo"].ritem').click();
    await page.locator('.bot-compose textarea').fill('行内选择验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await page.locator('.bot-question').getByRole('button', { name: '学习', exact: true }).waitFor();
    const question = page.locator('.bot-question');
    const otherAnswer = question.getByRole('textbox', { name: '其他回答', exact: true });
    assert.equal(await otherAnswer.isVisible(), true);
    assert.equal(await otherAnswer.getAttribute('placeholder'), '输入其他回答');
    assert.equal(await question.locator('.bot-question-input').count(), 0);
    assert.equal(await question.locator('.bot-operation-trace code:visible').count(), 0);
    assert.deepEqual(await question.locator('.bot-action-buttons button').allTextContents(), ['跳过', '提交']);
    assert.equal(await question.getByRole('button', { name: '提交回答', exact: true }).isDisabled(), true);
    const compact = await question.evaluate(node => ({
      width: node.clientWidth, scroll: node.scrollWidth, height: node.getBoundingClientRect().height,
      letters: [...node.querySelectorAll('.bot-question-letter')].map(letter => letter.textContent),
      optionGroupWidth: node.querySelector('.bot-question-options').getBoundingClientRect().width,
      options: [...node.querySelectorAll('.bot-question-options > *')].map(row => {
        const { width, height, left, top } = row.getBoundingClientRect();
        const letter = row.firstElementChild.getBoundingClientRect();
        const copy = row.lastElementChild.getBoundingClientRect();
        return { width, height, left, top, inline: copy.left > letter.right };
      }),
      header: getComputedStyle(node.querySelector('.bot-operation-header')).backgroundColor,
      surface: getComputedStyle(node).backgroundColor,
    }));
    assert.deepEqual(compact.letters, ['A', 'B', 'C']);
    assert.ok(compact.scroll <= compact.width && compact.height < 290, JSON.stringify(compact));
    assert.ok(compact.options.every((option, index) => Math.abs(option.width - compact.optionGroupWidth) < 1
      && option.height === compact.options[0].height && option.left === compact.options[0].left && option.inline
      && (!index || option.top > compact.options[index - 1].top + compact.options[index - 1].height)), JSON.stringify(compact));
    assert.notEqual(compact.header, compact.surface);
    assert.match(compact.surface, /^rgba?\(255, 255, 255/);
    const questionButtonSize = await question.locator('.bot-action-buttons button').first().evaluate(button => {
      const style = getComputedStyle(button);
      return [style.height, style.paddingInline, style.borderRadius, style.fontSize];
    });
    assert.equal(await page.locator('.bot-task-detail, .bot-task-notice').count(), 0);
    await page.locator('.bot-compose textarea').fill('这段草稿不要因选择选项而清空'); await waitDraft(page, '这段草稿不要因选择选项而清空');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'schedule'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '这段草稿不要因选择选项而清空'; });
    const original = await page.evaluate(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'schedule'); return (await window.workbench.bot.listTasks(bot.id)).find(task => task.input === '行内选择验收'); });
    await shot('inline-question-narrow');
    await page.locator('.bot-chat-entry.assistant:has(.bot-question)').last().screenshot({ path: path.join(output, 'inline-question-card.png'), animations: 'disabled' }); report.screenshots.push('inline-question-card.png');
    await page.reload();
    const choice = page.locator('.bot-question').getByRole('button', { name: '学习', exact: true }); await choice.waitFor();
    await choice.focus(); await page.keyboard.press('Enter');
    assert.equal(await choice.getAttribute('aria-pressed'), 'true');
    assert.equal(await question.locator('.bot-operation-status').textContent(), '待回答');
    assert.equal(await page.evaluate(async taskId => (await window.workbench.bot.getTask(taskId)).actions.find(action => action.kind === 'question').status, original.id), 'pending');
    const alternate = question.getByRole('button', { name: '工作', exact: true });
    await alternate.click();
    assert.equal(await choice.getAttribute('aria-pressed'), 'false');
    assert.equal(await alternate.getAttribute('aria-pressed'), 'true');
    await choice.click();
    await question.getByRole('button', { name: '提交回答', exact: true }).click();
    await question.locator('.bot-question-answer').getByText('学习', { exact: true }).waitFor();
    assert.equal(await question.locator('.bot-operation-header button[aria-expanded]').count(), 0);
    const confirmationCard = page.locator('.bot-chat-actions .bot-operation-card').filter({ has: page.getByRole('button', { name: '确认创建', exact: true }) });
    const apply = confirmationCard.getByRole('button', { name: '确认创建', exact: true }); await apply.waitFor();
    await confirmationCard.locator('.todo-proposal-after').getByText('2026-11-26', { exact: true }).waitFor();
    assert.equal(await confirmationCard.locator('.bot-operation-copy > strong').textContent(), '新建待办');
    assert.equal(await confirmationCard.locator('.bot-operation-status').textContent(), '待确认');
    assert.equal(await confirmationCard.locator('.bot-operation-header .bot-operation-actions button').count(), 0);
    assert.equal(await confirmationCard.locator('.todo-proposal-target strong').textContent(), '行内选择验收事项');
    assert.deepEqual(await confirmationCard.locator('.todo-proposal-footer button').allTextContents(), ['保留原内容', '确认创建']);
    const confirmationLayout = await confirmationCard.evaluate(node => {
      const footer = node.querySelector('.todo-proposal-footer');
      const buttons = footer.querySelector('.bot-action-buttons');
      return {
        rightAligned: Math.abs(buttons.getBoundingClientRect().right - footer.getBoundingClientRect().right) < 1,
        sizes: [...buttons.querySelectorAll('button')].map(button => {
          const style = getComputedStyle(button);
          return [style.height, style.paddingInline, style.borderRadius, style.fontSize];
        }),
        fields: [...node.querySelectorAll('.todo-proposal-after')].map(field => getComputedStyle(field).backgroundColor),
      };
    });
    assert.equal(confirmationLayout.rightAligned, true);
    assert.deepEqual(confirmationLayout.sizes, [questionButtonSize, questionButtonSize]);
    assert.ok(confirmationLayout.fields.length && confirmationLayout.fields.every(color => /^rgba?\(255, 255, 255/.test(color)));
    assert.equal(await page.locator('.bot-task-detail').count(), 0); await waitDraft(page, '这段草稿不要因选择选项而清空');
    await shot('inline-answer-and-confirm'); await apply.evaluate(node => { node.click(); node.click(); });
    await waitForState(async () => (await window.workbench.todo.state()).tasks.filter(task => task.title === '行内选择验收事项').length === 1);
    const saved = await page.evaluate(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'schedule'); return (await window.workbench.bot.listTasks(bot.id)).filter(task => task.input === '行内选择验收'); });
    assert.equal(saved.length, 1); assert.equal(saved[0].id, original.id); assert.equal(saved[0].chatId, original.chatId);
    const todoReceiptCard = page.locator('.bot-chat-actions').getByRole('region', { name: '行内选择验收事项', exact: true });
    await todoReceiptCard.locator('.bot-operation-status').getByText('已创建', { exact: true }).waitFor();
    assert.equal(await todoReceiptCard.locator('.bot-todo-receipt-target').innerText(), '行内选择验收事项');
    await todoReceiptCard.locator('.bot-todo-receipt').getByText('已创建，完成期限为 2026-11-26。', { exact: true }).waitFor();
    assert.equal(await todoReceiptCard.locator('.bot-operation-header button[aria-expanded]').count(), 0);
    await waitDraft(page, '这段草稿不要因选择选项而清空');
    await page.reload(); await question.locator('.bot-question-answer').getByText('学习', { exact: true }).waitFor();
    await todoReceiptCard.locator('.bot-todo-receipt').getByText('已创建，完成期限为 2026-11-26。', { exact: true }).waitFor();
    assert.equal(await todoReceiptCard.locator('.bot-operation-header button[aria-expanded]').count(), 0);
    assert.equal(await question.locator('.bot-operation-header button[aria-expanded]').count(), 0);
    await shot('inline-receipt-after-reload');
    await win.evaluate(win => win.setContentSize(1544, 1018));
  });
  await check('inline custom answers and skip work in floating and parallel modes', async () => {
    const measureAnswerRow = locator => locator.evaluate(node => {
      const style = getComputedStyle(node);
      const row = node.getBoundingClientRect();
      const form = node.closest('.bot-question-form').getBoundingClientRect();
      return {
        fullWidth: Math.abs(row.width - form.width) < 1 && Math.abs(row.left - form.left) < 1,
        appearance: [Math.round(row.height), style.border, style.borderRadius, style.backgroundColor],
      };
    });
    let optionRow;
    for (const [text, mode] of [['行内其他回答验收', '固定'], ['行内自由回答验收', '悬浮'], ['行内跳过验收', '固定']]) {
      await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: mode, exact: true }).click(); if (await page.locator('.bot-floating-pill').isVisible()) await page.locator('.bot-floating-pill').click();
      await page.locator('.bot-compose textarea').fill(text); await page.getByRole('button', { name: '发送', exact: true }).click();
      const card = page.getByRole('region', { name: text + '：这条工作归到哪个方向？', exact: true }); await card.waitFor();
      await card.getByRole('button', { name: '跳过', exact: true }).waitFor();
      assert.deepEqual(await card.locator('.bot-action-buttons button').allTextContents(), ['跳过', '提交']);
      if (text === '行内其他回答验收') {
        const other = card.getByRole('textbox', { name: '其他回答', exact: true });
        const otherRow = card.locator('.bot-question-other');
        assert.equal(await other.isVisible(), true);
        assert.equal(await other.evaluate(node => {
          const hint = getComputedStyle(node, '::placeholder').color;
          const secondary = node.closest('.bot-question-options').querySelector('small');
          return hint === getComputedStyle(secondary).color && hint !== getComputedStyle(node).color;
        }), true);
        optionRow = await measureAnswerRow(card.getByRole('button', { name: '学习', exact: true }));
        assert.equal(optionRow.fullWidth, true);
        assert.deepEqual(await measureAnswerRow(otherRow), optionRow);
        await otherRow.locator('.bot-question-letter').click();
        assert.equal(await other.evaluate(node => document.activeElement === node), true);
        assert.equal(await card.getByRole('textbox').count(), 1);
        await other.fill('我的其他分类');
        assert.equal(await other.evaluate(node => node.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true }))), false);
        assert.equal(await other.inputValue(), '我的其他分类');
        await shot('inline-other-answer-narrow');
        await other.press('Enter');
        await card.locator('.bot-question-answer').getByText('我的其他分类', { exact: true }).waitFor();
        assert.equal(await card.locator('.bot-operation-header button[aria-expanded]').count(), 0);
      } else if (text === '行内自由回答验收') {
        assert.equal(await card.getByText('你的回答', { exact: true }).count(), 0);
        const answer = card.getByRole('textbox', { name: '回答', exact: true });
        assert.deepEqual(await measureAnswerRow(answer), optionRow);
        await answer.fill('按我自己的方向整理');
        await shot('inline-custom-answer-floating');
        await card.getByRole('button', { name: '提交回答', exact: true }).click();
        await card.locator('.bot-question-answer').getByText('按我自己的方向整理', { exact: true }).waitFor();
        assert.equal(await card.locator('.bot-operation-header button[aria-expanded]').count(), 0);
      } else {
        await card.getByRole('button', { name: '跳过', exact: true }).click();
        await card.locator('.bot-operation-status').getByText('已跳过', { exact: true }).waitFor();
      }
      assert.equal(await page.locator('.bot-task-detail').count(), 0);
    }
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    await page.locator('[data-workbench="media"].ritem').click();
  });
  await check('ordinary records locate the original turn and keep the profile header and list visible', async () => {
    await page.locator('[data-workbench="home"].ritem').click();
    const closeWorkspace = page.getByRole('button', { name: '收起工作台', exact: true });
    if (await closeWorkspace.isVisible()) await closeWorkspace.click();
    await page.waitForFunction(() => document.querySelector('.bot-panel')?.clientWidth > 800);
    const chatId = await page.evaluate(async () => (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator').mainChatId);
    for (const text of ['你好', '你能联系其他助手吗？']) {
      await page.locator('.bot-compose textarea').fill(text); await page.getByRole('button', { name: '发送', exact: true }).click();
      await page.locator('.bot-chat-progress').waitFor(); assert.equal(await page.locator('.bot-task-card').count(), 0);
      await page.locator('.bot-chat-progress').waitFor({ state: 'hidden' });
    }
    assert.equal(await page.locator('.bot-chat-entry.user').count(), 2); assert.equal(await page.locator('.bot-chat-entry.assistant').count(), 2);
    assert.equal(await page.locator('.bot-task-card, .bot-task-notice').count(), 0); await shot('single-main-chat');
    await openBotDetails();
    const hero = page.locator('#bot-inspector .bot-inspector-hero');
    const before = await hero.boundingBox();
    const activity = await openActivity();
    assert.deepEqual(await hero.boundingBox(), before, 'activity keeps the Bot identity and tabs in place');
    await activity.getByRole('radio', { name: '对话', exact: true }).click();
    const conversations = activity.getByRole('region', { name: '普通对话', exact: true });
    await conversations.waitFor();
    assert.equal(await conversations.getByRole('button').count(), 2);
    const greeting = conversations.getByRole('button', { name: /^你好/ });
    await greeting.press('Enter');
    const located = page.locator('.bot-chat-scroll [data-located]');
    await located.getByText('你好', { exact: true }).waitFor();
    assert.equal(await located.evaluate(node => node === document.activeElement), true);
    assert.equal(await greeting.getAttribute('aria-current'), 'location');
    await page.locator('.bot-chat-scroll').getByText('你好，我们就在这条对话里继续。', { exact: true }).waitFor();
    await shot('chat-execution-records');
    await activity.getByRole('button', { name: '返回详情', exact: true }).click();
    await page.locator('#bot-inspector [data-open-activity]:focus').waitFor();
    await page.locator('#bot-inspector').getByRole('button', { name: '关闭 Bot 侧栏', exact: true }).click();
    assert.equal(await page.evaluate(async () => (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator').mainChatId), chatId);
    assert.equal(await page.locator('.bot-compose textarea').count(), 1); assert.equal(await page.locator('.bot-reply-target').count(), 0);
  });
  await check('failed chat keeps an actionable notice without a second conversation', async () => {
    await page.locator('.bot-compose textarea').fill('请求失败验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    const failure = page.locator('.bot-operation-card[data-outcome="failed"]').last(); await failure.waitFor();
    assert.equal(await failure.locator('.bot-operation-actions').textContent(), '执行失败');
    assert.equal(await failure.locator('.bot-operation-details').isVisible(), false);
    assert.equal(await page.locator('.bot-task-card').count(), 0); await shot('chat-failure-notice');
    await failure.getByRole('button', { name: '查看 处理请求', exact: true }).click();
    await failure.locator('.bot-action-buttons').getByRole('button', { name: '查看工作详情', exact: true }).click();
    await activityPanel().getByRole('button', { name: '继续任务', exact: true }).waitFor();
    await shot('progress-failed-chat-visible');
    await closeActivity();
    await page.locator('.bot-compose textarea').waitFor(); await page.locator('[data-workbench="media"].ritem').click();
  });
  await check('activity keeps delivered work and leaves the composer usable in floating and minimum-width panels', async () => {
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'media'); return (await window.workbench.bot.listTasks(bot.id)).some(task => task.input === '交付件验收' && task.status === 'completed'); });
    const activity = await openActivity();
    const ended = activity.getByRole('region', { name: '已结束', exact: true });
    await ended.getByRole('button', { name: /^交付件验收/ }).waitFor(); await shot('progress-ended-work');
    await closeActivity();
    await openFloatingActivity();
    await ended.getByRole('button', { name: /^交付件验收/ }).waitFor(); await shot('progress-floating');
    const input = page.locator('.bot-compose textarea');
    await input.click();
    await closeActivity();
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    const win = await app.browserWindow(page); await win.evaluate(win => win.setContentSize(1024, 680));
    await openWorkspace();
    const separator = page.getByRole('separator', { name: '调整对话宽度', exact: true }); await separator.focus(); for (let i = 0; i < 12; i++) await separator.press('ArrowLeft');
    assert.equal(await separator.getAttribute('aria-valuenow'), '340');
    await openActivity();
    await input.click();
    const records = await page.locator('#bot-inspector').boundingBox(), editor = await input.boundingBox();
    assert.ok(records.y + records.height <= editor.y, 'activity overlay ends above the composer');
    await shot('progress-minimum-width');
    await ended.getByRole('button', { name: /^交付件验收/ }).click();
    await activity.waitFor({ state: 'hidden' });
    await page.locator('.bot-chat-scroll [data-located]').waitFor();
    await win.evaluate(win => win.setContentSize(1544, 1018));
    await page.waitForFunction(() => window.innerWidth === 1544 && window.innerHeight === 1018);
    await page.evaluate(() => Promise.all(
      Array.from(document.querySelectorAll('.rail, #bot-workspace')).flatMap(node => node.getAnimations())
        .map(animation => animation.finished.catch(() => {})),
    ));
  });
  await check('appearance, reduced motion and keyboard profile preserve workspace geometry', async () => {
    const before = await page.locator('.bot-workspace').boundingBox();
    await page.emulateMedia({ reducedMotion: 'reduce' }); await appearance({ navigationStyle: '经典', glassIntensity: '纯色', uiTheme: '青瓷' });
    const after = await page.locator('.bot-workspace').boundingBox();
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) <= 1, `workspace ${key} changed from ${before[key]} to ${after[key]}`);
    assert.equal(await page.locator('.bot-panel').evaluate(node => getComputedStyle(node).backdropFilter), 'none');
    await page.locator('[aria-controls="workbench-navigation"]').click();
    const profileContact = page.locator('[data-workbench="media"].ritem'); await profileContact.focus(); await page.keyboard.press('Shift+F10'); await page.getByRole('menuitem', { name: '编辑 Bot', exact: true }).waitFor(); await page.keyboard.press('Escape');
    assert.equal(await profileContact.evaluate(node => node === document.activeElement), true); await page.locator('[aria-controls="workbench-navigation"]').click();
    assert.equal(await page.locator('#workbench-ai-panel').count(), 1, 'profile close leaves one assistant panel');
    await appearance({ uiTheme: '窗影', glassIntensity: '强玻璃' }); await shot('keyboard-and-appearance');
  });
  await check('reload restores the selected Bot and persisted unsent draft', async () => {
    await openActivity();
    await closeActivity(); await page.locator('.bot-compose textarea').fill('重启后保留的草稿');
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'media'); return (await window.workbench.bot.getDraft(card.mainChatId)).text === '重启后保留的草稿'; });
    await page.reload(); await page.locator('.bot-contact').last().waitFor(); assert.equal(await page.locator('.bot-shell').getAttribute('data-workbench'), 'media'); await waitDraft(page, '重启后保留的草稿');
  });
  await check('main and island keep independent drafts while sharing messages and one serial task queue', async () => {
    await page.locator('[data-workbench="home"].ritem').click(); await page.locator('.bot-compose textarea').fill('主窗口独立草稿');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '主窗口独立草稿'; });
    await page.evaluate(() => window.workbench.island.assistant('show'));
    let island;
    for (let i = 0; i < 150; i++) { island = app.windows().find(p => p.url().includes('window=island-assistant')); if (island) break; await new Promise(r => setTimeout(r, 100)); }
    assert.ok(island); island.setDefaultTimeout(15000); island.on('pageerror', error => report.errors.push(error.message));
    await island.getByRole('heading', { name: 'Ono · 总 Bot' }).waitFor(); await waitDraft(island, '');
    await island.locator('.bot-compose textarea').fill('灵动岛独立草稿');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '灵动岛独立草稿'; }, island);
    await waitDraft(page, '主窗口独立草稿');
    for (const entry of [page, island]) { assert.equal(await entry.locator('.bot-compose textarea').getAttribute('readonly'), null); assert.equal(await entry.getByRole('button', { name: '在此继续输入', exact: true }).count(), 0); }
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click(); if (await page.locator('.bot-floating-pill').isVisible()) await page.locator('.bot-floating-pill').click();
    await waitDraft(page, '主窗口独立草稿'); await waitDraft(island, '灵动岛独立草稿');
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '固定', exact: true }).click();
    await shot('main-independent-draft'); await island.screenshot({ path: path.join(output, 'island-independent-draft.png') }); report.screenshots.push('island-independent-draft.png');
    await island.reload(); await waitDraft(island, '灵动岛独立草稿'); await waitDraft(page, '主窗口独立草稿');
    await island.locator('.bot-compose textarea').fill('你好，双入口验收：灵动岛请求'); await island.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.listTasks(bot.id)).some(task => task.input === '你好，双入口验收：灵动岛请求' && task.status === 'running'); });
    await waitDraft(page, '主窗口独立草稿'); await waitDraft(island, '');
    await page.locator('.bot-compose textarea').fill('你好，双入口验收：主窗口请求'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'), tasks = await window.workbench.bot.listTasks(bot.id); return tasks.find(task => task.input === '你好，双入口验收：灵动岛请求')?.status === 'running' && tasks.find(task => task.input === '你好，双入口验收：主窗口请求')?.status === 'queued'; });
    await shot('shared-task-queue');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'), tasks = (await window.workbench.bot.listTasks(bot.id)).filter(task => task.input.includes('双入口验收')); return tasks.length === 2 && tasks.every(task => task.status === 'completed'); });
    for (const entry of [page, island]) for (const text of ['你好，双入口验收：灵动岛请求', '你好，双入口验收：主窗口请求']) { await entry.locator('.bot-chat-entry.user').filter({ hasText: text }).waitFor(); assert.equal(await entry.locator('.bot-chat-entry.user').filter({ hasText: text }).count(), 1); }
    assert.equal(await page.locator('.bot-chat-entry.assistant').count(), await island.locator('.bot-chat-entry.assistant').count());
    await shot('shared-conversation'); await island.getByRole('button', { name: '关闭总 Bot 小窗' }).click();
  });
  await check('inline browser site approval scrolls with the reply and resumes after a decision', async () => {
    await page.locator('[data-workbench="web"].ritem').click();
    await openWorkspace();
    const chat = page.getByRole('region', { name: '对话内容', exact: true });
    const composer = page.locator('.bot-compose textarea');
    const send = page.getByRole('button', { name: '发送', exact: true });
    const siteCard = chat.getByRole('region', { name: '站点授权', exact: true });
    const approval = siteCard.filter({ hasText: '待授权' });
    const approved = siteCard.filter({ hasText: '已授权' });
    const jump = page.getByRole('button', { name: '回到底部', exact: true });
    await win.evaluate(win => win.setContentSize(1024, 680));
    await composer.fill('你好，会话滚动验收\n' + '上一轮对话内容，用于验证滚动。\n'.repeat(24));
    await send.click();
    await chat.getByText('你好，我们就在这条对话里继续。', { exact: true }).waitFor();
    await waitForState(async () => (await window.workbench.browserAutomation.state('default')).tasks.some(task =>
      task.goal.startsWith('你好，会话滚动验收') && task.status === 'unverified' && !task.steps.length));
    assert.equal(await chat.getByRole('region', { name: '网页操作', exact: true }).count(), 0);
    const requestsBeforeApproval = fixtureRequests;
    await composer.fill('浏览器资源桥验收（拒绝）');
    await send.click();
    await approval.waitFor();
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'web'); return (await window.workbench.bot.listTasks(card.id))[0]?.status === 'waiting_user'; });
    assert.equal(await chat.locator('.bot-chat-entry.assistant').getByRole('region', { name: '站点授权', exact: true }).count(), 1);
    const waitingNotice = '.bot-task-notice[data-status="waiting_user"]';
    assert.equal(await page.locator(`.bot-chat-attention, .ai-site-approval-receipt, ${waitingNotice}`).count(), 0);
    const noticeObserver = await chat.evaluateHandle((node, selector) => {
      const probe = { appeared: false, observer: new MutationObserver(() => {
        probe.appeared ||= node.querySelector(selector) !== null;
      }) };
      probe.observer.observe(node, { childList: true, subtree: true });
      return probe;
    }, waitingNotice);
    assert.match(await approval.textContent(), /仅本次任务/);
    await chat.hover();
    await page.mouse.wheel(0, -2400);
    await jump.waitFor();
    assert.equal(await chat.evaluate(node => node.scrollTop), 0);
    await jump.click();
    await jump.waitFor({ state: 'hidden' });
    await shot('browser-site-approval-1024');
    await approval.getByRole('button', { name: '不允许', exact: true }).click();
    await approval.waitFor({ state: 'detached' });
    await siteCard.filter({ hasText: '已拒绝' }).waitFor();
    assert.equal(await approved.count(), 0);
    await waitForState(async () => (await window.workbench.browserAutomation.state('default')).tasks.some(task => task.siteApprovals?.some(item => item.status === 'denied')));
    await waitForState(async () => {
      const bot = (await window.workbench.bot.list()).find(card => card.seedKey === 'web');
      const task = (await window.workbench.bot.listTasks(bot.id)).find(item => item.input === '浏览器资源桥验收（拒绝）');
      return ['cancelled', 'failed', 'completed'].includes(task?.status);
    });
    assert.equal(await page.locator('.ai-site-approval-receipt').count(), 0);

    assert.equal(fixtureRequests, requestsBeforeApproval);
    await win.evaluate(win => win.setContentSize(1544, 1018));
    await composer.fill('浏览器资源桥验收');
    await send.click();
    await approval.waitFor();
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'web'); return (await window.workbench.bot.listTasks(card.id))[0]?.status === 'waiting_user'; });
    assert.equal((await page.evaluate(() => window.workbench.bot.getHostState())).activeTasks, 0);
    await shot('browser-site-approval');
    await approval.getByRole('button', { name: '允许并继续', exact: true }).click();
    await approval.waitFor({ state: 'detached' });
    await approved.waitFor();
    assert.match(await approved.locator('.bot-operation-header').textContent(), /站点授权.*已授权$/);
    assert.equal(await approved.getByRole('button', { name: '允许并继续', exact: true }).count(), 0);
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'web'); return (await window.workbench.bot.listTasks(card.id))[0]?.status === 'completed'; });
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.ok(state.tasks.some(task => task.status === 'completed' && task.verification?.items.every(item => item.status === 'passed') && task.siteApprovals?.some(item => item.status === 'allowed')));
    assert.equal(await page.locator('.ai-site-approval-receipt').count(), 0);
    assert.ok(fixtureRequests > requestsBeforeApproval);
    await chat.getByText('已经在本次授权内打开并核验资源桥测试页面。', { exact: true }).waitFor();
    assert.equal(await approved.count(), 1);
    const noticeAppeared = await noticeObserver.evaluate(probe => {
      probe.observer.disconnect();
      return probe.appeared;
    });
    await noticeObserver.dispose();
    assert.equal(noticeAppeared, false, 'the duplicate wait notice must stay hidden through both decisions');
    const browserResult = chat.getByRole('region', { name: '网页操作', exact: true }).filter({ hasText: '已完成' });
    await browserResult.getByText('已查看网页，找到「资源桥测试页面」。', { exact: true }).waitFor();
    assert.doesNotMatch(await browserResult.textContent(), /查看回执|查看网页操作记录|browser_observe|对象 ·/);
    assert.equal(await approved.getByText('操作记录', { exact: true }).count(), 0);
    await browserResult.screenshot({ path: path.join(output, 'browser-action-summary.png'), animations: 'disabled' });
    report.screenshots.push('browser-action-summary.png');
    await shot('browser-verified');
    const activity = await openActivity();
    const backToList = activity.getByRole('button', { name: '返回列表', exact: true });
    if (await backToList.isVisible()) await backToList.click();
    await activity.getByRole('button', { name: '查看工作详情：浏览器资源桥验收', exact: true }).click();
    const browserHistory = activity.locator('.bot-work-history .bot-operation-card').filter({ hasText: '网页操作' });
    await browserHistory.getByRole('button', { name: '查看 网页操作', exact: true }).click();
    const recordButton = browserHistory.getByRole('button', { name: '查看网页操作记录', exact: true });
    await recordButton.waitFor();
    await recordButton.click();
    const record = page.getByRole('dialog', { name: '浏览器操作记录', exact: true });
    await record.getByRole('radio', { name: '操作过程', exact: true }).click();
    await record.getByRole('region', { name: '站点授权记录', exact: true }).getByText(/已允许/).waitFor();
    await record.getByRole('button', { name: '关闭', exact: true }).click();
    await record.waitFor({ state: 'hidden' });
    await closeActivity();
  });
  await check('island deliverable opens that artifact in the coordinator workspace', async () => {
    await page.locator('[data-workbench="home"].ritem').click(); await page.locator('.bot-compose textarea').fill('交付件验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.listArtifacts(card.id)).length === 1; });
    await page.locator('[data-workbench="media"].ritem').click();
    await page.evaluate(() => window.workbench.island.assistant('show'));
    const island = app.windows().find(p => p.url().includes('window=island-assistant')); assert.ok(island);
    await openLibrary(island); await island.locator('.bot-delivery-row > .bot-work-row').first().click();
    await page.getByRole('region', { name: '交付件预览' }).waitFor(); assert.equal(await page.locator('.bot-shell').getAttribute('data-workbench'), 'home');
    assert.equal(await page.getByRole('region', { name: '交付件预览' }).getByRole('heading', { level: 3 }).textContent(), '文章整理建议');
    await island.getByRole('button', { name: '关闭总 Bot 小窗' }).click();
    await openActivity();
    assert.ok(await page.locator('#bot-workspace .bot-artifact-preview').isVisible());
    await closeActivity(); await openLibrary();
    assert.ok(await page.locator('#bot-workspace .bot-artifact-preview').isVisible());
    await page.locator('#bot-inspector').getByRole('button', { name: '关闭 Bot 侧栏' }).click();
  });
  await check('full UI and Host restart retain both drafts, encrypted credentials and execution', async () => {
    await page.locator('[data-workbench="home"].ritem').click(); await page.locator('.bot-compose textarea').fill('完整重启主窗口草稿');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '完整重启主窗口草稿'; });
    await page.evaluate(() => window.workbench.island.assistant('show'));
    const islandBefore = app.windows().find(p => p.url().includes('window=island-assistant')); assert.ok(islandBefore);
    await islandBefore.locator('.bot-compose textarea').fill('完整重启灵动岛草稿');
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.getDraft(bot.mainChatId)).text === '完整重启灵动岛草稿'; }, islandBefore);
    await islandBefore.getByRole('button', { name: '关闭总 Bot 小窗' }).click();
    await app.close(); app = undefined;
    app = await electron.launch({ executablePath: require('electron'), args: ['.', '--force-device-scale-factor=1', '--disable-backgrounding-occluded-windows'], cwd: process.cwd(), env, timeout: 45000, chromiumSandbox: true });
    page = undefined;
    for (let i = 0; i < 200; i++) { page = app.windows().find(p => mainPage(p.url())); if (page) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(page); page.setDefaultTimeout(15000); page.on('pageerror', error => report.errors.push(error.message));
    await (await app.browserWindow(page)).evaluate(win => win.webContents.setBackgroundThrottling(false));
    await page.locator('.bot-contact').last().waitFor(); await waitDraft(page, '完整重启主窗口草稿');
    await page.evaluate(() => window.workbench.island.assistant('show'));
    let islandAfter;
    for (let i = 0; i < 150; i++) { islandAfter = app.windows().find(p => p.url().includes('window=island-assistant')); if (islandAfter) break; await new Promise(resolve => setTimeout(resolve, 100)); }
    assert.ok(islandAfter); islandAfter.setDefaultTimeout(15000); islandAfter.on('pageerror', error => report.errors.push(error.message));
    await waitDraft(islandAfter, '完整重启灵动岛草稿'); await waitDraft(page, '完整重启主窗口草稿');
    await islandAfter.getByRole('button', { name: '关闭总 Bot 小窗' }).click();
    await page.locator('[data-workbench="todo"].ritem').click(); await page.locator('.bot-compose textarea').fill('完整重启连接验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const card = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'schedule'); const task = (await window.workbench.bot.listTasks(card.id)).find(task => task.title === '完整重启连接验收'); return task && ['completed', 'waiting_user'].includes(task.status); });
  });
  await check('floating opening lens, compact real streaming, recovery and reduced motion', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('[data-workbench="home"].ritem').click();
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click();
    if (!(await page.locator('.bot-floating-pill').isVisible())) { await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor(); }
    await page.locator('.bot-floating-pill').click();
    const effect = page.locator('.bot-opening-effect[data-renderer="window-lens"]'); await effect.waitFor({ timeout: 5000 });
    const geometry = await effect.evaluate(node => ({ rect: node.getBoundingClientRect().toJSON(), topbar: document.querySelector('.topbar').getBoundingClientRect().bottom, pointerEvents: getComputedStyle(node).pointerEvents }));
    assert.ok(geometry.rect.top > geometry.topbar); assert.equal(geometry.pointerEvents, 'none'); report.floatingOpening = geometry;
    await page.screenshot({ path: path.join(output, 'floating-opening-wave.png'), animations: 'allow' }); report.screenshots.push('floating-opening-wave.png');
    await page.locator('.bot-opening-effect').waitFor({ state: 'detached' }); await page.waitForTimeout(200); assert.ok((await page.locator('.bot-compose').boundingBox()).height <= 130);
    await page.locator('.bot-compose textarea').fill('浮动流式验收'); await page.getByRole('button', { name: '发送', exact: true }).click();
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.open(bot.id)).chat.entries.some(entry => entry.streaming && entry.content.length > 400); });
    assert.equal(await page.locator('.bot-chat-entry.user').count(), 1);
    assert.equal(await page.locator('.bot-floating-question').textContent(), '浮动流式验收');
    await page.locator('.bot-chat-entry.user > div > time').waitFor();
    assert.equal(await page.locator('.bot-chat-entry.assistant').count(), 1);
    assert.ok((await page.locator('.bot-reply-surface').boundingBox()).height <= 241); await shot('floating-real-stream');
    await page.locator('.bot-chat-scroll').evaluate(node => { node.scrollTop = 0; }); await page.waitForTimeout(220);
    assert.equal(await page.locator('.bot-chat-scroll').evaluate(node => node.scrollTop), 0); await page.getByRole('button', { name: '回到底部', exact: true }).waitFor();
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.listTasks(bot.id)).find(task => task.input === '浮动流式验收')?.status === 'completed'; });
    await page.getByRole('button', { name: '收起对话', exact: true }).click(); await page.getByRole('button', { name: '展开对话', exact: true }).click(); await page.locator('.bot-chat-entry.assistant').getByText('当前这一轮的答复', { exact: true }).waitFor();
    await page.locator('.bot-compose textarea').fill('浮动停止验收'); await page.getByRole('button', { name: '发送', exact: true }).click(); await page.getByRole('button', { name: '停止回复', exact: true }).waitFor(); await page.waitForTimeout(300);
    await page.getByRole('button', { name: '停止回复', exact: true }).click();
    await waitForState(async () => { const bot = (await window.workbench.bot.list()).find(bot => bot.seedKey === 'coordinator'); return (await window.workbench.bot.listTasks(bot.id)).find(task => task.input === '浮动停止验收')?.status === 'cancelled'; });
    const stopped = page.locator('.bot-reply-surface .bot-operation-card[data-outcome="stopped"]'); await stopped.waitFor();
    assert.equal(await stopped.locator('.bot-operation-actions').textContent(), '已停止');
    assert.equal(await stopped.locator('.bot-operation-details').isVisible(), false);
    await page.locator('.bot-compose textarea').fill('浮动未发送草稿'); await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor();
    await page.locator('.bot-floating-pill').click(); await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '收起助手', exact: true }).click();
    await page.waitForTimeout(1300); assert.equal(await page.locator('.bot-opening-effect').count(), 0); assert.equal(await page.locator('.bot-floating-pill').count(), 0);
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click();
    if (await page.locator('.bot-floating-pill').isVisible()) await page.locator('.bot-floating-pill').click(); await waitDraft(page, '浮动未发送草稿');
    await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor(); await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('.bot-floating-pill').click(); await waitDraft(page, '浮动未发送草稿'); assert.equal(await page.locator('.bot-opening-effect').count(), 0);
    await page.locator('.bot-glint').waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.bot-glint').evaluate(node => node.getAnimations().length), 0);
    await page.locator('.bot-compose textarea').fill('你好，紧凑浮动短答复'); await page.getByRole('button', { name: '发送', exact: true }).click(); await page.getByText('你好，我们就在这条对话里继续。', { exact: true }).waitFor();
    const win = await app.browserWindow(page); await win.evaluate(win => win.setContentSize(1024, 680)); await page.waitForTimeout(350);
    assert.equal(await page.locator('.bot-chat-entry.assistant').count(), 1);
    const hasOutstanding = await page.locator('.bot-task-notice, .bot-chat-actions').count() > 0, attention = await page.locator('.bot-reply-surface').getAttribute('data-attention') === 'true';
    assert.ok((await page.locator('.bot-reply-surface').boundingBox()).height <= (attention ? 391 : hasOutstanding ? 241 : 170)); await shot(hasOutstanding ? 'floating-attention-1024' : 'floating-compact-1024');
    await page.getByRole('button', { name: '固定对话面板', exact: true }).click();
    assert.equal(await page.locator('.bot-floating').count(), 0); assert.ok(await page.locator('.bot-chat-entry.user').count() > 2); await win.evaluate(win => win.setContentSize(1544, 1018));
  });
  await check('floating wave preserves a native browser and falls back without WebGL', async () => {
    await page.emulateMedia({ reducedMotion: 'no-preference' }); await page.locator('[data-workbench="web"].ritem').click(); await openWorkspace(); await page.locator('webview').first().waitFor();
    await page.evaluate(() => { window.__floatingGuest = document.querySelector('webview'); });
    await page.getByRole('combobox', { name: 'AI 助手', exact: true }).click(); await page.getByRole('option', { name: '悬浮', exact: true }).click();
    if (!(await page.locator('.bot-floating-pill').isVisible())) { await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor(); }
    await page.locator('.bot-floating-pill').click(); await page.locator('.bot-opening-effect[data-renderer="window-lens"]').waitFor();
    await page.screenshot({ path: path.join(output, 'floating-browser-wave.png'), animations: 'allow' }); report.screenshots.push('floating-browser-wave.png');
    await page.locator('.bot-opening-effect').waitFor({ state: 'detached' }); assert.ok(await page.evaluate(() => document.querySelector('webview') === window.__floatingGuest));
    await page.getByRole('button', { name: '收起输入框', exact: true }).click(); await page.locator('.bot-floating-pill').waitFor();
    await page.evaluate(() => { window.__botCanvasContext = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function(kind, ...options) { return kind === 'webgl2' ? null : window.__botCanvasContext.call(this, kind, ...options); }; });
    try { await page.locator('.bot-floating-pill').click(); await page.locator('.bot-opening-effect[data-renderer="color-halo"]').waitFor(); assert.ok(await page.locator('.bot-opening-effect canvas').evaluate(node => !!node.getContext('2d'))); await page.locator('.bot-opening-effect').waitFor({ state: 'detached' }); }
    finally { await page.evaluate(() => { HTMLCanvasElement.prototype.getContext = window.__botCanvasContext; delete window.__botCanvasContext; }); }
    assert.ok(await page.locator('.bot-compose textarea').isVisible());
  });
  await check('only the main window can request the temporary opening frame', async () => {
    await page.evaluate(() => window.workbench.island.assistant('show')); let island;
    for (let i = 0; i < 100; i++) { island = app.windows().find(p => p.url().includes('window=island-assistant')); if (island) break; await page.waitForTimeout(50); }
    assert.ok(island); await island.locator('.bot-compose textarea').waitFor();
    assert.equal(await island.evaluate(async () => { try { await window.workbench.captureAssistantBackdrop(); return false; } catch { return true; } }), true);
    await island.getByRole('button', { name: '关闭总 Bot 小窗' }).click();
  });
  assert.deepEqual(report.errors, []); report.passed = true;
} catch (error) { report.errors.push(error.stack || error.message); if (page) await shot('failure').catch(() => {}); throw error; }
finally { if (app) await app.close(); for (const socket of legacySockets) socket.destroy(); if (legacyServer?.listening) legacyServer.close(); model.closeAllConnections(); await new Promise(resolve => model.close(resolve)); await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); }
