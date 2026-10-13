import test from 'node:test';
import { EventEmitter } from 'node:events';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';

const require = createRequire(import.meta.url);
function fixture(show = true) {
  const windows: any[] = []; const handlers = new Map();
  class Window {
    bounds: any; visible = false; destroyed = false; events = new Map(); webContents = { send() {} };
    constructor(options: any) { this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; windows.push(this); }
    static getAllWindows() { return windows; }
    once() {} on(name: string, handler: any) { this.events.set(name, handler); }
    loadURL() {} loadFile() {} getBounds() { return { ...this.bounds }; }
    setBounds(bounds: any) { this.bounds = { ...this.bounds, ...bounds }; }
    show() { this.visible = true; } hide() { this.visible = false; } isVisible() { return this.visible; }
    isDestroyed() { return this.destroyed; }
    removeAllListeners(name: string) { this.events.delete(name); }
    destroy() { this.destroyed = true; this.visible = false; this.events.get('closed')?.(); }
    close() { let prevented = false; this.events.get('close')?.({ preventDefault() { prevented = true; } }); if (!prevented) this.destroy(); }
    setAlwaysOnTop() {}
  }
  const area = { x: -100, y: 20, width: 1000, height: 1000 };
  const electron = { BrowserWindow: Window, screen: { getPrimaryDisplay: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }) }, ipcMain: { on() {}, handle: (key: string, fn: any) => handlers.set(key, fn) } };
  const module = { exports: {} as any };
  const code = transformSync(readFileSync('electron/float-window.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((name: string) => name === 'electron' ? electron : require(name), module, module.exports);
  const owner = new module.exports.FloatTodoWindow('http://localhost', '/unused');
  module.exports.registerFloatIpc(() => owner);
  if (show) owner.show();
  return { owner, win: windows[0], windows, handlers, area };
}
test('native width preserves exact height and clamps edges in expanded, mini and temporary states', async () => {
  const { owner, win, area } = fixture();
  for (const height of [860, 176, 300]) {
    win.setBounds({ x: 800, y: 900, height });
    await owner.setWidth(true);
    assert.deepEqual(win.getBounds(), { x: 570, y: area.y + area.height - height, width: 330, height });
    await owner.setWidth(false);
    assert.equal(win.bounds.height, height); assert.equal(win.bounds.width, 440); assert.equal(win.bounds.x, 460);
  }
});
test('width survives expand-collapse, hide-show; fresh application owner defaults wide', async () => {
  const { owner, win, handlers } = fixture();
  await owner.setWidth(true); await owner.setCollapsed(true, false);
  assert.equal(win.bounds.width, 330); assert.equal(win.bounds.height, 176);
  await owner.setCollapsed(false, false); assert.equal(win.bounds.width, 330); assert.equal(win.bounds.height, 860);
  owner.showOrHide(); owner.showOrHide(); assert.equal(owner.getWidth(), 330);
  assert.equal(handlers.get('float:width')({}, 'invalid'), 330, 'Untrusted IPC input must not mutate width');
  assert.equal(fixture().owner.getWidth(), 440);
});
test('width waits for current collapse motion and cannot overwrite its final height', async () => {
  const { owner, win } = fixture();
  const collapse = owner.setCollapsed(true, true);
  const width = owner.setWidth(true);
  await Promise.all([collapse, width]);
  assert.equal(win.bounds.width, 330); assert.equal(win.bounds.height, 176);
});

test('ordinary native close hides the same float while application destruction releases it', () => {
  const { owner, win, windows } = fixture();
  win.show();
  assert.equal(win.isVisible(), true);
  win.close();
  assert.equal(win.isVisible(), false);
  assert.equal(win.isDestroyed(), false);
  owner.show();
  assert.equal(windows.length, 1);
  assert.equal(win.isVisible(), true);
  owner.destroy(); owner.destroy();
  assert.equal(win.isDestroyed(), true);
  assert.equal(win.events.has('close'), false);
  assert.equal(owner.isVisible(), false);
});
test('destroy is safe before float creation and after a hidden float', () => {
  const unopened = fixture(false);
  unopened.owner.destroy(); unopened.owner.destroy();
  assert.equal(unopened.windows.length, 0);
  const hidden = fixture(); hidden.win.show(); hidden.win.hide();
  assert.equal(hidden.win.isVisible(), false);
  hidden.owner.destroy();
  assert.equal(hidden.win.isDestroyed(), true);
});
test('destroy cancels active native animation and resolves outstanding callers', async () => {
  const { owner, win } = fixture();
  const motion = owner.setCollapsed(true, true);
  owner.destroy(); owner.destroy();
  await motion;
  assert.equal(win.isDestroyed(), true);
  assert.equal(owner.isVisible(), false);
});
test('application before-quit owns float destruction without changing ordinary close', () => {
  const source = readFileSync('electron/main.ts', 'utf8');
  const registration = source.match(/app\.once\('before-quit', \(\) => floatTodo\.destroy\(\)\);/g);
  assert.equal(registration?.length, 1);
  for (const shown of [false, true]) {
    const { owner, win } = fixture(shown);
    const app = new EventEmitter();
    let destroyed = 0;
    const original = owner.destroy.bind(owner);
    owner.destroy = () => { destroyed++; original(); };
    new Function('app', 'floatTodo', registration![0])(app, owner);
    app.emit('before-quit'); app.emit('before-quit');
    assert.equal(destroyed, 1, 'Repeated quit events must not duplicate teardown');
    assert.equal(owner.isVisible(), false);
    if (win) assert.equal(win.isDestroyed(), true);
  }
  assert.ok(source.indexOf("app.once('before-quit'") > source.indexOf('const floatTodo = new FloatTodoWindow'));
});

test('late compact IPC after instant expansion cannot overwrite expanded height or memory', async () => {
  const { owner, win } = fixture();
  owner.setExpandedHeight(704);
  for (const narrow of [false, true]) {
    await owner.setWidth(narrow);
    await owner.setCollapsed(true, false);
    owner.setTempHeight(300);
    assert.equal(win.bounds.height, 300, 'A real compact question retains its temporary height');
    owner.setTempHeight(null);
    assert.equal(win.bounds.height, 176);
    await owner.setCollapsed(false, false);
    assert.equal(win.bounds.height, 704);
    // The old mini React effect can enqueue a send behind the synchronous collapse invoke.
    await Promise.resolve();
    owner.setTempHeight(null);
    owner.setTempHeight(300);
    assert.equal(win.bounds.height, 704, 'Late mini effects must not resize an expanded native window');
    await owner.setCollapsed(true, false);
    await owner.setCollapsed(false, false);
    assert.equal(win.bounds.height, 704, 'A late mini reset must never poison remembered expanded height');
  }
});

test('animated expansion ignores compact height deliveries during and after motion', async () => {
  const { owner, win } = fixture();
  owner.setExpandedHeight(704);
  await owner.setCollapsed(true, false);
  owner.setTempHeight(300);
  const expanded = owner.setCollapsed(false, true);
  owner.setTempHeight(null);
  await expanded;
  owner.setTempHeight(null);
  assert.equal(win.bounds.height, 704);
});
