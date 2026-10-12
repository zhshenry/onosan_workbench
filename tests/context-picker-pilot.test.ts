import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  CONTEXT_PICKER_MATRIX, CONTEXT_PICKER_SCREENSHOTS, assertContextPickerGeometry,
  assertReferenceTurn, assertSavedReferenceTurn, assertTransmittedReferenceSnapshots,
} from '../tooling/context-picker-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

const reference = { module: 'todo', taskId: 'synthetic-task' };
const snapshot = () => ({ reference, key: 'todo:synthetic-task', name: 'Synthetic only', capturedAt: '2026-10-12T12:00:00.000Z', content: '参考事项（发送时快照）：{"note":"original synthetic note"}' });
function chatFixture() {
  const common = { contextScope: { module: 'todo' }, pageScope: { module: 'todo' }, references: [reference], referenceSnapshots: [snapshot()] };
  return { id: 'synthetic-chat', title: 'synthetic prompt', entries: [
    { ...structuredClone(common), id: 'user-entry', role: 'user', content: 'synthetic prompt' },
    { ...structuredClone(common), id: 'assistant-entry', role: 'assistant', content: 'synthetic response', streaming: false },
  ] };
}
const turn = () => assertReferenceTurn(chatFixture(), 'synthetic prompt', reference, 'original synthetic note');

test('Reference pilot checks both exact persisted entry snapshots and primary/page targets across restart', () => {
  const original = turn();
  assertSavedReferenceTurn([chatFixture()], original);
  assert.throws(() => assertSavedReferenceTurn([], original), /survive restart/);
  for (const index of [0, 1]) {
    const changed = chatFixture(); changed.entries[index].referenceSnapshots[0].content = 'later source edit';
    assert.throws(() => assertSavedReferenceTurn([changed], original), /historical snapshots/);
    const retargeted = chatFixture(); retargeted.entries[index].contextScope = { module: 'copy' };
    assert.throws(() => assertSavedReferenceTurn([retargeted], original));
    const missing = chatFixture(); missing.entries[index].id = 'different entry';
    assert.throws(() => assertSavedReferenceTurn([missing], original), /Exact saved message ID/);
  }
  const refsChanged = chatFixture(); refsChanged.entries[0].references = [{ module: 'todo', taskId: 'other' }];
  assert.throws(() => assertSavedReferenceTurn([refsChanged], original));
});

test('Reference pilot cannot pass on pending, failed, mismatched or content-free backend results', () => {
  const pending = chatFixture(); pending.entries[1].streaming = true;
  assert.throws(() => assertReferenceTurn(pending, 'synthetic prompt', reference, 'original'), /actual backend completion/);
  const failed = { ...chatFixture(), entries: chatFixture().entries.map((entry, index) => index ? { ...entry, error: 'synthetic failure' } : entry) };
  assert.throws(() => assertReferenceTurn(failed, 'synthetic prompt', reference, 'original'), /hide a failure/);
  const missing = chatFixture(); missing.entries[0].referenceSnapshots = [];
  assert.throws(() => assertReferenceTurn(missing, 'synthetic prompt', reference, 'original'));
  const different = chatFixture(); different.entries[1].referenceSnapshots[0].name = 'wrong snapshot';
  assert.throws(() => assertReferenceTurn(different, 'synthetic prompt', reference, 'original'), /same send-time snapshot/);
  assert.throws(() => assertReferenceTurn(chatFixture(), 'missing prompt', reference, 'original'), /persisted/);
  assert.throws(() => assertReferenceTurn(chatFixture(), 'synthetic prompt', reference, 'only a fixture title'), /actual saved source content/);
});

const transport = (snapshots: unknown[]) => [{ role: 'system', content: 'Existing latest-120 todo base: unselected todo may still appear.\n本轮明确选择的只读参考资料（发送时冻结快照）：\n' + JSON.stringify(snapshots) + '\nRead-only reference rules.' }];
test('Actual transport reference lane equals persisted snapshots without claiming selected-only global context', () => {
  const expected = [snapshot()];
  assertTransmittedReferenceSnapshots(transport(expected), expected);
  const unselected = { ...snapshot(), key: 'todo:unselected', reference: { module: 'todo', taskId: 'unselected' } };
  assert.throws(() => assertTransmittedReferenceSnapshots(transport([...expected, unselected]), expected), /extra unselected reference/);
  assert.throws(() => assertTransmittedReferenceSnapshots(transport([]), expected), /exactly equal/);
  assert.throws(() => assertTransmittedReferenceSnapshots([{ content: 'Only a reference label, no actual snapshot' }], expected), /actual transport/);
  assert.throws(() => assertTransmittedReferenceSnapshots([...transport(expected), ...transport(expected)], expected), /One selected-reference/);
  assert.throws(() => assertTransmittedReferenceSnapshots(transport([{ ...snapshot(), content: 'stale source content' }]), expected), /exactly equal/);
});

