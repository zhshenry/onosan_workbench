import assert from 'node:assert/strict';
import test from 'node:test';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { GameTrialResetSchema } from '../shared/game-contracts';
import type { BrowserGuests } from '../electron/browser-guests';

const require = createRequire(import.meta.url);
const code = buildSync({ stdin: { contents: "export { BrowserGuests } from './electron/browser-guests'; export { registerGameIpc } from './electron/game-ipc';", resolveDir: process.cwd() }, bundle: true, platform: 'node', format: 'cjs', external: ['electron'], write: false }).outputFiles[0].text;

function fixture() {
  const calls: { partition: string; options: unknown }[] = [], closed: string[] = [];
  const handlers = new Map<string, (event: unknown, input: unknown) => unknown>();
  let clear = async () => {}, flushes = 0;
  const sessions = new Map<string, object>();
  const electron = {
    ipcMain: { handle: (name: string, fn: (event: unknown, input: unknown) => unknown) => handlers.set(name, fn) },
    session: { fromPartition: (partition: string) => {
      if (!sessions.has(partition)) sessions.set(partition, {
        setPermissionRequestHandler() {}, setPermissionCheckHandler() {}, setDevicePermissionHandler() {}, setDisplayMediaRequestHandler() {}, on() {}, webRequest: { onBeforeRequest() {} },
        clearData: async (options: unknown) => { calls.push({ partition, options }); await clear(); },
        flushStorageData: () => { flushes++; },
      });
      return sessions.get(partition);
    } },
  };
  const module = { exports: {} as { BrowserGuests: typeof BrowserGuests; registerGameIpc: (...args: unknown[]) => void } };
  new Function('require', 'module', 'exports', code)((name: string) => name === 'electron' ? electron : require(name), module, module.exports);
  const guests = new module.exports.BrowserGuests(() => undefined);
  const owner = { mainFrame: {}, isDestroyed: () => false, send() {} };
  const state = { config: { port: 8765 }, online: { url: 'https://game.example.test/play/' } };
  module.exports.registerGameIpc({ subscribe() {}, snapshot: () => state }, { subscribe() {} }, guests, () => owner);
  const invoke = (input: unknown, sender = owner, senderFrame = sender.mainFrame) => handlers.get('game:resetTrial')!({ sender, senderFrame }, input);
  const attach = (workspace: string, tab: string, url = 'http://127.0.0.1:8765', leaseOwner = owner) => {
    const reservation = guests.acquire(leaseOwner as never, workspace, tab);
    const guest = Object.assign(new EventEmitter(), { isDestroyed: () => false, getURL: () => url, close: () => { closed.push(tab); guest.isDestroyed = () => true; queueMicrotask(() => guest.emit('destroyed')); } });
    (guests as unknown as { leases: Map<string, { guest: typeof guest }> }).leases.get(reservation.lease)!.guest = guest;
    return guest;
  };
  return { guests, owner, state, calls, closed, invoke, attach, setClear: (fn: () => Promise<void>) => { clear = fn; }, flushes: () => flushes };
}

test('reset accepts only an explicit environment and exact HTTP(S) origin, with no partition overrides', () => {
  assert.equal(GameTrialResetSchema.safeParse({ environment: 'local', origin: 'http://127.0.0.1:8765' }).success, true);
  for (const input of [
    { environment: 'default', origin: 'https://game.example.test' },
    { environment: 'local', origin: 'http://127.0.0.1:8765/index.html' },
    { environment: 'online', origin: 'https://user:pass@game.example.test' },
    { environment: 'local', origin: 'file:///C:/game' },
    { environment: 'local', origin: '' },
    { environment: 'online', origin: 'https://game.example.test', partition: 'persist:default' },
  ]) assert.equal(GameTrialResetSchema.safeParse(input).success, false);
});

