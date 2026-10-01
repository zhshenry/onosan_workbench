import assert from 'node:assert/strict';
import test from 'node:test';
import { isXhsCreatorNavigation } from '../shared/browser-contracts';

test('小红书创作者会话只允许官方 HTTPS 域名内导航', () => {
  assert.equal(isXhsCreatorNavigation('https://creator.xiaohongshu.com/'), true);
  assert.equal(isXhsCreatorNavigation('https://www.xiaohongshu.com/explore'), true);
  assert.equal(isXhsCreatorNavigation('https://login.xiaohongshu.com/path'), true);
  assert.equal(isXhsCreatorNavigation('http://creator.xiaohongshu.com/'), false);
  assert.equal(isXhsCreatorNavigation('https://creator.xiaohongshu.com:8443/'), false);
  assert.equal(isXhsCreatorNavigation('https://xiaohongshu.com.evil.test/'), false);
  assert.equal(isXhsCreatorNavigation('https://evil-xiaohongshu.com/'), false);
  assert.equal(isXhsCreatorNavigation('https://user:pass@creator.xiaohongshu.com/'), false);
});
