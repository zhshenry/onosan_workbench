import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement, act } from 'react';
import * as React from 'react';
import { JSDOM } from 'jsdom';
import { XHS_CREATOR_HOME, XHS_CREATOR_WORKSPACE } from '../shared/browser-contracts';
import type { CopyDraft } from '../shared/copy-contracts';

const read = (path: string) => readFileSync(path, 'utf8');

test('creator page removes the find-materials entry and does not leave an orphan mode', () => {
  const view = read('src/views/MediaBrowserView.tsx');
  const host = read('src/views/MediaBrowserHost.tsx');
  const app = read('src/App.tsx');
  const nav = read('src/nav.ts');
  const pilot = read('tooling/media-keepalive-pilot.mjs');
  for (const source of [view, host, app, nav]) assert.doesNotMatch(source, /找素材|返回我的小红书/);
  assert.doesNotMatch(view, /onModeChange|CaptureStrip|onAskPage|workspace="media"|MEDIA_PLATFORMS/);
  assert.doesNotMatch(host, /\bmode\b|=== 'browse'|workspace="media"/);
  assert.doesNotMatch(app, /mediaBrowserMode|setMediaBrowserMode|onModeChange/);
  assert.match(app, /onOpenCreator=\{\(\) => switchView\('media-browser'\)\}/);
  assert.match(nav, /label: '我的小红书', view: 'media-browser'/);
  assert.equal((nav.match(/label: '我的小红书'/g) ?? []).length, 1);
  assert.match(view, /<h1>我的小红书<\/h1>/);
  assert.match(view, /作品同步暂未接入/);
  assert.match(view, /readOnlyAddress/);
  assert.match(view, /workspace=\{XHS_CREATOR_WORKSPACE\}/);
  assert.match(view, /initialUrl=\{XHS_CREATOR_HOME\}/);
  assert.match(pilot, /Removed find-materials entry leaves no orphan materials mode and retains the creator guest/);
  assert.match(pilot, /name: '找素材', exact: true \}\)\.count\(\), 0\)/);
  assert.match(pilot, /name: '返回我的小红书', exact: true \}\)\.count\(\), 0\)/);
  assert.doesNotMatch(pilot, /找素材[^;\n]*\.click\(|返回我的小红书[^;\n]*\.click\(/);
});

test('materials data, collector modules, shared browser and web security rules stay in place', () => {
  for (const path of [
    'modules/media-capture/store.ts',
    'modules/media-capture/ui/CaptureStrip.tsx',
    'modules/media-capture/platforms.ts',
    'modules/media-capture/useMediaCaptures.ts',
    'modules/browser/ui/pane.tsx',
    'modules/browser/ui/guest-frame.ts',
    'electron/browser-guests.ts',
    'shared/browser-contracts.ts',
    'shared/media-capture-contracts.ts',
    'tests/media-capture.test.ts',
    'tests/browser-creator.test.ts',
    'tests/media-keepalive.test.ts',
  ]) assert.equal(existsSync(path), true, path);
  assert.match(read('modules/media-capture/store.ts'), /export class MediaCaptureStore/);
  assert.match(read('modules/media-capture/ui/CaptureStrip.tsx'), /export function CaptureStrip/);
  assert.match(read('modules/media-capture/platforms.ts'), /export const MEDIA_PLATFORMS/);
  assert.match(read('modules/media-capture/useMediaCaptures.ts'), /export function useMediaCaptures/);
  assert.match(read('modules/browser/ui/pane.tsx'), /export function BrowserPane/);
  const guests = read('electron/browser-guests.ts');
  for (const marker of [
    'setPermissionRequestHandler', 'setPermissionCheckHandler', 'setDevicePermissionHandler',
    'setDisplayMediaRequestHandler', 'will-download', 'onBeforeRequest', 'XHS_CREATOR_WORKSPACE', 'isXhsCreatorNavigation',
  ]) assert.match(guests, new RegExp(marker));
  const contracts = read('shared/browser-contracts.ts');
  assert.match(contracts, /export const XHS_CREATOR_WORKSPACE = 'xhs-creator'/);
  assert.match(contracts, /export const XHS_CREATOR_HOME = 'https:\/\/creator\.xiaohongshu\.com\/'/);
  assert.match(contracts, /export function isXhsCreatorNavigation/);
});

