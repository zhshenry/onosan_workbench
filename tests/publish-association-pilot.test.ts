import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  PUBLISH_ASSOCIATION_MATRIX, PUBLISH_ASSOCIATION_SCREENSHOTS,
  assertPublishAssociationRecord, assertPublishAssociationGeometry,
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

test('Complete installed pilot keeps one aggregate allowlist of 44 success PNGs and 47/48 files', async t => {
  const { YEAR_DROPDOWN_SCREENSHOTS } = await import('../tooling/year-dropdown-pilot.mjs');
  const { TOPBAR_DATES_SCREENSHOTS } = await import('../tooling/topbar-dates-pilot.mjs');
  const { AI_CARDS_SCREENSHOTS } = await import('../tooling/ai-cards-pilot.mjs');
  const { FLOAT_GROUP_SCREENSHOTS } = await import('../tooling/float-group-pilot.mjs');
  const names = ['initial.png', 'created.png', 'edited.png', 'completed.png', 'relaunched.png', ...YEAR_DROPDOWN_SCREENSHOTS, ...TOPBAR_DATES_SCREENSHOTS, ...AI_CARDS_SCREENSHOTS, ...FLOAT_GROUP_SCREENSHOTS, ...PUBLISH_ASSOCIATION_SCREENSHOTS];
  assert.equal(names.length, 44); assert.equal(new Set(names).size, 44);
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-publish-complete-evidence-')); t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of names) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  for (const name of ['install.json', 'report.json']) await writeFile(path.join(directory, name), '{}');
  await writeFile(path.join(directory, 'report.md'), 'Synthetic unit evidence');
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 47);
  await writeFile(path.join(directory, 'failure.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 48);
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
  assert.ok(entry.indexOf('floatGroupFixture = await runFloatGroupPilot(') < entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot('));
  assert.ok(entry.indexOf('publishAssociationFixture = await runPublishAssociationPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyPublishAssociationRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
  for (const older of ['verifyAiCardsRelaunch', 'verifyYearDropdownRelaunch', 'verifyTopbarDatesRelaunch', 'verifyFloatGroupRelaunch']) assert.match(entry, new RegExp(`await ${older}\\(`));
  for (const name of PUBLISH_ASSOCIATION_SCREENSHOTS) assert.equal(source.split(`name: '${name}'`).length - 1, 1, 'Each approved screenshot is captured once through the frame guard');
  assert.equal(source.split('await screenshot(name)').length - 1, 1, 'One unchanged full-page screenshot call captures only guarded frames');
  const capture = source.slice(source.indexOf('async function captureAssociationFrame'), source.indexOf('// Bounded main-frame-only'));
  assert.match(capture, /scrollIntoView\(\{ block: 'start', inline: 'nearest', behavior: 'instant' \}\)/);
  assert.match(capture, /Number\(getComputedStyle\(toast\)\.opacity\) > 0/);
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
