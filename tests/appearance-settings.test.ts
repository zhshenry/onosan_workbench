import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { DEFAULT_APP_SETTINGS, type AppSettings, type AppSettingsPatch } from '../shared/contracts';
import type { AppearanceController } from '../src/appearance';

test('外观即时预览、连续保存、失败回退、重试和关闭设置后保存均不丢失其他状态', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let saved = structuredClone(DEFAULT_APP_SETTINGS);
  let failRead = true;
  const writes: { patch: AppSettingsPatch; resolve(value: AppSettings): void; reject(error: Error): void }[] = [];
  Object.defineProperty(dom.window, 'workbench', { value: { settings: {
    get: async () => { if (failRead) throw new Error('read failure'); return structuredClone(saved); },
    patch: (patch: AppSettingsPatch) => new Promise<AppSettings>((resolve, reject) => writes.push({ patch, resolve, reject })),
  } } });
  const { createRoot } = await import('react-dom/client');
  const { useAppearanceSettings } = await import('../src/appearance');
  let controller!: AppearanceController;
  function Harness({ settingsOpen }: { settingsOpen: boolean }) {
    controller = useAppearanceSettings();
    return createElement('main', null, createElement('textarea', { defaultValue: '未保存的工作区草稿' }), settingsOpen ? createElement('aside', null, controller.status) : null);
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await act(async () => root.render(createElement(Harness, { settingsOpen: true })));
  assert.equal(controller.status, 'error');
  await act(async () => controller.change({ uiTheme: 'rose' }));
  assert.equal(writes.length, 0, 'read failure cannot overwrite unknown saved preferences');
  failRead = false;
  await act(async () => controller.retry());
  assert.equal(controller.status, 'saved');
  const draft = dom.window.document.querySelector('textarea');
  await act(async () => {
    controller.change({ navigationStyle: 'floating' });
    controller.change({ uiTheme: 'windowlight', glassIntensity: 'strong' });
  });
  assert.equal(writes.length, 1, 'writes are serialized');
  assert.equal(dom.window.document.documentElement.dataset.glass, 'strong');
  async function finish(index: number) {
    saved = { ...saved, ...writes[index].patch, profile: saved.profile };
    await act(async () => writes[index].resolve(structuredClone(saved)));
  }
  await finish(0);
  assert.equal(controller.value.uiTheme, 'windowlight', 'older response cannot undo latest selection');
  assert.equal(writes.length, 2);
  await finish(1);
  assert.equal(controller.status, 'saved');
  await act(async () => controller.change({ uiTheme: 'rose' }));
  await act(async () => writes[2].reject(new Error('write failure')));
  assert.equal(controller.value.uiTheme, 'windowlight');
  assert.equal(controller.status, 'error');
  await act(async () => controller.retry());
  await act(async () => root.render(createElement(Harness, { settingsOpen: false })));
  await finish(3);
  assert.equal(controller.value.uiTheme, 'rose');
  assert.equal(dom.window.document.querySelector('textarea'), draft, 'appearance never remounts the workspace');
  assert.equal(draft?.value, '未保存的工作区草稿');
  assert.equal(saved.profile.name, 'Ono');
  for (const write of writes) assert.deepEqual(Object.keys(write.patch).sort(), ['glassIntensity', 'navigationStyle', 'uiTheme']);
  await act(async () => { controller.change({ uiTheme: 'oat' }); controller.change({ glassIntensity: 'solid' }); });
  await act(async () => writes[4].reject(new Error('stale failure')));
  assert.equal(controller.value.uiTheme, 'oat');
  assert.equal(controller.error, '');
  await finish(5);
  assert.equal(saved.uiTheme, 'oat');
  assert.equal(saved.glassIntensity, 'solid');
});

test('窗影按本地时间自动切换，恢复窗口重新取时且不写配置或重挂工作区', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const localTime = (hour: number, minute = 0, second = 0, day = 15) => new Date(2026, 10, day, hour, minute, second).getTime();
  t.mock.timers.enable({ apis: ['Date'], now: localTime(11, 59, 55) });
  let tick: (() => void) | undefined;
  let delay = 0;
  t.mock.method(dom.window, 'setTimeout', (handler: () => void, milliseconds: number) => { tick = handler; delay = milliseconds; return 1; });
  t.mock.method(dom.window, 'clearTimeout', () => { tick = undefined; });
  let saved: AppSettings = { ...structuredClone(DEFAULT_APP_SETTINGS), uiTheme: 'windowlight', windowLight: 'dusk' };
  const writes: AppSettingsPatch[] = [];
  let finish!: () => void;
  Object.defineProperty(dom.window, 'workbench', { value: { settings: {
    get: async () => structuredClone(saved),
    patch: (patch: AppSettingsPatch) => new Promise<AppSettings>(resolve => {
      writes.push(patch);
      finish = () => { saved = { ...saved, ...patch, profile: saved.profile }; resolve(structuredClone(saved)); };
    }),
  } } });
  const { createRoot } = await import('react-dom/client');
  const { useAppearanceSettings } = await import('../src/appearance');
  let controller!: AppearanceController;
  function Harness() {
    controller = useAppearanceSettings();
    return createElement('textarea', { defaultValue: '保留草稿' });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  let mounted = true;
  t.after(async () => {
    if (mounted) await act(async () => root.unmount());
    dom.window.close();
    names.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await act(async () => root.render(createElement(Harness)));
  const light = () => dom.window.document.documentElement.dataset.windowLight;
  const draft = dom.window.document.querySelector('textarea');
  assert.equal(light(), 'morning', 'saved dusk must not override the local morning');
  assert.equal(delay, 5000, 'refresh is aligned to the next local minute');
  assert.equal(writes.length, 0);
  await act(async () => controller.change({ glassIntensity: 'strong' }));
  t.mock.timers.setTime(localTime(12));
  await act(async () => tick!());
  assert.equal(light(), 'afternoon');
  await act(async () => finish());
  assert.equal(light(), 'afternoon', 'a late save response cannot restore the legacy light value');
  assert.deepEqual(Object.keys(writes[0]).sort(), ['glassIntensity', 'navigationStyle', 'uiTheme']);
  for (const [hour, minute, second, day, expected, signal] of [
    [17, 59, 59, 15, 'afternoon', 'focus'],
    [18, 0, 0, 15, 'dusk', 'timer'],
    [0, 0, 0, 16, 'dusk', 'timer'],
    [5, 59, 59, 16, 'dusk', 'visibility'],
    [6, 0, 0, 16, 'morning', 'timer'],
    [14, 0, 0, 16, 'afternoon', 'focus'],
    [7, 0, 0, 16, 'morning', 'visibility'],
  ] as const) {
    t.mock.timers.setTime(localTime(hour, minute, second, day));
    await act(async () => {
      if (signal === 'timer') tick!();
      else if (signal === 'focus') dom.window.dispatchEvent(new dom.window.Event('focus'));
      else dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
    });
    assert.equal(light(), expected, `${hour}:${minute}:${second} via ${signal}`);
  }
  assert.equal(writes.length, 1, 'clock changes do not save preferences');
  assert.equal(saved.windowLight, 'dusk', 'legacy persisted value is preserved for compatibility');
  assert.equal(dom.window.document.querySelector('textarea'), draft);
  assert.equal(draft?.value, '保留草稿');
  await act(async () => root.unmount()); mounted = false;
  dom.window.dispatchEvent(new dom.window.Event('focus'));
  dom.window.document.dispatchEvent(new dom.window.Event('visibilitychange'));
  assert.equal(tick, undefined, 'unmount removes the timer and clock listeners');
});
