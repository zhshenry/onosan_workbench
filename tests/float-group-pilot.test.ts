import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FLOAT_GROUP_MATRIX, FLOAT_GROUP_SCREENSHOTS, assertFloatWidthTransition, assertFloatModelGeometry, assertFloatMenuGeometry, assertFloatCompactGeometry, assertFloatRectInside, expectedFloatMeasuredHeight, assertFloatStateHeight, resolveFloatExpandedHeight } from '../tooling/float-group-pilot.mjs';
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

test('Native edge fixture restores original position on pass/failure without changing dimensions', async () => {
  const { withFloatPositionRestored } = await import('../tooling/float-group-pilot.mjs');
  let bounds = { x: 80, y: 30, width: 330, height: 176 };
  const native = { getBounds: () => ({ ...bounds }), setPosition: (x: number, y: number) => { bounds = { ...bounds, x, y }; } };
  const window = { evaluate: async (action: (win: typeof native, argument?: any) => any, argument?: any) => action(native, argument) };
  const result = await withFloatPositionRestored(window, async () => { native.setPosition(900, 700); return 'checked'; });
  assert.equal(result.value, 'checked'); assert.deepEqual(result.restored, { x: 80, y: 30, width: 330, height: 176 });
  const failure = new Error('real assertion failed');
  await assert.rejects(withFloatPositionRestored(window, async () => { native.setPosition(900, 700); throw failure; }), error => error === failure);
  assert.deepEqual(bounds, { x: 80, y: 30, width: 330, height: 176 });
});
test('Schedule clicks retain real pointer action and bounded diagnostic evidence after edge isolation', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /edgePosition = await withFloatPositionRestored/);
  assert.match(source, /document\.elementFromPoint\(x, y\)/);
  assert.match(source, /try \{ await tab\.click\(\); \}/);
  assert.match(source, /recordFolderHit\(application, floatPage, tab, report, 'click-failed'\)/);
  assert.doesNotMatch(source, /force:\s*true|element\.click\(\)/);
});

test('Every mode/width/motion state rejects wrong native height including expanded176 Windows regression', () => {
  for (const motion of ['no-preference', 'reduce']) for (const entry of FLOAT_GROUP_MATRIX) {
    const expectedExpanded = 812; const native = { x: 0, y: 0, width: entry.narrow ? 330 : 440, height: entry.mini ? 176 : expectedExpanded };
    assert.doesNotThrow(() => assertFloatStateHeight(native, entry.mini, expectedExpanded), `${entry.mode}/${entry.narrow}/${motion}`);
    assert.throws(() => assertFloatStateHeight({ ...native, height: entry.mini ? 812 : 176 }, entry.mini, expectedExpanded));
    if (!entry.mini) assert.throws(() => assertFloatStateHeight({ ...native, height: 813 }, false, expectedExpanded), /restore its measured/);
  }
  // Exact failing state from Windows review2: reduce/AI/expanded retained 176.
  assert.throws(() => resolveFloatExpandedHeight(704, 816, 'ai', { height: 176 }), /never retain compact/);
  assert.throws(() => assertFloatStateHeight({ height: 176 }, false, 176), /never retain compact/);
});
test('Expanded restoration uses captured memory/display clamp and permits only evidenced home remeasurement', () => {
  assert.equal(resolveFloatExpandedHeight(812, 1040, 'ai', { height: 812 }), 812);
  assert.equal(resolveFloatExpandedHeight(1000, 900, 'ai', { height: 876 }), 876);
  assert.equal(resolveFloatExpandedHeight(812, 1040, 'home', { height: 900 }, [900], 900), 900);
  assert.equal(resolveFloatExpandedHeight(812, 1040, 'home', { height: 1016 }, [1300], 1300), 1016);
  assert.throws(() => resolveFloatExpandedHeight(812, 1040, 'ai', { height: 900 }, [900], 900), /restore its measured/);
  assert.throws(() => resolveFloatExpandedHeight(812, 1040, 'home', { height: 900 }), /restore its measured/);
  assert.throws(() => resolveFloatExpandedHeight(812, 1040, 'home', { height: 900 }, [900], 812), /fresh resize IPC/);
  assert.throws(() => resolveFloatExpandedHeight(176, 1040, 'home', { height: 900 }, [900], 900), /real expanded/);
  assert.throws(() => resolveFloatExpandedHeight(812, 1040, 'home', { height: 176 }, [176], 176), /never retain compact/);
});
test('State matrix verifies restoration and both settled width results without adding Windows checks/screenshots', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /expandedHeightMemory\.set\(page, before\.height\)/);
  for (const step of ['restored', 'intermediate', 'native']) assert.match(source, new RegExp(`assertFloatStateHeight\\(${step}, entry\\.mini, expectedExpandedHeight\\)`));
  assert.match(source, /expectedHeight: entry\.mini \? 176 : expectedExpandedHeight/);
  assert.match(source, /finally \{ if \(!mini\) await stopObservingFloatResize\(application\); \}/);
  assert.match(source, /Renderer mini class must match the requested native state/);
  assert.match(source, /Renderer classes must match the complete requested matrix state/);
  assert.equal(FLOAT_GROUP_SCREENSHOTS.length, 15);
});

