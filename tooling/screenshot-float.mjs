// 悬浮窗截图:node tooling/screenshot-float.mjs [输出路径] [ai|home] [collapsed]
// 隔离实例启动 → 主窗调 float.toggle() 打开悬浮窗 → 切到指定模式后 CDP 截图。
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { get } from 'node:http';
import { writeFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const out = process.argv[2] || 'design/mockups/_shots/float.png';
const mode = process.argv[3] || 'home';
const collapsed = process.argv.includes('collapsed');
const port = 9224;
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

const connect = async (target) => {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((r) => (ws.onopen = r));
  let seq = 0;
  const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  return {
    send: (method, params = {}) => new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    }),
    close: () => ws.close(),
  };
};

// 1. 等主窗 ready
let main = null;
for (let i = 0; i < 40 && !main; i++) {
  await wait(400);
  main = (await getList()).find((t) => t.type === 'page' && !t.url.includes('window=float'));
}
if (!main) { console.log('ERROR: main page not found'); child.kill(); process.exit(1); }
const mainPage = await connect(main);
await mainPage.send('Runtime.enable');
for (let i = 0; i < 30; i++) {
  await wait(500);
  const check = await mainPage.send('Runtime.evaluate', { expression: "document.querySelector('.todo-actions') ? 'ready' : 'no'" });
  if (check.result?.result?.value === 'ready') break;
}
// 2. 打开悬浮窗,等待其 page target 出现
await mainPage.send('Runtime.evaluate', { expression: "window.workbench.float.toggle()" });
let float = null;
for (let i = 0; i < 30 && !float; i++) {
  await wait(400);
  float = (await getList()).find((t) => t.type === 'page' && t.url.includes('window=float'));
}
if (!float) { console.log('ERROR: float page not found'); mainPage.close(); child.kill(); process.exit(1); }
const page = await connect(float);
await page.send('Runtime.enable');

// 3. 等悬浮窗渲染,切模式
for (let i = 0; i < 30; i++) {
  await wait(500);
  const check = await page.send('Runtime.evaluate', { expression: "document.querySelector('.float-app') ? 'ready' : 'no'" });
  if (check.result?.result?.value === 'ready') break;
}
if (collapsed) {
  await page.send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.float-bar-btn')).find((b) => b.title === '收起为卡片')?.click()` });
  await wait(500);
}
if (mode === 'ai') {
  await page.send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.float-bar-btn')).find((b) => b.title === 'AI 助手')?.click()` });
  await wait(600);
  if (process.argv.includes('picker')) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.fa-surface .ai-add-reference')?.click()` });
    await wait(400);
  }
  if (process.argv.includes('model')) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.fa-model-toggle')?.click()` });
    await wait(400);
  }
  if (process.argv.includes('modelpick')) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.fa-model-toggle')?.click()` });
    await wait(400);
    await page.send('Runtime.evaluate', { expression: `Array.from(document.querySelectorAll('.fa-model-menu section > button')).find((b) => !b.classList.contains('is-active'))?.click()` });
    await wait(600);
  }
  if (process.argv.includes('modeldd')) {
    await page.send('Runtime.evaluate', { expression: `document.querySelector('.fa-surface .ai-model-select .select-trigger')?.click()` });
    await wait(400);
  }
  if (process.argv.includes('inject')) {
    // 静态注入建议卡/反问卡样例:验证两类卡片在悬浮窗内的视觉形态(不走 React 状态)
    await page.send('Runtime.evaluate', { expression: `(() => {
      const list = document.querySelector('.ai-messages');
      if (!list) return 'no list';
      list.insertAdjacentHTML('beforeend', [
        '<div class="ai-proposal"><div class="ai-proposal-head">请确认以下 2 项操作</div>',
        '<label class="ai-proposal-item"><input type="checkbox" checked><span class="ai-proposal-verb">新增待办</span><span class="ai-proposal-detail">写周报 · 2026-10-02 09:00:00</span></label>',
        '<label class="ai-proposal-item danger"><input type="checkbox"><span class="ai-proposal-verb">删除事项</span><span class="ai-proposal-detail">3f2504e0</span></label>',
        '<div class="ai-proposal-actions"><button class="ai-apply">应用所选</button><button class="ai-discard">保留原内容</button></div></div>',
        '<div class="fa-askcard"><p class="fa-question">这条待办需要设置提醒吗?</p>',
        '<div class="fa-options"><button><span class="fa-radio"></span><span>前一天晚上提醒</span></button><button><span class="fa-radio"></span><span>不需要提醒</span></button></div>',
        '<form class="fa-ask-input"><input placeholder="输入回答…"><button type="button">提交</button></form>',
        '<footer class="fa-foot"><span>已暂停 · 等待回答</span><button>跳过</button></footer></div>',
      ].join(''));
      list.scrollTop = list.scrollHeight;
      return 'injected';
    })()` });
    await wait(400);
  }
}

// 4. 截图 + 输出关键几何信息
await wait(800);
const info = await page.send('Runtime.evaluate', { expression: `JSON.stringify((() => {
  const rect = (sel) => { const el = document.querySelector(sel); if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) }; };
  return { surface: rect('.fa-surface'), messages: rect('.fa-surface .ai-messages'), compose: rect('.fa-compose'), picker: rect('.fa-picker-list'), answer: rect('.fa-answer'), innerHeight: window.innerHeight };
})())` });
console.log('geometry', info.result?.result?.value);
const shot = await page.send('Page.captureScreenshot', { format: 'png' });
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log('saved', out);
page.close();
mainPage.close();
child.kill();
process.exit(0);
