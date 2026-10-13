import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { TaskEditor } from '../modules/todo/ui/TaskEditor';
import { newTask, type Task } from '../shared/todo-contracts';
import { MEDIA_FIXTURE_ORIGIN, MEDIA_FIXTURE_PATHS, MEDIA_KEEPALIVE_SCREENSHOTS, isMediaFixtureUrl, mediaFixtureHtml,
  assertMediaStatePreserved, assertMediaGeometry, assertMediaGuestSecurity, closeUnchangedMediaTaskEditor } from '../tooling/media-keepalive-pilot.mjs';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

test('synthetic creator HTTPS fixture is exact-origin, exact-route and never forwards to the live site', () => {
  for (const route of MEDIA_FIXTURE_PATHS) assert.equal(isMediaFixtureUrl(MEDIA_FIXTURE_ORIGIN + route), true);
  for (const value of ['http://creator.xiaohongshu.com/', 'https://creator.xiaohongshu.com:8443/', 'https://user:pass@creator.xiaohongshu.com/',
    'https://creator.xiaohongshu.com.evil.test/', 'https://other.xiaohongshu.com/', `${MEDIA_FIXTURE_ORIGIN}/unknown`, `${MEDIA_FIXTURE_ORIGIN}/?live=1`, `${MEDIA_FIXTURE_ORIGIN}/#live`, 'invalid']) assert.equal(isMediaFixtureUrl(value), false);
  for (const route of MEDIA_FIXTURE_PATHS) {
    const html = mediaFixtureHtml(route);
    assert.match(html, /本地合成网页/); assert.match(html, /无账号、无发布、无外部网络/);
    assert.match(html, /crypto\.randomUUID/); assert.match(html, /tryFixtureFocus/);
    assert.doesNotMatch(html, /fetch\(|https?:\/\/|document\.cookie|localStorage|sessionStorage|src=/);
  }
  assert.throws(() => mediaFixtureHtml('/unknown'));
});

const state = () => ({ id:4, url:`${MEDIA_FIXTURE_ORIGIN}/note/keepalive`, nonce:'document', draft:'unsent', scrollY:900,
  history:{ index:1, entries:[{ url:MEDIA_FIXTURE_ORIGIN+'/',title:'fixture' },{ url:MEDIA_FIXTURE_ORIGIN+'/note/keepalive',title:'fixture' }] } });
test('preservation assertion requires real identity, document/input state, scroll and native history', () => {
  const before=state(); assert.doesNotThrow(()=>assertMediaStatePreserved(before,state()));
  for(const key of ['id','url','nonce','draft']) assert.throws(()=>assertMediaStatePreserved(before,{...state(),[key]:'changed'}),new RegExp(key));
  assert.throws(()=>assertMediaStatePreserved(before,{...state(),scrollY:903}),/scroll/);
  assert.throws(()=>assertMediaStatePreserved(before,{...state(),scrollY:NaN}),/scroll/);
  assert.throws(()=>assertMediaStatePreserved(before,{...state(),history:{...before.history,index:0}}),/history/);
});

const security = () => ({ contextIsolation:true, sandbox:true, webSecurity:true,
  nodeIntegration:false, nodeIntegrationInWorker:false, nodeIntegrationInSubFrames:false,
  webviewTag:false, plugins:false, allowRunningInsecureContent:false });
const securityAttachment = () => ({ id:4, partition:'persist:wb-browser-xhs-creator', matchingRequests:1,
  requestedSrc:'about:blank#fixture-reservation', initialUrl:'about:blank#fixture-reservation', preferences:security() });
test('security requires strict native values and actual post-guard attachment proof when plugins is not exposed', () => {
  const reported:Record<string,unknown> = security();delete reported.plugins;
  assert.doesNotThrow(() => assertMediaGuestSecurity(4,reported,securityAttachment()));
  assert.doesNotThrow(() => assertMediaGuestSecurity(4,security(),securityAttachment()));
  for (const key of Object.keys(security())) {
    const attachment=securityAttachment(); Reflect.deleteProperty(attachment.preferences,key);
    assert.throws(() => assertMediaGuestSecurity(4,reported,attachment),new RegExp(`will-attach preference ${key}`));
    const changed={...security(),[key]:!Reflect.get(security(),key)};
    assert.throws(() => assertMediaGuestSecurity(4,reported,{...securityAttachment(),preferences:changed}),new RegExp(key));
    assert.throws(() => assertMediaGuestSecurity(4,changed,securityAttachment()),new RegExp(key));
    if (key !== 'plugins') {
      const missing:Record<string,unknown> = {...reported};delete missing[key];
      assert.throws(() => assertMediaGuestSecurity(4,missing,securityAttachment()),new RegExp(`Native reported preference ${key}`));
    }
  }
  for (const value of [true,undefined,null,0,'false']) assert.throws(() => assertMediaGuestSecurity(4,{...reported,plugins:value},securityAttachment()),/Native reported preference plugins/);
  for (const changed of [{id:5},{partition:'persist:wb-browser-media'},{matchingRequests:0},{matchingRequests:2},
    {requestedSrc:'https://creator.xiaohongshu.com/'},{initialUrl:'about:blank#other-reservation'}]) {
    assert.throws(() => assertMediaGuestSecurity(4,reported,{...securityAttachment(),...changed}));
  }
});

test('hidden-input fixture closes actual new and existing TaskEditor controls without submitting or guessing return labels', async () => {
  const existing:Task={...newTask('Synthetic existing task'),id:'fixture-task',createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z',completedAt:null,notifiedFor:null,deletedAt:null};
  const write=async()=>assert.fail('The dismissal fixture must never create, save or delete a task');
  for(const task of [undefined,existing]) {
    const markup=renderToStaticMarkup(createElement(TaskEditor,{task,categories:[],api:{create:write,update:write,remove:write,createCategory:write},close(){},saved(){},changed(){}}));
    const dom=new JSDOM(markup);const dialog=dom.window.document.querySelector<HTMLDialogElement>('.task-modal')!;dialog.setAttribute('open','');
    let clicks=0;let waited=false;
    const locator={
      getAttribute:async(name:string)=>dialog.getAttribute(name),
      getByRole:(role:string,options:{name:string;exact:boolean})=>{
        assert.equal(role,'button');assert.equal(options.exact,true);
        const matches=[...dialog.querySelectorAll<HTMLButtonElement>('button')].filter(button=>(button.getAttribute('aria-label')??button.textContent?.trim())===options.name);
        assert.equal(matches.length,1,`Actual ${dialog.getAttribute('aria-label')} DOM must expose ${options.name}`);
        assert.equal(matches[0].type,'button','Dismissal must never select a form submit control');
        assert.equal(options.name,task?'关闭':'返回');
        return {click:async()=>{clicks++;dialog.removeAttribute('open');}};
      },
      waitFor:async(options:{state:string})=>{assert.equal(options.state,'hidden');assert.equal(dialog.open,false);waited=true;},
    };
    await closeUnchangedMediaTaskEditor({locator:(selector:string)=>{assert.equal(selector,'.task-modal[open]');return locator;}});
    assert.equal(clicks,1);assert.equal(waited,true);dom.window.close();
  }
  await assert.rejects(closeUnchangedMediaTaskEditor({locator:()=>({getAttribute:async()=> 'Unexpected dialog'})}),/Unexpected current-page task editor/);
});

const metrics = () => ({ content:{x:70,y:80,width:1100,height:700},stage:{x:82,y:180,width:1076,height:580},
  webview:{x:82,y:180,width:1076,height:580},guestViewport:{width:1076,height:580},viewport:{width:1280,height:820},contentOverflow:0 });
test('native geometry assertions reject missing, offscreen, stale, collapsed and overflowing guest surfaces', () => {
  const before=metrics(); assert.doesNotThrow(()=>assertMediaGeometry(before));
  for(const mutate of [
    (value:ReturnType<typeof metrics>)=>{value.webview.x+=3;},
    (value:ReturnType<typeof metrics>)=>{value.guestViewport.width-=4;},
    (value:ReturnType<typeof metrics>)=>{value.stage.height=0;},
    (value:ReturnType<typeof metrics>)=>{value.webview.y=NaN;},
    (value:ReturnType<typeof metrics>)=>{value.content.width=900;},
    (value:ReturnType<typeof metrics>)=>{value.viewport.width=1024;},
    (value:ReturnType<typeof metrics>)=>{value.contentOverflow=3;},
  ]) {const value=metrics();mutate(value);assert.throws(()=>assertMediaGeometry(value));}
});

test('keepalive screenshots share existing raw/ZIP ceilings and three-day single-upload policy', async t => {
  assert.equal(MEDIA_KEEPALIVE_SCREENSHOTS.length,8);assert.ok(Object.isFrozen(MEDIA_KEEPALIVE_SCREENSHOTS));
  assert.equal(new Set(MEDIA_KEEPALIVE_SCREENSHOTS).size,8);
  const directory=await mkdtemp(path.join(tmpdir(),'ono-media-pilot-'));t.after(()=>rm(directory,{recursive:true,force:true}));
  for(const name of MEDIA_KEEPALIVE_SCREENSHOTS) await writeFile(path.join(directory,name),Buffer.from('89504e470d0a1a0a','hex'));
  const result=await inspectPilotArtifacts(directory);assert.equal(result.bytes,64);assert.equal(result.retentionDays,3);
  assert.equal(result.uploadCeilingBytes,20_000_000);assert.equal(MAX_ARTIFACT_BYTES,19_000_000);
  await assert.rejects(inspectPilotArtifacts(directory,63),/exceed/);
  await writeFile(path.join(directory,'media-keepalive-unapproved.png'),Buffer.from('89504e470d0a1a0a','hex'));
  await assert.rejects(inspectPilotArtifacts(directory),/unapproved/);
});

test('installed keepalive acceptance keeps prior suites and exercises physical input and native lifetime APIs', async () => {
  const source=await readFile(new URL('../tooling/media-keepalive-pilot.mjs',import.meta.url),'utf8');
  const entry=await readFile(new URL('../tooling/windows-pilot.mjs',import.meta.url),'utf8');
  assert.ok(entry.indexOf('await runMediaKeepalivePilot(')>entry.indexOf('floatGroupFixture = await runFloatGroupPilot('));
  assert.ok(entry.indexOf('await runMediaKeepalivePilot(')<entry.indexOf("await check('Choose exit-on-close"));
  for(const fragment of ['getWebContentsId()', 'getFocusedWebContents()', 'guest.isFocused()', 'navigationHistory.getAllEntries()', 'forcefullyCrashRenderer()',
    "page.keyboard.type('Synthetic unsent draft for Issue 35')", 'page.mouse.wheel(0, 900)', 'page.mouse.click(', 'Accessibility.getPartialAXTree', 'await page.reload()',
    "['no-preference','reduce']", 'creatorSession.protocol.handle', "protocol.unhandle('https')"]) assert.ok(source.includes(fragment),fragment);
  assert.match(entry,/name\.startsWith\('media-keepalive-'\)/);
  assert.match(entry,/await prepareMediaKeepaliveQuit\(\{ application, page, report \}\)/);
  assert.ok(entry.indexOf('await verifyMediaKeepaliveRelaunch(')>entry.indexOf("await check('Relaunch same installed executable"));
  assert.match(source,/app\.once\('will-quit',fixture\.cleanup\)/);
  assert.match(source,/report\.mediaKeepaliveQuit\.exitCode,0/);
  assert.doesNotMatch(source,/\.webRequest\.|ipcMain\.|setContent\(|addInitScript\(|force:\s*true|dispatchEvent\(|--no-sandbox|ignoreCertificateErrors|setCertificateVerifyProc|fetch\(/);
  assert.match(source,/if\(!failure\) throw cleanupError/);
  const hidden=source.slice(source.indexOf('async function assertHidden('),source.indexOf('export async function runMediaKeepalivePilot('));
  assert.doesNotMatch(hidden,/executeJavaScript|await nativeState\(/);
  assert.match(hidden,/getFocusedWebContents/);
  assert.match(source,/guest\.isDestroyed\(\) \|\| guest\.isLoading\(\)/);
  assert.match(source,/5000, 'Synthetic native guest document read'/);
  assert.match(source,/owner\.on\('will-attach-webview', willAttach\)/);
  assert.match(source,/fixture\.ownerListeners\.push\(\{ name:'will-attach-webview', listener:willAttach \}\)/);
  assert.match(source,/report\.mediaKeepalive\.security = \{ id, reported:prefs, reportedKeys:Object\.keys\(prefs\), attachment/);
  assert.match(source,/assertMediaGuestSecurity\(id, prefs, attachment\)/);
  assert.match(source,/application\.evaluate\(async \(_electron,token\)=>/);
  assert.match(source,/cleaned\?\.token,token/);
  assert.match(source,/report\.mediaKeepalive\.cleanup=cleaned/);
  assert.match(source,/partition\.protocol\.isProtocolHandled\('https'\)/);
  assert.match(source,/const currentTasks = await page\.evaluate\(\(\) => window\.workbench\.todo\.state\(\)\)/);
  assert.match(source,/Hidden-input acceptance must not create or modify a task/);
  assert.equal(source.match(/await closeUnchangedMediaTaskEditor\(page\)/g)?.length,2);
  assert.doesNotMatch(source,/\.task-modal'\)\.getByRole\('button', \{ name:'返回'/);
});

test('temporary protocol handler gates only local responses and cleanup preserves security listeners and foreign fixtures', async () => {
  const source=await readFile(new URL('../tooling/media-keepalive-pilot.mjs',import.meta.url),'utf8');
  const start=source.indexOf('await application.evaluate(({ session, BrowserWindow },');
  const finish=source.indexOf('}, { html, origin:MEDIA_FIXTURE_ORIGIN',start);
  const installer=source.slice(start+'await application.evaluate('.length,finish+1);
  const cleanupStart=source.indexOf('const cleaned = await application.evaluate(async (_electron,token)=>');
  const cleanupEnd=source.indexOf('},token);',cleanupStart);
  const cleanup=source.slice(cleanupStart+'const cleaned = await application.evaluate('.length,cleanupEnd+1);
  const context:any={URL,Response};context.globalThis=context;
  const owner=new EventEmitter();let preservedCalls=0;const preserved=()=>{preservedCalls++;};owner.on('did-attach-webview',preserved);
  let guardPlugins:'safe'|'missing'|'unsafe'='safe';
  const productionGuard=(_event:any,preferences:any)=>{
    Object.assign(preferences,security());
    if(guardPlugins==='missing') Reflect.deleteProperty(preferences,'plugins');
    if(guardPlugins==='unsafe') preferences.plugins=true;
    Object.freeze(preferences);
  };owner.on('will-attach-webview',productionGuard);
  const sessions=new Map<string,any>();
  const session={fromPartition:(name:string)=>{
    if(!sessions.has(name)) sessions.set(name,{webRequest:{onBeforeRequest:()=>assert.fail('Never replace production security guard')},protocol:{
      handler:null as any,handle(_scheme:string,handler:any){assert.equal(this.handler,null);this.handler=handler;},unhandle(){this.handler=null;},isProtocolHandled(){return this.handler!==null;},
    }});
    return sessions.get(name);
  }};
  const install=runInNewContext(`(${installer})`,context);
  const restore=runInNewContext(`(${cleanup})`,context);
  const installerElectron={session,BrowserWindow:{getAllWindows:()=>[{webContents:{...owner,getURL:()=> 'file:///app/index.html',on:owner.on.bind(owner),removeListener:owner.removeListener.bind(owner),listenerCount:owner.listenerCount.bind(owner),listeners:owner.listeners.bind(owner)}}]}};
  const installerArgs={html:Object.fromEntries(MEDIA_FIXTURE_PATHS.map(route=>[route,mediaFixtureHtml(route)])),origin:MEDIA_FIXTURE_ORIGIN,paths:MEDIA_FIXTURE_PATHS,token:'owned'};
  install(installerElectron,installerArgs);
  const fixture=context.__onoMediaKeepaliveFixture;
  const creator=sessions.get('persist:wb-browser-xhs-creator');const material=sessions.get('persist:wb-browser-media');
  assert.equal(owner.listenerCount('did-attach-webview'),2);assert.equal(owner.listenerCount('will-attach-webview'),2);
  const home=creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/',method:'GET'});
  assert.equal(typeof fixture.releaseHome,'function');fixture.releaseHome();assert.equal((await home).status,200);
  assert.equal((await creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/offline',method:'GET'})).type,'error');
  fixture.failOffline=false;assert.equal((await creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/offline',method:'GET'})).status,200);
  const count=fixture.requests.length;
  for(const url of ['https://outside.test/',MEDIA_FIXTURE_ORIGIN+'/?live=1',MEDIA_FIXTURE_ORIGIN+'/unmatched']) assert.equal((await creator.protocol.handler({url,method:'GET'})).type,'error');
  assert.equal(fixture.requests.length,count,'Unmatched requests must not reach local content or network');
  const guest:any=new EventEmitter();guest.id=9;guest.session=creator;guest.isDestroyed=()=>false;guest.getURL=()=> 'about:blank#fixture-reservation';let closes=0;guest.close=()=>{closes++;};
  const preferences={plugins:true};owner.emit('will-attach-webview',{defaultPrevented:false},preferences,{partition:'persist:wb-browser-xhs-creator',src:guest.getURL()});
  assert.equal(preferences.plugins,false,'Fixture observer must run after, and never replace, the production guard');
  owner.emit('did-attach-webview',{},guest);guest.emit('dom-ready');assert.equal(preservedCalls,1);assert.equal(fixture.attachments[0].creator,true);
  assertMediaGuestSecurity(9,security(),fixture.attachments[0]);
  const second:any=new EventEmitter();second.id=10;second.session=creator;second.isDestroyed=()=>false;second.getURL=()=> 'about:blank#second-reservation';second.close=()=>{closes++;};
  owner.emit('will-attach-webview',{defaultPrevented:false},{plugins:true},{partition:'persist:wb-browser-xhs-creator',src:second.getURL()});
  owner.emit('did-attach-webview',{},second);second.emit('dom-ready');
  assertMediaGuestSecurity(10,security(),fixture.attachments[1]);
  assert.equal(fixture.attachments[0].id,9);assert.equal(fixture.attachments[0].initialUrl,guest.getURL(),'Later attachments must not overwrite earlier route identity');
  const materialGuest:any=new EventEmitter();materialGuest.id=11;materialGuest.session=material;materialGuest.isDestroyed=()=>false;materialGuest.getURL=()=> 'about:blank#material-reservation';materialGuest.close=()=>{closes++;};
  owner.emit('will-attach-webview',{defaultPrevented:false},{plugins:true},{partition:'persist:wb-browser-media',src:materialGuest.getURL()});
  owner.emit('did-attach-webview',{},materialGuest);materialGuest.emit('dom-ready');
  assert.equal(fixture.attachments[2].id,11);assert.equal(fixture.attachments[2].material,true);assert.equal(fixture.attachments[2].partition,'persist:wb-browser-media');
  assert.equal(fixture.attachments[2].requestedSrc,materialGuest.getURL());assert.equal(fixture.attachments[2].initialUrl,materialGuest.getURL());assert.equal(fixture.attachments[2].matchingRequests,1);
  const pending:any=new EventEmitter();pending.id=12;pending.session=creator;pending.isDestroyed=()=>false;pending.getURL=()=> 'about:blank#pending-reservation';pending.close=()=>{closes++;};
  owner.emit('will-attach-webview',{defaultPrevented:false},{plugins:true},{partition:'persist:wb-browser-xhs-creator',src:pending.getURL()});
  owner.emit('did-attach-webview',{},pending);assert.equal(pending.listenerCount('dom-ready'),1,'Observe the pending native bootstrap route');
  for(const [index,behavior] of ['missing','unsafe'].entries()) {
    guardPlugins=behavior as 'missing'|'unsafe';
    const bad:any=new EventEmitter();bad.id=13+index;bad.session=creator;bad.isDestroyed=()=>false;bad.getURL=()=> `about:blank#bad-${behavior}-reservation`;bad.close=()=>{closes++;};
    owner.emit('will-attach-webview',{defaultPrevented:false},{plugins:true},{partition:'persist:wb-browser-xhs-creator',src:bad.getURL()});
    owner.emit('did-attach-webview',{},bad);bad.emit('dom-ready');
    assert.throws(()=>assertMediaGuestSecurity(bad.id,security(),fixture.attachments.at(-1)),/Actual post-guard will-attach preference plugins/,'The actual observer must preserve missing/unsafe guard output as failure');
  }
  guardPlugins='safe';
  const electronModule={session,BrowserWindow:{}};
  await restore(electronModule,'foreign');assert.equal(closes,0);assert.equal(owner.listenerCount('did-attach-webview'),2);assert.equal(typeof creator.protocol.handler,'function');
  const cleaned=await restore(electronModule,'owned');assert.equal(cleaned.token,'owned');assert.equal(cleaned.creatorHandled,false);assert.equal(cleaned.materialHandled,false);assert.equal(cleaned.ownerObserversPresent,false);
  assert.equal(closes,6);assert.equal(owner.listenerCount('did-attach-webview'),1);assert.equal(guest.listenerCount('did-start-navigation'),0);
  assert.equal(owner.listenerCount('will-attach-webview'),1);assert.equal(owner.listeners('will-attach-webview')[0],productionGuard);
  assert.equal(guest.listenerCount('dom-ready'),0);assert.equal(pending.listenerCount('dom-ready'),0,'Cleanup must remove a bootstrap listener before dom-ready ever fires');
  assert.equal(creator.protocol.handler,null);assert.equal(material.protocol.handler,null);assert.equal(context.__onoMediaKeepaliveFixture,undefined);
  creator.protocol.handle('https',()=>new Response('next fixture'));assert.equal(creator.protocol.isProtocolHandled(),true,'Actual cleanup must release the scheme for the next fixture');
  creator.protocol.unhandle('https');
  install(installerElectron,installerArgs);const notRemoved=context.__onoMediaKeepaliveFixture;const actualUnhandle=creator.protocol.unhandle;
  creator.protocol.unhandle=()=>{};
  await assert.rejects(restore(electronModule,'owned'),/Owned creator fixture handler was not removed/);
  assert.equal(context.__onoMediaKeepaliveFixture,notRemoved);assert.equal(notRemoved.creatorHandled,true,'A failed removal must retain truthful owned-handler state');
  creator.protocol.unhandle=actualUnhandle;await restore(electronModule,'owned');
  install(installerElectron,installerArgs);const listenersLeft=context.__onoMediaKeepaliveFixture;const actualRemove=listenersLeft.owner.removeListener;
  listenersLeft.owner.removeListener=()=>{};
  await assert.rejects(restore(electronModule,'owned'),/Owned media fixture cleanup incomplete/);
  assert.equal(context.__onoMediaKeepaliveFixture,listenersLeft);assert.equal(owner.listenerCount('will-attach-webview'),2);
  listenersLeft.owner.removeListener=actualRemove;await restore(electronModule,'owned');assert.equal(owner.listenerCount('will-attach-webview'),1);
});

test('normal-quit fixture preserves unknown handlers, removes only its own synchronous handler and propagates cleanup errors', async () => {
  const source=await readFile(new URL('../tooling/media-keepalive-pilot.mjs',import.meta.url),'utf8');
  const start=source.indexOf('await application.evaluate(({app,session},{token,html,url})=>');
  const finish=source.indexOf("},{token,html:mediaFixtureHtml('/'),url:",start);
  const installer=source.slice(start+'await application.evaluate('.length,finish+1);
  const cleanupStart=source.indexOf('await application.evaluate(({app,webContents},token)=>');
  const cleanupFinish=source.indexOf('},token).catch(',cleanupStart);
  const cleanup=source.slice(cleanupStart+'await application.evaluate('.length,cleanupFinish+1);
  const make=()=>{
    const context:any={Response};context.globalThis=context;const app=new EventEmitter();let guestCloses=0;
    const protocol={handler:null as any,fail:false,handle(_scheme:string,handler:any){assert.equal(this.handler,null);this.handler=handler;},
      unhandle(){if(this.fail)throw new Error('unhandle failed');this.handler=null;},isProtocolHandled(){return this.handler!==null;}};
    const partition={protocol};const guest={getType:()=> 'webview',session:partition,isDestroyed:()=>false,close:()=>{guestCloses++;}};
    const electron={app,session:{fromPartition:()=>partition},webContents:{getAllWebContents:()=>[guest]}};
    const install=runInNewContext(`(${installer})`,context);const args={token:'owned-quit',html:'local fixture',url:MEDIA_FIXTURE_ORIGIN+'/'};
    return {context,app,protocol,electron,install,args,guestCloses:()=>guestCloses};
  };
  const normal=make();normal.install(normal.electron,normal.args);assert.equal(normal.protocol.isProtocolHandled(),true);
  assert.equal((await normal.protocol.handler({url:normal.args.url})).status,200);
  assert.equal((await normal.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/unmatched'})).type,'error');
  normal.app.emit('will-quit');assert.equal(normal.protocol.isProtocolHandled(),false);assert.equal(normal.context.__onoMediaKeepaliveQuit,undefined);
  assert.equal(normal.guestCloses(),0,'Normal quit fixture must leave actual guest destruction to the app');
  const foreign=make();const handler=()=>new Response('unknown owner');foreign.protocol.handler=handler;
  assert.throws(()=>foreign.install(foreign.electron,foreign.args),/must not replace an existing HTTPS handler/);
  assert.equal(foreign.protocol.handler,handler);assert.equal(foreign.context.__onoMediaKeepaliveQuit,undefined);assert.equal(foreign.app.listenerCount('will-quit'),0);
  const stale=make();stale.context.__onoMediaKeepaliveFixture={token:'foreign-main'};
  assert.throws(()=>stale.install(stale.electron,stale.args),/Previous media fixture cleanup has not completed/);assert.equal(stale.protocol.handler,null);
  const replaced=make();replaced.install(replaced.electron,replaced.args);const replacement={token:'foreign-quit'};replaced.context.__onoMediaKeepaliveQuit=replacement;
  const registered=replaced.protocol.handler;replaced.app.emit('will-quit');assert.equal(replaced.context.__onoMediaKeepaliveQuit,replacement);assert.equal(replaced.protocol.handler,registered);
  const failure=make();failure.install(failure.electron,failure.args);failure.protocol.fail=true;
  assert.throws(()=>failure.app.emit('will-quit'),/unhandle failed/);assert.match(failure.context.__onoMediaKeepaliveQuit.cleanupError,/unhandle failed/);
  assert.equal(failure.context.__onoMediaKeepaliveQuit.handled,true);assert.equal(failure.guestCloses(),0);
  const interrupted=make();interrupted.install(interrupted.electron,interrupted.args);const restore=runInNewContext(`(${cleanup})`,interrupted.context);
  const owned=interrupted.context.__onoMediaKeepaliveQuit;await restore(interrupted.electron,'foreign');assert.equal(interrupted.context.__onoMediaKeepaliveQuit,owned);
  assert.equal(interrupted.guestCloses(),0);assert.equal(interrupted.app.listenerCount('will-quit'),1);assert.equal(interrupted.protocol.isProtocolHandled(),true);
  await restore(interrupted.electron,interrupted.args.token);assert.equal(interrupted.guestCloses(),1);assert.equal(interrupted.app.listenerCount('will-quit'),0);
  assert.equal(interrupted.protocol.isProtocolHandled(),false);assert.equal(interrupted.context.__onoMediaKeepaliveQuit,undefined);
});
