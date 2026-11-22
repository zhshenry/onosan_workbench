import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, CaretLeft, CaretRight, CheckSquare, FileText, Square, Target } from '@phosphor-icons/react';
import { hasTaskTime, localDay, scheduledDay, type ScheduledTime, type Task, type TimedSchedule } from '../../../shared/todo-contracts';
import { dateText, dateTimeText, meetingEndAt, scheduleStamp, scheduledInRange, scheduleTimeRange, timeText } from '../../../shared/todo-format';
import { DatePicker, Segmented, Select, errorText } from './ui';
import type { TaskEditHandle } from './TaskEditor';
import { CalendarTodoDetails, TaskCreateButton, defaultScheduledTime } from './TaskScheduling';
import './calendar-workspace.css';

export type ScheduleTab = 'calendar' | 'todo' | 'records';
export type ScheduleDetailTab = 'info' | 'materials' | 'actions';

export interface ScheduleDetailRequest {
  taskId: string;
  tab: ScheduleDetailTab;
  source: 'calendar' | 'records';
  returnTo?: 'todo';
  trigger: HTMLElement | null;
}

export interface ScheduleDetailControls {
  tab: ScheduleDetailTab;
  onTab(tab: ScheduleDetailTab): void;
}

export interface ScheduleNavigation {
  tab: ScheduleTab;
  onTab(tab: ScheduleTab): void;
  leaveDetails?(navigate: () => void): void;
  workspaceHeader?: HTMLElement | null;
  calendarActions?: ReactNode;
  createItem?(kind: Task['kind'], time?: TimedSchedule): void;
  taskEditHandle?: RefObject<TaskEditHandle | null>;
  editForm?: ReactNode;
  headerActions?: ReactNode;
  details(task: Task, controls: ScheduleDetailControls): ReactNode;
  detailRequest?: ScheduleDetailRequest | null;
  records?: ReactNode | ((openRecord: (task: Task) => void, activeId?: string) => ReactNode);
}


export function ScheduleInfo({ category, remindAt, note }: { category?: string; remindAt: Task['remindAt']; note?: string }) {
  return <>
    {(category || remindAt) && <dl className="calendar-detail-fields">
      {category && <><dt>标签</dt><dd>{category}</dd></>}
      {remindAt && <><dt>提醒</dt><dd><time dateTime={remindAt}>{dateTimeText(remindAt)}</time></dd></>}
    </dl>}
    {note?.trim() && <section className="calendar-detail-section"><h3>日程说明</h3><p>{note}</p></section>}
  </>;
}

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const scheduleTabs = [
  { value: 'calendar', label: '日历', icon: <CalendarBlank size={16} aria-hidden="true" /> },
  { value: 'todo', label: '待办', icon: <CheckSquare size={16} aria-hidden="true" /> },
  { value: 'records', label: '会议记录', icon: <FileText size={16} aria-hidden="true" /> },
];
const viewLabels = {
  month: { label: '月视图', previous: '上个月', next: '下个月', region: '月历' },
  week: { label: '周视图', previous: '上一周', next: '下一周', region: '周历' },
  day: { label: '日视图', previous: '上一天', next: '下一天', region: '单日日历' },
} as const;
type CalendarView = keyof typeof viewLabels;
const calendarModes = Object.entries(viewLabels).map(([value, { label }]) => ({ value, label }));
const hoursPerDay = 24;
const minutesPerDay = hoursPerDay * 60;
const monthPreviewLimit = 3;
const taskDragType = 'application/x-workbench-unscheduled-task';

function shiftDay(day: string, days: number) {
  const date = new Date(day + 'T12:00:00');
  date.setDate(date.getDate() + days);
  return localDay(date);
}

function shiftMonth(day: string, months: number) {
  const date = new Date(day + 'T12:00:00');
  const dayOfMonth = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  date.setDate(Math.min(dayOfMonth, new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()));
  return localDay(date);
}

