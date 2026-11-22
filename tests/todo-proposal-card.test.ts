import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { newTask, type AIAction, type ChatEntry, type Task } from '../shared/todo-contracts';
import { previewTodoActions } from '../shared/todo-proposal';
import { TodoProposalCard, todoProposalTitle } from '../src/views/TodoProposalCard';

test('card selection, no-selection, failure, partial receipt and terminal states remain readable and block replay', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  const { createRoot } = await import('react-dom/client'); const root = createRoot(dom.window.document.getElementById('root')!);
  const entry: ChatEntry = { id: 'entry', role: 'assistant', content: 'AI文字不可信', actionState: 'pending', proposal: { token: 'token', message: '', actions: [{ type: 'update', id: 'a', patch: { note: '新' } }, { type: 'remove', id: 'b' }], preview: [{ title: '真实名称', verb: '修改事项', fields: [{ label: '备注', before: '旧', after: '新' }] }, { title: '删除目标', verb: '删除事项', fields: [], warning: '将删除该事项' }] } };
  let fail = false; let calls = 0; let discarded = 0; let chosen: number[] = [];
  const render = async () => act(async () => root.render(createElement(TodoProposalCard, { entry, busy: false, apply: async (_token, indices) => { calls++; chosen = indices; if (fail) throw new Error('版本已变化'); }, discard: async () => { discarded++; } })));
  const text = () => dom.window.document.body.textContent!;
  const buttons = () => [...dom.window.document.querySelectorAll('button')];
  const click = async (element: Element) => act(async () => (element as HTMLElement).click());
  try {
    await render(); const card = dom.window.document.querySelector('.todo-proposal-card');
    assert.match(text(), /真实名称/); assert.match(text(), /修改前旧/); assert.match(text(), /修改后新/);
    const inputs = [...dom.window.document.querySelectorAll('input')];
    await click(inputs[0]); await click(inputs[1]);
    assert.equal(buttons().find(b => b.textContent === '应用所选')?.disabled, true);
    await click(inputs[0]); fail = true; await click(buttons().find(b => b.textContent === '应用所选')!);
    assert.match(text(), /本次未应用：版本已变化/); assert.equal(text().includes('已应用'), false);
    fail = false; await click(buttons().find(b => b.textContent === '应用所选')!);
    assert.deepEqual(chosen, [0]); assert.equal(calls, 2);
    entry.actionState = 'applied'; entry.todoReceipt = { appliedIndices: [0], appliedCount: 1 }; await render();
    assert.equal(dom.window.document.querySelector('.todo-proposal-card'), card);
    assert.match(text(), /已应用 1 项/); assert.match(text(), /未选择（本轮未应用）/); assert.match(text(), /修改前旧/);
    assert.equal(buttons().length, 0); assert.equal(dom.window.document.querySelectorAll('input').length, 0); assert.equal(text().includes('待确认'), false);
    entry.actionState = 'pending'; delete entry.todoReceipt; await render(); await click(buttons().find(b => b.textContent === '保留原内容')!); assert.equal(discarded, 1);
    entry.actionState = 'discarded'; await render(); assert.match(text(), /已保留原内容/); assert.equal(buttons().length, 0);
    entry.actionState = 'expired'; delete entry.proposal!.preview; await render(); assert.match(text(), /原始快照不可用/); assert.equal(buttons().length, 0);
  } finally { await act(async () => root.unmount()); dom.window.close(); names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name)); }
});

