import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { finalizePilot, failurePage, terminatePilotProcess } from '../tooling/pilot-cleanup.mjs';

function fixture(close: () => Promise<void>) {
  const report = { status: 'failed', failure: 'Original selector failure', errors: [] as string[] };
  const saved: any[] = [];
  const child = { pid: 123 };
  return { report, saved, child, application: { close, process: () => child },
    saveReport: async () => { saved.push(structuredClone(report)); }, executablePath: 'synthetic-installed.exe',
    closeTimeoutMs: 15, killTimeoutMs: 15 };
}

test('successful close writes original report before cleanup and finished report afterward', async () => {
  const events: string[] = [];
  const value = fixture(async () => { events.push('close'); assert.equal(value.saved.length, 1); });
  const save = value.saveReport;
  await finalizePilot({ ...value, saveReport: async () => { events.push('save'); await save(); },
    terminate: async () => assert.fail('No fallback after successful close') });
  assert.deepEqual(events, ['save', 'close', 'save']);
  assert.equal(value.saved[0].finishedAt, undefined);
  assert.ok(value.saved.at(-1).finishedAt);
  assert.equal(value.report.failure, 'Original selector failure');
  assert.deepEqual(value.report.errors, []);
});

for (const mode of ['hanging', 'rejecting']) test(`${mode} close is bounded and falls back without replacing original failure`, async () => {
  const value = fixture(mode === 'hanging' ? () => new Promise(() => {}) : async () => { throw new Error('close rejected'); });
  let terminated = false;
  await finalizePilot({ ...value, terminate: async (child: object, executable: string) => {
    assert.equal(child, value.child); assert.equal(executable, value.executablePath);
    assert.equal(value.saved[0].failure, 'Original selector failure');
    assert.match(value.saved.at(-1).errors[0], mode === 'hanging' ? /timed out/ : /close rejected/);
    terminated = true;
  } });
  assert.equal(terminated, true);
  assert.equal(value.report.failure, 'Original selector failure');
  assert.equal(value.report.status, 'failed');
  assert.equal(value.saved.at(-1).cleanup.status, 'fallback-completed');
});

test('fallback failure is recorded truthfully and preserves original error', async () => {
  const value = fixture(async () => { throw new Error('close rejected'); });
  await finalizePilot({ ...value, terminate: async () => { throw new Error('termination denied'); } });
  assert.equal(value.saved.at(-1).cleanup.status, 'fallback-failed');
  assert.match(value.report.errors[1], /termination denied/);
  assert.equal(value.report.failure, 'Original selector failure');
});

test('cleanup failure also fails an otherwise passing pilot', async () => {
  const value = fixture(async () => { throw new Error('close rejected'); });
  value.report.status = 'passed';
  await finalizePilot({ ...value, terminate: async () => {} });
  assert.equal(value.report.status, 'failed');
});

test('fallback refuses an unrelated process or invalid pid', async () => {
  await assert.rejects(terminatePilotProcess({ pid: 42, exitCode: null, signalCode: null, spawnfile: 'other.exe' }, 'pilot.exe'), /Refusing termination/);
  await assert.rejects(terminatePilotProcess({ pid: 0, exitCode: null, signalCode: null, spawnfile: 'pilot.exe' }, 'pilot.exe'), /Refusing termination/);
});

test('floating failure captures live float window; other failures retain main window', () => {
  const main = { isClosed: () => false, url: () => 'file:///main.html' };
  const float = { isClosed: () => false, url: () => 'file:///main.html?window=float' };
  const application = { windows: () => [main, float] };
  assert.equal(failurePage(application, main, 'Floating group: compact association'), float);
  assert.equal(failurePage(application, main, 'Core task flow'), main);
  assert.equal(failurePage({ windows: () => [main] }, main, 'Floating group: launch'), main);
});

test('pending close with live handles cannot keep the finalized runner alive', async () => {
  const moduleUrl = new URL('../tooling/pilot-cleanup.mjs', import.meta.url).href;
  const script = `
    import { finalizePilot, exitPilot } from ${JSON.stringify(moduleUrl)};
    const report = { status: 'failed', failure: 'original', errors: [] };
    let saved = 0;
    await finalizePilot({ report, saveReport: async () => { saved++; },
      application: { process: () => ({ pid: 1 }), close: () => { setInterval(() => {}, 1000); return new Promise(() => {}); } },
      closeTimeoutMs: 10, terminate: async () => {} });
    if (saved !== 3 || report.failure !== 'original' || !report.finishedAt) process.exit(9);
    exitPilot(report.status);
  `;
  const result = await new Promise<any>(resolve => execFile(process.execPath, ['--input-type=module', '-e', script], { timeout: 3000 }, (error, stdout, stderr) => resolve({ error, stdout, stderr })));
  assert.equal(result.error?.code, 1, result.stderr);
  assert.equal(result.error?.killed, false);
});

