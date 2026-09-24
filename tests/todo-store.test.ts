import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Store } from '../modules/todo/store';
import { activeToday, insightTarget, newTask, openToday, taskInputSchema, taskPatchSchema, type Task } from '../shared/todo-contracts';

test('openToday excludes completed tasks and meetings while activeToday keeps them', () => {
  const day = '2026-09-21';
  const mk = (title: string, extra: Partial<Task> = {}): Task => ({ ...newTask(title), id: title, createdAt: '2026-09-21T00:00:00.000Z', updatedAt: '2026-09-21T00:00:00.000Z', completedAt: null, notifiedFor: null, deletedAt: null, ...extra });
  const items = [
    mk('没做完', { plannedDate: day, dueAt: `${day}T09:00:00+08:00` }),
    mk('做完了', { plannedDate: day, dueAt: `${day}T10:00:00+08:00`, status: 'done', completedAt: `${day}T04:00:00.000Z` }),
    mk('开完的会', { plannedDate: day, kind: 'meeting', dueAt: `${day}T10:00:00+08:00`, status: 'done', completedAt: `${day}T04:30:00.000Z` }),
    mk('要开的会', { plannedDate: day, kind: 'meeting', dueAt: `${day}T11:00:00+08:00` }),
  ];
  assert.deepEqual(openToday(items, day).map(task => task.id), ['没做完', '要开的会']);
  assert.ok(activeToday(items, day).some(task => task.status === 'done'), 'activeToday 仍含已完成（事项库视图依赖）');
});

test('insightTarget picks globally: soonest meeting, then soonest task, then ordering hint', () => {
  const mk = (title: string, extra: Partial<Task> = {}): Task => ({ ...newTask(title), id: title, createdAt: '2026-09-22T00:00:00.000Z', updatedAt: '2026-09-22T00:00:00.000Z', completedAt: null, notifiedFor: null, deletedAt: null, ...extra });
  const now = new Date('2026-09-22T10:00:00+08:00');
  // 最紧急的临近日程优先于更早的临近待办
  const withMeeting = [
    mk('待办A', { plannedDate: '2026-09-22', dueAt: '2026-09-22T10:30:00+08:00' }),
    mk('临近的会', { plannedDate: '2026-09-22', kind: 'meeting', dueAt: '2026-09-22T10:40:00+08:00' }),
  ];
  const meetingPick = insightTarget(withMeeting, now);
  assert.equal(meetingPick?.title, '临近的会');
  assert.match(meetingPick?.context ?? '', /留出会前准备/);
  // 无临近日程时选截止最近的待办；逾期转「重新安排」
  const taskPick = insightTarget([mk('逾期件', { plannedDate: '2026-09-22', dueAt: '2026-09-22T09:00:00+08:00' }), mk('临期件', { plannedDate: '2026-09-22', dueAt: '2026-09-22T11:00:00+08:00' })], now);
  assert.equal(taskPick?.title, '逾期件');
  assert.match(taskPick?.context ?? '', /重新安排/);
  // 一小时后的会（>60 分钟）不触发日程建议，落到临期待办
  const laterMeeting = insightTarget([mk('待办B', { plannedDate: '2026-09-22', dueAt: '2026-09-22T11:20:00+08:00' }), mk('稍后的会', { plannedDate: '2026-09-22', kind: 'meeting', dueAt: '2026-09-22T12:00:00+08:00' })], now);
  assert.equal(laterMeeting?.title, '待办B');
  // 无临近目标且 ≥3 项时给排序建议；不足 3 项则不显示
  const many = [mk('甲'), mk('乙'), mk('丙')];
  assert.equal(insightTarget(many, now)?.title, '今日剩余的 3 项');
  assert.equal(insightTarget([mk('甲'), mk('乙')], now), null);
});

