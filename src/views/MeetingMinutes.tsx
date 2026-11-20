import { taskDay } from '../../shared/todo-date';
import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowCounterClockwise, ArrowUpRight, CalendarBlank, CaretLeft, Check, CheckSquare, LinkSimple, ListBullets, MagnifyingGlass, PencilSimple, Plus, TextB, TextH, Trash, X } from '@phosphor-icons/react';
import type { Task } from '../../shared/todo-contracts';
import { hasMeetingNotes, meetingNoteStatus, meetingTimeStatus, type MeetingNote } from '../../shared/meeting-notes';
import type { TodoState } from '../../shared/workbench-api';
import { scheduleTimeRange } from '../../shared/todo-format';
import { TaskEditor, type TaskEditorApi } from '../../modules/todo/ui/TaskEditor';
import { cleanMeetingHtml, meetingPlainText, useMeetingDraft } from '../meeting-notes';
import { IconButton, Modal, errorText } from '../ui/controls';

export interface MeetingMinutesHandle { flush(): Promise<boolean>; }

function MeetingDraftIssue({ draft }: { draft: ReturnType<typeof useMeetingDraft> }) {
  if (!draft.recovery && !draft.error) return null;
  return <div className="meeting-save-error" role="alert">
    <p>{draft.recovery ? '发现未同步的本地草稿。可恢复草稿或保留已保存版本。' : draft.error}</p>
    {draft.recovery || draft.status === 'conflict' ? <>
      <button type="button" onClick={() => void draft.resolve(true)}>保留本地稿</button>
      <button type="button" onClick={() => void draft.resolve(false)}>使用已保存版本</button>
    </> : <button type="button" onClick={() => void draft.flush()}>重试保存</button>}
  </div>;
}

export const MeetingMinutesField = forwardRef<MeetingMinutesHandle, {
  meetingId: string; note?: MeetingNote; onSaved(note: MeetingNote): void;
}>(function MeetingMinutesField({ meetingId, note, onSaved }, ref) {
  const draft = useMeetingDraft(meetingId, note, onSaved);
  const editor = useRef<HTMLDivElement>(null);
  const statusId = useId();
  const blocked = !!draft.recovery;
  useImperativeHandle(ref, () => ({ flush: draft.flush }));
  useLayoutEffect(() => {
    if (editor.current) editor.current.innerHTML = cleanMeetingHtml(draft.value.body);
  }, [draft.reset]);
  function recordBody() {
    if (editor.current) draft.change({ ...draft.value, body: cleanMeetingHtml(editor.current.innerHTML), organized: false });
  }
  return <>
    <div ref={editor} role="textbox" aria-label="会议纪要" aria-multiline="true" aria-readonly={blocked || undefined}
      aria-describedby={statusId} contentEditable={blocked ? false : 'plaintext-only'} suppressContentEditableWarning
      className={'meeting-rich-editor meeting-minutes-field' + (hasMeetingNotes({ body: draft.value.body, actions: [] }) ? '' : ' is-empty')}
      data-placeholder="在这里记录会议纪要…"
      onInput={recordBody}
      onCompositionStart={() => draft.composition(true)}
      onCompositionEnd={() => { recordBody(); draft.composition(false); }}
      onClick={event => { if ((event.target as Element).closest('a')) event.preventDefault(); }} />
    <div className="meeting-minutes-field-status" id={statusId} role="status">
      {draft.recovery || draft.error ? '' : draft.status === 'saving' ? '保存中…' : note ? '已保存' : '自动保存'}
    </div>
    <MeetingDraftIssue draft={draft} />
  </>;
});

