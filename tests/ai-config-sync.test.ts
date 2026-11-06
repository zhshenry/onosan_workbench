import assert from 'node:assert/strict';
import test from 'node:test';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { AiStore } from '../electron/ai-store';
import { Store } from '../modules/todo/store';
import { CopyStore } from '../modules/copywriting/store';
import { BaziStore } from '../modules/bazi/store';
import { ReadingStore } from '../modules/reading/store';
import type { AiConfig } from '../shared/workbench-api';
import type { ChatSession } from '../shared/todo-contracts';

test('首次保存对话模型自动启用，后续保留开关选择；仅成功落盘后广播脱敏快照', async t => {
  const key = Symbol.for(`ai-config-sync-${randomUUID()}`);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const events: { window: number; channel: string; config: AiConfig }[] = [];
  (globalThis as any)[key] = { handlers, events };
  const source = `const state = globalThis[Symbol.for(${JSON.stringify(Symbol.keyFor(key))})];
    export const ipcMain = { handle: (name, fn) => state.handlers.set(name, fn), on() {} };
    export const safeStorage = { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value) };
    export const BrowserWindow = { getAllWindows: () => [0, 1].map(window => ({ webContents: { send: (channel, config) => state.events.push({ window, channel, config: structuredClone(config) }) } })) };
    export const shell = { openExternal: async () => {} };`;
  const hooks = registerHooks({ resolve(specifier, context, next) {
    return specifier === 'electron' ? { url: `data:text/javascript,${encodeURIComponent(source)}`, shortCircuit: true } : next(specifier, context);
  } });
  const { registerAiIpc } = await import('../electron/ai-ipc');
  hooks.deregister();
  const dir = mkdtempSync(join(tmpdir(), 'wb-ai-config-sync-'));
  const ai = new AiStore(dir), todo = new Store(join(dir, 'tasks.db'), 'shared-tasks');
  const invoke = async (name: string, input?: unknown) => await handlers.get(name)!(undefined, input) as AiConfig;
  const mutate = async (name: string, input: unknown) => {
    const before = events.length;
    const result = await invoke(name, input);
    assert.deepEqual(events.slice(before), [0, 1].map(window => ({ window, channel: 'ai:config-changed', config: result })));
    assert.deepEqual(result, await invoke('ai:config'));
    assert.doesNotMatch(JSON.stringify(result), /apiKey|synthetic-secret/);
    return result;
  };
  try {
    registerAiIpc(todo, ai, new CopyStore(dir), new BaziStore(dir), new ReadingStore(dir));
    assert.equal((await invoke('ai:config')).models.length, 0);
    assert.equal(events.length, 0);
    const provider = { kind: 'custom', name: 'Synthetic', endpoint: 'http://127.0.0.1:1234/v1', protocol: 'openai-chat', apiKey: 'synthetic-secret' };
    const first = await mutate('ai:provider:save', provider);
    assert.equal(first.providers[0].hasKey, true);
    assert.equal(first.aiEnabled, false, 'Saving only a provider must not enable AI');
    const rlcdProvider = await mutate('ai:rlcd:provider:save', { ...provider, name: 'RLCD supplier' });
    const rlcd = await mutate('ai:rlcd:model:save', { providerId: rlcdProvider.rlcdProviders[0].id, name: 'decision-only' });
    assert.equal(rlcd.aiEnabled, false, 'RLCD setup must not enable the conversation assistant');
    const providerId = first.providers[0].id;
    const initialEvents = events.length;
    t.mock.method(ai, 'writeConfig', () => { throw new Error('synthetic first save failure'); });
    await assert.rejects(invoke('ai:model:save', { providerId, name: 'first' }), /synthetic first save failure/);
    assert.equal(events.length, initialEvents);
    assert.equal(ai.readConfig().aiEnabled, false);
    assert.equal(ai.readConfig().hasConfiguredModel, false, 'Failed first save must not consume automatic enablement');
    t.mock.restoreAll();
    const model = await mutate('ai:model:save', { providerId, name: 'first' });
    assert.equal(model.aiEnabled, true, 'The first successfully saved conversation model enables AI');
    const reopened = new AiStore(dir);
    try {
      assert.equal(reopened.readConfig().aiEnabled, true);
      assert.equal(reopened.readConfig().hasConfiguredModel, true);
    } finally { reopened.close(); }
    await mutate('ai:setEnabled', { aiEnabled: false });
    const added = await mutate('ai:model:save', { providerId, name: 'second' });
    assert.equal(added.aiEnabled, false, 'Adding another model respects a manually disabled assistant');
    assert.equal((await mutate('ai:model:activate', added.models[1].id)).aiEnabled, false);
    assert.equal((await mutate('ai:model:save', { id: model.models[0].id, providerId, name: 'renamed' })).aiEnabled, false);
    assert.equal((await mutate('ai:provider:save', { ...provider, id: providerId, name: 'Renamed supplier' })).aiEnabled, false);
    const before = events.length;
    await assert.rejects(invoke('ai:model:save', { providerId, name: 'second' }));
    assert.equal(events.length, before, 'Rejected input must not publish a change');
    t.mock.method(ai, 'writeConfig', () => { throw new Error('synthetic write failure'); });
    await assert.rejects(invoke('ai:model:save', { providerId, name: 'not saved' }), /synthetic write failure/);
    assert.equal(events.length, before, 'Failed persistence must not publish a change');
    t.mock.restoreAll();
    assert.equal((await invoke('ai:config')).models.length, 2);
    await mutate('ai:model:remove', model.models[0].id);
    const removed = await mutate('ai:provider:remove', providerId);
    assert.equal(removed.models.length, 0);
    assert.equal(removed.aiEnabled, false);
    const replacement = await mutate('ai:provider:save', provider);
    assert.equal((await mutate('ai:model:save', { providerId: replacement.providers[0].id, name: 'replacement' })).aiEnabled, false, 'Deleting all models and configuring again is not the first setup');
  } finally {
    t.mock.restoreAll();
    ai.close(); todo.close();
    rmSync(dir, { recursive: true, force: true });
    delete (globalThis as any)[key];
  }
});

