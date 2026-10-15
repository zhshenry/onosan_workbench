import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { BrowserStore } from '../electron/browser/store';
import { BrowserAutomation } from '../electron/browser/tasks';
import { BrowserDriver } from '../electron/browser/driver';
import { browserActionSchema, browserQuerySchema, browserRecordUrl } from '../shared/browser-automation-contracts';
import type { BrowserGuests } from '../electron/browser-guests';
import type { WebContents } from 'electron';

test('browser action contract rejects arbitrary scripts, unexpected fields and non-finite coordinates', () => {
  for (const value of [
    { type: 'evaluate', code: 'fetch("file:///secret")' },
    { type: 'click', ref: 'r1', code: 'anything' },
    { type: 'coordinate', screenshotId: 's1', point: { x: Infinity, y: 0 } },
    { type: 'press', key: 'Control+V' },
    { type: 'drag', screenshotId: 's1', from: { x: -1, y: 0 }, to: { x: 3, y: 4 } },
    { type: 'locator', query: {}, action: { type: 'evaluate', code: 'anything' } },
    { type: 'locator', query: {}, timeoutMs: 15001, action: { type: 'click' } },
  ]) assert.equal(browserActionSchema.safeParse(value).success, false);
  assert.equal(browserActionSchema.parse({ type: 'fill', ref: 'input', text: '中文测试' }).type, 'fill');
});

test('browser records restore addresses without login parameters and interrupt unfinished tasks', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'browser-store-'));
  try {
    const filename = path.join(dir, 'browser.json'), store = new BrowserStore(filename);
    store.saveTabs('default', [{ id: 'tab1', url: 'https://fixture.test/form?token=secret#authorization' }], 'tab1');
    store.visit('default', 'https://fixture.test/form?token=secret', '测试页面');
    store.task({ id: 'task1', goal: '保存测试', workspace: 'default', tabIds: ['tab1'], origins: ['https://fixture.test'], status: 'running', steps: [], updatedAt: 'now' });
    assert.doesNotMatch(readFileSync(filename, 'utf8'), /secret|authorization/);
    const restored = new BrowserStore(filename).state('default');
    assert.equal(restored.tabs[0].url, 'https://fixture.test/form');
    assert.equal(restored.tasks[0].status, 'interrupted');
    assert.deepEqual(store.state('xhs-creator').history, []);
    assert.equal(browserRecordUrl('https://user:password@fixture.test/'), '');
    store.clearHistory('default'); assert.equal(store.state('default').history.length, 0);
    assert.equal(store.state('default').tabs.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

function fixture() {
  const directory = mkdtempSync(path.join(tmpdir(), 'browser-task-'));
  const owner = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: () => {} }) as unknown as WebContents;
  const commands: string[] = [];
  let url = 'https://fixture.test/form';
  let activeTab = true;
  const debuggerApi = Object.assign(new EventEmitter(), {
    attach: () => {},
    sendCommand: async (method: string) => {
      commands.push(method);
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame', url } } };
      if (method === 'Page.createIsolatedWorld') return { executionContextId: 7 };
      if (method === 'Accessibility.getFullAXTree') return { nodes: [{ role: { value: 'StaticText' }, name: { value: '保存成功' } }] };
      if (method === 'DOM.getDocument') return { root: { nodeId: 1, backendNodeId: 1, nodeType: 9, nodeName: '#document', children: [{ nodeId: 2, backendNodeId: 2, nodeType: 1, nodeName: 'P', children: [{ nodeId: 3, backendNodeId: 3, nodeType: 3, nodeName: '#text', nodeValue: '保存成功' }] }] } };
      if (method === 'Runtime.evaluate' || method === 'DOM.resolveNode') return { result: { objectId: 'document' }, object: { objectId: 'text' } };
      if (method === 'DOM.requestNode') return { nodeId: 1 };
      if (method === 'Runtime.callFunctionOn') return { result: { value: '保存成功' } };
      if (method === 'DOMSnapshot.captureSnapshot') return { strings: ['block', 'visible'], documents: [{ nodes: { backendNodeId: [2] }, layout: { nodeIndex: [0], styles: [[0, 1]], bounds: [[0, 0, 100, 20]] } }] };
      return {};
    },
  });
  const guest = Object.assign(new EventEmitter(), { id: 1, debugger: debuggerApi, isDevToolsOpened: () => false, isDestroyed: () => false, getURL: () => url, getTitle: () => 'fixture', loadURL: async (value: string) => { url = value; } });
  const guests = {
    observeNavigation: () => {}, observePopup: () => {},
    resolve: (caller: WebContents, id: string) => { if (caller !== owner || id !== 'tab1') throw new Error('denied'); return { guest, workspace: 'default' }; },
    tabs: (_caller: WebContents, workspace: string) => workspace === 'default' ? [{ id: 'tab1', workspace: 'default', url, title: 'fixture', ready: true, active: activeTab }] : [],
    canNavigate: (value: string) => /^https?:/.test(value),
  } as unknown as BrowserGuests;
  const automation = new BrowserAutomation(guests, new BrowserStore(path.join(directory, 'browser.json')));
  const task = automation.start(owner, 'tab1', '保存测试');
  const controller = new AbortController();
  automation.bind(owner, task.id, 'chat1', controller.signal);
  return { automation, owner, task, controller, commands, guest, clearActiveTab: () => { activeTab = false; }, cleanup: () => rmSync(directory, { recursive: true, force: true }) };
}

