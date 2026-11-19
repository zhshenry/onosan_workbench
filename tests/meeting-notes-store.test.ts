import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { MeetingNotesStore } from '../modules/todo/meeting-notes-store';
import { Store } from '../modules/todo/store';
import { newTask } from '../shared/todo-contracts';
import { emptyMeetingNote, meetingNoteStatus, meetingTimeStatus } from '../shared/meeting-notes';

function fixture(run: (notes: MeetingNotesStore, tasks: Store, meetingId: string, dir: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), 'ono-meeting-notes-'));
  const tasks = new Store(join(dir, 'tasks.db'), 'shared-tasks');
  const meeting = tasks.create({ ...newTask('产品评审'), kind: 'meeting', dateAt: '2026-11-17T14:00:00+08:00', endAt: '2026-11-17T15:00:00+08:00' });
  const notes = new MeetingNotesStore(dir, tasks);
  try { run(notes, tasks, meeting.id, dir); } finally { notes.close(); tasks.close(); rmSync(dir, { recursive: true, force: true }); }
}
test('会议纪要独立持久化，不修改共享表结构和原备注；改名改期和完成后仍可读取', () => fixture((notes, tasks, id, dir) => {
  const note = notes.save(id, { ...emptyMeetingNote(), body: '<h2>会议结论</h2><p>保留真实记录</p>' }, 0);
  assert.equal(note.revision, 1);
  assert.equal(tasks.get(id).note, '');
  assert.deepEqual((tasks.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name).sort(), ['categories', 'tasks']);
  tasks.update(id, { title: '改名后的评审', status: 'done' });
  const reopened = new MeetingNotesStore(dir, tasks);
  try { assert.deepEqual(reopened.get(id), note); assert.equal(meetingNoteStatus(note), '记录中'); } finally { reopened.close(); }
  assert.throws(() => notes.save(id, { ...note, meetingId: undefined }, 1));
}));
test('保存校验、版本冲突不覆盖已有纪要，空纪要不能标记已整理', () => fixture((notes, _tasks, id) => {
  const first = notes.save(id, { ...emptyMeetingNote(), organized: true }, 0);
  assert.equal(first.organized, false);
  assert.throws(() => notes.save(id, { ...emptyMeetingNote(), body: '迟到的旧稿' }, 0), /已在其他操作中更新/);
  assert.deepEqual(notes.get(id), first);
  assert.throws(() => notes.save(id, { ...emptyMeetingNote(), body: 'x'.repeat(200001) }, 1));
  const action = { id: randomUUID(), title: '核对接口' };
  assert.throws(() => notes.save(id, { ...emptyMeetingNote(), actions: [action, action] }, 1));
  assert.throws(() => notes.save(id, { ...emptyMeetingNote(), actions: [{ ...action, taskId: randomUUID() }] }, 1));
}));
test('行动项复用真实待办创建，重复确认幂等，后续保存保留链接', () => fixture((notes, tasks, id) => {
  const action = { id: randomUUID(), title: '整理反馈' };
  const first = notes.save(id, { ...emptyMeetingNote(), actions: [action] }, 0);
  const linked = notes.createTask(id, action.id, newTask('整理反馈'), first.revision);
  assert.equal(tasks.all().length, 2);
  assert.equal(tasks.get(linked.actions[0].taskId!).title, '整理反馈');
  assert.deepEqual(notes.createTask(id, action.id, newTask('不得重复'), first.revision), linked);
  assert.equal(tasks.all().length, 2);
  const saved = notes.save(id, { body: '<p>补充记录</p>', organized: true, actions: [action] }, linked.revision);
  assert.equal(saved.actions[0].taskId, linked.actions[0].taskId);
  assert.equal(meetingNoteStatus(saved), '已整理');
  assert.throws(() => notes.save(id, emptyMeetingNote(), saved.revision), /已关联待办/);
}));
test('关联纪要写入失败会回滚新建待办，失败后重试只创建一次', () => fixture((notes, tasks, id) => {
  const action = { id: randomUUID(), title: '需要跟进' };
  const note = notes.save(id, { ...emptyMeetingNote(), actions: [action] }, 0);
  notes.db.exec('PRAGMA query_only=1');
  assert.throws(() => notes.createTask(id, action.id, newTask(action.title), note.revision));
  assert.equal(tasks.all().length, 1);
  notes.db.exec('PRAGMA query_only=0');
  const linked = notes.createTask(id, action.id, newTask(action.title), note.revision);
  assert.ok(linked.actions[0].taskId); assert.equal(tasks.all().length, 2);
}));
test('删除日程保留纪要但禁止继续写，恢复同一日程后继续原记录', () => fixture((notes, tasks, id) => {
  const note = notes.save(id, { ...emptyMeetingNote(), body: '<p>原始内容</p>' }, 0);
  tasks.remove(id, tasks.get(id).updatedAt);
  assert.throws(() => notes.save(id, emptyMeetingNote(), note.revision), /已删除/);
  assert.deepEqual(notes.get(id), note);
  tasks.restore(id);
  assert.equal(notes.save(id, { ...emptyMeetingNote(), body: '<p>恢复后补充</p>' }, note.revision).revision, 2);
}));
test('会议时间与纪要状态独立，提醒和结束边界使用实际时间', () => {
  const task = { ...newTask('会议'), id: randomUUID(), kind: 'meeting' as const, dateAt: '2026-11-17T14:00:00+08:00', endAt: '2026-11-17T15:00:00+08:00', createdAt: '', updatedAt: '', completedAt: null, deletedAt: null, notifiedFor: null };
  assert.equal(meetingTimeStatus(task, Date.parse('2026-11-17T13:50:00+08:00')).label, '10分钟后开始');
  assert.equal(meetingTimeStatus(task, Date.parse('2026-11-17T14:00:00+08:00')).label, '进行中');
  assert.equal(meetingTimeStatus(task, Date.parse('2026-11-17T15:00:00+08:00')).label, '已结束');
  assert.equal(meetingNoteStatus(), '未记录');
});