test('已打开的助手从空配置即时更新模型与启用状态，保留对话草稿并忽略迟到的旧读取', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  (dom.window as any).ResizeObserver = class { observe() {} disconnect() {} };
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const empty: AiConfig = { providers: [], models: [], activeModelId: '', aiEnabled: false, hasConnection: false, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' };
  let config = empty;
  let resolveInitial!: (value: AiConfig) => void;
  const initial = new Promise<AiConfig>(resolve => { resolveInitial = resolve; });
  let read = () => initial;
  const listeners = new Set<(value: AiConfig) => void>();
  const chat: ChatSession = { id: 'existing', title: '原有对话', updatedAt: '2026-11-05T00:00:00Z', entries: [], draft: '保留这段输入', module: 'todo' };
  const publish = (value: AiConfig) => { config = value; listeners.forEach(listener => listener(value)); };
  Object.assign(dom.window, { workbench: { ai: {
    config: () => read(),
    onConfigChanged: (listener: (value: AiConfig) => void) => { listeners.add(listener); return () => listeners.delete(listener); },
    chatList: async () => [chat], chatOpen: async () => chat, chatDraft: async () => {},
    onChat: () => () => {}, onAsk: () => () => {},
    activateModel: async (id: string) => { publish({ ...config, activeModelId: id }); return config; },
  } } });
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (open: boolean) => act(async () => root.render(createElement(AiPanel, {
    open, onClose() {}, onChatLocated() {}, onActiveChatChange() {}, onOpenSettings() {},
    onLocateCopySource() {}, onLocateBaziDay() {}, onQuickAsk() {}, width: 380, onWidthChange() {},
    context: { scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' },
  })));
  const trigger = () => dom.window.document.querySelector<HTMLButtonElement>('.ai-model-select .select-trigger');
  try {
    await render(true);
    assert.match(dom.window.document.querySelector('.ai-compose-toolbar')!.textContent!, /配置模型/);
    const input = dom.window.document.querySelector<HTMLTextAreaElement>('.ai-compose textarea')!;
    assert.equal(input.value, chat.draft);
    assert.equal(input.disabled, true);
    const configured: AiConfig = { ...empty, aiEnabled: true, providers: [{ id: 'provider', kind: 'custom', name: 'Synthetic', endpoint: '', protocol: 'openai-chat', hasKey: false }], models: [{ id: 'first', providerId: 'provider', name: 'first-model' }], activeModelId: 'first', hasConnection: true };
    await act(async () => publish(configured));
    assert.equal(trigger()?.textContent, 'first-model', 'Adding the first model must update an already open panel');
    assert.equal(input.disabled, false, 'Automatic first-setup enablement reaches the open composer');
    await act(async () => resolveInitial(empty));
    assert.equal(trigger()?.textContent, 'first-model', 'An older initial read must not overwrite the saved configuration');
    await act(async () => publish({ ...config, aiEnabled: false }));
    assert.equal(input.disabled, true);
    await act(async () => publish({ ...config, aiEnabled: true }));
    assert.equal(input.disabled, false);
    await act(async () => publish({ ...config, models: [...config.models, { id: 'second', providerId: 'provider', name: 'second-model' }] }));
    await act(async () => trigger()!.click());
    const second = [...dom.window.document.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === 'second-model');
    assert.ok(second);
    await act(async () => second.click());
    assert.equal(trigger()?.textContent, 'second-model');
    assert.equal(input.value, chat.draft);
    assert.equal(dom.window.document.querySelector('.ai-compose textarea'), input, 'Config updates must not recreate the composer');
    await act(async () => publish(empty));
    assert.equal(trigger(), null);
    assert.equal(input.disabled, true);
    assert.equal(input.value, chat.draft);
    await render(false);
    assert.equal(listeners.size, 0, 'Closing the panel removes its config subscription');
    read = async () => ({ ...configured, aiEnabled: true });
    await render(true);
    assert.equal(trigger()?.textContent, 'first-model', 'Reopening still reads the current saved configuration');
    assert.equal(input.disabled, false);
    assert.equal(listeners.size, 1);
  } finally {
    await act(async () => root.unmount());
    assert.equal(listeners.size, 0);
    dom.window.close();
    names.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
  }
});
