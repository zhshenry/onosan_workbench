import type { DatabaseSync } from 'node:sqlite';
import { migrateTaskDate } from '../../shared/todo-date';

/** Shared by OnO and CMO. Back up the exact v3 payloads before replacing date fields. */
export function migrateTaskDates(db: DatabaseSync): void {
  const version = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
  if (version === 4) return;
  if (version !== 3) throw new Error(`待办库版本 ${version} 不支持日期升级`);
  db.exec('BEGIN IMMEDIATE');
  try {
    const lockedVersion = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (lockedVersion === 4) { db.exec('COMMIT'); return; }
    if (lockedVersion !== 3) throw new Error(`待办库版本 ${lockedVersion} 不支持日期升级`);
    db.exec('CREATE TABLE IF NOT EXISTS todo_date_backup_v3 (id TEXT PRIMARY KEY, payload TEXT NOT NULL); INSERT OR IGNORE INTO todo_date_backup_v3 SELECT id,payload FROM tasks;');
    const rows = db.prepare('SELECT id,payload FROM tasks').all() as { id: string; payload: string }[];
    const update = db.prepare('UPDATE tasks SET payload=? WHERE id=?');
    for (const row of rows) update.run(JSON.stringify(migrateTaskDate(JSON.parse(row.payload))), row.id);
    db.exec('PRAGMA user_version=4; COMMIT;');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
