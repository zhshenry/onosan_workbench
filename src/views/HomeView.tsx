import { useEffect, useRef, useState } from 'react';
import { Plus } from '@phosphor-icons/react';
import { activeToday, insightTarget, localDay, openToday, type Task } from '../../shared/todo-contracts';
import { errorText, Modal } from '../../modules/todo/ui/ui';
import { TaskEditor, type TaskEditorApi, type TodoState } from '../../modules/todo/ui/TaskEditor';
import { TodayBoard, TodayToolbar, type Mutate } from '../../modules/todo/ui/TodayBoard';
import { TaskLibrary } from '../../modules/todo/ui/TaskLibrary';
import {
  IconBagua, IconCalendarPlus, IconDocs, IconGamepad, IconGlobe,
  IconTerminal, IconVideo, IconWeb,
} from '../icons';

const wb = window.workbench;

const libraryApi = {
  update: (id: string, patch: unknown, revision: string) => wb.todo.update(id, patch, revision) as Promise<TodoState>,
  restore: (id: string) => wb.todo.restore(id) as Promise<TodoState>,
};

const editorApi: TaskEditorApi = {
  create: (input) => wb.todo.create(input) as Promise<TodoState>,
  update: (id, patch, revision) => wb.todo.update(id, patch, revision) as Promise<TodoState>,
  remove: (id, revision) => wb.todo.remove(id, revision) as Promise<TodoState>,
  createCategory: (input) => wb.todo.createCategory(input) as Promise<TodoState>,
};

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function HomeView({ data, clock, mutate, userName, onPending, onOpenBazi }: {
  data: TodoState; clock: Date; mutate: Mutate; userName: string;
  onPending: (name: string) => void;
  onOpenBazi: () => void;
}) {
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [planView, setPlanView] = useState<'rows' | 'tiles'>('rows');
  const [review, setReview] = useState<string | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const today = localDay(clock);
  const categoryById = new Map(data.categories.map((category) => [category.id, category]));

  useEffect(() => {
    if (!notice) return;
    const timeout = setTimeout(() => setNotice(''), 5000);
    return () => clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    function shortcut(event: KeyboardEvent) {
      if (!event.ctrlKey || event.altKey || event.shiftKey || event.isComposing || document.querySelector('dialog[open]')) return;
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
  const overdue = openTasks.filter((t) => t.dueAt && Date.parse(t.dueAt) < clock.getTime() || (!t.dueAt && t.status !== 'done' && `${t.plannedDate}T23:59:59` < new Date(clock).toISOString())).length;
  const hour = clock.getHours();
  const greeting = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 18 ? '下午好' : '晚上好';

  // 本周概览(周一为一周起点,统计各日完成数;今天显示当日事项数)
  const weekStart = new Date(clock);
  weekStart.setDate(weekStart.getDate() - ((weekStart.getDay() + 6) % 7));
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(weekStart);
    day.setDate(day.getDate() + i);
    const iso = localDay(day);
    const completed = data.tasks.filter((t) => t.completedAt && localDay(new Date(t.completedAt)) === iso).length;
    const items = data.tasks.filter((t) => !t.deletedAt && t.plannedDate === iso).length;
    return { label: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'][i], iso, completed, items, today: iso === today };
  });
  const weekMax = Math.max(1, ...week.map((w) => Math.max(w.completed, w.items)));
  const weekDone = week.reduce((sum, w) => sum + w.completed, 0);

  const insight = insightTarget(openTasks, clock);

  return (
    <section className="view on" id="view-home">
      <div className="greet">
        <div>
          <h1>{userName.trim() ? `${greeting},${userName.trim()}` : greeting}</h1>
          <div className="gsub">
            {clock.getMonth() + 1}月{clock.getDate()}日 {WEEKDAY_NAMES[clock.getDay()]} · 今天已完成 <b>{doneToday}</b> 项
            {openTasks.length > 0 && <> ,还有 <b>{openTasks.length}</b> 项待办</>}
            {overdue > 0 && <> · <span className="bad">逾期 {overdue} 项</span></>}
            {insight && <span className="insight"> · {insight.context}</span>}
          </div>
        </div>
      </div>

      <div className="cols">
        <div className="panel glass todo-panel">
          <div className="todo-actions">
            <button className="btn btn-sec btn-sm" onClick={() => setLibraryOpen(v => !v)}>
              <IconDocs size={14} />
              事项库
            </button>
            <button className="btn btn-sec btn-sm" onClick={() => setEditor('new')}>
              <IconCalendarPlus size={14} />
              新增事项
            </button>
            <button className="btn btn-pri btn-sm" onClick={() => setEditor('new')}>
              <Plus size={14} />
              新增待办
            </button>
          </div>

          {dueReminders.length > 0 && !libraryOpen ? (
            <div className="reminder-strip">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3 2" /></svg>
              <span>{dueReminders[0].title}</span>
              <button onClick={() => { void mutate(() => wb.todo.snooze(dueReminders[0].id) as Promise<TodoState>, '将在10分钟后提醒'); }}>稍后10分钟</button>
            </div>
          ) : null}
          {libraryOpen ? (
            <TaskLibrary tasks={data.tasks} categories={data.categories} api={libraryApi} changed={(state) => mutate(async () => state)} edit={setEditor} close={() => setLibraryOpen(false)} />
          ) : (
          <TodayBoard
            tasks={data.tasks}
            today={today}
            categoryById={categoryById}
            planView={planView}
            mutating={false}
            api={editorApi}
            mutate={mutate}
            setEditor={setEditor}
            toolbar={<TodayToolbar planView={planView} setPlanView={setPlanView} onReview={() => { void wb.todo.review().then(setReview, () => onPending('今日复盘')); }} />}
          />
          )}
        </div>

        <div>
          <div className="panel glass">
            <div className="phead">
              <span className="ptitle">本周概览</span>
              <span className="pcount">本周完成 {weekDone} 项</span>
            </div>
            <div className="week">
              {week.map((w) => (
                <div key={w.iso} className={w.today ? 'wcol today' : 'wcol'} title={`${w.iso}:完成 ${w.completed} · 计划 ${w.items}`}>
                  <span className="wnum">{w.items}</span>
                  <span className="wbar" style={{ height: `${Math.round((Math.max(w.completed, w.items) / weekMax) * 100)}%` }} />
                </div>
              ))}
            </div>
            <div className="wdays">
              {week.map((w) => (
                <span key={w.iso} className={w.today ? 'wday today' : 'wday'}>{w.label}</span>
              ))}
            </div>
            <div className="wsum">
              <span>完成 <b>{weekDone}</b></span>
              <span>进行 <b>{openTasks.length}</b></span>
              {overdue > 0 && <span className="bad">逾期 {overdue}</span>}
            </div>
          </div>

          <div className="panel glass" style={{ marginTop: 16 }}>
            <div className="phead">
              <span className="ptitle">快捷工具</span>
            </div>
            <div className="tools">
              <div className="tool">
                <span className="tlabel">
                  <IconDocs size={15} />
                  文档中心
                </span>
                <span className="hint">规划中 — Office 文档预览与编辑</span>
              </div>
              <div className="tool">
                <span className="tlabel">
                  <IconGlobe size={15} />
                  内置浏览器
                </span>
                <span className="hint">规划中 — 独立会话的网页查阅</span>
              </div>
              <div className="tool">
                <span className="tlabel">
                  <IconTerminal size={15} />
                  终端
                </span>
                <span className="hint">规划中 — 挂载常用 CLI 工具</span>
              </div>
            </div>
          </div>

          <div className="panel glass" style={{ marginTop: 16 }}>
            <div className="phead">
              <span className="ptitle">更多工作台</span>
              <span className="pcount">规划中 · 图标栏支持自定义排序</span>
            </div>
            <div className="mgrid">
              <div className="mitem" onClick={() => onPending('自媒体工作台')}>
                <span className="mtile"><IconVideo /></span>
                <div className="mtext">
                  <div className="mname">自媒体工作台</div>
                  <div className="mdesc">选题库、脚本撰写与封面工作流</div>
                </div>
                <span className="ntag">规划中</span>
              </div>
              <div className="mitem" onClick={() => onPending('个人网页')}>
                <span className="mtile"><IconWeb /></span>
                <div className="mtext">
                  <div className="mname">个人网页</div>
                  <div className="mdesc">站点搭建、预览与发布管理</div>
                </div>
                <span className="ntag">规划中</span>
              </div>
              <div className="mitem" onClick={() => onPending('游戏工作台')}>
                <span className="mtile"><IconGamepad /></span>
                <div className="mtext">
                  <div className="mname">游戏工作台</div>
                  <div className="mdesc">玩法原型、素材与版本管理</div>
                </div>
                <span className="ntag">规划中</span>
              </div>
              <div className="mitem" onClick={onOpenBazi}>
                <span className="mtile"><IconBagua /></span>
                <div className="mtext">
                  <div className="mname">八字排盘</div>
                  <div className="mdesc">命盘计算、流年与大运笔记</div>
                </div>
                <span className="ntag">已上线</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {editor ? (
        <TaskEditor
          key={editor === 'new' ? 'new' : editor.id}
          task={editor === 'new' ? undefined : editor}
          categories={data.categories}
          api={editorApi}
          changed={(state) => mutate(async () => state)}
          saved={(state) => { mutate(async () => state); setNotice('事项已保存'); }}
          close={() => setEditor(null)}
        />
      ) : null}

      {review !== null ? (
        <Modal title="今日复盘" close={() => setReview(null)}>
          <div className="form-body">
            <div className="sheet-card">
              <pre className="review-content">{review}</pre>
              <p className="field-help">以上由本地事项记录生成,与 To-Do-List 同库同源。</p>
            </div>
          </div>
        </Modal>
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
        const state = (await wb.todo.state()) as TodoState;
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