test('reset IPC rejects child windows, subframes and stale site confirmations before touching storage', async () => {
  const f = fixture(), input = { environment: 'local', origin: 'http://127.0.0.1:8765' };
  assert.throws(() => f.invoke(input, { ...f.owner }), /主窗口/);
  assert.throws(() => f.invoke(input, f.owner, {}), /主窗口/);
  f.state.config.port = 9000;
  await assert.rejects(Promise.resolve().then(() => f.invoke(input)), /站点已变化/);
  await assert.rejects(Promise.resolve().then(() => f.invoke({ environment: 'online', origin: 'https://other.example.test' })), /站点已变化/);
  f.state.online.url = '';
  await assert.rejects(Promise.resolve().then(() => f.invoke({ environment: 'online', origin: 'https://game.example.test' })), /站点已变化/);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.closed, []);
});

test('reset closes only the retained page before clearing the current origin and leaves other environments alive', async () => {
  const f = fixture();
  const local = f.attach('game-trail-detective', 'game-trial-keep');
  const online = f.attach('game-trail-online', 'game-trial-online-keep', 'https://game.example.test/play/');
  const fresh = f.attach('game-trail-fresh-one', 'game-trial-one');
  const browser = f.attach('default', 'browser-one');
  f.setClear(async () => { assert.equal(local.isDestroyed(), true, 'Old in-memory progress must be stopped before deletion'); });
  await f.invoke({ environment: 'local', origin: 'http://127.0.0.1:8765' });
  assert.deepEqual(f.closed, ['game-trial-keep']);
  assert.equal(online.isDestroyed(), false); assert.equal(fresh.isDestroyed(), false); assert.equal(browser.isDestroyed(), false);
  assert.deepEqual(f.calls, [{ partition: 'persist:wb-browser-game-trail-detective', options: { dataTypes: ['localStorage', 'indexedDB'], origins: ['http://127.0.0.1:8765'], originMatchingMode: 'origin-in-all-contexts' } }]);
  assert.equal(f.flushes(), 1);
});

test('a stopped or unopened trial still resets its own persistent origin, never the default browser session', async () => {
  const f = fixture();
  await f.invoke({ environment: 'online', origin: 'https://game.example.test' });
  assert.equal(f.calls[0].partition, 'persist:wb-browser-game-trail-online');
  assert.deepEqual((f.calls[0].options as { origins: string[] }).origins, ['https://game.example.test']);
  assert.deepEqual(f.closed, []);
});

test('duplicate resets and guest creation wait for deletion; failure releases the lock for retry', async () => {
  const f = fixture();
  let reject: (error: Error) => void = () => {};
  f.setClear(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
  const first = f.guests.resetGameTrial(f.owner as never, 'game-trail-detective', 'http://127.0.0.1:8765');
  await assert.rejects(f.guests.resetGameTrial(f.owner as never, 'game-trail-detective', 'http://127.0.0.1:8765'), /正在重置/);
  assert.throws(() => f.guests.acquire(f.owner as never, 'game-trail-detective', 'reopen'), /正在重置/);
  assert.doesNotThrow(() => f.guests.acquire(f.owner as never, 'game-trail-online', 'online'));
  reject(new Error('磁盘暂不可写')); await assert.rejects(first, /磁盘暂不可写/);
  assert.equal(f.flushes(), 0);
  f.setClear(async () => {});
  await f.guests.resetGameTrial(f.owner as never, 'game-trail-detective', 'http://127.0.0.1:8765');
  assert.equal(f.flushes(), 1);
  assert.doesNotThrow(() => f.guests.acquire(f.owner as never, 'game-trail-detective', 'reopen'));
});

test('cross-window leases, navigated pages and non-game partitions cannot be cleared', async () => {
  const f = fixture();
  await assert.rejects(f.guests.resetGameTrial(f.owner as never, 'default' as never, 'https://game.example.test'), /清理范围无效/);
  f.attach('game-trail-online', 'other-window', 'https://game.example.test', { ...f.owner });
  await assert.rejects(f.invoke({ environment: 'online', origin: 'https://game.example.test' }) as Promise<void>, /其他窗口/);
  f.attach('game-trail-detective', 'navigated', 'https://other.example.test');
  await assert.rejects(f.invoke({ environment: 'local', origin: 'http://127.0.0.1:8765' }) as Promise<void>, /离开配置/);
  assert.deepEqual(f.calls, []); assert.deepEqual(f.closed, []);
});
