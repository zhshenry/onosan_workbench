// Installed Windows UI acceptance; synthetic blogs and local association only.
// Never opens the creator site, publishes a note, or deletes an online work.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { bounded } from './pilot-cleanup.mjs';

export const PUBLISH_ASSOCIATION_SCREENSHOTS = Object.freeze([
  'publish-association-unlinked.png', 'publish-association-pending.png',
  'publish-association-linked.png', 'publish-association-error.png',
]);
export const PUBLISH_ASSOCIATION_MATRIX = Object.freeze(['mist', 'cool', 'warm'].flatMap(theme =>
  [[1280, 820], [1024, 680]].flatMap(([width, height]) => ['no-preference', 'reduce'].map(reducedMotion =>
    Object.freeze({ theme, width, height, reducedMotion })))));
const MARK = 'copy:markXhsPublished';
const CLEAR = 'copy:clearXhsPublished';
const state = page => page.evaluate(() => window.workbench.copy.list());

// Playwright's browser poller treats an IPC Promise as truthy before resolution.
// Await actual business reads in the host, with one deadline for reads and retries.
export async function waitForPublishCopyState(page, ready, message) {
  const deadline = Date.now() + 5000;
  for (;;) {
    const remaining = deadline - Date.now();
    assert.ok(remaining > 0, message);
    const data = await bounded(() => state(page), remaining, message);
    const matched = ready(data);
    assert.equal(typeof matched, 'boolean', 'Copy readiness must be a synchronous boolean');
    if (matched) return data;
    await new Promise(resolve => setTimeout(resolve, Math.min(50, Math.max(1, deadline - Date.now()))));
  }
}
const section = page => page.getByRole('region', { name: '发布后关联', exact: true });
const input = page => section(page).getByRole('textbox', { name: '小红书已发布作品直链', exact: true });
const button = (page, name) => section(page).getByRole('button', { name, exact: true });
const status = (page, text) => section(page).locator('.pub-association-state').filter({ hasText: text });

export function assertPublishAssociationRecord(actual, original, expectedAssociation) {
  assert.ok(actual && original, 'Exact UI-created blog identity must exist');
  const { xhsPublished: _actual, ...actualBlog } = actual;
  const { xhsPublished: _original, ...originalBlog } = original;
  assert.deepEqual(actualBlog, originalBlog, 'Association must preserve every blog field, including id, createdAt, updatedAt, title and body');
  if (expectedAssociation === undefined) {
    assert.equal(Object.hasOwn(actual, 'xhsPublished'), false, 'Cleared/unlinked association must be absent');
    return;
  }
  assert.deepEqual(actual.xhsPublished, expectedAssociation, 'Exact status, source, URL, remote ID and confirmation time must match');
  assert.deepEqual(Object.keys(actual.xhsPublished).sort(), ['confirmedAt', 'remoteId', 'source', 'status', 'url']);
  assert.equal(actual.xhsPublished.status, 'published');
  assert.equal(actual.xhsPublished.source, 'manual');
  assert.ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(actual.xhsPublished.confirmedAt)
    && Number.isFinite(Date.parse(actual.xhsPublished.confirmedAt)), 'Real ISO confirmation time is required');
}

/** Keep earlier pilots' blogs exact, and allow only this pilot's captured new IDs. */
export function assertPublishAssociationInventory(actual, existing, ownedIds, expectedSnapshot) {
  const ids = (data, label) => {
    assert.ok(Array.isArray(data?.drafts), `${label}: actual blog records are required`);
    const values = data.drafts.map(draft => {
      assert.ok(typeof draft?.id === 'string' && draft.id.trim(), `${label}: nonempty blog IDs are required`);
      return draft.id;
    });
    assert.equal(new Set(values).size, values.length, `${label}: duplicate blog IDs are forbidden`);
    return values;
  };
  const existingIds = ids(existing, 'Earlier pilot');
  const actualIds = ids(actual, 'Association pilot');
  assert.ok(Array.isArray(ownedIds) && ownedIds.every(id => typeof id === 'string' && id.trim()), 'Captured owned blog IDs are required');
  const expectedIds = [...existingIds, ...ownedIds];
  assert.equal(new Set(expectedIds).size, expectedIds.length, 'Owned IDs must be unique and separate from earlier blogs');
  assert.deepEqual([...actualIds].sort(), [...expectedIds].sort(), 'Only the exact earlier and UI-created owned blogs may exist');
  const earlier = new Set(existingIds);
  assert.deepEqual(actual.drafts.filter(draft => earlier.has(draft.id)), existing.drafts,
    'Every earlier blog field and its relative order must remain unchanged');
  if (expectedSnapshot !== undefined) assert.deepEqual(actual, expectedSnapshot, 'The complete persisted blog snapshot must remain exact');
  return ownedIds.map(id => actual.drafts.find(draft => draft.id === id));
}

export function assertPublishAssociationGeometry(value) {
  const finiteRect = (rect, label) => {
    for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(rect?.[key]), `${label}: finite real bounds required`);
    assert.ok(rect.width > 0 && rect.height > 0, `${label}: nonempty real bounds required`);
  };
  finiteRect(value.viewport, 'Viewport'); finiteRect(value.section, 'Association section');
  assert.ok(value.section.x >= value.viewport.x - 1 && value.section.x + value.section.width <= value.viewport.x + value.viewport.width + 1, 'Association section must fit horizontally');
  assert.ok(Number.isFinite(value.clientWidth) && value.clientWidth > 0 && Number.isFinite(value.scrollWidth)
    && value.scrollWidth <= value.clientWidth, 'Association section must not overflow horizontally');
  assert.ok(value.fields.length > 0, 'Actual readable association fields and controls are required');
  for (const field of value.fields) {
    finiteRect(field.bounds, field.label);
    assert.ok(field.bounds.x >= value.viewport.x - 1 && field.bounds.y >= value.viewport.y - 1
      && field.bounds.x + field.bounds.width <= value.viewport.x + value.viewport.width + 1
      && field.bounds.y + field.bounds.height <= value.viewport.y + value.viewport.height + 1, `${field.label}: outside visible viewport after normal scrolling`);
    assert.equal(field.complete, true, `${field.label}: complete text must be readable`);
    if (field.control) assert.equal(field.hit, true, `${field.label}: real pointer hit target required`);
  }
}