test('partial task updates preserve omitted category and progress while explicit null clears them', () => {
  assert.deepEqual(taskPatchSchema.parse({ status: 'done' }), { status: 'done' });
  assert.deepEqual(taskPatchSchema.parse({}), {});
  const store = new Store(':memory:');
  try {
    const category = store.createCategory({ name: '保留标签', color: '#335577' });
    const task = store.create({ ...newTask('保留进度'), categoryId: category.id, progress: 45 });
    const completed = store.update(task.id, { status: 'done' }, task.updatedAt);
    assert.equal(completed.categoryId, category.id); assert.equal(completed.progress, 45);
    store.applyPlan({ message: '只改标题', actions: [{ type: 'update', id: task.id, patch: { title: '新标题' } }] }, new Map([[task.id, completed.updatedAt]]));
    assert.equal(store.get(task.id).categoryId, category.id); assert.equal(store.get(task.id).progress, 45);
    const cleared = store.update(task.id, { categoryId: null, progress: null });
    assert.equal(cleared.categoryId, null); assert.equal(cleared.progress, null);
    const { categoryId: _category, progress: _progress, ...legacyInput } = newTask('旧版输入');
    assert.equal(store.create(legacyInput).categoryId, null); assert.equal(store.create(legacyInput).progress, null);
  } finally { store.close(); }
});

test('chat sessions, drafts and completed tool output survive restart; pending work expires', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-chat-test-')), 'tasks.db');
  let store = new Store(file);
  const chat = store.newChat();
  chat.title = '讨论下周安排'; chat.draft = '未发送草稿';
  chat.entries = [
    { id: randomUUID(), role: 'user', content: '安排下周日程' },
    { id: randomUUID(), role: 'assistant', content: '请确认', proposal: { token: 'old-token', message: '请确认', actions: [{ type: 'create', task: newTask('日程') }] }, actionState: 'pending', tools: [{ id: 'tool-1', name: 'list_tasks', label: '读取事项和标签', status: 'complete', output: '已有事项' }] },
    { id: randomUUID(), role: 'assistant', content: '生成到一半', streaming: true, tools: [{ id: 'tool-2', name: 'propose_create', label: '新增建议', status: 'running', output: '' }] },
  ];
  store.saveChat(chat);
  const other = store.newChat(); store.close();
  store = new Store(file);
  try {
    const recovered = store.chat(chat.id);
    assert.equal(store.chats().length, 2);
    assert.equal(store.setting('activeChatId', ''), other.id);
    assert.equal(recovered.draft, '未发送草稿');
    assert.equal(recovered.entries[1].actionState, 'expired');
    assert.equal(recovered.entries[1].tools?.[0].output, '已有事项');
    assert.equal(recovered.entries[2].streaming, false);
    assert.match(recovered.entries[2].error ?? '', /中断/);
    assert.equal(recovered.entries[2].tools?.[0].status, 'interrupted');
    assert.equal(store.resolveChatProposal('old-token', 'applied'), undefined);
    assert.equal(store.all().length, 0);
  } finally { store.close(); }
});

test('deleting the open chat opens the next one, and the last chat becomes an empty conversation', () => {
  const store = new Store(':memory:');
  try {
    const first = store.newChat();
    first.title = '第一则';
    store.saveChat(first);
    const second = store.newChat();
    second.title = '第二则';
    store.saveChat(second);
    const opened = store.deleteChat(second.id);
    assert.equal(opened.id, first.id);
    assert.equal(store.setting('activeChatId', ''), first.id);
    assert.equal(store.chats().map(item => item.id).includes(second.id), false);
    const kept = store.newChat();
    const stayed = store.deleteChat(first.id);
    assert.equal(stayed.id, kept.id);
    const empty = store.deleteChat(kept.id);
    assert.equal(empty.title, '新对话');
    assert.equal(empty.entries.length, 0);
    assert.equal(store.chats().length, 1);
    assert.throws(() => store.deleteChat(first.id), /不存在/);
  } finally { store.close(); }
});

