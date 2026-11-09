import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { transformSync } from 'esbuild';
import { IslandStore } from '../electron/island-store';
import { AgentHooks } from '../electron/agent-hooks';
import { agentMessageUrl } from '../electron/agent-message-store';
import * as agentContracts from '../shared/agent-message-contracts';
import * as contracts from '../shared/island-contracts';
import { newTask } from '../shared/todo-contracts';

const require = createRequire(import.meta.url);
function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'ono-island-native-')), windows: any[] = [], handlers = new Map<string, Function>(), messages: any[] = [], notifications: any[] = [], unclaimed: any[] = [], iconRequests: any[] = [], drags: any[] = [];
  const nativeIcon = { toDataURL: () => 'data:image/png;base64,native-icon' };
  const power = new EventEmitter(), screens: any = new EventEmitter();
  let full: (value: boolean) => void = () => undefined;
  let displays = [{ id: 1, label: 'primary', workArea: { x: 0, y: 40, width: 1280, height: 1000 } }];
  let cursor = { x: 0, y: 0 };
  Object.assign(screens, { getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0], getCursorScreenPoint: () => cursor });
  class Window extends EventEmitter {
    visible = false; destroyed = false; bounds: any; focused = false; shape: any[] = []; topmost = false;
    webContents: any = new EventEmitter();
    constructor(options: any) { super(); this.bounds = options; windows.push(this); Object.assign(this.webContents, { mainFrame: {}, send: (channel: string, value: unknown) => messages.push({ owner: this, channel, value }), startDrag: (value: unknown) => drags.push(value), setWindowOpenHandler() {} }); }
    static getAllWindows() { return windows; }
    setAlwaysOnTop(value: boolean) { this.topmost = value; } loadURL() {} loadFile() {} setBounds(bounds: any) { this.bounds = bounds; }
    setShape(rects: any[]) { this.shape = rects; }
    getBounds() { return this.bounds; } isDestroyed() { return this.destroyed; }
    showInactive() { this.visible = true; } show() { this.visible = true; } hide() { this.visible = false; }
    isVisible() { return this.visible; } focus() { this.focused = true; } isMinimized() { return false; }
    destroy() { this.destroyed = true; }
  }
  class Notice extends EventEmitter { constructor(public options: any) { super(); notifications.push(this); } static isSupported() { return true; } show() {} }
  const main = new Window({}), other = new Window({});
  const electron = { app: { getFileIcon: async () => nativeIcon }, nativeImage: { createFromDataURL: () => nativeIcon }, BrowserWindow: Window, screen: screens, powerMonitor: power, Notification: Notice, ipcMain: { handle: (key: string, fn: Function) => handlers.set(key, fn), on: (key: string, fn: Function) => handlers.set(key, fn) }, shell: { beep() {}, openExternal() {} }, dialog: {} };
  const module = { exports: {} as any };
  const code = transformSync(readFileSync('electron/desktop-island.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((name: string) => name === 'electron' ? electron : name === './island-store' ? { IslandStore } : name === './agent-hooks' ? { AgentHooks: class extends AgentHooks { constructor(directory: string) { super(directory, join(directory, 'clients'), join(directory, 'clients', '.codex')); } } } : name === './agent-message-store' ? { agentMessageUrl } : name === '../shared/agent-message-contracts' ? agentContracts : name === './island-quotas' ? { IslandQuotas: class { read() { return []; } refresh() { return Promise.resolve([]); } stop() {} } } : name === './island-fullscreen' ? { watchFullscreen: (fn: typeof full) => { full = fn; return () => undefined; } } : name === './island-file-icons' ? { readIslandFileIcons: async (files: any[]) => { iconRequests.push(files.map(file => file.path)); return Object.fromEntries(files.map(file => [file.id, nativeIcon.toDataURL()])); } } : name === '../shared/island-contracts' ? contracts : require(name), module, module.exports);
  const owner = new module.exports.DesktopIsland('http://localhost', '/unused/preload.cjs', dir, () => main, { all: () => [], unclaim: (task: unknown) => unclaimed.push(task) });
  owner.register();
  const invoke = (name: string, ...args: unknown[]) => handlers.get(name)!({ sender: main.webContents, senderFrame: main.webContents.mainFrame }, ...args);
  const visibleBounds = () => { const frame = owner.window.getBounds(), region = owner.window.shape[0]; return { ...region, x: frame.x + region.x, y: frame.y + region.y }; };
  t.after(() => { owner.destroy(); rmSync(dir, { recursive: true, force: true }); });
  return { dir, owner, main, other, handlers, invoke, visibleBounds, windows, messages, notifications, unclaimed, iconRequests, nativeIcon, drags, power, screens, electron, cursor: (point: typeof cursor) => { cursor = point; }, full: (value: boolean) => full(value), displays: (value: typeof displays) => { displays = value; screens.emit('display-removed'); } };
}
const task = (kind: 'task' | 'meeting' = 'task') => ({ ...newTask('合成验收提醒'), kind, id: 'task-1', remindAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null });

test('island assistant: opens once, hides without losing its renderer, pins independently and rejects unrelated frames', t => {
  const f = fixture(t);
  f.owner.show();
  const before = f.windows.length;
  f.invoke('island:assistant', 'show');
  assert.equal(f.windows.length, before + 1);
  const assistant = f.windows.at(-1)!;
  assistant.emit('ready-to-show');
  assert.equal(assistant.visible, true); assert.equal(assistant.focused, true); assert.equal(assistant.topmost, true);
  assert.equal(assistant.bounds.webPreferences.sandbox, true);
  assistant.emit('blur'); assert.equal(assistant.visible, true);
  let prevented = false;
  assistant.emit('close', { preventDefault: () => { prevented = true; } });
  assert.equal(prevented, true); assert.equal(assistant.visible, false); assert.equal(assistant.destroyed, false);
  f.invoke('island:assistant', 'show'); assert.equal(f.windows.length, before + 1); assert.equal(assistant.visible, true);
  const own = { sender: assistant.webContents, senderFrame: assistant.webContents.mainFrame };
  assert.equal(f.handlers.get('island:assistant')!(own, 'pin').pinned, false); assert.equal(assistant.topmost, false);
  assert.equal(f.owner.state().pinned, false, 'assistant pin does not change island pin');
  assert.equal(f.handlers.get('island:state')!(own).settings.enabled, true);
  assert.throws(() => f.handlers.get('island:patch')!(own, { enabled: false }), /仅工作台/);
  assert.throws(() => f.handlers.get('island:assistant')!({ ...own, senderFrame: {} }, 'show'), /仅工作台/);
  assert.throws(() => f.handlers.get('island:assistant')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, 'show'), /仅工作台/);
  f.owner.destroy(); assert.equal(assistant.destroyed, true);
});

