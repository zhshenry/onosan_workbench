import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { createServer } from 'node:http';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotRuntime } from '../electron/bot-runtime';
import { Store } from '../modules/todo/store';
import { newTask } from '../shared/todo-contracts';

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
  let snapshot: { capturedAt: string; capturedLocalTime: string; tasks: { id: string; dateAt: string }[] } | undefined;
  const f = await fixture(input => {
    tools = input.tools.map((tool: any) => tool.function.name);
    const lookup = input.messages.find((message: { role: string }) => message.role === 'tool');
    if (lookup) {
      snapshot = JSON.parse(lookup.content) as NonNullable<typeof snapshot>;
      return { content: `截止日期是12月15日。查询时间 ${snapshot.capturedLocalTime}。` };
    }
    return { tool_calls: [{ index: 0, id: 'read-todos', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] };
  });
  try {
    const item = f.todo.create({ ...newTask('查询用待办'), dateAt: '2026-12-15' });
    const startedAt = Date.now();
    const message = f.host.sendMessage(f.coordinator.id, randomUUID(), f.schedule.id, '查截止日期', 'query');
    await until(() => f.store.tasks().some(task => task.kind === 'message' && task.status === 'completed'));
    assert.ok(tools.includes('list_tasks')); assert.ok(!tools.some(name => /propose|send_to_bot|artifact|ask_user/.test(name)));
    assert.equal(f.store.ai.chat(f.schedule.mainChatId).entries.length, 0);
    assert.deepEqual(f.todo.all(), [item]);
    assert.ok(snapshot);
    assert.equal(snapshot.tasks.find(task => task.id === item.id)?.dateAt, item.dateAt);
    const capturedAt = Date.parse(snapshot.capturedAt);
    assert.ok(capturedAt >= startedAt && capturedAt <= Date.now());
    assert.match(snapshot.capturedLocalTime, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.equal(f.store.exchange(f.coordinator.id, f.schedule.id).messages.find(item => item.replyTo === message.id)?.content,
      `截止日期是12月15日。查询时间 ${snapshot.capturedLocalTime}。`);
  } finally { await f.close(); }
});

test('a removed or unauthorized reference cannot be read and prompts for a new reference', async () => {
  let id = '';
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: { role: string }) => message.role === 'user');
    const result = input.messages.slice(lastUser + 1).find((message: { role: string }) => message.role === 'tool');
    if (result) return { content: String(result.content).includes('请重新引用') ? String(result.content) : '已经读取事项。' };
    return { tool_calls: [{ index: 0, id: randomUUID(), type: 'function',
      function: { name: 'read_resource', arguments: JSON.stringify({ kind: 'todo', id }) } }] };
  });
  try {
    const item = f.todo.create(newTask('核对会议资料'));
    id = item.id;
    const read = async (botId: string, text: string) => {
      const task = f.host.submit(f.input(botId, text), f.surface).task;
      await until(() => f.store.task(task.id).status === 'completed');
      return f.ai.chat(task.chatId).entries.find(entry => entry.id === f.store.task(task.id).assistantEntryId)!;
    };
    const allowed = await read(f.schedule.id, '读一下工作区里的事项');
    assert.equal(allowed.tools?.[0].status, 'complete');
    assert.match(allowed.tools?.[0].output ?? '', /核对会议资料/);
    const unauthorized = await read(f.coordinator.id, '试着读取这份未引用的资料');
    assert.equal(unauthorized.tools?.[0].status, 'error');
    assert.match(unauthorized.content, /请重新引用你有权访问的资料/);
    assert.doesNotMatch(unauthorized.tools?.[0].output ?? '', /核对会议资料/);
    f.todo.remove(item.id, item.updatedAt);
    const removed = await read(f.schedule.id, '重新读取那条事项');
    assert.equal(removed.tools?.[0].status, 'error');
    assert.match(removed.content, /找不到这份资料，请重新引用/);
    assert.doesNotMatch(removed.tools?.[0].output ?? '', /核对会议资料/);
  } finally { await f.close(); }
});

