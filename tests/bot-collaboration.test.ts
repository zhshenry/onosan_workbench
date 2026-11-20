import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { botService } from '../electron/bot-service';
import type { BotSubmit } from '../shared/bot-contracts';

const main = { id: 'test', kind: 'main' as const }, island = { id: 'test-island', kind: 'island' as const };
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ono-collaboration-')), ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  let writes = 0;
  const host = new BotHost(store, { run: async () => ({ reply: 'done' }), apply: async () => { writes++; return { appliedCount: 1 }; } });
  const coordinator = store.cards().find(bot => bot.seedKey === 'coordinator')!, schedule = store.cards().find(bot => bot.seedKey === 'schedule')!;
  const input = (text: string, key = coordinator.id): BotSubmit => {
    const bot = store.profile(key), draft = store.draft(bot.mainChatId);
    const next = store.saveDraft(bot.mainChatId, draft.revision, { text, resources: [], replyToTaskId: null });
    return { botId: key, chatId: bot.mainChatId, text, expectedDraftRevision: next.revision, clientRequestId: randomUUID(), resources: [], replyToTaskId: null };
  };
  const root = store.submit(input('修改 DAMA 截止日期'), () => {}).task;
  const child = host.delegate(root.id, randomUUID(), schedule.id, 'DAMA 截止日期改到15号', []);
  host.suspend();
  return { ai, store, host, coordinator, schedule, root, child, input, writes: () => writes, close: async () => { await host.stop(); ai.close(); } };
}

test('origin projection uses the actual child action, double approvals have one write', async () => {
  const f = fixture();
  try {
    const action = f.host.waitForAction(f.child.id, 'change-date', 'todo', { plan: { message: '日期更新', actions: [] } });
    const chain = f.store.collaboration(f.root.id);
    assert.equal(chain.actions.find(a => a.kind === 'todo')?.id, action.id);
    assert.equal(chain.actions.find(a => a.kind === 'todo')?.botId, f.schedule.id);
    assert.equal(chain.root.status, 'waiting_bot');
    await Promise.allSettled([f.host.answerAction(action.id, 0, { approved: true }), f.host.answerAction(action.id, 0, { approved: true })]);
    assert.equal(f.writes(), 1);
    assert.equal(f.store.action(action.id).status, 'applied');
    assert.equal(f.store.task(f.child.id).status, 'completed');
  } finally { await f.close(); }
});

test('amendment freezes the original action on acceptance, is durable and idempotent', async () => {
  const f = fixture();
  try {
    const action = f.host.waitForAction(f.child.id, 'date', 'todo', { plan: { message: '15号', actions: [] } });
    const request = { ...f.input('还是20号吧'), target: { intent: 'amend' as const, rootTaskId: f.root.id, taskId: f.child.id, actionId: action.id, expectedActionRevision: action.revision } };
    const accepted = f.host.submit(request, main);
    assert.equal(accepted.task.id, f.child.id);
    assert.equal(accepted.task.requirementsRevision, 1);
    assert.equal(f.store.task(f.root.id).status, 'waiting_bot');
    assert.equal(f.store.task(f.root.id).latestUserMessageId, accepted.messageId);
    assert.equal(f.store.action(action.id).status, 'superseded');
    await assert.rejects(f.host.answerAction(action.id, action.revision, { approved: true }), /更新|执行/);
    assert.equal(f.writes(), 0);
    const duplicate = f.host.submit(request, main);
    assert.equal(duplicate.messageId, accepted.messageId);
    assert.equal(duplicate.task.requirementsRevision, 1);
    assert.equal(f.store.tasks().length, 2);
    assert.throws(() => f.host.submit({ ...request, text: '21号' }, main), /不同内容/);
    const next = f.host.waitForAction(f.child.id, action.id, 'todo', { plan: { message: '20号', actions: [] } });
    assert.equal(next.id, action.id); assert.equal(next.requirementsRevision, 1);
    await f.host.answerAction(next.id, next.revision, { approved: true }); assert.equal(f.writes(), 1);
  } finally { await f.close(); }
});

test('pair history spans works, anchors original messages and rejects another pair or unauthorized root', async () => {
  const f = fixture();
  try {
    const second = f.store.submit(f.input('查询 DataFUN'), () => {}).task;
    f.host.delegate(second.id, randomUUID(), f.schedule.id, '查询 DataFUN', []);
    const messages = f.store.exchange(f.coordinator.id, f.schedule.id).messages;
    assert.equal(messages.length, 2); assert.equal(new Set(messages.map(m => m.rootTaskId)).size, 2);
    const page = f.store.exchange(f.coordinator.id, f.schedule.id, { anchorMessageId: messages[0].id, limit: 1 });
    assert.equal(page.messages[0].id, messages[0].id); assert.equal(page.hasLater, true);
    assert.equal(f.store.exchange(f.coordinator.id, f.schedule.id, { after: messages[0].id }).messages[0].id, messages[1].id);
    const other = f.store.cards().find(bot => bot.seedKey === 'media')!;
    assert.throws(() => f.store.exchange(f.coordinator.id, other.id, { anchorMessageId: messages[0].id }), /不属于/);
    const foreign = f.store.submit(f.input('私人工作', other.id), () => {}).task;
    assert.throws(() => botService(f.host, 'getCollaboration', [foreign.id], island), /原负责人/);
    const data = botService(f.host, 'getCollaboration', [f.root.id], island) as { root: { id: string } };
    assert.equal(data.root.id, f.root.id);
    const action = f.host.waitForAction(f.child.id, 'foreign-test', 'question', { question: '哪一个？' });
    assert.throws(() => f.host.submit({ ...f.input('补充：修改', other.id), target: { intent: 'amend', rootTaskId: f.root.id, taskId: f.child.id, actionId: action.id, expectedActionRevision: action.revision } }, main), /发起对话/);
  } finally { await f.close(); }
});

