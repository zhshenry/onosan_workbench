export function timeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '待定';
}
export function dateText(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
export function dateTimeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未设置';
}
type ScheduleTask = { kind?: 'task' | 'meeting'; dueAt: string | null; endAt?: string | null; plannedDate: string };
export function meetingEndAt(task: { kind?: 'task' | 'meeting'; dueAt: string | null; endAt?: string | null }): string | null {
  if (task.endAt) return task.endAt;
  return task.kind === 'meeting' && task.dueAt ? new Date(Date.parse(task.dueAt) + 60 * 60 * 1000).toISOString() : null;
}
export function scheduleTimeRange(task: ScheduleTask): string {
  if (task.kind !== 'meeting') return timeText(task.dueAt);
  const end = meetingEndAt(task);
  return task.dueAt && end ? `${timeText(task.dueAt)}–${timeText(end)}` : '待定';
}
export function scheduleStamp(task: ScheduleTask): string {
  if (!task.dueAt) return dateText(task.plannedDate);
  return task.kind === 'meeting' ? `${dateTimeText(task.dueAt)}–${timeText(meetingEndAt(task))}` : dateTimeText(task.dueAt);
}
export function stampLabel(kind: 'task' | 'meeting'): string {
  return kind === 'meeting' ? '时间段' : '完成时间';
}
export function isOverdue(task: { kind?: 'task' | 'meeting'; status: string; dueAt: string | null; endAt?: string | null; plannedDate: string }, now = Date.now()): boolean {
  if (task.status === 'done') return false;
  const deadlineAt = task.kind === 'meeting' ? meetingEndAt(task) : task.dueAt;
  const deadline = deadlineAt ? new Date(deadlineAt).getTime() : new Date(`${task.plannedDate}T23:59:59`).getTime();
  return deadline < now;
}
