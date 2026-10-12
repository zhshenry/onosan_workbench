import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Check, MagnifyingGlass, X } from '@phosphor-icons/react';
import { aiReferenceKey, aiReferenceLimit, type AiReference } from '../../shared/ai-reference';
import type { State } from '../../shared/todo-contracts';
import type { CopyStoreData } from '../../shared/copy-contracts';
import type { BaziStoreData } from '../../shared/bazi-contracts';
import { READING_STATUS_LABEL, type ReadingStoreData } from '../../shared/reading-contracts';
import { isOverdue, scheduleStamp } from '../../shared/todo-format';
import { Select } from '../../modules/todo/ui/ui';

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
    const state = await wb.todo.state() as State;
    const categories = new Map(state.categories.map(category => [category.id, category.name]));
    return state.tasks.filter(task => !task.deletedAt).map(task => {
      const statusKey = task.status === 'done' ? 'done' : isOverdue(task) ? 'overdue' : task.status;
      return { reference: { module: 'todo', taskId: task.id }, title: task.title, kind: task.kind, statusKey,
        status: ({ done: '已完成', overdue: '已逾期', doing: '进行中', todo: '待办' })[statusKey],
        detail: [task.kind === 'meeting' ? '日程' : '待办', scheduleStamp(task), task.categoryId ? categories.get(task.categoryId) : ''].filter(Boolean).join(' · ') };
    });
  }
  if (mode === 'copy') {
    const data = await wb.copy.list() as CopyStoreData;
    return data.drafts.map(draft => ({ reference: { module: 'copy', draftId: draft.id }, title: draft.title || '未命名博客',
      detail: draft.updatedAt ? `更新于 ${new Date(draft.updatedAt).toLocaleDateString('zh-CN')}` : '博客草稿' }));
  }
  if (mode === 'bazi') {
    const data = await wb.bazi.list() as BaziStoreData;
    return data.profiles.map(profile => ({ reference: { module: 'bazi', profileId: profile.id }, title: profile.name,
      detail: `${profile.date} ${profile.time} · ${profile.gender === 1 ? '男' : '女'}${profile.tag ? ` · ${profile.tag}` : ''}` }));
  }
  const data = await wb.reading.list() as ReadingStoreData;
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
  const [type, setType] = useState('all');
  const [status, setStatus] = useState('all');
  const [pending, setPending] = useState(selected);
  const multi = mode === 'copy' || mode === 'bazi';
  const chosen = multi ? pending : selected;
  const limit = mode ? aiReferenceLimit(mode) : 0;
  const label = mode ? REFERENCE_LABELS[mode] : '内容';
  const text = query.trim().toLocaleLowerCase('zh-CN');
  const matches = options.filter(option => (!text || `${option.title} ${option.detail} ${option.status ?? ''}`.toLocaleLowerCase('zh-CN').includes(text))
    && (type === 'all' || option.kind === type) && (status === 'all' || option.statusKey === status));
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
  useLayoutEffect(() => { (search.current ?? closeButton.current)?.focus(); }, []);
  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      const node = event.target as Node;
      if (!menu.current?.contains(node) && !trigger.current?.contains(node)) onClose(false);
    };
    const keydown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || menu.current?.querySelector('.ai-reference-filter-menu')) return;
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
    if (multi) setPending(next); else onChange(next);
  };
  return createPortal(<div id={id} ref={menu} className="ai-reference-dialog" role="dialog" aria-label={`关联已有${label}`} aria-describedby={`${id}-help`}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing || event.keyCode === 229 || (event.target as HTMLElement).closest('.ai-reference-filters, .ai-reference-filter-menu')) return;
      const inputs = [...event.currentTarget.querySelectorAll<HTMLInputElement>('.ai-reference-option input:not(:disabled)')];
      const active = inputs.indexOf(document.activeElement as HTMLInputElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault(); inputs[Math.max(0, Math.min(inputs.length - 1, active + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
      } else if (event.key === 'Enter' && (event.target === search.current || active >= 0)) {
        event.preventDefault(); (inputs[active >= 0 ? active : 0])?.click();
      }
    }}>
    <header className="ai-reference-head"><strong>关联已有{label}</strong><button ref={closeButton} type="button" aria-label="关闭上下文选择器" onClick={() => onClose()}><X size={15} /></button></header>
    {mode ? <>
      <label className="ai-reference-search"><MagnifyingGlass size={15} /><input ref={search} value={query} onChange={event => setQuery(event.target.value)} placeholder={`搜索${label}`} aria-label={`搜索${label}`} />
        {query && <button type="button" aria-label="清空上下文搜索" onClick={() => { setQuery(''); search.current?.focus(); }}><X size={13} /></button>}
      </label>
      {mode === 'todo' && <div className="ai-reference-filters">
        <Select aria-label="筛选事项类型" value={type} onChange={setType} menuClassName="ai-reference-filter-menu" portalContainer={() => menu.current}
          options={[{ value: 'all', label: '全部类型' }, { value: 'task', label: '待办' }, { value: 'meeting', label: '日程' }]} />
        <Select aria-label="筛选事项状态" value={status} onChange={setStatus} menuClassName="ai-reference-filter-menu" portalContainer={() => menu.current}
          options={[{ value: 'all', label: '全部状态' }, { value: 'todo', label: '待办' }, { value: 'doing', label: '进行中' }, { value: 'overdue', label: '已逾期' }, { value: 'done', label: '已完成' }]} />
      </div>}
      {notice && <p className="ai-reference-notice" role="status">{notice}</p>}
      <div className="ai-reference-options" aria-busy={loading}>
        {loading ? <p className="ai-reference-empty" role="status">正在读取{label}…</p> : error ? <div className="ai-reference-empty" role="alert"><p>{error}</p><button type="button" onClick={onRetry}>重新加载</button></div> : matches.map(option => {
          const key = aiReferenceKey(option.reference);
          const checked = chosen.some(reference => aiReferenceKey(reference) === key);
          const disabled = !checked && chosen.length >= limit && multi;
          return <label className={`ai-reference-option${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`} key={key} data-reference-key={key}>
            <span className="ai-reference-control"><input type={multi ? 'checkbox' : 'radio'} name={multi ? undefined : radioName} checked={checked} disabled={disabled}
              onChange={() => toggle(option.reference)} onClick={event => { if (!multi && checked) { event.preventDefault(); toggle(option.reference); } }} />
              <span aria-hidden="true">{checked && <Check size={13} weight="bold" />}</span>
            </span>
            <span className="ai-reference-option-text"><strong title={option.title}>{option.title}</strong><small>{option.detail}</small></span>
            {option.status && <span className={`ai-reference-status ${option.statusKey ?? ''}`}>{option.status}</span>}
          </label>;
        })}
        {!loading && !error && matches.length === 0 && <p className="ai-reference-empty">{text || type !== 'all' || status !== 'all' ? `没有找到匹配的${label}` : `暂无可关联的${label}`}</p>}
      </div>
    </> : <p className="ai-reference-empty" role="status">{unavailable}</p>}
    <footer className="ai-reference-footer"><span id={`${id}-help`}>{mode === 'reading' ? '仅添加已记录书目信息，不含全文或附件' : mode === 'bazi' ? '仅添加对话上下文，沿用本轮盘型' : '仅添加对话上下文'}</span>
      {multi && <><small>已选 {pending.length} / {limit}</small><div className="actions"><button type="button" onClick={() => onClose()}>取消</button><button type="button" className="primary" disabled={loading || Boolean(error)} onClick={() => { onChange(pending); onClose(); }}>使用所选参考</button></div></>}
    </footer>
  </div>, document.body);
}
