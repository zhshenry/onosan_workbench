import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { UpdateStatus } from '../shared/contracts';

const snapshot = (phase: UpdateStatus['phase'], patch: Partial<UpdateStatus> = {}): UpdateStatus => ({
  enabled: true, phase, version: phase === 'downloading' || phase === 'ready' ? '0.2.0' : '', progress: 0,
  message: `完整 ${phase} 状态说明`, ...patch,
});

test('应用更新 v2 真实 React 行内展示、错误详情及现有动作隔离', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  let current = snapshot('idle');
  let listener: ((value: UpdateStatus) => void) | undefined;
  let statusRead = () => Promise.resolve(current);
  let checkAction = () => Promise.resolve();
  let installAction = () => Promise.resolve();
  let checks = 0, installs = 0, unsubscribes = 0;
  let directoryAction = () => Promise.resolve();
  let libraryAction = () => Promise.resolve();
  Object.defineProperty(dom.window, 'workbench', { value: {
    appInfo: { about: async () => ({ name: '个人工作台', version: '0.1.0', electron: '44.4.4', chrome: '152', userDataPath: 'synthetic', todoDbPath: 'synthetic' }),
      openUserDataDir: () => directoryAction(), openTodoDir: () => libraryAction() },
    updater: { status: () => statusRead(), onStatus: (callback: (value: UpdateStatus) => void) => { listener = callback; return () => { listener = undefined; unsubscribes++; }; },
      check: () => { checks++; return checkAction(); }, install: () => { installs++; return installAction(); } },
  } });
  const { createRoot } = await import('react-dom/client');
  const { SettingsView } = await import('../src/views/SettingsView');
  let root = createRoot(dom.window.document.getElementById('root')!);
  const render = async () => act(async () => root.render(createElement(SettingsView, { view: 'settings-about', uiTheme: 'mist', onUiThemeChange: () => {}, onAvatarColorChange: () => {} })));
  const reset = async () => { await act(async () => root.unmount()); root = createRoot(dom.window.document.getElementById('root')!); await render(); };
  const row = () => dom.window.document.querySelector<HTMLElement>('.set-update-row')!;
  const action = () => row().querySelector<HTMLButtonElement>('.set-update-action')!;
  const emit = async (value: UpdateStatus) => { current = value; await act(async () => listener?.(value)); };
  const click = async (element: HTMLElement) => act(async () => element.click());
  t.after(async () => {
    await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  await render();

  await t.test('全部状态在应用更新行内，下载进度归属该行且底部没有重复状态', async () => {
    const states: [UpdateStatus['phase'], string, string, boolean][] = [
      ['idle', '待检查', '检查更新', false], ['latest', '当前已是最新版本', '检查更新', false],
      ['checking', '正在检查更新…', '检查中…', true], ['downloading', '正在下载 42%', '下载中…', true],
      ['ready', '已下载，待重启', '重启并安装', false], ['error', '更新失败', '检查更新', false],
    ];
    for (const [phase, label, button, disabled] of states) {
      await emit(snapshot(phase, { progress: phase === 'downloading' ? 42 : 0 }));
      assert.equal(row().querySelector('b')?.textContent, '应用更新');
      assert.equal(row().querySelector('.set-update-status-full')?.textContent, label);
      assert.equal(action().textContent?.trim(), button);
      assert.equal(action().disabled, disabled);
      assert.equal(action().getAttribute('aria-busy'), String(disabled));
      const progress = dom.window.document.querySelector<HTMLProgressElement>('progress');
      assert.equal(!!progress, phase === 'downloading');
      if (progress) { assert.ok(row().contains(progress)); assert.equal(progress.value, 42); assert.equal(progress.max, 100); }
      assert.equal([...dom.window.document.querySelectorAll('.settings-page > p')].some(element => element.textContent === current.message), false);
    }
    await emit(snapshot('idle', { enabled: false, message: '测试模式不连接真实更新服务。' }));
    assert.equal(row().querySelector('.set-update-status-full')?.textContent, '不可自动更新');
    assert.ok(row().textContent?.includes(current.message));
    await click(action()); assert.equal(checks, 0); assert.equal(installs, 0);
  });

  await t.test('长错误完整展开，详情按钮语义/焦点正确，Escape 可收起后重开', async () => {
    const message = '连接更新服务器失败，请检查网络和代理。\n' + '完整错误说明与恢复建议。'.repeat(40);
    await emit(snapshot('error', { message }));
    const toggle = row().querySelector<HTMLButtonElement>('.set-update-details-toggle')!;
    const detail = row().querySelector<HTMLElement>('.set-update-details')!;
    assert.equal(row().querySelector('.set-update-status')?.getAttribute('role'), 'alert');
    assert.equal(detail.textContent, message);
    assert.equal(detail.hidden, true);
    assert.equal(toggle.getAttribute('aria-controls'), detail.id);
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    toggle.focus(); await click(toggle);
    assert.equal(detail.hidden, false); assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.equal(dom.window.document.activeElement, toggle);
    await act(async () => toggle.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(detail.hidden, true); assert.equal(dom.window.document.activeElement, toggle);
    await click(toggle); assert.equal(detail.hidden, false);
    await emit(snapshot('error', { message: '新的完整错误' }));
    assert.equal(row().querySelector<HTMLElement>('.set-update-details')?.hidden, true);
    await emit(snapshot('latest')); assert.equal(row().querySelector('.set-update-details-toggle'), null);
  });

  await t.test('请求尚未返回和主进程忙碌时都不重复派发，ready 只走现有安装动作', async () => {
    await emit(snapshot('latest'));
    let resolve!: () => void;
    checkAction = () => new Promise<void>(done => { resolve = done; });
    await act(async () => { action().click(); action().click(); });
    assert.equal(checks, 1); assert.equal(installs, 0); assert.equal(action().disabled, true);
    await act(async () => resolve());
    assert.equal(action().disabled, false);
    for (const phase of ['checking', 'downloading'] as const) { await emit(snapshot(phase)); await click(action()); }
    assert.equal(checks, 1);
    await emit(snapshot('ready'));
    installAction = () => new Promise<void>(done => { resolve = done; });
    await act(async () => { action().click(); action().click(); });
    assert.equal(installs, 1); assert.equal(checks, 1);
    await act(async () => resolve());
    checkAction = installAction = () => Promise.resolve();
  });

  await t.test('动作失败留在更新详情内，事件恢复后清除错误且底部独立说明保留', async () => {
    await emit(snapshot('latest'));
    checkAction = async () => { throw new Error('合成检查调用失败'); };
    await click(action());
    assert.equal(row().querySelector('.set-update-details')?.textContent, '合成检查调用失败');
    assert.equal(dom.window.document.querySelector('.settings-page > .error'), null);
    assert.equal(action().disabled, false);
    await emit(snapshot('latest')); assert.equal(row().querySelector('.set-update-details'), null);
    assert.match(dom.window.document.querySelector('.settings-page > .help')?.textContent ?? '', /零漂移/);
    await emit(snapshot('ready'));
    installAction = async () => { throw new Error('合成安装调用失败'); };
    await click(action()); assert.equal(row().querySelector('.set-update-details')?.textContent, '合成安装调用失败');
    checkAction = installAction = () => Promise.resolve();
  });

  await t.test('新主进程事件优先于旧动作调用的迟到失败', async () => {
    await emit(snapshot('idle'));
    let reject!: (error: Error) => void;
    checkAction = () => new Promise<void>((_, fail) => { reject = fail; });
    await click(action());
    await emit(snapshot('latest'));
    await act(async () => reject(new Error('已过时的调用失败')));
    assert.equal(row().querySelector('.set-update-status-full')?.textContent, '当前已是最新版本');
    assert.equal(row().querySelector('.set-update-details'), null);
    assert.equal(action().disabled, false);
    checkAction = () => Promise.resolve();
  });

  await t.test('目录和共享库失败不被更新操作清除，也不冒充更新错误', async () => {
    await emit(snapshot('latest'));
    directoryAction = async () => { throw new Error('合成目录错误'); };
    await click(dom.window.document.querySelector<HTMLElement>('[data-setting-key="userData"] button')!);
    assert.equal(dom.window.document.querySelector('.settings-page > .error')?.textContent, '应用数据目录：合成目录错误');
    await click(action());
    assert.equal(dom.window.document.querySelector('.settings-page > .error')?.textContent, '应用数据目录：合成目录错误');
    assert.equal(row().querySelector('.set-update-details'), null);
    libraryAction = async () => { throw new Error('合成共享库错误'); };
    await click(dom.window.document.querySelector<HTMLElement>('[data-setting-key="todoDb"] button')!);
    assert.equal(dom.window.document.querySelector('.settings-page > .error')?.textContent, '待办共享库：合成共享库错误');
    directoryAction = libraryAction = () => Promise.resolve();
  });

  await t.test('搜索过滤整个更新行及进度/详情，清空搜索恢复且焦点返回输入', async () => {
    await emit(snapshot('downloading', { progress: 42 }));
    const input = dom.window.document.querySelector<HTMLInputElement>('[aria-label="搜索当前页设置"]')!;
    const search = async (text: string) => act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, text);
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    await search('应用数据目录');
    assert.equal(dom.window.document.querySelector('.set-update-row'), null);
    assert.equal(dom.window.document.querySelector('progress'), null);
    await click(dom.window.document.querySelector<HTMLElement>('[aria-label="清空设置搜索"]')!);
    assert.ok(row()); assert.equal(dom.window.document.activeElement, input);
    await emit(snapshot('error', { message: '合成长错误' }));
    await click(row().querySelector<HTMLElement>('.set-update-details-toggle')!);
    await search('不存在的设置');
    assert.equal(dom.window.document.querySelector('.set-update-row'), null);
    assert.equal(dom.window.document.querySelector('.set-update-details'), null);
    assert.equal(dom.window.document.querySelector('.set-empty')?.textContent, '没有匹配的设置');
    await click(dom.window.document.querySelector<HTMLElement>('[aria-label="清空设置搜索"]')!);
  });

  await t.test('初始读取失败在本行显示完整详情，迟到快照或失败不能覆盖新事件', async () => {
    statusRead = async () => { throw new Error('合成更新状态读取失败'); };
    await reset();
    assert.equal(row().querySelector('.set-update-status-full')?.textContent, '读取失败');
    assert.equal(row().querySelector('.set-update-details')?.textContent, '合成更新状态读取失败');
    assert.equal(dom.window.document.querySelector('.settings-page > .error'), null);
    assert.match(row().textContent ?? '', /无法读取更新状态/);
    let resolve!: (value: UpdateStatus) => void;
    statusRead = () => new Promise<UpdateStatus>(done => { resolve = done; });
    await reset(); assert.equal(row().querySelector('.set-update-status-full')?.textContent, '读取中…');
    await emit(snapshot('downloading', { progress: 56 }));
    await act(async () => resolve(snapshot('idle')));
    assert.equal(row().querySelector('.set-update-status-full')?.textContent, '正在下载 56%');
    let reject!: (error: Error) => void;
    statusRead = () => new Promise<UpdateStatus>((_, fail) => { reject = fail; });
    await reset(); await emit(snapshot('latest'));
    await act(async () => reject(new Error('已过时读取失败')));
    assert.equal(row().querySelector('.set-update-status-full')?.textContent, '当前已是最新版本');
    assert.equal(row().querySelector('.set-update-details'), null);
    statusRead = () => Promise.resolve(current);
    assert.ok(unsubscribes >= 3);
  });
});

test('窄窗口只缩短非必要更新文案，不缩小字体，完整错误换行且右侧按钮保留', () => {
  const css = readFileSync(new URL('../src/shell.css', import.meta.url), 'utf8');
  const narrow = css.match(/@container \(max-width: 600px\) \{([\s\S]*?)\n\}/)?.[1];
  assert.ok(narrow);
  assert.doesNotMatch(narrow, /font-size|transform|scale|overflow:\s*hidden/);
  assert.match(narrow, /set-update-status-full \{ display: none/);
  assert.match(narrow, /set-update-status-compact \{ display: block/);
  assert.match(css, /\.set-update-heading \{[^}]*flex-wrap: wrap/);
  assert.match(css, /\.set-update-details \{[^}]*overflow-wrap: anywhere; white-space: pre-wrap/);
  assert.match(css, /\.set-update-action \{[^}]*min-width: 106px; white-space: nowrap/);
  assert.match(css, /\.set-update-details-toggle:focus-visible/);
});
