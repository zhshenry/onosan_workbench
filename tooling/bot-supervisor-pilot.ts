import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { connectHost, type BotPeer } from '../electron/bot-transport';
import { hostSupervisionState, setHostSupervision } from '../electron/bot-supervisor';

const require = createRequire(import.meta.url), execute = promisify(execFile);
const output = resolve('test-results/bot-supervisor'); mkdirSync(output, { recursive: true });
const root = mkdtempSync(join(output, 'data-')), directory = join(root, 'OnoWorkbench', 'isolated');
const report = { passed: false, checks: [] as string[], error: '', root, firstPid: 0, recoveredPid: 0 };
const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: root, WORKBENCH_ISOLATED: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_DEV_URL', 'WORKBENCH_SMOKE']) delete env[key];
let ui: Awaited<ReturnType<typeof electron.launch>> | undefined, peer: BotPeer | undefined;
const args = [resolve('.'), '--bot-host', '--bot-data-dir', directory, '--bot-todo-db', join(root, 'To-Do-List', 'tasks.db')];
const surface = { id: 'supervisor-pilot', kind: 'main' };
const bot = <T = any>(method: string, ...args: unknown[]) => peer!.call<T>('bot', [method, args, surface]);
const pause = (ms: number) => new Promise(r => setTimeout(r, ms));
const record = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`); };
try {
  ui = await electron.launch({ executablePath: require('electron'), args: [resolve('.')], env, chromiumSandbox: true, timeout: 45000 });
  let page = ui.windows().find(p => /\/dist\/index\.html$/.test(p.url()));
  for (let i = 0; !page && i < 100; i++) { await pause(100); page = ui.windows().find(p => /\/dist\/index\.html$/.test(p.url())); }
  assert.ok(page); await page.waitForFunction(() => !!window.workbench?.bot);
  const enabled = await page.evaluate(() => window.workbench.bot.setBackground(true));
  assert.equal(enabled.supervised, true); assert.equal(await hostSupervisionState(directory), 'Running');
  report.firstPid = enabled.pid; record('UI enables real Windows supervised Host');
  peer = await connectHost(directory);
  const cards = await bot('list'), coordinator = cards.find((b: any) => b.seedKey === 'coordinator');
  await bot('saveSchedule', { id: randomUUID(), botId: coordinator.id, title: '退出界面后的独立调度', prompt: '仅用于隔离验收', enabled: true, spec: { kind: 'once', at: new Date(Date.now() + 4000).toISOString() }, revision: 0 });
  await ui.close(); ui = undefined;
  let tasks: any[] = [];
  for (let i = 0; i < 80; i++) { tasks = await bot('listTasks', coordinator.id); if (tasks.length) break; await pause(250); }
  assert.equal(tasks.length, 1); assert.ok(['queued', 'waiting_resource'].includes(tasks[0].status));
  assert.equal((await bot('getHostState')).pid, report.firstPid); record('UI exit leaves Host alive and schedule fires exactly once');
  const duplicate = spawn(require('electron'), args, { env, windowsHide: true, stdio: 'ignore' });
  const duplicateExit = await Promise.race([new Promise(resolve => duplicate.once('exit', resolve)), pause(15000).then(() => 'timeout')]);
  if (duplicateExit === 'timeout') { duplicate.kill(); throw new Error('Second Host did not exit'); }
  assert.equal(duplicateExit, 0); assert.equal((await bot('getHostState')).pid, report.firstPid); record('second Host exits without a second writer');
  const ownership = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `(Get-CimInstance Win32_Process -Filter "ProcessId=${report.firstPid}").CommandLine`], { windowsHide: true });
  assert.ok(ownership.stdout.includes(directory), 'crash only this isolated Host');
  process.kill(report.firstPid); peer.close(); peer = undefined;
  for (let i = 0; i < 90; i++) { await pause(1500); try { peer = await connectHost(directory); const state = await bot('getHostState'); if (state.pid !== report.firstPid) { report.recoveredPid = state.pid; break; } } catch { peer?.close(); peer = undefined; } }
  assert.ok(report.recoveredPid); assert.equal(await hostSupervisionState(directory), 'Running'); record('Windows restarts crashed Host without UI');
  tasks = await bot('listTasks', coordinator.id); assert.equal(tasks.length, 1); assert.equal(tasks[0].status, 'waiting_resource'); record('recovery preserves original task without duplicate firing');
  report.passed = true;
} catch (error) { report.error = error instanceof Error ? error.stack ?? error.message : String(error); throw error; }
finally {
  if (ui) await ui.close().catch(() => {});
  await setHostSupervision(directory, require('electron'), args, false);
  if (!peer) try { peer = await connectHost(directory); } catch { /* Already stopped. */ }
  await peer?.call('shutdown', [], 15000).catch(() => {}); peer?.close();
  assert.equal(await hostSupervisionState(directory), 'Missing');
  writeFileSync(join(output, 'report.json'), JSON.stringify(report, null, 2));
}
