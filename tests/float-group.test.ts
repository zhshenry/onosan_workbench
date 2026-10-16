import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { readFileSync } from 'node:fs';

// Exercise the real React component through the physical event ordering that
// previously closed the mini picker before its option's click could run.
test('floating picker survives pointerdown, displays real status and cancels without model calls', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  let asks = 0;
  Object.assign(dom.window, { workbench: { ai: {
    chatList: async () => [], chatNew: async () => ({ id: 'chat', entries: [] }),
    onChat: () => () => {}, onAsk: () => () => {}, config: async () => ({ providers: [{ id: 'p', name: 'Provider' }], models: [{ id: 'm', name: 'A very long model name', providerId: 'p' }], activeModelId: 'm' }),
    ask: async () => { asks++; },
  } } });
  const { FloatAiChat } = await import('../src/views/FloatTodo');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const task = { id: 'done', title: '已完成但旧截止日期的事项', kind: 'task', status: 'done', dueAt: '2000-01-01T00:00:00Z', plannedDate: '2000-01-01', deletedAt: null };
  const tasks = [task, { ...task, id: 'overdue', status: 'todo', title: '很长的未完成事项' }, { ...task, id: 'doing', status: 'doing', dueAt: '2099-01-01T23:00:00Z', title: '进行中的事项' }, { ...task, id: 'meeting', kind: 'meeting', status: 'todo', endAt: '2099-01-01T23:00:00Z', title: '日程按结束时间判断' }];
  const click = async (el: Element) => { await act(async () => el.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }))); assert.equal(el.isConnected, true, 'pointerdown must not unmount the clicked option'); await act(async () => (el as HTMLElement).click()); };
  const find = (selector: string) => dom.window.document.querySelector(selector)!;
  try {
    for (const mini of [true, false]) {
      await act(async () => root.render(createElement(FloatAiChat, { mini, seed: null, onSeedConsumed() {}, tasks: tasks as never })));
      await click(find('.ai-add-reference'));
      const filters = dom.window.document.querySelector('.todo-picker-filters');
      assert.ok(filters, 'picker exposes status and kind filters');
      const filterButton = (group: string, label: string) => [...dom.window.document.querySelectorAll<HTMLButtonElement>(`[aria-label="${group}"] button`)].find(button => button.textContent === label)!;
      await click(filterButton('按状态筛选', '已完成'));
      assert.equal(dom.window.document.querySelectorAll('[role="option"]').length, 1);
      assert.match(dom.window.document.querySelector('[role="option"]')!.textContent!, /已完成/);
      await click(filterButton('按状态筛选', '全部'));
      await click(filterButton('按类型筛选', '日程'));
      assert.equal(dom.window.document.querySelectorAll('[role="option"]').length, 1);
      assert.match(dom.window.document.querySelector('[role="option"]')!.textContent!, /日程/);
      await click(filterButton('按类型筛选', '全部'));
      const options = [...dom.window.document.querySelectorAll('[role="option"]')];
      assert.equal(options.length, 4);
      assert.match(options[0].textContent!, /已完成/); assert.doesNotMatch(options[0].textContent!, /已逾期/);
      assert.match(options[1].textContent!, /已逾期/);
      assert.match(options[2].textContent!, /进行中/);
      assert.match(options[3].textContent!, /日程/); assert.doesNotMatch(options[3].textContent!, /已逾期/);
      assert.ok(options[0].querySelector('.ai-reference-option-text strong'), 'float rows use the built-in title/detail structure');
      await click(options[0]);
      const chip = () => find(mini ? '.fa-mini-compose .ai-reference-chip' : '.fa-surface .ai-compose-input .ai-reference-chip');
      assert.match(chip().textContent!, /已完成但旧截止/);
      assert.equal(dom.window.document.querySelector('.fa-linked-row'), null, 'chip stays inside the dialog');
      if (mini) assert.ok(find('.fa-mini-compose').contains(chip()));
      else assert.ok(find('.ai-compose-input').contains(chip()));
      assert.equal(find('.ai-add-reference').textContent, '关联事项');
      await click(find('.ai-add-reference')); await click(dom.window.document.querySelectorAll('[role="option"]')[1]);
      assert.match(chip().textContent!, /很长的未完成/);
      await click(chip().querySelector('button')!);
      assert.equal(dom.window.document.querySelector(mini ? '.fa-mini-compose .ai-reference-chip' : '.fa-surface .ai-compose-input .ai-reference-chip'), null);
      assert.equal(asks, 0);
      await click(find('.ai-add-reference'));
      await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(dom.window.document.querySelector('[role="listbox"]'), null);
      assert.equal(dom.window.document.activeElement, find('.ai-add-reference'));
      if (!mini) {
        const fullModelName = 'A very long model name';
        assert.equal(find('.ai-model-select .select-trigger [title]').getAttribute('title'), fullModelName);
        assert.equal(find('.ai-model-select .select-trigger').getAttribute('aria-valuetext'), fullModelName);
      }
      if (mini) {
        await click(find('.fa-model-toggle'));
        const menu = find('.fa-mini-model-menu');
        assert.ok(parseFloat(menu.style.width) <= 152, 'collapsed model menu stays narrow');
        await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
        assert.equal(dom.window.document.querySelector('[role="menu"]'), null);
        assert.equal(dom.window.document.activeElement, find('.fa-model-toggle'));
      }
    }
  } finally { await act(async () => root.unmount()); dom.window.close(); names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name)); }
});

