import { useId, useImperativeHandle, useLayoutEffect, useRef, useState, type FormEvent, type Ref } from 'react';
import { ArrowUpRight, CaretLeft, Clock, LinkSimple, MapPin, Plus, Tag, Target, TextAlignLeft, Users } from '@phosphor-icons/react';
import { localDay, newTask, taskInputSchema, type Category, type ScheduledTime, type Task, type TaskInput, type TimedSchedule } from '../../../shared/todo-contracts';
import type { TodoState } from '../../../shared/workbench-api';
import { hasTaskTime, taskDay } from '../../../shared/todo-date';

/** 工作台注入的待办操作面(上游为 DesktopAPI 的子集,行为一致) */
export type { TodoState } from '../../../shared/workbench-api';
export interface TaskEditHandle { leave(next?: () => void): void; }
export interface TaskEditorApi {
  create(input: unknown): Promise<TodoState>;
  update(id: string, patch: unknown, revision: string): Promise<TodoState>;
  remove(id: string, revision: string): Promise<TodoState>;
  createCategory(input: unknown): Promise<TodoState>;
}
import { DEFAULT_TAG_COLOR, TagColorPresets } from './TagColorPresets';
import { TaskScheduleFields } from './TaskScheduling';
import { DatePicker, Modal, Segmented, Select, errorText, dateTimeText } from './ui';
import { ScheduleClock, TaskDeadlineFields, TaskFieldRow, TaskProgressField, taskPriorityOptions } from './TaskFormFields';

