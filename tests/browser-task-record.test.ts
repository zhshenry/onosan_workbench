import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { JSDOM } from 'jsdom';
import type { BrowserTask, BrowserWorkspaceState } from '../shared/browser-automation-contracts';

const task = (id: string, goal: string): BrowserTask => ({ id, goal, workspace: 'default', status: 'completed', tabIds: [], origins: [], updatedAt: '2026-10-16T00:00:00Z', steps: [{ at: '2026-10-16T00:00:00Z', operation: 'check', status: 'ok', detail: `${goal}已核验` }] });
const state = (tasks: BrowserTask[]): BrowserWorkspaceState => ({ tabs: [], activeId: '', history: [], tasks });

async function withUi(run: (dom: JSDOM, root: import('react-dom/client').Root) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost' });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'window' ? dom.window : name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name] }));
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  dom.window.HTMLDialogElement.prototype.close = function () { this.open = false; };
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  try { await run(dom, root); }
  finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
}

test('历史回复按自身任务读取记录，记录淘汰后不显示同会话的新任务', async () => withUi(async (dom, root) => {
  const older = task('older', '第一次填写'), newer = task('newer', '第二次填写');
  let tasks = [older, newer];
  Object.defineProperty(dom.window, 'workbench', { value: { browserAutomation: { state: async () => state(tasks), onTask: () => () => {} } } });
  const { AiResponse } = await import('../src/views/AiResponse');
  const entry = { id: 'reply', role: 'assistant' as const, content: '已处理', browserTask: { id: older.id, workspace: older.workspace } };
  await act(async () => root.render(createElement(AiResponse, { entry })));
  const open = () => dom.window.document.querySelector<HTMLButtonElement>('.ai-browser-record')!.click();
  await act(async () => open());
  const dialog = dom.window.document.querySelector('dialog')!;
  assert.match(dialog.textContent!, /第一次填写已核验/);
  assert.doesNotMatch(dialog.textContent!, /第二次填写/);
  await act(async () => dom.window.document.querySelector<HTMLButtonElement>('.modal-heading button')!.click());
  tasks = [newer];
  await act(async () => open());
  assert.match(dom.window.document.querySelector('dialog')!.textContent!, /已不在保留范围内/);
  assert.doesNotMatch(dom.window.document.querySelector('dialog')!.textContent!, /第二次填写/);
}));

test('操作记录读取可重试，实时任务更新不会被迟到的初始快照覆盖', async () => withUi(async (dom, root) => {
  let calls = 0, listener: (value: BrowserTask) => void = () => {}, resolve: (value: BrowserWorkspaceState) => void = () => {};
  Object.defineProperty(dom.window, 'workbench', { value: { browserAutomation: {
    state: () => ++calls === 1 ? Promise.reject(new Error('读取失败')) : new Promise<BrowserWorkspaceState>(done => { resolve = done; }),
    onTask: (next: typeof listener) => { listener = next; return () => { listener = () => {}; }; },
  } } });
  const { BrowserTaskRecord } = await import('../modules/browser/ui/task-record');
  const older = task('task', '任务');
  await act(async () => root.render(createElement(BrowserTaskRecord, { reference: older, close: () => {} })));
  assert.match(dom.window.document.querySelector('[role="alert"]')!.textContent!, /读取失败/);
  const retry = Array.from(dom.window.document.querySelectorAll('button')).find(button => button.textContent === '重试')!;
  await act(async () => retry.click());
  const live = { ...older, steps: [...older.steps, { ...older.steps[0], detail: '新操作已返回' }] };
  await act(async () => { listener(live); resolve(state([older])); });
  assert.match(dom.window.document.querySelector('dialog')!.textContent!, /新操作已返回/);
}));
