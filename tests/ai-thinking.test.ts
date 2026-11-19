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
    assert.equal(Boolean(thought().querySelector('.ai-thinking-body')), false);
    assert.equal(Boolean(tools().querySelector('.ai-tool-list')), false);
    assert.equal(metrics(), '3 字 · 7 秒');
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    assert.equal(thought().open, true); assert.equal(tools().open, true);
    assert.match(thought().querySelector('.ai-thinking-body')!.textContent!, /中 A/);
    assert.equal(tools().querySelector('pre')!.textContent, '等待工具返回…');
    entry.thinkingActive = false; entry.thinkingMs = 8000; delete entry.thinkingStartedAt;
    entry.tools![0].status = 'complete'; now += 60000; await render();
    assert.equal(thought().open, true); assert.equal(tools().open, true);
    assert.equal(metrics(), '3 字 · 8 秒');
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    entry.thinkingActive = true; entry.thinkingStartedAt = now; entry.tools![0].status = 'running'; await render();
    assert.equal(thought().open, false); assert.equal(tools().open, false);
    assert.equal(Boolean(thought().querySelector('.ai-thinking-body')), false);
    assert.equal(Boolean(tools().querySelector('.ai-tool-list')), false);
    entry.thinking = '更新后的思考'; entry.tools![0].output = '更新后的工具结果'; await render();
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    assert.equal(thought().querySelector('.ai-thinking-body')!.textContent?.trim(), '更新后的思考');
    assert.equal(tools().querySelector('pre')!.textContent, '更新后的工具结果');
    await act(async () => { thought().querySelector('summary')!.click(); tools().querySelector('summary')!.click(); });
    entry.streaming = false; entry.thinkingActive = false; delete entry.thinkingStartedAt; await render();
    assert.equal(thought().open, false);
    delete entry.thinkingMs; await render();
    assert.equal(metrics(), '6 字 · 耗时未记录');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});

test('Bot 过程完成后显示轻量入口，按顺序展开可独立操作的思考与工具折叠栏', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const { createRoot } = await import('react-dom/client');
  const { AiResponse } = await import('../src/views/AiResponse');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const entry: ChatEntry = {
    id: 'ordered-reply', role: 'assistant', content: '核对完毕', createdAt: new Date(1000).toISOString(),
    thinking: '核对负责人', thinkingMs: 8000, responseFinishedAt: 16000,
    tools: [
      { id: 'lookup-failed', name: 'list_bots', label: '查找负责人', output: '查询超时', status: 'error' },
      { id: 'lookup', name: 'list_bots', label: '查找负责人', output: '负责人列表', status: 'complete' },
    ],
    responseParts: [
      { kind: 'tool', toolId: 'lookup-failed', startedAt: 2000 },
      { kind: 'tool', toolId: 'lookup', startedAt: 4000 },
      { kind: 'thinking', turn: 2, index: 0, text: '核对负责人', startedAt: 8000 },
      { kind: 'text', turn: 2, index: 1, text: '核对完毕', startedAt: 16000 },
    ],
  };
  const click = (control: Element) => act(async () => { (control as HTMLElement).click(); });
  try {
    await act(async () => root.render(createElement(AiResponse, { entry, showTimeline: true })));
    const process = dom.window.document.querySelector<HTMLDetailsElement>('details.ai-process')!;
    const summary = process.querySelector(':scope > summary')!;
    assert.equal(summary.textContent, '已完成 15s');
    assert.equal(process.open, false);
    await click(summary);
    const [tools, thought] = [...process.querySelectorAll<HTMLDetailsElement>('.ai-process-steps > details')];
    assert.ok(tools && thought);
    assert.equal(thought.classList.contains('ai-thinking'), true);
    assert.ok(tools.querySelector('summary')!.textContent!.startsWith('工具执行'));
    assert.match(tools.querySelector('summary')!.textContent!, /1 次调用失败/);
    assert.equal(tools.open, false);
    assert.equal(thought.open, false);
    await click(thought.querySelector('summary')!);
    assert.match(thought.querySelector('.ai-thinking-body')!.textContent!, /核对负责人/);
    assert.equal(thought.querySelector('.ai-thinking-metrics')!.textContent, '5 字 · 8 秒');
    assert.equal(tools.querySelector('.ai-tool-list'), null);
    await click(tools.querySelector('summary')!);
    assert.equal(thought.open, true);
    assert.match(tools.querySelector('.ai-tool-list')!.textContent!, /查找负责人/);
    const failedTool = tools.querySelector('.ai-tool-detail.error')!;
    assert.equal(failedTool.querySelector('summary small')!.textContent, '失败');
    assert.equal(failedTool.querySelector('pre')!.textContent, '查询超时');
    await click(thought.querySelector('summary')!);
    assert.equal(thought.querySelector('.ai-thinking-body'), null);
    assert.equal(tools.open, true);
    await click(summary);
    assert.equal(process.querySelector('.ai-tool-list'), null);
    assert.equal(process.querySelector('.ai-thinking'), null);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
