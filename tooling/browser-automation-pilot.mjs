// Permanent regression pilot. Only synthetic HTTP pages/model responses and an isolated appData are used.
// Playwright is a development harness; production browser control uses the guest CDP adapter.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import { _electron as electron } from 'playwright';

const require = createRequire(import.meta.url);
const root = path.resolve('.');
const output = await mkdtemp(path.join(tmpdir(), 'ono-browser-pilot-'));
const checks = [], errors = [], requests = [];
const consoleMessages = [];
const layouts = [];
let application, page, base, other;
let holdModel, releaseModel;
const creatorTitle = '浏览器协作验收文章 A', creatorBody = '这段合成正文只属于文章 A，用于验证同一对话填写网页。';
const html = route => `<!doctype html><meta charset="utf-8"><title>浏览器合成测试 ${route}</title>
<style>body{font:16px/1.6 sans-serif;margin:18px;background:#f4f6fa;color:#172335;min-height:1400px}button,input,select{font:inherit;padding:8px;margin:4px}iframe{width:460px;height:120px;display:block}#canvas{border:1px solid gray}#block{position:fixed;inset:0;background:#fff8;z-index:100;display:none}#drag{width:40px;height:40px;background:#789;touch-action:none}</style>
${route === '/frame' ? '<button id="frameButton" onclick="this.textContent=\'框架已点击\'">框架按钮</button>' : `<h1>浏览器控制合成页面</h1><p>仅测试数据，无真实账号与发布。</p>
<label for="name">测试名称</label><input id="name"><button id="save">保存测试</button><p id="result" role="status">尚未保存</p>
<label for="choice">测试选项</label><select id="choice"><option value="a">选项甲</option><option value="b">选项乙</option></select><label><input id="check" type="checkbox">公开测试</label>
<button id="popup" onclick="window.open('/popup','_blank')">打开弹窗标签</button><a id="next" href="/next">下一页</a>
<div id="shadow"></div><canvas id="canvas" width="340" height="64" aria-label="合成画布"></canvas><div id="drag" role="button" aria-label="拖动目标"></div><div id="secret-host" style="position:fixed;right:8px;bottom:8px"></div>
<iframe src="/frame" title="同源框架"></iframe><iframe src="${other}/frame" title="跨站框架"></iframe><div id="block"></div>
<textarea id="multiline" aria-label="多行测试">已有多行内容</textarea><div id="editable" contenteditable="true" role="textbox" aria-label="富文本测试">已有富文本内容</div>
<script>
window.fixture={nonce:crypto.randomUUID(),clicks:0,trusted:false,canvas:0,drag:0};
document.getElementById('save').onclick=e=>{fixture.clicks++;fixture.trusted=e.isTrusted;document.getElementById('result').textContent='保存成功：'+document.getElementById('name').value};
const shadow=document.getElementById('shadow').attachShadow({mode:'closed'});const sb=document.createElement('button');sb.textContent='影子按钮';sb.onclick=()=>sb.textContent='影子已点击';shadow.append(sb);
const secretRoot=document.getElementById('secret-host').attachShadow({mode:'closed'}),secret=document.createElement('input');secret.type='password';secret.setAttribute('aria-label','隐藏密码');secret.value='SYNTHETIC_SECRET_SENTINEL';secretRoot.append(secret);window.focusSecret=()=>secret.focus();
const c=document.getElementById('canvas');c.getContext('2d').fillText('点击画布测试',24,32);c.onclick=e=>{fixture.canvas++;fixture.trusted=e.isTrusted};
document.getElementById('drag').onpointerdown=e=>{fixture.drag++};document.getElementById('drag').onpointermove=e=>{if(e.buttons===1)fixture.dragMoves=(fixture.dragMoves||0)+1};
localStorage.setItem('fixture','persistent');console.log('fixture-loaded');
</script>`}`;