for (const purpose of ['work', 'query']) test(`${purpose} results append a new reply after the handoff without exposing internal reports`, async () => {
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const raw = '内部日程快照：事项 ID、dateAt 以及全部原始明细';
  const summary = '查到了，你还有4项待办。';
  let scheduleId = '';
  let coordinatorPrompt = '';
  const f = await fixture(async input => {
    if (input.tools.some((tool: any) => tool.function.name === 'list_tasks')) { await gate; return { content: raw }; }
    coordinatorPrompt ||= input.messages.find((message: { role: string }) => message.role === 'system')?.content ?? '';
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
    assert.match(coordinatorPrompt, /当前本地时间 \d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}，时区 .+，UTC /);
    assert.match(coordinatorPrompt, /查询当前或近期的待办清单、数量或逾期事项时，先取本轮数据/);
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

test('asking which memories exist checks the live list even when the chat contains a deleted entry', async () => {
  const asked = '我现在有什么记忆吗？';
  const oldReply = '有 1 条长期记忆，称呼已经保存。';
  const reminder = '本轮记忆查证';
  let hadOldReply = false, promisedCurrentCount = false;
  const f = await fixture(input => {
    const latest = input.messages.findLastIndex((message: any) => message.role === 'user');
    const result = input.messages.slice(latest + 1).find((message: any) => message.role === 'tool');
    if (result) return { content: `当前可查看的长期记忆有 ${JSON.parse(result.content).total} 条。` };
    const system = JSON.stringify(input.messages.filter((message: any) => ['system', 'developer'].includes(message.role)));
    if (system.includes('可读范围当前共有 1 条记忆')) return { content: oldReply };
    hadOldReply = JSON.stringify(input.messages.slice(0, latest)).includes(oldReply);
    promisedCurrentCount = system.includes('可读范围当前共有 0 条记忆');
    const stateRule = system.indexOf('<mandatory_tool_use>');
    const rule = system.slice(stateRule, system.indexOf('</mandatory_tool_use>'));
    const list = input.tools?.find((tool: any) => tool.function.name === 'list_memories');
    const current = JSON.stringify(input.messages[latest].content);
    const earlierUsers = input.messages.slice(0, latest).filter((message: any) => message.role === 'user');
    const canList = list?.function.description.includes('必须（MUST）先调用本工具')
      && stateRule >= 0 && stateRule < system.indexOf('已授权常用记忆')
      && rule.includes('必须（MUST）先调用 list_memories') && rule.includes('重复提问也必须重新查询')
      && rule.includes('长期记忆的清单只统计当前记忆库里的独立条目')
      && system.includes('查询记忆、核对保存结果或追问工具行为时必须保持只读')
      && system.includes('旧回复说「已保存称呼」，本轮 list_memories 返回 total=0')
      && current.includes(asked) && !current.includes(reminder)
      && earlierUsers.some((message: any) => JSON.stringify(message.content).includes(asked))
      && earlierUsers.every((message: any) => !JSON.stringify(message.content).includes(reminder));
    if (!canList) return { content: oldReply };
    return { tool_calls: [{ index: 0, id: 'verify-current-memory-list', type: 'function', function: {
      name: 'list_memories', arguments: '{}',
    } }] };
  });
  try {
    const { id: botId, mainChatId: chatId } = f.coordinator;
    const former = f.store.saveMemory({ id: randomUUID(), botId, scope: 'private', text: '称呼用户为验收同学。', source: '用户编辑', revision: 0 });
    const initial = await f.host.submit(f.input(botId, asked), f.surface);
    await until(() => f.store.task(initial.task.id).status === 'completed');
    f.store.removeMemory(former.id, former.revision);
    f.store.saveMemory({ id: randomUUID(), botId: f.schedule.id, scope: 'private', text: '其他 Bot 的私人称呼。', source: '用户编辑', revision: 0 });

    const next = await f.host.submit(f.input(botId, asked), f.surface);
    await until(() => f.store.task(next.task.id).status === 'completed');
    const completed = f.store.task(next.task.id);
    const replyId = completed.assistantEntryId;
    const reply = f.ai.chat(chatId).entries.find(entry => entry.id === replyId);
    const lookup = reply?.tools?.find(tool => tool.name === 'list_memories');
    assert.equal(completed.piSessionPath, f.store.task(initial.task.id).piSessionPath);
    assert.ok(completed.piSessionPath);
    assert.ok(!readFileSync(completed.piSessionPath, 'utf8').includes(reminder));
    assert.ok(hadOldReply);
    assert.ok(promisedCurrentCount);
    assert.equal(lookup?.status, 'complete');
    assert.deepEqual(JSON.parse(lookup?.output ?? '{}'), { total: 0, matched: 0, memories: [] });
    assert.equal(reply?.content, '当前可查看的长期记忆有 0 条。');
  } finally { await f.close(); }
});

test('memory recall and prompt omit a recipient’s private memories in a peer query', async () => {
  const received: string[] = [];
  const offeredTools = new Set<string>();
  const f = await fixture(input => {
    const messages = JSON.stringify(input.messages);
    received.push(messages);
    for (const tool of input.tools) offeredTools.add(tool.function.name);
    if (!input.messages.some((message: any) => message.role === 'tool')) return { tool_calls: [{ index: 0, id: 'lookup_memory', type: 'function',
      function: { name: 'search_memory', arguments: '{"query":"汇报约定"}' } }] };
    return { content: '已核对汇报约定' };
  });
  try {
    const privateText = '汇报约定 私人内容标记D31';
    const sharedText = '汇报约定 全局内容标记B52';
    f.store.saveMemory({ id: randomUUID(), botId: f.schedule.id, scope: 'private', text: privateText, revision: 0, source: '用户编辑' });
    f.store.saveMemory({ id: randomUUID(), botId: null, scope: 'shared', text: sharedText, revision: 0, source: '用户编辑' });
    f.host.sendMessage(f.coordinator.id, randomUUID(), f.schedule.id, '核对汇报约定', 'query');
    await until(() => f.store.tasks().some(task => task.kind === 'message' && task.status === 'completed'));
    assert.equal(received.length, 2);
    assert.ok(received.every(request => !request.includes(privateText)));
    assert.ok(received[0].includes(sharedText));
    assert.ok(!offeredTools.has('remember'));
    assert.ok(!offeredTools.has('list_memories'));
  } finally { await f.close(); }
});

test('automatic memory reviews the user’s new message only after the round', async () => {
  const spoken = '今后周报先列出风险，再说当前进度。';
  let reviewRequests = 0;
  const f = await fixture(input => {
    if (!JSON.stringify(input.messages).includes('审查长期记忆')) return { content: '收到。' };
    reviewRequests++;
    const user = input.messages.findLast((message: any) => message.role === 'user');
    const data = JSON.parse(typeof user.content === 'string' ? user.content : user.content[0].text);
    assert.deepEqual(data.messages.map((message: any) => message.text), [spoken]);
    return { content: JSON.stringify({ changes: [{ action: 'add', title: '周报顺序', topic: '写作', text: '周报先列风险，再说进度。',
      evidence: [{ messageId: data.messages[0].messageId, quote: spoken }] }] }) };
  });
  try {
    assert.equal(f.store.memoryEpoch(), '');
    const old = await f.host.submit(f.input(f.coordinator.id, '先前对话的临时请求'), f.surface);
    await until(() => f.store.task(old.task.id).status === 'completed');
    assert.equal(reviewRequests, 0);
    f.host.setAutomaticMemory(true);
    const receipt = await f.host.submit(f.input(f.coordinator.id, spoken), f.surface);
    await until(() => f.store.memories(f.coordinator.id).length === 1);
    assert.equal(f.store.task(receipt.task.id).status, 'completed');
    assert.equal(reviewRequests, 1);
    const [memory] = f.store.memories(f.coordinator.id);
    assert.equal(memory.scope, 'private');
    assert.equal(memory.origin, 'automatic');
    assert.equal(memory.title, '周报顺序');
    assert.equal(memory.topic, '写作');
    assert.equal(memory.sources?.[0].messageId, receipt.messageId);
  } finally { await f.close(); }
});

test('explicit remember checks the user quote and requires authorization to share', async () => {
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    const results = input.messages.slice(lastUser + 1).filter((message: any) => message.role === 'tool');
    if (results.length === 3) {
      assert.match(JSON.stringify(results[0]), /明确要求记住的原话及授权范围/);
      assert.match(JSON.stringify(results[1]), /明确要求记住的原话及授权范围/);
      assert.match(JSON.stringify(results[2]), /saved/);
      return { content: '已经为当前 Bot 保存。' };
    }
    return { tool_calls: [{ index: 0, id: 'remember_' + results.length, type: 'function',
      function: { name: 'remember', arguments: JSON.stringify({ title: '汇报用短句', topic: '汇报', text: '汇报偏好短句。', quote: results.length ? '我偏好短句' : '原话里不存在的内容', scope: results.length === 1 ? 'shared' : 'private' }) } }] };
  });
  try {
    assert.equal(f.store.memoryEpoch(), '');
    const receipt = await f.host.submit(f.input(f.coordinator.id, '请记住，我偏好短句。只给当前 Bot 用，不要让所有 Bot 都知道。'), f.surface);
    await until(() => f.store.task(receipt.task.id).status === 'completed');
    const [memory] = f.store.memories(f.coordinator.id);
    assert.equal(memory.scope, 'private');
    assert.equal(memory.origin, 'explicit');
    assert.equal(memory.retention, 'resident');
    assert.equal(memory.title, '汇报用短句');
    assert.equal(memory.topic, '汇报');
    assert.equal(memory.sources?.[0].messageId, receipt.messageId);
    assert.deepEqual(f.store.memories(f.schedule.id), []);
  } finally { await f.close(); }
});

test('adding memory keeps the original chat and checks the current database before saving or reusing', async () => {
  const previous = '本次说的称呼是验收同学，帮我核对以前的记录';
  const quote = '把刚才的称呼约定记下来';
  const oldReply = '以前的记录显示这个称呼已经保存。';
  const text = '称呼用户为验收同学。';
  const reads: { hasPrevious: boolean; hasOldReply: boolean; total?: number }[] = [];
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    if (JSON.stringify(input.messages[lastUser].content).includes(previous)) return { content: oldReply };
    if (input.messages.slice(lastUser + 1).some((message: any) => message.role === 'tool')) return { content: '记忆已核对。' };

    const history = JSON.stringify(input.messages.slice(0, lastUser));
    const system = JSON.stringify(input.messages.filter((message: any) => ['system', 'developer'].includes(message.role)));
    const total = system.match(/所选范围当前共有 (\d+) 条记忆/)?.[1];
    reads.push({ hasPrevious: history.includes(previous), hasOldReply: history.includes(oldReply), total: total === undefined ? undefined : Number(total) });
    if (total === undefined || !system.includes('本轮的保存回执')) return { content: '这条记忆已经存在，无需保存。' };
    return { tool_calls: [{ index: 0, id: 'current-preference-' + reads.length, type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text, title: '称呼偏好', scope: 'private' }),
    } }] };
  });
  try {
    const { id: botId, mainChatId: chatId } = f.coordinator;
    const former = f.store.saveMemory({ id: randomUUID(), botId, scope: 'private', text, source: '用户编辑', revision: 0 });
    const initial = await f.host.submit(f.input(botId, previous), f.surface);
    await until(() => f.store.task(initial.task.id).status === 'completed');
    const mainSession = f.store.link(chatId)?.pi_session_path;
    assert.ok(mainSession);

    f.store.removeMemory(former.id, former.revision);
    assert.deepEqual(f.store.memories(botId), []);
    const submit = () => f.host.submit({ botId, chatId, expectedDraftRevision: 0, clientRequestId: randomUUID(),
      text: quote, replyToTaskId: null, resources: [], memoryRequest: { scope: 'private' } }, f.surface);

    const first = await submit();
    await until(() => f.store.task(first.task.id).status === 'completed');
    const [saved] = f.store.memories(botId);
    assert.deepEqual(reads, [{ hasPrevious: true, hasOldReply: true, total: 0 }]);
    assert.ok(saved && saved.id !== former.id);
    assert.equal(saved.text, text);
    assert.equal(f.store.task(first.task.id).piSessionPath, mainSession);
    assert.equal(f.store.task(first.task.id).memoryReceipts?.[0].operation, 'added');

    const second = await submit();
    await until(() => f.store.task(second.task.id).status === 'completed');
    assert.deepEqual(reads[1], { hasPrevious: true, hasOldReply: true, total: 1 });
    assert.equal(f.store.task(second.task.id).piSessionPath, mainSession);
    assert.equal(f.store.link(chatId)?.pi_session_path, mainSession);
    assert.equal(f.store.task(second.task.id).memoryReceipts?.[0].operation, 'reused');
    assert.equal(f.store.task(second.task.id).memoryReceipts?.[0].id, saved.id);
    assert.deepEqual(f.store.memories(botId).map(memory => memory.id), [saved.id]);
    assert.deepEqual(f.store.memorySources(botId, saved.id).map(source => source.messageId), [first.messageId, second.messageId]);
  } finally { await f.close(); }
});

