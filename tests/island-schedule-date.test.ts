import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { initialIslandData, type IslandState } from '../shared/island-contracts';
import { localDay, newTask, type Task } from '../shared/todo-contracts';

test('island calendar keeps same-day choices and returns to today across midnight, reopening and wake without interrupting completion', async t => {
  const start = new Date(2026, 10, 13, 23, 59, 58).getTime();
  t.mock.timers.enable({ apis: ['Date', 'setInterval'], now: start });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'ResizeObserver', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  for (const name of names) Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : name === 'ResizeObserver' ? class { observe() {} unobserve() {} disconnect() {} } : dom.window[name as keyof typeof dom.window] });
  Object.defineProperty(dom.window, 'matchMedia', { value: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  dom.window.HTMLElement.prototype.scrollTo = () => {};
  let state: IslandState = { ...initialIslandData(), mode: 'expanded', pinned: true, quiet: false, fullscreenDetection: true };
  state.settings = { ...state.settings, enabled: true, lastPage: 'schedule', reducedMotion: true, hoverPreview: false, pages: { schedule: true, files: false, quota: true, tools: false } };
  const listeners = new Set<(state: IslandState) => void>();
  const taskListeners = new Set<() => void>();
  const tasks: Task[] = ['2026-11-13', '2026-11-14', '2026-12-01', '2027-01-01'].flatMap(day => (['task', 'meeting'] as const).map(kind => ({ ...newTask(`${day} ${kind}`), kind, dateAt: day, id: `${day}-${kind}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, notifiedFor: null, deletedAt: null })));
  const updates: string[] = [];
  let finishUpdate: (() => void) | null = null;
  const emit = () => { for (const listener of listeners) listener(structuredClone(state)); };
  Object.defineProperty(dom.window, 'workbench', { value: {
    island: {
      state: async () => structuredClone(state), onChanged: (callback: (value: IslandState) => void) => { listeners.add(callback); return () => { listeners.delete(callback); }; }, onError: () => () => {},
      quotas: async () => [], quotaRefresh: async () => [], hold() {},
      mode: async (mode: IslandState['mode']) => { state = { ...state, mode }; emit(); },
      patch: async (patch: Partial<IslandState['settings']>) => { state = { ...state, settings: { ...state.settings, ...patch } }; emit(); return structuredClone(state); },
    },
    todo: {
      state: async () => ({ tasks: structuredClone(tasks) }), onChanged: (callback: () => void) => { taskListeners.add(callback); return () => { taskListeners.delete(callback); }; },
      update: (id: string) => new Promise(resolve => { updates.push(id); finishUpdate = () => { const task = tasks.find(task => task.id === id)!; task.status = 'done'; for (const listener of taskListeners) listener(); resolve(task); }; }),
    },
  } });
  const hooks = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "fixture-asset";', shortCircuit: true } : next(url, context); } });
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const doc = dom.window.document;
  const button = (label: string) => { const node = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label); assert.ok(node, `button ${label}`); return node; };
  const click = async (label: string) => act(async () => button(label).click());
  const calendar = () => doc.querySelector<HTMLElement>('.island-calendar')!;
  const selected = () => calendar().querySelector('[aria-pressed="true"]')?.getAttribute('aria-label');
  const expectDate = (day: string) => {
    assert.equal(selected(), day);
    assert.deepEqual([...doc.querySelectorAll('.island-task-title b')].map(node => node.textContent), tasks.filter(task => task.kind === 'task' && task.status !== 'done' && task.dateAt === day).map(task => task.title));
    assert.deepEqual([...doc.querySelectorAll('.island-agenda-item strong')].map(node => node.textContent), tasks.filter(task => task.kind === 'meeting' && task.dateAt === day).map(task => task.title));
  };
  const time = async (value: Date, tick = true) => act(async () => { t.mock.timers.setTime(value.getTime()); if (tick) t.mock.timers.tick(1000); });
  const mode = async (value: IslandState['mode']) => act(async () => { state = { ...state, mode: value }; emit(); });
  const focus = async () => act(async () => { dom.window.dispatchEvent(new dom.window.Event('focus')); });
  try {
    const { DesktopIslandApp } = await import('../src/views/DesktopIsland');
    await act(async () => root.render(createElement(DesktopIslandApp)));
    expectDate('2026-11-13');
    await click('2026-11-18');
    await click('AI 额度'); await click('日程待办');
    await mode('collapsed'); await mode('expanded');
    expectDate('2026-11-18');
    await focus(); expectDate('2026-11-18');
    await time(new Date(2026, 10, 14, 0, 0, 1));
    expectDate('2026-11-18');
    await click('AI 额度'); await click('日程待办');
    expectDate('2026-11-14');

    await click('2026-11-18'); await mode('collapsed');
    await time(new Date(2026, 10, 15, 8), false); await mode('expanded');
    expectDate('2026-11-15');
    await click('2026-11-18');
    await time(new Date(2026, 10, 16, 8), false); await focus();
    expectDate('2026-11-16');
    await click('2026-11-18');
    await time(new Date(2026, 10, 17, 8), false);
    await act(async () => doc.dispatchEvent(new dom.window.Event('visibilitychange')));
    expectDate('2026-11-17');
    await click('2026-11-20');
    await time(new Date(2026, 10, 18, 8), false);
    await act(async () => { state = { ...state, resumeSequence: 1 }; emit(); });
    expectDate('2026-11-18');
    await click('2026-11-20');
    await act(async () => { state = { ...state, resumeSequence: 2 }; emit(); });
    expectDate('2026-11-20');

    await click('回到今天');
    await time(new Date(2026, 11, 1, 0, 0, 1));
    expectDate('2026-12-01');
    assert.match(calendar().querySelector('b')!.textContent!, /2026年12月/);
    await click('上个月');
    await time(new Date(2026, 11, 2, 0, 0, 1));
    assert.match(calendar().querySelector('b')!.textContent!, /2026年11月/, 'manual month browsing is not interrupted');
    await mode('collapsed'); await mode('expanded');
    expectDate('2026-12-02');
    assert.match(calendar().querySelector('b')!.textContent!, /2026年12月/);
    await time(new Date(2027, 0, 1, 0, 0, 1));
    expectDate('2027-01-01');
    assert.match(calendar().querySelector('b')!.textContent!, /2027年1月/);

    await click('完成 2027-01-01 task');
    assert.deepEqual(updates, []);
    await time(new Date(2027, 0, 2, 0, 0, 1));
    expectDate('2027-01-01');
    assert.ok(button('确认完成 2027-01-01 task'));
    await click('确认完成 2027-01-01 task');
    assert.deepEqual(updates, ['2027-01-01-task']);
    expectDate('2027-01-01');
    await act(async () => { finishUpdate!(); });
    expectDate('2027-01-02');

    await click('2027-01-01');
    await mode('collapsed'); await mode('expanded');
    expectDate('2027-01-01');
    await click('上个月'); await click('2026-12-01');
    await click('完成 2026-12-01 task');
    await time(new Date(2027, 0, 3, 8), false); await focus();
    expectDate('2026-12-01');
    await click('取消'); expectDate('2027-01-03');
    assert.equal(calendar().querySelector('[aria-current="date"]')!.getAttribute('aria-label'), localDay());
    assert.equal(doc.querySelector('[aria-label="待办范围"]'), null);
    assert.equal(listeners.size, 1);
  } finally {
    await act(async () => root.unmount()); hooks.deregister(); dom.window.close();
    assert.equal(listeners.size, 0);
    assert.equal(taskListeners.size, 0);
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
