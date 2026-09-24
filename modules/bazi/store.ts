/**
 * 八字命例库(主进程):userData/bazi-profiles.json 单文件存储。
 * 数据量小(个人命例+笔记),不建 SQLite;读写全量、写入即落盘,结构经 Zod 校验。
 * 与 AI 配置文件(ai-config.json)同先例:工作台自有数据存自己的 userData。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  baziProfileInputSchema, baziStoreDataSchema,
  type BaziProfile, type BaziStoreData,
} from '../../shared/bazi-contracts';

const EMPTY: BaziStoreData = { profiles: [], notes: {} };

export class BaziStore {
  private readonly file: string;
  private data: BaziStoreData = EMPTY;

  constructor(userDataDir: string) {
    this.file = join(userDataDir, 'bazi-profiles.json');
    this.data = this.load();
  }

  private load(): BaziStoreData {
    if (!existsSync(this.file)) return { profiles: [], notes: {} };
    try {
      const parsed = baziStoreDataSchema.parse(JSON.parse(readFileSync(this.file, 'utf8')));
      return parsed;
    } catch (error) {
      // 文件损坏时不覆盖原文件,以空库启动,保留现场供用户处理
      console.error('[bazi] 命例库文件损坏,已以空库启动:', error);
      return { profiles: [], notes: {} };
    }
  }

  private flush(): void {
    mkdirSync(join(this.file, '..'), { recursive: true });
    writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
  }

  all(): BaziStoreData {
    return this.data;
  }

  /** 新增或更新命例(有 id 即更新;无 id 由本层生成;id/createdAt 不参与字段校验) */
  saveProfile(input: unknown): BaziStoreData {
    const { id: rawId, ...rest } = (input ?? {}) as Record<string, unknown>;
    const fields = baziProfileInputSchema.parse(rest);
    const id = typeof rawId === 'string' && rawId ? rawId : randomUUID();
    const existing = this.data.profiles.find((p) => p.id === id);
    const profile: BaziProfile = existing
      ? { ...existing, ...fields }
      : { ...fields, id, createdAt: new Date().toISOString() };
    this.data = {
      ...this.data,
      profiles: existing
        ? this.data.profiles.map((p) => (p.id === id ? profile : p))
        : [...this.data.profiles, profile],
    };
    this.flush();
    return this.data;
  }

  removeProfile(id: string): BaziStoreData {
    const { [id]: _removed, ...notes } = this.data.notes;
    this.data = { profiles: this.data.profiles.filter((p) => p.id !== id), notes };
    this.flush();
    return this.data;
  }

  saveNote(id: string, text: unknown): BaziStoreData {
    if (!this.data.profiles.some((p) => p.id === id)) throw new Error('命例不存在或已删除');
    if (typeof text !== 'string') throw new Error('笔记内容无效');
    if (text.length > 20000) throw new Error('笔记最多2万字');
    this.data = { ...this.data, notes: { ...this.data.notes, [id]: text } };
    this.flush();
    return this.data;
  }

  close(): void {
    this.data = EMPTY;
  }
}