test('a memory request queues independently, preserves the draft and compares an old entry', async () => {
  const quote = '以后周报先列风险，再列进度', blocking = '隔离测试中的普通任务';
  let priorId: string, release!: () => void, reviews = 0, blocked = false;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const f = await fixture(async input => {
    if (JSON.stringify(input.messages).includes('审查长期记忆')) { reviews++; return { content: '{"changes":[]}' }; }
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    if (JSON.stringify(input.messages[lastUser].content).includes(blocking)) { blocked = true; await hold; return { content: '原任务完成。' }; }
    const results = input.messages.slice(lastUser + 1).filter((message: any) => message.role === 'tool');
    if (results.length === 2) {
      assert.match(JSON.stringify(results[1]), /"saved"\s*:\s*true|\\"saved\\"/);
      return { content: '已更新周报顺序。' };
    }
    if (results.length === 1) assert.match(JSON.stringify(results[0]), new RegExp(priorId));
    return { tool_calls: [{ index: 0, id: 'compare-memory-' + results.length, type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text: '周报先列风险，再列进度。', title: '周报顺序', topic: '写作',
        scope: 'private', ...(results.length && { replaceId: priorId }) }),
    } }] };
  });
  try {
    const botId = f.coordinator.id, chatId = f.coordinator.mainChatId;
    const active = await f.host.submit(f.input(botId, blocking), f.surface);
    await until(() => blocked && f.store.task(active.task.id).status === 'running');
    const notice = f.host.sendMessage(f.schedule.id, randomUUID(), botId, '待普通对话接收的通知', 'notification');
    f.host.setAutomaticMemory(true);
    const ordinary = f.host.saveDraft(chatId, f.store.draft(chatId).revision, { text: '普通未发送草稿', replyToTaskId: null, resources: [] }, f.surface);
    priorId = f.store.saveMemory({ id: randomUUID(), botId, scope: 'private', text: '周报只列进度。', title: '周报顺序', topic: '写作',
      revision: 0, source: '用户编辑' }).id;
    const request = { botId, chatId, expectedDraftRevision: 0, clientRequestId: randomUUID(), text: quote, replyToTaskId: null, resources: [],
      memoryRequest: { scope: 'private' as const } };
    const receipt = await f.host.submit(request, f.surface);
    assert.equal((await f.host.submit(request, f.surface)).messageId, receipt.messageId);
    assert.equal(f.store.task(receipt.task.id).status, 'queued');
    assert.equal(f.store.task(receipt.task.id).inputRoute, undefined);
    assert.equal(f.store.task(active.task.id).status, 'running');
    release();
    await until(() => f.store.task(receipt.task.id).status === 'completed');
    assert.deepEqual(f.store.draft(chatId), ordinary);
    assert.deepEqual(f.store.memories(botId).map(({ id, text }) => ({ id, text })), [{ id: priorId, text: '周报先列风险，再列进度。' }]);
    const task = f.store.task(receipt.task.id);
    assert.equal(task.memoryReceipts?.[0].id, priorId);
    assert.equal(task.memoryReceipts?.[0].operation, 'updated');
    assert.equal(f.store.memorySources(botId, priorId)[0].messageId, receipt.messageId);
    assert.equal(f.store.nextMemoryReview(new Set()), undefined);
    assert.equal(reviews, 0);
    assert.deepEqual(f.store.notifications(botId).map(message => message.id), [notice.id]);
  } finally { release(); await f.close(); }
});

