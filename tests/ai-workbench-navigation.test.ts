import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { ChatSession } from '../shared/todo-contracts';
import type { AiScope } from '../shared/ai-scope';
import type { AiPanelContext } from '../src/views/AiPanel';

test('切换一级工作台恢复各自会话，同工作台切页保留当前会话', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });

  const chat = (id: string, title: string, scope: AiScope, updatedAt: string, draft = ''): ChatSession =>
    ({ id, title, updatedAt, draft, entries: [], ...scope, contextScope: scope, pageScope: scope });
  const home = chat('home', '待办对话', { module: 'todo' }, '2026-09-29T01:00:00Z');
  const mediaRecent = chat('media-recent', '最近的自媒体对话', { module: 'workbench', viewId: 'workspace:media' }, '2026-09-29T03:00:00Z');
  const mediaChosen = chat('media-chosen', '保留的自媒体对话', { module: 'workbench', viewId: 'workspace:media' }, '2026-09-29T02:00:00Z', '未发送草稿');
  mediaChosen.entries.push({ id: 'old-edit', role: 'assistant', content: '已提出改写', contextScope: { module: 'copy', draftId: 'blog-a' }, actionState: 'pending',
    copyProposal: { token: 'proposal-a', message: '改写建议', original: { title: '博文 A', body: '原文' }, actions: [{ kind: 'edit', text: '改写正文', notes: [] }] } });
  const life = chat('life', '命理对话', { module: 'bazi', profileId: 'profile-a' }, '2026-09-29T03:00:00Z', '请继续解释');
  life.entries.push({ id: 'old-chart', role: 'assistant', content: '日主特征', contextScope: { module: 'bazi', profileId: 'profile-a' }, baziSystem: 'bazi' });
  const chats = [home, mediaRecent, mediaChosen, life];
  const requests: { id: string; scope: AiScope; pageScope?: AiScope; references?: AiScope[]; baziSystem?: string }[] = [];
  const applied: string[] = [];
  const located: string[] = [];
  let listener: (value: ChatSession) => void = () => undefined;
  let finishRequest: (() => void) | undefined;
  let holdRequest = false;
  let newChatCount = 0;
  (dom.window as unknown as { workbench: unknown }).workbench = {
    ai: {
      config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', hasConnection: true, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' }),
      chatList: async () => chats.map(({ id, title, updatedAt, module, draftId, profileId, viewId }) => ({ id, title, updatedAt, module, draftId, profileId, viewId })),
      chatOpen: async (id: string) => ({ ...chats.find(item => item.id === id) }),
      chatNew: async () => { newChatCount++; throw new Error('navigation must not create a conversation'); },
      chatDraft: async () => undefined,
      onChat: (callback: typeof listener) => { listener = callback; return () => undefined; },
      ask: async (id: string, text: string, turn: { scope: AiScope; pageScope?: AiScope; references?: AiScope[]; baziSystem?: string }) => {
        requests.push({ id, ...turn });
        const current = chats.find(item => item.id === id)!;
        current.contextScope = turn.scope;
        current.entries.push({ id: `question-${requests.length}`, role: 'user', content: text, contextScope: turn.scope }, { id: `reply-${requests.length}`, role: 'assistant', content: '', contextScope: turn.scope, streaming: true });
        listener({ ...current, entries: [...current.entries] });
        if (holdRequest) await new Promise<void>(resolve => { finishRequest = resolve; });
        current.entries.at(-1)!.streaming = false;
        current.entries.at(-1)!.content = '本轮回复';
        listener({ ...current, entries: [...current.entries] });
      },
      apply: async (token: string) => { applied.push(token); },
    },
    copy: { list: async () => ({ drafts: [{ id: 'blog-a', title: '博文 A' }, { id: 'blog-b', title: '博文 B' }] }) },
    bazi: { list: async () => ({ profiles: [{ id: 'profile-a', name: '命例 A', date: '1990-08-16', time: '14:30', gender: 1 }, { id: 'profile-b', name: '命例 B', date: '1993-02-23', time: '06:15', gender: 0 }] }) },
  };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const props = { open: true, onClose: () => undefined, onChatLocated: () => undefined, onActiveChatChange: () => undefined,
    onOpenSettings: () => undefined, onLocateCopySource: () => undefined, onLocateBaziDay: (id: string) => { located.push(id); },
    onQuickAsk: () => undefined, width: 380, onWidthChange: () => undefined };
  const render = async (context: AiPanelContext) => {
    await act(async () => { root.render(createElement(AiPanel, { ...props, context })); await Promise.resolve(); });
  };
  const selectedTitle = () => dom.window.document.querySelector('.ai-context-select .select-trigger strong')?.textContent;
  const scopeText = () => dom.window.document.querySelector('.ai-ctx-wschip')?.textContent;
  const objectText = () => dom.window.document.querySelector('.ai-ctx-name')?.textContent;
  const click = async (selector: string) => { await act(async () => { dom.window.document.querySelector<HTMLButtonElement>(selector)!.click(); await Promise.resolve(); }); };

  try {
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    assert.equal(selectedTitle(), '待办对话');
    await render({ scope: { module: 'workbench', viewId: 'copy' }, label: '工作台助手', object: '尚未选择博客' });
    assert.equal(selectedTitle(), '最近的自媒体对话');
    await act(async () => { dom.window.document.querySelector<HTMLButtonElement>('.ai-context-select .select-trigger')!.click(); });
    await act(async () => {
      [...dom.window.document.querySelectorAll<HTMLButtonElement>('.ai-context-chat-main')]
        .find(button => button.textContent?.includes('保留的自媒体对话'))!.click();
      await Promise.resolve();
    });
    assert.equal(selectedTitle(), '保留的自媒体对话');
    assert.equal(dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')?.value, '未发送草稿');
    await render({ scope: { module: 'workbench', viewId: 'copy-publish' }, label: '工作台助手', object: '图文发布' });
    assert.equal(selectedTitle(), '保留的自媒体对话');
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    assert.equal(selectedTitle(), '待办对话');
    await render({ scope: { module: 'workbench', viewId: 'settings-general' }, label: '工作台助手', object: '设置' });
    assert.equal(selectedTitle(), '新对话');
    assert.equal(scopeText(), '设置');
    await render({ scope: { module: 'workbench', viewId: 'copy' }, label: '工作台助手', object: '尚未选择博客' });
    assert.equal(selectedTitle(), '保留的自媒体对话');
    assert.equal(dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')?.value, '未发送草稿');
    assert.equal(newChatCount, 0);

    await render({ scope: { module: 'copy', draftId: 'blog-a' }, label: '博客编辑', object: '博文 A' });
    assert.equal(objectText(), '博文 A');
    await click('.ai-ctx-pin');
    await render({ scope: { module: 'copy', draftId: 'blog-a' }, label: '博客编辑', object: '博文 A 新标题' });
    assert.equal(objectText(), '博文 A 新标题');
    await render({ scope: { module: 'copy', draftId: 'blog-b' }, label: '博客编辑', object: '博文 B' });
    assert.equal(selectedTitle(), '保留的自媒体对话');
    assert.equal(objectText(), '博文 A 新标题');
    assert.equal(dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')?.value, '未发送草稿');
    await click('.ai-ctx-pin');
    assert.equal(objectText(), '博文 B');
    await click('.ai-add-reference');
    assert.equal(dom.window.document.querySelectorAll('.ai-reference-option').length, 1);
    assert.match(dom.window.document.querySelector('.ai-reference-option')!.textContent!, /博文 A/);
    await click('.ai-reference-option input');
    await click('.ai-reference-dialog .primary');
    assert.match(dom.window.document.querySelector('.ai-reference-chip')!.textContent!, /博文 A/);
    holdRequest = true;
    await click('.ai-send');
    assert.deepEqual(requests[0], { id: 'media-chosen', scope: { module: 'copy', draftId: 'blog-b' }, pageScope: { module: 'copy', draftId: 'blog-b' }, references: [{ module: 'copy', draftId: 'blog-a' }], baziSystem: undefined });
    await render({ scope: { module: 'copy', draftId: 'blog-a' }, label: '博客编辑', object: '博文 A' });
    assert.equal(objectText(), '博文 A');
    assert.deepEqual(mediaChosen.entries.at(-1)!.contextScope, { module: 'copy', draftId: 'blog-b' });
    await act(async () => { finishRequest!(); await Promise.resolve(); });
    holdRequest = false;
    await click('.ai-apply');
    assert.deepEqual(applied, ['proposal-a']);
    assert.match(dom.window.document.querySelector('.ai-apply')!.textContent!, /博文 A/);
    assert.equal(dom.window.document.querySelectorAll('.ai-reference-chip').length, 0, '主对象不能重复作为参考');
    await render({ scope: { module: 'copy', draftId: 'blog-b' }, label: '博客编辑', object: '博文 B' });
    assert.match(dom.window.document.querySelector('.ai-reference-chip')!.textContent!, /博文 A/);
    await click('.ai-reference-chip button');
    assert.equal(dom.window.document.querySelectorAll('.ai-reference-chip').length, 0);
    await render({ scope: { module: 'workbench', viewId: 'copy' }, label: '工作台助手', object: '尚未选择博客' });
    assert.equal(objectText(), '尚未选择博客', '空编辑页应清除本轮业务对象');

    await render({ scope: { module: 'bazi', profileId: 'profile-a' }, label: '命理解读', object: '命例 A', baziSystem: 'bazi' });
    await render({ scope: { module: 'bazi', profileId: 'profile-b' }, label: '命理解读', object: '命例 B', baziSystem: 'ziwei' });
    assert.equal(selectedTitle(), '命理对话');
    assert.equal(objectText(), '命例 B');
    await click('.ai-add-reference');
    await click('.ai-reference-option input');
    await click('.ai-reference-dialog .primary');
    await click('.ai-source-chip');
    assert.deepEqual(located, ['profile-a']);
    await click('.ai-send');
    assert.equal(requests[1].id, 'life');
    assert.deepEqual(requests[1].scope, { module: 'bazi', profileId: 'profile-b' });
    assert.equal(requests[1].baziSystem, 'ziwei');
    assert.deepEqual(requests[1].references, [{ module: 'bazi', profileId: 'profile-a' }]);
    await render({ scope: { module: 'bazi', profileId: 'profile-b' }, label: '命理解读', object: '命例 B', baziSystem: 'astro' });
    assert.equal(objectText(), '命例 B');
    assert.equal(newChatCount, 0);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
