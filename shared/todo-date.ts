import { z } from 'zod';

export function localDay(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export const calendarDaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '请填写有效日期').refine(value => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDay(date) === value;
}, '日期无效');
/** Calendar days stay date-only; clock times are absolute instants with an offset. */
export const taskDateSchema = z.union([calendarDaySchema, z.iso.datetime({ offset: true })]).nullable();
export function hasTaskTime(value: string | null | undefined): value is `${string}T${string}` {
  return Boolean(value && value.includes('T'));
}
export function taskDay(task: { dateAt?: string | null }): string | null {
  if (!task.dateAt) return null;
  return hasTaskTime(task.dateAt) ? localDay(new Date(task.dateAt)) : task.dateAt;
}
export function taskDateFrom(day: string, time = ''): string | null {
  if (!day) return null;
  return time ? new Date(`${day}T${time}`).toISOString() : day;
}
/** v3's explicit deadline wins over a stale grouping date. Preserve unrelated metadata. */
export function migrateTaskDate<T extends object>(record: T) {
  const legacy = record as T & { plannedDate?: string; dueAt?: string | null; dateAt?: string | null };
  const { plannedDate, dueAt, ...rest } = legacy;
  const dateAt = Object.hasOwn(record, 'dateAt') ? legacy.dateAt : dueAt ?? plannedDate ?? null;
  return { ...rest, dateAt: taskDateSchema.parse(dateAt) };
}
