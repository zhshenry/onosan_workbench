import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { ChatSession } from '../shared/todo-contracts';
import type { BrowserTask } from '../shared/browser-automation-contracts';

test('sidebar floats one combined capsule, preserves manual reading and restores following; phase changes never move it into the composer', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  (dom.window as any).ResizeObserver = class { observe() {} disconnect() {} };
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'] as const;
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
  const document = dom.window.document, row = () => document.querySelector<HTMLElement>('.ai-run-slot[data-visible="true"] .ai-run-status');
  const jump = () => document.querySelector<HTMLButtonElement>('.ai-run-slot[data-visible="true"] .ai-jump-latest');
  const update = async (change: Record<string, unknown>) => act(async () => { Object.assign(a.entries[1], change); onChat({ ...a, entries: [...a.entries] }); });
  try {
    await act(async () => root.render(createElement(AiPanel, props)));
    const initial = row(); assert.ok(initial);
    assert.equal(initial.closest('.ai-run-controls')?.getAttribute('data-visible'), 'true');
    assert.equal(initial.closest('.ai-chat-viewport')?.querySelector('.ai-messages') !== null, true);
    assert.equal(document.querySelector('.ai-compose-wrap .ai-run-status'), null);
    assert.equal(document.querySelector('.ai-messages .ai-run-status'), null);
    assert.equal(document.querySelector('.ai-messages .ai-typing'), null);
    assert.equal(initial.getAttribute('role'), 'status');
    assert.equal(initial.tagName, 'DIV');
    assert.equal(initial.closest('button'), null, 'Ordinary progress remains informational');
    assert.match(initial.textContent!, /AI 处理中/);
    await update({ responsePhase: 'replying', content: '先看看当前页面。' });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /AI 处理中/);
    assert.equal(row()!.getAttribute('data-phase'), 'replying', 'Model phases remain distinct while sharing a short label');
    const tool = { id: 'tool', name: 'browser_observe', label: '观察网页', status: 'running', output: '' };
    await update({ responsePhase: 'waiting', tools: [tool] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /AI 操作中/);
    assert.match(row()!.getAttribute('title')!, /观察网页/);
    await update({ tools: [{ ...tool, status: 'complete' }] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /AI 处理中/);
    assert.equal(row()!.getAttribute('data-phase'), 'waiting', 'A pre-tool sentence must not make the next model round look like the final reply');
    await act(async () => tasks.forEach(listener => listener({ ...task, status: 'paused' })));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /已暂停/);
    await act(async () => tasks.forEach(listener => listener(task)));
    await update({ tools: [{ ...tool, name: 'propose_edit', label: '修改正文' }] });
    assert.match(row()!.textContent!, /AI 操作中/);
    assert.match(row()!.getAttribute('title')!, /修改正文/);
    await update({ tools: [{ ...tool, status: 'error' }] });
    assert.equal(row(), initial); assert.match(row()!.textContent!, /AI 处理中/);
    await act(async () => tasks.forEach(listener => listener({ ...task, status: 'site-approval', pendingOrigin: 'https://example.test' })));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /待你授权/);
    assert.ok(document.querySelector('.ai-site-approval'));
    assert.ok(document.querySelector('.ai-compose-wrap .ai-site-approval'));
    await act(async () => tasks.forEach(listener => listener(task)));
    assert.match(row()!.textContent!, /AI 处理中/);
    await act(async () => onAsk({ id: 'question', sessionId: b.id, question: '后台的问题', options: [] }));
    assert.doesNotMatch(row()!.textContent!, /待你回答/);
    await act(async () => onAsk({ id: 'question', sessionId: a.id, question: '请选活动', options: [] }));
    assert.equal(row(), initial); assert.match(row()!.textContent!, /待你回答/);
    await act(async () => root.render(createElement(AiPanel, { ...props, requestedChatId: b.id })));
    assert.equal(row(), null, 'A background request cannot keep the visible idle chat busy');
    assert.equal(document.querySelector('.ai-run-controls')?.getAttribute('aria-hidden'), 'true');
    assert.equal(document.querySelector('.ai-run-controls')?.hasAttribute('inert'), true);
    await act(async () => root.render(createElement(AiPanel, { ...props, requestedChatId: a.id })));
    assert.ok(row());
    const messages = document.querySelector<HTMLElement>('.ai-messages')!;
    let position = 800, contentHeight = 1000;
    Object.defineProperties(messages, {
      clientHeight: { configurable: true, get: () => 200 }, scrollHeight: { configurable: true, get: () => contentHeight },
      scrollTop: { configurable: true, get: () => position, set: value => { position = Math.max(0, Math.min(value, contentHeight - 200)); } },
    });
    await act(async () => { messages.scrollTop = 0; messages.dispatchEvent(new dom.window.Event('scroll')); });
    assert.equal(jump()?.tagName, 'BUTTON');
    assert.equal(jump()?.closest('.ai-run-slot')?.hasAttribute('inert'), false);
    contentHeight = 1200;
    await update({ content: '继续输出新内容。' });
    assert.equal(position, 0, 'Streaming must not pull the reader down');
    await update({ streaming: false, content: '本轮已经结束。' });
    assert.equal(row(), null);
    assert.ok(jump(), 'Completion still allows returning from older text');
    assert.equal(initial.closest('.ai-run-slot')?.hasAttribute('inert'), true, 'Fading status must leave the accessibility tree immediately');
    await act(async () => jump()!.click());
    assert.equal(position, 1000); assert.equal(document.activeElement, messages);
    assert.equal(document.querySelector('.ai-run-controls')?.getAttribute('data-visible'), 'false');
    assert.equal(document.querySelector('.ai-run-controls')?.hasAttribute('inert'), true);
    assert.equal(jump(), null);
    await update({ streaming: true, responsePhase: 'waiting' });
    contentHeight = 1400; await update({ content: '底端继续跟随。' });
    assert.equal(position, 1200, 'Jumping to bottom resumes following the reply');
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
