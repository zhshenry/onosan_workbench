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
let firstBrowserReply;
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
      if (userText.includes('并发普通对话测试')) result = answer('第二个对话独立完成。');
      else if (parsed?.ok === false) {
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
      } else if (userText.includes('空白页打开测试') || userText === '帮我打开百度') {
        const target = userText === '帮我打开百度' ? 'https://www.baidu.com' : `${base}/chat-start`;
        if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
        else if (!parsed.length && lastCall === 'browser_tabs') result = toolResponse('browser_tabs', { operation: 'open', url: target });
        else if (lastCall === 'browser_tabs') result = toolResponse('browser_check', { tabId: parsed[0].id, condition: { type: 'url', text: target } });
        else result = answer('已从右侧对话打开并核验指定网页。');
      } else if (!last) result = toolResponse('browser_tabs', { operation: 'list' });
      else if (lastCall === 'browser_tabs') result = toolResponse('browser_observe', { tabId: parsed[0].id, screenshot: body.model.includes('vision'), query: { selector: { by: 'role', value: 'textbox', name: '测试名称' } } });
      else if (lastCall === 'browser_observe') {
        const input = parsed.elements.find(element => element.role === 'textbox' && element.name === '测试名称');
        assert.ok(input, 'Model fixture must receive the actual observed input');
        result = toolResponse('browser_check', { tabId: parsed.tab.id, operation: 'plan', checks: [
          { id: 'field', label: '测试名称已填写', condition: { type: 'field', role: 'textbox', name: '测试名称', value: 'AI 中文验证' } },
          { id: 'saved', label: '页面保存结果', condition: { type: 'text', text: '保存成功：AI 中文验证' } },
          { id: 'page', label: '正确的测试页面', condition: { type: 'url', text: '/form' } },
        ] });
      } else if (lastCall === 'browser_check' && parsed.planned) {
        result = toolResponse('browser_act', { tabId: parsed.items[0].tabId, action: { type: 'locator', query: { selector: { by: 'role', value: 'textbox', name: '测试名称' } }, action: { type: 'fill', text: 'AI 中文验证' } } });
      } else if (lastCall === 'browser_act' && parsed.elements) {
        if (!parsed.text.includes('保存成功：AI 中文验证')) {
          const button = parsed.elements.find(element => element.role === 'button' && element.name === '保存测试');
          result = toolResponse('browser_act', { tabId: parsed.tab.id, action: { type: 'click', ref: button.ref } });
        } else result = toolResponse('browser_wait', { tabId: parsed.tab.id, condition: { type: 'text', text: '保存成功：AI 中文验证' }, timeoutMs: 1000 });
      } else if (lastCall === 'browser_wait') { assert.equal(parsed.passed, true); result = toolResponse('browser_check', { tabId: parsed.observation.tab.id, operation: 'verify' }); }
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
const extractFile = path.join(output, 'extract.cjs');
await build({ entryPoints: ['electron/browser/extract.ts'], outfile: extractFile, bundle: true, platform: 'node', format: 'cjs' });
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
async function navigate(url) { const address = page.locator('#view-browser').getByRole('combobox', { name: '地址', exact: true }); await address.fill(url); await address.press('Enter'); await page.waitForFunction(expected => { const view = Array.from(document.querySelectorAll('#view-browser webview')).find(element => element.checkVisibility()); return view?.getURL?.() === expected && !view.isLoading(); }, url); }
async function openBrowserOption(name) {
  const trigger = page.locator('#view-browser .browser-menu-trigger');
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  await page.getByRole('menu', { name: '浏览器选项', exact: true }).getByRole('menuitem', { name, exact: true }).click();
}
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
    const beforeZoom = (await driver('observe', true)).screenshot.id;
    await page.locator('#view-browser .browser-menu-trigger').click();
    const zoomMenu = page.getByRole('menu', { name: '浏览器选项', exact: true });
    await zoomMenu.getByRole('button', { name: '放大网页', exact: true }).click();
    await zoomMenu.getByRole('button', { name: '放大网页', exact: true }).click();
    assert.equal(await zoomMenu.getByLabel('当前网页缩放', { exact: true }).textContent(), '125%');
    assert.ok(Math.abs(await application.evaluate(() => globalThis.__browserPilot.guest.getZoomFactor()) - 1.25) < 0.001);
    await page.keyboard.press('Escape');
    await assert.rejects(act({ type: 'coordinate', screenshotId: beforeZoom, point: canvas, button: 'left', count: 1 }), /变化/);
    await readFixture('document.querySelector("#canvas").scrollIntoView({block:"center"})');
    observed = await driver('observe', true);
    const zoomedCanvas = await readFixture('(()=>{const r=document.querySelector("#canvas").getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
    await act({ type: 'coordinate', screenshotId: observed.screenshot.id, point: zoomedCanvas, button: 'left', count: 1 });
    assert.equal((await readFixture('fixture')).canvas, 2, '125% page zoom must map CSS coordinates to native guest input');
    await page.locator('#view-browser .browser-menu-trigger').click();
    await zoomMenu.getByRole('button', { name: '重置网页缩放', exact: true }).click();
    assert.equal(await zoomMenu.getByLabel('当前网页缩放', { exact: true }).textContent(), '100%');
    await page.keyboard.press('Escape');
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
    await check('Regex locators, scoped AX reads, state waits and animation stability operate the real guest', async () => {
      await readFixture(`window.advancedClicks=0;{const box=document.createElement('section');box.id='advanced';box.innerHTML='<div id="first-zone"><button class="save">SAVE</button></div><div id="second-zone"><button class="save">save</button></div><button id="disabled-advanced" disabled>等待启用</button><style>@keyframes advancedMove{from{transform:translateX(0)}to{transform:translateX(100px)}}#moving-advanced{animation:advancedMove .7s linear forwards}</style><button id="moving-advanced" onclick="advancedClicks++">移动按钮</button>';document.body.append(box);}`);
      const observed = await driver('observe', false, false, undefined, { within: [{ by: 'css', value: '#advanced' }], selector: { by: 'role', value: 'button', name: { pattern: '^save$', flags: 'i' } } });
      assert.equal(observed.elements.length, 2); assert.match(observed.elements[0].context, /first-zone/);
      const ambiguity = await application.evaluate(async () => { try { await globalThis.__browserPilot.driver.act({ type: 'locator', query: { within: [{ by: 'css', value: '#advanced' }], selector: { by: 'role', value: 'button', name: { pattern: '^save$', flags: 'i' } } }, timeoutMs: 1000, action: { type: 'click', button: 'left', count: 1 } }, async () => {}); } catch (error) { return { code: error.code, details: error.details }; } });
      assert.equal(ambiguity.code, 'ambiguous-locator'); assert.equal(ambiguity.details.candidates.length, 2);
      for (const [state, passed] of [['disabled', true], ['enabled', false], ['visible', true], ['hidden', false]]) assert.equal((await driver('check', { type: 'state', query: { selector: { by: 'css', value: '#disabled-advanced' } }, state })).passed, passed);
      await readFixture(`window.advancedEvents=[];for(const type of ['mousedown','mouseup','click'])document.addEventListener(type,event=>advancedEvents.push({type,target:event.target.id,x:event.clientX,y:event.clientY,trusted:event.isTrusted}));document.querySelector('#moving-advanced').style.animation='none';void document.querySelector('#moving-advanced').offsetWidth;document.querySelector('#moving-advanced').style.animation='advancedMove .7s linear forwards'`);
      await application.evaluate(() => { const port=globalThis.__browserPilot.driver.port, original=port.input;globalThis.__browserPilot.advancedInputs=[];globalThis.__browserPilot.restoreAdvancedInput=()=>{port.input=original;};port.input=async(...args)=>{globalThis.__browserPilot.advancedInputs.push(args);return original(...args);}; });
      await act({ type: 'locator', query: { selector: { by: 'css', value: '#moving-advanced' } }, timeoutMs: 3000, action: { type: 'click', button: 'left', count: 1 } });
      await application.evaluate(() => globalThis.__browserPilot.restoreAdvancedInput());
      await writeFile(path.join(output, 'advanced-input-debug.json'), JSON.stringify(await readFixture(`({events:advancedEvents,clicks:advancedClicks,rect:document.querySelector('#moving-advanced').getBoundingClientRect().toJSON(),hit:document.elementFromPoint(document.querySelector('#moving-advanced').getBoundingClientRect().x+30,document.querySelector('#moving-advanced').getBoundingClientRect().y+10)?.outerHTML,viewport:{width:innerWidth,height:innerHeight,scrollX,scrollY},animations:document.querySelector('#moving-advanced').getAnimations().map(a=>({state:a.playState,time:a.currentTime}))})`), null, 2));
      await writeFile(path.join(output, 'advanced-native-inputs.json'), JSON.stringify(await application.evaluate(() => ({ inputs:globalThis.__browserPilot.advancedInputs, zoom:globalThis.__browserPilot.guest.getZoomFactor() })), null, 2));
      assert.equal(await readFixture('advancedClicks'), 1);
      assert.equal((await driver('check', { type: 'state', query: { selector: { by: 'css', value: '#moving-advanced' } }, state: 'stable' })).passed, true);
      await readFixture(`document.querySelector('#advanced').remove();window.scrollTo(0,0)`);
    });
    await check('Real table extraction reads typed columns, deduplicates pages and proves coverage from page facts', async () => {
      await readFixture(`{const box=document.createElement('section');box.id='extract-test';box.innerHTML='<p id="extract-total">共 3 条</p><table><tbody id="extract-rows"></tbody></table><button id="extract-next">下一页</button>';document.body.append(box);window.renderExtract=page=>{document.querySelector('#extract-rows').innerHTML=(page===1?[['A1','￥1,234.50'],['A2','25']]:[['A2','25'],['A3','30']]).map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('');document.querySelector('#extract-next').disabled=page===2;};renderExtract(1);}`);
      await application.evaluate((_electron, file) => { const { BrowserCollections } = process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')(file); globalThis.__browserPilot.collections = new BrowserCollections(); }, extractFile);
      const input = { operation: 'collect', query: { selector: { by: 'css', value: '#extract-rows tr' } }, fields: [{ name: 'order', column: 0, type: 'text', required: true }, { name: 'amount', column: 1, type: 'number', required: true }], keyFields: ['order'], totalQuery: { selector: { by: 'css', value: '#extract-total' } }, endCondition: { type: 'state', query: { selector: { by: 'css', value: '#extract-next' } }, state: 'disabled' }, resultOffset: 0, resultLimit: 100 };
      const collect = input => application.evaluate(async (_electron, input) => globalThis.__browserPilot.collections.extract('pilot', input, globalThis.__browserPilot.driver), input);
      const first = await collect(input); assert.equal(first.coverage.status, 'partial');
      await readFixture('renderExtract(2)');
      const second = await collect({ ...input, collectionId: first.collectionId });
      assert.equal(second.coverage.status, 'complete'); assert.equal(second.coverage.collected, 3); assert.equal(second.coverage.pagesRead, 2);
      assert.equal(second.rows[0].values.amount, 1234.5); assert.equal(second.rows[0].raw.amount, '￥1,234.50');
      assert.ok(second.rows.every(row => row.source.frameId && row.source.at && row.source.url));
      await readFixture(`document.querySelector('#extract-test').remove();window.scrollTo(0,0)`);
    });
    await check('Independent guest inputs fill and submit two tabs concurrently without crossing their values', async () => {
      await page.locator('#view-browser').getByRole('button', { name: '新标签页', exact: true }).click();
      await navigate(`${base}/parallel-form`);
      const values = await application.evaluate(async ({ webContents }, file) => {
        const guest = webContents.getAllWebContents().find(contents => contents.getType() === 'webview' && contents.getURL().includes('/parallel-form'));
        guest.debugger.attach('1.3');
        const { createGuestDriver } = process.getBuiltinModule('module').createRequire(process.cwd()+'/package.json')(file);
        const second = createGuestDriver(guest, () => ({ id: 'second', workspace: 'default', url: guest.getURL(), title: guest.getTitle(), ready: true, active: true }));
        guest.debugger.on('message', (_event, method, params, sessionId) => second.event(method, params, sessionId));
        for (const method of ['Page.enable', 'DOM.enable', 'Runtime.enable']) await guest.debugger.sendCommand(method);
        const first = globalThis.__browserPilot.driver;
        try {
          await Promise.all([first.act({ type: 'locator', query: { selector: { by: 'role', value: 'textbox', name: '测试名称' } }, timeoutMs: 3000, action: { type: 'fill', text: '并发标签 A' } }, async () => {}), second.act({ type: 'locator', query: { selector: { by: 'role', value: 'textbox', name: '测试名称' } }, timeoutMs: 3000, action: { type: 'fill', text: '并发标签 B' } }, async () => {})]);
          const click = driver => driver.act({ type: 'locator', query: { selector: { by: 'role', value: 'button', name: '保存测试' } }, timeoutMs: 3000, action: { type: 'click', button: 'left', count: 1 } }, async () => {});
          await Promise.all([click(first), click(second)]);
          return Promise.all([globalThis.__browserPilot.guest, guest].map(contents => contents.executeJavaScript('({value:document.querySelector("#name").value,result:document.querySelector("#result").textContent,trusted:fixture.trusted})')));
        } finally { guest.debugger.detach(); }
      }, driverFile);
      assert.deepEqual(values.map(item => item.value), ['并发标签 A', '并发标签 B']);
      assert.deepEqual(values.map(item => item.result), ['保存成功：并发标签 A', '保存成功：并发标签 B']);
      assert.ok(values.every(item => item.trusted));
      await page.locator('#view-browser .mbp-tab.on .mbp-tab-x').click();
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
    await view.getByRole('button', { name: '页面条件验证通过', exact: true }).waitFor({ timeout: 60000 });
    assert.ok(requests.length >= 6);
    assert.ok(requests.some(request => JSON.stringify(request.messages).includes('data:image/jpeg;base64,')), 'Actual OpenAI-compatible transport must carry screenshot image content');
    assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证');
    assert.equal((await readFixture('fixture')).trusted, true);
    firstBrowserReply = await page.evaluate(async () => {
      const task = (await window.workbench.browserAutomation.state('default')).tasks.at(-1);
      const chat = await window.workbench.ai.chatOpen(task.chatId);
      const entry = chat.entries.filter(entry => entry.role === 'assistant').at(-1);
      return { task, chatId: chat.id, entryId: entry.id, reference: entry.browserTask };
    });
    assert.deepEqual(firstBrowserReply.reference, { id: firstBrowserReply.task.id, workspace: 'default' });
    assert.match(firstBrowserReply.task.verification.items.find(item => item.id === 'saved').evidence.actual, /保存成功：AI 中文验证/);
    await page.getByRole('button', { name: '查看操作记录', exact: true }).last().click();
    const record = page.getByRole('dialog', { name: '浏览器操作记录', exact: true });
    await record.getByRole('heading', { name: firstBrowserReply.task.goal, exact: true }).waitFor();
    assert.equal(await record.locator('.browser-task-detail > .browser-task-steps > li').count(), firstBrowserReply.task.steps.length);
    await record.getByRole('status').filter({ hasText: '3/3 项通过' }).waitFor();
    const checks = record.locator('section[aria-label="任务核验清单"] details');
    assert.equal(await checks.count(), 3);
    assert.equal(await record.locator('.browser-task-steps details[open]').count(), 0, 'All record rows start collapsed');
    await record.screenshot({ path: path.join(output, 'browser-verification-checklist.png') });
    const check = checks.first(), summary = check.locator('summary');
    await summary.focus(); await page.keyboard.press('Enter');
    assert.equal(await check.evaluate(element => element.open), true);
    await check.locator('p').filter({ hasText: '读取文字：' }).waitFor();
    assert.equal(await checks.nth(1).evaluate(element => element.open), false, 'Expanding one check does not open other checks');
    await record.screenshot({ path: path.join(output, 'browser-verification-expanded.png') });
    await page.keyboard.press('Space');
    assert.equal(await check.evaluate(element => element.open), false);
    const operation = record.locator('.browser-task-detail > .browser-task-steps details').first();
    await operation.locator('summary').click();
    assert.equal(await operation.evaluate(element => element.open), true);
    await operation.locator('p').waitFor();
    await operation.locator('summary').click();
    assert.equal(await operation.evaluate(element => element.open), false);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('.ai-topbar-btn').getAttribute('aria-expanded'), 'true', 'Closing a task record must keep the assistant open');
  });
  await check('A second sidebar conversation runs while the browser request waits and stopping one keeps the other result', async () => {
    holdModel = true; releaseModel = undefined;
    const count = requests.length;
    await sendChat('并发浏览器等待测试');
    while (requests.length === count) await new Promise(resolve => setTimeout(resolve, 20));
    const a = (await page.evaluate(() => window.workbench.ai.chatList())).find(chat => chat.streaming);
    assert.ok(a);
    const releaseA = releaseModel;
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.locator('#view-home').waitFor();
    await sendChat('并发普通对话测试');
    while (requests.length < count + 2 || releaseModel === releaseA) await new Promise(resolve => setTimeout(resolve, 20));
    holdModel = false;
    const releaseB = releaseModel;
    await page.getByRole('button', { name: /^选择历史对话，当前：/ }).click();
    const picker = page.getByRole('dialog', { name: '切换对话', exact: true });
    await picker.waitFor();
    assert.equal(await picker.locator('.ai-chat-status.running').count(), 2, 'The chat list shows both concurrent requests as running');
    const window = await application.browserWindow(page);
    await picker.screenshot({ path: path.join(output, 'ai-concurrent-chat-list-detail.png') });
    await page.screenshot({ path: path.join(output, 'ai-concurrent-chat-list.png'), fullPage: false });
    await page.keyboard.press('Escape');
    releaseB?.();
    await page.getByRole('complementary', { name: 'AI 助手', exact: true }).getByText('第二个对话独立完成。', { exact: true }).waitFor();
    releaseModel = releaseA;
    const aWhileBFinished = await page.evaluate(id => window.workbench.ai.chatOpen(id), a.id);
    assert.ok(aWhileBFinished.entries.some(entry => entry.streaming));
    await writeFile(path.join(output, 'ai-concurrent-conversations.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await page.getByRole('button', { name: '网页工作台', exact: true }).click();
    await page.getByRole('button', { name: '停止生成', exact: true }).click();
    releaseModel?.();
    await page.waitForFunction(async id => !(await window.workbench.ai.chatOpen(id)).entries.some(entry => entry.streaming), a.id);
  });
  await check('Browser overflow menu is keyboard accessible and appears above the live guest', async () => {
    const trigger = page.locator('#view-browser .browser-menu-trigger');
    await trigger.focus(); await page.keyboard.press('Enter');
    const menu = page.getByRole('menu', { name: '浏览器选项', exact: true });
    await menu.waitFor();
    await page.waitForFunction(() => document.activeElement?.textContent === '历史记录');
    await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(() => document.activeElement.textContent), '任务记录');
    assert.ok(await menu.evaluate(element => { const r=element.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return element.contains(hit); }));
    const window = await application.browserWindow(page);
    await writeFile(path.join(output, 'browser-combined-menu.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await page.keyboard.press('Escape'); await menu.waitFor({ state:'hidden' });
    assert.equal(await page.locator('.ai-topbar-btn').getAttribute('aria-expanded'), 'true', 'Closing the browser menu must not close the assistant');
    assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    await trigger.click(); await menu.waitFor();
    await page.getByRole('textbox', { name: '发送给当前对话的 AI 助手', exact: true }).focus();
    await page.keyboard.press('Escape'); await menu.waitFor({ state: 'hidden' });
    assert.equal(await page.locator('.ai-topbar-btn').getAttribute('aria-expanded'), 'true', 'Escape must dismiss the open menu before the assistant even after focus leaves the menu');
    assert.equal(await page.locator('#view-browser .browser-utilities').count(), 0);
    assert.equal(await page.locator('#view-browser .media-browser-header').count(), 0);
  });
  await check('Browser menu zoom changes the real page, enforces limits and follows native site zoom across tabs and reload', async () => {
    const window = await application.browserWindow(page);
    const view = page.locator('#view-browser'), trigger = view.locator('.browser-menu-trigger');
    const menu = page.getByRole('menu', { name: '浏览器选项', exact: true });
    const percentage = menu.getByLabel('当前网页缩放', { exact: true });
    const smaller = menu.getByRole('button', { name: '缩小网页', exact: true }), larger = menu.getByRole('button', { name: '放大网页', exact: true });
    const reset = menu.getByRole('button', { name: '重置网页缩放', exact: true });
    const nativeZoom = () => view.locator('webview').filter({ visible: true }).evaluate(element => element.getZoomFactor());
    const nonce = await readFixture('fixture.nonce'), width = await readFixture('innerWidth');
    const shellZoom = await window.evaluate(window => window.webContents.getZoomFactor());
    await trigger.click(); await percentage.filter({ hasText: '100%' }).waitFor();
    assert.equal(await reset.isDisabled(), true);
    await smaller.focus(); await page.keyboard.press('Enter');
    await percentage.filter({ hasText: '90%' }).waitFor();
    assert.ok(Math.abs(await nativeZoom() - 0.9) < 0.001);
    await reset.click();
    await larger.click(); await larger.click();
    await percentage.filter({ hasText: '125%' }).waitFor();
    assert.ok(await readFixture('innerWidth') < width, 'Page zoom must change the actual CSS viewport');
    assert.equal(await window.evaluate(window => window.webContents.getZoomFactor()), shellZoom, 'App chrome must retain its own scale');
    await writeFile(path.join(output, 'browser-zoom-125.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await menu.screenshot({ path: path.join(output, 'browser-zoom-menu.png'), animations: 'disabled' });
    for (let count = 0; count < 30 && await smaller.isEnabled(); count++) await smaller.click();
    assert.equal(await percentage.textContent(), '25%'); assert.equal(await smaller.isDisabled(), true);
    assert.ok(Math.abs(await nativeZoom() - 0.25) < 0.001);
    for (let count = 0; count < 30 && await larger.isEnabled(); count++) await larger.click();
    assert.equal(await percentage.textContent(), '500%'); assert.equal(await larger.isDisabled(), true);
    assert.ok(Math.abs(await nativeZoom() - 5) < 0.001);
    await reset.click(); await larger.click(); await larger.click();
    await page.keyboard.press('Escape');
    await view.getByRole('button', { name: '新标签页', exact: true }).click();
    await trigger.click();
    assert.equal(await smaller.isDisabled(), true); assert.equal(await larger.isDisabled(), true);
    await page.keyboard.press('Escape');
    await navigate(`${other}/zoom`);
    await trigger.click(); await percentage.filter({ hasText: '100%' }).waitFor();
    assert.ok(Math.abs(await nativeZoom() - 1) < 0.001, 'A different site must not inherit the original site zoom');
    await page.keyboard.press('Escape');
    await navigate(`${base}/zoom`);
    await trigger.click(); await percentage.filter({ hasText: '125%' }).waitFor();
    assert.ok(Math.abs(await nativeZoom() - 1.25) < 0.001, 'Same-origin tabs must reflect the native shared zoom');
    await larger.click(); await page.keyboard.press('Escape');
    await view.locator('.mbp-tab.on .mbp-tab-x').click();
    await trigger.click(); await percentage.filter({ hasText: '150%' }).waitFor();
    assert.ok(Math.abs(await nativeZoom() - 1.5) < 0.001);
    assert.equal(await readFixture('fixture.nonce'), nonce, 'Zoom and tab switching must preserve the live page');
    await reset.click(); await larger.click(); await page.keyboard.press('Escape');
    await view.getByRole('button', { name: '刷新', exact: true }).click();
    await page.waitForFunction(() => { const view = document.querySelector('#view-browser webview'); return view && !view.isLoading(); });
    await trigger.click(); await percentage.filter({ hasText: '110%' }).waitFor();
    await reset.click(); await page.keyboard.press('Escape');
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
    await view.getByRole('button', { name: '等待站点授权', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await view.locator('.browser-task-controls').evaluate(element => getComputedStyle(element).animationName), 'browser-task-breathe');
    assert.equal(await view.locator('.browser-task-controls').evaluate(element => getComputedStyle(element, '::before').animationName), 'browser-task-flow');
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.deepEqual(state.tasks.at(-1).tabIds, []);
    const card = page.locator('.ai-compose-wrap > .ai-site-approval');
    await card.waitFor();
    assert.equal(await card.getByRole('button', { name: '允许并继续', exact: true }).isEnabled(), true);
    assert.ok((await card.textContent()).includes(state.tasks.at(-1).pendingOrigin));
    const window = await application.browserWindow(page);
    for (const [theme, width, height] of [['mist', 1440, 852], ...['mist', 'cool', 'warm'].flatMap(theme => [[theme, 1280, 820], [theme, 1024, 680]])]) {
      await window.evaluate((window, size) => window.setContentSize(...size), [width, height]);
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
      await page.waitForFunction(width => Math.abs(innerWidth - width) < 2, width);
      const before = await card.boundingBox();
      await page.locator('.ai-messages').evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')); });
      assert.deepEqual(await card.boundingBox(), before, 'Reading chat history must not move the fixed authorization card');
      assert.equal(await card.evaluate(element => {
        const rect = element.getBoundingClientRect(), composer = document.querySelector('.ai-compose').getBoundingClientRect();
        return rect.top >= 0 && rect.bottom <= composer.top && composer.bottom <= innerHeight && element.scrollWidth <= element.clientWidth;
      }), true, `${theme}/${width}: card and input must stay inside the panel without overlap`);
      for (const name of ['不允许', '允许并继续']) assert.equal(await card.getByRole('button', { name, exact: true }).evaluate(button => { const rect = button.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2); return hit === button || button.contains(hit); }), true);
      await page.locator('.ai-site-approval-receipt button').last().click();
      assert.equal(await card.evaluate(element => element === document.activeElement), true);
      await page.locator('.ai-messages').evaluate(element => { element.scrollTop = element.scrollHeight; element.dispatchEvent(new Event('scroll')); });
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await writeFile(path.join(output, `site-approval-${theme}-${width}.png`), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    }
    await window.evaluate(window => window.setContentSize(1280, 820));
    await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
    await card.getByRole('button', { name: '允许并继续', exact: true }).click();
    await view.getByRole('button', { name: '页面条件验证通过', exact: true }).waitFor({ timeout: 30000 });
    assert.equal(await card.count(), 0);
    assert.equal((await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1).siteApprovals[0].status, 'allowed');
    await view.getByRole('tab', { name: '浏览器合成测试 /form', exact: true }).click();
  });
  await check('Denying the docked site card stops the pending request without opening a tab', async () => {
    const view = page.locator('#view-browser');
    await view.getByRole('button', { name: '新标签页', exact: true }).click();
    await sendChat('空白页打开测试：等待授权后再打开合成指定地址。');
    const card = page.locator('.ai-compose-wrap > .ai-site-approval');
    await card.waitFor();
    const tabsBefore = await view.getByRole('tab').count();
    await card.getByRole('button', { name: '不允许', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    await page.locator('.ai-site-approval-receipt').filter({ hasText: '未授权，已停止本次任务' }).waitFor();
    const task = (await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1);
    assert.equal(task.status, 'cancelled'); assert.equal(task.siteApprovals[0].status, 'denied'); assert.deepEqual(task.tabIds, []);
    assert.equal(await view.getByRole('tab').count(), tabsBefore);
    const window = await application.browserWindow(page);
    await writeFile(path.join(output, 'site-approval-denied.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await view.locator('.mbp-tab:has([role="tab"][aria-selected="true"]) .mbp-tab-x').click();
    await view.getByRole('tab', { name: '浏览器合成测试 /form', exact: true }).click();
  });
  await check('Popup adoption and cross-site navigation wait for the visible site grant', async () => {
    const view = page.locator('#view-browser');
    await sendChat('跨站弹窗测试：打开弹窗标签，访问合成跨站地址并核验。');
    await view.getByRole('button', { name: '等待站点授权', exact: true }).waitFor({ timeout: 30000 });
    const waiting = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(waiting.tasks.at(-1).tabIds.length, 2);
    assert.equal(waiting.tasks.at(-1).pendingOrigin, other);
    await page.getByRole('button', { name: '首页', exact: true }).click();
    await page.getByRole('button', { name: '浏览器等待站点授权', exact: true }).click();
    await openBrowserOption('允许此站点');
    await view.getByRole('button', { name: '页面条件验证通过', exact: true }).waitFor({ timeout: 30000 });
    await view.getByRole('tab', { name: '浏览器合成测试 /form', exact: true }).click();
  });
  await check('Background browser task writes while its workspace and AI panel are hidden, without taking focus', async () => {
    await readFixture('document.querySelector("#name").value="后台前"; document.querySelector("#result").textContent="尚未保存"');
    holdModel = true;
    const view = page.locator('#view-browser');
    await sendChat('切换工作台后继续填写测试名称并保存核验。');
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).waitFor();
    const before = await readFixture('({nonce:fixture.nonce,clicks:fixture.clicks})');
    await page.getByRole('complementary', { name: 'AI 助手', exact: true }).getByRole('button', { name: '收起 AI 助手', exact: true }).click();
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).waitFor();
    const window = await application.browserWindow(page);
    await writeFile(path.join(output, 'browser-running-controls.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
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
    const window = await application.browserWindow(page);
    const controls = view.locator('.browser-task-controls');
    const effect = () => controls.evaluate(element => {
      const style = getComputedStyle(element), edge = getComputedStyle(element, '::before'), rect = element.getBoundingClientRect();
      const label = getComputedStyle(element.querySelector('.browser-task-label'));
      return { animation: style.animationName, background: style.backgroundColor, labelColor: label.color, labelOpacity: label.opacity, edgeAnimation: edge.animationName, angle: edge.getPropertyValue('--browser-task-flow-angle'), edgeDisplay: edge.display, pointerEvents: edge.pointerEvents, bounds: { x: rect.x, y: rect.y, width: rect.width, height: rect.height } };
    });
    const movingEffect = async status => {
      const start = await effect();
      await new Promise(resolve => setTimeout(resolve, 400));
      const end = await effect();
      assert.equal(end.animation, 'browser-task-breathe', status);
      assert.equal(end.edgeAnimation, 'browser-task-flow', status);
      assert.notEqual(start.background, end.background, `${status}: background must actually breathe`);
      assert.notEqual(start.angle, end.angle, `${status}: edge highlight must actually move`);
      assert.equal(start.labelColor, end.labelColor); assert.equal(start.labelOpacity, end.labelOpacity);
      assert.deepEqual(start.bounds, end.bounds, 'Animation must not shift the clickable controls');
      assert.equal(end.pointerEvents, 'none');
      return { status, start, end };
    };
    const captureEffect = async (name, details) => {
      await window.evaluate(window => window.setContentSize(1280, 820));
      await page.waitForFunction(() => Math.abs(innerWidth - 1280) < 2);
      await page.evaluate(async () => { await Promise.all(document.getAnimations().filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished.catch(() => {}))); });
      const bounds = await controls.boundingBox();
      const region = { x: Math.floor(bounds.x) - 8, y: Math.floor(bounds.y) - 8, width: Math.ceil(bounds.width) + 16, height: Math.ceil(bounds.height) + 16 };
      const frames = [], started = Date.now();
      for (let index = 0; index < 16; index++) {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, started + index * 200 - Date.now())));
        const frame = `${name}-frame-${String(index).padStart(2, '0')}.png`;
        await writeFile(path.join(output, frame), Buffer.from(await window.evaluate(async (window, region) => (await window.webContents.capturePage(region)).toPNG().toString('base64'), region), 'base64'));
        frames.push(frame);
      }
      await writeFile(path.join(output, `${name}.json`), JSON.stringify({ ...details, region, frames, delayMs: 200 }, null, 2));
      await writeFile(path.join(output, `${name}.png`), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    };
    await check('Visible task effects move without shifting controls and respect reduced motion and forced colors', async () => {
      const states = [];
      for (const theme of ['mist', 'cool', 'warm']) {
        await page.evaluate(theme => { document.documentElement.dataset.theme = theme; }, theme);
        states.push({ theme, ...await movingEffect(`running-${theme}`) });
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      const reduced = await effect();
      assert.equal(reduced.animation, 'none'); assert.equal(reduced.edgeAnimation, 'none');
      assert.equal(await controls.locator('.browser-task-spinner').evaluate(element => getComputedStyle(element).animationName), 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'active' });
      const contrast = await effect(); assert.equal(contrast.animation, 'none'); assert.equal(contrast.edgeDisplay, 'none');
      await page.emulateMedia({ reducedMotion: 'no-preference', forcedColors: 'none' });
      await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
      await captureEffect('browser-task-effects', { states, reduced, contrast });
    });
    for (const [width, height] of [[1280, 820], [1024, 680]]) {
      await window.evaluate((window, size) => window.setContentSize(...size), [width, height]);
      await page.waitForFunction(({ width, height }) => {
        const button=document.querySelector('#view-browser [aria-label="接管 / 暂停"]'); if (!button || Math.abs(innerWidth-width)>2 || Math.abs(innerHeight-height)>2) return false;
        const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===button||button.contains(hit);
      }, { width, height });
    }
    await writeFile(path.join(output, 'browser-running-1024.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await view.locator('.browser-menu-trigger').click();
    const zoomMenu = page.getByRole('menu', { name: '浏览器选项', exact: true });
    await zoomMenu.getByRole('button', { name: '放大网页', exact: true }).click();
    await view.getByRole('button', { name: '已暂停 · 可手动操作', exact: true }).waitFor();
    const paused = await movingEffect('paused');
    await zoomMenu.getByLabel('当前网页缩放', { exact: true }).filter({ hasText: '110%' }).waitFor();
    await zoomMenu.getByRole('button', { name: '重置网页缩放', exact: true }).click();
    await page.keyboard.press('Escape');
    await captureEffect('browser-task-paused', { states: [paused] });
    await view.getByRole('button', { name: '继续操作', exact: true }).click();
    await view.getByRole('button', { name: '接管 / 暂停', exact: true }).click();
    await view.getByRole('button', { name: '停止任务', exact: true }).click();
    holdModel = false; releaseModel?.();
    await view.getByRole('button', { name: '已停止', exact: true }).waitFor();
    const cancelled = await movingEffect('cancelled');
    await writeFile(path.join(output, 'browser-task-persistent-effects.json'), JSON.stringify({ paused, cancelled }, null, 2));
    assert.equal((await readFixture('fixture')).clicks, before);
    await window.evaluate(window => window.setContentSize(1280, 820));
  });
  await check('Website operation UI has no goal form, annotations or developer diagnostics', async () => {
    const view = page.locator('#view-browser');
    assert.equal(await view.getByRole('textbox', { name: '浏览器任务目标' }).count(), 0);
    assert.equal(await view.getByRole('button', { name: '标注给 AI', exact: true }).count(), 0);
    assert.equal(await view.getByRole('button', { name: '页面诊断', exact: true }).count(), 0);
    await openBrowserOption('历史记录');
    await page.getByRole('dialog').getByText(`${base}/form`, { exact: true }).first().waitFor();
    await page.keyboard.press('Escape');
  });
  await check('Clarification continues in the same sidebar conversation without a separate task form', async () => {
    const view = page.locator('#view-browser');
    await sendChat('先澄清测试：确认后填写测试名称并保存核验。');
    await view.getByRole('button', { name: '执行结束 · 结果尚未验证', exact: true }).waitFor();
    const before = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    const task = before.tasks.at(-1);
    await sendChat('已确认，填写 AI 中文验证，点击保存并检查保存成功。');
    await view.getByRole('button', { name: '页面条件验证通过', exact: true }).waitFor();
    assert.equal(await view.locator('.browser-task-controls').evaluate(element => getComputedStyle(element).animationName), 'browser-task-breathe');
    assert.equal(await view.locator('.browser-task-controls').evaluate(element => getComputedStyle(element, '::before').animationName), 'browser-task-flow');
    const after = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(after.tasks.at(-1).id, task.id);
    assert.equal(after.tasks.at(-1).status, 'completed');
    assert.equal(await readFixture('document.querySelector("#name").value'), 'AI 中文验证', 'Repeated fill must replace the current field, even when a previous success message exists');
  });
  await check('Model can open/select/close its own tab without interrupting the remaining task', async () => {
    const view = page.locator('#view-browser');
    await sendChat('标签开关测试：打开新标签、切换后关闭它，核验原页面地址。');
    await view.getByRole('button', { name: '页面条件验证通过', exact: true }).waitFor({ timeout: 30000 });
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.equal(state.tasks.at(-1).status, 'completed'); assert.equal(state.tasks.at(-1).tabIds.length, 1);
    assert.equal(await page.locator('#view-browser .mbp-tab-title').filter({ hasText: '/opened' }).count(), 0);
    await page.locator('#view-browser .mbp-tab.on .mbp-tab-title').filter({ hasText: '/form' }).waitFor();
  });
  await check('Historical reply opens its own task after later tasks update the same conversation', async () => {
    const state = await page.evaluate(() => window.workbench.browserAutomation.state('default'));
    assert.notEqual(state.tasks.at(-1).id, firstBrowserReply.task.id);
    const chat = await page.evaluate(id => window.workbench.ai.chatOpen(id), firstBrowserReply.chatId);
    assert.deepEqual(chat.entries.find(entry => entry.id === firstBrowserReply.entryId).browserTask, firstBrowserReply.reference);
    await page.getByRole('button', { name: '查看操作记录', exact: true }).first().click();
    const record = page.getByRole('dialog', { name: '浏览器操作记录', exact: true });
    await record.getByRole('heading', { name: firstBrowserReply.task.goal, exact: true }).waitFor();
    assert.equal(await record.locator('.browser-task-detail > .browser-task-steps > li').count(), firstBrowserReply.task.steps.length);
    await record.evaluate(async element => { await Promise.all(element.getAnimations({ subtree:true }).filter(animation => Number.isFinite(animation.effect?.getComputedTiming().endTime)).map(animation => animation.finished)); });
    const window = await application.browserWindow(page);
    await writeFile(path.join(output, 'browser-reply-record.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    await page.keyboard.press('Escape');
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
    await openBrowserOption('历史记录');
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
    await openBrowserOption('清理当前站点数据…');
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
    assert.equal(await page.locator('.media-browser-host').count(), 1, 'Creator host remains unique beside the retained generic browser');
    assert.equal(await page.locator('.browser-host').count(), 1);
    assert.equal(await page.getByText(/^操作网页：/).count(),0);
    assert.equal(await page.locator('.ai-ctx-name').textContent(), creatorTitle);
    await sendChat('博客网页协作测试：把当前协助文章的标题和正文填入网页，先不要发布。');
    await page.locator('#view-media-browser').getByRole('button', { name: '页面条件验证通过', exact:true }).waitFor({ timeout:60000 });
    const filled=await application.evaluate(({ webContents })=>webContents.getAllWebContents().find(contents=>contents.getType()==='webview'&&contents.getURL().startsWith('https://creator.xiaohongshu.com/')).executeJavaScript('({title:document.querySelector("#article-title").value,body:document.querySelector("#article-body").value})'));
    assert.deepEqual(filled,{title:creatorTitle,body:creatorBody});
    const creatorView = page.locator('#view-media-browser');
    await creatorView.locator('.browser-menu-trigger').click();
    const creatorZoom = page.getByRole('menu', { name: '浏览器选项', exact: true });
    await creatorZoom.getByRole('button', { name: '放大网页', exact: true }).click();
    await creatorZoom.getByLabel('当前网页缩放', { exact: true }).filter({ hasText: '110%' }).waitFor();
    assert.ok(Math.abs(await creatorView.locator('webview').evaluate(element => element.getZoomFactor()) - 1.1) < 0.001);
    await creatorZoom.getByRole('button', { name: '重置网页缩放', exact: true }).click();
    await page.keyboard.press('Escape');
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
        const button=document.querySelector('#view-browser .browser-menu-trigger'); if(!button) return false;
        const r=button.getBoundingClientRect(),hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
        const moving=document.getAnimations().some(animation=>animation.playState==='running'&&animation.effect?.target instanceof Element&&animation.effect.target.contains(button));
        return !moving && (hit===button || button.contains(hit));
      }, { width, height }, { timeout: 5000 });
      const layout = await page.locator('#view-browser .mbp-stage').boundingBox();
      assert.ok(layout.width > 300 && layout.height > 150, `Browser remains usable: ${theme}/${width}`);
      assert.ok(await page.locator('#view-browser .mbp-tabs').evaluate(element => element.scrollWidth <= element.clientWidth + 1), `Four tabs should shrink before adding a scrollbar: ${theme}/${width}`);
      assert.ok(await page.locator('#view-browser .browser-menu-trigger').evaluate(button => { const r=button.getBoundingClientRect();const hit=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return hit===button||button.contains(hit); }), `Browser controls must remain reachable with the AI panel open: ${theme}/${width}`);
      const image = await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64'));
      layouts.push({theme, requested:[width,height], nativeContent:await window.evaluate(window=>window.getContentSize()), viewport:await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio})), browser:layout});
      await writeFile(path.join(output, `${theme}-${width}.png`), Buffer.from(image, 'base64'));
      await page.locator('#view-browser .browser-menu-trigger').click();
      const menu = page.getByRole('menu', { name:'浏览器选项', exact:true }); await menu.waitFor();
      assert.ok(await menu.evaluate(element => { const r=element.getBoundingClientRect(); return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight; }), `Menu stays inside viewport: ${theme}/${width}`);
      await writeFile(path.join(output, `${theme}-${width}-menu.png`), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
      await page.keyboard.press('Escape');
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
    const chat = await page.evaluate(id => window.workbench.ai.chatOpen(id), firstBrowserReply.chatId);
    assert.deepEqual(chat.entries.find(entry => entry.id === firstBrowserReply.entryId).browserTask, firstBrowserReply.reference);
  });
  await check('Confirmed site-data clearing only affects the selected persistent profile/site', async () => {
    await application.evaluate(async ({ session }) => session.fromPartition('persist:wb-browser-xhs-creator').cookies.set({ url: 'https://creator.xiaohongshu.com', name: 'synthetic_profile', value: 'keep', expirationDate: Math.floor(Date.now()/1000)+3600 }));
    const view = page.locator('#view-browser');
    await openBrowserOption('清理当前站点数据…');
    await page.getByRole('dialog').getByRole('button', { name: '确认清理', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    const cookies = await application.evaluate(async ({ session }) => ({ current: await session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session', domain: '127.0.0.1' }), otherSite: await session.fromPartition('persist:wb-browser-default').cookies.get({ name: 'synthetic_session', domain: 'localhost' }), separate: await session.fromPartition('persist:wb-browser-xhs-creator').cookies.get({ name: 'synthetic_profile' }) }));
    assert.equal(cookies.current.length, 0); assert.equal(cookies.otherSite.length, 1); assert.equal(cookies.separate.length, 1);
    assert.equal(await readFixture('localStorage.getItem("fixture")'), null);
  });
  await check('Selected permission design is visible in a fresh chat and remains pending until a real click', async () => {
    const view = page.locator('#view-browser');
    await view.getByRole('button', { name: '新标签页', exact: true }).click();
    if (await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') !== 'true') await page.locator('.ai-topbar-btn').click();
    await page.locator('.ai-ctx-new').click();
    await sendChat('帮我打开百度');
    const card = page.locator('.ai-compose-wrap > .ai-site-approval');
    await card.waitFor();
    const window = await application.browserWindow(page);
    await window.evaluate(window => window.setContentSize(1440, 852));
    await page.evaluate(() => { document.documentElement.dataset.theme = 'mist'; });
    await page.waitForFunction(() => Math.abs(innerWidth - 1440) < 2);
    await page.locator('.ai-messages').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await writeFile(path.join(output, 'site-approval-selected.png'), Buffer.from(await window.evaluate(async window => (await window.webContents.capturePage()).toPNG().toString('base64')), 'base64'));
    assert.ok((await card.textContent()).includes('https://www.baidu.com'));
    const task = (await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1);
    assert.equal(task.status, 'site-approval'); assert.deepEqual(task.tabIds, []);
    await card.getByRole('button', { name: '不允许', exact: true }).click();
    await card.waitFor({ state: 'detached' });
    assert.equal((await page.evaluate(() => window.workbench.browserAutomation.state('default'))).tasks.at(-1).status, 'cancelled');
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(consoleMessages.filter(message => message.level === 'error'), []);
  await writeFile(path.join(output, 'console.json'), JSON.stringify(consoleMessages, null, 2));
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ status: 'passed', checks, layouts, screenshots: ['browser-verification-checklist.png', 'browser-verification-expanded.png', 'ai-concurrent-chat-list.png', 'ai-concurrent-conversations.png', 'browser-zoom-125.png', 'browser-zoom-menu.png', 'browser-combined-menu.png', 'browser-reply-record.png', 'browser-running-controls.png', 'browser-running-1024.png', 'creator-linked-chat.png', 'model-multimodal-setting.png', 'model-multimodal-off.png', 'model-multimodal-on-row.png', 'model-multimodal-off-row.png', 'address-history.png', 'history-panel.png', ...['mist', 'cool', 'warm'].flatMap(theme => [1280, 1024].flatMap(width => [`${theme}-${width}.png`, `${theme}-${width}-menu.png`]))], limitations: ['Synthetic model and creator-site content served locally, not real external model or website compatibility tests', 'Development Electron binary; not an installer or cross-version update check'], requests: requests.length }, null, 2));
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