test('applying chat proposal and durable acknowledgement commit together', () => {
  const store = new Store(':memory:');
  try {
    const plan = { token: 'proposal-token', message: '请确认', actions: [{ type: 'create' as const, task: newTask('持久事项') }] };
    const chat = store.newChat();
    chat.entries = [{ id: randomUUID(), role: 'assistant', content: plan.message, proposal: plan, actionState: 'pending' }];
    store.saveChat(chat);
    store.applyPlan({ message: plan.message, actions: plan.actions }, new Map(), plan.token);
    assert.equal(store.chat(chat.id).entries[0].actionState, 'applied');
    assert.equal(store.all()[0].title, '持久事项');
    const next = store.newChat(); next.entries = [{ id: randomUUID(), role: 'assistant', content: '失败', error: '已取消生成', tools: [{ id: 'tool', name: 'list_tasks', label: '读取', status: 'interrupted', output: '' }] }];
    store.saveChat(next);
    store.recoverChats();
    assert.equal(store.chat(next.id).entries[0].error, '已取消生成');
  } finally { store.close(); }
});

test('AI remove action soft-deletes with revision guard and rejects stale or missing tasks', () => {
  const store = new Store(':memory:');
  try {
    const task = store.create(newTask('要删除的事项'));
    const keep = store.create(newTask('保留的事项'));
    store.applyPlan({ message: '删除', actions: [{ type: 'remove', id: task.id }] }, new Map([[task.id, task.updatedAt], [keep.id, keep.updatedAt]]));
    assert.equal(store.get(task.id).deletedAt !== null, true);
    assert.equal(activeToday(store.all(), task.plannedDate).some(item => item.id === task.id), false);
    assert.equal(store.get(keep.id).deletedAt, null);
    assert.throws(() => store.applyPlan({ message: '过期', actions: [{ type: 'remove', id: keep.id }] }, new Map([[keep.id, keep.updatedAt + 'Z']])), /已变化|已更新/);
    assert.throws(() => store.applyPlan({ message: '不存在', actions: [{ type: 'remove', id: randomUUID() }] }, new Map()), /不存在|已变化/);
  } finally { store.close(); }
});

test('pending chat proposals can be edited or superseded before confirmation', () => {
  const store = new Store(':memory:');
  try {
    const first = { token: 'proposal-edit', message: '请确认', actions: [{ type: 'create' as const, task: newTask('原建议') }] };
    const chat = store.newChat();
    chat.entries = [{ id: randomUUID(), role: 'assistant', content: first.message, proposal: first, actionState: 'pending' }];
    store.saveChat(chat);
    const editedActions = [{ type: 'create' as const, task: newTask('手动编辑后的建议') }];
    const edited = store.updateChatProposal(first.token, editedActions);
    assert.equal(edited.entries[0].proposal?.actions[0].type, 'create');
    assert.equal(edited.entries[0].proposal?.actions[0].type === 'create' ? edited.entries[0].proposal.actions[0].task.title : '', '手动编辑后的建议');
    assert.equal(store.resolveChatProposal(first.token, 'revised')?.entries[0].actionState, 'revised');
    assert.throws(() => store.updateChatProposal(first.token, editedActions), /已应用或已过期/);
  } finally { store.close(); }
});