test('editing through chat updates only the selected memory and refuses stale edits', async () => {
  const originalText = '周报先写进度。每条风险注明负责人。';
  const text = '周报先列风险。每条风险注明负责人。';
  const change = '把周报的先写进度改成先列风险';
  let otherId: string, toolResults: string[] = [];
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    const results = input.messages.slice(lastUser + 1).filter((message: any) => message.role === 'tool');
    if (results.length === 2) {
      toolResults = results.map((item: { content: string }) => item.content);
      return { content: '已更新周报记忆。' };
    }
    assert.ok(input.messages.some((message: any) => message.role === 'system' && message.content.includes(originalText)));
    return { tool_calls: [{ index: 0, id: 'edit-memory-' + results.length, type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text, scope: 'private', ...(results.length === 0 && { replaceId: otherId }) }),
    } }] };
  });
  try {
    const { id: botId, mainChatId: chatId } = f.coordinator;
    const selected = f.store.saveMemory({ id: randomUUID(), botId, scope: 'private', text: originalText, title: '周报顺序', source: '用户编辑', revision: 0 });
    const other = f.store.saveMemory({ id: randomUUID(), botId, scope: 'private', text: '周报每周五发出。', source: '用户编辑', revision: 0 });
    otherId = other.id;
    const request = { botId, chatId, expectedDraftRevision: 0, clientRequestId: randomUUID(), text: change, replyToTaskId: null, resources: [],
      memoryRequest: { scope: 'private' as const, edit: { id: selected.id, revision: selected.revision } } };
    const { task, messageId } = await f.host.submit(request, f.surface);
    await until(() => f.store.task(task.id).status === 'completed');
    assert.match(toolResults[0], /只能更新选中的记忆/);
    assert.equal(JSON.parse(toolResults[1]).operation, 'updated');
    const saved = f.store.memories(botId);
    assert.equal(saved.length, 2);
    assert.equal(saved.find(memory => memory.id === selected.id)?.text, text);
    assert.equal(saved.find(memory => memory.id === selected.id)?.title, '周报顺序');
    assert.equal(saved.find(memory => memory.id === other.id)?.text, other.text);
    assert.equal(f.store.task(task.id).memoryReceipts?.[0].id, selected.id);
    assert.equal(f.store.memorySources(botId, selected.id)[0].messageId, messageId);
    await assert.rejects(async () => f.host.submit({ ...request, clientRequestId: randomUUID() }, f.surface), { code: 'VERSION_CONFLICT' });
  } finally { await f.close(); }
});

