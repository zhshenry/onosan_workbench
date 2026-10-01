import { MediaCaptureStore } from '../modules/media-capture/store';
import { mkdtempSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function makeStore(): { store: MediaCaptureStore; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'media-capture-'));
  return { store: new MediaCaptureStore(dir), dir };
}

test('采集存储:save→list→落盘→remove 级联删文件', () => {
  const { store, dir } = makeStore();
  store.save({ url: 'https://www.xiaohongshu.com/explore/x1', title: '爆款笔记钩子', png: PNG_1PX, thumb: 'data:image/png;base64,x' });
  store.save({ url: 'https://weibo.com', title: '', png: PNG_1PX });
  const items = store.list();
  assert.equal(items.length, 2);
  assert.equal(items[0].url, 'https://weibo.com'); // 新的在前
  assert.equal(items[1].title, '爆款笔记钩子'); // 空标题回落为 url? 不——title 有值保留
  const file = join(dir, 'media-captures', items[1].file);
  assert.ok(existsSync(file), '截图文件应落盘');
  const afterRemove = store.remove(items[0].id);
  assert.equal(afterRemove.length, 1);
  assert.ok(!existsSync(join(dir, 'media-captures', items[0].file)), '删除应级联删截图');
  rmSync(dir, { recursive: true, force: true });
});

test('采集存储:重启后索引恢复,非法输入被拒', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-capture-'));
  const store = new MediaCaptureStore(dir);
  store.save({ url: 'https://weibo.com', title: '微博热榜', png: PNG_1PX });
  const store2 = new MediaCaptureStore(dir); // 模拟重启
  assert.equal(store2.list().length, 1);
  assert.equal(store2.list()[0].title, '微博热榜');
  assert.throws(() => store2.save({ url: 'ftp://x', title: 'x', png: PNG_1PX }), /http\(s\)/);
  assert.throws(() => store2.save({ url: 'https://weibo.com', title: 'x', png: '' }));
  assert.equal(store2.remove('ghost').length, 1);
  rmSync(dir, { recursive: true, force: true });
});

test('采集存储:setNote 更新备注并持久化,超长被拒', () => {
  const dir = mkdtempSync(join(tmpdir(), 'media-capture-'));
  const store = new MediaCaptureStore(dir);
  store.save({ url: 'https://weibo.com', title: '微博', png: PNG_1PX });
  const id = store.list()[0].id;
  store.setNote(id, '金句素材,周五用');
  assert.equal(store.list()[0].note, '金句素材,周五用');
  const store2 = new MediaCaptureStore(dir);
  assert.equal(store2.list()[0].note, '金句素材,周五用');
  store2.setNote(id, '');
  assert.equal(store2.list()[0].note, undefined);
  assert.throws(() => store2.setNote(id, 'x'.repeat(201)), /200/);
  assert.throws(() => store2.setNote('ghost', 'x'), /不存在/);
  rmSync(dir, { recursive: true, force: true });
});
