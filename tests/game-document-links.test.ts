import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveGameDocumentLink } from '../shared/game-documents';

test('document links resolve against the current file, preserve anchors, and decode project filenames', () => {
  assert.deepEqual(resolveGameDocumentLink('README.md', 'docs/运行%20说明.md#启动'), { kind: 'document', path: 'docs/运行 说明.md', hash: '启动' });
  assert.deepEqual(resolveGameDocumentLink('docs/setup.md', '../README.md'), { kind: 'document', path: 'README.md', hash: '' });
  assert.deepEqual(resolveGameDocumentLink('docs/setup.md', '#开始'), { kind: 'document', path: 'docs/setup.md', hash: '开始' });
  assert.deepEqual(resolveGameDocumentLink('docs/setup.md', '/docs/other.MD?plain=1#section'), { kind: 'document', path: 'docs/other.MD', hash: 'section' });
});

test('document links reject traversal, OS paths and active schemes while allowing explicit web links', () => {
  for (const href of ['../private.md', 'docs/../../private.md', '%2e%2e/private.md', 'docs/%2e%2e/%2e%2e/private.md', 'C:/private.md', '\\server\\private.md', '//server/private.md', 'file:///private.md', 'javascript:alert(1)', 'data:text/html,hi', 'https://user:pass@example.com', 'game.js', 'docs/%00.md', '..%5cprivate.md']) assert.throws(() => resolveGameDocumentLink('README.md', href));
  assert.deepEqual(resolveGameDocumentLink('README.md', 'https://example.com/docs?q=1#section'), { kind: 'external', url: 'https://example.com/docs?q=1#section' });
});
