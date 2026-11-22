import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { CaretRight, FileText, MagnifyingGlass, X } from '@phosphor-icons/react';
import { localDay, taskDay, taskTime, type TimedSchedule, type Task } from '../../shared/todo-contracts';
import { scheduleStamp } from '../../shared/todo-format';
import { meetingNoteStatus } from '../../shared/meeting-notes';
import { errorText, IconButton } from '../ui/controls';
import { TaskEditor, type TaskEditHandle, type TaskEditorApi, type TodoState } from '../../modules/todo/ui/TaskEditor';
import { TodayBoard, type Mutate } from '../../modules/todo/ui/TodayBoard';
import { ScheduleInfo, type ScheduleDetailRequest, type ScheduleTab } from '../../modules/todo/ui/CalendarWorkspace';
import { TaskLibrary } from '../../modules/todo/ui/TaskLibrary';
import { TaskCreateButton } from '../../modules/todo/ui/TaskScheduling';
import { IconDocs } from '../icons';
import { meetingPlainText, useMeetingNotes } from '../meeting-notes';
import { MeetingMinutes, type MeetingMinutesHandle } from './MeetingMinutes';
import { ScheduleReminder } from './ScheduleReminder';
import './meeting-minutes.css';

const wb = window.workbench;

const libraryApi = {
  update: (id: string, patch: unknown, revision: string) => wb.todo.update(id, patch, revision),
  restore: (id: string) => wb.todo.restore(id),
};

const editorApi: TaskEditorApi = {
  create: (input) => wb.todo.create(input),
  update: (id, patch, revision) => wb.todo.update(id, patch, revision),
  remove: (id, revision) => wb.todo.remove(id, revision),
  createCategory: (input) => wb.todo.createCategory(input),
};

