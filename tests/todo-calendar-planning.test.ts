import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { act, createElement, useState } from 'react';
import { JSDOM } from 'jsdom';
import { Store } from '../modules/todo/store';
import { newTask, type ScheduledTime, type Task } from '../shared/todo-contracts';
import type { TodoState } from '../shared/workbench-api';
import type { ScheduleTab } from '../modules/todo/ui/CalendarWorkspace';

const day = '2026-11-20';
const at = (clock: string, date = day) => new Date(date + 'T' + clock).toISOString();
const scheduledTime = { startAt: at('14:00'), endAt: at('15:00') };

test('arranging, completing and clearing a task preserve its deadline and reminder', () => {
  const store = new Store(':memory:');
  try {
    const dateAt = at('18:00'), remindAt = at('17:45');
    const task = store.create({ ...newTask('写周报'), dateAt, remindAt });
    const booked = store.update(task.id, { scheduledTime }, task.updatedAt);
    assert.deepEqual(booked.scheduledTime, scheduledTime);
    assert.equal(booked.dateAt, dateAt);
    assert.equal(booked.remindAt, remindAt);
    assert.throws(() => store.update(task.id, { scheduledTime: null }, task.updatedAt), /已在其他操作中更新/);
    assert.throws(() => store.update(task.id, { scheduledTime: { startAt: at('15:00'), endAt: at('14:00') } }), /安排结束时间/);
    assert.throws(() => store.update(task.id, { scheduledTime: { startAt: at('15:00'), endAt: at('01:00', '2026-11-21') } }), /同一天/);
    const done = store.update(task.id, { status: 'done' }, booked.updatedAt);
    assert.deepEqual(done.scheduledTime, scheduledTime);
    const allDay = store.update(done.id, { scheduledTime: { date: day } }, done.updatedAt);
    assert.deepEqual(store.get(done.id).scheduledTime, { date: day });
    assert.equal(allDay.dateAt, dateAt);
    assert.throws(() => store.update(done.id, { scheduledTime: { date: '2026-02-30' } }, allDay.updatedAt));
    const cleared = store.update(done.id, { scheduledTime: null }, allDay.updatedAt);
    assert.equal(cleared.scheduledTime, null);
    assert.equal(cleared.dateAt, dateAt);
    assert.equal(cleared.remindAt, remindAt);
    assert.equal(cleared.status, 'done');
  } finally { store.close(); }
});

test('local events persist attendees, location and meeting link independently', () => {
  const store = new Store(':memory:');
  try {
    const input = { ...newTask('项目例会'), kind: 'meeting', dateAt: at('15:00'), endAt: at('16:00') };
    assert.throws(() => store.create({ ...input, meetingUrl: 'ftp://example.com' }), /会议链接/);
    const meeting = store.create({ ...input, attendees: '林同学、dev@example.com', location: '三楼会议室', meetingUrl: 'https://example.com/meeting' });
    store.update(meeting.id, { note: '确认交付清单' }, meeting.updatedAt);
    assert.equal(store.get(meeting.id).location, '三楼会议室');
    assert.equal(store.get(meeting.id).meetingUrl, 'https://example.com/meeting');
    assert.equal(store.get(meeting.id).attendees, '林同学、dev@example.com');
    const allDay = store.update(meeting.id, { dateAt: day, endAt: null }, store.get(meeting.id).updatedAt);
    assert.equal(allDay.dateAt, day);
    assert.equal(allDay.endAt, null);
    assert.equal(allDay.attendees, meeting.attendees);
    assert.throws(() => store.create({ ...newTask('缺少时间'), kind: 'meeting' }), /日程时间/);
  } finally { store.close(); }
});

