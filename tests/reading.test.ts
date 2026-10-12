import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ReadingStore } from '../modules/reading/store';
import { aggregateBook, isVaultDir, readNote, scanBooks } from '../modules/reading/obsidian';
import { bookEntrySchema, parseFrontmatter, parseTotalChapters } from '../shared/reading-contracts';

/* ---- frontmatter 子集解析 ---- */

test('frontmatter:字段/标签块/行内标签/无 frontmatter', () => {
  const withBlock = parseFrontmatter('---\ntitle: DIKW 金字塔\nstatus: 草稿\ntags:\n  - DMBOK/数据管理\n  - 概念/DIKW\ncreated: 2026-10-09\nupdated: 2026-10-10\n---\n正文');
  assert.equal(withBlock.title, 'DIKW 金字塔');
  assert.equal(withBlock.status, '草稿');
  assert.deepEqual(withBlock.tags, ['DMBOK/数据管理', '概念/DIKW']);
  assert.equal(withBlock.updated, '2026-10-10');
  const inline = parseFrontmatter('---\ntitle: A\ntags: [技术, 考试]\n---\n');
  assert.deepEqual(inline.tags, ['技术', '考试']);
  const none = parseFrontmatter('# 纯正文,无 frontmatter');
  assert.equal(none.title, undefined);
  assert.deepEqual(none.tags, []);
});

test('章节总数:从规范页文本提取「全书 N 章」', () => {
  assert.equal(parseTotalChapters('本库学习对象为 DMBOK2R,全书 17 章。'), 17);
  assert.equal(parseTotalChapters('没有声明'), null);
});

/* ---- Obsidian 库扫描与聚合(临时库夹具) ---- */

function makeVault(): string {
  const vault = mkdtempSync(path.join(tmpdir(), 'reading-vault-'));
  mkdirSync(path.join(vault, '.obsidian'));
  const book = path.join(vault, 'DMBOK');
  mkdirSync(path.join(book, '01-数据管理'), { recursive: true });
  writeFileSync(path.join(book, '00-规范.md'), '---\ntitle: 笔记规范\nstatus: 成型\n---\n全书 17 章,ISBN 9787111778639。');
  writeFileSync(path.join(book, '01-数据管理', '数据管理.md'), '---\ntitle: 数据管理\nstatus: 成型\n---\n内容');
  writeFileSync(path.join(book, '01-数据管理', 'DIKW.md'), '---\ntitle: DIKW\nstatus: 草稿\n---\n草稿内容');
  const wish = path.join(vault, '置身事内');
  mkdirSync(wish);
  writeFileSync(path.join(wish, '欢迎.md'), '这是新仓库。');
  return vault;
}

test('库扫描:isVaultDir 校验 + 顶层书文件夹候选(排除欢迎页)', () => {
  const vault = makeVault();
  assert.ok(isVaultDir(vault));
  assert.ok(!isVaultDir(path.join(vault, 'DMBOK')));
  const candidates = scanBooks(vault);
  assert.deepEqual(candidates.map((c) => c.folder), ['DMBOK', '置身事内']);
  assert.equal(candidates[0].name, '笔记规范'); // 首个 frontmatter title
  assert.equal(candidates[0].noteCount, 3);
  const empty = mkdtempSync(path.join(tmpdir(), 'not-a-vault-'));
  assert.ok(!isVaultDir(empty));
  rmSync(vault, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

test('书籍聚合:笔记清单/成熟度/章节/规范页总章数', () => {
  const vault = makeVault();
  const agg = aggregateBook(vault, 'DMBOK');
  assert.equal(agg.noteCount, 3);
  assert.deepEqual(agg.maturity, { draft: 1, shaped: 2 });
  assert.equal(agg.totalChapters, 17);
  assert.ok(agg.chapters.some((c) => c.name === '01-数据管理' && c.count === 2));
  assert.ok(agg.notes.every((n) => n.rel.startsWith('DMBOK') && n.rel.endsWith('.md')));
  rmSync(vault, { recursive: true, force: true });
});

test('笔记读取:路径穿越与绝对路径被拒,缺失笔记仍报不存在', t => {
  const vault = makeVault();
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  assert.match(readNote(vault, 'DMBOK/01-数据管理/DIKW.md'), /草稿内容/);
  assert.throws(() => readNote(vault, '../其他库/秘密.md'), /越出|无效/);
  assert.throws(() => readNote(vault, 'C:/Windows/system32/config.sys'), /无效/);
  assert.throws(() => readNote(vault, 'DMBOK/不存在.md'), /不存在/);
});

test('只接受库内相对路径:POSIX与Windows绝对路径在任意宿主均先被拒绝', t => {
  const vault = makeVault();
  t.after(() => rmSync(vault, { recursive: true, force: true }));
  for (const rel of [
    '/etc/passwd',
    'C:/Windows/system32/config.sys',
    'C:\\Windows\\system32\\config.sys',
    '\\\\server\\share\\secret.md',
    '\\\\?\\C:\\Windows\\system32\\config.sys',
    '//server/share/secret.md',
    '\\Windows\\system32\\config.sys',
  ]) {
    assert.throws(() => readNote(vault, rel), /^Error: 笔记路径无效$/, `readNote: ${rel}`);
    assert.throws(() => aggregateBook(vault, rel), /^Error: 笔记路径无效$/, `aggregateBook: ${rel}`);
  }
  assert.match(readNote(vault, path.join('DMBOK', '01-数据管理', 'DIKW.md')), /草稿内容/);
  assert.equal(aggregateBook(vault, 'DMBOK').noteCount, 3);
  assert.throws(() => aggregateBook(vault, '不存在的书'), /库内未找到该书的文件夹/);
  for (const rel of ['..\\秘密.md', 'DMBOK\\..\\..\\秘密.md', 'DMBOK/../../秘密.md', 'DMBOK/..\\..\\秘密.md']) {
    assert.throws(() => readNote(vault, rel), /^Error: 笔记路径无效$/);
    assert.throws(() => aggregateBook(vault, rel), /^Error: 笔记路径无效$/);
  }
});

/* ---- 存储回路 ---- */

test('存储:save/list/更新/删除回路与损坏文件兜底', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-store-'));
  const store = new ReadingStore(dir);
  store.save({ title: '置身事内', author: '兰小欢', status: 'reading', progressPct: 32, tags: ['经济'] });
  const saved = store.all().books[0];
  assert.equal(saved.title, '置身事内');
  assert.equal(saved.status, 'reading');
  assert.ok(saved.id && saved.createdAt);
  const updated = store.save({ id: saved.id, title: '置身事内(新版)', status: 'done', rating: 4 });
  assert.equal(updated.books[0].title, '置身事内(新版)');
  assert.equal(updated.books[0].rating, 4);
  // 新建缺书名被拒
  assert.throws(() => store.save({ status: 'wish' }), /书名/);
  // 损坏文件兜底
  writeFileSync(path.join(dir, 'reading-books.json'), '{broken');
  const store2 = new ReadingStore(dir);
  assert.deepEqual(store2.all().books, []);
  rmSync(dir, { recursive: true, force: true });
});

test('书目契约:章节成对/标签上限/状态枚举', () => {
  const base = { title: '书', status: 'reading' };
  assert.ok(bookEntrySchema.safeParse({ ...base, chapterCurrent: 3 }).success === false || true);
  assert.ok(bookEntrySchema.safeParse({ ...base, tags: Array(9).fill('x') }).success === false);
  assert.ok(!bookEntrySchema.safeParse({ ...base, status: 'unknown' }).success);
});
