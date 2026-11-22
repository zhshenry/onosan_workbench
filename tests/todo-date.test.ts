import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { Store } from '../modules/todo/store';
import { migrateTaskDates } from '../modules/todo/date-migration';
import { hasTaskTime, localDay, migrateTaskDate, taskDay } from '../shared/todo-date';
import { newTask, taskInputSchema } from '../shared/todo-contracts';
import { isOverdue, scheduleStamp } from '../shared/todo-format';
import { taskSnapshot, buildTodoContribution } from '../modules/todo/ai-tools';

const legacy = (patch: Record<string, unknown> = {}) => {
  const { dateAt, ...fields } = newTask('旧事项');
  return { ...fields, id: randomUUID(), plannedDate: '2026-09-20', dueAt: null,
    createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-01T00:00:00Z', completedAt: null, deletedAt: null, notifiedFor: null, ...patch };
};

test('one optional date supports no date, calendar-only and a precise deadline without requiring an end', () => {
  const store = new Store(':memory:');
  try {
    for (const dateAt of [null, '2026-12-15', '2026-12-15T23:59:00+08:00']) {
      const task = store.create({ ...newTask('学习'), dateAt });
      assert.equal(task.dateAt, dateAt);
      assert.equal(task.endAt, null);
      assert.equal(task.remindAt, null);
      assert.equal(hasTaskTime(dateAt), Boolean(dateAt?.includes('T')));
      assert.equal(Object.hasOwn(task, 'plannedDate'), false);
      assert.equal(Object.hasOwn(task, 'dueAt'), false);
    }
    const undated = store.create(newTask('未安排'));
    assert.equal(isOverdue(undated, new Date(2100, 0, 1).getTime()), false);
    assert.equal(scheduleStamp(undated), '未设置日期');
    assert.equal(taskDay(undated), null);
    assert.equal(taskInputSchema.safeParse({ ...newTask('旧参数'), plannedDate: '2026-09-20' }).success, false);
  } finally { store.close(); }
});

test('a calendar-only deadline lasts through the local day and does not invent midnight', () => {
  const task = { ...newTask('仅日期'), dateAt: '2026-12-15' };
  assert.equal(taskDay(task), '2026-12-15');
  assert.equal(isOverdue(task, new Date(2026, 11, 15, 23, 59, 59, 999).getTime()), false);
  assert.equal(isOverdue(task, new Date(2026, 11, 16).getTime()), true);
  const point = { ...task, dateAt: '2026-12-15T12:00:00+08:00' };
  assert.equal(taskDay(point), localDay(new Date(point.dateAt)));
  assert.equal(isOverdue(point, Date.parse(point.dateAt) + 1), true);
});

test('meeting ranges still require endpoints; reminders and snooze do not change the item date', () => {
  const store = new Store(':memory:');
  try {
    assert.throws(() => store.create({ ...newTask('会议'), kind: 'meeting' }), /请设置日程时间/);
    const allDay = store.create({ ...newTask('全天日程'), kind: 'meeting', dateAt: '2026-12-15' });
    assert.equal(allDay.endAt, null);
    const meeting = store.create({ ...newTask('会议'), kind: 'meeting', dateAt: '2026-12-15T10:00:00+08:00', endAt: '2026-12-15T11:00:00+08:00' });
    assert.equal(isOverdue(meeting, Date.parse(meeting.dateAt!) + 30 * 60000), false);
    const task = store.create({ ...newTask('提醒'), dateAt: '2026-12-15', remindAt: '2026-12-14T09:00:00+08:00' });
    const snoozed = store.snooze(task.id, new Date('2026-12-14T09:00:00+08:00'));
    assert.equal(snoozed.dateAt, task.dateAt);
    assert.notEqual(snoozed.remindAt, task.remindAt);
    const cleared = store.update(task.id, { dateAt: null }, snoozed.updatedAt);
    assert.equal(cleared.remindAt, snoozed.remindAt);
    assert.equal(isOverdue(cleared), false);
  } finally { store.close(); }
});

test('v3 migration prefers an explicit deadline, keeps metadata and backs up original payloads exactly once', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE categories (id TEXT PRIMARY KEY,payload TEXT NOT NULL); PRAGMA user_version=3;');
    const records = [legacy({ dueAt: '2026-12-15T23:59:00+08:00', remindAt: '2026-12-14T09:00:00+08:00' }), legacy(), legacy({ kind: 'meeting', dueAt: '2026-11-17T09:00:00+08:00', endAt: '2026-11-17T10:00:00+08:00', source: 'welink', welinkMeetingId: 42, external: { provider: 'calendar', account: 'fixture', itemId: 'fixture-event' }, status: 'done', completedAt: '2026-11-17T03:00:00Z', deletedAt: '2026-11-17T04:00:00Z', notifiedFor: 'fixture-occurrence' })];
    for (const record of records) db.prepare('INSERT INTO tasks VALUES (?,?)').run(record.id, JSON.stringify(record));
    migrateTaskDates(db);
    for (const record of records) {
      const saved = JSON.parse((db.prepare('SELECT payload FROM tasks WHERE id=?').get(record.id) as { payload: string }).payload);
      assert.deepEqual(saved, migrateTaskDate(record));
      const backup = db.prepare('SELECT payload FROM todo_date_backup_v3 WHERE id=?').get(record.id) as { payload: string };
      assert.equal(backup.payload, JSON.stringify(record));
    }
    migrateTaskDates(db);
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 4);
    assert.equal((db.prepare('SELECT COUNT(*) AS count FROM todo_date_backup_v3').get() as { count: number }).count, records.length);
    assert.equal(migrateTaskDate(records[0]).dateAt, records[0].dueAt);
    assert.equal(migrateTaskDate(records[1]).dateAt, records[1].plannedDate);
    assert.equal(migrateTaskDate({ ...records[0], dateAt: null }).dateAt, null, 'Clearing the date cannot revive an old deadline');
  } finally { db.close(); }
});

test('a malformed legacy date rolls the entire migration back', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE tasks (id TEXT PRIMARY KEY,payload TEXT NOT NULL); PRAGMA user_version=3;');
    const records = [legacy(), legacy({ dueAt: 'invalid-time' })];
    for (const record of records) db.prepare('INSERT INTO tasks VALUES (?,?)').run(record.id, JSON.stringify(record));
    assert.throws(() => migrateTaskDates(db));
    assert.equal((db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
    for (const record of records) assert.equal((db.prepare('SELECT payload FROM tasks WHERE id=?').get(record.id) as { payload: string }).payload, JSON.stringify(record));
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='todo_date_backup_v3'").get(), undefined);
  } finally { db.close(); }
});

test('AI tools and snapshots expose the single date and accept an undated todo', async () => {
  const store = new Store(':memory:');
  try {
    const task = store.create({ ...newTask('截止事项'), dateAt: '2026-12-15' });
    const snapshot = taskSnapshot([task], []);
    assert.equal(snapshot.context[0].dateAt, task.dateAt);
    assert.equal(Object.hasOwn(snapshot.context[0], 'plannedDate'), false);
    assert.equal(Object.hasOwn(snapshot.context[0], 'dueAt'), false);
    const contribution = buildTodoContribution([task], []);
    const create = contribution.buildTools().find(tool => tool.name === 'propose_create')!;
    await create.execute('undated-test', { title: '不设日期' });
    const [action] = contribution.collect();
    assert.equal(action.type, 'create');
    if (action.type === 'create') assert.equal(action.task.dateAt, null);
  } finally { store.close(); }
});
