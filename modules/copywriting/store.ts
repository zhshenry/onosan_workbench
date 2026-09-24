/**
 * 文案草稿库(主进程):userData/copy-drafts.json 单文件存储。
 * 数据量小(个人笔记草稿),不建 SQLite;读写全量、写入即落盘,结构经 Zod 校验。
 * 先例与 ai-config.json / bazi-profiles.json 一致:工作台自有数据存自己的 userData。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  copyDraftInputSchema, copyStoreDataSchema,
  type CopyDraft, type CopyDraftInput, type CopyStoreData,
} from '../../shared/copy-contracts';

const EMPTY: CopyStoreData = { drafts: [] };

export class CopyStore {
  private readonly file: string;
  private data: CopyStoreData = EMPTY;

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'copy-drafts.json');
    this.data = this.load();
  }

  private load(): CopyStoreData {
    if (!existsSync(this.file)) return { drafts: [] };
    try {
      return copyStoreDataSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (error) {
      // 文件损坏时不覆盖原文件,以空库启动,保留现场供用户处理
      console.error('[copy] 草稿库文件损坏,已以空库启动:', error);
      return { drafts: [] };
    }
  }

  private flush(): void {
    mkdirSync(join(this.file, '..'), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }

  all(): CopyStoreData {
    return this.data;
  }

  get(id: string): CopyDraft | undefined {
    return this.data.drafts.find((d) => d.id === id);
  }

  /** 新增或更新草稿(有 id 即更新;无 id 由本层生成;updatedAt 由本层维护) */
  save(input: unknown): CopyStoreData {
    const { id: rawId, ...rest } = (input ?? {}) as Record<string, unknown>;
    const fields = copyDraftInputSchema.parse(rest);
    const id = typeof rawId === 'string' && rawId ? rawId : randomUUID();
    const now = new Date().toISOString();
    const existing = this.data.drafts.find((d) => d.id === id);
    const draft: CopyDraft = existing
      ? { ...existing, ...fields, updatedAt: now }
      : { ...fields, id, createdAt: now, updatedAt: now };
    this.data = {
      drafts: existing
        ? this.data.drafts.map((d) => (d.id === id ? draft : d))
        : [draft, ...this.data.drafts],
    };
    this.flush();
    return this.data;
  }

  remove(id: string): CopyStoreData {
    if (!this.data.drafts.some((d) => d.id === id)) throw new Error('笔记不存在或已删除');
    this.data = { drafts: this.data.drafts.filter((d) => d.id !== id) };
    this.flush();
    return this.data;
  }

  close(): void {
    this.data = EMPTY;
  }
}

/** 新建草稿的初始内容(渲染层「新建」按钮用,与契约默认值保持一处) */
export const newCopyDraftInput = (): CopyDraftInput => ({ title: '', body: '', platform: 'xiaohongshu' });
