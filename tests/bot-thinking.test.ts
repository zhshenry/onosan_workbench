import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'node:http';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { BotHost } from '../electron/bot-host';
import { BotRuntime } from '../electron/bot-runtime';
import { Store } from '../modules/todo/store';
import type { ChatEntry, ChatSession } from '../shared/todo-contracts';

async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 1500; attempt++) { if (check()) return; await new Promise(resolve => setTimeout(resolve, 5)); }
  throw new Error('Bot thinking state timed out');
}

for (const cancel of [false, true]) test(`Bot 思考耗时${cancel ? '取消时结算' : '跨工具阶段累计并持久化'}，流式快照保留已计时部分`, { timeout: 20000 }, async t => {
  const directory = mkdtempSync(join(tmpdir(), 'ono-bot-thinking-'));
  let ai = new AiStore(directory, { recover: false });
  const store = new BotStore(ai, directory), todo = new Store(join(directory, 'tasks.db'));
  const bot = store.cards().find(bot => bot.seedKey === 'coordinator')!;
  store.updateProfile(bot.id, bot.revision, { ...store.profile(bot.id), modelId: 'fixture' });
  let clock = 1000, requests = 0, serverError: unknown, snapshot: ChatEntry | undefined;
  t.mock.method(Date, 'now', () => clock);
  const entry = () => ai.chat(bot.mainChatId).entries.find(item => item.role === 'assistant');
  let host: BotHost;
  const server = createServer((req, res) => {
    void (async () => {
      for await (const _chunk of req) { /* consume this local fixture request */ }
      const first = ++requests === 1;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const chunk = (delta: object, finish_reason: string | null = null) => res.write(`data: ${JSON.stringify({ id: 'thinking-fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      if (first) {
        chunk({ reasoning_content: '第一段思考' });
        await until(() => entry()?.thinkingActive === true);
        clock = 2400; chunk({ reasoning_content: '继续分析' });
        await until(() => entry()?.thinking?.endsWith('继续分析') === true);
        snapshot = entry();
        clock = 3500;
        if (cancel) { const task = store.tasks(bot.id)[0]; host.cancelTask(task.id, task.revision); return; }
        chunk({ tool_calls: [{ index: 0, id: 'lookup', type: 'function', function: { name: 'list_bots', arguments: '{}' } }] });
        chunk({}, 'tool_calls');
      } else {
        clock = 61000; chunk({ reasoning_content: '第二段思考' });
        await until(() => entry()?.thinkingActive === true && entry()?.thinking?.endsWith('第二段思考') === true);
        clock = 63500; chunk({ content: '已完成' });
        await until(() => entry()?.thinkingActive === false && entry()?.content === '已完成');
        clock = 90000; chunk({ content: '，请查看结果。' }); chunk({}, 'stop');
      }
      res.end('data: [DONE]\n\n');
    })().catch(cause => { serverError = cause; res.destroy(); });
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const runtime = new BotRuntime(store, todo, undefined as never, undefined as never, undefined as never, {
    connection: () => ({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixture', protocol: 'openai-chat', key: '' }),
    changed: (channel, value) => { if (channel === 'ai:chat' && (value as ChatSession).entries.some(item => item.tools?.some(tool => tool.status === 'running'))) clock = 60000; },
  });
  host = new BotHost(store, runtime);
  const activities: string[] = [];
  host.on('changed', event => { if (event.kind === 'activity') activities.push(store.cards().find(item => item.id === bot.id)!.activity!); });
  try {
    const surface = { id: 'thinking-test', kind: 'main' as const }, text = '核对思考耗时';
    const draft = host.saveDraft(bot.mainChatId, 0, { text, replyToTaskId: null, resources: [] }, surface);
    const { task } = host.submit({ botId: bot.id, chatId: bot.mainChatId, expectedDraftRevision: draft.revision, clientRequestId: randomUUID(), text, replyToTaskId: null, resources: [] }, surface);
    await until(() => entry()?.streaming === false && store.task(task.id).status !== 'running');
    assert.equal(serverError, undefined);
    assert.equal(snapshot?.thinkingMs, 1400, '保存快照应记录当前已耗时，而不是始终为零');
    assert.equal(snapshot?.thinkingStartedAt, 2400);
    assert.equal(entry()?.thinkingMs, cancel ? 2500 : 5000);
    assert.equal(entry()?.thinkingStartedAt, undefined);
    assert.equal(entry()?.thinkingActive, false);
    assert.ok(Number.isFinite(Date.parse(entry()!.createdAt!)), '每条 Bot 回复应记录真实的创建时间');
    assert.equal(entry()?.createdAt, snapshot?.createdAt, '流式更新和结束不能改变回复时间');
    assert.equal(store.task(task.id).status, cancel ? 'cancelled' : 'completed');
    assert.ok(activities.includes('thinking'));
    if (!cancel) {
      assert.ok(activities.includes('searching'), 'real list_bots tool event must reach the roster');
      assert.ok(activities.includes('replying'), 'streamed text must exit the thinking expression');
      assert.ok(activities.indexOf('searching') < activities.indexOf('replying'));
    }
    assert.equal(store.cards().find(item => item.id === bot.id)!.activity, 'idle');
    await host.stop(); ai.close(); ai = new AiStore(directory);
    assert.equal(entry()?.thinkingMs, cancel ? 2500 : 5000, '重开仍显示同一累计耗时');
    assert.equal(entry()?.createdAt, snapshot?.createdAt, '重开后仍保留原回复时间');
  } finally {
    await host.stop(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    todo.db.close(); ai.close();
    assert.equal(dirname(resolve(directory)), resolve(tmpdir())); assert.ok(directory.includes('ono-bot-thinking-'));
    rmSync(directory, { recursive: true, force: true });
  }
});
