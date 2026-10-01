// 对真实应用截图:node tooling/screenshot.mjs [输出路径] [mist|cool|warm] [appearance] [compact]
// 以隔离实例启动 Electron(独立 userData,不与正在运行的 dev 实例冲突),
// 等待 React 渲染出待办内容后,通过 CDP 的 Page.captureScreenshot 抓取画面。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { get } from 'node:http';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const out = process.argv[2] || 'design/mockups/_shots/app.png';
const theme = process.argv[3];
const view = process.argv[4];
const size = process.argv[5];
if (theme && !['mist', 'cool', 'warm'].includes(theme)) throw new Error(`未知主题:${theme}`);
if (view && view !== 'appearance') throw new Error(`未知页面:${view}`);
if (size && size !== 'compact') throw new Error(`未知尺寸:${size}`);
const port = 9223;
const child = spawn(require('electron'), ['.', `--remote-debugging-port=${port}`], {
  stdio: 'ignore',
  env: { ...process.env, WORKBENCH_ISOLATED: '1' },
});

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const getList = () =>
  new Promise((resolve) => {
    get({ host: '127.0.0.1', port, path: '/json/list' }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve([]); } });
    }).on('error', () => resolve([]));
  });

let page;
for (let i = 0; i < 40; i++) {
  await wait(400);
  const targets = await getList();
  page = targets.find((t) => t.type === 'page');
  if (page) break;
}
if (!page) { console.log('ERROR: page not found'); child.kill(); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((r) => (ws.onopen = r));
let seq = 0;
const pending = new Map();
const errors = [];
ws.onmessage = (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') errors.push(JSON.stringify(msg.params?.exceptionDetails ?? {}).slice(0, 400));
};
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++seq;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send('Runtime.enable');
if (size === 'compact') await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 680, deviceScaleFactor: 1, mobile: false });

let ready = false;
for (let i = 0; i < 30; i++) {
  await wait(500);
  const check = await send('Runtime.evaluate', { expression: "document.querySelector('.todo-actions') ? 'ready' : document.body.innerText.slice(0, 60)" });
  const value = check.result?.result?.value ?? '';
  if (value === 'ready') { ready = true; break; }
  if (i === 29) console.log('not ready, last body text:', value);
}
await wait(600);
if (view === 'appearance') {
  await send('Runtime.evaluate', { expression: `document.querySelector('button[title="设置"]')?.click()` });
  await wait(300);
  await send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.tree .nsub')).find((item) => item.textContent.trim() === '外观')?.click()` });
  await wait(500);
  if (theme) {
    const labels = { mist: '雾灰 · 轻雾', cool: '冷灰 · 凝霜', warm: '暖砂 · 柔雾' };
    await send('Runtime.evaluate', { expression: `document.querySelector('[role="radio"][aria-label=${JSON.stringify(labels[theme])}]')?.click()` });
    await wait(400);
  }
  const state = await send('Runtime.evaluate', { expression: `JSON.stringify({ options: document.querySelectorAll('.theme-card').length, selected: document.querySelector('.theme-card[aria-checked="true"]')?.getAttribute('aria-label'), theme: document.documentElement.dataset.theme })` });
  console.log('appearance', state.result?.result?.value);
} else if (theme) {
  await send('Runtime.evaluate', { expression: `document.documentElement.dataset.theme = ${JSON.stringify(theme)}` });
}

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 0, y: 0 });
await send('Runtime.evaluate', { awaitPromise: true, expression: `(async () => {
  await document.fonts.ready;
  const background = getComputedStyle(document.querySelector('.win'), '::before').backgroundImage;
  const url = background.startsWith('url(') ? background.slice(4, -1).replaceAll('"', '').replaceAll("'", '') : null;
  if (url) { const image = new Image(); image.src = url; await image.decode(); }
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.getTiming().iterations !== Infinity).map((animation) => animation.finished.catch(() => {})));
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
})()` });
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(ready ? 'saved' : 'saved (page not fully ready)', out);
if (errors.length) console.log('renderer exceptions:', errors[0]);
ws.close();
child.kill();
process.exit(0);
