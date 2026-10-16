import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement, act } from 'react';
import { JSDOM } from 'jsdom';
import type { ChatSession } from '../shared/todo-contracts';

test('sidebar sends a second chat while the first runs, routes questions by chat and stops only the visible chat', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const makeChat = (id: string, entries: ChatSession['entries'] = []): ChatSession => ({ id, title: id, module: 'todo', contextScope: { module: 'todo' }, pageScope: { module: 'todo' }, entries, draft: '', updatedAt: '2026-10-16' });
  const a = makeChat('chat-a', [{ id: 'reply-a', role: 'assistant', content: 'A 执行中', streaming: true }]), b = makeChat('chat-b');
  const chats = [a];
  let onChat: (chat: ChatSession) => void = () => {}, onAsk: (question: any) => void = () => {}, release: (() => void) | undefined;
  const sent: string[] = [], cancelled: string[] = [], answers: any[] = [];
  (dom.window as any).workbench = { ai: {
    config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [] }),
    chatList: async () => chats.map(chat => ({ ...chat, streaming: chat.entries.some(entry => entry.streaming) })), chatOpen: async (id: string) => chats.find(chat => chat.id === id),
    chatNew: async () => { chats.push(b); return b; }, chatDraft: async () => {},
    onChat: (listener: typeof onChat) => { onChat = listener; return () => {}; }, onAsk: (listener: typeof onAsk) => { onAsk = listener; return () => {}; },
    ask: async (id: string) => { sent.push(id); b.entries.push({ id: 'reply-b', role: 'assistant', content: 'B 执行中', streaming: true }); onChat({ ...b }); await new Promise<void>(resolve => { release = resolve; }); },
    cancel: (id: string) => { cancelled.push(id); b.entries[0].streaming = false; onChat({ ...b }); release?.(); }, answerAsk: (answer: any) => answers.push(answer),
  }, todo: { state: async () => ({ tasks: [], categories: [] }), onChanged: () => () => {} } };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const click = async (selector: string) => act(async () => { dom.window.document.querySelector<HTMLButtonElement>(selector)!.click(); });
  try {
    await act(async () => root.render(createElement(AiPanel, { open: true, context: { scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' }, width: 380,
      onClose() {}, onChatLocated() {}, onActiveChatChange() {}, onOpenSettings() {}, onLocateCopySource() {}, onLocateBaziDay() {}, onQuickAsk() {}, onWidthChange() {} })));
    await click('.ai-ctx-new');
    const input = dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')!;
    await act(async () => { Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(input, '让 B 同时执行'); input.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    assert.equal(dom.window.document.querySelector<HTMLButtonElement>('.ai-send')!.disabled, false);
    await click('.ai-send'); assert.deepEqual(sent, ['chat-b']);
    await act(async () => onAsk({ id: 'ask-a', sessionId: a.id, question: 'A 的问题', options: [] }));
    assert.doesNotMatch(dom.window.document.querySelector('.ai-compose')!.textContent!, /A 的问题/);
    await act(async () => onAsk({ id: 'ask-b', sessionId: b.id, question: 'B 的问题', options: [{ label: '选项乙' }] }));
    assert.match(dom.window.document.body.textContent!, /B 的问题/);
    const option = [...dom.window.document.querySelectorAll<HTMLButtonElement>('[aria-label="AI 澄清问题"] button')].find(button => button.textContent === '选项乙')!;
    await act(async () => option.click()); assert.deepEqual(answers, [{ id: 'ask-b', sessionId: b.id, kind: 'option', value: '选项乙' }]);
    await click('.ai-send.cancel'); assert.deepEqual(cancelled, ['chat-b']);
    assert.equal(a.entries[0].streaming, true);
  } finally {
    release?.(); await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
