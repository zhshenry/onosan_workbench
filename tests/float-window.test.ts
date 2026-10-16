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
  return { owner, win: windows[0], windows, handlers, area, exports: module.exports };
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

test('width frames keep a free left edge and a clamped right edge', () => {
  const { exports } = fixture(false);
  const { floatWidthTarget, floatWidthFrame, floatWidthEase } = exports;
  const area = { x: -100, y: 20, width: 1000, height: 1000 };
  const free = { x: 120, y: 80, width: 440, height: 500 };
  const narrowed = floatWidthTarget(free, 330, area);
  assert.deepEqual(narrowed, { x: 120, y: 80, width: 330, height: 500 });
  let previous = free.width;
  for (let step = 0; step <= 20; step++) {
    const frame = floatWidthFrame(free, narrowed, step / 20);
    assert.equal(frame.x, 120, 'logo anchor stays on the free left edge');
    assert.equal(frame.y, 80);
    assert.equal(frame.height, 500, 'width animation must not change height');
    assert.ok(frame.width <= previous && frame.width >= 330);
    previous = frame.width;
  }
  assert.equal(previous, 330);
  assert.ok(floatWidthEase(0.25) > 0.5, 'width easing matches the collapse ease-out');
  const quarter = floatWidthFrame(free, narrowed, 0.25);
  assert.ok(quarter.width < 440 - 110 * 0.25, 'early frames travel farther than a linear slide');

  const flush = { x: 570, y: 100, width: 330, height: 400 };
  const widened = floatWidthTarget(flush, 440, area);
  assert.equal(widened.x, 460);
  assert.equal(widened.x + widened.width, area.x + area.width);
  for (let step = 0; step <= 20; step++) {
    const frame = floatWidthFrame(flush, widened, step / 20);
    assert.ok(Math.abs(frame.x + frame.width - (area.x + area.width)) <= 1, 'clamped widen keeps the right edge on the work area');
    assert.equal(frame.height, 400);
  }
});