const geometry = () => ({
  viewport: { x: 0, y: 0, width: 1024, height: 680 }, panel: { x: 674, y: 54, width: 340, height: 616 },
  picker: { x: 687, y: 175, width: 310, height: 310 }, trigger: { x: 687, y: 623, width: 28, height: 28 },
  model: { x: 765, y: 623, width: 190, height: 28 }, send: { x: 970, y: 623, width: 28, height: 28 },
  pickerClientWidth: 308, pickerScrollWidth: 308, chipsFit: true, hitOption: true, modelShift: 0, sendShift: 0,
});
test('Reference geometry enforces true viewport containment, stable controls and usable popover hit targets', () => {
  assertContextPickerGeometry(geometry());
  for (const name of ['panel', 'picker', 'trigger', 'model', 'send'] as const) {
    const outside = geometry(); outside[name].x = 1100;
    assert.throws(() => assertContextPickerGeometry(outside), /outside/);
    const hidden = geometry(); hidden[name].height = 0;
    assert.throws(() => assertContextPickerGeometry(hidden), /invalid bounds/);
  }
  assert.throws(() => assertContextPickerGeometry({ ...geometry(), pickerScrollWidth: 600 }), /horizontally/);
  assert.throws(() => assertContextPickerGeometry({ ...geometry(), chipsFit: false }), /Long reference chip/);
  assert.throws(() => assertContextPickerGeometry({ ...geometry(), hitOption: false }), /pointer hits/);
  assert.throws(() => assertContextPickerGeometry({ ...geometry(), modelShift: 2 }), /not move/);
  assert.throws(() => assertContextPickerGeometry({ ...geometry(), sendShift: 2 }), /not move/);
  const order = geometry(); order.model.x = 694;
  assert.throws(() => assertContextPickerGeometry(order), /stays left/);
  const below = geometry(); below.picker = { ...below.picker, y: 625, height: 40 };
  assert.throws(() => assertContextPickerGeometry(below), /above the composer/);
});

test('Reference matrix covers real app themes and sizes while labeling emulated OS light/dark separately', () => {
  assert.ok(Object.isFrozen(CONTEXT_PICKER_MATRIX)); assert.ok(CONTEXT_PICKER_MATRIX.every(Object.isFrozen));
  assert.deepEqual(CONTEXT_PICKER_MATRIX.map(({ theme, width, height, colorScheme }) => `${theme}:${width}x${height}:${colorScheme}`), [
    'mist:1280x820:light', 'mist:1024x680:dark', 'cool:1280x820:light', 'cool:1024x680:dark', 'warm:1280x820:light', 'warm:1024x680:dark',
  ]);
});

test('Reference screenshots extend only the fixed allowlist and share the original aggregate evidence ceiling', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-context-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  assert.ok(Object.isFrozen(CONTEXT_PICKER_SCREENSHOTS));
  assert.deepEqual(CONTEXT_PICKER_SCREENSHOTS, [
    'context-picker-mist-1024x680.png', 'context-picker-cool-1024x680.png', 'context-picker-warm-1024x680.png',
    'context-picker-saved.png', 'context-picker-relaunched.png',
  ]);
  // Signature-only byte fixtures test the guard, never claim actual UI screenshots.
  for (const name of CONTEXT_PICKER_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const inspected = await inspectPilotArtifacts(directory);
  assert.equal(inspected.files.length, 5); assert.equal(inspected.bytes, 40);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000); assert.equal(inspected.uploadCeilingBytes, 20_000_000); assert.equal(inspected.retentionDays, 3);
  await assert.rejects(inspectPilotArtifacts(directory, 39), /exceed/);
  await writeFile(path.join(directory, 'context-picker-extra.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Installed reference pilot uses normal UI writes, bounded loopback transport and readonly actual persistence', async () => {
  const source = await readFile(new URL('../tooling/context-picker-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(source, /http:\/\/127\.0\.0\.1:/);
  assert.match(source, /body\.length > 2_000_000/);
  assert.match(source, /new DatabaseSync\(join\(userData, 'chats\.db'\), \{ readOnly: true \}\)/);
  assert.match(source, /WORKBENCH_TEST_DATA_DIR/); assert.match(source, /app\.isPackaged/);
  assert.match(source, /SELECT payload FROM chats/);
  assert.doesNotMatch(source, /workbench\.(?:ai\.(?:ask|chatOpen|chatNew|saveProvider|saveModel)|todo\.(?:create|update|remove)|copy\.(?:save|remove)|reading\.(?:save|setVault|scan)|bazi\.(?:saveProfile|saveNote|removeProfile))\(/);
  assert.doesNotMatch(source, /\.route\(|setContent\(|addInitScript\(|localStorage\.setItem|--no-sandbox|page\.screenshot\(/);
  assert.match(source, /assertTransmittedReferenceSnapshots\(requests\[requestIndex\]\.messages, turn\.snapshots\)/);
  assert.match(source, /assert\.deepEqual\(await taskState\(page\), before/);
  assert.match(source, /await openChat\(page, cardsChat\.title\)/);
  assert.ok(entry.indexOf('aiCardsFixture = await runAiCardsPilot(') < entry.indexOf('contextPickerFixture = await runContextPickerPilot('));
  assert.ok(entry.indexOf('contextPickerFixture = await runContextPickerPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyAiCardsRelaunch(') < entry.indexOf('await verifyContextPickerRelaunch('));
  assert.ok(entry.indexOf('await verifyContextPickerRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
  assert.match(entry, /chromiumSandbox: true/);
});

test('Existing birthday pilot still rejects duplicate fixtures when a reference profile also exists', async () => {
  const source = await readFile(new URL('../tooling/year-dropdown-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /const matches = data\.profiles\.filter\(profile => profile\.name === name\)/);
  assert.match(source, /assert\.equal\(matches\.length, 1/);
  assert.match(source, /assert\.equal\(profile\.date, expected/);
});
