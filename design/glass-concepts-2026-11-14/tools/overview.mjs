// 拼总览图。
// node overview.mjs          → shots/overview-home.png、overview-todo.png（四套方案 2×2，读取 *@2x.png）
// node overview.mjs nav      → shots/overview-nav.png（E 的导航状态 2×2）与 shots/nav-closeup.png（侧边栏三态特写）
import { chromium } from 'playwright';
import { writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const shots = fileURLToPath(new URL('../shots/', import.meta.url));
const browser = await chromium.launch({ channel: 'msedge' });

async function compose(name, columns, tileWidth, tileHeight, tiles) {
  const gap = 24, caption = 34;
  const rows = Math.ceil(tiles.length / columns);
  const width = gap + columns * (tileWidth + gap), height = gap + rows * (caption + tileHeight + gap);
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1.25 });
  const html = `<!doctype html><meta charset="utf-8"><style>
    body { margin: 0; padding: ${gap}px; background: #17181b; font: 600 17px 'Segoe UI Variable Text', 'Microsoft YaHei UI', sans-serif; color: #f1f2f5;
      display: grid; grid-template-columns: repeat(${columns}, ${tileWidth}px); gap: ${gap}px; }
    figure { margin: 0; } figcaption { height: ${caption}px; display: flex; align-items: center; }
    img { display: block; width: ${tileWidth}px; height: ${tileHeight}px; border-radius: 8px; box-shadow: 0 0 0 1px rgba(255,255,255,.08); }
  </style>${tiles.map(([file, label]) => `<figure><figcaption>${label}</figcaption><img src="${file}"></figure>`).join('')}`;
  const temp = `${shots}_${name}.html`;
  writeFileSync(temp, html);
  await page.goto(pathToFileURL(temp).href, { waitUntil: 'load' });
  await page.screenshot({ path: `${shots}${name}.png` });
  rmSync(temp);
  await page.close();
  console.log(`${shots}${name}.png`);
}

if (process.argv[2] === 'nav') {
  await compose('overview-nav', 2, 820, 525, [
    ['e-home@2x.png', '导航收起 · 首页'],
    ['e-flyout@2x.png', '导航收起 · 悬停「网页工作台」弹出悬浮目录'],
    ['e-nav-open-todo@2x.png', '导航展开 · 日程待办（AI 栏收起）'],
    ['e-nav-open-home-ai@2x.png', '导航展开 · 首页（AI 栏打开，看板改两列）'],
  ]);
  await compose('nav-closeup', 3, 330, 584, [
    ['nav-collapsed@2x.png', '收起'],
    ['nav-flyout@2x.png', '收起 · 悬浮目录'],
    ['nav-expanded@2x.png', '展开'],
  ]);
} else {
  const names = { a: 'A　窗影 · 磨砂隔断', b: 'B　空间窗景', c: 'C　午夜线路', d: 'D　轻雾玻璃（行业标准对照）' };
  for (const view of ['home', 'todo']) {
    await compose(`overview-${view}`, 2, 820, 525, ['a', 'b', 'c', 'd'].map(s => [`${s}-${view}@2x.png`, names[s]]));
  }
}
await browser.close();
