import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { transformSync } from 'esbuild';

const require = createRequire(import.meta.url);
function fixture() {
  const windows: any[] = []; const handlers = new Map();
  class Window {
    bounds: any; visible = false; events = new Map(); webContents = { send() {} };
    constructor(options: any) { this.bounds = { x: options.x, y: options.y, width: options.width, height: options.height }; windows.push(this); }
    static getAllWindows() { return windows; }
    once() {} on(name: string, handler: any) { this.events.set(name, handler); }
    loadURL() {} loadFile() {} getBounds() { return { ...this.bounds }; }
    setBounds(bounds: any) { this.bounds = { ...this.bounds, ...bounds }; }
    show() { this.visible = true; } hide() { this.visible = false; } isVisible() { return this.visible; }
    isDestroyed() { return false; } removeAllListeners() {} destroy() {} setAlwaysOnTop() {}
  }
  const area = { x: -100, y: 20, width: 1000, height: 1000 };
  const electron = { BrowserWindow: Window, screen: { getPrimaryDisplay: () => ({ workArea: area }), getDisplayMatching: () => ({ workArea: area }) }, ipcMain: { on() {}, handle: (key: string, fn: any) => handlers.set(key, fn) } };
  const module = { exports: {} as any };
  const code = transformSync(readFileSync('electron/float-window.ts', 'utf8'), { loader: 'ts', format: 'cjs' }).code;
  new Function('require', 'module', 'exports', code)((name: string) => name === 'electron' ? electron : require(name), module, module.exports);
  const owner = new module.exports.FloatTodoWindow('http://localhost', '/unused');
  module.exports.registerFloatIpc(() => owner);
  owner.show();
  return { owner, win: windows[0], handlers, area };
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
