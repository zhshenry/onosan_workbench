import type { ReactNode } from 'react';
import { isOverdue } from '../../shared/todo-format';

/** Status and kind are the smallest fixed groups already on a todo. Category names are open-ended. */
export type TodoPickerStatusKey = 'todo' | 'doing' | 'done' | 'overdue';
export type TodoStatusFilter = readonly TodoPickerStatusKey[];
export type TodoKindFilter = 'all' | 'task' | 'meeting';

const ALL_TODO_STATUSES: TodoStatusFilter = ['todo', 'doing', 'done', 'overdue'];
export const DEFAULT_TODO_STATUS_FILTER: TodoStatusFilter = ['todo', 'doing', 'overdue'];
export const TODO_KIND_FILTERS: { id: TodoKindFilter; label: string }[] = [
  { id: 'all', label: '全部' },
  { id: 'task', label: '待办' },
  { id: 'meeting', label: '日程' },
];
export const TODO_STATUS_LABEL: Record<TodoPickerStatusKey, string> = {
  done: '已完成', overdue: '已逾期', doing: '进行中', todo: '未开始',
};

export function todoPickerStatusKey(task: { status: string; kind?: 'task' | 'meeting'; dateAt: string | null; endAt?: string | null }): TodoPickerStatusKey {
  if (task.status === 'done') return 'done';
  if (isOverdue(task)) return 'overdue';
  if (task.status === 'doing') return 'doing';
  return 'todo';
}

export function matchesTodoPickerFilter(item: { statusKey?: string; kind?: string }, status: TodoStatusFilter, kind: TodoKindFilter): boolean {
  if (kind !== 'all' && item.kind !== kind) return false;
  return status.some(value => value === (item.statusKey ?? 'todo'));
}

export function TodoPickerFilters({ status, kind, onStatus, onKind }: {
  status: TodoStatusFilter; kind: TodoKindFilter;
  onStatus(next: TodoStatusFilter): void; onKind(next: TodoKindFilter): void;
}): ReactNode {
  return <div className="todo-picker-filters">
    <div role="group" aria-label="按状态筛选"><span>状态</span>
      <button type="button" aria-pressed={status.length === ALL_TODO_STATUSES.length} onClick={() => onStatus(ALL_TODO_STATUSES)}>全部</button>
      {ALL_TODO_STATUSES.map(value => {
        const pressed = status.includes(value);
        return <button key={value} type="button" aria-pressed={pressed}
          onClick={() => onStatus(pressed ? status.filter(item => item !== value) : [...status, value])}>{TODO_STATUS_LABEL[value]}</button>;
      })}
    </div>
    <div role="group" aria-label="按类型筛选"><span>类型</span>
      {TODO_KIND_FILTERS.map(item => <button key={item.id} type="button" aria-pressed={kind === item.id} onClick={() => onKind(item.id)}>{item.label}</button>)}
    </div>
  </div>;
}