const FRAME_FIELDS = Object.freeze({
  '尚未关联作品': ['heading', 'state', 'blog', 'input', 'format-check'],
  '待确认': ['heading', 'state', 'blog', 'input', 'format-check', 'target', 'confirm', 'cancel'],
  '已关联 · 手动确认': ['heading', 'state', 'record', 'copy', 'change', 'remove'],
  '链接格式不正确': ['heading', 'state', 'blog', 'input', 'format-check', 'error'],
});
export function assertPublishAssociationFrame(value, expectedState) {
  assert.ok(Object.hasOwn(FRAME_FIELDS, expectedState), 'Unknown association screenshot state');
  assert.equal(value.state, expectedState, 'Screenshot must show its exact expected state');
  assert.equal(value.toastHidden, true, 'Screenshot must wait for the copy/status toast to disappear');
  assertPublishAssociationGeometry(value);
  const inside = (rect, area) => rect.x >= area.x - 1 && rect.y >= area.y - 1
    && rect.x + rect.width <= area.x + area.width + 1 && rect.y + rect.height <= area.y + area.height + 1;
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(value.clip?.[key]), 'Real scroll-panel clipping bounds required');
  assert.ok(value.clip.width > 0 && value.clip.height > 0 && inside(value.clip, value.viewport), 'Visible scroll-panel area required');
  assert.ok(inside(value.section, value.clip), 'The entire association section must fit in this one screenshot frame');
  for (const kind of FRAME_FIELDS[expectedState]) assert.equal(value.fields.filter(field => field.kind === kind).length, 1, `Screenshot requires exactly one ${kind}`);
  for (const field of value.fields) {
    assert.ok(inside(field.bounds, value.clip), `${field.kind}: clipped by the actual scroll panel`);
    assert.equal(field.hit, true, `${field.kind}: screenshot field is obscured`);
    assert.equal(field.textHit, true, `${field.kind}: screenshot text is obscured`);
    if (field.control) assert.equal(field.controlHit, true, `${field.kind}: screenshot control is obscured`);
  }
}

async function captureAssociationFrame({ application, page, screenshot, report, name, expectedState }) {
  assert.ok(PUBLISH_ASSOCIATION_SCREENSHOTS.includes(name), 'Only the four existing screenshots may be captured');
  // This already-tested native size gives the pending target and both actions
  // enough room together. Resize/scroll the real UI; never crop or alter a PNG.
  const native = await application.browserWindow(page);
  await native.evaluate(win => { win.webContents.setZoomFactor(1); win.setContentSize(1280, 820); });
  assert.deepEqual(await native.evaluate(win => win.getContentSize()), [1280, 820]);
  await page.waitForFunction(() => innerWidth === 1280 && innerHeight === 820);
  await waitStatus(page, expectedState);
  await section(page).evaluate(element => element.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' }));
  // Pinned Playwright polls predicate() synchronously: a Promise is truthy even
  // when it later resolves false. Await fonts separately, then poll booleans.
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(() => {
    const toast = document.querySelector('.toast');
    if (toast && (toast.getAttribute('data-show') === '1' || Number(getComputedStyle(toast).opacity) !== 0)) return false;
    return !document.getAnimations().some(animation => animation.effect?.getComputedTiming().iterations !== Infinity
      && animation.effect?.target instanceof Element && animation.effect.target.closest('.copy-editor, .toast')
      && (animation.pending || animation.playState === 'running'));
  });
  // Unlike the interaction matrix, all rectangles below are read simultaneously
  // after the final scroll, with no per-field scroll that could hide an action.
  const frame = await section(page).evaluate(element => {
    const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
    const panel = element.closest('.copy-editor'); const panelBounds = panel.getBoundingClientRect();
    const left = Math.max(0, panelBounds.left + panel.clientLeft); const top = Math.max(0, panelBounds.top + panel.clientTop);
    const right = Math.min(innerWidth, panelBounds.left + panel.clientLeft + panel.clientWidth);
    const bottom = Math.min(innerHeight, panelBounds.top + panel.clientTop + panel.clientHeight);
    const toast = document.querySelector('.toast');
    const toastStyle = toast ? getComputedStyle(toast) : null;
    const fields = [];
    const add = (kind, node) => {
      if (!node) return;
      const box = node.getBoundingClientRect(); const ranges = []; const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) if (walker.currentNode.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        for (const bounds of range.getClientRects()) ranges.push({ bounds, owner: walker.currentNode.parentElement });
      }
      const visibleAt = (owner, x, y) => { const target = document.elementFromPoint(x, y); return target === owner || owner.contains(target); };
      const textHit = ranges.every(({ bounds, owner }) => {
        const left = bounds.left + Math.min(1, bounds.width / 2); const right = bounds.right - Math.min(1, bounds.width / 2);
        const points = [left, right]; for (let x = left + 8; x < right; x += 8) points.push(x);
        return points.every(x => [0.2, 0.5, 0.8].every(fraction => visibleAt(owner, x, bounds.top + bounds.height * fraction)));
      });
      const control = node.matches('button, input');
      const controlHit = !control || [0.1, 0.5, 0.9].every(x => [0.2, 0.5, 0.8].every(y => visibleAt(node, box.left + box.width * x, box.top + box.height * y)));
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      fields.push({ kind, label: kind, bounds: rect(node), control,
        complete: node.matches('input') || (ranges.length > 0 && ranges.every(({ bounds }) => bounds.left >= box.left - 1 && bounds.right <= box.right + 1 && bounds.top >= box.top - 1 && bounds.bottom <= box.bottom + 1)),
        hit: hit === node || node.contains(hit), textHit, controlHit });
    };
    for (const [kind, selector] of [['heading', 'h2'], ['state', '.pub-association-state'], ['blog', '.pub-association-form > .pub-tip'],
      ['input', 'input'], ['target', '.pub-linked-preview'], ['record', '.pub-linked-record'], ['error', '[role="alert"]']]) add(kind, element.querySelector(selector));
    const labels = { '检查链接格式': 'format-check', '确认关联': 'confirm', '取消': 'cancel', '复制作品链接': 'copy', '更换关联': 'change', '移除关联': 'remove' };
    for (const button of element.querySelectorAll('button')) if (labels[button.textContent.trim()]) add(labels[button.textContent.trim()], button);
    return { viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, section: rect(element), clip: { x: left, y: top, width: right - left, height: bottom - top },
      clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, fields, state: element.querySelector('.pub-association-state')?.textContent.trim(),
      toastHidden: !toast || (toast.getAttribute('data-show') !== '1' && Number(toastStyle.opacity) === 0),
      toastVisibility: toast ? { show: toast.getAttribute('data-show'), opacity: toastStyle.opacity, display: toastStyle.display, visibility: toastStyle.visibility, bounds: rect(toast) } : null };
  });
  // Keep the real diagnostic frame even if its strict assertion rejects it;
  // a failed frame never reaches the screenshot callback.
  (report.publishAssociation.screenshotFrames ??= []).push({ name, ...frame });
  assertPublishAssociationFrame(frame, expectedState);
  await screenshot(name);
}

