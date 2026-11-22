import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Store } from '../modules/todo/store';
import { newTask } from '../shared/todo-contracts';
import { AiStore } from '../electron/ai-store';
import { BotHost, type BotExecutor } from '../electron/bot-host';
import { BotStore } from '../electron/bot-store';
import type { BotSubmit } from '../shared/bot-contracts';

const surface = { id: 'test', kind: 'main' as const };
function setup(executor?: Partial<BotExecutor>) {
  const directory = mkdtempSync(join(tmpdir(), 'bot-input-routing-'));
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  const host = new BotHost(store, { run: async () => ({ reply: '完成' }), apply: async () => ({}), ...executor });
  const bot = host.coordinator();
  function request(text: string): BotSubmit {
    const old = store.draft(bot.mainChatId);
    const draft = store.saveDraft(bot.mainChatId, old.revision, { text, replyToTaskId: null, resources: [] });
    return { text, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), botId: bot.id, chatId: bot.mainChatId, resources: [], replyToTaskId: null };
  }
  const send = (text: string) => host.submit(request(text), surface);
  return { directory, ai, store, host, bot, request, send };
}

test('ordinary sends amend the same work, preserve all three chronological entries and replay the original receipt', async () => {
  const f = setup();
  try {
    const first = f.send('把客户回访排到周五'), second = f.send('改到周四'), input = f.request('下午三点，备注留着');
    const third = f.host.submit(input, surface), retry = f.host.submit(input, surface);
    assert.equal(first.task.id, second.task.id); assert.equal(first.task.id, third.task.id);
    assert.equal(retry.duplicate, true); assert.equal(retry.messageId, third.messageId);
    assert.equal(f.store.task(first.task.id).requirementsRevision, 2);
    const messages = f.store.conversationEntries(third.task).filter(entry => entry.role === 'user');
    assert.deepEqual(messages.map(entry => entry.content), ['把客户回访排到周五','改到周四','下午三点，备注留着']);
    assert.equal(messages[0].createdAt, first.task.createdAt);
    assert.ok(messages.every(entry => Number.isFinite(Date.parse(entry.createdAt ?? ''))));
    assert.equal(f.store.syncChat(f.bot.mainChatId).latestUser?.createdAt, messages[2].createdAt);
    assert.equal(f.store.tasks(f.bot.id).length, 1);
    const status = f.send('做到哪了？'); assert.equal(status.task.status, 'completed');
    assert.notEqual(f.send('顺便查明天有哪些会').task.id, first.task.id);
  } finally { await f.host.stop(); f.ai.close(); }
});

test('ambiguous amendments wait for one named choice and only change the selected work', async () => {
  const f = setup();
  try {
    const a = f.send('客户回访'), b = f.send('另做周报'), m = f.send('改到周四');
    const question = f.store.actions(m.task.id)[0];
    assert.equal(question.kind, 'question');
    const options = question.payload.options as {label: string; taskId?: string}[];
    const option = options.find(o => o.taskId === b.task.id)!;
    await f.host.answerAction(question.id, question.revision, { text: option.label });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(f.store.task(a.task.id).requirementsRevision ?? 0, 0);
    assert.equal(f.store.task(b.task.id).requirementsRevision, 1);
  } finally { await f.host.stop(); f.ai.close(); }
});

for (const viaCard of [false, true]) test('accepts an in-flight write amendment from ' + (viaCard ? 'an already clicked card' : 'plain chat') + ' and follows the returned ID', async () => {
  let finishWrite!: (v: unknown) => void;
  const f = setup({ apply: async () => new Promise(resolve => { finishWrite = resolve; }) });
  try {
    const original = f.send('给客户回访建周五待办').task;
    const action = f.host.waitForAction(original.id, original.id + ':todo', 'todo', { plan: { message: '周五', actions: [] } });
    const writing = f.host.answerAction(action.id, action.revision, { approved: true });
    const correction = f.request('改周四');
    if (viaCard) correction.target = { intent: 'amend', taskId: original.id, rootTaskId: original.id, actionId: action.id, expectedActionRevision: action.revision };
    const amendment = f.host.submit(correction, surface);
    assert.equal(f.store.task(amendment.task.id).inputRoute?.intent, 'amend');
    assert.ok(f.ai.chat(f.bot.mainChatId).entries.some(e => e.id === amendment.messageId));
    finishWrite({ appliedCount: 1, created: [{ id: 'actual-todo-42', title: '客户回访' }] });
    await writing; await new Promise(resolve => setTimeout(resolve, 15));
    const followup = f.store.task(original.id);
    assert.equal(f.store.tasks(f.bot.id).length, 1);
    assert.equal(followup.latestUserMessageId, amendment.messageId);
    assert.equal(followup.inputRoute, undefined); assert.match(followup.resumeInput!, /actual-todo-42/);
    assert.equal(f.store.action(action.id).status, 'applied');
  } finally { await f.host.stop(); f.ai.close(); }
});

