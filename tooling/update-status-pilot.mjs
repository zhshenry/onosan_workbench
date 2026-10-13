// Issue #34: the installed renderer uses its normal preload read/action/event
// API against bounded synthetic IPC fixtures. No real updater action is invoked.
import assert from 'node:assert/strict';

export const UPDATE_STATUS_SCREENSHOTS = Object.freeze([
  'update-status-mist-latest-1280x820.png',
  'update-status-cool-downloading-1024x680.png',
  'update-status-warm-ready-1024x680.png',
  'update-status-error-details-1024x680.png',
]);
export const UPDATE_STATUS_MATRIX = Object.freeze([
  ['mist', '雾灰 · 轻雾'], ['cool', '冷灰 · 凝霜'], ['warm', '暖砂 · 柔雾'],
].flatMap(([theme, label]) => [[1280, 820], [1024, 680]].map(([width, height]) => Object.freeze({
  theme, label, width, height, reducedMotion: width === 1024 ? 'reduce' : 'no-preference',
}))));
export const UPDATE_STATUS_LONG_ERROR = 'SYNTHETIC_UPDATER_DETAIL: 合成验收错误，仅验证完整文本与换行，不来自服务或个人数据。\n'
  + '连接更新服务失败，请检查网络或代理后重试。'.repeat(30)
  + '\n' + 'SYNTHETIC_UNBROKEN_DETAIL_'.repeat(32);
export function updaterStatusFixtures() {
  const value = (phase, message, extra = {}) => ({ enabled: true, phase, version: '', progress: 0, message, ...extra });
  return [
    { key: 'disabled', status: value('idle', '合成隔离模式不提供自动更新。', { enabled: false }), labels: ['不可自动更新'], action: '检查更新', disabled: true },
    { key: 'idle', status: value('idle', '启动后自动检查更新，也可手动检查。'), labels: ['待检查'], action: '检查更新', disabled: false },
    { key: 'checking', status: value('checking', '正在检查更新…'), labels: ['正在检查更新…', '检查中…'], action: '检查中…', disabled: true },
    { key: 'latest', status: value('latest', '当前已是最新版本。'), labels: ['当前已是最新版本', '已是最新版本'], action: '检查更新', disabled: false },
    { key: 'downloading', status: value('downloading', '正在下载 v0.1.1（42%）', { version: '0.1.1', progress: 42 }), labels: ['正在下载 42%', '下载 42%'], action: '下载中…', disabled: true },
    { key: 'ready', status: value('ready', 'v0.1.1 已下载，可重启安装；退出应用时也会安装。', { version: '0.1.1', progress: 100 }), labels: ['已下载，待重启', '待重启'], action: '重启并安装', disabled: false },
    { key: 'error', status: value('error', UPDATE_STATUS_LONG_ERROR), labels: ['更新失败'], action: '检查更新', disabled: false },
  ];
}

