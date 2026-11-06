import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { AiConfig } from '../shared/workbench-api';

test('供应商不预置；两类页内连接配置隔离保存，保留草稿，失败可重试，密钥不回填', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  dom.window.HTMLElement.prototype.hidePopover = function () {};
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  let config: AiConfig = { providers: [], models: [], activeModelId: '', aiEnabled: false, hasConnection: false, rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '' };
  const writes: { surface: 'llm' | 'rlcd'; input: Record<string, unknown> }[] = [];
  let fail = false;
  const save = async (surface: 'llm' | 'rlcd', input: Record<string, unknown>) => {
    writes.push({ surface, input });
    if (fail) throw new Error('模拟保存失败');
    const field = surface === 'llm' ? 'providers' : 'rlcdProviders';
    config = { ...config, [field]: config[field].map(provider => provider.id !== input.id ? provider : {
      ...provider, name: String(input.name), endpoint: String(input.endpoint), protocol: input.protocol,
      hasKey: input.clearKey ? false : input.apiKey ? true : provider.hasKey,
    }) };
    return structuredClone(config);
  };
  Object.assign(dom.window, { workbench: { ai: {
    config: async () => structuredClone(config),
    saveProvider: (input: Record<string, unknown>) => save('llm', input),
    saveRlcdProvider: (input: Record<string, unknown>) => save('rlcd', input),
  } } });
  const { createRoot } = await import('react-dom/client');
  const { AiSettings } = await import('../src/views/AiSettings');
  let root = createRoot(dom.window.document.getElementById('root')!);
  const render = async (query = '') => act(async () => root.render(createElement(AiSettings, { query })));
  const remount = async () => {
    await act(async () => root.unmount());
    root = createRoot(dom.window.document.getElementById('root')!);
    await render();
  };
  const section = (surface: 'llm' | 'rlcd') => dom.window.document.querySelector<HTMLElement>(`section[aria-label="${surface === 'llm' ? '对话模型' : '决策模型（RLCD）'}"]`)!;
  const form = (surface: 'llm' | 'rlcd') => section(surface).querySelector<HTMLFormElement>('.ai-provider-inline')!;
  const endpoint = (surface: 'llm' | 'rlcd') => form(surface).querySelector<HTMLInputElement>('.ai-provider-endpoint input')!;
  const key = (surface: 'llm' | 'rlcd') => form(surface).querySelector<HTMLInputElement>('.ai-config-secret input')!;
  const edit = async (input: HTMLInputElement, value: string) => act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  });
  const submit = async (surface: 'llm' | 'rlcd') => act(async () => {
    form(surface).dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });
  const choose = async (name: string) => act(async () => {
    section('llm').querySelector<HTMLButtonElement>(`button[aria-label="查看对话模型供应商 ${name}"]`)!.click();
  });
  try {
    await render();
    assert.equal(dom.window.document.querySelectorAll('.ai-config-provider-choice').length, 0);
    assert.equal(dom.window.document.querySelectorAll('.ai-provider-inline').length, 0);
    assert.equal(dom.window.document.querySelectorAll('.ai-config-empty').length, 2);
    config = {
      ...config, aiEnabled: true, hasConnection: true, activeModelId: 'model',
      providers: [
        { id: 'a', kind: 'custom', name: '我的对话服务', endpoint: 'https://llm.example/v1', protocol: 'openai-chat', hasKey: true },
        { id: 'b', kind: 'custom', name: '另一个对话服务', endpoint: 'https://other.example/v1', protocol: 'openai-chat', hasKey: false },
      ],
      models: [{ id: 'model', providerId: 'a', name: 'chat-model' }],
      rlcdProviders: [{ id: 'r', kind: 'custom', name: '我的决策服务', endpoint: 'https://decision.example/v1', protocol: 'openai-chat', hasKey: false }],
    };
    await remount();
    assert.equal(dom.window.document.querySelectorAll('.ai-config-provider-choice').length, 3);
    assert.equal(dom.window.document.querySelectorAll('.ai-provider-inline').length, 2);
    const ids = [...dom.window.document.querySelectorAll('[id]')].map(node => node.id);
    assert.equal(new Set(ids).size, ids.length, 'The two forms must not share label, input or error IDs');
    for (const label of dom.window.document.querySelectorAll<HTMLLabelElement>('.ai-provider-inline label')) assert.ok(dom.window.document.getElementById(label.htmlFor));
    assert.equal(key('llm').type, 'password');
    assert.equal(key('llm').value, '', 'A saved key must never be returned as an editable value');
    assert.match(key('llm').placeholder, /•/);
    assert.equal(form('llm').querySelector<HTMLButtonElement>('[type="submit"]')!.disabled, true);
    await edit(endpoint('llm'), 'not-a-url');
    await edit(key('llm'), 'synthetic-inline-key');
    await submit('llm');
    assert.equal(writes.length, 0);
    assert.equal(dom.window.document.activeElement, endpoint('llm'));
    assert.match(form('llm').querySelector('[role="alert"]')!.textContent!, /有效的 HTTP/);
    assert.ok(dom.window.document.getElementById(endpoint('llm').getAttribute('aria-describedby')!));
    await edit(endpoint('llm'), 'https://edited.example/v2');
    await choose('另一个对话服务');
    assert.equal(endpoint('llm').value, 'https://other.example/v1');
    await choose('我的对话服务');
    assert.equal(endpoint('llm').value, 'https://edited.example/v2');
    assert.equal(key('llm').value, 'synthetic-inline-key');
    await render('另一个对话服务');
    await render();
    assert.equal(endpoint('llm').value, 'https://edited.example/v2');
    await remount();
    assert.equal(key('llm').value, 'synthetic-inline-key', 'Leaving and returning keeps unsaved keys in renderer memory');
    assert.equal(dom.window.localStorage.length, 0);
    assert.equal(dom.window.sessionStorage.length, 0);
    fail = true;
    await submit('llm');
    assert.match(form('llm').querySelector('[role="alert"]')!.textContent!, /模拟保存失败/);
    assert.equal(key('llm').value, 'synthetic-inline-key');
    assert.equal(config.providers[0].endpoint, 'https://llm.example/v1');
    assert.equal(config.rlcdProviders[0].endpoint, 'https://decision.example/v1');
    fail = false;
    await submit('llm');
    assert.equal(writes.at(-1)!.surface, 'llm');
    assert.equal(writes.at(-1)!.input.id, 'a');
    assert.equal(writes.at(-1)!.input.apiKey, 'synthetic-inline-key');
    assert.equal(config.providers[0].endpoint, 'https://edited.example/v2');
    assert.equal(key('llm').value, '');
    assert.equal(form('llm').querySelector<HTMLButtonElement>('[type="submit"]')!.disabled, true);
    await edit(endpoint('rlcd'), 'https://new-decision.example/v3');
    await submit('rlcd');
    assert.equal(writes.at(-1)!.surface, 'rlcd');
    assert.equal(writes.at(-1)!.input.id, 'r');
    assert.equal(config.rlcdProviders[0].endpoint, 'https://new-decision.example/v3');
    assert.equal(config.providers[0].endpoint, 'https://edited.example/v2');
    await edit(endpoint('llm'), 'https://edited.example/v3');
    await submit('llm');
    assert.equal(writes.at(-1)!.input.apiKey, undefined, 'Blank key input preserves the saved key');
    assert.equal(config.providers[0].hasKey, true);
    await act(async () => form('llm').querySelector<HTMLButtonElement>('.ai-config-key-help button')!.click());
    await submit('llm');
    assert.equal(writes.at(-1)!.input.clearKey, true);
    assert.equal(config.providers[0].hasKey, false);
    assert.equal(config.aiEnabled, true);
    assert.equal(config.models[0].name, 'chat-model');
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    names.forEach((name, index) => previous[index] ? Object.defineProperty(globalThis, name, previous[index]!) : Reflect.deleteProperty(globalThis, name));
  }
});
