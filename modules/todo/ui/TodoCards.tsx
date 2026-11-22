import { useEffect, useEffectEvent, useId, useImperativeHandle, useLayoutEffect, useRef, useState, type ChangeEvent, type ReactNode, type RefObject } from 'react';
import { ChartBar, Check, Clock, Flag, PencilSimple, Target } from '@phosphor-icons/react';
import { scheduledDay, taskPatchSchema, type Category, type Task, type TaskInput } from '../../../shared/todo-contracts';
import { dateText, isOverdue, scheduleStamp, timeText } from '../../../shared/todo-format';
import type { TaskEditHandle } from './TaskEditor';
import { TaskDeadlineFields, TaskProgressField, taskPriorityOptions } from './TaskFormFields';
import { TaskScheduleFields, defaultScheduledTime } from './TaskScheduling';
import { IconButton, Modal, Select, errorText } from './ui';

type CardField = 'title' | 'note' | 'scheduledTime' | 'dateAt' | 'categoryId' | 'priority' | 'progress';
type CardEdit = { taskId: string; field: CardField; trigger: HTMLButtonElement; row: HTMLElement | null };
type CardSave = (task: Task, patch: Partial<TaskInput>) => Promise<void>;
type CardCategories = Map<string, Pick<Category, 'id' | 'name' | 'color'>>;
const fieldNames = { title: '名称', note: '说明', scheduledTime: '时间段', dateAt: '截止时间', categoryId: '标签', priority: '优先级', progress: '进度' };
const isTextField = (field: CardField) => field === 'title' || field === 'note';
const cardPriorityOptions = taskPriorityOptions.map(option => ({ ...option, label: `${option.label}优先级` }));

