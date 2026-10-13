import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FLOAT_GROUP_MATRIX, FLOAT_GROUP_SCREENSHOTS, assertFloatWidthTransition, assertFloatModelGeometry, assertFloatMenuGeometry, assertFloatCompactGeometry, assertFloatRectInside, expectedFloatMeasuredHeight } from '../tooling/float-group-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

test('Floating acceptance covers exactly eight mode/size/width states with immutable bounded screenshots', () => {
  assert.equal(FLOAT_GROUP_MATRIX.length, 8);
  assert.ok(Object.isFrozen(FLOAT_GROUP_MATRIX) && FLOAT_GROUP_MATRIX.every(Object.isFrozen));
  for (const mode of ['home', 'ai']) for (const mini of [false, true]) for (const narrow of [false, true]) {
    assert.equal(FLOAT_GROUP_MATRIX.filter(entry => entry.mode === mode && entry.mini === mini && entry.narrow === narrow).length, 1);
    assert.ok(FLOAT_GROUP_SCREENSHOTS.includes(`float-group-${mode}-${mini ? 'mini' : 'expanded'}-${narrow ? 'narrow' : 'wide'}.png`));
  }
  assert.equal(FLOAT_GROUP_SCREENSHOTS.length, 15); assert.ok(Object.isFrozen(FLOAT_GROUP_SCREENSHOTS));
  assert.equal(new Set(FLOAT_GROUP_SCREENSHOTS).size, 15);
});

test('Native bounds assertions reject width-induced height changes and offscreen clamping', () => {
  const area = { x: -1920, y: 40, width: 1920, height: 1040 };
  const before = { x: -330, y: 904, width: 330, height: 176 };
  const after = { x: -440, y: 904, width: 440, height: 176 };
  assert.doesNotThrow(() => assertFloatWidthTransition(before, after, 440, area));
  assert.throws(() => assertFloatWidthTransition(before, { ...after, height: 177 }, 440, area), /preserve native height/);
  assert.throws(() => assertFloatWidthTransition(before, { ...after, width: 330 }, 440, area), /selected mode/);
  assert.throws(() => assertFloatWidthTransition(before, { ...after, x: -330 }, 440, area), /inside the work area/);
  assert.throws(() => assertFloatWidthTransition(before, { ...after, y: 39 }, 440, area), /inside the work area/);
  assert.throws(() => assertFloatWidthTransition(before, { ...after, x: NaN }, 440, area), /finite/);
});

test('Model geometry assertion checks every coordinate and does not allow missing or invisible models', () => {
  const rect = { x: 140, y: 140, width: 168, height: 22 };
  assert.doesNotThrow(() => assertFloatModelGeometry(rect, { ...rect, x: 140.5 }));
  for (const key of ['x', 'y', 'width', 'height']) assert.throws(() => assertFloatModelGeometry(rect, { ...rect, [key]: rect[key as keyof typeof rect] + 2 }), /Association must not move/);
  assert.throws(() => assertFloatModelGeometry({ ...rect, width: 0 }, { ...rect, width: 0 }), /visible/);
  assert.throws(() => assertFloatModelGeometry(rect, { ...rect, y: Infinity }), /finite/);
});

test('Compact model menu must be bounded and right-aligned to actual trigger', () => {
  const anchor = { x: 140, y: 140, width: 168, height: 22 };
  const menu = { x: 112, y: 8, width: 196, height: 126 };
  const viewport = { width: 330, height: 176 };
  assert.doesNotThrow(() => assertFloatMenuGeometry(menu, anchor, viewport));
  assert.throws(() => assertFloatMenuGeometry({ ...menu, y: -1 }, anchor, viewport), /fit/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, height: 180 }, anchor, viewport), /fit/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, x: 100 }, anchor, viewport), /right edge/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, width: 0 }, anchor, viewport), /usable/);
});