test('island assistant: all dock directions stay inside the selected work area, including negative coordinates and small screens', () => {
  for (const area of [{ x: -1200, y: 30, width: 1200, height: 900 }, { x: 0, y: 0, width: 320, height: 360 }]) {
    for (const dock of contracts.ISLAND_DOCKS) {
      const anchor = contracts.islandBounds('collapsed', area, 0, dock), panel = contracts.islandAssistantBounds(anchor, area, dock);
      assert.ok(panel.x >= area.x && panel.y >= area.y);
      assert.ok(panel.x + panel.width <= area.x + area.width && panel.y + panel.height <= area.y + area.height);
      if (area.width > 500 && dock === 'left') assert.ok(panel.x >= anchor.x + anchor.width);
      if (area.width > 500 && dock === 'right') assert.ok(panel.x + panel.width <= anchor.x);
    }
  }
});

test('island Agent: message canvas preserves the bar anchor at configured offsets and stays inside small work areas', () => {
  for (const area of [{ x: -800, y: 40, width: 800, height: 500 }, { x: 0, y: 0, width: 600, height: 260 }]) for (const dock of contracts.ISLAND_DOCKS) for (const offset of [0, 200, 300]) {
    const bar = contracts.islandBounds('collapsed', area, offset, dock), panel = contracts.islandBounds('messages', area, offset, dock);
    assert.ok(panel.x >= area.x && panel.y >= area.y && panel.x + panel.width <= area.x + area.width && panel.y + panel.height <= area.y + area.height);
    if (dock === 'top') assert.equal(panel.y, bar.y);
    else if (dock === 'left') assert.equal(panel.x, bar.x);
    else assert.equal(panel.x + panel.width, bar.x + bar.width);
  }
});