test('a named preference uses the Agent tool even when an earlier reply denied memory access', async () => {
  const quote = '以后都叫我林sir';
  const request = `帮我加到你的记忆里面，${quote}`;
  const correction = '算了，还是叫我林少';
  const prompts: string[] = [];
  let writes = 0;
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    const spoken = JSON.stringify(input.messages[lastUser].content);
    prompts.push(JSON.stringify(input.messages.filter((message: any) => ['system', 'developer'].includes(message.role))));
    if (spoken.includes('这是示例')) return { content: '我只有查询记忆的工具。' };
    if (!spoken.includes(quote) && !spoken.includes(correction)) return { content: '我记得你的称呼。' };
    assert.ok(input.tools.some((tool: any) => tool.function.name === 'remember'));
    assert.match(JSON.stringify(input.messages.slice(0, lastUser)), /我只有查询记忆的工具/);
    const results = input.messages.slice(lastUser + 1).filter((message: any) => message.role === 'tool');
    const result = results.length ? JSON.parse(results.at(-1).content) : undefined;
    const updating = spoken.includes(correction);
    const name = updating ? '林少' : '林sir';
    if (result?.saved === true) { writes++; return { content: `记住了，以后叫你「${name}」。` }; }
    return { tool_calls: [{ index: 0, id: 'name-memory-' + results.length, type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text: `称呼用户为${name}。`, quote: updating ? correction : quote, scope: 'private',
        ...(result?.compare?.length && { replaceId: result.compare[0].id }) }),
    } }] };
  });
  try {
    assert.equal(f.store.memoryEpoch(), '');
    const submit = async (text: string) => {
      const receipt = await f.host.submit(f.input(f.coordinator.id, text), f.surface);
      await until(() => f.store.task(receipt.task.id).status === 'completed');
      return receipt;
    };
    await submit(`这是示例「${request}」。`);
    assert.deepEqual(f.store.memories(f.coordinator.id), []);

    const receipt = await submit(request + '\n\n');
    assert.equal(writes, 1);
    const [memory] = f.store.memories(f.coordinator.id);
    assert.equal(memory.text, '称呼用户为林sir。');
    assert.equal(memory.title, '称呼偏好');
    assert.equal(memory.topic, '称呼');
    assert.equal(memory.scope, 'private');
    assert.equal(memory.origin, 'explicit');
    assert.equal(memory.retention, 'resident');
    assert.deepEqual(f.store.memorySources(f.coordinator.id, memory.id).map(({ messageId, quote }) => ({ messageId, quote })), [{ messageId: receipt.messageId, quote }]);
    assert.deepEqual(f.store.memories(f.schedule.id), []);
    assert.deepEqual(f.store.all('bot_artifacts'), []);
    const replyId = f.store.task(receipt.task.id).assistantEntryId;
    assert.equal(f.ai.chat(receipt.task.chatId).entries.find(entry => entry.id === replyId)?.content, '记住了，以后叫你「林sir」。');

    const changed = await submit(correction);
    assert.equal(writes, 2);
    const updated = f.store.memories(f.coordinator.id);
    assert.equal(updated.length, 1);
    assert.equal(updated[0].id, memory.id);
    assert.equal(updated[0].revision, memory.revision + 1);
    assert.equal(updated[0].text, '称呼用户为林少。');
    assert.deepEqual(f.store.memorySources(f.coordinator.id, memory.id).map(({ messageId, quote }) => ({ messageId, quote })), [{ messageId: changed.messageId, quote: correction }]);
    assert.equal(f.store.task(changed.task.id).result, '记住了，以后叫你「林少」。');

    await submit('你记住了我的称呼吗？');
    assert.match(prompts.at(-1)!, /称呼用户为林少/);
    assert.doesNotMatch(prompts.at(-1)!, /称呼用户为林sir/);
  } finally { await f.close(); }
});

