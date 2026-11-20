import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { botQueueChangeSchema, isQueuedBotMessage, type BotSubmit } from '../shared/bot-contracts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bot-queue-'));
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  const bot = store.cards().find(card => card.seedKey === 'coordinator')!;
  const submit = (text: string, resources: BotSubmit['resources'] = []) => {
    const current = store.draft(bot.mainChatId);
    const draft = store.saveDraft(bot.mainChatId, current.revision, { text, resources, replyToTaskId: null });
    const input: BotSubmit = { botId: bot.id, chatId: bot.mainChatId, text, resources, replyToTaskId: null,
      clientRequestId: randomUUID(), expectedDraftRevision: draft.revision };
    return { ...store.submit(input, () => {}), input };
  };
  return { ai, store, bot, submit };
}

test('editing updates queued input and its user message at the same position, preserving the composer draft', () => {
  const f = fixture();
  try {
    const queued = f.submit('原始消息');
    const following = f.submit('后面的消息');
    const draft = f.store.saveDraft(f.bot.mainChatId, f.store.draft(f.bot.mainChatId).revision, { text: '未发送草稿', resources: [], replyToTaskId: null });
    assert.ok(isQueuedBotMessage(queued.task));
    const edit = { kind: 'edit' as const, taskId: queued.task.id, revision: queued.task.revision, text: '  修改后的原文\n    保留第二行  ' };
    const updated = f.store.changeQueuedMessage(botQueueChangeSchema.parse(edit));
    assert.equal(updated.createdAt, queued.task.createdAt);
    assert.equal(updated.input, edit.text);
    const entries = f.ai.chat(f.bot.mainChatId).entries;
    assert.deepEqual(entries.map(entry => entry.id), [queued.messageId, following.messageId]);
    assert.equal(entries[0].content, edit.text);
    assert.deepEqual(f.store.draft(f.bot.mainChatId), draft);
    assert.throws(() => f.store.changeQueuedMessage(edit), /内容已更新/);
    f.store.updateTask(updated.id, { status: 'running', runGeneration: 1 });
    assert.throws(() => f.store.changeQueuedMessage({ ...edit, revision: updated.revision }), /已离开队列/);
    assert.equal(f.store.task(updated.id).input, edit.text);
  } finally { f.ai.close(); }
});

test('deleting a queued message removes its text while the original send stays acknowledged', () => {
  const f = fixture();
  try {
    const queued = f.submit('待删除消息');
    f.store.changeQueuedMessage({ kind: 'delete', taskId: queued.task.id, revision: queued.task.revision });
    assert.equal(f.ai.chat(f.bot.mainChatId).entries.some(entry => entry.id === queued.messageId), false);
    assert.equal(f.store.tasks(f.bot.id).length, 0);
    const repeated = f.store.submit(queued.input, () => assert.fail('accepted requests must not run again'));
    assert.equal(repeated.duplicate, true);
    assert.equal(repeated.task.queueDisposition, 'deleted');
    assert.equal(repeated.task.input, '');
    assert.equal(f.ai.chat(f.bot.mainChatId).entries.length, 0);
  } finally { f.ai.close(); }
});

test('steering moves the original queued message into the current run once and keeps its references', () => {
  const f = fixture();
  try {
    const active = f.submit('整理会前材料', [{ kind: 'todo', id: 'meeting' }]);
    f.store.updateTask(active.task.id, { status: 'running', runGeneration: 2 });
    const queued = f.submit('改成一页，只保留结论', [{ kind: 'todo', id: 'summary' }]);
    const other = f.submit('另外查明天的日程');
    const change = { kind: 'steer' as const, taskId: queued.task.id, revision: queued.task.revision, targetTaskId: active.task.id, targetRun: 2 };
    assert.throws(() => f.store.changeQueuedMessage({ ...change, targetRun: 1 }), /当前任务已切换/);
    assert.ok(isQueuedBotMessage(f.store.task(queued.task.id)));
    f.store.changeQueuedMessage(change);
    const target = f.store.task(active.task.id);
    assert.equal(target.latestUserMessageId, queued.messageId);
    assert.match(target.resumeInput!, /改成一页，只保留结论/);
    assert.deepEqual(target.resources.map(ref => ref.id), ['meeting', 'summary']);
    assert.deepEqual(f.store.tasks(f.bot.id).filter(isQueuedBotMessage).map(task => task.id), [other.task.id]);
    assert.deepEqual(f.ai.chat(f.bot.mainChatId).entries.map(entry => entry.id), [active.messageId, other.messageId, queued.messageId]);
    assert.throws(() => f.store.changeQueuedMessage(change), /已离开队列/);
    assert.equal(f.store.task(active.task.id).requirementsRevision, 1);
  } finally { f.ai.close(); }
});