test('island Agent: eight seconds closes only the bubble; opening and closing the list keeps unread messages', t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: new Date('2026-11-08T10:00:00').getTime() });
  const f = fixture(t); f.owner.show();
  const inbox = join(f.dir, 'agent-inbox'); mkdirSync(inbox);
  writeFileSync(join(inbox, '1000-aa.json'), JSON.stringify({ provider: 'codex', sessionId: 'session-1', turnId: 'turn-1', kind: 'reply', occurredAt: Date.now(), title: '验证完成' }));
  f.owner.tick(); assert.equal(f.owner.state().mode, 'speech');
  assert.equal(f.owner.state().agentMessages.length, 1); assert.equal(f.owner.state().agentMessages[0].readAt, null);
  t.mock.timers.tick(8001); assert.equal(f.owner.state().mode, 'collapsed'); assert.equal(f.owner.state().agentMessages[0].readAt, null);
  const before = f.visibleBounds();
  f.invoke('island:mode', 'messages', true);
  assert.equal(f.owner.window.shape.length, 2); assert.equal(f.owner.window.getBounds().height, 400);
  assert.equal(f.visibleBounds().x, before.x); assert.equal(f.visibleBounds().y, before.y);
  t.mock.timers.tick(20000); assert.equal(f.owner.state().mode, 'messages', 'the list has no automatic expiry');
  f.invoke('island:mode', 'collapsed', true); assert.equal(f.owner.state().agentMessages[0].readAt, null);
  f.invoke('island:dismiss', f.owner.state().reminders[0].id); assert.equal(f.owner.state().agentMessages[0].readAt, null);
});

test('island Agent: read and launch are guarded; failed launch cannot discard unread/pending state', async t => {
  const f = fixture(t), message = f.owner.agents.messages.ingest({ provider: 'codex', sessionId: 'session-1', turnId: 'turn-1', kind: 'approval', requestKey: 'request-1', occurredAt: Date.now(), title: '执行验证' });
  f.owner.show();
  for (const channel of ['island:agentRead', 'island:agentOpen', 'island:agentConnect', 'island:agentConnections']) {
    assert.throws(() => f.handlers.get(channel)!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, message.id), /仅工作台/);
  }
  f.electron.shell.openExternal = () => { throw new Error('client unavailable'); };
  await assert.rejects(f.invoke('island:agentOpen', message.id), /client unavailable/);
  assert.equal(f.owner.state().agentMessages[0].readAt, null); assert.equal(f.owner.state().agentMessages[0].resolvedAt, null);
  const destinations: string[] = []; f.electron.shell.openExternal = (url: string) => { destinations.push(url); };
  await f.invoke('island:agentOpen', message.id);
  assert.deepEqual(destinations, ['codex://threads/session-1']);
  assert.ok(f.owner.state().agentMessages[0].readAt); assert.equal(f.owner.state().agentMessages[0].resolvedAt, null);
});

test('island Agent: silent when hidden or quiet, and pinned page survives a visit to messages', t => {
  const f = fixture(t);
  f.owner.notify([{ id: 'agent:one', kind: 'agent', title: 'Codex 有新回复', createdAt: Date.now() }]);
  assert.equal(f.notifications.length, 0); assert.equal(f.owner.window, null);
  f.owner.show(); f.invoke('island:patch', { dnd: true, dndStart: '00:00', dndEnd: '00:00' });
  f.owner.notify([{ id: 'agent:two', kind: 'agent', title: 'Cursor 有新回复', createdAt: Date.now() }]);
  assert.equal(f.owner.state().mode, 'collapsed');
  f.invoke('island:pin'); f.invoke('island:mode', 'messages', true);
  assert.equal(f.owner.state().pinned, true); assert.equal(f.owner.state().mode, 'messages');
  f.invoke('island:mode', 'expanded', true); assert.equal(f.owner.state().pinned, true); assert.equal(f.owner.state().mode, 'expanded');
});

test('island sedentary: authorized actions share the reminder queue and never invent a drink count', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-07T10:00:00').getTime() });
  const f = fixture(t); f.owner.show(); f.invoke('island:patch', { sedentaryEnabled: true, waterEnabled: true });
  t.mock.timers.tick(3600000); f.owner.tick();
  assert.deepEqual(f.owner.state().reminders.map((reminder: any) => reminder.kind), ['water', 'sedentary']);
  assert.equal(f.owner.state().mode, 'speech'); assert.equal(f.owner.window.focused, false);
  f.invoke('island:water', 'drink'); assert.equal(f.owner.state().mode, 'speech');
  assert.equal(f.owner.state().reminders[0].kind, 'sedentary');
  f.invoke('island:sedentary', 'snooze'); assert.equal(f.owner.state().mode, 'collapsed');
  assert.equal(f.owner.state().sedentary.nextAt, Date.now() + 600000);
  assert.equal(f.owner.state().water.count, 1);
  const before = f.owner.store.read();
  assert.throws(() => f.invoke('island:sedentary', 'invalid')); assert.deepEqual(f.owner.store.read(), before);
  assert.throws(() => f.handlers.get('island:sedentary')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, 'reset'), /仅工作台/);
  f.owner.notify([{ id: 'disable-pending', kind: 'sedentary', title: '起来走走', createdAt: Date.now() }]);
  assert.equal(f.owner.state().mode, 'speech');
  f.invoke('island:patch', { sedentaryEnabled: false });
  assert.equal(f.owner.state().reminders.length, 0); assert.equal(f.owner.state().mode, 'collapsed');
});

