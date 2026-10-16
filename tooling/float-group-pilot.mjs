// Installed Electron acceptance. All task/provider writes use normal visible UI.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';

export const FLOAT_GROUP_MATRIX = Object.freeze(['home', 'ai'].flatMap(mode => [false, true].flatMap(mini => [false, true].map(narrow => Object.freeze({ mode, mini, narrow })))));
export const FLOAT_GROUP_SCREENSHOTS = Object.freeze([
  ...FLOAT_GROUP_MATRIX.map(({ mode, mini, narrow }) => `float-group-${mode}-${mini ? 'mini' : 'expanded'}-${narrow ? 'narrow' : 'wide'}.png`),
  'float-group-empty.png', 'float-group-linked.png', 'float-group-models.png', 'float-group-relaunched.png',
  'float-group-mist.png', 'float-group-cool.png', 'float-group-warm.png', 'float-group-picker.png',
]);
export function floatWireText(content) {
  if (typeof content === 'string') return content;
  assert.ok(Array.isArray(content) && content.length > 0, 'User content must be a string or nonempty text-block array');
  assert.ok(content.every(part => part && typeof part === 'object' && part.type === 'text' && typeof part.text === 'string'), 'Every user content block must be text; unknown or mixed blocks cannot be ignored');
  return content.map(part => part.text).join('');
}
export function assertFloatWidthTransition(before, after, width, area) {
  for (const rect of [before, after, area]) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(rect[key]), 'Native bounds must be finite');
  assert.equal(after.width, width, 'Native width must match the selected mode');
  assert.equal(after.height, before.height, 'Width-only changes must preserve native height after observers settle');
  assert.ok(after.x >= area.x && after.y >= area.y && after.x + after.width <= area.x + area.width && after.y + after.height <= area.y + area.height, 'Native bounds must remain inside the work area');
}
export function assertFloatModelGeometry(before, after) {
  for (const key of ['x', 'y', 'width', 'height']) {
    assert.ok(Number.isFinite(before[key]) && Number.isFinite(after[key]), 'Model geometry must be finite');
    assert.ok(Math.abs(before[key] - after[key]) <= 1, `Association must not move model ${key}`);
  }
  assert.ok(before.width > 0 && before.height > 0, 'Model control must remain visible');
}
export function assertFloatMenuGeometry(menu, anchor, viewport) {
  assert.ok(menu.width > 0 && menu.height > 0, 'Model menu must have usable dimensions');
  for (const value of [menu.x, menu.y, menu.width, menu.height, anchor.x, anchor.width, viewport.width, viewport.height]) assert.ok(Number.isFinite(value), 'Menu geometry must be finite');
  assert.ok(menu.x >= 0 && menu.y >= 0 && menu.x + menu.width <= viewport.width + 1 && menu.y + menu.height <= viewport.height + 1, 'Model menu must fit the actual float viewport');
  assert.ok(Math.abs(menu.x + menu.width - anchor.x - anchor.width) <= 1, 'Compact model menu must align to its anchor right edge');
  assert.ok(menu.width <= 160, 'Collapsed model menu must stay narrow enough not to cover the dialog');
  assert.ok(menu.width <= anchor.width + 40, 'Collapsed model menu must stay with its trigger');
}
export function assertFloatRectInside(rect, container, label) {
  for (const value of [rect?.x, rect?.y, rect?.width, rect?.height, container?.x, container?.y, container?.width, container?.height]) assert.ok(Number.isFinite(value), `${label}: finite real bounds required`);
  assert.ok(rect.width > 0 && rect.height > 0, `${label}: nonempty real bounds required`);
  assert.ok(rect.x >= container.x - 1 && rect.y >= container.y - 1 && rect.x + rect.width <= container.x + container.width + 1 && rect.y + rect.height <= container.y + container.height + 1, `${label}: outside viewport or containing row`);
}
export function assertFloatCompactGeometry(value, before) {
  assert.equal(value.native.height, 176, 'Compact composition must fit native 176px');
  assert.equal(value.viewport.height, 176, 'Compact viewport must match native 176px');
  assert.equal(value.linkedRow ?? null, null, 'Collapsed dialog must not reserve an empty chip row');
  const rows = ['context', 'compose', 'bottom'];
  for (const key of rows) assertFloatRectInside(value[key], value.viewport, key);
  for (let index = 1; index < rows.length; index++) {
    const previous = value[rows[index - 1]]; const current = value[rows[index]];
    assert.ok(previous.y + previous.height <= current.y + 1, `${rows[index - 1]} overlaps ${rows[index]}`);
  }
  const gap = value.compose.y - (value.context.y + value.context.height);
  assert.ok(gap >= -1 && gap <= 6, 'No reserved chip gap above the collapsed dialog');
  assert.ok(value.compose.height >= 52, 'Collapsed dialog fills the former chip row and input row');
  for (const key of ['textarea', 'send']) assertFloatRectInside(value[key], value.compose, key);
  for (const key of ['reference', 'model']) assertFloatRectInside(value[key], value.bottom, key);
  assert.ok(value.textarea.x + value.textarea.width <= value.send.x + 1, 'Input and send button overlap');
  assert.ok(value.reference.x + value.reference.width <= value.model.x + 1, 'Reference and model buttons overlap');
  assert.ok(value.model.width <= 136, 'Collapsed model button must stay narrow');
  if (value.chip) assertFloatRectInside(value.chip, value.compose, 'Linked chip inside dialog');
  if (value.remove) assertFloatRectInside(value.remove, value.chip, 'Remove button');
  if (before) {
    for (const key of rows) assertFloatModelGeometry(before[key], value[key]);
  }
}
export function assertFloatExpandedToolbarGeometry(value) {
  assert.equal(value.native.width, 330, 'Expanded toolbar regression must exercise actual narrow native width');
  assert.ok(value.native.height >= 330, 'Expanded toolbar needs a real expanded window');
  assertFloatRectInside(value.toolbar, value.viewport, 'Expanded toolbar');
  for (const key of ['reference', 'model', 'send']) assertFloatRectInside(value[key], value.toolbar, key);
  assert.equal(value.referenceWhiteSpace, 'nowrap', 'Reference control must explicitly prevent wrapping');
  assert.equal(value.referenceText, '关联事项');
  assert.equal(value.referenceTextRects.length, 1, 'Reference text must occupy exactly one real rendered line');
  assertFloatRectInside(value.referenceTextRects[0], value.reference, 'Reference text');
  assert.ok(value.reference.x + value.reference.width <= value.model.x + 1, 'Reference/model controls must not overlap');
  assert.ok(value.model.x + value.model.width <= value.send.x + 1, 'Model/send controls must not overlap');
  assert.ok(value.model.width >= 80, 'Model control must retain at least 80px of usable remaining width');
  assert.ok(value.modelTextClientWidth > 0 && value.modelTextScrollWidth >= value.modelTextClientWidth);
  assertFloatRectInside(value.modelTextBounds, value.model, 'Model label');
  assert.equal(value.modelWhiteSpace, 'nowrap'); assert.equal(value.modelOverflow, 'hidden'); assert.equal(value.modelTextOverflow, 'ellipsis');
  assert.equal(value.modelText, value.expectedModelName, 'Ellipsis must preserve the complete actual model name in the DOM');
  assert.equal(value.modelTitle, value.expectedModelName, 'Floating model tooltip must retain its complete name');
  assert.equal(value.modelAriaValueText, value.expectedModelName, 'Floating model accessible value must retain its complete name');
  assert.ok(value.hitReference && value.hitModel && value.hitSend, 'All expanded toolbar button centers must receive real pointer hits');
}
async function expandedToolbarGeometry(application, page, report) {
  const config = await page.evaluate(() => window.workbench.ai.config());
  const expectedModelName = config.models.find(model => model.id === config.activeModelId)?.name;
  assert.ok(expectedModelName, 'Expanded toolbar must have a configured active model');
  const value = await page.locator('.fa-surface .ai-compose-toolbar').evaluate(toolbar => {
    const rect = element => { const box = element.getBoundingClientRect(); return { x: box.x, y: box.y, width: box.width, height: box.height }; };
    const reference = toolbar.querySelector('.ai-add-reference'); const model = toolbar.querySelector('.ai-model-select .select-trigger'); const send = toolbar.querySelector('.ai-send');
    const label = model.querySelector('span'); const style = getComputedStyle(label);
    const walker = document.createTreeWalker(reference, NodeFilter.SHOW_TEXT); const referenceTextRects = [];
    while (walker.nextNode()) if (walker.currentNode.textContent.trim()) {
      const range = document.createRange(); range.selectNodeContents(walker.currentNode);
      referenceTextRects.push(...[...range.getClientRects()].map(box => ({ x: box.x, y: box.y, width: box.width, height: box.height })));
    }
    const hit = element => { const box = element.getBoundingClientRect(); const target = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2); return target === element || element.contains(target); };
    return { viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, toolbar: rect(toolbar), reference: rect(reference), model: rect(model), send: rect(send),
      referenceText: reference.textContent.trim(), referenceWhiteSpace: getComputedStyle(reference).whiteSpace, referenceTextRects,
      modelText: label.textContent, modelTitle: model.querySelector('[title]')?.getAttribute('title'), modelAriaValueText: model.getAttribute('aria-valuetext'), modelTextBounds: rect(label), modelTextClientWidth: label.clientWidth, modelTextScrollWidth: label.scrollWidth,
      modelWhiteSpace: style.whiteSpace, modelOverflow: style.overflow, modelTextOverflow: style.textOverflow,
      hitReference: hit(reference), hitModel: hit(model), hitSend: hit(send) };
  });
  Object.assign(value, { native: await bounds(application, page), expectedModelName });
  assertFloatExpandedToolbarGeometry(value);
  (report.floatGroup.expandedToolbarGeometry ??= []).push(value);
  return value;
}
async function compactGeometry(application, page, report, before) {
  const selectors = { context: '.fa-mini-context', linkedRow: '.fa-mini-surface .fa-linked-row', compose: '.fa-mini-compose', bottom: '.fa-mini-quick', textarea: '.fa-mini-compose textarea', send: '.fa-mini-compose button[type="submit"]', reference: '.fa-mini-quick .ai-add-reference', model: '.fa-mini-quick .fa-model-toggle', chip: '.fa-mini-compose .ai-reference-chip', remove: '.fa-mini-compose .ai-reference-chip button' };
  const value = { native: await bounds(application, page), viewport: await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight })) };
  for (const [key, selector] of Object.entries(selectors)) value[key] = await page.locator(selector).count() ? await page.locator(selector).boundingBox() : null;
  assertFloatCompactGeometry(value, before);
  (report.floatGroup.compactGeometry ??= []).push(value);
  return value;
}
async function pickerGeometry(page, report) {
  const rect = await page.getByRole('listbox', { name: '选择事项', exact: true }).boundingBox();
  const viewport = await page.evaluate(() => ({ x: 0, y: 0, width: innerWidth, height: innerHeight }));
  assertFloatRectInside(rect, viewport, 'Task picker');
  (report.floatGroup.pickerGeometry ??= []).push({ rect, viewport });
}
export function expectedFloatMeasuredHeight(requested, areaHeight) {
  assert.ok(Number.isFinite(requested) && Number.isFinite(areaHeight), 'Height measurement and work area must be finite');
  return Math.min(Math.max(330, Math.min(1200, Math.round(requested))), areaHeight - 24);
}
async function scheduleMeasurement(application, page) {
  const dom = await page.evaluate(() => {
    const root = document.querySelector('.float-app'); const board = root.querySelector('.today-board');
    const today = board.querySelector('.plan-today'); const schedule = board.querySelector('.plan-schedule');
    const list = today.querySelector('.plan-list, .plan-tiles'); const last = list?.lastElementChild;
    const contentHeight = list && last ? last.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop + parseFloat(getComputedStyle(list).paddingBottom) : 0;
    const todayHeight = list ? today.offsetHeight - list.clientHeight + contentHeight : today.offsetHeight;
    const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
    const minimum = Math.max(700, Math.round(screen.availHeight - 112));
    return { rootHeight: root.offsetHeight, boardHeight: board.offsetHeight, todayHeight, scheduleHeight: schedule.offsetHeight, contentHeight, gap, minimum,
      requested: Math.max(minimum, Math.ceil(root.offsetHeight - board.offsetHeight + todayHeight + gap + schedule.offsetHeight)),
      viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight } };
  });
  return { dom, native: await bounds(application, page), area: await workArea(application, page) };
}
async function observeFloatResize(application, page) {
  const id = await (await application.browserWindow(page)).evaluate(win => win.webContents.id);
  await application.evaluate(({ ipcMain }, id) => {
    if (globalThis.__floatPilotResizeObservation) throw new Error('Resize observation already active');
    const observation = { events: [], listener: null };
    observation.listener = (event, height) => { if (event.sender.id === id) observation.events.push(height); };
    globalThis.__floatPilotResizeObservation = observation;
    ipcMain.on('float:resize', observation.listener);
  }, id);
}
async function resizeEvents(application) {
  return application.evaluate(() => [...globalThis.__floatPilotResizeObservation.events]);
}
async function stopObservingFloatResize(application) {
  await application.evaluate(({ ipcMain }) => {
    const observation = globalThis.__floatPilotResizeObservation;
    if (observation) ipcMain.removeListener('float:resize', observation.listener);
    delete globalThis.__floatPilotResizeObservation;
  });
}
// Edge-placement is a scoped test fixture, not a position preference for later flows.
export async function withFloatPositionRestored(window, action) {
  const original = await window.evaluate(win => win.getBounds());
  let failure; let value;
  try { value = await action(); } catch (error) { failure = error; }
  try { await window.evaluate((win, position) => win.setPosition(position.x, position.y), original); }
  catch (error) { if (failure) throw new AggregateError([failure, error], `Edge test failed: ${String(failure)}; position restore failed: ${String(error)}`); throw error; }
  if (failure) throw failure;
  return { value, original, restored: await window.evaluate(win => win.getBounds()) };
}
async function recordFolderHit(application, page, tab, report, phase) {
  const native = await bounds(application, page);
  const geometry = await tab.evaluate(element => {
    const rect = element.getBoundingClientRect(); const x = rect.x + rect.width / 2; const y = rect.y + rect.height / 2;
    const hit = document.elementFromPoint(x, y);
    const describe = node => node ? { tag: node.tagName, className: node.className, id: node.id } : null;
    return { rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height }, center: { x, y },
      viewport: { width: innerWidth, height: innerHeight }, devicePixelRatio, targetReceivesCenter: hit === element || element.contains(hit),
      hit: describe(hit), ancestors: Array.from((function* () { for (let node = element.parentElement; node; node = node.parentElement) yield node; })()).map(node => {
        const box = node.getBoundingClientRect(); const style = getComputedStyle(node);
        return { ...describe(node), x: box.x, y: box.y, width: box.width, height: box.height, scrollTop: node.scrollTop, scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, overflow: style.overflow, position: style.position };
      }) };
  });
  (report.floatGroup.folderHitTests ??= []).push({ phase, native, geometry });
}
async function openFloat(application, page) {
  const open = page.locator('.topbar').getByRole('button', { name: '打开悬浮待办窗', exact: true });
  if (await open.isVisible()) await open.click();
  let floatPage; const started = Date.now();
  while (!floatPage && Date.now() - started < 15000) {
    floatPage = application.windows().find(candidate => /[?&]window=float(?:&|$)/.test(candidate.url()));
    if (!floatPage) await page.waitForTimeout(100);
  }
  assert.ok(floatPage, 'Normal toolbar must create the real floating page');
  await floatPage.locator('.float-app').waitFor({ state: 'visible' });
  await floatPage.bringToFront();
  floatPage.setDefaultTimeout(15000);
  return floatPage;
}
async function bounds(application, page) { return (await application.browserWindow(page)).evaluate(win => win.getBounds()); }
async function workArea(application, page) {
  const id = await (await application.browserWindow(page)).evaluate(win => win.id);
  return application.evaluate(({ screen, BrowserWindow }, id) => screen.getDisplayMatching(BrowserWindow.fromId(id).getBounds()).workArea, id);
}
async function settled(application, page) {
  await page.waitForFunction(() => document.querySelector('.float-app')?.classList.contains('is-idle'));
  // Observe well beyond CSS/native animation and consecutive ResizeObserver deliveries.
  let previous; let stable = 0; const start = Date.now();
  while (Date.now() - start < 10000) {
    const next = await bounds(application, page);
    if (JSON.stringify(next) === JSON.stringify(previous)) stable++; else stable = 0;
    if (stable >= 6) return next;
    previous = next; await page.waitForTimeout(100);
  }
  throw new Error('Floating native bounds never settled');
}
const expandedHeightMemory = new WeakMap();
export function assertFloatStateHeight(native, mini, expectedExpandedHeight) {
  assert.ok(Number.isFinite(native.height), 'Native state height must be finite');
  if (mini) { assert.equal(native.height, 176, 'Idle mini native height must be exactly 176'); return; }
  assert.ok(native.height >= 330, 'Expanded native state must never retain compact height');
  assert.ok(Number.isFinite(expectedExpandedHeight) && expectedExpandedHeight >= 330, 'Expanded state needs a valid previously measured height');
  assert.equal(native.height, expectedExpandedHeight, 'Expanded native state must restore its measured expanded height');
}
export function resolveFloatExpandedHeight(remembered, areaHeight, mode, native, resizeRequests = [], measuredRequest = null) {
  assert.ok(Number.isFinite(remembered) && remembered >= 330, 'Remembered expanded height must come from a real expanded window');
  const restored = Math.min(remembered, areaHeight - 24);
  if (mode === 'home' && resizeRequests.length) {
    const request = resizeRequests.at(-1);
    assert.ok(Number.isFinite(request) && Number.isFinite(measuredRequest) && Math.abs(request - measuredRequest) <= 1, 'Home height changes need fresh resize IPC matching settled DOM measurement');
    const expected = expectedFloatMeasuredHeight(request, areaHeight);
    assertFloatStateHeight(native, false, expected);
    return expected;
  }
  assertFloatStateHeight(native, false, restored);
  return restored;
}
async function setMini(application, page, mini) {
  const current = await page.locator('.float-app').evaluate(element => element.classList.contains('mini'));
  const before = await settled(application, page);
  if (!current) {
    // Refresh only from a genuine expanded surface, never from an accidentally
    // compact native height paired with an expanded renderer class.
    assertFloatStateHeight(before, false, before.height);
    expandedHeightMemory.set(page, before.height);
  }
  if (current !== mini) {
    const remembered = expandedHeightMemory.get(page);
    if (!mini) await observeFloatResize(application, page);
    try {
      await page.locator('.float-window-actions').getByRole('button', { name: mini ? '收起为卡片' : '展开主界面', exact: true }).click();
      const after = await settled(application, page);
      assert.equal(await page.locator('.float-app').evaluate(element => element.classList.contains('mini')), mini, 'Renderer mini class must match the requested native state');
      if (mini) assertFloatStateHeight(after, true);
      else {
        const area = await workArea(application, page);
        const mode = await page.locator('.float-app').evaluate(element => element.classList.contains('ai-active') ? 'ai' : 'home');
        const requests = await resizeEvents(application);
        const measurement = mode === 'home' && requests.length ? await scheduleMeasurement(application, page) : null;
        const expected = resolveFloatExpandedHeight(remembered, area.height, mode, after, requests, measurement?.dom.requested);
        expandedHeightMemory.set(page, expected);
      }
      return after;
    } finally { if (!mini) await stopObservingFloatResize(application); }
  }
  assert.equal(await page.locator('.float-app').evaluate(element => element.classList.contains('mini')), mini, 'Renderer mini class must match the requested native state');
  assertFloatStateHeight(before, mini, expandedHeightMemory.get(page));
  return before;
}
async function setMode(application, page, mode) {
  const current = await page.locator('.float-app').evaluate(element => element.classList.contains('ai-active'));
  if (current !== (mode === 'ai')) await page.locator('.float-window-actions').getByRole('button', { name: 'AI 助手', exact: true }).click();
  return settled(application, page);
}
async function setWidth(application, page, narrow, report) {
  const before = await settled(application, page);
  const current = await page.locator('.float-app').evaluate(element => element.classList.contains('narrow'));
  if (current !== narrow) await page.getByRole('button', { name: narrow ? '收窄悬浮窗' : '加宽悬浮窗', exact: true }).click();
  await page.waitForFunction(narrow => document.querySelector('.float-app')?.classList.contains('narrow') === narrow, narrow);
  const after = await settled(application, page); const area = await workArea(application, page);
  assertFloatWidthTransition(before, after, narrow ? 330 : 440, area);
  report.floatGroup.measurements.push({ before, after, area, narrow });
  return after;
}
// Read-only hit testing: click only exposed toolbar background, never a control,
// picker surface, or draggable titlebar. No DOM event synthesis or force-click.
export function findFloatOutsidePoint(selector) {
  const toolbar = document.querySelector(selector);
  if (!toolbar) throw new Error(`Missing outside-dismissal toolbar: ${selector}`);
  const box = toolbar.getBoundingClientRect();
  for (const fraction of [0.5, 0.25, 0.75]) {
    const y = box.y + box.height * fraction;
    for (let x = Math.ceil(box.x + 2); x < box.right - 2; x += 2) {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) continue;
      const hit = document.elementFromPoint(x, y);
      // Keep a small hit-tested margin from control/popover edges and DPI rounding.
      if ([[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]].some(([px, py]) => px < 0 || py < 0 || px >= innerWidth || py >= innerHeight || document.elementFromPoint(px, py) !== toolbar)) continue;
      if (hit !== toolbar || hit.closest('.fa-picker-list, .fa-mini-picker, .ai-add-reference, button, input, textarea, select, a, [role="button"], [role="option"], [contenteditable="true"]')) continue;
      let draggable = false;
      for (let node = hit; node; node = node.parentElement) {
        if (getComputedStyle(node).getPropertyValue('-webkit-app-region') === 'drag') { draggable = true; break; }
      }
      if (!draggable) return { x, y, selector, hitClass: hit.className, viewport: { width: innerWidth, height: innerHeight } };
    }
  }
  throw new Error(`No exposed non-interactive outside-dismissal point: ${selector}`);
}
async function capture(screenshot, page, name) { await screenshot(name, page); }
export async function runFloatEmptyPilot({ application, page, check, screenshot, report }) {
  report.floatGroup = { measurements: [], states: [], associations: [] };
  await check('Floating group: real empty home mini retains 176px height', async () => {
    const floatPage = await openFloat(application, page);
    const native = await setMini(application, floatPage, true);
    assert.equal(native.height, 176); assert.equal(native.width, 440);
    await floatPage.getByText('今天还没有安排', { exact: true }).waitFor();
    await capture(screenshot, floatPage, 'float-group-empty.png');
    await floatPage.getByRole('button', { name: '隐藏悬浮待办窗', exact: true }).click();
  });
}
async function configureProvider(page, endpoint) {
  await page.locator('.rail [data-workbench="settings"]').click();
  await page.locator('.tree').getByRole('button', { name: 'AI 助手', exact: true }).click();
  await page.getByRole('button', { name: '添加供应商', exact: true }).first().click();
  const dialog = page.getByRole('dialog', { name: '添加供应商', exact: true });
  await dialog.getByRole('combobox', { name: '供应商类型', exact: true }).click();
  await page.getByRole('option', { name: '自定义', exact: true }).click();
  await dialog.getByRole('textbox', { name: '供应商名称', exact: true }).fill('悬浮窗合成验收');
  await dialog.getByRole('textbox', { name: '服务地址', exact: true }).fill(endpoint);
  await dialog.getByRole('button', { name: '保存供应商', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
  for (let index = 0; index < 5; index++) {
    await page.getByRole('article', { name: '悬浮窗合成验收 配置', exact: true }).getByRole('button', { name: '添加模型', exact: true }).click();
    const model = page.getByRole('dialog').filter({ has: page.locator('#ai-model-name') });
    await model.getByRole('textbox', { name: '模型名称 / ID', exact: true }).fill(`float-synthetic-long-model-name-${index}`);
    await model.getByRole('button', { name: '添加模型', exact: true }).click(); await model.waitFor({ state: 'hidden' });
  }
  await page.locator('.rail [data-workbench="home"]').click();
}
export async function runFloatGroupPilot({ application, page, check, screenshot, report, runId }) {
  report.floatGroup ??= { measurements: [], states: [], associations: [] };
  const requests = [];
  const server = createServer(async (request, response) => {
    let body = ''; for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.writeHead(200, { 'Content-Type': 'text/event-stream' });
    response.write(`data: ${JSON.stringify({ id: 'float-pilot', choices: [{ index: 0, delta: { content: JSON.stringify({ message: '合成关联验收完成。', actions: [] }) }, finish_reason: null }] })}\n\n`);
    response.write(`data: ${JSON.stringify({ id: 'float-pilot', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`);
    response.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let floatPage;
  try {
    await check('Floating group: normal UI creates long-title fixture and loopback-only models', async () => {
      await configureProvider(page, `http://127.0.0.1:${server.address().port}/v1`);
      await page.locator('#view-home').getByRole('button', { name: '新增', exact: true }).click();
      const editor = page.getByRole('dialog', { name: '新增事项', exact: true });
      await editor.getByRole('textbox', { name: '待办名称', exact: true }).fill(`CI floating ${runId} ${'长标题关联与窄屏验收'.repeat(10)}`);
      await editor.getByRole('button', { name: '创建', exact: true }).click(); await editor.waitFor({ state: 'hidden' });
      floatPage = await openFloat(application, page);
      floatPage.on('pageerror', error => report.errors.push(`float: ${error.message}`));
    });
    for (const reducedMotion of ['no-preference', 'reduce']) {
      await floatPage.emulateMedia({ reducedMotion });
      for (const entry of FLOAT_GROUP_MATRIX) await check(`Floating group: ${entry.mode}/${entry.mini ? 'mini' : 'expanded'}/${entry.narrow ? 'narrow' : 'wide'} ${reducedMotion}`, async () => {
        await setMode(application, floatPage, entry.mode);
        const restored = await setMini(application, floatPage, entry.mini);
        const expectedExpandedHeight = expandedHeightMemory.get(floatPage);
        assertFloatStateHeight(restored, entry.mini, expectedExpandedHeight);
        const intermediate = await setWidth(application, floatPage, !entry.narrow, report);
        assertFloatStateHeight(intermediate, entry.mini, expectedExpandedHeight);
        const native = await setWidth(application, floatPage, entry.narrow, report);
        assertFloatStateHeight(native, entry.mini, expectedExpandedHeight);
        assert.deepEqual(await floatPage.locator('.float-app').evaluate(element => ({ mini: element.classList.contains('mini'), narrow: element.classList.contains('narrow'), mode: element.classList.contains('ai-active') ? 'ai' : 'home' })), entry, 'Renderer classes must match the complete requested matrix state');
        const geometry = await floatPage.evaluate(() => ({ viewport: { width: innerWidth, height: innerHeight }, scrollWidth: document.documentElement.scrollWidth }));
        assert.equal(geometry.viewport.height, native.height, 'Renderer and native state heights must agree');
        assert.ok(geometry.scrollWidth <= geometry.viewport.width, 'Floating content must not overflow horizontally');
        assert.equal(await floatPage.locator('.float-insight').count(), 0);
        if (entry.mode === 'ai') {
          assert.equal(await floatPage.locator('.fa-mini-answer-toggle').count(), 0);
          assert.equal((await floatPage.locator('.ai-add-reference').innerText()).trim(), '关联事项');
          if (entry.mini) {
            assert.equal((await floatPage.locator('.fa-mini-back').innerText()).trim(), '返回');
            await compactGeometry(application, floatPage, report);
          }
          else {
            await floatPage.getByRole('button', { name: '返回首页', exact: true }).waitFor();
            if (entry.narrow) await expandedToolbarGeometry(application, floatPage, report);
          }
        }
        report.floatGroup.states.push({ ...entry, reducedMotion, native, geometry, expectedExpandedHeight, expectedHeight: entry.mini ? 176 : expectedExpandedHeight });
        if (reducedMotion === 'no-preference') await capture(screenshot, floatPage, `float-group-${entry.mode}-${entry.mini ? 'mini' : 'expanded'}-${entry.narrow ? 'narrow' : 'wide'}.png`);
      });
    }
    await check('Floating group: native work-area edge clamp preserves height after repeated width changes', async () => {
      const window = await application.browserWindow(floatPage); const area = await workArea(application, floatPage); const native = await bounds(application, floatPage);
      report.floatGroup.edgePosition = await withFloatPositionRestored(window, async () => {
        await window.evaluate((win, next) => win.setPosition(next.x, next.y), { x: area.x + area.width - native.width, y: area.y + area.height - native.height });
        for (let index = 0; index < 3; index++) { await setWidth(application, floatPage, false, report); await setWidth(application, floatPage, true, report); }
        const beforePoll = await bounds(application, floatPage);
        await floatPage.waitForTimeout(5500); // Cross the real five-second unchanged-data refresh as well as observers.
        const afterPoll = await settled(application, floatPage);
        assertFloatWidthTransition(beforePoll, afterPoll, 330, await workArea(application, floatPage));
        report.floatGroup.measurements.push({ beforePoll, afterPoll, unchangedPoll: true });
      });
      await settled(application, floatPage);
      assert.equal(report.floatGroup.edgePosition.restored.x, native.x);
      assert.equal(report.floatGroup.edgePosition.restored.y, native.y);
      assert.equal(report.floatGroup.edgePosition.restored.width, native.width, 'Position restoration must not change width');
      assert.equal(report.floatGroup.edgePosition.restored.height, native.height, 'Position restoration must not change height');
    });
    await check('Floating group: narrow schedule child changes remeasure after width switch and AI/home roundtrip', async () => {
      await setMode(application, floatPage, 'home'); await setMini(application, floatPage, false);
      await setWidth(application, floatPage, false, report); await setWidth(application, floatPage, true, report);
      await observeFloatResize(application, floatPage);
      try {
        for (const roundtrip of [false, true]) {
          if (roundtrip) {
            await setMode(application, floatPage, 'ai'); await setMode(application, floatPage, 'home');
            await setWidth(application, floatPage, false, report); await setWidth(application, floatPage, true, report);
          }
          const tabs = floatPage.locator('.plan-schedule .plan-folder-tab');
          const ids = await tabs.evaluateAll(elements => elements.map(element => element.getAttribute('aria-controls')));
          assert.ok(ids.length > 0, 'Existing UI-created schedule fixture must produce a today/tomorrow folder');
          for (const id of ids) {
            const tab = floatPage.locator(`.plan-schedule .plan-folder-tab[aria-controls="${id}"]`);
            for (const expanded of [true, false]) {
              assert.equal(await tab.getAttribute('aria-expanded'), String(!expanded));
              await setWidth(application, floatPage, false, report); await setWidth(application, floatPage, true, report);
              const before = await scheduleMeasurement(application, floatPage);
              const eventCount = (await resizeEvents(application)).length;
              await tab.scrollIntoViewIfNeeded();
              await recordFolderHit(application, floatPage, tab, report, 'before-click');
              try { await tab.click(); }
              catch (error) { await recordFolderHit(application, floatPage, tab, report, 'click-failed').catch(diagnosticError => report.errors.push(`Folder diagnostics: ${String(diagnosticError)}`)); throw error; }
              await floatPage.waitForFunction(({ id, expanded }) => document.querySelector(`[aria-controls="${id}"]`)?.getAttribute('aria-expanded') === String(expanded), { id, expanded });
              await settled(application, floatPage);
              const events = (await resizeEvents(application)).slice(eventCount);
              assert.ok(events.length > 0, 'Real folder content change must emit native float:resize even when height is clamped');
              const after = await scheduleMeasurement(application, floatPage);
              assert.equal(after.native.width, 330);
              assert.equal(after.native.height, expectedFloatMeasuredHeight(events.at(-1), after.area.height), 'Native height must match the actual emitted measurement and display clamp');
              assert.ok(Math.abs(events.at(-1) - after.dom.requested) <= 1, 'Latest renderer measurement must agree with actual settled board geometry');
              const groups = floatPage.locator('.plan-schedule-groups');
              const overflow = await groups.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
              assert.ok(overflow.scrollWidth <= overflow.clientWidth + 1, 'Narrow schedule must fit horizontally');
              if (expanded) {
                const rows = floatPage.locator(`#${id} .plan-item`); assert.ok(await rows.count() > 0);
                for (let index = 0; index < await rows.count(); index++) {
                  await rows.nth(index).scrollIntoViewIfNeeded();
                  assertFloatRectInside(await rows.nth(index).boundingBox(), after.dom.viewport, 'Visible schedule row');
                }
              } else assert.equal(await floatPage.locator(`#${id}`).count(), 0);
              (report.floatGroup.childMeasurements ??= []).push({ roundtrip, id, expanded, before, after, events, overflow });
            }
          }
        }
      } finally { await stopObservingFloatResize(application); }
    });
    await check('Floating group: narrow home keeps title tooltip, deadline, pagination and completion cancellation', async () => {
      await setMode(application, floatPage, 'home'); await setMini(application, floatPage, true);
      const title = floatPage.locator('.float-mini-task-title'); const first = await title.innerText();
      assert.equal(await title.getAttribute('title'), `展开编辑：${first}`);
      await floatPage.locator('.float-mini-time').waitFor({ state: 'visible' });
      await floatPage.getByRole('button', { name: '下一项', exact: true }).click();
      assert.notEqual(await title.innerText(), first);
      await floatPage.getByRole('button', { name: '上一项', exact: true }).click();
      assert.equal(await title.innerText(), first);
      const snapshot = await page.evaluate(() => window.workbench.todo.state());
      const completion = floatPage.locator('.float-mini-check');
      if (await completion.count()) {
        await completion.click(); await floatPage.getByRole('button', { name: '取消', exact: true }).click();
        assert.deepEqual(await page.evaluate(() => window.workbench.todo.state()), snapshot);
      }
    });
    for (const mini of [true, false]) await check(`Floating group: ${mini ? 'mini' : 'expanded'} real pointer association, replace, remove, keyboard and outside dismissal`, async () => {
      await setMini(application, floatPage, mini); await setMode(application, floatPage, 'ai');
      const model = floatPage.locator(mini ? '.fa-model-toggle' : '.ai-model-select');
      const before = await model.boundingBox(); assert.ok(before);
      const compactBefore = mini ? await compactGeometry(application, floatPage, report) : null;
      const inspectCompact = async () => {
        if (mini) await compactGeometry(application, floatPage, report, compactBefore);
        else await expandedToolbarGeometry(application, floatPage, report);
      };
      if (!mini) await expandedToolbarGeometry(application, floatPage, report);
      const initialCalls = requests.length;
      const picker = floatPage.getByRole('listbox', { name: '选择事项', exact: true });
      const open = async () => { await floatPage.locator('.ai-add-reference').click(); await picker.waitFor(); await pickerGeometry(floatPage, report); };
      await open();
      const options = picker.getByRole('option'); assert.ok(await options.count() >= 2);
      const tasks = (await page.evaluate(() => window.workbench.todo.state())).tasks.filter(task => !task.deletedAt);
      assert.equal(await options.count(), tasks.length, 'Picker must not silently truncate available tasks');
      const now = Date.now();
      for (const task of tasks) {
        const row = options.filter({ hasText: task.title });
        const deadline = task.kind === 'meeting' ? task.endAt || (task.dueAt ? new Date(Date.parse(task.dueAt) + 3600000).toISOString() : null) : task.dueAt;
        const overdue = (deadline ? Date.parse(deadline) : new Date(`${task.plannedDate}T23:59:59`).getTime()) < now;
        const status = task.status === 'done' ? '已完成' : overdue ? '已超期' : task.status === 'doing' ? '进行中' : '待办';
        assert.ok((await row.locator('.fa-task-status').innerText()).includes(status), `Business status must be independent of selection: ${task.title}`);
        assert.equal(await row.getAttribute('title'), task.title, 'Picker must expose full title tooltip');
      }
      const statusBeforeSelection = await options.locator('.fa-task-status').allTextContents();
      const first = await options.nth(0).getAttribute('title'); assert.ok(first);
      await options.nth(0).click(); // Playwright dispatches physical pointerdown/up/click, never HTMLElement.click().
      await picker.waitFor({ state: 'hidden' });
      const chip = floatPage.locator(mini ? '.fa-mini-compose .ai-reference-chip' : '.fa-linked-row .ai-reference-chip'); await chip.waitFor();
      assert.ok((await chip.innerText()).includes(first));
      assert.equal(await chip.locator('span[title]').getAttribute('title'), first);
      assertFloatModelGeometry(before, await model.boundingBox());
      await inspectCompact();
      await open();
      if (mini) {
        assert.deepEqual(await options.locator('.fa-task-status').allTextContents(), statusBeforeSelection, 'Association selection must not replace business status');
        for (let index = 0; index < await options.count(); index++) {
          const row = options.nth(index);
          assert.equal(await row.getAttribute('aria-selected'), String(index === 0));
          assert.equal(await row.locator('[aria-label="当前选择"]').count(), index === 0 ? 1 : 0, 'Independent selection check must match aria-selected');
          assert.equal(await row.locator('.fa-task-status [aria-label="当前选择"]').count(), 0, 'Selection check must not masquerade as business status');
        }
        await options.nth(0).scrollIntoViewIfNeeded();
        await capture(screenshot, floatPage, 'float-group-picker.png');
      }
      await options.nth(1).click(); await picker.waitFor({ state: 'hidden' });
      assertFloatModelGeometry(before, await model.boundingBox());
      await inspectCompact();
      await chip.getByRole('button').click(); await chip.waitFor({ state: 'hidden' });
      assertFloatModelGeometry(before, await model.boundingBox());
      await inspectCompact();
      await open(); await floatPage.keyboard.press('Escape'); await picker.waitFor({ state: 'hidden' });
      await open(); await options.nth(0).click(); await picker.waitFor({ state: 'hidden' });
      await chip.waitFor();
      await open();
      const linkedBeforeOutside = await chip.allTextContents();
      const selectedBeforeOutside = await options.evaluateAll(elements => elements.filter(element => element.getAttribute('aria-selected') === 'true').map(element => element.getAttribute('title')));
      assert.deepEqual(selectedBeforeOutside, [first], 'Outside dismissal must retain a real existing selection');
      const modelBeforeOutside = await model.innerText(); const callsBeforeOutside = requests.length;
      const outsidePoint = await floatPage.evaluate(findFloatOutsidePoint, mini ? '.fa-mini-quick' : '.fa-surface .ai-compose-toolbar');
      await floatPage.mouse.click(outsidePoint.x, outsidePoint.y);
      await picker.waitFor({ state: 'hidden' });
      assert.deepEqual(await chip.allTextContents(), linkedBeforeOutside, 'Outside pointer must not change association');
      assert.equal(await model.innerText(), modelBeforeOutside, 'Outside pointer must not change selected model');
      assert.equal(requests.length, callsBeforeOutside, 'Outside pointer must not send a model request');
      (report.floatGroup.outsideDismissals ??= []).push({ mini, ...outsidePoint, selectedBeforeOutside, requestCount: requests.length });
      await open();
      assert.deepEqual(await options.evaluateAll(elements => elements.filter(element => element.getAttribute('aria-selected') === 'true').map(element => element.getAttribute('title'))), selectedBeforeOutside, 'Dismiss/reopen must preserve picker selection');
      await options.nth(0).focus(); await floatPage.keyboard.press('Enter'); await picker.waitFor({ state: 'hidden' });
      assertFloatModelGeometry(before, await model.boundingBox());
      await inspectCompact();
      assert.equal(requests.length, initialCalls, 'Association alone must never call a model');
      assert.equal((await floatPage.locator('.ai-add-reference').innerText()).trim(), '关联事项');
      report.floatGroup.associations.push({ mini, modelBefore: before, modelAfter: await model.boundingBox(), requestCount: requests.length });
      if (mini) {
        await capture(screenshot, floatPage, 'float-group-linked.png');
        await model.click(); const menu = floatPage.getByRole('menu', { name: '按供应商选择模型', exact: true }); await menu.waitFor();
        const menuBox = await menu.boundingBox(); const viewport = await floatPage.evaluate(() => ({ width: innerWidth, height: innerHeight }));
        assertFloatMenuGeometry(menuBox, await model.boundingBox(), viewport);
        const scroll = await menu.evaluate(element => ({ scrollHeight: element.scrollHeight, clientHeight: element.clientHeight, overflow: getComputedStyle(element).overflowY }));
        assert.ok(scroll.scrollHeight > scroll.clientHeight && ['auto', 'scroll'].includes(scroll.overflow), 'Many models must scroll within the compact viewport');
        await capture(screenshot, floatPage, 'float-group-models.png');
        await floatPage.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
        assert.equal(await model.evaluate(element => element === document.activeElement), true, 'Escape must restore model-trigger focus');
      }
      if (!mini) {
        const selectedModelBefore = await floatPage.evaluate(() => window.workbench.ai.config().then(config => config.activeModelId));
        const linkedBeforeModel = await chip.allTextContents();
        const trigger = floatPage.getByRole('combobox', { name: '选择大模型', exact: true });
        await trigger.click();
        const menu = floatPage.getByRole('listbox', { name: '选择大模型', exact: true }); await menu.waitFor();
        const selectedOption = menu.getByRole('option', { selected: true });
        const fullModelName = await floatPage.evaluate(() => window.workbench.ai.config().then(config => config.models.find(model => model.id === config.activeModelId)?.name));
        assert.equal(await selectedOption.textContent(), fullModelName, 'Expanded model picker must expose the complete selected name');
        await floatPage.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
        assert.equal(await floatPage.evaluate(() => window.workbench.ai.config().then(config => config.activeModelId)), selectedModelBefore, 'Opening/dismissing expanded model picker must preserve model');
        assert.deepEqual(await chip.allTextContents(), linkedBeforeModel, 'Model dismissal must preserve association');
        assert.equal(requests.length, initialCalls, 'Model dismissal must not submit a request');
        await expandedToolbarGeometry(application, floatPage, report);
      }
      await chip.getByRole('button').click();
    });
    for (const [theme, label] of [['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾']]) await check(`Floating group: ${theme} narrow compact theme`, async () => {
      await page.locator('.rail [data-workbench="settings"]').click();
      await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click();
      await page.getByRole('radio', { name: label, exact: true }).click();
      await floatPage.bringToFront();
      await floatPage.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
      await setMini(application, floatPage, true);
      assert.equal((await settled(application, floatPage)).height, 176);
      await compactGeometry(application, floatPage, report);
      await capture(screenshot, floatPage, `float-group-${theme}.png`);
    });
    await check('Floating group: explicit send uses the exact selected task, no task writes', async () => {
      await setMini(application, floatPage, true);
      await floatPage.locator('.fa-model-toggle').click();
      await floatPage.getByRole('menuitemradio').filter({ has: floatPage.getByText('float-synthetic-long-model-name-0', { exact: true }) }).click();
      await floatPage.waitForFunction(async () => {
        const config = await window.workbench.ai.config();
        return config.models.find(model => model.id === config.activeModelId)?.name === 'float-synthetic-long-model-name-0';
      });
      await floatPage.getByRole('button', { name: '切换模型,当前为 float-synthetic-long-model-name-0', exact: true }).waitFor();
      await floatPage.getByRole('menu', { name: '按供应商选择模型', exact: true }).waitFor({ state: 'hidden' });
      await floatPage.locator('.ai-add-reference').click();
      await pickerGeometry(floatPage, report);
      const option = floatPage.getByRole('listbox', { name: '选择事项', exact: true }).getByRole('option').filter({ hasText: `CI floating ${runId}` });
      const title = await option.getAttribute('title'); assert.ok(title); await option.click();
      const before = await page.evaluate(() => window.workbench.todo.state());
      await floatPage.getByRole('textbox', { name: 'AI 对话输入', exact: true }).fill('仅验证关联，不修改事项');
      await floatPage.getByRole('button', { name: '发送', exact: true }).click();
      const start = Date.now(); while (!requests.length && Date.now() - start < 15000) await floatPage.waitForTimeout(100);
      const expectedText = `关于事项「${title}」:仅验证关联，不修改事项`;
      // Only this synthetic loopback fixture's model/user text goes into evidence.
      // Never record headers, credentials, system context, or arbitrary request bodies.
      const userMessages = Array.isArray(requests[0]?.messages) ? requests[0].messages.filter(message => message.role === 'user') : [];
      report.floatGroup.wirePrompt = { requestCount: requests.length, model: requests[0]?.model, expectedText,
        userMessages: userMessages.map(message => {
          const contentType = Array.isArray(message.content) ? 'array' : typeof message.content;
          const partTypes = Array.isArray(message.content) ? message.content.map(part => typeof part?.type === 'string' ? part.type : typeof part) : undefined;
          try { return { contentType, partTypes, actualText: floatWireText(message.content) }; }
          catch (error) { return { contentType, partTypes, invalidContent: String(error) }; }
        }) };
      assert.equal(requests.length, 1);
      assert.equal(requests[0].model, 'float-synthetic-long-model-name-0', 'Explicit send must use the settled selected model');
      assert.ok(userMessages.length > 0, 'Wire request must contain a user turn');
      assert.equal(floatWireText(userMessages.at(-1).content), expectedText, 'Latest wire user prompt must exactly equal linked title and explicit user text');
      await floatPage.locator('.ai-add-reference').waitFor({ state: 'visible' });
      assert.deepEqual(await page.evaluate(() => window.workbench.todo.state()), before);
    });
    await check('Floating group: hide/show retains narrow width on the same native window', async () => {
      await setWidth(application, floatPage, true, report);
      const window = await application.browserWindow(floatPage); const id = await window.evaluate(win => win.id);
      await floatPage.getByRole('button', { name: '隐藏悬浮待办窗', exact: true }).click();
      assert.equal(await window.evaluate(win => win.isVisible()), false);
      const shown = await openFloat(application, page);
      assert.equal(await (await application.browserWindow(shown)).evaluate(win => win.id), id);
      assert.equal((await settled(application, shown)).width, 330);
      await shown.getByRole('button', { name: '隐藏悬浮待办窗', exact: true }).click();
    });
    return { widthBeforeExit: 330 };
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}
export async function verifyFloatGroupRelaunch({ application, page, check, screenshot, fixture }) {
  await check('Floating group: full same-installed-executable restart resets session-only width to 440', async () => {
    assert.equal(fixture.widthBeforeExit, 330);
    const floatPage = await openFloat(application, page);
    assert.equal((await settled(application, floatPage)).width, 440);
    assert.equal(await floatPage.locator('.float-app').evaluate(element => element.classList.contains('narrow')), false);
    await capture(screenshot, floatPage, 'float-group-relaunched.png');
    await floatPage.getByRole('button', { name: '隐藏悬浮待办窗', exact: true }).click();
  });
}
