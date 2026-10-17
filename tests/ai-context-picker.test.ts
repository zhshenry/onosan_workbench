import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { ChatSession } from '../shared/todo-contracts';
import type { AiScope } from '../shared/ai-scope';
import type { AiPanelContext, AiSeed } from '../src/views/AiPanel';

test('上下文选择器使用真实控件发送所选 ID，并隔离页面、会话和空态', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  (dom.window as any).ResizeObserver = class { observe() {} disconnect() {} };
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const task = (id: string, title: string, kind = 'task', status = 'todo') => ({ id, title, kind, status, deletedAt: null, plannedDate: '2026-01-01', dueAt: '2026-01-01T12:00:00Z', priority: 'medium', note: '已记录备注', progress: 0 });
  let tasks = [task('task-a', '季度报告'), task('task-b', '项目会议', 'meeting'), task('task-done', '已完成事项', 'task', 'done'), { ...task('task-deleted', '不可见删除事项'), deletedAt: '2026-01-01' }];
  let books = [{ id: 'book-a', title: '已有书目', author: '作者甲', status: 'reading', tags: [], progressPct: 30 }];
  const drafts = Array.from({ length: 10 }, (_, i) => ({ id: `blog-${i}`, title: `参考博文${i}`, body: `正文${i}` }));
  const profiles = [{ id: 'profile-a', name: '命例甲', date: '1990-01-01', time: '12:00', gender: 1 }, { id: 'profile-b', name: '命例乙', date: '1992-01-01', time: '12:00', gender: 0 }];
  let reads = { todo: 0, reading: 0, copy: 0, bazi: 0 };
  const chats: ChatSession[] = [];
  const requests: { id: string; text: string; turn: any }[] = [];
  let listener: (chat: ChatSession) => void = () => undefined;
  let todoPending: Promise<unknown> | undefined;
  let todoReadError = '';
  const newChat = (scope: AiScope): ChatSession => {
    const item: ChatSession = { id: `chat-${chats.length}`, title: '新对话', updatedAt: '2026-01-01', draft: '', entries: [], ...scope, contextScope: scope, pageScope: scope };
    chats.push(item); return item;
  };
  const originalHome = newChat({ module: 'todo' });
  (dom.window as unknown as { workbench: unknown }).workbench = {
    browserAutomation: { tabs: async () => [] },
    ai: {
      onAsk: () => () => undefined,
      config: async () => ({ aiEnabled: true, providers: [], models: [], activeModelId: '', hasConnection: true, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' }),
      chatList: async () => chats.map(item => ({ ...item })),
      chatOpen: async (id: string) => ({ ...chats.find(item => item.id === id)! }),
      chatNew: async (scope: AiScope) => newChat(scope),
      chatDraft: async () => undefined,
      onChat: (callback: typeof listener) => { listener = callback; return () => undefined; },
      ask: async (id: string, text: string, turn: any) => {
        requests.push({ id, text, turn });
        const item = chats.find(chat => chat.id === id)!;
        item.entries.push({ id: `u${requests.length}`, role: 'user', content: text, references: turn.references, contextScope: turn.scope, pageScope: turn.pageScope });
        item.contextScope = turn.scope; item.pageScope = turn.pageScope;
        listener({ ...item, entries: [...item.entries] });
      },
    },
    todo: { state: async () => { reads.todo++; if (todoReadError) throw new Error(todoReadError); return todoPending ?? { tasks, categories: [] }; }, onChanged: () => () => undefined },
    reading: { list: async () => { reads.reading++; return { books, vaultPath: '/must-not-be-used' }; } },
    copy: { list: async () => { reads.copy++; return { drafts }; } },
    bazi: { list: async () => { reads.bazi++; return { profiles }; } },
  };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const props = { open: true, onClose: () => undefined, onChatLocated: () => undefined, onActiveChatChange: () => undefined, onOpenSettings: () => undefined,
    onLocateCopySource: () => undefined, onLocateBaziDay: () => undefined, onQuickAsk: () => undefined, width: 380, onWidthChange: () => undefined };
  let context: AiPanelContext = { scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' };
  let extra: Record<string, unknown> = {};
  const render = async (next = context, additions: Record<string, unknown> = {}) => {
    context = next; extra = additions;
    await act(async () => { root.render(createElement(AiPanel, { ...props, context, ...extra })); await Promise.resolve(); });
  };
  const all = (selector: string) => [...dom.window.document.querySelectorAll<HTMLElement>(selector)];
  const click = async (selector: string) => {
    const element = dom.window.document.querySelector<HTMLElement>(selector); assert.ok(element, selector);
    await act(async () => { element.click(); await Promise.resolve(); });
  };
  const type = async (selector: string, value: string) => {
    const element = dom.window.document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector); assert.ok(element, selector);
    const prototype = element.tagName === 'TEXTAREA' ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype;
    await act(async () => { Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(element, value); element.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
  };
  const key = async (element: Element | Window, value: string) => {
    await act(async () => { element.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })); });
  };
  const select = async (title: string) => {
    const option = all('.ai-reference-option').find(item => item.textContent?.includes(title)); assert.ok(option, title);
    await act(async () => { option.querySelector<HTMLInputElement>('input')!.click(); });
  };
  const apply = async () => { if (dom.window.document.querySelector('.ai-reference-dialog .primary')) await click('.ai-reference-dialog .primary'); else if (dom.window.document.querySelector('.ai-reference-dialog')) await key(dom.window as unknown as Window, 'Escape'); };
  const send = async (text: string) => { await type('.ai-compose textarea', text); await click('.ai-send'); };
  try {
    await render();
    assert.ok(dom.window.document.querySelector('.ai-compose-toolbar .ai-add-reference'), '+ stays at composer bottom');
    await click('.ai-add-reference');
    assert.equal(all('.ai-reference-option').length, 3);
    assert.ok(dom.window.document.querySelector('.todo-picker-filters'), 'todo picker has filter chips');
    const filterButton = (group: string, label: string) => all(`[aria-label="${group}"] button`).find(button => button.textContent === label)!;
    assert.deepEqual(all('[aria-label="按状态筛选"] button').map(button => button.textContent), ['全部', '待办', '进行中', '已完成', '已逾期']);
    assert.deepEqual(all('[aria-label="按类型筛选"] button').map(button => button.textContent), ['全部', '事项', '日程']);
    await act(async () => { filterButton('按状态筛选', '已完成').click(); });
    assert.equal(all('.ai-reference-option').length, 1);
    assert.match(all('.ai-reference-option')[0].textContent!, /已完成事项/);
    await act(async () => { filterButton('按状态筛选', '全部').click(); });
    await act(async () => { filterButton('按类型筛选', '日程').click(); });
    assert.equal(all('.ai-reference-option').length, 1);
    assert.match(all('.ai-reference-option')[0].textContent!, /项目会议/);
    await act(async () => { filterButton('按类型筛选', '全部').click(); });
    await act(async () => { all('.ai-reference-option input')[0].focus(); });
    assert.equal(all('.ai-reference-option').length, 3);
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /日程/);
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /已完成/);
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /逾期/);
    assert.equal(reads.copy + reads.bazi + reads.reading, 0, 'todo picker does not load other stores');
    for (const selector of ['.ai-reference-head', '.ai-reference-search', '.ai-reference-filters', '.ai-reference-footer']) {
      assert.equal(all(selector).length, 0, `Todo v3 light list removes ${selector}`);
    }
    assert.equal(all('.ai-reference-kind').length, 3);
    assert.equal(all('.ai-reference-selected-mark').length, 3, 'Each row reserves an independent selection mark');
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('.ai-reference-option input'));
    await key(dom.window.document.activeElement!, 'ArrowDown');
    assert.equal(dom.window.document.activeElement, all('.ai-reference-option input')[1]);
    assert.equal(all('.ai-reference-chip').length, 0, 'Moving focus never commits a selection');
    await key(dom.window.document.activeElement!, 'Home');
    await key(dom.window.document.activeElement!, 'Enter'); await apply();
    assert.equal(all('.ai-reference-chip').length, 1);
    await send('请查看选中事项');
    assert.deepEqual(requests.at(-1)!.turn.references, [{ module: 'todo', taskId: 'task-a' }]);
    assert.deepEqual(requests.at(-1)!.turn.scope, { module: 'todo' });
    assert.equal(requests.at(-1)!.id, originalHome.id);

    assert.equal(all('.ai-reference-dialog').length, 0, 'Todo selection closes immediately');
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('.ai-add-reference'));
    const originalTasks = tasks;
    tasks = [...tasks, ...Array.from({ length: 40 }, (_, i) => ({ ...task(`many-${i}`, i < 2 ? '同名事项' : `滚动事项${i}`), plannedDate: `2026-02-${i === 0 ? '01' : '02'}`, dueAt: `2026-02-${i === 0 ? '01' : '02'}T12:00:00Z` }))];
    await click('.ai-add-reference');
    assert.equal(all('.ai-reference-option').length, 43, 'All eligible records remain available beyond eight/twenty');
    const duplicateRows = all('.ai-reference-option').filter(item => item.textContent?.includes('同名事项'));
    assert.equal(duplicateRows.length, 2);
    assert.notEqual(duplicateRows[0].getAttribute('title'), duplicateRows[1].getAttribute('title'), 'Same-name rows preserve their distinguishing date');
    await key(dom.window.document.activeElement!, 'End');
    assert.equal(dom.window.document.activeElement, all('.ai-reference-option input').at(-1));
    await key(dom.window.document.activeElement!, ' ');
    assert.equal(all('.ai-reference-dialog').length, 0, 'Space selects and dismisses the list');
    assert.match(all('.ai-reference-chip')[0].textContent!, /滚动事项39/);
    await click('.ai-add-reference');
    const selectedRow = dom.window.document.querySelector('.ai-reference-option.is-selected')!;
    assert.ok(selectedRow.querySelector('.ai-reference-selected-mark svg'));
    assert.ok(selectedRow.querySelector('.ai-reference-status.overdue'), 'Selected state does not replace business status');
    assert.equal(dom.window.document.activeElement, selectedRow.querySelector('input'));
    await key(dom.window as unknown as Window, 'Escape');
    await click('.ai-reference-chip button');
    tasks = originalTasks;
    await click('.ai-add-reference'); await select('季度报告');
    await click('.ai-add-reference');
    await select('季度报告');
    assert.equal(all('.ai-reference-chip').length, 0, 'click selected radio again cancels it');
    await click('.ai-add-reference'); await select('项目会议'); await apply();
    assert.equal(all('.ai-reference-chip').length, 1, 'single select replaces');
    await send('查看日程');
    assert.deepEqual(requests.at(-1)!.turn.references, [{ module: 'todo', taskId: 'task-b' }]);
    await click('.ai-reference-chip button');
    await send('取消后发送');
    assert.deepEqual(requests.at(-1)!.turn.references, []);
    await click('.ai-add-reference');
    await key(dom.window as unknown as Window, 'Escape');
    assert.equal(all('.ai-reference-dialog').length, 0);
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('.ai-add-reference'));
    await click('.ai-add-reference');
    await act(async () => { dom.window.document.body.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })); });
    assert.equal(all('.ai-reference-dialog').length, 0);
    await click('.ai-add-reference');
    await act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')); });
    assert.equal(all('.ai-reference-dialog').length, 0);

    await click('.ai-add-reference'); await select('季度报告'); await apply();
    await click('.ai-ctx-new');
    assert.equal(all('.ai-reference-chip').length, 0, 'new conversation starts with no references');
    await send('新对话'); assert.deepEqual(requests.at(-1)!.turn.references, []);
    await click('.ai-add-reference'); await select('季度报告'); await apply();
    tasks = tasks.filter(item => item.id !== 'task-a');
    const beforeInvalidSend = requests.length;
    await send('失效对象');
    assert.equal(requests.length, beforeInvalidSend, 'invalid selection rejected before ask');
    assert.match(dom.window.document.querySelector('.ai-error')!.textContent!, /已删除|失效/);
    assert.equal(dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')!.value, '失效对象');
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /失效|删除/);
    await key(dom.window as unknown as Window, 'Escape');

    await render({ scope: { module: 'workbench', viewId: 'copy-publish' }, label: '工作台助手', object: '图文发布' });
    assert.equal(all('.ai-reference-chip').length, 0);
    await click('.ai-add-reference');
    assert.equal(all('.todo-picker-filters').length, 0, 'non-todo pickers keep search instead of todo filter chips');
    await type('.ai-reference-search input', '无匹配');
    assert.equal(all('.ai-reference-option').length, 0);
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /没有找到/);
    await type('.ai-reference-search input', '');
    for (let i = 0; i < 8; i++) await select(`参考博文${i}`);
    assert.equal(all('.ai-reference-option input:disabled').length, 2, 'copy keeps eight-reference limit');
    await apply(); await send('比较博客');
    assert.equal(requests.at(-1)!.turn.references.length, 8);
    assert.deepEqual(requests.at(-1)!.turn.scope, { module: 'workbench', viewId: 'copy-publish' }, 'references do not grant primary copy scope');
    await click('.ai-add-reference');
    await select('参考博文0');
    await act(async () => { all('.ai-reference-dialog .actions button').find(item => item.textContent === '取消')!.click(); });
    assert.equal(all('.ai-reference-chip').length, 8, 'cancel leaves existing multi-selection unchanged');
    await render({ scope: { module: 'workbench', viewId: 'media-browser' }, label: '工作台助手', object: '我的小红书' });
    assert.equal(all('.ai-reference-chip').length, 0, 'different visible page does not inherit hidden references');
    await click('.ai-add-reference'); await select('参考博文0'); await apply();
    const seed: AiSeed = { text: '快捷发送', nonce: 1, scope: context.scope };
    await render(context, { seed });
    assert.equal(requests.at(-1)!.text, seed.text);
    assert.equal(requests.at(-1)!.turn.browserTabId, null, 'blank page is captured explicitly for the browser request');
    assert.deepEqual(requests.at(-1)!.turn.references, [{ module: 'copy', draftId: 'blog-0' }]);

    await render({ scope: { module: 'workbench', viewId: 'reading' }, label: '阅读清单', object: '未选书目' });
    await click('.ai-add-reference'); await select('已有书目'); await apply(); await send('介绍书目');
    assert.deepEqual(requests.at(-1)!.turn.references, [{ module: 'reading', profileId: 'book-a' }]);
    assert.equal(JSON.stringify(requests.at(-1)).includes('vault'), false);
    await render({ scope: { module: 'bazi', profileId: 'profile-a' }, label: '命理', object: '命例甲', baziSystem: 'ziwei' });
    assert.equal(all('.ai-reference-chip').length, 0);
    await click('.ai-add-reference');
    assert.equal(all('.ai-reference-option').length, 1);
    await select('命例乙'); await apply(); await send('比较命例');
    assert.deepEqual(requests.at(-1)!.turn.references, [{ module: 'bazi', profileId: 'profile-b' }]);
    assert.equal(requests.at(-1)!.turn.baziSystem, 'ziwei');
    books = [];
    await render({ scope: { module: 'workbench', viewId: 'reading' }, label: '阅读', object: '未选书目' });
    await click('.ai-add-reference'); assert.equal(all('.ai-reference-option').length, 0);
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /暂无/);
    await key(dom.window as unknown as Window, 'Escape');

    await render({ scope: { module: 'workbench', viewId: 'settings-general' }, label: '设置', object: '常规' });
    const beforeSettings = { ...reads };
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /当前没有可关联内容/);
    assert.deepEqual(reads, beforeSettings);
    await key(dom.window as unknown as Window, 'Escape');
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' }, { plannedWorkbench: true });
    const beforePlanned = { ...reads };
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /工作台尚未开放，暂无可关联内容/);
    assert.deepEqual(reads, beforePlanned);
    assert.equal(all('.ai-reference-chip').length, 0);
    await key(dom.window as unknown as Window, 'Escape');

    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    const beforeEmpty = tasks; tasks = [];
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /暂无可关联的事项/);
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('.ai-reference-dialog'));
    await key(dom.window as unknown as Window, 'Escape'); tasks = beforeEmpty;

    todoReadError = '合成读取失败';
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog [role="alert"]')!.textContent!, /合成读取失败/);
    todoReadError = '';
    await click('.ai-reference-dialog .ai-reference-empty button');
    assert.ok(all('.ai-reference-option').length > 0, 'retry reloads real options');
    await key(dom.window as unknown as Window, 'Escape');

    let resolveList!: (value: unknown) => void;
    todoPending = new Promise(resolve => { resolveList = resolve; });
    await render({ scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' });
    await click('.ai-add-reference');
    assert.match(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /读取|加载/);
    await render({ scope: { module: 'workbench', viewId: 'settings-general' }, label: '设置', object: '常规' });
    await act(async () => { resolveList({ tasks: [task('late', '迟到的事项')], categories: [] }); await Promise.resolve(); });
    await click('.ai-add-reference');
    assert.equal(all('.ai-reference-option').length, 0, 'late response must not contaminate new page');
    assert.doesNotMatch(dom.window.document.querySelector('.ai-reference-dialog')!.textContent!, /迟到的事项/);
    await key(dom.window as unknown as Window, 'Escape');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globals.forEach((name, i) => previous[i] ? Object.defineProperty(globalThis, name, previous[i]!) : Reflect.deleteProperty(globalThis, name));
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