// Bounded main-frame-only fault/delay fixture. It controls only the two existing
// association handlers and forwards successful calls to those exact originals.
// Real persistence acceptance runs separately, after exact restoration.
export async function installPublishWriteFixture(application, webContentsId) {
  return application.evaluate(({ ipcMain }, id) => {
    if (globalThis.__publishAssociationPilot) throw new Error('Association fixture already installed');
    const handlers = ipcMain._invokeHandlers;
    if (!(handlers instanceof Map) || typeof ipcMain.removeHandler !== 'function' || typeof ipcMain.handle !== 'function') throw new Error('Pinned Electron handler inspection unavailable');
    const channels = ['copy:markXhsPublished', 'copy:clearXhsPublished'];
    const originals = channels.map(channel => handlers.get(channel));
    if (!originals.every(handler => typeof handler === 'function')) throw new Error('Both real association handlers are required');
    if (!Number.isSafeInteger(id) || id <= 0) throw new Error('Actual main webContents identity required');
    const session = { id, channels, originals, wrappers: [], calls: [], pending: [], mode: { channel: null, behavior: 'observe' } };
    session.wrappers = channels.map((channel, index) => async (event, ...args) => {
      if (event.sender.id !== session.id || event.senderFrame !== event.sender.mainFrame) return session.originals[index](event, ...args);
      const call = { channel, args, behavior: session.mode.channel === channel ? session.mode.behavior : 'observe' };
      session.calls.push(call);
      if (call.behavior === 'fail') throw new Error('Synthetic association write failure (fixture only)');
      if (call.behavior === 'hold') {
        await new Promise((resolve, reject) => {
          const pending = { resolve, reject, timer: null };
          const finish = action => { clearTimeout(pending.timer); session.pending = session.pending.filter(value => value !== pending); action(); };
          pending.resolve = () => finish(resolve);
          pending.reject = () => finish(() => reject(new Error('Synthetic association delay cancelled (fixture only)')));
          pending.timer = setTimeout(() => finish(() => reject(new Error('Synthetic association delay exceeded 10000ms (fixture only)'))), 10000);
          session.pending.push(pending);
        });
      }
      return session.originals[index](event, ...args);
    });
    globalThis.__publishAssociationPilot = session;
    try {
      for (let index = 0; index < channels.length; index++) {
        ipcMain.removeHandler(channels[index]); ipcMain.handle(channels[index], session.wrappers[index]);
      }
    } catch (error) {
      // Roll back only known originals/our wrappers/missing handlers if a
      // registration fails midway. Never overwrite an unexpected new handler.
      for (let index = 0; index < channels.length; index++) {
        const current = handlers.get(channels[index]);
        if (current && current !== originals[index] && current !== session.wrappers[index]) throw new Error('Association fixture install drift; rollback blocked');
      }
      for (let index = 0; index < channels.length; index++) {
        if (handlers.get(channels[index]) === originals[index]) continue;
        ipcMain.removeHandler(channels[index]); ipcMain.handle(channels[index], originals[index]);
        if (handlers.get(channels[index]) !== originals[index]) throw new Error('Exact association install rollback failed');
      }
      delete globalThis.__publishAssociationPilot;
      throw error;
    }
    return { channels, webContentsId: id };
  }, webContentsId);
}

