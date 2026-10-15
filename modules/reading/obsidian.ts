/**
 * Obsidian 读书库只读访问:库校验/扫描/书籍聚合/笔记读取。
 * 铁律:本模块对用户库只读,任何写入操作都不允许出现在这里。
 * 路径安全:所有相对路径必须解析回库目录内(拒绝绝对路径与 .. 穿越)。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { isNonBookDir, isShaped, parseFrontmatter, parseTotalChapters, type NoteMeta } from '../../shared/reading-contracts';

const MD_SKIP = new Set(['欢迎.md']);

export function isVaultDir(dir: string): boolean {
  return existsSync(path.join(dir, '.obsidian')) && statSync(path.join(dir, '.obsidian')).isDirectory();
}

/** 相对路径安全化:拒绝绝对路径/穿越,返回库内规范化相对路径 */
function safeRel(vaultPath: string, rel: string): string {
  if (path.posix.isAbsolute(rel) || path.win32.isAbsolute(rel) || rel.includes('..')) throw new Error('笔记路径无效');
  const abs = path.resolve(vaultPath, rel);
  const root = path.resolve(vaultPath);
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error('笔记路径越出了库目录');
  return path.relative(root, abs);
}

export function readNote(vaultPath: string, rel: string): string {
  if (!isVaultDir(vaultPath)) throw new Error('读书笔记库路径无效或未配置');
  const abs = path.join(vaultPath, safeRel(vaultPath, rel));
  if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error('笔记不存在或已被移动');
  return readFileSync(abs, 'utf8');
}

function mdFiles(dir: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, entry.name) : entry.name;
    if (entry.isDirectory()) out.push(...mdFiles(path.join(dir, entry.name), rel));
    else if (entry.name.endsWith('.md') && !MD_SKIP.has(entry.name)) out.push(rel);
  }
  return out.sort();
}

function noteMeta(rel: string, abs: string): NoteMeta {
  const text = readFileSync(abs, 'utf8');
  const fm = parseFrontmatter(text);
  const stat = statSync(abs);
  const updated = fm.updated || `${stat.mtime.getFullYear()}-${String(stat.mtime.getMonth() + 1).padStart(2, '0')}-${String(stat.mtime.getDate()).padStart(2, '0')}`;
  return { rel, title: fm.title || path.basename(rel, '.md'), status: fm.status || '', updated, draft: !isShaped(fm.status ?? '') };
}

export interface BookCandidate {
  folder: string;
  /** 默认书名 = 文件夹名,不用深层笔记 frontmatter title */
  name: string;
  noteCount: number;
  lastUpdated: string;
}

/** 顶层书文件夹 = 一本书。跳过点开头与约定非书目录;书名用文件夹名。 */
export function scanBooks(vaultPath: string): BookCandidate[] {
  if (!isVaultDir(vaultPath)) throw new Error('所选文件夹不是 Obsidian 库(未找到 .obsidian)');
  return readdirSync(vaultPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !isNonBookDir(entry.name))
    .map((entry) => {
      const abs = path.join(vaultPath, entry.name);
      const files = mdFiles(abs);
      let last = '';
      for (const rel of files) {
        const mtime = statSync(path.join(abs, rel)).mtime;
        const day = `${mtime.getFullYear()}-${String(mtime.getMonth() + 1).padStart(2, '0')}-${String(mtime.getDate()).padStart(2, '0')}`;
        if (day > last) last = day;
      }
      return { folder: entry.name, name: entry.name, noteCount: files.length, lastUpdated: last };
    })
    .sort((a, b) => b.noteCount - a.noteCount || a.folder.localeCompare(b.folder, 'zh-CN'));
}

export interface BookAggregate {
  noteCount: number;
  lastUpdated: string;
  maturity: { draft: number; shaped: number };
  totalChapters: number | null;
  notes: NoteMeta[];
  chapters: { rel: string; name: string; count: number; lastUpdated: string }[];
}

/** 聚合一本书在库内的活动(全部现算,不落盘) */
export function aggregateBook(vaultPath: string, folder: string): BookAggregate {
  if (!isVaultDir(vaultPath)) throw new Error('读书笔记库路径无效或未配置');
  const root = safeRel(vaultPath, folder);
  const abs = path.join(vaultPath, root);
  if (!existsSync(abs)) throw new Error('库内未找到该书的文件夹(可能已改名或删除)');
  const notes: NoteMeta[] = [];
  const chapters: BookAggregate['chapters'] = [];
  let lastUpdated = '';
  const walk = (relDir: string): void => {
    const absDir = path.join(vaultPath, relDir);
    let count = 0;
    let chapterLast = '';
    for (const entry of readdirSync(absDir, { withFileTypes: true })) {
      if (entry.isDirectory()) { walk(path.join(relDir, entry.name)); continue; }
      if (!entry.name.endsWith('.md') || MD_SKIP.has(entry.name)) continue;
      const rel = path.join(relDir, entry.name);
      const meta = noteMeta(rel, path.join(vaultPath, rel));
      notes.push(meta);
      count += 1;
      if (meta.updated > chapterLast) chapterLast = meta.updated;
      if (meta.updated > lastUpdated) lastUpdated = meta.updated;
    }
    if (count > 0) {
      chapters.push({ rel: relDir, name: path.basename(relDir), count, lastUpdated: chapterLast });
    }
  };
  walk(root);
  notes.sort((a, b) => b.updated.localeCompare(a.updated));
  chapters.sort((a, b) => a.rel.localeCompare(b.rel));
  const maturity = {
    draft: notes.filter(n => n.draft).length,
    shaped: notes.filter(n => !n.draft).length,
  };
  let totalChapters: number | null = null;
  const spec = notes.find(n => /规范/.test(n.title));
  if (spec) totalChapters = parseTotalChapters(readFileSync(path.join(vaultPath, spec.rel), 'utf8'));
  return { noteCount: notes.length, lastUpdated, maturity, totalChapters, notes, chapters };
}