test('island sedentary: suspend, unlock and quiet-hours end start a fresh interval', t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-07T10:00:00').getTime() });
  const f = fixture(t); f.owner.show(); f.invoke('island:patch', { sedentaryEnabled: true });
  for (const [start, end] of [['suspend', 'resume'], ['lock-screen', 'unlock-screen']]) {
    f.owner.notify([{ id: start, kind: 'sedentary', title: '起来走走', createdAt: Date.now() }]);
    assert.equal(f.owner.state().mode, 'speech');
    f.power.emit(start); assert.equal(f.owner.state().sedentary.nextAt, null); assert.equal(f.owner.window.isVisible(), false);
    assert.equal(f.owner.state().mode, 'collapsed', 'clearing the pending activity must close its bubble');
    t.mock.timers.tick(7200000); f.owner.tick(); assert.equal(f.owner.state().reminders.length, 0);
    f.power.emit(end); assert.equal(f.owner.state().sedentary.nextAt, Date.now() + 3600000); assert.equal(f.owner.window.isVisible(), true);
  }
  f.owner.notify([{ id: 'quiet-pending', kind: 'sedentary', title: '起来走走', createdAt: Date.now() }]);
  f.invoke('island:patch', { dnd: true, dndStart: '00:00', dndEnd: '00:00' }); f.owner.tick();
  assert.equal(f.owner.state().sedentary.nextAt, null);
  assert.equal(f.owner.state().mode, 'collapsed');
  t.mock.timers.tick(7200000); f.invoke('island:patch', { dnd: false }); f.owner.tick();
  assert.equal(f.owner.state().sedentary.nextAt, Date.now() + 3600000); assert.equal(f.owner.state().reminders.length, 0);
});

test('island sedentary: hidden island keeps the activity reminder silent', t => {
  const f = fixture(t); f.owner.store.patch({ sedentaryEnabled: true, sound: true });
  f.owner.notify([{ id: 'sedentary-hidden', kind: 'sedentary', title: '到活动时间了，起来走走吧。', createdAt: Date.now() }]);
  assert.equal(f.notifications.length, 0); assert.equal(f.owner.state().reminders[0].kind, 'sedentary');
});

test('island native: stored files and shortcuts use their system icon for display and drag', async t => {
  const f = fixture(t), path = join(f.dir, 'application.lnk'); writeFileSync(path, 'shortcut fixture');
  f.owner.store.addFiles([path]); f.owner.show();
  const file = f.owner.state().files[0];
  assert.equal(await f.invoke('island:fileIcon', file.id), f.nativeIcon.toDataURL());
  assert.deepEqual(f.iconRequests, [[path]]);
  await assert.rejects(f.invoke('island:fileIcon', 'unknown'), /文件记录不存在/);
  assert.throws(() => f.handlers.get('island:fileIcon')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, file.id), /仅工作台/);
  const sender = f.owner.window.webContents;
  await f.handlers.get('island:fileDrag')!({ sender, senderFrame: sender.mainFrame }, file.id);
  assert.deepEqual(f.drags, [{ file: path, icon: f.nativeIcon }]);
  assert.equal(f.iconRequests.length, 1);
  f.owner.icons = Promise.reject(new Error('icon helper unavailable'));
  await f.handlers.get('island:fileDrag')!({ sender, senderFrame: sender.mainFrame }, file.id);
  assert.deepEqual(f.drags[1], { file: path, icon: f.nativeIcon });
});

test('island native: startup creates no extra window; explicit open preserves top center through modes', t => {
  const f = fixture(t); assert.equal(f.owner.window, null); f.owner.show();
  const window = f.owner.window;
  for (const mode of ['collapsed', 'expanded', 'reminder']) {
    f.owner.setMode(mode, true); const b = window.getBounds(); assert.equal(b.x + b.width / 2, 640); assert.equal(b.y, 40);
  }
  assert.equal(window.focused, false);
  f.invoke('island:pin'); f.owner.setMode('collapsed', true); assert.equal(f.owner.state().mode, 'expanded');
  f.invoke('island:patch', { enabled: false }); assert.equal(f.owner.state().pinned, false); assert.equal(window.isVisible(), false);
});

