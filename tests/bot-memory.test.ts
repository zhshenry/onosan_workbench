import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { AiStore } from '../electron/ai-store';
import { authoredMemoryText, memoryContext, memoryIntent } from '../electron/bot-memory';
import type { BotHost } from '../electron/bot-host';
import { botService } from '../electron/bot-service';
import { BotStore } from '../electron/bot-store';
import type { BotMemory, BotMemoryView, BotSubmit } from '../shared/bot-contracts';

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'bot-memory-'));
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  const bot = store.cards().find(card => card.seedKey === 'coordinator')!;
  const other = store.cards().find(card => card.seedKey === 'schedule')!;
  const submit = (text: string, generatedPrompts?: string[], owner = bot) => {
    const chatId = owner.mainChatId;
    const draft = store.saveDraft(chatId, store.draft(chatId).revision, { text, resources: [], replyToTaskId: null, generatedPrompts });
    const input: BotSubmit = { botId: owner.id, chatId, text, resources: [], replyToTaskId: null,
      generatedPrompts, expectedDraftRevision: draft.revision, clientRequestId: randomUUID() };
    return store.submit(input, () => {});
  };
  const add = (text: string, botId: string | null = bot.id) =>
    store.saveMemory({ id: randomUUID(), botId, scope: botId ? 'private' : 'shared', text, source: '用户编辑', revision: 0 });
  return { directory, ai, store, bot, other, submit, add };
}

test('memory title and topic are persisted separately and old rows can still be listed', () => {
  const f = fixture();
  try {
    const host = { store: f.store, changed() {} } as unknown as BotHost;
    const surface = { id: 'test', kind: 'main' };
    const draft = { id: randomUUID(), botId: null, scope: 'shared' as const, title: '周报顺序', topic: '写作',
      text: '周报先列风险，再写进度。', source: '用户编辑', revision: 0 };
    assert.throws(() => botService(host, 'updateMemory', [draft], surface), { code: 'MEMORY_CHAT_REQUIRED' });
    const old = f.add('每周写一份报告。', null);
    const saved = botService(host, 'updateMemory', [{ ...draft, id: old.id, revision: old.revision }], surface) as BotMemoryView;
    const { title, topic, ...legacy } = f.add('称呼用户为测试用户。');
    f.store.db.prepare('UPDATE bot_memories SET payload=? WHERE id=?').run(JSON.stringify(legacy), legacy.id);
    const stored = f.store.get<BotMemory>('bot_memories', saved.id);
    assert.equal(stored.title, '周报顺序');
    assert.equal(stored.topic, '写作');
    assert.equal(stored.text, '周报先列风险，再写进度。');
    const visible = botService(host, 'listMemories', [f.bot.id], surface) as BotMemoryView[];
    assert.equal(visible.find(memory => memory.id === legacy.id)?.title, '称呼偏好');
    assert.equal(visible.find(memory => memory.id === legacy.id)?.topic, '称呼');
    assert.equal(f.store.get<BotMemory>('bot_memories', legacy.id).title, undefined);
  } finally { f.ai.close(); }
});

test('memory replacement preserves a newer edit and checks the target owner', () => {
  const f = fixture();
  try {
    const initial = f.add('周报只列进度。');
    const other = f.add('会议先发议程。', f.other.id);
    const quote = '把周报约定改为先列风险。';
    const receipt = f.submit(quote);
    const source = [{ chatId: f.bot.mainChatId, messageId: receipt.messageId, quote }];
    const newer = f.store.saveMemory({ ...initial, text: '周报先列结论。' });
    assert.throws(() => f.store.commitRemember(receipt.task.id, randomUUID(), receipt.messageId, { scope: 'private', text: quote }, source, { ...initial, reuse: false }), { code: 'VERSION_CONFLICT' });
    assert.throws(() => f.store.commitRemember(receipt.task.id, randomUUID(), receipt.messageId, { scope: 'private', text: quote }, source, { ...other, reuse: false }), { code: 'MEMORY_SCOPE' });
    assert.deepEqual(f.store.memories(f.bot.id), [newer]);
    assert.deepEqual(f.store.memories(f.other.id), [other]);
  } finally { f.ai.close(); }
});

