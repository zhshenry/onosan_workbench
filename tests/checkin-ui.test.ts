import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import { CHECKIN_PROVIDERS, DEFAULT_CHECKIN_SETTINGS, emptyCheckinRow, type CheckinBridge, type CheckinState } from '../shared/checkin-contracts';

test('real checkin UI validates login, only queries a pending claim, and saves automation settings as edited', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'HTMLInputElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : (dom.window as unknown as Record<string, unknown>)[name] });
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const calls: { method: string; value?: unknown }[] = [];
  let failSettingsWrite = false;
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
    disconnect: async () => {},
    saveSettings: async value => {
      calls.push({ method: 'settings', value });
      if (failSettingsWrite) throw new Error('合成保存错误');
      state.settings = structuredClone(value);
      send();
    },
    openGuide: async value => { calls.push({ method: 'guide', value }); },
  };
  Object.defineProperty(dom.window, 'workbench', { value: { checkin: bridge } });
  const hooks = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "test-asset";', shortCircuit: true } : next(url, context); } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const button = (name: string) => { const node = [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.trim() === name); assert.ok(node, `button ${name}`); return node; };
  const click = async (element: HTMLElement) => { await act(async () => { element.click(); }); };
  try {
    const { CheckinView, CheckinConnectionSettings } = await import('../src/views/CheckinView');
    let returned = 0;
    const showCheckin = () => root.render(createElement(CheckinView, { onBack: () => {}, onOpenSettings: (view, provider) => {
      calls.push({ method: 'navigate', value: { view, provider } });
      root.render(createElement(CheckinConnectionSettings, { provider, focusAutomation: view === 'settings-checkin', onConnected: () => { returned++; showCheckin(); } }));
    } }));
    await act(async () => { showCheckin(); });
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="workbuddy"] button')!);
    assert.deepEqual(calls.at(-1)?.value, { view: 'settings-apps', provider: 'workbuddy' });
    await click(button('连接 WorkBuddy'));
    const form = dom.window.document.querySelector('dialog form')!;
    await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /11 位手机号/);
    assert.ok(!calls.some(c => ['sms', 'login'].includes(c.method)));
    await click(button('取消'));
    await act(async () => { showCheckin(); });
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="qoder"] button')!);
    await click(button('连接 Qoder'));
    await click(button('前往 Qoder 授权'));
    assert.match(dom.window.document.querySelector('dialog')!.textContent!, /等待你完成官方授权/);
    assert.equal(state.rows.find(r => r.provider === 'qoder')!.connected, false);
    await click(button('取消连接'));
    assert.ok(calls.some(c => c.method === 'cancel' && c.value === 'qoder'));
    state = { ...state, rows: state.rows.map(r => r.provider === 'workbuddy' ? { ...r, connected: true, account: 'Fixture account', status: 'pending', message: '领取待确认' } : r) };
    await act(async () => { send(); });
    await act(async () => { showCheckin(); });
    await click(button('核对结果'));
    assert.ok(calls.some(c => c.method === 'refresh' && c.value === 'workbuddy'));
    assert.ok(!calls.some(c => c.method === 'run'));
    const refreshCount = calls.filter(c => c.method === 'refresh').length;
    await click(button('刷新状态'));
    assert.deepEqual(calls.filter(c => c.method === 'refresh').slice(refreshCount).map(c => c.value), [...CHECKIN_PROVIDERS]);
    assert.ok(!calls.some(c => c.method === 'run'));
    await click(button('自动签到'));
    assert.deepEqual(calls.at(-1)?.value, { view: 'settings-checkin', provider: undefined });
    assert.equal(dom.window.document.activeElement, dom.window.document.querySelector('.settings-checkin-automation h2'));
    assert.ok(dom.window.document.querySelector('.ci-settings-accounts'));
    assert.equal(listeners.size, 1);
    const autoSwitch = () => dom.window.document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="启用自动签到"]')!;
    const countWrites = () => calls.filter(c => c.method === 'settings').length;
    const automationOptions = () => dom.window.document.querySelector('.ci-automation-settings')!
      .querySelectorAll('#checkin-time, .ci-platforms, [aria-label="启动或唤醒后补查"], [aria-label="需要处理时提醒我"]');
    assert.ok(![...dom.window.document.querySelectorAll('.ci-automation-settings button')].some(b => ['还原更改', '保存设置'].includes(b.textContent?.trim() ?? '')));
    assert.equal(automationOptions().length, 0);
    await click(autoSwitch());
    assert.equal(autoSwitch().getAttribute('aria-checked'), 'true');
    assert.equal(state.settings.enabled, true); assert.deepEqual(state.settings.providers, ['workbuddy']);
    assert.equal(automationOptions().length, 4);
    const firstProvider = dom.window.document.querySelector<HTMLInputElement>('.ci-platforms input')!;
    await click(firstProvider);
    assert.equal(firstProvider.checked, true);
    assert.equal(countWrites(), 1, 'reject removing the last selected account while enabled');
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /至少选择一个参与自动签到的应用/);

    const picker = dom.window.document.querySelector<HTMLButtonElement>('#checkin-time')!;
    await click(picker);
    await click(dom.window.document.querySelector<HTMLButtonElement>('[aria-label="11时"]')!);
    assert.equal(state.settings.time, '10:05');
    assert.equal(countWrites(), 1, 'choosing an hour leaves the persisted schedule intact until selection completes');
    await click(dom.window.document.querySelector<HTMLButtonElement>('[aria-label="35分"]')!);
    assert.equal(state.settings.time, '11:35');
    assert.equal(countWrites(), 2);

    const enabledSettings = structuredClone(state.settings);
    await click(autoSwitch());
    assert.deepEqual(state.settings, { ...enabledSettings, enabled: false });
    assert.equal(automationOptions().length, 0);
    await click(autoSwitch());
    assert.deepEqual(state.settings, enabledSettings);
    assert.equal(automationOptions().length, 4);

    const notify = dom.window.document.querySelector<HTMLButtonElement>('[role="switch"][aria-label="需要处理时提醒我"]')!;
    failSettingsWrite = true;
    await click(notify);
    assert.equal(notify.getAttribute('aria-checked'), 'true');
    assert.equal(state.settings.notify, true);
    assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /合成保存错误/);
    failSettingsWrite = false;
    await click(notify);
    assert.equal(state.settings.notify, false);
    assert.equal(dom.window.document.querySelector('.ci-automation-settings [role="alert"]')?.textContent, undefined);
    assert.ok(!calls.some(c => c.method === 'run'));

    await act(async () => {
      state.settings = { ...state.settings, enabled: false, providers: [] };
      send();
    });
    assert.equal(automationOptions().length, 0);
    failSettingsWrite = true;
    await click(autoSwitch());
    assert.equal(autoSwitch().getAttribute('aria-checked'), 'false');
    assert.equal(automationOptions().length, 0);
    assert.match(dom.window.document.querySelector('.ci-automation-settings [role="alert"]')!.textContent!, /合成保存错误/);
    failSettingsWrite = false;
    await click(autoSwitch());
    assert.equal(state.settings.enabled, true);
    assert.deepEqual(state.settings.providers, ['workbuddy']);
    assert.equal(automationOptions().length, 4);

    await act(async () => {
      state.rows = [
        { ...emptyCheckinRow('workbuddy'), connected: true, account: '18800002937', status: 'claimed', message: '平台已确认本轮签到' },
        { ...emptyCheckinRow('qoder'), connected: true, account: 'fixture@example.test', status: 'expired', message: '登录已失效，请重新连接账号。' },
        emptyCheckinRow('trae'),
      ];
      send();
      root.render(createElement(CheckinConnectionSettings, { provider: 'workbuddy' }));
    });
    const details = dom.window.document.querySelector('.account-details')!;
    assert.equal(details.querySelector('header p')?.textContent, '188 **** 2937');
    assert.equal(details.querySelector('header .account-checkin > span:first-child')?.textContent, '签到状态');
    assert.equal(details.querySelector('header .account-checkin .ci-status')?.textContent, '本轮已领取');
    assert.equal(details.querySelector('.provider-state-note'), null);
    assert.deepEqual([...details.querySelectorAll('.account-actions button')].map(b => b.textContent), ['检查连接', '重新连接', '断开连接']);
    assert.equal(button('查看官方说明').parentElement, details.querySelector('header'));
    await click(button('查看官方说明'));
    assert.deepEqual(calls.at(-1), { method: 'guide', value: 'workbuddy' });
    await click(button('检查连接'));
    assert.deepEqual(calls.at(-1), { method: 'refresh', value: 'workbuddy' });
    await click(button('断开连接'));
    await click(button('保留连接'));

    const qoderChoice = [...dom.window.document.querySelectorAll<HTMLButtonElement>('.account-provider-list button')].find(b => b.querySelector('strong')?.textContent === 'Qoder')!;
    await click(qoderChoice);
    assert.equal(details.querySelector('header p')?.textContent, 'f***@example.test');
    assert.equal(details.querySelector('header .account-checkin .ci-status')?.textContent, '需要重新登录');
    assert.equal(details.querySelector('.provider-state-note')?.textContent, '登录已失效，请重新连接账号。');
    await click(button('重新连接'));
    assert.match(dom.window.document.querySelector('.ci-connect-dialog .dialog-subhead')!.textContent!, /官方浏览器授权/);
    await click(button('取消'));

    await act(async () => { showCheckin(); });
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="trae"] button')!);
    await click(button('查看官方说明'));
    assert.deepEqual(calls.at(-1), { method: 'guide', value: 'trae' });
    await click(button('连接 TRAE CN'));
    await click(button('前往 TRAE CN 授权'));
    await act(async () => { state.auth = { ...state.auth!, stage: 'connected' }; send(); });
    assert.equal(returned, 1, 'successful connection returns to the original checkin page');
    assert.ok(dom.window.document.querySelector('[aria-label="每日签到"]'));
    await click(dom.window.document.querySelector<HTMLButtonElement>('[data-provider="trae"] button')!);
    await click(button('连接 TRAE CN'));
    await click(button('前往 TRAE CN 授权'));
    await act(async () => { root.unmount(); });
    assert.ok(calls.some(c => c.method === 'cancel' && c.value === 'trae'));
    assert.equal(listeners.size, 0);
  } finally {
    await act(async () => { root.unmount(); }); hooks.deregister(); dom.window.close();
    for (let i = 0; i < names.length; i++) { const descriptor = descriptors[i]; if (descriptor) Object.defineProperty(globalThis, names[i], descriptor); else Reflect.deleteProperty(globalThis, names[i]); }
  }
});
