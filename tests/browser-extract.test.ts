import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserCollections, parseBrowserField } from '../electron/browser/extract';
import { browserExtractSchema, type BrowserObservation } from '../shared/browser-automation-contracts';
import type { BrowserDriver } from '../electron/browser/driver';

test('field parsing preserves precision and rejects ambiguous numbers and invalid dates', () => {
  assert.equal(parseBrowserField('￥1,234.50', 'number'), 1234.5);
  assert.equal(parseBrowserField('1,23', 'number'), null);
  assert.equal(parseBrowserField('9007199254740993', 'number'), null);
  assert.equal(parseBrowserField('2026年10月16日', 'date'), '2026-10-16');
  assert.equal(parseBrowserField('2026-02-30', 'date'), null);
  assert.equal(parseBrowserField('10/11/2026', 'date'), null);
});

test('cross-page extraction deduplicates, preserves provenance and requires total plus end evidence for completeness', async () => {
  let page = 0;
  const rows = [[['1001', '￥1,234.50'], ['1002', '25']], [['1002', '25'], ['1003', '30']]];
  const driver = { observe: async (_shot: boolean, _full: boolean, _signal: unknown, query: { selector?: { value: string } }) => ({
    id: 'observation', tab: { id: 'tab', url: `https://fixture.test/orders?page=${page + 1}` }, frames: [{ id: 'main', available: true }], truncated: false,
    text: query.selector?.value === '#total' ? '共 3 条' : rows[page].flat().join(' '),
    elements: query.selector?.value === '#total' ? [{ name: '共 3 条' }] : rows[page].map((cells, index) => ({ frameId: 'main', ref: `row-${index}`, role: 'row', name: cells.join(' '), disabled: false, cells: cells.map(text => ({ text, role: 'cell', truncated: false })) })),
    page: { totalElements: query.selector?.value === '#total' ? 1 : 2, offset: 0 },
  } as BrowserObservation), check: async () => ({ passed: page === 1 }) } as unknown as BrowserDriver;
  const collections = new BrowserCollections();
  const input = browserExtractSchema.parse({ operation: 'collect', query: { selector: { by: 'css', value: 'tbody tr' } }, fields: [{ name: 'order', column: 0, required: true }, { name: 'amount', column: 1, type: 'number', required: true }], keyFields: ['order'], totalQuery: { selector: { by: 'css', value: '#total' } }, endCondition: { type: 'state', query: { selector: { by: 'css', value: '#next' } }, state: 'disabled' } });
  const first = await collections.extract('tab', input, driver);
  assert.equal(first.coverage.status, 'partial'); assert.equal(first.coverage.collected, 2);
  page = 1;
  const second = await collections.extract('tab', { ...input, collectionId: first.collectionId }, driver);
  assert.equal(second.coverage.status, 'complete'); assert.equal(second.coverage.collected, 3); assert.equal(second.coverage.pagesRead, 2);
  assert.equal(second.rows[0].values.amount, 1234.5); assert.equal(second.rows[0].raw.amount, '￥1,234.50');
  assert.match(second.rows[2].source.url, /page=2/); assert.equal(second.rows[2].source.frameId, 'main');
  const read = await collections.extract('tab', browserExtractSchema.parse({ operation: 'read', collectionId: first.collectionId, resultOffset: 1, resultLimit: 1 }), driver);
  assert.equal(read.rows[0].values.order, '1002'); assert.equal(read.nextOffset, 2);
  const repeated = await collections.extract('tab', { ...input, collectionId: first.collectionId }, driver);
  assert.equal(repeated.coverage.collected, 3); assert.equal(repeated.coverage.pagesRead, 2);
  await assert.rejects(collections.extract('other-tab', { ...input, collectionId: first.collectionId }, driver), /不属于/);
  collections.clear(); await assert.rejects(collections.extract('tab', { ...input, collectionId: first.collectionId }, driver), /失效/);
});

test('missing keys, truncated cells, type failures and missing total never become complete', async () => {
  const driver = { observe: async () => ({ id: 'o', tab: { url: 'https://fixture.test/' }, text: '1001 missing', frames: [{ id: 'main', available: true }], truncated: false,
    elements: [{ frameId: 'main', cells: [{ text: '1001', role: 'cell', truncated: false }, { text: 'not a number', role: 'cell', truncated: false }] }], page: { totalElements: 1, offset: 0 } }), check: async () => ({ passed: true }) } as unknown as BrowserDriver;
  const input = browserExtractSchema.parse({ operation: 'collect', query: {}, fields: [{ name: 'id', column: 0 }, { name: 'amount', column: 1, type: 'number' }], keyFields: ['id'] });
  const result = await new BrowserCollections().extract('tab', input, driver);
  assert.equal(result.coverage.status, 'partial'); assert.ok(result.coverage.invalid > 0);
  assert.equal(result.rows[0].values.amount, null); assert.equal(result.rows[0].raw.amount, 'not a number');
});