// Use the pinned Electron runtime's handler map only in this acceptance harness.
// Retain exact original functions, restrict calls/events to the same main frame,
// and fail closed on missing APIs or handler drift. The installed backend stays
// disabled; synthetic enabled states never reach the genuine check/install code.
export async function injectUpdaterFixture(application, fixture) {
  await application.evaluate(({ ipcMain, BrowserWindow }, input) => {
    const key = '__onoUpdateStatusPilot';
    const channels = ['updater:status', 'updater:check', 'updater:install'];
    const handlers = ipcMain._invokeHandlers;
    if (!(handlers instanceof Map)) throw new Error('Pinned Electron updater-handler inspection unavailable');
    if (!Number.isSafeInteger(input.senderId) || input.senderId <= 0) throw new Error('Exact main renderer identity required');
    const target = BrowserWindow.getAllWindows().find(win => win.webContents.id === input.senderId);
    if (!target || target.isDestroyed() || target.webContents.isDestroyed()) throw new Error('Main renderer is unavailable');
    const status = input.status;
    if (!status || typeof status.enabled !== 'boolean' || !['idle', 'checking', 'latest', 'downloading', 'ready', 'error'].includes(status.phase)
      || typeof status.version !== 'string' || status.version.length > 80 || typeof status.message !== 'string' || status.message.length > 12_000
      || !Number.isFinite(status.progress) || status.progress < 0 || status.progress > 100) throw new Error('Unbounded or invalid updater fixture');
    let session = globalThis[key];
    if (session) {
      if (session.target !== target || channels.some(channel => handlers.get(channel) !== session.wrappers[channel])) {
        throw new Error('Updater handler or renderer changed during acceptance');
      }
      session.input = input;
    } else {
      if (!input.originalStatus || input.originalStatus.enabled !== false) throw new Error('Real updater must be disabled before fixture installation');
      const originals = Object.fromEntries(channels.map(channel => [channel, handlers.get(channel)]));
      if (channels.some(channel => typeof originals[channel] !== 'function')) throw new Error('Original updater handler missing');
      session = { target, originals, originalStatus: { ...input.originalStatus }, input, wrappers: {}, calls: { status: 0, check: 0, install: 0 }, pendingReads: [], pendingActions: [] };
      const assertSender = event => {
        if (event?.sender !== target.webContents || event?.senderFrame !== target.webContents.mainFrame) throw new Error('Synthetic updater accepts the exact main frame only');
      };
      session.wrappers['updater:status'] = event => {
        assertSender(event); session.calls.status++;
        if (session.input.rejectRead) throw new Error(session.input.rejectRead);
        if (session.input.holdRead) return new Promise(resolve => session.pendingReads.push(resolve));
        return { ...session.input.status };
      };
      session.wrappers['updater:check'] = event => {
        assertSender(event); session.calls.check++;
        if (session.input.rejectCheck) throw new Error(session.input.rejectCheck);
        if (session.input.emitChecking !== false) {
          session.input.status = { ...session.input.status, phase: 'checking', progress: 0, version: '', message: '正在检查更新…' };
          target.webContents.send('updater:status', { ...session.input.status });
        }
        if (session.input.holdCheck) return new Promise((resolve, reject) => session.pendingActions.push({ resolve, reject }));
      };
      session.wrappers['updater:install'] = event => {
        assertSender(event); session.calls.install++;
        if (session.input.rejectInstall) throw new Error(session.input.rejectInstall);
        // Intentionally no quitAndInstall, app.quit, driver call or downloaded file.
      };
      globalThis[key] = session;
      const replaced = [];
      try {
        for (const channel of channels) {
          ipcMain.removeHandler(channel); replaced.push(channel);
          ipcMain.handle(channel, session.wrappers[channel]);
        }
      } catch (error) {
        for (const channel of replaced) { ipcMain.removeHandler(channel); ipcMain.handle(channel, originals[channel]); }
        delete globalThis[key]; throw error;
      }
    }
    if (!input.holdRead) for (const resolve of session.pendingReads.splice(0)) resolve({ ...input.status });
    if (input.announce !== false) target.webContents.send('updater:status', { ...input.status });
  }, fixture);
}
export async function inspectUpdaterFixture(application) {
  return application.evaluate(({ ipcMain }) => {
    const session = globalThis.__onoUpdateStatusPilot;
    if (!session) return { installed: false };
    for (const channel of ['updater:status', 'updater:check', 'updater:install']) {
      if (ipcMain._invokeHandlers?.get(channel) !== session.wrappers[channel]) throw new Error('Updater handler changed during acceptance');
    }
    return { installed: true, calls: { ...session.calls }, pendingReads: session.pendingReads.length, pendingActions: session.pendingActions.length };
  });
}
export async function settleUpdaterActions(application, error = '') {
  await application.evaluate(({ ipcMain }, message) => {
    const session = globalThis.__onoUpdateStatusPilot;
    if (!session) throw new Error('Updater fixture is not installed');
    for (const channel of ['updater:status', 'updater:check', 'updater:install']) {
      if (ipcMain._invokeHandlers?.get(channel) !== session.wrappers[channel]) throw new Error('Updater handler changed during acceptance');
    }
    for (const pending of session.pendingActions.splice(0)) message ? pending.reject(new Error(message)) : pending.resolve();
  }, error);
}
export async function restoreUpdaterFixture(application) {
  await application.evaluate(({ ipcMain }) => {
    const key = '__onoUpdateStatusPilot'; const session = globalThis[key];
    if (!session) return;
    const channels = ['updater:status', 'updater:check', 'updater:install'];
    if (channels.some(channel => ipcMain._invokeHandlers?.get(channel) !== session.wrappers[channel])) throw new Error('Cannot safely restore changed updater handlers');
    for (const pending of session.pendingActions.splice(0)) pending.resolve();
    for (const resolve of session.pendingReads.splice(0)) resolve({ ...session.originalStatus });
    for (const channel of channels) {
      ipcMain.removeHandler(channel); ipcMain.handle(channel, session.originals[channel]);
      if (ipcMain._invokeHandlers.get(channel) !== session.originals[channel]) throw new Error('Original updater handler not restored');
    }
    delete globalThis[key];
    if (!session.target.isDestroyed() && !session.target.webContents.isDestroyed()) {
      session.target.webContents.send('updater:status', { ...session.originalStatus });
    }
  });
}