test('a conversation clarifies a shared memory and records both sources without model quotes', async () => {
  const asking = '以后生成的周报用短句', answer = '我说的是项目周报，就存刚才那条';
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    const spoken = JSON.stringify(input.messages[lastUser].content);
    if (spoken.includes(asking)) return { content: '你指的是运营周报还是项目周报？' };
    if (input.messages.slice(lastUser + 1).some((message: any) => message.role === 'tool')) return { content: '已保存全局约定。' };
    const remember = input.tools.find((tool: any) => tool.function.name === 'remember')?.function;
    assert.ok(remember);
    assert.ok(!('quote' in remember.parameters.properties));
    assert.match(JSON.stringify(input.messages.filter((message: any) => ['system', 'developer'].includes(message.role))), new RegExp(asking));
    return { tool_calls: [{ index: 0, id: 'clarified-memory', type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text: '项目周报使用短句。', title: '周报表达', topic: '写作', scope: 'shared' }),
    } }] };
  });
  try {
    const botId = f.coordinator.id, chatId = f.coordinator.mainChatId;
    const submit = (text: string, clarifies?: string) => f.host.submit({ botId, chatId, expectedDraftRevision: 0,
      clientRequestId: randomUUID(), replyToTaskId: null, resources: [], text, memoryRequest: { scope: 'shared', ...(clarifies && { clarifies }) } }, f.surface);
    const first = await submit(asking);
    await until(() => f.store.task(first.task.id).status === 'completed');
    assert.deepEqual(f.store.memories(botId), []);
    const second = await submit(answer, first.task.id);
    await until(() => f.store.task(second.task.id).status === 'completed');
    const [saved] = f.store.memories(f.schedule.id);
    assert.equal(saved.scope, 'shared');
    assert.deepEqual(f.store.memorySources(botId, saved.id), [
      { chatId, messageId: first.messageId, quote: asking },
      { chatId, messageId: second.messageId, quote: answer },
    ]);
  } finally { await f.close(); }
});

test('remember updates a visible record by ID and rejects a different Bot’s private ID', async () => {
  const quote = '把原来的周报约定改为先列风险，再说进度。';
  let originalId: string, otherId: string;
  const f = await fixture(input => {
    const results = input.messages.filter((message: any) => message.role === 'tool');
    if (results.length === 2) {
      assert.match(JSON.stringify(results[0]), /请先读取要更正的原记忆/);
      assert.match(JSON.stringify(results[1]), /saved/);
      return { content: '已更新周报约定。' };
    }
    return { tool_calls: [{ index: 0, id: 'correct_memory_' + results.length, type: 'function', function: {
      name: 'remember', arguments: JSON.stringify({ text: '周报先列风险，再说进度。', quote, scope: 'private', replaceId: results.length ? originalId : otherId }),
    } }] };
  });
  try {
    const original = f.store.saveMemory({ id: randomUUID(), botId: f.coordinator.id, scope: 'private', text: '周报只列进度。', revision: 0, source: '用户编辑' });
    const other = f.store.saveMemory({ id: randomUUID(), botId: f.schedule.id, scope: 'private', text: '每周整理会议记录。', revision: 0, source: '用户编辑' });
    originalId = original.id; otherId = other.id;
    const receipt = await f.host.submit(f.input(f.coordinator.id, quote), f.surface);
    await until(() => f.store.task(receipt.task.id).status === 'completed');
    const items = f.store.memories(f.coordinator.id);
    assert.equal(items.length, 1);
    assert.equal(items[0].id, original.id);
    assert.equal(items[0].text, '周报先列风险，再说进度。');
    assert.equal(f.store.memorySources(f.coordinator.id, original.id)[0].messageId, receipt.messageId);
    assert.deepEqual(f.store.memories(f.schedule.id), [other]);
  } finally { await f.close(); }
});

test('the Agent decides whether to remember without requiring trigger words', async () => {
  const quote = '以后都叫我钟sir';
  const previousRefusal = '我只有查询记忆的工具，长期记忆由用户在设置里人工添加。';
  let canRemember = false;
  let sawPreviousRefusal = false;
  let followsCurrentTools = false;
  const f = await fixture(input => {
    const lastUser = input.messages.findLastIndex((message: any) => message.role === 'user');
    if (input.messages.slice(lastUser + 1).some((message: any) => message.role === 'tool')) return { content: '已保存。' };
    canRemember = input.tools.some((tool: any) => tool.function.name === 'remember');
    if (!JSON.stringify(input.messages[lastUser].content).includes(quote)) return { content: previousRefusal };
    sawPreviousRefusal = JSON.stringify(input.messages.slice(0, lastUser)).includes(previousRefusal);
    followsCurrentTools = input.messages.some((message: any) => ['system', 'developer'].includes(message.role) &&
      JSON.stringify(message.content).includes('当前回合的工具列表为准'));
    if (!canRemember) return { content: previousRefusal };
    return { tool_calls: [{ index: 0, id: 'preferred_address', type: 'function',
      function: { name: 'remember', arguments: JSON.stringify({ text: '称呼用户为钟sir。', quote, scope: 'private' }) } }] };
  });
  try {
    assert.equal(f.store.memoryEpoch(), '');
    const ordinary = await f.host.submit(f.input(f.coordinator.id, '长期记忆能怎么管理？'), f.surface);
    await until(() => f.store.task(ordinary.task.id).status === 'completed');
    assert.equal(canRemember, true);
    assert.deepEqual(f.store.memories(f.coordinator.id), []);

    const receipt = await f.host.submit(f.input(f.coordinator.id, quote + '，把这当作我们以后的称呼约定。'), f.surface);
    await until(() => f.store.task(receipt.task.id).status === 'completed');
    assert.equal(canRemember, true);
    assert.equal(sawPreviousRefusal, true);
    assert.equal(followsCurrentTools, true);
    const [memory] = f.store.memories(f.coordinator.id);
    assert.equal(memory.text, '称呼用户为钟sir。');
    assert.equal(memory.scope, 'private');
    assert.equal(memory.origin, 'explicit');
    assert.equal(memory.sources?.[0].messageId, receipt.messageId);
    assert.deepEqual(f.store.memories(f.schedule.id), []);
  } finally { await f.close(); }
});

