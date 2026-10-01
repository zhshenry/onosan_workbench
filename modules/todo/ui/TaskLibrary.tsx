import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, MagnifyingGlass, X } from '@phosphor-icons/react';
import type { Category, Task } from '../../../shared/todo-contracts';
import { Select, errorText, scheduleTimeRange } from './ui';
import type { TodoState } from './TaskEditor';

// 移植自上游 src/TaskLibrary.tsx(行为逐行一致);api 参数化为工作台注入的操作面。
type Filter = 'active' | 'done' | 'deleted';
const FILTERS: { id: Filter; label: string }[] = [
  { id: 'active', label: '未完成' }, { id: 'done', label: '已完成' }, { id: 'deleted', label: '已删除' },
];
function matchesStatus(task: Task, filter: Filter) {
  return filter === 'deleted' ? Boolean(task.deletedAt) : !task.deletedAt && (filter === 'done' ? task.status === 'done' : task.status !== 'done');
}
export interface TaskLibraryApi {
  update(id: string, patch: unknown, revision: string): Promise<TodoState>;
  restore(id: string): Promise<TodoState>;
}
export function TaskLibrary({ tasks, categories, api, changed, edit, close }: {
  tasks: Task[]; categories: Category[]; api: TaskLibraryApi; changed(state: TodoState): void; edit(task: Task): void; close(): void;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('active');
  const [category, setCategory] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => { search.current?.focus(); }, []);
  const categoryMap = new Map(categories.map(item => [item.id, item]));
  const needle = query.trim().toLocaleLowerCase();
  const visible = tasks.filter(task => matchesStatus(task, filter)
    && (!category || (category === 'none' ? !task.categoryId : task.categoryId === category))
    && (!needle || [task.title, task.note, task.plannedDate, task.categoryId ? categoryMap.get(task.categoryId)?.name : '无标签'].join(' ').toLocaleLowerCase().includes(needle)))
    .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || (a.dueAt ?? '').localeCompare(b.dueAt ?? '') || a.createdAt.localeCompare(b.createdAt));
  const picked = visible.filter(task => selected.includes(task.id));
  async function act(items: Task[]) {
    if (busy || !items.length) return;
    setBusy(true); setError(''); setNotice('');
    let count = 0;
    try {
      for (const task of items) {
        const state = filter === 'deleted' ? await api.restore(task.id)
          : await api.update(task.id, { status: filter === 'done' ? 'todo' : 'done' }, task.updatedAt);
        changed(state); count++;
        setSelected(ids => ids.filter(id => id !== task.id));
      }
      setNotice(`已${filter === 'active' ? '完成' : '恢复'} ${count} 项`);
    } catch (cause) { setError(`${count ? `已处理 ${count} 项。` : ''}${errorText(cause)},其余事项保持不变。`); }
    finally { setBusy(false); }
  }
  return <section className="task-library" aria-label="事项库">
    <header className="library-heading"><button type="button" className="text-button" disabled={busy} onClick={close}><ArrowLeft size={16} />返回</button><h2>事项库</h2></header>
    <div className="library-search"><MagnifyingGlass size={17} aria-hidden /><input ref={search} aria-label="搜索事项" placeholder="搜索标题、备注或日期" value={query} onChange={e => { setQuery(e.target.value); setSelected([]); }} />{query ? <button type="button" aria-label="清除搜索" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={16} /></button> : null}</div>
    <div className="library-filters" role="group" aria-label="事项状态">
      {FILTERS.map(item => <button key={item.id} type="button" aria-pressed={filter === item.id} disabled={busy} onClick={() => { setFilter(item.id); setSelected([]); setNotice(''); setError(''); }}>{item.label}<span>{tasks.filter(task => matchesStatus(task, item.id)).length}</span></button>)}
    </div>
    <div className="library-tools"><Select aria-label="标签筛选" value={category} onChange={value => { setCategory(value); setSelected([]); }} options={[{ value: '', label: '全部标签' }, { value: 'none', label: '无标签' }, ...categories.map(item => ({ value: item.id, label: item.name }))]} /><button type="button" disabled={busy} onClick={() => { setSelecting(!selecting); setSelected([]); }}>{selecting ? '取消多选' : '多选'}</button></div>
    {selecting ? <div className="library-batch"><label><input type="checkbox" aria-label="全选筛选结果" disabled={busy || !visible.length} checked={Boolean(visible.length && picked.length === visible.length)} onChange={e => setSelected(e.target.checked ? visible.map(task => task.id) : [])} />已选 {picked.length} 项</label><button type="button" disabled={busy || !picked.length} onClick={() => void act(picked)}>{busy ? '处理中…' : filter === 'active' ? '批量完成' : '批量恢复'}</button></div> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
    <p className="library-result" role="status">{notice || `共 ${visible.length} 项`}</p>
    <ul className="library-list">
      {visible.map((task, index) => {
        const label = task.categoryId ? categoryMap.get(task.categoryId) : undefined;
        return <li key={task.id}>
          {index === 0 || visible[index - 1].plannedDate !== task.plannedDate ? <h3 className="library-date">{task.plannedDate}</h3> : null}
          <div className="library-task">
            {selecting ? <input type="checkbox" aria-label={`选择 ${task.title}`} disabled={busy} checked={selected.includes(task.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, task.id] : ids.filter(id => id !== task.id))} /> : null}
            <button type="button" className="library-task-main" disabled={filter === 'deleted' || busy} aria-label={`编辑 ${task.title}`} onClick={() => edit(task)}><b>{task.title}</b><span><i className="plan-dot" aria-hidden style={{ backgroundColor: label?.color ?? 'var(--todo-muted)' }} />{label?.name ?? '无标签'} · {scheduleTimeRange(task)}{task.status === 'doing' ? ' · 进行中' : ''}</span></button>
            {filter !== 'active' && !selecting ? <button type="button" disabled={busy} aria-label={`恢复 ${task.title}`} onClick={() => void act([task])}>恢复</button> : null}
          </div>
        </li>;
      })}
    </ul>
    {!visible.length ? <p className="library-empty">{query || category ? '没有符合条件的事项,试试其他关键词或标签。' : filter === 'deleted' ? '没有已删除的事项。误删后可在这里恢复。' : filter === 'done' ? '完成的事项会保留在这里。' : '还没有未完成事项,点击「新增」开始记录。'}</p> : null}
  </section>;
}
