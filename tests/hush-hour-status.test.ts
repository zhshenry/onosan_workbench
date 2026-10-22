import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import { buildSync } from 'esbuild';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { HushHourBridge, HushHourState } from '../shared/hush-hour-contracts';

test('Hush-Hour renders build states and clears recovered startup failures without a banner', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : typeof dom.window[name] === 'function' && name.endsWith('AnimationFrame') ? dom.window[name].bind(dom.window) : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  Object.defineProperty(dom.window.HTMLElement.prototype, 'hidePopover', { value() {} });
  Object.defineProperty(dom.window.HTMLCanvasElement.prototype, 'getContext', { value: () => null });
  let current: HushHourState = { root: 'C:/site', sourceRevision: 'a'.repeat(64), buildRevision: '', sourceChanged: true, sourceError: '', service: { phase: 'error', url: '', message: '旧的启动错误' }, online: { url: '' }, build: { phase: 'idle', output: '', message: '尚未构建' }, captures: [] };
  let listener: ((state: HushHourState) => void) | undefined, finishBuild: ((state: HushHourState) => void) | undefined, builds = 0;
  const bridge = {
    onChanged: (callback: typeof listener) => { listener = callback; return () => { listener = undefined; }; },
    open: async () => { listener?.(current); throw new Error('旧的启动错误'); },
    build: () => { builds++; return new Promise<HushHourState>(resolve => { finishBuild = resolve; }); },
  };
  Object.defineProperty(dom.window, 'workbench', { value: { hushHour: bridge as unknown as HushHourBridge } });
  const require = createRequire(import.meta.url);
  const code = buildSync({ entryPoints: ['src/views/HushHourView.tsx'], bundle: true, platform: 'node', format: 'cjs', external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime', '@phosphor-icons/react'], loader: { '.css': 'empty', '.png': 'dataurl' }, write: false }).outputFiles[0].text;
  const module = { exports: {} as { HushHourView: (props: { active: boolean; onPending(message: string): void }) => ReturnType<typeof createElement> } };
  new Function('require', 'module', 'exports', code)(require, module, module.exports);
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const status = () => dom.window.document.querySelector('.hush-hour-status')!;
  const primary = () => dom.window.document.querySelector<HTMLButtonElement>('.game-project .game-primary')!;
  const emit = (patch: Partial<HushHourState>) => act(async () => { current = { ...current, ...patch }; listener?.(current); });
  const click = (element: HTMLElement) => act(async () => element.click());
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    globals.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  await act(async () => { root.render(createElement(module.exports.HushHourView, { active: true, onPending: () => {} })); });

  await t.test('initial failure is compact and retrying clears the stale service error during construction', async () => {
    assert.equal(status().textContent, '本地启动失败'); assert.equal(dom.window.document.querySelector('.game-error'), null);
    await click(primary()); assert.equal(builds, 1);
    await emit({ build: { phase: 'running', output: 'building', message: '正在构建' } });
    assert.equal(status().textContent, '正在构建…'); assert.equal(status().getAttribute('data-phase'), 'building');
    assert.equal(primary().disabled, true); assert.equal(primary().textContent, '正在构建…');
    assert.equal(dom.window.document.querySelector('.hush-hour-status-details'), null);
    await act(async () => { current = { ...current, buildRevision: 'b'.repeat(64), sourceChanged: false, service: { phase: 'stopped', url: '', message: '本地已停止' }, build: { phase: 'passed', output: 'build completed', message: '构建完成' } }; listener?.(current); finishBuild?.(current); });
    assert.equal(status().textContent, '已同步'); assert.equal(status().getAttribute('data-phase'), 'synced');
    assert.equal(dom.window.document.querySelector('.hush-hour-status-details'), null); assert.equal(builds, 1);
  });

  await t.test('source and external build updates require explicit action rather than rebuilding automatically', async () => {
    await emit({ sourceChanged: true }); assert.equal(status().textContent, '有更新，待构建'); assert.equal(primary().disabled, false); assert.equal(builds, 1);
    await emit({ sourceChanged: false, buildRevision: 'c'.repeat(64) }); assert.equal(builds, 1);
    await emit({ sourceChanged: true, build: { ...current.build, message: '构建期间源码又有更新' } }); assert.equal(status().textContent, '有更新，待构建');
  });

  await t.test('failed builds expose their own error and output, and a new attempt hides stale failure controls', async () => {
    await emit({ build: { phase: 'failed', output: 'new build failure output', message: '构建失败（退出码 2）' } });
    assert.equal(status().textContent, '构建失败'); assert.equal(primary().textContent, '重新构建');
    await click(dom.window.document.querySelector<HTMLButtonElement>('.hush-hour-status-details')!);
    assert.match(dom.window.document.querySelector('dialog')!.textContent!, /new build failure output/);
    assert.match(dom.window.document.querySelector('dialog')!.textContent!, /退出码 2/);
    const close = dom.window.document.querySelector<HTMLButtonElement>('dialog button[aria-label="关闭"]')!;
    await click(close);
    await click(primary()); assert.equal(builds, 2);
    await emit({ build: { phase: 'running', output: '', message: '正在构建' } });
    assert.equal(status().textContent, '正在构建…'); assert.equal(dom.window.document.querySelector('.hush-hour-status-details'), null);
    await act(async () => { current = { ...current, sourceChanged: false, build: { phase: 'passed', output: 'recovered', message: '构建完成' } }; listener?.(current); finishBuild?.(current); });
    assert.equal(status().textContent, '已同步'); assert.equal(dom.window.document.querySelector('.game-error'), null);
  });
});
