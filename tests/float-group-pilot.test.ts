import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { FLOAT_GROUP_MATRIX, FLOAT_GROUP_SCREENSHOTS, assertFloatWidthTransition, assertFloatModelGeometry, assertFloatMenuGeometry, assertFloatCompactGeometry, assertFloatRectInside, expectedFloatMeasuredHeight, assertFloatStateHeight, resolveFloatExpandedHeight, assertFloatExpandedToolbarGeometry } from '../tooling/float-group-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

test('Floating acceptance covers exactly eight mode/size/width states with immutable bounded screenshots', () => {
  assert.equal(FLOAT_GROUP_MATRIX.length, 8);
  assert.ok(Object.isFrozen(FLOAT_GROUP_MATRIX) && FLOAT_GROUP_MATRIX.every(Object.isFrozen));
  for (const mode of ['home', 'ai']) for (const mini of [false, true]) for (const narrow of [false, true]) {
    assert.equal(FLOAT_GROUP_MATRIX.filter(entry => entry.mode === mode && entry.mini === mini && entry.narrow === narrow).length, 1);
    assert.ok(FLOAT_GROUP_SCREENSHOTS.includes(`float-group-${mode}-${mini ? 'mini' : 'expanded'}-${narrow ? 'narrow' : 'wide'}.png`));
  }
  assert.equal(FLOAT_GROUP_SCREENSHOTS.length, 16); assert.ok(Object.isFrozen(FLOAT_GROUP_SCREENSHOTS));
  assert.equal(new Set(FLOAT_GROUP_SCREENSHOTS).size, 16);
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
  const anchor = { x: 186, y: 140, width: 120, height: 22 };
  const menu = { x: 154, y: 8, width: 152, height: 126 };
  const viewport = { width: 330, height: 176 };
  assert.doesNotThrow(() => assertFloatMenuGeometry(menu, anchor, viewport));
  assert.throws(() => assertFloatMenuGeometry({ ...menu, y: -1 }, anchor, viewport), /fit/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, height: 180 }, anchor, viewport), /fit/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, x: 100 }, anchor, viewport), /right edge/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, width: 0 }, anchor, viewport), /usable/);
  assert.throws(() => assertFloatMenuGeometry({ ...menu, x: 110, width: 196 }, anchor, viewport), /narrow/);
});

test('Floating evidence shares the unchanged global 19 MB allowlist and 3-day retention', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-float-pilot-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of FLOAT_GROUP_SCREENSHOTS) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  const result = await inspectPilotArtifacts(directory);
  assert.equal(result.files.length, 16); assert.equal(result.bytes, 128);
  assert.equal(result.retentionDays, 3); assert.equal(result.uploadCeilingBytes, 20_000_000); assert.equal(MAX_ARTIFACT_BYTES, 19_000_000);
  await assert.rejects(inspectPilotArtifacts(directory, 127), /exceed/);
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
  assert.match(source, /requests\.length, initialCalls/); assert.match(source, /assert\.equal\(floatWireText\(userMessages\.at\(-1\)\.content\), expectedText/);
  assert.match(source, /full same-installed-executable restart/);
  assert.ok(entry.indexOf('await runFloatEmptyPilot(') < entry.indexOf("await check('Create one synthetic task"));
  assert.ok(entry.indexOf('aiCardsFixture = await runAiCardsPilot(') < entry.indexOf('floatGroupFixture = await runFloatGroupPilot('));
  assert.ok(entry.indexOf('floatGroupFixture = await runFloatGroupPilot(') < entry.indexOf("await check('Choose exit-on-close"));
  assert.ok(entry.indexOf('await verifyFloatGroupRelaunch(') > entry.indexOf("await check('Relaunch same installed executable"));
  for (const name of ['verifyAiCardsRelaunch', 'verifyYearDropdownRelaunch', 'verifyTopbarDatesRelaunch']) assert.match(entry, new RegExp(`await ${name}\\(`));
});

