import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PUBLISH_ASSOCIATION_MATRIX, PUBLISH_ASSOCIATION_SCREENSHOTS,
  assertPublishAssociationRecord, assertPublishAssociationGeometry, assertPublishAssociationInventory,
  waitForPublishCopyState,
  assertPublishAssociationFrame,
  installPublishWriteFixture, configurePublishWriteFixture, releasePublishWriteFixture,
  restorePublishWriteFixture, publishWriteFixtureCalls,
} from '../tooling/publish-association-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';
import { copyStoreDataSchema, xhsPublishedSchema } from '../shared/copy-contracts';

const MARK = 'copy:markXhsPublished'; const CLEAR = 'copy:clearXhsPublished';
const blog = () => ({ id: 'synthetic-ui-blog', title: '合成完整本地博客标题', body: '正文必须保持原样。\n#本地验收', platform: 'xiaohongshu', createdAt: '2026-10-13T01:00:00.000Z', updatedAt: '2026-10-13T02:00:00.000Z' });
const association = () => ({ status: 'published', source: 'manual', url: 'https://www.xiaohongshu.com/explore/64abcdef1234567800000001', remoteId: '64abcdef1234567800000001', confirmedAt: '2026-10-13T03:00:00.000Z' });
const geometry = () => ({
  viewport: { x: 0, y: 0, width: 1024, height: 680 },
  // The section is naturally taller than the scroller. Individual fields are
  // measured after real scrolling, rather than claiming it all fits at once.
  section: { x: 540, y: -160, width: 430, height: 880 }, clientWidth: 428, scrollWidth: 428,
  fields: [{ label: '完整作品链接', bounds: { x: 560, y: 140, width: 360, height: 70 }, complete: true, control: false, hit: true },
    { label: '确认关联', bounds: { x: 560, y: 230, width: 96, height: 36 }, complete: true, control: true, hit: true }],
});

function runtimeFixture() {
  const writes: Array<{ channel: string; args: unknown[] }> = [];
  const mark = (_event: unknown, ...args: unknown[]) => { writes.push({ channel: MARK, args }); return { real: 'mark' }; };
  const clear = (_event: unknown, ...args: unknown[]) => { writes.push({ channel: CLEAR, args }); return { real: 'clear' }; };
  const read = () => ({ drafts: [blog()] });
  const save = () => { throw new Error('Unrelated writes must never be touched by the fixture'); };
  const handlers = new Map<string, any>([[MARK, mark], [CLEAR, clear], ['copy:list', read], ['copy:save', save]]);
  const runtime = { ipcMain: {
    _invokeHandlers: handlers,
    removeHandler: (channel: string) => { handlers.delete(channel); },
    handle: (channel: string, handler: unknown) => { assert.equal(handlers.has(channel), false); handlers.set(channel, handler); },
  } };
  type Runtime = typeof runtime;
  const application = { evaluate: async (callback: (runtime: Runtime, argument?: any) => any, argument?: any) => callback(runtime, argument) };
  const mainFrame = {}; const event = { sender: { id: 17, mainFrame }, senderFrame: mainFrame };
  return { application, runtime, handlers, writes, mark, clear, read, save, event };
}

test('Publish association native matrix covers all themes, real sizes and motion modes with four fixed screenshots', () => {
  assert.equal(PUBLISH_ASSOCIATION_MATRIX.length, 12);
  assert.ok(Object.isFrozen(PUBLISH_ASSOCIATION_MATRIX) && PUBLISH_ASSOCIATION_MATRIX.every(Object.isFrozen));
  for (const theme of ['mist', 'cool', 'warm']) for (const size of ['1280x820', '1024x680']) for (const reducedMotion of ['no-preference', 'reduce']) {
    assert.equal(PUBLISH_ASSOCIATION_MATRIX.filter(entry => entry.theme === theme && `${entry.width}x${entry.height}` === size && entry.reducedMotion === reducedMotion).length, 1);
  }
  assert.deepEqual(PUBLISH_ASSOCIATION_SCREENSHOTS, ['publish-association-unlinked.png', 'publish-association-pending.png', 'publish-association-linked.png', 'publish-association-error.png']);
  assert.ok(Object.isFrozen(PUBLISH_ASSOCIATION_SCREENSHOTS));
});

