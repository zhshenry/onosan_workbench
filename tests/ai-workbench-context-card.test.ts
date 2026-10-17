import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { ChatSession } from '../shared/todo-contracts';
import type { AiScope } from '../shared/ai-scope';
import type { AiPanelContext } from '../src/views/AiPanel';
import { pageAiContext, type PageAiSelection } from '../src/ai-page-context';

const none: PageAiSelection = { copy: null, bazi: null, reading: null };

test('助手卡片显示导航中的工作台名和子页名，专用模块名称保持不变', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });

  const chat = (id: string, title: string, scope: AiScope, updatedAt: string): ChatSession =>
    ({ id, title, updatedAt, draft: '', entries: [], ...scope, contextScope: scope, pageScope: scope });
  const chats = [
    chat('game-chat', '游戏对话', { module: 'workbench', viewId: 'game' }, '2026-10-01T01:00:00Z'),
    chat('web-chat', '网页对话', { module: 'workbench', viewId: 'browser' }, '2026-10-01T02:00:00Z'),
    chat('media-workspace', '自媒体通用对话', { module: 'workbench', viewId: 'workspace:media' }, '2026-10-01T03:00:00Z'),
    chat('blog', '博文对话', { module: 'copy', draftId: 'blog-a' }, '2026-10-01T04:00:00Z'),
  ];
  (dom.window as unknown as { workbench: unknown }).workbench = {
    ai: {
      onAsk: () => () => undefined,
      config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', hasConnection: true, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' }),
      chatList: async () => chats.map(({ id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope }) =>
        ({ id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope })),
      chatOpen: async (id: string) => ({ ...chats.find(item => item.id === id) }),
      chatNew: async () => { throw new Error('context card must not create a conversation'); },
      chatDraft: async () => undefined,
      onChat: () => () => undefined,
    },
    browserAutomation: {
      tabs: async () => [],
      state: async () => ({ tasks: [], tabs: [], activeId: '', history: [] }),
      onTask: () => () => undefined,
    },
  };

  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const props = {
    open: true, onClose: () => undefined, onChatLocated: () => undefined, onActiveChatChange: () => undefined,
    onOpenSettings: () => undefined, onLocateCopySource: () => undefined, onLocateBaziDay: () => undefined,
    onQuickAsk: () => undefined, width: 380, onWidthChange: () => undefined,
  };
  const render = async (context: AiPanelContext) => {
    await act(async () => { root.render(createElement(AiPanel, { ...props, context })); await Promise.resolve(); await Promise.resolve(); });
  };
  const modname = () => dom.window.document.querySelector('.ai-ctx-modname')?.textContent;
  const objectText = () => dom.window.document.querySelector('.ai-ctx-name')?.textContent;
  const selectedTitle = () => dom.window.document.querySelector('.ai-context-select .select-trigger strong')?.textContent;
  const openNamed = async (title: string) => {
    await act(async () => { dom.window.document.querySelector<HTMLButtonElement>('.ai-context-select .select-trigger')!.click(); });
    await act(async () => {
      const button = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.ai-context-chat-main')]
        .find(item => item.textContent?.includes(title));
      assert.ok(button, title);
      button.click();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  try {
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    assert.equal(modname(), '待办与日程');
    assert.equal(dom.window.document.querySelector('.ai-ctx-name'), null);

    await openNamed('游戏对话');
    assert.equal(selectedTitle(), '游戏对话');
    assert.equal(modname(), '游戏工作台');
    assert.equal(objectText(), '轨迹侦探');

    await openNamed('网页对话');
    assert.equal(selectedTitle(), '网页对话');
    assert.equal(modname(), '网页工作台');
    assert.equal(objectText(), '浏览器');

    await openNamed('自媒体通用对话');
    assert.equal(modname(), '自媒体工作台');
    assert.equal(objectText(), '自媒体工作台');
    assert.equal(dom.window.document.body.textContent?.includes('工作台助手'), false);

    await openNamed('博文对话');
    assert.equal(modname(), '博客历史');
    assert.equal(objectText(), '博文对话');

    await render(pageAiContext('game', none));
    assert.equal(modname(), '游戏工作台');
    assert.equal(objectText(), '轨迹侦探');

    await render(pageAiContext('browser', none));
    assert.equal(modname(), '网页工作台');
    assert.equal(objectText(), '浏览器');
    assert.equal(dom.window.document.body.textContent?.includes('浏览器助手'), false);
    assert.equal(dom.window.document.body.textContent?.includes('当前页面'), false);

    await render(pageAiContext('copy', { ...none, copy: { id: 'blog-a', title: '周记' } }));
    assert.equal(modname(), '博客编辑');
    assert.equal(objectText(), '周记');

    await render(pageAiContext('bazi', { ...none, bazi: { id: 'profile-a', name: '命例甲', system: 'ziwei' } }));
    assert.equal(modname(), '紫微斗数');
    assert.equal(objectText(), '命例甲');

    await render(pageAiContext('reading', { ...none, reading: { id: 'book-a', title: '海边的卡夫卡' } }));
    assert.equal(modname(), '阅读助手');
    assert.equal(objectText(), '海边的卡夫卡');

    await render(pageAiContext('home', none));
    assert.equal(modname(), '待办与日程');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