test('resident capacity evicts older entries without deleting them or crossing scopes', () => {
  const f = fixture();
  try {
    const first = f.add('私'.repeat(290) + '最早条目');
    const shared = f.add('全'.repeat(300), null);
    const peer = f.add('其他 Bot 的私人内容', f.other.id);
    f.add('甲'.repeat(300)); f.add('乙'.repeat(300)); f.add('丙'.repeat(300));
    const privateItems = f.store.memories(f.bot.id).filter(memory => memory.scope === 'private');
    assert.equal(privateItems.find(memory => memory.id === first.id)?.retention, 'on-demand');
    assert.equal(privateItems.find(memory => memory.id === first.id)?.text, first.text);
    assert.equal(f.store.memories(f.bot.id).find(memory => memory.id === shared.id)?.retention, 'resident');
    assert.ok(!f.store.memories(f.bot.id).some(memory => memory.id === peer.id));
    const round = memoryContext(() => f.store.memories(f.bot.id));
    assert.equal(round.resident.length, 4);
    assert.equal(round.search('最早条目')[0].id, first.id);
    assert.deepEqual(round.search('最早条目'), []);
    assert.deepEqual(memoryContext(() => f.store.memories(f.bot.id, false)).search('最早条目'), []);
    assert.throws(() => f.add('超'.repeat(301)), /300/);
  } finally { f.ai.close(); }
});

test('memory listing reads current authorized records regardless of recall state and supports paging', () => {
  const f = fixture();
  try {
    const first = f.add('按需查到的首条周报规则');
    const privateRecords = Array.from({ length: 10 }, (_, index) => f.add(`私人偏好 ${index}`));
    const shared = f.add('全局写作规则', null);
    f.add('其他 Bot 的私人内容', f.other.id);
    const round = memoryContext(() => f.store.memories(f.bot.id));
    const onDemand = f.store.memories(f.bot.id).find(memory => memory.retention === 'on-demand');
    assert.ok(onDemand);
    assert.ok(!round.resident.some(memory => memory.id === onDemand.id));
    const firstPage = round.list({});
    assert.equal(firstPage.total, 12);
    assert.equal(firstPage.matched, 12);
    assert.equal(firstPage.memories.length, 10);
    assert.equal(firstPage.nextOffset, 10);
    const secondPage = round.list({ offset: firstPage.nextOffset });
    assert.equal(secondPage.nextOffset, undefined);
    assert.deepEqual(new Set([...firstPage.memories, ...secondPage.memories].map(memory => memory.id)),
      new Set([first, ...privateRecords, shared].map(memory => memory.id)));

    assert.equal(round.list({ scope: 'shared' }).memories[0].id, shared.id);
    assert.equal(round.search(onDemand.text)[0].id, onDemand.id);
    assert.deepEqual(round.search(onDemand.text), []);
    assert.equal(round.list({ query: onDemand.id }).memories[0].id, onDemand.id);
    f.store.removeMemory(onDemand.id, onDemand.revision);
    const fresh = round.list({ query: onDemand.id });
    assert.equal(fresh.total, 11);
    assert.equal(fresh.matched, 0);
    assert.deepEqual(fresh.memories, []);
  } finally { f.ai.close(); }
});

test('legacy long memory stays intact and search returns a bounded relevant excerpt', () => {
  const f = fixture();
  try {
    const text = '上'.repeat(2000) + '上线检查名单' + '下'.repeat(1900);
    const memory = { id: randomUUID(), text, scope: 'private', botId: f.bot.id, source: '旧记录', revision: 1, updatedAt: new Date().toISOString() };
    f.store.db.prepare('INSERT INTO bot_memories VALUES(?,?,?)').run(memory.id, memory.botId, JSON.stringify(memory));
    const store = new BotStore(f.ai, f.directory);
    const round = memoryContext(() => store.memories(f.bot.id));
    assert.deepEqual(round.resident, []);
    const [result] = round.search('上线检查名单');
    assert.equal(result.excerpt, true);
    assert.ok(result.text.length <= 300);
    assert.match(result.text, /上线检查名单/);
    assert.equal(store.memories(f.bot.id)[0].text, text);
  } finally { f.ai.close(); }
});