export async function configurePublishWriteFixture(application, channel, behavior) {
  assert.ok([MARK, CLEAR].includes(channel), 'Fixture may control only association writes');
  assert.ok(['observe', 'fail', 'hold'].includes(behavior), 'Unknown association fixture behavior');
  return application.evaluate((_runtime, mode) => {
    const session = globalThis.__publishAssociationPilot;
    if (!session || session.pending.length) throw new Error('No idle association fixture available');
    session.mode = mode;
    return session.calls.length;
  }, { channel, behavior });
}
export async function publishWriteFixtureCalls(application) {
  return application.evaluate(() => globalThis.__publishAssociationPilot?.calls ?? []);
}
export async function releasePublishWriteFixture(application) {
  return application.evaluate(() => {
    const session = globalThis.__publishAssociationPilot;
    if (!session || session.pending.length !== 1) throw new Error('Exactly one bounded association request must be pending');
    session.pending[0].resolve();
  });
}
export async function restorePublishWriteFixture(application) {
  return application.evaluate(({ ipcMain }) => {
    const session = globalThis.__publishAssociationPilot;
    if (!session) return;
    for (let index = 0; index < session.channels.length; index++) {
      if (ipcMain._invokeHandlers.get(session.channels[index]) !== session.wrappers[index]) throw new Error('Association handler drift; refusing to overwrite unknown handler');
    }
    for (const pending of [...session.pending]) pending.reject();
    for (let index = 0; index < session.channels.length; index++) {
      ipcMain.removeHandler(session.channels[index]); ipcMain.handle(session.channels[index], session.originals[index]);
      if (ipcMain._invokeHandlers.get(session.channels[index]) !== session.originals[index]) throw new Error('Exact association handler restoration failed');
    }
    delete globalThis.__publishAssociationPilot;
  });
}

async function collapseAi(page) {
  const panel = page.locator('#workbench-ai-panel');
  if (await panel.getAttribute('aria-hidden') === 'false') await page.locator('.topbar').getByRole('button', { name: '收起 AI 助手', exact: true }).click();
  await panel.waitFor({ state: 'hidden' });
}
async function settledNavigation(page, workbench, label = null) {
  await page.evaluate(async () => { await document.fonts.ready; });
  await page.waitForFunction(({ workbench, label }) => {
    const title = { media: '自媒体工作台', settings: '设置' }[workbench];
    const rail = document.querySelector('.rail [data-workbench].on');
    const menu = document.querySelector('.snav:not(.closing) .snav-content[data-swap="idle"]');
    const tree = menu?.querySelector('.tree[data-switching="false"]');
    if (rail?.getAttribute('data-workbench') !== workbench || !tree || menu.querySelector('.stitle')?.textContent !== title) return false;
    if (label && tree.querySelector('[aria-current="page"]')?.textContent.trim() !== label) return false;
    const transitions = document.getAnimations().filter(animation => animation.effect?.getComputedTiming().iterations !== Infinity
      && animation.effect?.target instanceof Element && animation.effect.target.closest('.snav, .content, .rail'));
    return !transitions.some(animation => animation.pending || animation.playState === 'running');
  }, { workbench, label });
}
async function openCopy(page, label) {
  await page.bringToFront(); await collapseAi(page);
  await page.locator('.rail [data-workbench="media"]').click();
  await settledNavigation(page, 'media');
  await page.locator('.snav:not(.closing) .tree[data-switching="false"]').getByRole('button', { name: label, exact: true }).click();
  await settledNavigation(page, 'media', label);
  await page.waitForFunction(label => {
    const view = document.querySelector(`.content > .view-fade > .copy-wrap .copy-editor[aria-label="${label}"]`);
    const bounds = view?.getBoundingClientRect();
    return bounds?.width > 0 && bounds?.height > 0 && getComputedStyle(view).visibility === 'visible';
  }, label);
  await page.getByRole('region', { name: label, exact: true }).waitFor({ state: 'visible' });
}
async function selectBlog(page, title, keyboard = false) {
  const target = page.getByRole('button', { name: `选择博客《${title}》`, exact: true });
  if (keyboard) { await target.focus(); await page.keyboard.press('Enter'); } else await target.click();
  await page.waitForFunction(title => document.querySelector('.copy-list [aria-pressed="true"]')?.getAttribute('aria-label') === `选择博客《${title}》`, title);
}
async function waitStatus(page, text) { await status(page, text).waitFor({ state: 'visible' }); }
async function waitCopyResult(page, text) {
  await page.waitForFunction(text => document.querySelector('.toast[data-show="1"]')?.textContent === text, text);
}
async function candidate(page, url, keyboard = false) {
  await input(page).fill(url);
  if (keyboard) {
    await input(page).focus(); await page.keyboard.press('Tab');
    assert.equal(await button(page, '检查链接格式').evaluate(element => element === document.activeElement), true, 'Tab must reach the local format-check control');
    await page.keyboard.press('Enter');
  } else await button(page, '检查链接格式').click();
  await waitStatus(page, '待确认');
}
async function cancel(page, keyboard = false) {
  const control = button(page, '取消');
  if (keyboard) { await control.focus(); await page.keyboard.press('Enter'); } else await control.click();
  await button(page, '确认关联').waitFor({ state: 'hidden' });
}
async function readDisk(application, page, dataRoot) {
  const userData = await application.evaluate(({ app }) => app.getPath('userData'));
  const relative = path.relative(path.resolve(dataRoot), path.resolve(userData));
  assert.ok(relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), 'Blog JSON must remain under the already verified isolated app data root');
  const file = path.join(userData, 'copy-drafts.json');
  const disk = JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''));
  assert.deepEqual(disk, await state(page), 'Actual disk JSON must equal the real copy:list business fields');
  return { file, disk };
}
async function waitAssociation(page, id, remoteId) {
  const data = await waitForPublishCopyState(page, value =>
    value.drafts.find(draft => draft.id === id)?.xhsPublished?.remoteId === remoteId,
  'Exact UI-confirmed blog association did not reach the real store');
  return data.drafts.find(draft => draft.id === id);
}
async function inspectGeometry(page) {
  const root = section(page);
  const geometry = await root.evaluate(element => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, section: { x, y, width, height }, clientWidth: element.clientWidth, scrollWidth: element.scrollWidth, fields: [] };
  });
  // Each long field/error/control is inspected after normal scroll into view.
  // No forced clicks or artificial DOM changes can make a clipped control pass.
  const fields = root.locator('.pub-association-state, .pub-linked-preview, .pub-linked-record, [role="alert"], button, input');
  for (let index = 0; index < await fields.count(); index++) {
    const field = fields.nth(index); if (!await field.isVisible()) continue;
    await field.scrollIntoViewIfNeeded();
    if (await field.evaluate(element => element.matches('button, input') && !element.disabled)) await field.hover();
    geometry.fields.push(await field.evaluate(element => {
      const box = element.getBoundingClientRect();
      const control = element.matches('button, input');
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT); const textRects = [];
      while (walker.nextNode()) if (walker.currentNode.textContent.trim()) {
        const range = document.createRange(); range.selectNodeContents(walker.currentNode);
        textRects.push(...range.getClientRects());
      }
      const hit = document.elementFromPoint(box.x + box.width / 2, box.y + box.height / 2);
      return { label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 100) || element.tagName,
        bounds: { x: box.x, y: box.y, width: box.width, height: box.height }, control,
        complete: element.matches('input') || (textRects.length > 0 && textRects.every(rect => rect.left >= box.left - 1 && rect.right <= box.right + 1 && rect.top >= box.top - 1 && rect.bottom <= box.bottom + 1)),
        hit: hit === element || element.contains(hit) };
    }));
  }
  assertPublishAssociationGeometry(geometry); return geometry;
}

