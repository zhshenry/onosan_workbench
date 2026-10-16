import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createElement, act } from 'react';

test('main AI panel model trigger is capped and its menu can grow past the trigger', () => {
  const css = readFileSync('src/shell.css', 'utf8');
  assert.match(css, /\.ai-panel \.ai-compose-toolbar > \.ai-model-select \{[^}]*max-width: min\(148px, calc\(100% - 88px\)\);/);
  assert.match(css, /\.ai-panel \.ai-model-select \.select-trigger > span \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
  assert.match(css, /\.ai-panel \.ai-model-select \.select-trigger > svg \{ flex: none; \}/);
  assert.match(css, /\.select-menu\.ai-model-menu\.ai-panel-model-menu \{[^}]*width: max-content;[^}]*max-width: min\(208px, calc\(100vw - 16px\)\);/);
  assert.match(css, /\.select-menu\.ai-panel-model-menu \.select-option \{[^}]*overflow-wrap: anywhere;/);
  // Expanded float trigger uses the same 148px cap. Its menu stays the shared 320px list; collapsed mode is a separate 120px toggle.
  assert.match(css, /\.select-menu\.ai-model-menu \{ width: 320px;/);
  assert.match(css, /\.fa-surface \.ai-compose-toolbar > \.ai-model-select \{ flex: 0 0 auto; width: max-content; min-width: 88px; max-width: min\(148px, calc\(100% - 88px\)\); \}/);
  assert.match(css, /\.fa-mini-quick \.fa-model-toggle \{ flex: 0 0 120px; width: 120px; max-width: 120px;/);
});

test('AI panel model trigger exposes the full name and switching still activates the chosen model', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  const longName = 'claude-3-5-sonnet-20241022';
  const models = [
    { id: 'flash', providerId: 'deepseek', name: 'deepseek-v4-flash' },
    { id: 'pro', providerId: 'deepseek', name: 'deepseek-v4-pro' },
    { id: 'long', providerId: 'other', name: longName },
  ];
  let activeModelId = 'long';
  const activated: string[] = [];
  const config = () => ({
    aiEnabled: true,
    providers: [
      { id: 'deepseek', name: 'Deepseek', kind: 'deepseek', endpoint: '', protocol: 'openai-chat', apiKey: '' },
      { id: 'other', name: 'Other', kind: 'custom', endpoint: '', protocol: 'openai-chat', apiKey: '' },
    ],
    models, activeModelId, hasConnection: true, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '',
  });
  (dom.window as unknown as { workbench: unknown }).workbench = {
    ai: {
      config: async () => config(),
      chatList: async () => [],
      chatDraft: async () => undefined,
      onChat: () => () => undefined,
      activateModel: async (id: string) => { activated.push(id); activeModelId = id; return config(); },
    },
  };
  const { createRoot } = await import('react-dom/client');
  const { AiPanel } = await import('../src/views/AiPanel');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const trigger = () => dom.window.document.querySelector<HTMLButtonElement>('.ai-panel .ai-model-select .select-trigger')!;
  try {
    await act(async () => {
      root.render(createElement(AiPanel, {
        open: true, onClose() {}, onChatLocated() {}, onActiveChatChange() {}, onOpenSettings() {},
        onLocateCopySource() {}, onLocateBaziDay() {}, onQuickAsk() {}, width: 380, onWidthChange() {},
        context: { scope: { module: 'todo' }, label: '待办与日程', object: 'To-Do-List' },
      }));
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });
    assert.equal(trigger().textContent, longName);
    assert.equal(trigger().getAttribute('title'), longName);
    await act(async () => { trigger().click(); });
    const menu = dom.window.document.querySelector('.select-menu.ai-panel-model-menu');
    assert.ok(menu, 'panel model menu is marked so it can be wider than the trigger');
    assert.equal(menu!.textContent?.includes(longName), true);
    assert.equal(menu!.textContent?.includes('deepseek-v4-pro'), true);
    const pro = [...menu!.querySelectorAll<HTMLElement>('[role="option"]')].find(option => option.textContent === 'deepseek-v4-pro');
    assert.ok(pro);
    await act(async () => { pro!.click(); await Promise.resolve(); });
    assert.deepEqual(activated, ['pro']);
    assert.equal(trigger().textContent, 'deepseek-v4-pro');
    assert.equal(trigger().getAttribute('title'), 'deepseek-v4-pro');
    assert.equal(dom.window.document.querySelector('.select-menu'), null);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    globals.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct);
    else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  }
});
