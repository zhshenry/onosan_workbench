import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, Check, Circle, MagnifyingGlass, X } from '@phosphor-icons/react';
import { aiReferenceKey, aiReferenceLimit, type AiReference } from '../../shared/ai-reference';
import { READING_STATUS_LABEL } from '../../shared/reading-contracts';
import { scheduleStamp } from '../../shared/todo-format';
import { matchesTodoPickerFilter, TODO_STATUS_LABEL, TodoPickerFilters, todoPickerStatusKey, type TodoKindFilter, type TodoStatusFilter } from './todo-picker-filters';

export type ReferenceMode = AiReference['module'];
export interface ReferenceOption {
  reference: AiReference;
  title: string;
  detail: string;
  status?: string;
  statusKey?: string;
  kind?: 'task' | 'meeting';
}
export const REFERENCE_LABELS: Record<ReferenceMode, string> = { todo: '事项', copy: '博文', bazi: '命例', reading: '书目' };

/** Only the visible picker source is read. The renderer never supplies snapshot content to AI. */
export async function loadReferenceOptions(mode: ReferenceMode): Promise<ReferenceOption[]> {
  const wb = window.workbench;
  if (mode === 'todo') {
    const state = await wb.todo.state();
    const categories = new Map(state.categories.map(category => [category.id, category.name]));
    return state.tasks.filter(task => !task.deletedAt).map(task => {
      const statusKey = todoPickerStatusKey(task);
      return { reference: { module: 'todo', taskId: task.id }, title: task.title, kind: task.kind, statusKey,
        status: TODO_STATUS_LABEL[statusKey],
        detail: [task.kind === 'meeting' ? '日程' : '待办', scheduleStamp(task), task.categoryId ? categories.get(task.categoryId) : ''].filter(Boolean).join(' · ') };
    });
  }
  if (mode === 'copy') {
    const data = await wb.copy.list();
    return data.drafts.map(draft => ({ reference: { module: 'copy', draftId: draft.id }, title: draft.title || '未命名博客',
      detail: draft.updatedAt ? `更新于 ${new Date(draft.updatedAt).toLocaleDateString('zh-CN')}` : '博客草稿' }));
  }
  if (mode === 'bazi') {
    const data = await wb.bazi.list();
    return data.profiles.map(profile => ({ reference: { module: 'bazi', profileId: profile.id }, title: profile.name,
      detail: `${profile.date} ${profile.time} · ${profile.gender === 1 ? '男' : '女'}${profile.tag ? ` · ${profile.tag}` : ''}` }));
  }
  const data = await wb.reading.list();
  return data.books.map(book => ({ reference: { module: 'reading', profileId: book.id }, title: book.title,
    detail: [book.author, ...(book.tags ?? [])].filter(Boolean).join(' · ') || '已记录书目', status: READING_STATUS_LABEL[book.status], statusKey: book.status }));
}

