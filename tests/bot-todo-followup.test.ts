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
    return store.actions(id).find(action => action.kind === 'todo')!;
  }
  const apply = (action: BotAction) => host.answerAction(action.id, action.revision, { approved: true, indices: [0] });
  return { directory, store, todo, host, submit, proposal, apply, observed: () => new Promise<void>(resolve => { observed = resolve; }), close: async () => { await host.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); todo.db.close(); ai.close(); assert.ok(directory.startsWith(join(tmpdir(), 'ono-followup-'))); rmSync(directory, { recursive: true, force: true }); } };
}

test('adding a date replaces the pending creation and stale confirmation cannot create a duplicate', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项，完成DataFUN的汇报材料的编写', { title, categoryId: null, priority: 'high', note: '保留原备注' })).id);
    const next = await f.proposal((await f.submit('明天完成', { title: '完成DataFun的汇报材料的编写', ...dates })).id);
    assert.equal(f.store.all<BotAction>('bot_actions').filter(action => action.kind === 'todo' && action.status === 'pending').length, 1);
    assert.equal(f.store.action(first.id).status, 'discarded');
    assert.equal((f.store.action(first.id).receipt as { supersededBy: string }).supersededBy, next.id);
    assert.equal(f.todo.all().length, 0);
    await f.apply(first); assert.equal(f.todo.all().length, 0);
    await f.apply(next); await f.apply(next);
    const [saved] = f.todo.all(); assert.equal(f.todo.all().length, 1); assert.equal(saved.dateAt, dates.dateAt);
    assert.equal(saved.priority, 'high'); assert.equal(saved.note, '保留原备注');
  } finally { await f.close(); }
});

test('a follow-up after confirmation updates the recorded item even if the model calls create again', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项，完成DataFUN的汇报材料的编写', { title, categoryId: null, priority: 'high', note: '原备注' })).id);
    await f.apply(first); const original = f.todo.all()[0];
    const next = await f.proposal((await f.submit('明天完成', { title, ...dates })).id);
    const plan = next.payload.plan as { actions: { type: string; id: string }[] };
    assert.equal(plan.actions[0].type, 'update'); assert.equal(plan.actions[0].id, original.id);
    await f.apply(next); assert.equal(f.todo.all().length, 1);
    const saved = f.todo.get(original.id); assert.equal(saved.dateAt, dates.dateAt); assert.equal(saved.priority, 'high'); assert.equal(saved.note, '原备注');
  } finally { await f.close(); }
});

test('confirmation arriving while the follow-up is generated still targets the same saved item', async () => {
  const f = await fixture(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const observed = f.observed(); const nextTask = await f.submit('明天完成', { title, ...dates }, gate);
    await observed; await f.apply(first); const original = f.todo.all()[0]; release();
    const next = await f.proposal(nextTask.id); await f.apply(next);
    assert.equal(f.todo.all().length, 1); assert.equal(f.todo.all()[0].id, original.id); assert.equal(f.todo.all()[0].dateAt, dates.dateAt);
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
    assert.equal(f.store.action(first.id).status, 'discarded'); await f.apply(next);
    assert.equal(f.todo.all().length, 1); assert.equal(f.todo.all()[0].title, '准备 DataFUN 分享'); assert.equal(f.todo.all()[0].note, '原备注');
  } finally { await f.close(); }
});

test('a write with an unknown result blocks a replacement creation until it is reconciled', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    f.store.updateAction(first.id, { status: 'unknown' });
    const next = await f.submit('明天完成', { title, ...dates });
    await assert.rejects(f.proposal(next.id), /结果待核对/);
    assert.equal(f.store.action(first.id).status, 'unknown'); assert.equal(f.todo.all().length, 0);
    const incomplete = f.store.actions(next.id).find(action => action.kind === 'todo')!;
    await assert.rejects(f.apply(incomplete), /任务已结束/);
  } finally { await f.close(); }
});

test('failure saving the revised card rolls back retiring the original confirmation', async () => {
  const f = await fixture(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const observed = f.observed(), next = await f.submit('明天完成', { title, ...dates }, gate); await observed;
    f.store.db.exec(`CREATE TRIGGER reject_revision BEFORE UPDATE ON bot_actions WHEN NEW.id='${next.id}:proposal' AND json_type(NEW.payload,'$.payload.preview')='array' BEGIN SELECT RAISE(FAIL,'injected revision save failure'); END`);
    release(); await assert.rejects(f.proposal(next.id), /injected revision save failure/);
    assert.equal(f.store.action(first.id).status, 'pending'); assert.equal(f.store.task(first.taskId).status, 'waiting_user');
    await f.apply(first); assert.equal(f.todo.all().length, 1);
  } finally { release(); await f.close(); }
});

test('ambiguous same-named proposals require an identity and preserve the other independent item', async () => {
  const f = await fixture();
  try {
    const first = await f.proposal((await f.submit('记录一个事项', { title, categoryId: null })).id);
    const second = await f.proposal((await f.submit('再新建一个同名事项', { title, categoryId: null, separate: true })).id);
    const ambiguous = await f.submit('明天完成', { title, ...dates });
    await assert.rejects(f.proposal(ambiguous.id), /多份同名/);
    assert.equal(f.store.action(first.id).status, 'pending'); assert.equal(f.store.action(second.id).status, 'pending');
    const revised = await f.proposal((await f.submit('修改第一条的日期', { title, ...dates, replacesProposalId: first.id })).id);
    assert.equal(f.store.action(first.id).status, 'discarded'); assert.equal(f.store.action(second.id).status, 'pending');
    await f.apply(revised); await f.apply(second); assert.equal(f.todo.all().length, 2);
  } finally { await f.close(); }
});
