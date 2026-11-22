import test from 'node:test';
import assert from 'node:assert/strict';
import { botReplyActivity, botToolActivity } from '../shared/bot-activity';
import { describeBotToolProgress } from '../electron/bot-tool-progress';

test('tool expressions distinguish reading, delegation and writes without inspecting user content', () => {
  for (const name of ['list_tasks', 'read_resource', 'read_book_note', 'browser_snapshot', 'browser_screenshot']) assert.equal(botToolActivity(name), 'searching', name);
  assert.equal(botToolActivity('send_to_bot'), 'sending');
  for (const name of ['propose_create', 'propose_update', 'save_artifact', 'browser_click', 'browser_type', 'unknown_tool']) assert.equal(botToolActivity(name), 'working', name);
});

test('conversation copy follows running tools and returns to reply or result status when they finish', () => {
  assert.deepEqual(botReplyActivity(), { phase: 'thinking', label: '梳理你的要求' });
  const reading = { id: '1', name: 'dashboard_read', label: '读取看板', status: 'running', output: '' } as const;
  const edit = { id: '2', name: 'dashboard_edit', label: '修改看板', progressLabel: '调整额度卡样式', status: 'running', output: '' } as const;
  assert.deepEqual(botReplyActivity({ tools: [reading], responsePhase: 'waiting' }), { phase: 'searching', label: '读取看板布局' });
  const complete = { ...reading, status: 'complete' } as const;
  assert.deepEqual(botReplyActivity({ tools: [complete, edit], responsePhase: 'replying' }), { phase: 'working', label: '调整额度卡样式' });
  assert.equal(botReplyActivity({ tools: [complete], responsePhase: 'waiting' }).label, '整理结果');
  assert.equal(botReplyActivity({ tools: [complete], responsePhase: 'replying' }).label, '整理回复');
  assert.equal(botReplyActivity({ tools: [{ ...reading, name: 'propose_create' }], responsePhase: 'waiting' }).label, '准备待办建议');
});

test('contextual copy uses registered objects and approved action types', () => {
  const context = { botName: (id: string) => id === 'schedule' ? '日程' : undefined };
  const edit = { action: { kind: 'style', id: 'quota', style: 'list' } };
  assert.equal(describeBotToolProgress('dashboard_edit', edit, context), '调整额度卡样式');
  assert.equal(describeBotToolProgress('dashboard_edit', { action: { ...edit.action, id: 'last_moved' } }, context), '调整看板卡片样式');
  assert.equal(describeBotToolProgress('dashboard_edit', { action: { ...edit.action, id: '用户原话' } }, context), undefined);
  assert.equal(describeBotToolProgress('send_to_bot', { botId: 'schedule', content: '不会显示的指令' }, context), '交给日程处理');
  assert.equal(describeBotToolProgress('send_to_bot', { botId: 'missing', content: '不会显示的指令' }, context), undefined);
  assert.equal(describeBotToolProgress('propose_create', { kind: 'meeting' }, context), '准备日程建议');
  assert.equal(describeBotToolProgress('browser_check', { operation: 'plan' }, context), '准备网页核对');
});
