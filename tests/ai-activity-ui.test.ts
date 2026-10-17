import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { ChatSession } from '../shared/todo-contracts';
import type { BrowserTask } from '../shared/browser-automation-contracts';

test('sidebar keeps one docked status row through tools, model rounds and approval, then hides it for the finished or background chat', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const task: BrowserTask = { id: 'browser-task', chatId: 'chat-a', workspace: 'default', tabIds: ['tab-a'], origins: [], goal: '查看活动', status: 'running', steps: [], updatedAt: '2026-10-17' };
  const a: ChatSession = { id: 'chat-a', title: '查看活动', module: 'workbench', viewId: 'browser', updatedAt: '2026-10-17', draft: '', entries: [
    { id: 'user', role: 'user', content: '查看当前活动' },
    { id: 'reply', role: 'assistant', content: '', streaming: true, browserTask: { id: task.id, workspace: task.workspace } },
  ] };
  const b: ChatSession = { ...a, id: 'chat-b', title: '另一条对话', entries: [] };
  const tasks = new Set<(task: BrowserTask) => void>();
  let onChat: (chat: ChatSession) => void = () => {}, onAsk: (question: any) => void = () => {};
  const cancellations: string[] = [];
  (dom.window as any).workbench = { ai: {
    config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [] }),
    chatList: async () => [a, b], chatOpen: async (id: string) => id === a.id ? a : b, chatDraft: async () => {},
    onChat: (listener: typeof onChat) => { onChat = listener; return () => {}; }, onAsk: (listener: typeof onAsk) => { onAsk = listener; return () => {}; },
    cancel: (id: string) => { cancellations.push(id); a.entries[1].streaming = false; onChat({ ...a }); },
  }, browserAutomation: {
    state: async () => ({ tasks: [task], tabs: [], activeId: '', history: [] }),
    onTask: (listener: (task: BrowserTask) => void) => { tasks.add(listener); return () => tasks.delete(listener); },
  } };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const props = { open: true, context: { scope: { module: 'workbench' as const, viewId: 'browser' }, label: '浏览器助手', object: '浏览器任务' }, width: 380,
    onClose() {}, onChatLocated() {}, onActiveChatChange() {}, onOpenSettings() {}, onLocateCopySource() {}, onLocateBaziDay() {}, onQuickAsk() {}, onWidthChange() {} };
  const document = dom.window.document, row = () => document.querySelector<HTMLElement>('.ai-run-status');
  const update = async (change: Record<string, unknown>) => act(async () => { Object.assign(a.entries[1], change); onChat({ ...a, entries: [...a.entries] }); });
  try {
    await act(async () => root.render(createElement(AiPanel, props)));
    const initial = row(); assert.ok(initial);
    assert.equal(initial.parentElement!.className, 'ai-compose-wrap');
    assert.equal(document.querySelector('.ai-messages .ai-run-status'), null);
    assert.equal(document.querySelector('.ai-messages .ai-typing'), null);
    assert.equal(initial.getAttribute('role'), 'status');
    assert.match(initial.textContent!, /等待模型/);
    await update({ responsePhase: 'replying', content: '先看看当前页面。' });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /整理回复/);
    const tool = { id: 'tool', name: 'browser_observe', label: '观察网页', status: 'running', output: '' };
    await update({ responsePhase: 'waiting', tools: [tool] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /操作网页/);
    await update({ tools: [{ ...tool, status: 'complete' }] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /等待模型/, 'A pre-tool sentence must not make the next model round look like the final reply');
    await act(async () => tasks.forEach(listener => listener({ ...task, status: 'paused' })));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /已暂停/);
    await act(async () => tasks.forEach(listener => listener(task)));
    await update({ tools: [{ ...tool, name: 'propose_edit', label: '修改正文' }] });
    assert.match(row()!.textContent!, /执行工具/);
    await update({ tools: [{ ...tool, status: 'error' }] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /等待模型/);
    await act(async () => tasks.forEach(listener => listener({ ...task, status: 'site-approval', pendingOrigin: 'https://example.test' })));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /等待授权/);
    assert.ok(document.querySelector('.ai-site-approval'));
    assert.ok(document.querySelector('.ai-site-approval')!.compareDocumentPosition(initial) & dom.window.Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => tasks.forEach(listener => listener(task)));
    assert.match(row()!.textContent!, /等待模型/);
    await act(async () => onAsk({ id: 'question', sessionId: b.id, question: '后台的问题', options: [] }));
    assert.doesNotMatch(row()!.textContent!, /等待回答/);
    await act(async () => onAsk({ id: 'question', sessionId: a.id, question: '请选活动', options: [] }));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /等待回答/);
    await act(async () => root.render(createElement(AiPanel, { ...props, requestedChatId: b.id })));
    assert.equal(row(), null, 'A background request cannot keep the visible idle chat busy');
    await act(async () => root.render(createElement(AiPanel, { ...props, requestedChatId: a.id })));
    assert.ok(row());
    await update({ streaming: false, content: '本轮已经结束。' });
    assert.equal(row(), null);
    await update({ streaming: true, responsePhase: 'waiting' });
    await update({ streaming: false, error: '合成连接失败' });
    assert.equal(row(), null);
    await update({ streaming: true, content: '', responsePhase: 'waiting', tools: [], error: undefined });
    await act(async () => document.querySelector<HTMLButtonElement>('.ai-send.cancel')!.click());
    assert.deepEqual(cancellations, [a.id]); assert.equal(row(), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
