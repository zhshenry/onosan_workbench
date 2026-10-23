import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement, useRef, useState } from 'react';
import {
  CONTEXT_PICKER_MATRIX, CONTEXT_PICKER_SCREENSHOTS, assertContextPickerGeometry,
  assertReferenceTurn, assertSavedReferenceTurn, assertTransmittedReferenceSnapshots, referencePromptBubble, assertContextPilotConfig, selectReference,
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

test('Installed selection helper clicks an immediately unmounted todo radio and verifies its exact committed chip, while other modes retain check/confirm or Escape', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  const { createRoot } = await import('react-dom/client');
  const { AiReferencePicker } = await import('../src/views/AiReferencePicker');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const actions: string[] = [];
  let mode: 'todo' | 'reading' | 'copy' | 'bazi' = 'todo';
  let broken: '' | 'no-close' | 'no-focus' | 'wrong-title' | 'wrong-remove' | 'duplicate-chip' = '';
  const options = () => ['Alpha', 'Beta'].map((title, index) => ({ title, detail: 'Synthetic saved source',
    reference: mode === 'todo' ? { module: mode, taskId: `task-${index}` } : mode === 'copy' ? { module: mode, draftId: `draft-${index}` } : { module: mode, profileId: `profile-${index}` } }));
  function Fixture() {
    const anchor = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false), [selected, setSelected] = useState<any[]>([]);
    const close = () => { if (broken === 'no-close') return; setOpen(false); if (broken !== 'no-focus') trigger.current?.focus(); };
    const chips = selected.flatMap(item => {
      const title = options().find(option => JSON.stringify(option.reference) === JSON.stringify(item))!.title;
      const chip = createElement('span', { className: 'ai-reference-chip', key: title },
        createElement('span', { title: broken === 'wrong-title' ? `${title} extra` : title }, title),
        createElement('button', { 'aria-label': `移除参考：${broken === 'wrong-remove' ? 'Other source' : title}` }, 'Remove'));
      return broken === 'duplicate-chip' ? [chip, createElement('span', { className: 'ai-reference-chip', key: `${title}-duplicate` }, title)] : [chip];
    });
    return createElement('aside', { id: 'workbench-ai-panel' }, createElement('div', { ref: anchor },
      createElement('button', { ref: trigger, className: 'ai-add-reference', 'aria-expanded': open, onClick: () => setOpen(true) }, 'Add'), ...chips),
      open && createElement(AiReferencePicker, { id: 'selection-regression', mode, unavailable: '', options: options() as any,
        selected, loading: false, error: '', notice: '', anchor, trigger, onChange: setSelected, onRetry: () => undefined, onClose: close }));
  }
  // DOM-backed Playwright adapter runs the actual React picker. check() models
  // Playwright's post-click checked-state requirement; this is not Electron coverage.
  const locator = (read: () => Element[]): any => {
    const one = () => { const elements = read(); assert.equal(elements.length, 1, 'A real locator must resolve exactly once'); return elements[0]; };
    return {
      locator: (selector: string) => locator(() => read().flatMap(element => [...element.querySelectorAll(selector)])),
      filter: ({ hasText }: { hasText: string }) => locator(() => read().filter(element => element.textContent?.includes(hasText))),
      getByRole: (role: string) => { assert.equal(role, 'button'); return locator(() => read().flatMap(element => [...element.querySelectorAll('button')])); },
      count: async () => read().length,
      getAttribute: async (name: string) => one().getAttribute(name),
      evaluate: async (callback: (element: Element) => unknown) => callback(one()),
      waitFor: async ({ state }: { state: string }) => { assert.equal(read().length, state === 'hidden' ? 0 : 1, `Expected ${state} locator`); },
      click: async () => { const element = one() as HTMLElement; actions.push(`click:${element.tagName}:${element.tagName === 'INPUT' ? element.getAttribute('type') : element.className}`); await act(async () => element.click()); },
      check: async () => {
        const element = one() as HTMLInputElement; actions.push(`check:${element.type}`);
        if (!element.checked) await act(async () => element.click());
        assert.ok(element.isConnected && element.checked, 'check cannot observe a radio synchronously unmounted by selection');
      },
      fill: async (value: string) => { const element = one() as HTMLInputElement; await act(async () => {
        Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
        element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      }); },
    };
  };
  const page = { locator: (selector: string) => locator(() => [...dom.window.document.querySelectorAll(selector)]),
    keyboard: { press: async (key: string) => { actions.push(`key:${key}`); await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))); } } };
  const render = async () => { actions.length = 0; await act(async () => root.render(createElement(Fixture, { key: `${mode}:${broken}` }))); };
  try {
    await render(); await selectReference(page, 'Alpha'); await selectReference(page, 'Beta');
    assert.equal(dom.window.document.querySelectorAll('.ai-reference-chip').length, 1, 'Replacement must not append');
    assert.equal(dom.window.document.querySelector('.ai-reference-chip span')!.getAttribute('title'), 'Beta');
    assert.equal(actions.filter(action => action === 'click:INPUT:radio').length, 2);
    assert.ok(!actions.some(action => action.startsWith('check:') || action === 'key:Escape'), 'Todo requires an actual click and immediate closure, never check or fallback Escape');
    for (const failure of ['no-close', 'no-focus', 'wrong-title', 'wrong-remove', 'duplicate-chip'] as const) {
      broken = failure; await render(); await assert.rejects(selectReference(page, 'Alpha'), failure === 'no-close' ? /Expected hidden/ : failure === 'no-focus' ? /return focus/ : failure === 'wrong-title' ? /exact chosen source title/ : failure === 'wrong-remove' ? /same exact chosen source/ : /strictly equal/);
    }
    broken = '';
    for (const other of ['reading', 'copy', 'bazi'] as const) {
      mode = other; await render(); await selectReference(page, 'Alpha', other !== 'reading');
      assert.ok(actions.includes(`check:${other === 'reading' ? 'radio' : 'checkbox'}`), 'Non-closing radios and multiple selections keep check');
      assert.equal(actions.includes('key:Escape'), other === 'reading');
      assert.equal(actions.some(action => action.startsWith('click:BUTTON:primary')), other !== 'reading', 'Multiple selections still require the actual confirm button');
    }
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    globals.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else delete (globalThis as any)[name]; });
  }
});

