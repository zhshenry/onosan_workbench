import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { unzipSync } from 'fflate';
import { GameIssues } from '../electron/game-issues';
import { DEFAULT_GAME_CONFIG, type GameState } from '../shared/game-contracts';
import { type GameIssueDraft } from '../shared/game-issues';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j5HkAAAAASUVORK5CYII=', 'base64');
async function fixture(t: { after(fn: () => Promise<void>): void }) {
  const root = await mkdtemp(join(tmpdir(), 'ono-issues-')), data = join(root, 'data'), screenshot = join(data, 'capture.png');
  await mkdir(data); await writeFile(screenshot, png);
  t.after(async () => { assert(!relative(tmpdir(), root).startsWith('..')); await rm(root, { recursive: true, force: true }); });
  const state: GameState = { config: DEFAULT_GAME_CONFIG, revision: 'rev-1', sourceError: '', online: { url: 'https://example.com/game/', check: { url: 'https://example.com/game/', status: 'passed', message: 'HTTP 200', httpStatus: 200 } }, service: { phase: 'running', owned: true, url: 'http://127.0.0.1:8765/', message: 'ready' }, running: false,
    captures: [{ id: 'capture', name: '试玩截图', file: screenshot, environment: 'local' }], logs: ['12:00 本地服务已就绪'],
    results: { rules: { id: 'result-1', taskId: 'rules', status: 'failed', revision: 'rev-1', root: DEFAULT_GAME_CONFIG.root, url: 'http://127.0.0.1:8765/', startedAt: 1, finishedAt: 2, exitCode: 1, output: 'FAIL rule A', message: '规则不满足', artifacts: [] } } };
  const draft: GameIssueDraft = { title: '勘查笔记没有更新', steps: '进入案件并点击物证', expected: '显示新物证', actual: '笔记仍为空', environment: 'local', pageUrl: 'http://127.0.0.1:8765/scene.html?case=N1', viewport: 'desktop', zoom: 1, profile: 'keep', taskId: 'rules', screenshotIds: ['capture'], includeTest: true, includeLogs: true };
  return { root, data, screenshot, state, draft, store: new GameIssues(data), resolve: async () => screenshot };
}
test('saved issue reopens after restart and keeps immutable screenshot, output and log copies', async t => {
  const { store, state, draft, data, screenshot, resolve } = await fixture(t);
  const saved = await store.save(draft, state, resolve);
  await writeFile(screenshot, 'replaced source'); state.results.rules!.output = 'PASS after repair'; state.logs.push('later log');
  const restarted = new GameIssues(data), read = await restarted.read(saved.id);
  assert.equal(read.test?.output, 'FAIL rule A'); assert.deepEqual(read.logs, ['12:00 本地服务已就绪']);
  assert.deepEqual(await readFile(await restarted.imagePath(saved.id, 'capture')), png);
  assert.deepEqual((await restarted.list()).map(item => item.id), [saved.id]);
  assert.match(await readFile(join(saved.directory, 'report.md'), 'utf8'), /screenshots\/1.png/);
});
test('ZIP contains actual evidence and fixed relative files, excluding unrelated content', async t => {
  const { store, draft, state, resolve } = await fixture(t);
  const saved = await store.save(draft, state, resolve);
  await writeFile(join(saved.directory, 'unrelated.txt'), 'must not export');
  const zipped = unzipSync(await store.archive(saved.id));
  assert.deepEqual(Object.keys(zipped).sort(), ['issue.json', 'report.md', 'screenshots/1.png', 'service-log.txt', 'test-output.txt'].map(name => `${saved.id}/${name}`).sort());
  assert.deepEqual(Buffer.from(zipped[`${saved.id}/screenshots/1.png`]), png);
  assert.equal(Buffer.from(zipped[`${saved.id}/test-output.txt`]).toString(), 'FAIL rule A');
});
test('invalid fields, unknown/cross-environment screenshots and partial copies never create an issue', async t => {
  const { store, draft, state, resolve } = await fixture(t);
  for (const patch of [{ title: ' ' }, { pageUrl: 'file:///secret' }, { screenshotIds: ['unknown'] }, { screenshotIds: ['capture', 'capture'] }, { includeTest: true, taskId: undefined }]) await assert.rejects(store.save({ ...draft, ...patch }, state, resolve));
  state.captures[0].environment = 'online'; state.captures[0].siteUrl = state.online.url;
  await assert.rejects(store.save(draft, state, resolve), /当前试玩环境/);
  assert.deepEqual(await readdir(store.directory), []);
  state.captures[0].environment = 'local';
  await assert.rejects(store.save(draft, state, async () => { throw Error('missing image'); }), /missing image/);
  assert.deepEqual(await readdir(store.directory), []);
});
test('online issue retains only online check and same-site images; local evidence cannot be attached', async t => {
  const { store, state, draft, resolve } = await fixture(t);
  state.captures[0] = { ...state.captures[0], environment: 'online', siteUrl: state.online.url };
  const online = { ...draft, environment: 'online', pageUrl: state.online.url, includeTest: false, includeLogs: false };
  const saved = await store.save(online, state, resolve);
  assert.equal(saved.test, null); assert.deepEqual(saved.logs, []); assert.equal(saved.revision, ''); assert.equal(saved.onlineCheck?.httpStatus, 200);
  await assert.rejects(store.save({ ...online, includeLogs: true }, state, resolve), /本地测试和服务日志/);
  state.online.url = 'https://another.example/game/';
  await assert.rejects(store.save(online, state, resolve), /当前试玩环境/);
});
test('read/export rejects traversal, forged manifests and screenshot junction escapes', async t => {
  const { store, state, draft, root, resolve } = await fixture(t);
  const saved = await store.save(draft, state, resolve);
  for (const input of ['../secret', root, 'TD-20261017-../../file']) await assert.rejects(store.read(input));
  await rm(join(saved.directory, 'screenshots'), { recursive: true });
  const outside = join(root, 'outside'); await mkdir(outside); await writeFile(join(outside, '1.png'), png);
  await symlink(outside, join(saved.directory, 'screenshots'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(store.imagePath(saved.id, 'capture'), /路径无效/);
  await assert.rejects(store.archive(saved.id), /路径无效/);
  await writeFile(join(saved.directory, 'issue.json'), JSON.stringify({ ...saved, images: [{ id: 'capture', name: 'unsafe', file: '../outside/1.png' }] }));
  await assert.rejects(store.read(saved.id));
});
test('text-only and simultaneous submissions create separate complete records', async t => {
  const { store, state, draft, resolve } = await fixture(t);
  const text = { ...draft, screenshotIds: [], includeTest: false, includeLogs: false };
  const [a, b] = await Promise.all([store.save(text, state, resolve), store.save(text, state, resolve)]);
  assert.notEqual(a.id, b.id); assert.equal((await store.list()).length, 2);
  assert.deepEqual(Object.keys(unzipSync(await store.archive(a.id))).sort(), [`${a.id}/issue.json`, `${a.id}/report.md`]);
});
