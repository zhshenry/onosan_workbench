import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const root = path.resolve('test-results/release-v1.0.0');
const project = path.join(root, 'synthetic-game');
await mkdir(path.join(project, 'ui-preview'), { recursive: true });
await writeFile(path.join(project, 'ui-preview/index.html'), '<title>Release synthetic game</title><h1>Synthetic game fixture</h1><script>window.bootToken=crypto.randomUUID()</script>');
const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const executablePath = path.join(root, 'portable/Ono Workbench 1.0.0 Portable/Ono Workbench.exe');
const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: path.join(root, 'portable-data'), WORKBENCH_ISOLATED: '1' };
for (const name of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[name];
let app, page;
const checks = [], errors = [];
const pass = name => { checks.push(name); console.log(`PORTABLE_PASS ${name}`); };
try {
  app = await electron.launch({ executablePath, args: [], env, timeout: 45000, chromiumSandbox: true });
  page = await app.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  await page.locator('#view-home').waitFor();
  const metadata = await app.evaluate(({ app }) => ({ packaged: app.isPackaged, version: app.getVersion(), data: app.getPath('userData') }));
  assert.equal(metadata.packaged, true); assert.equal(metadata.version, '1.0.0'); assert.ok(metadata.data.startsWith(root));
  const window = await app.browserWindow(page); await window.evaluate(window => window.setContentSize(1280, 820));
  if (await page.locator('#workbench-ai-panel').getAttribute('aria-hidden') === 'false') await page.locator('.ai-topbar-btn').click();
  pass('Packaged v1.0.0 launches with isolated app data');
  await page.getByRole('button', { name: '游戏工作台', exact: true }).click();
  const workspace = page.getByRole('region', { name: '轨迹侦探运行与测试', exact: true }); await workspace.waitFor();
  await page.getByRole('button', { name: '项目更多功能', exact: true }).click();
  await page.getByRole('menuitem', { name: '项目设置', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: '轨迹侦探 · 项目设置', exact: true });
  await dialog.locator('#game-root').fill(project); await dialog.locator('#game-port').fill(String(port));
  await dialog.getByRole('button', { name: '保存项目设置', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  await workspace.getByRole('button', { name: '启动游戏', exact: true }).click();
  await page.waitForFunction(() => window.workbench.game.state().then(state => state.service.phase === 'running'));
  await page.getByRole('button', { name: '项目更多功能', exact: true }).click();
  assert.equal(await page.getByRole('menuitem', { name: '项目设置', exact: true }).isDisabled(), true);
  await page.keyboard.press('Escape');
  pass('Project menu configures a synthetic project and running service disables settings');
  await page.waitForFunction(() => document.querySelector('.game-address')?.textContent.endsWith('/index.html') && !document.querySelector('.game-preview-footer')?.textContent.includes('页面载入中'));
  const menu = page.getByRole('menu', { name: '游戏预览更多功能', exact: true });
  const trigger = page.getByRole('button', { name: '游戏预览更多功能', exact: true });
  await trigger.click();
  await page.waitForFunction(() => document.querySelector('.game-preview-menu [aria-label="放大网页"]')?.disabled === false);
  const guestState = () => app.evaluate(async ({ webContents }, port) => {
    const guest = webContents.getAllWebContents().find(contents => contents.getURL().startsWith(`http://127.0.0.1:${port}/`));
    assertGuest(guest);
    function assertGuest(value) { if (!value) throw new Error('Synthetic game guest is missing'); }
    return { id: guest.id, zoom: guest.getZoomFactor(), token: await guest.executeJavaScript('window.bootToken') };
  }, port);
  const before = await guestState(); assert.equal(before.zoom, 1);
  await menu.getByRole('button', { name: '放大网页', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.game-preview-menu output')?.textContent === '110%');
  const zoomed = await guestState(); assert.equal(zoomed.zoom, 1.1); assert.equal(zoomed.token, before.token);
  await menu.getByRole('button', { name: '重置网页缩放', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.game-preview-menu output')?.textContent === '100%');
  await page.keyboard.press('Escape');
  console.log('FOCUS_AFTER_ESCAPE', await page.evaluate(() => ({ active: document.activeElement?.outerHTML.slice(0, 350), open: !!document.querySelector('.game-preview-menu:popover-open') })));
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '游戏预览更多功能', { timeout: 2000 });
  pass('Native preview zoom and reset preserve the live page; Escape restores focus');
  const separator = page.getByRole('separator', { name: '调整游戏预览和测试检查宽度', exact: true });
  const width = Number(await separator.getAttribute('aria-valuenow'));
  await separator.focus(); await page.keyboard.press('ArrowLeft');
  assert.ok(Number(await separator.getAttribute('aria-valuenow')) > width);
  await workspace.getByRole('button', { name: '检查', exact: true }).click();
  await workspace.getByRole('button', { name: '检查', exact: true }).click();
  assert.ok(Number(await separator.getAttribute('aria-valuenow')) > width);
  pass('Keyboard resizing and check-panel collapse preserve its width');
  const terminalToggle = workspace.getByRole('button', { name: '终端', exact: true });
  await terminalToggle.click(); await page.locator('#game-project-terminal .xterm-screen').waitFor();
  await page.waitForFunction(() => !!document.querySelector('#game-project-terminal button[aria-label="中断当前命令"]'));
  await page.getByRole('button', { name: '收起项目终端', exact: true }).click();
  assert.equal(await page.locator('#game-project-terminal').getAttribute('inert'), '');
  await terminalToggle.click(); await page.locator('#game-project-terminal .xterm-screen').waitFor();
  assert.equal((await guestState()).id, before.id);
  await page.screenshot({ path: path.join(root, 'portable-game.png'), animations: 'disabled' });
  await page.getByRole('button', { name: '结束会话', exact: true }).click();
  pass('Packaged native PowerShell terminal opens, collapses and reconnects to the same dock');
  await page.locator('.ai-topbar-btn').click();
  await page.waitForFunction(() => document.querySelector('.ai-ctx-modname')?.textContent === '游戏工作台');
  assert.equal(await page.locator('.ai-ctx-name').textContent(), '轨迹侦探');
  assert.deepEqual(errors, []); pass('Merged AI context labels and renderer error check');
  await writeFile(path.join(root, 'portable-qa.json'), JSON.stringify({ status: 'passed', checks, metadata, errors }, null, 2));
} catch (error) {
  console.error(error); process.exitCode = 1;
  await writeFile(path.join(root, 'portable-qa.json'), JSON.stringify({ status: 'failed', checks, errors, error: String(error) }, null, 2));
  if (page) try { await page.screenshot({ path: path.join(root, 'portable-failure.png') }); } catch {}
} finally {
  if (app) { try { await app.evaluate(({ app }) => app.exit(0)); } catch {} try { await app.close(); } catch {} }
}
