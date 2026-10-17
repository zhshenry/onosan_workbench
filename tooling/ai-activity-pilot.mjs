// Real Electron/IPC/browser tools, with an isolated profile and a controlled local model stream.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const output = path.resolve('test-results', `ai-activity-${Date.now()}`);
await mkdir(output, { recursive: true });
const modelRequests = [], errors = [], consoleMessages = [], checks = [], layouts = [];
let application, page, heldPage;
const server = createServer(async (request, response) => {
  if (request.url === '/v1/chat/completions') {
    let raw = ''; for await (const chunk of request) raw += chunk;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' }); response.flushHeaders();
    modelRequests.push({ body: JSON.parse(raw), response });
  } else if (request.url === '/activities') heldPage = response;
  else { response.writeHead(404); response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const chunk = (response, delta, finish_reason = null) => response.write(`data: ${JSON.stringify({ id: 'activity-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
const finish = (response, reason) => { chunk(response, {}, reason); response.end('data: [DONE]\n\n'); };
async function eventually(condition) {
  const deadline = Date.now() + 20000;
  while (!condition()) { if (Date.now() > deadline) throw new Error('Local activity fixture timed out'); await new Promise(resolve => setTimeout(resolve, 20)); }
}
async function check(name, action) { await action(); checks.push(name); console.log(`ACTIVITY_PASS ${name}`); }
const row = () => page.locator('#workbench-ai-panel .ai-run-status');
async function geometry() {
  return page.locator('#workbench-ai-panel').evaluate(panel => {
    const status = panel.querySelector('.ai-run-status'), composer = panel.querySelector('.ai-compose-input'), messages = panel.querySelector('.ai-messages');
    const r = status.getBoundingClientRect(), c = composer.getBoundingClientRect(), m = messages.getBoundingClientRect(), detail = status.querySelector('span');
    return { phase: status.dataset.phase, status: { x: r.x, y: r.y, width: r.width, height: r.height }, composer: { x: c.x, y: c.y, width: c.width, height: c.height }, messages: { x: m.x, width: m.width },
      detailHeight: detail.getBoundingClientRect().height, overflow: status.scrollWidth > status.clientWidth, role: status.getAttribute('role'), insideMessages: !!status.closest('.ai-messages') };
  });
}
async function screenshot(name) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const window = await application.browserWindow(page);
  await writeFile(path.join(output, name), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
  await page.locator('#workbench-ai-panel').screenshot({ path: path.join(output, name.replace('.png', '-panel.png')) });
  if (await row().count()) await row().screenshot({ path: path.join(output, name.replace('.png', '-status.png')) });
}
try {
  const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: path.join(output, 'data'), WORKBENCH_ISOLATED: '1' };
  for (const name of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[name];
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: process.cwd(), env, timeout: 45000, chromiumSandbox: true });
  page = await application.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error' || message.type() === 'warning') consoleMessages.push({ type: message.type(), text: message.text() }); });
  await page.locator('#view-home').waitFor();
  assert.match(page.url(), /\/dist\/index\.html/); assert.equal(await page.title(), '个人工作台');
  assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay').count(), 0);
  const window = await application.browserWindow(page);
  await window.evaluate(window => window.setContentSize(1280, 820));
  await page.evaluate(async base => {
    let config = await window.workbench.ai.saveProvider({ kind: 'custom', name: '本机状态验收', endpoint: `${base}/v1`, protocol: 'openai-chat', apiKey: 'synthetic-only' });
    config = await window.workbench.ai.saveModel({ providerId: config.providers[0].id, name: 'fixture' });
    await window.workbench.ai.activateModel(config.models[0].id); await window.workbench.ai.setEnabled(true);
  }, base);
  await page.reload(); await page.locator('#view-home').waitFor();
  await page.getByRole('button', { name: '网页工作台', exact: true }).click(); await page.locator('#view-browser').waitFor();
  if (await page.locator('#workbench-ai-panel').getAttribute('aria-hidden') !== 'false') await page.locator('.ai-topbar-btn').click();
  const input = page.getByRole('textbox', { name: '发送给当前对话的 AI 助手', exact: true });
  await input.fill('打开本机合成活动页面，告诉我已经打开。'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await eventually(() => modelRequests.length === 1);
  await row().filter({ hasText: '等待模型' }).waitFor();
  await page.evaluate(() => { window.__activityRow = document.querySelector('.ai-run-status'); });
  const initial = await geometry();
  await check('A live request mounts one 44px row outside the message scroller', async () => {
    assert.equal(initial.status.height, 44); assert.equal(initial.insideMessages, false); assert.equal(initial.role, 'status'); assert.equal(await page.locator('.ai-messages .ai-typing').count(), 0);
  });
  const first = modelRequests[0].response;
  const preamble = '我先打开合成活动页面。\n\n' + '这是用于检查滚动位置的本机合成段落。\n\n'.repeat(30);
  chunk(first, { role: 'assistant', content: preamble });
  await row().filter({ hasText: '整理回复' }).waitFor();
  chunk(first, { tool_calls: [{ index: 0, id: 'open-fixture', type: 'function', function: { name: 'browser_tabs', arguments: JSON.stringify({ operation: 'open', url: `${base}/activities` }) } }] }); finish(first, 'tool_calls');
  await row().filter({ hasText: '等待授权' }).waitFor();
  await check('A real site-approval card appears without moving the status row or composer', async () => {
    const current = await geometry(); assert.deepEqual(current.status, initial.status); assert.deepEqual(current.composer, initial.composer);
    await page.locator('.ai-site-approval').getByRole('button', { name: '允许并继续', exact: true }).click();
  });
  await eventually(() => !!heldPage); await row().filter({ hasText: '操作网页' }).waitFor();
  await page.locator('.ai-site-approval').waitFor({ state: 'detached' });
  await check('Real browser navigation replaces the label without replacing or moving the row', async () => {
    assert.equal(await page.evaluate(() => window.__activityRow === document.querySelector('.ai-run-status')), true);
    const current = await geometry(); assert.deepEqual(current.status, initial.status); assert.deepEqual(current.composer, initial.composer);
  });
  await check('Three themes and supported window sizes retain stable single-line geometry', async () => {
    for (const theme of ['mist', 'cool', 'warm']) for (const [width, height] of [[1280, 820], [1024, 680]]) {
      await window.evaluate((window, size) => window.setContentSize(size.width, size.height), { width, height });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.waitForFunction(size => Math.abs(innerWidth - size.width) <= 2 && Math.abs(innerHeight - size.height) <= 2, { width, height });
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const layout = await geometry(); layouts.push({ theme, width, height, viewport, ...layout });
      assert.equal(layout.phase, 'tool');
      assert.equal(layout.status.height, 44); assert.equal(layout.overflow, false); assert.ok(layout.detailHeight < 25);
      assert.ok(layout.composer.y + layout.composer.height < height); assert.ok(layout.status.y >= 0);
      await screenshot(`activity-${theme}-${width}.png`);
    }
  });
  await window.evaluate(window => window.setContentSize(1280, 820)); await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  heldPage.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); heldPage.end('<!doctype html><title>合成活动页</title><h1>合成活动中心</h1><p>本机验收，无真实账号数据。</p>');
  await eventually(() => modelRequests.length === 2); await row().filter({ hasText: '等待模型' }).waitFor();
  await check('The next model round restores waiting despite the previous visible preamble', async () => {
    assert.equal(await page.evaluate(() => window.__activityRow === document.querySelector('.ai-run-status')), true);
    assert.equal(await row().locator('svg').evaluate(element => getComputedStyle(element).animationName), 'none');
    await page.locator('.ai-messages').evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.ok(await page.locator('.ai-messages').evaluate(element => element.scrollHeight - element.clientHeight > 80));
    const before = await page.locator('.ai-messages').evaluate(element => element.scrollTop);
    chunk(modelRequests[1].response, { role: 'assistant', content: preamble + '合成活动页已经打开，可以继续查看活动。' });
    await row().filter({ hasText: '整理回复' }).waitFor();
    assert.equal(await page.locator('.ai-messages').evaluate(element => element.scrollTop), before);
    assert.equal((await geometry()).status.height, 44); await screenshot('activity-replying.png');
  });
  finish(modelRequests[1].response, 'stop'); await row().waitFor({ state: 'detached' });
  await check('The whole request completes once, clears its transient phase and preserves unverified results', async () => {
    const chats = await page.evaluate(() => window.workbench.ai.chatList());
    const chat = await page.evaluate(id => window.workbench.ai.chatOpen(id), chats[0].id), entry = chat.entries.at(-1);
    assert.equal(entry.streaming, false); assert.equal(entry.responsePhase, undefined);
    assert.equal((await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1).status, 'unverified');
    assert.equal(await page.locator('.ai-messages .ai-typing').count(), 0); await screenshot('activity-finished.png');
  });
  assert.deepEqual(errors, []); assert.deepEqual(consoleMessages.filter(message => message.type === 'error'), []);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', checks, layouts, consoleMessages, modelRequests: modelRequests.length, browser: 'Playwright Electron; Browser skill unavailable for the native application', limitations: ['Controlled local model stream and synthetic page, not external model quality or installation testing'] }, null, 2));
  console.log(`ACTIVITY_PILOT_OK ${output}`);
} catch (error) {
  console.error(error); process.exitCode = 1;
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'failed', checks, layouts, errors, consoleMessages, error: String(error) }, null, 2));
  if (page) try { await screenshot('failure.png'); } catch {}
  console.error(`ACTIVITY_PILOT_FAILED ${output}`);
} finally {
  if (application) { try { await application.evaluate(({ app }) => app.exit(0)); } catch {} try { await application.close(); } catch {} }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
