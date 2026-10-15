import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { BrowserStore } from '../electron/browser/store';
import { browserAddressTarget, browserHistorySince, filterBrowserHistory } from '../shared/browser-history';
import { browserActionSchema, browserQuerySchema, browserRecordUrl } from '../shared/browser-automation-contracts';

test('address search distinguishes ordinary queries, local URLs and disallowed schemes', () => {
  assert.equal(browserAddressTarget('浏览器 自动化'), 'https://www.google.com/search?q=%E6%B5%8F%E8%A7%88%E5%99%A8%20%E8%87%AA%E5%8A%A8%E5%8C%96');
  assert.equal(browserAddressTarget('example.com/report?id=42#details'), 'https://example.com/report?id=42#details');
  assert.equal(browserAddressTarget('localhost:4173/test'), 'http://localhost:4173/test');
  for (const value of ['', 'javascript:alert(1)', 'file:///private', 'https://user:secret@example.com']) assert.equal(browserAddressTarget(value), undefined);
});
test('recorded ordinary routes preserve business state while authentication callbacks are scrubbed', () => {
  assert.equal(browserRecordUrl('https://example.com/report?id=42#details'), 'https://example.com/report?id=42#details');
  for (const url of ['https://example.com/callback?code=secret&state=opaque#route', 'https://example.com/callback#access_token=secret', 'https://example.com/callback?API_KEY=secret']) assert.equal(browserRecordUrl(url), 'https://example.com/callback');
});
test('history search, entry deletion and time clearing retain old records, tabs and other profiles', () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'browser-history-')), filename = path.join(directory, 'state.json');
  try {
    const store = new BrowserStore(filename); store.saveTabs('default', [{ id: 'tab', url: 'https://example.com/report?id=42#details' }], 'tab');
    store.visit('default', 'https://example.com/old', '旧报表');
    const data = JSON.parse(readFileSync(filename, 'utf8')); data.workspaces.default.history[0].at = new Date(Date.now() - 86400000 * 2).toISOString(); writeFileSync(filename, JSON.stringify(data));
    const restored = new BrowserStore(filename); restored.visit('default', 'https://example.com/new', '新报表'); restored.visit('xhs-creator', 'https://creator.xiaohongshu.com/', '保留');
    const records = restored.state('default').history;
    assert.equal(filterBrowserHistory(records, '报表', browserHistorySince('day')).length, 1);
    restored.clearHistory('default', browserHistorySince('day')); assert.equal(restored.state('default').history[0].title, '旧报表');
    assert.equal(restored.state('default').tabs[0].url, 'https://example.com/report?id=42#details');
    assert.equal(restored.state('xhs-creator').history.length, 1);
    restored.deleteHistory('default', [records[0].id]); assert.equal(restored.state('default').history.length, 0);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
test('query and new actions remain bounded and do not accept executable source', () => {
  assert.equal(browserQuerySchema.safeParse({ selector: { by: 'css', value: '#orders button' }, limit: 251 }).success, false);
  assert.equal(browserQuerySchema.safeParse({ evaluate: 'arbitrary()' }).success, false);
  assert.equal(browserActionSchema.safeParse({ type: 'pressSequentially', ref: 'element', text: 'test', delayMs: 300 }).success, false);
  assert.deepEqual(browserActionSchema.parse({ type: 'setChecked', ref: 'element', checked: false }), { type: 'setChecked', ref: 'element', checked: false });
});
