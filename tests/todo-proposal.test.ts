import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { Store } from '../modules/todo/store';
import { newTask, type AIAction, type Category, type Task } from '../shared/todo-contracts';
import { previewTodoActions } from '../shared/todo-proposal';
const task: Task = { ...newTask('真实事项'), id: randomUUID(), createdAt: '2026-10-01T00:00:00Z', updatedAt: '2026-10-01T00:00:00Z', completedAt: null, notifiedFor: null, deletedAt: null, note: '旧备注', dueAt: '2026-09-30T23:59:00Z' };
const category: Category = { id: randomUUID(), name: '真实标签', color: '#123456', createdAt: task.createdAt, updatedAt: task.updatedAt };

test('proposal preview uses immutable actual target/old values and Chinese fields, not model prose', () => {
  const source = { ...task };
  const actions: AIAction[] = [{ type: 'update', id: source.id, patch: { dueAt: '2026-10-31T23:59:00Z', note: null as never, categoryId: category.id, progress: 0 } }];
  const preview = previewTodoActions(actions, [source], [category])[0];
  source.title = '后来标题'; source.note = '后来备注';
  assert.equal(preview.title, '真实事项');
  assert.deepEqual(preview.fields.map(f => f.label), ['截止时间', '备注', '标签（建议生成时名称）', '进度']);
  assert.equal(preview.fields[1].before, '旧备注'); assert.equal(preview.fields[1].after, '未设置');
  assert.equal(preview.fields[2].after, '真实标签'); assert.equal(preview.fields[3].after, '0%');
  assert.match(preview.fields[0].before, /^2026-\d\d-\d\d \d\d:\d\d$/);
});

test('all six operation types have readable names and explicit destructive warnings', () => {
  const addedId = randomUUID();
  const actions: AIAction[] = [
    { type: 'create', task: { ...newTask('新事项'), categoryId: addedId } }, { type: 'update', id: task.id, patch: { status: 'done', priority: 'high' } },
    { type: 'remove', id: task.id }, { type: 'create_category', category: { id: addedId, name: '新标签', color: '#abcdef' } },
    { type: 'update_category', id: category.id, patch: { name: '改名' } }, { type: 'remove_category', id: category.id },
  ];
  const p = previewTodoActions(actions, [task], [category]);
  assert.deepEqual(p.map(p => p.title), ['新事项', '真实事项', '真实事项', '新标签', '真实标签', '真实标签']);
  assert.equal(p[0].fields.find(f => f.label === '标签（建议生成时名称）')?.after, '新标签');
  assert.deepEqual(p[1].fields.map(f => f.after), ['已完成', '高']);
  assert.match(p[2].warning!, /删除该事项/); assert.match(p[5].warning!, /解除事项/);
});

test('missing legacy snapshots never fabricate old values; long notes are not truncated', () => {
  const p = previewTodoActions([{ type: 'update', id: randomUUID(), patch: { note: '长'.repeat(5000) } }], [], [])[0];
  assert.equal(p.title, '事项不可用'); assert.equal(p.fields[0].before, '无原始快照'); assert.equal(p.fields[0].after.length, 5000);
});