test('task date and title validation rejects invalid input', () => {
  assert.equal(taskInputSchema.safeParse(newTask('   ')).success, false);
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), plannedDate: '2026-02-30' }).success, false);
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), remindAt: 'tomorrow' }).success, false);
  assert.equal(newTask('报告').priority, 'medium');
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), priority: 'low' }).success, true);
  assert.equal(taskInputSchema.safeParse({ ...newTask('报告'), priority: 'normal' }).success, false);
});
test('SQLite persists tasks and settings after reopening', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-store-test-')), 'tasks.db');
  let store = new Store(file); const task = store.create(newTask('报告'));
  store.setSetting('position', { x: 120, y: 50 }); store.close(); store = new Store(file);
  assert.equal(store.get(task.id).title, '报告'); assert.deepEqual(store.setting('position', null), { x: 120, y: 50 }); store.close();
});
test('custom categories persist, enforce unique names, and detach tasks when deleted', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-category-test-')), 'tasks.db');
  let store = new Store(file); const category = store.createCategory({ name: '工作', color: '#b55232' });
  const task = store.create({ ...newTask('分类事项'), categoryId: category.id });
  assert.throws(() => store.createCategory({ name: ' 工作 ', color: '#111111' }), /同名标签/);
  store.close(); store = new Store(file);
  assert.equal(store.categories()[0].name, '工作'); assert.equal(store.get(task.id).categoryId, category.id);
  const updated = store.updateCategory(category.id, { name: '项目', color: '#335577' }, category.updatedAt);
  store.removeCategory(updated.id, updated.updatedAt);
  assert.equal(store.categories().length, 0); assert.equal(store.get(task.id).categoryId, null); store.close();
});
test('old task records without category fields remain readable as uncategorized', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('旧版本事项'));
  const legacy = { ...task } as Partial<typeof task>; delete legacy.categoryId;
  store.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify(legacy), task.id);
  assert.equal(store.get(task.id).categoryId, null); store.close();
});
test('legacy normal priority loads as medium', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('旧优先级'));
  store.db.prepare('UPDATE tasks SET payload=? WHERE id=?').run(JSON.stringify({ ...task, priority: 'normal' }), task.id);
  assert.equal(store.get(task.id).priority, 'medium'); store.close();
});
test('reminders survive restart and are deduplicated by scheduled occurrence', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-reminder-test-')), 'tasks.db');
  let store = new Store(file);
  const task = store.create({ ...newTask('开会'), dueAt: '2026-09-14T15:00:00+08:00', remindAt: '2026-09-14T14:50:00+08:00' });
  assert.equal(store.due(new Date('2026-09-14T14:49:00+08:00')).length, 0);
  const due = store.due(new Date('2026-09-14T14:51:00+08:00')); assert.equal(due.length, 1); store.markNotified(due); store.close();
  store = new Store(file); assert.equal(store.due(new Date('2026-09-15T00:00:00+08:00')).length, 0);
  store.update(task.id, { remindAt: '2026-09-15T14:50:00+08:00' });
  assert.equal(store.due(new Date('2026-09-15T15:00:00+08:00')).length, 1); store.close();
});
test('completion/deletion suppress alarms; snooze preserves original deadline', () => {
  const store = new Store(':memory:'); const now = new Date('2026-09-14T15:00:00Z');
  const task = store.create({ ...newTask('报告'), dueAt: '2026-09-14T14:00:00Z', remindAt: '2026-09-14T13:00:00Z' });
  const snoozed = store.snooze(task.id, now); assert.equal(snoozed.dueAt, task.dueAt); assert.equal(snoozed.remindAt, '2026-09-14T15:10:00.000Z');
  assert.equal(store.due(now).length, 0);
  const done = store.update(task.id, { status: 'done' }); assert.equal(store.due(new Date('2026-09-15')).length, 0);
  const reopened = store.update(task.id, { status: 'todo' }, done.updatedAt); store.remove(task.id, reopened.updatedAt);
  assert.equal(store.all().length, 0); assert.equal(store.all(true).length, 1); assert.equal(store.due(new Date('2026-09-15')).length, 0);
  store.restore(task.id); assert.equal(store.all().length, 1); store.close();
});
test('stale edit is rejected instead of overwriting newer changes', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('报告')); store.update(task.id, { title: '报告新版' }, task.updatedAt);
  assert.throws(() => store.update(task.id, { title: '旧请求' }, task.updatedAt), /已在其他操作中更新/);
  assert.equal(store.get(task.id).title, '报告新版'); store.close();
});
test('AI operation group rolls back when an update targets a deleted task', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('旧事项')); store.remove(task.id, task.updatedAt);
  const deleted = store.get(task.id);
  assert.throws(() => store.applyPlan({ message: '操作', actions: [{ type: 'create', task: newTask('不应留下') }, { type: 'update', id: task.id, patch: { title: '修改' } }] }, new Map([[task.id, deleted.updatedAt]])), /已删除/);
  assert.equal(store.all().length, 0); store.close();
});
test('AI rejects stale and nonexistent task references', () => {
  const store = new Store(':memory:'); const task = store.create(newTask('报告')); store.update(task.id, { title: '新版' });
  assert.throws(() => store.applyPlan({ message: '', actions: [{ type: 'update', id: task.id, patch: { status: 'done' } }] }, new Map([[task.id, task.updatedAt]])), /已变化/);
  assert.throws(() => store.get(randomUUID()), /不存在/); store.close();
});
test('AI plan can create, update, and delete categories in one confirm group', () => {
  const store = new Store(':memory:');
  const existing = store.createCategory({ name: '工作', color: '#b55232' });
  const task = store.create({ ...newTask('旧事项'), categoryId: existing.id });
  const createdId = '11111111-1111-4111-8111-111111111111';
  store.applyPlan({
    message: '调整分类',
    actions: [
      { type: 'create', task: { ...newTask('学习待办'), categoryId: createdId } },
      { type: 'create_category', category: { id: createdId, name: '学习', color: '#335577' } },
      { type: 'update_category', id: existing.id, patch: { name: '项目' } },
    ],
  }, new Map([[existing.id, existing.updatedAt]]));
  assert.equal(store.getCategory(createdId).name, '学习');
  assert.equal(store.get(task.id).categoryId, existing.id);
  assert.equal(store.categories().find(category => category.id === existing.id)?.name, '项目');
  assert.equal(store.all().find(item => item.title === '学习待办')?.categoryId, createdId);
  const project = store.getCategory(existing.id);
  store.applyPlan({ message: '删除', actions: [{ type: 'remove_category', id: project.id }] }, new Map([[project.id, project.updatedAt]]));
  assert.equal(store.hasCategory(project.id), false);
  assert.equal(store.get(task.id).categoryId, null);
  store.close();
});
test('AI category plan rolls back on stale category revision', () => {
  const store = new Store(':memory:');
  const category = store.createCategory({ name: '工作', color: '#b55232' });
  store.updateCategory(category.id, { name: '项目', color: category.color }, category.updatedAt);
  assert.throws(() => store.applyPlan({
    message: '',
    actions: [{ type: 'create_category', category: { id: randomUUID(), name: '学习', color: '#111111' } }, { type: 'update_category', id: category.id, patch: { name: '旧名' } }],
  }, new Map([[category.id, category.updatedAt]])), /标签已变化/);
  assert.equal(store.categories().some(item => item.name === '学习'), false);
  store.close();
});
test('today includes carried-over work without duplicating task IDs or changing deadlines', () => {
  const store = new Store(':memory:'); const old = store.create({ ...newTask('跨天事项'), plannedDate: '2026-09-10' });
  const futureTodo = store.create({ ...newTask('未来事项'), plannedDate: '2026-09-20' });
  store.create({ ...newTask('未来日程'), kind: 'meeting', plannedDate: '2026-09-20', dueAt: '2026-09-20T09:00:00+08:00' });
  assert.deepEqual(new Set(activeToday(store.all(), '2026-09-14').map(t => t.id)), new Set([old.id, futureTodo.id]));
  assert.equal(store.get(old.id).plannedDate, '2026-09-10'); store.close();
});
test('open todos stay visible before the deadline; meetings follow the event day', () => {
  const store = new Store(':memory:');
  const long = store.create({ ...newTask('长任务'), plannedDate: '2026-09-26' });
  const meeting = store.create({ ...newTask('周会'), kind: 'meeting', plannedDate: '2026-09-26', dueAt: '2026-09-26T10:00:00+08:00' });
  const overdue = store.create({ ...newTask('昨天的会'), kind: 'meeting', plannedDate: '2026-09-10', dueAt: '2026-09-10T10:00:00+08:00' });
  const ids = new Set(activeToday(store.all(), '2026-09-20').map(t => t.id));
  assert.equal(ids.has(long.id), true);
  assert.equal(ids.has(meeting.id), false);
  assert.equal(ids.has(overdue.id), true);
  store.close();
});
