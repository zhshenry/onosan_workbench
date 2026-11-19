import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotRuntime } from '../electron/bot-runtime';
import { Store } from '../modules/todo/store';

async function until(check: () => boolean) { for (let i = 0; i < 1500; i++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('runtime timed out'); }
async function fixture(respond: (input: any) => Promise<object> | object) {
  const directory = mkdtempSync(join(tmpdir(), 'ono-runtime-')), ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory), todo = new Store(join(directory, 'tasks.db'));
  for (const card of store.cards()) {
    const profile = store.profile(card.id);
    store.updateProfile(profile.id, profile.revision, { ...profile, modelId: 'fixture' });
  }
  const server = createServer((req, res) => { void (async () => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    const delta: any = await respond(JSON.parse(raw)); if (res.destroyed) return;
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    for (const [value, reason] of [[delta, null], [{}, delta.tool_calls ? 'tool_calls' : 'stop']]) res.write(`data: ${JSON.stringify({ id: randomUUID(), object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason: reason }] })}\n\n`);
    res.end('data: [DONE]\n\n');
  })().catch(error => res.destroy(error)); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const runtime = new BotRuntime(store, todo, undefined as never, undefined as never, undefined as never, { connection: modelId => ({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: modelId, protocol: 'openai-chat', key: '' }), changed: () => {} });
  const host = new BotHost(store, runtime), bots = store.cards(), coordinator = bots.find(bot => bot.seedKey === 'coordinator')!, schedule = bots.find(bot => bot.seedKey === 'schedule')!, surface = { id: 'runtime', kind: 'main' as const };
  const input = (botId: string, text: string) => { const chatId = store.profile(botId).mainChatId, draft = store.draft(chatId), saved = host.saveDraft(chatId, draft.revision, { text, replyToTaskId: null, resources: [] }, surface); return { botId, chatId, text, expectedDraftRevision: saved.revision, clientRequestId: randomUUID(), replyToTaskId: null, resources: [] }; };
  return { ai, store, todo, host, coordinator, schedule, surface, input, close: async () => { await host.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); todo.db.close(); ai.close(); } };
}
test('a Bot without a selected model waits without sending a model request', async () => {
  let requests = 0;
  const f = await fixture(() => { requests++; return { content: 'unexpected' }; });
  try {
    const bot = f.store.profile(f.coordinator.id);
    f.store.updateProfile(bot.id, bot.revision, { ...bot, modelId: null });
    const receipt = await f.host.submit(f.input(bot.id, '等候选择模型'), f.surface);
    await until(() => f.store.task(receipt.task.id).status === 'waiting_resource');
    assert.match(f.store.task(receipt.task.id).reason ?? '', /为此 Bot 选择模型/);
    assert.equal(requests, 0);
  } finally { await f.close(); }
});

test('each receiving Bot runs with its own saved model', async () => {
  const models: string[] = [];
  const f = await fixture(input => { models.push(input.model); return { content: '收到' }; });
  try {
    const profile = f.store.profile(f.schedule.id);
    const modelId = randomUUID();
    f.store.updateProfile(profile.id, profile.revision, { ...profile, modelId });
    assert.equal(f.store.open(profile.id).bot.modelId, modelId);
    f.host.sendMessage(f.coordinator.id, randomUUID(), profile.id, '查看日程', 'query');
    await until(() => f.store.tasks().some(task => task.kind === 'message' && task.status === 'completed'));
    await f.host.submit(f.input(f.coordinator.id, '你好'), f.surface);
    await until(() => models.length === 2);
    assert.deepEqual(models, [modelId, 'fixture']);
  } finally { await f.close(); }
});

test('a query runs with read-only tools and replies in the pair stream without touching private user chat', async () => {
  let tools: string[] = [];
  const f = await fixture(input => { tools = input.tools.map((tool: any) => tool.function.name); return { content: '截止日期是12月15日。' }; });
  try {
    const message = f.host.sendMessage(f.coordinator.id, randomUUID(), f.schedule.id, '查截止日期', 'query');
    await until(() => f.store.tasks().some(task => task.kind === 'message' && task.status === 'completed'));
    assert.ok(tools.includes('list_tasks')); assert.ok(!tools.some(name => /propose|send_to_bot|artifact|ask_user/.test(name)));
    assert.equal(f.store.ai.chat(f.schedule.mainChatId).entries.length, 0);
    assert.equal(f.todo.all().length, 0);
    assert.equal(f.store.exchange(f.coordinator.id, f.schedule.id).messages.find(item => item.replyTo === message.id)?.content, '截止日期是12月15日。');
  } finally { await f.close(); }
});

