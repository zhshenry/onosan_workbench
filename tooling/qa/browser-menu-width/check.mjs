import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd(), require = createRequire(path.join(root, 'package.json'));
const { build } = require('esbuild');
const { chromium } = require('playwright');
const output = await mkdtemp(path.join(tmpdir(), 'ono-dialog-header-'));
const errors = [], warnings = [], checks = [];
const source = `import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserAutomationBar} from './modules/browser/ui/automation';
window.workbench={browserAutomation:{state:async()=>({workspace:'default',tasks:[],tabs:[],activeId:'',history:[]}),onTask:()=>()=>{}}};
const noop=()=>{};
function Preview(){const[zoom,setZoom]=useState(.8);return <main style={{padding:32,display:'flex',justifyContent:'flex-end'}}><BrowserAutomationBar workspace="default" url="https://www.baidu.com" ready={true} zoomFactor={zoom} onZoomChange={setZoom} onRefreshZoom={noop} onNavigate={noop} onState={noop}/></main>}
createRoot(document.getElementById('root')).render(<Preview/>);`;const bundled = await build({stdin:{contents:source,loader:'tsx',resolveDir:root,sourcefile:'dialog-preview.tsx'},bundle:true,write:false,platform:'browser',format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'process.env.NODE_ENV':'"development"'},logLevel:'silent'});
const server=createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/'){
      const before=url.searchParams.has('before')?'?before=1':'';
      res.setHeader('Content-Type','text/html; charset=utf-8');
      res.end(`<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><title>浏览器弹框标题栏验证</title><link rel="stylesheet" href="/src/shell.css"><link rel="stylesheet" href="/modules/todo/ui/todo.css"><link rel="stylesheet" href="/modules/browser/ui/pane.css${before}"></head><body><div id="root"></div><script src="/preview.js"></script></body></html>`);return;
    }
    if(url.pathname==='/preview.js'){res.setHeader('Content-Type','text/javascript');res.end(bundled.outputFiles[0].contents);return;}
    if(url.pathname==='/favicon.ico'){res.writeHead(204);res.end();return;}
    const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
    if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
    let data=await readFile(file);
    if(url.pathname==='/modules/browser/ui/pane.css'&&url.searchParams.has('before')) data=Buffer.from(data.toString().replace('margin-inline: -18px; padding: 16px 18px 0;', 'padding: 16px 0 0;'));
    res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');res.end(data);
  }catch(error){res.writeHead(404);res.end(String(error));}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base=`http://127.0.0.1:${server.address().port}`;
const main=path.join(output,'main.cjs');
await writeFile(main,`const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(path.join(output,'profile'))});app.whenReady().then(()=>{const w=new BrowserWindow({show:false,width:1280,height:820,webPreferences:{contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});w.loadURL(${JSON.stringify(base)});});app.on('window-all-closed',()=>app.quit());`);
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
let application;
try{
  application=await chromium.launch({channel:'msedge',headless:true,timeout:30000});
  const page=await application.newPage();page.setDefaultTimeout(10000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')errors.push(message.text());if(message.type()==='warning')warnings.push(message.text());});
  await page.goto(base);
  for(const theme of ['mist','cool','warm'])for(const width of [1280,1024,360]){
    await page.setViewportSize({width,height:width===360?700:820});
    await page.evaluate(theme=>document.documentElement.dataset.theme=theme,theme);
    await page.getByRole('button',{name:'浏览器选项',exact:true}).click();
    const menu=page.getByRole('menu',{name:'浏览器选项',exact:true});await menu.waitFor();await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const value=await menu.evaluate(menu=>{
      const rect=menu.getBoundingClientRect();
      const zoom=menu.querySelector('.browser-zoom'), z=zoom.getBoundingClientRect();
      return {width:rect.width,overflow:menu.scrollWidth-menu.clientWidth,inside:rect.left>=0&&rect.right<=innerWidth&&rect.top>=0&&rect.bottom<=innerHeight,zoomFits:zoom.scrollWidth<=zoom.clientWidth,buttonsFit:[...menu.querySelectorAll('.browser-zoom button')].every(button=>{const b=button.getBoundingClientRect();return b.left>=z.left&&b.right<=z.right;}),textFits:[...menu.querySelectorAll(':scope > button')].every(button=>button.scrollWidth<=button.clientWidth)};
    });
    assert.equal(value.width,240);assert.equal(value.overflow,0);console.log(JSON.stringify({theme,viewport:width,...value}));assert.ok(value.inside&&value.zoomFits&&value.buttonsFit&&value.textFits,JSON.stringify(value));
    if(theme==='mist'&&width===1280)await menu.screenshot({path:path.join(output,'browser-menu-240.png'),animations:'disabled'});
    await menu.getByRole('button',{name:'放大网页',exact:true}).click();
    await menu.getByLabel('当前网页缩放',{exact:true}).filter({hasText:'90%'}).waitFor();
    await menu.getByRole('button',{name:'重置网页缩放',exact:true}).click();
    await menu.getByLabel('当前网页缩放',{exact:true}).filter({hasText:'100%'}).waitFor();
    await menu.getByRole('button',{name:'缩小网页',exact:true}).click();
    await menu.getByRole('button',{name:'缩小网页',exact:true}).click();
    await menu.getByLabel('当前网页缩放',{exact:true}).filter({hasText:'80%'}).waitFor();
    await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);
    checks.push({theme,viewport:width,...value});
  }
  assert.equal(errors.length,0,errors.join('\n'));  await writeFile(path.join(output,'report.json'),JSON.stringify({status:'passed',environment:'Playwright Edge headless / isolated real-component preview / Browser plugin not available',base,checks,errors,warnings},null,2));
  console.log(JSON.stringify({status:'passed',output,checks:checks.length,errors,warnings},null,2));
}catch(error){console.error(error);console.log('EVIDENCE_DIR '+output);process.exitCode=1;}finally{await application?.close();await new Promise(resolve=>server.close(resolve));}