test('switching work keeps the forwarded memory request and its original message ID', async () => {
  const forwarded = '记住以后周报先列风险。\n只给当前 Bot 用。';
  const original = '先暂停当前任务，' + forwarded;
  const quote = '以后周报先列风险';
  let foreground: { text: string; canRemember: boolean } | undefined;
  let reviewed: { messageId: string; text: string }[] | undefined;
  const f = await fixture(input => {
    const user = input.messages.findLast((message: any) => message.role === 'user');
    const text = typeof user.content === 'string' ? user.content : user.content[0].text;
    if (JSON.stringify(input.messages).includes('审查长期记忆')) {
      const { messages } = JSON.parse(text);
      reviewed = messages;
      return { content: JSON.stringify({ changes: [{ action: 'add', text: '周报先列风险。',
        evidence: [{ messageId: messages[0].messageId, quote }] }] }) };
    }
    foreground = { text, canRemember: input.tools.some((tool: any) => tool.function.name === 'remember') };
    return { content: '收到。' };
  });
  try {
    const previous = f.store.submit(f.input(f.coordinator.id, '整理会前材料'), () => {}).task;
    f.store.updateTask(previous.id, { status: 'waiting_user' });
    f.host.setAutomaticMemory(true);
    const switched = await f.host.submit(f.input(f.coordinator.id, original), f.surface);
    await until(() => f.store.memories(f.coordinator.id).length === 1);
    assert.equal(f.store.task(previous.id).status, 'interrupted');
    assert.deepEqual(foreground, { text: forwarded, canRemember: true });
    assert.deepEqual(reviewed, [{ messageId: switched.messageId, text: forwarded }]);
    const [memory] = f.store.memories(f.coordinator.id);
    assert.equal(memory.sources?.[0].messageId, switched.messageId);
    assert.equal(f.store.memorySources(f.coordinator.id, memory.id)[0].quote, quote);
    assert.equal(f.ai.chat(f.coordinator.mainChatId).entries.find(entry => entry.id === switched.messageId)?.content, original);
  } finally { await f.close(); }
});

for (const warm of [false, true]) test('selected items and plain follow-ups share the main Agent context' + (warm ? ' after earlier chat' : ' from the first turn'), async () => {
  const requests: any[] = [];
  const selectedReply = '已核对选中的建模事项，当前完成期限是十二月十五日。';
  const followup = '这条改到周五完成';
  const f = await fixture(input => {
    requests.push(input);
    return { content: JSON.stringify(input.messages.findLast((message: any) => message.role === 'user')).includes(followup)
      ? '继续修改刚才选中的建模事项。' : selectedReply };
  });
  try {
    const bot = f.schedule;
    const item = f.todo.create({ ...newTask('连续聊天的建模事项'), dateAt: '2026-12-15' });
    if (warm) {
      const earlier = f.host.submit(f.input(bot.id, '先聊一下今天的安排'), f.surface);
      await until(() => f.store.task(earlier.task.id).status === 'completed');
    }
    const resources = [{ kind: 'todo' as const, id: item.id, label: item.title }];
    const input = f.input(bot.id, '查看我选中的这条建模事项');
    const draft = f.host.saveDraft(bot.mainChatId, input.expectedDraftRevision, { text: input.text, replyToTaskId: null, resources }, f.surface);
    const selected = f.host.submit({ ...input, resources, expectedDraftRevision: draft.revision }, f.surface);
    await until(() => f.store.task(selected.task.id).status === 'completed');
    const mainSession = f.store.link(bot.mainChatId)?.pi_session_path;
    assert.ok(mainSession);
    assert.equal(f.store.task(selected.task.id).kind, 'chat');
    assert.equal(f.store.task(selected.task.id).piSessionPath, mainSession);

    const next = f.host.submit(f.input(bot.id, followup), f.surface);
    await until(() => f.store.task(next.task.id).status === 'completed');
    const turns = requests.at(-1).messages.filter((message: any) => ['user', 'assistant'].includes(message.role));
    const transcript = JSON.stringify(turns);
    assert.match(transcript, /查看我选中的这条建模事项/);
    assert.ok(transcript.includes(item.id), 'the earlier selected ID stays attached to its message');
    assert.ok(transcript.includes(selectedReply));
    assert.match(transcript, /这条改到周五完成/);
    assert.equal(f.store.task(next.task.id).piSessionPath, mainSession);
    assert.equal(next.task.chatId, selected.task.chatId);
    assert.equal(f.store.link(bot.mainChatId)?.pi_session_path, mainSession);
    const plain = f.host.submit(f.input(bot.id, '继续核对上面的日期'), f.surface);
    await until(() => f.store.task(plain.task.id).status === 'completed');
    const later = requests.at(-1).messages.filter((message: any) => ['user', 'assistant'].includes(message.role));
    assert.equal(later.filter((message: any) => JSON.stringify(message.content).includes('查看我选中的这条建模事项')).length, 1);
    assert.equal(later.filter((message: any) => JSON.stringify(message.content).includes(followup)).length, 1);
  } finally { await f.close(); }
});

