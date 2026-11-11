import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { CHECKIN_PROVIDERS, DEFAULT_CHECKIN_SETTINGS, emptyCheckinRow, type CheckinBridge, type CheckinState } from '../shared/checkin-contracts';

test('real checkin UI validates login, cancels abandoned authorization, and only queries a pending claim', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (dom.window as unknown as Record<string, unknown>)[name] });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const calls: { method: string; value?: unknown }[] = [];
  let state: CheckinState = { rows: CHECKIN_PROVIDERS.map(emptyCheckinRow), settings: structuredClone(DEFAULT_CHECKIN_SETTINGS), records: [], auth: null, warning: '' };
  const listeners = new Set<(s: CheckinState) => void>();
  const send = () => { for (const listener of listeners) listener(structuredClone(state)); };
  const bridge: CheckinBridge = {
    state: async () => structuredClone(state),
    onChanged: callback => { listeners.add(callback); return () => { listeners.delete(callback); }; },
    run: async value => { calls.push({ method: 'run', value }); },
    refresh: async value => { calls.push({ method: 'refresh', value }); },
    sendSms: async () => { calls.push({ method: 'sms' }); return { retryAt: Date.now() + 60000 }; },
    loginWorkbuddy: async () => { calls.push({ method: 'login' }); },
    authorize: async provider => { calls.push({ method: 'authorize', value: provider }); state.auth = { id: 'fixture-auth', provider, stage: 'waiting', message: '', expiresAt: Date.now() + 300000 }; send(); },
    reopenAuth: async () => {},
    cancelAuth: async value => { calls.push({ method: 'cancel', value }); state.auth = null; send(); },
    disconnect: async () => {}, saveSettings: async () => {}, openGuide: async () => {},
  };
  Object.defineProperty(dom.window, 'workbench', { value: { checkin: bridge } });
  const hooks = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "test-asset";', shortCircuit: true } : next(url, context); } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const button = (name: string) => { const node = [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name); assert.ok(node, `button ${name}`); return node; };
  const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); };
  try {
    const { CheckinView } = await import('../src/views/CheckinView');
    await act(async () => { root.render(createElement(CheckinView)); });
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="workbuddy"] button')!);
    const form = dom.window.document.querySelector('dialog form')!;
    await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /11 位手机号/);
    assert.ok(!calls.some(c => ['sms', 'login'].includes(c.method)));
    await click(button('取消'));
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="qoder"] button')!);
    await click(button('前往 Qoder 授权'));
    assert.match(dom.window.document.querySelector('dialog')!.textContent!, /等待你完成官方授权/);
    assert.equal(state.rows.find(r => r.provider === 'qoder')!.connected, false);
    await click(button('取消连接'));
    assert.ok(calls.some(c => c.method === 'cancel' && c.value === 'qoder'));
    state = { ...state, rows: state.rows.map(r => r.provider === 'workbuddy' ? { ...r, connected: true, account: 'Fixture account', status: 'pending', message: '领取待确认' } : r) };
    await act(async () => { send(); });
    await click(button('核对结果'));
    assert.ok(calls.some(c => c.method === 'refresh' && c.value === 'workbuddy'));
    assert.ok(!calls.some(c => c.method === 'run'));
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="trae"] button')!);
    await click(button('前往 TRAE CN 授权'));
    await act(async () => { root.unmount(); });
    assert.ok(calls.some(c => c.method === 'cancel' && c.value === 'trae'));
    assert.equal(listeners.size, 0);
  } finally {
    await act(async () => { root.unmount(); }); hooks.deregister(); dom.window.close();
    for (let i = 0; i < names.length; i++) { const descriptor = descriptors[i]; if (descriptor) Object.defineProperty(globalThis, names[i], descriptor); else Reflect.deleteProperty(globalThis, names[i]); }
  }
});