export function TodoCards({ tasks, today, categories, currentId, armedId, mutating, editHandle, save, openEditor, onCheck, onConfirm, onDisarm, source }: {
  tasks: Task[]; today: string; categories: CardCategories; currentId?: string; armedId: string | null; mutating: boolean;
  editHandle?: RefObject<TaskEditHandle | null>; save: CardSave; openEditor(task: Task): void;
  onCheck(task: Task): void; onConfirm(task: Task): void; onDisarm(): void; source?(task: Task): ReactNode;
}) {
  const [active, setActive] = useState<CardEdit | null>(null);
  const returnFocus = useRef<CardEdit | null>(null);
  const localHandle = useRef<TaskEditHandle>(null);
  const handle = editHandle ?? localHandle;

  useEffect(() => {
    if (active && !tasks.some(task => task.id === active.taskId && task.source !== 'welink')) setActive(null);
  }, [active, tasks]);
  useLayoutEffect(() => {
    if (active || !returnFocus.current) return;
    const { field, trigger, row } = returnFocus.current;
    returnFocus.current = null;
    if (trigger.isConnected && trigger.getClientRects().length) trigger.focus({ preventScroll: true });
    else (row?.querySelector<HTMLElement>(field === 'note' ? '.todo-card-note' : '.todo-card-title')
      ?? row?.querySelector<HTMLElement>('.todo-card-title'))?.focus({ preventScroll: true });
  }, [active]);

  function afterEdit(next: () => void) {
    if (handle.current) handle.current.leave(next);
    else next();
  }
  function begin(task: Task, field: CardField, trigger: HTMLButtonElement) {
    if (active?.taskId === task.id && active.field === field) { handle.current?.leave(); return; }
    afterEdit(() => { onDisarm(); setActive({ taskId: task.id, field, trigger, row: trigger.closest('li') }); });
  }
  function close(restoreFocus: boolean) {
    returnFocus.current = restoreFocus ? active : null;
    setActive(null);
  }

  return <ul className="plan-list todo-card-list">
    {tasks.map(task => {
      const edit = active?.taskId === task.id && task.source !== 'welink' ? active : null;
      const textEdit = edit !== null && isTextField(edit.field);
      const readonly = task.source === 'welink';
      const armed = task.id === armedId;
      const category = categories.get(task.categoryId ?? '');
      const priority = cardPriorityOptions.find(option => option.value === task.priority)?.label;
      const time = task.scheduledTime;
      const overdue = isOverdue(task);
      const editor = edit && <TodoCardEditor key={edit.field} task={task} edit={edit} categories={categories} today={today} handle={handle} save={save} close={close} />;
      const editLabel = (field: CardField) => `编辑${fieldNames[field]} ${task.title}`;
      const chip = (field: CardField, icon: ReactNode, label: string, tooltip = label, tone = '') => {
        const content = <>{icon}<span>{label}</span></>;
        const className = `todo-card-chip${tone ? ' ' + tone : ''}`;
        return readonly ? <span className={className}>{content}</span>
          : <button type="button" className={className} aria-label={editLabel(field)} aria-description={label} aria-haspopup="dialog"
            aria-expanded={edit?.field === field} title={tooltip} disabled={mutating}
            onClick={event => begin(task, field, event.currentTarget)}>{content}</button>;
      };
      return <li key={task.id} className={`todo-card${task.id === currentId ? ' is-current' : ''}${armed ? ' is-armed' : ''}${edit ? ' is-editing' : ''}`}>
        <button type="button" className={`todo-card-check${armed ? ' is-active' : ''}`} aria-label={`${armed ? '取消完成' : '完成'} ${task.title}`}
          disabled={mutating} onClick={() => afterEdit(() => onCheck(task))}>{armed && <Check size={13} weight="bold" aria-hidden="true" />}</button>
        <div className="todo-card-body">
          <div className="todo-card-copy">
            {edit?.field === 'title' ? editor : <button type="button" className="todo-card-title" title={task.title} aria-label={readonly ? `查看 ${task.title}` : editLabel('title')}
              onClick={event => readonly ? openEditor(task) : begin(task, 'title', event.currentTarget)}>{task.title}</button>}
            <div className="todo-card-note-slot">
              {edit?.field === 'note' ? editor : task.note.trim() && <button type="button" className="todo-card-note" title={task.note} aria-label={editLabel('note')}
                onClick={event => readonly ? openEditor(task) : begin(task, 'note', event.currentTarget)}>{task.note}</button>}
            </div>
          </div>
          {!textEdit && editor}
          <div className="todo-card-metadata">
            {time && chip('scheduledTime', <Clock size={14} />, dateText(scheduledDay(time)) + ('date' in time ? ' · 全天' : ' ' + timeText(time.startAt)),
              'date' in time ? '全天时间段' : scheduleStamp({ kind: 'meeting', dateAt: time.startAt, endAt: time.endAt }), 'is-scheduled')}
            {task.dateAt && chip('dateAt', <Target size={14} />, `${scheduleStamp(task)} ${overdue ? '已超期' : '截止'}`, '编辑截止时间', overdue ? 'is-overdue' : '')}
            {category && chip('categoryId', <i className="plan-dot" style={{ backgroundColor: category.color }} />, category.name)}
            {priority && chip('priority', <Flag className="todo-card-priority-flag" data-priority={task.priority} size={14} aria-hidden="true" />, priority, '编辑优先级', task.priority === 'high' ? 'is-important' : '')}
            {task.progress != null && chip('progress', <ChartBar size={14} aria-hidden="true" />, `${task.progress}%`, '编辑进度')}
            {source?.(task)}
          </div>
          {armed && <div className="confirm-bar todo-card-confirm">
            <button type="button" className="confirm-btn" disabled={mutating} onClick={() => onConfirm(task)}>确认完成</button>
            <button type="button" className="confirm-cancel" onClick={onDisarm}>取消</button>
          </div>}
        </div>
        <IconButton className="todo-card-full-edit" label={`编辑 ${task.title}`} title={readonly ? '查看详情' : '完整编辑待办'}
          onClick={() => openEditor(task)}><PencilSimple size={16} aria-hidden="true" /></IconButton>
      </li>;
    })}
  </ul>;
}

