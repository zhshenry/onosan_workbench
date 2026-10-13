import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { act, createElement } from 'react';

test('width-only reflow keeps height, child schedule changes remeasure, AI return reattaches observers', async () => {
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  const resizeObservers: { callback: () => void; active: boolean }[] = [];
  class ResizeObserverMock {
    value: { callback: () => void; active: boolean };
    constructor(callback: () => void) { this.value = { callback, active: false }; resizeObservers.push(this.value); }
    observe() { this.value.active = true; } disconnect() { this.value.active = false; }
  }
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'ResizeObserver' ? ResizeObserverMock : name === 'window' ? dom.window : name === 'getComputedStyle' ? dom.window.getComputedStyle.bind(dom.window) : dom.window[name] }));
  Object.defineProperty(dom.window, 'innerWidth', { configurable: true, writable: true, value: 440 });
  Object.defineProperty(dom.window, 'innerHeight', { configurable: true, value: 900 });
  Object.defineProperty(dom.window.screen, 'availHeight', { configurable: true, value: 800 });
  Object.defineProperty(dom.window.HTMLElement.prototype, 'offsetHeight', { configurable: true, get() {
    if (this.matches('.float-app')) return 900;
    if (this.matches('.today-board')) return 700;
    if (this.matches('.plan-today')) return 500;
    if (this.matches('.plan-schedule')) return this.querySelector('.plan-folder-body') ? 140 : 40;
    return 0;
  } });
  const heights: number[] = []; let width = 440;
  const now = new Date(); const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const tomorrow = `${nextDay.getFullYear()}-${String(nextDay.getMonth()+1).padStart(2,'0')}-${String(nextDay.getDate()).padStart(2,'0')}`;
  const task = { id: 'meeting', title: '今日会议', kind: 'meeting', status: 'todo', plannedDate: today, dueAt: `${today}T12:00:00`, endAt: `${today}T13:00:00`, deletedAt: null, createdAt: `${today}T00:00:00`, updatedAt: `${today}T00:00:00`, priority: 'medium', note: '', progress: null, remindAt: null, categoryId: null };
  Object.assign(dom.window, { matchMedia: () => ({ matches: true }), workbench: {
    settings: { get: async () => ({ uiTheme: 'mist' }) },
    todo: { state: async () => ({ tasks: [task, { ...task, id: 'tomorrow', title: '明日会议', plannedDate: tomorrow, dueAt: `${tomorrow}T12:00:00`, endAt: `${tomorrow}T13:00:00` }], categories: [] }), onChanged: () => () => {} },
    float: { resize: (height: number) => heights.push(height), width: async (narrow?: boolean) => {
      if (narrow !== undefined) { width = narrow ? 330 : 440; dom.window.innerWidth = width; dom.window.dispatchEvent(new dom.window.Event('resize')); }
      return width;
    } },
    ai: { chatList: async () => [], chatNew: async () => ({ id: 'chat', entries: [] }), onChat: () => () => {}, onAsk: () => () => {}, config: async () => ({ providers: [], models: [] }) },
  } });
  const { FloatTodoApp } = await import('../src/views/FloatTodo'); const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const click = async (selector: string) => act(async () => { (dom.window.document.querySelector(selector) as HTMLElement).click(); await Promise.resolve(); });
  const resize = async () => act(async () => { dom.window.dispatchEvent(new dom.window.Event('resize')); resizeObservers.filter(observer => observer.active).forEach(observer => observer.callback()); });
  try {
    await act(async () => root.render(createElement(FloatTodoApp)));
    assert.equal(heights.at(-1), 740);
    const before = heights.length;
    await click('[aria-label="收窄悬浮窗"]'); await resize(); await resize();
    assert.equal(heights.length, before, 'CSS width-only reflow and repeated ResizeObserver delivery must not resize height');
    await click('.plan-folder-tab');
    assert.equal(heights.at(-1), 840, 'Child-owned openFolder must measure new content without a parent data change');
    await click('.plan-folder-tab'); assert.equal(heights.at(-1), 740);
    await click('[aria-controls="plan-folder-tomorrow"]'); assert.equal(heights.at(-1), 840);
    await click('[aria-controls="plan-folder-tomorrow"]'); assert.equal(heights.at(-1), 740);
    await click('.float-window-actions [aria-label="AI 助手"]');
    assert.equal(resizeObservers.filter(observer => observer.active).length, 0, 'AI mode detaches old home observer');
    await click('.float-window-actions [aria-label="AI 助手"]');
    assert.equal(resizeObservers.filter(observer => observer.active).length, 1, 'Returning home observes the newly mounted schedule');
    await click('[aria-label="加宽悬浮窗"]'); const afterWidth = heights.length; await resize();
    assert.equal(heights.length, afterWidth);
    await click('.plan-folder-tab'); assert.equal(heights.at(-1), 840);
    await click('.plan-folder-tab'); assert.equal(heights.at(-1), 740);
  } finally { await act(async () => root.unmount()); dom.window.close(); names.forEach((name, index) => descriptors[index] ? Object.defineProperty(globalThis, name, descriptors[index]!) : Reflect.deleteProperty(globalThis, name)); }
});
