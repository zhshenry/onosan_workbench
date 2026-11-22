import { useState, type CSSProperties, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';
import { taskDateFrom, taskDay } from '../../../shared/todo-date';
import { timeText } from '../../../shared/todo-format';
import { DatePicker, IconButton, Select, TimePicker } from './ui';

export const taskPriorityOptions = [{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }];

export function TaskFieldRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return <div className="task-editor-row">
    <span className="task-editor-row-icon" aria-hidden="true">{icon}</span>
    <div className="task-editor-row-body">{children}</div>
  </div>;
}

export function TaskProgressField({ id, value, onChange }: { id: string; value: number; onChange(value: number): void }) {
  return <div className="progress-field">
    <input id={id} className="progress-range" aria-label="事项进度" type="range" min={0} max={100} value={value}
      style={{ '--progress-value': value + '%' } as CSSProperties} onChange={event => onChange(event.currentTarget.valueAsNumber)} />
    <output htmlFor={id}>{value}%</output>
  </div>;
}

export function TaskDeadlineFields({ id, value, onChange, invalid, describedBy, inlineCalendar = false }: {
  id: string; value: string | null; onChange(value: string | null): void; invalid?: boolean; describedBy?: string; inlineCalendar?: boolean;
}) {
  const day = taskDay({ dateAt: value });
  const clock = day && value !== day ? timeText(value) : '';
  const changeDate = (next: string) => onChange(taskDateFrom(next, clock));
  return <div className="task-editor-deadline" data-empty={!day || undefined} data-inline-calendar={inlineCalendar || undefined}>
    {day && !inlineCalendar && <span className="task-editor-deadline-label">截止日期</span>}
    <DatePicker id={id} aria-label={day || inlineCalendar ? '截止日期' : '添加截止时间'} value={day ?? ''}
      clearable={inlineCalendar} direction="auto" inline={inlineCalendar} triggerContent={day ? undefined : '添加截止时间'}
      onChange={changeDate} aria-invalid={invalid} aria-describedby={describedBy} />
    {day && <>
      <ScheduleClock id={inlineCalendar ? id + '-time' : 'task-time'} label="截止时刻" value={clock} onChange={next => onChange(taskDateFrom(day, next))}
        clearLabel="仅日期" placeholder="添加时刻" />
      {!inlineCalendar && <IconButton label="清除截止时间" onClick={() => changeDate('')}><X size={16} /></IconButton>}
    </>}
  </div>;
}

const QUARTER_HOURS = Array.from({ length: 96 }, (_, index) =>
  String(Math.floor(index / 4)).padStart(2, '0') + ':' + String(index % 4 * 15).padStart(2, '0'));
function minutes(value: string) {
  const [hour, minute] = value.split(':').map(Number);
  return hour * 60 + minute;
}
function elapsed(from: string, to: string) {
  const duration = minutes(to) - minutes(from);
  const hours = Math.floor(duration / 60), remaining = duration % 60;
  return (hours ? hours + ' 小时' : '') + (remaining || !hours ? (hours ? ' ' : '') + remaining + ' 分钟' : '');
}

export function ScheduleClock({ id, label, value, onChange, after, clearLabel, placeholder = '选择时间', invalid, describedBy }: {
  id: string; label: string; value: string; onChange(value: string): void; after?: string; clearLabel?: string; placeholder?: string;
  invalid?: boolean; describedBy?: string;
}) {
  const [precise, setPrecise] = useState(false);
  if (precise) return <TimePicker id={id} aria-label={label} value={value} onChange={onChange} clearable={!!clearLabel}
    initiallyOpen placeholder={placeholder} aria-invalid={invalid} aria-describedby={describedBy} />;

  const selectable = [...new Set([...QUARTER_HOURS, ...(after ? ['23:59'] : []), ...(value ? [value] : [])])].sort();
  const options = selectable.filter(time => !after || time > after || time === value).map(time => ({
    value: time, label: after && time >= after ? time + '（' + elapsed(after, time) + '）' : time,
  }));
  if (clearLabel) options.unshift({ value: '', label: clearLabel });
  options.push({ value: 'precise', label: '精确到分钟…' });
  return <Select id={id} aria-label={label} menuClassName="task-editor-time-menu" value={value} options={options}
    triggerContent={value || placeholder} aria-invalid={invalid} aria-describedby={describedBy}
    onChange={next => { if (next === 'precise') setPrecise(true); else onChange(next); }} />;
}
