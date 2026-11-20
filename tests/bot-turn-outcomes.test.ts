import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { botEntryOutcome, projectBotTurnOutcomes } from '../src/bot-turn-outcomes';
import type { BotTask } from '../shared/bot-contracts';
import type { ChatEntry } from '../shared/todo-contracts';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';

const createdAt = new Date(1000).toISOString();
const prompt: ChatEntry = { id: 'prompt', role: 'user', content: '整理会前材料' };
const reply: ChatEntry = { id: 'reply', role: 'assistant', content: '已找到会议纪要。', createdAt, responseFinishedAt: 19000 };
const task: BotTask = {
  id: 'task', rootTaskId: 'task', botId: 'bot', chatId: 'chat', kind: 'chat', sourceMessageId: prompt.id,
  assistantEntryId: reply.id, assistantEntryIds: ['old-reply', reply.id], status: 'failed', title: prompt.content,
  input: prompt.content, context: {}, resources: [], operationIds: [], dependencyIds: [], revision: 0,
  createdAt, updatedAt: createdAt,
};

test('stop and timeout belong to the latest reply, preserving earlier text and the actual reason', () => {
  const older = { ...reply, id: 'old-reply' };
  const entries = [prompt, older, reply];
  const manual = projectBotTurnOutcomes(entries, [{ ...task, status: 'cancelled', reason: '用户已取消' }]);
  assert.equal(manual.outcomes.get(reply.id)?.kind, 'stopped');
  assert.equal(manual.outcomes.has(older.id), false);
  assert.equal(manual.hiddenReplies.size, 0);
  const reason = '任务超时：连续 3 分钟无进展，已自动停止。';
  assert.deepEqual(projectBotTurnOutcomes(entries, [{ ...task, reason }]).outcomes.get(reply.id),
    { kind: 'timeout', reason, taskId: task.id });
  assert.equal(projectBotTurnOutcomes(entries, [{ ...task, status: 'cancelled', reason: '用户未批准该操作' }]).outcomes.size, 0);
  assert.equal(botEntryOutcome({ ...reply, error: '已取消生成,输入内容已保留。' })?.kind, 'interrupted');
});

test('an empty failed reply is replaced by the status under its own prompt', () => {
  const empty = { ...reply, content: '', error: '模型连接失败' };
  const other = { ...prompt, id: 'other', content: '另一个工作' };
  const projection = projectBotTurnOutcomes([prompt, empty, other], [{ ...task, reason: empty.error }]);
  assert.deepEqual(projection.outcomes.get(prompt.id), { kind: 'failed', reason: empty.error, taskId: task.id });
  assert.deepEqual([...projection.hiddenReplies], [reply.id]);
  assert.equal(projection.outcomes.has(other.id), false);
  assert.equal(projectBotTurnOutcomes([prompt, other], [{ ...task, reason: empty.error }]).outcomes.size, 0);
  const withTool = { ...empty, tools: [{ id: 'read', name: 'read', label: '读取资料', output: '', status: 'complete' as const }] };
  const retained = projectBotTurnOutcomes([prompt, withTool], [{ ...task, reason: empty.error }]);
  assert.equal(retained.outcomes.get(reply.id)?.kind, 'failed');
  assert.equal(retained.hiddenReplies.size, 0);
});

test('a history page can restore a failed task with only a user message', () => {
  const directory = mkdtempSync(join(tmpdir(), 'bot-turn-outcomes-'));
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  try {
    const bot = store.cards().find(item => item.seedKey === 'coordinator')!;
    const draft = store.saveDraft(bot.mainChatId, 0, { text: prompt.content, replyToTaskId: null, resources: [] });
    const { task: requested } = store.submit({ botId: bot.id, chatId: bot.mainChatId, clientRequestId: randomUUID(),
      expectedDraftRevision: draft.revision, text: prompt.content, replyToTaskId: null, resources: [] }, () => {});
    store.updateTask(requested.id, { status: 'failed', reason: '模型连接失败' });
    const page = store.syncChat(bot.mainChatId);
    assert.ok('chat' in page);
    assert.deepEqual(page.pageTasks?.map(item => item.id), [requested.id]);
    const projection = projectBotTurnOutcomes(page.chat.entries, page.pageTasks ?? []);
    assert.equal(projection.outcomes.get(requested.sourceMessageId)?.kind, 'failed');
  } finally { ai.close(); }
});

test('a terminal process displays one disclosure with the correct detail action', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, {
    configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  }));
  const { createRoot } = await import('react-dom/client');
  const { AiResponse, ResponseProcess } = await import('../src/views/AiResponse');
  const element = document.getElementById('root')!;
  const root = createRoot(element);
  const onOpenWork = () => { opened++; };
  let opened = 0;
  try {
    await act(async () => root.render(createElement(AiResponse, { entry: reply, showTimeline: true, outcome: { kind: 'stopped' } })));
    assert.equal(element.textContent?.trim(), '已停止 18s已找到会议纪要。');
    const reason = '任务超时：连续 3 分钟无进展，已自动停止。';
    await act(async () => root.render(createElement(AiResponse, { entry: reply, showTimeline: true, outcome: { kind: 'timeout', reason }, onOpenWork })));
    assert.equal(element.querySelectorAll('[data-outcome]').length, 1);
    assert.equal(element.querySelector('summary')?.textContent, '任务超时');
    const displayedReason = '连续 3 分钟无进展，已自动停止。';
    assert.equal(element.textContent?.includes(displayedReason), false);
    await act(async () => { element.querySelector('summary')!.click(); });
    assert.equal(element.querySelector('.bot-outcome-reason')?.textContent, displayedReason);
    assert.equal(element.querySelector('button'), null);
    await act(async () => root.render(createElement(ResponseProcess, { outcome: { kind: 'failed', reason: '模型连接失败' }, onOpenWork })));
    assert.equal(element.querySelector('summary')?.textContent, '执行失败');
    await act(async () => { element.querySelector('summary')!.click(); });
    assert.equal(element.querySelector('button')?.textContent, '查看工作详情');
    await act(async () => { element.querySelector('button')!.click(); });
    assert.equal(opened, 1);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
