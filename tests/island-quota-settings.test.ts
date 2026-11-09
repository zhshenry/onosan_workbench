import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { initialIslandData, type IslandState, type QuotaProvider } from '../shared/island-contracts';
import type { AgentConnection } from '../shared/agent-message-contracts';

test('额度主从布局保留来源、密钥草稿和失败重试，异步操作不切回旧来源', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLInputElement', 'Node', 'navigator', 'sessionStorage', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  dom.window.HTMLElement.prototype.hidePopover = () => {};
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  let state: IslandState = { ...initialIslandData(), mode: 'collapsed', pinned: false, quiet: false, fullscreenDetection: true };
  let providers: QuotaProvider[] = [
    { id: 'codex', status: 'ready', account: 'test@example.invalid', plan: 'pro', windows: [], updatedAt: 1793861040000, message: '' },
    { id: 'zcode', status: 'ready', account: '', plan: '个人套餐', windows: [], updatedAt: 1793861040000, message: '' },
    { id: 'cursor', status: 'disconnected', account: '', plan: '', windows: [], updatedAt: null, message: '' },
    { id: 'grokbot', status: 'unsupported', account: '', plan: 'Grok Bot Plan', windows: [], updatedAt: null, message: '暂不提供额度' },
  ];
  const connects: [string, string | undefined][] = [], disconnects: string[] = [], officials: string[] = [];
  const refreshForces: (boolean | undefined)[] = [];
  let agentConnections: AgentConnection[] = [{ provider: 'codex', connected: true }, { provider: 'cursor', connected: false }], failAgent = false;
  const agentConnects: [string, boolean][] = [];
  let finishConnect!: (value: QuotaProvider[]) => void, failConnect!: (error: Error) => void, refreshes = 0;
  Object.defineProperty(dom.window, 'workbench', { value: { island: {
    state: async () => structuredClone(state), displays: async () => [], onChanged: () => () => {}, onError: () => () => {},
    quotas: async () => structuredClone(providers),
    agentConnections: async () => structuredClone(agentConnections),
    agentConnect: async (id: string, enabled: boolean) => { agentConnects.push([id, enabled]); if (failAgent) throw new Error('合成消息配置保存失败'); agentConnections = agentConnections.map(item => item.provider === id ? { ...item, connected: enabled } : item); return structuredClone(agentConnections); },
    patch: async (patch: Record<string, unknown>) => { state = { ...state, settings: { ...state.settings, ...patch } }; return structuredClone(state); },
    quotaRefresh: async (force?: boolean) => { refreshes++; refreshForces.push(force); return structuredClone(providers); },
    quotaConnect: (id: string, key?: string) => { connects.push([id, key]); return new Promise<QuotaProvider[]>((resolve, reject) => { finishConnect = resolve; failConnect = reject; }); },
    quotaDisconnect: async (id: string) => { disconnects.push(id); providers = providers.map(p => p.id === id ? { ...p, status: 'disconnected', account: '', plan: '' } : p); return structuredClone(providers); },
    quotaOfficial: async (id: string) => { officials.push(id); },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { IslandSettingsSection } = await import('../src/views/IslandSettings');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (query = '') => act(async () => root.render(createElement(IslandSettingsSection, { query, resetSearch: () => {} })));
  const button = (label: string) => [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(b => b.getAttribute('aria-label') === label || b.textContent === label)!;
  const click = async (label: string) => act(async () => button(label).click());
  const input = () => dom.window.document.querySelector<HTMLInputElement>('#island-zcode-key')!;
  const setInput = async (element: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(element, value);
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  const submit = async () => act(async () => {
    const form = dom.window.document.querySelector('form.island-key-editor')!;
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  const detail = () => dom.window.document.querySelector<HTMLElement>('.island-connection-detail')!;
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, i) => { if (previous[i]) Object.defineProperty(globalThis, name, previous[i]!); else Reflect.deleteProperty(globalThis, name); });
  });
  await render(); await click('提醒');
  assert.equal(dom.window.document.querySelector('[data-group="agents"]'), null, '不再显示独立消息连接卡片');
  assert.deepEqual(agentConnects, [], '浏览设置不会自动修改监听配置');
  await click('AI 额度');
  assert.equal(button('Codex 消息提醒').getAttribute('aria-checked'), 'true', '保留已启用的监听状态');
  assert.match(detail().textContent!, /监听已配置/);
  assert.match(detail().textContent!, /Codex 设置 → Hooks 中审核并信任/, '配置存在不能替代 Codex 的信任审核');
  assert.equal(dom.window.document.querySelectorAll('.island-connection-sources button').length, 4);
  assert.equal(detail().dataset.provider, 'codex');
  assert.equal(dom.window.document.querySelectorAll('.island-provider-card').length, 0);
  await click('查看 Z Code 连接'); await click('更新密钥');
  assert.equal(input().value, '', '已保存密钥不会回填');
  await setInput(input(), 'synthetic-draft'); await click('显示密钥');
  assert.equal(input().type, 'text');
  await click('查看 Cursor 连接'); assert.equal(detail().dataset.provider, 'cursor');
  await click('查看 Z Code 连接'); assert.equal(input().value, 'synthetic-draft'); assert.equal(input().type, 'password');
  await render('Cursor'); assert.equal(detail().dataset.provider, 'cursor');
  await render(); assert.equal(detail().dataset.provider, 'zcode'); assert.equal(input().value, 'synthetic-draft');
  await click('小工具'); await click('AI 额度'); assert.equal(input().value, 'synthetic-draft');
  await click('刷新额度'); assert.equal(refreshes, 1); assert.equal(input().value, 'synthetic-draft');
  await submit(); assert.deepEqual(connects, [['zcode', 'synthetic-draft']]);
  assert.equal(input().disabled, true);
  await act(async () => failConnect(new Error('合成密钥保存失败')));
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /合成密钥保存失败/);
  assert.equal(input().value, 'synthetic-draft'); assert.equal(input().disabled, false);
  await submit(); assert.equal(connects.length, 2);
  await click('查看 Cursor 连接');
  await act(async () => finishConnect(structuredClone(providers)));
  assert.equal(detail().dataset.provider, 'cursor', '旧请求完成不夺回当前来源');
  await click('查看 Z Code 连接'); assert.equal(input(), null);
  await click('更新密钥'); assert.equal(input().value, '');
  await setInput(input(), 'discard-this-draft'); await click('取消');
  assert.equal(input(), null); await click('更新密钥'); assert.equal(input().value, '');
  await click('取消');
  await click('查看 Grok Bot 连接');
  assert.match(detail().textContent!, /暂无数据/); assert.match(detail().textContent!, /暂不提供额度/);
  await click('打开 Grok Bot 官网'); assert.deepEqual(officials, ['grokbot']);
  await click('断开 Grok Bot 连接'); assert.deepEqual(disconnects, ['grokbot']);
  assert.match(detail().textContent!, /未连接/);
  const threshold = dom.window.document.querySelector<HTMLInputElement>('[aria-label="低额度阈值"]')!;
  await setInput(threshold, '51'); assert.equal(threshold.getAttribute('aria-invalid'), 'true');
  await setInput(threshold, '15');
  await act(async () => threshold.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })));
  assert.equal(state.settings.lowQuota, 15);
  assert.equal(dom.window.document.body.textContent!.includes('synthetic-draft'), false);
  await click('查看 Codex 连接');
  providers[0] = { ...providers[0], status: 'stale', message: '额度更新延迟，将自动重试' };
  await click('刷新额度');
  assert.match(detail().textContent!, /已连接 · 更新延迟/);
  assert.equal(detail().textContent!.includes('需安装 Codex CLI'), false);
  const connectCount = connects.length, refreshCount = refreshes;
  await click('重试'); assert.equal(refreshes, refreshCount + 1); assert.equal(connects.length, connectCount);
  assert.equal(refreshForces.at(-1), true);
  providers[0] = { ...providers[0], status: 'recovering', message: '额度服务无响应，正在自动恢复' };
  await click('刷新额度'); assert.match(detail().textContent!, /正在恢复额度服务/);
  await click('重试'); assert.equal(connects.length, connectCount);
  providers[0] = { ...providers[0], status: 'error', issue: 'auth-required', message: '登录授权已失效，请重新登录' };
  await click('刷新额度'); assert.match(detail().textContent!, /需要重新登录/);
  await click('重新登录'); assert.deepEqual(connects.at(-1), ['codex', undefined]);
  await act(async () => finishConnect(structuredClone(providers)));
  providers[0] = { ...providers[0], issue: 'cli-unavailable', message: '未找到 Codex CLI，请安装后重试' };
  await click('刷新额度'); assert.match(detail().textContent!, /需安装 Codex CLI/);
  await click('重试'); assert.equal(connects.length, connectCount + 1);
  const loginCount = connects.length, logoutCount = disconnects.length;
  await click('Codex 消息提醒');
  assert.equal(button('Codex 消息提醒').getAttribute('aria-checked'), 'false');
  await click('查看 Cursor 连接'); failAgent = true;
  await click('Cursor 消息提醒');
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /合成消息配置保存失败/);
  assert.equal(button('Cursor 消息提醒').getAttribute('aria-checked'), 'false', '保存失败不伪造开启状态');
  failAgent = false; await click('Cursor 消息提醒');
  assert.equal(button('Cursor 消息提醒').getAttribute('aria-checked'), 'true');
  assert.equal(state.settings.mascotEnabled, true);
  assert.equal(connects.length, loginCount, '开启消息不触发额度登录');
  assert.equal(disconnects.length, logoutCount, '关闭消息不注销额度账号');
  assert.deepEqual(agentConnects, [['codex', false], ['cursor', true], ['cursor', true]]);
  await render('消息');
  assert.equal(dom.window.document.querySelectorAll('.island-connection-sources button').length, 2);
  assert.equal(detail().dataset.provider, 'cursor');
  await render(); await click('查看 Z Code 连接');
  assert.equal(dom.window.document.querySelector('.island-provider-messages'), null);
  await act(async () => dom.window.dispatchEvent(new dom.window.CustomEvent('island-settings-section', { detail: 'agents' })));
  assert.equal(detail().dataset.provider, 'codex', '旧消息管理入口定位到支持提醒的账户详情');
  assert.equal(button('Codex 消息提醒').getAttribute('aria-checked'), 'false');
});
