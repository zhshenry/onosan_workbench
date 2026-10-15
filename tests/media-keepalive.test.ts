import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { createElement, act } from 'react';
import * as React from 'react';
import { JSDOM } from 'jsdom';
import { defaultViewOfWorkbench } from '../src/nav';
import { XHS_CREATOR_HOME, XHS_CREATOR_WORKSPACE } from '../shared/browser-contracts';

test('creator host retains the actual DOM, frame subscriptions and lease only across workspace visibility', async () => {
  const dom = new JSDOM('<button id="current" tabindex="-1">当前工作台</button><div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'AbortController', 'AbortSignal', 'React', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true,
    value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'React' ? React : name === 'window' ? dom.window : dom.window[name] }));
  // CSS is irrelevant to this React/lease test; actual native hiding is checked in Electron.
  const styles = registerHooks({ load(url, context, nextLoad) {
    return url.endsWith('.css') ? { format: 'module', source: '', shortCircuit: true } : nextLoad(url, context);
  } });
  const acquired: { lease: string; workspace: string }[] = [];
  const released: string[] = [];
  const openListeners = new Set<string>();
  let captureListeners = 0;
  let hold = false;
  let resolveAcquire: (() => void) | undefined;
  Object.assign(dom.window, { workbench: {
    browser: {
      acquire: async (workspace: string) => {
        const lease = `lease-${acquired.length + 1}`;
        acquired.push({ lease, workspace });
        if (hold) await new Promise<void>(resolve => { resolveAcquire = resolve; });
        return { lease, partition: `persist:wb-browser-${workspace}` };
      },
      release: async (lease: string) => { released.push(lease); },
      onOpenRequested: (lease: string) => { openListeners.add(lease); return () => openListeners.delete(lease); },
    },
    mediaCapture: {
      list: async () => [],
      onChanged: () => { captureListeners++; return () => { captureListeners--; }; },
      onFailed: () => { captureListeners++; return () => { captureListeners--; }; },
    },
  } });
  type Guest = HTMLElement & {
    loadURL(url: string): Promise<void>;
    getURL(): string;
    routes: string[];
    liveListeners: Set<string>;
  };
  const guests: Guest[] = [];
  const create = dom.window.document.createElement.bind(dom.window.document);
  dom.window.document.createElement = ((name: string, options?: ElementCreationOptions) => {
    const element = create(name, options);
    if (name !== 'webview') return element;
    const guest = element as Guest;
    guest.routes = [];
    guest.liveListeners = new Set();
    let url = 'about:blank';
    let history = ['about:blank'];
    const listen = element.addEventListener.bind(element);
    element.addEventListener = ((name: string, listener: EventListenerOrEventListenerObject, options?: AddEventListenerOptions) => {
      guest.liveListeners.add(name);
      options?.signal?.addEventListener('abort', () => guest.liveListeners.delete(name), { once: true });
      return listen(name, listener, options);
    }) as typeof element.addEventListener;
    Object.assign(guest, {
      loadURL: async (next: string) => {
        url = next; history.push(next); guest.routes.push(next);
        guest.dispatchEvent(new dom.window.Event('did-navigate'));
        guest.dispatchEvent(new dom.window.Event('did-stop-loading'));
      },
      getURL: () => url, getTitle: () => 'Local fixture',
      canGoBack: () => history.length > 1, canGoForward: () => false,
      clearHistory: () => { history = [url]; }, isLoading: () => false,
    });
    guests.push(guest);
    return guest;
  }) as typeof dom.window.document.createElement;
  const { MediaBrowserHost } = await import('../src/views/MediaBrowserHost');
  const { createRoot } = await import('react-dom/client');
  let root = createRoot(dom.window.document.getElementById('root')!);
  const focusTarget = { current: dom.window.document.getElementById('current')! };
  const render = async (active: boolean) => {
    await act(async () => root.render(createElement(MediaBrowserHost, {
      active, focusTarget, onPending() {},
    })));
  };
  const ready = async (guest: Guest) => { await act(async () => guest.dispatchEvent(new dom.window.Event('dom-ready'))); };
  const teardown = async () => { await act(async () => root.unmount()); };
  try {
    await render(false);
    assert.equal(acquired.length, 0, 'Never-opened host must not allocate a lease');
    assert.equal(dom.window.document.querySelector('.media-browser-host'), null);
    await render(true);
    assert.deepEqual(acquired.map(value => value.workspace), [XHS_CREATOR_WORKSPACE]);
    const first = guests[0]; await ready(first);
    assert.deepEqual(first.routes, [XHS_CREATOR_HOME]);
    await act(async () => first.loadURL('https://creator.xiaohongshu.com/note/keepalive'));
    const input = create('input'); input.value = '未提交文字'; first.append(input); input.focus();
    const host = dom.window.document.querySelector('.media-browser-host')!;
    const routes = [...first.routes]; const listenerCount = first.liveListeners.size;
    assert.ok(listenerCount > 0); assert.equal(openListeners.size, 1);
    assert.equal(captureListeners, 0, 'Creator page must not subscribe to the materials collector');
    assert.equal(dom.window.document.querySelector('.media-browser-header h1')?.textContent, '我的小红书');
    assert.equal(dom.window.document.querySelector('.media-browser-header button'), null);
    assert.equal([...dom.window.document.querySelectorAll('button')].some(button => button.textContent === '找素材' || button.textContent === '返回我的小红书'), false);
    assert.equal(dom.window.document.querySelector('.mbp-capbtn'), null);
    assert.equal(dom.window.document.querySelector('[title^="AI 看这页"]'), null);
    assert.equal(dom.window.document.querySelector('.mbp-chip'), null);
    assert.equal(dom.window.document.querySelector('webview')?.getAttribute('partition'), `persist:wb-browser-${XHS_CREATOR_WORKSPACE}`);
    for (let turn = 0; turn < 6; turn++) {
      await render(false);
      assert.equal(host.getAttribute('aria-hidden'), 'true'); assert.equal(host.hasAttribute('inert'), true);
      assert.equal(host.hasAttribute('hidden'), true);
      assert.equal(dom.window.document.activeElement, focusTarget.current);
      assert.equal(dom.window.document.querySelector('webview'), first);
      // Even a stray programmatic focus event cannot leave the hidden host focused.
      await act(async () => input.dispatchEvent(new dom.window.FocusEvent('focusin', { bubbles: true })));
      assert.equal(dom.window.document.activeElement, focusTarget.current);
      await render(true);
      assert.equal(dom.window.document.querySelector('.media-browser-host'), host);
      assert.equal(dom.window.document.querySelector('webview'), first);
      assert.equal(input.value, '未提交文字'); assert.deepEqual(first.routes, routes);
      assert.equal(first.liveListeners.size, listenerCount);
      assert.equal(acquired.length, 1); assert.deepEqual(released, []);
      assert.equal(host.hasAttribute('hidden'), false); assert.equal(host.hasAttribute('inert'), false);
    }
    await render(false);
    focusTarget.current.blur(); assert.equal(dom.window.document.activeElement,dom.window.document.body);
    await render(false); // New callbacks/unrelated parent render must not rerun the hide transition.
    assert.equal(dom.window.document.activeElement,dom.window.document.body,'An inactive parent rerender must not steal focus from body');
    await render(true);
    await teardown();
    assert.deepEqual(released, ['lease-1']); assert.equal(first.liveListeners.size, 0);
    assert.equal(openListeners.size, 0); assert.equal(captureListeners, 0);

    root = createRoot(dom.window.document.getElementById('root')!); hold = true;
    await render(true); const pendingLease = acquired.at(-1)!.lease;
    await render(false); assert.equal(guests.length, 1, 'Hidden pending acquisition must not restart');
    await act(async () => resolveAcquire!()); await ready(guests[1]);
    await render(true); assert.equal(dom.window.document.querySelector('webview'), guests[1]);
    assert.equal(acquired.at(-1)!.lease, pendingLease); assert.deepEqual(guests[1].routes, [XHS_CREATOR_HOME]);
    await teardown();

    root = createRoot(dom.window.document.getElementById('root')!);
    await render(true); const abandonedLease = acquired.at(-1)!.lease;
    await teardown(); await act(async () => resolveAcquire!());
    assert.equal(guests.length, 2, 'Real teardown cancels pending guest attachment');
    assert.equal(released.at(-1), abandonedLease);
    assert.ok(acquired.every(value => value.workspace === XHS_CREATOR_WORKSPACE), 'Creator keepalive must not enter the materials workspace');
    assert.equal(new Set(released).size, released.length, 'Each acquired lease releases exactly once');
    assert.equal(released.length, acquired.length); assert.equal(openListeners.size, 0); assert.equal(captureListeners, 0);

    root = createRoot(dom.window.document.getElementById('root')!); hold = false;
    const { BrowserHost } = await import('../src/views/BrowserView');
    const pair = async (browserActive: boolean) => act(async () => root.render(createElement(React.Fragment, null,
      createElement(BrowserHost, { active: browserActive, focusTarget, onPending() {} }),
      createElement(MediaBrowserHost, { active: !browserActive, focusTarget, onPending() {} }),
    )));
    await pair(true); await pair(false);
    const creatorHost = dom.window.document.querySelector('.media-browser-host')!;
    const browserHost = dom.window.document.querySelector('#view-browser')!.parentElement!;
    assert.equal(dom.window.document.querySelectorAll('.media-browser-host').length, 1, 'Creator selectors must not include the generic browser');
    assert.equal(creatorHost.querySelector('#view-media-browser')?.id, 'view-media-browser');
    assert.equal(browserHost.hasAttribute('hidden'), true);
    await pair(true);
    assert.equal(dom.window.document.querySelector('.media-browser-host'), creatorHost);
    assert.equal(creatorHost.hasAttribute('hidden'), true);
    assert.equal(browserHost.hasAttribute('hidden'), false);
  } finally {
    if (resolveAcquire) resolveAcquire();
    try { await act(async () => root.unmount()); } catch { /* Already unmounted after successful cleanup. */ }
    styles.deregister(); dom.window.close();
    names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name));
  }
});

test('retained creator is outside the keyed route and hidden presence cannot alter other page layout', () => {
  const app = readFileSync('src/App.tsx', 'utf8'); const css = readFileSync('src/shell.css', 'utf8');
  assert.ok(app.indexOf('<MediaBrowserHost active=') > app.indexOf('</div>}', app.indexOf('key={curView}')));
  assert.match(css, /\.content:has\(> \.view-fade:not\(\[hidden\]\) > \.media-browser-view\)/);
  assert.match(css, /\.media-browser-host\[hidden\] \{ display: none !important; \}/);
  assert.equal(defaultViewOfWorkbench('media'), 'copy', 'Default workbench subview is unchanged');
});
