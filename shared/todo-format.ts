export function timeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '待定';
}
export function dateText(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
}
export function dateTimeText(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : '未设置';
}
export function scheduleStamp(task: { dueAt: string | null; plannedDate: string }): string {
  return task.dueAt ? dateTimeText(task.dueAt) : dateText(task.plannedDate);
}
export function stampLabel(kind: 'task' | 'meeting'): string {
  return kind === 'meeting' ? '开始时间' : '完成时间';
}
export function isOverdue(task: { status: string; dueAt: string | null; plannedDate: string }, now = Date.now()): boolean {
  if (task.status === 'done') return false;
  const deadline = task.dueAt ? new Date(task.dueAt).getTime() : new Date(`${task.plannedDate}T23:59:59`).getTime();
  return deadline < now;
}
