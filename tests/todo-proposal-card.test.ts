import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';
import type { ChatEntry } from '../shared/todo-contracts';
import { TodoProposalCard } from '../src/views/TodoProposalCard';

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
