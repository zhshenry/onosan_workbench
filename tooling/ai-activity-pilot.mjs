// Real Electron/IPC/browser tools, with an isolated profile and a controlled local model stream.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const output = process.env.WORKBENCH_ACTIVITY_OUTPUT || path.resolve('test-results', `ai-activity-${Date.now()}`);
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
const row = () => page.locator('#workbench-ai-panel .ai-run-slot[data-visible="true"] .ai-run-status');
const jump = () => page.locator('#workbench-ai-panel .ai-run-slot[data-visible="true"] .ai-jump-latest');
const controls = () => page.locator('#workbench-ai-panel .ai-run-controls');
const messages = () => page.locator('#workbench-ai-panel .ai-messages');
const readEntry = () => page.evaluate(async () => {
  const chats = await window.workbench.ai.chatList();
  return (await window.workbench.ai.chatOpen(chats[0].id)).entries.at(-1);
});
async function geometry() {
  await controls().evaluate(element => Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {}))));
  return page.locator('#workbench-ai-panel').evaluate(panel => {
    const status = panel.querySelector('.ai-run-status'), capsule = panel.querySelector('.ai-run-controls'), composer = panel.querySelector('.ai-compose-input'), messages = panel.querySelector('.ai-messages');
    const r = capsule.getBoundingClientRect(), c = composer.getBoundingClientRect(), m = messages.getBoundingClientRect();
    return { phase: status?.dataset.phase, status: { x: r.x, y: r.y, width: r.width, height: r.height }, composer: { x: c.x, y: c.y, width: c.width, height: c.height }, messages: { x: m.x, y: m.y, width: m.width, bottom: m.bottom },
      position: getComputedStyle(capsule).position, overflow: capsule.scrollWidth > capsule.clientWidth, role: status?.getAttribute('role'), insideMessages: !!capsule.closest('.ai-messages') };
  });
}
async function screenshot(name) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  const window = await application.browserWindow(page);
  await page.locator('#workbench-ai-panel').screenshot({ path: path.join(output, name.replace('.png', '-panel.png')) });
  await writeFile(path.join(output, name), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
  if (await controls().getAttribute('data-visible') === 'true') await controls().screenshot({ path: path.join(output, name.replace('.png', '-capsule.png')) });
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
  await check('Scope guidance opens for keyboard focus without pointer hover', async () => {
    await page.mouse.move(0, 0);
    await page.getByRole('button', { name: '查看协助范围', exact: true }).focus();
    await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    await page.waitForFunction(() => {
      const tip = document.querySelector('.ai-scope-tooltip');
      return tip && getComputedStyle(tip).visibility === 'visible' && getComputedStyle(tip).opacity === '1';
    });
    await input.focus();
  });
  await input.fill('打开本机合成活动页面，告诉我已经打开。'); await page.getByRole('button', { name: '发送', exact: true }).click();
  await eventually(() => modelRequests.length === 1);
  await row().filter({ hasText: 'AI 处理中' }).waitFor();
  await page.evaluate(() => { window.__activityRow = document.querySelector('.ai-run-status'); });
  const initial = await geometry();
  await check('A live request floats a 34px capsule without an extra composer row', async () => {
    assert.equal(initial.status.height, 34); assert.equal(initial.position, 'absolute'); assert.equal(initial.insideMessages, false); assert.equal(initial.role, 'status');
    assert.equal(await page.locator('.ai-compose-wrap .ai-run-status, .ai-messages .ai-typing').count(), 0); assert.equal(await jump().count(), 0);
  });
  const first = modelRequests[0].response;
  const thoughtText = '先核对活动列表，再检查参与要求。\n\n'.repeat(100);
  chunk(first, { role: 'assistant', reasoning_content: thoughtText });
  await page.locator('.ai-thinking').waitFor();
  await check('Thoughts default folded; live Unicode count and timer are visible, and manual opening stays bounded', async () => {
    assert.equal(await page.locator('.ai-thinking').getAttribute('open'), null);
    assert.match(await page.locator('.ai-thinking-metrics').textContent(), /1,600 字/);
    await page.waitForFunction(() => /[1-9]\d* 秒/.test(document.querySelector('.ai-thinking-metrics')?.textContent ?? ''));
    await page.locator('.ai-thinking > summary').click();
    assert.ok(await page.locator('.ai-thinking-body').evaluate(element => element.scrollHeight > element.clientHeight && element.getBoundingClientRect().height <= 240));
    chunk(first, { reasoning_content: '继续核对。' });
    await page.waitForFunction(() => document.querySelector('.ai-thinking-metrics')?.textContent?.includes('1,605 字'));
    assert.equal(await page.locator('.ai-thinking').getAttribute('open'), '');
    await page.locator('.ai-thinking > summary').click();
  });
  const preamble = '我先核对当前页面的活动列表，再查看具体的参与要求。\n\n| 活动方向 | 适合内容 |\n| --- | --- |\n| 效率工具分享 | 自动化经验 |\n| 创作灵感计划 | 工作流拆解 |\n| 日常经验记录 | 图文笔记 |\n\n' + '自动化流程这个选题，可以先关注工具经验和效率分享方向。\n\n'.repeat(12);
  chunk(first, { role: 'assistant', content: preamble });
  await row().filter({ hasText: 'AI 处理中' }).waitFor();
  chunk(first, { tool_calls: [{ index: 0, id: 'open-fixture', type: 'function', function: { name: 'browser_tabs', arguments: JSON.stringify({ operation: 'open', url: `${base}/activities` }) } }] }); finish(first, 'tool_calls');
  await row().filter({ hasText: '待你授权' }).waitFor();
  await check('A real site-approval card keeps the composer anchored and the capsule above the card', async () => {
    const current = await geometry(); assert.deepEqual(current.composer, initial.composer); assert.ok(current.status.y + current.status.height < current.messages.bottom);
    assert.equal(await page.locator('.ai-thinking').getAttribute('open'), null); assert.equal(await page.locator('.ai-activity:not(.ai-thinking)').getAttribute('open'), null);
    await page.locator('.ai-site-approval').getByRole('button', { name: '允许并继续', exact: true }).click();
  });
  await eventually(() => !!heldPage); await row().filter({ hasText: 'AI 操作中' }).waitFor();
  await page.locator('.ai-site-approval').waitFor({ state: 'detached' });
  const pausedThinking = (await readEntry()).thinkingMs;
  await check('Real browser navigation changes only the status and manual scrolling exposes the combined jump action', async () => {
    assert.equal(await page.evaluate(() => window.__activityRow === document.querySelector('.ai-run-status')), true);
    const current = await geometry(); assert.equal(current.status.y, initial.status.y); assert.deepEqual(current.composer, initial.composer);
    const frames = await page.evaluate(async () => {
      const capsule = document.querySelector('.ai-run-controls'), messages = document.querySelector('.ai-messages');
      const samples = [], start = performance.now(); messages.scrollTop = 0;
      do {
        await new Promise(resolve => requestAnimationFrame(resolve));
        const rect = capsule.getBoundingClientRect();
        samples.push({ width: rect.width, height: rect.height, center: rect.x + rect.width / 2 });
      } while (performance.now() - start < 280);
      return samples;
    });
    await jump().waitFor();
    assert.equal(await row().count(), 1);
    const firstWidth = frames[0].width, lastWidth = frames.at(-1).width;
    assert.ok(lastWidth > firstWidth + 40, JSON.stringify(frames));
    assert.ok(frames.some(frame => frame.width > firstWidth + 2 && frame.width < lastWidth - 2), 'The new action must expand progressively');
    assert.ok(frames.every(frame => frame.height === 34 && Math.abs(frame.center - frames[0].center) < 1));
    layouts.push({ motion: 'status-to-combined', frames });
    assert.deepEqual((await geometry()).composer, initial.composer);
  });
  await check('Passive progress and the inset blue action have distinct pointer, hover and keyboard states', async () => {
    const style = await row().evaluate(element => ({ cursor: getComputedStyle(element).cursor, button: !!element.closest('button'), color: getComputedStyle(element.querySelector('strong')).color }));
    assert.equal(style.cursor, 'default'); assert.equal(style.button, false);
    const bounds = await jump().evaluate(element => {
      const clip = element.parentElement, slot = clip.parentElement;
      return { button: element.getBoundingClientRect().width, client: element.clientWidth, scroll: element.scrollWidth, clip: clip.getBoundingClientRect().width, slot: slot.getBoundingClientRect().width, flexShrink: getComputedStyle(slot).flexShrink };
    });
    layouts.push({ interaction: 'button-content-bounds', ...bounds });
    assert.ok(bounds.scroll <= bounds.client && bounds.button <= bounds.clip + 1, JSON.stringify(bounds));
    await page.mouse.move(0, 0);
    await jump().evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => {}))));
    const buttonStyle = await jump().evaluate(element => ({ cursor: getComputedStyle(element).cursor, bg: getComputedStyle(element).backgroundColor, color: getComputedStyle(element).color }));
    assert.equal(buttonStyle.cursor, 'pointer'); assert.equal(buttonStyle.color, 'rgb(255, 255, 255)'); assert.notEqual(buttonStyle.bg, 'rgba(0, 0, 0, 0)');
    await jump().hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector('.ai-jump-latest')).backgroundColor === 'rgb(61, 84, 134)');
    layouts.push({ interaction: 'inset-button', status: style, button: buttonStyle, hover: await jump().evaluate(element => getComputedStyle(element).backgroundColor) });
    await jump().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await jump().evaluate(element => element === document.activeElement && getComputedStyle(element).outlineStyle !== 'none'), true);
    await screenshot('activity-action-focus.png'); await input.focus(); await page.mouse.move(0, 0);
  });
  await check('Three themes and supported window sizes retain stable single-line geometry', async () => {
    for (const theme of ['mist', 'cool', 'warm']) for (const [width, height] of [[1280, 820], [1024, 680]]) {
      await window.evaluate((window, size) => window.setContentSize(size.width, size.height), { width, height });
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.waitForFunction(size => Math.abs(innerWidth - size.width) <= 2 && Math.abs(innerHeight - size.height) <= 2, { width, height });
      const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio }));
      const layout = await geometry(); layouts.push({ theme, width, height, viewport, ...layout });
      assert.equal(layout.phase, 'tool');
      assert.equal(layout.status.height, 34); assert.equal(layout.overflow, false);
      assert.ok(layout.status.x >= layout.messages.x && layout.status.x + layout.status.width <= layout.messages.x + layout.messages.width);
      assert.ok(Math.abs(layout.messages.bottom - layout.status.y - layout.status.height - 12) < 1);
      assert.ok(layout.composer.y + layout.composer.height < height); assert.ok(layout.status.y >= 0);
      assert.equal(await jump().evaluate(element => element.getBoundingClientRect().width <= element.parentElement.getBoundingClientRect().width + 1 && element.scrollWidth <= element.clientWidth), true);
      await screenshot(`activity-${theme}-${width}.png`);
    }
  });
  await check('Waiting for webpage tools does not increase saved thinking time', async () => {
    const entry = await readEntry(); assert.equal(entry.thinkingMs, pausedThinking); assert.equal(entry.thinkingStartedAt, undefined); assert.equal(entry.thinkingActive, false);
  });
  await window.evaluate(window => window.setContentSize(1280, 820)); await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
  await check('The 340px sidebar keeps thought metrics and the combined capsule inside its bounds', async () => {
    const resizer = page.locator('.ai-resizer'); await resizer.focus();
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    await page.waitForFunction(() => Math.abs(document.querySelector('#workbench-ai-panel').getBoundingClientRect().width - 340) < 1);
    const layout = await geometry(); assert.equal(layout.overflow, false); assert.ok(layout.status.x + layout.status.width <= layout.messages.x + layout.messages.width);
    assert.equal(await jump().evaluate(element => element.getBoundingClientRect().width <= element.parentElement.getBoundingClientRect().width + 1 && element.scrollWidth <= element.clientWidth), true);
    assert.equal(await page.locator('.ai-thinking > summary').evaluate(element => element.scrollWidth > element.clientWidth), false);
    await screenshot('activity-mist-width-340.png');
    await page.keyboard.press('ArrowLeft'); await page.keyboard.press('ArrowLeft');
  });
  await check('Forced colors retain an explicit action boundary and visible keyboard focus', async () => {
    await page.emulateMedia({ forcedColors: 'active' });
    await jump().focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
    assert.equal(await jump().evaluate(element => getComputedStyle(element).borderStyle === 'solid' && getComputedStyle(element).outlineStyle === 'solid'), true);
    assert.equal((await geometry()).overflow, false); await screenshot('activity-forced-colors.png');
    await page.emulateMedia({ forcedColors: 'none' }); await input.focus();
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  heldPage.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); heldPage.end('<!doctype html><title>合成活动页</title><h1>合成活动中心</h1><p>本机验收，无真实账号数据。</p>');
  await eventually(() => modelRequests.length === 2); await row().filter({ hasText: 'AI 处理中' }).waitFor();
  await check('The next model round restores waiting despite the previous visible preamble', async () => {
    assert.equal(await page.evaluate(() => window.__activityRow === document.querySelector('.ai-run-status')), true);
    assert.equal(await row().locator('svg').evaluate(element => getComputedStyle(element).animationName), 'none');
    assert.equal(await controls().evaluate(element => getComputedStyle(element).transitionDuration), '0s');
    assert.equal(await row().evaluate(element => getComputedStyle(element.closest('.ai-run-slot')).transitionDuration), '0s');
    await messages().evaluate(element => { element.scrollTop = 0; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
    assert.ok(await page.locator('.ai-messages').evaluate(element => element.scrollHeight - element.clientHeight > 80));
    const before = await page.locator('.ai-messages').evaluate(element => element.scrollTop);
    chunk(modelRequests[1].response, { role: 'assistant', reasoning_content: '已取得网页，准备汇总。' });
    await page.waitForFunction(() => document.querySelector('.ai-thinking > summary')?.getAttribute('aria-label')?.includes('思考中'));
    assert.equal(await page.locator('.ai-thinking').getAttribute('open'), null);
    await page.waitForTimeout(1100);
    chunk(modelRequests[1].response, { content: preamble + '合成活动页已经打开，可以继续查看活动。' });
    await row().filter({ hasText: 'AI 处理中' }).waitFor();
    assert.equal(await row().getAttribute('data-phase'), 'replying');
    assert.equal(await page.locator('.ai-messages').evaluate(element => element.scrollTop), before);
    assert.equal((await geometry()).status.height, 34); await screenshot('activity-replying.png');
  });
  finish(modelRequests[1].response, 'stop'); await row().waitFor({ state: 'detached' });
  await check('The whole request completes once, clears its transient phase and preserves unverified results', async () => {
    const chats = await page.evaluate(() => window.workbench.ai.chatList());
    const chat = await page.evaluate(id => window.workbench.ai.chatOpen(id), chats[0].id), entry = chat.entries.at(-1);
    assert.equal(entry.streaming, false); assert.equal(entry.responsePhase, undefined);
    assert.equal(entry.thinkingActive, false); assert.equal(entry.thinkingStartedAt, undefined); assert.ok(entry.thinkingMs >= pausedThinking + 1000);
    assert.equal((await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1).status, 'unverified');
    assert.equal(await page.locator('.ai-messages .ai-typing').count(), 0); await jump().waitFor(); await screenshot('activity-finished.png');
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await jump().focus(); await page.keyboard.press('Enter'); await jump().waitFor({ state: 'detached' });
    assert.equal(await controls().getAttribute('data-visible'), 'false'); assert.equal(await controls().getAttribute('inert'), '');
    const opacity = await controls().evaluate(async element => {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const values = [Number(getComputedStyle(element).opacity)], start = performance.now();
      while (performance.now() - start < 200) { await new Promise(resolve => requestAnimationFrame(resolve)); values.push(Number(getComputedStyle(element).opacity)); }
      return values;
    });
    assert.ok(opacity.some(value => value > 0 && value < 1), JSON.stringify(opacity)); assert.equal(opacity.at(-1), 0);
    assert.equal(await controls().evaluate(element => getComputedStyle(element).visibility), 'hidden');
    assert.equal(await messages().evaluate(element => element === document.activeElement), true);
    assert.ok(await messages().evaluate(element => element.scrollHeight - element.scrollTop - element.clientHeight < 1));
  });
  await check('Switching to a new empty chat clears the capsule and returning restores the saved reading position', async () => {
    await messages().evaluate(element => { element.scrollTop = 0; }); await jump().waitFor();
    await page.locator('.ai-ctx-new').click(); await page.locator('.ai-empty').waitFor();
    assert.equal(await controls().getAttribute('data-visible'), 'false');
    await page.locator('.ai-context-select .select-trigger').click();
    await page.locator('.ai-context-chat-main').filter({ hasText: '打开本机合成活动页面' }).click();
    await jump().waitFor(); assert.equal(await messages().evaluate(element => element.scrollTop), 0);
  });
  for (const mode of ['cancel', 'empty-reply']) await check(`${mode} freezes thinking time and clears the live capsule`, async () => {
    await input.fill(`合成计时${mode}`); await page.getByRole('button', { name: '发送', exact: true }).click();
    const expected = mode === 'cancel' ? 3 : 4; await eventually(() => modelRequests.length === expected);
    chunk(modelRequests.at(-1).response, { role: 'assistant', reasoning_content: '合成思考片段。' });
    await page.waitForFunction(() => document.querySelector('.ai-message-list > .ai-msg:last-child .ai-thinking > summary')?.getAttribute('aria-label')?.includes('思考中'));
    if (mode === 'cancel') await page.getByRole('button', { name: '停止生成', exact: true }).click(); else finish(modelRequests.at(-1).response, 'stop');
    await row().waitFor({ state: 'detached' });
    const entry = await readEntry(); assert.equal(entry.streaming, false); assert.equal(entry.thinkingActive, false); assert.equal(entry.thinkingStartedAt, undefined); assert.ok(entry.thinkingMs >= 0); assert.ok(entry.error);
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
