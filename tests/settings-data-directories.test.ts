import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { TodoDbInfo, ViewId } from '../shared/contracts';

test('目录入口归入待办与数据，共享库入口不重复，读取和打开失败各有反馈', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const info: TodoDbInfo = { path: 'C:/synthetic/todo.db', connected: true, schemaVersion: 7, taskCount: 12, categoryCount: 3 };
  let resolveInfo!: (value: TodoDbInfo) => void;
  let readInfo = () => new Promise<TodoDbInfo>(resolve => { resolveInfo = resolve; });
  let userDataCalls = 0, todoCalls = 0, failOpen = false;
  Object.defineProperty(dom.window, 'workbench', { value: {
    todo: { info: () => readInfo() },
    appInfo: {
      about: async () => ({ name: '个人工作台', version: '2.0.0', electron: '44', chrome: '152', userDataPath: 'C:/synthetic/app', todoDbPath: info.path }),
      openUserDataDir: async () => { userDataCalls++; if (failOpen) throw new Error('合成目录错误'); },
      openTodoDir: async () => { todoCalls++; if (failOpen) throw new Error('合成共享库错误'); },
    },
    updater: { status: async () => ({ enabled: false, phase: 'idle', version: '', progress: 0, message: '测试模式' }), onStatus: () => () => {} },
  } });
  const { createRoot } = await import('react-dom/client');
  const { SettingsView } = await import('../src/views/SettingsView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (view: ViewId) => act(async () => root.render(createElement(SettingsView, { view, uiTheme: 'mist', onUiThemeChange: () => {}, onAvatarColorChange: () => {} })));
  const row = (key: string) => dom.window.document.querySelector<HTMLElement>(`[data-setting-key="${key}"]`)!;
  const open = async (key: string) => act(async () => row(key).querySelector<HTMLButtonElement>('button')!.click());
  const search = async (value: string) => act(async () => {
    const input = dom.window.document.querySelector<HTMLInputElement>('.set-search input')!;
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await render('settings-data');
  assert.ok(row('userData'), '应用目录不依赖共享库状态读取');
  assert.equal(row('dbPath').querySelector('b')!.textContent, '待办共享库');
  await open('userData'); await open('dbPath');
  assert.deepEqual([userDataCalls, todoCalls], [1, 1]);
  await act(async () => resolveInfo(info));
  assert.match(row('dbPath').textContent!, /C:\/synthetic\/todo.db/);
  assert.equal(dom.window.document.querySelectorAll('[data-setting-key="dbPath"]').length, 1);
  assert.match(row('syncState').textContent!, /已连接/);
  assert.match(row('scale').textContent!, /12 项事项.*3 个标签/);
  failOpen = true;
  await open('userData');
  assert.equal(dom.window.document.querySelector('[role="alert"]')!.textContent, '应用数据目录：合成目录错误');
  await open('dbPath');
  assert.equal(dom.window.document.querySelector('[role="alert"]')!.textContent, '待办共享库：合成共享库错误');
  await search('应用数据目录'); assert.ok(row('userData')); assert.equal(row('dbPath'), null);
  await search('synthetic/todo'); assert.ok(row('dbPath')); assert.equal(row('userData'), null);
  await render('settings-about');
  assert.equal(row('userData'), null); assert.equal(row('dbPath'), null); assert.equal(row('todoDb'), null);
  assert.ok(row('version')); assert.ok(row('update'));
  readInfo = async () => { throw new Error('合成共享库读取失败'); };
  failOpen = false;
  await render('settings-data');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /合成共享库读取失败/);
  await open('userData'); await open('dbPath');
  assert.deepEqual([userDataCalls, todoCalls], [3, 3]);
});
