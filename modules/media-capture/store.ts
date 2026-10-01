/**
 * 素材采集存储(主进程):userData/media-captures/ 下 PNG 文件 + userData/media-captures.json 索引。
 * 独立小模块,不建 SQLite;条目上限 200(超出淘汰最旧,连同截图文件删除)。
 * 选题库/素材库模块上线后,此存储作为迁移源。
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  mediaCaptureIndexSchema, mediaCaptureSaveSchema,
  type MediaCaptureItem,
} from '../../shared/media-capture-contracts';

const MAX_ITEMS = 200;

export class MediaCaptureStore {
  private readonly dir: string;
  private readonly indexFile: string;
  private items: MediaCaptureItem[] = [];

  constructor(userDataDir: string) {
    this.dir = join(userDataDir, 'media-captures');
    this.indexFile = join(userDataDir, 'media-captures.json');
    this.items = this.load();
  }

  private load(): MediaCaptureItem[] {
    if (!existsSync(this.indexFile)) return [];
    try {
      return mediaCaptureIndexSchema.parse(JSON.parse(readFileSync(this.indexFile, 'utf8')));
    } catch (error) {
      console.error('[media-capture] 索引文件损坏,已以空列表启动:', error);
      return [];
    }
  }

  private flush(): void {
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(this.indexFile, JSON.stringify(this.items, null, 2), 'utf8');
  }

  list(): MediaCaptureItem[] {
    return this.items;
  }

  save(input: unknown): MediaCaptureItem[] {
    const fields = mediaCaptureSaveSchema.parse(input);
    const id = randomUUID();
    const file = `${id}.png`;
    mkdirSync(this.dir, { recursive: true });
    writeFileSync(join(this.dir, file), Buffer.from(fields.png, 'base64'));
    const item: MediaCaptureItem = {
      id,
      url: fields.url,
      title: fields.title || fields.url,
      file,
      thumb: fields.thumb ?? '',
      createdAt: new Date().toISOString(),
    };
    this.items = [item, ...this.items];
    while (this.items.length > MAX_ITEMS) {
      const dropped = this.items.pop();
      if (dropped) rmSync(join(this.dir, dropped.file), { force: true });
    }
    this.flush();
    return this.items;
  }

  remove(id: string): MediaCaptureItem[] {
    const target = this.items.find((i) => i.id === id);
    if (target) rmSync(join(this.dir, target.file), { force: true });
    this.items = this.items.filter((i) => i.id !== id);
    this.flush();
    return this.items;
  }

  /** 设置/更新采集备注(空串视为清除) */
  setNote(id: string, note: unknown): MediaCaptureItem[] {
    if (typeof note !== 'string') throw new Error('备注内容无效');
    const text = note.trim();
    if (text.length > 200) throw new Error('备注最多200字');
    const target = this.items.find((i) => i.id === id);
    if (!target) throw new Error('采集条目不存在或已删除');
    this.items = this.items.map((i) => (i.id === id ? { ...i, note: text || undefined } : i));
    this.flush();
    return this.items;
  }

  close(): void {
    this.items = [];
  }
}