function inside(inner, outer, label) {
  for (const bounds of [inner, outer]) {
    assert.ok(bounds && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(bounds[key])), `${label}: invalid bounds`);
    assert.ok(bounds.width > 0 && bounds.height > 0, `${label}: empty bounds`);
  }
  assert.ok(inner.x >= outer.x - 1 && inner.y >= outer.y - 1 && inner.x + inner.width <= outer.x + outer.width + 1
    && inner.y + inner.height <= outer.y + outer.height + 1, `${label}: clipped or outside boundary`);
}
export function assertUpdateStatusGeometry(value, expected) {
  inside(value.row, value.viewport, 'Updater row');
  inside(value.heading, value.row, 'Updater heading');
  for (const name of ['title', 'status']) inside(value[name].bounds, value.heading, `Updater ${name}`);
  inside(value.action.bounds, value.row, 'Updater action');
  assert.equal(value.title.text, '应用更新', 'Updater title is retained');
  assert.ok(expected.labels.includes(value.status.text), `Unexpected updater short status: ${value.status.text}`);
  assert.equal(value.action.text, expected.action, 'Existing updater action label is retained');
  assert.equal(value.action.disabled, expected.disabled, 'Disabled/busy action state is retained');
  assert.equal(value.action.busy, ['checking', 'downloading'].includes(expected.key), 'Busy phase is accessible');
  for (const [name, minimum] of [['title', 14], ['status', 14], ['action', 13]]) {
    assert.equal(value[name].complete, true, `${name}: complete readable text required`);
    assert.ok(Number.isFinite(value[name].fontSize) && value[name].fontSize >= minimum, `${name}: do not shrink shared typography`);
    assert.equal(value[name].fontSize, value[name].tokenSize, `${name}: retain the shared typography token`);
  }
  assert.ok(value.title.bounds.x + value.title.bounds.width <= value.status.bounds.x + 1, 'Title and short status must be inline and disjoint');
  assert.ok(Math.abs(value.title.bounds.y + value.title.bounds.height / 2 - value.status.bounds.y - value.status.bounds.height / 2) <= 3, 'Short status must remain beside the title');
  assert.ok(value.heading.x + value.heading.width <= value.action.bounds.x + 1, 'Action remains to the right without overlap');
  assert.equal(value.action.hit, true, 'Action is not occluded');
  assert.ok(value.rowScrollWidth <= value.rowClientWidth, 'Updater row must not overflow horizontally');
  if (expected.key === 'downloading') {
    assert.ok(value.progress, 'Downloading progress remains inside the updater row');
    inside(value.progress.bounds, value.row, 'Download progress');
    assert.equal(value.progress.value, expected.status.progress);
    assert.equal(value.progress.max, 100);
  } else assert.equal(value.progress, null, 'Progress is exclusive to downloading');
  assert.equal(value.detailsVisible, false, 'Full detail starts collapsed');
}
const updaterRow = page => page.locator('.set-update-row[data-setting-key="update"]');
const updaterAction = page => updaterRow(page).locator('.set-update-action');
async function openAbout(page) {
  await page.locator('.rail [data-workbench="settings"]').click();
  await page.locator('.tree').getByRole('button', { name: '关于', exact: true }).click();
  await updaterRow(page).waitFor({ state: 'visible' });
}
async function remountAbout(page) {
  await page.locator('.tree').getByRole('button', { name: '通用', exact: true }).click();
  await page.getByRole('heading', { name: '通用', exact: true }).waitFor({ state: 'visible' });
  await page.locator('.tree').getByRole('button', { name: '关于', exact: true }).click();
  await updaterRow(page).waitFor({ state: 'visible' });
}
async function resize(application, page, width, height) {
  const native = await application.browserWindow(page);
  await native.evaluate((win, value) => { win.webContents.setZoomFactor(1); win.setContentSize(value.width, value.height); }, { width, height });
  await page.waitForFunction(value => innerWidth === value.width && innerHeight === value.height, { width, height });
}
async function inspectGeometry(page, expected) {
  await page.waitForFunction(expected => {
    const status = document.querySelector('.set-update-status');
    const action = document.querySelector('.set-update-action');
    return status && expected.labels.includes(status.innerText.trim()) && action
      && action.innerText.trim() === expected.action && action.disabled === expected.disabled
      && (action.getAttribute('aria-busy') === 'true') === expected.busy;
  }, { labels: expected.labels, action: expected.action, disabled: expected.disabled, busy: ['checking', 'downloading'].includes(expected.key) });
  await page.locator('.set-rows').evaluate(async element => {
    await Promise.all(element.getAnimations({ subtree: true }).filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
  });
  const value = await updaterRow(page).evaluate(element => {
    const rect = node => { const { x, y, width, height } = node.getBoundingClientRect(); return { x, y, width, height }; };
    const label = (node, token) => {
      const bounds = node.getBoundingClientRect(); const range = document.createRange(); range.selectNodeContents(node);
      const textRects = [...range.getClientRects()].filter(text => text.width > 0 && text.height > 0);
      const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return { bounds: rect(node), text: node.innerText.trim(), fontSize: Number.parseFloat(getComputedStyle(node).fontSize),
        tokenSize: Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue(token)),
        complete: textRects.length > 0 && textRects.every(text => text.left >= bounds.left - 1 && text.right <= bounds.right + 1 && text.top >= bounds.top - 1 && text.bottom <= bounds.bottom + 1),
        hit: target === node || node.contains(target) };
    };
    const action = element.querySelector('.set-update-action'); const progress = element.querySelector('.set-update-progress');
    const details = element.querySelector('.set-update-details');
    return { viewport: { x: 0, y: 0, width: innerWidth, height: innerHeight }, row: rect(element),
      heading: rect(element.querySelector('.set-update-heading')), title: label(element.querySelector('.set-update-heading > b'), '--type-body'),
      status: label(element.querySelector('.set-update-status'), '--type-body'),
      action: { ...label(action, '--type-control'), disabled: action.disabled, busy: action.getAttribute('aria-busy') === 'true' },
      progress: progress ? { bounds: rect(progress), value: progress.value, max: progress.max } : null,
      rowScrollWidth: element.scrollWidth, rowClientWidth: element.clientWidth,
      detailsVisible: !!details && details.getClientRects().length > 0,
      reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches };
  });
  assertUpdateStatusGeometry(value, expected); return value;
}
async function assertFullDetail(page, message) {
  const toggle = updaterRow(page).locator('.set-update-details-toggle');
  await toggle.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false');
  await toggle.focus(); await page.keyboard.press('Enter');
  const detail = updaterRow(page).locator('.set-update-details');
  await detail.waitFor({ state: 'visible' });
  assert.equal(await toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(await detail.getAttribute('id'), await toggle.getAttribute('aria-controls'));
  assert.equal(await detail.textContent(), message, 'Expanded detail must preserve the complete message');
  assert.equal(await toggle.evaluate(element => element === document.activeElement), true, 'Opening details retains keyboard focus');
  const wrapping = await detail.evaluate(element => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
    overflowWrap: getComputedStyle(element).overflowWrap, fontSize: getComputedStyle(element).fontSize }));
  assert.ok(wrapping.clientWidth > 0 && wrapping.scrollWidth <= wrapping.clientWidth, 'Long full error must wrap without horizontal overflow');
  assert.equal(wrapping.overflowWrap, 'anywhere');
  assert.equal(wrapping.fontSize, '12px');
  await page.keyboard.press('Space'); await detail.waitFor({ state: 'hidden' });
  assert.equal(await toggle.evaluate(element => element === document.activeElement), true, 'Closing details retains keyboard focus');
  await page.keyboard.press('Enter'); await detail.waitFor({ state: 'visible' });
  assert.equal(await detail.textContent(), message, 'Details can be reopened without losing text');
  return { toggle, detail };
}

