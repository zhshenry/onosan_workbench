import type { KeyboardInputEvent, WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import type { BrowserTabInfo } from '../../shared/browser-automation-contracts';
import { BrowserDriver } from './driver';

/** Electron guests accept native input on their own WebContents; observation stays on scoped CDP. */
export function createGuestDriver(guest: WebContents, info: () => BrowserTabInfo): BrowserDriver {
  let restoreHostFocus: (() => Promise<void>) | undefined;
  return new BrowserDriver({
    info, navigate: url => guest.loadURL(url),
    preserveFocus: async () => {
      const host = guest.hostWebContents;
      if (!host || host.isDestroyed()) return async () => {};
      const key = JSON.stringify(randomUUID());
      // Native guest input can focus its webview even when the containing workbench is hidden.
      await host.executeJavaScript(`(() => { const e = document.activeElement; (globalThis.__onoBrowserFocus ??= new Map()).set(${key}, e); })()`);
      restoreHostFocus = async () => {
        if (host.isDestroyed()) return;
        await host.executeJavaScript(`(() => { const saved = globalThis.__onoBrowserFocus?.get(${key}); if (saved?.isConnected && saved.tagName !== 'WEBVIEW' && !saved.closest('[hidden],[inert]') && (document.activeElement?.tagName === 'WEBVIEW' || document.activeElement === document.body)) saved.focus({ preventScroll: true }); })()`);
      };
      return async () => {
        try { await restoreHostFocus?.(); }
        finally {
          restoreHostFocus = undefined;
          if (!host.isDestroyed()) await host.executeJavaScript(`globalThis.__onoBrowserFocus?.delete(${key})`);
        }
      };
    },
    send: async (method, params, sessionId) => {
      const result = await guest.debugger.sendCommand(method, params, sessionId);
      if (method === 'DOM.focus') await restoreHostFocus?.();
      return result;
    },
    input: async (method, params, sessionId) => {
      try {
      if (sessionId) return await guest.debugger.sendCommand(method, params, sessionId);
      const zoom = guest.getZoomFactor();
      if (method === 'Input.insertText') { await guest.insertText(String(params.text)); return; }
      if (method === 'Input.dispatchKeyEvent') {
        const keys: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Escape: 'Escape', ' ': 'Space' };
        const modifiers: NonNullable<KeyboardInputEvent['modifiers']> = []; const bits = Number(params.modifiers ?? 0);
        if (bits & 1) modifiers.push('alt'); if (bits & 2) modifiers.push('control'); if (bits & 4) modifiers.push('meta'); if (bits & 8) modifiers.push('shift');
        guest.sendInputEvent({ type: params.type === 'keyUp' ? 'keyUp' : 'keyDown', keyCode: keys[String(params.key)] ?? String(params.key), modifiers });
        if (params.type === 'keyDown' && params.text && !bits) guest.sendInputEvent({ type: 'char', keyCode: String(params.text) });
        return;
      }
      if (method === 'Input.dispatchMouseEvent') {
        const types = { mousePressed: 'mouseDown', mouseReleased: 'mouseUp', mouseMoved: 'mouseMove', mouseWheel: 'mouseWheel' } as const;
        const type = types[params.type as keyof typeof types];
        const position = { x: Math.round(Number(params.x) * zoom), y: Math.round(Number(params.y) * zoom) };
        if (type === 'mouseWheel') guest.sendInputEvent({ type, ...position, deltaX: -Number(params.deltaX ?? 0) * zoom, deltaY: -Number(params.deltaY ?? 0) * zoom, canScroll: true });
        else guest.sendInputEvent({ type, ...position, button: params.button === 'right' ? 'right' : 'left', clickCount: Number(params.clickCount ?? 1), ...(params.buttons === 1 ? { modifiers: ['leftbuttondown'] } : {}) });
        return;
      }
      throw new Error('不支持的浏览器输入。');
      } finally { await restoreHostFocus?.(); }
    },
  });
}
