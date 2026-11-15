import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement, type ComponentProps } from 'react';
import { JSDOM } from 'jsdom';
import { newTask, type Task } from '../shared/todo-contracts';
import type { TodoState } from '../shared/workbench-api';

test('workspace day/week navigation filters only schedules, crosses calendar boundaries and preserves task confirmation and compact hosts', async () => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof typeof dom.window] }));
  const hooks = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "fixture-asset";', shortCircuit: true } : next(url, context); } });
  const { createRoot } = await import('react-dom/client');
  const { TodayBoard } = await import('../modules/todo/ui/TodayBoard');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const task = (id: string, day: string, kind: 'task' | 'meeting' = 'task', hour = '14'): Task => ({ ...newTask(id), id, kind, plannedDate: day, dueAt: `${day}T${hour}:00:00+08:00`, endAt: kind === 'meeting' ? `${day}T${hour}:30:00+08:00` : null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedAt: null, notifiedFor: null, deletedAt: null });
  const tasks = [task('today-task', '2026-11-14'), task('past-task', '2026-11-13'), task('future-task', '2026-11-15'), task('today-later', '2026-11-14', 'meeting', '16'), task('today-first', '2026-11-14', 'meeting'), task('tomorrow-meeting', '2026-11-15', 'meeting'), task('month-meeting', '2026-12-01', 'meeting'), task('year-meeting', '2027-01-01', 'meeting'), { ...task('deleted-meeting', '2026-11-14', 'meeting'), deletedAt: new Date().toISOString() }, { ...task('done-meeting', '2026-11-14', 'meeting'), status: 'done' as const }];
  const writes: unknown[][] = [], edits: string[] = [];
  let props: ComponentProps<typeof TodayBoard> = {
    tasks, today: '2026-11-14', categoryById: new Map(), planView: 'rows', mutating: false, variant: 'workspace', toolbar: null,
    api: { create: async () => ({} as TodoState), remove: async () => ({} as TodoState), createCategory: async () => ({} as TodoState), update: async (...args) => { writes.push(args); return {} as TodoState; } },
    mutate: async action => { await action(); }, setEditor: value => { if (value !== 'new') edits.push(value.id); },
  };
  const render = async () => act(async () => root.render(createElement(TodayBoard, props)));
  const doc = dom.window.document;
  const button = (label: string) => { const node = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(node => node.getAttribute('aria-label') === label || node.textContent === label); assert.ok(node, `button ${label}`); return node; };
  const click = async (label: string) => act(async () => button(label).click());
  const selected = () => doc.querySelector('.week-strip [aria-pressed="true"]')?.getAttribute('aria-label');
  const scheduleTitles = () => [...doc.querySelectorAll('.week-agenda-title')].map(node => node.textContent);
  const todoTitles = () => [...doc.querySelectorAll('.plan-today .plan-title b')].map(node => node.textContent);
  const key = async (label: string, key: string) => act(async () => { button(label).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true })); await new Promise(resolve => setTimeout(resolve, 30)); });
  try {
    await render();
    assert.deepEqual([...doc.querySelectorAll('.today-board > section')].map(node => node.getAttribute('aria-label')), ['日程', '待办']);
    assert.deepEqual([...doc.querySelectorAll('.week-strip button')].map(node => node.getAttribute('aria-label')), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    assert.deepEqual(scheduleTitles(), ['today-first', 'today-later']);
    assert.match(doc.querySelector('.week-schedule-toolbar .select-trigger')!.textContent!, /2026年11月14日/);
    assert.equal(doc.querySelector('.week-schedule-actions'), null);
    const todos = todoTitles(); assert.deepEqual(new Set(todos), new Set(['today-task', 'past-task', 'future-task']));
    await click('编辑 today-first'); assert.deepEqual(edits, ['today-first']);
    await click('完成 today-task'); assert.deepEqual(writes, []);
    await click('2026-11-15'); assert.deepEqual(scheduleTitles(), ['tomorrow-meeting']);
    assert.deepEqual(todoTitles(), todos); assert.ok(button('取消完成 today-task'));
    await click('确认完成');
    assert.deepEqual(writes, [['today-task', { status: 'done' }, tasks[0].updatedAt]]);
    await key('2026-11-15', 'ArrowRight'); assert.equal(selected(), '2026-11-16');
    await key('2026-11-16', 'ArrowLeft'); assert.equal(selected(), '2026-11-15');
    await click('周');
    assert.deepEqual(scheduleTitles(), ['today-first', 'today-later', 'tomorrow-meeting']);
    assert.equal(doc.querySelectorAll('.week-agenda-day').length, 7);
    assert.deepEqual(todoTitles(), todos);
    for (let index = 0; index < 7; index++) await key(selected()!, 'ArrowRight');
    assert.equal(selected(), '2026-11-22');
    assert.deepEqual([...doc.querySelectorAll('.week-strip button')].map(node => node.textContent!.slice(-2)), ['16', '17', '18', '19', '20', '21', '22']);
    assert.deepEqual(scheduleTitles(), []); assert.match(doc.querySelector('.week-schedule-body')!.textContent!, /这一周没有日程/);
    for (let index = 0; index < 7; index++) await key(selected()!, 'ArrowLeft');
    assert.equal(selected(), '2026-11-15');
    await click('查看 2026-11-14 的日程'); assert.equal(selected(), '2026-11-14');
    assert.equal(doc.querySelector('[role="radio"][aria-checked="true"]')?.textContent, '日');
    await click('2026-11-15');
    await key('2026-11-15', 'ArrowRight'); assert.equal(selected(), '2026-11-16');
    assert.equal(doc.activeElement?.getAttribute('aria-label'), '2026-11-16');
    await key('2026-11-16', 'End'); assert.equal(selected(), '2026-11-22');
    await key('2026-11-22', 'Home'); assert.equal(selected(), '2026-11-16');
    await key('2026-11-16', 'ArrowLeft'); await click('2026-11-14'); assert.equal(selected(), '2026-11-14');
    await act(async () => (doc.querySelector('.week-next-day') as HTMLButtonElement).click());
    assert.equal(selected(), '2026-11-15'); assert.deepEqual(scheduleTitles(), ['tomorrow-meeting']);

    await click('2026-11-14'); props = { ...props, today: '2026-11-30' }; await render();
    assert.equal(selected(), '2026-11-30');
    await key('2026-11-30', 'ArrowRight'); assert.equal(selected(), '2026-12-01');
    assert.deepEqual(scheduleTitles(), ['month-meeting']);
    await click('2026-11-30'); props = { ...props, today: '2026-12-31' }; await render();
    await key('2026-12-31', 'ArrowRight'); assert.equal(selected(), '2027-01-01');
    assert.match(doc.querySelector('.week-schedule-toolbar .select-trigger')!.textContent!, /2027年1月1日/);
    assert.deepEqual(scheduleTitles(), ['year-meeting']);
    await key('2027-01-01', 'ArrowLeft'); assert.equal(selected(), '2026-12-31');
    await click('周'); assert.match(doc.querySelector('.week-schedule-list-heading')!.textContent!, /2026年12月28日.*2027年1月3日/);

    props = { ...props, todoContent: createElement('section', { 'aria-label': '事项库' }, '原事项库') }; await render();
    assert.ok(doc.querySelector('.plan-today [aria-label="事项库"]'));
    for (let index = 0; index < 7; index++) await key(selected()!, 'ArrowLeft');
    assert.equal(selected(), '2026-12-24');
    assert.ok(doc.querySelector('.plan-today [aria-label="事项库"]'));
    props = { ...props, todoContent: undefined }; await render(); assert.equal(selected(), '2026-12-24');
    assert.ok(todoTitles().length > 0);
    assert.equal(writes.length, 1, 'date browsing does not write tasks');

    props = { ...props, variant: 'compact', today: '2026-11-14' }; await render();
    assert.deepEqual([...doc.querySelectorAll('.today-board > section')].map(node => node.getAttribute('aria-label')), ['待办', '日程']);
    assert.equal(doc.querySelector('.week-strip'), null); assert.ok(doc.querySelector('.plan-folder-tab'));
  } finally {
    await act(async () => root.unmount()); hooks.deregister(); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