test('island native: showing an existing window restores lost topmost status without taking focus', t => {
  const f = fixture(t); f.owner.show();
  const window = f.owner.window;
  window.setAlwaysOnTop(false);
  f.invoke('island:patch', { enabled: true });
  assert.equal(window.topmost, true);
  assert.equal(window.isVisible(), true);
  window.setAlwaysOnTop(false);
  f.invoke('float:show');
  assert.equal(window.topmost, true);
  window.setAlwaysOnTop(false);
  f.full(true); assert.equal(window.isVisible(), false);
  f.full(false); assert.equal(window.isVisible(), true);
  assert.equal(window.topmost, true);
  assert.equal(window.focused, false);
});
test('island native: motion keeps the native surface stable and clips unused hit areas after collapse', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show();
  const window = f.owner.window, resize = t.mock.method(window, 'setBounds');
  f.owner.setMode('expanded');
  assert.equal(f.visibleBounds().width, 580);
  assert.equal(f.visibleBounds().height, 270);
  t.mock.timers.tick(300);
  assert.equal(resize.mock.callCount(), 0);
  f.owner.setMode('collapsed');
  t.mock.timers.tick(80);
  assert.equal(f.visibleBounds().width, 580);
  assert.equal(resize.mock.callCount(), 0);
  t.mock.timers.tick(220);
  assert.equal(f.visibleBounds().width, 580);
  assert.equal(f.visibleBounds().height, 40);
  assert.equal(window.getBounds().width, 580);
  assert.equal(window.getBounds().height, 270);
  assert.equal(resize.mock.callCount(), 0);
});
test('island native: side motion keeps the dock edge and center fixed without per-frame native resizes', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show();
  for (const dock of ['left', 'right'] as const) {
    f.invoke('island:patch', { dock, topOffset: 20 });
    const window = f.owner.window, resize = t.mock.method(window, 'setBounds');
    const check = (width: number, height: number) => {
      const b = f.visibleBounds();
      assert.equal(b.width, width); assert.equal(b.height, height);
      assert.equal(dock === 'left' ? b.x : b.x + b.width, dock === 'left' ? 20 : 1260);
      assert.equal(b.y + b.height / 2, 540);
    };
    check(64, 360); f.owner.setMode('expanded'); check(320, 560);
    t.mock.timers.tick(300); assert.equal(resize.mock.callCount(), 0);
    f.owner.setMode('collapsed'); t.mock.timers.tick(80); check(320, 560);
    f.owner.setMode('expanded'); t.mock.timers.tick(300); check(320, 560);
    f.owner.setMode('collapsed'); t.mock.timers.tick(250); check(64, 360);
    assert.equal(resize.mock.callCount(), 0);
    f.owner.setMode('reminder', true); check(320, 180);
    f.owner.setMode('collapsed', true); check(64, 360);
    resize.mock.restore();
  }
});

test('island native: changing dock cancels an in-flight shrink and display removal reanchors it', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show(); f.owner.setMode('expanded', true);
  f.owner.setMode('collapsed'); t.mock.timers.tick(80);
  f.invoke('island:patch', { dock: 'right' }); t.mock.timers.tick(300);
  assert.equal(f.owner.window.getBounds().x + f.owner.window.getBounds().width, 1280);
  assert.equal(f.visibleBounds().width, 64);
  f.displays([{ id: 3, label: 'replacement', workArea: { x: -1000, y: -50, width: 1000, height: 700 } }]);
  const b = f.owner.window.getBounds();
  assert.equal(b.x + b.width, 0); assert.equal(b.y + b.height / 2, 300);
});

test('island native: moving away from a stationary pointer collapses an unpinned dock without mouseleave', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show();
  const sender = f.owner.window.webContents;
  for (const dock of ['left', 'right', 'top', 'right', 'left', 'top'] as const) {
    f.owner.setMode('expanded', true);
    const previous = f.owner.window.getBounds();
    f.cursor({ x: previous.x + previous.width / 2, y: previous.y + previous.height / 2 });
    f.handlers.get('island:hold')!({ sender, senderFrame: sender.mainFrame }, true);
    const state = f.invoke('island:patch', { dock });
    assert.equal(state.pinned, false);
    assert.equal(state.mode, 'collapsed', `${dock}: stale hover must not hold expansion`);
    t.mock.timers.tick(300);
    const bounds = f.visibleBounds();
    assert.deepEqual([bounds.width, bounds.height], [...contracts.islandSize('collapsed', dock)]);
    f.owner.setMode('expanded', true);
    f.owner.window.emit('blur');
    assert.equal(f.owner.state().mode, 'collapsed', 'old hover hold must be cleared');
  }
});

