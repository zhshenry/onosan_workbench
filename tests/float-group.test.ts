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
      assert.match(find('.fa-linked-row').textContent!, /已完成但旧截止/);
      assert.equal(find('.ai-add-reference').textContent, '关联事项');
      await click(find('.ai-add-reference')); await click(dom.window.document.querySelectorAll('[role="option"]')[1]);
      assert.match(find('.fa-linked-row').textContent!, /很长的未完成/);
      await click(find('.fa-linked-row button')); assert.equal(find('.fa-linked-row').textContent, '');
      assert.equal(asks, 0);
      await click(find('.ai-add-reference'));
      await act(async () => dom.window.document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
      assert.equal(dom.window.document.querySelector('[role="listbox"]'), null);
      assert.equal(dom.window.document.activeElement, find('.ai-add-reference'));
      if (mini) {
        await click(find('.fa-model-toggle'));
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