export function AiReferencePicker({ id, mode, unavailable, options, selected, loading, error, notice, anchor, trigger, onChange, onRetry, onClose }: {
  id: string; mode: ReferenceMode | null; unavailable: string; options: ReferenceOption[]; selected: AiReference[];
  loading: boolean; error: string; notice: string; anchor: RefObject<HTMLDivElement | null>; trigger: RefObject<HTMLButtonElement | null>;
  onChange(references: AiReference[]): void; onRetry(): void; onClose(restoreFocus?: boolean): void;
}) {
  const menu = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const radioName = useId();
  const [query, setQuery] = useState('');
  const [pending, setPending] = useState(selected);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<TodoKindFilter>('all');
  const lightList = mode === 'todo';
  const multi = mode === 'copy' || mode === 'bazi';
  const chosen = multi ? pending : selected;
  const limit = mode ? aiReferenceLimit(mode) : 0;
  const label = mode ? REFERENCE_LABELS[mode] : '内容';
  const text = query.trim().toLocaleLowerCase('zh-CN');
  const searched = lightList ? options : options.filter(option => !text || `${option.title} ${option.detail} ${option.status ?? ''}`.toLocaleLowerCase('zh-CN').includes(text));
  const matches = lightList ? searched.filter(option => matchesTodoPickerFilter(option, statusFilter, kindFilter)) : searched;
  // A source refresh can invalidate a pending item without ever committing it.
  useEffect(() => {
    if (loading || error) return;
    setPending(previous => previous.filter(reference => options.some(option => aiReferenceKey(option.reference) === aiReferenceKey(reference))));
  }, [options, loading, error]);
  useLayoutEffect(() => {
    const element = menu.current; const rect = anchor.current?.getBoundingClientRect();
    if (!element || !rect) return;
    element.style.width = `${Math.min(rect.width || 320, window.innerWidth - 16)}px`;
    element.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - (rect.width || 320) - 8))}px`;
    element.style.bottom = `${Math.max(8, window.innerHeight - rect.top + 6)}px`;
    element.style.maxHeight = `${Math.max(120, rect.top - 14)}px`;
  });
  useLayoutEffect(() => {
    if (!lightList) { (search.current ?? closeButton.current)?.focus(); return; }
    const element = menu.current;
    if (!element || (document.activeElement !== element && element.contains(document.activeElement))) return;
    const target = element.querySelector<HTMLInputElement>('.ai-reference-option input:checked')
      ?? element.querySelector<HTMLInputElement>('.ai-reference-option input')
      ?? element.querySelector<HTMLButtonElement>('.ai-reference-empty button') ?? element;
    target.focus();
    target.closest('.ai-reference-option')?.scrollIntoView?.({ block: 'nearest' });
  }, [lightList, loading, error, options]);
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const node = event.target as Node;
      if (!menu.current?.contains(node) && !trigger.current?.contains(node)) onClose(false);
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); onClose();
    };
    const resize = (): void => onClose();
    document.addEventListener('pointerdown', outside);
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('resize', resize);
    return () => {
      document.removeEventListener('pointerdown', outside);
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('resize', resize);
    };
  }, [onClose]);
  const toggle = (reference: AiReference): void => {
    const exists = chosen.some(item => aiReferenceKey(item) === aiReferenceKey(reference));
    const next = exists ? chosen.filter(item => aiReferenceKey(item) !== aiReferenceKey(reference)) : multi ? [...chosen, reference].slice(0, limit) : [reference];
    if (multi) setPending(next);
    else { onChange(next); if (lightList) onClose(); }
  };
  return createPortal(<div id={id} ref={menu} className={`ai-reference-dialog${lightList ? ' ai-reference-light-list' : ''}`} role="dialog" tabIndex={-1} aria-label={`关联已有${label}`} aria-describedby={lightList ? undefined : `${id}-help`}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229) return;
      const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('.ai-reference-option input:not(:disabled)')];
      const active = inputs.indexOf(document.activeElement as HTMLInputElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || (lightList && (event.key === 'Home' || event.key === 'End'))) {
        event.preventDefault();
        const index = event.key === 'Home' ? 0 : event.key === 'End' ? inputs.length - 1 : Math.max(0, Math.min(inputs.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)));
        inputs[index]?.focus(); inputs[index]?.closest('.ai-reference-option')?.scrollIntoView?.({ block: 'nearest' });
      } else if ((event.key === 'Enter' || (lightList && event.key === ' ')) && (event.target === search.current || active >= 0)) {
        event.preventDefault(); (inputs[active >= 0 ? active : 0])?.click();
      }
    }}>
    {!lightList && <header className="ai-reference-head"><strong>关联已有{label}</strong><button ref={closeButton} type="button" aria-label="关闭上下文选择器" onClick={() => onClose()}><X size={15} /></button></header>}
    {mode ? <>
      {lightList && <TodoPickerFilters status={statusFilter} kind={kindFilter} onStatus={setStatusFilter} onKind={setKindFilter} />}
      {!lightList && <label className="ai-reference-search"><MagnifyingGlass size={15} /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder={`搜索${label}`} aria-label={`搜索${label}`} />
        {query && <button type="button" aria-label="清空上下文搜索" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={13} /></button>}
      </label>}
      {notice && <p className="ai-reference-notice" role="status">{notice}</p>}
      <div className="ai-reference-options" aria-busy={loading}>
        {loading ? <p className="ai-reference-empty" role="status">正在读取{label}…</p> : error ? <div className="ai-reference-empty" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>重新加载</button></div> : matches.map(option => {
          const key = aiReferenceKey(option.reference);
          const checked = chosen.some(reference => aiReferenceKey(reference) === key);
          const disabled = !checked && chosen.length >= limit && multi;
          return <label className={`ai-reference-option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} key={key} data-reference-key={key} title={lightList ? `${option.title}\n${option.detail}${option.status ? ` · ${option.status}` : ''}` : undefined}>
            {lightList && <span className={`ai-reference-kind ${option.kind ?? 'task'}`} aria-hidden="true">{option.kind === 'meeting' ? <CalendarBlank size={16} weight="bold" /> : <Circle size={10} weight="fill" />}</span>}
            <span className="ai-reference-control"><input type={multi ? 'checkbox' : 'radio'} name={multi ? undefined : radioName} checked={checked} disabled={disabled}
              onChange={() => toggle(option.reference)} onClick={event => { if (!multi && checked) { event.preventDefault(); toggle(option.reference); } }} />
              <span aria-hidden="true">{checked && <Check size={13} weight="bold" />}</span>
            </span>
            <span className="ai-reference-option-text"><strong title={option.title}>{option.title}</strong><small>{option.detail}</small></span>
            {option.status && <span className={`ai-reference-status ${option.statusKey ?? ''}`}>{option.status}</span>}
            {lightList && <span className="ai-reference-selected-mark" aria-hidden="true">{checked && <Check size={12} weight="bold" />}</span>}
          </label>;
        })}
        {!loading && !error && matches.length === 0 && <p className="ai-reference-empty" role="status">{lightList && options.length > 0 ? '没有符合筛选的事项' : text ? `没有找到匹配的${label}` : `暂无可关联的${label}`}</p>}
      </div>
    </> : <p className="ai-reference-empty" role="status">{unavailable}</p>}
    {!lightList && <footer className="ai-reference-footer"><span id={`${id}-help`}>{mode === 'reading' ? '仅添加已记录书目信息，不含全文或附件' : mode === 'bazi' ? '仅添加对话上下文，沿用本轮盘型' : '仅添加对话上下文'}</span>
      {multi && <><small>已选 {pending.length} / {limit}</small><div className="actions"><button type="button" onClick={() => onClose()}>取消</button><button type="button" className="primary" disabled={loading || Boolean(error)} onClick={() => { onChange(pending); onClose(); }}>使用所选参考</button></div></>}
    </footer>}
  </div>, document.body);
}
