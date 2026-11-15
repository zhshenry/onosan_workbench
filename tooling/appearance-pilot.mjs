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
const localTime = (hour, minute = 0, second = 0) => new Date(2026, 10, 15, hour, minute, second).getTime();
let clockTime = localTime(12);
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
  await page.clock.install({ time: clockTime });
  await page.reload();
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
async function setWindowTime(hour, minute = 0, second = 0) {
  clockTime = localTime(hour, minute, second);
  await page.clock.setSystemTime(clockTime);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
}
async function choose(key, label) {
  await page.locator(`[data-setting-key="${key}"]`).getByRole('radio', { name: new RegExp(`^${label}`) }).locator('..').click();
  await page.locator('.appearance-save').filter({ hasText: '已保存' }).waitFor();
}
async function shot(name) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: path.join(output, `${name}.png`), animations: 'disabled' });
  report.screenshots.push(`${name}.png`);
}
async function surfaces(selector) {
  return page.locator(selector).evaluateAll(elements => elements.map(el => {
    const style = getComputedStyle(el);
    return { background: style.backgroundImage, filter: style.backdropFilter, border: style.borderTopColor,
      shadow: style.boxShadow, radius: style.borderTopLeftRadius, width: style.borderTopWidth };
  }));
}
function assertSurface(actual, expected) {
  assert.deepEqual([actual.background, actual.filter, actual.border, actual.shadow],
    [expected.background, expected.filter, expected.border, expected.shadow]);
  assert.ok(parseFloat(actual.radius) > 0 && parseFloat(actual.width) > 0, JSON.stringify(actual));
}
async function geometry() {
  return page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { bar: rect('.topbar'), brand: rect('.tb-brand'), middle: rect('.tb-middle'), right: rect('.tb-right'), nav: rect('.rail-nav'), settings: rect('.rbot') };
  });
}
async function layoutSnapshot(settle = true) {
  return page.evaluate(async settle => {
    if (settle) await Promise.all(document.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})));
    const selectors = ['.rail', '.main', '.main > .body', '.content', '.topbar', '.tb-brand', '.topbar .logo', '.nav-toggle',
      '.tb-middle', '.sched', '.todopill', '.tb-right', '.tb-tools', '.tb-right button', '.wbtns', '.ai-panel',
      '.dashboard-heading', '.dashboard-grid > .dashboard-widget', '.todo-workspace > .greet', '.today-board > section', '.settings-dialog'];
    return Object.fromEntries(selectors.flatMap(selector => [...document.querySelectorAll(selector)].filter(el => el.getClientRects().length).map((el, index) => {
      const r = el.getBoundingClientRect();
      return [`${selector}:${index}`, { x: r.x, y: r.y, width: r.width, height: r.height, scrollTop: el.scrollTop, scrollLeft: el.scrollLeft }];
    })));
  }, settle);
}
function assertLayout(actual, expected, context) {
  assert.deepEqual(Object.keys(actual), Object.keys(expected), context);
  for (const [selector, rect] of Object.entries(expected)) for (const key of Object.keys(rect)) {
    assert.ok(Math.abs(actual[selector][key] - rect[key]) <= .5, `${context}: ${selector}.${key}: ${rect[key]} → ${actual[selector][key]}`);
  }
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
    assert.notEqual(await page.locator('.dashboard-heading').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
  });
  if (process.argv.includes('--preview')) {
    await navigateInstalled(page, 'life', '日程和待办', 'todo');
    await shot('todo-floating-strong-windowlight');
  } else {
    await check('navigation transition moves only navigation, reverses smoothly and respects reduced motion', async () => {
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await settings(); await choose('navigationStyle', '经典');
      const before = await layoutSnapshot();
      const firstItem = page.locator('.rail-nav .ritem').first();
      const start = await firstItem.boundingBox();
      await page.evaluate(() => {
        window.navigationMotion = [];
        window.originalAnimate = Element.prototype.animate;
        Element.prototype.animate = function (keyframes, options) {
          const animation = window.originalAnimate.call(this, keyframes, options);
          if (animation.id === 'navigation-style') { animation.pause(); window.navigationMotion.push(animation); }
          return animation;
        };
      });
      try {
        await choose('navigationStyle', '悬浮');
        assert.ok(await page.evaluate(() => window.navigationMotion.length > 0), 'Style switch starts an animation');
        assert.ok(Math.abs((await firstItem.boundingBox()).y - start.y) < 1, 'First frame preserves the previous visual position');
        await page.evaluate(() => window.navigationMotion.forEach(animation => { animation.currentTime = 120; }));
        const middle = await firstItem.boundingBox();
        assert.ok(middle.y > start.y + 10, 'Navigation moves toward its centered position');
        assertLayout(await layoutSnapshot(false), before, 'During the transition');
        assert.equal(await firstItem.evaluate(el => getComputedStyle(el, '::after').opacity), '0', 'No duplicate selection marker during motion');
        assert.ok(await page.locator('.topbar').evaluate(el => { const opacity = Number(getComputedStyle(el, '::before').opacity); return opacity > 0 && opacity < 1; }), 'Glass cross-fades');
        await page.screenshot({ path: path.join(output, 'navigation-motion-midpoint.png'), animations: 'allow' });
        report.screenshots.push('navigation-motion-midpoint.png');
        await choose('navigationStyle', '经典');
        assert.ok(Math.abs((await firstItem.boundingBox()).y - middle.y) < 1, 'A rapid reversal continues from the current visual position');
        await page.evaluate(() => window.navigationMotion.filter(animation => animation.playState !== 'idle').forEach(animation => animation.finish()));
        await page.waitForFunction(() => !document.querySelector('.rail').hasAttribute('data-style-moving'));
        assertLayout(await layoutSnapshot(), before, 'After the reverse transition');
        await choose('navigationStyle', '悬浮');
        await page.emulateMedia({ reducedMotion: 'reduce' });
        await page.waitForFunction(() => !document.querySelector('.rail').hasAttribute('data-style-moving'));
        assert.ok(await page.evaluate(() => window.navigationMotion.every(animation => animation.playState === 'idle' || animation.playState === 'finished')), 'Enabling reduced motion cancels an active transition');
        const count = await page.evaluate(() => window.navigationMotion.length);
        await choose('navigationStyle', '经典');
        assert.equal(await page.evaluate(() => window.navigationMotion.length), count, 'Reduced motion switches directly');
        assertLayout(await layoutSnapshot(), before, 'Reduced motion');
      } finally {
        await page.evaluate(() => { window.navigationMotion.forEach(animation => animation.cancel()); Element.prototype.animate = window.originalAnimate; });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await closeSettings();
      }
    });
    await check('navigation styles preserve layout across 16 viewport, expansion, AI and page states', async () => {
      const win = await app.browserWindow(page);
      for (const [width, height] of [[1440, 940], [1024, 680]]) {
        await win.evaluate((win, size) => win.setContentSize(...size), [width, height]);
        for (const expanded of [false, true]) {
          if ((await page.locator('.nav-toggle').getAttribute('aria-expanded') === 'true') !== expanded) await page.locator('.nav-toggle').click();
          for (const aiOpen of [false, true]) {
            if ((await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') === 'true') !== aiOpen) await page.locator('.ai-topbar-btn').click();
            for (const view of ['home', 'todo']) {
              if (view === 'home') await navigateInstalled(page, 'home');
              else await navigateInstalled(page, 'life', '日程和待办', 'todo');
              await settings(); await choose('navigationStyle', '经典');
              const before = await layoutSnapshot();
              await choose('navigationStyle', '悬浮');
              const context = `${width}x${height}, expanded=${expanded}, ai=${aiOpen}, ${view}`;
              assertLayout(await layoutSnapshot(), before, context);
              await choose('navigationStyle', '经典');
              assertLayout(await layoutSnapshot(), before, `${context}, return to classic`);
              await closeSettings();
              if (view === 'home' && aiOpen && !expanded) {
                await shot(`navigation-${width}-classic`);
                await settings(); await choose('navigationStyle', '悬浮'); await closeSettings();
                await shot(`navigation-${width}-floating`);
              }
            }
          }
        }
      }
      await win.evaluate(win => win.setContentSize(1440, 940));
      if (await page.locator('.nav-toggle').getAttribute('aria-expanded') === 'true') await page.locator('.nav-toggle').click();
      await navigateInstalled(page, 'home');
    });
    await check('40 appearance states cover saved preferences and automatic light periods', async () => {
      await settings();
      for (const nav of ['经典', '悬浮']) {
        await choose('navigationStyle', nav);
        for (const glass of ['普通玻璃', '强玻璃']) {
          await choose('glassIntensity', glass);
          for (const theme of ['雾珀', '暖砂', '青瓷', '藤紫', '蔷薇', '燕麦', '窗影', '空间窗景']) {
            await choose('uiTheme', theme);
            if (theme === '窗影') for (const [hour, light] of [[7, 'morning'], [14, 'afternoon'], [20, 'dusk']]) {
              await setWindowTime(hour);
              await page.waitForFunction(light => document.documentElement.dataset.windowLight === light, light);
              assert.equal(await page.locator('.theme-preview[data-theme="windowlight"]').getAttribute('data-window-light'), light);
            }
            const state = await page.evaluate(async () => ({ saved: await window.workbench.settings.get(), rendered: { ...document.documentElement.dataset } }));
            assert.equal(state.saved.uiTheme, state.rendered.theme);
            assert.equal(state.saved.navigationStyle, state.rendered.navigation);
            assert.equal(state.saved.glassIntensity, state.rendered.glass);
            const [heading, ...cards] = await surfaces('.dashboard-heading, .dashboard-grid > .dashboard-widget');
            assert.ok(heading.background.includes('rgba('), 'Both materials are translucent, including normal');
            assert.ok(heading.filter.includes(glass === '普通玻璃' ? '18px' : '30px'));
            for (const card of cards) assertSurface(card, heading);
          }
        }
      }
    });
    await choose('uiTheme', '窗影');
    await check('window light follows clock boundaries without saving preferences', async () => {
      const before = await page.evaluate(() => window.workbench.settings.get());
      const status = page.locator('[data-setting-key="windowLight"]');
      assert.match(await status.innerText(), /自动/);
      assert.equal(await status.locator('input, button').count(), 0);
      for (const [hour, beforeLight, afterLight, label] of [
        [11, 'morning', 'afternoon', '午后'],
        [17, 'afternoon', 'dusk', '傍晚'],
        [5, 'dusk', 'morning', '上午'],
      ]) {
        await setWindowTime(hour, 59, 59);
        await page.waitForFunction(light => document.documentElement.dataset.windowLight === light, beforeLight);
        await page.clock.runFor(1100);
        await page.waitForFunction(light => document.documentElement.dataset.windowLight === light, afterLight);
        assert.equal(await status.getByRole('status').innerText(), `当前：${label}`);
      }
      assert.deepEqual(await page.evaluate(() => window.workbench.settings.get()), before);
      await status.scrollIntoViewIfNeeded();
      await shot('settings-windowlight-auto');
    });
    await setWindowTime(14);
    await closeSettings();
    await check('classic baseline and opaque popover keep their geometry', async () => {
      await settings(); await choose('navigationStyle', '经典'); await choose('glassIntensity', '普通玻璃'); await choose('uiTheme', '雾珀'); await closeSettings();
      await shot('home-classic-normal-mist');
      assert.notEqual(await page.locator('.topbar').evaluate(el => getComputedStyle(el, '::before').backgroundImage), 'none');
      assert.equal(await page.locator('.rail-nav-shell').evaluate(el => getComputedStyle(el, '::before').opacity), '0');
      assert.notEqual(await page.locator('.dashboard-heading').evaluate(el => getComputedStyle(el).backgroundImage), 'none');
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
    await check('normal and strong materials match across page headers, cards and workspaces', async () => {
      await settings(); await choose('uiTheme', '青瓷'); await closeSettings();
      let normal;
      for (const [label, material] of [['普通玻璃', 'normal'], ['强玻璃', 'strong']]) {
        await navigateInstalled(page, 'home');
        await settings(); await choose('glassIntensity', label); await closeSettings();
        const [reference] = await surfaces('.dashboard-heading');
        if (material === 'normal') normal = reference;
        else { assert.notEqual(reference.background, normal.background); assert.notEqual(reference.shadow, normal.shadow); }
        await shot(`home-floating-${material}-celadon`);
        for (const [workbench, name, selector, view] of [
          ['game', undefined, '.game-host .game-project, .game-host .game-preview', 'game'],
          ['life', '日程和待办', '.todo-workspace > .greet, .todo-workspace .today-board > section', 'todo'],
          ['life', '阅读清单', '.rd-heading, .rd-workspace', 'reading'],
          ['life', '每日签到', '.ci-page-header, .ci-main > .ci-panel', 'checkin'],
          ['ai-test', '测试任务', '.at-library-heading, .at-library-content', 'ai-test-tasks'],
        ]) {
          await navigateInstalled(page, workbench, name);
          await page.locator(selector).first().waitFor({ state: 'visible' });
          const panels = await surfaces(selector);
          assert.ok(panels.length >= 2, `${view} has a header and content surface`);
          for (const panel of panels) assertSurface(panel, reference);
          await shot(`${view}-floating-${material}-celadon`);
        }
      }
      await settings(); await choose('uiTheme', '窗影'); await closeSettings();
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
      await choose('uiTheme', '窗影'); await setWindowTime(20);
      await closeSettings();
    });
    const before = await page.evaluate(() => window.workbench.settings.get());
    await app.close(); app = null;
    clockTime = localTime(7);
    await launch();
    await check('settings persist and window light recomputes after full Electron restart', async () => {
      const after = await page.evaluate(() => window.workbench.settings.get());
      assert.deepEqual(after, before);
      await page.waitForFunction(() => document.documentElement.dataset.windowLight === 'morning');
      assert.equal(await page.locator('html').getAttribute('data-navigation'), 'floating');
      const afterTasks = await page.evaluate(() => window.workbench.todo.state());
      assert.deepEqual(afterTasks.tasks, taskState.tasks);
    });
    await shot('relaunch-windowlight-morning');
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