export async function runPublishAssociationPilot({ application, page, check, screenshot, runId, report, dataRoot }) {
  const suffix = String(runId).slice(0, 11);
  const titles = [`CI关联A-${suffix}-完整博客标题`, `CI关联B-${suffix}-独立博客标题`];
  const bodies = ['合成本地博客 A：只验证关联，不发布线上作品。\n第二行正文必须原样保留。 #本地验收', '合成本地博客 B：切换与移除后仍保留正文。 #隔离验收'];
  const urls = {
    first: 'https://www.xiaohongshu.com/explore/64abcdef1234567800000001?xsec_token=synthetic-local-only&xsec_source=pc_note#discard',
    second: 'https://www.xiaohongshu.com/discovery/item/64abcdef1234567800000002',
    third: 'https://xiaohongshu.com/explore/64abcdef1234567800000003',
  };
  let existingState; let createdState; let originals; let finalState;
  const ownedIds = [];
  const readAssociationDisk = async () => {
    const result = await readDisk(application, page, dataRoot);
    assertPublishAssociationInventory(result.disk, existingState, ownedIds);
    return result;
  };
  report.publishAssociation = { synthetic: true, scope: 'UI-created local blogs; no platform verification, publication, update or deletion', geometry: [], fixtureOnly: [] };
  await check('Publish association: create two synthetic blogs through normal editor UI and read exact disk fields', async () => {
    await (await application.browserWindow(page)).evaluate(win => { win.webContents.setZoomFactor(1); win.setContentSize(1280, 820); });
    await openCopy(page, '博客编辑'); existingState = await state(page);
    assertPublishAssociationInventory(existingState, existingState, ownedIds);
    assert.ok(existingState.drafts.every(draft => !titles.includes(draft.title)), 'Owned fixture titles must not collide with earlier blogs');
    if (existingState.drafts.length) await readAssociationDisk();
    for (let index = 0; index < titles.length; index++) {
      const before = await state(page);
      const count = before.drafts.length;
      const beforeIds = new Set(before.drafts.map(draft => draft.id));
      await page.getByRole('region', { name: '博客列表', exact: true }).getByRole('button', { name: '新建', exact: true }).click();
      const created = await waitForPublishCopyState(page, value => value.drafts.length === count + 1,
        'Normal UI blog creation did not persist exactly one new record');
      const newIds = created.drafts.filter(draft => !beforeIds.has(draft.id)).map(draft => draft.id);
      assert.equal(newIds.length, 1, 'Each normal UI creation must produce exactly one new identity');
      ownedIds.push(newIds[0]);
      assertPublishAssociationInventory(created, existingState, ownedIds);
      await page.waitForFunction(() => document.querySelector('#copy-title')?.value === '' && document.querySelector('#copy-body')?.value === '');
      await page.getByRole('textbox', { name: '标题', exact: true }).fill(titles[index]);
      await page.getByRole('textbox', { name: '正文', exact: true }).fill(bodies[index]);
      await waitForPublishCopyState(page, value => value.drafts.some(draft =>
        draft.id === newIds[0] && draft.title === titles[index] && draft.body === bodies[index]),
      'Exact UI-created blog identity, title and body did not finish autosaving');
      await page.getByRole('status').filter({ hasText: '已保存' }).waitFor({ state: 'visible' });
      await readAssociationDisk();
    }
    createdState = await state(page);
    originals = assertPublishAssociationInventory(createdState, existingState, ownedIds);
    assert.equal(originals.length, 2); assert.equal(new Set(originals.map(draft => draft.id)).size, 2);
    for (let index = 0; index < titles.length; index++) {
      const blog = originals.find(draft => draft.title === titles[index]); assert.ok(blog);
      assert.equal(blog.body, bodies[index]); assert.equal(blog.platform, 'xiaohongshu');
      assert.ok(blog.id && Number.isFinite(Date.parse(blog.createdAt)) && Number.isFinite(Date.parse(blog.updatedAt)));
      assertPublishAssociationRecord(blog, blog, undefined);
    }
    report.publishAssociation.existingBlogIds = existingState.drafts.map(draft => draft.id);
    report.publishAssociation.ownedBlogIds = [...ownedIds];
    await readAssociationDisk();
  });
  const originalA = originals.find(draft => draft.title === titles[0]);
  const originalB = originals.find(draft => draft.title === titles[1]);
  await check('Publish association: preparation labels and unchanged title/body copy remain available without opening a platform', async () => {
    await openCopy(page, '图文发布'); await selectBlog(page, originalA.title);
    await page.getByRole('heading', { name: '发布前准备', exact: true }).waitFor({ state: 'visible' });
    assert.match(await page.getByRole('region', { name: '图文发布', exact: true }).innerText(), /准备新笔记内容[,，]复制后前往小红书手动发布/);
    await page.getByRole('button', { name: '复制标题', exact: true }).click();
    await waitCopyResult(page, '标题已复制');
    assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), originalA.title);
    await page.getByRole('button', { name: '复制正文', exact: true }).click();
    await waitCopyResult(page, '正文已复制(含标签)');
    assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), originalA.body);
    await page.getByRole('button', { name: '去发布', exact: true }).waitFor({ state: 'visible' });
    await waitStatus(page, '尚未关联作品');
    assert.match(await section(page).innerText(), /本机/); assert.match(await section(page).innerText(), /不.*核验/);
    await captureAssociationFrame({ application, page, screenshot, report, name: 'publish-association-unlinked.png', expectedState: '尚未关联作品' });
    assert.deepEqual(await state(page), createdState);
  });
  await check('Publish association: inline format errors, keyboard check/cancel, changed input and blog switches never write', async () => {
    for (const value of ['not-a-url', 'https://creator.xiaohongshu.com/', 'https://xhslink.com/a/synthetic']) {
      await input(page).fill(value); await button(page, '检查链接格式').click();
      await waitStatus(page, '链接格式不正确'); await section(page).getByRole('alert').waitFor({ state: 'visible' });
      assert.match(await section(page).getByRole('alert').innerText(), /直链/);
      await input(page).focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
      assert.equal(await section(page).getByRole('alert').evaluate(element => element === document.activeElement), true, 'Full inline error must be keyboard reachable');
      assert.equal(await button(page, '确认关联').count(), 0); assert.deepEqual(await state(page), createdState);
    }
    await captureAssociationFrame({ application, page, screenshot, report, name: 'publish-association-error.png', expectedState: '链接格式不正确' });
    await candidate(page, urls.first, true);
    assert.ok((await section(page).locator('.pub-linked-preview').innerText()).includes(originalA.title));
    assert.match(await section(page).locator('.pub-linked-preview').innerText(), /64abcdef1234567800000001/);
    await input(page).fill(urls.second); assert.equal(await button(page, '确认关联').count(), 0);
    await button(page, '检查链接格式').click(); await waitStatus(page, '待确认');
    await cancel(page, true); await waitStatus(page, '尚未关联作品');
    await candidate(page, urls.second); await input(page).focus(); await page.keyboard.press('Escape');
    await button(page, '确认关联').waitFor({ state: 'hidden' }); await waitStatus(page, '尚未关联作品');
    await candidate(page, urls.first); await selectBlog(page, originalB.title, true);
    await waitStatus(page, '尚未关联作品'); assert.equal(await input(page).inputValue(), '');
    assert.equal(await button(page, '确认关联').count(), 0);
    await selectBlog(page, originalA.title); assert.equal(await button(page, '确认关联').count(), 0);
    assert.deepEqual(await state(page), createdState); await readAssociationDisk();
  });
  await check('Publish association: first real confirmation persists exact target and metadata, then normal navigation/reload retains it', async () => {
    await candidate(page, urls.first); await captureAssociationFrame({ application, page, screenshot, report, name: 'publish-association-pending.png', expectedState: '待确认' });
    const before = Date.now(); await button(page, '确认关联').click(); await waitStatus(page, '已关联 · 手动确认');
    const saved = await waitAssociation(page, originalA.id, '64abcdef1234567800000001');
    const expected = { status: 'published', source: 'manual', url: urls.first.split('#')[0], remoteId: '64abcdef1234567800000001', confirmedAt: saved.xhsPublished.confirmedAt };
    assert.ok(Date.parse(expected.confirmedAt) >= before && Date.parse(expected.confirmedAt) <= Date.now());
    assertPublishAssociationRecord(saved, originalA, expected);
    assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalB.id), originalB, undefined);
    const record = await section(page).locator('.pub-linked-record').innerText();
    assert.ok(record.includes(originalA.title) && record.includes(expected.url) && record.includes(expected.remoteId)); assert.match(record, /手动确认/);
    await button(page, '复制作品链接').click(); await waitCopyResult(page, '作品链接已复制');
    assert.equal(await application.evaluate(({ clipboard }) => clipboard.readText()), expected.url);
    const savedState = await state(page); await readAssociationDisk();
    await page.locator('.rail [data-workbench="home"]').click(); await openCopy(page, '图文发布');
    await waitStatus(page, '已关联 · 手动确认'); assert.deepEqual(await state(page), savedState);
    await page.reload(); await openCopy(page, '图文发布'); await selectBlog(page, originalA.title);
    await waitStatus(page, '已关联 · 手动确认'); assert.deepEqual(await state(page), savedState); await readAssociationDisk();
  });
  await check('Publish association: changing/cancelling replacement and cancelling two-stage removal preserve old association exactly', async () => {
    const before = await state(page);
    await button(page, '更换关联').click(); await candidate(page, urls.second);
    assert.deepEqual(await state(page), before); await cancel(page); await waitStatus(page, '已关联 · 手动确认');
    assert.deepEqual(await state(page), before);
    await button(page, '移除关联').click(); await button(page, '确认移除关联').waitFor({ state: 'visible' });
    assert.deepEqual(await state(page), before); await button(page, '取消').click();
    await button(page, '确认移除关联').waitFor({ state: 'hidden' }); assert.deepEqual(await state(page), before);
    await readAssociationDisk();
  });
  const webContentsId = await (await application.browserWindow(page)).evaluate(win => win.webContents.id);
  await installPublishWriteFixture(application, webContentsId);
  try {
    await check('Publish association fixture only: failed mark/clear show local errors and keep exact disk data for UI retry', async () => {
      const before = await state(page);
      await configurePublishWriteFixture(application, MARK, 'fail');
      await button(page, '更换关联').click(); await candidate(page, urls.second); await button(page, '确认关联').click();
      await section(page).getByRole('alert').filter({ hasText: 'Synthetic association write failure' }).waitFor({ state: 'visible' });
      assert.deepEqual(await state(page), before); await readAssociationDisk(); await cancel(page);
      await configurePublishWriteFixture(application, CLEAR, 'fail');
      await button(page, '移除关联').click(); await button(page, '确认移除关联').click();
      await section(page).getByRole('alert').filter({ hasText: 'Synthetic association write failure' }).waitFor({ state: 'visible' });
      assert.deepEqual(await state(page), before); await readAssociationDisk();
      await selectBlog(page, originalB.title); await selectBlog(page, originalA.title);
      report.publishAssociation.fixtureOnly.push({ case: 'mark/clear failure', preservedExactData: true });
    });
    await check('Publish association fixture only: delayed repeated confirmation writes once to captured blog, without stale pending state on another blog', async () => {
      const before = await state(page); const callsBefore = await configurePublishWriteFixture(application, MARK, 'hold');
      await button(page, '更换关联').click(); await candidate(page, urls.second);
      await button(page, '确认关联').dblclick({ delay: 20 });
      assert.equal(await input(page).isDisabled(), true); assert.equal(await button(page, '取消').isDisabled(), true);
      const calls = await publishWriteFixtureCalls(application); assert.equal(calls.length - callsBefore, 1);
      assert.deepEqual(calls.at(-1).args, [originalA.id, urls.second]); assert.deepEqual(await state(page), before);
      await selectBlog(page, originalB.title); await waitStatus(page, '尚未关联作品');
      await candidate(page, urls.third); assert.equal(await button(page, '确认关联').isDisabled(), true);
      assert.equal((await publishWriteFixtureCalls(application)).length - callsBefore, 1);
      await selectBlog(page, originalA.title); await button(page, '更换关联').click();
      await candidate(page, urls.third); assert.equal(await button(page, '确认关联').isDisabled(), true);
      assert.deepEqual(await state(page), before);
      await releasePublishWriteFixture(application); const saved = await waitAssociation(page, originalA.id, '64abcdef1234567800000002');
      await page.waitForFunction(() => [...document.querySelectorAll('.pub-linked button')].some(control => control.textContent === '确认关联' && !control.disabled));
      await waitStatus(page, '待确认'); assert.equal(await input(page).inputValue(), urls.third);
      assert.match(await section(page).locator('.pub-linked-preview').innerText(), /64abcdef1234567800000003/);
      assert.equal(await section(page).getByRole('alert').count(), 0);
      assertPublishAssociationRecord(saved, originalA, saved.xhsPublished);
      assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalB.id), originalB, undefined);
      assert.equal((await publishWriteFixtureCalls(application)).length - callsBefore, 1);
      await readAssociationDisk(); await cancel(page); await waitStatus(page, '已关联 · 手动确认');
      await selectBlog(page, originalB.title); await waitStatus(page, '尚未关联作品');
      assert.equal(await button(page, '确认关联').count(), 0); await selectBlog(page, originalA.title);
      report.publishAssociation.fixtureOnly.push({ case: 'delayed double confirmation and blog switch', calls: 1, target: originalA.id });
    });
    await check('Publish association fixture only: delayed repeated removal completes once through navigation without a late error or wrong blog write', async () => {
      const before = await state(page); const callsBefore = await configurePublishWriteFixture(application, CLEAR, 'hold');
      await button(page, '移除关联').click(); await button(page, '确认移除关联').dblclick({ delay: 20 });
      assert.equal(await button(page, '取消').isDisabled(), true);
      assert.deepEqual(await state(page), before);
      const calls = await publishWriteFixtureCalls(application); assert.equal(calls.length - callsBefore, 1);
      assert.deepEqual(calls.at(-1).args, [originalA.id]);
      await page.locator('.rail [data-workbench="home"]').click();
      await page.locator('#view-home').waitFor({ state: 'visible' });
      await releasePublishWriteFixture(application);
      await waitForPublishCopyState(page, value => {
        const draft = value.drafts.find(draft => draft.id === originalA.id);
        return Boolean(draft && !Object.hasOwn(draft, 'xhsPublished'));
      }, 'Delayed removal did not clear only the captured existing blog association');
      await openCopy(page, '图文发布'); await selectBlog(page, originalA.title); await waitStatus(page, '尚未关联作品');
      assert.equal(await button(page, '确认移除关联').count(), 0); assert.equal(await section(page).getByRole('alert').count(), 0);
      assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalA.id), originalA, undefined);
      assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalB.id), originalB, undefined);
      assert.equal((await publishWriteFixtureCalls(application)).length - callsBefore, 1); await readAssociationDisk();
      report.publishAssociation.fixtureOnly.push({ case: 'delayed double removal and page navigation', calls: 1, target: originalA.id });
    });
  } finally { await restorePublishWriteFixture(application); }
  await check('Publish association: real unmocked replacement and removal persist without modifying either blog body or metadata', async () => {
    assert.equal(await application.evaluate(() => Boolean(globalThis.__publishAssociationPilot)), false);
    await candidate(page, urls.second); await button(page, '确认关联').click(); await waitStatus(page, '已关联 · 手动确认');
    await waitAssociation(page, originalA.id, '64abcdef1234567800000002');
    await button(page, '更换关联').click(); await candidate(page, urls.third); await button(page, '确认关联').click();
    await waitStatus(page, '已关联 · 手动确认'); const saved = await waitAssociation(page, originalA.id, '64abcdef1234567800000003');
    assertPublishAssociationRecord(saved, originalA, { status: 'published', source: 'manual', url: urls.third, remoteId: '64abcdef1234567800000003', confirmedAt: saved.xhsPublished.confirmedAt });
    await selectBlog(page, originalB.title); await candidate(page, urls.second); await button(page, '确认关联').click();
    await waitStatus(page, '已关联 · 手动确认'); await waitAssociation(page, originalB.id, '64abcdef1234567800000002');
    await button(page, '移除关联').click(); await button(page, '确认移除关联').click(); await waitStatus(page, '尚未关联作品');
    assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalB.id), originalB, undefined);
    assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === originalA.id), originalA, saved.xhsPublished);
    await readAssociationDisk();
  });
  await check('Publish association: all four states remain readable and keyboard/pointer reachable in three themes, both native sizes and reduced motion', async () => {
    const before = await state(page);
    for (const entry of PUBLISH_ASSOCIATION_MATRIX) {
      await page.locator('.rail [data-workbench="settings"]').click();
      await settledNavigation(page, 'settings');
      await page.locator('.snav:not(.closing) .tree[data-switching="false"]').getByRole('button', { name: '外观', exact: true }).click();
      await settledNavigation(page, 'settings', '外观');
      await page.locator('.content').getByRole('heading', { name: '外观', exact: true }).waitFor({ state: 'visible' });
      const themeLabel = { mist: '雾灰 · 轻雾', cool: '冷灰 · 凝霜', warm: '暖砂 · 柔雾' }[entry.theme];
      await page.getByRole('radio', { name: themeLabel, exact: true }).click();
      await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, entry.theme);
      const win = await application.browserWindow(page); await win.evaluate((win, size) => { win.webContents.setZoomFactor(1); win.setContentSize(size.width, size.height); }, entry);
      assert.deepEqual(await win.evaluate(win => win.getContentSize()), [entry.width, entry.height]);
      await page.waitForFunction(({ width, height }) => innerWidth === width && innerHeight === height, entry);
      await page.emulateMedia({ reducedMotion: entry.reducedMotion });
      await openCopy(page, '图文发布'); await selectBlog(page, originalB.title, true); await waitStatus(page, '尚未关联作品');
      const states = { unlinked: await inspectGeometry(page) };
      await candidate(page, urls.second, true); states.pending = await inspectGeometry(page); await cancel(page, true);
      await input(page).fill('https://creator.xiaohongshu.com/'); await button(page, '检查链接格式').click();
      await waitStatus(page, '链接格式不正确'); states.error = await inspectGeometry(page);
      await selectBlog(page, originalA.title, true); await waitStatus(page, '已关联 · 手动确认'); states.linked = await inspectGeometry(page);
      report.publishAssociation.geometry.push({ ...entry, states });
    }
    assert.deepEqual(await state(page), before); await readAssociationDisk();
    await captureAssociationFrame({ application, page, screenshot, report, name: 'publish-association-linked.png', expectedState: '已关联 · 手动确认' });
    await page.emulateMedia({ reducedMotion: 'no-preference' });
  });
  await check('Publish association: authoritative store and actual JSON still match before full application quit', async () => {
    finalState = await state(page); const disk = await readAssociationDisk();
    for (const original of originals) {
      const actual = finalState.drafts.find(draft => draft.id === original.id);
      assertPublishAssociationRecord(actual, original, original.id === originalA.id ? actual.xhsPublished : undefined);
    }
    report.publishAssociation.persisted = finalState;
    report.publishAssociation.diskFile = path.basename(disk.file);
    report.publishAssociation.sameVersionRelaunch = 'pending real full application quit and installed executable relaunch';
  });
  return { existingState, ownedIds: [...ownedIds], originals, finalState, selectedTitle: originalA.title, dataRoot };
}