// JSDOM supplies the actual DOM/closest semantics. Explicit rectangles and hit
// results model browser layout, which JSDOM itself deliberately does not render.
async function outsidePointFixture(mini = true) {
  const { findFloatOutsidePoint } = await import('../tooling/float-group-pilot.mjs');
  const dom = new JSDOM(`<main class="float-app"><section class="fa-surface"><div class="${mini ? 'fa-mini-quick' : 'ai-compose-toolbar'}"><button class="ai-add-reference"><span>关联事项</span></button><button class="fa-model-toggle"><span>model</span></button><button class="ai-send">发送</button></div><div class="fa-picker-list fa-mini-picker"><button role="option">task</button></div></section></main>`, { runScripts: 'outside-only' });
  const document = dom.window.document;
  const selector = mini ? '.fa-mini-quick' : '.fa-surface .ai-compose-toolbar';
  const toolbar = document.querySelector(selector)!;
  let rect = { x: 10, y: mini ? 140 : 700, width: mini ? 310 : 420, height: mini ? 22 : 36 };
  const width = mini ? 330 : 440; const height = mini ? 176 : 800;
  Object.defineProperties(dom.window, { innerWidth: { value: width }, innerHeight: { value: height } });
  Object.defineProperty(toolbar, 'getBoundingClientRect', { value: () => ({ ...rect, left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height }) });
  let hit: (x: number, y: number) => Element | null = () => toolbar;
  const hitCalls: Array<{ x: number; y: number }> = [];
  Object.defineProperty(document, 'elementFromPoint', { value: (x: number, y: number) => { hitCalls.push({ x, y }); return hit(x, y); } });
  const nativeStyle = dom.window.getComputedStyle.bind(dom.window);
  Object.defineProperty(dom.window, 'getComputedStyle', { value: (element: Element) => {
    const style = nativeStyle(element);
    return { getPropertyValue: (name: string) => name === '-webkit-app-region' ? element.getAttribute('data-app-region') || '' : style.getPropertyValue(name) };
  } });
  const run = dom.window.eval(`(${findFloatOutsidePoint.toString()})`);
  return { dom, document, toolbar, selector, width, height, hitCalls, run: () => run(selector),
    setHit: (next: typeof hit) => { hit = next; }, setRect: (next: typeof rect) => { rect = next; } };
}

test('Actual outside-point helper selects compact and expanded toolbar gaps without activating any control', async () => {
  for (const mini of [true, false]) {
    const fixture = await outsidePointFixture(mini);
    try {
      const { document, toolbar } = fixture;
      let actions = 0;
      for (const event of ['click', 'pointerdown', 'change']) document.addEventListener(event, () => { actions++; });
      const original = document.body.innerHTML;
      fixture.setHit((x) => x < 100 ? document.querySelector('.ai-add-reference span') : x >= 140 ? document.querySelector('.fa-model-toggle span') : toolbar);
      const point = fixture.run();
      assert.equal(point.selector, fixture.selector);
      assert.ok(point.x >= 102 && point.x <= 137, 'Chosen point must retain the two-pixel hit-tested margin from both controls');
      assert.ok(point.y >= 0 && point.y < fixture.height);
      assert.equal(point.hitClass, toolbar.className);
      assert.equal(point.viewport.width, fixture.width); assert.equal(point.viewport.height, fixture.height);
      assert.equal(actions, 0, 'Read-only helper must not synthesize clicks or change selection/model');
      assert.equal(document.body.innerHTML, original);
      assert.ok(fixture.hitCalls.length > 1, 'Hit testing must skip real control descendants before finding gap');
    } finally { fixture.dom.window.close(); }
  }
});

