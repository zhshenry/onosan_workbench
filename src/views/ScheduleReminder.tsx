import { hasTaskTime, taskDay } from '../../shared/todo-date';
import { useEffect, useRef, useState } from 'react';
import { Bell, X } from '@phosphor-icons/react';
import { localDay, type Task } from '../../shared/todo-contracts';
import { meetingTimeStatus } from '../../shared/meeting-notes';
import { scheduleTimeRange } from '../../shared/todo-format';
import type { Mutate } from '../../modules/todo/ui/TodayBoard';

const dismissalKey = 'wb.todo.dismissed-reminders';
export function ScheduleReminder({ tasks, clock, open, mutate }: { tasks: Task[]; clock: Date; open(task: Task): void; mutate: Mutate }) {
  const [dismissed, setDismissed] = useState<Record<string, string>>(() => {
    try { const value = JSON.parse(localStorage.getItem(dismissalKey) ?? '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; } catch { return {}; }
  });
  const [expanded, setExpanded] = useState(false), [busy, setBusy] = useState(false);
  const root = useRef<HTMLDivElement>(null), toggle = useRef<HTMLButtonElement>(null);
  const pending = tasks.filter(task => !task.deletedAt && task.status !== 'done' && task.remindAt && Date.parse(task.remindAt) <= clock.getTime() && dismissed[task.id] !== task.remindAt)
    .sort((a, b) => a.remindAt!.localeCompare(b.remindAt!));
  const task = pending[0];
  useEffect(() => {
    if (!expanded) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setExpanded(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false); toggle.current?.focus(); } };
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key); };
  }, [expanded]);
  if (!task) return null;
  const time = task.kind === 'meeting' ? meetingTimeStatus(task, clock.getTime()) : null;
  const label = time ? time.tone === 'live' ? '已开始' : time.label === '未开始' ? '日程提醒' : time.label : '待办提醒';
  const reminderLabel = `日程提醒：${task.title}，${label}`;
  function dismiss() {
    const next = Object.fromEntries(tasks.filter(item => dismissed[item.id] === item.remindAt).map(item => [item.id, dismissed[item.id]]));
    next[task.id] = task.remindAt!; setDismissed(next); setExpanded(false);
    try { localStorage.setItem(dismissalKey, JSON.stringify(next)); } catch { /* Dismissal still applies for this window session. */ }
  }
  return <div className="schedule-header-reminder" ref={root} data-open={expanded || undefined}>
    <button type="button" className="schedule-reminder-toggle" ref={toggle} aria-label={reminderLabel} title={reminderLabel} aria-expanded={expanded} onClick={() => setExpanded(value => !value)}><Bell size={18} aria-hidden="true" />{pending.length > 1 && <small>{pending.length}</small>}</button>
    <div className="schedule-reminder-content" aria-label="当前事项提醒">
      <Bell className="schedule-reminder-bell" size={24} />
      <div className="schedule-reminder-copy"><div><strong title={task.title}>{task.title}</strong><span>{label}</span>{pending.length > 1 && <small>共{pending.length}条</small>}</div><time dateTime={task.dateAt ?? task.remindAt ?? undefined}>{taskDay(task) && taskDay(task) !== localDay(clock) && `${Number(taskDay(task)!.slice(5, 7))}月${Number(taskDay(task)!.slice(-2))}日 `}{task.kind === 'meeting' ? scheduleTimeRange(task) : hasTaskTime(task.dateAt) ? new Date(task.dateAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '待办提醒'}</time></div>
      <button type="button" className="schedule-reminder-open" onClick={() => { setExpanded(false); toggle.current?.focus(); open(task); }}>{task.kind === 'meeting' ? '打开日程' : '查看待办'}</button>
      <button type="button" className="schedule-reminder-snooze" disabled={busy} onClick={async () => { if (busy) return; setBusy(true); try { await mutate(() => window.workbench.todo.snooze(task.id), '将在10分钟后提醒'); setExpanded(false); } finally { setBusy(false); } }}>稍后10分钟</button>
      <button type="button" className="schedule-reminder-close" aria-label="收起本次提醒" onClick={dismiss}><X size={16} /></button>
    </div>
  </div>;
}
