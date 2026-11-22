import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { act, createElement, useState, type ComponentProps } from 'react';
import { JSDOM } from 'jsdom';
import { newTask, type Task } from '../shared/todo-contracts';
import type { TodoState } from '../shared/workbench-api';
import type { ScheduleTab } from '../modules/todo/ui/CalendarWorkspace';

test('the week grid keeps selection, navigation, task confirmation and the compact board', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: new Date(2026, 10, 14, 12).getTime() });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof typeof dom.window] }));
  const hooks = registerHooks({ load(url, context, next) { return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "fixture-asset";', shortCircuit: true } : next(url, context); } });
  const { createRoot } = await import('react-dom/client');
  const { TodayBoard } = await import('../modules/todo/ui/TodayBoard');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const localTime = (day: string, time: string) => new Date(day + 'T' + time).toISOString();
  const makeTask = (id: string, day: string, start = '14:00', end?: string): Task => ({
    ...newTask(id), id, kind: end ? 'meeting' : 'task', dateAt: localTime(day, start), endAt: end ? localTime(day, end) : null,
    createdAt: localTime(day, start), updatedAt: localTime(day, start), completedAt: null, notifiedFor: null, deletedAt: null,
  });
  const todos = [makeTask('待回复', '2026-11-14', '11:00')];
  const review = makeTask('方案评审', '2026-11-14', '14:00', '15:00');
  const next = makeTask('下周日程', '2026-11-16', '07:00', '08:00');
  const overlap = makeTask('并行讨论', '2026-11-14', '14:15', '14:45');
  const late = makeTask('夜间日程', '2026-11-14', '23:00', '23:55');
  const done = { ...makeTask('已完成的日程', '2026-11-14', '15:00', '16:00'), status: 'done' as const };
  const tasks = [...todos, review, next, overlap, late, done];
  const writes: unknown[][] = [];
  type BoardProps = ComponentProps<typeof TodayBoard>;
  let props: BoardProps = {
    tasks, today: '2026-11-14', categoryById: new Map(), planView: 'rows', mutating: false, toolbar: null,
    api: { create: async () => ({} as TodoState), remove: async () => ({} as TodoState), createCategory: async () => ({} as TodoState),
      update: async (...args) => { writes.push(args); return {} as TodoState; } },
    mutate: async action => { await action(); }, setEditor() {},
  };
  function Workspace(input: BoardProps) {
    const [tab, setTab] = useState<ScheduleTab>('calendar');
    return createElement(TodayBoard, { ...input, workspace: {
      tab, onTab: setTab,
      details: (task, controls) => createElement('span', { 'data-detail-tab': controls.tab }, task.title),
      records: createElement('section', { 'aria-label': '会议记录' }, '纪要目录'),
    } });
  }
  const render = async () => act(async () => root.render(createElement(Workspace, props)));
  const doc = dom.window.document;
  const button = (label: string) => {
    const node = [...doc.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label);
    assert.ok(node, 'Button ' + label);
    return node;
  };
  const click = async (target: HTMLButtonElement | string) => act(async () => (typeof target === 'string' ? button(target) : target).click());
  const chooseView = async (label: string) => {
    await click('日历显示方式');
    const option = doc.querySelector<HTMLElement>(`[role="option"][aria-label="${label}"]`);
    assert.ok(option);
    await act(async () => option.click());
  };
  const block = (id: string) => doc.querySelector<HTMLButtonElement>('.calendar-event[data-task-id="' + id + '"]');
  const dates = () => [...doc.querySelectorAll<HTMLButtonElement>('.calendar-date-headers [data-date]')].map(node => node.dataset.date);
  const hourLabels = () => [...doc.querySelectorAll('.calendar-hours > .calendar-clock > div')].map(node => node.textContent);
  const compressedHours = () => doc.querySelector('.calendar-compressed-hours .calendar-clock')?.textContent;
  const heading = () => doc.querySelector('.calendar-detail h2')?.textContent;
  const pressDateKey = async (date: string, key: string) => act(async () => {
    button(date).dispatchEvent(new dom.window.KeyboardEvent('keydown', { key, bubbles: true }));
    await new Promise(resolve => setTimeout(resolve, 30));
  });

  try {
    await render();
    const pane = doc.querySelector<HTMLElement>('.calendar-detail')!;
    assert.equal(pane.hidden, true);
    assert.equal(heading(), undefined);
    assert.equal(button('日历显示方式').textContent, '周视图');
    const tabs = doc.querySelector('.content-tabs[aria-label="日程待办视图"]');
    assert.ok(tabs);
    assert.deepEqual([...tabs.querySelectorAll('[role="radio"]')].map(tab => tab.textContent), ['日历', '待办', '会议记录']);
    assert.equal(button('日历').getAttribute('aria-checked'), 'true');
    assert.deepEqual([...doc.querySelectorAll('.calendar-pager button')].map(control => control.getAttribute('aria-label')), ['上一周', '选择日历日期', '下一周']);
    assert.deepEqual(dates(), ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15']);
    assert.equal(doc.querySelector('[aria-current="date"]')?.getAttribute('data-date'), props.today);
    assert.equal(compressedHours(), '00:00–07:00');
    assert.equal(hourLabels()[0], '07:00');
    assert.equal(hourLabels().at(-1), '23:00');
    assert.equal(hourLabels().length, 17);
    assert.equal(block(review.id)?.style.getPropertyValue('--event-y'), 7 / 17 * 100 + '%');
    assert.equal(block(late.id)?.style.getPropertyValue('--event-y'), 16 / 17 * 100 + '%');
    assert.equal(block(review.id)?.style.getPropertyValue('--event-width'), '50%');
    assert.equal(block(overlap.id)?.style.getPropertyValue('--event-x'), '50%');
    assert.ok(block(done.id), 'completed local meetings remain available for notes');

    await click(block(review.id)!);
    assert.equal(heading(), review.title);
    assert.equal(doc.querySelector('.calendar-workspace')?.getAttribute('data-detail-open'), 'true');
    const week = dates();
    assert.ok(pane.querySelector('[data-detail-tab="info"]'));
    await click('返回日历');
    assert.equal(pane.hidden, true);
    assert.deepEqual(dates(), week);
    assert.equal(block(review.id)?.getAttribute('aria-pressed'), 'true');

    await click('待办');
    assert.equal(button('待办').getAttribute('aria-checked'), 'true');
    assert.equal(doc.querySelector('.calendar-todos .plan-card-heading')?.textContent, '');
    assert.equal(doc.querySelectorAll('.calendar-todos .todo-card').length, 1);
    assert.match(button('编辑截止时间 待回复').textContent ?? '', /已超期/);
    assert.ok(button('编辑优先级 待回复'));
    assert.ok(button('编辑名称 待回复'));
    await click('完成 待回复');
    assert.deepEqual(writes, []);
    await click('确认完成');
    assert.deepEqual(writes, [[todos[0].id, { status: 'done' }, todos[0].updatedAt]]);
    await click('日历');
    assert.equal(block(review.id)?.getAttribute('aria-pressed'), 'true');
    await act(async () => {
      button('日历').focus();
      button('日历').dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    assert.equal(button('会议记录').getAttribute('aria-checked'), 'true');
    assert.equal(doc.activeElement, button('会议记录'));
    assert.equal(doc.querySelector('[aria-label="会议记录"]')?.textContent, '纪要目录');
    await click('日历');
    assert.equal(block(review.id)?.getAttribute('aria-pressed'), 'true');

    await pressDateKey('2026-11-15', 'ArrowRight');
    assert.equal(dates()[0], '2026-11-16');
    assert.equal(doc.activeElement?.getAttribute('data-date'), '2026-11-16');
    assert.equal(block(next.id)?.style.getPropertyValue('--event-y'), '0%');
    await click('2026-11-16');
    assert.deepEqual(dates(), ['2026-11-16']);
    await click('下一天');
    assert.deepEqual(dates(), ['2026-11-17']);
    assert.equal(doc.querySelector('.calendar-empty'), null);
    assert.equal(doc.querySelectorAll('.calendar-viewport[data-view="day"] .calendar-event').length, 0);
    assert.ok(doc.querySelector('.calendar-viewport[data-view="day"] .calendar-day-column'));
    await chooseView('周视图');
    await click('上一周');
    assert.equal(dates()[0], '2026-11-09');
    await click('选择日历日期');
    await click(doc.querySelector<HTMLButtonElement>(`.date-grid [aria-label="${props.today}"]`)!);
    await chooseView('月视图');
    assert.equal(button('日历显示方式').textContent, '月视图');
    assert.equal(doc.querySelectorAll('.calendar-month-date').length, 42);
    assert.equal(doc.querySelector('.calendar-month-date[aria-current="date"]')?.getAttribute('data-date'), props.today);
    await click(block(next.id)!);
    assert.equal(heading(), next.title);
    await click('下个月');
    assert.match(button('选择日历日期').textContent!, /2026年12月/);
    await click('选择日历日期');
    await click('今天');
    await click('2026-11-30');
    assert.equal(button('日历显示方式').textContent, '日视图');
    assert.deepEqual(dates(), ['2026-11-30']);
    await click('选择日历日期');
    await click('今天');
    assert.deepEqual(dates(), [props.today]);
    await chooseView('周视图');
    props = { ...props, today: '2026-12-31' };
    await render();
    assert.deepEqual(dates().slice(0, 1).concat(dates().slice(-1)), ['2026-12-28', '2027-01-03']);
    assert.match(button('选择日历日期').textContent!, /12月28日.*2027年1月3日/);
    assert.equal(doc.querySelectorAll('.calendar-event').length, 0);
    const todayHeader = doc.querySelector('.calendar-date-headers [aria-current="date"]');
    assert.equal(todayHeader?.querySelector('strong')?.textContent, '31');
    assert.equal(todayHeader?.querySelector('.calendar-today-badge')?.textContent, '31');

    const early = makeTask('晨间日程', '2026-12-31', '06:30', '07:30');
    props = { ...props, tasks: [...tasks, early] };
    await render();
    assert.equal(compressedHours(), '00:00–06:00');
    assert.equal(block(early.id)?.style.getPropertyValue('--event-y'), .5 / 18 * 100 + '%');
    await click('2026-12-31');
    assert.equal(compressedHours(), '00:00–06:00');
    assert.equal(hourLabels()[0], '06:00');
    assert.equal(block(early.id)?.style.getPropertyValue('--event-height'), 1 / 18 * 100 + '%');

    const midnight = makeTask('午夜日程', '2027-01-01', '00:00', '01:00');
    props = { ...props, today: '2027-01-01', tasks: [...tasks, early, midnight] };
    await render();
    assert.equal(compressedHours(), undefined);
    assert.equal(hourLabels()[0], '00:00');
    assert.equal(hourLabels().at(-1), '23:00');
    assert.equal(hourLabels().length, 24);
    assert.equal(block(midnight.id)?.style.getPropertyValue('--event-y'), '0%');

    assert.equal(writes.length, 1, 'view changes do not write to the task store');

    await act(async () => root.render(createElement(TodayBoard, { ...props, today: '2026-11-14' })));
    assert.deepEqual([...doc.querySelectorAll('.today-board > section')].map(node => node.getAttribute('aria-label')), ['待办', '日程']);
    assert.equal(doc.querySelector('.today-board .plan-today h2')?.textContent, '待办');
    assert.equal(doc.querySelector('.today-board .todo-card-list'), null);
    assert.equal(doc.querySelector('.calendar-board'), null);
    assert.ok(doc.querySelector('.plan-folder-tab'));
  } finally {
    await act(async () => root.unmount()); hooks.deregister(); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