test('a switch pauses the pending approval, progress stays read-only and resume restores that approval', async () => {
  const f = setup();
  try {
    const original = f.send('把客户回访排到周五').task;
    const action = f.host.waitForAction(original.id, original.id + ':approve', 'todo', {});
    const next = f.send('先停一下，先查明天的会').task;
    assert.equal(f.store.task(original.id).status, 'interrupted');
    assert.equal(next.resumeInput, '查明天的会'); assert.equal(next.priority, true);
    await assert.rejects(f.host.answerAction(action.id, action.revision, { approved: true }), /暂停/);
    f.send('继续刚才的');
    assert.equal(f.store.task(original.id).status, 'waiting_user');
    assert.equal(f.store.action(action.id).status, 'pending');
  } finally { await f.host.stop(); f.ai.close(); }
});

test('an unresolved semantic choice survives restart and an unrelated target cannot receive a change', async () => {
  const f = setup({ classifyInput: async (_bot, _text, _targets, signal) =>
    new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })) });
  const original = f.send('把客户回访排到周五').task;
  f.host.waitForAction(original.id, original.id + ':todo', 'todo', {});
  const accepted = f.send('换个时间怎么样？');
  assert.equal(f.store.task(accepted.task.id).inputRoute?.intent, 'interpret');
  await f.host.stop(); f.ai.close();
  const ai = new AiStore(f.directory, { recover: false }), store = new BotStore(ai, f.directory);
  const host = new BotHost(store, { run: async () => ({ reply: '完成' }), apply: async () => ({}),
    classifyInput: async () => ({ intent: 'amend', taskId: 'someone-elses-task' }) });
  try {
    host.start();
    for (let n = 0; n < 50 && store.task(accepted.task.id).status !== 'waiting_user'; n++) await new Promise(resolve => setTimeout(resolve, 10));
    const question = store.actions(accepted.task.id)[0];
    assert.equal(question.kind, 'question');
    assert.equal(store.task(original.id).requirementsRevision ?? 0, 0);
    assert.equal(ai.chat(f.bot.mainChatId).entries.filter(e => e.id === accepted.messageId).length, 1);
  } finally { await host.stop(); ai.close(); }
});

test('two workspace connections receive only their own changed objects and actual versions', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'task-receipts-')), 'tasks.db');
  const first = new Store(file), second = new Store(file);
  try {
    const insert = (db: Store, title: string) => db.applyPlan({ message: title, actions: [{ type: 'create', task: newTask(title) }] }, new Map());
    const a = insert(first, '客户回访'), b = insert(second, '准备周报');
    assert.deepEqual(a.created.map(item => item.title), ['客户回访']);
    assert.deepEqual(b.created.map(item => item.title), ['准备周报']);
    const item = a.created[0], next = first.applyPlan({ message: '保留备注', actions: [{ type: 'update', id: item.id, patch: { note: '周四三点' } }] }, new Map([[item.id, item.updatedAt]]));
    assert.deepEqual(next.created, []); assert.deepEqual(next.updated, [second.get(item.id)]);
    assert.notEqual(next.updated[0].updatedAt, item.updatedAt);
  } finally { first.close(); second.close(); }
});

test('consecutive corrections keep the same work when a text-only reply finishes between sends', async () => {
  const f = setup();
  try {
    const original = f.send('整理线下回访材料').task;
    const first = f.send('改到周四');
    assert.equal(first.task.id, original.id);
    for (let n = 0; n < 100 && f.store.task(original.id).status !== 'completed'; n++) await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(f.store.task(original.id).status, 'completed');
    assert.equal(f.store.task(original.id).operationIds.length, 0);
    const second = f.send('下午三点，保留线下面谈备注');
    assert.equal(second.task.id, original.id);
    assert.equal(second.task.requirementsRevision, 2);
    assert.equal(f.store.tasks(f.bot.id).length, 1);
  } finally { await f.host.stop(); f.ai.close(); }
});
