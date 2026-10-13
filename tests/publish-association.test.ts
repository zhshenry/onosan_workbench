import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { CopyStore } from '../modules/copywriting/store';
import type { CopyDraft, CopyStoreData } from '../shared/copy-contracts';

const A = 'https://www.xiaohongshu.com/explore/68aa11223344556677889900?xsec_token=synthetic';
const B = 'https://www.xiaohongshu.com/discovery/item/68bb11223344556677889911';
const INPUT = { title: '本地测试博客', body: '保留正文 #测试', platform: 'xiaohongshu' };

test('关联落盘、编辑重载与移除逐字段保留同一博客身份和正文版本', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ono-association-store-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new CopyStore(directory);
  const original = store.save(INPUT).drafts[0];
  const record = store.markXhsPublished(original.id, A).drafts[0];
  assert.deepEqual({ ...record, xhsPublished: undefined }, { ...original, xhsPublished: undefined });
  assert.deepEqual(record.xhsPublished, { status: 'published', source: 'manual', url: A,
    remoteId: '68aa11223344556677889900', confirmedAt: record.xhsPublished!.confirmedAt });
  assert.ok(Number.isFinite(Date.parse(record.xhsPublished!.confirmedAt)));
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'copy-drafts.json'), 'utf8')).drafts[0], record);
  store.close();
  const reopened = new CopyStore(directory);
  assert.deepEqual(reopened.get(original.id), record);
  const edited = reopened.save({ id: original.id, title: '本地标题修改', body: '本地正文修改' }).drafts[0];
  assert.equal(edited.id, original.id); assert.equal(edited.createdAt, original.createdAt);
  assert.deepEqual(edited.xhsPublished, record.xhsPublished);
  assert.deepEqual(new CopyStore(directory).get(original.id), edited);
  const replaced = reopened.markXhsPublished(original.id, B).drafts[0];
  assert.equal(replaced.xhsPublished!.url, B); assert.equal(replaced.updatedAt, edited.updatedAt);
  const removed = reopened.clearXhsPublished(original.id).drafts[0];
  const { xhsPublished: _record, ...editedFields } = edited;
  assert.deepEqual(removed, editedFields);
  assert.deepEqual(new CopyStore(directory).get(original.id), removed);
});

