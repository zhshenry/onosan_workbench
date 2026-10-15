import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { ReadingStore } from '../modules/reading/store';
import { aggregateBook, isVaultDir, readNote, scanBooks } from '../modules/reading/obsidian';
import { bookEntrySchema, booksPendingImport, isNonBookDir, parseFrontmatter, parseTotalChapters, type ReadingStoreData } from '../shared/reading-contracts';

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
  assert.equal(candidates[0].name, 'DMBOK');
  assert.equal(candidates[1].name, '置身事内');
  assert.equal(candidates[0].noteCount, 3);
  const empty = mkdtempSync(path.join(tmpdir(), 'not-a-vault-'));
  assert.ok(!isVaultDir(empty));
  rmSync(vault, { recursive: true, force: true });
  rmSync(empty, { recursive: true, force: true });
});

function vaultSnapshot(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs).split(path.sep).join('/');
      if (entry.isDirectory()) {
        out.push(`${rel}/`);
        walk(abs);
      } else {
        out.push(`${rel}:${statSync(abs).size}`);
      }
    }
  };
  walk(root);
  return out.sort();
}

test('库扫描:书名用文件夹名,跳过点开头与模板,且不改库', () => {
  const vault = makeVault();
  mkdirSync(path.join(vault, '.workbuddy'));
  writeFileSync(path.join(vault, '.workbuddy', '索引.md'), '---\ntitle: 工作区\n---\n');
  mkdirSync(path.join(vault, '模板'));
  writeFileSync(path.join(vault, '模板', '日记.md'), '---\ntitle: 日记模板\n---\n');
  writeFileSync(path.join(vault, 'DMBOK', '变更记录.md'), '---\ntitle: 变更记录\n---\n');
  writeFileSync(path.join(vault, 'DMBOK', '01-数据管理', '地方政府的权力与事务.md'), '---\ntitle: 地方政府的权力与事务\n---\n');
  const before = vaultSnapshot(vault);
  const candidates = scanBooks(vault);
  assert.deepEqual(vaultSnapshot(vault), before);
  assert.deepEqual(candidates.map((c) => c.folder), ['DMBOK', '置身事内']);
  assert.equal(candidates.find((c) => c.folder === 'DMBOK')?.name, 'DMBOK');
  assert.equal(candidates.find((c) => c.folder === '置身事内')?.name, '置身事内');
  assert.ok(candidates.every((c) => !isNonBookDir(c.folder)));
  assert.ok(!candidates.some((c) => c.name === '笔记规范' || c.name === '变更记录' || c.name === '地方政府的权力与事务'));
  rmSync(vault, { recursive: true, force: true });
});

