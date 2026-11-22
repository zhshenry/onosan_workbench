import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotRuntime } from '../electron/bot-runtime';
import { Store } from '../modules/todo/store';
import type { BotAction } from '../shared/bot-contracts';

const surface = { id: 'followup:main', kind: 'main' as const };
const title = '完成 DataFUN 的汇报材料的编写';
const dates = { dateAt: '2100-11-17T23:59:00+08:00' };
async function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'ono-followup-'));
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory), todo = new Store(join(directory, 'tasks.db'));
  let response: { id: string; args: Record<string, unknown>; gate?: Promise<void> };
  let observed: (() => void) | undefined;
  const server = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const input = JSON.parse(raw), current = response;
    observed?.(); observed = undefined; await current.gate;
    const used = input.messages.some((message: any) => (message.tool_calls ?? []).some((call: any) => call.id === current.id));
    const delta = used ? { content: '建议已更新，请确认后应用。' } : { tool_calls: [{ index: 0, id: current.id, type: 'function', function: { name: 'propose_create', arguments: JSON.stringify(current.args) } }] };
    res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'close' });
    for (const [value, reason] of [[delta, null], [{}, used ? 'stop' : 'tool_calls']]) res.write(`data: ${JSON.stringify({ id: current.id, object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const runtime = new BotRuntime(store, todo, undefined as never, undefined as never, undefined as never, { connection: () => ({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixture', protocol: 'openai-chat', key: '' }), changed: () => {} });
  const host = new BotHost(store, runtime), bot = store.cards().find(bot => bot.seedKey === 'schedule')!;
  store.updateProfile(bot.id, bot.revision, { ...store.profile(bot.id), modelId: 'fixture' });
  async function submit(text: string, args: Record<string, unknown>, gate?: Promise<void>) {
    response = { id: 'followup-' + randomUUID(), args, gate };
    const saved = host.getDraft(bot.mainChatId, surface);
    const draft = host.saveDraft(bot.mainChatId, saved.revision, { text, replyToTaskId: null, resources: [] }, surface);
    return host.submit({ botId: bot.id, chatId: bot.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text, replyToTaskId: null, resources: [] }, surface).task;
  }
  async function proposal(id: string) {
    const deadline = Date.now() + 15000;
    while (store.task(id).status !== 'waiting_user') {
      if (store.task(id).status === 'failed') throw new Error(store.task(id).reason);
      assert.ok(Date.now() < deadline, 'proposal timed out'); await new Promise(resolve => setTimeout(resolve, 10));
    }
    return store.actions(id).find(action => action.kind === 'todo' && action.status === 'pending')!;
  }
  const apply = (action: BotAction) => host.answerAction(action.id, action.revision, { approved: true, indices: [0] });
  return { directory, store, todo, host, submit, proposal, apply, observed: () => new Promise<void>(resolve => { observed = resolve; }), close: async () => { await host.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); todo.db.close(); ai.close(); assert.ok(directory.startsWith(join(tmpdir(), 'ono-followup-'))); rmSync(directory, { recursive: true, force: true }); } };
}

test('adding a date replaces the pending creation and stale confirmation cannot create a duplicate', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项，完成DataFUN的汇报材料的编写', { title, categoryId: null, priority: 'high', note: '保留原备注' })).id);
    const anchor = f.store.task(first.taskId).assistantEntryId;
    assert.ok(anchor);
    const next = await f.proposal((await f.submit('明天完成', { title: '完成DataFun的汇报材料的编写', ...dates })).id);
    assert.equal(f.store.all<BotAction>('bot_actions').filter(action => action.kind === 'todo' && action.status === 'pending').length, 1);
    assert.equal(next.id, first.id); assert.ok(next.revision > first.revision);
    assert.notEqual(f.store.task(next.taskId).assistantEntryId, anchor);
    assert.equal(f.store.task(next.taskId).todoActionEntryIds?.[next.id], anchor);
    const history = f.store.actions(first.taskId).filter(action => action.status === 'discarded');
    assert.equal(history.length, 1);
    assert.deepEqual(history[0].receipt, { supersededBy: next.id });
    assert.deepEqual(history[0].payload, first.payload);
    assert.equal(f.store.action(first.id).requirementsRevision, 1);
    assert.equal(f.todo.all().length, 0);
    await assert.rejects(f.apply(first), /内容已更新/); assert.equal(f.todo.all().length, 0);
    await f.apply(next); await f.apply(next);
    const [saved] = f.todo.all(); assert.equal(f.todo.all().length, 1); assert.equal(saved.dateAt, dates.dateAt);
    assert.equal(saved.priority, 'high'); assert.equal(saved.note, '保留原备注');
  } finally { await f.close(); }
});

test('a follow-up after confirmation updates the recorded item even if the model calls create again', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项，完成DataFUN的汇报材料的编写', { title, categoryId: null, priority: 'high', note: '原备注' })).id);
    const originalReply = f.store.task(first.taskId).assistantEntryId;
    const created = await f.apply(first); const original = f.todo.all()[0];
    const next = await f.proposal((await f.submit('明天完成', { title, ...dates })).id);
    const plan = next.payload.plan as { actions: { type: string; id: string }[] };
    assert.equal(plan.actions[0].type, 'update'); assert.equal(plan.actions[0].id, original.id);
    assert.deepEqual(f.store.action(first.id).receipt, created.receipt);
    assert.equal(f.store.task(first.taskId).todoActionEntryIds?.[first.id], originalReply);
    await f.apply(next); assert.equal(f.todo.all().length, 1);
    const saved = f.todo.get(original.id); assert.equal(saved.dateAt, dates.dateAt); assert.equal(saved.priority, 'high'); assert.equal(saved.note, '原备注');
  } finally { await f.close(); }
});

test('confirmation of the previous version during a revision cannot save stale values', async () => {
  const f = await fixture(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const observed = f.observed(); const nextTask = await f.submit('明天完成', { title, ...dates }, gate);
    await observed; await assert.rejects(f.apply(first), /内容已更新/); assert.equal(f.todo.all().length, 0); release();
    const next = await f.proposal(nextTask.id); await f.apply(next);
    assert.equal(f.todo.all().length, 1); assert.equal(next.id, first.id); assert.equal(f.todo.all()[0].dateAt, dates.dateAt);
  } finally { release(); await f.close(); }
});

test('a different requested item does not replace an unrelated pending confirmation', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录 DataFUN 事项', { title, categoryId: null })).id);
    const next = await f.proposal((await f.submit('再记录周会材料', { title: '准备周会材料', categoryId: null })).id);
    assert.equal(f.store.action(first.id).status, 'pending'); assert.equal(f.store.action(next.id).status, 'pending');
    await f.apply(first); await f.apply(next); assert.equal(f.todo.all().length, 2);
  } finally { await f.close(); }
});

test('explicitly creating another same-named item remains possible', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const next = await f.proposal((await f.submit('另外新增一条同名事项，明天完成', { title, ...dates, separate: true })).id);
    assert.equal(f.store.action(first.id).status, 'pending'); await f.apply(first); await f.apply(next);
    assert.equal(f.todo.all().length, 2);
  } finally { await f.close(); }
});

test('an explicit proposal identity supports renaming without a second creation', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null, note: '原备注' })).id);
    const next = await f.proposal((await f.submit('名字改为准备 DataFUN 分享，明天完成', { title: '准备 DataFUN 分享', ...dates, replacesProposalId: first.id })).id);
    assert.equal(next.id, first.id); assert.ok(next.revision > first.revision); await f.apply(next);
    assert.equal(f.todo.all().length, 1); assert.equal(f.todo.all()[0].title, '准备 DataFUN 分享'); assert.equal(f.todo.all()[0].note, '原备注');
  } finally { await f.close(); }
});

test('a replacement discovered in a separate run keeps the previous card location', async () => {
  const f = await fixture();
  try {
    const previous = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const anchor = f.store.task(previous.taskId).assistantEntryId;
    const next = await f.proposal((await f.submit('另外，把原事项安排在明天', { title, ...dates, replacesProposalId: previous.id })).id);
    assert.notEqual(next.taskId, previous.taskId);
    assert.equal(f.store.task(next.taskId).todoActionEntryIds?.[next.id], anchor);
    assert.equal(f.store.action(previous.id).status, 'discarded');
    assert.deepEqual(f.store.action(previous.id).receipt, { supersededBy: next.id });
    await f.apply(next);
    assert.equal(f.todo.all().length, 1);
  } finally { await f.close(); }
});

test('a write with an unknown result blocks a replacement creation until it is reconciled', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    f.store.updateAction(first.id, { status: 'unknown' });
    const next = await f.submit('明天完成', { title, ...dates });
    assert.equal(f.store.task(next.id).inputRoute?.intent, 'amend');
    assert.equal(f.store.action(first.id).status, 'unknown'); assert.equal(f.todo.all().length, 0);
    assert.equal(f.store.actions(next.id).length, 0);
    assert.equal(f.store.pendingInputs().length, 1);
  } finally { await f.close(); }
});

test('failure saving a revised card keeps its old version ineligible for confirmation', async () => {
  const f = await fixture(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const observed = f.observed(), next = await f.submit('明天完成', { title, ...dates }, gate); await observed;
    f.store.db.exec(`CREATE TRIGGER reject_revision BEFORE UPDATE ON bot_actions WHEN NEW.id='${next.id}:proposal' AND json_type(NEW.payload,'$.payload.preview')='array' BEGIN SELECT RAISE(FAIL,'injected revision save failure'); END`);
    release(); await assert.rejects(f.proposal(next.id), /injected revision save failure/);
    assert.equal(f.store.action(first.id).status, 'superseded'); assert.equal(f.store.task(first.taskId).status, 'failed');
    assert.deepEqual(f.store.action(first.id).payload, first.payload);
    assert.equal(f.store.actions(first.taskId).filter(action => action.kind === 'todo').length, 1);
    await assert.rejects(f.apply(first), /内容已更新/); assert.equal(f.todo.all().length, 0);
  } finally { release(); await f.close(); }
});

test('ambiguous same-named proposals require an identity and preserve the other independent item', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const second = await f.proposal((await f.submit('再新建一个同名事项', { title, categoryId: null, separate: true })).id);
    const ambiguous = await f.submit('明天完成', { title, ...dates });
    const question = f.store.actions(ambiguous.id).find(action => action.kind === 'question')!;
    assert.equal(question.status, 'pending');
    assert.equal(f.store.action(first.id).status, 'pending'); assert.equal(f.store.action(second.id).status, 'pending');
    const options = question.payload.options as { taskId?: string; label: string }[];
    await f.host.answerAction(question.id, question.revision, { text: options.find(option => option.taskId === first.taskId)!.label });
    const revised = await f.proposal(first.taskId);
    assert.equal(revised.id, first.id); assert.ok(revised.revision > first.revision); assert.equal(f.store.action(second.id).status, 'pending');
    await f.apply(revised); await f.apply(second); assert.equal(f.todo.all().length, 2);
  } finally { await f.close(); }
});