export async function verifyPublishAssociationRelaunch({ application, page, check, fixture, report }) {
  await check('Publish association: full same-installed-executable restart preserves exact association, absent removed link, identities and every blog field', async () => {
    assert.deepEqual(await state(page), fixture.finalState, 'Real relaunched CopyStore must preserve exact pre-exit JSON');
    assertPublishAssociationInventory(await state(page), fixture.existingState, fixture.ownedIds, fixture.finalState);
    await readDisk(application, page, fixture.dataRoot);
    await openCopy(page, '图文发布'); await selectBlog(page, fixture.selectedTitle);
    await waitStatus(page, '已关联 · 手动确认');
    for (const original of fixture.originals) {
      const expected = fixture.finalState.drafts.find(draft => draft.id === original.id);
      assertPublishAssociationRecord((await state(page)).drafts.find(draft => draft.id === original.id), original, expected.xhsPublished);
      if (!expected.xhsPublished) { await selectBlog(page, original.title); await waitStatus(page, '尚未关联作品'); }
    }
    await selectBlog(page, fixture.selectedTitle); await waitStatus(page, '已关联 · 手动确认');
    assert.equal(await application.evaluate(() => Boolean(globalThis.__publishAssociationPilot)), false);
    report.publishAssociation.sameVersionRelaunch = 'passed real full application quit and same installed executable relaunch';
  });
}
