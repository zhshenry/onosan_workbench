// 用本机 Edge 截取方案稿（1280×820 视口）。
// 整页：node design/glass-concepts-2026-11-14/tools/shoot.mjs [scale] [scheme...]
// 局部：node design/glass-concepts-2026-11-14/tools/shoot.mjs detail <scheme> <page> <x> <y> <w> <h> [light]
// 方案页：node design/glass-concepts-2026-11-14/tools/shoot.mjs deck <scheme> <page> [width] [height]
// 状态：node design/glass-concepts-2026-11-14/tools/shoot.mjs state <name> <query> [scale]，如 state e-nav-open "scheme=e&page=todo&nav=expanded&ai=closed"
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const out = `${root}shots`;
mkdirSync(out, { recursive: true });
const url = pathToFileURL(`${root}index.html`).href;
const args = process.argv.slice(2);
const browser = await chromium.launch({ channel: 'msedge' });

async function open(scale, query, viewport = { width: 1280, height: 820 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale });
  await page.goto(`${url}?${query}`, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(250);
  return page;
}

if (args[0] === 'detail') {
  const [, scheme, view, x, y, w, h, light = 'afternoon'] = args;
  const page = await open(2, `shot=1&scheme=${scheme}&page=${view}&light=${light}`);
  const file = `${out}/detail-${scheme}-${view}-${x}-${y}.png`;
  await page.screenshot({ path: file, clip: { x: +x, y: +y, width: +w, height: +h } });
  console.log(file);
} else if (args[0] === 'state') {
  const [, name, query, scale = '1', x, y, w, h] = args;
  const page = await open(+scale, `shot=1&${query}`);
  const file = `${out}/${name}${scale === '1' ? '' : `@${scale}x`}.png`;
  await page.screenshot({ path: file, ...(w ? { clip: { x: +x, y: +y, width: +w, height: +h } } : {}) });
  console.log(file);
} else if (args[0] === 'deck') {
  const [, scheme = 'a', view = 'home', width = '1920', height = '1080'] = args;
  const page = await open(1, `scheme=${scheme}&page=${view}`, { width: +width, height: +height });
  const file = `${out}/deck-${scheme}-${view}.png`;
  await page.screenshot({ path: file });
  console.log(file);
} else {
  const scale = Number(args[0] ?? 1);
  const schemes = args.slice(1).length ? args.slice(1) : ['a', 'b', 'c', 'd'];
  for (const scheme of schemes) {
    for (const view of ['home', 'todo']) {
      const page = await open(scale, `shot=1&scheme=${scheme}&page=${view}`);
      const file = `${out}/${scheme}-${view}${scale === 1 ? '' : `@${scale}x`}.png`;
      await page.screenshot({ path: file });
      await page.close();
      console.log(file);
    }
  }
}
await browser.close();