function monthDates(first: string, last: string) {
  const leading = (new Date(first + 'T12:00:00').getDay() + 6) % 7;
  const cells = Math.ceil((leading + Number(last.slice(-2))) / 7) * 7;
  return Array.from({ length: cells }, (_, index) => shiftDay(first, index - leading));
}

function calendarDateText(day: string) {
  return Number(day.slice(5, 7)) + '月' + Number(day.slice(-2)) + '日';
}

function shortCalendarDate(day: string) {
  return `${Number(day.slice(5, 7))}/${Number(day.slice(-2))}`;
}

function meetingStamp(task: Task) {
  if (!hasTaskTime(task.dateAt) || !task.endAt) return scheduleStamp(task);
  const start = localDay(new Date(task.dateAt));
  if (task.external?.isAllDay) {
    const lastDay = localDay(new Date(Date.parse(task.endAt) - 1));
    return start === lastDay ? scheduleStamp(task) : dateText(start) + '—' + dateText(lastDay) + ' · 全天';
  }
  return start === localDay(new Date(task.endAt)) ? scheduleStamp(task) : dateTimeText(task.dateAt) + ' — ' + dateTimeText(task.endAt);
}

function minutesAt(time: number) {
  const date = new Date(time);
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function hourLabel(hour: number) {
  return String(hour).padStart(2, '0') + ':00';
}

type TimeBlock = { task: Task; start: number; end: number; drawnEnd: number; lane: number; lanes: number };

function calendarRange(task: Task) {
  if (task.kind === 'meeting') return task;
  const schedule = task.scheduledTime;
  if (!schedule) return { dateAt: null, endAt: null };
  return 'date' in schedule ? { dateAt: schedule.date, endAt: null } : { dateAt: schedule.startAt, endAt: schedule.endAt };
}

function calendarDay(day: string, items: Task[]) {
  const allDay: Task[] = [];
  const deadlines: Task[] = [];
  const blocks: TimeBlock[] = [];
  const dayStart = Date.parse(day + 'T00:00:00');
  const nextStart = Date.parse(shiftDay(day, 1) + 'T00:00:00');

  for (const task of items) {
    if (task.kind === 'task' && task.dateAt === day) deadlines.push(task);
    const range = calendarRange(task);
    if (!scheduledInRange(range, day)) continue;
    const endAt = task.kind === 'task' ? range.endAt : meetingEndAt(task);
    if (task.external?.isAllDay || !hasTaskTime(range.dateAt) || !endAt) {
      allDay.push(task);
      continue;
    }
    const start = Date.parse(range.dateAt) <= dayStart ? 0 : minutesAt(Date.parse(range.dateAt));
    const end = Date.parse(endAt) >= nextStart ? minutesPerDay : minutesAt(Date.parse(endAt));
    // Short meetings still get a readable title, so the extra height counts toward overlap.
    const drawnEnd = Math.min(minutesPerDay, Math.max(end, start + 36));
    blocks.push({ task, start, end, drawnEnd, lane: 0, lanes: 1 });
  }

  blocks.sort((a, b) => a.start - b.start || b.end - a.end);
  let cluster: TimeBlock[] = [], laneEnds: number[] = [];
  function finishCluster() {
    for (const block of cluster) block.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  }
  for (const block of blocks) {
    if (laneEnds.every(end => end <= block.start)) finishCluster();
    const lane = laneEnds.findIndex(end => end <= block.start);
    block.lane = lane < 0 ? laneEnds.length : lane;
    laneEnds[block.lane] = block.drawnEnd;
    cluster.push(block);
  }
  finishCluster();
  return { day, allDay, deadlines, blocks };
}

type MeetingSource = { meetings: Task[]; mergeMeetings?(items: Task[]): Task[] };
interface CalendarTodos {
  items: Task[];
  save(task: Task, time: ScheduledTime | null): Promise<void>;
  completion(task: Task): ReactNode;
}

export function CalendarWorkspace({ tab, onTab, leaveDetails = navigate => navigate(), workspaceHeader, calendarActions, createItem, taskEditHandle, editForm, headerActions, details, records, detailRequest, meetings, mergeMeetings, today, todo, calendarTodos }: ScheduleNavigation & MeetingSource & {
  today: string; todo: ReactNode; calendarTodos: CalendarTodos;
}) {
  const [view, setView] = useState<CalendarView>('week');
  const [headerFitsToolbar, setHeaderFitsToolbar] = useState(false);
  useLayoutEffect(() => {
    if (!workspaceHeader) return;
    const observer = new ResizeObserver(([entry]) => setHeaderFitsToolbar(entry.contentRect.width >= 820));
    observer.observe(workspaceHeader);
    return () => observer.disconnect();
  }, [workspaceHeader]);
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [selection, setSelection] = useState<{ id: string; day: string; deadline?: boolean } | null>(null);
  const [detailMode, setDetailMode] = useState<'calendar' | 'details'>('calendar');
  const [reader, setReader] = useState<ScheduleDetailRequest | null>(null);
  const [waiting, setWaiting] = useState(false);
  const [waitingId, setWaitingId] = useState<string | null>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ day: string; minute: number } | null>(null);
  const [dropError, setDropError] = useState('');
  const todoEditor = useRef<TaskEditHandle>(null);
  const heading = useRef<HTMLHeadingElement>(null), back = useRef<HTMLButtonElement>(null);
  const recordsPane = useRef<HTMLDivElement>(null);
  const dateHeaders = useRef<HTMLDivElement>(null);
  const viewport = useRef<HTMLDivElement>(null), returnScroll = useRef(0);
  const detailPane = useRef<HTMLElement>(null);
  const detailId = useId();
  const periodId = useId();
  const active = tab === 'calendar';
  const labels = viewLabels[view];
  const day = pickedDay ?? today;
  const date = new Date(day + 'T12:00:00');
  const weekDay = (date.getDay() + 6) % 7;
  const week = weekdays.map((_, index) => shiftDay(day, index - weekDay));
  const monthStart = day.slice(0, 7) + '-01';
  const monthEnd = shiftDay(shiftMonth(monthStart, 1), -1);
  const start = view === 'month' ? monthStart : view === 'week' ? week[0] : day;
  const through = view === 'month' ? monthEnd : view === 'week' ? week[6] : day;
  const days = view === 'month' ? monthDates(start, through) : view === 'week' ? week : [day];
  const inRange = meetings.filter(task => scheduledInRange(task, start, through));
  const visibleMeetings = mergeMeetings?.(inRange) ?? inRange;
  const visibleTodos = calendarTodos.items.filter(task => {
    const date = task.dateAt;
    return (date && !hasTaskTime(date) && date >= start && date <= through)
      || scheduledInRange(calendarRange(task), start, through);
  });
  const waitingTodos = calendarTodos.items.filter(task => task.status !== 'done' && !task.scheduledTime);
  const calendarItems = [...visibleMeetings, ...visibleTodos];
  const columns = days.map(value => calendarDay(value, value < start || value > through ? [] : calendarItems));
  const visible = columns.flatMap(column => [...column.allDay, ...column.deadlines, ...column.blocks.map(block => block.task)]
    .map(task => ({ day: column.day, task })));
  const selected = visible.find(entry => entry.task.id === selection?.id && entry.day === selection.day);
  const currentReader = reader?.source === tab ? reader : null;
  const expanded = currentReader !== null;
  const readerTask = currentReader && (visibleMeetings.find(task => task.id === currentReader.taskId)
    ?? mergeMeetings?.(meetings).find(task => task.id === currentReader.taskId)
    ?? meetings.find(task => task.id === currentReader.taskId));
  const waitingTask = waitingId && waitingTodos.find(task => task.id === waitingId);
  const detailTask = expanded ? readerTask : waiting ? waitingTask || undefined : detailMode === 'details' ? selected?.task : undefined;
  const detailOpen = expanded || (active && (waiting || !!detailTask));
  const detailTaskId = detailTask?.id;
  useLayoutEffect(() => { if (detailPane.current) detailPane.current.scrollTop = 0; }, [detailTaskId, expanded]);
  useLayoutEffect(() => {
    setReader(current => current && current.source !== tab ? null : current);
  }, [tab]);
  useLayoutEffect(() => {
    if (detailRequest) showReader(detailRequest);
  }, [detailRequest]);
  const hasAllDay = columns.some(column => column.allDay.length || column.deadlines.length);
  let firstHour = 7;
  for (const { blocks } of columns) {
    const first = blocks[0];
    if (first) firstHour = Math.min(firstHour, Math.floor(first.start / 60));
  }
  const hours = Array.from({ length: hoursPerDay - firstHour }, (_, index) => firstHour + index);
  const end = week[6];
  const sameMonth = week[0].slice(0, 7) === end.slice(0, 7);
  const sameYear = week[0].slice(0, 4) === end.slice(0, 4);
  const rangeEnd = sameMonth ? Number(end.slice(-2)) + '日' : calendarDateText(end);
  const range = view === 'month' ? `${date.getFullYear()}年${date.getMonth() + 1}月`
    : view === 'week' ? calendarDateText(week[0]) + '—' + (sameYear ? '' : end.slice(0, 4) + '年') + rangeEnd
    : calendarDateText(day) + ' 周' + weekdays[weekDay];
  const compactRange = view === 'month' ? `${date.getFullYear()}/${date.getMonth() + 1}`
    : view === 'week' ? shortCalendarDate(week[0]) + '—' + (sameMonth ? Number(end.slice(-2)) : shortCalendarDate(end))
    : shortCalendarDate(day) + ' 周' + weekdays[weekDay];

  function leaveCalendarDetails(navigate: () => void) {
    leaveDetails(() => {
      if (!taskEditHandle && todoEditor.current) todoEditor.current.leave(navigate);
      else navigate();
    });
  }
  async function saveSchedule(task: Task, time: ScheduledTime | null) {
    await calendarTodos.save(task, time);
    if (time) {
      const next = scheduledDay(time);
      setWaiting(false);
      setWaitingId(null);
      setSelection({ id: task.id, day: next });
      setDetailMode('details');
      if (next < start || next > through) setPickedDay(next);
    } else {
      setWaiting(true);
      setWaitingId(task.status === 'done' ? null : task.id);
    }
  }
  function slotMinute(column: HTMLElement, clientY: number) {
    const rect = column.getBoundingClientRect();
    if (rect.height <= 0) return firstHour * 60;
    const offset = Math.floor((clientY - rect.top) / rect.height * hours.length * 2) * 30;
    return firstHour * 60 + Math.max(0, Math.min(hours.length * 60 - 30, offset));
  }
  function slotTime(date: string, minute: number) {
    return defaultScheduledTime(date, Math.floor(minute / 60), minute % 60);
  }
  function clearDrag() {
    setDraggedId(null);
    setDropTarget(null);
  }
  function moveTo(value: string, afterMove?: () => void) {
    leaveCalendarDetails(() => {
      setPickedDay(value === today ? null : value);
      setSelection(null);
      setReader(null);
      setWaiting(false);
      setWaitingId(null);
      setDetailMode('calendar');
      if (viewport.current) viewport.current.scrollTop = 0;
      afterMove?.();
    });
  }
  function changeView(value: CalendarView) {
    leaveCalendarDetails(() => {
      setView(value);
      setReader(null);
      setWaiting(false);
      setWaitingId(null);
      setDetailMode('calendar');
      if (viewport.current) viewport.current.scrollTop = 0;
    });
  }
  function movePeriod(direction: number) {
    moveTo(view === 'month' ? shiftMonth(day, direction) : shiftDay(day, direction * (view === 'week' ? 7 : 1)));
  }
  function openDay(value: string) {
    moveTo(value, () => {
      setView('day');
      requestAnimationFrame(() => dateHeaders.current?.querySelector<HTMLButtonElement>('[data-date="' + value + '"]')?.focus());
    });
  }
  function moveDateByKey(event: KeyboardEvent<HTMLButtonElement>, value: string, index: number) {
    const offsets: Record<string, number | undefined> = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: 6 - index,
      ArrowUp: view === 'month' ? -7 : undefined, ArrowDown: view === 'month' ? 7 : undefined };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = shiftDay(value, offset);
    moveTo(next, () => requestAnimationFrame(() => dateHeaders.current?.querySelector<HTMLButtonElement>('[data-date="' + next + '"]')?.focus()));
  }
  function openDetail(task: Task, value: string, trigger: HTMLButtonElement, deadline: boolean) {
    leaveCalendarDetails(() => {
      setSelection({ id: task.id, day: value, deadline });
      if (task.kind === 'meeting') {
        showReader({ taskId: task.id, source: 'calendar', tab: 'info', trigger });
        return;
      }
      returnScroll.current = viewport.current?.scrollTop ?? 0;
      setReader(null);
      setWaiting(false);
      setWaitingId(null);
      setDetailMode('details');
      requestAnimationFrame(() => {
        if (back.current?.getClientRects().length) heading.current?.focus({ preventScroll: true });
      });
    });
  }
  function showReader(request: ScheduleDetailRequest) {
    const origin = request.source === 'records' ? recordsPane.current : viewport.current;
    if (origin?.getClientRects().length) returnScroll.current = origin.scrollTop;
    setReader(request);
    setWaiting(false);
    setWaitingId(null);
    requestAnimationFrame(() => {
      if (!detailPane.current?.contains(document.activeElement)) heading.current?.focus({ preventScroll: true });
    });
  }
  function openRecord(task: Task) {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaveCalendarDetails(() => showReader({ taskId: task.id, source: 'records', tab: 'materials', trigger }));
  }
  function changeDetailTab(panel: ScheduleDetailTab) {
    setReader(current => current && { ...current, tab: panel });
  }
  function backToSource() {
    leaveCalendarDetails(() => {
      if (waitingTask) {
        setWaitingId(null);
        requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
        return;
      }
      setReader(null);
      setWaiting(false);
      setWaitingId(null);
      setDetailMode('calendar');
      requestAnimationFrame(() => {
        const origin = currentReader?.source === 'records' ? recordsPane.current : viewport.current;
        if (origin) origin.scrollTop = returnScroll.current;
        const selectedEvent = viewport.current?.querySelector<HTMLButtonElement>('.calendar-event[aria-pressed="true"]');
        const target = [currentReader?.trigger, selectedEvent].find(item => item?.isConnected && item.getClientRects().length);
        (target ?? origin)?.focus({ preventScroll: true });
      });
    });
  }

  function event(task: Task, value: string, block?: TimeBlock, deadline = false) {
    const minutes = hours.length * 60;
    const isTodo = task.kind === 'task';
    const itemType = isTodo ? '待办' : '日程';
    let timing: string;
    let timeBadge = '';
    if (deadline) {
      timing = '截止日期 ' + calendarDateText(value);
    } else if (block) {
      const range = calendarRange(task);
      const startLabel = block.start === 0 ? '00:00' : timeText(range.dateAt);
      const endLabel = block.end === minutesPerDay ? '24:00' : timeText(range.endAt ?? meetingEndAt(task));
      timing = startLabel + '–' + endLabel;
      if (view === 'month' || block.end - block.start >= 60) timeBadge = view === 'month' ? startLabel : timing;
    } else {
      timing = isTodo ? '全天' : scheduleTimeRange(task);
    }
    const Icon = deadline ? Target : isTodo ? task.status === 'done' ? CheckSquare : Square : CalendarBlank;
    const area = block && view !== 'month' ? {
      '--event-y': (block.start - firstHour * 60) / minutes * 100 + '%',
      '--event-height': (block.drawnEnd - block.start) / minutes * 100 + '%',
      '--event-x': block.lane / block.lanes * 100 + '%',
      '--event-width': 100 / block.lanes + '%',
    } as CSSProperties : undefined;
    return <button key={deadline ? task.id + ':deadline' : task.id} type="button" style={area}
      className={area ? 'calendar-event is-timed' : 'calendar-event'}
      data-task-id={task.id} data-kind={task.kind} data-deadline={deadline || undefined} data-completed={isTodo && task.status === 'done' || undefined} aria-controls={detailId}
      aria-label={'查看' + itemType + ' ' + task.title + '，' + timing + (isTodo && task.status === 'done' ? '，已完成' : '')}
      aria-pressed={!waiting && task.id === selected?.task.id && value === selected.day && deadline === !!selection?.deadline}
      title={task.title + ' · ' + timing}
      onClick={event => openDetail(task, value, event.currentTarget, deadline)}>
      <span className="calendar-event-title">
        <Icon className="calendar-event-source" size="1em" aria-hidden="true" />
        {deadline && <span className="calendar-deadline-label">截止</span>}<span>{task.title}</span>
      </span>
      {timeBadge && <span className="calendar-event-time">{timeBadge}</span>}
    </button>;
  }
  const calendar = <section className="calendar-workspace" aria-label="日程" data-detail-open={detailOpen} data-detail-expanded={expanded || undefined}>
    <div className="calendar-main" hidden={!active}>
      <div className="calendar-viewport" ref={viewport} data-view={view} role="region" aria-label={labels.region} tabIndex={-1}
        style={{ '--calendar-days': days.length } as CSSProperties}>
        {view === 'month' ? <>
          <div className="calendar-month-weekdays">{weekdays.map(label => <span key={label}>周{label}</span>)}</div>
          <div className="calendar-month-grid" ref={dateHeaders}>
            {columns.map((column, index) => {
              const entries = [
                ...column.allDay.map(task => ({ task, block: undefined, deadline: false })),
                ...column.deadlines.map(task => ({ task, block: undefined, deadline: true })),
                ...column.blocks.map(block => ({ task: block.task, block, deadline: false })),
              ];
              return <div key={column.day} className="calendar-month-cell" data-outside={column.day < start || column.day > through}>
                <button type="button" className="calendar-month-date" data-date={column.day}
                  aria-label={column.day} aria-current={column.day === today ? 'date' : undefined} aria-pressed={column.day === day}
                  onClick={() => openDay(column.day)} onKeyDown={event => moveDateByKey(event, column.day, index % 7)}>{Number(column.day.slice(-2))}</button>
                {entries.slice(0, monthPreviewLimit).map(({ task, block, deadline }) => event(task, column.day, block, deadline))}
                {entries.length > monthPreviewLimit && <button type="button" className="calendar-month-more"
                  aria-label={`查看 ${column.day} 其余 ${entries.length - monthPreviewLimit} 项日程`} onClick={() => openDay(column.day)}>+{entries.length - monthPreviewLimit} 项</button>}
              </div>;
            })}
          </div>
        </> : <>
          <div ref={dateHeaders} className="calendar-date-headers">
            <span aria-hidden="true" />
            {columns.map(column => <button key={column.day} type="button" data-date={column.day}
              aria-label={column.day} aria-current={column.day === today ? 'date' : undefined}
              aria-pressed={column.day === day}
              onClick={() => openDay(column.day)}
              onKeyDown={event => moveDateByKey(event, column.day, week.indexOf(column.day))}>
              <span>周{weekdays[week.indexOf(column.day)]}</span>
              <strong>
                <span className={view === 'week' && column.day === today ? 'calendar-today-badge' : undefined}>{Number(column.day.slice(-2))}</span>
                {view === 'day' && column.day === today && <small> 今天</small>}
              </strong>
            </button>)}
          </div>
          {hasAllDay && <div className="calendar-all-day">
            <span className="calendar-clock">全天</span>
            {columns.map(column => <div key={column.day} className="calendar-all-day-column" data-date={column.day}>
              {column.allDay.map(task => event(task, column.day))}
              {column.deadlines.map(task => event(task, column.day, undefined, true))}
            </div>)}
          </div>}
          {firstHour > 0 && <div className="calendar-compressed-hours">
            <span className="calendar-clock"><span>00:00</span><span>–{hourLabel(firstHour)}</span></span>
            {columns.map(column => <div key={column.day} aria-hidden="true" />)}
          </div>}
          <div className="calendar-hours">
            <div className="calendar-clock">
              {hours.map(hour => <div key={hour}>{hourLabel(hour)}</div>)}
            </div>
            {columns.map(column => <div key={column.day} className="calendar-day-column" data-today={column.day === today}
              data-slot-target={createItem ? true : undefined}
              onClick={event => {
                if (!createItem || event.target !== event.currentTarget) return;
                const time = slotTime(column.day, slotMinute(event.currentTarget, event.clientY));
                leaveCalendarDetails(() => createItem('meeting', time));
              }}
              onDragOver={event => {
                if (!draggedId || !event.dataTransfer.types.includes(taskDragType)) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                const minute = slotMinute(event.currentTarget, event.clientY);
                setDropTarget(previous => previous?.day === column.day && previous.minute === minute ? previous : { day: column.day, minute });
              }}
              onDragLeave={event => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDropTarget(null);
              }}
              onDrop={event => {
                if (!draggedId || event.dataTransfer.getData(taskDragType) !== draggedId) return;
                event.preventDefault();
                const task = waitingTodos.find(item => item.id === draggedId);
                const time = slotTime(column.day, slotMinute(event.currentTarget, event.clientY));
                clearDrag();
                if (task) void saveSchedule(task, time).catch(cause => setDropError(errorText(cause)));
              }}>
              {dropTarget?.day === column.day && <span aria-hidden="true" className="calendar-drop-slot"
                style={{ top: (dropTarget.minute - firstHour * 60) / (hours.length * 60) * 100 + '%',
                  height: Math.min(60, minutesPerDay - dropTarget.minute) / (hours.length * 60) * 100 + '%' }} />}
              {column.blocks.map(block => event(block.task, column.day, block))}
            </div>)}
          </div>
        </>}
      </div>
    </div>
    {records && <div className="calendar-records-pane" ref={recordsPane} tabIndex={-1} hidden={tab !== 'records'}>
      {typeof records === 'function' ? records(openRecord, currentReader?.taskId) : records}
    </div>}
    <aside ref={detailPane} className="calendar-detail" id={detailId} aria-label={waiting && !waitingTask ? '待安排' : detailTask?.kind === 'task' ? '待办详情' : '日程详情'} hidden={!detailOpen} onKeyDown={event => {
      if (event.key === 'Escape' && !event.nativeEvent.isComposing && !event.defaultPrevented && (expanded || waiting || detailTask?.kind === 'task' || back.current?.getClientRects().length)) {
        event.preventDefault(); event.stopPropagation(); backToSource();
      }
    }}>
      <div className="calendar-detail-heading">
        <button ref={back} type="button" className="calendar-back" onClick={backToSource}><CaretLeft size={15} aria-hidden="true" />
          {waitingTask ? '返回待安排' : currentReader?.source === 'records' ? '返回会议记录' : currentReader?.returnTo === 'todo' ? '返回待办' : expanded ? '返回日历' : view === 'week' ? '返回周历' : view === 'month' ? '返回月历' : '返回日历'}
        </button>
        {(detailTask || waiting) && <h2 ref={heading} tabIndex={-1}>{detailTask?.title ?? '待安排'}</h2>}
      </div>
      {dropError && waiting && <p className="error" role="alert">{dropError}</p>}
      {active && detailTask?.kind === 'task' ? <CalendarTodoDetails key={detailTask.id} task={detailTask} day={!waiting && selection?.deadline ? selection.day : day} handle={taskEditHandle ?? todoEditor}
        onSave={(time, revision) => saveSchedule({ ...detailTask, updatedAt: revision }, time)} completion={calendarTodos.completion(detailTask)} /> : active && waiting ?
        waitingTodos.length ? <ul className="calendar-waiting-list">{waitingTodos.map(task => <li key={task.id}>
          <button type="button" draggable={view !== 'month'} onDragStart={event => {
            event.dataTransfer.setData(taskDragType, task.id);
            event.dataTransfer.effectAllowed = 'move';
            setDraggedId(task.id);
            setDropError('');
          }} onDragEnd={clearDrag} onClick={() => {
            setWaitingId(task.id);
            requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
          }}><Square size={15} aria-hidden="true" /><span>{task.title}</span><CaretRight size={14} aria-hidden="true" /></button>
        </li>)}</ul> : <p className="calendar-detail-empty">没有待安排的待办。</p>
      : detailTask ? <>
        {(currentReader?.tab !== 'info' || detailTask.source === 'welink') && <p className="calendar-detail-time"><CalendarBlank aria-hidden="true" size={17} />{meetingStamp(detailTask)}</p>}
        {currentReader && details(detailTask, { tab: currentReader.tab, onTab: changeDetailTab })}
      </> : expanded && <p className="calendar-detail-empty">这场日程已删除或不可用。</p>}
    </aside>
  </section>;

  const tabs = <Segmented variant="content" aria-label="日程待办视图" value={tab} onChange={value => { if (value !== tab) leaveCalendarDetails(() => { setReader(null); setWaiting(false); setWaitingId(null); setDetailMode('calendar'); onTab(value as ScheduleTab); }); }}
    options={records ? scheduleTabs : scheduleTabs.slice(0, 2)} />;
  const toolbar = active && <div className="calendar-toolbar" role="group" aria-label="日历工具栏">
    <div className="calendar-toolbar-navigation">
      <Select className="calendar-view-select" menuClassName="calendar-view-menu" aria-label="日历显示方式"
        value={view} options={calendarModes} triggerContent={labels.label} onChange={value => changeView(value as CalendarView)} />
      <div className="calendar-pager" role="group" aria-label="日历日期导航">
        <button type="button" className="calendar-step" aria-label={labels.previous} title={labels.previous} onClick={() => movePeriod(-1)}><CaretLeft size={16} aria-hidden="true" /></button>
        <div className="calendar-period" title={range} data-compact={view === 'week' && !sameMonth || undefined}>
          <DatePicker aria-label="选择日历日期" aria-describedby={periodId} value={day} clearable={false}
            yearRange={{ min: Math.min(2000, date.getFullYear()), max: Math.max(2100, date.getFullYear()) }}
            triggerContent={<><span id={periodId}>{range}</span><span className="calendar-period-compact" aria-hidden="true">{compactRange}</span></>}
            onChange={value => moveTo(value || today)} />
        </div>
        <button type="button" className="calendar-step" aria-label={labels.next} title={labels.next} onClick={() => movePeriod(1)}><CaretRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
    <div className="calendar-toolbar-actions">
      {createItem && <TaskCreateButton onClick={() => leaveCalendarDetails(() => createItem('meeting'))} />}
      {calendarActions}
    </div>
  </div>;
  const toolbarTarget = headerFitsToolbar ? workspaceHeader : null;

  return <div className="today-board calendar-board">
    {workspaceHeader && createPortal(<>{tabs}{toolbarTarget && toolbar}{headerActions}</>, workspaceHeader)}
    {(!workspaceHeader || (toolbar && !toolbarTarget)) && <header className="calendar-heading">
      {!workspaceHeader && tabs}
      {!toolbarTarget && toolbar}
    </header>}
    <div className="calendar-tab-panel calendar-overview" hidden={tab === 'todo' || !!editForm}>
      {calendar}
    </div>
    <div className="calendar-tab-panel calendar-todos" hidden={tab !== 'todo' || !!editForm}>{todo}</div>
    {editForm && <div className="calendar-tab-panel calendar-edit-panel">{editForm}</div>}
  </div>;
}