export function TodoView({ data, clock, mutate, editor, setEditor, editHandle, workspaceHeader }: {
  data: TodoState; clock: Date; mutate: Mutate;
  editor: Task | 'new' | null;
  setEditor: (t: Task | 'new' | null) => void;
  editHandle: RefObject<TaskEditHandle | null>;
  workspaceHeader?: HTMLElement | null;
}) {
  const [tab, setTab] = useState<ScheduleTab>(() => editor && editor !== 'new' && editor.kind === 'task' ? 'todo' : 'calendar');
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const createId = useId();
  const [createDefaults, setCreateDefaults] = useState<{ kind: Task['kind']; time?: TimedSchedule } | null>(null);
  const meetingNotes = useMeetingNotes();
  const [detailRequest, setDetailRequest] = useState<ScheduleDetailRequest | null>(null);
  const [recordInput, setRecordInput] = useState(''), [recordQuery, setRecordQuery] = useState(''), [recordLimit, setRecordLimit] = useState(40);
  const recordSearch = useRef<HTMLInputElement>(null);
  const [meetingEditVersion, setMeetingEditVersion] = useState(0);
  const minutes = useRef<MeetingMinutesHandle>(null);
  const selectionRequest = useRef(0);
  const editing = editor && editor !== 'new' && editor.kind === 'meeting' ? null : editor;
  const todoView = useRef<HTMLElement>(null);
  const editOrigin = useRef<HTMLElement | null>(null);
  const focusAfterEdit = useRef<HTMLElement | null | undefined>(undefined);
  const pageEdit = editing && editing !== 'new' && editing.source !== 'welink';
  function closeEditor(restoreFocus = true) {
    if (pageEdit && restoreFocus) focusAfterEdit.current = editOrigin.current;
    editOrigin.current = null;
    setCreateDefaults(null);
    setEditor(null);
  }
  useLayoutEffect(() => {
    const origin = focusAfterEdit.current;
    if (pageEdit || origin === undefined) return;
    focusAfterEdit.current = undefined;
    const view = todoView.current;
    if (!view?.getClientRects().length || view.closest('[inert]')) return;
    if (origin?.isConnected && origin.getClientRects().length) {
      origin.focus({ preventScroll: true });
      if (document.activeElement === origin) return;
    }
    const add = view.querySelector<HTMLButtonElement>('.calendar-todos:not([hidden]) .dash-actions .btn-pri');
    (add ?? view).focus({ preventScroll: true });
  }, [pageEdit]);
  const sourceNote = editing && editing !== 'new' && editing.kind === 'task' ? meetingNotes.notes.find(note => note.actions.some(action => action.taskId === editing.id)) : undefined;
  const sourceMeeting = sourceNote ? data.tasks.find(task => task.id === sourceNote.meetingId && task.kind === 'meeting' && !task.deletedAt) : undefined;
  function leaveDetails(navigate: () => void) {
    const leave = () => {
      const request = ++selectionRequest.current;
      const draft = minutes.current;
      if (!draft) { navigate(); return; }
      void draft.flush().then(saved => {
        if (saved && request === selectionRequest.current) navigate();
      });
    };
    const edit = editHandle.current;
    if (edit) edit.leave(leave);
    else leave();
  }
  function openMeeting(task: Task) {
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const source = tab === 'records' ? 'records' : 'calendar';
    leaveDetails(() => {
      if (tab !== source) setTab(source);
      setDetailRequest({ taskId: task.id, tab: 'materials', source, trigger, returnTo: tab === 'todo' ? 'todo' : undefined });
    });
  }
  function editItem(task: Task) {
    if (task.kind === 'meeting') { openMeeting(task); return; }
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaveDetails(() => { editOrigin.current = origin; setEditor(task); });
  }
  function resetMeetingEditor() {
    setMeetingEditVersion(version => version + 1);
  }
  useEffect(() => {
    if (editor && editor !== 'new' && editor.kind === 'meeting') { openMeeting(editor); setEditor(null); }
  }, [editor]);
  const today = localDay(clock);
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));

  function saveItem(state: TodoState, message: string) {
    const updated = mutate(async () => state);
    setNotice(message);
    return updated;
  }


  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || document.querySelector('dialog[open], dialog:popover-open')) return;
      if (event.key.toLowerCase() === 'n') {
        event.preventDefault();
        leaveDetails(() => setEditor('new'));
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        leaveDetails(() => { setTab('todo'); setLibraryOpen(true); });
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, [setEditor, editHandle]);

  const notesByMeeting = new Map(meetingNotes.notes.map(note => [note.meetingId, note]));
  const recordText = useMemo(() => new Map(meetingNotes.notes.map(note => [note.meetingId, meetingPlainText(note.body)])), [meetingNotes.notes]);
  const records = tab === 'records' && !meetingNotes.loading && !meetingNotes.error
    ? data.tasks.filter(task => task.kind === 'meeting' && !task.deletedAt
      && (!recordQuery || (task.title + ' ' + (recordText.get(task.id) ?? '')).toLocaleLowerCase('zh-CN').includes(recordQuery)))
      .sort((a, b) => (taskDay(b) ?? '').localeCompare(taskDay(a) ?? '') || taskTime(b) - taskTime(a))
    : [];
  function searchRecords(value: string) { setRecordQuery(value.trim().toLocaleLowerCase('zh-CN')); setRecordLimit(40); }
  const notesStatus = (task: Task) => meetingNotes.loading ? '读取纪要中…' : meetingNotes.error ? '纪要读取失败' : meetingNoteStatus(notesByMeeting.get(task.id));

  function createItem(kind: Task['kind'], time?: TimedSchedule) {
    setCreateDefaults({ kind, time });
    setEditor('new');
  }
  const addAction = <TaskCreateButton onClick={() => leaveDetails(() => createItem('task'))} />;

  const editForm = editing && <TaskEditor key={editing === 'new' ? 'new' : editing.id} task={editing === 'new' ? undefined : editing}
    initialKind={createDefaults?.kind} initialSchedule={createDefaults?.time}
    id={editing === 'new' ? createId : undefined} categories={data.categories} api={editorApi}
    page={pageEdit ? { handle: editHandle, backLabel: tab === 'todo' ? (libraryOpen ? '返回全部事项' : '返回待办') : '返回会议详情' } : undefined}
    meetingSource={sourceMeeting ? { title: sourceMeeting.title, open: () => openMeeting(sourceMeeting) } : undefined}
    changed={state => mutate(async () => state)} saved={saveItem} close={closeEditor} />;

  return (
    <section ref={todoView} className="view on todo-workspace" id="view-todo" aria-label="日程待办" tabIndex={-1}>
      <div className="todo-panel">
        <TodayBoard
          tasks={data.tasks}
          today={today}
          categoryById={categoryById}
          planView='rows'
          onOpenMeeting={openMeeting}
          meetingNotes={meetingNotes.notes}
          workspace={{
            tab, onTab: setTab, leaveDetails, workspaceHeader, createItem, taskEditHandle: editHandle, editForm: pageEdit ? editForm : undefined, detailRequest,
            headerActions: <ScheduleReminder tasks={data.tasks} clock={clock} open={editItem} mutate={mutate} />,
            details: (task, controls) => {
              const info = task.source === 'welink'
                ? <ScheduleInfo category={categoryById.get(task.categoryId ?? '')?.name} remindAt={task.remindAt} note={task.note} />
                : !pageEdit && controls.tab === 'info' && <TaskEditor key={task.id + ':' + meetingEditVersion} task={task}
                  categories={data.categories} api={editorApi} page={{ handle: editHandle }}
                  changed={state => mutate(async () => state)} saved={saveItem} close={resetMeetingEditor} />;
              return <MeetingMinutes key={task.id} ref={minutes} task={task} data={data} notes={meetingNotes} api={editorApi}
                info={info} controls={controls} leaveDetails={leaveDetails} editTodo={editItem} changed={state => mutate(async () => state)} />;
            },
            records: (openRecord, activeId) => <section className="calendar-records" aria-label="会议记录">
              <div className="meeting-search"><MagnifyingGlass size={16} aria-hidden="true" />
                <input ref={recordSearch} aria-label="搜索会议记录" placeholder="搜索会议名称或纪要" value={recordInput} onChange={event => {
                  setRecordInput(event.target.value);
                  if (!(event.nativeEvent as InputEvent).isComposing) searchRecords(event.target.value);
                }} onCompositionEnd={event => searchRecords(event.currentTarget.value)} />
                {recordInput && <IconButton label="清空会议搜索" onClick={() => { setRecordInput(''); searchRecords(''); recordSearch.current?.focus(); }}><X size={13} /></IconButton>}
              </div>
              {meetingNotes.loading ? <p role="status">正在读取会议纪要…</p>
                : meetingNotes.error ? <p role="alert">{meetingNotes.error} <button type="button" className="text-button" onClick={() => void meetingNotes.reload()}>重试读取</button></p>
                : records.length ? <ul className="calendar-record-list">{records.slice(0, recordLimit).map(task =>
                  <li key={task.id}><button type="button" aria-current={activeId === task.id || undefined} onClick={() => openRecord(task)}>
                    <FileText size={17} />
                    <span><strong>{task.title}</strong><small>{scheduleStamp(task)} · {notesStatus(task)}</small></span>
                    <CaretRight size={15} />
                  </button></li>
                )}</ul> : <p className="plan-empty">{recordQuery ? '没有找到匹配的会议' : '暂无会议记录'}</p>}
              {records.length > recordLimit && <button type="button" className="text-button calendar-record-more" onClick={() => setRecordLimit(value => value + 40)}>显示更多会议</button>}
            </section>,
          }}
          mutating={false}
          api={editorApi}
          mutate={mutate}
          setEditor={editItem}
          onCardSaved={state => saveItem(state, '待办已保存')}
          toolbar={<>
            <div className="dash-actions">
              <button type="button" className="btn btn-sec btn-sm" aria-pressed={libraryOpen} onClick={() => leaveDetails(() => setLibraryOpen(value => !value))}><IconDocs size={14} />全部事项</button>
              {addAction}
            </div>
          </>}
          todoContent={libraryOpen ? <TaskLibrary tasks={data.tasks} categories={data.categories} api={libraryApi} changed={(state) => mutate(async () => state)} edit={editItem} close={() => setLibraryOpen(false)} /> : undefined}
        />
      </div>

      {!pageEdit && editForm}

      <div className="todo-notice" data-show={notice ? '1' : '0'} role="status" aria-live="polite">{notice}</div>
    </section>
  );
}

export function useTodoData(): { data: TodoState | null; error: string; mutate: Mutate; clock: Date } {
  const [data, setData] = useState<TodoState | null>(null);
  const [error, setError] = useState('');
  const [clock, setClock] = useState(() => new Date());
  const mutating = useRef(false);

  useEffect(() => {
    let alive = true;
    const load = async (): Promise<void> => {
      try {
        const state = (await wb.todo.state());
        if (alive) { setData(state); setClock(new Date()); setError(''); }
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    };
    void load();
    const offChanged = wb.todo.onChanged(() => void load());
    const poll = setInterval(() => void load(), 5000); // CMO 写入的兜底刷新
    const onFocus = (): void => void load();
    window.addEventListener('focus', onFocus);
    const tick = setInterval(() => setClock(new Date()), 30000);
    return () => {
      alive = false;
      offChanged();
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const mutate: Mutate = async (action) => {
    if (mutating.current) return;
    mutating.current = true;
    setError('');
    try {
      setData(await action());
    } catch (e) {
      setError(errorText(e));
    } finally {
      mutating.current = false;
    }
  };

  return { data, error, mutate, clock };
}
