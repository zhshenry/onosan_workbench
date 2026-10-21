import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { TestRun, TestRunSummary, TestTask, TestTaskInput } from '../shared/ai-test-contracts';

export class AiTestStore {
  readonly db: DatabaseSync;
  constructor(readonly directory: string) {
    mkdirSync(directory, { recursive: true });
    this.db = new DatabaseSync(join(directory, 'ai-tests.db'));
    this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY, payload TEXT NOT NULL)');
    for (const summary of this.runs()) {
      const run = this.run(summary.id);
      let changed = false;
      for (const lane of run.lanes) {
        if (lane.status === 'queued' || lane.status === 'running') {
          lane.status = 'error'; lane.error = '应用退出中断了执行，请复跑本次配置。'; lane.endedAt = new Date().toISOString(); changed = true;
          for (const step of lane.steps) if (step.status === 'running') step.status = 'error';
        }
        if (lane.checking) { lane.checking = false; lane.checkError = '校验因应用退出而中断，请重新校验。'; changed = true; }
      }
      if (changed) this.saveRun(run);
    }
  }
  tasks(): TestTask[] {
    return (this.db.prepare('SELECT payload FROM tasks').all() as { payload: string }[])
      .map(row => JSON.parse(row.payload) as TestTask).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  saveTask(input: TestTaskInput): TestTask {
    const task = { ...input, id: input.id ?? randomUUID(), updatedAt: new Date().toISOString() };
    this.db.prepare('INSERT OR REPLACE INTO tasks VALUES (?, ?)').run(task.id, JSON.stringify(task));
    return task;
  }
  runs(): TestRunSummary[] {
    return (this.db.prepare('SELECT payload FROM runs').all() as { payload: string }[])
      .map(row => JSON.parse(row.payload) as TestRun).map(run => ({
        id: run.id, createdAt: run.createdAt, title: run.task.title, mode: run.task.mode,
        running: run.lanes.some(lane => lane.status === 'running' || lane.status === 'queued'), modelCount: run.lanes.length,
      })).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }
  run(id: string): TestRun {
    const row = this.db.prepare('SELECT payload FROM runs WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) throw new Error('测试记录不存在');
    return JSON.parse(row.payload) as TestRun;
  }
  saveRun(run: TestRun): void { this.db.prepare('INSERT OR REPLACE INTO runs VALUES (?, ?)').run(run.id, JSON.stringify(run)); }
  close(): void { this.db.close(); }
}
