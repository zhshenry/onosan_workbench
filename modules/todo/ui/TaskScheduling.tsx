import { useEffect, useId, useImperativeHandle, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react';
import { Plus, X } from '@phosphor-icons/react';
import { scheduledDay, scheduledTimeSchema, type ScheduledTime, type Task, type TimedSchedule } from '../../../shared/todo-contracts';
import { dateText, scheduleStamp } from '../../../shared/todo-format';
import { taskDateFrom } from '../../../shared/todo-date';
import type { TaskEditHandle } from './TaskEditor';
import { DatePicker, IconButton, Modal, errorText } from './ui';
import { ScheduleClock } from './TaskFormFields';

export function TaskCreateButton({ onClick }: { onClick(): void }) {
  return <button type="button" className="btn btn-pri btn-sm" aria-haspopup="dialog" onClick={onClick}>
    <Plus size={14} aria-hidden="true" />新增
  </button>;
}

export function defaultScheduledTime(day: string, hour = 9, minute = 0): TimedSchedule {
  const start = new Date(day + 'T00:00:00');
  start.setHours(hour, minute);
  return scheduledTimeAt(start, 60 * 60_000);
}

function scheduledTimeAt(start: Date, duration: number): TimedSchedule {
  const last = new Date(start);
  last.setHours(23, 59, 0, 0);
  return { startAt: start.toISOString(), endAt: new Date(Math.min(start.getTime() + duration, last.getTime())).toISOString() };
}

function clockValue(at: string) {
  const date = new Date(at);
  return [date.getHours(), date.getMinutes()].map(value => String(value).padStart(2, '0')).join(':');
}

export function TaskScheduleFields({ value, day, onChange, invalid, describedBy, heading = '安排时段', collapsible = false }: {
  value: ScheduledTime | null | undefined; day: string; onChange(value: ScheduledTime | null): void;
  invalid?: boolean; describedBy?: string; heading?: string; collapsible?: boolean;
}) {
  const id = useId();
  const [expanded, setExpanded] = useState(false);
  const summary = useRef<HTMLButtonElement>(null);
  const insideClick = useRef<Event | null>(null);
  const date = value ? scheduledDay(value) : day;
  const allDay = !!value && 'date' in value;
  const showFields = !!value && (!collapsible || expanded);
  useEffect(() => {
    if (!collapsible || !showFields) return;
    function collapseOutside(event: MouseEvent) {
      if (event !== insideClick.current) setExpanded(false);
    }
    document.addEventListener('click', collapseOutside);
    return () => document.removeEventListener('click', collapseOutside);
  }, [collapsible, showFields]);
  function collapseAndFocus() {
    setExpanded(false);
    requestAnimationFrame(() => summary.current?.focus({ preventScroll: true }));
  }
  // React capture also sees clicks in the date and time pickers rendered through portals.
  return <div className="task-scheduling" role="group" aria-label={heading}
    onClickCapture={event => { insideClick.current = event.nativeEvent; }}
    onKeyDown={event => {
      if (!collapsible || !showFields || event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing) return;
      event.preventDefault();
      event.stopPropagation();
      collapseAndFocus();
    }}>
    {value && showFields ? <>
      <div className="task-schedule-range">
        <DatePicker id={id + '-date'} aria-label="日期" value={date} clearable={false} direction="auto"
          aria-invalid={allDay && invalid} aria-describedby={allDay ? describedBy : undefined}
          onChange={next => {
            if (!next) return;
            onChange('date' in value ? { date: next }
              : { startAt: taskDateFrom(next, clockValue(value.startAt))!, endAt: taskDateFrom(next, clockValue(value.endAt))! });
          }} />
        {'startAt' in value && <div className="task-schedule-clocks">
          <ScheduleClock id={id + '-start'} label="开始时间" value={clockValue(value.startAt)} onChange={time => {
            const startAt = taskDateFrom(date, time);
            if (!startAt) return;
            const duration = Date.parse(value.endAt) - Date.parse(value.startAt);
            onChange(scheduledTimeAt(new Date(startAt), duration > 0 ? duration : 60 * 60_000));
          }} />
          <span aria-hidden="true">–</span>
          <ScheduleClock id={id + '-end'} label="结束时间" value={clockValue(value.endAt)} after={clockValue(value.startAt)}
            invalid={invalid} describedBy={describedBy}
            onChange={time => { if (time) onChange({ ...value, endAt: taskDateFrom(date, time)! }); }} />
        </div>}
        <IconButton label="移除安排" onClick={() => { onChange(null); collapseAndFocus(); }}><X size={15} /></IconButton>
      </div>
      <label className="task-editor-all-day">
        <input type="checkbox" checked={allDay} onChange={() => onChange(allDay ? defaultScheduledTime(date) : { date })} />全天
      </label>
    </> : <button ref={summary} type="button" className="task-editor-row-trigger task-schedule-summary"
      aria-expanded={collapsible ? false : undefined} aria-invalid={invalid} aria-describedby={describedBy}
      onClick={() => {
        if (!value) onChange(defaultScheduledTime(day));
        if (collapsible) setExpanded(true);
        requestAnimationFrame(() => document.getElementById(id + '-date')?.focus());
      }}>
      {value ? <>
        <span className="task-schedule-summary-date">{dateText(date)}（{new Date(date + 'T12:00:00').toLocaleDateString('zh-CN', { weekday: 'long' })}）</span>
        <span className="task-schedule-summary-time">{'date' in value ? '全天' : clockValue(value.startAt) + '–' + clockValue(value.endAt)}</span>
      </> : '添加时间段'}
    </button>}
  </div>;
}


export function CalendarTodoDetails({ task, day, handle, onSave, completion }: {
  task: Task; day: string; handle: Ref<TaskEditHandle>;
  onSave(value: ScheduledTime | null, revision: string): Promise<void>; completion: ReactNode;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ScheduledTime | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const opened = useRef(task);
  const errorId = useId();
  function endEdit() {
    setEditing(false);
    setError('');
    setInvalid(false);
    setDiscard(null);
  }
  useImperativeHandle(editing ? handle : undefined, () => ({
    leave(next) {
      if (busy || discard) return;
      if (JSON.stringify(draft) !== JSON.stringify(opened.current.scheduledTime ?? null)) {
        setDiscard(() => () => { endEdit(); next?.(); });
        return;
      }
      endEdit();
      next?.();
    },
  }));
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const result = scheduledTimeSchema.nullable().safeParse(draft);
    if (!result.success) {
      setError(result.error.issues[0].message);
      setInvalid(true);
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    setBusy(true);
    setError('');
    try {
      await onSave(result.data, opened.current.updatedAt);
      endEdit();
      requestAnimationFrame(() => trigger.current?.focus());
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(false);
    }
  }
  const schedule = task.scheduledTime;
  const scheduledLabel = !schedule ? '待安排' : 'date' in schedule ? dateText(schedule.date) + ' · 全天'
    : scheduleStamp({ kind: 'meeting', dateAt: schedule.startAt, endAt: schedule.endAt });
  return <div className="calendar-todo-detail">
    <dl className="calendar-detail-fields">
      <div><dt>安排时段</dt><dd>{scheduledLabel}</dd></div>
      <div><dt>完成期限</dt><dd>{task.dateAt ? scheduleStamp(task) : '未设置'}</dd></div>
      <div><dt>优先级</dt><dd>{({ high: '高', medium: '中', low: '低' })[task.priority]}</dd></div>
    </dl>
    {editing ? <form ref={form} className="form-body calendar-scheduling-form" noValidate onSubmit={submit} aria-busy={busy || undefined}>
      <fieldset disabled={busy}>
        <TaskScheduleFields value={draft} day={day} invalid={invalid} describedBy={error ? errorId : undefined}
          onChange={next => { setDraft(next); setError(''); setInvalid(false); }} />
        {error && <p className="error" id={errorId} role="alert">{error}</p>}
        <div className="calendar-todo-actions">
          <button type="button" className="btn btn-sec btn-sm" onClick={() => { endEdit(); requestAnimationFrame(() => trigger.current?.focus()); }}>取消</button>
          <button type="submit" className="btn btn-pri btn-sm">{busy ? '保存中…' : '保存安排'}</button>
        </div>
      </fieldset>
    </form> : <div className="calendar-todo-actions">
      <button ref={trigger} type="button" className="btn btn-sec btn-sm" onClick={() => {
        opened.current = task;
        setDraft(task.scheduledTime ?? defaultScheduledTime(day));
        setEditing(true);
        requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('.date-picker button')?.focus());
      }}>{task.scheduledTime ? '调整时段' : '安排时间'}</button>
      {completion}
    </div>}
    {task.note.trim() && <section className="calendar-detail-section"><h3>说明</h3><p>{task.note}</p></section>}
    {discard && <Modal className="confirm task-edit-discard" title="放弃未保存的修改？" close={() => setDiscard(null)}>
      <p>安排时段尚未保存。</p>
      <div className="actions"><button type="button" autoFocus onClick={() => setDiscard(null)}>继续编辑</button>
        <button type="button" className="danger" onClick={discard}>放弃修改</button></div>
    </Modal>}
  </div>;
}
