import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AiStore } from '../electron/ai-store';
import { chatContextScope, defaultAiScopeForWorkbench, sameAiScope, sameAiWorkbench, workbenchForScope } from '../shared/ai-scope';
import { buildBaziContribution } from '../modules/bazi/ai';
import { buildWorkbenchContribution, withWorkbenchContext } from '../modules/workbench-ai';
import { NAV } from '../src/nav';
import type { BaziProfile } from '../shared/bazi-contracts';

test('旧对话原样保留，按工作台分组并持久化当前关联范围', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-scope-'));
  let store = new AiStore(dir);
  try {
    const legacy = store.newChat();
    delete legacy.module;
    delete legacy.contextScope;
    delete legacy.pageScope;
    legacy.draft = '待办输入';
    store.saveChat(legacy);
    const firstArticle = store.newChat({ module: 'copy', draftId: 'article-1' });
    const otherArticle = store.newChat({ module: 'copy', draftId: 'article-2' });
    const firstProfile = store.newChat({ module: 'bazi', profileId: 'profile-1' });
    const otherProfile = store.newChat({ module: 'bazi', profileId: 'profile-2' });
    firstProfile.draft = '这个日主是什么意思';
    store.saveChat(firstProfile);
    assert.deepEqual(store.chats().filter(chat => sameAiScope(chat, { module: 'copy', draftId: 'article-1' })).map(chat => chat.id), [firstArticle.id]);
    assert.deepEqual(store.chats().filter(chat => sameAiScope(chat, { module: 'bazi', profileId: 'profile-1' })).map(chat => chat.id), [firstProfile.id]);
    assert.ok(sameAiScope(store.chat(legacy.id), { module: 'todo' }));
    assert.ok(!sameAiScope(store.chat(otherArticle.id), { module: 'todo' }));
    assert.ok(sameAiWorkbench(store.chat(firstArticle.id), { module: 'copy', draftId: 'article-2' }));
    assert.ok(sameAiWorkbench(store.chat(firstArticle.id), { module: 'workbench', viewId: 'copy-publish' }));
    assert.ok(!sameAiWorkbench(store.chat(firstArticle.id), { module: 'bazi', profileId: 'profile-1' }));
    firstArticle.contextScope = { module: 'copy', draftId: 'article-2' };
    firstArticle.pageScope = { module: 'workbench', viewId: 'copy-publish' };
    store.saveChat(firstArticle);
    store.close();
    store = new AiStore(dir);
    assert.equal(store.chat(legacy.id).draft, '待办输入');
    assert.equal(store.chat(firstProfile.id).draft, '这个日主是什么意思');
    assert.deepEqual(chatContextScope(store.chat(firstArticle.id)), { module: 'copy', draftId: 'article-2' });
    assert.deepEqual(store.chats().find(chat => chat.id === firstArticle.id)?.pageScope, { module: 'workbench', viewId: 'copy-publish' });
    const replacement = store.deleteChat(firstProfile.id);
    assert.equal(replacement.id, otherProfile.id);
    assert.equal(store.chat(otherProfile.id).id, otherProfile.id);
    assert.equal(store.chat(firstArticle.id).id, firstArticle.id);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('所有已上线页面都能归入一级工作台，未知页面不能跨对象借用权限', () => {
  for (const workbench of NAV) {
    for (const page of workbench.subs.filter(sub => sub.view)) {
      assert.equal(workbenchForScope({ module: 'workbench', viewId: page.view! }), workbench.id);
    }
  }
  assert.equal(workbenchForScope({ module: 'workbench', viewId: 'unknown-page' }), null);
  assert.ok(!sameAiWorkbench({ module: 'workbench', viewId: 'unknown-page' }, { module: 'copy', draftId: 'article-1' }));
});

test('空的自媒体工作区可直接开启通用对话，但不获得博客数据或工具', () => {
  for (const workbench of NAV.filter(item => !item.pending)) {
    const initialScope = defaultAiScopeForWorkbench(workbench.id);
    assert.ok(initialScope);
    assert.equal(workbenchForScope(initialScope), workbench.id);
  }
  assert.equal(defaultAiScopeForWorkbench('game'), null);
  const scope = defaultAiScopeForWorkbench('media')!;
  if (scope.module !== 'workbench') throw new Error('自媒体工作区需要通用对话范围');
  assert.deepEqual(scope, { module: 'workbench', viewId: 'workspace:media' });
  assert.equal(workbenchForScope(scope), 'media');
  assert.ok(sameAiWorkbench({ module: 'copy', draftId: 'article-1' }, scope));
  const contribution = withWorkbenchContext(buildWorkbenchContribution(scope.viewId), scope);
  assert.deepEqual(contribution.toolNames, []);
  assert.match(contribution.systemPrompt(new Date()), /工作台「自媒体工作台」/);
  assert.match(contribution.systemPrompt(new Date()), /没有具体页面或业务对象的业务数据或写入工具/);
  assert.ok(!contribution.systemPrompt(new Date()).includes('article-1'));
});

test('对话摘要区分执行中、成功完成和中断', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-status-'));
  let store = new AiStore(dir);
  try {
    const chat = store.newChat({ module: 'todo' });
    const status = () => {
      const { streaming, completed } = store.chats().find(item => item.id === chat.id)!;
      return { streaming, completed };
    };
    assert.deepEqual(status(), { streaming: false, completed: false });
    chat.entries.push({ id: 'user-1', role: 'user', content: '安排日程' }, { id: 'reply-1', role: 'assistant', content: '', streaming: true });
    store.saveChat(chat);
    assert.deepEqual(status(), { streaming: true, completed: false });
    chat.entries[1].streaming = false;
    chat.entries[1].content = '建议明天上午安排。';
    store.saveChat(chat);
    assert.deepEqual(status(), { streaming: false, completed: true });
    chat.entries.push({ id: 'user-2', role: 'user', content: '再调整一下' }, { id: 'reply-2', role: 'assistant', content: '', streaming: true });
    store.saveChat(chat);
    store.close();
    store = new AiStore(dir);
    assert.deepEqual(status(), { streaming: false, completed: false });
    assert.match(store.chat(chat.id).entries[3].error ?? '', /中断/);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('历史对话重命名会持久化且不改动草稿，删除其他工作台对话不新建占位对话', () => {
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-rename-'));
  let store = new AiStore(dir);
  try {
    const blog = store.newChat({ module: 'copy', draftId: 'blog-1' });
    blog.draft = '未发送的内容';
    store.saveChat(blog);
    const renamed = store.renameChat(blog.id, '  选题讨论  ');
    assert.equal(renamed.title, '选题讨论');
    assert.equal(renamed.titleEdited, true);
    assert.equal(renamed.draft, '未发送的内容');
    assert.throws(() => store.renameChat(blog.id, '  '), /1–80 字/);
    renamed.entries.push({ id: 'reply', role: 'assistant', content: '', streaming: true });
    store.saveChat(renamed);
    assert.throws(() => store.renameChat(blog.id, '进行中'), /正在生成/);
    renamed.entries[0].streaming = false;
    store.saveChat(renamed);
    const home = store.newChat({ module: 'todo' });
    store.close();
    store = new AiStore(dir);
    assert.equal(store.chat(blog.id).title, '选题讨论');
    assert.equal(store.chat(blog.id).titleEdited, true);
    assert.equal(store.deleteChat(blog.id).id, home.id);
    assert.equal(store.chats().filter(chat => chat.module === 'copy').length, 0);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('命理贡献只使用指定命例和已计算八字，不暴露待办写入工具', () => {
  const profile: BaziProfile = {
    id: 'profile-1', name: '测试命例', gender: 1, date: '1990-08-16',
    time: '14:30', createdAt: '2026-09-28T00:00:00.000Z',
  };
  const contribution = buildBaziContribution(profile, 'bazi');
  const prompt = contribution.systemPrompt(new Date());
  assert.deepEqual(contribution.toolNames, []);
  assert.deepEqual(contribution.buildTools(), []);
  assert.match(prompt, /测试命例/);
  assert.match(prompt, /八字四柱/);
  assert.match(prompt, /不能.*?写入|不能建议已经执行任何写入/);
  assert.ok(!prompt.includes('article-1'));
  assert.match(buildBaziContribution(profile, 'ziwei').systemPrompt(new Date()), /紫微斗数/);
  assert.match(buildBaziContribution(profile, 'astro').systemPrompt(new Date()), /缺少出生地/);
  const shared = withWorkbenchContext(contribution, { module: 'bazi', profileId: profile.id }, profile.name, { module: 'workbench', viewId: 'bazi' });
  assert.deepEqual(shared.toolNames, []);
  assert.match(shared.systemPrompt(new Date()), /小工具.*profile-1.*测试命例/);
  assert.match(shared.systemPrompt(new Date()), /当前可核实的业务数据和可用工具仅限本轮/);
  assert.match(shared.systemPrompt(new Date()), /此页面没有提供业务数据或专用工具/);
});

test('命理上下文包含完整八字和对应笔记，以本轮日期确定大运流年', () => {
  const profile: BaziProfile = { id: 'profile-a', name: '同名命例', gender: 1, date: '1990-08-16', time: '14:30', createdAt: '2026-09-30T00:00:00Z' };
  const first = buildBaziContribution(profile, 'bazi', 'A 的笔记：正在核对丁亥大运。');
  const prompt = first.systemPrompt(new Date(2026, 8, 30));
  for (const detail of ['profile-a', '藏干与十神', '丁(偏财)', '纳音', '路旁土', '神煞', '起运：1998-03-08', '丁亥 29-38岁(2018-2027年)（当前）', '当前大运(丁亥)流年', '2026 丙午', 'A 的笔记', '本轮日期：2026-09-30']) assert.ok(prompt.includes(detail), detail);
  const later = first.systemPrompt(new Date(2028, 0, 1));
  assert.match(later, /当前大运\(戊子\)流年/);
  assert.ok(!later.includes('丁亥 29-38岁(2018-2027年)（当前）'));
  for (const system of ['bazi', 'ziwei', 'astro'] as const) {
    const second = buildBaziContribution({ ...profile, id: 'profile-b', date: '1993-02-23', time: '06:15', gender: 0 }, system, 'B 的独立笔记').systemPrompt(new Date(2026, 8, 30));
    assert.match(second, /profile-b/);
    assert.match(second, /B 的独立笔记/);
    assert.ok(!second.includes('profile-a'));
    assert.ok(!second.includes('A 的笔记'));
  }
});
