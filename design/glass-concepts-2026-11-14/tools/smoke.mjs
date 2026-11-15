// 方案稿交互冒烟：导航开合、AI 栏开关、悬浮目录与切页。
import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`${pathToFileURL(`${root}index.html`).href}?scheme=e&page=home`, { waitUntil: 'load' });
const win = () => page.evaluate(() => ({ ...document.querySelector('.win').dataset, flyout: document.querySelector('.rflyout').classList.contains('show'), title: document.querySelector('.rflyout h4').textContent }));
const checks = [];
const expect = (label, ok) => checks.push(`${ok ? 'PASS' : 'FAIL'}  ${label}`);

await page.hover('.ritem[data-wb="web"]');
await page.waitForTimeout(250);
let s = await win();
expect('收起时悬停网页工作台弹出悬浮目录', s.flyout && s.title === '网页工作台');
await page.hover('.fsub:nth-child(2)');
await page.waitForTimeout(300);
expect('指针移入悬浮目录后保持显示', (await win()).flyout);
await page.mouse.move(1500, 900);
await page.waitForTimeout(400);
expect('指针离开后悬浮目录收起', !(await win()).flyout);

await page.click('.ritem[data-wb="life"]');
await page.waitForTimeout(250);
s = await win();
expect('点击小工具进入日程待办并保留悬浮目录', s.page === 'todo' && s.flyout);
await page.click('.nav-toggle');
await page.waitForTimeout(400);
s = await win();
expect('顶栏按钮展开导航，悬浮目录随之关闭', s.nav === 'expanded' && !s.flyout);
const frame = await page.evaluate(() => {
  const content = document.querySelector('.content').getBoundingClientRect(), rail = document.querySelector('.rail').getBoundingClientRect();
  return { railWidth: Math.round(rail.width), contentLeft: Math.round(content.left - document.querySelector('.win').getBoundingClientRect().left) };
});
expect(`展开后导航宽 200、内容窗左缘 226（实测 ${frame.railWidth} / ${frame.contentLeft}）`, frame.railWidth === 200 && frame.contentLeft === 226);
await page.hover('.ritem[data-wb="web"]');
await page.waitForTimeout(250);
expect('展开时悬停不再弹出悬浮目录', !(await win()).flyout);
await page.click('.ai-btn');
await page.waitForTimeout(350);
expect('顶栏 AI 按钮关闭 AI 栏', (await win()).ai === 'closed');
await page.click('.rsub[data-view="todo"]');
await page.click('.ritem[data-wb="home"]');
await page.waitForTimeout(250);
expect('点击首页回到看板', (await win()).page === 'home');
expect('地址栏记录当前状态', page.url().includes('nav=expanded') && page.url().includes('ai=closed'));

console.log(checks.join('\n'));
await browser.close();
if (checks.some(line => line.startsWith('FAIL'))) process.exit(1);