test('Actual outside-point helper refuses picker, trigger, model and action overlays', async () => {
  const fixture = await outsidePointFixture();
  try {
    for (const selector of ['.fa-picker-list', '[role="option"]', '.ai-add-reference', '.ai-add-reference span', '.fa-model-toggle', '.fa-model-toggle span', '.ai-send']) {
      fixture.setHit(() => fixture.document.querySelector(selector));
      assert.throws(fixture.run, /No exposed non-interactive/, selector);
    }
    fixture.setHit(() => null); assert.throws(fixture.run, /No exposed non-interactive/);
    // A toolbar-shaped node inside an interactive/picker ancestor is unsafe too.
    fixture.setHit(() => fixture.toolbar);
    for (const className of ['fa-picker-list', 'fa-mini-picker', 'ai-add-reference']) {
      fixture.toolbar.parentElement!.classList.add(className);
      assert.throws(fixture.run, /No exposed non-interactive/, className);
      fixture.toolbar.parentElement!.classList.remove(className);
    }
  } finally { fixture.dom.window.close(); }
});

test('Actual outside-point helper excludes out-of-viewport coordinates and draggable ancestors', async () => {
  const fixture = await outsidePointFixture();
  try {
    for (const rect of [
      { x: -200, y: 140, width: 100, height: 22 },
      { x: 340, y: 140, width: 100, height: 22 },
      { x: 10, y: -100, width: 310, height: 22 },
      { x: 10, y: 180, width: 310, height: 22 },
    ]) {
      fixture.setRect(rect); const before = fixture.hitCalls.length;
      assert.throws(fixture.run, /No exposed non-interactive/);
      assert.equal(fixture.hitCalls.length, before, 'Offscreen coordinates must never be queried or clicked');
    }
    fixture.setRect({ x: -10, y: 140, width: 320, height: 22 });
    const clipped = fixture.run(); assert.ok(clipped.x >= 0 && clipped.x < fixture.width);
    assert.ok(fixture.hitCalls.every(point => point.x >= 0 && point.y >= 0 && point.x < fixture.width && point.y < fixture.height));
    fixture.setRect({ x: 10, y: 140, width: 310, height: 22 });
    for (const node of [fixture.toolbar, fixture.toolbar.parentElement!, fixture.document.querySelector('.float-app')!]) {
      node.setAttribute('data-app-region', 'drag');
      assert.throws(fixture.run, /No exposed non-interactive/);
      node.removeAttribute('data-app-region');
    }
    fixture.toolbar.remove(); assert.throws(fixture.run, /Missing outside-dismissal toolbar/);
  } finally { fixture.dom.window.close(); }
});

test('Outside dismissal uses a real mouse click and preserves association, selected model and request count', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /evaluate\(findFloatOutsidePoint, mini \? '\.fa-mini-quick' : '\.fa-surface \.ai-compose-toolbar'\)/);
  assert.match(source, /await floatPage\.mouse\.click\(outsidePoint\.x, outsidePoint\.y\)/);
  assert.match(source, /Outside dismissal must retain a real existing selection/);
  assert.match(source, /Outside pointer must not change association/);
  assert.match(source, /Outside pointer must not change selected model/);
  assert.match(source, /Outside pointer must not send a model request/);
  assert.match(source, /Dismiss\/reopen must preserve picker selection/);
  assert.doesNotMatch(source, /force:\s*true|dispatchEvent\(|element\.click\(\)|locator\('textarea\[aria-label="AI 对话输入"\]'\)\.click\(\)/);
});

test('Actual outside-point helper requires exposed two-pixel margins in all four directions', async () => {
  const fixture = await outsidePointFixture();
  try {
    const safe = [[100, 151], [98, 151], [102, 151], [100, 149], [100, 153]];
    const overlay = fixture.document.querySelector('.fa-picker-list');
    fixture.setHit((x, y) => safe.some(([px, py]) => px === x && py === y) ? fixture.toolbar : overlay);
    const point = fixture.run(); assert.equal(point.x, 100); assert.equal(point.y, 151);
    for (let blocked = 1; blocked < safe.length; blocked++) {
      fixture.setHit((x, y) => safe.some(([px, py], index) => index !== blocked && px === x && py === y) ? fixture.toolbar : overlay);
      assert.throws(fixture.run, /No exposed non-interactive/, `Margin ${blocked} is covered despite exposed center`);
    }
  } finally { fixture.dom.window.close(); }
});
