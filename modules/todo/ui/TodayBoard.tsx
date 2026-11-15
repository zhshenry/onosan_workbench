import { useRef, useState, type ReactNode } from 'react';
import { CalendarBlank, Check, CaretDown } from '@phosphor-icons/react';
import { localDay, openToday, taskTime, type Task } from '../../../shared/todo-contracts';
import { isOverdue, scheduleStamp, scheduleTimeRange, stampLabel } from './ui';
import { DatePicker, Segmented } from '../../../src/ui/controls';
import type { TaskEditorApi, TodoState } from './TaskEditor';

// 紧凑布局沿用上游 TodayBoard/PlanRow；工作台周导航为本地宿主变体。
// 上游 api: DesktopAPI 在此参数化为工作台注入的 TaskEditorApi。
export type Mutate = (action: () => Promise<TodoState>, message?: string) => Promise<void> | void;

function shiftDay(day: string, days: number) {
  const date = new Date(`${day}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDay(date);
}

function meetingItems(tasks: Task[], from: string, through: string | null) {
  return tasks.filter(task => !task.deletedAt && task.status !== 'done' && task.kind === 'meeting' && task.plannedDate >= from && (!through || task.plannedDate <= through))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || taskTime(a) - taskTime(b) || a.createdAt.localeCompare(b.createdAt));
}

export function TodayBoard({ tasks, today, categoryById, planView, mutating, api, mutate, setEditor, toolbar, emptyText, variant = 'compact', todoContent }: {
  tasks: Task[]; today: string; categoryById: Map<string, { id: string; name: string; color: string }>;
  planView: 'rows' | 'tiles'; mutating: boolean;
  api: TaskEditorApi; mutate: Mutate;
  setEditor: (task: Task | 'new') => void; toolbar: ReactNode; emptyText?: string; variant?: 'compact' | 'workspace'; todoContent?: ReactNode;
}) {
  const [openFolder, setOpenFolder] = useState<string | null>(null);
  const [armedId, setArmedId] = useState<string | null>(null);
  const armTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  function disarmArm() {
    if (armTimer.current) { clearTimeout(armTimer.current); armTimer.current = null; }
    setArmedId(null);
  }
  function armTask(task: Task) {
    setArmedId(task.id);
    if (armTimer.current) clearTimeout(armTimer.current);
    armTimer.current = setTimeout(() => setArmedId(null), 4000);
  }
  function onRowCheck(task: Task) {
    if (task.status === 'done') { void mutate(() => api.update(task.id, { status: 'todo' }, task.updatedAt)); return; }
    if (armedId === task.id) { disarmArm(); return; } // 再次点击圆框 = 取消
    armTask(task);
  }
  function confirmRow(task: Task) {
    disarmArm();
    void mutate(() => api.update(task.id, { status: 'done' }, task.updatedAt));
  }
  const openItems = openToday(tasks, today);
  const todos = openItems.filter(task => task.kind === 'task');
  const meetings = openItems.filter(task => task.kind === 'meeting');
  const currentId = variant === 'workspace' ? todos.find(task => task.status === 'doing')?.id : openItems[0]?.id;
  const tomorrow = shiftDay(today, 1);
  const dayAfter = shiftDay(today, 2);
  const weekEnd = shiftDay(today, 7);
  const laterStart = shiftDay(today, 8);
  const shortDate = (date: string) => `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
  const groups = [
    { id: 'today', label: '今天', range: shortDate(today), items: meetings },
    { id: 'tomorrow', label: '明天', range: shortDate(tomorrow), items: meetingItems(tasks, tomorrow, tomorrow) },
    { id: 'soon', label: '近期', range: `${shortDate(dayAfter)} – ${shortDate(weekEnd)}`, items: meetingItems(tasks, dayAfter, weekEnd) },
    { id: 'later', label: '更晚', range: `${shortDate(laterStart)} 起`, items: meetingItems(tasks, laterStart, null) },
  ].filter(group => group.items.length > 0);
  const todoSection = <section className={`plan-card plan-today${todos.length ? '' : ' is-empty'}`} aria-label="待办">
      <header className="plan-card-heading"><h2>待办{variant === 'workspace' && <span className="workspace-todo-count">{todos.length}</span>}</h2>{toolbar}</header>
      {todoContent ?? (todos.length ? <ul className={planView === 'tiles' ? 'plan-tiles' : 'plan-list'}>{todos.map(task => <PlanRow key={task.id} task={task} tiles={planView === 'tiles'} category={task.categoryId ? categoryById.get(task.categoryId) : undefined} current={task.id === currentId} mutating={mutating} setEditor={setEditor} armed={armedId === task.id} onCheck={() => onRowCheck(task)} onConfirm={() => confirmRow(task)} onDisarm={disarmArm} />)}</ul> : <div className="plan-empty">{emptyText ?? '点击 + 添加,或让 AI 帮你安排。'}</div>)}
    </section>;
  const scheduleSection = variant === 'workspace' ? <WeekSchedule tasks={tasks} today={today} edit={setEditor} /> : <section className="plan-schedule" aria-label="日程">
      <header className="plan-card-heading"><h2>日程</h2></header>
      {groups.length ? <div className="plan-schedule-groups">{groups.map(group => {
        const open = openFolder === group.id;
        return <section key={group.id} className={`plan-folder${open ? ' is-open' : ''}`}>
          <button type="button" className="plan-folder-tab" aria-expanded={open} aria-controls={`plan-folder-${group.id}`} onClick={() => setOpenFolder(open ? null : group.id)}>
            <h3>{group.label}<small>{group.range}</small></h3>
            <span className="plan-folder-count">{group.items.length}</span>
            <CaretDown className="plan-folder-caret" size={12} weight="bold" />
          </button>
          {open ? <div id={`plan-folder-${group.id}`} className="plan-folder-body">
            <ul className="plan-list">{group.items.map(task => <PlanRow key={task.id} task={task} tiles={false} category={task.categoryId ? categoryById.get(task.categoryId) : undefined} current={group.id === 'today' && task.id === currentId} mutating={mutating} setEditor={setEditor} armed={armedId === task.id} onCheck={() => onRowCheck(task)} onConfirm={() => confirmRow(task)} onDisarm={disarmArm} />)}</ul>
          </div> : null}
        </section>;
      })}</div> : <div className="plan-empty">没有日程。</div>}
    </section>;
  return <div className="today-board">{variant === 'workspace' ? <>{scheduleSection}{todoSection}</> : <>{todoSection}{scheduleSection}</>}</div>;
}

function WeekSchedule({ tasks, today, edit }: { tasks: Task[]; today: string; edit(task: Task): void }) {
  const [pickedDay, setPickedDay] = useState<string | null>(null);
  const [view, setView] = useState<'day' | 'week'>('day');
  const day = pickedDay ?? today, date = new Date(`${day}T12:00:00`), weekday = (date.getDay() + 6) % 7;
  const week = Array.from({ length: 7 }, (_, index) => shiftDay(day, index - weekday));
  const selectedItems = meetingItems(tasks, view === 'week' ? week[0] : day, view === 'week' ? week[6] : day);
  const nextDay = shiftDay(day, 1), next = meetingItems(tasks, nextDay, nextDay)[0];
  const shortDate = (value: string) => `${Number(value.slice(5, 7))}月${Number(value.slice(-2))}日`;
  const range = `${week[0].slice(0, 4)}年${shortDate(week[0])} — ${week[6].slice(0, 4) !== week[0].slice(0, 4) ? `${week[6].slice(0, 4)}年` : ''}${shortDate(week[6])}`;
  const strip = useRef<HTMLDivElement>(null);
  const selectDay = (value: string) => setPickedDay(value === today ? null : value);
  const showDay = (value: string) => { selectDay(value); setView('day'); };
  const agenda = (items: Task[]) => <ul className="week-agenda-list">{items.map(task => <li key={task.id}>
    {view === 'day' && <span className="week-agenda-icon" aria-hidden="true"><CalendarBlank size={20} /></span>}
    <button type="button" className="week-agenda-title" title={task.title} aria-label={`编辑 ${task.title}`} onClick={() => edit(task)}>{task.title}</button>
    <time dateTime={task.dueAt ?? undefined}>{scheduleTimeRange(task)}</time>
  </li>)}</ul>;
  return <section className="plan-schedule week-schedule" aria-label="日程">
    <header className="week-schedule-header">
      <h2>日程</h2>
      <Segmented aria-label="日程显示方式" value={view} onChange={value => setView(value as 'day' | 'week')} options={[{ value: 'day', label: '日' }, { value: 'week', label: '周' }]} />
    </header>
    <div className="week-schedule-toolbar">
      <DatePicker value={day} onChange={value => selectDay(value || today)} clearable={false} yearRange={{ min: Math.min(2000, date.getFullYear()), max: Math.max(2100, date.getFullYear()) }} />
    </div>
    <div ref={strip} className="week-strip" role="group" aria-label="日程日期">
      {week.map((value, index) => <button key={value} type="button" aria-label={value} aria-pressed={value === day} aria-current={value === today ? 'date' : undefined} onClick={() => showDay(value)} onKeyDown={event => {
        const offset = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'Home' ? -index : event.key === 'End' ? 6 - index : null;
        if (offset === null) return; event.preventDefault(); const next = shiftDay(value, offset); selectDay(next);
        requestAnimationFrame(() => strip.current?.querySelector<HTMLButtonElement>(`[aria-label="${next}"]`)?.focus());
      }}><span>{'一二三四五六日'[index]}</span><b>{Number(value.slice(-2))}</b><i className={meetingItems(tasks, value, value).length ? 'has-schedule' : ''} aria-hidden="true" /></button>)}
    </div>
    <div className="week-schedule-body">
      <div className="week-schedule-list-heading"><h3>{view === 'week' ? range : day === today ? '今天的日程' : `${shortDate(day)} ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()]}`}</h3><span aria-live="polite">{selectedItems.length} 项</span></div>
      {selectedItems.length ? view === 'day' ? agenda(selectedItems) : <div className="week-agenda-groups">{week.map(value => {
        const items = selectedItems.filter(task => task.plannedDate === value);
        return <section key={value} className="week-agenda-day" aria-label={`${value} 的日程`}>
          <button type="button" className="week-agenda-day-date" aria-label={`查看 ${value} 的日程`} aria-current={value === today ? 'date' : undefined} onClick={() => showDay(value)}><time dateTime={value}><span>{value === today ? '今天' : `周${'一二三四五六日'[week.indexOf(value)]}`}</span><b>{Number(value.slice(-2))}</b></time></button>
          {items.length ? agenda(items) : <p>暂无日程</p>}
        </section>;
      })}</div> : <p className="plan-empty">{view === 'week' ? '这一周没有日程。' : '这一天没有日程。'}</p>}
      {view === 'day' && next && <button type="button" className="week-next-day" title={`${nextDay} · ${next.title} ${scheduleTimeRange(next)}`} onClick={() => selectDay(nextDay)}><CalendarBlank size={18} /><span>{day === today ? '明天' : '次日'} {Number(nextDay.slice(5, 7))}月{Number(nextDay.slice(-2))}日 · {next.title} {scheduleTimeRange(next)}</span></button>}
    </div>
  </section>;
}

function PlanRow({ task, tiles, category, current, mutating, setEditor, armed, onCheck, onConfirm, onDisarm }: {
  task: Task; tiles: boolean; category?: { name: string; color: string }; current: boolean; mutating: boolean;
  setEditor: (task: Task | 'new') => void; armed: boolean; onCheck: () => void; onConfirm: () => void; onDisarm: () => void;
}) {
  const overdue = isOverdue(task);
  const checkable = task.kind === 'task';
  const checkActive = task.status === 'done' || armed;
  const checkSize = tiles ? 11 : 12;
  const showProgress = task.progress !== null;
  if (tiles) return <li className={`plan-item is-tile${task.status === 'done' ? ' is-done' : ''}${current ? ' is-current' : ''}${armed ? ' is-armed' : ''}`}>
    <span className="tile-top">
      {overdue ? <span className="tile-pill pill-overdue">已超期</span> : null}
      <time className={overdue ? 'is-overdue' : undefined} dateTime={task.dueAt ?? task.plannedDate}>{scheduleStamp(task)}</time>
    </span>
    <span className="tile-body">
      <button type="button" className={`task-check${checkActive ? ' is-active' : ''}`} aria-label={`${task.status === 'done' ? '恢复待办' : armed ? `取消完成 ${task.title}` : `完成 ${task.title}`}`} aria-pressed={task.status === 'done'} disabled={mutating} onClick={onCheck}>{checkActive ? <Check size={checkSize} weight="bold" /> : null}</button>
      <button type="button" className="tile-title" onClick={() => setEditor(task)} aria-label={`编辑 ${task.title}`}><b title={task.title}>{task.title}</b></button>
    </span>
    {armed
      ? <span className="confirm-bar"><button type="button" className="confirm-btn" disabled={mutating} onClick={onConfirm}>确认完成</button><button type="button" className="confirm-cancel" onClick={onDisarm}>取消</button></span>
      : <span className="tile-foot">
          <span className="plan-category"><i className="plan-dot" aria-hidden="true" style={{ backgroundColor: category?.color ?? 'var(--todo-muted)' }} />{category?.name ?? '无标签'}</span>
          {showProgress ? <span className="plan-progress-num">{task.progress}%</span> : null}
        </span>}
  </li>;
  return <li className={`plan-item${checkable ? '' : ' is-meeting'}${task.status === 'done' ? ' is-done' : ''}${current ? ' is-current' : ''}${armed ? ' is-armed' : ''}`}>
    {checkable ? <button type="button" className={`task-check${checkActive ? ' is-active' : ''}`} aria-label={`${task.status === 'done' ? '恢复待办' : armed ? `取消完成 ${task.title}` : `完成 ${task.title}`}`} aria-pressed={task.status === 'done'} disabled={mutating} onClick={onCheck}>{checkActive ? <Check size={checkSize} weight="bold" /> : null}</button> : null}
    <button type="button" className="plan-title" onClick={() => setEditor(task)} aria-label={`编辑 ${task.title}`}><b title={task.title}>{task.title}</b></button>
    {armed
      ? <span className="confirm-bar"><button type="button" className="confirm-btn" disabled={mutating} onClick={onConfirm}>确认完成</button><button type="button" className="confirm-cancel" onClick={onDisarm}>取消</button></span>
      : <span className="plan-meta">
          <span className="plan-category">{overdue ? <span className="plan-overdue">已超期</span> : null}<i className="plan-dot" aria-hidden="true" style={{ backgroundColor: category?.color ?? 'var(--todo-muted)' }} />{category?.name ?? '无标签'}</span>
          {showProgress ? <span className="plan-progress-num">{task.progress}%</span> : null}
          <time className={overdue ? 'is-overdue' : undefined} dateTime={task.dueAt ?? undefined}><span className="time-label">{stampLabel(task.kind)}</span>{scheduleStamp(task)}</time>
        </span>}
  </li>;
}
