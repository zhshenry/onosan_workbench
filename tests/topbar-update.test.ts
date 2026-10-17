import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';
import type { UpdateStatus } from '../shared/contracts';

const snapshot = (phase: UpdateStatus['phase'], extra: Partial<UpdateStatus> = {}): UpdateStatus => ({
  enabled: true, phase, version: phase === 'ready' || phase === 'downloading' ? '1.0.0' : '', progress: 0, message: `${phase} 合成状态说明`, ...extra,
});

test('顶栏更新保持单图标，流式状态、读取竞争和检查/安装/说明动作互相隔离', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator'] as const;
  const previous = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : dom.window[name] }));
  const previousAct = Object.getOwnPropertyDescriptor(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', { configurable: true, value: true });
  let current = snapshot('idle'), listener: ((value: UpdateStatus) => void) | undefined;
  let read = () => Promise.resolve(current), check = () => Promise.resolve(), install = () => Promise.resolve(), notes = () => Promise.resolve();
  let checks = 0, installs = 0, noteCalls = 0, unsubscribes = 0;
  Object.defineProperty(dom.window, 'workbench', { value: {
    appInfo: { about: async () => ({ version: '0.4.0' }) },
    updater: { status: () => read(), onStatus: (callback: (value: UpdateStatus) => void) => { listener = callback; return () => { listener = undefined; unsubscribes++; }; },
      check: () => { checks++; return check(); }, install: () => { installs++; return install(); }, notes: () => { noteCalls++; return notes(); } },
  } });
  const { createRoot } = await import('react-dom/client');
  const { TopbarUpdate } = await import('../src/views/TopbarUpdate');
  let root = createRoot(dom.window.document.getElementById('root')!);
  const render = () => act(async () => { root.render(createElement(TopbarUpdate, { onOpen: () => {} })); });
  const reset = async () => { await act(async () => root.unmount()); root = createRoot(dom.window.document.getElementById('root')!); await render(); };
  const trigger = () => dom.window.document.querySelector<HTMLButtonElement>('.topbar-update')!;
  const panel = () => dom.window.document.querySelector<HTMLElement>('.topbar-update-popover')!;
  const primary = () => panel().querySelector<HTMLButtonElement>('.topbar-update-primary')!;
  const noteButton = () => panel().querySelector<HTMLButtonElement>('.topbar-update-notes')!;
  const emit = (value: UpdateStatus) => act(async () => { current = value; listener?.(value); });
  const click = (element: HTMLElement) => act(async () => element.click());
  t.after(async () => {
    await act(async () => root.unmount()); dom.window.close();
    globals.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
    if (previousAct) Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', previousAct); else Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });
  await render();

  await t.test('所有阶段复用同一个按钮，进度和重启只在真实相应状态出现', async () => {
    const node = trigger();
    assert.equal(node.getAttribute('popovertarget'), panel().id);
    assert.equal(node.getAttribute('aria-haspopup'), 'dialog');
    for (const [phase, title, action, disabled, dot] of [
      ['idle', '应用更新', '检查更新', false, false], ['checking', '正在检查更新', '检查中…', true, true],
      ['downloading', '正在下载更新', '下载中…', true, true], ['ready', '更新已就绪', '重启并安装', false, true],
      ['latest', '已是最新版本', '检查更新', false, false], ['error', '更新失败', '检查更新', false, true],
    ] as const) {
      await emit(snapshot(phase, { progress: phase === 'downloading' ? 42 : 0 }));
      assert.equal(trigger(), node); assert.equal(trigger().textContent, '');
      assert.ok(trigger().getAttribute('aria-label')?.includes(title));
      assert.equal(primary().textContent, action); assert.equal(primary().disabled, disabled);
      assert.equal(!!trigger().querySelector('.topbar-update-dot'), dot);
      const progress = panel().querySelector('progress');
      assert.equal(!!progress, phase === 'downloading');
      if (progress) { assert.equal(progress.value, 42); assert.match(trigger().getAttribute('aria-label')!, /42%/); }
    }
    await emit(snapshot('ready'));
    assert.equal(panel().querySelector('.topbar-update-version')?.textContent, 'v0.4.0 → v1.0.0');
    assert.equal(!!panel().querySelector('.topbar-update-footer'), false);
    assert.doesNotMatch(panel().textContent!, /退出.*安装/);
    await emit(snapshot('idle', { enabled: false, message: '便携版请手动替换。' }));
    assert.match(panel().textContent!, /自动更新不可用|便携版请手动替换/);
    await click(primary()); assert.equal(checks, 0); assert.equal(installs, 0);
  });

  await t.test('待返回的检查与安装不会重复派发；更新说明走专用动作', async () => {
    await emit(snapshot('idle'));
    let resolve!: () => void;
    check = () => new Promise<void>(done => { resolve = done; });
    await act(async () => { primary().click(); primary().click(); });
    assert.equal(checks, 1); assert.equal(primary().disabled, true);
    await act(async () => resolve()); check = () => Promise.resolve();
    await emit(snapshot('ready'));
    install = () => new Promise<void>(done => { resolve = done; });
    await act(async () => { primary().click(); primary().click(); });
    assert.equal(installs, 1);
    await act(async () => resolve()); install = () => Promise.resolve();
    await click(noteButton()); assert.equal(noteCalls, 1); assert.equal(installs, 1); assert.equal(checks, 1);
  });

  await t.test('说明链接失败保留就绪状态，新的状态事件覆盖旧动作失败', async () => {
    notes = () => Promise.reject(new Error('说明暂时打不开'));
    await click(noteButton());
    assert.match(panel().querySelector('.topbar-update-link-error')?.textContent ?? '', /说明暂时打不开/);
    assert.match(panel().querySelector('strong')?.textContent ?? '', /更新已就绪/);
    assert.equal(trigger().dataset.phase, 'ready'); notes = () => Promise.resolve();
    await emit(snapshot('idle'));
    let reject!: (error: Error) => void;
    check = () => new Promise<void>((_, fail) => { reject = fail; });
    await click(primary()); await emit(snapshot('ready'));
    await act(async () => reject(new Error('迟到的旧错误')));
    assert.equal(trigger().dataset.phase, 'ready'); assert.doesNotMatch(panel().textContent!, /迟到的旧错误/);
    check = () => Promise.resolve();
  });

  await t.test('迟到的首次读取不会覆盖就绪事件，读取失败可以单独重读', async () => {
    let resolve!: (value: UpdateStatus) => void;
    read = () => new Promise(done => { resolve = done; });
    await reset(); await emit(snapshot('ready'));
    await act(async () => resolve(snapshot('idle')));
    assert.equal(trigger().dataset.phase, 'ready');
    read = () => Promise.reject(new Error('读取更新状态失败'));
    await reset(); assert.equal(primary().textContent, '重新读取'); assert.equal(primary().disabled, false);
    read = () => Promise.resolve(snapshot('latest'));
    await click(primary()); assert.match(panel().querySelector('strong')?.textContent ?? '', /已是最新版本/);
    assert.ok(unsubscribes >= 2);
  });
});
