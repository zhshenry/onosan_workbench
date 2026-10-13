// Real installed Electron webviews. The temporary HTTPS responses contain only
// local synthetic content; production partitions, URL checks and permissions stay intact.
import assert from 'node:assert/strict';
import { bounded } from './pilot-cleanup.mjs';

export const MEDIA_KEEPALIVE_SCREENSHOTS = Object.freeze([
  'media-keepalive-before.png', 'media-keepalive-hidden.png',
  ...['mist', 'cool', 'warm'].flatMap(theme => [1280, 1024].map(width => `media-keepalive-${theme}-${width}.png`)),
]);
export const MEDIA_FIXTURE_ORIGIN = 'https://creator.xiaohongshu.com';
export const MEDIA_FIXTURE_PATHS = Object.freeze(['/', '/note/keepalive', '/note/next', '/offline']);
const MEDIA_GUEST_SECURITY = Object.freeze({ contextIsolation:true, sandbox:true, webSecurity:true,
  nodeIntegration:false, nodeIntegrationInWorker:false, nodeIntegrationInSubFrames:false,
  webviewTag:false, plugins:false, allowRunningInsecureContent:false });
export function isMediaFixtureUrl(value) {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  return url.origin === MEDIA_FIXTURE_ORIGIN && !url.username && !url.password && !url.search && !url.hash
    && MEDIA_FIXTURE_PATHS.includes(url.pathname);
}
export function mediaFixtureHtml(route) {
  assert.ok(MEDIA_FIXTURE_PATHS.includes(route));
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Issue 35 本地合成网页</title>
<style>body{margin:0;font:16px/1.6 sans-serif;color:#222;background:#f4f5f7;min-height:3400px}
header,main{padding:20px 28px}header{background:white;border-bottom:1px solid #ddd}
h1{font-size:24px;margin:0}nav{display:flex;gap:24px;margin:16px 0}textarea{display:block;width:72%;height:100px;box-sizing:border-box;font:16px sans-serif;padding:12px}
#click-target{position:fixed;right:24px;top:150px;padding:12px;border:1px solid #64718a;background:#fff;border-radius:8px}
.long{height:2800px;padding:60px 0;background:linear-gradient(#e9edf2,#eff4f5)}.line{margin-top:360px}</style>
<header><h1>本地合成网页 · 跨工作台保活验收</h1><div>无账号、无发布、无外部网络。当前路径：${route}</div></header>
<main><nav><a id="nested" href="/note/keepalive">进入未发布草稿</a><a id="next" href="/note/next">另一个草稿</a><a id="offline" href="/offline">本地失败反例</a></nav>
<label for="draft">本地未提交草稿</label><textarea id="draft" aria-label="本地未提交草稿"></textarea>
<button id="click-target">点击定位</button><div class="long"><p>下面的长页面用于核对原滚动位置。</p><p class="line">位置一</p><p class="line">位置二</p><p class="line">位置三</p></div></main>
<script>window.__mediaFixture={nonce:crypto.randomUUID(),keys:0,clicks:0,targetClicks:0,focusAttempts:0,wheelEvents:[]};
document.addEventListener('keydown',()=>window.__mediaFixture.keys++);
document.addEventListener('click',()=>window.__mediaFixture.clicks++);
document.addEventListener('wheel',event=>{const events=window.__mediaFixture.wheelEvents;
events.push({deltaX:event.deltaX,deltaY:event.deltaY,clientX:event.clientX,clientY:event.clientY,isTrusted:event.isTrusted,targetId:event.target?.id??null});
if(events.length>12)events.shift()},{passive:true});
document.getElementById('click-target').addEventListener('click',()=>window.__mediaFixture.targetClicks++);
window.tryFixtureFocus=()=>{window.__mediaFixture.focusAttempts++;document.getElementById('draft').focus({preventScroll:true});window.focus()};</script></html>`;
}

export function assertMediaStatePreserved(before, after) {
  for (const key of ['id', 'url', 'nonce', 'draft']) assert.equal(after[key], before[key], `Workspace switch must preserve ${key}`);
  assert.ok(Number.isFinite(after.scrollY) && Math.abs(after.scrollY - before.scrollY) <= 2, 'Workspace switch must preserve scroll');
  assert.deepEqual(after.history, before.history, 'Workspace switch must preserve the real native navigation history');
}
export function assertMediaGuestSecurity(id, reported, attachment) {
  assert.ok(reported && typeof reported === 'object', 'Native preferences must be an actual reported object');
  assert.equal(attachment?.id, id, 'Security observations must belong to this native guest');
  assert.equal(attachment?.partition, 'persist:wb-browser-xhs-creator', 'Security observations must use the creator partition');
  assert.equal(attachment?.matchingRequests, 1, 'Each native attachment must correlate with exactly one observed request');
  assert.ok(attachment?.requestedSrc?.startsWith('about:blank#'), 'Observed attachment must use the actual reservation route');
  assert.equal(attachment?.initialUrl, attachment?.requestedSrc, 'The native initial route must match the observed attachment request');
  for (const [key, expected] of Object.entries(MEDIA_GUEST_SECURITY)) {
    assert.equal(attachment?.preferences?.[key], expected, `Actual post-guard will-attach preference ${key} must be ${expected}`);
    // Electron 44.4.4 SaveLastPreferences does not expose plugins. Do not
    // interpret an omitted key as false: prove it in the real will-attach event.
    // https://github.com/electron/electron/blob/v44.4.4/shell/browser/web_contents_preferences.cc
    if (key !== 'plugins' || Object.hasOwn(reported, key)) {
      assert.equal(reported[key], expected, `Native reported preference ${key} must be ${expected}`);
    }
  }
}
export function assertMediaGeometry(value) {
  const { content, stage, webview, guestViewport, viewport } = value;
  for (const rect of [content, stage, webview]) for (const key of ['x', 'y', 'width', 'height']) assert.ok(Number.isFinite(rect?.[key]), 'Native fixture geometry must exist and be finite');
  assert.ok(stage.width > 200 && stage.height > 150, 'Guest must have usable visible bounds');
  assert.ok(stage.x >= content.x - 2 && stage.y >= content.y - 2 && stage.x + stage.width <= content.x + content.width + 2 && stage.y + stage.height <= content.y + content.height + 2, 'Browser stage must fit the content area');
  assert.ok(webview.x >= 0 && webview.y >= 0 && webview.x + webview.width <= viewport.width + 2 && webview.y + webview.height <= viewport.height + 2, 'Webview must fit the current viewport');
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(webview[key] - stage[key]) <= 2, 'Webview must follow the actual stage, including reveal/resize');
  assert.ok(Math.abs(guestViewport.width - webview.width) <= 2 && Math.abs(guestViewport.height - webview.height) <= 2, 'Native guest viewport must match its current DOM surface');
  assert.ok(value.contentOverflow <= 1, 'Creator must not add page-level vertical scrolling');
}

async function until(page, action, predicate, description) {
  const deadline = Date.now() + 15000;
  let result;
  do {
    result = await action();
    if (predicate(result)) return result;
    await page.waitForTimeout(80);
  } while (Date.now() < deadline);
  assert.fail(`${description}: ${JSON.stringify(result)}`);
}
async function aiVisible(page, visible) {
  const expanded = await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') === 'true';
  if (expanded !== visible) await page.locator('.ai-topbar-btn').click();
  await page.waitForFunction(visible => document.querySelector('.win')?.classList.contains('ai-dock') === visible, visible);
}
async function subview(page, workbench, label) {
  const rail = page.locator(`.rail [data-workbench="${workbench}"]`);
  await rail.click();
  if (await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') === 'true') {
    // A rail click closes its menu while leaving the pointer/focus there.
    // Leave it first so hover produces the real mouse-enter that opens the flyout.
    await page.locator('.topbar .avatar').hover();
    await rail.hover();
    await page.locator(`#rail-menu-${workbench}`).getByRole('button', { name: label, exact: true }).click();
  } else {
    await page.locator('.tree').getByRole('button', { name: label, exact: true }).click();
  }
}

export async function closeUnchangedMediaTaskEditor(page) {
  const dialog = page.locator('.task-modal[open]');
  const title = await dialog.getAttribute('aria-label');
  assert.ok(title === '新增事项' || title === '编辑事项', `Unexpected current-page task editor: ${title}`);
  // TaskEditor exposes a text return control only when creating. Existing-item
  // editing uses Modal's accessible close icon; do not submit either form.
  await dialog.getByRole('button', { name:title === '新增事项' ? '返回' : '关闭', exact:true }).click();
  await dialog.waitFor({ state:'hidden' });
}

/** Arm a fresh synthetic guest for the existing real UI quit, leaving teardown to the app. */
export async function prepareMediaKeepaliveQuit({application,page,report}) {
  const token=`media35-quit-${Date.now()}`;
  try {
    await application.evaluate(({app,session},{token,html,url})=>{
      if(globalThis.__onoMediaKeepaliveQuit) throw new Error('Duplicate media quit fixture');
      if(globalThis.__onoMediaKeepaliveFixture) throw new Error('Previous media fixture cleanup has not completed');
      const partition=session.fromPartition('persist:wb-browser-xhs-creator');
      if(partition.protocol.isProtocolHandled('https')) throw new Error('Quit fixture must not replace an existing HTTPS handler');
      const fixture={token,partition,handled:false,cleanup:null,cleanupError:null};globalThis.__onoMediaKeepaliveQuit=fixture;
      partition.protocol.handle('https',request=>request.url===url?new Response(html,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store'}}):Response.error());
      fixture.handled=true;
      if(!partition.protocol.isProtocolHandled('https')) throw new Error('Quit fixture handler registration was not observed');
      fixture.cleanup=()=>{
        if(globalThis.__onoMediaKeepaliveQuit!==fixture) return;
        try {
          if(fixture.handled){
            partition.protocol.unhandle('https');
            if(partition.protocol.isProtocolHandled('https')) throw new Error('Quit fixture handler was not removed');
            fixture.handled=false;
          }
          delete globalThis.__onoMediaKeepaliveQuit;
        } catch(error) { fixture.cleanupError=String(error); throw error; }
      };
      // On normal exit the real owner/BrowserGuests teardown destroys the guest.
      // The fixture only removes its own response handler; it does not destroy the guest early.
      app.once('will-quit',fixture.cleanup);
    },{token,html:mediaFixtureHtml('/'),url:MEDIA_FIXTURE_ORIGIN+'/'});
    await aiVisible(page,false);await creator(page,true);const id=await guestId(page);
    await loaded(application,page,id,'/');await clickGuest(application,page,id,'#draft');await page.keyboard.type('Quit-only unsent fixture');
    const retained=await until(page,()=>nativeState(application,id),value=>value?.draft==='Quit-only unsent fixture','Quit fixture input must be real');
    await page.locator('.rail [data-workbench="home"]').click();await assertHidden(application,page,id);
    assertMediaStatePreserved(retained,await nativeState(application,id));
    report.mediaKeepaliveQuit={guestId:id,nonce:retained.nonce,draft:retained.draft,retainedBeforeQuit:true,statePreservationAcrossRestart:false};
  } catch(error) {
    await application.evaluate(({app,webContents},token)=>{
      const fixture=globalThis.__onoMediaKeepaliveQuit;if(!fixture||fixture.token!==token)return;
      if(fixture.cleanup) app.removeListener('will-quit',fixture.cleanup);
      for(const guest of webContents.getAllWebContents()) if(guest.getType()==='webview'&&guest.session===fixture.partition&&!guest.isDestroyed()) guest.close({waitForBeforeUnload:false});
      if(fixture.handled){
        fixture.partition.protocol.unhandle('https');
        if(fixture.partition.protocol.isProtocolHandled('https')) throw new Error('Failed quit fixture handler was not removed');
        fixture.handled=false;
      }
      delete globalThis.__onoMediaKeepaliveQuit;
    },token).catch(cleanupError=>report.errors.push(`Media quit fixture cleanup: ${String(cleanupError)}`));
    throw error;
  }
}

export async function verifyMediaKeepaliveRelaunch({application,page,check,report}) {
  await check('Normal quit with retained creator exits cleanly; relaunch starts lazy without a stale guest',async()=>{
    assert.equal(report.mediaKeepaliveQuit.retainedBeforeQuit,true);
    assert.equal(report.mediaKeepaliveQuit.exitCode,0,'The existing real toolbar quit must exit the entire process normally');
    assert.equal(await page.locator('.media-browser-host').count(),0);
    assert.equal(await application.evaluate(({webContents})=>webContents.getAllWebContents().filter(value=>value.getType()==='webview').length),0);
    assert.equal(await application.evaluate(()=>Boolean(globalThis.__onoMediaKeepaliveFixture||globalThis.__onoMediaKeepaliveQuit)),false);
    report.mediaKeepaliveQuit.relaunchedLazy=true;
  });
}
async function creator(page, assertDefault = false) {
  await page.locator('.rail [data-workbench="media"]').click();
  if (assertDefault) await page.locator('.content .copy-wrap').waitFor({ state: 'visible' });
  await subview(page, 'media', '我的小红书');
  await page.locator('.media-browser-host[data-active="true"]').waitFor({ state: 'visible' });
}
async function guestId(page) {
  return until(page, () => page.evaluate(() => {
    try { return document.querySelector('.media-browser-host webview')?.getWebContentsId() ?? null; }
    catch { return null; }
  }), value => Number.isInteger(value) && value > 0, 'Creator native guest never attached');
}
async function nativeState(application, id) {
  return bounded(() => application.evaluate(async ({ webContents }, id) => {
    const guest = webContents.fromId(id);
    // executeJavaScript waits for main-frame loading to stop. Never execute it
    // against the deliberately gated initial response, or hold its release hostage.
    if (!guest || guest.isDestroyed() || guest.isLoading()) return null;
    let content;
    try {
      content = await guest.executeJavaScript(`(() => {
        const f=window.__mediaFixture;if(!f)return null;
        return {...f,draft:document.getElementById('draft').value,scrollY,
          guestViewport:{width:innerWidth,height:innerHeight},activeElement:document.activeElement?.id,documentFocused:document.hasFocus()};
      })()`, false);
    } catch { return null; }
    if (!content) return null;
    const names = ['will-frame-navigate', 'will-redirect', 'will-attach-webview', 'login', 'context-menu', 'did-start-navigation', 'did-navigate', 'destroyed'];
    return { id, url: guest.getURL(), ...content,
      focused: guest.isFocused(), focusedId: webContents.getFocusedWebContents()?.id ?? null,
      history: { index: guest.navigationHistory.getActiveIndex(), entries: guest.navigationHistory.getAllEntries().map(entry => ({ url: entry.url, title: entry.title })) },
      listeners: Object.fromEntries(names.map(name => [name, guest.listenerCount(name)])),
    };
  }, id), 5000, 'Synthetic native guest document read');
}
async function loaded(application, page, id, pathname) {
  return until(page, () => nativeState(application, id), value => value?.url === `${MEDIA_FIXTURE_ORIGIN}${pathname}`, `Synthetic guest did not load ${pathname}`);
}
async function clickGuest(application, page, id, selector) {
  const point = await application.evaluate(async ({ webContents }, { id, selector }) => {
    const guest = webContents.fromId(id);
    return guest.executeJavaScript(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e)return null;const r=e.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+r.height/2}})()`, false);
  }, { id, selector });
  assert.ok(point && point.x >= 0 && point.y >= 0, 'Fixture target must be on-screen');
  const surface = await page.locator('.media-browser-host webview').boundingBox();
  assert.ok(surface && point.x < surface.width && point.y < surface.height, 'Fixture target must fit the guest');
  await page.mouse.click(surface.x + point.x, surface.y + point.y);
  return { x: surface.x + point.x, y: surface.y + point.y };
}
async function geometry(application, page, id) {
  // Match finite animation/resize settling rather than reading a single intermediate frame.
  await page.waitForTimeout(350);
  return { ...await page.evaluate(() => {
    const rect = selector => { const r = document.querySelector(selector).getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; };
    const content = document.querySelector('.content');
    return { viewport: { width:innerWidth, height:innerHeight }, content:rect('.content'), stage:rect('.media-browser-host .mbp-stage'), webview:rect('.media-browser-host webview'), contentOverflow:content.scrollHeight-content.clientHeight };
  }), guestViewport: (await nativeState(application, id)).guestViewport };
}
async function probe(application) {
  return application.evaluate(() => {
    const probe = globalThis.__onoMediaKeepaliveFixture;
    return { requests: [...probe.requests], navigations: [...probe.navigations], attachments: [...probe.attachments], destroyed: [...probe.destroyed], pendingHome: Boolean(probe.releaseHome) };
  });
}

export async function restoreMediaFixtureNavigation({ application, page, native, id, report }) {
  const input = report.mediaKeepaliveNavigationInput = { id, expectedContentSize:[1280,820], readiness:null, before:null, attempts:[], after:null };
  await aiVisible(page,false); await page.emulateMedia({ reducedMotion:'no-preference' });
  await native.evaluate(win=>win.setContentSize(1280,820));
  let previousGeometry;
  await until(page,async()=>{
    const window = await native.evaluate(win=>({ contentSize:win.getContentSize(), focused:win.isFocused() }));
    const metrics = await geometry(application,page,id);
    return input.readiness = { window, metrics };
  },value=>{
    try { assertMediaGeometry(value.metrics); } catch { previousGeometry=undefined;return false; }
    if(value.window.contentSize[0]!==1280||value.window.contentSize[1]!==820||value.metrics.viewport.width!==1280||value.metrics.viewport.height!==820) {
      previousGeometry=undefined;return false;
    }
    const signature=JSON.stringify([value.metrics.stage,value.metrics.webview,value.metrics.guestViewport]);
    const stable=signature===previousGeometry;previousGeometry=signature;return stable;
  },'Native resize and creator input surface did not settle');
  // Native resizing, DOM layout and the guest render widget settle separately.
  // Restore actual foreground focus, then prove a real click reached this guest.
  await native.evaluate(win=>win.focus());
  await until(page,()=>native.evaluate(win=>win.isFocused()),value=>value===true,'Creator native window did not regain foreground focus');
  const before=input.before=await nativeState(application,id);
  await clickGuest(application,page,id,'#click-target');
  const focused=await until(page,()=>nativeState(application,id),value=>value?.targetClicks===before.targetClicks+1&&value.focused&&value.focusedId===id,'Creator physical click did not restore native guest focus');
  assertMediaStatePreserved(before,focused);
  const metrics=await geometry(application,page,id);assertMediaGeometry(metrics);
  const point={x:metrics.webview.x+100,y:metrics.webview.y+metrics.webview.height-50};
  // mouse.wheel dispatches input without waiting for scrolling to finish. A
  // bounded repeat is a further physical wheel, never injected document scroll.
  // https://playwright.dev/docs/api/class-mouse#mouse-wheel
  for(let attempt=0;attempt<3;attempt++) {
    await page.mouse.move(point.x,point.y);await page.mouse.wheel(0,-5000);
    await page.waitForTimeout(300);
    const observed=await nativeState(application,id);input.attempts.push({ attempt:attempt+1, point, observed });
    if(observed?.scrollY===0)break;
  }
  const after=input.after=await until(page,()=>nativeState(application,id),value=>value?.scrollY===0&&value.wheelEvents.length>before.wheelEvents.length&&value.wheelEvents.slice(before.wheelEvents.length).some(event=>event.deltaY<0),'Guest did not return to fixture navigation');
  assert.equal(after.scrollY,0);
  for(const key of ['id','url','nonce','draft']) assert.equal(after[key],before[key],`Physical wheel must preserve ${key}`);
  assert.deepEqual(after.history,before.history,'Physical wheel must preserve native navigation history');
}

async function assertHidden(application, page, id) {
  const value = await page.evaluate(() => {
    const host = document.querySelector('.media-browser-host'); const focus = document.activeElement;
    return { hidden:host.hidden, inert:host.inert, ariaHidden:host.getAttribute('aria-hidden'), display:getComputedStyle(host).display,
      focusInside:host.contains(focus), size:host.getBoundingClientRect().width*host.getBoundingClientRect().height,
      contentPadding:getComputedStyle(document.querySelector('.content')).padding };
  });
  assert.equal(value.hidden, true); assert.equal(value.inert, true); assert.equal(value.ariaHidden, 'true');
  assert.equal(value.display, 'none'); assert.equal(value.size, 0); assert.equal(value.focusInside, false);
  // This probe is safe even before the first response is released: no document JS.
  const native = await application.evaluate(({webContents},id)=>{
    const guest=webContents.fromId(id);
    return guest&&!guest.isDestroyed()?{focused:guest.isFocused(),focusedId:webContents.getFocusedWebContents()?.id??null}:null;
  },id);
  assert.ok(native,'Hidden retained guest must remain alive');
  assert.equal(native.focused, false, 'Hidden native guest must not own keyboard focus'); assert.notEqual(native.focusedId, id);
  return value;
}

export async function runMediaKeepalivePilot({ application, page, check, screenshot, report }) {
  const initial = { theme: await page.evaluate(() => document.documentElement.dataset.theme), aiOpen: await page.locator('.ai-topbar-btn').getAttribute('aria-expanded') === 'true' };
  const native = await application.browserWindow(page);
  const originalSize = await native.evaluate(win => win.getContentSize());
  const html = Object.fromEntries(MEDIA_FIXTURE_PATHS.map(route => [route, mediaFixtureHtml(route)]));
  const token = `media35-${Date.now()}`;
  const rows = []; let fixtureInstalled = false; let ax; let failure;
  report.mediaKeepalive = { fixture:'local synthetic HTTPS responses in unchanged creator/material partitions', rows };
  try {
    await check('Creator fixture keeps real security/partition and startup remains lazy', async () => {
      assert.equal(await page.locator('.media-browser-host webview').count(), 0);
      assert.equal(await application.evaluate(({ webContents }) => webContents.getAllWebContents().filter(value => value.getType() === 'webview').length), 0);
      fixtureInstalled = true;
      await application.evaluate(({ session, BrowserWindow }, { html, origin, paths, token }) => {
        if (globalThis.__onoMediaKeepaliveFixture) throw new Error('Duplicate media fixture');
        const owner = BrowserWindow.getAllWindows().find(win => !/[?&]window=float(?:&|$)/.test(win.webContents.getURL())).webContents;
        const creatorSession = session.fromPartition('persist:wb-browser-xhs-creator');
        const materialSession = session.fromPartition('persist:wb-browser-media');
        const fixture = { token, owner, creatorSession, materialSession, requests:[], navigations:[], attachments:[], destroyed:[],
          gateHome:true, releaseHome:null, failOffline:true, observations:[], attachmentRequests:[], ownerListeners:[], creatorHandled:false, materialHandled:false };
        globalThis.__onoMediaKeepaliveFixture = fixture;
        const serve = async (request) => {
          const url = new URL(request.url);
          if (url.origin !== origin || url.username || url.password || url.search || url.hash || !paths.includes(url.pathname)) return Response.error();
          fixture.requests.push({ path:url.pathname, method:request.method });
          if (url.pathname === '/' && fixture.gateHome) {
            fixture.gateHome = false;
            await new Promise(resolve => { fixture.releaseHome = resolve; });
            fixture.releaseHome = null;
          }
          if (url.pathname === '/offline' && fixture.failOffline) return Response.error();
          return new Response(html[url.pathname], { headers: { 'content-type':'text/html; charset=utf-8', 'cache-control':'no-store' } });
        };
        // Never replace onBeforeRequest: the real BrowserGuests guard remains registered.
        creatorSession.protocol.handle('https', serve); fixture.creatorHandled = true;
        materialSession.protocol.handle('https', serve); fixture.materialHandled = true;
        // BrowserGuests.bind registers the production guard when the window is
        // created, before this observer and before any fixture guest exists.
        if (owner.listenerCount('will-attach-webview') < 1) throw new Error('Production attachment guard must precede the fixture observer');
        const willAttach = (event, preferences, params) => {
          if (event.defaultPrevented || !['persist:wb-browser-xhs-creator','persist:wb-browser-media'].includes(params.partition)) return;
          const keys = ['contextIsolation','sandbox','webSecurity','nodeIntegration','nodeIntegrationInWorker','nodeIntegrationInSubFrames','webviewTag','plugins','allowRunningInsecureContent'];
          fixture.attachmentRequests.push({ id:null, partition:params.partition, requestedSrc:params.src,
            preferences:Object.fromEntries(keys.map(key => [key, preferences[key]])) });
        };
        owner.on('will-attach-webview', willAttach); fixture.ownerListeners.push({ name:'will-attach-webview', listener:willAttach });
        const attach = (_event, guest) => {
          const partition = guest.session === creatorSession ? 'persist:wb-browser-xhs-creator'
            : guest.session === materialSession ? 'persist:wb-browser-media' : null;
          const pending = fixture.attachmentRequests.filter(value => value.id === null && value.partition === partition);
          const request = pending.length === 1 ? pending[0] : null;
          if (request) request.id = guest.id;
          const attachment = { id:guest.id, creator:guest.session === creatorSession, material:guest.session === materialSession,
            partition, matchingRequests:pending.length, requestedSrc:request?.requestedSrc ?? null, preferences:request?.preferences ?? null, initialUrl:null };
          fixture.attachments.push(attachment);
          const ready = () => { attachment.initialUrl = guest.getURL(); };
          const started = (_event, url, _inPlace, mainFrame) => { if (mainFrame) fixture.navigations.push({ id:guest.id, url }); };
          const destroyed = () => fixture.destroyed.push(guest.id);
          guest.once('dom-ready', ready); guest.on('did-start-navigation', started); guest.once('destroyed', destroyed);
          fixture.observations.push({ guest, ready, started, destroyed });
        };
        owner.on('did-attach-webview', attach); fixture.ownerListeners.push({ name:'did-attach-webview', listener:attach });
      }, { html, origin:MEDIA_FIXTURE_ORIGIN, paths:MEDIA_FIXTURE_PATHS, token });
      await aiVisible(page, false);
    });
    let id; let preserved; let preservedProbe; let retainedPoint;
    await check('Loading workspace switch preserves one real guest and completes exactly one initial home load', async () => {
      await creator(page, true); id = await guestId(page);
      await until(page, () => probe(application), value => value.pendingHome, 'Initial fixture response was not gated');
      await page.locator('.rail [data-workbench="home"]').click();
      await page.locator('.media-browser-host[hidden]').waitFor({ state:'attached' });
      assert.equal(await guestId(page), id); await assertHidden(application, page, id);
      await creator(page, true); assert.equal(await guestId(page), id);
      await application.evaluate(() => globalThis.__onoMediaKeepaliveFixture.releaseHome());
      await loaded(application, page, id, '/');
      const value = await probe(application);
      assert.equal(value.attachments.length, 1); assert.equal(value.requests.filter(value => value.path === '/').length, 1);
      const prefs = await application.evaluate(({ webContents }, id) => webContents.fromId(id).getLastWebPreferences(), id);
      const attachment = value.attachments.find(value => value.id === id);
      report.mediaKeepalive.security = { id, reported:prefs, reportedKeys:Object.keys(prefs), attachment,
        pluginsReported:Object.hasOwn(prefs,'plugins') ? prefs.plugins : 'not exposed by getLastWebPreferences' };
      assertMediaGuestSecurity(id, prefs, attachment);
      assert.equal(await page.locator('webview').getAttribute('partition'), 'persist:wb-browser-xhs-creator');
    });
    await check('Real nested navigation, unsent keyboard input and wheel scroll form the preservation baseline', async () => {
      await clickGuest(application, page, id, '#nested'); await loaded(application, page, id, '/note/keepalive');
      await clickGuest(application, page, id, '#draft'); await page.keyboard.type('Synthetic unsent draft for Issue 35');
      await until(page, () => nativeState(application, id), value => value?.draft === 'Synthetic unsent draft for Issue 35', 'Real guest keyboard input was not delivered');
      const surface = await page.locator('webview').boundingBox(); await page.mouse.move(surface.x + 100, surface.y + surface.height - 50); await page.mouse.wheel(0, 900);
      await until(page, () => nativeState(application, id), value => value?.scrollY > 500, 'Real guest wheel input was not delivered');
      retainedPoint = await clickGuest(application, page, id, '#click-target');
      preserved = await nativeState(application, id); assert.ok(preserved.keys > 0 && preserved.targetClicks > 0);
      await page.evaluate(() => { window.__onoRetainedWebview = document.querySelector('webview'); window.__onoRetainedMediaHost = document.querySelector('.media-browser-host'); });
      preservedProbe = await probe(application); await screenshot('media-keepalive-before.png');
    });
    await check('Repeated real workbench navigation keeps DOM/native identity, state, history and listener counts', async () => {
      for (let turn = 0; turn < 2; turn++) for (const workbench of ['home', 'settings', 'life', 'game', 'web']) {
        await page.locator(`.rail [data-workbench="${workbench}"]`).click(); await assertHidden(application, page, id);
        await creator(page, true); assert.equal(await guestId(page), id);
        assert.equal(await page.evaluate(() => window.__onoRetainedWebview === document.querySelector('webview') && window.__onoRetainedMediaHost === document.querySelector('.media-browser-host')), true);
        const next = await nativeState(application, id); assertMediaStatePreserved(preserved, next); assert.deepEqual(next.listeners, preserved.listeners);
        const observations = await probe(application); assert.equal(observations.attachments.length, 1); assert.deepEqual(observations.navigations, preservedProbe.navigations);
      }
    });
    await check('Hidden creator rejects native keyboard/pointer/focus and is excluded from host accessibility', async () => {
      await page.locator('.rail [data-workbench="home"]').click(); await assertHidden(application, page, id);
      const currentTasks = await page.evaluate(() => window.workbench.todo.state());
      const hit = await page.evaluate(({ x,y }) => { const e = document.elementFromPoint(x,y); return Boolean(e && !e.closest('.media-browser-host')); }, retainedPoint);
      assert.equal(hit, true, 'Former guest surface must hit current workspace');
      const before = await nativeState(application, id); await page.mouse.click(retainedPoint.x, retainedPoint.y);
      if (await page.locator('.task-modal').count()) {
        await closeUnchangedMediaTaskEditor(page);
      }
      // Use the real current-page task editor, then discard without creating anything.
      await page.locator('#view-home').getByRole('button', { name:'新增', exact:true }).click();
      const title = page.getByRole('textbox', { name:'待办名称', exact:true }); await title.click();
      await application.evaluate(async ({ webContents }, id) => webContents.fromId(id).executeJavaScript('window.tryFixtureFocus()', false), id);
      await page.waitForTimeout(150); await assertHidden(application, page, id);
      await title.click(); await page.keyboard.type('Current workspace input only');
      assert.equal(await title.inputValue(), 'Current workspace input only');
      await page.keyboard.press('Tab'); await page.keyboard.press('Shift+Tab');
      await assertHidden(application, page, id);
      const after = await nativeState(application, id); assertMediaStatePreserved(before, after);
      assert.equal(after.focusAttempts,before.focusAttempts+1,'The synthetic guest must really attempt focus while hidden');
      assert.equal(after.keys, before.keys); assert.equal(after.clicks, before.clicks); assert.equal(after.targetClicks, before.targetClicks);
      // Clearing an unsent form before returning avoids any persisted task mutation.
      await title.fill(''); await closeUnchangedMediaTaskEditor(page);
      assert.deepEqual(await page.evaluate(() => window.workbench.todo.state()), currentTasks, 'Hidden-input acceptance must not create or modify a task');
      ax = await page.context().newCDPSession(page);
      const document = await ax.send('DOM.getDocument'); const selected = await ax.send('DOM.querySelector', { nodeId:document.root.nodeId, selector:'.media-browser-host' });
      const described = await ax.send('DOM.describeNode', { nodeId:selected.nodeId });
      const tree = await ax.send('Accessibility.getPartialAXTree', { nodeId:selected.nodeId, fetchRelatives:false });
      const target = tree.nodes.find(node => node.backendDOMNodeId === described.node.backendNodeId);
      assert.ok(target?.ignored && target.ignoredReasons?.some(reason => /hidden|inert|notRendered/i.test(reason.name)), 'Hidden host must be absent from accessibility navigation');
      await ax.detach(); ax = undefined; await screenshot('media-keepalive-hidden.png');
      await creator(page, true); assertMediaStatePreserved(preserved, await nativeState(application, id));
    });
    await check('Three themes, two native sizes, AI/navigation changes and reduced motion retain accurate guest bounds', async () => {
      for (const [theme, label] of [['mist','雾灰 · 轻雾'],['cool','冷灰 · 凝霜'],['warm','暖砂 · 柔雾']]) {
        await aiVisible(page, false); await subview(page, 'settings', '外观');
        await page.getByRole('radio', { name:label, exact:true }).click();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        for (const [width,height] of [[1280,820],[1024,680]]) for (const motion of ['no-preference','reduce']) for (const aiOpen of [false,true]) {
          await page.locator('.rail [data-workbench="home"]').click();
          await native.evaluate((win,size) => win.setContentSize(size.width,size.height), { width,height });
          await page.emulateMedia({ reducedMotion:motion }); await aiVisible(page, aiOpen);
          await creator(page, true); assert.equal(await guestId(page), id);
          const metrics = await geometry(application, page, id); assertMediaGeometry(metrics);
          const beforeClicks = (await nativeState(application, id)).targetClicks;
          // In compact AI mode the right-hand panel overlays part of the guest;
          // close it through its real control before exercising that click surface.
          if (aiOpen && width < 1160) { await aiVisible(page, false); assertMediaGeometry(await geometry(application,page,id)); }
          await clickGuest(application, page, id, '#click-target');
          await until(page, () => nativeState(application,id), value => value?.targetClicks === beforeClicks+1, 'Revealed guest has stale native click bounds');
          assertMediaStatePreserved(preserved, await nativeState(application,id));
          rows.push({ theme,width,height,motion,aiOpen,...metrics });
          if (motion === 'no-preference' && !aiOpen) await screenshot(`media-keepalive-${theme}-${width}.png`);
        }
      }
      const observations = await probe(application); assert.equal(observations.attachments.length, 1); assert.deepEqual(observations.navigations, preservedProbe.navigations);
    });
    await check('Explicit back, forward and reload retain their normal navigation behavior', async () => {
      await restoreMediaFixtureNavigation({ application,page,native,id,report });
      await clickGuest(application,page,id,'#next'); await loaded(application,page,id,'/note/next');
      await page.locator('.media-browser-host').getByRole('button',{name:'后退',exact:true}).click(); await loaded(application,page,id,'/note/keepalive');
      await page.locator('.media-browser-host').getByRole('button',{name:'前进',exact:true}).click(); const before = await loaded(application,page,id,'/note/next');
      await page.locator('.media-browser-host').getByRole('button',{name:'刷新',exact:true}).click();
      const after = await until(page,()=>nativeState(application,id),value=>value?.url===before.url&&value.nonce!==before.nonce,'Explicit refresh did not load a new document');
      assert.equal(after.id,id); assert.deepEqual(after.history,before.history);
    });
    await check('Local load error and real renderer crash recover normally without claiming lost-state persistence', async () => {
      await clickGuest(application,page,id,'#offline'); await page.locator('.media-browser-host .mbp-error').waitFor({state:'visible'});
      await application.evaluate(()=>{globalThis.__onoMediaKeepaliveFixture.failOffline=false;});
      // A failed in-page link need not commit: retry the current observed address,
      // exactly as the existing GuestFrame reload contract does.
      const address=await page.locator('.mbp-addr input').inputValue();
      const retry=new URL(/^https?:\/\//.test(address)?address:`https://${address}`);
      await page.locator('.media-browser-host').getByRole('button',{name:'刷新',exact:true}).click(); await loaded(application,page,id,retry.pathname);
      await page.locator('.media-browser-host .mbp-error').waitFor({state:'hidden'});
      if(retry.pathname!=='/offline') { await clickGuest(application,page,id,'#offline');await loaded(application,page,id,'/offline'); }
      const crashed=id; await application.evaluate(({webContents},id)=>webContents.fromId(id).forcefullyCrashRenderer(),crashed);
      await page.locator('.media-browser-host .mbp-error').waitFor({state:'visible'});
      await page.locator('.media-browser-host').getByRole('button',{name:'刷新',exact:true}).click();
      id=await until(page,()=>guestId(page),value=>value!==crashed,'Crash recovery must attach a replacement guest');
      await loaded(application,page,id,'/offline'); await page.locator('.media-browser-host .mbp-error').waitFor({state:'hidden'});
      await until(page,()=>probe(application),value=>value.destroyed.includes(crashed),'Crashed guest lease/resource was not destroyed');
      (report.mediaKeepaliveRecovery??=[]).push({ crashedGuest:crashed,replacementGuest:id,statePreservation:false });
    });
    await check('Creator/material mode boundaries remain destructive and keep their distinct real partitions', async () => {
      const departing=id; await page.locator('.media-browser-header').getByRole('button',{name:'找素材',exact:true}).click();
      await until(page,()=>probe(application),value=>value.destroyed.includes(departing),'Creator must release on mode switch');
      await page.locator('.mbp-addr input').fill(`${MEDIA_FIXTURE_ORIGIN}/note/next`); await page.locator('.mbp-addr input').press('Enter');
      const material=await guestId(page); await loaded(application,page,material,'/note/next');
      assert.equal(await page.locator('webview').getAttribute('partition'),'persist:wb-browser-media');
      assert.ok(await page.locator('.mbp-capbtn').isVisible()); assert.ok(await page.locator('[title^="AI 看这页"]').isVisible());
      await page.locator('.rail [data-workbench="home"]').click();
      await until(page,()=>probe(application),value=>value.destroyed.includes(material),'Materials must release on workspace exit');
      assert.equal(await page.locator('.media-browser-host').count(),0);
      await creator(page,true); assert.equal(await page.locator('webview').count(),0,'Returning to materials does not revive its old guest');
      await page.locator('.media-browser-header').getByRole('button',{name:'返回我的小红书',exact:true}).click();
      id=await guestId(page); assert.notEqual(id,departing); await loaded(application,page,id,'/');
      assert.equal((await nativeState(application,id)).draft,'');
      assert.equal(await page.locator('webview').getAttribute('partition'),'persist:wb-browser-xhs-creator');
      assert.equal(await page.locator('.mbp-capbtn').count(),0); assert.equal(await page.locator('[title^="AI 看这页"]').count(),0);
    });
    await check('Actual renderer host teardown destroys the retained guest and reload is lazy again', async () => {
      const departing=id; await page.locator('.rail [data-workbench="home"]').click(); await assertHidden(application,page,id);
      await page.reload(); await page.locator('#view-home').waitFor({state:'visible'});
      await until(page,()=>probe(application),value=>value.destroyed.includes(departing),'Actual owner reload must destroy retained guest');
      assert.equal(await page.locator('.media-browser-host').count(),0);
      assert.equal(await application.evaluate(({webContents})=>webContents.getAllWebContents().filter(value=>value.getType()==='webview').length),0);
    });
    report.mediaKeepalive={ fixture:'local synthetic HTTPS responses in unchanged creator/material partitions', rows, security:report.mediaKeepalive.security,
      observations:await probe(application), exactBridgeLeaseAccounting:'tests/media-keepalive.test.ts',
      limitations:['No live account/site automation','No restart/crash unsent-state guarantee','Materials cross-workspace and cross-mode keepalive excluded','No background freezing/muting/CPU or network guarantee'] };
  } catch (error) {
    failure = error;
    report.mediaKeepalive.failure = String(error).slice(0,4000);
    if (fixtureInstalled) report.mediaKeepalive.observations = await probe(application).catch(value => ({ diagnosticError:String(value) }));
    throw error;
  } finally {
    try {
    if(ax) await ax.detach().catch(()=>{});
    if(fixtureInstalled) {
    // ElectronApplication.evaluate passes the Electron module first and the
    // supplied argument second. Token ownership must use that second argument.
    const cleaned = await application.evaluate(async (_electron,token)=>{
      const fixture=globalThis.__onoMediaKeepaliveFixture;if(!fixture||fixture.token!==token)return;
      fixture.releaseHome?.();
      for(const {name,listener} of fixture.ownerListeners) fixture.owner.removeListener(name,listener);
      for(const {guest,ready,started,destroyed} of fixture.observations) {
        if(!guest.isDestroyed()) { guest.removeListener('dom-ready',ready);guest.removeListener('did-start-navigation',started);guest.removeListener('destroyed',destroyed);guest.close({waitForBeforeUnload:false}); }
      }
      if(fixture.creatorHandled){
        fixture.creatorSession.protocol.unhandle('https');
        if(fixture.creatorSession.protocol.isProtocolHandled('https')) throw new Error('Owned creator fixture handler was not removed');
        fixture.creatorHandled=false;
      }
      if(fixture.materialHandled){
        fixture.materialSession.protocol.unhandle('https');
        if(fixture.materialSession.protocol.isProtocolHandled('https')) throw new Error('Owned material fixture handler was not removed');
        fixture.materialHandled=false;
      }
      const result = { token:fixture.token, creatorHandled:fixture.creatorSession.protocol.isProtocolHandled('https'),
        materialHandled:fixture.materialSession.protocol.isProtocolHandled('https'),
        ownerObserversPresent:fixture.ownerListeners.some(({name,listener})=>fixture.owner.listeners(name).includes(listener)) };
      if(result.creatorHandled||result.materialHandled||result.ownerObserversPresent) throw new Error(`Owned media fixture cleanup incomplete: ${JSON.stringify(result)}`);
      delete globalThis.__onoMediaKeepaliveFixture;
      return result;
    },token);
    assert.equal(cleaned?.token,token,'The owned fixture cleanup must execute with the actual Electron evaluate argument');
    assert.equal(cleaned.creatorHandled,false);assert.equal(cleaned.materialHandled,false);assert.equal(cleaned.ownerObserversPresent,false);
    report.mediaKeepalive.cleanup=cleaned;
    }
    await page.emulateMedia({reducedMotion:'no-preference'});
    await native.evaluate((win,size)=>win.setContentSize(size[0],size[1]),originalSize);
    await aiVisible(page,false); await subview(page,'settings','外观');
    const labels={mist:'雾灰 · 轻雾',cool:'冷灰 · 凝霜',warm:'暖砂 · 柔雾'};
    await page.getByRole('radio',{name:labels[initial.theme]??labels.mist,exact:true}).click();
    await page.locator('.rail [data-workbench="home"]').click(); await aiVisible(page,initial.aiOpen);
    } catch (cleanupError) {
      report.errors.push(`Media keepalive fixture cleanup: ${String(cleanupError).slice(0,2000)}`);
      if(!failure) throw cleanupError;
    }
  }
}
