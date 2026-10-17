/**
 * 阅读清单存储(主进程):userData/reading-books.json 单文件。
 * 书条目为工作台侧数据;库路径指向用户的 Obsidian 读书库(只读访问)。
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeJsonAtomic } from '../storage/json-file';
import {
  bookCreateSchema, bookPatchSchema, readingStoreDataSchema,
  type BookEntry, type ReadingStoreData,
} from '../../shared/reading-contracts';

const EMPTY: ReadingStoreData = { vaultPath: null, books: [] };
const createSchema = bookCreateSchema;
const patchSchema = bookPatchSchema;

export class ReadingStore {
  private readonly file: string;
  private data: ReadingStoreData = EMPTY;

  constructor(userDataDir: string) {
    this.file = path.join(userDataDir, 'reading-books.json');
    this.data = this.load();
  }

  private load(): ReadingStoreData {
    if (!existsSync(this.file)) return { vaultPath: null, books: [] };
    try {
      return readingStoreDataSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
    } catch (error) {
      console.error('[reading] 书单文件损坏,已以空库启动:', error);
      return { vaultPath: null, books: [] };
    }
  }

  private commit(data: ReadingStoreData): ReadingStoreData {
    writeJsonAtomic(this.file, data);
    this.data = data;
    return this.data;
  }

  all(): ReadingStoreData {
    return this.data;
  }

  setVaultPath(vaultPath: unknown): ReadingStoreData {
    if (typeof vaultPath !== 'string' && vaultPath !== null) throw new Error('库路径无效');
    return this.commit({ ...this.data, vaultPath: vaultPath === null ? null : vaultPath.trim() || null });
  }

  save(input: unknown): ReadingStoreData {
    const raw = { ...((input ?? {}) as Record<string, unknown>) };
    const id = typeof raw.id === 'string' && raw.id ? raw.id : null;
    // createdAt/updatedAt 由存储层维护。调用方把整本回传时先剥离,避免 strict patch 报 unrecognized_keys。
    delete raw.id;
    delete raw.createdAt;
    delete raw.updatedAt;
    const now = new Date().toISOString();
    let next: ReadingStoreData;
    if (id) {
      const existing = this.data.books.find((b) => b.id === id);
      if (!existing) throw new Error('书目不存在或已删除');
      const parsed = patchSchema.parse(raw);
      // partial 上的 tags 默认值会在缺省时变成 []。只合并调用方真正提交的字段,避免状态切换把标签等抹掉。
      const patch = Object.fromEntries(
        Object.entries(parsed).filter(([key]) => Object.prototype.hasOwnProperty.call(raw, key)),
      ) as Partial<BookEntry>;
      if (patch.title !== undefined && !patch.title.trim()) throw new Error('请填写书名');
      const book: BookEntry = { ...existing, ...patch, id, createdAt: existing.createdAt, updatedAt: now };
      next = { ...this.data, books: this.data.books.map((b) => (b.id === id ? book : b)) };
    } else {
      const title = typeof raw.title === 'string' ? raw.title.trim() : '';
      if (!title) throw new Error('请填写书名');
      const fields = createSchema.parse({ status: 'wish', ...raw });
      const book: BookEntry = { ...fields, id: randomUUID(), createdAt: now, updatedAt: now };
      next = { ...this.data, books: [...this.data.books, book] };
    }
    return this.commit(next);
  }

  remove(id: string): ReadingStoreData {
    return this.commit({ ...this.data, books: this.data.books.filter((b) => b.id !== id) });
  }

  book(id: string): BookEntry | undefined {
    return this.data.books.find((b) => b.id === id);
  }

  close(): void {
    this.data = EMPTY;
  }
}
