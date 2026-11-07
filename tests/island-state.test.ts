import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { initialIslandData, type IslandState } from '../shared/island-contracts';
import { useIslandState } from '../src/views/island-state';

test('island state: late initial/focus reads cannot overwrite a newer message update or error state', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const waiting: { resolve(value: IslandState): void; reject(error: Error): void }[] = [];
  let changed = (_state: IslandState) => {};
  Object.assign(dom.window, { workbench: { island: { state: () => new Promise((resolve, reject) => waiting.push({ resolve, reject })), onChanged: (fn: typeof changed) => { changed = fn; return () => {}; }, onError: () => () => {} } } });
  const snapshot = (title: string): IslandState => ({ ...initialIslandData(), mode: 'collapsed', pinned: false, quiet: false, fullscreenDetection: false, error: title });
  function Probe() { const { state, error } = useIslandState(); return React.createElement('p', null, `${state?.error ?? 'loading'}|${error}`); }
  const root = createRoot(dom.window.document.getElementById('root')!);
  try {
    await act(async () => root.render(React.createElement(Probe)));
    await act(async () => { changed(snapshot('new-message')); waiting[0].resolve(snapshot('old-initial-state')); });
    assert.equal(dom.window.document.querySelector('p')!.textContent, 'new-message|new-message');
    await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')));
    await act(async () => dom.window.dispatchEvent(new dom.window.Event('focus')));
    await act(async () => { waiting[2].resolve(snapshot('latest-focus')); waiting[1].reject(new Error('outdated-error')); });
    assert.equal(dom.window.document.querySelector('p')!.textContent, 'latest-focus|latest-focus');
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    Object.assign(globalThis, { window: previousWindow, document: previousDocument, IS_REACT_ACT_ENVIRONMENT: false });
  }
});
