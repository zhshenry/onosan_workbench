import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { GameWorkbench, inside } from '../electron/game-workbench';
import { GAME_TASKS, gameResultStale, gameProblemReport } from '../shared/game-contracts';

async function port() {
  const server = createServer();
  await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
  const value = (server.address() as { port: number }).port;
  await new Promise<void>(done => server.close(() => done()));
  return value;
}
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const directory = await mkdtemp(join(tmpdir(), 'ono-game-unit-'));
  const root = join(directory, 'project');
  for (const folder of ['ui-preview', 'tests', 'cases']) await mkdir(join(root, folder), { recursive: true });
  await writeFile(join(root, 'ui-preview', 'index.html'), '<title>Fixture detective</title>game');
  await writeFile(join(root, 'private.txt'), 'OUTSIDE_WEB_ROOT');
  for (const task of GAME_TASKS) await writeFile(join(root, task.script), `console.log(${JSON.stringify(task.label + ' passed')});`);
  const game = new GameWorkbench({ dataDir: join(directory, 'data'), appRoot: resolve('.'), root, runtime: process.execPath, edgePath: join(root, 'private.txt') });
  await game.initialize();
  await game.configure({ ...game.snapshot().config, port: await port() });
  t.after(async () => { await game.dispose(); assert(inside(tmpdir(), directory)); await rm(directory, { recursive: true, force: true }); });
  return { game, root, directory };
}
async function settled(game: GameWorkbench, predicate = () => !game.snapshot().running) {
  const deadline = Date.now() + 12000;
  while (!predicate()) { assert(Date.now() < deadline, 'test execution should settle'); await delay(25); }
}

test('local HTTP serves only the configured web root, no cache; stop does not leave the port open', async t => {
  const { game } = await fixture(t);
  const state = await game.start();
  assert.equal(state.service.owned, true);
  const response = await fetch(state.service.url);
  assert.match(await response.text(), /Fixture detective/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const base = new URL(state.service.url).origin;
  assert.notEqual((await fetch(base + '/%2e%2e%2fprivate.txt')).status, 200);
  assert.equal((await fetch(base + '/index.html', { method: 'POST' })).status, 405);
  await assert.rejects(game.configure(state.config), /停止/);
  await game.stop();
  await assert.rejects(fetch(state.service.url));
});

test('port conflicts remain errors until explicitly connected; disconnect does not stop an external server', async t => {
  const first = await fixture(t), second = await fixture(t);
  const running = await first.game.start();
  await second.game.configure({ ...second.game.snapshot().config, port: running.config.port });
  assert.equal((await second.game.start()).service.phase, 'error');
  assert.equal((await second.game.connect()).service.owned, false);
  await second.game.stop();
  assert.equal((await fetch(running.service.url)).status, 200);
});

test('quick checks use fixed scripts and real exit codes, continue after a failure, retain output and detect code changes', async t => {
  const { game, root, directory } = await fixture(t);
  await writeFile(join(root, 'tests/progress.cjs'), 'console.error("AssertionError: save fixture"); process.exitCode = 1;');
  const first = game.run('quick');
  await assert.rejects(game.run('rules'), /已有测试/);
  await first; await settled(game);
  let state = game.snapshot();
  assert.equal(state.results.rules?.status, 'passed');
  assert.equal(state.results.progress?.status, 'failed');
  assert.match(state.results.progress!.output, /save fixture/);
  assert.equal(state.results.loading?.status, 'passed');
  assert.equal(gameResultStale(state.results.rules, state.revision), false);
  await writeFile(join(root, 'ui-preview/index.html'), '<title>Changed</title>');
  await game.refreshSource(); state = game.snapshot();
  assert.equal(gameResultStale(state.results.rules, state.revision), true);
  assert.match(gameProblemReport(state, state.results.progress!, 'http://127.0.0.1/', '390×844', '复现步骤'), /待重测/);
  assert.match(gameProblemReport(state, state.results.progress!, '', '', '复现步骤'), /复现步骤/);
  const saved = JSON.parse(await readFile(join(directory, 'data/state.json'), 'utf8'));
  assert.equal(saved.results.loading.status, 'passed');
  await assert.rejects(game.run('not-a-script' as never));
});

test('cancellation terminates the owned process and leaves unstarted tasks idle', async t => {
  const { game, root } = await fixture(t);
  await writeFile(join(root, 'cases/validate-game.cjs'), 'console.log("READY"); setInterval(() => {}, 1000);');
  await game.run('quick');
  await settled(game, () => game.snapshot().results.rules?.output.includes('READY') ?? false);
  await game.cancel();
  assert.equal(game.snapshot().results.rules?.status, 'cancelled');
  assert.equal(game.snapshot().results.progress?.status, 'idle');
  assert.equal(game.snapshot().running, false);
});

test('full checks require a service and save actual generated attachments in the run directory', async t => {
  const { game, root, directory } = await fixture(t);
  await game.run('full'); await settled(game);
  assert.equal(game.snapshot().results.playthrough?.status, 'unavailable');
  await writeFile(join(root, 'tests/game.e2e.cjs'), `require('node:fs').writeFileSync(require('node:path').join(require('node:os').tmpdir(), 'checkpoint.png'), Buffer.from('89504e470d0a1a0a','hex')); console.log('COMPLETE');`);
  await game.start(); await game.run('full'); await settled(game);
  const result = game.snapshot().results.playthrough!;
  assert.equal(result.status, 'passed');
  assert.equal(result.artifacts.length, 1);
  assert(inside(join(directory, 'data'), await game.artifactPath(result.artifacts[0].id)));
  const report = gameProblemReport(game.snapshot(), { ...result, output: 'x'.repeat(64000) }, '', '390×844');
  assert.match(report, /checkpoint\.png/);
  assert(report.length < 20000, 'long output must fit the clipboard limit and retain attachment references');
  await assert.rejects(game.artifactPath('../../private.txt'));
  await assert.rejects(game.capture('not a PNG'));
});