test('island native: dock changes keep expansion when the new bounds contain the pointer or are pinned', t => {
  const f = fixture(t); f.owner.show(); f.owner.setMode('expanded', true);
  f.cursor({ x: 100, y: 500 });
  f.invoke('island:patch', { dock: 'left' });
  assert.equal(f.owner.state().mode, 'expanded');
  f.owner.window.emit('blur');
  assert.equal(f.owner.state().mode, 'expanded', 'pointer remains inside the moved window');
  f.invoke('island:pin');
  f.cursor({ x: 600, y: 900 });
  f.invoke('island:patch', { dock: 'right' });
  f.owner.window.emit('blur'); f.owner.setMode('collapsed');
  assert.equal(f.owner.state().mode, 'expanded');
  assert.equal(f.owner.state().pinned, true);
});

test('island native: re-entering cancels a pending shrink and reduced motion settles immediately', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show(); f.owner.setMode('expanded', true);
  f.owner.setMode('collapsed'); t.mock.timers.tick(80); f.owner.setMode('expanded'); t.mock.timers.tick(300);
  assert.equal(f.owner.window.getBounds().width, 580);
  assert.equal(f.owner.state().mode, 'expanded');
  f.owner.setMode('collapsed', true);
  assert.equal(f.visibleBounds().width, 580);
});
test('island native: visible reminders stay inside island without activating main, hidden uses one fallback', t => {
  const f = fixture(t); f.owner.show(); f.owner.remindTasks([task()]);
  assert.equal(f.notifications.length, 0); assert.equal(f.owner.state().mode, 'speech'); assert.equal(f.main.focused, false);
  f.owner.showOrHide(); f.owner.remindTasks([{ ...task(), id: 'task-2' }]);
  assert.equal(f.notifications.length, 1); assert.equal(f.owner.isVisible(), false); assert.equal(f.owner.window.isVisible(), false);
  f.notifications[0].emit('failed'); assert.equal(f.unclaimed.length, 1);
});

test('island native: hidden water reminders stay silent without a system notification', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t), beep = t.mock.method(f.electron.shell, 'beep');
  f.owner.store.patch({ waterEnabled: true, sound: true });
  f.owner.notify([{ id: 'water-hidden', kind: 'water', title: '喝口水，稍作休息', createdAt: Date.now() }]);
  assert.equal(f.notifications.length, 0); assert.equal(beep.mock.callCount(), 0);
  assert.equal(f.owner.state().mode, 'collapsed');
  assert.equal(f.owner.state().reminders[0].kind, 'water', 'hidden reminders remain available for later review');
});

test('island native: mixed hidden alerts exclude water from system notification title and target', t => {
  const f = fixture(t), target = t.mock.method(f.owner, 'navigate', () => undefined);
  f.owner.notify([
    { id: 'water-mixed', kind: 'water', title: '喝口水，稍作休息', createdAt: Date.now() },
    { id: 'task-mixed', kind: 'task', title: '其他事项提醒', taskId: 'task-1', createdAt: Date.now() },
  ]);
  assert.equal(f.notifications.length, 1); assert.equal(f.notifications[0].options.title, '其他事项提醒');
  f.notifications[0].emit('click');
  assert.deepEqual(target.mock.calls[0].arguments, [{ view: 'home', taskId: 'task-1' }]);
});

test('island native: visible water opens a speech bubble and retracts after eight idle seconds', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t), beep = t.mock.method(f.electron.shell, 'beep');
  f.owner.show(); f.owner.store.patch({ waterEnabled: true, sound: true });
  f.owner.notify([{ id: 'water-visible', kind: 'water', title: '喝口水，稍作休息', createdAt: Date.now() }]);
  assert.equal(f.owner.state().mode, 'speech'); assert.equal(f.notifications.length, 0);
  assert.equal(beep.mock.callCount(), 1); assert.equal(f.main.focused, false);
  t.mock.timers.tick(8000); assert.equal(f.owner.state().mode, 'collapsed');
});
test('island native: schedule and low-quota reminders share the mascot speech delivery', t => {
  const f = fixture(t); f.owner.show();
  f.owner.remindTasks([task('meeting')]);
  assert.equal(f.owner.state().mode, 'speech');
  f.invoke('island:dismiss', f.owner.state().reminders[0].id);
  assert.equal(f.owner.state().mode, 'collapsed');
  f.owner.quotas.read = () => [{ id: 'cursor', accountKey: 'synthetic', status: 'ready', windows: [{ label: '月额度', remaining: 5, resetsAt: 1900000000000 }] }];
  f.owner.checkLowQuota();
  assert.equal(f.owner.state().mode, 'speech');
  assert.match(f.owner.state().reminders[0].title, /Cursor.*5%/);
  f.invoke('island:dismiss', f.owner.state().reminders[0].id);
  f.owner.checkLowQuota();
  assert.equal(f.owner.state().reminders.length, 0, 'the same quota cycle is not announced twice');
});