test('Windows entry persists before screenshot and exits only after final report and artifact inspection', async () => {
  const source = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.ok(source.indexOf('await saveReport().catch(saveError') < source.indexOf("screenshot('failure.png', capturePage)"));
  assert.ok(source.indexOf('await finalizePilot(') < source.indexOf('await inspectPilotArtifacts('));
  assert.ok(source.indexOf('await inspectPilotArtifacts(') < source.indexOf('exitPilot(report.status)'));
});

for (const failingSave of [1, 2, 'all']) test(`report save failure ${failingSave} cannot skip bounded close or termination`, async () => {
  let closed = false;
  let terminated = false;
  let saves = 0;
  const value = fixture(async () => { closed = true; throw new Error('close rejected'); });
  const action = finalizePilot({ ...value, saveReport: async () => {
    saves++;
    if (failingSave === 'all' || saves === failingSave) throw new Error('disk unavailable');
  }, terminate: async () => { terminated = true; } });
  if (failingSave === 'all') await assert.rejects(action, /disk unavailable/);
  else await action;
  assert.equal(closed, true);
  assert.equal(terminated, true);
  assert.equal(saves, 3);
  assert.equal(value.report.failure, 'Original selector failure');
  assert.equal(value.report.status, 'failed');
  assert.ok(value.report.errors.some(error => /Report write before cleanup:.*disk unavailable/.test(error)));
});

test('normal-exit acceptance observes real zero-code exits and clears application only on success', async () => {
  const { EventEmitter } = await import('node:events');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('async function normalExit('), source.indexOf('async function showLifecycleFloat('));
  for (const exitCode of [0, 7]) {
    const child = new EventEmitter();
    const application = { process: () => child };
    const report: any = {};
    const context = { application, page: {}, report, Date, setTimeout, clearTimeout };
    const exit = runInNewContext(`${helper}; normalExit`, context);
    const action = exit('unit lifecycle', async () => { child.emit('exit', exitCode, null); });
    if (exitCode === 0) {
      await action;
      assert.equal(context.application, undefined);
      assert.equal(report.normalExits[0].exitCode, 0);
    } else {
      await assert.rejects(action, /exit code 7/);
      assert.equal(context.application, application);
      assert.equal(report.normalExits, undefined);
    }
    assert.equal(child.listenerCount('exit'), 0);
  }
  assert.match(helper, /20000/);
  assert.doesNotMatch(helper, /\.close\(|\.destroy\(|\.kill\(|terminatePilot/);
});

test('normal-exit acceptance preserves trigger failure for fallback cleanup', async () => {
  const { EventEmitter } = await import('node:events');
  const { runInNewContext } = await import('node:vm');
  const source = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  const helper = source.slice(source.indexOf('async function normalExit('), source.indexOf('async function showLifecycleFloat('));
  const child = new EventEmitter(); const application = { process: () => child };
  const context = { application, page: {}, report: {}, Date, setTimeout, clearTimeout };
  const exit = runInNewContext(`${helper}; normalExit`, context);
  await assert.rejects(exit('unit lifecycle', async () => { throw new Error('Original click failure'); }), /Original click failure/);
  assert.equal(context.application, application);
  assert.equal(child.listenerCount('exit'), 0);
});

test('exit acceptance adds four checks without changing original hidden-window exit or preferences', async () => {
  const source = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  const additions = [
    'Normal quit without any floating window exits cleanly and relaunches empty',
    'Floating group: visible native window permits normal main-window exit',
    'Floating group: repeated same-version relaunch preserves task and resets width to 440',
    'Floating group: repeated hide-show lifecycle still permits normal main-window exit',
  ];
  for (const name of additions) assert.equal(source.split(`await check('${name}'`).length - 1, 1);
  assert.ok(source.indexOf(additions[0]) < source.indexOf('await runFloatEmptyPilot('));
  assert.ok(source.includes("await check('Choose exit-on-close in settings and quit through the window close button'"));
  assert.ok(source.indexOf('await verifyFloatGroupRelaunch(') < source.indexOf(additions[1]));
  assert.match(source, /setTimeout\(\(\) => app\.quit\(\), 0\)/);
  assert.equal((source.match(/name: '退出应用', exact: true/g) ?? []).length, 1);
  assert.equal((source.match(/await normalExit\(/g) ?? []).length, 3);
  assert.doesNotMatch(source, /\.destroy\(/);
});
