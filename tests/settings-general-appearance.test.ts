import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { DEFAULT_APP_SETTINGS, type AppSettingsPatch, type UiTheme, type ViewId } from '../shared/contracts';

test('通用与个性化分区独立，切换保留外观选择与原设置保存', async t => {
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
  const generalKeys = ['launchAtLogin', 'closeAction', 'language'];
  const appearanceKeys = ['navigationStyle', 'glassIntensity', 'uiTheme'];
  assert.deepEqual(keys(), generalKeys);
  assert.equal(dom.window.document.querySelector('.set-search'), null);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '通用');
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(row('remindersEnabled'), null);
  await render('settings-appearance');
  assert.deepEqual(keys(), appearanceKeys);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '个性化');
  const choice = (key: string, label: string) => [...row(key).querySelectorAll('label')].find(el => el.querySelector('b')?.textContent === label)!.querySelector<HTMLInputElement>('input')!;
  await act(async () => choice('uiTheme', '青瓷').click());
  await render('settings-appearance');
  assert.equal(settings.remindersEnabled, false);
  assert.equal(settings.uiTheme, 'celadon');
  assert.equal(choice('uiTheme', '青瓷').checked, true);
  await act(async () => choice('navigationStyle', '悬浮').click());
  await act(async () => choice('glassIntensity', '纯色').click());
  await render('settings-appearance');
  assert.equal(settings.glassIntensity, 'solid');
  assert.equal(choice('glassIntensity', '纯色').checked, true);
  assert.equal(dom.window.document.documentElement.dataset.glass, 'solid');
  assert.equal(settings.uiTheme, 'celadon');
  assert.equal(settings.navigationStyle, 'floating');
  await act(async () => choice('glassIntensity', '强玻璃').click());
  assert.equal(settings.navigationStyle, 'floating');
  assert.equal(settings.glassIntensity, 'strong');
  await act(async () => choice('uiTheme', '窗影').click());
  assert.match(row('windowLight').textContent!, /自动/);
  assert.match(row('windowLight').textContent!, /06:00–12:00/);
  assert.equal(row('windowLight').querySelector('input, button'), null, 'time period is a read-only system status');
  assert.equal(row('uiTheme').querySelector('[data-theme="windowlight"]')!.getAttribute('data-window-light'), dom.window.document.documentElement.dataset.windowLight);
  await act(async () => choice('uiTheme', '青瓷').click());
  await render('settings-general');
  assert.deepEqual(keys(), generalKeys);
  failWrite = true;
  await act(async () => row('launchAtLogin').querySelector<HTMLButtonElement>('button')!.click());
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(settings.uiTheme, 'celadon');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /设置保存失败/);
  assert.deepEqual(keys(), generalKeys);
  await render('settings-appearance');
  assert.deepEqual(keys(), appearanceKeys);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '个性化');
  assert.equal(choice('uiTheme', '青瓷').checked, true);
  assert.equal(choice('navigationStyle', '悬浮').checked, true);
  assert.equal(choice('glassIntensity', '强玻璃').checked, true);
  assert.equal(dom.window.document.querySelector('[role="alert"]'), null);
});