test('calendar schedules and completes the same task that appears in the todo list', async t => {
  const store = new Store(':memory:');
  const report = store.create({ ...newTask('写周报'), dateAt: at('18:00') });
  const delivery = store.create({ ...newTask('整理交付材料'), scheduledTime: { date: day }, dateAt: '2026-11-21' });
  const reserved = store.create({ ...newTask('预留时间'), scheduledTime: { date: day } });
  const meeting = store.create({ ...newTask('项目例会'), kind: 'meeting', dateAt: at('15:00'), endAt: at('16:00') });
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  t.after(() => { dom.window.close(); store.close(); });
  const globals = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame'] as const;
  const replace = (name: string, value: unknown) => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => { if (previous) Object.defineProperty(globalThis, name, previous); else Reflect.deleteProperty(globalThis, name); });
  };
  globals.forEach(name => replace(name, dom.window[name]));
  replace('IS_REACT_ACT_ENVIRONMENT', true);
  replace('ResizeObserver', class { observe() {} disconnect() {} });
  const hooks = registerHooks({ load(url, context, next) {
    return /\.(css|svg|png)$/.test(url) ? { format: 'module', source: 'export default "fixture";', shortCircuit: true } : next(url, context);
  } });
  t.after(() => hooks.deregister());
  const { createRoot } = await import('react-dom/client');
  const { TodayBoard } = await import('../modules/todo/ui/TodayBoard');
  const doc = dom.window.document;
  const root = createRoot(doc.getElementById('root')!);
  const creates: { kind: Task['kind']; time?: ScheduledTime }[] = [];
  const state = (): TodoState => ({ tasks: store.all(), categories: store.categories() } as TodoState);
  function Board() {
    const [tasks, setTasks] = useState(store.all());
    const [tab, setTab] = useState<ScheduleTab>('calendar');
    return createElement(TodayBoard, {
      tasks, today: day, categoryById: new Map(), planView: 'rows', mutating: false, toolbar: null, setEditor() {},
      mutate: async action => { setTasks((await action()).tasks); },
      api: { create: async () => state(), remove: async () => state(), createCategory: async () => state(),
        update: async (id, patch, revision) => { store.update(id, patch, revision); return state(); } },
      workspace: { tab, onTab: setTab, details: () => null, createItem: (kind, time) => { creates.push({ kind, time }); } },
    });
  }
  const button = (label: string, area: ParentNode = doc) => {
    const node = [...area.querySelectorAll<HTMLButtonElement>('button')].find(candidate => candidate.textContent?.trim() === label);
    assert.ok(node, label);
    return node;
  };
  const click = async (target: HTMLElement) => act(async () => target.click());
  const block = (task: Task) => doc.querySelector<HTMLButtonElement>('.calendar-event[data-task-id="' + task.id + '"]');
  try {
    await act(async () => root.render(createElement(Board)));
    assert.doesNotMatch(doc.querySelector('.calendar-toolbar-actions')!.textContent ?? '', /待安排/);
    assert.equal(block(report), null, 'a deadline alone does not occupy a time slot');
    assert.equal(block(meeting)?.dataset.kind, 'meeting');
    assert.equal(block(meeting)?.querySelector('.calendar-event-time')?.textContent, '15:00–16:00');
    const pane = doc.querySelector('.calendar-detail')!;
    const entries = () => [...doc.querySelectorAll<HTMLButtonElement>('.calendar-event[data-task-id="' + delivery.id + '"]')];
    const [arrangement, deadline] = entries();
    assert.equal(entries().length, 2);
    assert.equal(arrangement.parentElement?.dataset.date, day);
    assert.equal(arrangement.dataset.deadline, undefined);
    assert.equal(deadline.parentElement?.dataset.date, '2026-11-21');
    assert.equal(deadline.dataset.deadline, 'true');
    assert.ok(entries().every(entry => !entry.classList.contains('is-timed')));
    await click(arrangement);
    assert.equal(pane.querySelector('h2')?.textContent, delivery.title);
    assert.match(pane.textContent ?? '', /安排时段.*全天.*完成期限/);
    await click(button('返回周历', pane));
    await click(deadline);
    assert.equal(pane.querySelector('h2')?.textContent, delivery.title);
    assert.equal(deadline.getAttribute('aria-pressed'), 'true');
    await click(button('标记完成', pane));
    await click(button('确认完成', pane));
    assert.equal(store.get(delivery.id).status, 'done');
    assert.ok(entries().every(entry => entry.dataset.completed === 'true'));
    await click(button('返回周历', pane));
    await click(block(reserved)!);
    await click(button('调整时段', pane));
    await click(pane.querySelector<HTMLButtonElement>('button[aria-label="移除安排"]')!);
    await click(button('保存安排', pane));
    assert.equal(store.get(reserved.id).scheduledTime, null);
    await click(button('返回待安排', pane));
    const column = doc.querySelector<HTMLElement>('.calendar-day-column[data-today="true"]')!;
    column.getBoundingClientRect = () => ({ top: 0, height: 1700 }) as DOMRect;
    const data = new Map<string, string>();
    const transfer = { setData: (type: string, value: string) => data.set(type, value), getData: (type: string) => data.get(type),
      get types() { return [...data.keys()]; } };
    const drag = (type: string, clientY = 0) => {
      const event = new dom.window.MouseEvent(type, { bubbles: true, cancelable: true, clientY });
      Object.defineProperty(event, 'dataTransfer', { value: transfer });
      return event;
    };
    await act(async () => button('写周报', pane).dispatchEvent(drag('dragstart')));
    await act(async () => column.dispatchEvent(drag('dragover', 701)));
    assert.ok(column.querySelector('.calendar-drop-slot'));
    await act(async () => column.dispatchEvent(drag('drop', 701)));
    assert.deepEqual(store.get(report.id).scheduledTime, scheduledTime);
    assert.equal(store.get(report.id).dateAt, at('18:00'));
    assert.equal(block(report)?.dataset.kind, 'task');
    assert.equal(pane.getAttribute('aria-label'), '待办详情');
    assert.match(pane.textContent ?? '', /完成期限/);
    await click(button('标记完成', pane));
    await click(button('确认完成', pane));
    assert.equal(store.get(report.id).status, 'done');
    assert.equal(block(report)?.dataset.completed, 'true');
    assert.doesNotMatch(doc.querySelector('.calendar-todos')?.textContent ?? '', /写周报/);
    await click(button('恢复待办', pane));
    assert.match(doc.querySelector('.calendar-todos')?.textContent ?? '', /写周报/);
    await act(async () => column.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, clientY: 601 })));
    await click(button('新增', doc.querySelector('[aria-label="日历工具栏"]')!));
    assert.deepEqual(creates, [
      { kind: 'meeting', time: { startAt: at('13:00'), endAt: at('14:00') } },
      { kind: 'meeting', time: undefined },
    ]);
  } finally { await act(async () => root.unmount()); }
});