async function transportedFailureDetail(application, page, method, marker) {
  assert.equal((await inspectUpdaterFixture(application)).installed, true, 'Transport probe requires safe synthetic handlers');
  const transported = await page.evaluate(async operation => {
    try { await window.workbench.updater[operation](); return ''; }
    catch (error) { return error instanceof Error ? error.message : String(error); }
  }, method);
  assert.ok(transported.includes(marker), 'Transported failure must retain the complete synthetic marker');
  // The display contract removes Electron's invocation envelope and optional
  // Error prefix. Capture the actual installed transport instead of assuming it.
  const envelope = `Error invoking remote method 'updater:${method}': `;
  const body = transported.startsWith(envelope) ? transported.slice(envelope.length) : transported;
  return transported.startsWith(envelope) && body.startsWith('Error: ') ? body.slice(7) : body;
}

export async function runUpdateStatusPilot({ application, page, check, screenshot, report }) {
  const originalStatus = await page.evaluate(() => window.workbench.updater.status());
  assert.equal(originalStatus.enabled, false, 'The real installed updater must remain disabled');
  const originalTheme = (await page.evaluate(() => window.workbench.settings.get())).uiTheme;
  const native = await application.browserWindow(page);
  const originalSize = await native.evaluate(win => win.getContentSize());
  const senderId = await native.evaluate(win => win.webContents.id);
  const fixtures = updaterStatusFixtures();
  const byKey = key => fixtures.find(value => value.key === key);
  const inject = (key, options = {}) => injectUpdaterFixture(application, { senderId, originalStatus, status: { ...byKey(key).status }, ...options });
  report.updateStatus = { synthetic: true, transport: 'Installed preload API with bounded main-frame IPC read/action/event fixture', matrix: [] };
  report.limitations.push('Updater status/read errors and action routing use temporary synthetic updater:status/check/install handlers, restored by exact function identity; no real feed, download, install, restart or cross-version updater coverage');
  try {
    await openAbout(page);
    for (const entry of UPDATE_STATUS_MATRIX) {
      await check(`Update status: ${entry.theme} ${entry.width}x${entry.height}, all phases inline with unchanged right-side actions`, async () => {
        await page.emulateMedia({ reducedMotion: entry.reducedMotion });
        await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click();
        await page.getByRole('radio', { name: entry.label, exact: true }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, entry.theme);
        assert.equal((await page.evaluate(() => window.workbench.settings.get())).uiTheme, entry.theme);
        await resize(application, page, entry.width, entry.height);
        await openAbout(page);
        const geometries = {};
        for (const fixture of fixtures) {
          await inject(fixture.key);
          geometries[fixture.key] = await inspectGeometry(page, fixture);
          assert.equal(geometries[fixture.key].reducedMotion, entry.reducedMotion === 'reduce');
          assert.equal(await updaterRow(page).locator('.set-update-details-toggle').count(), fixture.key === 'error' ? 1 : 0);
          if (entry.theme === 'mist' && entry.width === 1280 && fixture.key === 'latest') await screenshot(UPDATE_STATUS_SCREENSHOTS[0]);
          if (entry.theme === 'cool' && entry.width === 1024 && fixture.key === 'downloading') await screenshot(UPDATE_STATUS_SCREENSHOTS[1]);
          if (entry.theme === 'warm' && entry.width === 1024 && fixture.key === 'ready') await screenshot(UPDATE_STATUS_SCREENSHOTS[2]);
        }
        report.updateStatus.matrix.push({ ...entry, geometries });
      });
    }
    await check('Update status: delayed check, busy phases and repeated keyboard activation invoke one safe check only', async () => {
      await inject('idle', { holdCheck: true, emitChecking: false });
      const before = (await inspectUpdaterFixture(application)).calls;
      await updaterAction(page).focus();
      await page.keyboard.press('Enter'); await page.keyboard.press('Enter'); await page.keyboard.press('Space');
      await page.waitForFunction(() => document.querySelector('.set-update-action')?.disabled);
      const pending = await inspectUpdaterFixture(application);
      assert.equal(pending.calls.check, before.check + 1, 'Rapid activation cannot duplicate delayed IPC');
      assert.equal(pending.pendingActions, 1);
      await inject('checking'); await inspectGeometry(page, byKey('checking'));
      await page.keyboard.press('Enter'); await page.keyboard.press('Space');
      await inject('downloading'); await inspectGeometry(page, byKey('downloading'));
      await page.keyboard.press('Enter'); await page.keyboard.press('Space');
      assert.equal((await inspectUpdaterFixture(application)).calls.check, before.check + 1);
      await settleUpdaterActions(application); await inject('latest');
      await inspectGeometry(page, byKey('latest'));
      await updaterAction(page).hover();
      assert.equal(await updaterAction(page).isEnabled(), true, 'Action returns after the check settles');
    });
    await check('Update status: ready UI routes only to the safe install fixture without terminating the installed app', async () => {
      await inject('ready'); await inspectGeometry(page, byKey('ready'));
      const before = (await inspectUpdaterFixture(application)).calls;
      await updaterAction(page).click();
      await page.waitForFunction(() => !document.querySelector('.set-update-action')?.disabled);
      const after = (await inspectUpdaterFixture(application)).calls;
      assert.equal(after.install, before.install + 1); assert.equal(after.check, before.check);
      assert.equal(page.isClosed(), false); assert.equal(await native.evaluate(win => win.isDestroyed()), false);
    });
    await check('Update status: long error detail is complete, keyboard-accessible and keeps focus across close/reopen', async () => {
      await inject('error'); await inspectGeometry(page, byKey('error'));
      assert.equal(await updaterRow(page).getByText(UPDATE_STATUS_LONG_ERROR, { exact: true }).isVisible(), false);
      const { toggle, detail } = await assertFullDetail(page, UPDATE_STATUS_LONG_ERROR);
      await screenshot(UPDATE_STATUS_SCREENSHOTS[3]);
      await toggle.press('Escape'); await detail.waitFor({ state: 'hidden' });
      assert.equal(await toggle.evaluate(element => element === document.activeElement), true, 'Escape closes updater details without losing focus');
    });
    await check('Update status: settings search isolates row, progress and errors, while navigation rereads current state', async () => {
      await inject('downloading'); await inspectGeometry(page, byKey('downloading'));
      const search = page.getByRole('textbox', { name: '搜索当前页设置', exact: true });
      await search.fill('应用数据目录'); await updaterRow(page).waitFor({ state: 'hidden' });
      assert.equal(await page.locator('.set-update-progress').count(), 0);
      await search.fill('应用更新'); await inspectGeometry(page, byKey('downloading'));
      await inject('error'); const { detail } = await assertFullDetail(page, UPDATE_STATUS_LONG_ERROR);
      await search.fill('SYNTHETIC_UPDATER_DETAIL'); await updaterRow(page).waitFor({ state: 'hidden' });
      assert.equal(await detail.count(), 0, 'Unmatched rows cannot leak expanded updater detail');
      await search.fill(''); await updaterRow(page).waitFor({ state: 'visible' });
      await remountAbout(page); await inspectGeometry(page, byKey('error'));
      assert.equal(await updaterRow(page).locator('.set-update-details-toggle').getAttribute('aria-expanded'), 'false');
    });
    await check('Update status: initial read loading/rejection and check/install rejections stay inside the row', async () => {
      await page.locator('.tree').getByRole('button', { name: '通用', exact: true }).click();
      await inject('idle', { holdRead: true, announce: false }); await openAbout(page);
      await page.waitForFunction(() => document.querySelector('.set-update-status')?.innerText.trim() === '读取中…');
      assert.equal(await updaterAction(page).isDisabled(), true);
      assert.ok((await inspectUpdaterFixture(application)).pendingReads > 0);
      await inject('latest'); await inspectGeometry(page, byKey('latest'));
      await page.locator('.tree').getByRole('button', { name: '通用', exact: true }).click();
      await inject('idle', { rejectRead: 'SYNTHETIC_READ_REJECTION', announce: false }); await openAbout(page);
      await page.waitForFunction(() => document.querySelector('.set-update-status')?.innerText.trim() === '读取失败');
      assert.equal(await updaterAction(page).isDisabled(), true);
      const readError = await transportedFailureDetail(application, page, 'status', 'SYNTHETIC_READ_REJECTION');
      let disclosure = await assertFullDetail(page, readError); await disclosure.toggle.press('Space');
      await inject('idle', { rejectCheck: 'SYNTHETIC_CHECK_REJECTION' });
      const checkError = await transportedFailureDetail(application, page, 'check', 'SYNTHETIC_CHECK_REJECTION');
      await updaterAction(page).click();
      await page.waitForFunction(() => document.querySelector('.set-update-status')?.innerText.trim() === '更新失败');
      disclosure = await assertFullDetail(page, checkError); await disclosure.toggle.press('Space');
      await inject('ready', { rejectInstall: 'SYNTHETIC_INSTALL_REJECTION' });
      const installError = await transportedFailureDetail(application, page, 'install', 'SYNTHETIC_INSTALL_REJECTION');
      await updaterAction(page).click();
      await page.waitForFunction(() => document.querySelector('.set-update-status')?.innerText.trim() === '更新失败');
      disclosure = await assertFullDetail(page, installError); await disclosure.toggle.press('Space');
      report.updateStatus.safeCalls = (await inspectUpdaterFixture(application)).calls;
    });
  } finally {
    await restoreUpdaterFixture(application);
    assert.deepEqual(await page.evaluate(() => window.workbench.updater.status()), originalStatus, 'Genuine disabled updater read must be restored');
    assert.deepEqual(await inspectUpdaterFixture(application), { installed: false });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.getByRole('textbox', { name: '搜索当前页设置', exact: true }).fill('');
    await page.locator('.tree').getByRole('button', { name: '外观', exact: true }).click();
    await page.getByRole('radio', { name: UPDATE_STATUS_MATRIX.find(entry => entry.theme === originalTheme).label, exact: true }).click();
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, originalTheme);
    await resize(application, page, originalSize[0], originalSize[1]);
    report.updateStatus.restored = true;
  }
}
