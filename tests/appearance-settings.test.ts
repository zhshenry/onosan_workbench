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
  for (const write of writes) assert.deepEqual(Object.keys(write.patch).sort(), ['glassIntensity', 'navigationStyle', 'uiTheme', 'windowLight']);
  await act(async () => { controller.change({ uiTheme: 'oat' }); controller.change({ windowLight: 'dusk' }); });
  await act(async () => writes[4].reject(new Error('stale failure')));
  assert.equal(controller.value.uiTheme, 'oat');
  assert.equal(controller.error, '');
  await finish(5);
  assert.equal(saved.uiTheme, 'oat');
  assert.equal(saved.windowLight, 'dusk');
});
