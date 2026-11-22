import { hasTaskTime, taskDay } from './todo-date';

export function timeText(iso: string | null): string {
  return hasTaskTime(iso) ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '不设时间';
}
export function dateText(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
export function dateTimeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未设置';
}
type ScheduleTask = { kind?: 'task' | 'meeting'; dateAt: string | null; endAt?: string | null; external?: { isAllDay?: boolean } };
export function scheduledInRange(task: ScheduleTask, from: string, through = from): boolean {
  if (!task.external || task.kind !== 'meeting' || !task.dateAt || !task.endAt) {
    const day = taskDay(task);
    return day !== null && day >= from && day <= through;
  }
  const end = new Date(`${through}T00:00:00`); end.setDate(end.getDate() + 1);
  return Date.parse(task.dateAt) < end.getTime() && Date.parse(task.endAt) > new Date(`${from}T00:00:00`).getTime();
}
export function meetingEndAt(task: ScheduleTask): string | null {
  if (task.endAt) return task.endAt;
  return task.kind === 'meeting' && hasTaskTime(task.dateAt) ? new Date(Date.parse(task.dateAt) + 60 * 60 * 1000).toISOString() : null;
}
export function isAllDayMeeting(task: ScheduleTask): boolean {
  return !!task.external?.isAllDay || task.kind === 'meeting' && !!task.dateAt && !hasTaskTime(task.dateAt);
}
export function scheduleTimeRange(task: ScheduleTask): string {
  if (isAllDayMeeting(task)) return '全天';
  if (task.kind !== 'meeting') return timeText(task.dateAt);
  const end = meetingEndAt(task);
  return hasTaskTime(task.dateAt) && end ? `${timeText(task.dateAt)}–${timeText(end)}` : '待定';
}
export function scheduleStamp(task: ScheduleTask): string {
  if (!task.dateAt) return '未设置日期';
  if (isAllDayMeeting(task)) return `${dateText(taskDay(task)!)} · 全天`;
  if (!hasTaskTime(task.dateAt)) return dateText(task.dateAt);
  return task.kind === 'meeting' ? `${dateTimeText(task.dateAt)}–${timeText(meetingEndAt(task))}` : dateTimeText(task.dateAt);
}
export function stampLabel(kind: 'task' | 'meeting'): string {
  return kind === 'meeting' ? '时间段' : '完成期限';
}
export function isOverdue(task: ScheduleTask & { status: string }, now = Date.now()): boolean {
  if (task.status === 'done' || !task.dateAt) return false;
  const deadlineAt = task.kind === 'meeting' ? meetingEndAt(task) : task.dateAt;
  const deadline = hasTaskTime(deadlineAt) ? Date.parse(deadlineAt) : new Date(`${taskDay(task)}T23:59:59.999`).getTime();
  return deadline < now;
}
