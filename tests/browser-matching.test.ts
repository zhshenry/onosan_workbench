import assert from 'node:assert/strict';
import test from 'node:test';
import { browserTextMatcher } from '../electron/browser/text-match';
import { browserQuerySchema } from '../shared/browser-automation-contracts';
import { queryDocument } from '../electron/browser/query';

test('regex and ignore-case match normalized page text without accepting executable selectors', async () => {
  const regex = { pattern: '^(?:查看)?详情$', flags: 'u' as const };
  const match = await browserTextMatcher([regex], ['查看详情', '详情', '其他']);
  assert.equal(match('查看详情', regex), true); assert.equal(match('其他', regex), false);
  assert.equal(match('SAVE', 'save', true, true), true);
  assert.equal(browserQuerySchema.safeParse({ selector: { by: 'css', value: regex } }).success, false);
  await assert.rejects(browserTextMatcher([{ pattern: '[', flags: 'u' }], ['text']), /无效/);
});

test('hostile regexes time out away from the main thread and cancellation releases a matcher', async () => {
  let responsive = false; const tick = setTimeout(() => { responsive = true; }, 30);
  await assert.rejects(browserTextMatcher([{ pattern: '^(a+)+$', flags: 'u' }], ['a'.repeat(100) + '!']), /超时/);
  clearTimeout(tick); assert.equal(responsive, true);
  const controller = new AbortController();
  const pending = browserTextMatcher([{ pattern: '^(a+)+$', flags: 'u' }], ['a'.repeat(100) + '!'], controller.signal);
  controller.abort(); await assert.rejects(pending, /停止/);
});

test('CSS-scoped reads fetch only the container subtree and its accessibility nodes', async () => {
  const calls: { method: string; params?: Record<string, unknown> }[] = [];
  const button = { nodeId: 3, backendNodeId: 3, nodeType: 1, nodeName: 'BUTTON', children: [{ nodeId: 4, backendNodeId: 4, nodeType: 3, nodeName: '#text', nodeValue: '保存' }] };
  const result = await queryDocument(async (method, params) => {
    calls.push({ method, params });
    if (method === 'DOM.getDocument') return { root: { nodeId: 1, backendNodeId: 1, nodeType: 9, nodeName: '#document' } };
    if (method === 'Runtime.evaluate') return { result: { objectId: 'doc' } };
    if (method === 'DOM.requestNode') return { nodeId: 1 };
    if (method === 'DOM.querySelectorAll') return { nodeIds: [2] };
    if (method === 'DOM.describeNode') return { node: { nodeId: 2, backendNodeId: 2, nodeType: 1, nodeName: 'DIV', attributes: ['id', 'order-1002'], children: [button] } };
    if (method === 'Accessibility.queryAXTree') return { nodes: [{ backendDOMNodeId: 3, role: { value: 'button' }, name: { value: '保存' } }] };
    if (method === 'DOM.resolveNode') return { object: { objectId: 'button' } };
    if (method === 'Runtime.callFunctionOn') return { result: { value: '保存' } };
    return {};
  }, 7, [], browserQuerySchema.parse({ within: [{ by: 'css', value: '#order-1002' }], selector: { by: 'role', value: 'button', name: '保存' } }));
  assert.equal(result.nodes.length, 1); assert.match(result.nodes[0].context!, /order-1002/);
  assert.ok(calls.some(call => call.method === 'DOM.getDocument' && call.params?.depth === 1));
  assert.ok(!calls.some(call => call.method === 'Accessibility.getFullAXTree' || call.method === 'DOM.getDocument' && call.params?.depth === -1));
});

test('iframe fallback resolves the document again after a full DOM refresh changes frontend node ids', async () => {
  let full = false;
  const result = await queryDocument(async method => {
    if (method === 'DOM.getDocument') {
      if (full) return { root: { nodeId: 10, backendNodeId: 10, nodeType: 9, nodeName: '#document', children: [{ nodeId: 11, backendNodeId: 11, nodeType: 1, nodeName: 'IFRAME', contentDocument: { nodeId: 20, backendNodeId: 20, nodeType: 9, nodeName: '#document', children: [] } }] } };
      full = true; return { root: { nodeId: 1, backendNodeId: 1, nodeType: 9, nodeName: '#document' } };
    }
    if (method === 'Runtime.evaluate') return { result: { objectId: 'iframe-doc' } };
    if (method === 'DOM.requestNode') return { nodeId: full ? 20 : 2 };
    if (method === 'DOM.querySelectorAll') return { nodeIds: [] };
    if (method === 'Accessibility.getFullAXTree') return { nodes: [] };
    return {};
  }, 7, [], browserQuerySchema.parse({ within: [{ by: 'css', value: '#missing-container' }] }));
  assert.equal(result.nodes.length, 0);
});
