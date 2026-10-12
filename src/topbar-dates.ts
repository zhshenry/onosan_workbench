// Display-only formatting for the topbar. Other date entry points keep their
// existing formatters, and planned calendar dates never pass through UTC.
type TopbarTaskDate = { plannedDate?: string | null; dueAt?: string | null; endAt?: string | null; kind?: 'task' | 'meeting' };
const pad = (value: number) => String(value).padStart(2, '0');

function calendarDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && `${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` === value ? date : null;
}
function instant(value: string | null | undefined): Date | null {
  // A date-only value has no time; Date.parse would silently invent midnight.
  if (!value || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/.test(value)) return null;
  // Validate the source calendar day independently of the viewer's timezone.
  const sourceDay = new Date(`${value.slice(0, 10)}T12:00:00Z`);
  if (!Number.isFinite(sourceDay.getTime()) || sourceDay.toISOString().slice(0, 10) !== value.slice(0, 10)) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}
function dayText(date: Date, now: Date, forceYear = false): string {
  const day = `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return forceYear || date.getFullYear() !== now.getFullYear() ? `${String(date.getFullYear()).padStart(4, '0')}-${day}` : day;
}
const time = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`;
const sameDay = (a: Date, b: Date) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
function withoutTime(task: TopbarTaskDate, now: Date, label: string): string {
  const date = calendarDate(task.plannedDate);
  return date ? `${dayText(date, now)} · ${label}` : '未设置';
}

export function topbarTodoDate(task: TopbarTaskDate, now = new Date()): string {
  const date = instant(task.dueAt);
  return date ? `${dayText(date, now)} ${time(date)}` : withoutTime(task, now, '不限时');
}

export function topbarScheduleDate(task: TopbarTaskDate, now = new Date()): string {
  const start = instant(task.dueAt);
  if (!start) return withoutTime(task, now, '时间待定');
  const startText = `${dayText(start, now)} ${time(start)}`;
  const end = instant(task.endAt);
  // Missing/invalid endpoints are not a duration or an all-day appointment.
  if (!end || end.getTime() <= start.getTime()) return `${startText}–时间待定`;
  if (sameDay(start, end)) return `${startText}–${time(end)}`;
  const crossYear = start.getFullYear() !== end.getFullYear();
  return `${dayText(start, now, crossYear)} ${time(start)}–\n${dayText(end, now, crossYear)} ${time(end)}`;
}
