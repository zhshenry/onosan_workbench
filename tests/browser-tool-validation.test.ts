import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { Compile } from 'typebox/compile';
import type { WebContents } from 'electron';
import { runAgentLoop } from '../electron/ai-core';
import type { BrowserAutomation } from '../electron/browser/tasks';
import { buildBrowserContribution } from '../modules/browser/ai';
import type { AIProtocol } from '../shared/todo-contracts';

const query = { selector: { by: 'css', value: '#content_left > div, #content_left .result, #content_left .c-container' }, limit: 100 };
const valid = { tabId: '99625d11-6a74-4165-bd12-a5ed832d3b59', query };
const invalid = { ...valid, query: { ...query, by: 'css', selectorText: true } };

function fixture() {
  const calls: unknown[][] = [];
  const automation = { observe: async (...args: unknown[]) => { calls.push(args); return { text: '找到 2 条百度百科结果', elements: [], frames: [], truncated: false }; } } as unknown as BrowserAutomation;
  const contribution = buildBrowserContribution(automation, {} as WebContents, { id: 'task1', workspace: 'default', goal: '统计百度百科结果', status: 'running', tabIds: [valid.tabId], origins: ['https://www.baidu.com'], steps: [], updatedAt: '2026-10-17T00:00:00Z' }, false);
  return { contribution, calls, tool: contribution.buildTools().find(tool => tool.name === 'browser_observe')! };
}

test('observe rejects unexpected root and nested keys by their full paths without changing the received input', () => {
  const { tool, calls } = fixture();
  for (const [input, paths] of [
    [invalid, ['query.by', 'query.selectorText']],
    [{ ...valid, selectorText: true }, ['selectorText']],
    [{ ...valid, query: { selector: { ...query.selector, selectorText: true } } }, ['query.selector.selectorText']],
    [{ ...valid, query: { within: [{ by: 'css', value: '#content_left', selectorText: true }] } }, ['query.within.0.selectorText']],
  ] as const) {
    const before = JSON.stringify(input);
    assert.equal(Compile(tool.parameters).Check(input), false);
    assert.throws(() => tool.prepareArguments!(input), error => {
      const feedback = JSON.parse((error as Error).message);
      assert.equal(feedback.code, 'invalid-tool-arguments');
      assert.deepEqual(feedback.invalidFields, paths);
      for (const path of paths) assert.ok(feedback.message.includes(path));
      assert.match(feedback.hint, /query\.selector\.by/);
      assert.match(feedback.hint, /selectorText/);
      for (const example of feedback.examples) assert.equal(Compile(tool.parameters).Check({ tabId: valid.tabId, ...example }), true);
      return true;
    });
    assert.equal(JSON.stringify(input), before);
  }
  assert.equal(calls.length, 0);
});

test('valid observe arguments pass unchanged and the published schema retains its strict bounds', () => {
  const { tool } = fixture();
  for (const input of [valid, { tabId: valid.tabId }, { ...valid, query: null }]) assert.equal(tool.prepareArguments!(input), input);
  assert.equal(Compile(tool.parameters).Check(valid), true);
  assert.equal(Compile(tool.parameters).Check({ ...valid, query: { limit: 251 } }), false);
  assert.equal(Compile(tool.parameters).Check({ ...valid, query: { evaluate: 'arbitrary()' } }), false);
});

for (const protocol of ['openai-chat', 'openai-responses', 'anthropic'] as AIProtocol[]) test(`${protocol} returns named argument errors to the model and UI before accepting a corrected observe call`, async () => {
  const { contribution, calls } = fixture();
  const bodies: any[] = [], outputs: { status: string; output: string }[] = [];
  const server = createServer(async (request, response) => {
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw); bodies.push(body);
    const step = bodies.length, feedbackReceived = step !== 2 || ['query.by', 'query.selectorText', 'invalid-tool-arguments'].every(text => raw.includes(text));
    const toolCall = step === 1 || step === 2 && feedbackReceived;
    const id = `observe${step}`, args = JSON.stringify(step === 1 ? invalid : valid);
    const reply = feedbackReceived ? '已统计，找到 2 条百度百科结果。' : '错误反馈不足，无法修正。';
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const event = (type: string, fields: object) => response.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...fields })}\n\n`);
    if (protocol === 'openai-chat') {
      const chunk = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
      chunk(toolCall ? { tool_calls: [{ index: 0, id, type: 'function', function: { name: 'browser_observe', arguments: args } }] } : { content: reply });
      chunk({}, toolCall ? 'tool_calls' : 'stop'); response.end('data: [DONE]\n\n');
    } else if (protocol === 'anthropic') {
      event('message_start', { message: { id: 'fixture', type: 'message', role: 'assistant', model: 'fixture', content: [], usage: { input_tokens: 1, output_tokens: 0 } } });
      event('content_block_start', { index: 0, content_block: toolCall ? { type: 'tool_use', id, name: 'browser_observe', input: {} } : { type: 'text', text: '' } });
      event('content_block_delta', { index: 0, delta: toolCall ? { type: 'input_json_delta', partial_json: args } : { type: 'text_delta', text: reply } });
      event('content_block_stop', { index: 0 });
      event('message_delta', { delta: { stop_reason: toolCall ? 'tool_use' : 'end_turn' }, usage: { output_tokens: 5 } }); event('message_stop', {}); response.end();
    } else {
      const item = toolCall ? { id, type: 'function_call', call_id: id, name: 'browser_observe', arguments: args }
        : { id, type: 'message', role: 'assistant', content: [{ type: 'output_text', text: reply, annotations: [] }] };
      event('response.created', { response: { id: 'fixture' } });
      event('response.output_item.added', { output_index: 0, item: toolCall ? { ...item, arguments: '' } : { ...item, content: [] } });
      if (toolCall) event('response.function_call_arguments.delta', { output_index: 0, item_id: id, delta: args });
      else event('response.output_text.delta', { output_index: 0, delta: reply });
      event('response.output_item.done', { output_index: 0, item });
      event('response.completed', { response: { id: 'fixture', status: 'completed', output: [item] } }); response.end();
    }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixture', protocol, key: 'synthetic' }, '统计百度百科结果', [], AbortSignal.timeout(20000), contribution, undefined, event => outputs.push(event));
    assert.equal(result.reply, '已统计，找到 2 条百度百科结果。');
    assert.equal(bodies.length, 3);
    assert.equal(calls.length, 1, 'Only the corrected tool call may reach the browser');
    assert.equal(calls[0][2], valid.tabId);
    assert.deepEqual((calls[0][5] as { selector: unknown }).selector, { ...query.selector, exact: true, ignoreCase: false });
    const failure = outputs.find(event => event.status === 'error');
    assert.ok(failure);assert.match(failure.output, /query\.by/);assert.match(failure.output, /query\.selectorText/);
    assert.ok(outputs.some(event => event.status === 'complete' && event.output.includes('找到 2 条百度百科结果')));
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