test('Association persistence assertions retain every original field and require exact current schema data', () => {
  const original = blog(); const published = association();
  assert.equal(xhsPublishedSchema.safeParse(published).success, true);
  assert.equal(copyStoreDataSchema.safeParse({ drafts: [{ ...original, xhsPublished: published }] }).success, true);
  assert.doesNotThrow(() => assertPublishAssociationRecord({ ...original, xhsPublished: published }, original, published));
  assert.doesNotThrow(() => assertPublishAssociationRecord(original, { ...original, xhsPublished: published }, undefined));
  for (const key of ['id', 'createdAt', 'updatedAt', 'title', 'body', 'platform']) {
    assert.throws(() => assertPublishAssociationRecord({ ...original, [key]: 'changed', xhsPublished: published }, original, published), /preserve every blog field/);
  }
  for (const key of Object.keys(published)) {
    assert.throws(() => assertPublishAssociationRecord({ ...original, xhsPublished: { ...published, [key]: 'changed' } }, original, published), /Exact status, source/);
  }
  assert.throws(() => assertPublishAssociationRecord({ ...original, xhsPublished: undefined }, original, undefined), /must be absent/);
  assert.throws(() => assertPublishAssociationRecord(undefined, original, published), /identity/);
  const invalid = { ...published, confirmedAt: 'invalid' };
  assert.throws(() => assertPublishAssociationRecord({ ...original, xhsPublished: invalid }, original, invalid), /ISO confirmation time/);
  const extra = { ...published, platformVerified: true };
  assert.throws(() => assertPublishAssociationRecord({ ...original, xhsPublished: extra }, original, extra));
});

test('Association inventory composes empty or populated earlier pilots with only captured owned IDs', () => {
  assert.deepEqual(assertPublishAssociationInventory({ drafts: [] }, { drafts: [] }, []), []);
  const earlier = { drafts: [{ ...blog(), id: 'earlier-reference', title: 'Earlier reference', xhsPublished: association() }, { ...blog(), id: 'earlier-primary', title: 'Earlier primary' }] };
  const owned = [{ ...blog(), id: 'owned-a' }, { ...blog(), id: 'owned-b' }];
  const actual = { drafts: [owned[1], owned[0], ...structuredClone(earlier.drafts)] };
  const before = structuredClone(actual);
  assert.deepEqual(assertPublishAssociationInventory(actual, earlier, ['owned-a', 'owned-b']), owned);
  assert.deepEqual(actual, before, 'Inventory assertions must never write or rearrange the actual store');
  const linked = { drafts: [{ ...owned[1] }, { ...owned[0], xhsPublished: association() }, ...structuredClone(earlier.drafts)] };
  assert.doesNotThrow(() => assertPublishAssociationInventory(linked, earlier, ['owned-a', 'owned-b']));
  assertPublishAssociationRecord(linked.drafts[1], owned[0], association());
  assertPublishAssociationRecord(linked.drafts[0], owned[1], undefined);
});

test('Association inventory rejects missing, extra, duplicate, overlapping or changed earlier records', () => {
  const earlier = { drafts: [{ ...blog(), id: 'earlier-reference', xhsPublished: association() }, { ...blog(), id: 'earlier-primary' }] };
  const actual = { drafts: [{ ...blog(), id: 'owned-a' }, { ...blog(), id: 'owned-b' }, ...structuredClone(earlier.drafts)] };
  const owned = ['owned-a', 'owned-b'];
  for (const key of ['id', 'title', 'body', 'createdAt', 'updatedAt', 'platform'] as const) {
    const changed = structuredClone(actual); changed.drafts[2][key] = 'changed earlier field';
    assert.throws(() => assertPublishAssociationInventory(changed, earlier, owned));
  }
  const changedAssociation = structuredClone(actual); changedAssociation.drafts[2].xhsPublished!.confirmedAt = '2026-10-13T04:00:00.000Z';
  assert.throws(() => assertPublishAssociationInventory(changedAssociation, earlier, owned), /Every earlier blog field/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: actual.drafts.slice(0, -1) }, earlier, owned), /Only the exact/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: [...actual.drafts, { ...blog(), id: 'unexpected-third' }] }, earlier, owned), /Only the exact/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: [...actual.drafts, actual.drafts[0]] }, earlier, owned), /duplicate blog IDs/);
  assert.throws(() => assertPublishAssociationInventory(actual, earlier, ['owned-a', 'owned-a']), /Owned IDs/);
  assert.throws(() => assertPublishAssociationInventory(actual, earlier, ['owned-a', 'earlier-primary']), /Owned IDs/);
  const reordered = structuredClone(actual); [reordered.drafts[2], reordered.drafts[3]] = [reordered.drafts[3], reordered.drafts[2]];
  assert.throws(() => assertPublishAssociationInventory(reordered, earlier, owned), /relative order/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: [{ ...blog(), id: '' }] }, { drafts: [] }, ['']), /nonempty blog IDs/);
});