test('Reference acceptance rejects a floating-pilot active model, stale loopback endpoint and any saved key', () => {
  const endpoint = 'http://127.0.0.1:12345/v1';
  const config = { activeModelId: 'reference', models: [
    { id: 'reference', name: 'synthetic-card-acceptance', providerId: 'cards' },
    { id: 'floating', name: 'float-synthetic-long-model-name-0', providerId: 'float' },
  ], providers: [
    { id: 'cards', name: '本机合成验收', endpoint, hasKey: false },
    { id: 'float', name: '悬浮窗合成验收', endpoint: 'http://127.0.0.1:54321/v1', hasKey: false },
  ] };
  assertContextPilotConfig(config, endpoint);
  assert.throws(() => assertContextPilotConfig({ ...config, activeModelId: 'floating' }, endpoint), /explicitly restore/);
  assert.throws(() => assertContextPilotConfig({ ...config, activeModelId: 'missing' }, endpoint), /explicitly restore/);
  const stale = structuredClone(config); stale.providers[0].endpoint = 'http://127.0.0.1:11111/v1';
  assert.throws(() => assertContextPilotConfig(stale, endpoint), /live context loopback/);
  const wrongProvider = structuredClone(config); wrongProvider.models[0].providerId = 'float';
  assert.throws(() => assertContextPilotConfig(wrongProvider, endpoint));
  const keyed = structuredClone(config); keyed.providers[0].hasKey = true;
  assert.throws(() => assertContextPilotConfig(keyed, endpoint));
});

test('Restart prompt locator requires the exact user bubble, never a matching title or assistant echo', async () => {
  const prompt = 'CI待办参考8286044872 [a+b].*?($)\\';
  const dom = new JSDOM('<aside id="workbench-ai-panel"><button class="ai-context-select"><strong></strong></button><div class="ai-messages"><div class="ai-msg user"><span class="ai-message-tag"></span><div class="ai-bubble" id="expected"></div></div><div class="ai-msg"><div class="ai-bubble" id="assistant"></div></div><div class="ai-msg user"><div class="ai-bubble" id="prefix"></div></div></div></aside><div class="ai-msg user"><div class="ai-bubble" id="outside"></div></div>');
  const document = dom.window.document;
  for (const selector of ['strong', '.ai-message-tag', '#expected', '#assistant', '#outside']) document.querySelector(selector)!.textContent = prompt;
  document.querySelector('#prefix')!.textContent = `${prompt} extra`;
  // DOM-backed locator double exercises the authored CSS scope and exact regex.
  // It does not claim a Playwright/Electron runtime execution.
  function locator(elements: Element[]): any {
    return {
      locator: (selector: string) => locator(elements.flatMap(element => [...element.querySelectorAll(selector)])),
      filter: ({ hasText }: { hasText: RegExp }) => locator(elements.filter(element => hasText.test(element.textContent ?? ''))),
      waitFor: async () => { assert.equal(elements.length, 1, 'Exactly one user bubble must match'); },
      elements,
    };
  }
  const page = { locator: (selector: string) => locator([...document.querySelectorAll(selector)]) };
  try {
    const selected = referencePromptBubble(page, prompt);
    await selected.waitFor({ state: 'visible' });
    assert.deepEqual(selected.elements.map((element: Element) => element.id), ['expected']);
    const duplicate = document.querySelector('#expected')!.parentElement!.cloneNode(true);
    document.querySelector('.ai-messages')!.append(duplicate);
    await assert.rejects(referencePromptBubble(page, prompt).waitFor({ state: 'visible' }), /Exactly one user bubble/);
    duplicate.parentNode!.removeChild(duplicate);
    document.querySelector('#expected')!.remove();
    await assert.rejects(referencePromptBubble(page, prompt).waitFor({ state: 'visible' }), /Exactly one user bubble/);
    const source = await readFile(new URL('../tooling/context-picker-pilot.mjs', import.meta.url), 'utf8');
    assert.match(source, /await referencePromptBubble\(page, fixture\.turns\[0\]\.prompt\)\.waitFor/);
    assert.doesNotMatch(source, /panel\(page\)\.getByText\(fixture\.turns\[0\]\.prompt/);
  } finally { dom.window.close(); }
});

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
  assert.match(source, /await openPanel\(page\); await model\(page\)\.click\(\)/);
  assert.match(source, /getByRole\('option', \{ name: 'synthetic-card-acceptance', exact: true \}\)\.click\(\)/);
  const selectSupplier = source.indexOf("getByRole('button', { name: '查看对话模型供应商 本机合成验收', exact: true })");
  const editSupplier = source.indexOf("getByRole('button', { name: '编辑供应商 本机合成验收', exact: true })");
  assert.ok(selectSupplier >= 0 && editSupplier > selectSupplier, 'Select the synthetic supplier before editing; its edit control exists only in the selected detail');
  assert.match(source, /#ai-provider-details-llm/);
  assert.match(source, /getByRole\('article', \{ name: '本机合成验收 配置', exact: true \}\)/);
  assert.match(source, /aria-pressed/);
  assert.match(source, /assertContextPilotConfig\(config, `http:\/\/127\.0\.0\.1:/);
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
