import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { setTimeout as sleep } from 'node:timers/promises';

const require = createRequire(import.meta.url);
const { chromium } = require('C:/Myself/vibe_coding/To-Do-List/node_modules/playwright');
const root = 'C:/Myself/vibe_coding/onosan_workbench';
const electron = `${root}/node_modules/electron/dist/electron.exe`;
const port = 9244;
const child = spawn(electron, [`--remote-debugging-port=${port}`, '.'], {
  cwd: root,
  stdio: 'ignore',
  env: { ...process.env, WORKBENCH_ISOLATED: '1' },
});
let browser;

async function metrics(page, selector) {
  return page.evaluate((target) => {
    const el = document.querySelector(target);
    const box = el?.getBoundingClientRect();
    return {
      selector: target,
      fontSize: el ? getComputedStyle(el).fontSize : null,
      fontFamily: el ? getComputedStyle(el).fontFamily : null,
      right: box ? Math.round(box.right) : null,
      viewport: innerWidth,
      documentOverflow: document.documentElement.scrollWidth > innerWidth + 1,
    };
  }, selector);
}

try {
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try {
      ready = (await fetch(`http://127.0.0.1:${port}/json/version`)).ok;
      if (ready) break;
    } catch {}
    await sleep(500);
  }
  if (!ready) throw new Error('Electron CDP did not start');
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const page = browser.contexts()[0].pages().find((p) => !p.url().startsWith('devtools:'));
  if (!page) throw new Error('App page missing');
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1024, height: 680 });
  await page.locator('.todo-actions').waitFor({ timeout: 12000 });
  await page.locator('.rail .ritem[title="设置"]').click();
  await page.locator('.tree .nsub').filter({ hasText: '外观' }).click();
  await page.locator('.theme-card').filter({ hasText: '雾灰 · 墨点' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'mist');
  await page.locator('.rail .ritem[title="首页"]').click();
  await page.locator('.todo-actions').waitFor();
  await sleep(250);

  const results = {};
  results.homeMist = await metrics(page, '.greet h1');
  results.todoTitle = await metrics(page, '.plan-title b');
  await page.screenshot({ path: `${root}/test-results/typography-home-mist-1024.png` });

  await page.locator('.todo-actions').getByText('新增待办').click();
  await page.locator('.task-create-modal').waitFor();
  await sleep(300);
  results.todoForm = await metrics(page, '.task-create-modal .modal-heading h2');
  await page.screenshot({ path: `${root}/test-results/typography-todo-form-1024.png` });
  await page.keyboard.press('Escape');
  await page.locator('.task-create-modal').waitFor({ state: 'detached' });

  await page.evaluate(() => window.workbench.bazi.saveProfile({ id: 'typography-fixture', name: '示例', gender: 1, date: '1990-08-16', time: '14:30' }));
  await page.locator('.rail .ritem[title="小工具"]').click();
  await page.locator('.bazi-pgan').first().waitFor({ timeout: 12000 });
  await sleep(300);
  results.baziPillar = await metrics(page, '.bazi-pgan');
  results.baziMeta = await metrics(page, '.bazi-plabel');
  await page.screenshot({ path: `${root}/test-results/typography-bazi-1024.png` });

  await page.locator('.rail .ritem[title="自媒体工作台"]').click();
  await page.locator('.copy-wrap').waitFor();
  await page.locator('.copy-new').click();
  await page.locator('.copy-title').waitFor();
  await sleep(300);
  results.copyTitle = await metrics(page, '.copy-title');
  results.copyBody = await metrics(page, '.copy-body');
  await page.screenshot({ path: `${root}/test-results/typography-copy-1024.png` });

  await page.locator('.rail .ritem[title="设置"]').click();
  await page.locator('.tree .nsub').filter({ hasText: '外观' }).click();
  await sleep(300);
  results.settingsTitle = await metrics(page, '.page-head h1');
  await page.screenshot({ path: `${root}/test-results/typography-settings-1024.png` });
  await page.locator('.theme-card').filter({ hasText: '晴蓝 A+' }).click();
  await page.waitForFunction(() => document.documentElement.dataset.theme === 'sunny');
  await page.locator('.rail .ritem[title="首页"]').click();
  await page.locator('.todo-actions').waitFor();
  await sleep(300);
  results.homeSunny = await metrics(page, '.greet h1');
  await page.screenshot({ path: `${root}/test-results/typography-home-sunny-1024.png` });
  await page.getByTitle('AI 助手').first().click();
  await page.locator('.ai-panel').waitFor();
  await sleep(300);
  results.aiEmpty = await metrics(page, '.ai-empty b');
  await page.screenshot({ path: `${root}/test-results/typography-ai-sunny-1024.png` });
  await page.getByTitle('AI 助手').first().click();
  await page.setViewportSize({ width: 1280, height: 820 });
  results.homeSunny1280 = await metrics(page, '.greet h1');
  await page.screenshot({ path: `${root}/test-results/typography-home-sunny-1280.png` });
  console.log(JSON.stringify({ results, errors }));
} finally {
  await browser?.close();
  child.kill();
}