test('Association restart inventory requires the entire final snapshot including all owned and earlier fields and order', () => {
  const earlier = { drafts: [{ ...blog(), id: 'earlier-reference', xhsPublished: association() }] };
  const finalState = { drafts: [{ ...blog(), id: 'owned-a', xhsPublished: association() }, { ...blog(), id: 'owned-b' }, ...structuredClone(earlier.drafts)] };
  const owned = ['owned-a', 'owned-b'];
  assert.doesNotThrow(() => assertPublishAssociationInventory(structuredClone(finalState), earlier, owned, finalState));
  for (const index of [0, 1, 2]) for (const key of ['title', 'body', 'createdAt', 'updatedAt', 'platform'] as const) {
    const changed = structuredClone(finalState); changed.drafts[index][key] = 'restart drift';
    assert.throws(() => assertPublishAssociationInventory(changed, earlier, owned, finalState));
  }
  const changedAssociation = structuredClone(finalState); changedAssociation.drafts[0].xhsPublished!.url += '/unexpected';
  assert.throws(() => assertPublishAssociationInventory(changedAssociation, earlier, owned, finalState), /complete persisted blog snapshot/);
  const reordered = structuredClone(finalState); [reordered.drafts[0], reordered.drafts[1]] = [reordered.drafts[1], reordered.drafts[0]];
  assert.throws(() => assertPublishAssociationInventory(reordered, earlier, owned, finalState), /complete persisted blog snapshot/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: finalState.drafts.slice(1) }, earlier, owned, finalState), /Only the exact/);
  assert.throws(() => assertPublishAssociationInventory({ drafts: [...finalState.drafts, { ...blog(), id: 'restart-extra' }] }, earlier, owned, finalState), /Only the exact/);
});

test('Host copy readback retries false IPC results until the exact new association is present', async () => {
  let reads = 0;
  const previous = { ...blog(), xhsPublished: { ...association(), remoteId: 'wrong-existing-id' } };
  const expected = { ...blog(), xhsPublished: association() };
  const page = { evaluate: async () => ({ drafts: [++reads < 3 ? previous : expected] }) };
  const result = await waitForPublishCopyState(page, value =>
    value.drafts[0].xhsPublished.remoteId === expected.xhsPublished.remoteId, 'Expected association was not saved');
  assert.equal(reads, 3, 'False IPC results must cause genuine later reads, never a truthy Promise shortcut');
  assert.deepEqual(result, { drafts: [expected] });
});

test('Host copy readback has a five-second deadline even when an IPC read never settles', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 });
  const page = { evaluate: () => new Promise(() => {}) };
  const failed = assert.rejects(waitForPublishCopyState(page, () => false, 'Synthetic hung copy read'), /Synthetic hung copy read timed out after 5000ms/);
  await Promise.resolve(); t.mock.timers.tick(5000); await failed;
});

test('Host copy readback propagates read failures and rejects async readiness predicates', async () => {
  await assert.rejects(waitForPublishCopyState({ evaluate: async () => { throw new Error('Synthetic copy read failure'); } }, () => true, 'Read failure'), /Synthetic copy read failure/);
  await assert.rejects(waitForPublishCopyState({ evaluate: async () => ({ drafts: [] }) }, async () => false, 'Async predicate'), /synchronous boolean/);
});

test('Association geometry supports natural vertical scrolling but rejects missing, clipped or intercepted fields', () => {
  assert.doesNotThrow(() => assertPublishAssociationGeometry(geometry()));
  const samples: Array<[(value: ReturnType<typeof geometry>) => void, RegExp]> = [
    [value => { value.section.width = 600; }, /fit horizontally/],
    [value => { value.clientWidth = NaN; }, /overflow horizontally/],
    [value => { value.scrollWidth++; }, /overflow horizontally/],
    [value => { value.fields = []; }, /fields and controls/],
    [value => { value.fields[0].bounds.y = -2; }, /visible viewport/],
    [value => { value.fields[0].bounds.width = 0; }, /nonempty/],
    [value => { value.fields[0].bounds.x = Infinity; }, /finite/],
    [value => { value.fields[0].bounds.width = 500; }, /visible viewport/],
    [value => { value.fields[0].complete = false; }, /complete text/],
    [value => { value.fields[1].hit = false; }, /pointer hit/],
  ];
  for (const [modify, expected] of samples) { const value = geometry(); modify(value); assert.throws(() => assertPublishAssociationGeometry(value), expected); }
});

