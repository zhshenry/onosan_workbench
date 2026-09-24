import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../modules/todo/store';
import { newTask } from '../shared/todo-contracts';

// 工作台与 To-Do-List 共享同一个 tasks.db(WAL 多进程):
// 本文件用两个同时打开的 Store 连接模拟两个应用,验证互见性与并发写安全。
test('two app connections on one db file see each other\'s writes (cross-app sharing)', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-shared-test-')), 'tasks.db');
  const todoList = new Store(file);   // 模拟 To-Do-List 进程
  const workbench = new Store(file, 'shared-tasks');  // 模拟工作台进程
  try {
    // To-Do-List 侧创建,工作台侧立即可见
    const task = todoList.create({ ...newTask('上游创建的事项'), plannedDate: '2026-09-23' });
    assert.equal(workbench.all().length, 1);
    assert.equal(workbench.get(task.id).title, '上游创建的事项');

    // 工作台侧完成事项,To-Do-List 侧看到新状态与单调递增的 updatedAt
    const done = workbench.update(task.id, { status: 'done' }, task.updatedAt);
    assert.equal(todoList.get(task.id).status, 'done');
    assert.ok(Date.parse(todoList.get(task.id).updatedAt) >= Date.parse(task.updatedAt));

    // 乐观锁跨进程生效:To-Do-List 用旧 revision 提交会被拒绝而不是覆盖
    assert.throws(() => todoList.update(task.id, { title: '旧请求' }, task.updatedAt), /已在其他操作中更新/);
    assert.equal(workbench.get(task.id).title, '上游创建的事项');

    // 双方各自创建互不干扰,合计可见
    workbench.create(newTask('工作台创建的事项'));
    todoList.create(newTask('又一条上游事项'));
    assert.deepEqual(new Set(workbench.all().map(t => t.title)), new Set(['上游创建的事项', '工作台创建的事项', '又一条上游事项']));
    assert.equal(todoList.all().length, 3);

    // 软删除与恢复同样跨进程可见
    const removing = workbench.all().find(t => t.title === '又一条上游事项')!;
    workbench.remove(removing.id, removing.updatedAt);
    assert.equal(todoList.all().length, 2);
    assert.equal(todoList.all(true).length, 3);
  } finally {
    todoList.close();
    workbench.close();
  }
});

// 提醒认领:多进程同时轮询同一共享库时,notifiedFor 的原子抢占保证只弹一次
test('reminder claiming is mutually exclusive across connections, and unclaim restores it', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-claim-test-')), 'tasks.db');
  const appA = new Store(file);
  const appB = new Store(file);
  try {
    const now = '2026-09-23T10:00:00Z';
    appA.create({ ...newTask('到点提醒我'), remindAt: now });
    const dueAt = new Date(now);
    // 双方先后认领:只有第一方拿到
    const first = appA.claimDue(dueAt);
    assert.equal(first.length, 1);
    assert.equal(appB.claimDue(dueAt).length, 0);
    assert.equal(appA.claimDue(dueAt).length, 0); // 自己也不重复
    // due() 也不再返回(上游语义一致)
    assert.equal(appB.due(dueAt).length, 0);
    // 通知失败归还后,下一轮(任意一方)可重新认领
    appA.unclaim(first[0]);
    assert.equal(appB.due(dueAt).length, 1);
    assert.equal(appB.claimDue(dueAt).length, 1);
    // 改期后 remindAt 变化,重新可提醒
    const rescheduled = appA.update(first[0].id, { remindAt: '2026-09-23T11:00:00Z' });
    assert.equal(appA.claimDue(new Date('2026-09-23T11:01:00Z')).length, 1);
    assert.ok(rescheduled);
  } finally {
    appA.close();
    appB.close();
  }
});

test('workbench opening the shared database leaves To-Do-List chats and schema metadata untouched', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-shared-chat-test-')), 'tasks.db');
  const todoList = new Store(file);
  const chat = todoList.newChat();
  chat.entries = [{ id: 'pending-entry', role: 'assistant', content: '请确认', actionState: 'pending' }];
  todoList.saveChat(chat);
  todoList.close();

  const workbench = new Store(file, 'shared-tasks');
  try {
    assert.equal(workbench.chat(chat.id).entries[0].actionState, 'pending');
    assert.equal((workbench.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
  } finally { workbench.close(); }

  const newer = new DatabaseSync(file);
  newer.exec('PRAGMA user_version=4;');
  newer.close();
  assert.throws(() => new Store(file, 'shared-tasks'), /版本 4/);
  const unchanged = new DatabaseSync(file);
  try {
    assert.equal((unchanged.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 4);
    const row = unchanged.prepare('SELECT payload FROM chats WHERE id=?').get(chat.id) as { payload: string };
    assert.equal(JSON.parse(row.payload).entries[0].actionState, 'pending');
  }
  finally { unchanged.close(); }
});

test('workbench can create a fresh tasks-only shared database', () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'todo-shared-new-test-')), 'tasks.db');
  const workbench = new Store(file, 'shared-tasks');
  try {
    const tables = (workbench.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]).map(row => row.name);
    assert.deepEqual(tables.sort(), ['categories', 'tasks']);
    assert.equal((workbench.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version, 3);
  } finally { workbench.close(); }
});
