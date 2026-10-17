import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement, act } from 'react';
import { JSDOM } from 'jsdom';
import type { BrowserCondition, BrowserTask, BrowserWorkspaceState } from '../shared/browser-automation-contracts';

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

const checkedTask = (): BrowserTask => ({ ...task('checked', '查询 RLCD 相关模型'), origins: ['https://www.baidu.com'], verification: { planned: true, items: [
  { id: 'region', tabId: 'tab', label: '搜索词正确且结果已加载', condition: { type: 'state', query: { selector: { by: 'css', value: '#content_left', exact: true, ignoreCase: false }, offset: 0, limit: 100, textOffset: 0, textLimit: 14000 }, state: 'visible' }, status: 'passed' },
  { id: 'name', tabId: 'tab', label: 'Jev 与 Qwen 模型资料都已验证', condition: { type: 'text', text: 'Qwen-2.5-1B-RLCD', present: true }, status: 'passed', evidence: { at: '2026-10-17T06:22:00Z', url: 'https://www.baidu.com/s?wd=RLCD', actual: '页面原文 Qwen-2.5-1B-RLCD', detail: '文字匹配 → 条件符合' } },
] } });

test('检查摘要来自真实条件，页面检查与操作返回分开展示并保留原始证据', async () => withUi(async (dom, root) => {
  const { BrowserTaskDetails } = await import('../modules/browser/ui/task-record');
  await act(async () => root.render(createElement(BrowserTaskDetails, { task: checkedTask() })));
  const doc = dom.window.document;
  const titles = Array.from(doc.querySelectorAll('.browser-record-checks > li > details > summary > strong'), element => element.textContent);
  assert.deepEqual(titles, ['页面区域可见', '页面包含「Qwen-2.5-1B-RLCD」']);
  assert.match(doc.querySelector('.browser-record-heading [role="status"]')!.textContent!, /页面检查 2\/2 通过/);
  assert.match(doc.querySelector('.browser-record-scope')!.textContent!, /不代表资料真实性或完整性已核验/);
  assert.equal(doc.querySelector<HTMLElement>('section[aria-label="操作过程"]')!.hidden, true);
  assert.equal(doc.querySelectorAll('.browser-record-checks > li > details[open]').length, 0);
  const proof = doc.querySelectorAll<HTMLDetailsElement>('.browser-record-checks > li > details')[1];
  await act(async () => proof.querySelector('summary')!.click());
  assert.equal(proof.open, true);
  assert.match(proof.querySelector('.browser-evidence-actual')!.textContent!, /页面原文 Qwen/);
  assert.match(proof.querySelector('.browser-evidence-definition')!.textContent!, /AI 登记的名称：Jev 与 Qwen 模型资料都已验证/);
  const operationTab = Array.from(doc.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(button => button.textContent!.includes('操作过程'))!;
  await act(async () => operationTab.click());
  assert.equal(doc.querySelector<HTMLElement>('section[aria-label="操作过程"]')!.hidden, false);
  assert.equal(doc.querySelector<HTMLElement>('section[aria-label="任务核验清单"]')!.hidden, true);
  assert.match(doc.querySelector('.browser-record-explainer')!.textContent!, /操作正常返回/);
}));

test('历史任务切换保留当前选择，更新其他任务不会串记录；任务淘汰后回到可用记录', async () => withUi(async (dom, root) => {
  const { BrowserTaskHistory } = await import('../modules/browser/ui/task-record');
  const older = checkedTask(), newer = task('newer', '另一条历史任务');
  const render = (tasks: BrowserTask[]) => act(async () => root.render(createElement(BrowserTaskHistory, { tasks })));
  await render([older, newer]);
  const doc = dom.window.document;
  assert.equal(doc.querySelector('.browser-record-goal')!.textContent, newer.goal);
  await act(async () => Array.from(doc.querySelectorAll<HTMLButtonElement>('.browser-task-item')).find(button => button.textContent!.includes(older.goal))!.click());
  assert.equal(doc.querySelector('.browser-record-goal')!.textContent, older.goal);
  await render([older, { ...newer, goal: '另一任务的实时更新' }]);
  assert.equal(doc.querySelector('.browser-record-goal')!.textContent, older.goal);
  assert.equal(doc.querySelectorAll('.browser-task-item[aria-current="true"]').length, 1);
  await render([newer]);
  assert.equal(doc.querySelector('.browser-record-goal')!.textContent, newer.goal);
  await render([]);
  assert.match(doc.querySelector('[role="status"]')!.textContent!, /还没有任务记录/);
}));

test('过期、失败、无法确认的检查不显示全部通过，缺少核验的旧记录也不补造成功', async () => withUi(async (dom, root) => {
  const { BrowserTaskDetails } = await import('../modules/browser/ui/task-record');
  const original = checkedTask();
  for (const status of ['stale', 'failed', 'unknown'] as const) {
    const value = { ...original, verification: { ...original.verification!, items: original.verification!.items.map(item => ({ ...item, status })) } };
    await act(async () => root.render(createElement(BrowserTaskDetails, { task: value })));
    assert.doesNotMatch(dom.window.document.querySelector('.browser-record-heading [role="status"]')!.textContent!, /2\/2 通过/);
    assert.equal(dom.window.document.querySelectorAll('.browser-check-state[data-status="passed"]').length, 0);
  }
  await act(async () => root.render(createElement(BrowserTaskDetails, { task: task('legacy', '旧任务') })));
  assert.match(dom.window.document.querySelector('.browser-record-heading [role="status"]')!.textContent!, /缺少检查记录/);
}));

test('实际检查摘要保留否定、空字段值和定位数量，不扩大地址或字段检查的范围', async () => withUi(async (dom, root) => {
  const { BrowserTaskDetails } = await import('../modules/browser/ui/task-record');
  const conditions: BrowserCondition[] = [
    { type: 'text', text: '错误提示', present: false }, { type: 'url', text: '/saved' },
    { type: 'element', role: 'button', name: '提交', present: false }, { type: 'field', role: 'textbox', name: '搜索框', value: '' },
    { type: 'locator', query: { offset: 0, limit: 100, textOffset: 0, textLimit: 14000 }, count: 0, present: true },
  ];
  const value = { ...checkedTask(), verification: { planned: true, items: conditions.map((condition, index) => ({ id: String(index), tabId: 'tab', label: '任务全部完成', condition, status: 'passed' as const })) } };
  await act(async () => root.render(createElement(BrowserTaskDetails, { task: value })));
  assert.deepEqual(Array.from(dom.window.document.querySelectorAll('.browser-record-checks > li > details > summary > strong'), node => node.textContent), [
    '页面不包含「错误提示」', '页面地址包含「/saved」', '页面不包含「提交」元素', '「搜索框」内容为「」', '定位结果为 0 项',
  ]);
}));
