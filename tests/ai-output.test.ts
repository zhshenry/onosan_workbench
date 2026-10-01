import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assistantThinking, runAgentLoop } from '../electron/ai-core';
import { AiStore } from '../electron/ai-store';
import { buildTodoContribution } from '../modules/todo/ai-tools';
import type { AIToolEvent } from '../shared/todo-contracts';

test('只提取助手可见思考，不包含签名、遮蔽内容、正文或工具输入', () => {
  const content = [
    { type: 'thinking', thinking: '先检查任务', thinkingSignature: 'opaque-signature' },
    { type: 'thinking', thinking: 'redacted-secret', redacted: true, thinkingSignature: 'encrypted' },
    { type: 'text', text: '最终正文' },
    { type: 'toolCall', arguments: { thinking: '工具输入' } },
    { type: 'thinking', thinking: '再整理结果' },
  ];
  assert.equal(assistantThinking({ role: 'assistant', content }), '先检查任务\n\n再整理结果');
  assert.equal(assistantThinking({ role: 'user', content }), '');
  assert.equal(assistantThinking({ role: 'assistant', content: '普通回复' }), '');
});

test('真实流式适配保留工具前后思考，分离正文，完成后结束思考状态', async () => {
  let requests = 0;
  const server = createServer(async (request, response) => {
    for await (const _chunk of request) { /* consume request */ }
    requests++;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'qa', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' });
    if (requests === 1) {
      chunk({ reasoning_content: '先查询任务。' });
      chunk({ tool_calls: [{ index: 0, id: 'lookup-1', type: 'function', function: { name: 'list_tasks', arguments: '{}' } }] });
      chunk({}, 'tool_calls');
    } else {
      chunk({ reasoning_content: '已取得结果。', reasoning: '已取得结果。' });
      chunk({ content: '## 今日安排\n\n**暂无待办**。' });
      chunk({}, 'stop');
    }
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const thoughts: { text: string; active: boolean }[] = [];
  const tools: AIToolEvent[] = [];
  const texts: string[] = [];
  try {
    const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'qa-model', protocol: 'openai-chat', key: 'local-test' },
      '看看今日待办', [], AbortSignal.timeout(15000), buildTodoContribution([], []), text => texts.push(text), tool => tools.push(tool), (text, active) => thoughts.push({ text, active }));
    assert.equal(requests, 2);
    assert.equal(result.reply, '## 今日安排\n\n**暂无待办**。');
    assert.equal(texts.at(-1), result.reply);
    assert.ok(thoughts.some(item => item.active));
    assert.deepEqual(thoughts.at(-1), { text: '先查询任务。\n\n已取得结果。', active: false });
    assert.deepEqual(tools.map(tool => tool.status), ['running', 'complete']);
    assert.match(tools.at(-1)!.output, /tasks/);
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('重启恢复保留正文和思考，标记中断，旧会话仍可读取', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-output-'));
  let store = new AiStore(dir);
  try {
    const chat = store.newChat();
    chat.entries = [
      { id: 'legacy', role: 'assistant', content: '旧消息' },
      { id: 'question', role: 'user', content: '查看任务' },
      { id: 'reply', role: 'assistant', content: '**部分正文**', thinking: '已收到的思考', thinkingActive: true, streaming: true,
        tools: [{ id: 'tool', name: 'list_tasks', label: '查询事项', status: 'running', output: '部分结果' }] },
    ];
    store.saveChat(chat);
    store.close();
    store = new AiStore(dir);
    const recovered = store.chat(chat.id);
    assert.equal(recovered.entries[0].thinking, undefined);
    assert.equal(recovered.entries[2].content, '**部分正文**');
    assert.equal(recovered.entries[2].thinking, '已收到的思考');
    assert.equal(recovered.entries[2].thinkingActive, false);
    assert.equal(recovered.entries[2].streaming, false);
    assert.equal(recovered.entries[2].tools?.[0].status, 'interrupted');
    assert.equal(recovered.draft, '查看任务');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

for (const protocol of ['anthropic', 'openai-responses'] as const) {
  test(`${protocol} 流式返回可见思考，签名和加密内容不进入展示数据`, async () => {
    const thinking = '先核对输入，再给出结论。';
    const answer = '**结论**：已完成核对。';
    const server = createServer(async (request, response) => {
      for await (const _chunk of request) { /* consume request */ }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const event = (type: string, fields: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
      if (protocol === 'anthropic') {
        event('message_start', { message: { id: 'msg-1', type: 'message', role: 'assistant', model: 'qa-model', content: [], usage: { input_tokens: 1, output_tokens: 0 } } });
        event('content_block_start', { index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
        event('content_block_delta', { index: 0, delta: { type: 'thinking_delta', thinking } });
        event('content_block_delta', { index: 0, delta: { type: 'signature_delta', signature: 'opaque-signature' } });
        event('content_block_stop', { index: 0 });
        event('content_block_start', { index: 1, content_block: { type: 'redacted_thinking', data: 'encrypted-secret' } });
        event('content_block_stop', { index: 1 });
        event('content_block_start', { index: 2, content_block: { type: 'text', text: '' } });
        event('content_block_delta', { index: 2, delta: { type: 'text_delta', text: answer } });
        event('content_block_stop', { index: 2 });
        event('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 20 } });
        event('message_stop', {});
      } else {
        const reasoning = { id: 'reasoning-1', type: 'reasoning', summary: [{ type: 'summary_text', text: thinking }], encrypted_content: 'encrypted-secret' };
        const message = { id: 'msg-1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: answer, annotations: [] }] };
        event('response.created', { response: { id: 'response-1' } });
        event('response.output_item.added', { output_index: 0, item: { id: reasoning.id, type: 'reasoning', summary: [] } });
        event('response.reasoning_summary_text.delta', { output_index: 0, delta: thinking });
        event('response.output_item.done', { output_index: 0, item: reasoning });
        event('response.output_item.added', { output_index: 1, item: { ...message, content: [] } });
        event('response.output_text.delta', { output_index: 1, delta: answer });
        event('response.output_item.done', { output_index: 1, item: message });
        event('response.completed', { response: { id: 'response-1', status: 'completed', output: [reasoning, message] } });
      }
      response.end();
    });
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as { port: number };
    const thoughts: { text: string; active: boolean }[] = [];
    try {
      const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'qa-model', protocol, key: 'local-test' },
        '核对内容', [], AbortSignal.timeout(15000), { systemPrompt: () => '仅回答问题。', buildTools: () => [], toolNames: [], labels: {} }, undefined, undefined, (text, active) => thoughts.push({ text, active }));
      assert.equal(result.reply, answer);
      assert.deepEqual(thoughts.at(-1), { text: thinking, active: false });
      assert(!JSON.stringify(thoughts).includes('secret'));
      assert(!JSON.stringify(thoughts).includes('signature'));
      assert(!JSON.stringify(thoughts).includes('redacted'));
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
}
