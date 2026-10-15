import assert from 'node:assert/strict';
import test from 'node:test';
import { setImmediate } from 'node:timers/promises';
import { GuestFrame } from '../modules/browser/ui/guest-frame';
import type { WebviewElement, WebviewPresentation } from '../modules/browser/ui/webview-presentation';

test('a guest closed before its final title event is released and can be reopened without masking other errors', async t => {
  let failure: Error | undefined, reads = 0, acquired = 0;
  const released: string[] = [];
  const log = t.mock.method(console, 'error', () => {});
  const element = Object.assign(new EventTarget(), {
    getURL: () => { reads++; if (failure) throw failure; return 'https://fixture.test/'; },
    getTitle: () => '测试页面', isLoading: () => false,
    canGoBack: () => false, canGoForward: () => false, clearHistory: () => {}, loadURL: async () => {},
  }) as unknown as WebviewElement;
  const frame = new GuestFrame({ initialUrl: 'https://fixture.test/' }, {
    acquire: async () => ({ lease: `lease-${++acquired}`, partition: 'persist:fixture' }),
    release: async lease => { released.push(lease); }, onOpenRequested: () => () => {},
  }, {
    createElement: () => element, present: () => {}, clear: () => {}, show: () => {}, dispose: () => {},
  } as unknown as WebviewPresentation);
  t.after(() => frame.dispose());
  frame.attach();
  await setImmediate();
  element.dispatchEvent(new Event('dom-ready'));
  element.dispatchEvent(new Event('did-navigate'));
  failure = new Error('Invalid guestInstanceId: 6');
  element.dispatchEvent(new Event('page-title-updated'));
  await setImmediate();
  assert.deepEqual(released, ['lease-1']);
  assert.equal(frame.getSnapshot().loading, false);
  assert.match(frame.getSnapshot().error?.description ?? '', /页面已关闭/);
  assert.equal(log.mock.callCount(), 0);
  const stoppedReads = reads;
  element.dispatchEvent(new Event('page-title-updated'));
  assert.equal(reads, stoppedReads, 'A lost guest must no longer receive observations');
  failure = undefined;
  frame.reload();
  await setImmediate();
  element.dispatchEvent(new Event('dom-ready'));
  element.dispatchEvent(new Event('did-navigate'));
  assert.equal(acquired, 2);
  assert.equal(frame.getSnapshot().error, undefined);
  failure = new Error('Unexpected protocol failure');
  element.dispatchEvent(new Event('page-title-updated'));
  assert.equal(log.mock.callCount(), 1);
  assert.equal(log.mock.calls[0].arguments[1], failure);
});