test('width-only measurement is isolated from polling and home AI stripe is removed', () => {
  const source = readFileSync('src/views/FloatTodo.tsx', 'utf8');
  assert.match(source, /const measurementData = JSON.stringify\(data\)/);
  assert.match(source, /movingRef.current \|\| widthReflow/);
  assert.doesNotMatch(source, /className="float-insight"/);
  assert.match(source, /返回首页/);
  assert.doesNotMatch(source, />记录 \{tools.length\}/);
});

test('floating expanded toolbar reserves reference text while model takes shrinkable remaining width', () => {
  const css = readFileSync('src/shell.css', 'utf8');
  assert.match(css, /\.float-app\.narrow \.fa-surface \.ai-compose-toolbar > \.ai-add-reference \{[^}]*flex: none;[^}]*white-space: nowrap;/);
  assert.match(css, /\.fa-surface \.ai-compose-toolbar > \.ai-model-select \{ flex: 0 0 auto; width: max-content; min-width: 88px; max-width: min\(148px, calc\(100% - 88px\)\); \}/);
  assert.doesNotMatch(css, /\.float-app\.narrow \.fa-surface \.ai-compose-toolbar > \.ai-model-select \{ flex: 1 1 0;/);
  assert.match(css, /\.fa-surface \.ai-model-select \.select-trigger > span \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.fa-mini-surface \{ height: 124px; grid-template-rows: 22px 55px 22px;/);
  assert.match(css, /\.fa-mini-quick \.fa-model-toggle \{ flex: 0 0 120px; width: 120px; max-width: 120px;/);
  assert.match(css, /\.fa-mini-compose-main > button\[type='submit'\] \{ align-self: flex-end;/);
  assert.match(css, /\.fa-mini-surface \.todo-proposal-intro \{ display: none; \}/);
  assert.match(css, /\.fa-mini-surface \.todo-proposal-target > div \{ display: flex;/);
  assert.match(css, /\.fa-mini-surface \.todo-proposal-field \{ display: flex;/);
  assert.doesNotMatch(css, /grid-template-rows: 22px 20px 32px 22px/);
  assert.match(css, /\.ai-panel \.ai-compose-toolbar > \.ai-model-select \{[^}]*max-width: min\(148px/);
});

test('expanded and collapsed modify cards share the built-in suggestion hierarchy', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  const token = '11111111-1111-4111-8111-111111111111';
  const entry = { id: 'e1', role: 'assistant', content: '建议修改截止时间', actionState: 'pending' as const, proposal: { token, message: '建议', actions: [{ type: 'update' as const, id: 'task-1', patch: { dueAt: '2026-10-31T15:59:00.000Z' } }], preview: [{ title: '完成第一篇博客', verb: '修改事项', fields: [{ label: '截止时间', before: '未设置', after: '2026-10-31 23:59' }] }] } };
  let session = { id: 'chat', entries: [entry] };
  let applied: number[] | null = null;
  let emit: (next: typeof session) => void = () => {};
  const heights: Array<number | null> = [];
  Object.assign(dom.window, { workbench: { ai: {
    chatList: async () => [{ id: 'chat', module: 'todo' }], chatOpen: async () => session, chatNew: async () => session,
    onChat: (cb: (next: typeof session) => void) => { emit = (next) => cb(next); return () => {}; }, onAsk: () => () => {},
    config: async () => ({ providers: [], models: [], activeModelId: '' }),
    apply: async (_token: string, indices: number[]) => { applied = indices; return { todoReceipt: { appliedIndices: indices, appliedCount: indices.length } }; },
    discard: async () => {}, ask: async () => {},
  } } });
  const { FloatAiChat } = await import('../src/views/FloatTodo');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const text = () => dom.window.document.body.textContent ?? '';
  const button = (label: string) => [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === label);
  try {
    await act(async () => root.render(createElement(FloatAiChat, { mini: false, seed: null, onSeedConsumed() {}, tasks: [] })));
    for (let i = 0; i < 8 && !dom.window.document.querySelector('.todo-proposal-card'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(dom.window.document.querySelector('.ai-proposal'), null);
    assert.match(text(), /AI 修改建议/);
    assert.match(text(), /完成第一篇博客/);
    assert.match(text(), /修改事项/);
    assert.match(text(), /截止时间/);
    assert.match(text(), /修改前/);
    assert.match(text(), /修改后/);
    assert.doesNotMatch(text(), /dueAt/);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), 'expanded card stays in the thread and keeps the composer');
    await act(async () => button('应用所选')!.click());
    assert.deepEqual(applied, [0]);
    await act(async () => root.render(createElement(FloatAiChat, { mini: true, seed: null, onSeedConsumed() {}, tasks: [], onCompactHeight(height) { heights.push(height); } })));
    for (let i = 0; i < 8 && !dom.window.document.querySelector('.todo-proposal-card'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(text(), /完成第一篇博客/);
    assert.match(text(), /修改事项/);
    assert.match(text(), /截止时间/);
    assert.match(text(), /修改前/);
    assert.match(text(), /修改后/);
    assert.match(text(), /2026-10-31 23:59/);
    assert.doesNotMatch(text(), /dueAt/);
    assert.ok(heights.includes(232), 'collapsed suggestion card grows just enough to stay readable');
    assert.ok(!heights.includes(300), 'collapsed suggestion card no longer uses the taller question height');
    await act(async () => button('应用所选')!.click());
    assert.deepEqual(applied, [0]);
    session = { id: 'chat', entries: [{ ...entry, actionState: 'applied', todoReceipt: { appliedIndices: [0], appliedCount: 1 } }] };
    await act(async () => { emit(session); });
    assert.ok(dom.window.document.querySelector('.todo-proposal-card'), 'card remains mounted after apply');
    assert.match(text(), /已应用/);
    assert.match(text(), /修改前未设置/);
    assert.match(text(), /修改后2026-10-31 23:59/);
    assert.equal(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), null);
    await act(async () => button('继续对话')!.click());
    assert.equal(dom.window.document.querySelector('.todo-proposal-card'), null);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'));
  } finally { await act(async () => root.unmount()); dom.window.close(); names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name)); }
});

test('collapsed float AI keeps a pure conversational reply visible after the run', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  type Entry = { id: string; role: 'user' | 'assistant'; content: string; streaming?: boolean; error?: string; actionState?: 'pending'; proposal?: { token: string; message: string; actions: { type: 'update'; id: string; patch: { status: string } }[]; preview: { title: string; verb: string; fields: { label: string; before: string; after: string }[] }[] } };
  let session: { id: string; entries: Entry[] } = { id: 'chat', entries: [
    { id: 'old-user', role: 'user', content: '以前的问题' },
    { id: 'old-assistant', role: 'assistant', content: '以前的回复不该占住输入框', streaming: false },
  ] };
  let emit: (next: typeof session) => void = () => {};
  let outcome: 'defer' | 'sync' | 'error' | 'throw' | 'proposal' = 'defer';
  let release: (() => void) | null = null;
  let turn = 0;
  const replyText = '你目前有 3 项未完成事项。';
  const heights: Array<number | null> = [];
  Object.assign(dom.window, { workbench: { ai: {
    chatList: async () => [{ id: 'chat', module: 'todo' }], chatOpen: async () => session, chatNew: async () => session,
    onChat: (cb: (next: typeof session) => void) => { emit = next => cb(next); return () => {}; }, onAsk: () => () => {},
    config: async () => ({ providers: [], models: [], activeModelId: '' }),
    ask: async (_id: string, text: string) => {
      if (outcome === 'throw') throw new Error('请先在 AI 设置中配置并启用');
      turn += 1;
      const id = `turn-${turn}`;
      const base = session.entries.map(entry => ({ ...entry }));
      const user: Entry = { id: `u-${id}`, role: 'user', content: text };
      const publish = (assistant: Entry) => { session = { id: 'chat', entries: [...base, user, assistant] }; emit(session); };
      if (outcome === 'sync') { publish({ id: `a-${id}`, role: 'assistant', content: '同步回复也能留下。', streaming: false }); return; }
      publish({ id: `a-${id}`, role: 'assistant', content: '', streaming: true });
      await new Promise<void>(resolve => { release = resolve; });
      if (outcome === 'proposal') {
        publish({ id: `a-${id}`, role: 'assistant', content: '建议把买菜标成完成', streaming: false, actionState: 'pending', proposal: { token: '22222222-2222-4222-8222-222222222222', message: '建议', actions: [{ type: 'update', id: 'task-1', patch: { status: 'done' } }], preview: [{ title: '买菜', verb: '修改事项', fields: [{ label: '状态', before: '未完成', after: '已完成' }] }] } });
        return;
      }
      if (outcome === 'error') {
        publish({ id: `a-${id}`, role: 'assistant', content: '已统计到一半', streaming: false, error: '请求超时，请重试' });
        throw new Error('请求超时，请重试');
      }
      publish({ id: `a-${id}`, role: 'assistant', content: replyText, streaming: false });
    },
    apply: async () => {}, discard: async () => {},
  } } });
  const { FloatAiChat } = await import('../src/views/FloatTodo');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const body = () => dom.window.document.body.textContent ?? '';
  const button = (label: string) => [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === label);
  const props = { seed: null, onSeedConsumed() {}, tasks: [] as never[], onCompactHeight(height: number | null) { heights.push(height); } };
  const send = async (value: string) => {
    const textarea = dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]') as HTMLTextAreaElement | null;
    assert.ok(textarea, `composer missing before send: ${body()}`);
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, value);
    await act(async () => { textarea.dispatchEvent(new dom.window.Event('input', { bubbles: true })); });
    const submit = dom.window.document.querySelector('button[aria-label="发送"]') as HTMLButtonElement;
    assert.equal(submit.disabled, false);
    release = null;
    await act(async () => { submit.click(); });
  };
  const finish = async () => {
    assert.ok(release, 'run is waiting to finish');
    const done = release;
    release = null;
    await act(async () => { done(); await Promise.resolve(); });
  };
  try {
    await act(async () => root.render(createElement(FloatAiChat, { ...props, mini: true })));
    for (let i = 0; i < 8 && !dom.window.document.querySelector('textarea'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null, 'an older text reply must not replace the composer on open');
    assert.doesNotMatch(body(), /以前的回复不该占住输入框/);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'));

    await send('我现在有多少未完成的事项？');
    assert.match(body(), /正在准备模型上下文/, body());
    assert.match(body(), /执行中/);
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null);
    await finish();
    assert.match(body(), new RegExp(replyText), body());
    assert.match(body(), /已回复/);
    assert.doesNotMatch(body(), /正在准备模型上下文/);
    assert.doesNotMatch(body(), /执行中/);
    assert.ok(dom.window.document.querySelector('.fa-mini-reply'), 'finished text stays in the result area');
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), 'composer stays usable under the reply');
    assert.ok(dom.window.document.querySelector('.ai-add-reference'), 'reference control stays available under the reply');
    assert.equal(dom.window.document.querySelector('.todo-proposal-card'), null);
    assert.ok(dom.window.document.querySelector('.fa-mini-surface.is-result.is-reply'));
    assert.equal(heights.at(-1), 232, 'collapsed text reply grows enough to stay readable');
    assert.ok(!heights.includes(300));
    await act(async () => dom.window.document.querySelector('.ai-add-reference')!.dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true })));
    await act(async () => (dom.window.document.querySelector('.ai-add-reference') as HTMLButtonElement).click());
    assert.ok(dom.window.document.querySelector('[role="listbox"]'), 'reference picker opens while the reply is visible');
    await act(async () => button('继续对话')!.click());
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'));
    assert.ok(dom.window.document.querySelector('.ai-add-reference'));
    assert.equal(heights.at(-1), null);

    await act(async () => root.render(createElement(FloatAiChat, { ...props, mini: false, key: 'expanded' })));
    for (let i = 0; i < 8 && !(dom.window.document.querySelector('.ai-messages')?.textContent ?? '').includes(replyText); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(dom.window.document.querySelector('.ai-messages')?.textContent ?? '', new RegExp(replyText), 'expanded transcript keeps the same assistant text');
    assert.match(body(), /我现在有多少未完成的事项？/);
    assert.match(body(), /以前的回复不该占住输入框/);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), 'expanded composer stays available under the transcript');

    await act(async () => root.render(createElement(FloatAiChat, { ...props, mini: true, key: 'mini-again' })));
    for (let i = 0; i < 8 && !dom.window.document.querySelector('textarea'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null, 'reopening the collapsed card does not pin an older reply over the composer');
    assert.doesNotMatch(body(), new RegExp(replyText));

    outcome = 'sync';
    await send('再问一次');
    assert.match(body(), /同步回复也能留下。/, body());
    assert.ok(dom.window.document.querySelector('.fa-mini-reply'));
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'));
    assert.ok(dom.window.document.querySelector('.ai-add-reference'));
    await act(async () => button('继续对话')!.click());

    outcome = 'throw';
    await send('设置没开');
    assert.match(body(), /请先在 AI 设置中配置并启用/, body());
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), 'a failure before any assistant entry stays on the composer');
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null);

    outcome = 'error';
    await send('统计超时');
    assert.match(body(), /执行中/);
    await finish();
    assert.match(dom.window.document.querySelector('.fa-mini-reply')?.textContent ?? '', /已统计到一半/);
    assert.match(body(), /请求超时，请重试/);
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), 'an error reply keeps the composer');
    assert.ok(dom.window.document.querySelector('.ai-add-reference'));
    assert.ok(dom.window.document.querySelector('.fa-error[role="alert"]'));
    await act(async () => button('继续对话')!.click());
    assert.match(body(), /请求超时，请重试/, 'leaving the result must not drop the error');
    assert.ok(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'));

    outcome = 'proposal';
    await send('把买菜标完成');
    await finish();
    assert.ok(dom.window.document.querySelector('.todo-proposal-card'), body());
    assert.match(body(), /买菜/);
    assert.match(body(), /AI 修改建议/);
    assert.equal(dom.window.document.querySelector('.fa-mini-reply'), null, 'edit suggestions still use the proposal card');
    assert.equal(dom.window.document.querySelector('textarea[aria-label="AI 对话输入"]'), null);
  } finally { await act(async () => root.unmount()); dom.window.close(); names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name)); }
});
