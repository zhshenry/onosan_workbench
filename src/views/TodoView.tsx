import { useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { CaretRight, FileText, PencilSimple, Plus } from '@phosphor-icons/react';
import { localDay, taskDay, taskTime, type Task } from '../../shared/todo-contracts';
import { scheduleStamp } from '../../shared/todo-format';
import { meetingNoteStatus, meetingTimeStatus } from '../../shared/meeting-notes';
import { errorText } from '../ui/controls';
import { TaskEditor, type TaskEditHandle, type TaskEditorApi, type TodoState } from '../../modules/todo/ui/TaskEditor';
import { TodayBoard, type Mutate } from '../../modules/todo/ui/TodayBoard';
import { ScheduleInfo, type ScheduleTab } from '../../modules/todo/ui/CalendarWorkspace';
import { ScheduleDetailTabs } from '../../modules/todo/ui/ScheduleDetailTabs';
import { TaskLibrary } from '../../modules/todo/ui/TaskLibrary';
import { IconDocs } from '../icons';
import { useMeetingNotes } from '../meeting-notes';
import { MeetingMinutes, MeetingMinutesField, type MeetingMinutesHandle } from './MeetingMinutes';
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
  const meetingNotes = useMeetingNotes();
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [meetingEditor, setMeetingEditor] = useState<Task | null>(null);
  const minutes = useRef<MeetingMinutesHandle>(null);
  const inlineMinutes = useRef<MeetingMinutesHandle>(null);
  const selectionRequest = useRef(0), returnFocus = useRef<HTMLElement | null>(null);
  const activeMeeting = data.tasks.find(task => task.id === activeMeetingId && task.kind === 'meeting' && !task.deletedAt);
  const editing = meetingEditor ?? (editor && editor !== 'new' && editor.kind === 'meeting' ? null : editor);
  const todoView = useRef<HTMLElement>(null);
  const editOrigin = useRef<HTMLElement | null>(null);
  const focusAfterEdit = useRef<HTMLElement | null | undefined>(undefined);
  const pageEdit = editing && editing !== 'new' && editing.source !== 'welink';
  function closeEditor(restoreFocus = true) {
    if (pageEdit && restoreFocus) focusAfterEdit.current = editOrigin.current;
    editOrigin.current = null;
    setEditor(null);
    setMeetingEditor(null);
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
      const draft = minutes.current ?? inlineMinutes.current;
      if (!draft) { navigate(); return; }
      void draft.flush().then(saved => {
        if (saved && request === selectionRequest.current) navigate();
      });
    };
    const edit = editHandle.current;
    if (edit) edit.leave(leave);
    else leave();
  }
  function editItem(task: Task) {
    const origin = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    leaveDetails(() => {
      editOrigin.current = origin;
      if (task.kind === 'meeting') setMeetingEditor(task);
      else setEditor(task);
    });
  }
  async function selectMeeting(id: string | null) {
    const request = ++selectionRequest.current;
    if (!activeMeetingId && id && document.activeElement instanceof HTMLElement) returnFocus.current = document.activeElement;
    const draft = minutes.current ?? inlineMinutes.current;
    if (draft && !(await draft.flush())) return;
    if (request !== selectionRequest.current) return;
    setActiveMeetingId(id);
    if (!id) requestAnimationFrame(() => { const target = returnFocus.current; if (target?.isConnected && target.getClientRects().length) target.focus({ preventScroll: true }); else document.getElementById('view-todo')?.focus({ preventScroll: true }); });
  }
  function openItem(task: Task) { if (task.kind === 'meeting') leaveDetails(() => void selectMeeting(task.id)); else editItem(task); }
  useEffect(() => {
    if (editor && editor !== 'new' && editor.kind === 'meeting') { void selectMeeting(editor.id); setEditor(null); }
  }, [editor]);
  const today = localDay(clock);
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));

  function saveItem(state: TodoState) {
    const updated = mutate(async () => state);
    setNotice('事项已保存');
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
  const records = tab === 'records' && !meetingNotes.loading && !meetingNotes.error
    ? data.tasks.filter(task => task.kind === 'meeting' && !task.deletedAt)
      .sort((a, b) => (taskDay(b) ?? '').localeCompare(taskDay(a) ?? '') || taskTime(b) - taskTime(a))
    : [];
  const notesStatus = (task: Task) => meetingNotes.loading ? '读取纪要中…' : meetingNotes.error ? '纪要读取失败' : meetingNoteStatus(notesByMeeting.get(task.id));

  const addAction = <button type="button" className="btn btn-pri btn-sm" aria-haspopup="dialog" aria-expanded={editor === 'new'}
    aria-controls={editor === 'new' ? createId : undefined} onClick={() => leaveDetails(() => setEditor('new'))}><Plus size={14} aria-hidden="true" />新增</button>;

  const editForm = editing && <TaskEditor key={editing === 'new' ? 'new' : editing.id} task={editing === 'new' ? undefined : editing}
    id={editing === 'new' ? createId : undefined} categories={data.categories} api={editorApi}
    page={pageEdit ? { handle: editHandle, backLabel: activeMeetingId ? '返回会议资料' : tab === 'todo' ? (libraryOpen ? '返回全部事项' : '返回待办') : '返回日程' } : undefined}
    meetingSource={sourceMeeting ? { title: sourceMeeting.title, open: () => void selectMeeting(sourceMeeting.id) } : undefined}
    changed={state => mutate(async () => state)} saved={saveItem} close={closeEditor} />;

  return (
    <section ref={todoView} className="view on todo-workspace" id="view-todo" aria-label="日程待办" tabIndex={-1}>
      <div className="todo-panel" hidden={Boolean(activeMeetingId)}>
        <TodayBoard
          tasks={data.tasks}
          today={today}
          categoryById={categoryById}
          planView='rows'
          onOpenMeeting={openItem}
          meetingNotes={meetingNotes.notes}
          workspace={{
            tab, onTab: setTab, leaveDetails, workspaceHeader: activeMeetingId ? null : workspaceHeader, calendarActions: addAction, editForm: pageEdit && !activeMeetingId ? editForm : undefined,
            headerActions: <ScheduleReminder tasks={data.tasks} clock={clock} open={openItem} mutate={mutate} />,
            details: (task, _selected, controls) => {
              const time = meetingTimeStatus(task, clock.getTime());
              const editSchedule = <button type="button" className="btn btn-sec btn-sm" onClick={() => editItem(task)}><PencilSimple size={15} aria-hidden="true" />编辑日程</button>;
              const info = <ScheduleInfo category={categoryById.get(task.categoryId ?? '')?.name} remindAt={task.remindAt} note={task.note} />;
              if (controls.expanded) {
                const note = notesByMeeting.get(task.id);
                return <ScheduleDetailTabs key={task.id} initialTab="minutes" leaveDetails={leaveDetails} tabs={[
                  { id: 'info', label: '日程信息', content: () => <>
                    <p className={'calendar-detail-meta meeting-time is-' + time.tone}>{time.label}</p>
                    {info}
                    <div className="calendar-detail-actions">{editSchedule}</div>
                  </> },
                  { id: 'minutes', label: '纪要', content: () => <div className="calendar-detail-section">
                    {meetingNotes.loading ? <p role="status">正在读取会议纪要…</p>
                      : meetingNotes.error ? <><p role="alert">{meetingNotes.error}</p><button type="button" className="btn btn-sec btn-sm" onClick={() => void meetingNotes.reload()}>重试读取</button></>
                      : <MeetingMinutesField ref={inlineMinutes} meetingId={task.id} note={note} onSaved={meetingNotes.accept} />}
                  </div> },
                ]} />;
              }
              return <>
                <div className={'calendar-detail-meta meeting-time is-' + time.tone}>{time.label} · {notesStatus(task)}</div>
                {info}
                <div className="calendar-detail-actions">
                  <button ref={controls.entry} type="button" className="btn btn-pri btn-sm" aria-controls={controls.panelId} aria-expanded={false} onClick={controls.open}>
                    <FileText size={16} aria-hidden="true" />查看会议资料
                  </button>
                  {editSchedule}
                </div>
              </>;
            },
            records: <section className="calendar-records" aria-label="会议记录">
              {meetingNotes.loading ? <p role="status">正在读取会议纪要…</p>
                : meetingNotes.error ? <p role="alert">{meetingNotes.error} <button type="button" className="text-button" onClick={() => void meetingNotes.reload()}>重试读取</button></p>
                : records.length ? <ul className="calendar-record-list">{records.map(task =>
                  <li key={task.id}><button type="button" onClick={() => openItem(task)}>
                    <FileText size={17} />
                    <span><strong>{task.title}</strong><small>{scheduleStamp(task)} · {notesStatus(task)}</small></span>
                    <CaretRight size={15} />
                  </button></li>
                )}</ul> : <p className="plan-empty">暂无会议记录</p>}
            </section>,
          }}
          mutating={false}
          api={editorApi}
          mutate={mutate}
          setEditor={editItem}
          toolbar={<>
            <div className="dash-actions">
              <button type="button" className="btn btn-sec btn-sm" aria-pressed={libraryOpen} onClick={() => setLibraryOpen(value => !value)}><IconDocs size={14} />全部事项</button>
              {addAction}
            </div>
          </>}
          todoContent={libraryOpen ? <TaskLibrary tasks={data.tasks} categories={data.categories} api={libraryApi} changed={(state) => mutate(async () => state)} edit={openItem} close={() => setLibraryOpen(false)} /> : undefined}
        />
      </div>

      {activeMeetingId && (activeMeeting && !meetingNotes.loading && !meetingNotes.error ? <MeetingMinutes hidden={Boolean(pageEdit)} key={activeMeetingId} ref={minutes} task={activeMeeting} data={data} notes={meetingNotes.notes} clock={clock} api={editorApi} onSaved={meetingNotes.accept} onSelect={id => void selectMeeting(id)} onBack={() => void selectMeeting(null)} editArrangement={editItem} editTodo={editItem} changed={state => mutate(async () => state)} /> : !pageEdit && <div className="meeting-load-state" role={meetingNotes.error || !activeMeeting ? 'alert' : 'status'}><p>{!activeMeeting ? '这条日程已删除或已改为待办，原纪要仍保留。' : meetingNotes.error || '正在读取会议纪要…'}</p>{meetingNotes.error && <button type="button" className="btn btn-sec" onClick={() => void meetingNotes.reload()}>重试读取</button>}<button type="button" className="text-button" onClick={() => void selectMeeting(null)}>返回日程待办</button></div>)}

      {activeMeetingId && pageEdit && <div className="todo-panel"><div className="calendar-tab-panel calendar-edit-panel">{editForm}</div></div>}
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
