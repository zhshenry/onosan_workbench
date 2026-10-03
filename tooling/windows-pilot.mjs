// Installed executable only. All task/settings mutations below are real UI actions.
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { inspectPilotArtifacts } from './pilot-artifacts.mjs';

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
  limitations: ['Silent NSIS installation only; no native wizard, UAC or SmartScreen assessment', 'Isolated test mode disables real auto-update and launch-at-login registration', 'Same-version relaunch only; no cross-version upgrade, Office conversion or AI/network coverage', 'Playwright Electron automation is experimental; launch is separately asserted'],
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
async function screenshot(name) {
  await page.screenshot({ path: path.join(reportDirectory, name), animations: 'disabled' });
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
async function doneLibrary() {
  const home = page.locator('#view-home');
  await home.getByRole('button', { name: '事项库', exact: true }).click();
  const library = home.getByRole('region', { name: '事项库', exact: true });
  await library.getByRole('button', { name: /^已完成/ }).click();
  await library.getByRole('button', { name: `编辑 ${editedTitle}`, exact: true }).waitFor({ state: 'visible' });
  return library;
}
let taskId;
try {
  await check('Launch actual installed executable with isolated data and updater disabled', launch);
  await check('Fresh isolated task database is empty', async () => assert.equal((await state()).tasks.length, 0));
  await screenshot('initial.png');
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
    const persisted = (await state()).tasks;
    assert.equal(persisted.length, 1); assert.equal(persisted[0].id, taskId);
    assert.equal(persisted[0].title, editedTitle); assert.equal(persisted[0].note, note); assert.equal(persisted[0].status, 'done');
    assert.equal((await page.evaluate(() => window.workbench.settings.get())).closeAction, 'exit');
    await doneLibrary();
    assert.ok((await stat(path.join(dataRoot, 'To-Do-List', 'tasks.db'))).size > 0);
  });
  await screenshot('relaunched.png');
  await check('No renderer page errors during the core flow', async () => assert.deepEqual(report.errors, []));
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = String(error).slice(0, 6000);
  console.error(report.failure);
  if (page && !page.isClosed()) await screenshot('failure.png').catch(() => {});
  process.exitCode = 1;
} finally {
  if (application) await application.close().catch(error => { report.errors.push(String(error)); report.status = 'failed'; process.exitCode = 1; });
  report.finishedAt = new Date().toISOString();
  await writeFile(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2));
  const markdown = [
    '# Windows installed-app cloud pilot', '', `Status: ${report.status}`, `Tested commit: ${report.commit}`, `Head commit: ${report.headCommit}`, `Base commit: ${report.baseCommit ?? 'not a PR'}`, `Event: ${report.event ?? 'local'}`, `Run: ${runId}`, `Attempt: ${report.runAttempt}`, `Version: ${report.version}`, '',
    '## Evidence', ...report.checks.map(value => `- ${value.status}: ${value.name} (${value.durationMs}ms)`), '',
    '## Screenshots', ...report.screenshots.map(name => `- [${name}](${name})`), '',
    '## Coverage boundaries', ...report.limitations.map(value => `- ${value}`), '',
    ...(report.failure ? ['## Failure', report.failure] : []),
  ].join('\n');
  await writeFile(path.join(reportDirectory, 'report.md'), markdown);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, markdown);
  console.log(`PILOT_RESULT ${report.status} checks=${report.checks.filter(value => value.status === 'passed').length}/${report.checks.length}`);
  console.log(JSON.stringify(await inspectPilotArtifacts(reportDirectory)));
}
