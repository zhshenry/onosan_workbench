import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

test('checkin IPC rejects other windows, frames, documents and malformed input before network or browser access', async () => {
  const symbol = `checkin-ipc-${randomUUID()}`, directory = mkdtempSync(join(tmpdir(), 'checkin-ipc-'));
  const state = { directory, handlers: new Map<string, (event: unknown, input?: unknown) => Promise<unknown>>(), opened: [] as string[], requests: [] as { url: string; options: RequestInit }[] };
  const globals = globalThis as unknown as Record<symbol, typeof state>;
  globals[Symbol.for(symbol)] = state;
  const source = `const s=globalThis[Symbol.for(${JSON.stringify(symbol)})];
    export const app={getPath:()=>s.directory,once:()=>{}};
    export const ipcMain={handle:(name,fn)=>s.handlers.set(name,fn)};
    export const powerMonitor={on:()=>{},off:()=>{}};
    export const Notification={isSupported:()=>false};
    export const safeStorage={isEncryptionAvailable:()=>false};
    export const session={fromPartition:()=>({fetch:async(url,options)=>{s.requests.push({url,options});return new Response(JSON.stringify({code:0}),{status:200})}})};
    export const shell={openExternal:async url=>{s.opened.push(url)}};`;
  const hooks = registerHooks({ resolve(specifier, context, next) { return specifier === 'electron' ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context); } });
  let service: { dispose(): void } | undefined;
  try {
    const { registerCheckinIpc } = await import('../electron/checkin-ipc');
    const url = 'file:///C:/fixture/dist/index.html', primary = { mainFrame: { url }, isDestroyed: () => false, send: () => {} };
    service = registerCheckinIpc(() => primary as never, url);
    const trusted = { sender: primary, senderFrame: primary.mainFrame };
    for (const event of [
      { sender: { ...primary }, senderFrame: primary.mainFrame },
      { sender: primary, senderFrame: { url } },
    ]) await assert.rejects(state.handlers.get('checkin:state')!(event), /仅工作台主窗口/);
    primary.mainFrame.url = 'file:///C:/fixture/foreign.html';
    await assert.rejects(state.handlers.get('checkin:state')!(trusted), /仅工作台主窗口/);
    primary.mainFrame.url = url;
    const publicState = await state.handlers.get('checkin:state')!(trusted) as { rows: { connected: boolean }[] };
    assert.equal(publicState.rows.length, 3); assert.ok(publicState.rows.every(r => !r.connected));
    for (const [name, input] of [['run', ['foreign']], ['sms', 'invalid'], ['authorize', 'workbuddy'], ['guide', 'https://foreign.example'], ['settings', { enabled: true, token: 'private' }]]) await assert.rejects(state.handlers.get(`checkin:${name}`)!(trusted, input), /输入格式/);
    assert.equal(state.requests.length, 0); assert.equal(state.opened.length, 0);
    await state.handlers.get('checkin:sms')!(trusted, '13800000000');
    assert.equal(new URL(state.requests[0].url).hostname, 'www.workbuddy.cn');
    assert.equal(state.requests[0].options.redirect, 'error');
    assert.equal(state.requests[0].options.credentials, 'omit');
    await state.handlers.get('checkin:guide')!(trusted, 'qoder');
    assert.deepEqual(state.opened, ['https://docs.qoder.cn/events/100credits']);
  } finally { service?.dispose(); hooks.deregister(); delete globals[Symbol.for(symbol)]; rmSync(directory, { recursive: true, force: true }); }
});