test('Bot proposals keep all six action titles when confirmation fails', () => {
  const base = { ...newTask('实际事项名称'), id: 'item-1', createdAt: '2026-11-21', updatedAt: '2026-11-21', completedAt: null, notifiedFor: null, deletedAt: null };
  for (const [kind, subject] of [['task', '待办'], ['meeting', '日程']] as const) {
    const task: Task = { ...base, kind };
    const cases: [AIAction, string, string][] = [
      [{ type: 'create', task: { ...newTask(task.title), kind } }, '新建' + subject, '确认创建'],
      [{ type: 'update', id: task.id, patch: { title: '修改后的名称' } }, '修改' + subject, '确认修改'],
      [{ type: 'remove', id: task.id }, '删除' + subject, '确认删除'],
    ];
    for (const [action, title, confirm] of cases) {
      const actions = [action];
      const entry: ChatEntry = { id: 'entry', role: 'assistant', content: '', actionState: 'pending',
        proposal: { token: 'token', message: '', actions, preview: previewTodoActions(actions, [task], []) } };
      const html = renderToStaticMarkup(createElement(TodoProposalCard, { entry, variant: 'bot', busy: false,
        apply: async () => {}, discard: async () => {} }));
      const dom = new JSDOM(html);
      const { document } = dom.window;
      assert.equal(document.querySelector('.bot-operation-copy > strong')?.textContent, title);
      assert.equal(document.querySelector('.bot-operation-status')?.textContent, '待确认');
      assert.equal(document.querySelector('.bot-operation-actions button'), null);
      assert.equal(document.querySelector('.todo-proposal-target strong')?.textContent, task.title);
      if (action.type === 'create') assert.equal(document.querySelector('.todo-proposal-field b[title="事项名称"]'), null);
      assert.equal(document.querySelector('.bot-operation-details')?.hasAttribute('hidden'), false);
      assert.deepEqual([...document.querySelectorAll('.todo-proposal-footer .bot-action-buttons > button')].map(button => button.textContent), ['保留原内容', confirm]);
      const failure = 'AI 建议中的事项已变化，请重新生成建议';
      document.body.innerHTML = renderToStaticMarkup(createElement(TodoProposalCard, {
        entry: { ...entry, actionState: undefined }, variant: 'bot', busy: false, actionFailure: failure,
        apply: async () => {}, discard: async () => {},
      }));
      assert.equal(document.querySelector('.bot-operation-copy > strong')?.textContent, title);
      assert.equal(document.querySelector('.bot-operation-card')?.getAttribute('data-tone'), 'error');
      assert.equal(document.querySelector('.bot-operation-status')?.textContent, '执行失败');
      assert.equal(document.querySelector('.bot-operation-details')?.hasAttribute('hidden'), true);
      assert.equal(document.querySelector('.todo-proposal-target strong')?.textContent, task.title);
      assert.equal(document.querySelector('[role="alert"]')?.textContent, failure);
      assert.equal(document.querySelector('.todo-proposal-card input, .todo-proposal-card button'), null);
      document.body.innerHTML = renderToStaticMarkup(createElement(TodoProposalCard, {
        entry: { ...entry, actionState: 'applied', todoReceipt: { appliedIndices: [0], appliedCount: 1 } },
        variant: 'bot', conversation: true, busy: false, apply: async () => {}, discard: async () => {},
      }));
      assert.equal(document.querySelector('.bot-operation-header button'), null);
      assert.equal(document.querySelector('.bot-operation-details')?.hasAttribute('hidden'), false);
      assert.equal(document.querySelector('.todo-proposal-target strong')?.textContent, task.title);
      assert.match(document.querySelector('.bot-operation-receipt')?.textContent ?? '', /已创建|已修改|已移入回收站/);
      dom.window.close();
    }
  }
});

test('Bot proposal headings stay truthful for batch, label and legacy previews', () => {
  const remove: AIAction = { type: 'remove', id: 'item-1' };
  const edit: AIAction = { type: 'update', id: 'item-1', patch: { dateAt: '2026-11-26T07:00:00.000Z' } };
  const category: AIAction = { type: 'remove_category', id: 'category-1' };
  assert.equal(todoProposalTitle([remove]), '删除事项');
  assert.equal(todoProposalTitle([edit], [{ title: '客户回访', verb: '修改事项',
    fields: [{ label: '开始时间', before: '2026-11-25 15:00', after: '2026-11-26 15:00' }] }]), '修改日程');
  assert.equal(todoProposalTitle([category]), '编辑标签');
  assert.equal(todoProposalTitle([edit, remove, category]), '批量变更');
});

test('todo reconciliation checks the submitted selection and shows the recorded result', () => {
  const task: Task = { ...newTask('提交周报'), id: 'item-1', dateAt: '2026-11-27', createdAt: '2026-11-21',
    updatedAt: '2026-11-21', completedAt: null, notifiedFor: null, deletedAt: null };
  const actions: AIAction[] = [
    { type: 'create', task: newTask('未选择的事项') },
    { type: 'update', id: task.id, patch: { dateAt: '2026-11-26' } },
  ];
  const entry: ChatEntry = { id: 'entry', role: 'assistant', content: '', actionState: 'discarded',
    proposal: { token: 'token', message: '', actions, preview: previewTodoActions(actions, [task], []) } };
  const review = { indices: [1], form: createElement('textarea', { 'aria-label': '核对说明' }) };
  const props = { entry, variant: 'bot' as const, busy: false, apply: async () => {}, discard: async () => {} };
  const dom = new JSDOM(renderToStaticMarkup(createElement(TodoProposalCard, { ...props, reconciliation: review })));
  const { document } = dom.window;
  assert.equal(document.querySelector('.bot-operation-status')?.textContent, '待核对');
  assert.equal(document.querySelector('.bot-operation-details')?.hasAttribute('hidden'), false);
  assert.equal(document.querySelector('.todo-proposal-target strong')?.textContent, '提交周报');
  assert.equal(document.querySelectorAll('.todo-proposal-target').length, 1);
  assert.equal(document.querySelector('.todo-proposal-after small')?.textContent, '建议值');
  assert.equal(document.querySelector('.todo-proposal-after span')?.textContent, '2026-11-26');
  assert.ok(document.querySelector('textarea'));
  assert.equal(document.querySelector('.todo-proposal-card input, .todo-proposal-card button, .todo-proposal-intro'), null);

  document.body.innerHTML = renderToStaticMarkup(createElement(TodoProposalCard, {
    ...props, reconciliation: { indices: [1], result: 'not_applied', note: '工作台日期仍是 11 月 27 日' },
  }));
  assert.equal(document.querySelector('.bot-operation-status')?.textContent, '已确认未写入');
  assert.equal(document.querySelector('.bot-operation-details')?.hasAttribute('hidden'), true);
  assert.equal(document.querySelector('.todo-proposal-footer')?.textContent, '工作台日期仍是 11 月 27 日');
  assert.equal(document.querySelector('textarea'), null);
  dom.window.close();
});
