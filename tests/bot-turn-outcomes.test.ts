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
import type { BrowserTask } from '../shared/browser-automation-contracts';
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

test('terminal turns use the same operation card without tool details in the conversation', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof IntersectionObserver;
  dom.window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} } as unknown as MediaQueryList);
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IntersectionObserver', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, {
    configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name],
  }));
  const { createRoot } = await import('react-dom/client');
  const { AiResponse, BotReplyProgress } = await import('../src/views/AiResponse');
  const { BotExecutionCard } = await import('../src/views/BotExecutionCard');
  const element = document.getElementById('root')!;
  const root = createRoot(element);
  const onOpenWork = () => { opened++; };
  let opened = 0;
  try {
    const terminalReply: ChatEntry = { ...reply, tools: [
      { id: 'read', name: 'read_resource', label: '读取引用资料', status: 'error', output: '{"code":"RESOURCE_NOT_FOUND"}' },
    ] };
    const cases = [
      { kind: 'stopped', status: '已停止', tone: 'neutral', detail: '已按你的要求停止本次操作。' },
      { kind: 'timeout', status: '任务超时', tone: 'error', reason: '任务超时：连续 3 分钟无进展，已自动停止。', detail: '连续 3 分钟无进展，已自动停止。' },
      { kind: 'failed', status: '执行失败', tone: 'error', reason: '模型连接失败', detail: '模型连接失败' },
      { kind: 'interrupted', status: '已中断', tone: 'neutral', detail: '本次操作已中断。' },
    ] as const;
    for (const example of cases) {
      const reason = 'reason' in example ? example.reason : undefined;
      await act(async () => root.render(createElement(AiResponse, { key: example.kind, entry: terminalReply,
        businessChat: true, outcome: { kind: example.kind, reason }, onOpenWork })));
      const cards = element.querySelectorAll<HTMLElement>('.bot-operation-card');
      assert.equal(cards.length, 1);
      const [card] = cards;
      assert.equal(card.dataset.tone, example.tone);
      assert.equal(card.querySelector('.bot-operation-copy strong')?.textContent, '处理请求');
      assert.equal(card.querySelector('.bot-operation-status')?.textContent, example.status);
      const details = card.querySelector<HTMLElement>('.bot-operation-details')!;
      const toggle = card.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
      assert.equal(details.hidden, true);
      await act(async () => toggle.click());
      assert.equal(details.hidden, false);
      assert.equal(details.querySelector('.bot-operation-subject > div')?.textContent, example.detail);
      const work = details.querySelector<HTMLButtonElement>('.bot-action-buttons button')!;
      assert.equal(work.textContent, '查看工作详情');
      await act(async () => work.click());
      assert.doesNotMatch(card.textContent!, /读取引用资料|read_resource|RESOURCE_NOT_FOUND|查看回执/);
      assert.equal(element.querySelector('.ai-bubble')?.textContent?.trim(), reply.content);
    }
    assert.equal(opened, cases.length);
    await act(async () => root.render(createElement(AiResponse, { entry: terminalReply, showTimeline: true,
      outcome: { kind: 'failed', reason: '模型连接失败' } })));
    assert.equal(element.querySelector('.bot-operation-status')?.textContent, '执行失败');
    assert.equal(element.querySelector('.ai-process, .ai-process-pending'), null);

    const output = JSON.stringify({ id: 'quota', operationId: 'operation-42', revision: 8,
      changed: [{ id: 'quota', before: { id: 'quota', style: 'bars' }, after: { id: 'quota', style: 'rings' } }],
      privateNote: 'never displayed' });
    const executed: ChatEntry = { ...reply, content: 'AI 额度卡片已改为额度圆环。', thinking: 'internal reasoning', tools: [
      { id: 'edit', name: 'dashboard_edit', label: '修改看板', status: 'complete', output },
    ] };
    await act(async () => root.render(createElement(AiResponse, { entry: executed, businessChat: true })));
    assert.equal(element.textContent?.trim(), executed.content);
    assert.equal(element.querySelector('.bot-operation-card'), null);

    const background: ChatEntry = { ...reply, content: '', tools: [
      { id: 'read', name: 'read_resource', label: '读取引用资料', status: 'complete', output: '{"id":"draft-1"}' },
      { id: 'send', name: 'send_to_bot', label: '委派协作', status: 'complete', output: '{"taskId":"child-1"}' },
    ] };
    await act(async () => root.render(createElement(AiResponse, { entry: background, businessChat: true })));
    assert.equal(element.textContent, '');
    assert.equal(element.querySelector('.bot-operation-card'), null);
    await act(async () => root.render(createElement(BotExecutionCard, { entry: background })));
    assert.match(element.querySelector('[aria-label="实际步骤"]')?.textContent ?? '', /读取引用资料 read_resource · 已完成/);
    assert.match(element.querySelector('[aria-label="实际步骤"]')?.textContent ?? '', /委派协作 send_to_bot · 已完成/);
    assert.match(element.querySelector('[aria-label="实际步骤"]')?.textContent ?? '', /事项 · child-1/);
    const missing: ChatEntry = { ...terminalReply, content: '找不到这份资料，请重新引用。' };
    await act(async () => root.render(createElement(AiResponse, { entry: missing, businessChat: true })));
    assert.equal(element.textContent?.trim(), missing.content);
    assert.equal(element.querySelector('.bot-operation-card'), null);
    await act(async () => root.render(createElement(AiResponse, { entry: { ...background, streaming: true }, businessChat: true })));
    assert.equal(element.querySelector('[role="status"]'), null);

    const instruction = '请先在看板点「完成」，再让我接手刚移动的卡片。';
    const waiting: ChatEntry = { ...background, tools: [
      { id: 'handoff', name: 'dashboard_read', label: '读取看板', status: 'complete', output: JSON.stringify({ id: 'quota', handoffIssue: instruction }) },
    ] };
    let openedDashboard = false;
    await act(async () => root.render(createElement(AiResponse, { entry: waiting, businessChat: true,
      onOpenDashboard: () => { openedDashboard = true; } })));
    const waitingCard = element.querySelector<HTMLElement>('.bot-operation-card')!;
    assert.equal(waitingCard.querySelector('[role="status"]')?.textContent, '待处理');
    assert.equal(waitingCard.querySelector('.bot-operation-subject > div')?.textContent, instruction);
    await act(async () => waitingCard.querySelector<HTMLButtonElement>('.bot-action-buttons button')!.click());
    assert.equal(openedDashboard, true);
    assert.doesNotMatch(waitingCard.textContent!, /查看回执|dashboard_read|quota/);
    await act(async () => root.render(createElement(AiResponse, { entry: waiting, businessChat: true,
      outcome: { kind: 'stopped' }, onOpenWork })));
    assert.equal(element.querySelector('.bot-operation-card'), waitingCard);
    assert.equal(waitingCard.querySelector('.bot-operation-copy strong')?.textContent, '调整看板');
    assert.equal(waitingCard.querySelector('.bot-operation-status')?.textContent, '已停止');
    assert.equal(waitingCard.textContent?.includes(instruction), false);

    await act(async () => root.render(createElement(BotExecutionCard, { entry: executed })));
    const card = element.querySelector<HTMLElement>('.bot-operation-card')!;
    assert.equal(card.querySelector('strong')?.textContent, 'AI 额度卡片');
    assert.equal(card.querySelector('.bot-operation-copy small')?.textContent, '额度圆环');
    assert.equal(card.querySelector('[role="status"]')?.textContent, '已完成');
    const target = card.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    assert.equal(card.querySelector<HTMLElement>('.bot-operation-details')?.hidden, true);
    await act(async () => target.click());
    assert.equal(card.querySelector<HTMLElement>('.bot-operation-details')?.hidden, false);
    assert.match(card.textContent!, /操作 · operation-42.*版本 · 8/);
    assert.doesNotMatch(card.textContent!, /never displayed|internal reasoning/);
    await act(async () => root.render(createElement(AiResponse, { entry: executed, businessChat: true, operationOwned: true })));
    assert.equal(element.querySelector('.bot-operation-card'), null);

    const browser: BrowserTask = {
      id: 'browser-1', workspace: 'default', tabIds: ['private-tab'], origins: ['https://example.test'],
      goal: '按未发布筛选发布清单', status: 'completed', updatedAt: createdAt,
      steps: [{ at: createdAt, operation: 'select', status: 'ok', detail: 'https://example.test/list' },
        { at: createdAt, operation: 'observe', status: 'ok', detail: 'https://example.test/list' }],
      verification: { planned: true, items: [{ id: 'filter', label: '核对筛选结果', tabId: 'private-tab',
        condition: { type: 'text', text: '未发布', present: true }, status: 'passed' }] },
    };
    const browserEntry: ChatEntry = { ...background, content: '已核对发布清单。', browserTask: { id: browser.id, workspace: browser.workspace },
      tools: [{ id: 'observe', name: 'browser_observe', label: '观察网页', status: 'complete', output: '{"id":"private-tab"}' }] };
    let openedBrowser: BrowserTask | undefined;
    const browserReply = (browserTask: BrowserTask) => createElement(AiResponse, { entry: browserEntry, businessChat: true, browserTask,
      onOpenBrowser: task => { openedBrowser = task; } });
    await act(async () => root.render(browserReply(browser)));
    assert.equal(element.querySelector('.bot-operation-card'), null);
    assert.equal(element.textContent?.trim(), browserEntry.content);
    await act(async () => root.render(browserReply({ ...browser, status: 'unverified', steps: browser.steps.slice(1), verification: undefined })));
    assert.equal(element.querySelector('.bot-operation-card'), null);
    const unverified = { ...browser, status: 'unverified' as const, verification: undefined };
    await act(async () => root.render(browserReply(unverified)));
    assert.equal(element.querySelector('[role="status"]')?.textContent, '待核对');
    assert.equal(element.querySelector('.bot-operation-copy strong')?.textContent, browser.goal);
    assert.match(element.querySelector('.bot-operation-details')?.textContent ?? '', /请在网页上核对结果/);
    await act(async () => element.querySelector<HTMLButtonElement>('.bot-action-buttons button')!.click());
    assert.equal(openedBrowser, unverified);
    await act(async () => root.render(browserReply({ ...browser, status: 'paused' })));
    assert.equal(element.querySelector('[role="status"]')?.textContent, '待接手');
    assert.match(element.querySelector('.bot-operation-details')?.textContent ?? '', /继续操作/);
    const browserCard = element.querySelector('.bot-operation-card');
    await act(async () => root.render(createElement(AiResponse, { entry: browserEntry, businessChat: true,
      browserTask: { ...browser, status: 'interrupted' }, outcome: { kind: 'interrupted' }, onOpenWork })));
    assert.equal(element.querySelector('.bot-operation-card'), browserCard);
    assert.equal(browserCard?.querySelector('.bot-operation-copy strong')?.textContent, '网页操作');
    assert.equal(browserCard?.querySelector('.bot-operation-status')?.textContent, '已中断');
    assert.doesNotMatch(browserCard?.textContent ?? '', /继续操作|查看回执|browser_observe|private-tab/);
    await act(async () => root.render(createElement(AiResponse, {
      entry: { ...browserEntry, tools: [], content: '你好。' }, businessChat: true,
      browserTask: { ...browser, steps: [], status: 'unverified', verification: undefined },
    })));
    assert.equal(element.textContent?.trim(), '你好。');
    assert.equal(element.querySelector('.bot-operation-card'), null);
    const live: ChatEntry = { ...executed, streaming: true, content: '', thinking: '先核对日期', tools: [
      { id: 'lookup', name: 'list_tasks', label: '读取事项和标签', status: 'running', output: '' },
    ] };
    await act(async () => root.render(createElement(BotReplyProgress, { avatar: 'square:violet', entry: live })));
    const progress = element.querySelector<HTMLDetailsElement>('.bot-reply-progress')!;
    assert.equal(progress.open, false);
    assert.ok(progress.querySelector('summary > .bot-avatar'));
    assert.equal(progress.querySelector('summary > svg'), null);
    assert.equal(progress.querySelector('summary [role="status"]')?.textContent, '查看待办和标签');
    assert.doesNotMatch(progress.textContent!, /先核对日期|list_tasks/);
    await act(async () => progress.querySelector('summary')!.click());
    assert.equal(progress.open, true);
    assert.match(progress.textContent!, /先核对日期/);
    assert.match(progress.textContent!, /读取事项和标签 list_tasks · 进行中/);
    await act(async () => progress.querySelector('summary')!.click());
    assert.equal(progress.open, false);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