test('Association screenshot frames require simultaneous complete state fields inside the real scroller with no toast', () => {
  const requirements = {
    '尚未关联作品': ['heading', 'state', 'blog', 'input', 'format-check'],
    '待确认': ['heading', 'state', 'blog', 'input', 'format-check', 'target', 'confirm', 'cancel'],
    '已关联 · 手动确认': ['heading', 'state', 'record', 'copy', 'change', 'remove'],
    '链接格式不正确': ['heading', 'state', 'blog', 'input', 'format-check', 'error'],
  };
  const frame = (state: keyof typeof requirements) => ({
    state, toastHidden: true, viewport: { x: 0, y: 0, width: 1280, height: 820 },
    clip: { x: 606, y: 86, width: 648, height: 708 }, section: { x: 625, y: 110, width: 600, height: 600 }, clientWidth: 598, scrollWidth: 598,
    fields: requirements[state].map((kind, index) => ({ kind, label: kind, bounds: { x: 640, y: 130 + index * 50, width: 560, height: 40 },
      complete: true, control: ['input', 'format-check', 'confirm', 'cancel', 'copy', 'change', 'remove'].includes(kind), hit: true, textHit: true, controlHit: true })),
  });
  for (const state of Object.keys(requirements) as Array<keyof typeof requirements>) {
    assert.doesNotThrow(() => assertPublishAssociationFrame(frame(state), state));
    for (const kind of requirements[state]) {
      const missing = frame(state); missing.fields = missing.fields.filter(field => field.kind !== kind);
      assert.throws(() => assertPublishAssociationFrame(missing, state), /requires exactly one/);
    }
    const toast = frame(state); toast.toastHidden = false;
    assert.throws(() => assertPublishAssociationFrame(toast, state), /toast to disappear/);
    const wrong = frame(state); wrong.state = '尚未关联作品';
    if (state !== wrong.state) assert.throws(() => assertPublishAssociationFrame(wrong, state), /exact expected state/);
  }
  const pending = frame('待确认');
  // Reproduce the old capture failure: a control can be inside the screenshot
  // viewport but below the actual copy-editor's clipped content area.
  pending.fields.find(field => field.kind === 'confirm')!.bounds.y = 780;
  assert.throws(() => assertPublishAssociationFrame(pending, '待确认'), /clipped by the actual scroll panel/);
  const headerOnly = frame('尚未关联作品'); headerOnly.section.y = 712;
  assert.throws(() => assertPublishAssociationFrame(headerOnly, '尚未关联作品'), /entire association section/);
  const clippedText = frame('待确认'); clippedText.fields.find(field => field.kind === 'target')!.complete = false;
  assert.throws(() => assertPublishAssociationFrame(clippedText, '待确认'), /complete text/);
  const overlay = frame('链接格式不正确'); overlay.fields.find(field => field.kind === 'error')!.hit = false;
  assert.throws(() => assertPublishAssociationFrame(overlay, '链接格式不正确'), /obscured/);
  // A URL line or a control edge may be covered while its container centre is
  // still reachable; centre-only checks must never accept that partial overlay.
  const partialText = frame('待确认'); partialText.fields.find(field => field.kind === 'target')!.textHit = false;
  assert.throws(() => assertPublishAssociationFrame(partialText, '待确认'), /text is obscured/);
  const partialControl = frame('待确认'); partialControl.fields.find(field => field.kind === 'confirm')!.controlHit = false;
  assert.throws(() => assertPublishAssociationFrame(partialControl, '待确认'), /control is obscured/);
  const duplicate = frame('待确认'); duplicate.fields.push(duplicate.fields.find(field => field.kind === 'cancel')!);
  assert.throws(() => assertPublishAssociationFrame(duplicate, '待确认'), /exactly one cancel/);
  assert.throws(() => assertPublishAssociationFrame(frame('待确认'), 'unknown'), /Unknown/);
});

