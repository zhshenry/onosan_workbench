// Real Electron renderer + IPC, isolated local settings/tasks; no external account actions.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { _electron as electron } from 'playwright';
import { navigateInstalled } from './installed-navigation.mjs';

const require = createRequire(import.meta.url);
const output = path.resolve('test-results/appearance');
await mkdir(output, { recursive: true });
const report = { checks: [], screenshots: [], errors: [], limitations: ['Development Electron build, not a new installer; isolated synthetic task data, no live sign-in/AI requests.'] };
let app, page;
const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: path.join(output, 'data'), WORKBENCH_ISOLATED: '1' };
for (const key of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[key];
async function launch() {
  app = await electron.launch({ executablePath: require('electron'), args: ['.', '--force-device-scale-factor=1'], cwd: process.cwd(), env, timeout: 45000, chromiumSandbox: true });
  for (let i = 0; i < 100; i++) {
    page = app.windows().find(p => /\/dist\/index\.html$/.test(p.url()));
    if (page) break;
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(page, 'Main window available');
  page.setDefaultTimeout(15000);
  page.on('pageerror', e => report.errors.push(e.message));
  await page.locator('#view-home').waitFor();
  if (!await page.locator('.ai-panel').isVisible()) await page.locator('.ai-topbar-btn').click();
  const win = await app.browserWindow(page);
  await win.evaluate(win => win.setContentSize(1440, 940));
  const data = await app.evaluate(({ app }) => app.getPath('userData'));
  assert.ok(data.startsWith(output), 'Real user data is never used');
}
async function check(name, action) { await action(); report.checks.push(name); console.log(`PASS ${name}`); }
async function settings() { await navigateInstalled(page, 'settings', '通用与外观'); }
async function closeSettings() { await page.getByRole('dialog', { name: '设置', exact: true }).getByRole('button', { name: '关闭', exact: true }).click(); }
async function choose(key, label) {
  await page.locator(`[data-setting-key="${key}"]`).getByRole('radio', { name: new RegExp(`^${label}`) }).locator('..').click();
  await page.locator('.appearance-save').filter({ hasText: '已保存' }).waitFor();
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
}
async function geometry() {
  return page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { bar: rect('.topbar'), brand: rect('.tb-brand'), middle: rect('.tb-middle'), right: rect('.tb-right'), nav: rect('.rail-nav'), settings: rect('.rbot') };
  });
}
try {
  await launch();
  const taskState = await page.evaluate(async () => {
    const existing = await window.workbench.todo.state();
    if (existing.tasks.some(task => task.title === '核对新版界面')) return existing;
    const now = new Date();
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return window.workbench.todo.create({ title: '核对新版界面', kind: 'task', status: 'todo', priority: 'medium', plannedDate: day, dueAt: null, endAt: null, remindAt: null, categoryId: null, progress: null, note: '隔离环境中的验收任务' });
  });
  await settings();
  await choose('uiTheme', '窗影'); await choose('glassIntensity', '强玻璃'); await choose('navigationStyle', '悬浮');
  await choose('windowLight', '午后');
  await shot('settings-appearance');
  await closeSettings();
  await shot('home-floating-strong-windowlight');
  await check('floating navigation centered and topbar groups separated', async () => {
    const g = await geometry();
    assert.ok(g.brand.right + 8 <= g.middle.x, JSON.stringify(g));
    assert.ok(g.middle.right + 8 <= g.right.x, JSON.stringify(g));
    const corridor = (g.bar.bottom + 10 + g.settings.y - 16) / 2;
    assert.ok(Math.abs((g.nav.y + g.nav.bottom) / 2 - corridor) <= 3, JSON.stringify(g));
    assert.ok(g.brand.width < 120);
    assert.equal(await page.locator('.tb-brand').innerText(), '');
    assert.notEqual(await page.locator('.rail-nav-shell').evaluate(el => getComputedStyle(el, '::before').backgroundImage), 'none');
    assert.equal(await page.locator('.dashboard-heading').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
  });
  if (process.argv.includes('--preview')) {
    await navigateInstalled(page, 'life', '日程和待办', 'todo');
    await shot('todo-floating-strong-windowlight');
  } else {
    await check('40 appearance combinations save through the actual UI', async () => {
      await settings();
      for (const nav of ['经典', '悬浮']) {
        await choose('navigationStyle', nav);
        for (const glass of ['普通玻璃', '强玻璃']) {
          await choose('glassIntensity', glass);
          for (const theme of ['雾珀', '暖砂', '青瓷', '藤紫', '蔷薇', '燕麦', '窗影', '空间窗景']) {
            await choose('uiTheme', theme);
            if (theme === '窗影') for (const light of ['上午', '午后', '傍晚']) await choose('windowLight', light);
            const state = await page.evaluate(async () => ({ saved: await window.workbench.settings.get(), rendered: { ...document.documentElement.dataset } }));
            assert.equal(state.saved.uiTheme, state.rendered.theme);
            assert.equal(state.saved.navigationStyle, state.rendered.navigation);
            assert.equal(state.saved.glassIntensity, state.rendered.glass);
          }
        }
      }
    });
    await choose('uiTheme', '窗影'); await choose('windowLight', '午后');
    await closeSettings();
    await check('classic baseline and opaque popover keep their geometry', async () => {
      await settings(); await choose('navigationStyle', '经典'); await choose('glassIntensity', '普通玻璃'); await choose('uiTheme', '雾珀'); await closeSettings();
      await shot('home-classic-normal-mist');
      assert.equal(await page.locator('.tb-brand').evaluate(el => getComputedStyle(el).display), 'contents');
      assert.equal(await page.locator('.rail-nav-shell').evaluate(el => getComputedStyle(el).display), 'contents');
      assert.notEqual(await page.locator('.dashboard-heading').evaluate(el => getComputedStyle(el).backgroundColor), 'rgba(0, 0, 0, 0)');
      await page.locator('.todopill').click();
      await page.locator('.ipop').waitFor({ state: 'visible' });
      await shot('classic-todo-popover');
      await page.locator('.todopill').click();
      await settings(); await choose('navigationStyle', '悬浮'); await choose('glassIntensity', '强玻璃'); await choose('uiTheme', '空间窗景'); await closeSettings();
      await shot('home-floating-strong-spatial');
      await settings(); await choose('uiTheme', '窗影'); await closeSettings();
    });
    await check('glass switch preserves mounted workspace and dimensions', async () => {
      await page.locator('.dashboard-widget').first().evaluate(el => { window.appearanceWidget = el; window.appearanceRect = el.getBoundingClientRect().toJSON(); });
      await settings(); await choose('glassIntensity', '普通玻璃'); await closeSettings();
      assert.equal(await page.locator('.dashboard-widget').first().evaluate(el => el === window.appearanceWidget), true);
      await settings(); await choose('glassIntensity', '强玻璃'); await closeSettings();
      const same = await page.locator('.dashboard-widget').first().evaluate(el => {
        const r = el.getBoundingClientRect(); return Math.abs(r.width - window.appearanceRect.width) < 1 && Math.abs(r.height - window.appearanceRect.height) < 1;
      });
      assert.ok(same);
    });
    for (const [workbench, label, view] of [['life', '日程和待办', 'todo'], ['life', '每日签到', 'checkin'], ['life', '阅读清单', 'reading'], ['life', '命理', 'bazi'], ['media', '博客编辑', 'copy'], ['ai-test', '对比测试', 'ai-test'], ['ai-test', '测试任务', 'ai-test-tasks']]) {
      await navigateInstalled(page, workbench, label);
      const selector = { todo: '#view-todo', checkin: '.ci-main', reading: '#view-reading', bazi: '#view-bazi', copy: '.copy-wrap', 'ai-test': '.at-config-card', 'ai-test-tasks': '.at-library-content' }[view];
      await page.locator(selector).waitFor({ state: 'visible' });
      if (view === 'copy') {
        await page.locator('.copy-new').click();
        await page.locator('.copy-title').fill('外观切换保留的博客草稿');
        const before = await page.locator('.copy-title').inputValue();
        await page.locator('.copy-title').evaluate(el => { window.appearanceDraftNode = el; });
        await settings(); await choose('uiTheme', '青瓷'); await closeSettings();
        assert.equal(await page.locator('.copy-title').inputValue(), before);
        assert.equal(await page.locator('.copy-title').evaluate(el => el === window.appearanceDraftNode), true);
        await settings(); await choose('uiTheme', '窗影'); await closeSettings();
        report.checks.push('real blog editor remains mounted and retains draft through theme changes');
      }
      await shot(`${view}-floating-strong`);
    }
    await navigateInstalled(page, 'life', '日程和待办', 'todo');
    await check('short window, expanded navigation and keyboard flyout remain reachable', async () => {
      const win = await app.browserWindow(page);
      await win.evaluate(win => win.setContentSize(1024, 680));
      if (await page.locator('.nav-toggle').getAttribute('aria-expanded') === 'false') await page.locator('.nav-toggle').click();
      await page.locator('.rail [data-workbench="settings"]').click();
      await page.locator('.appearance-settings').waitFor();
      await shot('settings-1024'); await closeSettings();
      await shot('todo-1024-expanded');
      const g = await geometry();
      assert.ok(g.nav.bottom <= g.settings.y - 10);
      assert.ok(g.middle.right <= g.right.x - 4);
      await page.locator('.nav-toggle').click();
      const trigger = page.locator('.rail [data-workbench="life"]');
      await trigger.focus(); await trigger.press('ArrowRight');
      await page.locator('.rail-flyout').waitFor();
      await page.locator('.rail-flyout button').first().press('Escape');
      assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
      await shot('todo-1024-collapsed');
      await page.locator('.ai-panel').getByRole('button', { name: '收起 AI 助手' }).click();
      await shot('todo-1024-ai-closed');
    });
    await check('floating submenu survives repeated pointer crossings without extra waits', async () => {
      for (let i = 0; i < 4; i++) {
        await navigateInstalled(page, 'life', '阅读清单', 'reading');
        await navigateInstalled(page, 'life', '日程和待办', 'todo');
      }
    });
    await check('reduced motion and keyboard theme selection', async () => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await settings();
      const radio = page.locator('[data-setting-key="uiTheme"] input:checked');
      await radio.focus(); await radio.press('ArrowLeft');
      await page.locator('.appearance-save').filter({ hasText: '已保存' }).waitFor();
      assert.equal(await page.evaluate(() => document.activeElement?.tagName), 'INPUT');
      await choose('uiTheme', '窗影'); await choose('windowLight', '傍晚');
      await closeSettings();
    });
    const before = await page.evaluate(() => window.workbench.settings.get());
    await app.close(); app = null;
    await launch();
    await check('settings persist across full Electron restart', async () => {
      const after = await page.evaluate(() => window.workbench.settings.get());
      assert.deepEqual(after, before);
      await page.waitForFunction(() => document.documentElement.dataset.windowLight === 'dusk');
      assert.equal(await page.locator('html').getAttribute('data-navigation'), 'floating');
      const afterTasks = await page.evaluate(() => window.workbench.todo.state());
      assert.deepEqual(afterTasks.tasks, taskState.tasks);
    });
    await shot('relaunch-windowlight-dusk');
  }
  assert.deepEqual(report.errors, []);
  report.status = 'passed';
} catch (error) {
  report.status = 'failed'; report.failure = error.stack;
  console.error(error);
  if (page && !page.isClosed()) await shot('failure').catch(() => {});
  process.exitCode = 1;
} finally {
  if (app) await app.close().catch(() => {});
  await writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
}