test('automatic review accepts genuine queued messages once and honors final edit or steer', () => {
  const f = fixture();
  try {
    const before = f.submit('开启前的发言');
    f.store.setMemoryEnabled(true);
    const running = f.submit('生成办公周报\n\n以后周报先列风险', ['生成办公周报']);
    const queued = f.submit('旧的要求');
    const dropped = f.submit('需移除的发言');
    const template = f.submit('生成会议总结', ['生成会议总结']);
    const edited = f.store.changeQueuedMessage({ kind: 'edit', taskId: queued.task.id, revision: queued.task.revision, text: '每周使用简表' });
    f.store.updateTask(running.task.id, { status: 'running', runGeneration: 1 });
    f.store.changeQueuedMessage({ kind: 'steer', taskId: queued.task.id, revision: edited.revision, targetTaskId: running.task.id, targetRun: 1 });
    f.store.changeQueuedMessage({ kind: 'delete', taskId: dropped.task.id, revision: dropped.task.revision });
    f.store.queueMemoryReview([before.messageId, running.messageId, queued.messageId, dropped.messageId, template.messageId]);
    const batch = f.store.nextMemoryReview(new Set())!;
    assert.deepEqual(batch.inputs.map(input => input.authored), ['以后周报先列风险', '每周使用简表']);
    assert.deepEqual(f.store.memoryInputs(running.task.id).map(input => input.messageId), [running.messageId, queued.messageId]);
    const evidence = batch.inputs.map(input => ({ messageId: input.messageId, quote: input.authored }));
    assert.equal(f.store.commitMemoryReview(batch, [{ action: 'add', text: '周报用简表，先列风险。', evidence }]), true);
    const [memory] = f.store.memories(f.bot.id);
    assert.equal(memory.retention, 'on-demand');
    assert.equal(f.store.memorySources(f.bot.id, memory.id).length, 2);
    assert.throws(() => f.store.memorySources(f.other.id, memory.id));
    f.store.queueMemoryReview(batch.ids);
    assert.equal(f.store.nextMemoryReview(new Set()), undefined);
  } finally { f.ai.close(); }
});

test('a review cannot commit across an off/on cycle or replace a manually edited entry', () => {
  const f = fixture();
  try {
    assert.equal(f.store.memoryEpoch(), '');
    f.store.setMemoryEnabled(true);
    const dropped = f.submit('我一般喜欢先看结论');
    f.store.queueMemoryReview([dropped.messageId]);
    const expired = f.store.nextMemoryReview(new Set())!;
    f.store.setMemoryEnabled(false);
    f.store.setMemoryEnabled(true);
    assert.equal(f.store.commitMemoryReview(expired, [{ action: 'add', text: '先说结论', evidence: [{ messageId: dropped.messageId, quote: '先看结论' }] }]), false);
    assert.equal(f.store.nextMemoryReview(new Set()), undefined);
    const saved = f.submit('通常先说结论');
    f.store.queueMemoryReview([saved.messageId]);
    const batch = f.store.nextMemoryReview(new Set())!;
    const stale = [{ action: 'add' as const, text: '先说结论', evidence: [{ messageId: dropped.messageId, quote: '先看结论' }] }];
    assert.equal(f.store.commitMemoryReview(batch, stale), false);
    assert.deepEqual(f.store.memories(f.bot.id), []);
    const manual = f.add('偏好详尽格式');
    const later = f.submit('以后使用简表');
    f.store.queueMemoryReview([later.messageId]);
    assert.equal(f.store.commitMemoryReview(f.store.nextMemoryReview(new Set())!, [
      { action: 'update', id: manual.id, text: '使用简表', evidence: [{ messageId: later.messageId, quote: '以后使用简表' }] },
    ]), false);
    assert.equal(f.store.memories(f.bot.id)[0].text, manual.text);
  } finally { f.ai.close(); }
});

test('a reference to global memory is different from an explicit shared write request', () => {
  assert.deepEqual(memoryIntent('请记住，全局记忆页面经常要检查。'), { shared: false });
  assert.deepEqual(memoryIntent('以后所有 Bot 给我汇报时都先给结论。'), { shared: true });
  assert.deepEqual(memoryIntent('请记住我喜欢简短报告，不要共享给所有 Bot。'), { shared: false });
  assert.equal(memoryIntent('请整理会议纪要'), undefined);
});