test('runtime card survives reopening chat but is not added to cross-restart history', () => {
  const dir = mkdtempSync(join(tmpdir(), 'todo-card-'));
  let store = new AiStore(dir);
  try {
    const chat = store.newChat(); const actions: AIAction[] = [{ type: 'update', id: task.id, patch: { note: '' } }];
    chat.entries.push({ id: randomUUID(), role: 'assistant', content: '原有聊天', actionState: 'pending', proposal: { token: randomUUID(), message: '', actions, preview: previewTodoActions(actions, [task], []) } });
    store.saveChat(chat);
    const reopened = store.chat(chat.id);
    assert.equal(reopened.entries[0].proposal?.preview?.[0].title, '真实事项');
    reopened.entries[0].actionState = 'applied'; reopened.entries[0].todoReceipt = { appliedIndices: [0], appliedCount: 1 };
    store.saveChat(reopened);
    assert.deepEqual(store.chat(chat.id).entries[0].todoReceipt, { appliedIndices: [0], appliedCount: 1 });
    store.close(); store = new AiStore(dir);
    const restored = store.chat(chat.id).entries[0];
    assert.equal(restored.content, '原有聊天'); assert.equal(restored.actionState, 'applied');
    assert.equal(restored.proposal?.preview, undefined); assert.equal(restored.todoReceipt, undefined);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('real applyPlan failure after a preceding write rolls back every operation', () => {
  const dir = mkdtempSync(join(tmpdir(), 'todo-card-rollback-')); const store = new Store(join(dir, 'tasks.db'));
  try {
    const original = store.create(newTask('原事项'));
    assert.throws(() => store.applyPlan({ message: '', actions: [
      { type: 'update', id: original.id, patch: { title: '不得留下' } },
      { type: 'create', task: { ...newTask('无效标签事项'), categoryId: randomUUID() } },
    ] }, new Map([[original.id, original.updatedAt]])), /标签/);
    assert.equal(store.get(original.id).title, '原事项'); assert.equal(store.all().length, 1);
  } finally { store.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('committed receipt remains truthful after chat persistence failure and consumes all selections', async () => {
  const { applyTodoProposal } = await import('../electron/todo-proposal');
  const dir = mkdtempSync(join(tmpdir(), 'todo-card-receipt-')); const store = new Store(join(dir, 'tasks.db')); const ai = new AiStore(dir);
  try {
    const first = store.create(newTask('第一项')); const second = store.create(newTask('第二项'));
    const chat = ai.newChat(); const plan = { token: randomUUID(), message: '', actions: [{ type: 'update' as const, id: first.id, patch: { note: '已写入' } }, { type: 'update' as const, id: second.id, patch: { note: '未选择' } }] };
    chat.entries.push({ id: randomUUID(), role: 'assistant', content: '', proposal: plan, actionState: 'pending' }); ai.saveChat(chat);
    const item = { sessionId: chat.id, plan, revisions: new Map([[first.id, first.updatedAt], [second.id, second.updatedAt]]) };
    let consumed = false; ai.saveChat = () => { throw new Error('chat disk full'); };
    const result = applyTodoProposal(store, ai, item, [0, 0, 99], () => { consumed = true; });
    assert.equal(consumed, true); assert.deepEqual(result.todoReceipt, { appliedIndices: [0], appliedCount: 1 });
    assert.equal(store.get(first.id).note, '已写入'); assert.equal(store.get(second.id).note, '');
    assert.equal(ai.chat(chat.id).entries[0].actionState, 'applied');
    assert.deepEqual(ai.chat(chat.id).entries[0].todoReceipt, result.todoReceipt);
    assert.throws(() => applyTodoProposal(store, ai, item, [1], () => undefined), /已应用或已过期/);
  } finally { store.close(); ai.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('failed transaction has no receipt or consumption and no-selection cannot write', async () => {
  const { applyTodoProposal } = await import('../electron/todo-proposal');
  const dir = mkdtempSync(join(tmpdir(), 'todo-card-failed-')); const store = new Store(join(dir, 'tasks.db')); const ai = new AiStore(dir);
  try {
    const first = store.create(newTask('原项')); const chat = ai.newChat();
    const plan = { token: randomUUID(), message: '', actions: [{ type: 'update' as const, id: first.id, patch: { note: '不得留下' } }, { type: 'create' as const, task: { ...newTask('无效'), categoryId: randomUUID() } }] };
    chat.entries.push({ id: randomUUID(), role: 'assistant', content: '', proposal: plan, actionState: 'pending' }); ai.saveChat(chat);
    const item = { sessionId: chat.id, plan, revisions: new Map([[first.id, first.updatedAt]]) }; let consumed = false;
    assert.throws(() => applyTodoProposal(store, ai, item, [], () => { consumed = true; }), /请选择/);
    assert.throws(() => applyTodoProposal(store, ai, item, [0, 1], () => { consumed = true; }), /标签/);
    assert.equal(consumed, false); assert.equal(store.get(first.id).note, ''); assert.equal(store.all().length, 1);
    const entry = ai.chat(chat.id).entries[0]; assert.equal(entry.actionState, 'pending'); assert.equal(entry.todoReceipt, undefined); assert.match(entry.todoApplyError!, /标签/);
  } finally { store.close(); ai.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('full selection returns every actual operation once and category names are explicitly snapshot-labelled', async () => {
  const { applyTodoProposal } = await import('../electron/todo-proposal');
  const dir = mkdtempSync(join(tmpdir(), 'todo-card-full-')); const store = new Store(join(dir, 'tasks.db')); const ai = new AiStore(dir);
  try {
    const first = store.create(newTask('全选一')); const second = store.create(newTask('全选二')); const chat = ai.newChat();
    const plan = { token: randomUUID(), message: '', actions: [{ type: 'update' as const, id: first.id, patch: { note: '一' } }, { type: 'update' as const, id: second.id, patch: { note: '二' } }] };
    chat.entries.push({ id: randomUUID(), role: 'assistant', content: '', proposal: plan, actionState: 'pending' }); ai.saveChat(chat);
    const result = applyTodoProposal(store, ai, { sessionId: chat.id, plan, revisions: new Map([[first.id, first.updatedAt], [second.id, second.updatedAt]]) }, [1, 0, 1], () => undefined);
    assert.deepEqual(result.todoReceipt, { appliedIndices: [0, 1], appliedCount: 2 });
    assert.equal(store.get(first.id).note, '一'); assert.equal(store.get(second.id).note, '二');
    const previews = previewTodoActions([{ type: 'update_category', id: category.id, patch: { name: '改名后' } }, { type: 'update', id: task.id, patch: { categoryId: category.id } }], [task], [category]);
    assert.equal(previews[1].fields[0].label, '标签（建议生成时名称）'); assert.equal(previews[1].fields[0].after, '真实标签');
  } finally { store.close(); ai.close(); rmSync(dir, { recursive: true, force: true }); }
});
