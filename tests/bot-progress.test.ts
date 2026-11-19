import test from 'node:test';
import assert from 'node:assert/strict';
import { groupBotProgress } from '../src/bot-progress';
import { taskStatuses, type BotArtifact, type BotTask } from '../shared/bot-contracts';
import type { ChatEntry } from '../shared/todo-contracts';

function task(id: string, patch: Partial<BotTask> = {}): BotTask {
  return { id, botId: 'bot', chatId: 'chat', rootTaskId: id, sourceMessageId: id, kind: 'chat', status: 'completed', title: id, input: id, context: {}, resources: [], operationIds: [], dependencyIds: [], revision: 0, createdAt: '2026-11-16T00:00:00Z', updatedAt: '2026-11-16T00:00:00Z', ...patch };
}

test('ongoing, waiting and abnormal requests remain visible even for ordinary chat', () => {
  const tasks = taskStatuses.filter(status => status !== 'completed' && status !== 'cancelled').map(status => task(status, { status }));
  const groups = groupBotProgress(tasks, [], []);
  assert.deepEqual(groups.active.map(task => task.status), ['queued', 'running', 'waiting_bot']);
  assert.deepEqual(groups.attention.map(task => task.status), ['waiting_user', 'waiting_resource', 'interrupted', 'failed']);
  assert.deepEqual(groups.ended, []);
  assert.deepEqual(groups.conversations, []);
});

test('only finished chat without work evidence is collected as ordinary conversation', () => {
  const tasks = [task('hello'), task('cancelled-chat', { status: 'cancelled' }), task('work', { kind: 'work' }), task('routine', { kind: 'routine' }), task('delegated', { kind: 'delegated' }), task('action', { operationIds: ['approval'] }), task('collaboration', { dependencyIds: ['child'] }), task('resource', { resources: [{ kind: 'copy', id: 'draft' }] }), task('tool', { assistantEntryId: 'tool-reply' }), task('browser', { assistantEntryId: 'browser-reply' }), task('proposal', { assistantEntryId: 'proposal-reply' }), task('delivery')];
  const entries: ChatEntry[] = [
    { id: 'tool-reply', role: 'assistant', content: '', tools: [{ id: 'call', name: 'read_resource', label: '读取资料', status: 'complete', output: '' }] },
    { id: 'browser-reply', role: 'assistant', content: '', browserTask: { id: 'browser-task', workspace: 'default' } },
    { id: 'proposal-reply', role: 'assistant', content: '', copyProposal: { token: 'copy', message: '改稿建议', actions: [] } },
  ];
  const artifacts: BotArtifact[] = [{ id: 'artifact', producerBotId: 'bot', taskId: 'delivery', rootTaskId: 'delivery', chatId: 'chat', title: '报告', mediaType: 'text/markdown', resource: { kind: 'artifact', id: 'artifact' }, createdAt: '2026-11-16T00:00:00Z' }];
  const groups = groupBotProgress(tasks, entries, artifacts);
  assert.deepEqual(groups.conversations.map(task => task.id), ['hello', 'cancelled-chat']);
  assert.deepEqual(groups.ended.map(task => task.id), tasks.slice(2).map(task => task.id));
  assert.deepEqual([...groups.ended, ...groups.conversations].sort((a, b) => a.id.localeCompare(b.id)), [...tasks].sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(tasks[0].id, 'hello', 'source order remains unchanged');
});

test('an empty workbench has no progress or history groups', () => {
  assert.deepEqual(groupBotProgress([], [], []), { attention: [], active: [], ended: [], conversations: [] });
});
