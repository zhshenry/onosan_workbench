import { useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, CaretLeft, CaretRight, CheckSquare, FileText } from '@phosphor-icons/react';
import { hasTaskTime, localDay, type Task } from '../../../shared/todo-contracts';
import { dateText, dateTimeText, meetingEndAt, scheduleStamp, scheduledInRange, scheduleTimeRange, timeText } from '../../../shared/todo-format';
import { DatePicker, Segmented, Select } from './ui';
import './calendar-workspace.css';

export type ScheduleTab = 'calendar' | 'todo' | 'records';

export interface ScheduleNavigation {
  tab: ScheduleTab;
  onTab(tab: ScheduleTab): void;
  workspaceHeader?: HTMLElement | null;
  calendarActions?: ReactNode;
  headerActions?: ReactNode;
  details(task: Task): ReactNode;
  records?: ReactNode;
}

const weekdays = ['一', '二', '三', '四', '五', '六', '日'];
const scheduleTabs = [
  { value: 'calendar', label: '日程', icon: <CalendarBlank size={16} aria-hidden="true" /> },
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

function calendarDay(day: string, meetings: Task[]) {
  const allDay: Task[] = [];
  const blocks: TimeBlock[] = [];
  const dayStart = Date.parse(day + 'T00:00:00');
  const nextStart = Date.parse(shiftDay(day, 1) + 'T00:00:00');

  for (const task of meetings) {
    if (!scheduledInRange(task, day)) continue;
    const endAt = meetingEndAt(task);
    if (task.external?.isAllDay || !hasTaskTime(task.dateAt) || !endAt) {
      allDay.push(task);
      continue;
    }
    const start = Date.parse(task.dateAt) <= dayStart ? 0 : minutesAt(Date.parse(task.dateAt));
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
  return { day, allDay, blocks };
}

type MeetingSource = { meetings: Task[]; mergeMeetings?(items: Task[]): Task[] };

export function CalendarWorkspace({ tab, onTab, workspaceHeader, calendarActions, headerActions, details, records, meetings, mergeMeetings, today, todo }: ScheduleNavigation & MeetingSource & {
  today: string; todo: ReactNode;
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
  const [selection, setSelection] = useState<{ id: string; day: string } | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null), back = useRef<HTMLButtonElement>(null);
  const dateHeaders = useRef<HTMLDivElement>(null), eventButton = useRef<HTMLButtonElement | null>(null);
  const viewport = useRef<HTMLDivElement>(null), returnScroll = useRef(0);
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
  const columns = days.map(value => calendarDay(value, value < start || value > through ? [] : visibleMeetings));
  const visible = columns.flatMap(column => [...column.allDay, ...column.blocks.map(block => block.task)]
    .map(task => ({ day: column.day, task })));
  const selected = visible.find(entry => entry.task.id === selection?.id && entry.day === selection.day)
    ?? visible.find(entry => entry.day === day) ?? visible[0];
  const hasAllDay = columns.some(column => column.allDay.length > 0);
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

  function moveTo(value: string) {
    setPickedDay(value === today ? null : value);
    setSelection(null);
    setDetailOpen(false);
    if (viewport.current) viewport.current.scrollTop = 0;
  }
  function changeView(value: CalendarView) {
    setView(value);
    setDetailOpen(false);
    if (viewport.current) viewport.current.scrollTop = 0;
  }
  function movePeriod(direction: number) {
    moveTo(view === 'month' ? shiftMonth(day, direction) : shiftDay(day, direction * (view === 'week' ? 7 : 1)));
  }
  function openDay(value: string) {
    moveTo(value);
    changeView('day');
    requestAnimationFrame(() => dateHeaders.current?.querySelector<HTMLButtonElement>('[data-date="' + value + '"]')?.focus());
  }
  function moveDateByKey(event: KeyboardEvent<HTMLButtonElement>, value: string, index: number) {
    const offsets: Record<string, number | undefined> = { ArrowLeft: -1, ArrowRight: 1, Home: -index, End: 6 - index,
      ArrowUp: view === 'month' ? -7 : undefined, ArrowDown: view === 'month' ? 7 : undefined };
    const offset = offsets[event.key];
    if (offset === undefined) return;
    event.preventDefault();
    const next = shiftDay(value, offset);
    moveTo(next);
    requestAnimationFrame(() => dateHeaders.current?.querySelector<HTMLButtonElement>('[data-date="' + next + '"]')?.focus());
  }
  function openDetail(task: Task, value: string, button: HTMLButtonElement) {
    eventButton.current = button;
    returnScroll.current = viewport.current?.scrollTop ?? 0;
    setSelection({ id: task.id, day: value });
    setDetailOpen(true);
    requestAnimationFrame(() => {
      if (back.current?.getClientRects().length) heading.current?.focus({ preventScroll: true });
    });
  }
  function backToCalendar() {
    setDetailOpen(false);
    requestAnimationFrame(() => {
      if (viewport.current) viewport.current.scrollTop = returnScroll.current;
      if (eventButton.current?.isConnected) eventButton.current.focus({ preventScroll: true });
    });
  }
  function event(task: Task, value: string, block?: TimeBlock) {
    const minutes = hours.length * 60;
    const area = block && view !== 'month' ? {
      '--event-y': (block.start - firstHour * 60) / minutes * 100 + '%',
      '--event-height': (block.drawnEnd - block.start) / minutes * 100 + '%',
      '--event-x': block.lane / block.lanes * 100 + '%',
      '--event-width': 100 / block.lanes + '%',
    } as CSSProperties : undefined;
    return <button key={task.id} type="button" style={area}
      className={area ? 'calendar-event is-timed' : 'calendar-event'}
      data-task-id={task.id} aria-controls={detailId}
      aria-label={'查看日程 ' + task.title + '，' + scheduleTimeRange(task)}
      aria-pressed={task.id === selected?.task.id && value === selected.day}
      title={task.title + ' · ' + scheduleTimeRange(task)}
      onClick={e => openDetail(task, value, e.currentTarget)}>
      {block && (view === 'month' || block.end - block.start >= 60) && <span className="calendar-event-time">{block.start === 0 ? '00:00' : timeText(task.dateAt)}</span>}
      <span className="calendar-event-title">{task.title}</span>
    </button>;
  }
  const calendar = <section className="calendar-workspace" aria-label="日程" data-detail-open={detailOpen}>
    <div className="calendar-main">
      <div className="calendar-viewport" ref={viewport} data-view={view} role="region" aria-label={labels.region}
        style={{ '--calendar-days': days.length } as CSSProperties}>
        {view === 'month' ? <>
          <div className="calendar-month-weekdays">{weekdays.map(label => <span key={label}>周{label}</span>)}</div>
          <div className="calendar-month-grid" ref={dateHeaders}>
            {columns.map((column, index) => {
              const entries = [...column.allDay.map(task => ({ task, block: undefined })), ...column.blocks.map(block => ({ task: block.task, block }))];
              return <div key={column.day} className="calendar-month-cell" data-outside={column.day < start || column.day > through}>
                <button type="button" className="calendar-month-date" data-date={column.day}
                  aria-label={column.day} aria-current={column.day === today ? 'date' : undefined} aria-pressed={column.day === day}
                  onClick={() => openDay(column.day)} onKeyDown={event => moveDateByKey(event, column.day, index % 7)}>{Number(column.day.slice(-2))}</button>
                {entries.slice(0, monthPreviewLimit).map(({ task, block }) => event(task, column.day, block))}
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
            {columns.map(column => <div key={column.day} className="calendar-all-day-column" data-today={column.day === today}>
              {column.allDay.map(task => event(task, column.day))}
            </div>)}
          </div>}
          {firstHour > 0 && <div className="calendar-compressed-hours">
            <span className="calendar-clock"><span>00:00</span><span>–{hourLabel(firstHour)}</span></span>
            {columns.map(column => <div key={column.day} data-today={column.day === today} aria-hidden="true" />)}
          </div>}
          <div className="calendar-hours">
            <div className="calendar-clock">
              {hours.map(hour => <div key={hour}>{hourLabel(hour)}</div>)}
            </div>
            {columns.map(column => <div key={column.day} className="calendar-day-column" data-today={column.day === today}>
              {column.blocks.map(block => event(block.task, column.day, block))}
            </div>)}
            {view === 'day' && !visible.length && <p className="calendar-empty">当天没有日程</p>}
          </div>
        </>}
      </div>
    </div>
    <aside className="calendar-detail" id={detailId} aria-label="日程详情" onKeyDown={event => {
      if (event.key === 'Escape' && back.current?.getClientRects().length) { event.stopPropagation(); backToCalendar(); }
    }}>
      <button ref={back} type="button" className="calendar-back" onClick={backToCalendar}><CaretLeft size={15} />{view === 'week' ? '返回周历' : view === 'month' ? '返回月历' : '返回日历'}</button>
      {selected ? <>
        <h2 ref={heading} tabIndex={-1}>{selected.task.title}</h2>
        <p className="calendar-detail-time"><CalendarBlank aria-hidden="true" size={17} />{meetingStamp(selected.task)}</p>
        {details(selected.task)}
        {selected.task.note && <p className="calendar-detail-note">{selected.task.note}</p>}
      </> : <p className="calendar-detail-empty">选择一项日程查看详情。</p>}
    </aside>
  </section>;

  const tabs = <Segmented variant="content" aria-label="日程待办视图" value={tab} onChange={value => onTab(value as ScheduleTab)}
    options={records ? scheduleTabs : scheduleTabs.slice(0, 2)} />;
  const toolbar = active && <div className="calendar-toolbar" role="group" aria-label="日程工具栏">
    <div className="calendar-toolbar-navigation">
      <Select className="calendar-view-select" menuClassName="calendar-view-menu" aria-label="日程显示方式"
        value={view} options={calendarModes} triggerContent={labels.label} onChange={value => changeView(value as CalendarView)} />
      <div className="calendar-pager" role="group" aria-label="日程日期导航">
        <button type="button" className="calendar-step" aria-label={labels.previous} title={labels.previous} onClick={() => movePeriod(-1)}><CaretLeft size={16} aria-hidden="true" /></button>
        <div className="calendar-period" title={range} data-compact={view === 'week' && !sameMonth || undefined}>
          <DatePicker aria-label="选择日程日期" aria-describedby={periodId} value={day} clearable={false}
            yearRange={{ min: Math.min(2000, date.getFullYear()), max: Math.max(2100, date.getFullYear()) }}
            triggerContent={<><span id={periodId}>{range}</span><span className="calendar-period-compact" aria-hidden="true">{compactRange}</span></>}
            onChange={value => moveTo(value || today)} />
        </div>
        <button type="button" className="calendar-step" aria-label={labels.next} title={labels.next} onClick={() => movePeriod(1)}><CaretRight size={16} aria-hidden="true" /></button>
      </div>
    </div>
    {calendarActions}
  </div>;
  const toolbarTarget = headerFitsToolbar ? workspaceHeader : null;

  return <div className="today-board calendar-board">
    {workspaceHeader && createPortal(<>{tabs}{toolbarTarget && toolbar}{headerActions}</>, workspaceHeader)}
    {(!workspaceHeader || (toolbar && !toolbarTarget)) && <header className="calendar-heading">
      {!workspaceHeader && tabs}
      {!toolbarTarget && toolbar}
    </header>}
    <div className="calendar-tab-panel calendar-overview" hidden={!active}>
      {calendar}
    </div>
    <div className="calendar-tab-panel calendar-todos" hidden={tab !== 'todo'}>{todo}</div>
    {records && <div className="calendar-tab-panel" hidden={tab !== 'records'}>{records}</div>}
  </div>;
}
