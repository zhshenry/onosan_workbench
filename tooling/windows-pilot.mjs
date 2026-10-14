// Installed executable only. All persisted task/settings mutations are real UI actions.
// Topbar legacy edge cases separately label temporary renderer-only read responses.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { runAiCardsPilot, verifyAiCardsRelaunch } from './ai-cards-pilot.mjs';
import { runFloatEmptyPilot, runFloatGroupPilot, verifyFloatGroupRelaunch } from './float-group-pilot.mjs';
import { runContextPickerPilot, verifyContextPickerRelaunch } from './context-picker-pilot.mjs';
import { inspectPilotArtifacts } from './pilot-artifacts.mjs';
import { bounded, exitPilot, failurePage, finalizePilot } from './pilot-cleanup.mjs';
import { runTopbarDatesPilot, verifyTopbarDatesRelaunch } from './topbar-dates-pilot.mjs';
import { runYearDropdownPilot, verifyUnboundedDatePicker, verifyYearDropdownRelaunch } from './year-dropdown-pilot.mjs';
import { runUpdateStatusPilot } from './update-status-pilot.mjs';
import { runPublishAssociationPilot, verifyPublishAssociationRelaunch } from './publish-association-pilot.mjs';

assert.equal(process.platform, 'win32', 'Run the acceptance pilot on standard Windows hosted CI');
const executablePath = process.env.WORKBENCH_PILOT_EXE;
const dataRoot = process.env.WORKBENCH_TEST_DATA_DIR;
assert.ok(executablePath && dataRoot, 'Install with windows-pilot-install.ps1 first');
assert.ok(existsSync(executablePath), 'Installed executable is missing');
const installDirectory = path.dirname(executablePath);
const reportDirectory = path.resolve('test-results/windows-pilot');
await mkdir(reportDirectory, { recursive: true });
const install = JSON.parse((await readFile(path.join(reportDirectory, 'install.json'), 'utf8')).replace(/^\uFEFF/, ''));
const runId = process.env.GITHUB_RUN_ID ?? 'synthetic';
const title = `CI synthetic task ${runId}`;
const editedTitle = `${title} edited`;
const note = 'Synthetic acceptance fixture only. No personal data or external services.';
const report = {
  status: 'running', commit: process.env.GITHUB_SHA, runId,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? 'local',
  event: process.env.WORKBENCH_CI_EVENT,
  headCommit: process.env.WORKBENCH_CI_HEAD_SHA ?? process.env.GITHUB_SHA,
  baseCommit: process.env.WORKBENCH_CI_BASE_SHA || null,
  platform: process.platform, version: install.version, installer: install,
  checks: [], screenshots: [], launch: [], errors: [],
  limitations: ['Silent NSIS installation only; no native wizard, UAC or SmartScreen assessment', 'Isolated test mode disables real auto-update and launch-at-login registration', 'Same-version relaunch only; no cross-version upgrade, Office conversion or external AI/network coverage (AI card and reference flows use synthetic loopback responses)', 'Reference checks cover actual installed UI, IPC, selected-reference transport and persisted snapshots; model behavior is synthetic. Existing latest-120 todo/category context is unchanged.', 'App themes are mist/cool/warm; OS light/dark preference coverage does not imply a separate dark app theme.', 'Playwright Electron automation is experimental; launch is separately asserted', 'Topbar cross-day/year and invalid/missing legacy fixtures temporarily replace only todo:state read responses; those renderer checks are separate from UI-created persisted records and same-version relaunch', 'Publish association failure/delay fixtures temporarily wrap only the main-frame copy mark/clear IPC handlers and restore the exact originals; final persistence and full application relaunch are separate real local JSON checks. No platform requests, publications or deletions are performed.'],
};
let application;
let page;
function inside(child, root) {
  const relative = path.relative(root, child);
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}
async function check(name, action) {
  const start = Date.now();
  try {
    await action();
    report.checks.push({ name, status: 'passed', durationMs: Date.now() - start });
    console.log(`PILOT_PASS ${name}`);
  } catch (error) {
    report.checks.push({ name, status: 'failed', durationMs: Date.now() - start, error: String(error).slice(0, 4000) });
    throw error;
  }
}
async function screenshot(name, capturePage = page) {
  if (name.startsWith('topbar-dates-') && name.endsWith('-zoom125.png')) {
    // Playwright's Electron viewport screenshot can crop a zoomed window to its
    // CSS viewport size. Capture the complete native surface without resampling.
    const window = await application.browserWindow(page);
    const frame = await window.evaluate(async win => {
      const image = await win.webContents.capturePage();
      return { png: image.toPNG().toString('base64'), imageSize: image.getSize(), contentSize: win.getContentSize(), zoom: win.webContents.getZoomFactor() };
    });
    assert.deepEqual([frame.imageSize.width, frame.imageSize.height], frame.contentSize, 'Native screenshot must cover the complete content surface');
    const png = Buffer.from(frame.png, 'base64');
    await writeFile(path.join(reportDirectory, name), png);
    (report.screenshotCapture ??= []).push({ name, method: 'Electron webContents.capturePage (unmodified PNG)', imageSize: frame.imageSize,
      contentSize: frame.contentSize, zoom: frame.zoom, pngPixels: { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } });
  } else {
    await capturePage.screenshot({ path: path.join(reportDirectory, name), animations: 'disabled' });
  }
  report.screenshots.push(name);
}
async function state() { return page.evaluate(() => window.workbench.todo.state()); }
async function waitTask(expectedTitle, status) {
  await page.waitForFunction(({ expectedTitle, status }) => window.workbench.todo.state().then(value => value.tasks.some(task => task.title === expectedTitle && task.status === status)), { expectedTitle, status });
  return (await state()).tasks.find(task => task.title === expectedTitle);
}
async function launch() {
  const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: dataRoot };
  for (const key of ['WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL', 'WORKBENCH_ISOLATED', 'ELECTRON_RUN_AS_NODE']) delete env[key];
  application = await electron.launch({ executablePath, args: [], cwd: installDirectory, env, timeout: 60000, chromiumSandbox: true });
  page = await application.firstWindow({ timeout: 30000 });
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => report.errors.push(error.message.slice(0, 1000)));
  await page.locator('#view-home').waitFor({ state: 'visible' });
  const metadata = await application.evaluate(({ app }) => ({
    isPackaged: app.isPackaged, execPath: process.execPath, appPath: app.getAppPath(),
    appData: app.getPath('appData'), userData: app.getPath('userData'),
    version: app.getVersion(), electron: process.versions.electron, chrome: process.versions.chrome,
  }));
  assert.equal(metadata.isPackaged, true, 'Must exercise a packaged app');
  assert.equal(path.resolve(metadata.execPath).toLowerCase(), path.resolve(executablePath).toLowerCase());
  assert.ok(inside(metadata.appPath, installDirectory), 'Loaded app must be inside the installed directory');
  assert.equal(path.resolve(metadata.appData).toLowerCase(), path.resolve(dataRoot).toLowerCase());
  assert.ok(inside(metadata.userData, dataRoot), 'Settings must remain isolated');
  assert.equal(metadata.version, install.version);
  const about = await page.evaluate(() => window.workbench.appInfo.about());
  assert.equal(path.resolve(about.todoDbPath).toLowerCase(), path.join(dataRoot, 'To-Do-List', 'tasks.db').toLowerCase());
  const updater = await page.evaluate(() => window.workbench.updater.status());
  assert.equal(updater.enabled, false, 'Pilot must not contact the real update feed');
  const viewport = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, devicePixelRatio }));
  report.launch.push({ ...metadata, viewport, todoDbPath: about.todoDbPath, updaterEnabled: updater.enabled });
}
// Acceptance shutdown is a normal app quit or visible window control, never cleanup.
async function normalExit(label, trigger) {
  const child = application.process(); const started = Date.now();
  let timer; let onExit;
  const exited = new Promise((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: installed process did not exit within 20000ms`)), 20000);
    onExit = (code, signal) => {
      clearTimeout(timer);
      if (code === 0 && signal === null) resolve();
      else reject(new Error(`${label}: exit code ${code}, signal ${signal}`));
    };
    child.once('exit', onExit);
  });
  try {
    await Promise.all([exited, trigger()]);
    (report.normalExits ??= []).push({ label, exitCode: 0, durationMs: Date.now() - started });
    application = undefined; page = undefined;
  } finally { clearTimeout(timer); child.removeListener('exit', onExit); }
}
async function showLifecycleFloat() {
  await page.locator('.topbar').getByRole('button', { name: '打开悬浮待办窗', exact: true }).click();
  const started = Date.now(); let floating;
  while (!floating && Date.now() - started < 15000) {
    floating = application.windows().find(candidate => !candidate.isClosed() && /[?&]window=float(?:&|$)/.test(candidate.url()));
    if (!floating) await page.waitForTimeout(100);
  }
  assert.ok(floating, 'Normal toolbar must create the real floating page');
  floating.setDefaultTimeout(15000);
  floating.on('pageerror', error => report.errors.push(`float lifecycle: ${error.message}`));
  await floating.locator('.float-app').waitFor({ state: 'visible' });
  const native = await application.browserWindow(floating);
  assert.equal(await native.evaluate(win => win.isVisible()), true, 'Floating native window must be shown at exit');
  return { floating, native };
}
async function doneLibrary() {
  const home = page.locator('#view-home');
  await home.getByRole('button', { name: '事项库', exact: true }).click();
  const library = home.getByRole('region', { name: '事项库', exact: true });
  await library.getByRole('button', { name: /^已完成/ }).click();
  await library.getByRole('button', { name: `编辑 ${editedTitle}`, exact: true }).waitFor({ state: 'visible' });
  return library;
}
let taskId;
let birthdayFixture;
let aiCardsFixture;
let topbarDatesFixture;
let floatGroupFixture;
let contextPickerFixture;
let publishAssociationFixture;
try {
  await check('Launch actual installed executable with isolated data and updater disabled', launch);
  await check('Fresh isolated task database is empty', async () => assert.equal((await state()).tasks.length, 0));
  await check('Normal quit without any floating window exits cleanly and relaunches empty', async () => {
    assert.equal(application.windows().some(candidate => /[?&]window=float(?:&|$)/.test(candidate.url())), false);
    await normalExit('never-opened floating window', () => application.evaluate(({ app }) => {
      // Return the evaluation first, then invoke the real public application quit lifecycle.
      setTimeout(() => app.quit(), 0);
    }));
    await launch();
    assert.equal((await state()).tasks.length, 0);
  });
  await screenshot('initial.png');
  await runFloatEmptyPilot({ application, page, check, screenshot, report });
  await check('Collapse default AI overlay through its normal toolbar control', async () => {
    await page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true }).click();
    await page.locator('#workbench-ai-panel').waitFor({ state: 'hidden' });
  });
  await check('Cancel empty new-task editor without creating a task', async () => {
    await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增事项', exact: true });
    await dialog.getByRole('button', { name: '返回', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await state()).tasks.length, 0);
  });
  await check('Create one synthetic task through the UI', async () => {
    await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增事项', exact: true });
    await dialog.getByRole('textbox', { name: '待办名称', exact: true }).fill(title);
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    taskId = (await waitTask(title, 'todo')).id;
    assert.equal((await state()).tasks.length, 1, 'Creation must not duplicate the task');
    await page.locator('#view-home').getByRole('button', { name: `编辑 ${title}`, exact: true }).waitFor({ state: 'visible' });
  });
  await screenshot('created.png');
  await check('Edit synthetic task title and note through the UI', async () => {
    await page.locator('#view-home').getByRole('button', { name: `编辑 ${title}`, exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '编辑事项', exact: true });
    await dialog.getByRole('textbox', { name: '待办名称', exact: true }).fill(editedTitle);
    await dialog.getByRole('textbox', { name: '备注 / 进展', exact: true }).fill(note);
    await verifyUnboundedDatePicker(page);
    await dialog.getByRole('button', { name: '保存待办', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    const task = await waitTask(editedTitle, 'todo');
    assert.equal(task.id, taskId); assert.equal(task.note, note);
  });
  await screenshot('edited.png');
  await check('Cancel completion once, then confirm completion through the UI', async () => {
    const home = page.locator('#view-home');
    await home.getByRole('button', { name: `完成 ${editedTitle}`, exact: true }).click();
    await home.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal((await state()).tasks[0].status, 'todo');
    await home.getByRole('button', { name: `完成 ${editedTitle}`, exact: true }).click();
    await home.getByRole('button', { name: '确认完成', exact: true }).click();
    const task = await waitTask(editedTitle, 'done'); assert.equal(task.id, taskId);
    await doneLibrary();
  });
  await screenshot('completed.png');
  birthdayFixture = await runYearDropdownPilot({ application, page, check, screenshot, runId, report });
  topbarDatesFixture = await runTopbarDatesPilot({ application, page, check, screenshot, runId, report });
  aiCardsFixture = await runAiCardsPilot({ application, page, check, screenshot, runId, report });
  floatGroupFixture = await runFloatGroupPilot({ application, page, check, screenshot, runId, report });
  contextPickerFixture = await runContextPickerPilot({ application, page, check, screenshot, runId, report, birthdayFixture });
  publishAssociationFixture = await runPublishAssociationPilot({ application, page, check, screenshot, runId, report, dataRoot });
  await runUpdateStatusPilot({ application, page, check, screenshot, report });
  await check('Choose exit-on-close in settings and quit through the window close button', async () => {
    await page.locator('.rail [data-workbench="settings"]').click();
    await page.locator('.tree').getByRole('button', { name: '通用', exact: true }).click();
    await page.getByRole('button', { name: '退出应用', exact: true }).click();
    await page.waitForFunction(() => window.workbench.settings.get().then(value => value.closeAction === 'exit'));
    const exited = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Installed process did not exit after UI close')), 20000);
      application.process().once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Exit code ${code}`)); });
    });
    // Attach both rejection handlers immediately, including if clicking closes the target.
    await Promise.all([exited, page.locator('.wbtn.close').click()]);
    application = undefined; page = undefined;
  });
  await check('Relaunch same installed executable and verify persisted task and setting', async () => {
    await launch();
    const persisted = (await state()).tasks.filter(task => task.id === taskId);
    assert.equal(persisted.length, 1); assert.equal(persisted[0].id, taskId);
    assert.equal(persisted[0].title, editedTitle); assert.equal(persisted[0].note, note); assert.equal(persisted[0].status, 'done');
    assert.equal((await page.evaluate(() => window.workbench.settings.get())).closeAction, 'exit');
    await doneLibrary();
    assert.ok((await stat(path.join(dataRoot, 'To-Do-List', 'tasks.db'))).size > 0);
  });
  await screenshot('relaunched.png');
  await verifyYearDropdownRelaunch({ page, check, screenshot, fixture: birthdayFixture });
  await verifyAiCardsRelaunch({ page, check, screenshot, fixture: aiCardsFixture });
  await verifyContextPickerRelaunch({ application, page, check, screenshot, fixture: contextPickerFixture });
  await verifyTopbarDatesRelaunch({ page, check, screenshot, fixture: topbarDatesFixture });
  await verifyFloatGroupRelaunch({ application, page, check, screenshot, fixture: floatGroupFixture });
  await verifyPublishAssociationRelaunch({ application, page, check, fixture: publishAssociationFixture, report });
  await check('Floating group: visible native window permits normal main-window exit', async () => {
    const { floating, native } = await showLifecycleFloat();
    await floating.getByRole('button', { name: '收窄悬浮窗', exact: true }).click();
    await floating.waitForFunction(() => document.querySelector('.float-app')?.classList.contains('narrow'));
    assert.equal(await native.evaluate(win => win.getBounds().width), 330);
    assert.equal(await native.evaluate(win => win.isVisible()), true);
    await page.bringToFront();
    await normalExit('visible floating window', () => page.locator('.wbtn.close').click());
  });
  await check('Floating group: repeated same-version relaunch preserves task and resets width to 440', async () => {
    await launch();
    const persisted = (await state()).tasks.filter(task => task.id === taskId);
    assert.equal(persisted.length, 1);
    assert.equal(persisted[0].title, editedTitle); assert.equal(persisted[0].note, note); assert.equal(persisted[0].status, 'done');
    assert.equal((await page.evaluate(() => window.workbench.settings.get())).closeAction, 'exit');
    const { native } = await showLifecycleFloat();
    assert.equal(await native.evaluate(win => win.getBounds().width), 440);
  });
  await check('Floating group: repeated hide-show lifecycle still permits normal main-window exit', async () => {
    for (let cycle = 0; cycle < 2; cycle++) {
      const floating = application.windows().find(candidate => /[?&]window=float(?:&|$)/.test(candidate.url()));
      assert.ok(floating);
      const native = await application.browserWindow(floating);
      await floating.getByRole('button', { name: '隐藏悬浮待办窗', exact: true }).click();
      assert.equal(await native.evaluate(win => win.isVisible()), false);
      await showLifecycleFloat();
    }
    await page.bringToFront();
    await normalExit('repeated floating lifecycle', () => page.locator('.wbtn.close').click());
  });
  await check('No renderer page errors during the core flow', async () => assert.deepEqual(report.errors, []));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error).slice(0, 6000);
  console.error(report.failure);
  // Save even if screenshot capture or Electron shutdown subsequently fails.
  await saveReport().catch(saveError => {
    report.errors.push(`Initial failure report write: ${String(saveError)}`);
    console.error(`Initial failure report write failed: ${String(saveError)}`);
  });
  const capturePage = failurePage(application, page, report.checks.at(-1)?.name);
  if (capturePage && !capturePage.isClosed()) {
    report.failureCapture = { name: 'failure.png', window: capturePage === page ? 'main' : 'float' };
    await bounded(() => screenshot('failure.png', capturePage), 5000, 'Failure screenshot').catch(captureError => {
      report.errors.push(`Failure screenshot: ${String(captureError)}`);
    });
  }
  process.exitCode = 1;
} finally {
  try {
    await finalizePilot({ report, saveReport, application, executablePath });
    console.log(`PILOT_RESULT ${report.status} checks=${report.checks.filter(value => value.status === 'passed').length}/${report.checks.length}`);
    console.log(JSON.stringify(await inspectPilotArtifacts(reportDirectory)));
  } catch (error) {
    report.status = 'failed';
    report.errors.push(`Pilot finalization: ${String(error)}`);
    console.error(`Pilot finalization failed: ${String(error)}`);
    await saveReport().catch(saveError => console.error(`Report write failed: ${String(saveError)}`));
  }
  // Explicit exit prevents a pending Playwright close from retaining this runner.
  exitPilot(report.status);
}
async function saveReport() {
  await writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2));
  const markdown = [
    '# Windows installed-app cloud pilot', '', `Status: ${report.status}`, `Tested commit: ${report.commit}`, `Head commit: ${report.headCommit}`, `Base commit: ${report.baseCommit ?? 'not a PR'}`, `Event: ${report.event ?? 'local'}`, `Run: ${runId}`, `Attempt: ${report.runAttempt}`, `Version: ${report.version}`, '',
    '## Evidence', ...report.checks.map(value => `- ${value.status}: ${value.name} (${value.durationMs}ms)`), '',
    '## Screenshots', ...report.screenshots.map(name => `- [${name}](${name})`), '',
    '## Coverage boundaries', ...report.limitations.map(value => `- ${value}`), '',
    ...(report.failure ? ['## Failure', report.failure] : []),
    ...(report.errors.length ? ['## Errors', ...report.errors.map(error => `- ${error}`)] : []),
  ].join('\n');
  await writeFile(path.join(reportDirectory, 'report.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown);
}
