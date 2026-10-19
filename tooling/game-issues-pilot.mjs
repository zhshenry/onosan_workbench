import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'), require = createRequire(root + '/package.json');
const output = process.env.GAME_ISSUES_QA_DIR;
assert(output && path.isAbsolute(output), 'Set GAME_ISSUES_QA_DIR to an absolute QA output directory.');
const source = 'C:/Myself/Personal_Game/Trail-Detective';
const data = path.join(output, `data-${Date.now()}`), fixture = path.join(data, 'Trail-Detective-copy');
const configDir = path.join(data, 'OnoWorkbench/isolated/games/trail-detective'), issuesDir = path.join(configDir, 'issues');
await mkdir(configDir, { recursive: true }); await mkdir(fixture);
for (const folder of ['ui-preview', 'cases', 'tests']) await cp(path.join(source, folder), path.join(fixture, folder), { recursive: true });
const sourceHash = createHash('sha256').update(await readFile(path.join(source, 'ui-preview/scene.html'))).digest('hex');
const probe = createServer(); await new Promise(done => probe.listen(0, '127.0.0.1', done)); const port = probe.address().port; await new Promise(done => probe.close(done));
await writeFile(path.join(configDir, 'state.json'), JSON.stringify({ config: { root: fixture, webRoot: 'ui-preview', port, playwrightModule: '' } }));
const env = { ...process.env, APPDATA: path.join(data, 'shell-roaming'), WORKBENCH_TEST_DATA_DIR: data, WORKBENCH_ISOLATED: '1' };
delete env.ELECTRON_RUN_AS_NODE; delete env.WORKBENCH_DEV_URL;
const report = { checks: [], screenshots: [], errors: [], data, browser: 'Browser plugin not available; Playwright Electron, copied real game and isolated appData' };
let app, page, game, localId, saved;
const { _electron: electron } = require('playwright'), { unzipSync } = require('fflate');
const until = async (fn, label) => { for (let i = 0; i < 180; i++) { if (await fn()) return; await delay(100); } throw Error('Timeout: ' + label); };
const check = async (label, work) => { await work(); report.checks.push(label); console.log('PASS ' + label); };
const drawer = () => page.getByRole('dialog', { name: '问题反馈', exact: true });
const state = () => page.evaluate(() => window.workbench.game.state());
const guest = code => app.evaluate(({ webContents }, { id, code }) => webContents.fromId(id).executeJavaScript(code), { id: localId, code });
const size = (width, height) => app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('window=float')).setContentSize(size.width, size.height), { width, height });
async function shot(name) {
  await page.evaluate(async () => document.fonts.ready); await delay(180);
  const png = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(w => !w.webContents.getURL().includes('window=float')).webContents.capturePage().then(image => image.toPNG().toString('base64')));
  await writeFile(path.join(output, name), Buffer.from(png, 'base64')); report.screenshots.push(name);
}
async function launch() {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--force-device-scale-factor=1'], cwd: root, env, timeout: 45000 });
  page = await app.firstWindow(); page.on('pageerror', error => report.errors.push(error.message));
  await page.locator('.rail').waitFor(); await size(1718, 1010);
  if (await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') === 'true') await page.locator('.ai-topbar-btn').click();
  await page.locator('.rail [data-workbench="game"]').click(); game = page.locator('.game-host');
  const toggle = game.locator('.game-project').getByRole('button', { name: '检查', exact: true });
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
  await delay(300);
  await app.evaluate(({ dialog, shell, clipboard }) => {
    globalThis.issuePilot = { paths: [], clipboard: [], destination: null };
    shell.openPath = async file => { globalThis.issuePilot.paths.push(file); return ''; };
    clipboard.writeText = text => { globalThis.issuePilot.clipboard.push(text); };
    dialog.showSaveDialog = async options => { globalThis.issuePilot.dialog = options; return { canceled: !globalThis.issuePilot.destination, filePath: globalThis.issuePilot.destination }; };
  });
}
async function fill() {
  await drawer().getByLabel('问题标题', { exact: false }).fill('物证调查后，勘查笔记没有更新');
  await drawer().getByLabel('复现步骤', { exact: false }).fill('1. 进入 N1 案件现场\n2. 点击物证\n3. 打开勘查笔记');
  await drawer().getByLabel('期望表现', { exact: false }).fill('笔记新增本次物证记录。');
  await drawer().getByLabel('实际表现', { exact: false }).fill('笔记没有更新。此条为隔离验收数据。');
}
try {
  await launch();
  await check('entry works without failed tests; validation, dirty close and focus restoration use shared modal', async () => {
    const entry = game.getByRole('button', { name: '记录问题', exact: true });
    const heading = await game.locator('.game-tests > .game-pane-heading').boundingBox(), button = await entry.boundingBox();
    const collapse = await game.getByRole('button', { name: '收起测试栏', exact: true }).boundingBox();
    assert(Math.abs(heading.x + heading.width - collapse.x - collapse.width - 5) < 2 && collapse.x - button.x - button.width <= 8, 'record and collapse controls should be grouped on the right');
    await entry.click();
    await drawer().getByRole('button', { name: '提交并保存', exact: true }).click();
    assert.equal(await drawer().locator('[name="title"]').getAttribute('aria-invalid'), 'true');
    assert.equal(await drawer().locator('[name="title"]').evaluate(el => el === document.activeElement), true);
    await drawer().locator('[name="title"]').fill('未提交草稿'); await page.keyboard.press('Escape');
    const confirm = page.getByRole('dialog', { name: '放弃未保存的修改', exact: true }); await confirm.getByRole('button', { name: '继续编辑' }).click();
    assert.equal(await drawer().locator('[name="title"]').inputValue(), '未提交草稿');
    await page.keyboard.press('Escape'); await confirm.getByRole('button', { name: '放弃修改' }).click();
    await drawer().waitFor({ state: 'hidden' }); await until(() => entry.evaluate(el => el === document.activeElement), 'focus restored to entry');
  });
  await check('real game, quick test results and two actual screenshots populate the drawer', async () => {
    await game.getByRole('button', { name: '启动本地', exact: true }).click(); await until(async () => (await state()).service.phase === 'running', 'local service');
    await until(async () => { try { localId = await game.locator('.game-environment:not([hidden]) webview').evaluate(el => el.getWebContentsId()); return await guest("document.readyState === 'complete'"); } catch { return false; } }, 'game guest');
    await guest(`location.href='http://127.0.0.1:${port}/scene.html?case=N1'`);
    await until(async () => { try { return await guest("location.pathname === '/scene.html' && document.readyState === 'complete' && !document.documentElement.classList.contains('case-loading')"); } catch { return false; } }, 'real scene');
    await guest("document.querySelector('#dialog-action')?.click(); localStorage.setItem('ono-issue-game-proof','retained')");
    await game.getByRole('button', { name: '运行快速检查', exact: true }).click(); await until(async () => { const s = await state(); return !s.running && Object.values(s.results).filter(r => r.status === 'passed').length === 5; }, 'five quick checks');
    const previous = (await state()).revision, scene = path.join(fixture, 'ui-preview/scene.html');
    await writeFile(scene, (await readFile(scene, 'utf8')) + '\n<!-- issue stale-result verification -->');
    await until(async () => (await state()).revision !== previous, 'copied source change');
    await game.getByRole('combobox', { name: '当前检查', exact: true }).click();
    assert.equal(await page.getByRole('listbox', { name: '当前检查', exact: true }).locator('.game-check-choice small').filter({ hasText: '待重测' }).count(), 5);
    await page.keyboard.press('Escape');
    await shot('issue-entry.png'); await game.getByRole('button', { name: '记录问题', exact: true }).click(); await fill();
    for (let i = 0; i < 2; i++) { await drawer().getByRole('button', { name: '截取当前页面', exact: true }).click(); await until(async () => await drawer().locator('.game-issue-thumbnail img').count() === i + 1, 'thumbnail'); }
    assert.equal(await drawer().getByLabel('附带截图 1', { exact: true }).isChecked(), true);
    await shot('issue-filled.png');
  });
  await check('failed save retains the draft; synchronous double submit creates one complete record', async () => {
    await rename(issuesDir, issuesDir + '-hold'); await writeFile(issuesDir, 'blocked directory for failure test');
    await drawer().getByRole('button', { name: '提交并保存', exact: true }).click(); await drawer().getByRole('alert').waitFor();
    assert.match(await drawer().locator('[name="actual"]').inputValue(), /隔离验收/); assert.equal(await drawer().locator('.game-issue-thumbnail img').count(), 2);
    await rm(issuesDir); await rename(issuesDir + '-hold', issuesDir);
    await drawer().getByRole('button', { name: '提交并保存', exact: true }).evaluate(el => { el.click(); el.click(); });
    await drawer().getByRole('button', { name: '完成', exact: true }).waitFor();
    const records = await page.evaluate(() => window.workbench.game.issues.list()); assert.equal(records.length, 1);
    saved = await page.evaluate(id => window.workbench.game.issues.read(id), records[0].id); report.issue = saved;
    assert.equal(saved.images.length, 2); assert.equal(saved.test.status, 'passed'); assert(saved.test.output.includes('PASS')); assert(saved.logs.length > 0);
    assert.equal(await drawer().locator('.game-issue-path').textContent(), saved.directory);
    await drawer().locator('[name="title"]').focus(); await page.keyboard.press('Enter');
    assert.equal((await page.evaluate(() => window.workbench.game.issues.list())).length, 1);
    await drawer().locator('[name="title"]').evaluate(el => el.blur());
    await shot('issue-saved.png');
  });
  await check('folder, copy-path, image open and native ZIP dialog operate on the saved issue', async () => {
    await drawer().getByRole('button', { name: '打开文件夹', exact: true }).click();
    await drawer().getByRole('button', { name: '复制路径', exact: true }).click();
    await drawer().locator('.game-issue-thumbnail').first().click();
    await until(() => app.evaluate(() => globalThis.issuePilot.paths.length >= 2), 'saved image open');
    const native = await app.evaluate(() => globalThis.issuePilot); assert.equal(native.paths[0], saved.directory); assert.equal(native.clipboard[0], saved.directory); assert(native.paths[1].startsWith(saved.directory));
    await drawer().getByRole('button', { name: '导出 ZIP', exact: true }).click();
    const archivePath = path.join(output, `${saved.id}.zip`); report.exportPath = archivePath; assert.equal((await readdir(output)).includes(`${saved.id}.zip`), false);
    await app.evaluate((_, destination) => { globalThis.issuePilot.destination = destination; }, archivePath);
    await drawer().getByRole('button', { name: '导出 ZIP', exact: true }).click();
    await until(async () => { try { return (await readFile(archivePath)).length > 0; } catch { return false; } }, 'ZIP export');
    const files = unzipSync(await readFile(archivePath)); report.zipFiles = Object.keys(files);
    assert.equal(Object.keys(files).length, 6); assert(Buffer.from(files[`${saved.id}/screenshots/1.png`]).equals(await readFile(path.join(saved.directory, 'screenshots/1.png'))));
    assert.match(Buffer.from(files[`${saved.id}/report.md`]).toString(), /勘查笔记/);
  });
  await check('three themes, two window sizes, keyboard focus and accessibility preferences retain footer access', async () => {
    for (const theme of ['mist', 'cool', 'warm']) for (const [width, height] of [[1280, 820], [1024, 680]]) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme); await size(width, height); await delay(120);
      const bounds = await drawer().boundingBox(); assert(bounds.x >= 0 && bounds.x + bounds.width <= width && bounds.y >= 0 && bounds.y + bounds.height <= height);
      assert.equal(await drawer().evaluate(el => el.scrollWidth > el.clientWidth), false);
      const done = await drawer().getByRole('button', { name: '完成', exact: true }).boundingBox(); assert(done.y + done.height <= height);
      await shot(`issue-${theme}-${width}.png`);
    }
    await page.emulateMedia({ reducedMotion: 'reduce', forcedColors: 'active' }); await drawer().getByRole('button', { name: '完成', exact: true }).focus();
    assert.equal(await drawer().getByRole('button', { name: '完成', exact: true }).evaluate(el => el === document.activeElement), true);
    await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
    await size(1718, 1010); await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
    await shot('issue-final.png'); await drawer().getByRole('button', { name: '完成', exact: true }).click();
    assert.equal(await guest("localStorage.getItem('ono-issue-game-proof')"), 'retained');
    assert.equal(await game.locator('.game-environment:not([hidden]) webview').evaluate(el => el.getWebContentsId()), localId);
  });
  await check('full app restart reopens saved issue and independent images after original capture is changed', async () => {
    const current = await state(); await writeFile(current.captures[0].file, 'changed original after archiving');
    await app.close(); app = null; await launch();
    await game.getByRole('button', { name: '记录问题', exact: true }).click();
    await drawer().getByText('已保存的问题（最近 1 条）', { exact: true }).click();
    await drawer().getByRole('button', { name: /物证调查后，勘查笔记没有更新/ }).click();
    await drawer().getByRole('button', { name: '完成', exact: true }).waitFor();
    assert.equal(await drawer().locator('[name="title"]').inputValue(), saved.title);
    await until(async () => await drawer().locator('.game-issue-thumbnail img').count() === 2, 'saved thumbnails');
    assert.equal((await page.evaluate(id => window.workbench.game.issues.read(id), saved.id)).test.output, saved.test.output);
    await shot('issue-reopened.png'); await drawer().getByRole('button', { name: '完成', exact: true }).click();
  });
  await check('browsing saved records preserves an unfinished draft and returns to it before completion', async () => {
    await game.getByRole('button', { name: '记录问题', exact: true }).click(); await drawer().locator('[name="title"]').fill('尚未保存的新问题');
    await drawer().getByText('已保存的问题（最近 1 条）', { exact: true }).click();
    await drawer().getByRole('button', { name: /物证调查后，勘查笔记没有更新/ }).click();
    await drawer().getByRole('button', { name: '继续填写草稿', exact: true }).click();
    assert.equal(await drawer().locator('[name="title"]').inputValue(), '尚未保存的新问题');
    await page.keyboard.press('Escape'); await page.getByRole('dialog', { name: '放弃未保存的修改', exact: true }).getByRole('button', { name: '放弃修改' }).click();
    await drawer().waitFor({ state: 'hidden' });
  });
  await check('online drawer excludes local evidence and saves an online text-only issue', async () => {
    const url = 'https://example.com/game/'; await page.evaluate(url => window.workbench.game.configureOnline(url), url);
    await game.getByRole('radiogroup', { name: '试玩环境' }).getByRole('radio', { name: '线上试玩', exact: true }).click();
    await game.getByRole('button', { name: '记录问题', exact: true }).click(); await fill();
    assert.equal(await drawer().getByLabel('本地测试结果 · 线上环境不可用').isDisabled(), true);
    assert.equal(await drawer().getByLabel('服务日志 · 未接入服务器日志').isChecked(), false);
    await drawer().getByRole('button', { name: '提交并保存', exact: true }).click(); await drawer().getByRole('button', { name: '完成', exact: true }).waitFor();
    const record = await page.evaluate(async () => { const list = await window.workbench.game.issues.list(); return window.workbench.game.issues.read(list[0].id); });
    assert.equal(record.environment, 'online'); assert.equal(record.test, null); assert.deepEqual(record.logs, []); await shot('issue-online.png');
    assert.equal(createHash('sha256').update(await readFile(path.join(source, 'ui-preview/scene.html'))).digest('hex'), sourceHash);
    assert.deepEqual(report.errors, []);
  });
  report.result = 'passed';
} catch (error) { report.result = 'failed'; report.failure = error.stack; console.error(error); process.exitCode = 1; if (app && page) await shot('issue-failure.png').catch(() => {}); }
finally { await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2)); if (app) await app.close(); }