for (const purpose of ['work', 'query']) test(`${purpose} results append a new reply after the handoff without exposing internal reports`, async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const raw = '内部日程快照：事项 ID、dateAt 以及全部原始明细';
  const summary = '查到了，你还有4项待办。';
  let scheduleId = '';
  const f = await fixture(async input => {
    if (input.tools.some((tool: any) => tool.function.name === 'list_tasks')) { await gate; return { content: raw }; }
    const latest = JSON.stringify([...input.messages].reverse().find((message: any) => message.role === 'user')?.content);
    if (latest.includes('协作结果已到达')) return { content: summary };
    if (latest.includes('先聊另一件事')) return { content: '好的，这是另一轮对话。' };
    const sent = input.messages.some((message: any) => message.tool_calls?.some((call: any) => call.id === 'handoff'));
    return sent ? { content: '已经发给日程，等查询结果。' } : { content: '我请日程查一下。', tool_calls: [{ index: 0, id: 'handoff', type: 'function', function: { name: 'send_to_bot', arguments: JSON.stringify({ botId: scheduleId, purpose, content: '查询当前待办', references: [] }) } }] };
  });
  try {
    scheduleId = f.schedule.id;
    const root = f.host.submit(f.input(f.coordinator.id, '我现在还有什么待办'), f.surface).task;
    await until(() => { const task = f.store.task(root.id); assert.notEqual(task.status, 'failed', task.reason); return task.status === 'waiting_bot' && f.ai.chat(root.chatId).entries.some(entry => entry.role === 'assistant' && !entry.streaming); });
    const first = structuredClone(f.ai.chat(root.chatId).entries.find(entry => entry.role === 'assistant')!);
    const next = f.host.submit(f.input(f.coordinator.id, '先聊另一件事'), f.surface).task;
    await until(() => f.store.task(next.id).status === 'completed');
    release();
    await until(() => f.store.task(root.id).status === 'completed');
    const entries = f.ai.chat(root.chatId).entries;
    assert.equal(entries.find(entry => entry.id === first.id)?.content, first.content, 'the earlier reply must not be rewritten');
    assert.equal(entries.filter(entry => entry.content === summary).length, 1);
    assert.equal(entries.some(entry => entry.content.includes(raw)), false, 'internal results stay out of the main chat');
    assert.ok(entries.findIndex(entry => entry.content === summary) > entries.findIndex(entry => entry.id === next.sourceMessageId));
    assert.notEqual(f.store.task(root.id).assistantEntryId, first.id);
    const exchange = f.store.exchange(f.coordinator.id, f.schedule.id).messages;
    assert.ok(exchange.some(message => message.kind === 'result' && message.content.includes(raw)), 'the original report remains available in pair history');
    assert.equal(exchange.find(message => ['request', 'question'].includes(message.kind))?.sourceAssistantEntryId, first.id);
    const result = exchange.find(message => message.kind === 'result')!;
    const resumed = entries.find(entry => entry.content === summary)!;
    assert.deepEqual(resumed.receivedBotMessages, [{ id: result.id, fromBotId: f.schedule.id, toBotId: f.coordinator.id }], 'the incoming event must precede the new reply and survive reload');
    assert.deepEqual(f.store.open(f.coordinator.id).chat.entries.find(entry => entry.id === resumed.id), resumed);
    assert.equal(f.store.task(root.id).pendingReplyMessageIds?.length, 0, 'a received event is consumed once');
  } finally { release(); await f.close(); }
});

test('resuming a stale streaming entry freezes the old segment and starts clean', async () => {
  const f = await fixture(() => ({ content: '收到结果后的新回复' }));
  try {
    const task = f.store.submit(f.input(f.coordinator.id, '恢复这项工作'), () => {}).task;
    const chat = f.ai.chat(task.chatId), oldId = randomUUID();
    chat.entries.push({ id: oldId, role: 'assistant', content: '交接前的正文', thinking: '交接前的思考', streaming: true, thinkingActive: true, tools: [{ id: 'old', name: 'read_task', label: '查看协作进度', status: 'running', output: '' }] });
    f.ai.saveChat(chat); f.store.updateTask(task.id, { assistantEntryId: oldId }); f.host.wake();
    await until(() => f.store.task(task.id).status === 'completed');
    const entries = f.ai.chat(task.chatId).entries, old = entries.find(entry => entry.id === oldId)!;
    assert.equal(old.content, '交接前的正文'); assert.equal(old.thinking, '交接前的思考'); assert.equal(old.streaming, false); assert.equal(old.thinkingActive, false);
    assert.equal(old.tools?.[0].status, 'interrupted');
    const next = entries.at(-1)!; assert.notEqual(next.id, oldId); assert.equal(next.content, '收到结果后的新回复'); assert.equal(next.thinking, undefined); assert.deepEqual(next.tools, []);
  } finally { await f.close(); }
});

