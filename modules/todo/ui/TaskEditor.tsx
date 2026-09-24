import { useRef, useState, type CSSProperties, type FormEvent } from 'react';
import { CalendarBlank, DotsThree, Flag, Plus, Tag } from '@phosphor-icons/react';
import { newTask, taskInputSchema, type Category, type Task, type TaskInput } from '../../../shared/todo-contracts';

/** 工作台注入的待办操作面(上游为 DesktopAPI 的子集,行为一致) */
export interface TodoState { tasks: Task[]; categories: Category[]; }
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
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
function dueAtFrom(date: string, time: string): string | null {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}
function localInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function TaskEditor({ task, initialTitle, categories, api, close, saved, changed }: { task?: Task; initialTitle?: string; categories: Category[]; api: TaskEditorApi; close(): void; saved(state: TodoState): void; changed(state: TodoState): void }) {
  const [draft, setDraft] = useState<TaskInput>(() => task ? { title: task.title, kind: task.kind, status: task.status, priority: task.priority, plannedDate: task.plannedDate, dueAt: task.dueAt, remindAt: task.remindAt, categoryId: task.categoryId, progress: task.progress, note: task.note } : newTask(initialTitle));
  const initial = useRef(JSON.stringify(draft));
  const initialDraft = useRef(draft);
  const [error, setError] = useState(''); const [invalid, setInvalid] = useState(''); const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [addingCategory, setAddingCategory] = useState(false); const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryName, setCategoryName] = useState(''); const [categoryColor, setCategoryColor] = useState<string>(DEFAULT_TAG_COLOR);
  const [remindOn, setRemindOn] = useState(() => Boolean(draft.remindAt));
  const [kindDir, setKindDir] = useState('');
  const [createSection, setCreateSection] = useState<CreateSection | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const dirty = JSON.stringify(draft) !== initial.current;
  function change<K extends keyof TaskInput>(key: K, value: TaskInput[K]) { setDraft(d => ({ ...d, [key]: value })); setError(''); setInvalid(''); setDeleting(false); }
  function changeKind(next: TaskInput['kind']) {
    if (next === draft.kind) return;
    setKindDir(next === 'meeting' ? 'next' : 'prev');
    if (next === 'meeting' && createSection === 'priority') setCreateSection(null);
    change('kind', next);
  }
  function changeDate(value: string) {
    setDraft(d => ({ ...d, plannedDate: value, dueAt: dueAtFrom(value, localTime(d.dueAt)) }));
    setError(''); setInvalid(''); setDeleting(false);
  }
  function toggleRemind() {
    const on = !remindOn;
    setRemindOn(on);
    change('remindAt', on ? draft.remindAt ?? draft.dueAt : null);
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    if (draft.kind === 'meeting' && !draft.dueAt) {
      setCreateSection('datetime'); setError('请填写日程时间'); setInvalid('dueAt'); requestAnimationFrame(() => document.getElementById('task-time')?.focus()); return;
    }
    const parsed = taskInputSchema.safeParse(draft);
    if (!parsed.success) {
      const field = String(parsed.error.issues[0].path[0]);
      setError(field === 'title' ? (draft.kind === 'meeting' ? '请填写日程名称' : '请填写待办名称') : parsed.error.issues[0].message); setInvalid(field);
      if (['plannedDate', 'dueAt', 'remindAt'].includes(field)) setCreateSection('datetime');
      else if (field === 'priority') setCreateSection('priority');
      else if (field === 'categoryId') setCreateSection('tag');
      else if (field === 'progress' || field === 'note') setCreateSection('more');
      const id = field === 'plannedDate' ? 'task-date' : field === 'dueAt' ? 'task-time' : field === 'remindAt' ? 'task-reminder' : 'task-title';
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
  const typeSwitch = <Segmented aria-label="类型" value={draft.kind} onChange={value => changeKind(value as TaskInput['kind'])} options={[{ value: 'task', label: '待办' }, { value: 'meeting', label: '日程' }]} />;
  const category = draft.categoryId ? categories.find(item => item.id === draft.categoryId) : null;
  const datetimeConfigured = draft.plannedDate !== initialDraft.current.plannedDate || Boolean(draft.dueAt || draft.remindAt);
  function toggleCreateSection(section: CreateSection) { setCreateSection(current => current === section ? null : section); }

  if (!task) return <Modal className={`task-modal task-create-modal${createSection ? ' has-detail' : ''}`} title="新增事项" titleIcon={<Plus size={18} />} closeText="返回" close={close} dirty={dirty && !busy} headingExtra={typeSwitch}>
    <form noValidate onSubmit={submit} className={`form-body task-create-form${kindDir ? ` is-${kindDir}` : ''}`}>
      <div className="task-create-shell">
        <div className="task-create-compose">
          <input id="task-title" ref={titleRef} autoFocus aria-label={isMeeting ? '日程名称' : '待办名称'} value={draft.title} maxLength={200} onChange={event => change('title', event.target.value)} placeholder={isMeeting ? '输入日程标题' : '输入待办标题'} aria-invalid={invalid === 'title'} aria-describedby={error ? 'task-error' : undefined} />
          <button className="primary" disabled={busy || !draft.title.trim()} type="submit">{busy ? '创建中…' : '创建'}</button>
        </div>
        <div className="task-create-tools" role="group" aria-label="事项设置">
          <button type="button" className={`${createSection === 'datetime' ? 'is-open ' : ''}${datetimeConfigured ? 'is-configured' : ''}`} aria-label={`时间安排：${draft.plannedDate}${draft.dueAt ? ` ${localTime(draft.dueAt)}` : ' 不设时间'}`} aria-expanded={createSection === 'datetime'} aria-controls="task-create-datetime" onClick={() => toggleCreateSection('datetime')}><CalendarBlank size={18} /></button>
          {!isMeeting ? <button type="button" className={`${createSection === 'priority' ? 'is-open ' : ''}${draft.priority !== 'medium' ? ` is-configured priority-${draft.priority}` : ''}`} aria-label={`优先级：${draft.priority === 'high' ? '高' : draft.priority === 'low' ? '低' : '中'}`} aria-expanded={createSection === 'priority'} aria-controls="task-create-priority" onClick={() => toggleCreateSection('priority')}><Flag size={18} weight={draft.priority !== 'medium' ? 'fill' : 'regular'} /></button> : null}
          <button type="button" className={`${createSection === 'tag' ? 'is-open ' : ''}${category ? 'is-configured' : ''}`} style={category ? { '--tool-color': category.color } as CSSProperties : undefined} aria-label={`标签：${category?.name ?? '无标签'}`} aria-expanded={createSection === 'tag'} aria-controls="task-create-tag" onClick={() => toggleCreateSection('tag')}><Tag size={18} weight={category ? 'fill' : 'regular'} /></button>
          <button type="button" className={`${createSection === 'more' ? 'is-open ' : ''}${draft.progress !== null || draft.note ? 'is-configured' : ''}`} aria-label={`更多设置：${draft.progress !== null ? `进度 ${draft.progress}%` : draft.note ? '已有备注' : '未设置'}`} aria-expanded={createSection === 'more'} aria-controls="task-create-more" onClick={() => toggleCreateSection('more')}><DotsThree size={19} /></button>
        </div>
        {error ? <p className="task-create-error error" id="task-error" role="alert">{error}</p> : null}
        {createSection === 'datetime' ? <section className="task-create-detail" id="task-create-datetime" aria-label="时间安排设置">
          <header><h3><CalendarBlank size={16} />时间安排</h3><button type="button" className="text-button" onClick={() => setCreateSection(null)}>收起</button></header>
          <div className="form-grid">
            <div><label htmlFor="task-date">{isMeeting ? '日期' : '完成期限'}</label><DatePicker id="task-date" value={draft.plannedDate} onChange={changeDate} aria-invalid={invalid === 'plannedDate'} aria-describedby={error ? 'task-error' : undefined} /></div>
            <div><label htmlFor="task-time">时间{isMeeting ? null : <> <span className="muted">可不填</span></>}</label><Select id="task-time" aria-label="时间" value={localTime(draft.dueAt)} onChange={value => change('dueAt', dueAtFrom(draft.plannedDate, value))} options={[{ value: '', label: isMeeting ? '选择时间' : '不设时间' }, ...HALF_HOUR_OPTIONS]} aria-invalid={invalid === 'dueAt'} aria-describedby={error ? 'task-error' : undefined} /></div>
          </div>
          <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={remindOn} aria-label="提醒" onClick={toggleRemind} /><span>提醒</span></div>
          {remindOn ? <><label htmlFor="task-reminder">提醒时间</label><input id="task-reminder" type="datetime-local" value={localInput(draft.remindAt)} onChange={event => change('remindAt', event.target.value ? new Date(event.target.value).toISOString() : null)} aria-invalid={invalid === 'remindAt'} aria-describedby={error ? 'task-error' : undefined} /><div className="reminder-presets"><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', draft.dueAt)}>准时</button><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', new Date(Date.parse(draft.dueAt!) - 600000).toISOString())}>提前10分钟</button></div></> : null}
          <p className="field-help">{remindOn ? '时间按此电脑时区保存。退出应用后停止提醒。' : '时间按此电脑时区保存。'}</p>
        </section> : null}
        {createSection === 'priority' && !isMeeting ? <section className="task-create-detail" id="task-create-priority" aria-label="优先级设置">
          <header><h3><Flag size={16} />优先级</h3><button type="button" className="text-button" onClick={() => setCreateSection(null)}>收起</button></header>
          <Select id="task-priority" aria-label="优先级" value={draft.priority} onChange={value => change('priority', value as TaskInput['priority'])} options={[{ value: 'high', label: '高' }, { value: 'medium', label: '中' }, { value: 'low', label: '低' }]} />
        </section> : null}
        {createSection === 'tag' ? <section className="task-create-detail" id="task-create-tag" aria-label="标签设置">
          <header><h3><Tag size={16} />标签</h3><button type="button" className="text-button" onClick={() => setAddingCategory(!addingCategory)}>{addingCategory ? '取消新建' : '新建标签'}</button></header>
          <Select id="task-category" aria-label="标签" value={draft.categoryId ?? ''} onChange={value => change('categoryId', value || null)} options={[{ value: '', label: '无标签' }, ...categories.map(item => ({ value: item.id, label: item.name }))]} />
          {addingCategory ? <div className="inline-category-editor"><input aria-label="新标签名称" value={categoryName} maxLength={30} onChange={event => setCategoryName(event.target.value)} placeholder="例如：工作" autoFocus /><TagColorPresets value={categoryColor} onChange={setCategoryColor} /><button type="button" disabled={!categoryName.trim() || categoryBusy} onClick={() => void addCategory()}>{categoryBusy ? '创建中…' : '创建并选中'}</button></div> : null}
        </section> : null}
        {createSection === 'more' ? <section className="task-create-detail" id="task-create-more" aria-label="更多设置">
          <header><h3><DotsThree size={17} />更多设置</h3><button type="button" className="text-button" onClick={() => setCreateSection(null)}>收起</button></header>
          <div className="toggle-row"><button type="button" className="toggle" role="switch" aria-checked={draft.progress !== null} aria-label="进度" onClick={() => change('progress', draft.progress === null ? 0 : null)} /><span>维护进度</span></div>
          {draft.progress !== null ? <div className="progress-field"><input id="task-progress" className="progress-range" aria-label="事项进度" type="range" min={0} max={100} value={draft.progress} style={{ '--progress-value': `${draft.progress}%` } as CSSProperties} onChange={event => change('progress', Number(event.target.value))} /><output htmlFor="task-progress">{draft.progress}%</output></div> : null}
          <label htmlFor="task-note">备注 / 进展</label><textarea id="task-note" rows={3} className="resize-none" value={draft.note} maxLength={5000} onChange={event => change('note', event.target.value)} placeholder={isMeeting ? '地点、参与人或议程' : '补充信息或记录进展'} />
        </section> : null}
      </div>
    </form>
  </Modal>;

  return <Modal className="task-modal" title="编辑事项" close={close} dirty={dirty && !busy} headingExtra={typeSwitch}>
    <form noValidate onSubmit={submit} className={`form-body${kindDir ? ` is-${kindDir}` : ''}`}>
      <div className="task-fields">
        <label htmlFor="task-title">{isMeeting ? '日程名称' : '待办名称'}</label>
        <input id="task-title" ref={titleRef} autoFocus value={draft.title} maxLength={200} onChange={e => change('title', e.target.value)} placeholder={isMeeting ? '日程主题是什么？' : '接下来要做什么？'} aria-invalid={invalid === 'title'} aria-describedby={error ? 'task-error' : undefined} />
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
          <div>
            <label htmlFor="task-date">{isMeeting ? '日期' : '完成期限'}</label>
            <DatePicker id="task-date" value={draft.plannedDate} onChange={changeDate} aria-invalid={invalid === 'plannedDate'} aria-describedby={error ? 'task-error' : undefined} />
          </div>
          <div>
            <label htmlFor="task-time">时间{isMeeting ? null : <> <span className="muted">可不填</span></>}</label>
            <TimePicker id="task-time" value={localTime(draft.dueAt)} onChange={value => change('dueAt', dueAtFrom(draft.plannedDate, value))} aria-invalid={invalid === 'dueAt'} aria-describedby={error ? 'task-error' : undefined} />
          </div>
        </div>
        <div className="toggle-row">
          <button type="button" className="toggle" role="switch" aria-checked={remindOn} aria-label="提醒" onClick={toggleRemind} />
          <span>提醒</span>
        </div>
        {remindOn ? <>
          <label htmlFor="task-reminder">提醒时间</label>
          <input id="task-reminder" type="datetime-local" value={localInput(draft.remindAt)} onChange={e => change('remindAt', e.target.value ? new Date(e.target.value).toISOString() : null)} aria-invalid={invalid === 'remindAt'} aria-describedby={error ? 'task-error' : undefined} />
          <div className="reminder-presets"><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', draft.dueAt)}>准时</button><button type="button" disabled={!draft.dueAt} onClick={() => change('remindAt', new Date(Date.parse(draft.dueAt!) - 600000).toISOString())}>提前10分钟</button></div>
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
      <div className="actions sticky-actions">{task ? <button type="button" className={deleting ? 'danger shake' : 'text-danger'} disabled={busy} title={deleting ? '再点一次确认删除' : undefined} onClick={() => void confirmRemove()}>{deleting ? '确认删除' : '删除'}</button> : null}<button className="primary" disabled={busy} type="submit">{busy ? '保存中…' : isMeeting ? '保存日程' : '保存待办'}</button></div>
    </form>
  </Modal>;
}