test('an existing main Agent context imports a completed legacy work reply once', async () => {
  const requests: any[] = [];
  const legacyQuestion = '旧版选中建模事项后问的那一句';
  const legacyReply = '旧版留下的建模答复，需要让普通追问接上。';
  const f = await fixture(input => { requests.push(input); return { content: '继续原对话。' }; });
  try {
    const bot = f.schedule;
    const first = f.host.submit(f.input(bot.id, '已有主聊天的开场'), f.surface);
    await until(() => f.store.task(first.task.id).status === 'completed');
    const previousSession = f.store.link(bot.mainChatId)?.pi_session_path;
    assert.ok(previousSession);
    const directory = dirname(previousSession);
    const legacy = SessionManager.create(directory, directory);
    for (const entry of SessionManager.open(previousSession, directory).getBranch()) {
      if (entry.type === 'message') legacy.appendMessage(entry.message);
    }
    const mainSession = legacy.getSessionFile()!;
    f.store.bindMainSession(bot.mainChatId, mainSession);
    const item = f.todo.create(newTask('旧版连续聊天建模事项'));
    const id = randomUUID(), sourceMessageId = randomUUID(), assistantEntryId = randomUUID();
    const chat = f.ai.chat(bot.mainChatId);
    const createdAt = new Date().toISOString();
    const resources = [{ kind: 'todo' as const, id: item.id, label: item.title }];
    chat.entries.push({ id: sourceMessageId, role: 'user', content: legacyQuestion, createdAt, resourceRefs: resources },
      { id: assistantEntryId, role: 'assistant', content: legacyReply, createdAt });
    f.ai.saveChat(chat);
    f.store.insertTask({ id, botId: bot.id, chatId: bot.mainChatId, rootTaskId: id, sourceMessageId, assistantEntryId,
      kind: 'work', status: 'completed', title: legacyQuestion, input: legacyQuestion, resources, context: {},
      operationIds: [], dependencyIds: [], revision: 0, createdAt, updatedAt: createdAt });
    for (const text of ['这条到期时间呢？', '继续沿着刚才的内容说']) {
      const sent = f.host.submit(f.input(bot.id, text), f.surface);
      await until(() => f.store.task(sent.task.id).status === 'completed');
      const messages = requests.at(-1).messages.filter((message: any) => ['user', 'assistant'].includes(message.role));
      assert.equal(messages.filter((message: any) => JSON.stringify(message.content).includes('已有主聊天的开场')).length, 1);
      assert.equal(messages.filter((message: any) => JSON.stringify(message.content).includes(legacyQuestion)).length, 1);
      assert.equal(messages.filter((message: any) => JSON.stringify(message.content).includes(legacyReply)).length, 1);
      assert.ok(JSON.stringify(messages).includes(item.id));
      assert.equal(f.store.task(sent.task.id).piSessionPath, mainSession);
    }
  } finally { await f.close(); }
});

test('a plain follow-up can read a previously selected item only in that Bot main chat', async () => {
  let itemId = '';
  const f = await fixture(input => {
    const latest = input.messages.findLastIndex((message: any) => message.role === 'user');
    const current = JSON.stringify(input.messages[latest].content);
    if (current.includes('先保留这条引用')) return { content: '这条已在当前对话中引用。' };
    const result = input.messages.slice(latest + 1).find((message: any) => message.role === 'tool');
    return result ? { content: '已按实际读取结果回复。' } : { tool_calls: [{ index: 0, id: randomUUID(), type: 'function',
      function: { name: 'read_resource', arguments: JSON.stringify({ kind: 'todo', id: itemId }) } }] };
  });
  try {
    const item = f.todo.create({ ...newTask('主对话连续引用事项'), dateAt: '2026-12-15' });
    itemId = item.id;
    const resources = [{ kind: 'todo' as const, id: item.id, label: item.title }];
    const input = f.input(f.coordinator.id, '先保留这条引用，后面再问');
    const draft = f.host.saveDraft(input.chatId, input.expectedDraftRevision, { text: input.text, replyToTaskId: null, resources }, f.surface);
    const first = f.host.submit({ ...input, resources, expectedDraftRevision: draft.revision }, f.surface);
    await until(() => f.store.task(first.task.id).status === 'completed');
    const next = f.host.submit(f.input(f.coordinator.id, '这条的完成期限呢？'), f.surface);
    await until(() => f.store.task(next.task.id).status === 'completed');
    const replyId = f.store.task(next.task.id).assistantEntryId;
    const reply = f.ai.chat(input.chatId).entries.find(entry => entry.id === replyId)!;
    assert.equal(reply.tools?.[0].status, 'complete');
    assert.match(reply.tools?.[0].output ?? '', /2026-12-15/);
    const message = f.host.sendMessage(f.coordinator.id, randomUUID(), f.schedule.id, '核对这条事项', 'notification', resources, next.task.id);
    assert.deepEqual(message.references, resources);
    const peer = f.host.sendMessage(f.schedule.id, randomUUID(), f.coordinator.id, '只读查询一份没有转交的资料', 'query');
    await until(() => f.store.tasks().some(task => task.kind === 'message' && task.sourceMessageId === peer.id && task.status === 'completed'));
    const query = f.store.tasks().find(task => task.kind === 'message' && task.sourceMessageId === peer.id)!;
    const queryReply = f.ai.chat(query.chatId).entries.find(entry => entry.id === query.assistantEntryId)!;
    assert.equal(queryReply.tools?.[0].status, 'error');
    assert.doesNotMatch(queryReply.tools?.[0].output ?? '', /主对话连续引用事项|2026-12-15/);
  } finally { await f.close(); }
});