test('关联写入失败不会替换或移除既有内存记录', t => {
  const directory = mkdtempSync(join(tmpdir(), 'ono-association-write-error-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new CopyStore(directory);
  const original = store.save(INPUT).drafts[0];
  store.markXhsPublished(original.id, A);
  const record = store.get(original.id)!;
  const file = join(directory, 'copy-drafts.json');
  const bytes = readFileSync(file);
  rmSync(file); mkdirSync(file);
  assert.throws(() => store.markXhsPublished(original.id, B));
  assert.deepEqual(store.get(original.id), record);
  assert.throws(() => store.clearXhsPublished(original.id));
  assert.deepEqual(store.get(original.id), record);
  rmSync(file, { recursive: true }); writeFileSync(file, bytes);
  assert.deepEqual(new CopyStore(directory).get(original.id), record);
});

test('发布关联 UI:四态、取消、更换、重复、错误与跨博客异步响应', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'localStorage', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const directory = mkdtempSync(join(tmpdir(), 'ono-association-ui-'));
  let store: CopyStore;
  let original: CopyDraft;
  let second: CopyDraft;
  let markCalls: Array<{ id: string; url: string }>;
  let clearCalls: string[];
  let messages: string[];
  let copied: string[];
  let failMark = false;
  let failClear = false;
  let deferMark = false;
  let failReads = 0;
  let failReadAfterWrite = false;
  let resolveMark: (() => void) | undefined;
  const bridge = {
    list: async () => { if (failReads > 0) { failReads--; throw new Error('合成列表读取失败'); } return structuredClone(store.all()); },
    save: async (input: unknown) => store.save(input),
    markXhsPublished: async (id: string, url: string) => {
      markCalls.push({ id, url });
      if (failMark) throw new Error('合成关联失败,请重试');
      if (deferMark) await new Promise<void>(resolve => { resolveMark = resolve; });
      const result = structuredClone(store.markXhsPublished(id, url));
      if (failReadAfterWrite) failReads = 2;
      return result;
    },
    clearXhsPublished: async (id: string) => {
      clearCalls.push(id);
      if (failClear) throw new Error('合成移除失败,请重试');
      return structuredClone(store.clearXhsPublished(id));
    },
  };
  Object.defineProperty(dom.window, 'workbench', { value: { copy: bridge, clipboard: { write: async (text: string) => { copied.push(text); } }, appInfo: { openExternal: async () => { throw new Error('Tests must not publish'); } } } });
  const { createRoot } = await import('react-dom/client');
  const { PublishView } = await import('../modules/copywriting/ui/PublishView');
  let root = createRoot(dom.window.document.getElementById('root')!);
  const mount = async (linked = false) => {
    await act(async () => root.unmount());
    rmSync(join(directory, 'copy-drafts.json'), { force: true });
    store = new CopyStore(directory);
    original = store.save(INPUT).drafts[0];
    second = store.save({ ...INPUT, title: '第二篇本地博客' }).drafts[0];
    if (linked) store.markXhsPublished(original.id, A);
    localStorage.clear(); localStorage.setItem('wb.copy.pubDraftId', original.id);
    markCalls = []; clearCalls = []; copied = []; messages = []; failMark = false; failClear = false; deferMark = false; resolveMark = undefined; failReads = 0; failReadAfterWrite = false;
    root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root.render(createElement(PublishView, { onPending: message => messages.push(message), onGoEdit: () => {}, onOpenCreator: () => {} })));
  };
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close(); rmSync(directory, { recursive: true, force: true });
    globals.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  const association = () => dom.window.document.querySelector<HTMLElement>('[aria-label="发布后关联"]')!;
  const status = () => association().querySelector('.pub-association-state')!.textContent;
  const button = (text: string) => {
    const found = [...association().querySelectorAll<HTMLButtonElement>('button')].find(element => element.textContent === text);
    assert.ok(found, text); return found;
  };
  const click = async (text: string) => { await act(async () => button(text).click()); };
  const input = () => association().querySelector<HTMLInputElement>('input')!;
  const fill = async (text: string) => {
    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input(), text);
      input().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const prepare = async (url = A) => { await fill(url); await click('检查链接格式'); assert.equal(status(), '待确认'); };
  const disk = (): CopyStoreData => JSON.parse(readFileSync(join(directory, 'copy-drafts.json'), 'utf8'));
  const select = async (draft: CopyDraft) => {
    await act(async () => dom.window.document.querySelector<HTMLButtonElement>(`[aria-label="选择博客《${draft.title}》"]`)!.click());
  };

  await t.test('未关联与格式错误在栏目就地可读,不提交或访问平台', async () => {
    await mount(); const before = disk();
    assert.equal(status(), '尚未关联作品');
    assert.equal(dom.window.document.querySelector('h1')!.textContent, '发布前准备');
    await fill('https://creator.xiaohongshu.com/'); await click('检查链接格式');
    assert.equal(status(), '链接格式不正确'); assert.equal(input().getAttribute('aria-invalid'), 'true');
    assert.match(association().querySelector('[role="alert"]')!.textContent!, /完整直链.*不支持创作者后台首页或分享短链/);
    assert.equal(dom.window.document.activeElement, input()); assert.deepEqual(disk(), before); assert.equal(markCalls.length, 0);
  });
  await t.test('格式检查、取消与 Escape 不写入;输入变化使旧目标失效', async () => {
    await mount(); const before = disk(); await prepare();
    assert.match(association().textContent!, new RegExp(original.title)); assert.ok(association().textContent!.includes(A));
    await fill(B); assert.equal(status(), '尚未关联作品'); assert.equal([...association().querySelectorAll('button')].some(el => el.textContent === '确认关联'), false);
    await click('检查链接格式'); await click('取消');
    assert.deepEqual(disk(), before); assert.equal(markCalls.length, 0); assert.equal(input().value, '');
    await prepare(); await act(async () => input().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    assert.equal(status(), '尚未关联作品'); assert.deepEqual(disk(), before);
  });
  await t.test('只有显式确认落盘,重复点击只产生一次写入并完整读回', async () => {
    await mount(); await prepare(); deferMark = true;
    const confirm = button('确认关联');
    await act(async () => { confirm.click(); confirm.click(); });
    assert.equal(markCalls.length, 1); assert.equal(input().disabled, true); assert.equal(button('取消').disabled, true);
    assert.equal(store.get(original.id)!.xhsPublished, undefined);
    await act(async () => resolveMark!());
    assert.equal(status(), '已关联 · 手动确认'); const persisted = disk().drafts.find(d => d.id === original.id)!;
    assert.deepEqual(new CopyStore(directory).get(original.id), persisted);
    assert.equal(persisted.createdAt, original.createdAt); assert.equal(persisted.updatedAt, original.updatedAt); assert.equal(persisted.body, original.body);
    assert.equal(persisted.xhsPublished!.url, A); assert.equal(persisted.xhsPublished!.source, 'manual'); assert.equal(persisted.xhsPublished!.remoteId, '68aa11223344556677889900');
    assert.ok(Number.isFinite(Date.parse(persisted.xhsPublished!.confirmedAt)));
    assert.ok(association().textContent!.includes(A)); await click('复制作品链接'); assert.deepEqual(copied, [A]);
  });
  await t.test('更换检查与取消保持旧关联,确认才替换', async () => {
    await mount(true); const before = disk(); await click('更换关联'); await prepare(B);
    assert.ok(association().textContent!.includes(A)); assert.deepEqual(disk(), before);
    await click('取消'); assert.equal(status(), '已关联 · 手动确认'); assert.deepEqual(disk(), before);
    await click('更换关联'); await prepare(B); await click('确认关联');
    assert.equal(store.get(original.id)!.xhsPublished!.url, B); assert.equal(store.get(original.id)!.body, original.body);
  });
  await t.test('保存失败保留输入、待确认目标和旧关联供重试', async () => {
    await mount(true); const before = disk(); await click('更换关联'); await prepare(B); failMark = true;
    await click('确认关联'); assert.equal(status(), '待确认'); assert.equal(input().value, B);
    assert.match(association().querySelector('[role="alert"]')!.textContent!, /合成关联失败/); assert.deepEqual(disk(), before);
    failMark = false; await click('确认关联'); assert.equal(status(), '已关联 · 手动确认'); assert.equal(store.get(original.id)!.xhsPublished!.url, B);
  });
  await t.test('写入成功后的列表读取失败不冒充保存失败或再开放重复确认', async () => {
    await mount(); await prepare(); failReadAfterWrite = true; await click('确认关联');
    assert.equal(status(), '已关联 · 手动确认'); assert.equal(markCalls.length, 1);
    assert.equal([...association().querySelectorAll('button')].some(element => element.textContent === '确认关联'), false);
    assert.equal(store.get(original.id)!.xhsPublished!.url, A); assert.equal(new CopyStore(directory).get(original.id)!.xhsPublished!.url, A);
    assert.ok(messages.includes('作品链接已关联,来源为手动确认'));
  });
  await t.test('移除需确认,取消不写入,失败保留旧记录,成功只清关联', async () => {
    await mount(true); const before = disk(); await click('移除关联'); await act(async () => { await new Promise(resolve => dom.window.requestAnimationFrame(resolve)); });
    assert.equal(dom.window.document.activeElement, button('取消')); await click('取消'); await act(async () => { await new Promise(resolve => dom.window.requestAnimationFrame(resolve)); });
    assert.equal(dom.window.document.activeElement, button('移除关联')); assert.deepEqual(disk(), before); assert.equal(clearCalls.length, 0);
    await click('移除关联'); failClear = true; await click('确认移除关联'); assert.deepEqual(disk(), before);
    assert.match(association().querySelector('[role="alert"]')!.textContent!, /合成移除失败/);
    failClear = false; await click('确认移除关联'); assert.equal(status(), '尚未关联作品');
    assert.deepEqual(store.get(original.id), original); assert.deepEqual(new CopyStore(directory).get(original.id), original);
  });
  await t.test('切博客清除待确认,不把原链接写入另一本地博客', async () => {
    await mount(); await prepare(); const before = disk(); await select(second);
    assert.equal(status(), '尚未关联作品'); assert.equal(input().value, ''); assert.deepEqual(disk(), before);
    await prepare(B); await click('确认关联'); assert.equal(store.get(second.id)!.xhsPublished!.url, B); assert.equal(store.get(original.id)!.xhsPublished, undefined);
  });
  await t.test('跨组件重挂载仍阻止同时关联,前一写入结束后再确认新目标', async () => {
    await mount(); await prepare(); deferMark = true; await click('确认关联'); await select(second); await select(original); await prepare(B);
    assert.equal(button('确认关联').disabled, true); await click('确认关联'); assert.equal(markCalls.length, 1);
    await act(async () => resolveMark!());
    assert.equal(status(), '待确认'); assert.equal(input().value, B); assert.equal(button('确认关联').disabled, false);
    deferMark = false; await click('确认关联'); assert.equal(markCalls.length, 2); assert.equal(store.get(original.id)!.xhsPublished!.url, B);
  });
  await t.test('切页卸载后返回仍防重复,旧请求结束后重新读取原博客关联', async () => {
    await mount(); await prepare(); deferMark = true; await click('确认关联');
    await act(async () => root.unmount()); root = createRoot(dom.window.document.getElementById('root')!);
    await act(async () => root.render(createElement(PublishView, { onPending: message => messages.push(message), onGoEdit: () => {}, onOpenCreator: () => {} })));
    await prepare(B); assert.equal(button('确认关联').disabled, true); assert.equal(markCalls.length, 1);
    await act(async () => resolveMark!());
    assert.equal(input().value, B); assert.equal(button('确认关联').disabled, false); assert.ok(association().textContent!.includes(A));
    deferMark = false; await click('确认关联'); assert.equal(store.get(original.id)!.xhsPublished!.url, B); assert.equal(markCalls.length, 2);
  });
  await t.test('保存过程中切博客,迟到响应不清除新博客输入或误关联', async () => {
    await mount(); await prepare(); deferMark = true; await click('确认关联'); await select(second); await fill(B);
    await act(async () => resolveMark!());
    assert.equal(input().value, B); assert.equal(status(), '尚未关联作品'); assert.equal(store.get(original.id)!.xhsPublished!.url, A); assert.equal(store.get(second.id)!.xhsPublished, undefined);
    await select(original); assert.equal(status(), '已关联 · 手动确认'); assert.ok(association().textContent!.includes(A));
  });
});