test('confirmed delegated creation returns actual stored fields to the coordinator', async () => {
  let scheduleId = '', returned = '';
  const f = await fixture(input => {
    const latest = JSON.stringify([...input.messages].reverse().find((message: any) => message.role === 'user')?.content);
    if (latest.includes('协作结果已到达')) { returned = latest; return { content: '已创建，请查看实际日期。' }; }
    if (input.tools.some((tool: any) => tool.function.name === 'list_tasks')) {
      return input.messages.some((message: any) => message.tool_calls?.some((call: any) => call.id === 'create')) ? { content: '请确认创建。' }
        : { tool_calls: [{ index: 0, id: 'create', type: 'function', function: { name: 'propose_create', arguments: JSON.stringify({ title: '完成待办 BOT 的建设', categoryId: null, dateAt: '2100-11-18T23:59:00+08:00' }) } }] };
    }
    return { tool_calls: [{ index: 0, id: 'send', type: 'function', function: { name: 'send_to_bot', arguments: JSON.stringify({ botId: scheduleId, purpose: 'work', content: '新增一项待办，确认后汇报实际写入日期', references: [] }) } }] };
  });
  try {
    scheduleId = f.schedule.id;
    const root = f.host.submit(f.input(f.coordinator.id, '新增一项待办'), f.surface).task;
    await until(() => { const detail = f.store.collaboration(root.id); assert.ok(!detail.tasks.some(task => task.status === 'failed'), JSON.stringify(detail.tasks.map(({ status, result, reason }) => ({ status, result, reason })))); return detail.actions.some(action => action.kind === 'todo' && action.status === 'pending' && f.store.task(action.taskId).status === 'waiting_user'); });
    const action = f.store.collaboration(root.id).actions.find(action => action.kind === 'todo')!;
    await f.host.answerAction(action.id, action.revision, { approved: true, indices: [0] });
    await until(() => f.store.task(root.id).status === 'completed');
    const actual = f.todo.all(); assert.equal(actual.length, 1); assert.equal(f.store.tasks().length, 2);
    assert.ok(returned.includes(actual[0].id)); assert.ok(returned.includes('2100-11-18T23:59:00+08:00'), 'the result must carry the stored deadline, not just an applied count');
    assert.equal(f.store.action(action.id).status, 'applied');
  } finally { await f.close(); }
});
test('a running amendment retires the old model request and produces only the latest preview in the same run owner', async () => {
  let release!: () => void, first = true, observed = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(async input => {
    if (first) { first = false; observed = true; await gate; return { content: '旧的15号回复不应覆盖最新内容' }; }
    const used = input.messages.some((message: any) => message.tool_calls?.some((call: any) => call.id === 'latest-date'));
    return used ? { content: '最新建议是20号，请确认。' } : { tool_calls: [{ index: 0, id: 'latest-date', type: 'function', function: { name: 'propose_create', arguments: JSON.stringify({ title: '整理汇报', categoryId: null, dateAt: '2100-12-20' }) } }] };
  });
  try {
    const first = f.host.submit(f.input(f.schedule.id, '整理汇报，15号完成'), f.surface).task;
    await until(() => observed);
    const request = { ...f.input(f.schedule.id, '还是20号吧'), target: { intent: 'amend' as const, rootTaskId: first.id, taskId: first.id } };
    const receipt = f.host.submit(request, f.surface); assert.equal(receipt.task.id, first.id);
    await until(() => f.store.task(first.id).status === 'waiting_user'); release();
    assert.equal(f.store.tasks(f.schedule.id).length, 1); assert.equal(f.store.task(first.id).runGeneration, 2);
    const actions = f.store.actions(first.id).filter(action => action.status === 'pending'); assert.equal(actions.length, 1);
    assert.equal((actions[0].payload.plan as any).actions[0].task.dateAt, '2100-12-20');
    await f.host.answerAction(actions[0].id, actions[0].revision, { approved: true, indices: [0] });
    assert.equal(f.todo.all().length, 1); assert.equal(f.todo.all()[0].dateAt, '2100-12-20');
    assert.ok(!f.ai.chat(f.schedule.mainChatId).entries.some(entry => entry.content.includes('旧的15号回复')));
  } finally { release(); await f.close(); }
});