test('sidebar chat binds the current browser tab, continues its own task and starts afresh after completion', async () => {
  const value = fixture();
  try {
    value.automation.finish(value.owner, value.task.id);
    assert.equal(value.automation.forChat(value.owner, 'default', '补充说明', 'chat1', value.task.id)?.id, value.task.id);
    value.automation.bind(value.owner, value.task.id, 'chat1', value.controller.signal);
    await value.automation.check(value.owner, value.task.id, 'tab1', { type: 'text', text: '保存成功', present: true });
    value.automation.finish(value.owner, value.task.id);
    const next = value.automation.forChat(value.owner, 'default', '新操作', 'chat1', value.task.id)!;
    assert.notEqual(next.id, value.task.id);
    assert.deepEqual(next.tabIds, ['tab1']);
    assert.deepEqual(next.origins, ['https://fixture.test']);
  } finally { value.cleanup(); }
});

test('an empty active tab never silently grants an inactive page or another profile to sidebar chat', () => {
  const value = fixture();
  try {
    value.automation.finish(value.owner, value.task.id);
    value.clearActiveTab();
    const next = value.automation.forChat(value.owner, 'default', '打开指定网站', 'chat1', value.task.id)!;
    assert.deepEqual(next.tabIds, []);
    assert.deepEqual(next.origins, []);
    value.automation.control(value.owner, next.id, 'cancel');
    const creator = value.automation.forChat(value.owner, 'xhs-creator', '打开创作者后台', 'chat1')!;
    assert.equal(creator.workspace, 'xhs-creator');
    assert.deepEqual(creator.tabIds, []);
    assert.deepEqual(value.commands, []);
  } finally { value.cleanup(); }
});

test('task ownership and tab bounds fail before sending a browser command', async () => {
  const value = fixture();
  try {
    assert.throws(() => value.automation.taskFor({} as WebContents, value.task.id));
    await assert.rejects(value.automation.observe(value.owner, value.task.id, 'other-tab'), /不属于/);
    assert.equal(value.commands.length, 0);
  } finally { value.cleanup(); }
});

test('a sent tab identity cannot silently fall back to another tab or login profile', () => {
  const value = fixture();
  try {
    value.automation.finish(value.owner, value.task.id);
    assert.throws(() => value.automation.forChat(value.owner, 'default', '操作原网页', 'chat1', undefined, 'closed-tab'), /关联的网页/);
    assert.throws(() => value.automation.forChat(value.owner, 'xhs-creator', '操作小红书', 'chat1', undefined, 'tab1'), /关联的网页/);
    assert.equal(value.commands.length, 0);
  } finally { value.cleanup(); }
});
test('cross-origin navigation waits for explicit site authorization; cancel sends no navigation', async () => {
  const value = fixture();
  try {
    const navigating = value.automation.navigate(value.owner, value.task.id, 'tab1', 'https://other.test/');
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(value.automation.taskFor(value.owner, value.task.id).status, 'site-approval');
    assert.equal(value.automation.taskFor(value.owner, value.task.id).pendingOrigin, 'https://other.test');
    value.automation.control(value.owner, value.task.id, 'cancel');
    await assert.rejects(navigating);
    assert.equal(value.automation.taskFor(value.owner, value.task.id).status, 'cancelled');
  } finally { value.cleanup(); }
});
test('pause blocks observation until resume and waiting never counts as completion verification', async () => {
  const value = fixture();
  try {
    value.automation.control(value.owner, value.task.id, 'pause');
    const pending = value.automation.observe(value.owner, value.task.id, 'tab1');
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(value.commands.length, 0);
    value.automation.control(value.owner, value.task.id, 'resume');
    assert.equal((await pending).text, '保存成功');
    await value.automation.check(value.owner, value.task.id, 'tab1', { type: 'text', text: '保存成功', present: true }, 0, false);
    value.automation.finish(value.owner, value.task.id);
    assert.equal(value.automation.taskFor(value.owner, value.task.id).status, 'unverified');
  } finally { value.cleanup(); }
});
test('only successful explicit result checks mark completion', async () => {
  const value = fixture();
  try {
    await value.automation.check(value.owner, value.task.id, 'tab1', { type: 'text', text: '保存成功', present: true });
    value.automation.finish(value.owner, value.task.id);
    assert.equal(value.automation.taskFor(value.owner, value.task.id).status, 'completed');
  } finally { value.cleanup(); }
});
test('an unverified task can continue only in the issuing window and conversation', () => {
  const value = fixture();
  try {
    value.automation.finish(value.owner, value.task.id);
    assert.equal(value.automation.continuation(value.owner, value.task.id, 'chat1')?.id, value.task.id);
    assert.equal(value.automation.continuation(value.owner, value.task.id, 'other-chat'), undefined);
    assert.equal(value.automation.continuation({} as WebContents, value.task.id, 'chat1'), undefined);
    value.automation.bind(value.owner, value.task.id, 'chat1', new AbortController().signal);
    value.automation.control(value.owner, value.task.id, 'cancel');
    assert.equal(value.automation.continuation(value.owner, value.task.id, 'chat1'), undefined);
  } finally { value.cleanup(); }
});
test('ungranted iframe text is excluded and explicitly querying its frame waits for consent before reading', async () => {
  const value = fixture();
  try {
    const send = value.guest.debugger.sendCommand;
    let childReads = 0;
    value.guest.debugger.sendCommand = async (method: string, params?: Record<string, unknown>) => {
      if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame', url: 'https://fixture.test/form' }, childFrames: [{ frame: { id: 'foreign', url: 'https://other.test/private' } }] } };
      if (method === 'Accessibility.getFullAXTree' && params?.frameId === 'foreign') childReads++;
      return send(method);
    };
    const observation = await value.automation.observe(value.owner, value.task.id, 'tab1');
    assert.equal(childReads, 0); assert.equal(observation.frames.find(frame => frame.id === 'foreign')?.available, false);
    const pending = value.automation.observe(value.owner, value.task.id, 'tab1', false, false, browserQuerySchema.parse({ frameId: 'foreign' }));
    for (let attempt = 0; attempt < 100 && value.automation.taskFor(value.owner, value.task.id).status !== 'site-approval'; attempt++) await new Promise(resolve => setTimeout(resolve, 2));
    assert.equal(value.automation.taskFor(value.owner, value.task.id).status, 'site-approval');
    value.automation.control(value.owner, value.task.id, 'cancel'); await assert.rejects(pending);
    assert.equal(childReads, 0);
  } finally { value.cleanup(); }
});