function toolResponse(name, args) {
  return { id: `chat-${Date.now()}`, object: 'chat.completion', created: Math.floor(Date.now()/1000), model: 'browser-fixture', choices: [{ index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: `call-${requests.length}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } };
}
function answer(text) { return { id: 'reply', object: 'chat.completion', created: Math.floor(Date.now()/1000), model: 'browser-fixture', choices: [{ index: 0, message: { role: 'assistant', content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }; }
const server = createServer(async (request, response) => {
  try {
    if (request.url === '/v1/chat/completions') {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()); requests.push(body);
      if (holdModel) await new Promise(resolve => { releaseModel = resolve; });
      const tools = body.messages.filter(message => message.role === 'tool');
      const last = tools.at(-1), parsed = last ? JSON.parse(typeof last.content === 'string' ? last.content : last.content.filter(part => part.type === 'text').map(part => part.text).join('\n')) : undefined;
      const lastCall = [...body.messages].reverse().find(message => message.tool_calls)?.tool_calls?.at(-1)?.function?.name;
      let result;
      const userContent = [...body.messages].reverse().find(message => message.role === 'user')?.content;
      const userText = typeof userContent === 'string' ? userContent : (userContent ?? []).filter(part => part.type === 'text').map(part => part.text).join('\n');
      const navigation = userText.includes('跨站弹窗测试');
      if (parsed?.ok === false) {
        const lastArgs = JSON.parse([...body.messages].reverse().find(message => message.tool_calls).tool_calls.at(-1).function.arguments);
        result = toolResponse('browser_observe', { tabId: lastArgs.tabId, screenshot: false });
      } else if (userText.includes('先澄清测试')) result = answer('请确认测试名称是否为 AI 中文验证。');
      else if (userText.includes('博客网页协作测试')) {
        assert.ok(body.tools.some(tool => tool.function.name === 'propose_edit') && body.tools.some(tool => tool.function.name === 'browser_act'));
        assert.ok(JSON.stringify(body.messages).includes(creatorTitle) && JSON.stringify(body.messages).includes(creatorBody));
        if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
        else if (lastCall === 'browser_tabs') result = toolResponse('browser_observe', { tabId: parsed[0].id });
        else if (lastCall === 'browser_observe') result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'locator', query: { selector: { by: 'label', value: '文章标题' } }, action: { type: 'fill', text: creatorTitle } } });
        else if (lastCall === 'browser_act' && parsed.elements.find(element => element.name === '文章正文')?.value !== creatorBody) result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'locator', query: { selector: { by: 'label', value: '文章正文' } }, action: { type: 'fill', text: creatorBody } } });
        else if (lastCall === 'browser_act') result = toolResponse('browser_check', { tabId: parsed.tab.id, condition: { type: 'locator', query: { selector: { by: 'label', value: '文章正文' } }, value: creatorBody, count: 1 } });
        else { assert.equal(parsed.passed, true); result = answer('已把文章 A 的标题和正文填入当前网页并核验，未发布。'); }
      } else if (navigation) {
        if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
        else if (lastCall === 'browser_tabs' && tools.length === 1) result = toolResponse('browser_observe', { tabId: parsed[0].id });
        else if (lastCall === 'browser_observe') result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'click', ref: parsed.elements.find(element => element.name === '打开弹窗标签').ref } });
        else if (lastCall === 'browser_act') result = toolResponse('browser_tabs', { operation: 'list' });
        else if (lastCall === 'browser_tabs') {
          const popup = parsed.find(tab => tab.url.includes('/popup'));
          result = popup ? toolResponse('browser_navigate', { tabId: popup.id, url: `${other}/landing` }) : toolResponse('browser_tabs', { operation: 'list' });
        } else if (lastCall === 'browser_navigate') result = toolResponse('browser_check', { tabId: parsed.tab.id, condition: { type: 'url', text: `${other}/landing` } });
        else if (lastCall === 'browser_check') { assert.equal(parsed.passed, true); result = answer('已验证弹窗标签的跨站地址。'); }
        else result = answer(`跨站合成测试错误：${JSON.stringify(parsed)}`);
      } else if (userText.includes('标签开关测试')) {
        if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
        else if (tools.length === 1) result = toolResponse('browser_tabs', { operation: 'open', url: `${base}/opened` });
        else if (tools.length === 2) result = toolResponse('browser_tabs', { operation: 'select', tabId: parsed.find(tab => tab.url.includes('/opened')).id });
        else if (tools.length === 3) result = toolResponse('browser_tabs', { operation: 'close', tabId: parsed.find(tab => tab.url.includes('/opened')).id });
        else if (tools.length === 4) result = toolResponse('browser_check', { tabId: parsed[0].id, condition: { type: 'url', text: `${base}/form` } });
        else result = answer('标签开关测试完成。');
      } else if (userText.includes('空白页打开测试')) {
        if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
        else if (!parsed.length && lastCall === 'browser_tabs') result = toolResponse('browser_tabs', { operation: 'open', url: `${base}/chat-start` });
        else if (lastCall === 'browser_tabs') result = toolResponse('browser_check', { tabId: parsed[0].id, condition: { type: 'url', text: `${base}/chat-start` } });
        else result = answer('已从右侧对话打开并核验指定网页。');
      } else if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
      else if (lastCall === 'browser_tabs') result = toolResponse('browser_observe', { tabId: parsed[0].id, screenshot: body.model.includes('vision'), query: { selector: { by: 'role', value: 'textbox', name: '测试名称' } } });
      else if (lastCall === 'browser_observe') {
        const input = parsed.elements.find(element => element.role === 'textbox' && element.name === '测试名称');
        assert.ok(input, 'Model fixture must receive the actual observed input');
        result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'fill', ref: input.ref, text: 'AI 中文验证' } });
      } else if (lastCall === 'browser_act' && parsed.elements) {
        if (!parsed.text.includes('保存成功：AI 中文验证')) {
          const button = parsed.elements.find(element => element.role === 'button' && element.name === '保存测试');
          result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'click', ref: button.ref } });
        } else result = toolResponse('browser_wait', { tabId: parsed.tab.id, condition: { type: 'text', text: '保存成功：AI 中文验证' }, timeoutMs: 1000 });
      } else if (lastCall === 'browser_wait') { assert.equal(parsed.passed, true); result = toolResponse('browser_check', { tabId: parsed.observation.tab.id, condition: { type: 'text', text: '保存成功：AI 中文验证' } }); }
      else if (lastCall === 'browser_check') { assert.equal(parsed.passed, true); result = answer('已核实页面显示保存成功。'); }
      else result = answer(`合成测试遇到浏览器错误：${JSON.stringify(parsed)}`);
      if (body.stream) {
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const choice = result.choices[0];
        const delta = { ...choice.message, ...(choice.message.tool_calls ? { tool_calls: choice.message.tool_calls.map((call, index) => ({ ...call, index })) } : {}) };
        response.write(`data: ${JSON.stringify({ ...result, object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`);
        response.write(`data: ${JSON.stringify({ ...result, object: 'chat.completion.chunk', choices: [{ index: 0, delta: {}, finish_reason: choice.finish_reason }] })}\n\n`);
        response.end('data: [DONE]\n\n');
      } else { response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(result)); }
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Set-Cookie': 'synthetic_session=fixture; Max-Age=3600; HttpOnly; SameSite=Lax' });
    response.end(html(new URL(request.url, 'http://fixture').pathname));
  } catch (error) { errors.push(String(error)); response.writeHead(500); response.end(String(error)); }
});
await new Promise(resolve => server.listen(0, '::', resolve));
base = `http://127.0.0.1:${server.address().port}`;
other = `http://localhost:${server.address().port}`;
const driverFile = path.join(output, 'driver.cjs');
await build({ entryPoints: ['electron/browser/guest-driver.ts'], outfile: driverFile, bundle: true, platform: 'node', format: 'cjs' });
async function check(name, action) { await action(); checks.push(name); console.log(`BROWSER_PASS ${name}`); }
async function launch() {
  const env = { ...process.env, WORKBENCH_TEST_DATA_DIR: path.join(output, 'data'), WORKBENCH_ISOLATED: '1' };
  for (const key of ['ELECTRON_RUN_AS_NODE', 'WORKBENCH_SMOKE', 'WORKBENCH_DEV_URL']) delete env[key];
  application = await electron.launch({ executablePath: require('electron'), args: ['.'], cwd: root, env, timeout: 45000, chromiumSandbox: true });
  page = await application.firstWindow(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) consoleMessages.push({ level: message.type(), text: message.text() }); });
  await page.locator('#view-home').waitFor();
  assert.match(page.url(), /\/dist\/index\.html/);
  assert.equal(await page.title(), '个人工作台');
  assert.equal(await page.locator('vite-error-overlay, #webpack-dev-server-client-overlay').count(), 0);
  const window = await application.browserWindow(page);
  // Match the packaged guest's DevTools-disabled policy without pretending this is an installed build.
  await window.evaluate(window => window.webContents.on('will-attach-webview', (_event, preferences) => { preferences.devTools = false; globalThis.__browserPilotPolicyApplied = true; }));
  await page.getByRole('button', { name: '网页工作台', exact: true }).click();
  await page.locator('#view-browser').waitFor();
}
async function navigate(url) { const address = page.locator('#view-browser').getByRole('combobox', { name: '地址', exact: true }); await address.fill(url); await address.press('Enter'); await page.waitForFunction(expected => { const view = document.querySelector('#view-browser webview'); return view?.getURL?.() === expected && !view.isLoading(); }, url); }
async function sendChat(text) {
  const panel = page.getByRole('complementary', { name: 'AI 助手', exact: true });
  if (!await panel.isVisible() || await panel.getAttribute('aria-hidden') === 'true') await page.locator('.ai-topbar-btn').click();
  const input = panel.getByRole('textbox', { name: '发送给当前对话的 AI 助手', exact: true });
  await input.fill(text);
  await panel.getByRole('button', { name: '发送', exact: true }).click();
}
async function readFixture(expression) { return application.evaluate(({ webContents }, expression) => webContents.getAllWebContents().find(contents => contents.getType() === 'webview' && contents.getURL().includes('/form')).executeJavaScript(expression), expression); }
async function driver(method, ...args) { return application.evaluate(async (_electron, { method, args }) => globalThis.__browserPilot.driver[method](...args), { method, args }); }
try {
  await launch(); await navigate(`${base}/form`);
  await writeFile(path.join(output, 'fixture.html'), html('/form'));
  await check('Real guest control uses AX, isolated DOM, native input, shadow DOM and frames', async () => {
    await application.evaluate(async ({ webContents }, driverFile) => {
      const guest = webContents.getAllWebContents().find(contents => contents.getType() === 'webview' && contents.getURL().includes('/form'));
      if (!globalThis.__browserPilotPolicyApplied || guest.getLastWebPreferences().sandbox !== true) throw new Error('Guest must keep the packaged security preferences');
      // getLastWebPreferences omits devTools in Electron 44; verify its actual behavior.
      guest.openDevTools({ activate: false }); await new Promise(resolve=>setTimeout(resolve,250));
      if (guest.isDevToolsOpened()) throw new Error('Guest DevTools UI must remain disabled');
      guest.debugger.attach('1.3');
      const { createGuestDriver } = process.getBuiltinModule('module').createRequire(process.cwd() + '/package.json')(driverFile);
      const driver = createGuestDriver(guest, () => ({ id: 'pilot', workspace: 'default', url: guest.getURL(), title: guest.getTitle(), ready: true, active: true }));
      guest.debugger.on('message', (_event, method, params, sessionId) => driver.event(method, params, sessionId));
      globalThis.__browserPilot = { driver, guest };
      return Promise.all(['Page.enable', 'DOM.enable', 'Runtime.enable', 'Network.enable'].map(method => guest.debugger.sendCommand(method))).then(() => guest.debugger.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true }));
    }, driverFile);
    let observed = await driver('observe', true);
    const pixels = await application.evaluate(({ nativeImage }, data) => nativeImage.createFromBuffer(Buffer.from(data, 'base64')).getSize(), observed.screenshot.data);
    assert.deepEqual(pixels, { width: observed.screenshot.width, height: observed.screenshot.height }, 'Screenshot pixel metadata must match the actual JPEG');
    await writeFile(path.join(output, 'observation.json'), JSON.stringify({ ...observed, screenshot: undefined }, null, 2));
    assert.ok(observed.elements.some(element => element.name === '测试名称'));
    assert.ok(observed.elements.some(element => element.name === '影子按钮'));
    assert.ok(!JSON.stringify(observed).includes('SYNTHETIC_SECRET_SENTINEL'), 'Password values must not enter an observation');
    assert.equal(observed.frames.length, 3);
    const old = observed.elements.find(element => element.name === '测试名称').ref;
    await readFixture(`window.inputLog=[]; for(const name of ['input','keydown','keyup','focusin']) document.addEventListener(name,e=>inputLog.push({type:e.type,target:e.target.id,key:e.key,data:e.data,trusted:e.isTrusted}));`);
    // Functions cannot cross Playwright serialization; the trusted test guard is installed in the main process.
    const act = async action => application.evaluate(async (_electron, action) => globalThis.__browserPilot.driver.act(action, async () => {}), action);
    await readFixture('focusSecret()'); await driver('observe');
    await assert.rejects(act({ type: 'type', text: '不得输入' }), /手动/);
    await readFixture('document.querySelector("#name").focus()'); observed = await driver('observe');
    for (const [name, id] of [['多行测试', 'multiline'], ['富文本测试', 'editable']]) {
      observed = await act({ type: 'fill', ref: observed.elements.find(element => element.name === name).ref, text: '替换编辑内容' });
      assert.equal(await readFixture(`document.querySelector('#${id}').${id === 'editable' ? 'textContent' : 'value'}`), '替换编辑内容');
    }
    observed = await act({ type: 'fill', ref: observed.elements.find(element => element.name === '测试名称').ref, text: '中文输入测试' });
    await writeFile(path.join(output, 'input-debug.json'), JSON.stringify(await readFixture('({events:inputLog,active:document.activeElement.outerHTML,focused:document.hasFocus(),value:document.querySelector("#name").value})'), null, 2));
    assert.equal(await readFixture('document.querySelector("#name").value'), '中文输入测试');
    observed = await act({ type: 'fill', ref: observed.elements.find(element => element.name === '测试名称').ref, text: '替换已有内容' });
    assert.equal(await readFixture('document.querySelector("#name").value'), '替换已有内容');
    observed = await act({ type: 'fill', ref: observed.elements.find(element => element.name === '测试名称').ref, text: '' });
    assert.equal(await readFixture('document.querySelector("#name").value'), '', 'Empty fill must clear the selected text');
    observed = await act({ type: 'fill', ref: observed.elements.find(element => element.name === '测试名称').ref, text: '中文输入测试' });
    assert.equal(await readFixture('document.querySelector("#name").value'), '中文输入测试');
    await assert.rejects(act({ type: 'fill', ref: old, text: '不应写入' }), /失效/);
    observed = await act({ type: 'click', ref: observed.elements.find(element => element.name === '保存测试').ref, button: 'left', count: 1 });
    assert.equal((await readFixture('fixture')).trusted, true);
    assert.ok(observed.text.includes('保存成功：中文输入测试'));
    observed = await act({ type: 'select', ref: observed.elements.find(element => element.role === 'combobox').ref, values: ['选项乙'], by: 'label' });
    assert.equal(await readFixture('document.querySelector("#choice").value'), 'b');
    observed = await act({ type: 'click', ref: observed.elements.find(element => element.role === 'checkbox').ref, button: 'left', count: 1 });
    assert.equal((await driver('check', { type: 'field', role: 'checkbox', name: '公开测试', checked: true })).passed, true);
    observed = await driver('observe');
    await act({ type: 'press', ref: observed.elements.find(element => element.role === 'checkbox').ref, key: 'Space' });
    assert.equal((await driver('check', { type: 'field', role: 'checkbox', name: '公开测试', checked: false })).passed, true);
    observed = await driver('observe');
    observed = await act({ type: 'click', ref: observed.elements.find(element => element.name === '影子按钮').ref, button: 'left', count: 1 });
    assert.ok(observed.elements.some(element => element.name === '影子已点击'));
    const frameButton = observed.elements.find(element => element.name === '框架按钮');
    observed = await act({ type: 'click', ref: frameButton.ref, button: 'left', count: 1 });
    assert.ok(observed.elements.some(element => element.name === '框架已点击'));
    const remoteButton = observed.elements.find(element => element.name === '框架按钮');
    observed = await act({ type: 'click', ref: remoteButton.ref, button: 'left', count: 1 });
    assert.equal(observed.elements.filter(element => element.name === '框架已点击').length, 2, 'Same-process and out-of-process frame input must both work');
    const changed = observed.elements.find(element => element.name === '保存测试').ref;
    await readFixture('document.querySelector("#save").textContent="动态变化的动作"');
    await assert.rejects(act({ type: 'click', ref: changed, button: 'left', count: 1 }), /变化/);
    await readFixture('document.querySelector("#save").textContent="保存测试"');
    observed = await driver('observe');
    const blocked = observed.elements.find(element => element.name === '保存测试').ref;
    await readFixture('document.querySelector("#block").style.display="block"');
    await assert.rejects(act({ type: 'click', ref: blocked, button: 'left', count: 1 }), /遮挡/);
    await readFixture('document.querySelector("#block").style.display="none"');
    observed = await driver('observe', true);
    const canvas = await readFixture('(()=>{const r=document.querySelector("#canvas").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    assert.ok(canvas.y < observed.screenshot.cssHeight, 'Fixture canvas should be visible');
    observed = await act({ type: 'coordinate', screenshotId: observed.screenshot.id, point: canvas, button: 'left', count: 1 });
    assert.equal((await readFixture('fixture')).canvas, 1);
    await application.evaluate(() => globalThis.__browserPilot.guest.setZoomFactor(1.25));
    await readFixture('document.querySelector("#canvas").scrollIntoView({block:"center"})');
    observed = await driver('observe', true);
    const zoomedCanvas = await readFixture('(()=>{const r=document.querySelector("#canvas").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await act({ type: 'coordinate', screenshotId: observed.screenshot.id, point: zoomedCanvas, button: 'left', count: 1 });
    assert.equal((await readFixture('fixture')).canvas, 2, '125% page zoom must map CSS coordinates to native guest input');
    await application.evaluate(() => globalThis.__browserPilot.guest.setZoomFactor(1));
    await readFixture('window.scrollTo(0,0)');
    await readFixture('document.querySelector("#drag").scrollIntoView({block:"center"})');
    observed = await driver('observe', true);
    const drag = await readFixture('(()=>{const r=document.querySelector("#drag").getBoundingClientRect();return {x:r.x+5,y:r.y+5}})()');
    await act({ type: 'drag', screenshotId: observed.screenshot.id, from: drag, to: { x: drag.x+20, y: drag.y+20 } });
    assert.ok((await readFixture('fixture')).dragMoves > 0);
    await readFixture('window.scrollTo(0,0)');
    observed = await driver('observe', true);
    await act({ type: 'scroll', screenshotId: observed.screenshot.id, point: { x: 20, y: 30 }, deltaX: 0, deltaY: 180 });
    assert.ok(await readFixture('scrollY > 0'), 'Positive CSS scroll must scroll down through the guest input adapter');
    await readFixture('window.scrollTo(0,0)');
    const stale = (await driver('observe', true)).screenshot.id;
    await readFixture('window.scrollBy(0,60)');
    await assert.rejects(act({ type: 'coordinate', screenshotId: stale, point: { x: 20, y: 20 }, button: 'left', count: 1 }), /变化/);
    await readFixture('window.scrollTo(0,0)');
    const full = await driver('observe', true, true); assert.ok(full.screenshot.fullPage);
    await assert.rejects(act({ type: 'coordinate', screenshotId: full.screenshot.id, point: { x: 20, y: 20 }, button: 'left', count: 1 }), /视口/);
    const result = await driver('check', { type: 'text', text: '保存成功：中文输入测试', present: true }); assert.equal(result.passed, true);
    await check('Scoped locators and pagination reach duplicate targets, closed shadows and content beyond the first page', async () => {
      await readFixture(`const region=document.createElement('section');region.id='query-tests';region.innerHTML='<section id="orders" data-testid="orders"><h2>订单区域</h2><button class="duplicate" onclick="this.textContent=String(1)">保存重复</button><label for="customer">客户名称</label><input id="customer" placeholder="输入客户"><button hidden>隐藏按钮</button></section><section id="other-orders"><button class="duplicate">保存重复</button></section><div id="long-text"></div><div id="many-buttons"></div>';document.body.append(region);document.querySelector('#long-text').textContent='分页正文'.repeat(5000);document.querySelector('#many-buttons').innerHTML=Array.from({length:320},(_,i)=>'<button>批量按钮 '+i+'</button>').join('');`);
      const observe = query => driver('observe', false, false, undefined, query);
      observed = await observe({ selector: { by: 'role', value: 'button', name: '保存重复' }, within: [{ by: 'testId', value: 'orders' }] });
      assert.equal(observed.elements.length, 1); await act({ type: 'click', ref: observed.elements[0].ref, button: 'left', count: 1 });
      assert.equal(await readFixture('document.querySelector("#orders button").textContent'), '1');
      assert.equal(await readFixture('document.querySelector("#other-orders button").textContent'), '保存重复');
      for (const selector of [{ by: 'label', value: '客户名称' }, { by: 'placeholder', value: '输入客户' }, { by: 'css', value: '#orders input' }]) { observed = await observe({ selector }); assert.equal(observed.elements.length, 1); assert.equal(observed.elements[0].name, '客户名称'); }
      observed = await observe({ selector: { by: 'text', value: '影子已点击' } }); assert.equal(observed.elements.length, 1);
      observed = await observe({ selector: { by: 'css', value: '#orders' }, has: { by: 'placeholder', value: '输入客户' }, hasNot: { by: 'text', value: '不存在' }, and: [{ by: 'testId', value: 'orders' }], hasText: '订单区域' }); assert.equal(observed.elements.length, 1);
      observed = await observe({ selector: { by: 'css', value: '#orders' } }); await act({ type: 'hover', ref: observed.elements[0].ref });
      observed = await observe({ selector: { by: 'role', value: 'button', name: '隐藏按钮' }, or: [{ by: 'css', value: '#orders button[hidden]' }], visible: false }); assert.equal(observed.elements.length, 1);
      const remote = result.observation.frames.find(frame => frame.url.startsWith(other));
      observed = await observe({ frameId: remote.id, selector: { by: 'role', value: 'button', name: '框架已点击' } }); assert.equal(observed.elements.length, 1);
      observed = await observe({ selector: { by: 'role', value: 'button' }, within: [{ by: 'css', value: '#many-buttons' }], offset: 300, limit: 10 });
      assert.equal(observed.page.totalElements, 320); assert.equal(observed.elements[0].name, '批量按钮 300'); assert.equal(observed.page.nextOffset, 310);
      observed = await observe({ selector: { by: 'role', value: 'button' }, within: [{ by: 'css', value: '#many-buttons' }], nth: 319 }); assert.equal(observed.elements[0].name, '批量按钮 319'); assert.equal(observed.text, '批量按钮 319');
      observed = await observe({ selector: { by: 'css', value: '#long-text' }, textOffset: 14000, textLimit: 1000 }); assert.equal(observed.text.length, 1000); assert.equal(observed.page.totalTextLength, 20000);
      await readFixture('document.querySelector("#query-tests").remove();window.scrollTo(0,0)');
    });
    await check('Locator actions wait for a unique target, reject ambiguity and do not replay dispatched input', async () => {
      await readFixture(`window.locatorClicks=0;setTimeout(()=>{const button=document.createElement('button');button.id='delayed-save';button.textContent='延迟保存';button.onclick=()=>{locatorClicks++};document.body.append(button)},350)`);
      await act({ type: 'locator', query: { selector: { by: 'role', value: 'button', name: '延迟保存' } }, timeoutMs: 2000, action: { type: 'click', button: 'left', count: 1 } });
      assert.equal(await readFixture('locatorClicks'), 1);
      await readFixture(`const button=document.createElement('button');button.id='duplicate-save';button.textContent='延迟保存';button.onclick=()=>locatorClicks++;document.body.append(button)`);
      await assert.rejects(act({ type: 'locator', query: { selector: { by: 'role', value: 'button', name: '延迟保存' } }, timeoutMs: 0, action: { type: 'click', button: 'left', count: 1 } }), /匹配多个/);
      assert.equal(await readFixture('locatorClicks'), 1);
      await application.evaluate(() => {
        const port = globalThis.__browserPilot.driver.port, original = port.input;
        globalThis.__browserPilot.restoreInput = () => { port.input = original; };
        port.input = async (...args) => { const result=await original(...args); if(args[0]==='Input.dispatchMouseEvent'&&args[1].type==='mouseReleased') throw new Error('synthetic failure after dispatch'); return result; };
      });
      try { await assert.rejects(act({ type: 'locator', query: { selector: { by: 'css', value: '#delayed-save' } }, timeoutMs: 2000, action: { type: 'click', button: 'left', count: 1 } }), /synthetic failure after dispatch/); }
      finally { await application.evaluate(() => globalThis.__browserPilot.restoreInput()); }
      assert.equal(await readFixture('locatorClicks'), 2);
      await readFixture(`document.querySelector('#delayed-save').remove();document.querySelector('#duplicate-save').remove();window.scrollTo(0,0)`);
    });
    await check('Long report checks and table row extraction reach the final page without truncation false negatives', async () => {
      await readFixture(`const section=document.createElement('section');section.id='report-test';section.innerHTML='<div id="report-text"></div><table id="report-table"><thead><tr><th>订单</th><th>金额</th><th>状态</th></tr></thead><tbody>'+Array.from({length:320},(_,i)=>'<tr><td>ORD-'+i+'</td><td>'+(i*3)+'</td><td>待核对</td></tr>').join('')+'</tbody></table><label for="last-field">尾部订单号</label><input id="last-field" value="已核验"><script>const secretSuccess="脚本里的假成功";<\/script>';document.body.append(section);document.querySelector('#report-text').textContent='长报表正文'.repeat(4000)+'真正报表末尾标记';`);
      const rows = await driver('observe', false, false, undefined, { selector: { by: 'role', value: 'row' }, within: [{ by: 'css', value: '#report-table' }], offset: 301, limit: 2 });
      assert.equal(rows.page.totalElements, 321);
      assert.deepEqual(rows.elements[0].cells.map(cell=>cell.text), ['ORD-300', '900', '待核对']);
      assert.ok(rows.elements.every(row=>!row.cellsTruncated&&row.cells.every(cell=>!cell.truncated)));
      assert.equal((await driver('check', { type: 'text', text: '真正报表末尾标记', present: true })).passed, true);
      assert.equal((await driver('check', { type: 'text', text: '脚本里的假成功', present: true })).passed, false);
      assert.equal((await driver('check', { type: 'field', role: 'textbox', name: '尾部订单号', value: '已核验' })).passed, true);
      const lastRow = { selector: { by: 'role', value: 'row' }, within: [{ by: 'css', value: '#report-table' }], hasText: 'ORD-319' };
      const lastCheck = await driver('check', { type: 'locator', query: lastRow, count: 1, present: true });
      assert.equal(lastCheck.passed, true, JSON.stringify({ evidence: lastCheck.evidence, page: lastCheck.observation.page, frames: lastCheck.observation.frames, elements: lastCheck.observation.elements }));
      assert.equal((await driver('check', { type: 'locator', query: lastRow, count: 2, present: true })).passed, false);
      await readFixture(`document.querySelector('#report-test').remove();window.scrollTo(0,0)`);
    });
    await check('Setting checked state is idempotent and sequential input produces actual per-character events', async () => {
      await readFixture('window.checkEvents=0;document.querySelector("#check").addEventListener("change",()=>checkEvents++);document.querySelector("#multiline").value="";window.inputLog=[]');
      observed = await driver('observe');
      for (let index = 0; index < 2; index++) observed = await act({ type: 'setChecked', ref: observed.elements.find(element => element.name === '公开测试').ref, checked: true });
      assert.equal(await readFixture('checkEvents'), 1); assert.equal(await readFixture('document.querySelector("#check").checked'), true);
      observed = await act({ type: 'setChecked', ref: observed.elements.find(element => element.name === '公开测试').ref, checked: false });
      assert.equal(await readFixture('checkEvents'), 2);
      await act({ type: 'pressSequentially', ref: observed.elements.find(element => element.name === '多行测试').ref, text: 'Ab1中', delayMs: 5 });
      assert.equal(await readFixture('document.querySelector("#multiline").value'), 'Ab1中');
      const events = await readFixture('inputLog.filter(event=>event.target==="multiline")');
      assert.equal(events.filter(event=>event.type==='input').length, 4); assert.equal(events.filter(event=>event.type==='keydown').length, 3);
    });
    await application.evaluate(() => { globalThis.__browserPilot.guest.debugger.detach(); delete globalThis.__browserPilot; });
  });
  await check('Workspace switches preserve live guest, form, navigation and login partition', async () => {
    const before = await readFixture('({nonce:fixture.nonce, text:document.querySelector("#name").value})');
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '网页工作台', exact: true }).click();
    assert.deepEqual(await readFixture('({nonce:fixture.nonce, text:document.querySelector("#name").value})'), before);
  });
  await check('Actual PI tools execute observe, fill, click and business-result verification', async () => {
    const config = await page.evaluate(async base => {
      let config = await window.workbench.ai.saveProvider({ kind: 'custom', name: 'Local browser fixture', endpoint: `${base}/v1`, protocol: 'openai-chat' });
      config = await window.workbench.ai.saveModel({ providerId: config.providers[0].id, name: 'browser-vision', supportsImages: true });
      await window.workbench.ai.activateModel(config.models[0].id);
      return window.workbench.ai.setEnabled(true);
    }, base);
    assert.equal(config.aiEnabled, true);
    await page.reload(); await page.locator('#view-home').waitFor();
    await page.getByRole('button', { name: '网页工作台', exact: true }).click();
    await page.waitForFunction(() => { try { const view = document.querySelector('#view-browser webview'); return view?.getURL?.().includes('/form') && !view.isLoading(); } catch { return false; } });
    const view = page.locator('#view-browser');
    await sendChat('将测试名称填为 AI 中文验证，点击保存测试，并检查保存成功提示。');
    await view.getByText('页面条件验证通过', { exact: true }).waitFor({ timeout: 60000 });
    assert.ok(requests.length >= 6);
    assert.ok(requests.some(request => JSON.stringify(request.messages).includes('data:image/jpeg;base64,')), 'Actual OpenAI-compatible transport must carry screenshot image content');
    assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证');
    assert.equal((await readFixture('fixture')).trusted, true);
  });
  await check('Model list multimodal eye toggle saves both states beside edit and survives ordinary model edits', async () => {
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.locator('.ai-topbar-btn').click();
    await page.getByRole('button', { name: 'AI 助手', exact: true }).click();
    const imageInput = page.getByRole('button', { name: '多模态 browser-vision', exact: true });
    assert.equal(await imageInput.getAttribute('aria-pressed'), 'true');
    await imageInput.click();
    await page.waitForFunction(() => { const input = document.querySelector('.ai-config-multimodal'); return input?.getAttribute('aria-pressed') === 'false' && !input.disabled; });
    let config = await page.evaluate(() => window.workbench.ai.config());
    assert.equal(config.models[0].supportsImages, false);
    assert.equal(config.models[0].id, config.activeModelId);
    const window = await application.browserWindow(page);
    await page.getByRole('heading', { name: '模型列表', exact: true }).hover();
    await page.locator('.ai-config-model-row').screenshot({ path: path.join(output, 'model-multimodal-off-row.png'), animations: 'disabled' });
    await writeFile(path.join(output, 'model-multimodal-off.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await imageInput.focus(); await imageInput.press('Space');
    await page.waitForFunction(() => { const input = document.querySelector('.ai-config-multimodal'); return input?.getAttribute('aria-pressed') === 'true' && !input.disabled; });
    config = await page.evaluate(() => window.workbench.ai.config());
    assert.equal(config.models[0].supportsImages, true);
    assert.equal(config.models[0].name, 'browser-vision');
    await page.getByRole('button', { name: '编辑模型 browser-vision', exact: true }).click();
    const dialog = page.getByRole('dialog');
    assert.equal(await dialog.getByRole('checkbox').count(), 0);
    await dialog.getByRole('button', { name: '保存模型', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal((await page.evaluate(() => window.workbench.ai.config())).models[0].supportsImages, true);
    const inputBounds = await imageInput.boundingBox(); assert.ok(inputBounds.width === 32 && inputBounds.height === 32);
    const editBounds = await page.getByRole('button', { name: '编辑模型 browser-vision', exact: true }).boundingBox();
    assert.ok(inputBounds.x > editBounds.x && Math.abs(inputBounds.y - editBounds.y) < 12);
    await page.getByRole('heading', { name: '模型列表', exact: true }).hover();
    await page.locator('.ai-config-model-row').screenshot({ path: path.join(output, 'model-multimodal-on-row.png'), animations: 'disabled' });
    await writeFile(path.join(output, 'model-multimodal-setting.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await page.getByRole('button', { name: '网页工作台', exact: true }).click();
  });
  await check('An empty active tab can open a website directly from sidebar chat after a site grant', async () => {
    const view = page.locator('#view-browser');
    await view.getByRole('button', { name: '新标签页', exact: true }).click();
    await sendChat('空白页打开测试：打开合成指定地址并检查页面地址。');
    await view.getByText('等待站点授权', { exact: true }).waitFor({ timeout: 30000 });
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.deepEqual(state.tasks.at(-1).tabIds, []);
    await view.getByRole('button', { name: '允许此站点', exact: true }).click();
    await view.getByText('页面条件验证通过', { exact: true }).waitFor({ timeout: 30000 });
    await view.getByRole('button', { name: '浏览器合成测试 /form', exact: true }).click();
  });
  await check('Popup adoption and cross-site navigation wait for the visible site grant', async () => {
    const view = page.locator('#view-browser');
    await sendChat('跨站弹窗测试：打开弹窗标签，访问合成跨站地址并核验。');
    await view.getByText('等待站点授权', { exact: true }).waitFor({ timeout: 30000 });
    const waiting = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(waiting.tasks.at(-1).tabIds.length, 2);
    assert.equal(waiting.tasks.at(-1).pendingOrigin, other);
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '浏览器等待站点授权', exact: true }).click();
    await view.getByRole('button', { name: '允许此站点', exact: true }).click();
    await view.getByText('页面条件验证通过', { exact: true }).waitFor({ timeout: 30000 });
    await view.getByRole('button', { name: '浏览器合成测试 /form', exact: true }).click();
  });
  await check('Background browser task writes while its workspace and AI panel are hidden, without taking focus', async () => {
    await readFixture('document.querySelector("#name").value="后台前"; document.querySelector("#result").textContent="尚未保存"');
    holdModel = true;
    const view = page.locator('#view-browser');
    await sendChat('切换工作台后继续填写测试名称并保存核验。');
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).waitFor();
    const before = await readFixture('({nonce:fixture.nonce,clicks:fixture.clicks})');
    await page.getByRole('complementary', { name: 'AI 助手', exact: true }).getByRole('button', { name: '收起 AI 助手', exact: true }).click();
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '浏览器后台操作中', exact: true }).waitFor();
    await page.getByRole('button', { name: '首页', exact: true }).focus();
    const focused = await page.evaluate(() => document.activeElement?.outerHTML);
    const hiddenState = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(hiddenState.tasks.at(-1).status, 'running');
    holdModel = false; releaseModel?.();
    const deadline = Date.now() + 45000;
    for (;;) {
      const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
      const task = state.tasks.at(-1);
      if (task.status === 'completed') break;
      assert.ok(!['failed', 'interrupted', 'cancelled', 'unverified'].includes(task.status), JSON.stringify(task));
      assert.ok(Date.now() < deadline, `Background task timeout: ${JSON.stringify(task)}`);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证');
    assert.equal(await readFixture('fixture.nonce'), before.nonce);
    assert.ok(await readFixture('fixture.clicks') > before.clicks);
    assert.equal(await page.evaluate(() => document.activeElement?.outerHTML), focused);
    assert.equal(await page.locator('#view-browser').isVisible(), false);
    await page.getByRole('button', { name: '网页工作台', exact: true }).click();
  });
  await check('Hiding the app window keeps the task running without showing or focusing the window', async () => {
    await readFixture('document.querySelector("#name").value="隐藏前"; document.querySelector("#result").textContent="尚未保存"');
    holdModel = true;
    const view = page.locator('#view-browser');
    await sendChat('窗口隐藏后继续填写并保存核验。');
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).waitFor();
    const window = await application.browserWindow(page);
    await window.evaluate(window => window.hide());
    try {
      holdModel = false; releaseModel?.();
      const deadline = Date.now() + 45000;
      for (;;) {
        const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
        if (state.tasks.at(-1).status === 'completed') break;
        assert.ok(Date.now() < deadline, JSON.stringify(state.tasks.at(-1)));
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证');
      assert.equal(await window.evaluate(window => window.isVisible()), false);
      assert.equal(await window.evaluate(window => window.isFocused()), false);
    } finally { await window.evaluate(window => window.show()); }
  });
  await check('Pause/cancel blocks writes and late model replies do not resume the task', async () => {
    holdModel = true;
    const view = page.locator('#view-browser'), before = (await readFixture('fixture')).clicks;
    await sendChat('暂停取消合成任务');
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).waitFor();
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).click();
    await view.getByText('已暂停 · 可手动操作', { exact: true }).waitFor();
    await view.getByRole('button', { name: '停止任务', exact: true }).click();
    holdModel = false; releaseModel?.();
    await view.getByText('已停止', { exact: true }).waitFor();
    assert.equal((await readFixture('fixture')).clicks, before);
  });
  await check('Website operation UI has no goal form, annotations or developer diagnostics', async () => {
    const view = page.locator('#view-browser');
    assert.equal(await view.getByRole('textbox', { name: '浏览器任务目标' }).count(), 0);
    assert.equal(await view.getByRole('button', { name: '标注给 AI', exact: true }).count(), 0);
    assert.equal(await view.getByRole('button', { name: '页面诊断', exact: true }).count(), 0);
    await view.getByRole('button', { name: '历史', exact: true }).click();
    await page.getByRole('dialog').getByText(`${base}/form`, { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
  });
  await check('Clarification continues in the same sidebar conversation without a separate task form', async () => {
    const view = page.locator('#view-browser');
    await sendChat('先澄清测试：确认后填写测试名称并保存核验。');
    await view.getByText('执行结束 · 结果尚未验证', { exact: true }).waitFor();
    const before = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    const task = before.tasks.at(-1);
    await sendChat('已确认，填写 AI 中文验证，点击保存并检查保存成功。');
    await view.getByText('页面条件验证通过', { exact: true }).waitFor();
    const after = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(after.tasks.at(-1).id, task.id);
    assert.equal(after.tasks.at(-1).status, 'completed');
    assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证', 'Repeated fill must replace the current field, even when a previous success message exists');
  });
  await check('Model can open/select/close its own tab without interrupting the remaining task', async () => {
    const view = page.locator('#view-browser');
    await sendChat('标签开关测试：打开新标签、切换后关闭它，核验原页面地址。');
    await view.getByText('页面条件验证通过', { exact: true }).waitFor({ timeout: 30000 });
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(state.tasks.at(-1).status, 'completed'); assert.equal(state.tasks.at(-1).tabIds.length, 1);
    assert.equal(await page.locator('#view-browser .mbp-tab-title').filter({ hasText: '/opened' }).count(), 0);
    await page.locator('#view-browser .mbp-tab.on .mbp-tab-title').filter({ hasText: '/form' }).waitFor();
  });
  await check('Address suggestions support keyboard navigation and history search/deletion preserves route parameters', async () => {
    await navigate(`${base}/history-choice?report=42#summary`); await navigate(`${base}/form?report=42#details`);
    const address = page.locator('#view-browser').getByRole('combobox', { name: '地址', exact: true });
    await address.fill('history-choice');
    const choice = page.getByRole('option').filter({ hasText: `${base}/history-choice?report=42#summary` }).first(); await choice.waitFor();
    assert.ok(await choice.evaluate(element => { const r=element.getBoundingClientRect(), hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===element||element.contains(hit); }), 'History suggestions must be above the live guest');
    const window = await application.browserWindow(page);
    await writeFile(path.join(output, 'address-history.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await address.press('ArrowDown'); await address.press('Enter');
    await page.waitForFunction(expected => document.querySelector('#view-browser webview').getURL()===expected, `${base}/history-choice?report=42#summary`);
    await navigate(`${base}/form?report=42#details`);
    await page.locator('#view-browser').getByRole('button', { name: '历史', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByRole('searchbox', { name: '搜索历史', exact: true }).fill('history-choice');
    await page.waitForFunction(() => { const dialog=document.querySelector('.browser-dialog'); return dialog && !dialog.getAnimations({subtree:true}).some(animation=>animation.playState==='running'&&Number.isFinite(animation.effect?.getComputedTiming().endTime)); });
    await writeFile(path.join(output, 'history-panel.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    const before = await dialog.getByRole('button', { name: /^删除历史/ }).count(); assert.ok(before>0);
    await dialog.getByRole('button', { name: /^删除历史/ }).first().click(); await page.waitForFunction(before => document.querySelectorAll('.browser-dialog [aria-label^="删除历史"]').length === before-1, before);
    await dialog.getByRole('button', { name: '清空历史搜索', exact: true }).click();
    await dialog.getByRole('combobox', { name: '历史时间范围', exact: true }).click(); await page.getByRole('option', { name: '最近 24 小时', exact: true }).click();
    await dialog.getByRole('button', { name: '清除浏览数据', exact: true }).click();
    await page.getByRole('dialog').getByText('选择要清理的数据', { exact: true }).waitFor(); await page.keyboard.press('Escape');
    const saved = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.ok(saved.tabs.some(tab => tab.url===`${base}/form?report=42#details`));
  });
  await check('Clearing only site cache preserves cookies and local storage', async () => {
    await page.locator('#view-browser').getByRole('button', { name: '清理当前站点数据', exact: true }).click();
    const dialog = page.getByRole('dialog'); await dialog.getByLabel('Cookie 和登录状态', { exact: true }).uncheck(); await dialog.getByLabel('站点存储', { exact: true }).uncheck(); await dialog.getByLabel('缓存', { exact: true }).check();
    await dialog.getByRole('button', { name: '确认清理', exact: true }).click(); await dialog.waitFor({ state: 'hidden' });
    assert.equal(await readFixture('localStorage.getItem("fixture")'), 'persistent');
    assert.ok((await application.evaluate(({ session }) => session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session', domain: '127.0.0.1' }))).length>0);
  });
  await check('Existing pinned blog chat keeps its article while the creator page gains browser tools and fills the real guest', async () => {
    if (await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') !== 'true') await page.locator('.ai-topbar-btn').click();
    await application.evaluate(async ({ session }) => {
      await session.fromPartition('persist:wb-browser-xhs-creator').protocol.handle('https', request => new Response(new URL(request.url).hostname === 'creator.xiaohongshu.com' ? '<!doctype html><meta charset="utf-8"><title>创作者中心 · 本地合成验收</title><style>body{font:16px/1.7 sans-serif;background:#fafafa;color:#222;padding:30px}label{display:block;margin-top:20px}input,textarea{display:block;width:90%;padding:12px;font:inherit;border:1px solid #ddd;border-radius:8px}textarea{height:180px}</style><h1>图文发布表单</h1><p>本地合成测试页面，不连接真实平台、不发布内容。</p><label for="article-title">文章标题</label><input id="article-title"><label for="article-body">文章正文</label><textarea id="article-body"></textarea>' : '', { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
    });
    const article = await page.evaluate(async ({ title, body }) => {
      await window.workbench.copy.save({ title: '干扰文章 B', body: '这不是要填写的文章，不能混用。' });
      const state=await window.workbench.copy.save({ title, body });
      const draft=state.drafts.find(draft=>draft.title===title);
      const chat=await window.workbench.ai.chatNew({ module:'copy', draftId:draft.id });
      return { id:draft.id, chatId:chat.id };
    }, { title: creatorTitle, body: creatorBody });
    await page.getByRole('button', { name:'自媒体工作台', exact:true }).click();
    await page.locator(`.copy-item-open[title="${creatorTitle}"]`).click();
    await page.getByText(creatorTitle, { exact:true }).filter({ visible:true }).first().waitFor();
    await page.waitForFunction(title=>document.querySelector('.ai-ctx-name')?.textContent===title, creatorTitle);
    await page.getByRole('button', { name:'固定本次协助对象', exact:true }).click();
    await page.locator('.copy-item-open[title="干扰文章 B"]').click();
    await page.getByRole('button', { name:'自媒体工作台', exact:true }).hover();
    await page.getByRole('button', { name:'我的小红书', exact:true }).filter({ visible:true }).click();
    await page.waitForFunction(()=>{try { const view=document.querySelector('#view-media-browser webview');return view?.getTitle?.()==='创作者中心 · 本地合成验收'&&!view.isLoading(); } catch { return false; }});
    assert.equal(await page.getByText(/^操作网页：/).count(),0);
    assert.equal(await page.locator('.ai-ctx-name').textContent(), creatorTitle);
    await sendChat('博客网页协作测试：把当前协助文章的标题和正文填入网页，先不要发布。');
    await page.locator('#view-media-browser').getByText('页面条件验证通过', { exact:true }).waitFor({ timeout:60000 });
    const filled=await application.evaluate(({ webContents })=>webContents.getAllWebContents().find(contents=>contents.getType()==='webview'&&contents.getURL().startsWith('https://creator.xiaohongshu.com/')).executeJavaScript('({title:document.querySelector("#article-title").value,body:document.querySelector("#article-body").value})'));
    assert.deepEqual(filled,{title:creatorTitle,body:creatorBody});
    const stored=await page.evaluate(async article=>({chat:await window.workbench.ai.chatOpen(article.chatId),copy:await window.workbench.copy.list()}),article);
    assert.equal(stored.chat.contextScope.draftId,article.id);
    assert.equal(stored.chat.pageScope.viewId,'media-browser');
    assert.equal(stored.copy.drafts.find(draft=>draft.id===article.id).body,creatorBody);
    assert.ok(!stored.chat.entries.some(entry=>entry.copyProposal));
    await page.screenshot({ path:path.join(output,'creator-linked-chat.png'), animations:'disabled' });
    await page.getByRole('button', { name:'自媒体工作台', exact:true }).hover();
    await page.getByRole('button', { name:'博客编辑', exact:true }).filter({ visible:true }).click();
    assert.equal(await page.locator('.ai-ctx-name').textContent(),creatorTitle);
    await page.getByRole('button', { name:'网页工作台', exact:true }).click();
    await page.getByRole('button', { name:'网页工作台', exact:true }).press('Escape');
  });
  await check('Three themes and two supported window sizes retain usable browser and controls', async () => {
    const window = await application.browserWindow(page);
    for (const theme of ['mist', 'cool', 'warm']) for (const [width, height] of [[1280, 820], [1024, 680]]) {
      await window.evaluate((window, size) => window.setContentSize(...size), [width, height]);
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      if (await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') !== 'true') await page.locator('.ai-topbar-btn').click();
      await page.waitForFunction(({ width, height }) => {
        if (Math.abs(innerWidth-width)>2 || Math.abs(innerHeight-height)>2) return false;
        const button=document.querySelector('#view-browser .browser-utilities button:first-child'); if(!button) return false;
        const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        const moving=document.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.target instanceof Element&&animation.effect.target.contains(button));
        return !moving && (hit===button || button.contains(hit));
      }, { width, height }, { timeout: 5000 });
      const layout = await page.locator('#view-browser .mbp-stage').boundingBox();
      assert.ok(layout.width > 300 && layout.height > 150, `Browser remains usable: ${theme}/${width}`);
      assert.ok(await page.locator('#view-browser .browser-utilities button:first-child').evaluate(button => { const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===button||button.contains(hit); }), `Browser controls must remain reachable with the AI panel open: ${theme}/${width}`);
      const image = await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64'));
      layouts.push({theme, requested:[width,height], nativeContent:await window.evaluate(window=>window.getContentSize()), viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})), browser:layout});
      await writeFile(path.join(output, `${theme}-${width}.png`), Buffer.from(image, 'base64'));
    }
  });
  await check('Normal restart restores tabs and persistent login without replaying cancelled actions', async () => {
    await page.waitForTimeout(700);
    await application.evaluate(({ app }) => app.quit()); await application.close(); application = undefined;
    await launch();
    await page.waitForFunction(() => { try { const view = document.querySelector('#view-browser webview'); return view?.getURL?.().includes('/form') && !view.isLoading(); } catch { return false; } });
    assert.equal(await readFixture('localStorage.getItem("fixture")'), 'persistent');
    const cookies = await application.evaluate(({ session }) => session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session' }));
    assert.ok(cookies.length > 0);
    const saved = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(saved.tasks.at(-1).status, 'completed');
    assert.equal((await page.evaluate(() => window.workbench.ai.config())).models[0].supportsImages, true);
    assert.ok(saved.tabs.some(tab => tab.url === `${base}/form?report=42#details`));
  });
  await check('Confirmed site-data clearing only affects the selected persistent profile/site', async () => {
    await application.evaluate(async ({ session }) => session.fromPartition('persist:wb-browser-xhs-creator').cookies.set({ url: 'https://creator.xiaohongshu.com', name: 'synthetic_profile', value: 'keep', expirationDate: Math.floor(Date.now()/1000)+3600 }));
    const view = page.locator('#view-browser');
    await view.getByRole('button', { name: '清理当前站点数据', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '确认清理', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const cookies = await application.evaluate(async ({ session }) => ({ current: await session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session', domain: '127.0.0.1' }), otherSite: await session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session', domain: 'localhost' }), separate: await session.fromPartition('persist:wb-browser-xhs-creator').cookies.get({ name: 'synthetic_profile' }) }));
    assert.equal(cookies.current.length, 0); assert.equal(cookies.otherSite.length, 1); assert.equal(cookies.separate.length, 1);
    assert.equal(await readFixture('localStorage.getItem("fixture")'), null);
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleMessages.filter(message => message.level === 'error'), []);
  await writeFile(path.join(output, 'console.json'), JSON.stringify(consoleMessages, null, 2));
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', checks, layouts, screenshots: ['creator-linked-chat.png', 'model-multimodal-setting.png', 'model-multimodal-off.png', 'model-multimodal-on-row.png', 'model-multimodal-off-row.png', 'address-history.png', 'history-panel.png', ...['mist', 'cool', 'warm'].flatMap(theme => [1280, 1024].map(width => `${theme}-${width}.png`))], limitations: ['Synthetic model and creator-site content served locally, not real external model or website compatibility tests', 'Development Electron binary; not an installer or cross-version update check'], requests: requests.length }, null, 2));
  console.log(`BROWSER_PILOT_OK ${output}`);
} catch (error) {
  console.error(error);
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'failed', checks, error: String(error), errors }, null, 2));
  if (page) { try { await page.screenshot({ path: path.join(output, 'failure.png') }); await writeFile(path.join(output, 'failure-state.json'), JSON.stringify(await page.evaluate(() => window.workbench.browserAutomation.state('default')), null, 2)); await writeFile(path.join(output, 'requests.json'), JSON.stringify(requests, null, 2)); } catch {} }
  console.error(`BROWSER_PILOT_FAILED ${output}`); process.exitCode = 1;
} finally {
  holdModel = false; releaseModel?.();
  if (application) { try { await application.evaluate(({ app }) => app.exit(0)); } catch {} try { await application.close(); } catch {} }
  server.closeAllConnections(); await new Promise(resolve => server.close(resolve));
}