test('Floating evidence shares the unchanged global 19 MB allowlist and 3-day retention', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-float-pilot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of FLOAT_GROUP_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await inspectPilotArtifacts(directory);
  assert.equal(result.files.length, 15); assert.equal(result.bytes, 120);
  assert.equal(result.retentionDays, 3); assert.equal(result.uploadCeilingBytes, 20_000_000); assert.equal(MAX_ARTIFACT_BYTES, 19_000_000);
  await assert.rejects(inspectPilotArtifacts(directory, 119), /exceed/);
  await writeFile(path.join(directory, 'float-group-unapproved.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  await assert.rejects(inspectPilotArtifacts(directory), /unapproved artifact/);
});

test('Installed pilot uses actual float surfaces, physical UI, native bounds and restart without weakening older coverage', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  const entry = await readFile(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /workbench\.(?:todo\.(?:create|update|remove)|settings\.(?:set|update)|ai\.(?:ask|apply|saveProvider))\(|setContent\(|addInitScript\(|force:\s*true|dispatchEvent\(/);
  assert.match(source, /application\.windows\(\)/); assert.match(source, /application\.browserWindow\(page\)/);
  assert.match(source, /win\.getBounds\(\)/); assert.match(source, /getDisplayMatching/);
  assert.match(source, /await screenshot\(name, page\)/); assert.match(entry, /await capturePage\.screenshot/);
  assert.match(source, /await options\.nth\(0\)\.click\(\)/); assert.match(source, /keyboard\.press\('Enter'\)/);
  assert.match(source, /\['no-preference', 'reduce'\]/); assert.match(source, /stable >= 6/);
  assert.match(source, /requests\.length, initialCalls/); assert.match(source, /message\.content === `关于事项/);
  assert.match(source, /full same-installed-executable restart/);
  assert.ok(entry.indexOf('await runFloatEmptyPilot(') < entry.indexOf("await check('Create one synthetic task"));
  assert.ok(entry.indexOf('aiCardsFixture = await runAiCardsPilot(') < entry.indexOf('floatGroupFixture = await runFloatGroupPilot('));
  assert.ok(entry.indexOf('floatGroupFixture = await runFloatGroupPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyFloatGroupRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
  for (const name of ['verifyAiCardsRelaunch', 'verifyYearDropdownRelaunch', 'verifyTopbarDatesRelaunch']) assert.match(entry, new RegExp(`await ${name}\\(`));
});

const compact = () => ({
  native: { x: 100, y: 200, width: 330, height: 176 }, viewport: { x: 0, y: 0, width: 330, height: 176 },
  context: { x: 20, y: 50, width: 290, height: 22 }, linkedRow: { x: 20, y: 75, width: 290, height: 20 },
  compose: { x: 20, y: 98, width: 290, height: 32 }, bottom: { x: 20, y: 133, width: 290, height: 22 },
  textarea: { x: 25, y: 100, width: 240, height: 26 }, send: { x: 278, y: 103, width: 22, height: 22 },
  reference: { x: 20, y: 133, width: 70, height: 22 }, model: { x: 142, y: 133, width: 168, height: 22 },
  chip: null as { x: number; y: number; width: number; height: number } | null,
  remove: null as { x: number; y: number; width: number; height: number } | null,
});
test('Real compact row assertions preserve empty chip space and reject overlap/clipping at 176px', () => {
  const empty = compact(); assert.doesNotThrow(() => assertFloatCompactGeometry(empty));
  const linked = compact(); linked.chip = { x: 20, y: 75, width: 270, height: 20 }; linked.remove = { x: 268, y: 75, width: 20, height: 20 };
  assert.doesNotThrow(() => assertFloatCompactGeometry(linked, empty));
  const mutations = [
    (value: ReturnType<typeof compact>) => { value.context.height = 28; },
    (value: ReturnType<typeof compact>) => { value.linkedRow.height = 21; },
    (value: ReturnType<typeof compact>) => { value.bottom.y = 160; },
    (value: ReturnType<typeof compact>) => { value.reference.width = 130; },
    (value: ReturnType<typeof compact>) => { value.textarea.width = 270; },
    (value: ReturnType<typeof compact>) => { value.model.width = 190; },
    (value: ReturnType<typeof compact>) => { value.native.height = 175; },
  ];
  for (const mutate of mutations) { const value = compact(); mutate(value); assert.throws(() => assertFloatCompactGeometry(value, empty)); }
  const clipped = compact(); clipped.chip = { x: 20, y: 74, width: 270, height: 23 };
  assert.throws(() => assertFloatCompactGeometry(clipped), /outside/);
});
test('Real picker containment rejects escaped, missing and nonfinite menu rectangles', () => {
  const viewport = { x: 0, y: 0, width: 330, height: 176 };
  assert.doesNotThrow(() => assertFloatRectInside({ x: 20, y: 40, width: 290, height: 82 }, viewport, 'Task picker'));
  assert.throws(() => assertFloatRectInside({ x: 20, y: -5, width: 290, height: 82 }, viewport, 'Task picker'), /outside/);
  assert.throws(() => assertFloatRectInside(null, viewport, 'Task picker'), /finite/);
});

test('Schedule remeasurement expected native height respects existing min/max and matching display clamp', () => {
  assert.equal(expectedFloatMeasuredHeight(700, 1040), 700);
  assert.equal(expectedFloatMeasuredHeight(1300, 1040), 1016);
  assert.equal(expectedFloatMeasuredHeight(800.6, 1040), 801);
  assert.equal(expectedFloatMeasuredHeight(200, 1040), 330);
  assert.throws(() => expectedFloatMeasuredHeight(NaN, 1040), /finite/);
});
test('Narrow child-content acceptance observes real resize IPC without replacing handlers and always removes observation', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /ipcMain\.on\('float:resize', observation\.listener\)/);
  assert.match(source, /ipcMain\.removeListener\('float:resize', observation\.listener\)/);
  assert.match(source, /finally \{ await stopObservingFloatResize\(application\); \}/);
  assert.match(source, /events\.length > 0/);
  assert.match(source, /after\.dom\.requested/);
  assert.doesNotMatch(source, /ipcMain\.removeHandler|ipcMain\.handle\(/);
});