test('legacy internal replies are hidden in main-chat snapshots without deleting the original exchange', async () => {
  const f = fixture();
  try {
    const id = randomUUID(), ownId = randomUUID(), content = '日程：内部事项明细';
    f.store.insertMessage({ id, fromBotId: f.schedule.id, toBotId: f.coordinator.id, taskId: f.child.id, rootTaskId: f.root.id, parentTaskId: f.root.id, kind: 'result', content, references: [], createdAt: new Date().toISOString() });
    const chat = f.ai.chat(f.root.chatId);
    chat.entries.push({ id, role: 'assistant', content }, { id: ownId, role: 'assistant', content });
    f.ai.saveChat(chat);
    const opened = f.store.open(f.coordinator.id).chat;
    assert.equal(opened.entries.some(entry => entry.id === id), false);
    assert.ok(opened.entries.some(entry => entry.id === ownId), 'identical user-facing text is not removed by content matching');
    const synced = botService(f.host, 'syncChat', [chat.id], main) as { chat: typeof chat };
    assert.equal(synced.chat.entries.some(entry => entry.id === id), false);
    const cursor = f.ai.syncChat(chat.id);
    f.ai.saveBotEntry(chat.id, { id, role: 'assistant', content: '日程：更新后的内部明细' });
    const caughtUp = f.store.syncChat(chat.id, cursor.sequence, cursor.epoch);
    assert.ok('chat' in caughtUp, 'a hidden delta falls back to a snapshot without leaving a sequence gap');
    assert.equal(caughtUp.chat.entries.some(entry => entry.id === id), false);
    assert.ok(caughtUp.sequence > cursor.sequence);
    assert.ok(f.ai.chat(chat.id).entries.some(entry => entry.id === id), 'storage is preserved');
    assert.ok(f.store.exchange(f.coordinator.id, f.schedule.id).messages.some(message => message.id === id));
  } finally { await f.close(); }
});

test('messages without a business work are durable, deduplicated and notifications do not start reply loops', async () => {
  const f = fixture();
  try {
    const before = f.store.tasks().length, key = randomUUID();
    const notice = f.host.sendMessage(f.coordinator.id, key, f.schedule.id, '资料已整理', 'notification');
    assert.equal(notice.rootTaskId, undefined); assert.equal(notice.taskId, undefined);
    assert.equal(f.store.tasks().length, before);
    assert.equal(f.host.sendMessage(f.coordinator.id, key, f.schedule.id, '资料已整理', 'notification').id, notice.id);
    assert.throws(() => f.host.sendMessage(f.coordinator.id, key, f.schedule.id, '资料已整理', 'query'), /用途/);
    const question = f.host.sendMessage(f.coordinator.id, randomUUID(), f.schedule.id, '目前的截止日期？', 'query');
    const run = f.store.tasks().find(task => task.sourceMessageId === question.id)!;
    assert.equal(run.kind, 'message'); assert.notEqual(run.chatId, f.schedule.mainChatId);
    assert.equal((botService(f.host, 'listTasks', [f.schedule.id], main) as { id: string }[]).some(task => task.id === run.id), false);
    f.host.finish(run.id, 'completed', '截止日期是15号');
    const exchange = f.store.exchange(f.coordinator.id, f.schedule.id);
    assert.equal(exchange.messages.find(message => message.replyTo === question.id)?.content, '截止日期是15号');
    assert.equal(f.store.ai.chat(f.schedule.mainChatId).entries.length, 0);
  } finally { await f.close(); }
});

test('peer amendments preserve the same action and reject stale approvals and changed destinations', async () => {
  const f = fixture();
  try {
    const action = f.host.waitForAction(f.child.id, 'peer-date', 'todo', { plan: { message: '15号', actions: [] } }), operation = randomUUID();
    const message = f.host.amendDelegation(f.root.id, operation, f.schedule.id, f.child.sourceMessageId, '20号');
    assert.equal(message.taskId, f.child.id); assert.equal(message.replyTo, f.child.sourceMessageId);
    assert.equal(f.store.action(action.id).status, 'superseded');
    assert.equal(f.host.amendDelegation(f.root.id, operation, f.schedule.id, f.child.sourceMessageId, '20号').id, message.id);
    assert.equal(f.store.task(f.child.id).requirementsRevision, 1);
    await assert.rejects(f.host.answerAction(action.id, action.revision, { approved: true }));
    assert.throws(() => f.host.amendDelegation(f.root.id, operation, f.schedule.id, f.child.sourceMessageId, '21号'), /不同内容/);
  } finally { await f.close(); }
});
