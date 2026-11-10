import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { AiConfig } from '../shared/workbench-api';

test('AI 首次配置气泡：状态可靠、延迟避让、一次性关闭与配置导航', async t => {
  const dom = new JSDOM('<button id="anchor">AI</button><input id="editing"><div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const open = new Set<HTMLElement>(), timers = new Map<number, () => void>();
  const originalMatches = dom.window.HTMLElement.prototype.matches, query = dom.window.document.querySelector.bind(dom.window.document);
  dom.window.HTMLElement.prototype.matches = function (selector) { return selector === ':popover-open' ? open.has(this) : originalMatches.call(this, selector); };
  dom.window.document.querySelector = ((selector: string) => selector === ':modal, [popover]:popover-open' ? query('dialog[open]') ?? [...open][0] ?? null : query(selector)) as typeof dom.window.document.querySelector;
  const toggle = (element: HTMLElement, state: 'open' | 'closed') => element.dispatchEvent(Object.assign(new dom.window.Event('toggle'), { newState: state }));
  dom.window.HTMLElement.prototype.showPopover = function () { open.add(this); toggle(this, 'open'); };
  dom.window.HTMLElement.prototype.hidePopover = function () { if (open.delete(this)) toggle(this, 'closed'); };
  let sequence = 0;
  dom.window.setTimeout = ((callback: () => void, delay: number) => { assert.equal(delay, 1000); timers.set(++sequence, callback); return sequence; }) as typeof dom.window.setTimeout;
  dom.window.clearTimeout = (id?: number) => { timers.delete(id!); };
  const empty: AiConfig = { providers: [], models: [], activeModelId: '', aiEnabled: false, hasConnection: false, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' };
  const configured: AiConfig = { ...empty, models: [{ id: 'm', providerId: 'p', name: 'chat-model' }] };
  let read = () => Promise.resolve(empty), listener: ((value: AiConfig) => void) | undefined, navigations = 0, unsubscriptions = 0;
  Object.assign(dom.window, { workbench: { ai: {
    config: () => read(),
    onConfigChanged: (callback: (value: AiConfig) => void) => { listener = callback; return () => { listener = undefined; unsubscriptions++; }; },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { AiSetupHint } = await import('../src/views/AiSetupHint');
  const anchor = dom.window.document.getElementById('anchor') as HTMLButtonElement, trigger = { current: anchor };
  let root = createRoot(dom.window.document.getElementById('root')!);
  const panel = () => query<HTMLElement>('.ai-setup-hint')!;
  const storageKey = 'wb.ai.setup-hint.dismissed.v1';
  const render = (active = true) => act(async () => root.render(createElement(AiSetupHint, { trigger, active, onConfigure: () => { navigations++; } })));
  const reset = async (active = true, clear = true) => {
    await act(async () => root.unmount());
    if (clear) dom.window.localStorage.clear();
    root = createRoot(dom.window.document.getElementById('root')!); await render(active);
  };
  const tick = () => act(async () => { const pending = [...timers]; timers.clear(); pending.forEach(([, callback]) => callback()); });
  const emit = (value: AiConfig) => act(async () => listener!(value));
  const escape = () => act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
  });

  await t.test('未读到配置或读取失败时不误报；后续通知可以恢复判断', async () => {
    let reject!: (cause: Error) => void;
    read = () => new Promise((_, fail) => { reject = fail; });
    await render(); assert.equal(timers.size, 0);
    await act(async () => reject(new Error('暂时无法读取'))); assert.equal(timers.size, 0);
    await emit(empty); assert.equal(timers.size, 1);
    await tick(); assert.equal(open.has(panel()), true);
  });

  await t.test('只有 RLCD 仍提示，自动出现不移动输入焦点，点击配置后不再弹出', async () => {
    read = () => Promise.resolve({ ...empty, rlcdModels: [{ id: 'r', providerId: 'rp', name: 'decision-model' }] });
    await reset(); assert.equal(open.has(panel()), false);
    const editing = query<HTMLInputElement>('#editing')!; editing.focus();
    await tick(); assert.equal(open.has(panel()), true); assert.equal(dom.window.document.activeElement, editing);
    assert.match(panel().textContent!, /配置模型，开启 AI 助手/);
    assert.ok(query(`#${panel().getAttribute('aria-labelledby')}`));
    await act(async () => panel().querySelector<HTMLButtonElement>('.ai-setup-configure')!.click());
    assert.equal(navigations, 1); assert.equal(open.has(panel()), false);
    assert.equal(dom.window.localStorage.getItem(storageKey), '1');
    await reset(true, false); await tick(); assert.equal(open.has(panel()), false);
  });

  await t.test('关闭按钮、Escape、外部关闭均记住选择；仅内部焦点回到入口', async () => {
    read = () => Promise.resolve(empty);
    for (const method of ['close', 'escape', 'outside'] as const) {
      await reset(); await tick();
      const close = panel().querySelector<HTMLButtonElement>('[aria-label="关闭配置引导"]')!;
      if (method === 'close') await act(async () => close.click());
      else if (method === 'escape') { close.focus(); await escape(); }
      else { query<HTMLInputElement>('#editing')!.focus(); await act(async () => panel().hidePopover()); }
      assert.equal(open.has(panel()), false);
      assert.equal(dom.window.localStorage.getItem(storageKey), '1');
      assert.equal(dom.window.document.activeElement, method === 'outside' ? query('#editing') : anchor);
      await reset(true, false); await tick(); assert.equal(open.has(panel()), false);
    }
  });

  await t.test('不覆盖已有弹层，弹层关闭后再延迟；AI 设置页面不重复引导', async () => {
    await reset(false); await tick(); assert.equal(open.has(panel()), false);
    const dialog = dom.window.document.createElement('dialog'); dialog.open = true; dom.window.document.body.append(dialog);
    await render(true); await tick(); assert.equal(open.has(panel()), false);
    await act(async () => { dialog.open = false; toggle(dialog, 'closed'); });
    assert.equal(timers.size, 1); await tick(); assert.equal(open.has(panel()), true); dialog.remove();
  });

  await t.test('阻挡的模态窗口直接卸载后继续显示气泡，不依赖已移除节点的 toggle 事件', async () => {
    await reset();
    const dialog = dom.window.document.createElement('dialog'); dialog.open = true; dom.window.document.body.append(dialog);
    await tick(); assert.equal(open.has(panel()), false);
    await act(async () => dialog.remove());
    assert.equal(timers.size, 1); await tick(); assert.equal(open.has(panel()), true);
  });

  await t.test('已有模型但关闭助手不提示；首次完成配置立即消失，删除模型也不重启引导', async () => {
    read = () => Promise.resolve(configured);
    await reset(); await tick(); assert.equal(open.has(panel()), false);
    await emit(empty); await tick(); assert.equal(open.has(panel()), false);
    read = () => Promise.resolve(empty);
    await reset(); await emit(configured); await tick(); assert.equal(open.has(panel()), false);
    await reset(); await tick(); assert.equal(open.has(panel()), true);
    await emit(configured); assert.equal(open.has(panel()), false);
    await emit(empty); await tick(); assert.equal(open.has(panel()), false);
  });

  await t.test('迟到的初始读取不能覆盖较新通知，卸载后清理订阅和计时', async () => {
    let resolve!: (value: AiConfig) => void;
    read = () => new Promise(done => { resolve = done; });
    await reset(); await emit(configured);
    await act(async () => resolve(empty)); await tick(); assert.equal(open.has(panel()), false);
    read = () => Promise.resolve(empty);
    await reset(); assert.equal(timers.size, 1);
    const before = unsubscriptions; await act(async () => root.unmount());
    assert.equal(timers.size, 0); assert.equal(unsubscriptions, before + 1); assert.equal(listener, undefined);
    root = createRoot(dom.window.document.getElementById('root')!);
  });
});
