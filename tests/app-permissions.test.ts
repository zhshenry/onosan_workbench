import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { randomUUID } from 'node:crypto';

test('only the trusted main document can request artifact fullscreen; audio restrictions stay intact', async () => {
  const symbol = 'app-permissions-' + randomUUID();
  const state: { check?: (...args: any[]) => boolean; request?: (...args: any[]) => void } = {};
  (globalThis as any)[Symbol.for(symbol)] = state;
  const source = 'const s=globalThis[Symbol.for(' + JSON.stringify(symbol) + ')];' +
    'export const ipcMain={handle:()=>{}};' +
    'export const session={defaultSession:{setPermissionCheckHandler:fn=>s.check=fn,setPermissionRequestHandler:fn=>s.request=fn}};';
  const hook = registerHooks({
    resolve(specifier, context, next) {
      return specifier === 'electron' ? { url: 'data:text/javascript,' + encodeURIComponent(source), shortCircuit: true } : next(specifier, context);
    },
  });
  try {
    const { registerSpeechIpc } = await import('../electron/speech-ipc');
    const appUrl = 'file:///C:/fixture/dist/index.html', primary: any = { mainFrame: { url: appUrl } };
    registerSpeechIpc({} as any, () => primary, appUrl);
    const request = (contents: any, permission: string, details: any) => {
      let allowed: boolean | undefined;
      state.request!(contents, permission, (value: boolean) => { allowed = value; }, details);
      return allowed;
    };
    assert.equal(state.check!(primary, 'fullscreen', 'file://', { isMainFrame: true }), true);
    assert.equal(request(primary, 'fullscreen', { isMainFrame: true, requestingUrl: appUrl }), true);
    for (const [contents, details] of [
      [primary, { isMainFrame: false, requestingUrl: 'ono-ai-test://fixture/index.html' }],
      [{ mainFrame: { url: appUrl } }, { isMainFrame: true, requestingUrl: appUrl }],
      [primary, { isMainFrame: true, requestingUrl: 'file:///C:/other.html' }],
      [primary, { isMainFrame: true, requestingUrl: 'https://example.invalid/' }],
    ]) assert.equal(request(contents, 'fullscreen', details), false);
    assert.equal(state.check!(primary, 'media', 'file://', { isMainFrame: true, mediaType: 'audio' }), true);
    assert.equal(state.check!(primary, 'media', 'file://', { isMainFrame: true, mediaType: 'video' }), false);
    assert.equal(request(primary, 'media', { isMainFrame: true, requestingUrl: appUrl, mediaTypes: ['audio'] }), true);
    assert.equal(request(primary, 'media', { isMainFrame: true, requestingUrl: appUrl, mediaTypes: ['audio', 'video'] }), false);
    assert.equal(request(primary, 'notifications', { isMainFrame: true, requestingUrl: appUrl }), false);
  } finally { hook.deregister(); delete (globalThis as any)[Symbol.for(symbol)]; }
});
