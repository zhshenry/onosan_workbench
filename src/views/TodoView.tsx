import { useEffect, useId, useRef, useState } from 'react';
import { Clock, Plus } from '@phosphor-icons/react';
import { activeToday, insightTarget, localDay, openToday, type Task } from '../../shared/todo-contracts';
import { isOverdue } from '../../shared/todo-format';
import { errorText } from '../ui/controls';
import { TaskEditor, type TaskEditorApi, type TodoState } from '../../modules/todo/ui/TaskEditor';
import { TodayBoard, type Mutate } from '../../modules/todo/ui/TodayBoard';
import { TaskLibrary } from '../../modules/todo/ui/TaskLibrary';
import { IconDocs } from '../icons';

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

export function TodoView({ data, clock, mutate, editor, setEditor }: {
  data: TodoState; clock: Date; mutate: Mutate;
  editor: Task | 'new' | null;
  setEditor: (t: Task | 'new' | null) => void;
}) {
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const addButton = useRef<HTMLButtonElement>(null);
  const createId = useId();
  const today = localDay(clock);
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));

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
        setEditor('new');
      } else if (event.key.toLowerCase() === 'f') {
        event.preventDefault();
        setLibraryOpen(true);
      }
    }
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  const todayTasks = activeToday(data.tasks, today);
  const openTasks = openToday(data.tasks, today);
  const doneToday = todayTasks.filter((t) => t.status === 'done').length;
  const dueReminders = todayTasks.filter((t) => t.status !== 'done' && t.remindAt && Date.parse(t.remindAt) <= clock.getTime());
  const overdue = openTasks.filter((t) => isOverdue(t, clock.getTime())).length;

  const insight = insightTarget(openTasks, clock);

  return (
    <section className="view on todo-workspace" id="view-todo">
      <div className="greet">
        <div>
          <h1>日程待办</h1>
          <div className="gsub">
            今天已完成 <b>{doneToday}</b> 项
            {openTasks.length > 0 && <> ,还有 <b>{openTasks.length}</b> 项待办</>}
            {overdue > 0 && <> · <span className="bad">逾期 {overdue} 项</span></>}
            {insight && <span className="insight"> · {insight.context}</span>}
          </div>
        </div>
        <div className="dash-actions">
          <button ref={addButton} type="button" className="btn btn-pri btn-sm" aria-haspopup="dialog" aria-expanded={editor === 'new'} aria-controls={editor === 'new' ? createId : undefined} onClick={() => {
            if (editor === 'new') document.getElementById(createId)?.dispatchEvent(new Event('cancel', { cancelable: true }));
            else setEditor('new');
          }}><Plus size={14} />新增</button>
        </div>
      </div>

      <div className="todo-panel">
        {dueReminders.length > 0 && !libraryOpen ? (
          <div className="reminder-strip">
            <Clock size={15} />
            <span>{dueReminders[0].title}</span>
            <button onClick={() => { void mutate(() => wb.todo.snooze(dueReminders[0].id), '将在10分钟后提醒'); }}>稍后10分钟</button>
          </div>
        ) : null}
        <TodayBoard
          tasks={data.tasks}
          today={today}
          categoryById={categoryById}
          planView='rows'
          variant="workspace"
          mutating={false}
          api={editorApi}
          mutate={mutate}
          setEditor={setEditor}
          toolbar={<>
            <div className="dash-actions">
              <button type="button" className="btn btn-sec btn-sm" aria-pressed={libraryOpen} onClick={() => setLibraryOpen(value => !value)}><IconDocs size={14} />全部事项</button>
            </div>
          </>}
          todoContent={libraryOpen ? <TaskLibrary tasks={data.tasks} categories={data.categories} api={libraryApi} changed={(state) => mutate(async () => state)} edit={setEditor} close={() => setLibraryOpen(false)} /> : undefined}
        />
      </div>

      {editor ? (
        <TaskEditor
          key={editor === 'new' ? 'new' : editor.id}
          task={editor === 'new' ? undefined : editor}
          id={editor === 'new' ? createId : undefined}
          anchor={editor === 'new' ? addButton.current : undefined}
          categories={data.categories}
          api={editorApi}
          changed={(state) => mutate(async () => state)}
          saved={(state) => { mutate(async () => state); setNotice('事项已保存'); }}
          close={() => setEditor(null)}
        />
      ) : null}

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
        if (alive) { setData(state); setError(''); }
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    };
    void load();
    const offChanged = wb.todo.onChanged(() => void load());
    const poll = setInterval(() => void load(), 5000); // 跨应用(To-Do-List)写入的兜底刷新
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
