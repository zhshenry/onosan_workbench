import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { DEFAULT_APP_SETTINGS, type AppSettingsPatch, type UiTheme, type ViewId } from '../shared/contracts';

test('通用与外观在同一页保存且无页头搜索，旧分区入口展示合并页', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let settings = { ...structuredClone(DEFAULT_APP_SETTINGS), launchAtLogin: true, remindersEnabled: false, uiTheme: 'warm' as UiTheme };
  let failWrite = false;
  Object.defineProperty(dom.window, 'workbench', { value: { settings: {
    get: async () => structuredClone(settings),
    patch: async (patch: AppSettingsPatch) => {
      if (failWrite) throw new Error('设置保存失败');
      settings = { ...settings, ...patch, profile: { ...settings.profile, ...patch.profile } };
      return structuredClone(settings);
    },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { SettingsView } = await import('../src/views/SettingsView');
  const { useAppearanceSettings } = await import('../src/appearance');
  function Harness({ view }: { view: ViewId }) {
    const appearance = useAppearanceSettings();
    return createElement(SettingsView, { view, appearance, onAvatarColorChange: () => {}, onProfileNameChange: () => {} });
  }
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (view: ViewId = 'settings-general') => act(async () => root.render(createElement(Harness, { view })));
  const row = (key: string) => dom.window.document.querySelector<HTMLElement>(`[data-setting-key="${key}"]`)!;
  const keys = () => [...dom.window.document.querySelectorAll<HTMLElement>('[data-setting-key]')].map(el => el.dataset.settingKey);
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await render();
  const allKeys = ['launchAtLogin', 'closeAction', 'language', 'navigationStyle', 'glassIntensity', 'uiTheme'];
  assert.deepEqual(keys(), allKeys);
  assert.equal(dom.window.document.querySelector('.set-search'), null);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '通用与外观');
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(row('remindersEnabled'), null);
  const choice = (key: string, label: string) => [...row(key).querySelectorAll('label')].find(el => el.querySelector('b')?.textContent === label)!.querySelector<HTMLInputElement>('input')!;
  await act(async () => choice('uiTheme', '青瓷').click());
  await render();
  assert.equal(settings.remindersEnabled, false);
  assert.equal(settings.uiTheme, 'celadon');
  assert.equal(choice('uiTheme', '青瓷').checked, true);
  await act(async () => choice('navigationStyle', '悬浮').click());
  await act(async () => choice('glassIntensity', '强玻璃').click());
  assert.equal(settings.navigationStyle, 'floating');
  assert.equal(settings.glassIntensity, 'strong');
  failWrite = true;
  await act(async () => row('launchAtLogin').querySelector<HTMLButtonElement>('button')!.click());
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(settings.uiTheme, 'celadon');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /设置保存失败/);
  assert.deepEqual(keys(), allKeys);
  await render('settings-appearance');
  assert.deepEqual(keys(), allKeys);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '通用与外观');
});
