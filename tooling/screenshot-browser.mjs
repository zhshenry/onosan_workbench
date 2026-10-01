// 隔离 Electron 验证浏览器可用面积:node tooling/screenshot-browser.mjs before|after
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const phase = process.argv[2] === 'before' ? 'before' : 'after';
const port = 9341;
const child = spawn(require('electron'), ['.', `--remote-debugging-port=${port}`, '--inspect=9342'], {
  stdio: 'ignore', env: { ...process.env, WORKBENCH_ISOLATED: '1' },
});
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
let mainWs;
try {
  let page;
  for (let i = 0; i < 50 && !page; i++) {
    await wait(300);
    try {
      page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page');
    } catch { /* 等待调试端口 */ }
  }
  if (!page) throw new Error('Electron page not found');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve) => { ws.onopen = resolve; });
  let seq = 0;
  const pending = new Map();
  const errors = [];
  ws.onmessage = ({ data }) => {
    const msg = JSON.parse(data);
    if (msg.id) { pending.get(msg.id)?.(msg); pending.delete(msg.id); }
    if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails);
  };
  const send = (method, params = {}) => new Promise((resolve) => {
    const id = ++seq; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
  const mainTarget = (await (await fetch('http://127.0.0.1:9342/json/list')).json())[0];
  mainWs = new WebSocket(mainTarget.webSocketDebuggerUrl);
  await new Promise(resolve => { mainWs.onopen = resolve; });
  const mainPending = new Map();
  mainWs.onmessage = ({ data }) => { const msg = JSON.parse(data); mainPending.get(msg.id)?.(msg); mainPending.delete(msg.id); };
  const resize = (width, height) => new Promise((resolve, reject) => {
    const id = ++seq;
    mainPending.set(id, msg => msg.result?.exceptionDetails ? reject(new Error(JSON.stringify(msg))) : resolve());
    mainWs.send(JSON.stringify({ id, method:'Runtime.evaluate', params:{ expression:`process.mainModule.require('electron').BrowserWindow.getAllWindows().find(w => w.webContents.getURL().startsWith('file:')).setSize(${width},${height})` } }));
  });
  await send('Runtime.enable');
  for (let i = 0; i < 30; i++) {
    if (await evaluate(`Boolean(document.querySelector('[data-workbench="media"]'))`)) break;
    await wait(300);
  }
  await evaluate(`document.querySelector('[data-workbench="media"]').click()`);
  await wait(700);
  await evaluate(`Array.from(document.querySelectorAll('.nsub')).find(el => /素材浏览器|我的小红书/.test(el.textContent))?.click()`);
  await wait(600);
  await evaluate(`Array.from(document.querySelectorAll('.media-browser-modes button')).find(el => el.textContent === '我的小红书')?.click()`);
  await wait(3000);
  const rows = [];
  mkdirSync('design/mockups/_shots', { recursive: true });
  for (const [width, height, theme] of [[1280, 820, 'mist'], [1024, 680, 'cool'], [1600, 1000, 'warm']]) {
    await resize(width, height);
    await evaluate(`document.documentElement.dataset.theme = '${theme}'`);
    await wait(600);
    const metrics = await evaluate(`(async () => {
      const rect = selector => { const e = document.querySelector(selector); if (!e) return null; const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height, bottom:r.bottom }; };
      const c = document.querySelector('.content');
      const guestViewport = await document.querySelector('webview').executeJavaScript('({width:innerWidth,height:innerHeight})').catch(() => null);
      return { viewport:[innerWidth,innerHeight], stage:rect('.mbp-stage'), guest:rect('webview'), guestViewport, content:rect('.content'), overflow:c.scrollHeight-c.clientHeight, heading:document.querySelector('#view-media-browser h1')?.textContent };
    })()`);
    rows.push({ theme, ...metrics });
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(`design/mockups/_shots/browser-${phase}-${width}.png`, Buffer.from(shot.result.data, 'base64'));
  }
  writeFileSync(`design/mockups/_shots/browser-${phase}.json`, JSON.stringify({ rows, errors }, null, 2));
  console.log(JSON.stringify({ rows, rendererErrors:errors.length }));
  if (phase === 'after' && rows.some(r => !r.guest || !r.guestViewport || r.overflow > 1 || r.stage.bottom > r.content.bottom || r.stage.height < r.content.height * 0.7 || Math.abs(r.guestViewport.height-r.guest.height) > 2)) throw new Error('Browser does not fill available space');
  if (phase === 'after') {
    await evaluate(`document.querySelector('.media-browser-header button').click()`);
    await wait(600);
    const browse = await evaluate(`({ heading:document.querySelector('.media-browser-header h1').textContent, capture:!!document.querySelector('.mbp-capbtn'), ai:!!document.querySelector('[title^="AI 看这页"]') })`);
    if (browse.heading !== '找素材' || !browse.capture || !browse.ai) throw new Error('Secondary material browser unavailable');
    await evaluate(`document.querySelector('.media-browser-header button').click()`);
    await wait(1000);
    const creator = await evaluate(`({ heading:document.querySelector('.media-browser-header h1').textContent, capture:!!document.querySelector('.mbp-capbtn'), ai:!!document.querySelector('[title^="AI 看这页"]'), partition:document.querySelector('webview')?.getAttribute('partition') })`);
    if (creator.heading !== '我的小红书' || creator.capture || creator.ai || !creator.partition?.includes('xhs-creator')) throw new Error('Creator mode isolation changed');
    await evaluate(`document.querySelector('.ai-topbar-btn[aria-expanded="true"]')?.click()`);
    await resize(1280, 820);
    await wait(700);
    const shot = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync('design/mockups/_shots/browser-after-focused.png', Buffer.from(shot.result.data, 'base64'));
    console.log(JSON.stringify({ browse, creator }));
  }
  if (errors.length) throw new Error('Renderer exceptions');
} finally {
  ws?.close();
  mainWs?.close();
  child.kill();
}