test('animated narrowing keeps a free left edge while the right edge eases in', async () => {
  const { owner, win } = fixture();
  win.setBounds({ x: 120, y: 80, width: 440, height: 500 });
  const frames: Array<{ x: number; y: number; width: number; height: number }> = [];
  const original = win.setBounds.bind(win);
  win.setBounds = (next: { x: number; y: number; width: number; height: number }) => {
    original(next);
    frames.push(win.getBounds());
  };
  const started = Date.now();
  const pending = owner.setWidth(true, true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(frames.some((frame) => frame.width < 440 && frame.width > 330), 'width must be between the two stops while sliding');
  assert.ok(frames.every((frame) => frame.x === 120 && frame.y === 80 && frame.height === 500));
  await pending;
  assert.ok(Date.now() - started >= 140, 'narrowing uses the collapse-length slide');
  assert.deepEqual(win.getBounds(), { x: 120, y: 80, width: 330, height: 500 });
  frames.length = 0;
  const widenStarted = Date.now();
  const widen = owner.setWidth(false, true);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.ok(frames.some((frame) => frame.width > 330 && frame.width < 440));
  assert.ok(frames.every((frame) => frame.x === 120 && frame.height === 500));
  await widen;
  assert.ok(Date.now() - widenStarted >= 180, 'widening uses the longer expand slide');
  assert.deepEqual(win.getBounds(), { x: 120, y: 80, width: 440, height: 500 });
});

test('reduced-motion width settles in one step and a later request is not dropped', async () => {
  const { owner, win, handlers } = fixture();
  win.setBounds({ x: 120, y: 80, width: 440, height: 500 });
  let calls = 0;
  const original = win.setBounds.bind(win);
  win.setBounds = (next: { x: number; y: number; width: number; height: number }) => { calls += 1; original(next); };
  const started = Date.now();
  assert.equal(await handlers.get('float:width')({}, true, false), 330);
  assert.ok(Date.now() - started < 80);
  assert.equal(calls, 1);
  assert.deepEqual(win.getBounds(), { x: 120, y: 80, width: 330, height: 500 });
  const first = owner.setWidth(true, true);
  const second = owner.setWidth(false, true);
  await Promise.all([first, second]);
  assert.equal(win.getBounds().width, 440);
  assert.equal(win.getBounds().x, 120);
  assert.equal(win.getBounds().height, 500);
});

test('destroy cancels an in-flight width animation', async () => {
  const { owner, win } = fixture();
  const pending = owner.setWidth(true, true);
  await Promise.resolve();
  const started = Date.now();
  owner.destroy();
  await pending;
  assert.ok(Date.now() - started < 80);
  assert.equal(win.isDestroyed(), true);
});

test('narrow float bar keeps the wide left anchor and width requests honor reduced motion', () => {
  const view = readFileSync('src/views/FloatTodo.tsx', 'utf8');
  const css = readFileSync('src/shell.css', 'utf8');
  const preload = readFileSync('electron/preload.ts', 'utf8');
  assert.match(view, /const animate = !window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;\s*try \{ setNarrow\(\(await wb\.float\.width\(next, animate\)\) === 330\);/);
  assert.match(view, /className="float-bar-leading"/);
  assert.match(css, /\.float-bar-leading \{[^}]*flex:\s*none;[^}]*gap:\s*10px;/);
  assert.match(css, /\.float-bar \{[^}]*padding:\s*0 12px 0 16px;/);
  assert.match(css, /\.float-window-actions \{[^}]*margin-left:\s*auto;/);
  assert.doesNotMatch(css, /\.float-app\.narrow \.float-bar \{/);
  assert.match(preload, /width: \(narrow\?: boolean, animate\?: boolean\)/);
});

test('collapsed float chrome keeps the expanded top bar metrics', () => {
  const view = readFileSync('src/views/FloatTodo.tsx', 'utf8');
  const css = readFileSync('src/shell.css', 'utf8');
  const contract = readFileSync('UX-CONTRACT.md', 'utf8');
  assert.match(view, /<header className=\{collapsed \? 'float-bar float-mini-bar' : 'float-bar'\}>/);
  assert.match(view, /<LogoMark size=\{40\} \/>/);
  assert.match(view, /<PushPin size=\{19\}/);
  assert.match(view, /<ArrowsHorizontal size=\{19\}/);
  assert.match(view, /size=\{19\} \/> : <ArrowsInLineVertical size=\{19\}/);
  assert.match(view, /<Minus size=\{20\}/);
  assert.match(css, /\.float-bar \{[^}]*height:\s*52px;[^}]*gap:\s*10px;[^}]*padding:\s*0 12px 0 16px;/);
  assert.match(css, /\.float-brand \{[^}]*width:\s*40px;\s*height:\s*40px;/);
  assert.match(css, /\.float-bar-title \{[^}]*font-size:\s*var\(--type-section\);[^}]*font-weight:\s*600;/);
  assert.match(css, /\.float-bar-btn \{[^}]*width:\s*30px;\s*height:\s*30px;/);
  assert.match(css, /\.float-window-actions \{[^}]*gap:\s*1px;/);
  assert.match(css, /\.float-ai-glyph \{[^}]*width:\s*20px;\s*height:\s*20px;/);
  const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
  for (const [, selector, body] of rules) {
    const collapsedChrome = /\.float-mini-bar/.test(selector)
      || /\.float-app\.mini(?![\w-])\s+button\b/.test(selector)
      || (/\.float-app\.mini(?![\w-])/.test(selector) && /\.float-(?:bar|brand|window-actions|ai-glyph)\b/.test(selector));
    if (!collapsedChrome) continue;
    assert.doesNotMatch(body, /(?:^|[^-\w])(?:height|width|font-size|gap|padding)\s*:/, `collapsed chrome must not restyle ${selector.trim()}`);
  }
  assert.match(contract, /展开与收起共用 52px 标题栏、40px Logo、16px\/600「待办」和 30px 按钮/);
  assert.doesNotMatch(contract, /收起标题栏40px/);
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
