import assert from 'node:assert/strict';
import test from 'node:test';
import { recordThinkingPhase, thinkingElapsedMs, type ThinkingTiming } from '../shared/ai-thinking';
import type { ChatEntry } from '../shared/todo-contracts';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';

test('思考耗时累加多个阶段，重复事件不重置起点，等待工具和授权不计时', () => {
  const timing: ThinkingTiming = {};
  recordThinkingPhase(timing, false, 500);
  assert.equal(timing.thinkingMs, undefined);
  recordThinkingPhase(timing, true, 1000);
  recordThinkingPhase(timing, true, 1400);
  assert.equal(thinkingElapsedMs(timing, 1800), 800);
  recordThinkingPhase(timing, false, 2000);
  assert.equal(thinkingElapsedMs(timing, 100000), 1000);
  recordThinkingPhase(timing, false, 100000);
  recordThinkingPhase(timing, true, 120000);
  recordThinkingPhase(timing, false, 122500);
  assert.equal(thinkingElapsedMs(timing, 200000), 3500);
  assert.equal(timing.thinkingStartedAt, undefined);
});

test('时钟回拨不会产生负数或减少累计思考耗时', () => {
  const timing: ThinkingTiming = { thinkingMs: 3000 };
  recordThinkingPhase(timing, true, 5000);
  recordThinkingPhase(timing, false, 4000);
  assert.equal(thinkingElapsedMs(timing), 3000);
});

test('思考和工具默认折叠，开合不跟随流式阶段；字数按 Unicode 字符统计，旧记录不虚构耗时', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let now = 100000;
  t.mock.method(Date, 'now', () => now);
  const { createRoot } = await import('react-dom/client');
  const { AiResponse } = await import('../src/views/AiResponse');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const entry: ChatEntry = { id: 'reply', role: 'assistant', content: '', streaming: true, thinking: '中 A\n😀', thinkingActive: true, thinkingMs: 5000, thinkingStartedAt: 98000,
    tools: [{ id: 'tool', name: 'browser_observe', label: '观察网页', status: 'running', output: '' }] };
  const render = () => act(async () => root.render(createElement(AiResponse, { entry: { ...entry }, showTyping: false })));
  const thought = () => dom.window.document.querySelector<HTMLDetailsElement>('.ai-thinking')!;
  const tools = () => dom.window.document.querySelector<HTMLDetailsElement>('.ai-activity:not(.ai-thinking)')!;
  const metrics = () => dom.window.document.querySelector('.ai-thinking-metrics')!.textContent;
  try {
    await render();
    assert.equal(thought().open, false); assert.equal(tools().open, false);
    assert.equal(metrics(), '3 字 · 7 秒');
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    assert.equal(thought().open, true); assert.equal(tools().open, true);
    entry.thinkingActive = false; entry.thinkingMs = 8000; delete entry.thinkingStartedAt;
    entry.tools![0].status = 'complete'; now += 60000; await render();
    assert.equal(thought().open, true); assert.equal(tools().open, true);
    assert.equal(metrics(), '3 字 · 8 秒');
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    entry.thinkingActive = true; entry.thinkingStartedAt = now; entry.tools![0].status = 'running'; await render();
    assert.equal(thought().open, false); assert.equal(tools().open, false);
    entry.streaming = false; entry.thinkingActive = false; delete entry.thinkingStartedAt; await render();
    assert.equal(thought().open, false);
    delete entry.thinkingMs; await render();
    assert.equal(metrics(), '3 字 · 耗时未记录');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