test('rendered creator page keeps address chrome and cannot show a materials browser', async () => {
  const dom = new JSDOM('<button id="current" tabindex="-1">当前工作台</button><div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'AbortController', 'AbortSignal', 'React', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'React' ? React : name === 'window' ? dom.window : dom.window[name] }));
  const styles = registerHooks({ load(url, context, nextLoad) {
    return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
  } });
  const acquired: string[] = [];
  const released: string[] = [];
  Object.assign(dom.window, { workbench: { browser: {
    acquire: async (workspace: string) => {
      acquired.push(workspace);
      return { lease: `lease-${acquired.length}`, partition: `persist:wb-browser-${workspace}` };
    },
    release: async (lease: string) => { released.push(lease); },
    onOpenRequested: () => () => {},
  } } });
  type Guest = HTMLElement & { loadURL(url: string): Promise<void>; routes: string[] };
  const create = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = ((name: string, options?: ElementCreationOptions) => {
    const element = create(name, options);
    if (name !== 'webview') return element;
    const guest = element as Guest;
    guest.routes = [];
    let url = 'about:blank';
    let history = ['about:blank'];
    Object.assign(guest, {
      loadURL: async (next: string) => { url = next; history.push(next); guest.routes.push(next); guest.dispatchEvent(new dom.window.Event('did-navigate')); guest.dispatchEvent(new dom.window.Event('did-stop-loading')); },
      getURL: () => url, getTitle: () => 'Local fixture',
      canGoBack: () => history.length > 1, canGoForward: () => false,
      clearHistory: () => { history = [url]; }, isLoading: () => false,
    });
    return guest;
  }) as typeof dom.window.document.createElement;
  const { MediaBrowserHost } = await import('../src/views/MediaBrowserHost');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const focusTarget = { current: dom.window.document.getElementById('current')! };
  const render = async (active: boolean) => {
    await act(async () => root.render(createElement(MediaBrowserHost, { active, focusTarget, onPending() {} })));
  };
  try {
    await render(true);
    const guest = dom.window.document.querySelector('webview') as Guest;
    await act(async () => guest.dispatchEvent(new dom.window.Event('dom-ready')));
    const document = dom.window.document;
    assert.equal(document.querySelector('.media-browser-header h1')?.textContent, '我的小红书');
    assert.match(document.querySelector('.media-browser-header p')?.textContent ?? '', /作品同步暂未接入/);
    assert.equal(document.querySelector('.media-browser-header button'), null);
    const labels = [...document.querySelectorAll('button')].map(button => (button.textContent ?? '').trim());
    assert.equal(labels.includes('找素材'), false);
    assert.equal(labels.includes('返回我的小红书'), false);
    assert.equal(document.querySelector('.mbp-capbtn'), null);
    assert.equal(document.querySelector('.mbp-chip'), null);
    assert.equal(document.querySelector('.mbp-tabs'), null);
    assert.equal(document.querySelector('.mbp-start'), null);
    assert.equal(document.querySelector('[title^="AI 看这页"]'), null);
    for (const title of ['后退', '前进', '刷新']) assert.equal(document.querySelectorAll(`.mbp-navbtn[title="${title}"]`).length, 1);
    const address = document.querySelector('.mbp-addr input') as HTMLInputElement;
    assert.equal(address.readOnly, true);
    assert.deepEqual(guest.routes, [XHS_CREATOR_HOME]);
    assert.equal(guest.getAttribute('partition'), `persist:wb-browser-${XHS_CREATOR_WORKSPACE}`);
    assert.deepEqual(acquired, [XHS_CREATOR_WORKSPACE]);
    const host = document.querySelector('.media-browser-host')!;
    await render(false);
    assert.equal(host.hasAttribute('hidden'), true);
    assert.equal(document.querySelector('webview'), guest);
    assert.deepEqual(released, []);
    await render(true);
    assert.equal(document.querySelector('webview'), guest);
    assert.deepEqual(acquired, [XHS_CREATOR_WORKSPACE]);
    assert.equal(document.querySelector('.media-browser-header button'), null);
  } finally {
    try { await act(async () => root.unmount()); } catch { /* Already unmounted. */ }
    styles.deregister();
    dom.window.close();
    names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name));
  }
});

test('图文发布 still opens the creator page', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'window' ? dom.window : dom.window[name] }));
  const { createRoot } = await import('react-dom/client');
  const { PublishAssociation } = await import('../modules/copywriting/ui/PublishAssociation');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const opened: string[] = [];
  const draft: CopyDraft = {
    id: 'draft-1', title: '本地测试博客', body: '正文', platform: 'xiaohongshu',
    createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z',
  };
  try {
    await act(async () => root.render(createElement(PublishAssociation, {
      draft, writePending: false, onCommit: async () => false, onPending() {}, onOpenCreator: () => opened.push('media-browser'),
    })));
    const button = [...dom.window.document.querySelectorAll('button')].find(item => item.textContent === '在工作台打开小红书创作者中心');
    assert.ok(button);
    await act(async () => button.click());
    assert.deepEqual(opened, ['media-browser']);
    assert.equal([...dom.window.document.querySelectorAll('button')].some(item => item.textContent === '找素材'), false);
  } finally {
    try { await act(async () => root.unmount()); } catch { /* Already unmounted. */ }
    dom.window.close();
    names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name));
  }
});