test('island native: speech preserves the summary anchor and clips the empty desktop beside the bubble', t => {
  const f = fixture(t); f.owner.show();
  const contains = (x: number, y: number) => f.owner.window.shape.some((r: any) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height);
  for (const dock of ['top', 'left', 'right'] as const) {
    f.invoke('island:patch', { dock }); f.owner.setMode('collapsed', true);
    const summary = f.visibleBounds();
    f.owner.setMode('speech', true);
    assert.deepEqual(f.visibleBounds(), summary, `${dock}: the summary must not move or resize`);
    assert.equal(f.owner.window.shape.length, 2);
    const frame = f.owner.window.getBounds(), [width, height] = contracts.islandSize('speech', dock);
    const bounds = contracts.islandBounds('speech', { x: 0, y: 40, width: 1280, height: 1000 }, 0, dock);
    const x = bounds.x - frame.x, y = bounds.y - frame.y;
    assert.equal(contains(x + (dock === 'top' ? width - 20 : dock === 'left' ? width - 20 : 20), y + (dock === 'top' ? 90 : height - 20)), false, `${dock}: empty area must pass clicks through`);
  }
});

test('island native: measured speech height removes the invisible area below the bubble and only trusts its own frame', t => {
  const f = fixture(t); f.owner.show(); f.owner.setMode('speech', true);
  const sender = f.owner.window.webContents;
  const update = f.handlers.get('island:speechHeight')!;
  update({ sender, senderFrame: sender.mainFrame }, 84);
  assert.equal(f.owner.window.shape[1].width, 224);
  assert.equal(f.owner.window.shape[1].y + f.owner.window.shape[1].height, 136);
  update({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, 1);
  update({ sender, senderFrame: {} }, 1);
  update({ sender, senderFrame: sender.mainFrame }, NaN);
  assert.equal(f.owner.window.shape[1].height, 96);
  update({ sender, senderFrame: sender.mainFrame }, 999);
  assert.equal(f.owner.window.shape[1].height, 144, 'reported bounds cannot escape the window');
});

test('island native: leaving a hovered speech bubble starts a fresh eight idle seconds', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
  const f = fixture(t); f.owner.show(); f.owner.remindTasks([task('meeting')]);
  const sender = f.owner.window.webContents;
  f.handlers.get('island:hold')!({ sender, senderFrame: sender.mainFrame }, true);
  t.mock.timers.tick(9000); assert.equal(f.owner.state().mode, 'speech');
  f.handlers.get('island:hold')!({ sender, senderFrame: sender.mainFrame }, false);
  t.mock.timers.tick(7999); assert.equal(f.owner.state().mode, 'speech');
  t.mock.timers.tick(1); assert.equal(f.owner.state().mode, 'collapsed');
});

test('island native: disabling the mascot retains ordinary cards and drinking closes an empty speech bubble', t => {
  const f = fixture(t); f.owner.show(); f.invoke('island:patch', { mascotEnabled: false });
  f.owner.remindTasks([task('meeting')]); assert.equal(f.owner.state().mode, 'reminder');
  f.invoke('island:dismiss', f.owner.state().reminders[0].id);
  f.invoke('island:patch', { mascotEnabled: true, waterEnabled: true });
  f.owner.notify([{ id: 'water-close', kind: 'water', title: '喝口水，稍作休息', createdAt: Date.now() }]);
  assert.equal(f.owner.state().mode, 'speech');
  f.invoke('island:water', 'drink');
  assert.equal(f.owner.state().mode, 'collapsed'); assert.equal(f.owner.state().water.count, 1);
});