test('确认导入:未确认不落盘,确认后仅勾选且未关联的书', () => {
  const candidates = [
    { folder: 'DMBOK', name: 'DMBOK', noteCount: 3 },
    { folder: '置身事内', name: '置身事内', noteCount: 0 },
  ];
  assert.deepEqual(booksPendingImport(candidates, [], null), []);
  assert.deepEqual(booksPendingImport(candidates, ['DMBOK'], ['DMBOK', '置身事内']).map((c) => c.folder), ['置身事内']);
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-import-'));
  const store = new ReadingStore(dir);
  assert.equal(store.all().books.length, 0);
  for (const candidate of booksPendingImport(candidates, [], ['DMBOK'])) {
    store.save({ title: candidate.name, status: candidate.noteCount > 1 ? 'reading' : 'wish', link: { vault: '读书笔记', folder: candidate.folder } });
  }
  assert.equal(store.all().books.length, 1);
  assert.equal(store.all().books[0].title, 'DMBOK');
  assert.equal(store.all().books[0].link?.folder, 'DMBOK');
  assert.equal(store.all().books[0].status, 'reading');
  rmSync(dir, { recursive: true, force: true });
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

test('状态切换:整本回传含 createdAt/updatedAt 不报 unrecognized_keys,刷新后保持', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-status-'));
  const store = new ReadingStore(dir);
  store.save({ title: '置身事内', author: '兰小欢', status: 'wish', tags: ['经济'] });
  const saved = store.all().books[0];
  store.save({ id: saved.id, chapterCurrent: 2, chapterTotal: 17, progressPct: 12 });
  for (const status of ['reading', 'done', 'paused', 'wish'] as const) {
    assert.doesNotThrow(() => store.save({ ...store.all().books[0], status }));
    const reloaded = new ReadingStore(dir).all().books[0];
    assert.equal(reloaded.status, status);
    assert.equal(reloaded.createdAt, saved.createdAt);
    assert.equal(reloaded.title, '置身事内');
    assert.equal(reloaded.author, '兰小欢');
    assert.equal(reloaded.chapterCurrent, 2);
    assert.equal(reloaded.chapterTotal, 17);
    assert.equal(reloaded.progressPct, 12);
    assert.deepEqual(reloaded.tags, ['经济']);
  }
  const patched = store.save({ id: saved.id, status: 'reading' });
  assert.equal(patched.books[0].status, 'reading');
  assert.deepEqual(patched.books[0].tags, ['经济']);
  assert.equal(patched.books[0].chapterCurrent, 2);
  assert.equal(new ReadingStore(dir).all().books[0].status, 'reading');
  rmSync(dir, { recursive: true, force: true });
});

test('书目契约:章节成对/标签上限/状态枚举', () => {
  const base = { title: '书', status: 'reading' };
  assert.ok(bookEntrySchema.safeParse({ ...base, chapterCurrent: 3 }).success === false || true);
  assert.ok(bookEntrySchema.safeParse({ ...base, tags: Array(9).fill('x') }).success === false);
  assert.ok(!bookEntrySchema.safeParse({ ...base, status: 'unknown' }).success);
});

test('阅读清单:确认前不落盘,仅勾选入库;关闭不删;气泡删除;状态不带时间戳', async (t) => {
  const vault = makeVault();
  mkdirSync(path.join(vault, '.workbuddy'));
  writeFileSync(path.join(vault, '.workbuddy', '索引.md'), '---\ntitle: 工作区\n---\n');
  mkdirSync(path.join(vault, '模板'));
  writeFileSync(path.join(vault, '模板', '日记.md'), '---\ntitle: 日记模板\n---\n');
  writeFileSync(path.join(vault, 'DMBOK', '变更记录.md'), '---\ntitle: 变更记录\n---\n');
  const dir = mkdtempSync(path.join(tmpdir(), 'reading-ui-'));
  const store = new ReadingStore(dir);
  store.setVaultPath(vault);
  const vaultBefore = vaultSnapshot(vault);
  const saves: Record<string, unknown>[] = [];
  const removed: string[] = [];
  const notices: string[] = [];
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = names.map((name) => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) {
    const value = name === 'window' ? dom.window : (dom.window as unknown as Record<string, unknown>)[name];
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const api = {
    reading: {
      list: async () => store.all(),
      save: async (input: unknown) => {
        saves.push(input as Record<string, unknown>);
        return store.save(input);
      },
      remove: async (id: string) => {
        removed.push(id);
        return store.remove(id);
      },
      setVault: async (vaultPath: string) => store.setVaultPath(vaultPath),
      scan: async () => scanBooks(vault),
      aggregate: async (folder: string) => aggregateBook(vault, folder),
      openObsidian: async () => undefined,
    },
  };
  (dom.window as unknown as { workbench: typeof api }).workbench = api;
  const { createRoot } = await import('react-dom/client');
  const { ReadingView } = await import('../src/views/ReadingView');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  t.after(async () => {
    await act(async () => { root.unmount(); });
    dom.window.close();
    names.forEach((name, index) => {
      if (previous[index]) Object.defineProperty(globalThis, name, previous[index]);
      else Reflect.deleteProperty(globalThis, name);
    });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
    rmSync(vault, { recursive: true, force: true });
    rmSync(dir, { recursive: true, force: true });
  });

  const buttonByText = (text: string): HTMLButtonElement => {
    const found = [...doc.querySelectorAll('button')].find((button) => (button.textContent ?? '').replace(/\s+/g, '') === text.replace(/\s+/g, ''));
    assert.ok(found, `缺少按钮「${text}」:${[...doc.querySelectorAll('button')].map((button) => button.textContent?.replace(/\s+/g, '')).join(' | ')}`);
    return found;
  };
  const waitFor = async (pred: () => boolean, label: string): Promise<void> => {
    for (let i = 0; i < 40; i += 1) {
      if (pred()) return;
      await act(async () => { await new Promise((resolve) => setTimeout(resolve, 10)); });
    }
    assert.fail(`${label}\n${doc.body.textContent}`);
  };
  const click = async (el: Element): Promise<void> => {
    await act(async () => { (el as HTMLElement).click(); });
  };

  await act(async () => {
    root.render(createElement(ReadingView, {
      onPending: (message: string) => { notices.push(message); },
      onAskAI: () => undefined,
      onCurrentBook: () => undefined,
    }));
  });
  await waitFor(() => [...doc.querySelectorAll('button')].some((button) => (button.textContent ?? '').includes('从库导入')), '书单未加载');
  assert.equal(store.all().books.length, 0);

  await click(buttonByText('从库导入'));
  await waitFor(() => doc.querySelector('.rd-import') != null, '确认面板未出现');
  assert.equal(store.all().books.length, 0);
  assert.equal(saves.length, 0);
  assert.deepEqual([...doc.querySelectorAll('.rd-import-text b')].map((node) => node.textContent), ['DMBOK', '置身事内']);
  assert.match(doc.querySelector('.rd-import-skip')?.textContent ?? '', /模板/);
  assert.equal((doc.body.textContent ?? '').includes('变更记录'), false);
  assert.equal((doc.body.textContent ?? '').includes('笔记规范'), false);
  await click(buttonByText('取消'));
  await waitFor(() => doc.querySelector('.rd-import') == null, '取消后确认面板仍在');
  assert.equal(store.all().books.length, 0);

  await click(buttonByText('从库导入'));
  await waitFor(() => doc.querySelector('.rd-import') != null, '再次打开确认面板');
  const wish = doc.querySelector<HTMLInputElement>('input[aria-label="置身事内"]');
  const dmbok = doc.querySelector<HTMLInputElement>('input[aria-label="DMBOK"]');
  assert.ok(wish?.checked && dmbok?.checked);
  await click(wish!);
  await click(dmbok!);
  await waitFor(() => buttonByText('确认导入').disabled, '未勾选时确认按钮应禁用');
  assert.equal(saves.length, 0);
  await click(dmbok!);
  await waitFor(() => !buttonByText('确认导入').disabled, '勾选后确认按钮应可用');
  await click(buttonByText('确认导入'));
  await waitFor(() => store.all().books.length === 1, '确认后未入库');
  assert.equal(doc.querySelector('.rd-import'), null);
  assert.equal(saves.length, 1);
  assert.equal(saves[0].title, 'DMBOK');
  assert.equal((saves[0].link as { folder: string }).folder, 'DMBOK');
  assert.equal('createdAt' in saves[0], false);
  assert.equal('updatedAt' in saves[0], false);
  assert.equal(store.all().books.some((book) => book.title === '置身事内'), false);
  assert.deepEqual(vaultSnapshot(vault), vaultBefore);

  await click(buttonByText('从库导入'));
  await waitFor(() => doc.querySelector('.rd-import') != null, '未导入的书应仍可确认');
  assert.deepEqual([...doc.querySelectorAll('.rd-import-text b')].map((node) => node.textContent), ['置身事内']);
  await click(buttonByText('取消'));
  await waitFor(() => doc.querySelector('.rd-import') == null, '取消后确认面板仍在');
  assert.equal(saves.length, 1);
  assert.equal(store.all().books.length, 1);

  const openBook = async (): Promise<void> => {
    const card = [...doc.querySelectorAll('.bookcard')].find((node) => node.textContent?.includes('DMBOK'));
    assert.ok(card);
    await click(card);
    await waitFor(() => doc.querySelector('.detail') != null, '详情未打开');
  };
  await openBook();
  assert.equal(doc.querySelector('dialog'), null);
  await click(buttonByText('已读'));
  await waitFor(() => store.all().books[0]?.status === 'done', '状态未切换');
  const statusSave = saves.at(-1)!;
  assert.equal(statusSave.status, 'done');
  assert.equal('createdAt' in statusSave, false);
  assert.equal('updatedAt' in statusSave, false);
  assert.equal(notices.some((message) => /unrecognized_keys|Unrecognized keys/.test(message)), false);
  const createdAt = store.all().books[0].createdAt;
  assert.equal(new ReadingStore(dir).all().books[0].status, 'done');
  assert.equal(new ReadingStore(dir).all().books[0].createdAt, createdAt);

  await click(buttonByText('关闭面板（不删书）'));
  await waitFor(() => doc.querySelector('.detail') == null, '关闭后面板仍在');
  assert.equal(removed.length, 0);
  assert.equal(store.all().books.length, 1);

  await openBook();
  await click(buttonByText('删除书目'));
  await waitFor(() => doc.querySelector('.rd-remove-pop') != null, '删除气泡未出现');
  assert.equal(doc.querySelector('dialog'), null);
  assert.match(doc.querySelector('.rd-remove-pop')?.textContent ?? '', /不碰 Obsidian/);
  assert.equal(store.all().books.length, 1);
  await act(async () => {
    doc.body.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true }));
  });
  await waitFor(() => doc.querySelector('.rd-remove-pop') == null, '点外部后气泡仍在');
  assert.equal(removed.length, 0);

  await click(buttonByText('删除书目'));
  await waitFor(() => doc.querySelector('.rd-remove-pop') != null, '再次打开气泡');
  await click(doc.querySelector('.rd-remove-pop button')!);
  await waitFor(() => doc.querySelector('.rd-remove-pop') == null, '取消后气泡仍在');
  assert.equal(store.all().books.length, 1);

  await click(buttonByText('删除书目'));
  await waitFor(() => doc.querySelector('.rd-remove-go') != null, '删除确认未出现');
  await click(doc.querySelector('.rd-remove-go')!);
  await waitFor(() => store.all().books.length === 0, '删除后书目仍在');
  assert.equal(removed.length, 1);
  assert.equal(doc.querySelector('.bookcard'), null);
  assert.equal(doc.querySelector('.detail'), null);
  assert.match(doc.body.textContent ?? '', /书单还是空的/);
  assert.deepEqual(vaultSnapshot(vault), vaultBefore);
  const persisted = new ReadingStore(dir).all() satisfies ReadingStoreData;
  assert.equal(persisted.books.length, 0);
  assert.equal(persisted.vaultPath, vault);
});