test('Pinned Playwright synchronously polls association readiness until toast opacity and finite animations are settled', async () => {
  const source = await readFile(new URL('../tooling/publish-association-pilot.mjs', import.meta.url), 'utf8');
  const pinned = await readFile(new URL('../node_modules/playwright-core/lib/coreBundle.js', import.meta.url), 'utf8');
  const implementation = pinned.slice(pinned.indexOf('async waitForFunctionExpression('), pinned.indexOf('async waitForFunctionExpressionOnElement('));
  assert.match(implementation, /const success = predicate\(\);\s*if \(success\) \{\s*fulfill\(success\);\s*return;/);
  const capture = source.slice(source.indexOf('async function captureAssociationFrame'), source.indexOf('// Bounded main-frame-only'));
  const navigation = source.slice(source.indexOf('async function settledNavigation'), source.indexOf('async function openCopy'));
  const captureCallback = capture.match(/await page\.waitForFunction\(((?:async )?\(\) => \{[\s\S]*?\n  \})\);/);
  const navigationCallback = navigation.match(/await page\.waitForFunction\(((?:async )?\(\{ workbench, label \}\) => \{[\s\S]*?\n  \})\s*,/);
  assert.ok(captureCallback); assert.ok(navigationCallback);
  for (const text of [capture, navigation]) {
    const fonts = text.indexOf('await page.evaluate(async () => { await document.fonts.ready; });');
    assert.ok(fonts >= 0 && fonts < text.indexOf('await page.waitForFunction(', fonts), 'Font Promise must be awaited separately before boolean polling');
  }
  // Match the actual pinned polling semantics without launching a browser or
  // IPC socket: a truthy Promise resolves once, even when its value is false.
  const poll = async (predicate: () => unknown, advance: () => void) => {
    for (let polls = 1; polls <= 6; polls++) {
      const success = predicate(); if (success) return { value: await success, polls };
      advance();
    }
    throw new Error('Readiness never became true');
  };
  assert.deepEqual(await poll(async () => false, () => assert.fail('Promise short-circuits before retry')), { value: false, polls: 1 });
  let step = 0; let opacityOverride: string | null = null;
  class Element { closest() { return true; } }
  const toast = { getAttribute: () => step === 0 ? '1' : '0' };
  const tree = { querySelector: () => ({ textContent: '图文发布' }) };
  const menu = { querySelector: (selector: string) => selector === '.tree[data-switching="false"]' ? tree : { textContent: '自媒体工作台' } };
  const document = {
    fonts: { ready: Promise.resolve() },
    querySelector: (selector: string) => selector === '.toast' ? toast : step < 2 ? null
      : selector.includes('.rail') ? { getAttribute: () => 'media' } : menu,
    getAnimations: () => [{ effect: { getComputedTiming: () => ({ iterations: 1 }), target: new Element() }, pending: step === 2, playState: step < 3 ? 'running' : 'finished' }],
  };
  const style = () => ({ opacity: opacityOverride ?? (step === 0 ? '1' : step === 1 ? '0.2' : '0') });
  const capturePredicate = new Function('document', 'getComputedStyle', 'Element', `return (${captureCallback[1]});`)(document, style, Element);
  assert.equal(typeof capturePredicate(), 'boolean', 'Capture predicate must not return a truthy Promise');
  assert.deepEqual(await poll(capturePredicate, () => step++), { value: true, polls: 4 });
  opacityOverride = '0.000001'; assert.equal(capturePredicate(), false, 'Even tiny nonzero toast opacity must wait');
  opacityOverride = 'not-a-number'; assert.equal(capturePredicate(), false, 'Invalid opacity must fail closed');
  opacityOverride = null; step = 0;
  const navigationPredicate = new Function('document', 'Element', `return (${navigationCallback[1]});`)(document, Element);
  const readyNavigation = () => navigationPredicate({ workbench: 'media', label: '图文发布' });
  assert.equal(typeof readyNavigation(), 'boolean', 'Navigation predicate must not return a truthy Promise');
  assert.deepEqual(await poll(readyNavigation, () => step++), { value: true, polls: 4 });
  assert.ok(capture.indexOf('screenshotFrames ??= []') < capture.indexOf('assertPublishAssociationFrame(frame, expectedState)'), 'Rejected real frames must remain in the failure report');
  assert.match(capture, /toastVisibility: toast \? \{ show:/);
});

test('Association fixture wraps only real main-frame mark/clear calls and restores exact handler identities', async () => {
  const value = runtimeFixture();
  try {
    assert.deepEqual(await installPublishWriteFixture(value.application, 17), { channels: [MARK, CLEAR], webContentsId: 17 });
    assert.notEqual(value.handlers.get(MARK), value.mark); assert.notEqual(value.handlers.get(CLEAR), value.clear);
    assert.equal(value.handlers.get('copy:list'), value.read); assert.equal(value.handlers.get('copy:save'), value.save);
    assert.deepEqual(await value.handlers.get(MARK)(value.event, 'blog-a', 'synthetic-url'), { real: 'mark' });
    assert.deepEqual(await value.handlers.get(CLEAR)(value.event, 'blog-a'), { real: 'clear' });
    assert.deepEqual(await publishWriteFixtureCalls(value.application), [
      { channel: MARK, args: ['blog-a', 'synthetic-url'], behavior: 'observe' }, { channel: CLEAR, args: ['blog-a'], behavior: 'observe' },
    ]);
    await configurePublishWriteFixture(value.application, MARK, 'fail');
    const otherFrame = { ...value.event, senderFrame: {} };
    await value.handlers.get(MARK)(otherFrame, 'iframe-target', 'url');
    const otherWindow = { ...value.event, sender: { ...value.event.sender, id: 18 } };
    await value.handlers.get(MARK)(otherWindow, 'other-window', 'url');
    assert.equal((await publishWriteFixtureCalls(value.application)).length, 2, 'Only actual main-frame calls belong in fixture observations');
    assert.equal(value.writes.length, 4, 'Other frames/windows retain untouched original behavior');
    await assert.rejects(installPublishWriteFixture(value.application, 17), /already installed/);
  } finally { await restorePublishWriteFixture(value.application); }
  assert.equal(value.handlers.get(MARK), value.mark); assert.equal(value.handlers.get(CLEAR), value.clear);
  assert.equal(value.handlers.get('copy:list'), value.read); assert.equal(value.handlers.get('copy:save'), value.save);
  await restorePublishWriteFixture(value.application); assert.deepEqual(await publishWriteFixtureCalls(value.application), []);
});

test('Association fixture failure does not invoke real storage and restores after an assertion failure', async () => {
  const value = runtimeFixture();
  await assert.rejects(async () => {
    try {
      await installPublishWriteFixture(value.application, 17);
      for (const channel of [MARK, CLEAR]) {
        await configurePublishWriteFixture(value.application, channel, 'fail');
        await assert.rejects(value.handlers.get(channel)(value.event, 'blog-a', ...(channel === MARK ? ['url'] : [])), /Synthetic association write failure/);
      }
      assert.equal(value.writes.length, 0);
      throw new Error('Simulated native assertion failure');
    } finally { await restorePublishWriteFixture(value.application); }
  }, /Simulated native assertion failure/);
  assert.equal(value.handlers.get(MARK), value.mark); assert.equal(value.handlers.get(CLEAR), value.clear);
});

test('Association fixture delay retains captured arguments and allows one bounded release before the original write', async () => {
  const value = runtimeFixture();
  try {
    await installPublishWriteFixture(value.application, 17); await configurePublishWriteFixture(value.application, MARK, 'hold');
    const pending = value.handlers.get(MARK)(value.event, 'captured-blog-a', 'captured-url');
    assert.equal(value.writes.length, 0);
    await assert.rejects(configurePublishWriteFixture(value.application, CLEAR, 'fail'), /idle/);
    await releasePublishWriteFixture(value.application); assert.deepEqual(await pending, { real: 'mark' });
    assert.deepEqual(value.writes, [{ channel: MARK, args: ['captured-blog-a', 'captured-url'] }]);
    await assert.rejects(releasePublishWriteFixture(value.application), /Exactly one/);
  } finally { await restorePublishWriteFixture(value.application); }
});

test('Association delay is bounded at 10 seconds and final restoration cancels an unresolved write without committing', async t => {
  const value = runtimeFixture();
  t.mock.timers.enable({ apis: ['setTimeout'] });
  try {
    await installPublishWriteFixture(value.application, 17); await configurePublishWriteFixture(value.application, MARK, 'hold');
    const pending = value.handlers.get(MARK)(value.event, 'timeout-blog', 'url');
    const failure = assert.rejects(pending, /exceeded 10000ms/);
    t.mock.timers.tick(10000); await failure; assert.equal(value.writes.length, 0);
    await configurePublishWriteFixture(value.application, CLEAR, 'hold');
    const cancelled = value.handlers.get(CLEAR)(value.event, 'cancelled-blog');
    const cancellation = assert.rejects(cancelled, /delay cancelled/);
    await restorePublishWriteFixture(value.application); await cancellation; assert.equal(value.writes.length, 0);
    assert.equal(value.handlers.get(MARK), value.mark); assert.equal(value.handlers.get(CLEAR), value.clear);
  } finally { await restorePublishWriteFixture(value.application); t.mock.timers.reset(); }
});

test('Association fixture fails closed on unsupported handlers, invalid targets or modes, and unknown handler drift', async () => {
  const value = runtimeFixture(); const changes: string[] = [];
  const unsupported = { evaluate: async (callback: (runtime: any, arg?: unknown) => any, arg?: unknown) => callback({ ipcMain: {
    removeHandler: () => changes.push('remove'), handle: () => changes.push('handle'),
  } }, arg) };
  await assert.rejects(installPublishWriteFixture(unsupported, 17), /inspection unavailable/); assert.deepEqual(changes, []);
  await assert.rejects(installPublishWriteFixture(value.application, 0), /main webContents/);
  value.handlers.delete(CLEAR); await assert.rejects(installPublishWriteFixture(value.application, 17), /Both real/); value.handlers.set(CLEAR, value.clear);
  try {
    await installPublishWriteFixture(value.application, 17);
    await assert.rejects(configurePublishWriteFixture(value.application, 'copy:save', 'fail'), /only association/);
    await assert.rejects(configurePublishWriteFixture(value.application, MARK, 'rewrite'), /Unknown/);
    const wrapper = value.handlers.get(CLEAR); const unexpected = () => 'unknown'; value.handlers.set(CLEAR, unexpected);
    await assert.rejects(restorePublishWriteFixture(value.application), /handler drift/);
    assert.equal(value.handlers.get(CLEAR), unexpected); assert.notEqual(value.handlers.get(MARK), value.mark, 'No partial restoration on drift');
    value.handlers.set(CLEAR, wrapper);
  } finally { await restorePublishWriteFixture(value.application); }
});

test('Association fixture rolls back an interrupted partial install to both exact originals', async () => {
  const value = runtimeFixture(); const handle = value.runtime.ipcMain.handle;
  let failed = false;
  value.runtime.ipcMain.handle = (channel: string, handler: unknown) => {
    if (channel === CLEAR && !failed) { failed = true; throw new Error('Synthetic registration failure'); }
    handle(channel, handler);
  };
  await assert.rejects(installPublishWriteFixture(value.application, 17), /Synthetic registration failure/);
  assert.equal(value.handlers.get(MARK), value.mark); assert.equal(value.handlers.get(CLEAR), value.clear);
  assert.equal(value.handlers.get('copy:list'), value.read); assert.equal(value.handlers.get('copy:save'), value.save);
  assert.deepEqual(await publishWriteFixtureCalls(value.application), []);
  await installPublishWriteFixture(value.application, 17); await restorePublishWriteFixture(value.application);
});

test('Four association evidence files share the unchanged aggregate artifact budget and fixed allowlist', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-publish-pilot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  // Signature-only fixtures are unit inputs, not native screenshot evidence.
  for (const name of PUBLISH_ASSOCIATION_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await inspectPilotArtifacts(directory);
  assert.equal(result.files.length, 4); assert.equal(result.bytes, 32);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000); assert.equal(result.uploadCeilingBytes, 20_000_000); assert.equal(result.retentionDays, 3);
  await assert.rejects(inspectPilotArtifacts(directory, 31), /exceed/);
  await writeFile(path.join(directory, 'publish-association-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Complete installed pilot keeps one aggregate allowlist of 53 success PNGs and 56/57 files', async t => {
  const { YEAR_DROPDOWN_SCREENSHOTS } = await import('../tooling/year-dropdown-pilot.mjs');
  const { TOPBAR_DATES_SCREENSHOTS } = await import('../tooling/topbar-dates-pilot.mjs');
  const { AI_CARDS_SCREENSHOTS } = await import('../tooling/ai-cards-pilot.mjs');
  const { FLOAT_GROUP_SCREENSHOTS } = await import('../tooling/float-group-pilot.mjs');
  const { CONTEXT_PICKER_SCREENSHOTS } = await import('../tooling/context-picker-pilot.mjs');
  const { UPDATE_STATUS_SCREENSHOTS } = await import('../tooling/update-status-pilot.mjs');
  const names = ['initial.png', 'created.png', 'edited.png', 'completed.png', 'relaunched.png', ...YEAR_DROPDOWN_SCREENSHOTS, ...TOPBAR_DATES_SCREENSHOTS, ...AI_CARDS_SCREENSHOTS, ...FLOAT_GROUP_SCREENSHOTS, ...CONTEXT_PICKER_SCREENSHOTS, ...UPDATE_STATUS_SCREENSHOTS, ...PUBLISH_ASSOCIATION_SCREENSHOTS];
  assert.equal(names.length, 53); assert.equal(new Set(names).size, 53);
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-publish-complete-evidence-')); t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of names) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  for (const name of ['install.json', 'report.json']) await writeFile(path.join(directory, name), '{}');
  await writeFile(path.join(directory, 'report.md'), 'Synthetic unit evidence');
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 56);
  await writeFile(path.join(directory, 'failure.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 57);
});

test('Installed association pilot uses twelve checks, real UI storage writes, bounded readback, cleanup and existing full-app restart', async () => {
  const source = await readFile(new URL('../tooling/publish-association-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.equal((source.match(/await check\(/g) ?? []).length, 12);
  assert.doesNotMatch(source, /workbench\.copy\.(?:save|markXhsPublished|clearXhsPublished|remove)\(|setContent\(|addInitScript\(|localStorage\.setItem|force:\s*true|dispatchEvent\(|\.goto\(|openExternal\(|fetch\(|writeFile\(/);
  assert.match(source, /window\.workbench\.copy\.list\(\)/); assert.match(source, /copy-drafts\.json/);
  assert.match(source, /assert\.deepEqual\(disk, await state\(page\)/); assert.match(source, /await page\.reload\(\)/);
  assert.match(source, /clipboard\.readText/); assert.match(source, /keyboard\.press\('Tab'\)/); assert.match(source, /keyboard\.press\('Enter'\)/);
  assert.match(source, /dblclick\(\{ delay: 20 \}\)/); assert.match(source, /args, \[originalA\.id, urls\.second\]/);
  assert.match(source, /assert\.equal\(await button\(page, '确认关联'\)\.isDisabled\(\), true\)/);
  assert.match(source, /assert\.equal\(await input\(page\)\.inputValue\(\), urls\.third\)/);
  assert.match(source, /event\.sender\.id !== session\.id \|\| event\.senderFrame !== event\.sender\.mainFrame/);
  assert.match(source, /finally \{ await restorePublishWriteFixture\(application\); \}/);
  assert.match(source, /win\.setContentSize/); assert.match(source, /document\.elementFromPoint/); assert.match(source, /await field\.scrollIntoViewIfNeeded\(\)/);
  assert.match(source, /await document\.fonts\.ready/); assert.match(source, /snav-content\[data-swap="idle"\]/);
  assert.match(source, /tree\[data-switching="false"\]/); assert.match(source, /document\.getAnimations\(\)/);
  assert.match(source, /animation\.pending \|\| animation\.playState === 'running'/);
  assert.match(source, /\.content > \.view-fade > \.copy-wrap \.copy-editor/);
  assert.match(source, /innerWidth === width && innerHeight === height/);
  assert.match(source, /assert\.deepEqual\(await state\(page\), fixture\.finalState/);
  assert.match(source, /assertPublishAssociationInventory\(result\.disk, existingState, ownedIds\)/);
  assert.match(source, /assertPublishAssociationInventory\(await state\(page\), fixture\.existingState, fixture\.ownedIds, fixture\.finalState\)/);
  assert.match(source, /draft\.id === newIds\[0\] && draft\.title === titles\[index\] && draft\.body === bodies\[index\]/);
  assert.equal((source.match(/await waitForPublishCopyState\(page,/g) ?? []).length, 4, 'Every IPC readiness path uses bounded host polling');
  assert.doesNotMatch(source, /page\.waitForFunction\([^;]*workbench\.copy\.list/s);
  assert.match(source, /originals = assertPublishAssociationInventory\(createdState, existingState, ownedIds\)/);
  assert.equal(source.split('assert.deepEqual(await state(page), createdState)').length - 1, 3, 'All pre-confirmation no-write checks retain the complete earlier plus owned store');
  assert.doesNotMatch(source, /originals = \(await state\(page\)\)\.drafts|assert\.deepEqual\(await state\(page\), \{ drafts: \[\] \}\)/);
  assert.ok(entry.indexOf('floatGroupFixture = await runFloatGroupPilot(') < entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot('));
  assert.ok(entry.indexOf('contextPickerFixture = await runContextPickerPilot(') < entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot('));
  assert.ok(entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot(') < entry.indexOf('await runUpdateStatusPilot('));
  assert.ok(entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyPublishAssociationRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
  for (const older of ['verifyAiCardsRelaunch', 'verifyYearDropdownRelaunch', 'verifyTopbarDatesRelaunch', 'verifyFloatGroupRelaunch', 'verifyContextPickerRelaunch']) assert.match(entry, new RegExp(`await ${older}\\(`));
  for (const name of PUBLISH_ASSOCIATION_SCREENSHOTS) assert.equal(source.split(`name: '${name}'`).length - 1, 1, 'Each approved screenshot is captured once through the frame guard');
  assert.equal(source.split('await screenshot(name)').length - 1, 1, 'One unchanged full-page screenshot call captures only guarded frames');
  const capture = source.slice(source.indexOf('async function captureAssociationFrame'), source.indexOf('// Bounded main-frame-only'));
  assert.match(capture, /scrollIntoView\(\{ block: 'start', inline: 'nearest', behavior: 'instant' \}\)/);
  assert.match(capture, /Number\(getComputedStyle\(toast\)\.opacity\) !== 0/);
  assert.match(capture, /panel\.clientWidth/); assert.match(capture, /panel\.clientHeight/);
  assert.match(capture, /for \(let x = left \+ 8; x < right; x \+= 8\)/);
  assert.match(capture, /visibleAt\(owner, x, bounds\.top \+ bounds\.height \* fraction\)/);
  const sampling = capture.match(/const controlHit = !control \|\| (\[[\d., ]+\])\.every\(x => (\[[\d., ]+\])\.every\(y => visibleAt/);
  assert.ok(sampling, 'Actual native control sampling fractions are required');
  // The real pending Cancel button is 50×32px with a 10px corner radius.
  // Sample its usable inset, not rounded corners that legitimately miss it.
  const insideCancel = (x: number, y: number) => Math.hypot(Math.max(10 - x, 0, x - 40), Math.max(10 - y, 0, y - 22)) <= 10;
  assert.equal(insideCancel(50 * 0.05, 32 * 0.1), false);
  for (const x of JSON.parse(sampling[1])) for (const y of JSON.parse(sampling[2])) assert.equal(insideCancel(50 * x, 32 * y), true);
  assert.ok(capture.indexOf('assertPublishAssociationFrame(frame, expectedState)') < capture.indexOf('await screenshot(name)'));
  assert.doesNotMatch(capture, /scrollIntoViewIfNeeded|\.screenshot\(|clip:.*screenshot|setAttribute\(|\.style\.|\.remove\(/);
});
