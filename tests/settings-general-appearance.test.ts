import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { DEFAULT_APP_SETTINGS, type AppSettingsPatch, type UiTheme, type ViewId } from '../shared/contracts';

test('通用与外观在同一页保存、搜索，旧分区入口展示合并页', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let settings = { ...structuredClone(DEFAULT_APP_SETTINGS), launchAtLogin: true, remindersEnabled: false, uiTheme: 'warm' as UiTheme };
  let theme = settings.uiTheme, failWrite = false;
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
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (view: ViewId = 'settings-general') => act(async () => root.render(createElement(SettingsView, { view, uiTheme: theme, onUiThemeChange: value => { theme = value; }, onAvatarColorChange: () => {} })));
  const row = (key: string) => dom.window.document.querySelector<HTMLElement>(`[data-setting-key="${key}"]`)!;
  const keys = () => [...dom.window.document.querySelectorAll<HTMLElement>('[data-setting-key]')].map(el => el.dataset.settingKey);
  const search = async (value: string) => act(async () => {
    const input = dom.window.document.querySelector<HTMLInputElement>('.set-search input')!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await render();
  const allKeys = ['launchAtLogin', 'closeAction', 'remindersEnabled', 'language', 'uiTheme'];
  assert.deepEqual(keys(), allKeys);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '通用&外观');
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(row('remindersEnabled').querySelector('button')!.getAttribute('aria-checked'), 'false');
  await act(async () => row('remindersEnabled').querySelector<HTMLButtonElement>('button')!.click());
  await act(async () => row('uiTheme').querySelector<HTMLButtonElement>('[aria-label="冷灰 · 凝霜"]')!.click());
  await render();
  assert.equal(settings.remindersEnabled, true);
  assert.equal(settings.uiTheme, 'cool');
  assert.equal(row('remindersEnabled').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(row('uiTheme').querySelector('[aria-label="冷灰 · 凝霜"]')!.getAttribute('aria-checked'), 'true');
  failWrite = true;
  await act(async () => row('launchAtLogin').querySelector<HTMLButtonElement>('button')!.click());
  assert.equal(row('launchAtLogin').querySelector('button')!.getAttribute('aria-checked'), 'true');
  assert.equal(settings.uiTheme, 'cool');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /设置保存失败/);
  await search('主题');
  assert.deepEqual(keys(), ['uiTheme']);
  assert.equal(dom.window.document.querySelector('.set-empty'), null);
  await search('开机');
  assert.deepEqual(keys(), ['launchAtLogin']);
  await search('不存在的设置项');
  assert.equal(dom.window.document.querySelectorAll('.set-empty').length, 1);
  await act(async () => dom.window.document.querySelector<HTMLButtonElement>('[aria-label="清空设置搜索"]')!.click());
  assert.deepEqual(keys(), allKeys);
  for (const view of ['settings-appearance', 'settings-notifications'] as const) {
    await render(view);
    assert.deepEqual(keys(), allKeys);
    assert.equal(dom.window.document.querySelector('h1')!.textContent, '通用&外观');
  }
});
