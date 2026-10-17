import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NAV, workbenchAiContext } from '../src/nav';
import { pageAiContext, type PageAiSelection } from '../src/ai-page-context';

const none: PageAiSelection = { copy: null, bazi: null, reading: null };
const forbidden = ['工作台助手', '浏览器助手', '当前页面'];

test('工作台页面的助手卡片主标签和对象行来自导航', () => {
  assert.deepEqual(pageAiContext('game', none), {
    scope: { module: 'workbench', viewId: 'game' }, label: '游戏工作台', object: '轨迹侦探',
  });
  assert.deepEqual(pageAiContext('browser', none), {
    scope: { module: 'workbench', viewId: 'browser' }, label: '网页工作台', object: '浏览器',
  });
  assert.deepEqual(workbenchAiContext('game'), { label: '游戏工作台', object: '轨迹侦探' });
  assert.deepEqual(workbenchAiContext('browser'), { label: '网页工作台', object: '浏览器' });

  for (const workbench of NAV) {
    for (const sub of workbench.subs) {
      if (!sub.view) continue;
      const labels = workbenchAiContext(sub.view);
      assert.equal(labels.label, workbench.title, sub.view);
      assert.equal(labels.object, sub.label, sub.view);
      const page = pageAiContext(sub.view, none);
      assert.equal(page.label, sub.view === 'home' ? '待办与日程' : workbench.title, sub.view);
      assert.equal(forbidden.includes(page.label), false, page.label);
      assert.equal(forbidden.includes(page.object), false, page.object);
    }
    const workspace = workbenchAiContext(`workspace:${workbench.id}`);
    assert.deepEqual(workspace, { label: workbench.title, object: workbench.title });
  }

  assert.deepEqual(pageAiContext('media-browser', none), {
    scope: { module: 'workbench', viewId: 'media-browser' }, label: '自媒体工作台', object: '我的小红书',
  });
  assert.deepEqual(pageAiContext('copy-publish', none), {
    scope: { module: 'workbench', viewId: 'copy-publish' }, label: '自媒体工作台', object: '图文发布',
  });
  assert.deepEqual(pageAiContext('settings-general', none), {
    scope: { module: 'workbench', viewId: 'settings-general' }, label: '设置', object: '通用',
  });
  assert.deepEqual(pageAiContext('settings-ai', none), {
    scope: { module: 'workbench', viewId: 'settings-ai' }, label: '设置', object: 'AI 助手',
  });
});

test('待办、博客、命理和阅读的专用名称不随工作台文案改动', () => {
  assert.deepEqual(pageAiContext('home', none), {
    scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List',
  });
  assert.deepEqual(pageAiContext('copy', { ...none, copy: { id: 'draft-1', title: '周记' } }), {
    scope: { module: 'copy', draftId: 'draft-1' }, label: '博客编辑', object: '周记',
  });
  assert.deepEqual(pageAiContext('copy', { ...none, copy: { id: 'draft-1', title: '' } }), {
    scope: { module: 'copy', draftId: 'draft-1' }, label: '博客编辑', object: '未命名博客',
  });
  assert.deepEqual(pageAiContext('copy', none), {
    scope: { module: 'workbench', viewId: 'copy' }, label: '自媒体工作台', object: '尚未选择博客',
  });
  assert.deepEqual(pageAiContext('bazi', { ...none, bazi: { id: 'profile-1', name: '命例甲', system: 'ziwei' } }), {
    scope: { module: 'bazi', profileId: 'profile-1' }, label: '命理解读', object: '命例甲', baziSystem: 'ziwei',
  });
  assert.deepEqual(pageAiContext('bazi', none), {
    scope: { module: 'workbench', viewId: 'bazi' }, label: '小工具', object: '尚未选择命例',
  });
  assert.deepEqual(pageAiContext('reading', { ...none, reading: { id: 'book-1', title: '海边的卡夫卡' } }), {
    scope: { module: 'reading', profileId: 'book-1' }, label: '阅读助手', object: '海边的卡夫卡',
  });
  assert.deepEqual(pageAiContext('reading', none), {
    scope: { module: 'workbench', viewId: 'reading' }, label: '小工具', object: '阅读清单',
  });
});
