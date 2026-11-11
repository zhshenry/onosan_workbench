import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformSync } from 'esbuild';

const source = readFileSync('electron/main.ts', 'utf8');
const start = source.indexOf('const createTray = async');
const end = source.indexOf("\n  app.on('will-quit'", start);
assert.ok(start >= 0 && end > start, 'Production tray setup is present');
const code = transformSync(source.slice(start, end), { loader: 'ts', format: 'cjs' }).code;

async function fixture({ minimized = false, destroyed = false, missing = false } = {}) {
  const calls: string[] = [];
  const mainWindow = {
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => calls.push('main:restore'),
    show: () => calls.push('main:show'),
    focus: () => calls.push('main:focus'),
  };
  const assistant = { isMinimized: () => false, show: () => calls.push('assistant:show'), focus: () => calls.push('assistant:focus') };
  class Tray {
    menu: any[] = [];
    events = new Map<string, () => void>();
    setToolTip() {}
    setContextMenu(menu: any[]) { this.menu = menu; }
    on(event: string, action: () => void) { this.events.set(event, action); }
  }
  const tray: Tray = await new Function('mainWindow', 'BrowserWindow', 'nativeImage', 'Tray', 'Menu', 'join', '__dirname',
    `let tray; ${code}; return createTray().then(() => tray);`)(
    missing ? null : mainWindow,
    { getAllWindows: () => [assistant, mainWindow] },
    { createFromPath: () => ({ isEmpty: () => false }) },
    Tray, { buildFromTemplate: (items: any[]) => items }, join, '/fixture',
  );
  const open = tray.menu.find(item => item.label === '打开工作台')?.click;
  assert.equal(typeof open, 'function');
  return { calls, open, doubleClick: tray.events.get('double-click')! };
}

test('tray open restores the hidden main workbench even when the assistant is the first window', async () => {
  const f = await fixture();
  f.open();
  assert.deepEqual(f.calls, ['main:show', 'main:focus']);
});

test('tray open restores a minimized main workbench before showing and focusing it', async () => {
  const f = await fixture({ minimized: true });
  f.open();
  assert.deepEqual(f.calls, ['main:restore', 'main:show', 'main:focus']);
});

test('tray double-click opens the main workbench rather than a floating assistant', async () => {
  const f = await fixture();
  f.doubleClick();
  assert.deepEqual(f.calls, ['main:show', 'main:focus']);
});

test('tray open does not target another window when the main workbench is absent or destroyed', async () => {
  for (const options of [{ missing: true }, { destroyed: true }]) {
    const f = await fixture(options);
    assert.doesNotThrow(f.open);
    assert.deepEqual(f.calls, []);
  }
});
