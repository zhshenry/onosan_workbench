import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { runInNewContext } from 'node:vm';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MEDIA_FIXTURE_ORIGIN, MEDIA_FIXTURE_PATHS, MEDIA_KEEPALIVE_SCREENSHOTS, isMediaFixtureUrl, mediaFixtureHtml,
  assertMediaStatePreserved, assertMediaGeometry } from '../tooling/media-keepalive-pilot.mjs';
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
});

test('temporary protocol handler gates only local responses and cleanup preserves security listeners and foreign fixtures', async () => {
  const source=await readFile(new URL('../tooling/media-keepalive-pilot.mjs',import.meta.url),'utf8');
  const start=source.indexOf('await application.evaluate(({ session, BrowserWindow },');
  const finish=source.indexOf('}, { html, origin:MEDIA_FIXTURE_ORIGIN',start);
  const installer=source.slice(start+'await application.evaluate('.length,finish+1);
  const cleanupStart=source.indexOf('if(fixtureInstalled) await application.evaluate(async token=>');
  const cleanupEnd=source.indexOf('},token);',cleanupStart);
  const cleanup=source.slice(cleanupStart+'if(fixtureInstalled) await application.evaluate('.length,cleanupEnd+1);
  const context:any={URL,Response};context.globalThis=context;
  const owner=new EventEmitter();let preservedCalls=0;const preserved=()=>{preservedCalls++;};owner.on('did-attach-webview',preserved);
  const sessions=new Map<string,any>();
  const session={fromPartition:(name:string)=>{
    if(!sessions.has(name)) sessions.set(name,{webRequest:{onBeforeRequest:()=>assert.fail('Never replace production security guard')},protocol:{
      handler:null as any,handle(_scheme:string,handler:any){assert.equal(this.handler,null);this.handler=handler;},unhandle(){this.handler=null;},
    }});
    return sessions.get(name);
  }};
  const install=runInNewContext(`(${installer})`,context);
  const restore=runInNewContext(`(${cleanup})`,context);
  install({session,BrowserWindow:{getAllWindows:()=>[{webContents:{...owner,getURL:()=> 'file:///app/index.html',on:owner.on.bind(owner),removeListener:owner.removeListener.bind(owner)}}]}},
    {html:Object.fromEntries(MEDIA_FIXTURE_PATHS.map(route=>[route,mediaFixtureHtml(route)])),origin:MEDIA_FIXTURE_ORIGIN,paths:MEDIA_FIXTURE_PATHS,token:'owned'});
  const fixture=context.__onoMediaKeepaliveFixture;
  const creator=sessions.get('persist:wb-browser-xhs-creator');const material=sessions.get('persist:wb-browser-media');
  assert.equal(owner.listenerCount('did-attach-webview'),2);
  const home=creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/',method:'GET'});
  assert.equal(typeof fixture.releaseHome,'function');fixture.releaseHome();assert.equal((await home).status,200);
  assert.equal((await creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/offline',method:'GET'})).type,'error');
  fixture.failOffline=false;assert.equal((await creator.protocol.handler({url:MEDIA_FIXTURE_ORIGIN+'/offline',method:'GET'})).status,200);
  const count=fixture.requests.length;
  for(const url of ['https://outside.test/',MEDIA_FIXTURE_ORIGIN+'/?live=1',MEDIA_FIXTURE_ORIGIN+'/unmatched']) assert.equal((await creator.protocol.handler({url,method:'GET'})).type,'error');
  assert.equal(fixture.requests.length,count,'Unmatched requests must not reach local content or network');
  const guest:any=new EventEmitter();guest.id=9;guest.session=creator;guest.isDestroyed=()=>false;let closes=0;guest.close=()=>{closes++;};
  owner.emit('did-attach-webview',{},guest);assert.equal(preservedCalls,1);assert.equal(fixture.attachments[0].creator,true);
  await restore('foreign');assert.equal(closes,0);assert.equal(owner.listenerCount('did-attach-webview'),2);assert.equal(typeof creator.protocol.handler,'function');
  await restore('owned');assert.equal(closes,1);assert.equal(owner.listenerCount('did-attach-webview'),1);assert.equal(guest.listenerCount('did-start-navigation'),0);
  assert.equal(creator.protocol.handler,null);assert.equal(material.protocol.handler,null);assert.equal(context.__onoMediaKeepaliveFixture,undefined);
});
