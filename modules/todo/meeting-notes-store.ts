import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { hasMeetingNotes, meetingNoteDraftSchema, type MeetingNote } from '../../shared/meeting-notes';
import { taskInputSchema } from '../../shared/todo-contracts';
import type { Store } from './store';

/** Workbench-owned notes; never adds columns or tables to the shared todo database. */
export class MeetingNotesStore {
  readonly db: DatabaseSync;
  constructor(dir: string, private readonly tasks: Store) {
    mkdirSync(dir, { recursive: true });
    this.db = new DatabaseSync(join(dir, 'meeting-notes.db'));
    this.db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000; CREATE TABLE IF NOT EXISTS meeting_notes (meeting_id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
  }
  all(): MeetingNote[] {
    return (this.db.prepare('SELECT payload FROM meeting_notes').all() as { payload: string }[]).map(row => JSON.parse(row.payload) as MeetingNote);
  }
  get(id: string): MeetingNote | undefined {
    const row = this.db.prepare('SELECT payload FROM meeting_notes WHERE meeting_id=?').get(id) as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as MeetingNote : undefined;
  }
  private meeting(id: string): void {
    z.string().uuid().parse(id);
    const task = this.tasks.get(id);
    if (task.deletedAt || task.kind !== 'meeting') throw new Error('日程已删除或已改为待办，纪要仍保留');
  }
  private put(note: MeetingNote): MeetingNote {
    this.db.prepare('INSERT OR REPLACE INTO meeting_notes(meeting_id,payload) VALUES (?,?)').run(note.meetingId, JSON.stringify(note));
    return note;
  }
  save(id: string, input: unknown, revision: number): MeetingNote {
    this.meeting(id);
    const draft = meetingNoteDraftSchema.parse(input), old = this.get(id);
    if ((old?.revision ?? 0) !== revision) throw new Error('纪要已在其他操作中更新，请载入新版本或保留本地稿');
    const links = new Map(old?.actions.map(action => [action.id, action.taskId]));
    if (old?.actions.some(action => action.taskId && !draft.actions.some(next => next.id === action.id))) throw new Error('已关联待办的行动项需要保留');
    return this.put({ ...draft, organized: draft.organized && hasMeetingNotes(draft), meetingId: id,
      actions: draft.actions.map(action => ({ ...action, taskId: links.get(action.id) ?? null })),
      revision: (old?.revision ?? 0) + 1, updatedAt: new Date().toISOString() });
  }
  createTask(id: string, actionId: string, input: unknown, revision: number): MeetingNote {
    this.meeting(id);
    const old = this.get(id), action = old?.actions.find(item => item.id === actionId);
    if (!old || !action) throw new Error('请先保存这条行动项');
    if (action.taskId) {
      const existing = this.tasks.all(true).find(task => task.id === action.taskId);
      if (existing?.deletedAt) throw new Error('关联待办已删除，请在全部事项中恢复');
      if (existing) return old; // Same action retried after a lost response must not create twice.
    }
    if (old.revision !== revision) throw new Error('纪要已更新，请重新打开创建待办');
    const taskInput = taskInputSchema.parse(input);
    if (taskInput.kind !== 'task') throw new Error('后续行动只能创建待办');
    this.tasks.db.exec('BEGIN IMMEDIATE');
    try {
      const task = this.tasks.create(taskInput);
      // Persist the link before committing the task. A failed link rolls back task creation;
      // an interrupted task commit leaves a missing link target that a retry can safely replace.
      const note = this.put({ ...old, revision: old.revision + 1, updatedAt: new Date().toISOString(),
        actions: old.actions.map(item => item.id === actionId ? { ...item, title: task.title, taskId: task.id } : item) });
      this.tasks.db.exec('COMMIT');
      return note;
    } catch (error) {
      this.tasks.db.exec('ROLLBACK');
      throw error;
    }
  }
  close(): void { this.db.close(); }
}
