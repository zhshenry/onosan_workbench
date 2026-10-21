import assert from 'node:assert/strict';
import test from 'node:test';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import type { AiConfig } from '../shared/workbench-api';

test('peer model sections select suppliers independently; search reveals matches without changing the active model or stored configuration', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  const config: AiConfig = {
    aiEnabled: true, activeModelId: 'flash', activeRlcdModelId: '', hasConnection: true,
    providers: [
      { id: 'router', kind: 'custom', name: 'OpenRouter', endpoint: 'https://openrouter.ai/api', protocol: 'anthropic', hasKey: true },
      { id: 'deepseek', kind: 'deepseek', name: 'Deepseek', endpoint: 'https://api.deepseek.com/anthropic', protocol: 'anthropic', hasKey: true },
    ],
    models: [
      { id: 'flash', providerId: 'deepseek', name: 'deepseek-flash' },
      { id: 'minimax', providerId: 'router', name: 'minimax/minimax-m3.1-flash:free' },
    ],
    rlcdProviders: [
      { id: 'typesafe', kind: 'typesafe', name: 'TypeSafe', endpoint: 'https://typesafe.example/v1', protocol: 'openai-chat', hasKey: false },
      { id: 'local', kind: 'custom', name: 'Local RLCD', endpoint: 'http://localhost:8080/v1', protocol: 'openai-chat', hasKey: false },
    ],
    rlcdModels: [
      { id: 'rlcd', providerId: 'typesafe', name: 'rlcd-model' },
      { id: 'local-rlcd', providerId: 'local', name: 'local-decision' },
    ],
  };
  const original = structuredClone(config), calls: string[] = [];
  (dom.window as any).workbench = { ai: new Proxy({}, { get: (_, name) => async () => {
    calls.push(String(name));
    assert.equal(name, 'config', 'Viewing suppliers must never write configuration or contact a model');
    return config;
  } }) };
  const { createRoot } = await import('react-dom/client');
  const { AiSettings } = await import('../src/views/AiSettings');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const section = (name: string) => dom.window.document.querySelector<HTMLElement>(`section[aria-label="${name}"]`)!;
  const llm = () => section('对话模型'), rlcd = () => section('决策模型（RLCD）');
  const selected = (element: HTMLElement) => element.querySelector('[aria-pressed="true"] strong')?.textContent;
  const choose = async (element: HTMLElement, name: string) => act(async () => {
    element.querySelector<HTMLButtonElement>(`button[aria-label$="供应商 ${name}"]`)!.click();
  });
  const render = async (query = '') => act(async () => root.render(createElement(AiSettings, { query })));
  try {
    await render();
    assert.equal(llm().querySelector('h2')?.parentElement?.className, rlcd().querySelector('h2')?.parentElement?.className);
    assert.equal(dom.window.document.querySelectorAll('section.ai-config-section h2').length, 2);
    assert.equal(selected(llm()), 'Deepseek', 'Start at the active model supplier, even when it is not the first supplier');
    assert.equal(selected(rlcd()), 'TypeSafe');
    assert.match(llm().querySelector('article')!.textContent!, /deepseek-flash/);
    assert.doesNotMatch(llm().querySelector('article')!.textContent!, /minimax/);
    await choose(llm(), 'OpenRouter'); await choose(rlcd(), 'Local RLCD');
    assert.equal(selected(llm()), 'OpenRouter'); assert.equal(selected(rlcd()), 'Local RLCD');
    assert.match(llm().querySelector('article')!.textContent!, /https:\/\/openrouter.ai\/api/);
    for (const button of dom.window.document.querySelectorAll('nav button[aria-controls]')) {
      assert.ok(dom.window.document.getElementById(button.getAttribute('aria-controls')!));
    }
    await render('deepseek-flash');
    assert.equal(selected(llm()), 'Deepseek', 'Search must reveal a matching supplier outside the current selection');
    assert.match(rlcd().textContent!, /没有匹配的供应商或模型/);
    await render();
    assert.equal(selected(llm()), 'OpenRouter'); assert.equal(selected(rlcd()), 'Local RLCD');
    await act(async () => llm().querySelector<HTMLButtonElement>('h2 button')!.click());
    assert.equal(llm().querySelector('h2 button')!.getAttribute('aria-expanded'), 'false');
    assert.equal(rlcd().querySelector('h2 button')!.getAttribute('aria-expanded'), 'true');
    assert.ok(llm().querySelector('.ai-config-surface-panel[inert][aria-hidden="true"]'));
    await render('no-such-model');
    assert.equal(llm().querySelector('h2 button')!.getAttribute('aria-expanded'), 'true');
    assert.equal(dom.window.document.querySelectorAll('article.ai-config-card').length, 0);
    await render();
    assert.equal(selected(llm()), 'OpenRouter'); assert.equal(selected(rlcd()), 'Local RLCD');
    assert.deepEqual(config, original); assert.deepEqual(calls, ['config']);
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