function localTime(iso: string | null): string {
  if (!hasTaskTime(iso)) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dueAtFrom(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function defaultMeetingEndAt(startAt: string): string {
  const start = new Date(startAt);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  if (localDay(end) !== localDay(start)) end.setHours(23, 59, 0, 0);
  return end.toISOString();
}
function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
function meetingSchedule({ dateAt, endAt }: Pick<TaskInput, 'dateAt' | 'endAt'>): ScheduledTime | null {
  if (!dateAt) return null;
  return hasTaskTime(dateAt) ? { startAt: dateAt, endAt: endAt ?? defaultMeetingEndAt(dateAt) } : { date: dateAt };
}
export function TaskEditor({ task: currentTask, initialTitle, initialKind, initialSchedule, lockKind = false, meetingSource, id, categories, api, close, saved, changed, page }: { task?: Task; initialTitle?: string; initialKind?: TaskInput['kind']; initialSchedule?: TimedSchedule; lockKind?: boolean; meetingSource?: { title: string; open(): void }; id?: string; categories: Category[]; api: TaskEditorApi; close(restoreFocus?: boolean): void; saved(state: TodoState, message: string): void | Promise<void>; changed(state: TodoState): void; page?: { backLabel?: string; handle: Ref<TaskEditHandle> } }) {
  const embedded = !!page && !page.backLabel;
  const [openedTask] = useState(currentTask);
  const task = embedded ? openedTask : currentTask;
  const [draft, setDraft] = useState<TaskInput>(() => {
    if (task) return { title: task.title, kind: task.kind, status: task.status, priority: task.priority, dateAt: task.dateAt, endAt: task.endAt ?? null, scheduledTime: task.scheduledTime, remindAt: task.remindAt, categoryId: task.categoryId, progress: task.progress, note: task.note, attendees: task.attendees, location: task.location, meetingUrl: task.meetingUrl };
    const fresh = newTask(initialTitle);
    if (!initialSchedule) return initialKind ? { ...fresh, kind: initialKind } : fresh;
    return initialKind === 'meeting' ? { ...fresh, kind: 'meeting', dateAt: initialSchedule.startAt, endAt: initialSchedule.endAt }
      : { ...fresh, scheduledTime: initialSchedule };
  });
  const initial = useRef(JSON.stringify(draft));
  const todoDeadline = useRef(draft.kind === 'task' ? draft.dateAt : null);
  const [error, setError] = useState(''); const [invalid, setInvalid] = useState('');
  const [pendingAction, setPendingAction] = useState<'save' | 'delete' | null>(null);
  const busy = pendingAction !== null;
  const removing = pendingAction === 'delete';
  const [deleting, setDeleting] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false); const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryName, setCategoryName] = useState(''); const [categoryColor, setCategoryColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [remindOn, setRemindOn] = useState(() => Boolean(draft.remindAt));
  const [reminderDate, setReminderDate] = useState(() => localInput(draft.remindAt).slice(0, 10));
  const [reminderTime, setReminderTime] = useState(() => localTime(draft.remindAt));
  const [showNote, setShowNote] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const moreSettings = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    const input = titleRef.current;
    const panel = embedded && input?.closest('[role="tabpanel"]');
    if (panel && document.activeElement?.getAttribute('aria-controls') === panel.id) return;
    input?.focus({ preventScroll: true });
  }, [embedded]);
  const hasDraft = JSON.stringify(draft) !== initial.current || remindOn !== Boolean(task?.remindAt) || (addingCategory && Boolean(categoryName.trim()));
  const [discardEdit, setDiscardEdit] = useState<(() => void) | null>(null);
  const discardDescriptionId = useId();
  const continueEditing = () => setDiscardEdit(null);
  function leavePage(next?: () => void) {
    if (busy || categoryBusy || discardEdit) return;
    const finish = () => { close(!next); next?.(); };
    if (hasDraft) setDiscardEdit(() => finish);
    else finish();
  }
  useImperativeHandle(page?.handle, () => ({ leave: leavePage }));
  function change<K extends keyof TaskInput>(key: K, value: TaskInput[K]) { setDraft(d => ({ ...d, [key]: value })); setError(''); setInvalid(''); setDeleting(false); }
  function changeKind(next: TaskInput['kind']) {
    if (next === draft.kind) return;
    if (draft.kind === 'task') todoDeadline.current = draft.dateAt;
    const time = draft.kind === 'task' ? draft.scheduledTime : meetingSchedule(draft);
    setDraft(current => ({
      ...current, kind: next,
      dateAt: next === 'task' ? todoDeadline.current : time ? 'date' in time ? time.date : time.startAt : null,
      endAt: next === 'meeting' && time && 'endAt' in time ? time.endAt : null,
      scheduledTime: next === 'task' ? time ?? null : null,
    }));
    setError(''); setInvalid(''); setDeleting(false);
  }
  function changeMeetingTime(value: ScheduledTime | null) {
    setDraft(current => ({
      ...current, dateAt: value ? 'date' in value ? value.date : value.startAt : null,
      endAt: value && 'endAt' in value ? value.endAt : null,
    }));
    setError(''); setInvalid(''); setDeleting(false);
  }
  function changeReminder(value: string | null) {
    const local = localInput(value);
    setReminderDate(local.slice(0, 10)); setReminderTime(local.slice(11, 16));
    change('remindAt', value);
  }
  function changeReminderDate(value: string) {
    setReminderDate(value);
    change('remindAt', dueAtFrom(value, reminderTime));
  }
  function changeReminderTime(value: string) {
    setReminderTime(value);
    change('remindAt', dueAtFrom(reminderDate, value));
  }
  function toggleRemind() {
    const on = !remindOn;
    setRemindOn(on);
    changeReminder(on ? draft.remindAt ?? (hasTaskTime(draft.dateAt) ? draft.dateAt : null) : null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || categoryBusy) return;
    const parsed = taskInputSchema.safeParse(draft);
    if ((remindOn && !draft.remindAt) || (draft.kind === 'meeting' && !draft.dateAt) || !parsed.success) {
      const issue = !parsed.success ? parsed.error.issues[0] : undefined;
      const field = remindOn && !draft.remindAt ? 'remindAt'
        : draft.kind === 'meeting' && !draft.dateAt ? 'dateAt' : String(issue?.path[0] ?? '');
      setInvalid(field);
      setError(field === 'title' ? (draft.kind === 'meeting' ? '请填写日程名称' : '请填写待办名称')
        : field === 'remindAt' ? '请填写提醒日期和时间，或关闭提醒'
        : (field === 'dateAt' && draft.kind === 'meeting' && !draft.dateAt) ? '请设置日程时间'
        : issue?.message || '请检查事项内容');
      if (field === 'note') setShowNote(true);
      if (moreSettings.current && (['remindAt', 'priority', 'progress'].includes(field) || draft.kind === 'meeting' && field === 'categoryId')) {
        moreSettings.current.open = true;
      }
      const ids: Record<string, string> = { dateAt: 'task-date', remindAt: 'task-reminder-date', attendees: 'task-attendees',
        meetingUrl: 'task-meeting-url', location: 'task-location', note: 'task-note', priority: 'task-priority', categoryId: 'task-category', progress: 'task-progress' };
      requestAnimationFrame(() => {
        const control = titleRef.current?.form?.querySelector<HTMLElement>('[aria-invalid="true"]')
          ?? document.getElementById(ids[field] ?? 'task-title');
        control?.focus();
      });
      return;
    }
    setPendingAction('save');
    try {
      const state = task ? await api.update(task.id, parsed.data, task.updatedAt) : await api.create(parsed.data);
      const savedState = saved(state, kindLabel + '已保存');
      if (page) await savedState;
      close();
    }
    catch (e) { setError(errorText(e)); } finally { setPendingAction(null); }
  }
  async function confirmRemove() {
    if (!task || busy || categoryBusy) return;
    if (!deleting) { setDeleting(true); return; }
    setPendingAction('delete'); setError('');
    try {
      const savedState = saved(await api.remove(task.id, task.updatedAt), task.kind === 'meeting' ? '日程已删除' : '待办已删除');
      if (page) await savedState;
      close();
    }
    catch (e) { setError(errorText(e)); setDeleting(false); }
    finally { setPendingAction(null); }
  }
  async function addCategory() {
    if (!categoryName.trim() || categoryBusy) return;
    setCategoryBusy(true); setError('');
    try {
      const state = await api.createCategory({ name: categoryName, color: categoryColor });
      const created = state.categories.find(category => category.name.toLocaleLowerCase('zh-CN') === categoryName.trim().toLocaleLowerCase('zh-CN'));
      changed(state);
      if (created) change('categoryId', created.id);
      setAddingCategory(false); setCategoryName('');
    } catch (e) { setError(errorText(e)); } finally { setCategoryBusy(false); }
  }
  const isMeeting = draft.kind === 'meeting';
  const kindLabel = isMeeting ? '日程' : '待办';
  const pickerDirection = task && !page ? 'down' : 'auto';
  const showTypeSwitch = (!page || task?.kind !== 'meeting');
  const taskType = { value: 'task', label: '待办' }, meetingType = { value: 'meeting', label: '日程' };
  const typeSwitch = showTypeSwitch && (lockKind ? <span className="task-kind-label">{isMeeting ? '日程' : '待办'}</span> : <Segmented aria-label="类型" value={draft.kind} onChange={value => changeKind(value as TaskInput['kind'])} options={task ? [taskType, meetingType] : [meetingType, taskType]} />);
  const errorId = error ? 'task-error' : undefined;
  const reminderFields = remindOn && <TaskFieldRow icon={<Clock size={18} />}>
    <div className="task-scheduling" role="group" aria-label="提醒日期和时间">
      <div className="task-schedule-range">
        <DatePicker id="task-reminder-date" aria-label="提醒日期" value={reminderDate}
          onChange={changeReminderDate} direction={pickerDirection} aria-invalid={invalid === 'remindAt'} aria-describedby={errorId} />
        <div className="task-schedule-clocks task-reminder-clock">
          <ScheduleClock id="task-reminder-time" label="提醒时间" value={reminderTime} clearLabel="清除时间"
            onChange={changeReminderTime} invalid={invalid === 'remindAt'} describedBy={errorId} />
        </div>
      </div>
      <div className="reminder-presets">
        <button type="button" className="btn btn-sec btn-sm" disabled={!hasTaskTime(draft.dateAt)} onClick={() => changeReminder(draft.dateAt)}>准时</button>
        <button type="button" className="btn btn-sec btn-sm" disabled={!hasTaskTime(draft.dateAt)} onClick={() => changeReminder(new Date(Date.parse(draft.dateAt!) - 600000).toISOString())}>提前10分钟</button>
      </div>
    </div>
  </TaskFieldRow>;
  const category = draft.categoryId ? categories.find(item => item.id === draft.categoryId) : null;
  const tags = <>
    <div className="task-editor-value-row">
      <Select id="task-category" aria-label="标签" title={category?.name} value={draft.categoryId ?? ''}
        onChange={value => change('categoryId', value || null)}
        options={[{ value: '', label: '无标签' }, ...categories.map(item => ({ value: item.id, label: item.name }))]} />
      <button type="button" className="text-button" aria-expanded={addingCategory} disabled={categoryBusy}
        onClick={() => setAddingCategory(!addingCategory)}>{addingCategory ? '取消新建' : '新建标签'}</button>
    </div>
    {addingCategory && <div className="inline-category-editor">
      <input aria-label="新标签名称" value={categoryName} maxLength={30} onChange={event => setCategoryName(event.target.value)} placeholder="例如：工作" autoFocus />
      <TagColorPresets value={categoryColor} onChange={setCategoryColor} />
      <button type="button" className="btn btn-pri btn-sm" disabled={!categoryName.trim() || categoryBusy} aria-busy={categoryBusy || undefined}
        onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '创建并选中'}</button>
    </div>}
  </>;
  const meetingTime = task?.external?.isAllDay && taskDay(draft) ? { date: taskDay(draft)! } : meetingSchedule(draft);
  const meetingLink = draft.meetingUrl?.trim();
  const fields = <>
    <div className="task-editor-rows" aria-label={isMeeting ? '日程字段' : '待办字段'} role="group">
      <TaskFieldRow icon={<Clock size={18} />}>
        <TaskScheduleFields heading="时间" collapsible day={localDay()} value={isMeeting ? meetingTime : draft.scheduledTime}
          invalid={isMeeting ? invalid === 'dateAt' || invalid === 'endAt' : invalid === 'scheduledTime'}
          describedBy={errorId} onChange={value => isMeeting ? changeMeetingTime(value) : change('scheduledTime', value)} />
      </TaskFieldRow>
      {isMeeting ? <>
        <TaskFieldRow icon={<Users size={18} />}>
          <input className="task-editor-inline-input" id="task-attendees" aria-label="邀请对象" placeholder="添加邀请对象"
            value={draft.attendees ?? ''} maxLength={2000} onChange={event => change('attendees', event.target.value)}
            aria-invalid={invalid === 'attendees'} aria-describedby={errorId} />
        </TaskFieldRow>
        <TaskFieldRow icon={<LinkSimple size={18} />}>
          <div className="task-editor-value-row">
            <input className="task-editor-inline-input" id="task-meeting-url" type="url" aria-label="会议链接" placeholder="添加会议链接"
              value={draft.meetingUrl ?? ''} maxLength={2048} onChange={event => change('meetingUrl', event.target.value)}
              aria-invalid={invalid === 'meetingUrl'} aria-describedby={errorId} />
            {task && meetingLink && <button type="button" className="text-button" onClick={() => {
              void window.workbench.ai.openLink(meetingLink).catch(cause => setError(errorText(cause)));
            }}>打开会议链接</button>}
          </div>
        </TaskFieldRow>
        <TaskFieldRow icon={<MapPin size={18} />}>
          <input className="task-editor-inline-input" id="task-location" aria-label="地点" placeholder="添加地点"
            value={draft.location ?? ''} maxLength={500} onChange={event => change('location', event.target.value)}
            aria-invalid={invalid === 'location'} aria-describedby={errorId} />
        </TaskFieldRow>
      </> : <TaskFieldRow icon={<Target size={18} />}>
        <TaskDeadlineFields id="task-date" value={draft.dateAt} onChange={value => change('dateAt', value)} invalid={invalid === 'dateAt'} describedBy={errorId} />
      </TaskFieldRow>}
      <TaskFieldRow icon={<TextAlignLeft size={18} />}>
        {showNote ? <textarea id="task-note" aria-label="说明" className="task-editor-description resize-none" value={draft.note}
          rows={3} maxLength={5000} onChange={event => change('note', event.target.value)} placeholder="添加说明"
          aria-invalid={invalid === 'note'} aria-describedby={errorId} />
          : <button type="button" className="task-editor-row-trigger task-editor-note-trigger" aria-label={draft.note.trim() ? '编辑说明' : '添加说明'}
            onClick={() => { setShowNote(true); requestAnimationFrame(() => document.getElementById('task-note')?.focus()); }}>
            {draft.note.trim() || '添加说明'}
          </button>}
      </TaskFieldRow>
      {!isMeeting && <TaskFieldRow icon={<Tag size={18} />}>{tags}</TaskFieldRow>}
    </div>
    <details className="task-editor-settings" ref={moreSettings}>
      <summary>更多设置</summary>
      <div className="task-editor-settings-body">
        {isMeeting ? <div><label htmlFor="task-category">标签</label>{tags}</div>
          : <div><label htmlFor="task-priority">优先级</label><Select id="task-priority" aria-label="优先级"
            value={draft.priority} onChange={value => change('priority', value as TaskInput['priority'])}
            options={taskPriorityOptions} /></div>}
        <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={remindOn} aria-label="提醒" onClick={toggleRemind} /><span>提醒</span></div>
        {reminderFields}
        {task && <div><label htmlFor="task-status">状态</label><Select id="task-status" value={draft.status} onChange={value => change('status', value as TaskInput['status'])}
          options={[{ value: 'todo', label: '未开始' }, { value: 'doing', label: '进行中' }, { value: 'done', label: '已完成' }]} /></div>}
        <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={draft.progress !== null} aria-label="进度"
          onClick={() => change('progress', draft.progress === null ? 0 : null)} /><span>维护进度</span></div>
        {draft.progress !== null && <TaskProgressField id="task-progress" value={draft.progress} onChange={value => change('progress', value)} />}
      </div>
    </details>
  </>;

  if (!task) return <Modal id={id} className="task-modal task-create-modal agenda-create-modal" title={'新建' + kindLabel}
    titleIcon={<Plus size={18} />} closeText="返回" close={close} dirty={hasDraft} busy={busy || categoryBusy}>
    <form noValidate onSubmit={submit} className="form-body agenda-create-form">
      <div className="task-fields">
        <input id="task-title" ref={titleRef} aria-label={isMeeting ? '日程名称' : '待办名称'} value={draft.title} maxLength={200}
          onChange={event => change('title', event.target.value)} placeholder="输入标题"
          aria-invalid={invalid === 'title'} aria-describedby={errorId} />
        {typeSwitch}
        {fields}
      </div>
      {error && <p className="error" id="task-error" role="alert">{error}</p>}
      <div className="actions sticky-actions">
        <button className="btn btn-pri btn-sm" disabled={busy || categoryBusy || !draft.title.trim()} aria-busy={busy || undefined}
          type="submit">{busy ? '创建中…' : '创建'}</button>
      </div>
    </form>
  </Modal>;

  const headingExtra = typeSwitch;
  const form = <>
    {meetingSource && <div className="task-meeting-source"><span>来源会议</span><button type="button" onClick={page ? () => leavePage(meetingSource.open) : meetingSource.open}>{meetingSource.title}<ArrowUpRight size={14} /></button></div>}
    <form noValidate onSubmit={submit} className="form-body">
      <div className="task-fields">
        <label htmlFor="task-title">{isMeeting ? '日程名称' : '待办名称'}</label>
        <input id="task-title" ref={titleRef} value={draft.title} maxLength={200} onChange={event => change('title', event.target.value)}
          placeholder={isMeeting ? '输入日程标题' : '输入待办标题'} aria-invalid={invalid === 'title'} aria-describedby={errorId} />
        {fields}
        {task.updatedAt && <p className="field-help">最近更新 {dateTimeText(task.updatedAt)}</p>}
      </div>
      {error ? <p className="error" id="task-error" role="alert">{error}</p> : null}
      <div className="actions sticky-actions">
        {task ? <button type="button" className={`${page ? 'btn btn-sm ' : ''}${deleting || removing ? 'danger shake' : 'text-danger'}`}
          disabled={busy || categoryBusy} aria-busy={removing || undefined} title={deleting && !busy && !categoryBusy ? '再点一次确认删除' : undefined}
          onClick={() => void confirmRemove()}>{removing ? '删除中…' : deleting ? '确认删除' : '删除'}</button> : null}
        {page && <button type="button" className="btn btn-sec btn-sm task-edit-cancel" disabled={busy || categoryBusy} onClick={() => leavePage()}>取消</button>}
        <button className={page ? 'btn btn-pri btn-sm' : 'primary'} disabled={busy || categoryBusy} aria-busy={pendingAction === 'save' || undefined}
          type="submit">{pendingAction === 'save' ? '保存中…' : isMeeting ? '保存日程' : '保存待办'}</button>
      </div>
    </form>
  </>;

  const title = '编辑' + kindLabel;
  if (!page) return <Modal className="task-modal" title={title} close={close} dirty={hasDraft} busy={busy || categoryBusy} headingExtra={headingExtra}>{form}</Modal>;

  const embeddedMeeting = embedded && task?.kind === 'meeting' ? task : null;
  return <section className={embedded ? 'task-edit-page task-edit-embedded' : 'calendar-detail task-edit-page'} aria-label={title} aria-busy={busy || categoryBusy || undefined} onKeyDown={event => {
    if (event.key !== 'Escape' || event.defaultPrevented || event.nativeEvent.isComposing || discardEdit) return;
    event.preventDefault();
    event.stopPropagation();
    leavePage();
  }}>
    {!embedded && <header className="task-edit-header">
      <button type="button" className="text-button task-edit-back" disabled={busy || categoryBusy} onClick={() => leavePage()}><CaretLeft size={16} aria-hidden="true" />{page.backLabel}</button>
      <div className="task-edit-heading"><h2>{title}</h2>{headingExtra}</div>
    </header>}
    {form}
    {discardEdit && <Modal className={`confirm task-edit-discard${embeddedMeeting ? ' schedule-edit-discard' : ''}`}
      title={embeddedMeeting ? '放弃修改？' : '放弃未保存的修改？'}
      close={continueEditing} hideClose aria-describedby={discardDescriptionId}
      onEscape={embeddedMeeting ? () => { continueEditing(); return true; } : undefined}>
      <p id={discardDescriptionId}>{embeddedMeeting ? `「${embeddedMeeting.title}」有未保存的修改。` : '已填写的内容尚未保存。'}</p>
      <div className="actions"><button type="button" autoFocus onClick={continueEditing}>继续编辑</button><button type="button" className="danger" onClick={discardEdit}>放弃修改</button></div>
    </Modal>}
  </section>;
}
