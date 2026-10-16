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
      const options = [...dom.window.document.querySelectorAll('[role="option"]')];
      assert.match(options[0].textContent!, /已完成/); assert.doesNotMatch(options[0].textContent!, /已超期/);
      assert.match(options[1].textContent!, /已超期/);
      assert.match(options[2].textContent!, /进行中/);
      assert.match(options[3].textContent!, /日程/); assert.doesNotMatch(options[3].textContent!, /已超期/);
      await click(options[0]);
      const chip = () => find(mini ? '.fa-mini-compose .ai-reference-chip' : '.fa-linked-row .ai-reference-chip');
      assert.match(chip().textContent!, /已完成但旧截止/);
      if (mini) {
        assert.equal(dom.window.document.querySelector('.fa-linked-row'), null, 'collapsed mode keeps the chip inside the dialog');
        assert.ok(find('.fa-mini-compose').contains(chip()));
      } else {
        assert.equal(dom.window.document.querySelector('.ai-compose .ai-reference-chip'), null, 'expanded chip stays above the dialog');
      }
      assert.equal(find('.ai-add-reference').textContent, '关联事项');
      await click(find('.ai-add-reference')); await click(dom.window.document.querySelectorAll('[role="option"]')[1]);
      assert.match(chip().textContent!, /很长的未完成/);
      await click(chip().querySelector('button')!);
      assert.equal(dom.window.document.querySelector(mini ? '.fa-mini-compose .ai-reference-chip' : '.fa-linked-row .ai-reference-chip'), null);
      if (!mini) assert.equal(find('.fa-linked-row').textContent, '');
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
  assert.match(css, /\.float-app\.narrow \.fa-surface \.ai-compose-toolbar > \.ai-model-select \{ flex: 1 1 0; min-width: 0; max-width: none;/);
  assert.match(css, /\.float-app\.narrow \.fa-surface \.ai-model-select \.select-trigger > span \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.fa-mini-surface \{ height: 124px; grid-template-rows: 22px 55px 22px;/);
  assert.match(css, /\.fa-mini-quick \.fa-model-toggle \{ flex: 0 0 120px; width: 120px; max-width: 120px;/);
  assert.match(css, /\.fa-mini-compose-main > button\[type='submit'\] \{ align-self: flex-end;/);
  assert.doesNotMatch(css, /grid-template-rows: 22px 20px 32px 22px/);
  assert.match(css, /\.ai-panel \.ai-compose-toolbar > \.ai-model-select \{[^}]*max-width: min\(148px/);
});

test('collapsed modify card stays readable after apply while expanded summary is unchanged', async () => {
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
    for (let i = 0; i < 8 && !dom.window.document.querySelector('.ai-proposal'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.equal(dom.window.document.querySelector('.todo-proposal-card'), null);
    assert.match(dom.window.document.querySelector('.ai-proposal-detail')!.textContent!, /dueAt:/);
    await act(async () => root.render(createElement(FloatAiChat, { mini: true, seed: null, onSeedConsumed() {}, tasks: [], onCompactHeight(height) { heights.push(height); } })));
    for (let i = 0; i < 8 && !dom.window.document.querySelector('.todo-proposal-card'); i++) await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    assert.match(text(), /完成第一篇博客/);
    assert.match(text(), /修改事项/);
    assert.match(text(), /截止时间/);
    assert.match(text(), /修改前/);
    assert.match(text(), /修改后/);
    assert.match(text(), /2026-10-31 23:59/);
    assert.doesNotMatch(text(), /dueAt/);
    assert.ok(heights.includes(300), 'collapsed suggestion card grows just enough to stay readable');
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
