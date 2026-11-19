import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotRuntime } from '../electron/bot-runtime';
import { buildTodoContribution, planFromReply, taskSnapshot, TODO_TIME_RULES } from '../modules/todo/ai-tools';
import { Store } from '../modules/todo/store';
import { newTask } from '../shared/todo-contracts';

const deadline = { dateAt: '2099-12-15T23:59:00+08:00' };

test('AI can propose a deadline-only todo without an end time; meeting creation still requires a time range', async () => {
  const contribution = buildTodoContribution([], []);
  const create = contribution.buildTools().find(tool => tool.name === 'propose_create')!;
  await create.execute('deadline-only', { title: '回归待办', ...deadline });
  const actions = contribution.collect();
  assert.equal(actions.length, 1);
  assert.equal(actions[0].type, 'create');
  if (actions[0].type !== 'create') throw new Error('Expected a create proposal');
  assert.equal(actions[0].task.kind, 'task');
  assert.equal(actions[0].task.endAt, null);
  assert.equal(actions[0].task.dateAt, deadline.dateAt);
  assert.equal(actions[0].task.remindAt, null, 'A deadline alone must not enable reminders');
  assert.doesNotThrow(() => planFromReply('截止时间已记录为建议', actions, new Set()));
  assert.throws(() => planFromReply('改为日程', [{ type: 'create', task: { ...actions[0].task, kind: 'meeting' } }], new Set()));
});

for (const seedKey of ['schedule', 'coordinator'] as const) {
  test(`${seedKey} receives the same todo time rules in actual provider requests without adding writes or questions`, { timeout: 20000 }, async () => {
    const directory = mkdtempSync(join(tmpdir(), 'ono-todo-time-rules-'));
    const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory), todo = new Store(join(directory, 'tasks.db'));
    const bot = store.cards().find(bot => bot.seedKey === seedKey)!;
    store.updateProfile(bot.id, bot.revision, { ...store.profile(bot.id), modelId: 'fixture' });
    const item = todo.create({ ...newTask('回归待办'), ...deadline, note: '旧备注：2026-10-01 前完成' });
    const before = todo.all();
    const requests: { messages: { role: string; content?: string }[]; tools: { function: { name: string; parameters: any } }[] }[] = [];
    const server = createServer(async (req, res) => {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw); requests.push(input);
      const lookup = seedKey === 'schedule' && !input.messages.some((message: { role: string }) => message.role === 'tool');
      const delta = lookup
        ? { tool_calls: [{ index: 0, id: 'lookup-todos', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] }
        : { content: '待办截止时间已设置，结束时间可留空。' };
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      for (const [value, finish_reason] of [[delta, null], [{}, lookup ? 'tool_calls' : 'stop']]) {
        res.write(`data: ${JSON.stringify({ id: 'time-rules-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta: value, finish_reason }] })}\n\n`);
      }
      res.end('data: [DONE]\n\n');
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const runtime = new BotRuntime(store, todo, undefined as never, undefined as never, undefined as never, {
      connection: () => ({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixture', protocol: 'openai-chat', key: '' }), changed() {},
    });
    const host = new BotHost(store, runtime);
    try {
      const surface = { id: 'todo-time-rules', kind: 'main' as const }, text = '核对已设截止日期的待办，结束时间留空，不改成日程。';
      const draft = host.saveDraft(bot.mainChatId, 0, { text, replyToTaskId: null, resources: [] }, surface);
      const { task } = host.submit({ botId: bot.id, chatId: bot.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text, replyToTaskId: null, resources: [] }, surface);
      const timeout = Date.now() + 15000;
      while (['queued', 'running'].includes(store.task(task.id).status) && Date.now() < timeout) await new Promise(resolve => setTimeout(resolve, 10));
      assert.equal(store.task(task.id).status, 'completed', store.task(task.id).reason);
      assert.equal(requests.length, seedKey === 'schedule' ? 2 : 1);
      for (const request of requests) {
        const system = request.messages.filter(message => message.role === 'system').map(message => message.content).join('\n');
        assert.ok(system.includes(TODO_TIME_RULES), 'The active provider must receive the business rules, including the coordinator');
        assert.equal(system.split(TODO_TIME_RULES).length, 2, 'Rules should not be duplicated in a schedule prompt');
      }
      if (seedKey === 'schedule') {
        const lookup = requests[1].messages.find(message => message.role === 'tool')!;
        assert.deepEqual(JSON.parse(lookup.content!).tasks, taskSnapshot([item], []).context, 'Null end time and old notes remain read-only source data');
        const create = requests[0].tools.find(tool => tool.function.name === 'propose_create')!;
        assert.match(create.function.parameters.properties.endAt.description, /待办可为空或不提供/);
      } else {
        assert.equal(requests[0].tools.some(tool => tool.function.name === 'list_tasks' || tool.function.name === 'propose_update'), false, 'Rules must not grant the coordinator new data access or write tools');
      }
      assert.deepEqual(store.actions(task.id), []);
      assert.deepEqual(todo.all(), before);
    } finally {
      await host.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
      todo.db.close(); ai.close();
      assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(directory.includes('ono-todo-time-rules-'));
      rmSync(directory, { recursive: true, force: true });
    }
  });
}