const compact = () => ({
  native: { x: 100, y: 200, width: 330, height: 176 }, viewport: { x: 0, y: 0, width: 330, height: 176 },
  context: { x: 18, y: 45, width: 294, height: 22 },
  compose: { x: 18, y: 70, width: 294, height: 55 }, bottom: { x: 18, y: 128, width: 294, height: 22 },
  textarea: { x: 26, y: 74, width: 248, height: 46 }, send: { x: 278, y: 85, width: 24, height: 24 },
  reference: { x: 18, y: 128, width: 84, height: 22 }, model: { x: 192, y: 128, width: 120, height: 22 },
  chip: null as { x: number; y: number; width: number; height: number } | null,
  remove: null as { x: number; y: number; width: number; height: number } | null,
  linkedRow: null as { x: number; y: number; width: number; height: number } | null,
});
test('Real compact row assertions keep the chip inside the two-row dialog and reject overlap/clipping at 176px', () => {
  const empty = compact(); assert.doesNotThrow(() => assertFloatCompactGeometry(empty));
  const linked = compact(); linked.chip = { x: 26, y: 74, width: 200, height: 20 }; linked.remove = { x: 200, y: 76, width: 18, height: 16 };
  assert.doesNotThrow(() => assertFloatCompactGeometry(linked, empty));
  const mutations = [
    (value: ReturnType<typeof compact>) => { value.context.height = 28; },
    (value: ReturnType<typeof compact>) => { value.linkedRow = { x: 18, y: 71, width: 294, height: 20 }; },
    (value: ReturnType<typeof compact>) => { value.bottom.y = 160; },
    (value: ReturnType<typeof compact>) => { value.reference.width = 200; },
    (value: ReturnType<typeof compact>) => { value.textarea.width = 270; },
    (value: ReturnType<typeof compact>) => { value.model.width = 190; },
    (value: ReturnType<typeof compact>) => { value.native.height = 175; },
  ];
  for (const mutate of mutations) { const value = compact(); mutate(value); assert.throws(() => assertFloatCompactGeometry(value, empty)); }
  const clipped = compact(); clipped.chip = { x: 18, y: 40, width: 180, height: 20 };
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
  assert.equal(FLOAT_GROUP_SCREENSHOTS.length, 16);
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

test('Floating wire text accepts exact strings and text blocks without trimming or dropping unknown parts', async () => {
  const { floatWireText } = await import('../tooling/float-group-pilot.mjs');
  const expected = '关于事项「CI synthetic 长标题」:仅验证关联，不修改事项';
  assert.equal(floatWireText(expected), expected);
  assert.equal(floatWireText([{ type: 'text', text: expected }]), expected);
  assert.equal(floatWireText([{ type: 'text', text: '关于事项「CI synthetic 长标题」:' }, { type: 'text', text: '仅验证关联，' }, { type: 'text', text: '不修改事项' }]), expected);
  assert.equal(floatWireText('  raw text\n'), '  raw text\n');
  assert.equal(floatWireText([{ type: 'text', text: '  raw' }, { type: 'text', text: ' text\n' }]), '  raw text\n');
  for (const content of [null, undefined, 42, {}, [], [null], ['text'], [{ type: 'text' }], [{ type: 'text', text: 42 }], [{ type: 'image_url', image_url: { url: 'synthetic-image' } }], [{ type: 'text', text: expected }, { type: 'unknown', text: 'ignored?' }]]) {
    assert.throws(() => floatWireText(content), /content|block/);
  }
  for (const wrong of [`prefix ${expected}`, `${expected} suffix`, expected.replace('长标题', '错误标题'), ` ${expected}`, `${expected}\n`]) {
    for (const content of [wrong, [{ type: 'text', text: wrong }]]) assert.throws(() => assert.equal(floatWireText(content), expected));
  }
});

test('Actual openai-chat runAgentLoop transport preserves exact linked prompt with and without history', async t => {
  const { runAgentLoop } = await import('../electron/ai-core');
  const { floatWireText } = await import('../tooling/float-group-pilot.mjs');
  const expected = `关于事项「CI floating transport ${'长标题关联与窄屏验收'.repeat(10)}」:仅验证关联，不修改事项`;
  // Capture only synthetic user content and selected model, never credentials,
  // headers, system instructions, or other request metadata.
  const captured: Array<{ model: string; users: Array<{ content: unknown }> }> = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const value = JSON.parse(body);
    captured.push({ model: value.model, users: value.messages.filter((message: { role: string }) => message.role === 'user').map((message: { content: unknown }) => ({ content: message.content })) });
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const chunk = (delta: object, finish_reason: string | null = null) => response.write(`data: ${JSON.stringify({ id: 'floating-transport-test', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
    chunk({ role: 'assistant' }); chunk({ content: 'Synthetic loopback acknowledgement.' }); chunk({}, 'stop');
    response.end('data: [DONE]\n\n');
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address() as { port: number };
  const contribution = { buildTools: () => [], toolNames: [], labels: {}, systemPrompt: () => 'Synthetic transport test. Reply with acknowledgement only.' };
  try {
    for (const withHistory of [false, true]) {
      const history = withHistory ? [{ role: 'user' as const, content: '合成历史请求' }, { role: 'assistant' as const, content: '合成历史回复' }] : [];
      const before = captured.length;
      const result = await runAgentLoop({ endpoint: `http://127.0.0.1:${address.port}/v1`, model: 'float-synthetic-long-model-name-0', protocol: 'openai-chat', key: '' }, expected, history, AbortSignal.timeout(15000), contribution);
      assert.equal(result.reply, 'Synthetic loopback acknowledgement.');
      assert.equal(captured.length, before + 1, 'Each explicit send must produce exactly one transport request');
      const request = captured.at(-1)!;
      assert.equal(request.model, 'float-synthetic-long-model-name-0');
      assert.equal(request.users.length, withHistory ? 2 : 1);
      const latest = request.users.at(-1)!.content;
      assert.equal(floatWireText(latest), expected, 'Latest actual wire user content must equal the entire linked prompt');
      assert.ok(Array.isArray(latest), 'Current real openai-chat adapter sends user content as text blocks');
      assert.deepEqual(latest, [{ type: 'text', text: expected }]);
      if (withHistory) assert.equal(floatWireText(request.users[0].content), '合成历史请求');
      t.diagnostic(`Actual openai-chat transport: history=${withHistory}, latestUserContent=array, parts=text, exactLinkedPrompt=true, requestCount=1`);
    }
  } finally {
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test('Wire acceptance checks latest normalized user message exactly and keeps synthetic diagnostics header-free', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /assert\.equal\(floatWireText\(userMessages\.at\(-1\)\.content\), expectedText/);
  assert.doesNotMatch(source, /messages\.some\(/);
  const wireCheck = source.slice(source.indexOf("await check('Floating group: explicit send"), source.indexOf("await check('Floating group: hide/show"));
  assert.match(wireCheck, /assert\.equal\(requests\.length, 1\)/);
  assert.match(wireCheck, /requests\[0\]\.model, 'float-synthetic-long-model-name-0'/);
  assert.doesNotMatch(wireCheck.replace(/^\s*\/\/.*$/gm, ''), /headers|authorization|apiKey|systemPrompt/);
});

const expandedToolbar = () => ({
  native: { width: 330, height: 704 }, viewport: { x: 0, y: 0, width: 330, height: 704 },
  toolbar: { x: 20, y: 640, width: 290, height: 40 }, reference: { x: 22, y: 645, width: 82, height: 30 },
  model: { x: 112, y: 645, width: 156, height: 30 }, send: { x: 276, y: 645, width: 30, height: 30 },
  referenceText: '关联事项', referenceWhiteSpace: 'nowrap', referenceTextRects: [{ x: 40, y: 651, width: 52, height: 16 }],
  modelText: 'synthetic-complete-long-model-name', expectedModelName: 'synthetic-complete-long-model-name',
  modelTitle: 'synthetic-complete-long-model-name', modelAriaValueText: 'synthetic-complete-long-model-name',
  modelTextBounds: { x: 120, y: 651, width: 120, height: 16 }, modelTextClientWidth: 120, modelTextScrollWidth: 250,
  modelWhiteSpace: 'nowrap', modelOverflow: 'hidden', modelTextOverflow: 'ellipsis', hitReference: true, hitModel: true, hitSend: true,
});
test('Expanded330 toolbar requires actual single-line reference, usable model ellipsis/full title and pointer hits', () => {
  assert.doesNotThrow(() => assertFloatExpandedToolbarGeometry(expandedToolbar()));
  const mutations = [
    (value: ReturnType<typeof expandedToolbar>) => { value.native.width = 440; },
    (value: ReturnType<typeof expandedToolbar>) => { value.native.height = 176; },
    (value: ReturnType<typeof expandedToolbar>) => { value.referenceWhiteSpace = 'normal'; },
    (value: ReturnType<typeof expandedToolbar>) => { value.referenceTextRects.push({ x: 40, y: 667, width: 26, height: 16 }); },
    (value: ReturnType<typeof expandedToolbar>) => { value.referenceTextRects[0].width = 90; },
    (value: ReturnType<typeof expandedToolbar>) => { value.reference.width = 100; },
    (value: ReturnType<typeof expandedToolbar>) => { value.model.width = 70; },
    (value: ReturnType<typeof expandedToolbar>) => { value.model.width = 180; },
    (value: ReturnType<typeof expandedToolbar>) => { value.modelTextOverflow = 'clip'; },
    (value: ReturnType<typeof expandedToolbar>) => { value.modelText = 'truncated…'; },
    (value: ReturnType<typeof expandedToolbar>) => { value.modelTitle = ''; },
    (value: ReturnType<typeof expandedToolbar>) => { value.modelAriaValueText = ''; },
    (value: ReturnType<typeof expandedToolbar>) => { value.modelTextClientWidth = 0; },
    (value: ReturnType<typeof expandedToolbar>) => { value.hitReference = false; },
    (value: ReturnType<typeof expandedToolbar>) => { value.hitModel = false; },
    (value: ReturnType<typeof expandedToolbar>) => { value.hitSend = false; },
  ];
  for (const mutate of mutations) { const value = expandedToolbar(); mutate(value); assert.throws(() => assertFloatExpandedToolbarGeometry(value)); }
});
test('Narrow expanded acceptance uses real range/hit geometry and physical model open/dismiss without changed selection', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.match(source, /range\.getClientRects\(\)/);
  assert.match(source, /document\.elementFromPoint\(box\.x \+ box\.width \/ 2/);
  assert.match(source, /if \(entry\.narrow\) await expandedToolbarGeometry/);
  assert.match(source, /getByRole\('combobox', \{ name: '选择大模型', exact: true \}\)/);
  assert.match(source, /await trigger\.click\(\)/);
  assert.match(source, /Opening\/dismissing expanded model picker must preserve model/);
  assert.match(source, /Model dismissal must preserve association/);
  assert.match(source, /Model dismissal must not submit a request/);
  assert.doesNotMatch(source, /force:\s*true|element\.click\(\)/);
});
test('Selected mini picker screenshot supplements existing evidence and distinguishes business status from selection', async () => {
  const source = await readFile(new URL('../tooling/float-group-pilot.mjs', import.meta.url), 'utf8');
  assert.ok(FLOAT_GROUP_SCREENSHOTS.includes('float-group-picker.png'));
  assert.equal(FLOAT_GROUP_SCREENSHOTS.length, 16);
  assert.match(source, /Association selection must not replace business status/);
  assert.match(source, /Independent selection check must match aria-selected/);
  assert.match(source, /Selection check must not masquerade as business status/);
  assert.match(source, /capture\(screenshot, floatPage, 'float-group-picker\.png'\)/);
});

test('Complete evidence enumerates 53 success PNGs, 56 success files and 57 allowlisted files without raising budget', async t => {
  const { YEAR_DROPDOWN_SCREENSHOTS } = await import('../tooling/year-dropdown-pilot.mjs');
  const { TOPBAR_DATES_SCREENSHOTS } = await import('../tooling/topbar-dates-pilot.mjs');
  const { AI_CARDS_SCREENSHOTS } = await import('../tooling/ai-cards-pilot.mjs');
  const { CONTEXT_PICKER_SCREENSHOTS } = await import('../tooling/context-picker-pilot.mjs');
  const { UPDATE_STATUS_SCREENSHOTS } = await import('../tooling/update-status-pilot.mjs');
  const { PUBLISH_ASSOCIATION_SCREENSHOTS } = await import('../tooling/publish-association-pilot.mjs');
  const screenshots = ['initial.png', 'created.png', 'edited.png', 'completed.png', 'relaunched.png', ...YEAR_DROPDOWN_SCREENSHOTS, ...TOPBAR_DATES_SCREENSHOTS, ...AI_CARDS_SCREENSHOTS, ...FLOAT_GROUP_SCREENSHOTS, ...CONTEXT_PICKER_SCREENSHOTS, ...UPDATE_STATUS_SCREENSHOTS, ...PUBLISH_ASSOCIATION_SCREENSHOTS];
  assert.equal(screenshots.length, 53); assert.equal(new Set(screenshots).size, 53);
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-float-complete-evidence-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  for (const name of screenshots) await writeFile(path.join(directory, name), Buffer.from('89504e470d0a1a0a', 'hex'));
  await writeFile(path.join(directory, 'install.json'), '{}'); await writeFile(path.join(directory, 'report.json'), '{}'); await writeFile(path.join(directory, 'report.md'), 'Synthetic unit evidence');
  assert.equal((await inspectPilotArtifacts(directory)).files.length, 56);
  await writeFile(path.join(directory, 'failure.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const all = await inspectPilotArtifacts(directory);
  assert.equal(all.files.length, 57); assert.equal(all.retentionDays, 3); assert.equal(all.uploadCeilingBytes, 20_000_000);
  assert.equal(MAX_ARTIFACT_BYTES, 19_000_000);
});
