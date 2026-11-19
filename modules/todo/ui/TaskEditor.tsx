import { useLayoutEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { ArrowUpRight, CalendarBlank, DotsThree, Flag, Plus, Tag } from '@phosphor-icons/react';
import { localDay, newTask, taskInputSchema, type Category, type Task, type TaskInput } from '../../../shared/todo-contracts';
import type { TodoState } from '../../../shared/workbench-api';
import { hasTaskTime, taskDateFrom, taskDay } from '../../../shared/todo-date';

/** 工作台注入的待办操作面(上游为 DesktopAPI 的子集,行为一致) */
export type { TodoState } from '../../../shared/workbench-api';
export interface TaskEditorApi {
  create(input: unknown): Promise<TodoState>;
  update(id: string, patch: unknown, revision: string): Promise<TodoState>;
  remove(id: string, revision: string): Promise<TodoState>;
  createCategory(input: unknown): Promise<TodoState>;
}
import { DEFAULT_TAG_COLOR, TagColorPresets } from './TagColorPresets';
import { DatePicker, HALF_HOUR_TIMES, Modal, Segmented, Select, TimePicker, errorText, dateTimeText } from './ui';

type CreateSection = 'datetime' | 'priority' | 'tag' | 'more';
const HALF_HOUR_OPTIONS = HALF_HOUR_TIMES.map(value => ({ value, label: value }));

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
export function TaskEditor({ task, initialTitle, initialKind, lockKind = false, meetingSource, id, categories, api, close, saved, changed }: { task?: Task; initialTitle?: string; initialKind?: TaskInput['kind']; lockKind?: boolean; meetingSource?: { title: string; open(): void }; id?: string; categories: Category[]; api: TaskEditorApi; close(): void; saved(state: TodoState): void; changed(state: TodoState): void }) {
  const [draft, setDraft] = useState<TaskInput>(() => {
    if (task) return { title: task.title, kind: task.kind, status: task.status, priority: task.priority, dateAt: task.dateAt, endAt: task.endAt ?? null, remindAt: task.remindAt, categoryId: task.categoryId, progress: task.progress, note: task.note };
    const fresh = newTask(initialTitle);
    return initialKind ? { ...fresh, kind: initialKind } : fresh;
  });
  const initial = useRef(JSON.stringify(draft));
  const initialDraft = useRef(draft);
  const [error, setError] = useState(''); const [invalid, setInvalid] = useState(''); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false); const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryName, setCategoryName] = useState(''); const [categoryColor, setCategoryColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [remindOn, setRemindOn] = useState(() => Boolean(draft.remindAt));
  const [reminderDate, setReminderDate] = useState(() => localInput(draft.remindAt).slice(0, 10));
  const [reminderTime, setReminderTime] = useState(() => localTime(draft.remindAt));
  const [kindDir, setKindDir] = useState('');
  const [createSection, setCreateSection] = useState<CreateSection | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const createTools = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => { titleRef.current?.focus({ preventScroll: true }); }, []);
  const dirty = JSON.stringify(draft) !== initial.current;
  function change<K extends keyof TaskInput>(key: K, value: TaskInput[K]) { setDraft(d => ({ ...d, [key]: value })); setError(''); setInvalid(''); setDeleting(false); }
  function changeKind(next: TaskInput['kind']) {
    if (next === draft.kind) return;
    setKindDir(next === 'meeting' ? 'next' : 'prev');
    if (next === 'meeting' && createSection === 'priority') setCreateSection(null);
    change('kind', next);
  }
  function changeDate(value: string) {
    setDraft(d => {
      const dateAt = taskDateFrom(value, localTime(d.dateAt));
      const endAt = dueAtFrom(value, localTime(d.endAt));
      const duration = hasTaskTime(d.dateAt) && d.endAt ? Date.parse(d.endAt) - Date.parse(d.dateAt) : 60 * 60 * 1000;
      return { ...d, dateAt, endAt: d.kind === 'meeting' && hasTaskTime(dateAt) ? new Date(Date.parse(dateAt) + duration).toISOString() : endAt };
    });
    setError(''); setInvalid(''); setDeleting(false);
  }
  function changeMeetingStart(value: string) {
    setDraft(d => {
      const dateAt = taskDateFrom(taskDay(d) ?? localDay(), value);
      const endAt = d.endAt;
      const hasDefaultDuration = hasTaskTime(d.dateAt) && endAt && Date.parse(endAt) - Date.parse(d.dateAt) === 60 * 60 * 1000;
      return { ...d, dateAt, endAt: hasTaskTime(dateAt) && (!endAt || hasDefaultDuration || Date.parse(endAt) <= Date.parse(dateAt)) ? defaultMeetingEndAt(dateAt) : endAt };
    });
    setError(''); setInvalid(''); setDeleting(false);
  }
  function changeMeetingEnd(value: string) { change('endAt', dueAtFrom(taskDay(draft) ?? localDay(), value)); }
  function changeTaskTime(value: string) { change('dateAt', taskDateFrom(taskDay(draft) ?? localDay(), value)); }
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
    event.preventDefault(); if (busy || categoryBusy) return;
    if (remindOn && !draft.remindAt) {
      setCreateSection('datetime'); setError('请填写提醒日期和时间，或关闭提醒'); setInvalid('remindAt');
      requestAnimationFrame(() => document.getElementById('task-reminder-date')?.focus()); return;
    }
    if (draft.kind === 'meeting' && (!hasTaskTime(draft.dateAt) || !draft.endAt)) {
      const field = hasTaskTime(draft.dateAt) ? 'endAt' : 'dateAt';
      setCreateSection('datetime'); setError(field === 'dateAt' ? '请填写日程开始时间' : '请填写日程结束时间'); setInvalid(field);
      requestAnimationFrame(() => document.getElementById(field === 'dateAt' ? 'task-time' : 'task-end-time')?.focus()); return;
    }
    const parsed = taskInputSchema.safeParse(draft);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0].path[0]);
      setError(field === 'title' ? (draft.kind === 'meeting' ? '请填写日程名称' : '请填写待办名称') : parsed.error.issues[0].message); setInvalid(field);
      if (['dateAt', 'endAt', 'remindAt'].includes(field)) setCreateSection('datetime');
      else if (field === 'priority') setCreateSection('priority');
      else if (field === 'categoryId') setCreateSection('tag');
      else if (field === 'progress' || field === 'note') setCreateSection('more');
      const id = field === 'dateAt' ? 'task-date' : field === 'endAt' ? 'task-end-time' : field === 'remindAt' ? 'task-reminder-date' : 'task-title';
      requestAnimationFrame(() => document.getElementById(id)?.focus()); return;
    }
    setBusy(true);
    try { saved(task ? await api.update(task.id, parsed.data, task.updatedAt) : await api.create(parsed.data)); close(); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function confirmRemove() {
    if (!task || busy) return;
    if (!deleting) { setDeleting(true); return; }
    setBusy(true); setError('');
    try { saved(await api.remove(task.id, task.updatedAt)); close(); }
    catch (e) { setError(errorText(e)); setDeleting(false); }
    finally { setBusy(false); }
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
  const pickerDirection = task ? 'down' : 'auto';
  const typeSwitch = lockKind ? <span className="task-kind-label">{isMeeting ? '日程' : '待办'}</span> : <Segmented aria-label="类型" value={draft.kind} onChange={value => changeKind(value as TaskInput['kind'])} options={[{ value: 'task', label: '待办' }, { value: 'meeting', label: '日程' }]} />;
  const category = draft.categoryId ? categories.find(item => item.id === draft.categoryId) : null;
  const reminderFields = remindOn ? <>
    <div className="form-grid" role="group" aria-label="提醒时间">
      <div><label htmlFor="task-reminder-date">提醒日期</label><DatePicker id="task-reminder-date" value={reminderDate} onChange={changeReminderDate} direction={pickerDirection} aria-invalid={invalid === 'remindAt'} aria-describedby={error ? 'task-error' : undefined} /></div>
      <div><label htmlFor="task-reminder-time">提醒时间</label><TimePicker id="task-reminder-time" value={reminderTime} onChange={changeReminderTime} direction={pickerDirection} aria-invalid={invalid === 'remindAt'} aria-describedby={error ? 'task-error' : undefined} /></div>
    </div>
    <div className="reminder-presets"><button type="button" disabled={!hasTaskTime(draft.dateAt)} onClick={() => changeReminder(draft.dateAt)}>准时</button><button type="button" disabled={!hasTaskTime(draft.dateAt)} onClick={() => changeReminder(new Date(Date.parse(draft.dateAt!) - 600000).toISOString())}>提前10分钟</button></div>
  </> : null;
  const meetingTimeFields = <div className="form-grid meeting-time-range span-all" role="group" aria-label="日程时间段">
    <div><label htmlFor="task-time">开始时间</label><TimePicker id="task-time" value={localTime(draft.dateAt)} onChange={changeMeetingStart} direction={pickerDirection} aria-invalid={invalid === 'dateAt'} aria-describedby={error ? 'task-error' : undefined} /></div>
    <div><label htmlFor="task-end-time">结束时间</label><TimePicker id="task-end-time" value={localTime(draft.endAt ?? null)} onChange={changeMeetingEnd} direction={pickerDirection} aria-invalid={invalid === 'endAt'} aria-describedby={error ? 'task-error' : undefined} /></div>
  </div>;
  const datetimeConfigured = draft.dateAt !== initialDraft.current.dateAt || Boolean(draft.dateAt || draft.endAt || draft.remindAt);
  const dateField = <div className={isMeeting ? 'span-all' : undefined}>
    <label htmlFor="task-date">{isMeeting ? '日期' : '完成期限'}</label>
    <DatePicker id="task-date" value={taskDay(draft) ?? ''} onChange={changeDate} clearable={!isMeeting} direction={pickerDirection} triggerContent={draft.dateAt ? undefined : '不设日期'} aria-invalid={invalid === 'dateAt'} aria-describedby={error ? 'task-error' : undefined} />
  </div>;
  function toggleCreateSection(section: CreateSection) { setCreateSection(current => current === section ? null : section); }
  function closeCreateSection() {
    createTools.current?.querySelector<HTMLButtonElement>(`[aria-controls="task-create-${createSection}"]`)?.focus({ preventScroll: true });
    setCreateSection(null);
  }

  if (task?.source === 'welink') return <Modal id={id} className="task-modal" title="日程详情" close={close} busy={busy}>
    <div className="form-body"><h3>{task.title}</h3><p>{task.external?.isAllDay ? `${taskDay(task)} · 全天` : `${dateTimeText(task.dateAt)} — ${dateTimeText(task.endAt ?? null)}`}</p>
      <p className="field-help">由 CMO 同步的外部日程，请在来源应用修改安排。</p>{task.note ? <p className="pre-wrap">{task.note}</p> : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="form-actions"><button type="button" disabled={busy} onClick={close}>返回</button>{task.status !== 'done' ? <button type="button" className="primary" disabled={busy} onClick={async () => {
        setBusy(true); setError('');
        try { saved(await api.update(task.id, { status: 'done' }, task.updatedAt)); close(); }
        catch (error) { setError(errorText(error)); } finally { setBusy(false); }
      }}>{busy ? '保存中…' : '标记完成'}</button> : <span className="muted">已完成</span>}</div>
    </div>
  </Modal>;

  if (!task) return <Modal id={id} className="task-modal task-create-modal" title="新增事项" titleIcon={<Plus size={18} />} closeText="返回" close={close} dirty={dirty} busy={busy || categoryBusy} headingExtra={typeSwitch} onEscape={() => {
    if (!createSection) return false;
    closeCreateSection();
    return true;
  }}>
    <form noValidate onSubmit={submit} className={`form-body task-create-form${kindDir ? ` is-${kindDir}` : ''}`}>
      <div className="task-create-shell">
        <div className="task-create-compose">
          <input id="task-title" ref={titleRef} aria-label={isMeeting ? '日程名称' : '待办名称'} value={draft.title} maxLength={200} onChange={event => change('title', event.target.value)} placeholder={isMeeting ? '输入日程标题' : '输入待办标题'} aria-invalid={invalid === 'title'} aria-describedby={error ? 'task-error' : undefined} />
          <button className="btn primary" disabled={busy || categoryBusy || !draft.title.trim()} aria-busy={busy || undefined} type="submit">{busy ? '创建中…' : '创建'}</button>
        </div>
        <div ref={createTools} className="task-create-tools" role="group" aria-label="事项设置">
          <button type="button" className={`${createSection === 'datetime' ? 'is-open ' : ''}${datetimeConfigured ? 'is-configured' : ''}`} aria-label={`时间安排：${taskDay(draft) ?? '不设日期'}${hasTaskTime(draft.dateAt) ? ` ${localTime(draft.dateAt)}` : ' 不设时间'}`} aria-expanded={createSection === 'datetime'} aria-controls="task-create-datetime" onClick={() => toggleCreateSection('datetime')}><CalendarBlank size={18} /></button>
          {!isMeeting ? <button type="button" className={`${createSection === 'priority' ? 'is-open ' : ''}is-configured priority-${draft.priority}`} aria-label={`优先级：${draft.priority === 'high' ? '高' : draft.priority === 'low' ? '低' : '中'}`} aria-expanded={createSection === 'priority'} aria-controls="task-create-priority" onClick={() => toggleCreateSection('priority')}><Flag size={18} weight="fill" /></button> : null}
          <button type="button" className={`${createSection === 'tag' ? 'is-open ' : ''}${category ? 'is-configured' : ''}`} style={category ? { '--tool-color': category.color } as CSSProperties : undefined} aria-label={`标签：${category?.name ?? '无标签'}`} aria-expanded={createSection === 'tag'} aria-controls="task-create-tag" onClick={() => toggleCreateSection('tag')}><Tag size={18} weight={category ? 'fill' : 'regular'} /></button>
          <button type="button" className={`${createSection === 'more' ? 'is-open ' : ''}${draft.progress !== null || draft.note ? 'is-configured' : ''}`} aria-label={`更多设置：${draft.progress !== null ? `进度 ${draft.progress}%` : draft.note ? '已有备注' : '未设置'}`} aria-expanded={createSection === 'more'} aria-controls="task-create-more" onClick={() => toggleCreateSection('more')}><DotsThree size={19} /></button>
        </div>
        {error ? <p className="task-create-error error" id="task-error" role="alert">{error}</p> : null}
        {createSection === 'datetime' ? <section className="task-create-detail" id="task-create-datetime" aria-label="时间安排设置">
          <header><h3><CalendarBlank size={16} />时间安排</h3><button type="button" className="text-button" onClick={closeCreateSection}>收起</button></header>
          <div className="form-grid">
            {dateField}
            {isMeeting ? meetingTimeFields : <div><label htmlFor="task-time">时间 <span className="muted">可不填</span></label><Select id="task-time" aria-label="时间" value={localTime(draft.dateAt)} onChange={changeTaskTime} options={[{ value: '', label: '不设时间' }, ...HALF_HOUR_OPTIONS]} aria-invalid={invalid === 'dateAt'} aria-describedby={error ? 'task-error' : undefined} /></div>}
          </div>
          <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={remindOn} aria-label="提醒" onClick={toggleRemind} /><span>提醒</span></div>
          {reminderFields}
          <p className="field-help">{remindOn ? !hasTaskTime(draft.dateAt) ? `先设置${isMeeting ? '日程开始时间' : '完成时间'}，才能使用快捷提醒，也可以直接设置提醒日期和时间。` : '时间按此电脑时区保存。退出应用后停止提醒。' : '时间按此电脑时区保存。'}</p>
        </section> : null}
        {createSection === 'priority' && !isMeeting ? <section className="task-create-detail" id="task-create-priority" aria-label="优先级设置">
          <header><h3><Flag size={16} />优先级</h3><button type="button" className="text-button" onClick={closeCreateSection}>收起</button></header>
          <Select id="task-priority" aria-label="优先级" value={draft.priority} onChange={value => change('priority', value as TaskInput['priority'])} options={[{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]} />
        </section> : null}
        {createSection === 'tag' ? <section className="task-create-detail" id="task-create-tag" aria-label="标签设置">
          <header><h3><Tag size={16} />标签</h3><button type="button" className="text-button" onClick={() => setAddingCategory(!addingCategory)}>{addingCategory ? '取消新建' : '新建标签'}</button></header>
          <Select id="task-category" aria-label="标签" value={draft.categoryId ?? ''} onChange={value => change('categoryId', value || null)} options={[{ value: '', label: '无标签' }, ...categories.map(item => ({ value: item.id, label: item.name }))]} />
          {addingCategory ? <div className="inline-category-editor"><input aria-label="新标签名称" value={categoryName} maxLength={30} onChange={event => setCategoryName(event.target.value)} placeholder="例如：工作" autoFocus /><TagColorPresets value={categoryColor} onChange={setCategoryColor} /><button type="button" disabled={!categoryName.trim() || categoryBusy} onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '创建并选中'}</button></div> : null}
        </section> : null}
        {createSection === 'more' ? <section className="task-create-detail" id="task-create-more" aria-label="更多设置">
          <header><h3><DotsThree size={17} />更多设置</h3><button type="button" className="text-button" onClick={closeCreateSection}>收起</button></header>
          <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={draft.progress !== null} aria-label="进度" onClick={() => change('progress', draft.progress === null ? 0 : null)} /><span>维护进度</span></div>
          {draft.progress !== null ? <div className="progress-field"><input id="task-progress" className="progress-range" aria-label="事项进度" type="range" min={0} max={100} value={draft.progress} style={{ '--progress-value': `${draft.progress}%` } as CSSProperties} onChange={event => change('progress', Number(event.target.value))} /><output htmlFor="task-progress">{draft.progress}%</output></div> : null}
          <label htmlFor="task-note">备注 / 进展</label><textarea id="task-note" rows={3} className="resize-none" value={draft.note} maxLength={5000} onChange={event => change('note', event.target.value)} placeholder={isMeeting ? '地点、参与人或议程' : '补充信息或记录进展'} />
        </section> : null}
      </div>
    </form>
  </Modal>;

  return <Modal className="task-modal" title="编辑事项" close={close} dirty={dirty && !busy} headingExtra={typeSwitch}>
    {meetingSource && <div className="task-meeting-source"><span>来源会议</span><button type="button" onClick={meetingSource.open}>{meetingSource.title}<ArrowUpRight size={14} /></button></div>}
    <form noValidate onSubmit={submit} className={`form-body${kindDir ? ` is-${kindDir}` : ''}`}>
      <div className="task-fields">
        <label htmlFor="task-title">{isMeeting ? '日程名称' : '待办名称'}</label>
        <input id="task-title" ref={titleRef} value={draft.title} maxLength={200} onChange={e => change('title', e.target.value)} placeholder={isMeeting ? '日程主题是什么？' : '接下来要做什么？'} aria-invalid={invalid === 'title'} aria-describedby={error ? 'task-error' : undefined} />
        <div className="form-grid">
          {isMeeting ? null : <div><label htmlFor="task-priority">优先级</label><Select id="task-priority" value={draft.priority} onChange={value => change('priority', value as TaskInput['priority'])} options={[{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]} /></div>}
          <div className={isMeeting ? 'span-all' : undefined}>
            <div className="field-heading"><label htmlFor="task-category">标签</label><button type="button" className="text-button" onClick={() => setAddingCategory(!addingCategory)}>{addingCategory ? '取消新建' : '新建标签'}</button></div>
            <Select id="task-category" value={draft.categoryId ?? ''} onChange={value => change('categoryId', value || null)} options={[{ value: '', label: '无标签' }, ...categories.map(category => ({ value: category.id, label: category.name }))]} />
          </div>
        </div>
        {addingCategory ? <div className="inline-category-editor">
          <input aria-label="新标签名称" value={categoryName} maxLength={30} onChange={e => setCategoryName(e.target.value)} placeholder="例如：工作" autoFocus />
          <TagColorPresets value={categoryColor} onChange={setCategoryColor} />
          <button type="button" disabled={!categoryName.trim() || categoryBusy} onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '创建并选中'}</button>
        </div> : null}
        <div className="form-grid">
          {dateField}
          {isMeeting ? meetingTimeFields : <div>
            <label htmlFor="task-time">时间{isMeeting ? null : <> <span className="muted">可不填</span></>}</label>
            <TimePicker id="task-time" value={localTime(draft.dateAt)} onChange={changeTaskTime} aria-invalid={invalid === 'dateAt'} aria-describedby={error ? 'task-error' : undefined} />
          </div>}
        </div>
        <div className="toggle-row">
          <button type="button" className="toggle" role="switch" aria-checked={remindOn} aria-label="提醒" onClick={toggleRemind} />
          <span>提醒</span>
        </div>
        {remindOn ? <>
          {reminderFields}
        </> : null}
        <p className="field-help">{remindOn ? '时间按此电脑时区保存。退出应用后停止提醒。' : '时间按此电脑时区保存。'}</p>
        {task ? <><label htmlFor="task-status">状态</label><Select id="task-status" value={draft.status} onChange={value => change('status', value as TaskInput['status'])} options={[{ value: 'todo', label: '未开始' }, { value: 'doing', label: '进行中' }, { value: 'done', label: '已完成' }]} /></> : null}
        <div className="toggle-row">
          <button type="button" className="toggle" role="switch" aria-checked={draft.progress !== null} aria-label="进度" onClick={() => change('progress', draft.progress === null ? 0 : null)} />
          <span>维护进度</span>
        </div>
        {draft.progress !== null ? <div className="progress-field"><input id="task-progress" className="progress-range" aria-label="事项进度" type="range" min={0} max={100} value={draft.progress} style={{ '--progress-value': `${draft.progress}%` } as CSSProperties} onChange={e => change('progress', Number(e.target.value))} /><output htmlFor="task-progress">{draft.progress}%</output></div> : null}
        <label htmlFor="task-note">备注 / 进展</label><textarea id="task-note" rows={2} className="resize-none" value={draft.note} maxLength={5000} onChange={e => change('note', e.target.value)} placeholder={isMeeting ? '地点、参会人或议程' : '补充信息或记录进展'} />
        {task?.updatedAt ? <p className="field-help">最近更新：{dateTimeText(task.updatedAt)}</p> : null}
      </div>
      {error ? <p className="error" id="task-error" role="alert">{error}</p> : null}
      <div className="actions sticky-actions">{task ? <button type="button" className={deleting ? 'danger shake' : 'text-danger'} disabled={busy} title={deleting ? '再点一次确认删除' : undefined} onClick={() => void confirmRemove()}>{deleting ? '确认删除' : '删除'}</button> : null}<button className="primary" disabled={busy || categoryBusy} type="submit">{busy ? '保存中…' : isMeeting ? '保存日程' : '保存待办'}</button></div>
    </form>
  </Modal>;
}
