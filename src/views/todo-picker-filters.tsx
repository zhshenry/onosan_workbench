import type { ReactNode } from 'react';
import { isOverdue } from '../../shared/todo-format';

/** Status and kind are the smallest fixed groups already on a todo. Category names are open-ended. */
export type TodoStatusFilter = 'all' | 'todo' | 'doing' | 'done' | 'overdue';
export type TodoKindFilter = 'all' | 'task' | 'meeting';
export type TodoPickerStatusKey = Exclude<TodoStatusFilter, 'all'>;

export const TODO_STATUS_FILTERS: { id: TodoStatusFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'todo', label: '待办' },
  { id: 'doing', label: '进行中' },
  { id: 'done', label: '已完成' },
  { id: 'overdue', label: '已逾期' },
];
export const TODO_KIND_FILTERS: { id: TodoKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'task', label: '事项' },
  { id: 'meeting', label: '日程' },
];
export const TODO_STATUS_LABEL: Record<TodoPickerStatusKey, string> = {
  done: '已完成', overdue: '已逾期', doing: '进行中', todo: '待办',
};

export function todoPickerStatusKey(task: { status: string; kind?: 'task' | 'meeting'; dueAt: string | null; endAt?: string | null; plannedDate: string }): TodoPickerStatusKey {
  if (task.status === 'done') return 'done';
  if (isOverdue(task)) return 'overdue';
  if (task.status === 'doing') return 'doing';
  return 'todo';
}

export function matchesTodoPickerFilter(item: { statusKey?: string; kind?: string }, status: TodoStatusFilter, kind: TodoKindFilter): boolean {
  if (kind !== 'all' && item.kind !== kind) return false;
  if (status !== 'all' && item.statusKey !== status) return false;
  return true;
}

export function TodoPickerFilters({ status, kind, onStatus, onKind }: {
  status: TodoStatusFilter; kind: TodoKindFilter;
  onStatus(next: TodoStatusFilter): void; onKind(next: TodoKindFilter): void;
}): ReactNode {
  return <div className="todo-picker-filters">
    <div role="group" aria-label="按状态筛选"><span>状态</span>
      {TODO_STATUS_FILTERS.map(item => <button key={item.id} type="button" aria-pressed={status === item.id} onClick={() => onStatus(item.id)}>{item.label}</button>)}
    </div>
    <div role="group" aria-label="按类型筛选"><span>类型</span>
      {TODO_KIND_FILTERS.map(item => <button key={item.id} type="button" aria-pressed={kind === item.id} onClick={() => onKind(item.id)}>{item.label}</button>)}
    </div>
  </div>;
}
