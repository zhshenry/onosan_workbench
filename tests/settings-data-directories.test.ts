import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { DEFAULT_APP_SETTINGS, type AppSettingsPatch, type TodoDbInfo, type ViewId } from '../shared/contracts';

test('关于页集中展示数据存储，待办提醒独立保存，读取和打开失败各有反馈', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'HTMLDialogElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const info: TodoDbInfo = { path: 'C:/synthetic/todo.db', connected: true, schemaVersion: 7, taskCount: 12, categoryCount: 3 };
  let resolveInfo!: (value: TodoDbInfo) => void;
  let readInfo = () => new Promise<TodoDbInfo>(resolve => { resolveInfo = resolve; });
  let infoReads = 0;
  let userDataCalls = 0, todoCalls = 0, failOpen = false;
  let settings = structuredClone(DEFAULT_APP_SETTINGS), failSettings = false;
  settings.reminderRange = 'off';
  Object.defineProperty(dom.window, 'workbench', { value: {
    settings: {
      get: async () => structuredClone(settings),
      patch: async (patch: AppSettingsPatch) => {
        if (failSettings) throw new Error('合成设置保存失败');
        settings = { ...settings, ...patch, profile: { ...settings.profile, ...patch.profile } };
        return structuredClone(settings);
      },
    },
    todo: { info: () => { infoReads++; return readInfo(); } },
    appInfo: {
      about: async () => ({ name: 'OnO Workbench', version: '2.0.0', electron: '44', chrome: '152', userDataPath: 'C:/synthetic/app', todoDbPath: info.path }),
      openUserDataDir: async () => { userDataCalls++; if (failOpen) throw new Error('合成目录错误'); },
      openTodoDir: async () => { todoCalls++; if (failOpen) throw new Error('合成共享库错误'); },
    },
    updater: { status: async () => ({ enabled: false, phase: 'idle', version: '', progress: 0, message: '测试模式' }), onStatus: () => () => {} },
  } });
  const assets = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "test-asset";', shortCircuit: true } : next(url, context); } });
  t.after(() => assets.deregister());
  const { createRoot } = await import('react-dom/client');
  const { SettingsView } = await import('../src/views/SettingsView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (view: ViewId) => act(async () => root.render(createElement(SettingsView, { view, appearance: { value: DEFAULT_APP_SETTINGS, ready: true, status: 'saved', error: '', change: () => {}, retry: () => {} }, onAvatarColorChange: () => {} })));
  const row = (key: string) => dom.window.document.querySelector<HTMLElement>(`[data-setting-key="${key}"]`)!;
  const reminder = () => row('reminderRange').querySelector<HTMLButtonElement>('[role="combobox"]')!;
  const chooseRange = async (label: string) => {
    await act(async () => reminder().click());
    const options = [...dom.window.document.querySelectorAll<HTMLElement>('[role="option"]')];
    assert.deepEqual(options.map(option => option.textContent), ['日程和待办', '仅日程', '仅待办', '关闭']);
    await act(async () => options.find(option => option.textContent === label)!.click());
  };
  const open = async (key: string) => act(async () => row(key).querySelector<HTMLButtonElement>('button')!.click());
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await render('settings-data');
  assert.equal(dom.window.document.querySelector('.set-search'), null);
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '日程待办');
  assert.equal(infoReads, 0);
  assert.equal(row('userData'), null); assert.equal(row('dbPath'), null);
  assert.deepEqual([...dom.window.document.querySelectorAll<HTMLElement>('[data-setting-key]')].map(row => row.dataset.settingKey), ['reminderRange']);
  assert.equal(reminder().getAttribute('aria-label'), '提醒范围');
  assert.equal(reminder().textContent, '关闭');
  await chooseRange('日程和待办');
  assert.equal(settings.reminderRange, 'all');
  await chooseRange('仅日程');
  assert.equal(settings.reminderRange, 'schedule');
  assert.equal(reminder().textContent, '仅日程');
  await render('settings-about');
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '关于');
  assert.equal(dom.window.document.querySelector('.settings-storage h2')!.textContent, '数据存储');
  assert.equal(row('reminderRange'), null);
  assert.equal(infoReads, 1);
  assert.ok(row('version')); assert.ok(row('update'));
  assert.ok(row('userData'), '应用目录不依赖共享库状态读取');
  assert.equal(row('dbPath').querySelector('b')!.textContent, '待办共享库');
  await open('userData'); await open('dbPath');
  assert.deepEqual([userDataCalls, todoCalls], [1, 1]);
  await act(async () => resolveInfo(info));
  assert.match(row('dbPath').textContent!, /C:\/synthetic\/todo.db/);
  assert.equal(dom.window.document.querySelectorAll('[data-setting-key="dbPath"]').length, 1);
  assert.match(row('syncState').textContent!, /已连接/);
  assert.match(row('schemaVersion').textContent!, /v7/);
  assert.match(row('scale').textContent!, /12 项事项.*3 个标签/);
  failOpen = true;
  await open('userData');
  assert.equal(dom.window.document.querySelector('[role="alert"]')!.textContent, '应用数据目录：合成目录错误');
  await open('dbPath');
  assert.equal(dom.window.document.querySelector('[role="alert"]')!.textContent, '待办共享库：合成共享库错误');
  assert.ok(row('userData')); assert.ok(row('dbPath'));
  await render('settings-data');
  assert.equal(row('userData'), null); assert.equal(row('dbPath'), null);
  readInfo = async () => { throw new Error('合成共享库读取失败'); };
  failOpen = false;
  await render('settings-about');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /合成共享库读取失败/);
  await open('userData'); await open('dbPath');
  assert.deepEqual([userDataCalls, todoCalls], [3, 3]);
  assert.ok(row('update'));
  await render('settings-notifications');
  assert.equal(dom.window.document.querySelector('h1')!.textContent, '日程待办');
  assert.equal(row('userData'), null); assert.equal(row('dbPath'), null);
  assert.equal(reminder().textContent, '仅日程', '重新进入仍显示已保存的提醒范围');
  failSettings = true;
  await chooseRange('关闭');
  assert.equal(settings.reminderRange, 'schedule');
  assert.equal(reminder().textContent, '仅日程');
  assert.ok([...dom.window.document.querySelectorAll('[role="alert"]')].some(node => /合成设置保存失败/.test(node.textContent!)));
});