test('colloquial remember requests still need a long-term instruction', () => {
  assert.deepEqual(memoryIntent('帮我记一条，以后叫我钟sir'), { shared: false });
  assert.deepEqual(memoryIntent('请记一下：每次汇报先说结论'), { shared: false });
  assert.deepEqual(memoryIntent('帮我记一条偏好：我喜欢简报'), { shared: false });
  assert.equal(memoryIntent('帮我记一条待办，明天开会'), undefined);
  assert.equal(memoryIntent('帮我记一下，明天开会'), undefined);
  assert.equal(memoryIntent('请先别帮我记一条，以后改了再说'), undefined);
  assert.equal(memoryIntent('请分析「帮我记一条，以后叫我钟sir」的语气'), undefined);
});

test('private-only and negative sharing instructions override cross-Bot wording', () => {
  assert.deepEqual(memoryIntent('请记住，周报先列风险，不要让所有 Bot 都知道。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住，我不希望所有 Bot 都知道。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住，所有 Bot 都不要知道这件事。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住，周报先列风险，请勿把这条保存为全局记忆。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住，周报先列风险，只给当前 Bot 用；给所有 Bot 用这个格式。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住，「保存为全局记忆」是一个菜单名。'), { shared: false });
  assert.deepEqual(memoryIntent('请记住所有 Bot 都装好了插件。'), { shared: false });
  assert.deepEqual(memoryIntent("Remember that I prefer short reports. Don't share this across all bots."), { shared: false });
  assert.deepEqual(memoryIntent('请记住，周报先列风险，保存为全局记忆。'), { shared: true });
  assert.deepEqual(memoryIntent('请记住，这个格式给所有 Bot 用。'), { shared: true });
  assert.deepEqual(memoryIntent('请记住，所有 Bot 都先列风险。'), { shared: true });
  assert.deepEqual(memoryIntent('以后所有 Bot 都不要在汇报里用表情。'), { shared: true });
});

test('deletion invalidates earlier automatic review inputs for that Bot', () => {
  const f = fixture();
  try {
    f.store.setMemoryEnabled(true);
    const original = '周报先列风险';
    const saved = f.add(original);
    const inFlight = f.submit('以后' + original);
    const waitingForReply = f.submit('一般来说' + original);
    const peer = f.submit('日程请显示截止日期', undefined, f.other);
    f.store.queueMemoryReview([inFlight.messageId, peer.messageId]);
    const candidate = f.store.nextMemoryReview(new Set())!;
    assert.deepEqual(candidate.ids, [inFlight.messageId]);
    assert.ok(candidate.existing.some(memory => memory.id === saved.id));

    f.store.removeMemory(saved.id, saved.revision);
    const lateChange = { action: 'add' as const, text: original, evidence: [{ messageId: inFlight.messageId, quote: original }] };
    assert.equal(f.store.commitMemoryReview(candidate, [lateChange]), false);
    assert.deepEqual(f.store.memories(f.bot.id), []);
    f.store.queueMemoryReview([inFlight.messageId, waitingForReply.messageId]);
    assert.equal(f.store.nextMemoryReview(new Set([f.other.id])), undefined);
    assert.deepEqual(f.store.nextMemoryReview(new Set())?.ids, [peer.messageId]);

    const fresh = f.submit('重新约定，' + original);
    f.store.queueMemoryReview([fresh.messageId]);
    const next = f.store.nextMemoryReview(new Set([f.other.id]))!;
    assert.deepEqual(next.ids, [fresh.messageId]);
    assert.equal(f.store.commitMemoryReview(next, [{ ...lateChange, evidence: [{ messageId: fresh.messageId, quote: original }] }]), true);
    assert.equal(f.store.memories(f.bot.id)[0].sources?.[0].messageId, fresh.messageId);
  } finally { f.ai.close(); }
});

test('routed memory text excludes generated fragments on either side of the forwarded boundary', () => {
  const prefix = '工作区预填提示，先暂停。';
  const authored = '以后周报先列风险。';
  const suffix = '\n\n生成会议总结';
  assert.equal(authoredMemoryText(prefix + authored + suffix, [prefix, suffix], prefix.length), authored);
});