export const MeetingMinutes = forwardRef<MeetingMinutesHandle, {
  task: Task; hidden?: boolean; data: TodoState; notes: MeetingNote[]; clock: Date; api: TaskEditorApi;
  onSaved(note: MeetingNote): void; onSelect(id: string): void; onBack(): void;
  editArrangement(task: Task): void; editTodo(task: Task): void; changed(state: TodoState): void;
}>(function MeetingMinutes({ task, hidden, data, notes, clock, api, onSaved, onSelect, onBack, editArrangement, editTodo, changed }, ref) {
  const note = notes.find(item => item.meetingId === task.id);
  const draft = useMeetingDraft(task.id, note, onSaved), value = draft.value;
  useImperativeHandle(ref, () => ({ flush: draft.flush }));
  const editor = useRef<HTMLDivElement>(null), selection = useRef<Range | null>(null), searchInput = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const [searchText, setSearchText] = useState(''), [query, setQuery] = useState(''), [limit, setLimit] = useState(40);
  const [creating, setCreating] = useState<string | null>(null), [preparing, setPreparing] = useState(false), [actionError, setActionError] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const directory = useRef<HTMLElement>(null), directoryToggle = useRef<HTMLButtonElement>(null);
  const [linkOpen, setLinkOpen] = useState(false), [link, setLink] = useState(''), [linkError, setLinkError] = useState('');
  const time = meetingTimeStatus(task, clock.getTime());
  const available = useMemo(() => data.tasks.filter(item => item.kind === 'meeting' && !item.deletedAt).sort((a, b) => (taskDay(b) ?? '').localeCompare(taskDay(a) ?? '') || (a.dateAt ?? '').localeCompare(b.dateAt ?? '')), [data.tasks]);
  const noteText = useMemo(() => new Map(notes.map(note => [note.meetingId, meetingPlainText(note.body)])), [notes]);
  const needle = query.trim().toLocaleLowerCase('zh-CN');
  const filtered = available.filter(item => !needle || `${item.title} ${noteText.get(item.id) ?? ''}`.toLocaleLowerCase('zh-CN').includes(needle));
  const visible = filtered.slice(0, limit);
  const blocked = Boolean(draft.recovery);
  useLayoutEffect(() => { if (editor.current) editor.current.innerHTML = cleanMeetingHtml(value.body); }, [draft.reset]);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  useEffect(() => {
    if (!directoryOpen) return;
    const outside = (event: PointerEvent) => { if (!directory.current?.contains(event.target as Node)) setDirectoryOpen(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setDirectoryOpen(false); directoryToggle.current?.focus(); } };
    const resize = () => setDirectoryOpen(false);
    document.addEventListener('pointerdown', outside); window.addEventListener('keydown', key); window.addEventListener('resize', resize);
    return () => { document.removeEventListener('pointerdown', outside); window.removeEventListener('keydown', key); window.removeEventListener('resize', resize); };
  }, [directoryOpen]);
  function rememberSelection() {
    const current = window.getSelection();
    if (current?.rangeCount && editor.current?.contains(current.anchorNode)) selection.current = current.getRangeAt(0).cloneRange();
  }
  function restoreSelection() {
    const node = editor.current; if (!node) return;
    node.focus(); const current = window.getSelection(); if (!current) return;
    const range = selection.current && node.contains(selection.current.commonAncestorContainer) ? selection.current : document.createRange();
    if (range !== selection.current) { range.selectNodeContents(node); range.collapse(false); }
    current.removeAllRanges(); current.addRange(range);
  }
  function recordBody() {
    if (editor.current) draft.change({ ...value, body: cleanMeetingHtml(editor.current.innerHTML), organized: false });
    rememberSelection();
  }
  function command(name: string, argument?: string) {
    restoreSelection(); document.execCommand(name, false, argument); recordBody();
  }
  function updateAction(id: string, title: string) {
    draft.change({ ...value, organized: false, actions: value.actions.map(action => action.id === id ? { ...action, title } : action) });
  }
  function addAction() {
    const id = crypto.randomUUID();
    draft.change({ ...value, organized: false, actions: [...value.actions, { id, title: '' }] });
    requestAnimationFrame(() => document.getElementById(`meeting-action-${id}`)?.focus());
  }
  async function createAction(id: string) {
    if (preparing) return; setPreparing(true); setActionError('');
    try { if (await draft.flush()) setCreating(id); } catch (cause) { setActionError(errorText(cause)); } finally { setPreparing(false); }
  }
  const action = value.actions.find(item => item.id === creating);
  const createApi: TaskEditorApi = { ...api, create: async input => {
    const result = await window.workbench.meetingNotes.createTask(task.id, creating!, input, draft.revision());
    draft.acceptSaved(result.note); return result.state;
  } };
  function insertLink(event: FormEvent) {
    event.preventDefault(); let url: URL;
    try { url = new URL(link); if (!['https:', 'http:'].includes(url.protocol)) throw new Error(); }
    catch { setLinkError('请输入有效的 http 或 https 链接'); return; }
    setLinkOpen(false);
    requestAnimationFrame(() => {
      restoreSelection();
      if (window.getSelection()?.isCollapsed) {
        const anchor = document.createElement('a'); anchor.href = url.href; anchor.textContent = url.href;
        document.execCommand('insertHTML', false, cleanMeetingHtml(anchor.outerHTML)); recordBody();
      } else command('createLink', url.href);
    });
  }
  return <section className="meeting-workspace" hidden={hidden} aria-label="日程详情与纪要" data-directory-open={directoryOpen || undefined}>
    <aside ref={directory} className="meeting-directory" aria-label="日程列表">
      <header><h2>日程</h2><button type="button" className="meeting-back" onClick={onBack}><CaretLeft size={14} />返回首页</button></header>
      {directoryOpen && <button type="button" className="meeting-directory-close text-button" onClick={() => { setDirectoryOpen(false); directoryToggle.current?.focus(); }}>返回当前纪要</button>}
      <div className="meeting-search"><MagnifyingGlass size={16} /><input ref={searchInput} aria-label="搜索日程" placeholder="搜索日程" value={searchText} onChange={event => { setSearchText(event.target.value); if (!(event.nativeEvent as InputEvent).isComposing) { setQuery(event.target.value); setLimit(40); } }} onCompositionEnd={event => { setQuery(event.currentTarget.value); setLimit(40); }} />{searchText && <IconButton label="清空日程搜索" onClick={() => { setSearchText(''); setQuery(''); setLimit(40); searchInput.current?.focus(); }}><X size={13} /></IconButton>}</div>
      <div className="meeting-directory-list">{visible.map((item, index) => <div key={item.id}>
        {(index === 0 || taskDay(visible[index - 1]) !== taskDay(item)) && <h3>{new Date(`${taskDay(item)}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' })}</h3>}
        <button type="button" className="meeting-directory-item" aria-current={item.id === task.id ? 'page' : undefined} onClick={() => { setDirectoryOpen(false); onSelect(item.id); }}><strong>{item.title}</strong><small>{scheduleTimeRange(item)}<span>{meetingNoteStatus(notes.find(value => value.meetingId === item.id))}</span></small></button>
      </div>)}{!visible.length && <p className="meeting-empty">没有找到匹配的日程</p>}{filtered.length > limit && <button type="button" className="text-button" onClick={() => setLimit(value => value + 40)}>显示更多日程</button>}</div>
    </aside>
    <div className="meeting-document">
      <header className="meeting-heading"><div><div className="meeting-compact-navigation"><button type="button" className="meeting-back" onClick={onBack}><CaretLeft size={14} />返回首页</button><button ref={directoryToggle} type="button" className="text-button" aria-expanded={directoryOpen} onClick={() => setDirectoryOpen(true)}>日程列表</button></div><h1 ref={heading} tabIndex={-1}>{task.title}</h1><p><CalendarBlank size={16} /><time dateTime={task.dateAt ?? undefined}>{new Date(`${taskDay(task)}T12:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })} {scheduleTimeRange(task)}</time><span className={`meeting-time is-${time.tone}`}>{time.label}</span></p></div><div className="meeting-heading-actions"><button type="button" className="btn btn-sec btn-sm" onClick={() => editArrangement(task)}><PencilSimple size={16} />编辑安排</button><button type="button" className="btn btn-pri btn-sm" aria-pressed={value.organized} disabled={blocked || !hasMeetingNotes(value)} onClick={() => { draft.change({ ...value, organized: !value.organized }); void draft.flush(); }}><Check size={16} />{value.organized ? '已整理' : '标记已整理'}</button></div></header>
      <details className="meeting-preparation"><summary>会前说明<span>{task.note ? task.note.slice(0, 70) : '地点、参会人或议程'}</span></summary><div>{task.note ? <p>{task.note}</p> : <p>暂未填写会前说明。</p>}<button type="button" className="text-button" onClick={() => editArrangement(task)}>编辑会前说明</button></div></details>
      <div className="meeting-editor-toolbar" role="toolbar" aria-label="纪要格式">
        <IconButton label="切换二级标题" disabled={blocked} onMouseDown={event => event.preventDefault()} onClick={() => command('formatBlock', document.queryCommandValue('formatBlock') === 'h2' ? 'p' : 'h2')}><TextH size={19} /></IconButton>
        <IconButton label="加粗" disabled={blocked} onMouseDown={event => event.preventDefault()} onClick={() => command('bold')}><TextB size={18} /></IconButton>
        <IconButton label="项目列表" disabled={blocked} onMouseDown={event => event.preventDefault()} onClick={() => command('insertUnorderedList')}><ListBullets size={19} /></IconButton>
        <IconButton label="添加后续行动" disabled={blocked || value.actions.length >= 200} onMouseDown={event => event.preventDefault()} onClick={addAction}><CheckSquare size={19} /></IconButton>
        <IconButton label="插入链接" disabled={blocked} onMouseDown={event => event.preventDefault()} onClick={() => { rememberSelection(); setLink(''); setLinkError(''); setLinkOpen(true); }}><LinkSimple size={19} /></IconButton>
        <IconButton label="撤销编辑" disabled={blocked} onMouseDown={event => event.preventDefault()} onClick={() => command('undo')}><ArrowCounterClockwise size={19} /></IconButton>
        <span className="meeting-save-state" role="status" aria-live="polite">{draft.status === 'saving' ? '保存中…' : value.organized ? '已整理' : hasMeetingNotes(value) ? '记录中' : '未记录'}</span>
      </div>
      <MeetingDraftIssue draft={draft} />
      <div className="meeting-document-scroll">
        {!hasMeetingNotes(value) && <button type="button" className="meeting-template text-button" disabled={blocked} onClick={() => { const body = '<h2>讨论记录</h2><p><br></p><h2>会议结论</h2><p><br></p>'; if (editor.current) editor.current.innerHTML = body; draft.change({ ...value, body }); editor.current?.focus(); }}>插入纪要模板</button>}
        <div ref={editor} className={`meeting-rich-editor${meetingPlainText(value.body).trim() ? '' : ' is-empty'}`} contentEditable={!blocked} suppressContentEditableWarning role="textbox" aria-label="会议纪要" aria-multiline="true" data-placeholder="直接记录或粘贴会议内容…" onInput={recordBody} onCompositionStart={() => draft.composition(true)} onCompositionEnd={() => { recordBody(); draft.composition(false); }} onMouseUp={rememberSelection} onKeyUp={rememberSelection} onBlur={rememberSelection} onClick={event => { if ((event.target as HTMLElement).closest('a')) event.preventDefault(); }} onPaste={event => { event.preventDefault(); const html = event.clipboardData.getData('text/html'); command(html ? 'insertHTML' : 'insertText', html ? cleanMeetingHtml(html) : event.clipboardData.getData('text/plain')); }} />
        <section className="meeting-actions" aria-label="后续行动"><header><h2>后续行动</h2><small>已关联{note?.actions.filter(action => action.taskId).length ?? 0}项待办</small><button type="button" className="text-button" disabled={blocked || value.actions.length >= 200} onClick={addAction}><Plus size={15} />添加</button></header>
          {value.actions.map((action, index) => {
            const taskId = note?.actions.find(item => item.id === action.id)?.taskId;
            const linked = taskId ? data.tasks.find(item => item.id === taskId && !item.deletedAt) : undefined;
            return <div className={`meeting-action-row${linked?.status === 'done' ? ' is-done' : ''}`} key={action.id}>
              {taskId ? <span className="meeting-action-check" aria-label={linked?.status === 'done' ? '待办已完成' : linked ? '待办未完成' : '关联待办不可用'}>{linked?.status === 'done' ? <Check size={14} weight="bold" /> : null}</span> : <span className="meeting-action-bullet" aria-hidden="true">·</span>}
              {taskId ? <strong>{linked?.title ?? action.title}</strong> : <input id={`meeting-action-${action.id}`} aria-label={`行动项${index + 1}`} placeholder="填写后续行动" maxLength={200} value={action.title} disabled={blocked} onCompositionStart={() => draft.composition(true)} onCompositionEnd={() => draft.composition(false)} onChange={event => updateAction(action.id, event.target.value)} />}
              {taskId ? <><small>{linked ? linked.status === 'done' ? '已完成' : '待办' : '关联待办不可用'}</small><button type="button" className="text-button" disabled={!linked} onClick={() => linked && editTodo(linked)}>查看待办<ArrowUpRight size={14} /></button></> : <><button type="button" className="meeting-convert" disabled={blocked || preparing || !action.title.trim()} onClick={() => void createAction(action.id)}><Plus size={14} />转为待办</button><IconButton label={`移除行动项${index + 1}`} disabled={blocked} onClick={() => draft.change({ ...value, actions: value.actions.filter(item => item.id !== action.id) })}><Trash size={15} /></IconButton></>}
            </div>;
          })}
          {!value.actions.length && <p className="meeting-empty">记录会议产生的后续行动，可转为待办继续跟进。</p>}
          {actionError && <p className="error" role="alert">{actionError}</p>}
        </section>
      </div>
    </div>
    {creating && action && <TaskEditor initialTitle={action.title} initialKind="task" lockKind categories={data.categories} api={createApi} close={() => setCreating(null)} changed={changed} saved={state => { changed(state); setCreating(null); }} />}
    {linkOpen && <Modal title="插入链接" close={() => setLinkOpen(false)} className="meeting-link-modal"><form noValidate className="form-body" onSubmit={insertLink}><label htmlFor="meeting-link-url">链接地址</label><input id="meeting-link-url" type="url" value={link} autoFocus onChange={event => { setLink(event.target.value); setLinkError(''); }} aria-invalid={Boolean(linkError)} aria-describedby={linkError ? 'meeting-link-error' : undefined} placeholder="https://" />{linkError && <p id="meeting-link-error" className="error">{linkError}</p>}<div className="sticky-actions"><button type="button" onClick={() => setLinkOpen(false)}>取消</button><button type="submit" className="primary">插入链接</button></div></form></Modal>}
  </section>;
});