test('island native: disabled kinds return claims and interaction does not get replaced by reminders', t => {
  const f = fixture(t); f.owner.show(); f.owner.setMode('expanded', true);
  f.invoke('island:patch', { scheduleReminders: false }); f.owner.remindTasks([task('meeting')]);
  assert.equal(f.unclaimed.length, 1); assert.equal(f.owner.state().reminders.length, 0);
  f.owner.remindTasks([task()]); assert.equal(f.owner.state().mode, 'expanded'); assert.equal(f.owner.state().reminders.length, 1);
});
test('island native: quiet hours and lock suppress notifications, fullscreen restores only user-enabled island', t => {
  const f = fixture(t); f.owner.show();
  f.invoke('island:patch', { dnd: true, dndStart: '00:00', dndEnd: '00:00' }); f.owner.remindTasks([task()]);
  assert.equal(f.owner.state().mode, 'collapsed'); assert.equal(f.notifications.length, 0);
  f.power.emit('lock-screen'); assert.equal(f.owner.window.isVisible(), false);
  f.power.emit('unlock-screen'); assert.equal(f.owner.window.isVisible(), true);
  f.full(true); assert.equal(f.owner.window.isVisible(), false); f.full(false); assert.equal(f.owner.window.isVisible(), true);
  f.owner.showOrHide(); f.full(true); f.full(false); assert.equal(f.owner.window.isVisible(), false);
});
test('island native: removed display reanchors and embedded pages cannot invoke file or connection APIs', t => {
  const f = fixture(t); f.owner.show();
  f.invoke('island:patch', { displayId: 2, topOffset: 20 });
  f.displays([{ id: 1, label: 'replacement', workArea: { x: -1000, y: 50, width: 1000, height: 700 } }]);
  assert.equal(f.owner.window.getBounds().x + f.owner.window.getBounds().width / 2, -500);
  assert.equal(f.owner.window.getBounds().y, 70);
  assert.throws(() => f.handlers.get('island:filesAdd')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, []), /仅工作台/);
  assert.throws(() => f.handlers.get('island:quotaConnect')!({ sender: f.main.webContents, senderFrame: {} }, 'codex'), /仅工作台/);
  assert.equal(f.messages.some(m => m.owner === f.other), false);
});

test('island shelf: note CRUD rejects other windows and embedded frames', t => {
  const f = fixture(t); f.owner.show();
  f.invoke('island:noteDraft', { text: '保存前的草稿', noteId: null });
  f.invoke('island:noteSave', '本机文字\n保留换行'); const note = f.owner.state().notes[0];
  assert.equal(note.text, '本机文字\n保留换行'); assert.equal(f.owner.state().noteDraft.text, '');
  for (const [name, args] of [['island:noteDraft', [{ text: '覆盖', noteId: null }]], ['island:noteSave', ['覆盖', note.id]], ['island:noteRemove', [note.id]]] as const) {
    assert.throws(() => f.handlers.get(name)!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, ...args), /仅工作台/);
    assert.throws(() => f.handlers.get(name)!({ sender: f.main.webContents, senderFrame: {} }, ...args), /仅工作台/);
  }
  assert.equal(f.owner.state().notes[0].text, note.text);
  f.invoke('island:noteSave', '已编辑', note.id); assert.equal(f.owner.state().notes.length, 1);
  f.invoke('island:noteRemove', note.id); assert.equal(f.owner.state().notes.length, 0);
});

test('island shelf: application shortcuts open only their recorded path and removing a record preserves the original', async t => {
  const f = fixture(t), path = join(f.dir, '合成应用.lnk'); writeFileSync(path, 'synthetic shortcut');
  f.owner.store.addFiles([path]);
  const opened: string[] = []; Object.assign(f.electron.shell, { openPath: async (value: string) => { opened.push(value); return ''; } });
  const file = f.owner.state().files[0]; await f.invoke('island:fileOpen', file.id);
  assert.deepEqual(opened, [path]); await assert.rejects(f.invoke('island:fileOpen', 'missing'), /文件记录不存在/);
  f.invoke('island:filesRemove', file.id); assert.equal(readFileSync(path, 'utf8'), 'synthetic shortcut');
});

test('island native: only trusted workbench frames can connect new quota providers', async t => {
  const f = fixture(t), connected: string[] = [];
  f.owner.quotas.connect = async (provider: string) => { connected.push(provider); return []; };
  for (const provider of ['cursor', 'grokbot']) {
    await f.invoke('island:quotaConnect', provider);
    assert.throws(() => f.handlers.get('island:quotaConnect')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, provider), /仅工作台/);
  }
  assert.deepEqual(connected, ['cursor', 'grokbot']);
  assert.throws(() => f.invoke('island:quotaConnect', 'unknown-provider'));
});

test('island native: manual quota refresh forwards force and rejects invalid or untrusted requests', async t => {
  const f = fixture(t), refreshes: boolean[] = [];
  f.owner.quotas.refresh = async (force: boolean) => { refreshes.push(force); return []; };
  await f.invoke('island:quotaRefresh'); await f.invoke('island:quotaRefresh', true);
  assert.deepEqual(refreshes, [false, true]);
  assert.throws(() => f.invoke('island:quotaRefresh', 'force'), /参数不正确/);
  assert.throws(() => f.handlers.get('island:quotaRefresh')!({ sender: f.other.webContents, senderFrame: f.other.webContents.mainFrame }, true), /仅工作台/);
  assert.deepEqual(refreshes, [false, true]);
});