function TodoCardEditor({ task, edit, categories, today, handle, save, close }: {
  task: Task; edit: CardEdit; categories: CardCategories; today: string; handle: RefObject<TaskEditHandle | null>;
  save: CardSave; close(restoreFocus: boolean): void;
}) {
  const { field, trigger } = edit;
  const inline = isTextField(field);
  const id = useId();
  const form = useRef<HTMLFormElement>(null);
  const inlineEditor = useRef<HTMLDivElement>(null);
  const submitting = useRef(false);
  const [opened] = useState(task);
  const [initial] = useState(() => ({ title: task.title, note: task.note, scheduledTime: task.scheduledTime ?? (field === 'scheduledTime' ? defaultScheduledTime(today) : null),
    dateAt: task.dateAt, categoryId: task.categoryId, priority: task.priority, progress: task.progress }));
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const dirty = JSON.stringify(initial) !== JSON.stringify(draft);
  useLayoutEffect(() => {
    const control = inline
      ? inlineEditor.current?.querySelector<HTMLElement>('input, textarea')
      : form.current?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"], .select-trigger, .task-schedule-summary, .progress-range');
    control?.focus({ preventScroll: true });
  }, [inline]);
  const saveOnOutsideClick = useEffectEvent((event: MouseEvent) => {
    const editor = inlineEditor.current;
    if (editor && event.target instanceof Node && !editor.contains(event.target)
      && !event.composedPath().some(node => node === trigger || node instanceof HTMLDialogElement)) {
      void commit(undefined, false);
    }
  });
  useEffect(() => {
    if (!inline) return;
    const onClick = (event: MouseEvent) => saveOnOutsideClick(event);
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [inline]);

  function leave(next?: () => void) {
    if (submitting.current || discard) return;
    if (inline && next) { void commit(next); return; }
    const finish = () => { close(!next); next?.(); };
    if (dirty) setDiscard(() => finish);
    else finish();
  }
  useImperativeHandle(handle, () => ({ leave }));

  function change<K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) {
    setDraft(current => ({ ...current, [key]: value }));
    setError('');
    setInvalid(false);
  }
  async function commit(next?: () => void, restoreFocus = !next) {
    if (submitting.current || discard) return;
    if (inline && !dirty) {
      submitting.current = true;
      close(restoreFocus);
      next?.();
      return;
    }
    const patch = { [field]: draft[field] };
    const parsed = taskPatchSchema.safeParse(patch);
    if (!parsed.success) {
      setError(parsed.error.issues[0].path[0] === 'title' && !draft.title.trim() ? '请填写待办名称' : parsed.error.issues[0].message);
      setInvalid(true);
      if (inline) inlineEditor.current?.querySelector<HTMLElement>('input, textarea')?.focus({ preventScroll: true });
      else requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await save(opened, patch);
    } catch (cause) {
      submitting.current = false;
      setError(errorText(cause));
      setBusy(false);
      return;
    }
    close(restoreFocus);
    next?.();
  }

  const errorMessage = error && <p className="error" id={id} role="alert">{error}</p>;
  const discardDialog = discard && <Modal className="confirm task-edit-discard" title="放弃未保存的修改？" close={() => setDiscard(null)}>
    <p>这条待办的修改尚未保存。</p>
    <div className="actions"><button type="button" autoFocus onClick={() => setDiscard(null)}>继续编辑</button>
      <button type="button" className="danger" onClick={discard}>放弃修改</button></div>
  </Modal>;
  if (inline) {
    const textProps = {
      name: field, value: draft[field], readOnly: busy, 'aria-invalid': invalid || undefined,
      'aria-describedby': error ? id : undefined, 'aria-keyshortcuts': 'Enter',
      onChange: (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => change(field, event.target.value),
    };
    return <>
      <div ref={inlineEditor} className="todo-card-inline-edit" aria-busy={busy || undefined} onKeyDown={event => {
        if (event.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return;
        if (event.key === 'Enter' && !(event.shiftKey && field === 'note')) {
          event.preventDefault();
          event.stopPropagation();
          void commit();
        } else if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          leave();
        }
      }}>
        {field === 'title'
          ? <input {...textProps} className="todo-card-title" aria-label="待办名称" maxLength={200} />
          : <textarea {...textProps} className="todo-card-note" aria-label="说明" rows={1} maxLength={5000} />}
        {errorMessage}
      </div>
      {discardDialog}
    </>;
  }

  const formContent = <form ref={form} className="form-body todo-card-edit" aria-label={`编辑${fieldNames[field]}`}
    noValidate aria-busy={busy || undefined} onSubmit={event => { event.preventDefault(); void commit(); }}
    onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }}>
    <fieldset disabled={busy}>
      {field === 'scheduledTime' ? <TaskScheduleFields heading="时间段" value={draft.scheduledTime} day={today} invalid={invalid}
        describedBy={error ? id : undefined} onChange={value => change('scheduledTime', value)} />
        : field === 'dateAt' ? <TaskDeadlineFields id={id} inlineCalendar value={draft.dateAt} onChange={value => change('dateAt', value)} />
        : field === 'progress' ? <TaskProgressField id={id + '-progress'} value={draft.progress ?? 0} onChange={value => change('progress', value)} />
        : field === 'categoryId' ? <Select aria-label="标签" value={draft.categoryId ?? ''} onChange={value => change('categoryId', value || null)}
          options={[{ value: '', label: '无标签' }, ...[...categories.values()].map(category => ({ value: category.id, label: category.name }))]} />
        : <Select aria-label="优先级" value={draft.priority} options={cardPriorityOptions}
          renderOption={option => <span className="todo-card-priority-option"><Flag className="todo-card-priority-flag" data-priority={option.value} size={14} aria-hidden="true" />{option.label}</span>}
          onChange={value => change('priority', value as Task['priority'])} />}
      {errorMessage}
      <div className="todo-card-edit-actions">
        <button type="button" className="btn btn-sec btn-sm" onClick={() => close(true)}>取消</button>
        <button type="submit" className="btn btn-pri btn-sm">{busy ? '保存中…' : '保存'}</button>
      </div>
    </fieldset>
  </form>;
  return <>
    <Modal anchor={trigger} placement="vertical-start" className="todo-card-popover" title={`编辑${fieldNames[field]}`} busy={busy} close={() => leave()}>{formContent}</Modal>
    {discardDialog}
  </>;
}
