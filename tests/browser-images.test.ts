import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { runAgentLoop } from '../electron/ai-core';
import type { AIProtocol } from '../shared/todo-contracts';

const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=';
for (const protocol of ['openai-chat', 'openai-responses', 'anthropic'] as AIProtocol[]) test(`${protocol} transports browser tool screenshots without exposing pixels in UI text`, async () => {
  const bodies: any[] = [];
  const outputs: string[] = [];
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    bodies.push(JSON.parse(raw));
    const first = bodies.length === 1;
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const event = (type: string, fields: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
    if (protocol === 'openai-chat') {
      const chunk = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      chunk(first ? { tool_calls: [{ index: 0, id: 'observe1', type: 'function', function: { name: 'browser_observe', arguments: '{}' } }] } : { content: '已观察。' });
      chunk({}, first ? 'tool_calls' : 'stop'); response.write('data: [DONE]\n\n');
    } else if (protocol === 'anthropic') {
      event('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 1, output_tokens: 0 } } });
      if (first) {
        event('content_block_start', { index: 0, content_block: { type: 'tool_use', id: 'observe1', name: 'browser_observe', input: {} } });
        event('content_block_delta', { index: 0, delta: { type: 'input_json_delta', partial_json: '{}' } });
      } else {
        event('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        event('content_block_delta', { index: 0, delta: { type: 'text_delta', text: '已观察。' } });
      }
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: first ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } }); event('message_stop', {});
    } else {
      const item = first ? { id: 'observe1', type: 'function_call', call_id: 'observe1', name: 'browser_observe', arguments: '{}' }
        : { id: 'reply1', type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '已观察。', annotations: [] }] };
      event('response.created', { response: { id: 'fixture' } });
      event('response.output_item.added', { output_index: 0, item: first ? { ...item, arguments: '' } : { ...item, content: [] } });
      if (first) event('response.function_call_arguments.delta', { output_index: 0, item_id: 'observe1', delta: '{}' });
      else event('response.output_text.delta', { output_index: 0, delta: '已观察。' });
      event('response.output_item.done', { output_index: 0, item });
      event('response.completed', { response: { id: 'fixture', status: 'completed', output: [item] } });
    }
    response.end();
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixture', protocol, key: 'synthetic', supportsImages: true }, '核对当前截图', [], AbortSignal.timeout(20000), {
      directBrowserOperations: true, systemPrompt: () => '读取截图后回答。', toolNames: ['browser_observe'], labels: { browser_observe: '观察网页' },
      buildTools: () => [defineTool({
        name: 'browser_observe', label: '观察网页', description: '读取合成页面截图', parameters: Type.Object({}),
        execute: async () => ({ content: [{ type: 'text', text: '观察结果' }, { type: 'image', data: pixel, mimeType: 'image/png' }], details: {} }),
      })],
    }, undefined, event => outputs.push(event.output));
    assert.equal(result.reply, '已观察。'); assert.equal(bodies.length, 2);
    assert.ok(!JSON.stringify(bodies[0]).includes(pixel));
    assert.ok(JSON.stringify(bodies[1]).includes(pixel), 'Observed screenshot must reach the provider in the tool result');
    assert.ok(outputs.includes('观察结果')); assert.ok(outputs.every(output => !output.includes(pixel)));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
