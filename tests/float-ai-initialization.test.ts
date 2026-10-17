import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement, StrictMode } from 'react';
import { JSDOM } from 'jsdom';
import type { ChatSession, ChatSummary } from '../shared/todo-contracts';

function chat(id: string, module?: ChatSession['module']): ChatSession {
  return { id, title: id, updatedAt: '2026-10-17T00:00:00.000Z', entries: [], draft: '', ...(module ? { module } : {}), ...(module === 'copy' ? { draftId: 'synthetic-draft' } : {}) };
}

async function withFloat(run: (fixture: {
  render(seed?: { text: string; nonce: number }): Promise<void>;
  resolveList(list: ChatSummary[]): Promise<void>;
  opened: string[]; created: unknown[]; sent: string[]; consumed(): number;
  unmount(): Promise<void>;
}) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let resolve!: (list: ChatSummary[]) => void;
  const list = new Promise<ChatSummary[]>(done => { resolve = done; });
  const opened: string[] = [], created: unknown[] = [], sent: string[] = [];
  let consumed = 0, mounted = true;
  Object.assign(dom.window, { workbench: { ai: {
    chatList: () => list,
    chatOpen: async (id: string) => { opened.push(id); return chat(id, id.startsWith('copy') ? 'copy' : 'todo'); },
    chatNew: async (scope: unknown) => { created.push(scope); return chat('new-todo', 'todo'); },
    config: async () => ({ providers: [], models: [], activeModelId: '' }),
    onChat: () => () => {}, onAsk: () => () => {},
    ask: async (id: string) => { sent.push(id); },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { FloatAiChat } = await import('../src/views/FloatTodo');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const unmount = async () => { if (mounted) { await act(async () => root.unmount()); mounted = false; } };
  try {
    await run({ opened, created, sent, consumed: () => consumed, unmount,
      render: seed => act(async () => root.render(createElement(StrictMode, null, createElement(FloatAiChat, {
        seed: seed ?? null, onSeedConsumed: () => { consumed++; }, tasks: [], categories: [],
      })))),
      resolveList: value => act(async () => { resolve(value); await list; }),
    });
  } finally {
    await unmount(); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
}

test('浮窗冷启动等待会话后发送快捷请求，StrictMode 下只消费一次', async () => {
  await withFloat(async fixture => {
    const seed = { text: '总结今日待办', nonce: 1 };
    await fixture.render(seed);
    assert.equal(fixture.consumed(), 0);
    assert.deepEqual(fixture.sent, []);
    await fixture.resolveList([chat('todo-existing', 'todo')]);
    assert.deepEqual(fixture.sent, ['todo-existing']);
    assert.equal(fixture.consumed(), 1);
    await fixture.render(seed);
    assert.deepEqual(fixture.sent, ['todo-existing']);
  });
});

test('浮窗没有待办会话时新建，不打开其他工作台的对话', async () => {
  await withFloat(async fixture => {
    await fixture.render();
    await fixture.resolveList([chat('copy-existing', 'copy')]);
    assert.deepEqual(fixture.opened, []);
    assert.deepEqual(fixture.created, [{ module: 'todo' }]);
  });
});

test('浮窗兼容旧版未标 module 的待办会话', async () => {
  await withFloat(async fixture => {
    await fixture.render();
    await fixture.resolveList([chat('legacy-todo')]);
    assert.deepEqual(fixture.opened, ['legacy-todo']);
    assert.deepEqual(fixture.created, []);
  });
});

test('浮窗卸载后忽略尚未返回的初始化结果', async () => {
  await withFloat(async fixture => {
    await fixture.render({ text: '不应发送的旧请求', nonce: 2 });
    await fixture.unmount();
    await fixture.resolveList([]);
    assert.deepEqual(fixture.created, []);
    assert.deepEqual(fixture.sent, []);
    assert.equal(fixture.consumed(), 0);
  });
});
