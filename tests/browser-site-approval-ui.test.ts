import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { ChatSession } from '../shared/todo-contracts';
import type { BrowserTask, BrowserWorkspaceState } from '../shared/browser-automation-contracts';

test('docked site cards follow the visible conversation, ignore stale reads, retry errors and keep real decision receipts', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const origin = 'https://www.baidu.com';
  const task = (id: string, chatId: string, workspace: string, url: string): BrowserTask => ({ id, chatId, workspace, tabIds: [], origins: [], goal: '打开网站', status: 'site-approval', pendingOrigin: url, siteApprovals: [{ origin: url, status: 'pending' }], steps: [], updatedAt: '2026-10-17' });
  let a = task('task-a', 'chat-a', 'default', origin), b = task('task-b', 'chat-b', 'xhs-creator', 'https://creator.test');
  const makeChat = (value: BrowserTask): ChatSession => ({ id: value.chatId!, title: value.chatId!, module: 'workbench', viewId: 'browser', updatedAt: '2026-10-17', draft: '', entries: [
    { id: `user-${value.id}`, role: 'user', content: '打开网站' },
    { id: `reply-${value.id}`, role: 'assistant', content: '等待站点授权。', streaming: true, browserTask: { id: value.id, workspace: value.workspace }, tools: [{ id: 'tool', label: '浏览器标签', name: 'browser_tabs', status: 'running', output: '' }] },
  ] });
  const chats = [makeChat(a), makeChat(b)];
  const listeners = new Set<(value: BrowserTask) => void>();
  let firstRead: ((value: BrowserWorkspaceState) => void) | undefined;
  let releaseDecision: ((value: BrowserTask) => void) | undefined;
  let reads = 0, failControl = true;
  const calls: { id: string; action: string; origin?: string }[] = [];
  const state = (value: BrowserTask): BrowserWorkspaceState => ({ tasks: [value], tabs: [], activeId: '', history: [] });
  const emit = (value: BrowserTask): void => listeners.forEach(listener => listener(value));
  (dom.window as any).workbench = { ai: {
    config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [] }),
    chatList: async () => chats, chatOpen: async (id: string) => chats.find(chat => chat.id === id), chatDraft: async () => {},
    onChat: () => () => {}, onAsk: () => () => {},
  }, browserAutomation: {
    state: async (workspace: string) => { if (++reads === 1) return new Promise<BrowserWorkspaceState>(resolve => { firstRead = resolve; }); return state(workspace === 'default' ? a : b); },
    onTask: (listener: (value: BrowserTask) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    control: async (id: string, action: string, expectedOrigin?: string) => {
      calls.push({ id, action, origin: expectedOrigin });
      if (failControl) { failControl = false; throw new Error('连接暂时中断，请重试'); }
      if (action === 'approve-site') return new Promise<BrowserTask>(resolve => { releaseDecision = resolve; });
      a = { ...a, status: 'cancelled', pendingOrigin: undefined, siteApprovals: a.siteApprovals!.map(value => value.status === 'pending' ? { ...value, status: 'denied' } : value) }; emit(a); return a;
    },
  } };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const props = { open: true, context: { scope: { module: 'workbench' as const, viewId: 'browser' }, label: '浏览器助手', object: '浏览器任务' }, width: 380,
    onClose() {}, onChatLocated() {}, onActiveChatChange() {}, onOpenSettings() {}, onLocateCopySource() {}, onLocateBaziDay() {}, onQuickAsk() {}, onWidthChange() {} };
  const document = dom.window.document;
  const card = () => document.querySelector<HTMLElement>('.ai-site-approval');
  try {
    await act(async () => root.render(createElement(AiPanel, props)));
    await act(async () => emit(a));
    assert.match(card()!.textContent!, /https:\/\/www.baidu.com/);
    assert.equal(card()!.parentElement!.className, 'ai-compose-wrap');
    assert.equal(document.querySelector('.ai-messages .ai-site-approval'), null);
    await act(async () => { firstRead!(state({ ...a, status: 'running', pendingOrigin: undefined, siteApprovals: [] })); });
    assert.ok(card(), 'a stale initial state must not hide a newer approval event');
    await act(async () => emit(b)); assert.doesNotMatch(card()!.textContent!, /creator.test/);
    const locate = [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.textContent === '定位授权卡')!;
    await act(async () => locate.click()); assert.equal(document.activeElement, card());
    await act(async () => card()!.querySelector<HTMLButtonElement>('.ai-apply')!.click());
    assert.match(card()!.textContent!, /连接暂时中断/);
    assert.equal(card()!.querySelector<HTMLButtonElement>('.ai-apply')!.disabled, false);
    await act(async () => { const button = card()!.querySelector<HTMLButtonElement>('.ai-apply')!; button.click(); button.click(); });
    assert.equal(calls.length, 2, 'retry sends exactly one decision while its request is in flight');
    assert.deepEqual(calls[1], { id: a.id, action: 'approve-site', origin });
    assert.equal(card()!.querySelector<HTMLButtonElement>('.ai-discard')!.disabled, true);
    const granted: BrowserTask = { ...a, status: 'running', pendingOrigin: undefined, origins: [origin], siteApprovals: [{ origin, status: 'allowed' }] };
    await act(async () => emit(granted));
    assert.equal(card(), null); assert.match(document.querySelector('.ai-messages')!.textContent!, /已授权，正在继续/);
    assert.doesNotMatch(document.querySelector('.ai-messages')!.textContent!, /页面条件验证通过/);
    const secondOrigin = 'https://next.test';
    a = { ...granted, status: 'site-approval', pendingOrigin: secondOrigin, siteApprovals: [...granted.siteApprovals!, { origin: secondOrigin, status: 'pending' }] };
    await act(async () => { emit(a); releaseDecision!(granted); });
    assert.match(card()!.textContent!, /next.test/, 'the previous IPC reply must not overwrite the next origin request'); assert.doesNotMatch(card()!.textContent!, /连接暂时中断/);
    await act(async () => card()!.querySelector<HTMLButtonElement>('.ai-discard')!.click());
    assert.equal(card(), null); assert.match(document.querySelector('.ai-messages')!.textContent!, /未授权，已停止本次任务/);
    assert.deepEqual(calls.at(-1), { id: a.id, action: 'cancel', origin: secondOrigin });
    await act(async () => root.render(createElement(AiPanel, { ...props, requestedChatId: b.chatId })));
    assert.match(card()!.textContent!, /creator.test/); assert.doesNotMatch(card()!.textContent!, /next.test/);
    await act(async () => emit({ ...a, status: 'site-approval', pendingOrigin: origin }));
    assert.match(card()!.textContent!, /creator.test/, 'an event for a background chat cannot replace the current decision');
    b = { ...b, status: 'interrupted', pendingOrigin: undefined, siteApprovals: [{ origin: 'https://creator.test', status: 'expired' }] };
    await act(async () => emit(b)); assert.equal(card(), null); assert.match(document.querySelector('.ai-messages')!.textContent!, /授权请求已失效/);
    assert.equal(calls.length, 3, 'expired requests cannot issue another decision');
  } finally {
    await act(async () => root.unmount()); assert.equal(listeners.size, 0); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
