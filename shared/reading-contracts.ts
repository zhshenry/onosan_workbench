/**
 * 阅读清单契约:书目条目/状态/进度/评分/标签 + Obsidian 关联。
 * 库(笔记内容)的权威源在 Obsidian;工作台只读关联,绝不写用户库。
 */
import { z } from 'zod';

export const READING_STATUSES = ['wish', 'reading', 'done', 'paused'] as const;
export type ReadingStatus = (typeof READING_STATUSES)[number];
export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  wish: '想读', reading: '在读', done: '已读', paused: '搁置',
};

/** 单本书条目(工作台侧;关联库的书还带 link) */
export const bookEntrySchema = z.object({
  id: z.string().min(1),
  title: z.string().trim().min(1, '请填写书名').max(60, '书名最多60字'),
  author: z.string().trim().max(40, '作者最多40字').optional(),
  status: z.enum(READING_STATUSES),
  progressPct: z.number().int().min(0).max(100).optional(),
  chapterCurrent: z.number().int().min(0).max(9999).optional(),
  chapterTotal: z.number().int().min(0).max(9999).optional(),
  rating: z.number().int().min(1).max(5).optional(),
  comment: z.string().trim().max(300, '短评最多300字').optional(),
  tags: z.array(z.string().trim().min(1).max(12)).max(8, '标签最多8个').default([]),
  /** Obsidian 关联:库名(vault 文件夹名)+ 库内书文件夹(相对路径) */
  link: z.object({
    vault: z.string().min(1).max(120),
    folder: z.string().min(1).max(200),
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
}).strict();
export type BookEntry = z.infer<typeof bookEntrySchema>;

/** 持久化结构(userData/reading-books.json):库路径 + 书单 */
export const readingStoreDataSchema = z.object({
  vaultPath: z.string().nullable(),
  books: z.array(bookEntrySchema),
}).strict();
export type ReadingStoreData = z.infer<typeof readingStoreDataSchema>;

const bookEntryFields = bookEntrySchema; // 完整对象(无 refine),供派生
const chapterPairRefine = (data: { chapterCurrent?: number; chapterTotal?: number }) =>
  (data.chapterCurrent === undefined) === (data.chapterTotal === undefined);
export const bookCreateSchema = bookEntryFields.omit({ id: true, createdAt: true, updatedAt: true }).refine(chapterPairRefine, { message: '章节进度需成对填写' });
export const bookPatchSchema = bookEntryFields.omit({ id: true, createdAt: true, updatedAt: true }).partial().refine(chapterPairRefine, { message: '章节进度需成对填写' });
export type BookInput = z.infer<typeof bookCreateSchema>;

/** 库内书笔记的 frontmatter 子集(解析自笔记头部) */
export interface NoteMeta {
  /** 库内相对路径(含 .md) */
  rel: string;
  title: string;
  status: string;
  updated: string;
  draft: boolean;
}

/** 笔记规范页里声明的章节规模,如「全书 17 章」 */
export function parseTotalChapters(text: string): number | null {
  const match = /全书\s*(\d{1,3})\s*章/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * 极简 frontmatter 子集解析(零依赖):取笔记头部 --- 块,
 * 支持 key: value 与 tags 块(「  - x」列表或行内 [a, b])。
 */
export function parseFrontmatter(text: string): { title?: string; status?: string; tags: string[]; created?: string; updated?: string } {
  const out: { title?: string; status?: string; tags: string[]; created?: string; updated?: string } = { tags: [] };
  if (!text.startsWith('---')) return out;
  const end = text.indexOf('\n---', 3);
  if (end < 0) return out;
  const block = text.slice(4, end).split('\n');
  let inTags = false;
  for (const raw of block) {
    const line = raw.replace(/\t/g, ' ');
    if (/^tags:\s*\[.*\]\s*$/.test(line)) {
      out.tags = line.slice(line.indexOf('[') + 1, line.lastIndexOf(']')).split(',').map(t => t.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
      inTags = false;
      continue;
    }
    if (/^tags:\s*$/.test(line)) { inTags = true; continue; }
    if (inTags) {
      const item = /^ {2,}-\s*(.+)$/.exec(line);
      if (item) { out.tags.push(item[1].trim()); continue; }
      if (line.trim() !== '') inTags = false;
      continue;
    }
    const kv = /^([A-Za-z_]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    const key = kv[1];
    const value = kv[2].trim().replace(/^['"]|['"]$/g, '');
    if (key === 'title' && value) out.title = value;
    else if (key === 'status' && value) out.status = value;
    else if (key === 'created' && value) out.created = value;
    else if (key === 'updated' && value) out.updated = value;
  }
  return out;
}

/** 笔记成熟度:status 含「成型/定稿/完稿」视为成型,否则草稿 */
export function isShaped(status: string): boolean {
  return /成型|定稿|完稿/.test(status);
}

/**
 * 库根下不作为书的目录。
 * 点开头(`.obsidian`、`.workbuddy` 等)一律跳过;其余为约定非书目录。
 */
export const NON_BOOK_DIR_NAMES = ['模板'] as const;

/** 确认面板脚注:与扫描规则一致的示意(点开头目录 + 约定非书目录) */
export const SCAN_SKIP_HINT = '.obsidian / .workbuddy / 模板';

export function isNonBookDir(name: string): boolean {
  return name.startsWith('.') || (NON_BOOK_DIR_NAMES as readonly string[]).includes(name);
}

/**
 * 从库导入的待写入项。
 * `checkedFolders === null` 表示用户尚未确认,不产生任何写入;
 * 已关联的文件夹即使被勾选也不重复导入。
 */
export function booksPendingImport<T extends { folder: string }>(
  candidates: readonly T[],
  linkedFolders: Iterable<string>,
  checkedFolders: Iterable<string> | null,
): T[] {
  if (checkedFolders == null) return [];
  const linked = new Set(linkedFolders);
  const checked = new Set(checkedFolders);
  return candidates.filter((candidate) => checked.has(candidate.folder) && !linked.has(candidate.folder));
}

export interface BookCandidate {
  folder: string;
  /** 默认书名 = 文件夹名,不用深层笔记 frontmatter title */
  name: string;
  noteCount: number;
  lastUpdated: string;
}

export interface BookAggregate {
  noteCount: number;
  lastUpdated: string;
  maturity: { draft: number; shaped: number };
  totalChapters: number | null;
  notes: NoteMeta[];
  chapters: { rel: string; name: string; count: number; lastUpdated: string }[];
}
