import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { _electron as electron } from 'playwright';
import { findRelease, hashFile } from './release-assets.mjs';

assert.ok(process.platform === 'win32' && process.env.GITHUB_ACTIONS === 'true' && process.env.RUNNER_ENVIRONMENT === 'github-hosted', 'Use a fresh GitHub-hosted Windows runner; never run a real upgrade on a developer profile.');
const tag = process.env.WORKBENCH_RELEASE_TAG;
const from = process.env.WORKBENCH_UPGRADE_FROM;
assert.match(tag ?? '', /^v\d+\.\d+\.\d+$/);
assert.match(from ?? '', /^v\d+\.\d+\.\d+$/);
const numbers = value => value.slice(1).split('.').map(Number);
assert.ok(numbers(from).some((value, index) => value < numbers(tag)[index] && numbers(from).slice(0, index).every((previous, i) => previous === numbers(tag)[i])), 'Baseline must be older than the target.');
const repo = 'zhshenry/onosan_workbench';
const directory = path.resolve(process.env.WORKBENCH_RELEASE_DOWNLOAD_DIR, `${tag}-published`);
const verified = JSON.parse(readFileSync(path.join(directory, 'verification.json'), 'utf8'));
assert.equal(verified.status, 'passed'); assert.equal(verified.tag, tag); assert.equal(verified.draft, false);
const targetAsset = verified.assets.find(asset => asset.name === `Ono-Workbench-Setup-${tag.slice(1)}-x64.exe`);
assert.ok(targetAsset && await hashFile(targetAsset.file) === targetAsset.sha256);
const reportDirectory = path.resolve('test-results/release-validation');
mkdirSync(reportDirectory, { recursive: true });
const root = path.join(process.env.RUNNER_TEMP, `ono-upgrade-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`);
assert.equal(existsSync(root), false, 'Refusing to reuse an upgrade installation.');
assert.equal(existsSync(path.join(process.env.APPDATA, 'To-Do-List/tasks.db')), false, 'The hosted profile must have no existing tasks.');
assert.equal(existsSync(path.join(process.env.LOCALAPPDATA, 'onosan-workbench-updater')), false, 'Updater cache must be fresh.');
mkdirSync(root, { recursive: true });
const installDirectory = path.join(root, 'Ono Workbench');
const executablePath = path.join(installDirectory, 'Ono Workbench.exe');
const nativeScript = path.resolve('tooling/windows-upgrade-native.ps1');
const report = { status: 'running', tag, from, workflowCommit: process.env.GITHUB_SHA, runId: process.env.GITHUB_RUN_ID, runAttempt: process.env.GITHUB_RUN_ATTEMPT, checks: [], errors: [], assets: verified.assets.map(({ name, size, sha256 }) => ({ name, size, sha256 })), limitations: ['Browser plugin not available; Playwright Electron used.', 'Assisted NSIS wizard uses native Windows controls on a disposable runner; no UAC or SmartScreen assessment.', 'Public GitHub feed and normal updater handlers are unchanged. Data is checked in an instrumented relaunch after the automatic restart has been observed and closed normally.'] };
const run = (command, args, inherit = false) => {
  const result = spawnSync(command, args, { encoding: 'utf8', stdio: inherit ? 'inherit' : 'pipe', windowsHide: true });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr); return result.stdout?.trim() ?? '';
};
const check = async (name, action) => {
  try { await action(); report.checks.push({ name, status: 'passed' }); console.log(`UPGRADE_PASS ${name}`); }
  catch (error) { report.checks.push({ name, status: 'failed', error: String(error) }); throw error; }
};
let application; let page;
const screenshot = name => page.screenshot({ path: path.join(reportDirectory, name), animations: 'disabled' });
async function launch(version) {
  const env = { ...process.env };
  for (const key of ['WORKBENCH_TEST_DATA_DIR', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL', 'WORKBENCH_ISOLATED', 'ELECTRON_RUN_AS_NODE']) delete env[key];
  application = await electron.launch({ executablePath, cwd: installDirectory, args: ['--force-device-scale-factor=1'], env, timeout: 60000 });
  page = await application.firstWindow(); page.setDefaultTimeout(20000);
  page.on('pageerror', error => report.errors.push(error.message));
  await page.locator('#view-home').waitFor();
  const collapseAi = page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true });
  if (await collapseAi.isVisible()) {
    await collapseAi.click();
    await page.locator('#workbench-ai-panel').waitFor({ state: 'hidden' });
  }
  const identity = await application.evaluate(({ app }) => ({ version: app.getVersion(), isPackaged: app.isPackaged, executable: process.execPath, userData: app.getPath('userData'), appData: app.getPath('appData') }));
  assert.equal(identity.version, version); assert.equal(identity.isPackaged, true);
  assert.equal(identity.executable.toLowerCase(), executablePath.toLowerCase());
  const updater = await page.evaluate(() => window.workbench.updater.status());
  assert.equal(updater.enabled, true, 'Exercise the real installed updater.');
  return identity;
}
try {
  await check('Verify the target is still the public Latest release', async () => {
    const latest = JSON.parse(run('gh', ['api', `repos/${repo}/releases/latest`]));
    assert.equal(latest.tag_name, tag); assert.equal(latest.id, verified.releaseId);
  });
  await check('Download and hash the official older installer; install into a disposable directory', async () => {
    const release = findRelease(run, 'gh', repo, from);
    assert.ok(release && !release.draft && !release.prerelease);
    const name = `Ono-Workbench-Setup-${from.slice(1)}-x64.exe`;
    const asset = release.assets.find(value => value.name === name);
    assert.match(asset?.digest ?? '', /^sha256:[a-f0-9]{64}$/);
    const baseline = path.join(root, name);
    run('curl.exe', ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--max-time', '900', '--output', baseline, `https://github.com/${repo}/releases/download/${from}/${name}`], true);
    assert.equal(statSync(baseline).size, asset.size); assert.equal(await hashFile(baseline), asset.digest.slice(7));
    report.baseline = { name, sha256: asset.digest.slice(7), size: asset.size };
    run('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', nativeScript, '-Mode', 'Install', '-Installer', baseline, '-InstallDirectory', installDirectory], true);
  });
  await check('Launch the unmodified older installed app with its real updater enabled', async () => { report.before = await launch(from.slice(1)); });
  const title = `Upgrade acceptance ${process.env.GITHUB_RUN_ID}`;
  let taskId;
  await check('Create a persisted task and choose exit-on-close through the old UI', async () => {
    assert.equal((await page.evaluate(() => window.workbench.todo.state())).tasks.length, 0);
    await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: '新增事项', exact: true });
    await dialog.getByRole('textbox', { name: '待办名称', exact: true }).fill(title);
    await dialog.getByRole('button', { name: '创建', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    taskId = (await page.evaluate(() => window.workbench.todo.state())).tasks.find(task => task.title === title).id;
    await page.locator('.rail [data-workbench="settings"]').click();
    if (!await page.getByRole('button', { name: '退出应用', exact: true }).isVisible()) await page.locator('.tree').getByRole('button', { name: /^(?:通用与外观|通用&外观)$/ }).click();
    await page.getByRole('button', { name: '退出应用', exact: true }).click();
    await page.waitForFunction(() => window.workbench.settings.get().then(value => value.closeAction === 'exit'));
  });
  await check('Use the real update UI and download the public target version', async () => {
    await page.locator('.topbar-update').click();
    const panel = page.getByRole('dialog', { name: '应用更新', exact: true });
    const initial = await page.evaluate(() => window.workbench.updater.status());
    if (['idle', 'error', 'latest'].includes(initial.phase)) await panel.getByRole('button', { name: '检查更新', exact: true }).click();
    const deadline = Date.now() + 900000;
    let lastPhase;
    while (Date.now() < deadline) {
      const status = await page.evaluate(() => window.workbench.updater.status());
      if (status.phase !== lastPhase) { console.log(`UPGRADE_UPDATE_STATE ${JSON.stringify(status)}`); lastPhase = status.phase; }
      assert.notEqual(status.phase, 'error', status.message);
      if (status.phase === 'ready') { assert.equal(status.version, tag.slice(1)); report.downloadStatus = status; break; }
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.ok(report.downloadStatus, 'Real updater download timed out.');
    await panel.getByRole('button', { name: '重启并安装', exact: true }).waitFor();
    const pending = path.join(process.env.LOCALAPPDATA, 'onosan-workbench-updater/pending');
    const installers = readdirSync(pending).filter(name => name.endsWith('.exe'));
    assert.equal(installers.length, 1);
    report.updaterDownloadedSha256 = await hashFile(path.join(pending, installers[0]));
    assert.equal(report.updaterDownloadedSha256, targetAsset.sha256, 'The updater must install the exact verified public package.');
    await screenshot('created.png');
  });
  await check('Click restart-and-install, complete the real wizard and observe automatic restart', async () => {
    const nativeReport = path.join(root, 'native.json');
    const helper = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', nativeScript, '-Mode', 'CompleteUpdate', '-InstallDirectory', installDirectory, '-TargetVersion', tag.slice(1), '-Report', nativeReport], { stdio: 'inherit', windowsHide: true });
    const finished = new Promise((resolve, reject) => { helper.once('error', reject); helper.once('exit', code => code === 0 ? resolve() : reject(new Error(`Native update pilot exited ${code}`))); });
    // Attach the handler before clicking; the original app quits during the action.
    const exited = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Old app did not quit for installation.')), 30000);
      application.process().once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Old app exit ${code}`)); });
    });
    await Promise.all([exited, page.getByRole('dialog', { name: '应用更新', exact: true }).getByRole('button', { name: '重启并安装', exact: true }).click(), finished]);
    application = undefined; page = undefined;
    report.native = JSON.parse(readFileSync(nativeReport, 'utf8').replace(/^\uFEFF/, ''));
    assert.equal(report.native.status, 'passed');
  });
  await check('Relaunch the updated app and verify version, task identity and setting preservation', async () => {
    report.after = await launch(tag.slice(1));
    assert.equal(report.after.userData, report.before.userData);
    const tasks = (await page.evaluate(() => window.workbench.todo.state())).tasks;
    assert.equal(tasks.length, 1); assert.equal(tasks[0].id, taskId); assert.equal(tasks[0].title, title);
    assert.equal((await page.evaluate(() => window.workbench.settings.get())).closeAction, 'exit');
    assert.deepEqual(report.errors, []);
    await screenshot('relaunched.png');
    await application.close(); application = undefined; page = undefined;
  });
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.error = String(error);
  if (page && !page.isClosed()) await screenshot('failure.png').catch(() => {});
  process.exitCode = 1; console.error(error);
} finally {
  if (application) await application.close().catch(() => {});
  writeFileSync(path.join(reportDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  writeFileSync(path.join(reportDirectory, 'install.json'), JSON.stringify(verified, null, 2) + '\n');
  console.log(`UPGRADE_RESULT ${report.status} checks=${report.checks.filter(check => check.status === 'passed').length}/${report.checks.length}`);
}