test('checking a named element beyond the first observation page searches its actual target', async () => {
  const buttons = Array.from({ length: 251 }, (_, index) => ({ nodeId: index + 10, backendNodeId: index + 10, nodeType: 1, nodeName: 'BUTTON', children: [{ nodeId: index + 1000, backendNodeId: index + 1000, nodeType: 3, nodeName: '#text', nodeValue: `button-${index}` }] }));
  const driver = new BrowserDriver({ info: () => ({ id: 'tab', workspace: 'default', title: 'fixture', url: 'https://fixture.test/', active: true, ready: true }), navigate: async () => {}, send: async (method, params) => {
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'frame', url: 'https://fixture.test/' } } };
    if (method === 'Page.createIsolatedWorld') return { executionContextId: 1 };
    if (method === 'Accessibility.getFullAXTree') return { nodes: buttons.map((button, index) => ({ backendDOMNodeId: button.backendNodeId, role: { value: 'button' }, name: { value: `button-${index}` } })) };
    if (method === 'DOM.getDocument') return { root: { nodeId: 1, backendNodeId: 1, nodeType: 9, nodeName: '#document', children: buttons } };
    if (method === 'Runtime.evaluate') return { result: { objectId: 'document' } };
    if (method === 'DOM.requestNode') return { nodeId: 1 };
    if (method === 'DOM.resolveNode') return { object: { objectId: String(params?.backendNodeId) } };
    if (method === 'Runtime.callFunctionOn') return { result: { value: `button-${Number(params?.objectId) - 10}` } };
    return {};
  } });
  const result = await driver.check({ type: 'element', role: 'button', name: 'button-250', present: false });
  assert.equal(result.observation.elements.length, 1);
  assert.equal(result.observation.elements[0].name, 'button-250');
  assert.equal(result.passed, false);
  assert.equal((await driver.check({ type: 'element', role: 'button', name: 'button-250', present: true })).passed, true);
});
test('cancellation releases a pending navigation without waiting for the site to respond', async () => {
  const controller = new AbortController();
  const driver = new BrowserDriver({ info: () => ({ id: 'tab', workspace: 'default', title: '', url: 'https://fixture.test/', active: true, ready: true }), send: async () => ({}), navigate: async () => new Promise<void>(() => {}) });
  const request = driver.navigate('https://fixture.test/slow', controller.signal);
  controller.abort();
  await assert.rejects(request, /停止/);
});
test('journal failure remains visible and cannot prevent stopping the browser task', () => {
  const value = fixture();
  try {
    value.automation.store.task = () => { throw new Error('synthetic disk failure'); };
    const task = value.automation.control(value.owner, value.task.id, 'cancel');
    assert.equal(task.status, 'cancelled'); assert.match(task.persistenceError!, /保存失败/);
    assert.equal(value.automation.signal(value.owner, value.task.id).aborted, true);
  } finally { value.cleanup(); }
});
