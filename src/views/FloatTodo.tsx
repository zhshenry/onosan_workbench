// 悬浮待办窗(?window=float 载入):沿用上游 To-Do-List 的内容层级——
// 标题栏(置顶/收起/隐藏)→ 仪表区(大字日期+事项库/新增)→ 待办/日程双区 → 提醒条;
// 迷你态 = To-Do-List 式任务卡。数据与主窗同源(IPC 广播 + 轮询);关闭=隐藏由主进程处理。
// 不移植:AI 启动按钮、To-Do-List 品牌图标(用户明确排除)。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowsInLineVertical, ArrowsOutLineVertical, ArrowsOutSimple, ArrowsHorizontal, ArrowLeft, CalendarBlank, CaretDown, Check, Circle, Minus, PaperPlaneRight, Plus, PushPin, Sparkle, Stop, X } from '@phosphor-icons/react';
import { localDay, openToday, type ChatSession, type Task } from '../../shared/todo-contracts';
import { scheduleStamp } from '../../shared/todo-format';
import type { AiConfig } from '../../shared/workbench-api';
import { preferredAiChat, sameAiScope } from '../../shared/ai-scope';
import { errorText, Select as TodoSelect } from '../ui/controls';
import { AiResponse } from './AiResponse';
import { TodoProposalCard } from './TodoProposalCard';
import { matchesTodoPickerFilter, TODO_STATUS_LABEL, TodoPickerFilters, todoPickerStatusKey, type TodoKindFilter, type TodoStatusFilter } from './todo-picker-filters';
import { TaskEditor, type TaskEditorApi, type TodoState } from '../../modules/todo/ui/TaskEditor';
import { TaskLibrary } from '../../modules/todo/ui/TaskLibrary';
import { TodayBoard, type Mutate } from '../../modules/todo/ui/TodayBoard';
import { LogoMark, IconDocs } from '../icons';


// Resolve on each access so a replaced test window still reaches its own bridge.
const wb = new Proxy({} as typeof window.workbench, {
  get(_target, key) {
    const current = window.workbench as typeof window.workbench & Record<PropertyKey, unknown>;
    const value = current[key];
    return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(current) : value;
  },
});

// 展开态最小高度:与首页待办卡片同高 = 屏幕工作区 - 主窗 chrome(灵动岛 64 + 内容上下边距 48)
// (用户 2026-09-27:全屏下悬浮窗与首页卡整体高度一致)
const floatMinHeight = (): number => Math.max(700, Math.round(window.screen.availHeight - 112));

const editorApi: TaskEditorApi = {
  create: (input) => wb.todo.create(input),
  update: (id, patch, revision) => wb.todo.update(id, patch, revision),
  remove: (id, revision) => wb.todo.remove(id, revision),
  createCategory: (input) => wb.todo.createCategory(input),
};

const libraryApi = {
  update: (id: string, patch: unknown, revision: string) => wb.todo.update(id, patch, revision),
  restore: (id: string) => wb.todo.restore(id),
};

export function FloatTodoApp() {
  const [data, setData] = useState<TodoState | null>(null);
  const [clock, setClock] = useState(() => new Date());
  const [narrow, setNarrow] = useState(false);
  const [widthBusy, setWidthBusy] = useState(false);
  const widthChanging = useRef(false);
  useEffect(() => { void wb.float.width().then(width => setNarrow(width === 330)).catch(error => setError(errorText(error))); }, []);
  const changeWidth = async (): Promise<void> => {
    if (widthChanging.current || movingRef.current) return;
    widthChanging.current = true;
    setWidthBusy(true);
    const next = !narrow;
    // The main process eases the native width. Reduced motion settles in one step.
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { setNarrow((await wb.float.width(next, animate)) === 330); }
    catch (error) { setError(errorText(error)); }
    finally { widthChanging.current = false; setWidthBusy(false); }
  };
  const [collapsed, setCollapsed] = useState(false);
  const [motion, setMotion] = useState<'idle' | 'collapsing' | 'expanding' | 'entering'>('idle');
  const movingRef = useRef(false);
  const motionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pinned, setPinned] = useState(true);
  const [miniIndex, setMiniIndex] = useState(0);
  const [armedTaskId, setArmedTaskId] = useState<string | null>(null);
  const [editor, setEditor] = useState<Task | 'new' | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [review, setReview] = useState<string | null>(null);
  const [error, setError] = useState('');
  // AI:上游 MiniCard 的模式切换(home / ai)——AI 模式占满内容区,带返回
  const [floatMode, setFloatMode] = useState<'home' | 'ai'>('home');
  const [aiSeed, setAiSeed] = useState<{ text: string; nonce: number } | null>(null);
  const seedNonce = useRef(0);
  const mutatingRef = { current: false };

  useEffect(() => {
    let alive = true;
    const syncTheme = (): void => {
      void wb.settings.get().then((settings) => {
        if (alive && settings) document.documentElement.dataset.theme = settings.uiTheme;
      }, () => undefined);
    };
    const load = async (): Promise<void> => {
      try {
        const state = (await wb.todo.state());
        if (alive) { setData(state); setError(''); }
      } catch (e) {
        if (alive) setError(errorText(e));
      }
    };
    void load();
    syncTheme();
    const off = wb.todo.onChanged(() => void load());
    const poll = setInterval(() => { void load(); syncTheme(); }, 5000);
    const onFocus = (): void => { void load(); syncTheme(); };
    window.addEventListener('focus', onFocus);
    const tick = setInterval(() => setClock(new Date()), 30000);
    return () => {
      alive = false;
      off();
      clearInterval(poll);
      clearInterval(tick);
      if (motionTimer.current) clearTimeout(motionTimer.current);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

  const mutate: Mutate = async (action) => {
    if (mutatingRef.current) return;
    mutatingRef.current = true;
    setError('');
    try {
      setData(await action());
    } catch (e) {
      setError(errorText(e));
    } finally {
      mutatingRef.current = false;
    }
  };

  const askAI = (prompt: string): void => {
    void wb.ai.config().then((raw) => {
      const cfg = raw as { aiEnabled?: boolean };
      if (!cfg.aiEnabled) { setError('请先在主窗 AI 设置中配置并启用'); return; }
      setFloatMode('ai');
      setAiSeed({ text: prompt, nonce: ++seedNonce.current });
    }, () => setError('AI 状态读取失败,请重试'));
  };

  const setCollapsedAndSync = async (next: boolean, after?: () => void): Promise<void> => {
    if (movingRef.current || widthChanging.current || next === collapsed) return;
    movingRef.current = true;
    const animate = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setMotion(next ? 'collapsing' : 'expanding');
    try {
      await wb.float.collapse(next, animate);
      setCollapsed(next);
      after?.();
      setMotion(animate ? 'entering' : 'idle');
      if (animate) {
        motionTimer.current = setTimeout(() => {
          movingRef.current = false;
          setMotion('idle');
        }, 220);
      } else {
        movingRef.current = false;
      }
    } catch (e) {
      movingRef.current = false;
      setMotion('idle');
      setError(errorText(e));
    }
  };

  const expandFor = (open: () => void): void => {
    if (movingRef.current) return;
    wb.float.resize(floatMinHeight());
    void setCollapsedAndSync(false, open);
  };

  const today = localDay(clock);
  const openTasks = data ? openToday(data.tasks, today) : [];
  const currentIndex = openTasks.length ? miniIndex % openTasks.length : 0;
  const focus = openTasks[currentIndex];
  const categoryById = new Map((data?.categories ?? []).map((c) => [c.id, c]));
  const focusCategory = focus?.categoryId ? categoryById.get(focus.categoryId) : null;
  const focusOverdue = focus ? (focus.dueAt ? Date.parse(focus.dueAt) < clock.getTime() : focus.plannedDate < today) : false;
  const focusTime = focus?.dueAt ? new Date(focus.dueAt) : null;
  const focusTimeLabel = focusTime ? `${focusTime.getMonth() + 1}/${focusTime.getDate()} ${String(focusTime.getHours()).padStart(2, '0')}:${String(focusTime.getMinutes()).padStart(2, '0')}` : '不限时';
  const todayTasks = data ? data.tasks.filter((t) => !t.deletedAt && t.plannedDate <= today) : [];
  const dueReminders = todayTasks.filter((t) => t.status !== 'done' && t.remindAt && Date.parse(t.remindAt) <= clock.getTime());

  useEffect(() => {
    if (!armedTaskId) return;
    const timer = window.setTimeout(() => setArmedTaskId(null), 4000);
    return () => window.clearTimeout(timer);
  }, [armedTaskId]);

  const measurementData = JSON.stringify(data);
  useLayoutEffect(() => {
    if (collapsed || floatMode !== 'home' || !data || motion !== 'idle') return;
    let initialWidth = window.innerWidth;
    let widthReflow = false;
    const measure = (): void => {
      if (window.innerWidth !== initialWidth || widthChanging.current) widthReflow = true;
      // A width-only reflow must never feed back into native height. Reset this
      // guard only for actual content/view changes, not identical poll results.
      if (movingRef.current || widthReflow) return;
      if (window.innerHeight < 330) return;
      if (libraryOpen || editor || review !== null) { wb.float.resize(floatMinHeight()); return; }
      const root = document.querySelector<HTMLElement>('.float-app');
      const board = root?.querySelector<HTMLElement>('.today-board');
      const todayCard = board?.querySelector<HTMLElement>('.plan-today');
      const scheduleCard = board?.querySelector<HTMLElement>('.plan-schedule');
      if (!root || !board || !todayCard || !scheduleCard) return;
      const list = todayCard.querySelector<HTMLElement>('.plan-list, .plan-tiles');
      const lastItem = list?.lastElementChild;
      const contentHeight = list && lastItem
        ? lastItem.getBoundingClientRect().bottom - list.getBoundingClientRect().top + list.scrollTop + parseFloat(getComputedStyle(list).paddingBottom)
        : 0;
      const todayHeight = list ? todayCard.offsetHeight - list.clientHeight + contentHeight : todayCard.offsetHeight;
      const gap = parseFloat(getComputedStyle(board).rowGap) || 0;
      wb.float.resize(Math.max(floatMinHeight(), Math.ceil(root.offsetHeight - board.offsetHeight + todayHeight + gap + scheduleCard.offsetHeight)));
    };
    measure();
    window.addEventListener('resize', measure);
    const scheduleCard = document.querySelector<HTMLElement>('.float-body .plan-schedule');
    const observer = scheduleCard ? new ResizeObserver(measure) : null;
    if (scheduleCard) observer?.observe(scheduleCard);
    const board = document.querySelector<HTMLElement>('.float-body .today-board');
    // Child-owned state (schedule folders, confirmation rows) does not change
    // measurementData. Observe semantic DOM changes separately from CSS reflow:
    // a width toggle changes the ancestor class, never these contents.
    const contents = board ? new MutationObserver(() => {
      initialWidth = window.innerWidth;
      widthReflow = false;
      measure();
    }) : null;
    if (board) contents?.observe(board, { childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ['aria-expanded'] });
    return () => {
      window.removeEventListener('resize', measure);
      observer?.disconnect();
      contents?.disconnect();
    };
  }, [collapsed, floatMode, measurementData, today, libraryOpen, editor, review, dueReminders.length, motion]);

  return (
    <div className={`float-app${narrow ? ' narrow' : ''}${collapsed ? ' mini' : ''} is-${motion}${floatMode === 'ai' ? ' ai-active' : ''}`}>
      <header className={collapsed ? 'float-bar float-mini-bar' : 'float-bar'}>
        <div className="float-bar-leading">
          <span className="float-brand" aria-hidden="true"><LogoMark size={40} /></span>
          <span className="float-bar-title">待办</span>
        </div>
        <div className="float-window-actions">
          <button className={floatMode === 'ai' ? 'float-bar-btn ai on' : 'float-bar-btn ai'} title="AI 助手" aria-label="AI 助手" aria-pressed={floatMode === 'ai'} onClick={() => { if (collapsed) { if (floatMode === 'ai') { setFloatMode('home'); wb.float.collapse(true, true); } else { setFloatMode('ai'); wb.float.tempHeight(null); } } else { setFloatMode(m => m === 'ai' ? 'home' : 'ai'); } }}><span className={floatMode === 'ai' ? 'float-ai-glyph on' : 'float-ai-glyph'} aria-hidden='true' /></button>
          <button className={pinned ? 'float-bar-btn on' : 'float-bar-btn'} title={pinned ? '取消置顶' : '置顶'} aria-label={pinned ? '取消置顶' : '置顶'} aria-pressed={pinned} onClick={() => { void wb.float.pin().then(setPinned); }}><PushPin size={19} weight={pinned ? 'fill' : 'regular'} /></button>
          <button className="float-bar-btn" title={narrow ? '加宽悬浮窗' : '收窄悬浮窗'} aria-label={narrow ? '加宽悬浮窗' : '收窄悬浮窗'} aria-pressed={narrow} disabled={widthBusy || motion !== 'idle'} onClick={() => { void changeWidth(); }}><ArrowsHorizontal size={19} /></button>
          <button className="float-bar-btn" title={collapsed ? '展开主界面' : '收起为卡片'} aria-label={collapsed ? '展开主界面' : '收起为卡片'} disabled={widthBusy || motion !== 'idle'} onClick={() => { void setCollapsedAndSync(!collapsed); }}>{collapsed ? <ArrowsOutLineVertical size={19} /> : <ArrowsInLineVertical size={19} />}</button>
          <button className="float-bar-btn" title="隐藏(托盘可再次打开)" aria-label="隐藏悬浮待办窗" onClick={() => { void wb.float.toggle(); }}><Minus size={20} /></button>
        </div>
      </header>

      {collapsed && floatMode === 'ai' ? (
        <div className="float-mini-ai" inert={motion !== 'idle'}>
          <FloatAiChat mini seed={aiSeed} onSeedConsumed={() => setAiSeed(null)} tasks={data?.tasks ?? []} categories={data?.categories ?? []} onCompactHeight={(h) => wb.float.tempHeight(h)} onExpand={() => { void setCollapsedAndSync(false); }} onBack={() => { setFloatMode('home'); wb.float.collapse(true, true); }} />
        </div>
      ) : collapsed ? (
        <div className="float-mini-content" inert={motion !== 'idle'}>
          <div className={error ? 'float-mini-summary has-error' : 'float-mini-summary'} role={error ? 'alert' : undefined} title={error || undefined}>
            <strong>{error ? '操作失败，请展开查看' : `${clock.getMonth() + 1}月${clock.getDate()}日 · 今日待办`}</strong>
            <span>剩余 {openTasks.length} 项</span>
          </div>
          <div className="float-mini-main">
            <div className="float-mini-stack">
              {focus ? (
                <>
                  <button type="button" className="float-mini-stack-back" aria-label="查看下一项" disabled={openTasks.length < 2} onClick={() => { setArmedTaskId(null); setMiniIndex(index => (index + 1) % openTasks.length); }} />
                  <article className="float-mini-task">
                    <span className="float-mini-badges"><span className={focus.kind === 'meeting' ? 'meeting' : 'task'}>{focus.kind === 'meeting' ? '日程' : '待办'}</span>{focusOverdue && <span className="overdue">已超期</span>}</span>
                    <span className={focusOverdue ? 'float-mini-time overdue' : 'float-mini-time'}>{focusTime ? `${focus.kind === 'meeting' ? '开始' : '截止'} ${focusTimeLabel}` : '不限时'}</span>
                    <div className={focus.kind === 'meeting' ? 'float-mini-task-main meeting' : 'float-mini-task-main'}>
                      {focus.kind === 'task' && <button type="button" className={armedTaskId === focus.id ? 'float-mini-check armed' : 'float-mini-check'} aria-label={armedTaskId === focus.id ? `取消完成 ${focus.title}` : `完成 ${focus.title}`} aria-pressed={armedTaskId === focus.id} onClick={() => setArmedTaskId(armedTaskId === focus.id ? null : focus.id)}><Check size={12} /></button>}
                      <button type="button" className="float-mini-task-title" title={`展开编辑：${focus.title}`} onClick={() => expandFor(() => setEditor(focus))}>{focus.title}</button>
                    </div>
                    <div className="float-mini-meta">
                      <span className="float-mini-category">{focusCategory ? <><i style={{ backgroundColor: focusCategory.color }} />{focusCategory.name}</> : focus.kind === 'meeting' ? '日程安排' : `优先级 · ${focus.priority === 'high' ? '高' : focus.priority === 'medium' ? '中' : '低'}`}{focus.progress !== null && ` · ${focus.progress}%`}</span>
                      {armedTaskId === focus.id ? <span className="float-mini-confirm"><button type="button" onClick={() => { setArmedTaskId(null); void mutate(() => wb.todo.update(focus.id, { status: 'done' }, focus.updatedAt)); }}>确认完成</button><button type="button" onClick={() => setArmedTaskId(null)}>取消</button></span> : <span className="float-mini-pager"><span>{currentIndex + 1} / {openTasks.length}</span><button type="button" aria-label="上一项" disabled={openTasks.length < 2} onClick={() => { setArmedTaskId(null); setMiniIndex(index => (index + openTasks.length - 1) % openTasks.length); }}><CaretDown size={10} className="up" /></button><button type="button" aria-label="下一项" disabled={openTasks.length < 2} onClick={() => { setArmedTaskId(null); setMiniIndex(index => (index + 1) % openTasks.length); }}><CaretDown size={10} /></button></span>}
                    </div>
                  </article>
                </>
              ) : <article className="float-mini-task empty"><span><Plus size={18} /></span><button type="button" onClick={() => expandFor(() => setEditor('new'))}><strong>{data ? '今天还没有安排' : '正在读取待办…'}</strong><small>{data ? '新增一项待办或日程' : '请稍候'}</small></button></article>}
            </div>
            <nav className="float-mini-quick" aria-label="快捷操作">
              <button type="button" onClick={() => expandFor(() => setEditor('new'))}><Plus size={18} /><span>新增事项</span></button>
              <button type="button" className="ai-entry" onClick={() => { setFloatMode('ai'); wb.float.tempHeight(null); }}><Sparkle size={18} /><span>AI 助手</span></button>
            </nav>
          </div>
        </div>
      ) : <>

      {error && <div className="float-error" role="alert">{error}</div>}

      {/* 仪表区:对齐上游排版,颜色沿用工作台主题。 */}
      <div className="dash-top float-dash" inert={motion !== 'idle'}>
        <div className="dash-heading">
          <h1>{clock.getMonth() + 1}月{clock.getDate()}日</h1>
          <span>{['周日', '周一', '周二', '周三', '周四', '周五', '周六'][clock.getDay()]} · 专注当下</span>
        </div>
        <div className="dash-actions">
          <button className="btn btn-sec btn-sm" onClick={() => setLibraryOpen(v => !v)}>
            <IconDocs size={17} />
            事项库
          </button>
          <button className="btn btn-pri btn-sm" onClick={() => setEditor('new')}>
            <Plus size={17} />
            新增
          </button>
        </div>
      </div>

      {floatMode === 'ai' ? (
        <div className="float-ai">
          <header className="float-ai-head">
            <b><Sparkle size={14} weight="fill" /> AI 助手</b>
            <button className="float-ai-back" onClick={() => setFloatMode('home')}><ArrowLeft size={15} />返回首页</button>
          </header>
          <div className="float-ai-body">
            <FloatAiChat seed={aiSeed} onSeedConsumed={() => setAiSeed(null)} tasks={data?.tasks ?? []} categories={data?.categories ?? []} />
          </div>
        </div>
      ) : (
      <div className="float-body" inert={motion !== 'idle'}>
        {data ? (
          libraryOpen ? (
            <TaskLibrary
              tasks={data.tasks}
              categories={data.categories}
              api={libraryApi}
              changed={(state) => mutate(async () => state)}
              edit={setEditor}
              close={() => setLibraryOpen(false)}
            />
          ) : (
            <TodayBoard
              tasks={data.tasks}
              today={today}
              categoryById={categoryById}
              planView='rows'
              mutating={false}
              api={editorApi}
              mutate={mutate}
              setEditor={setEditor}
              emptyText="点击右上角「新增」添加待办。"
              toolbar={
                <button className='float-review' onClick={() => { void wb.todo.review().then(setReview, () => setError('复盘生成失败,请重试')); }}>···</button>
              }
            />
          )
        ) : (
          <div className="float-loading">正在读取本地待办…</div>
        )}
      </div>
      )}

      {dueReminders.length > 0 && !libraryOpen && floatMode === 'home' && motion === 'idle' ? (
      <footer className="float-foot" inert={motion !== 'idle'}>
          <div className="reminder-strip">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="8.2" /><path d="M12 7.5V12l3 2" /></svg>
            <span>{dueReminders[0].title}</span>
            <button onClick={() => mutate(() => wb.todo.snooze(dueReminders[0].id))}>稍后10分钟</button>
          </div>
        </footer>
      ) : null}
      </>}

      {!collapsed && editor ? (
        <TaskEditor
          key={editor === 'new' ? 'new' : editor.id}
          task={editor === 'new' ? undefined : editor}
          categories={data?.categories ?? []}
          api={editorApi}
          changed={(state) => mutate(async () => state)}
          saved={(state) => mutate(async () => state)}
          close={() => setEditor(null)}
        />
      ) : null}



      {!collapsed && review !== null ? (
        <Modal title="今日复盘" close={() => setReview(null)}>
          <div className="form-body">
            <div className="sheet-card">
              <pre className="review-content">{review}</pre>
              <p className="field-help">以上由本地事项记录生成,与 To-Do-List 同库同源。点击下方按钮,会把相关事项发送到已配置的模型进行总结。</p>
              <button className="btn btn-pri btn-sm" onClick={() => { setReview(null); askAI('请根据今日待办、日程和进展生成简短的中文每日复盘:完成事项、未完成事项、明日建议。只返回总结,不修改任何事项。'); }}>在 AI 助手中总结</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}

// 本地 Modal(与 ui.tsx 的 Modal 同构,避免在悬浮窗引入主窗依赖)
function Modal({ title, children, close }: { title: string; children: React.ReactNode; close(): void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog ref={ref} className="modal" aria-label={title} onCancel={(e) => { e.preventDefault(); close(); }}>
      <header className="modal-heading">
        <div className="modal-heading-row">
          <div className="modal-heading-lead"><h2>{title}</h2></div>
          <button type="button" className="modal-text-close" onClick={close}>关闭</button>
        </div>
      </header>
      {children}
    </dialog>
  );
}

// ---- AI 模式:上游两套布局同源状态机 ----
// mini = 上游 mini-ai-surface(104px 三行网格:上下文/输入/快捷;执行态中间行 1fr;conic 流光边框)
// panel = 展开态全内容区四态执行面(composer / asking / working / result)
// 不是聊天记录界面:输入一句话 → (AI 反问则答题) → 看执行进度 → 确认建议或阅读纯文本回复 → 再回到输入。

// 模型切换只用到 ai:config 返回的字段子集
type AiConfigBrief = Pick<AiConfig, 'providers' | 'models' | 'activeModelId'>;


export function FloatAiChat({ seed, onSeedConsumed, tasks, categories = [], onCompactHeight, mini = false, onExpand, onBack }: {
  seed: { text: string; nonce: number } | null;
  onSeedConsumed(): void;
  tasks: Task[];
  categories?: { id: string; name: string }[];
  onCompactHeight?: (height: number | null) => void;
  mini?: boolean;
  onExpand?(): void;
  onBack?(): void;
}) {
  const [chat, setChat] = useState<ChatSession | null>(null);
  const chatRef = useRef(chat); chatRef.current = chat;
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ask, setAsk] = useState<{ id: string; sessionId: string; question: string; options: { label: string; description?: string }[] } | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [linked, setLinked] = useState<Task | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<TodoStatusFilter>('all');
  const [kindFilter, setKindFilter] = useState<TodoKindFilter>('all');
  const [keptProposalToken, setKeptProposalToken] = useState<string | null>(null);
  const [dismissedProposalToken, setDismissedProposalToken] = useState<string | null>(null);
  // 本轮从哪条助手消息之后开始。收起态只靠它把纯文本/失败留在结果区,打开历史对话时不占住输入框。
  const [replyWatch, setReplyWatch] = useState<{ baselineId: string | null } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const consumed = useRef<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const list = await wb.ai.chatList();
      if (cancelled) return;
      const target = preferredAiChat(list.filter(chat => sameAiScope(chat, { module: 'todo' })), { module: 'todo' });
      const selected = target ? await wb.ai.chatOpen(target.id) : await wb.ai.chatNew({ module: 'todo' });
      if (cancelled) return;
      setChat(selected); setBusy(selected.entries.some(entry => entry.streaming));
    })().catch((e) => { if (!cancelled) setError(errorText(e)); });
    const offChat = wb.ai.onChat((next) => {
      setChat((prev) => (prev && prev.id === next.id ? next : prev));
      if (chatRef.current?.id === next.id) {
        const running = next.entries.some((entry) => entry.streaming);
        setBusy(running); if (!running) setAsk(null);
      }
    });
    const offAsk = wb.ai.onAsk((a) => { if (a.sessionId === chatRef.current?.id) setAsk(a); });
    return () => { cancelled = true; offChat(); offAsk(); };
  }, []);

  useEffect(() => {
    if (!seed || consumed.current === seed.nonce || !chat || busy || ask || !seed.text.trim()) return;
    consumed.current = seed.nonce;
    void send(seed.text);
    onSeedConsumed();
  }, [seed, chat?.id, busy, ask]);

  const conversation = chat?.entries ?? [];
  const pendingProposal = conversation.find((entry) => entry.actionState === 'pending' && entry.proposal?.actions.length);
  const pendingToken = pendingProposal?.proposal?.token ?? null;
  // Remember the suggestion that was just pending so Apply does not unmount the card.
  let activeProposalToken = keptProposalToken;
  if (pendingToken && pendingToken !== activeProposalToken) {
    activeProposalToken = pendingToken;
    setKeptProposalToken(pendingToken);
  }
  const keptEntry = activeProposalToken ? conversation.find((entry) => entry.proposal?.token === activeProposalToken) ?? null : null;
  const showMiniProposal = Boolean(keptEntry?.proposal && dismissedProposalToken !== activeProposalToken);
  const miniProposalVisible = mini && showMiniProposal && !ask && !busy;
  const latestAssistant = [...conversation].reverse().find((entry) => entry.role === 'assistant');
  // 有修改建议时走建议卡。没有建议的正文或错误要单独留在结果区,否则执行一结束就回到空输入。
  const textReply = latestAssistant && !latestAssistant.streaming && !latestAssistant.proposal?.actions.length && (latestAssistant.content.trim() || latestAssistant.error)
    ? latestAssistant : null;
  const watchedReplyId = replyWatch && !busy && !ask && textReply && textReply.id !== replyWatch.baselineId ? textReply.id : null;
  const showMiniReply = Boolean(mini && !showMiniProposal && watchedReplyId && textReply);

  // 反问仍是 300。收起态建议卡是 232。纯文本回复也是 232，但回复叠在输入上方，关联事项和发送仍可用。其余回 176。只在迷你态生效。
  useEffect(() => {
    if (mini) onCompactHeight?.(ask ? 300 : miniProposalVisible ? 232 : showMiniReply ? 232 : null);
  }, [ask, miniProposalVisible, showMiniReply, mini, onCompactHeight]);

  async function send(text: string): Promise<void> {
    if (!chat || !text.trim() || busy || ask) return;
    const baselineId = [...chat.entries].reverse().find((entry) => entry.role === 'assistant')?.id ?? null;
    setError('');
    setBusy(true);
    setPickerOpen(false);
    setLogOpen(false);
    setReplyWatch({ baselineId });
    const prompt = linked ? `关于事项「${linked.title}」:${text.trim()}` : text.trim();
    setInput('');
    await wb.ai.ask(chat.id, prompt).catch((e) => { setError(errorText(e)); setBusy(false); });
  }

  function answer(kind: 'option' | 'text' | 'skip', value?: string): void {
    if (!ask) return;
    wb.ai.answerAsk({ id: ask.id, sessionId: ask.sessionId, kind, value });
    setAsk(null);
    setInput('');
  }

  const tools = latestAssistant?.tools ?? [];
  const currentTool = tools.find((tool) => tool.status === 'running') ?? [...tools].reverse().find((tool) => tool.status !== 'complete');
  const completedTools = tools.filter((tool) => tool.status === 'complete').length;

  // 模型切换(上游 compact 同款:底部 toggle + 按供应商分组菜单;菜单用 portal 固定定位,不被 surface overflow 裁剪)
  const [config, setConfig] = useState<AiConfigBrief | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelMenuPos, setModelMenuPos] = useState<{ bottom: number; right: number; width: number; maxHeight: number } | null>(null);
  const modelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    void wb.ai.config().then((raw) => setConfig(raw)).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!modelOpen) return;
    const onDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.fa-model-menu') || target?.closest('.fa-model-toggle')) return;
      setModelOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [modelOpen]);

  // 事项选择浮层:点击外部关闭
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: PointerEvent): void => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.fa-picker, .fa-picker-list, .fa-mini-picker, .ai-add-reference, .todo-picker-filters')) return;
      setPickerOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [pickerOpen]);

  useEffect(() => {
    const close = (): void => { setPickerOpen(false); setModelOpen(false); };
    const key = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || (!pickerOpen && !modelOpen)) return;
      event.preventDefault();
      if (modelOpen) modelBtnRef.current?.focus();
      else document.querySelector<HTMLButtonElement>('.ai-add-reference')?.focus();
      close();
    };
    window.addEventListener('resize', close);
    document.addEventListener('keydown', key);
    return () => { window.removeEventListener('resize', close); document.removeEventListener('keydown', key); };
  }, [pickerOpen, modelOpen]);

  // 消息区滚动跟随(同 AiPanel:用户上翻即暂停跟随)
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && followReply.current) element.scrollTop = element.scrollHeight;
  }, [chat?.entries, ask]);

  const activeModel = config?.models.find((m) => m.id === config.activeModelId) ?? null;
  const modelLabel = activeModel?.name ?? '选择模型';

  const toggleModelMenu = (): void => {
    if (modelOpen) { setModelOpen(false); return; }
    const rect = modelBtnRef.current?.getBoundingClientRect();
    if (rect) {
      const bottom = Math.round(window.innerHeight - rect.top + 6);
      const cap = Math.round(window.innerHeight - bottom - 8);
      setModelMenuPos({ bottom, right: Math.max(8, window.innerWidth - rect.right),
        width: Math.min(152, window.innerWidth - 24), maxHeight: Math.max(24, Math.min(240, cap)) });
    }
    setModelOpen(true);
  };

  const selectModel = (id: string): void => {
    setModelOpen(false);
    if (!config || id === config.activeModelId) return;
    void wb.ai.activateModel(id).then((raw) => setConfig(raw)).catch((e) => setError(errorText(e)));
  };

  const modelMenu = modelOpen && config && config.models.length ? createPortal(
    <div className="fa-model-menu fa-mini-model-menu" role="menu" aria-label="按供应商选择模型" style={{ bottom: modelMenuPos?.bottom, right: modelMenuPos?.right, width: modelMenuPos?.width, maxHeight: modelMenuPos?.maxHeight }}>
      {config.providers.map((provider) => {
        const models = config.models.filter((m) => m.providerId === provider.id);
        if (!models.length) return null;
        return (
          <section key={provider.id} role="group" aria-label={provider.name}>
            <b>{provider.name}</b>
            {models.map((model) => (
              <button key={model.id} type="button" role="menuitemradio" title={model.name} aria-checked={model.id === config.activeModelId} className={model.id === config.activeModelId ? 'is-active' : ''} onClick={() => selectModel(model.id)}>
                <span>{model.name}</span>
                {model.id === config.activeModelId ? <small>当前</small> : null}
              </button>
            ))}
          </section>
        );
      })}
    </div>,
    document.body,
  ) : null;

  const modelControl = config && config.models.length ? (
    <button ref={modelBtnRef} type="button" className="fa-model-toggle" title={modelLabel} aria-label={`切换模型,当前为 ${modelLabel}`} aria-haspopup="menu" aria-expanded={modelOpen} onClick={toggleModelMenu}>
      <span>{modelLabel}</span>
      <CaretDown size={9} />
    </button>
  ) : null;

  const linkedChip = linked ? <span className="ai-reference-chip"><span title={linked.title}>关联 · {linked.title}</span><button type="button" aria-label={`取消关联 ${linked.title}`} onClick={() => setLinked(null)}><X size={12} /></button></span> : null;
  const referenceControl = <button type="button" className="ai-add-reference" aria-expanded={pickerOpen} aria-label="关联已有事项" onClick={() => { setModelOpen(false); setPickerOpen(value => !value); }}><Plus size={13} />关联事项</button>;
  const activeTasks = tasks.filter(task => !task.deletedAt);
  const visibleTasks = activeTasks.filter(task => matchesTodoPickerFilter({ statusKey: todoPickerStatusKey(task), kind: task.kind }, statusFilter, kindFilter));
  const categoryName = (task: Task) => categories.find(category => category.id === task.categoryId)?.name ?? '';
  const picker = pickerOpen ? <div className={`fa-picker${mini ? ' fa-mini-picker' : ''}`}>
    <TodoPickerFilters status={statusFilter} kind={kindFilter} onStatus={setStatusFilter} onKind={setKindFilter} />
    <div className="fa-picker-list" role="listbox" aria-label="选择事项">
      {visibleTasks.map(task => {
        const statusKey = todoPickerStatusKey(task);
        const status = TODO_STATUS_LABEL[statusKey];
        const detail = [task.kind === 'meeting' ? '日程' : '待办', scheduleStamp(task), categoryName(task)].filter(Boolean).join(' · ');
        const chosen = linked?.id === task.id;
        return <button type="button" key={task.id} role="option" aria-selected={chosen} className={chosen ? 'is-linked' : ''} title={task.title} onClick={() => { setLinked(task); setPickerOpen(false); document.querySelector<HTMLButtonElement>('.ai-add-reference')?.focus(); }}>
          <span className={`ai-reference-kind ${task.kind === 'meeting' ? 'meeting' : 'task'}`} aria-hidden="true">{task.kind === 'meeting' ? <CalendarBlank size={16} weight="bold" /> : <Circle size={10} weight="fill" />}</span>
          <span className="ai-reference-option-text"><strong>{task.title}</strong><small>{detail}</small></span>
          <small className={`fa-task-status ${statusKey}`}>{status}</small>
          <span className="ai-reference-selected-mark">{chosen ? <Check size={12} weight="bold" aria-label="当前选择" /> : null}</span>
        </button>;
      })}
      {!activeTasks.length && <p>暂无可关联事项</p>}
      {activeTasks.length > 0 && !visibleTasks.length && <p>没有符合筛选的事项</p>}
    </div>
  </div> : null;

  // ================= 迷你布局(标题 / 两行对话框 / 底栏;建议卡与运行态占满中间) =================
  if (mini) {
    const surfaceClass = ask ? 'fa-mini-surface is-asking' : busy ? 'fa-mini-surface is-working' : miniProposalVisible ? 'fa-mini-surface is-result is-proposal' : showMiniReply ? 'fa-mini-surface is-result is-reply' : 'fa-mini-surface';
    return (
      <section className={surfaceClass} aria-live={busy || ask || showMiniReply ? 'polite' : undefined}>
        <div className="fa-mini-context">
          <span className="fa-mini-mark"><Sparkle size={10} weight="fill" /></span>
          <span className="fa-mini-title"><b>AI 助手</b></span>
          {onExpand && (
            <button className="fa-mini-icon" title="展开 AI 对话" aria-label="展开 AI 对话" onClick={onExpand}><ArrowsOutSimple size={11} /></button>
          )}
          <button className="fa-mini-back" onClick={() => { onBack?.(); }}><ArrowLeft size={9} />返回</button>
        </div>

        {ask ? (
          <>
            <div className="fa-mini-middle">
              <p className="fa-mini-question">{ask.question}</p>
              <div className="fa-mini-options" role="group" aria-label="回答选项">
                {ask.options.map((option) => (
                  <button key={option.label} onClick={() => answer('option', option.label)}>
                    <span className="fa-radio" aria-hidden="true" />
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </button>
                ))}
              </div>
              <form noValidate className="fa-mini-askform" onSubmit={(e) => { e.preventDefault(); if (input.trim()) answer('text', input.trim()); }}>
                <input value={input} placeholder="输入回答…" aria-label="自由回答" onChange={(e) => setInput(e.target.value)} />
                <button type="submit" disabled={!input.trim()}>提交</button>
              </form>
            </div>
            <footer className="fa-mini-foot">
              <span>已暂停 · 等待回答</span>
              <button onClick={() => answer('skip')}>跳过</button>
              <button className="fa-x" title="取消 AI 请求" onClick={() => { if (chat) wb.ai.cancel(chat.id); setAsk(null); }}><X size={11} /></button>
            </footer>
          </>
        ) : busy ? (
          <>
            <div className="fa-mini-middle">
              {logOpen ? (
                <ol className="fa-mini-log">
                  {tools.map((tool) => (
                    <li key={tool.id}><span>{tool.label}</span><small>{tool.status === 'running' ? '执行中' : tool.status === 'complete' ? '已完成' : tool.status === 'error' ? '失败' : '已中断'}</small><i>{tool.status === 'complete' ? '✓' : tool.status === 'running' ? '•' : '!'}</i></li>
                  ))}
                </ol>
              ) : latestAssistant?.content ? (
                <div className="fa-mini-stream"><span><i />AI 正在回复</span><p>{latestAssistant.content}</p></div>
              ) : (
                <div className="fa-mini-operation">
                  <span className="fa-spinner" />
                  <span><em>{currentTool ? '工具' : '阶段'}</em><b>{currentTool?.label ?? '正在准备模型上下文'}</b></span>
                  <strong>执行中</strong>
                </div>
              )}
              {error && <p className="fa-error">{error}</p>}
            </div>
            <footer className="fa-mini-foot">
              <span className="fa-mini-loop"><i /></span>
              <small>已完成 {completedTools} 项</small>
              <button onClick={() => setLogOpen(v => !v)}>{logOpen ? '返回进度' : '处理记录'}</button>
              <button className="fa-x" title="取消 AI 请求" onClick={() => chat && wb.ai.cancel(chat.id)}><X size={11} /></button>
            </footer>
          </>
        ) : miniProposalVisible && keptEntry?.proposal ? (
          <div className="fa-mini-middle fa-mini-proposal">
            <TodoProposalCard entry={keptEntry} busy={busy} apply={(token, indices) => wb.ai.apply(token, indices)} discard={(token) => wb.ai.discard(token)} />
            {keptEntry.actionState !== 'pending' && (
              <button type="button" className="fa-mini-continue" onClick={() => setDismissedProposalToken(keptEntry.proposal!.token)}>继续对话</button>
            )}
            {error && <p className="fa-error">{error}</p>}
          </div>
        ) : (
          <>
            {showMiniReply && textReply ? (
              <div className="fa-mini-reply">
                <div className="fa-mini-reply-body">
                  <span>{textReply.error ? '未能完成' : '已回复'}</span>
                  {textReply.content.trim() ? <p>{textReply.content}</p> : null}
                  {textReply.error ? <p className="fa-error" role="alert">{textReply.error}</p> : null}
                </div>
                <button type="button" className="fa-mini-continue" onClick={() => { setReplyWatch(null); setLogOpen(false); }}>继续对话</button>
              </div>
            ) : null}
            <form noValidate className="fa-mini-compose" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
              {linkedChip}
              <div className="fa-mini-compose-main">
                <textarea rows={2} value={input} maxLength={10000} aria-label="AI 对话输入"
                  placeholder={linked ? `针对「${linked.title}」…` : '一句话告诉 AI 你想怎么处理'}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
                <button type="submit" aria-label="发送" disabled={!input.trim()}><PaperPlaneRight size={11} weight="fill" /></button>
              </div>
            </form>
            <div className="fa-mini-quick">
              {referenceControl}
              {modelControl}
            </div>
            {picker}
            {logOpen && (
              <div className="fa-mini-answer">
                <p>{latestAssistant?.error ?? latestAssistant?.content}</p>
                <button onClick={() => setLogOpen(false)}>返回</button>
              </div>
            )}
            {!showMiniReply && error && <p className="fa-error">{error}</p>}
          </>
        )}
        {modelMenu}
      </section>
    );
  }

  // ================= 展开布局(对话流,与主窗 AiPanel 同构:双方消息 + 思考/工具 + markdown + 内联建议卡) =================
  // 内层不再放「AI 助手」标题行(外层 float-ai-head 的「←返回 | AI 助手」即是标题)
  return (
    <section className="fa-surface">
      <div className="ai-messages" ref={scrollRef} onScroll={() => {
        const element = scrollRef.current;
        if (element) followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
      }}>
        {conversation.length === 0 && !ask && (
          <div className="ai-empty">
            <span className="ai-empty-avatar"><Sparkle size={24} weight="fill" /></span>
            <b>待办与日程</b>
            <p>查询待办、整理日程，修改会先让你确认。</p>
          </div>
        )}
        {conversation.map((entry) => (
          <div key={entry.id} className={entry.role === 'user' ? 'ai-msg user' : 'ai-msg'}>
            {entry.role === 'assistant' ? <AiResponse entry={entry} /> : <div className="ai-bubble">{entry.content}</div>}
            {entry.error && <div className="ai-error" role="alert">{entry.error}</div>}
            {entry.proposal && <TodoProposalCard key={entry.proposal.token} entry={entry} busy={busy}
              apply={(token, indices) => wb.ai.apply(token, indices)} discard={(token) => wb.ai.discard(token)} />}
            {!entry.proposal && entry.actionState && entry.actionState !== 'pending' && (
              <div className={'ai-action-state ' + entry.actionState}>
                {({ applied: '已应用', discarded: '已保留原内容', expired: '已过期，未应用', revised: '已被后续建议替代', undone: '已撤销' } as const)[entry.actionState]}
              </div>
            )}
          </div>
        ))}
        {error && <div className="ai-error" role="alert">{error}</div>}
        {ask && (
          <div className="fa-askcard" role="group" aria-label="AI 补充提问">
            <p className="fa-question">{ask.question}</p>
            {ask.options.length > 0 && (
              <div className="fa-options" role="group" aria-label="回答选项">
                {ask.options.map((option) => (
                  <button key={option.label} onClick={() => answer('option', option.label)}>
                    <span className="fa-radio" aria-hidden="true" />
                    <span>{option.label}</span>
                    {option.description ? <small>{option.description}</small> : null}
                  </button>
                ))}
              </div>
            )}
            <form noValidate className="fa-ask-input" onSubmit={(e) => { e.preventDefault(); if (input.trim()) answer('text', input.trim()); }}>
              <input value={input} placeholder="输入回答…" aria-label="自由回答" onChange={(e) => setInput(e.target.value)} />
              <button type="submit" disabled={!input.trim()}>提交</button>
            </form>
            <footer className="fa-foot">
              <span>已暂停 · 等待回答</span>
              <button onClick={() => answer('skip')}>跳过</button>
              <button className="fa-x" title="取消 AI 请求" onClick={() => { if (chat) wb.ai.cancel(chat.id); setAsk(null); }}><X size={12} /></button>
            </footer>
          </div>
        )}
      </div>
      <div className="ai-compose-wrap">
        {picker}
        <div className="ai-compose">
          <div className="ai-compose-input">
            {linkedChip ? <div className="ai-reference-row" aria-label="已关联事项" aria-live="polite">{linkedChip}</div> : null}
            <textarea rows={1} value={input} maxLength={10000} aria-label="AI 对话输入"
              placeholder={linked ? `针对「${linked.title}」提问…` : '一句话告诉 AI 你想怎么处理'}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(input); } }} />
            <div className="ai-compose-toolbar">
              {referenceControl}
              {config && config.models.length ? (
                <TodoSelect aria-label="选择大模型" className="ai-model-select" menuClassName="ai-model-menu"
                  value={config.activeModelId || config.models[0].id} onChange={selectModel} disabled={busy}
                  renderOption={(option) => <span title={option.label}>{option.label}</span>}
                  options={config.providers.flatMap((provider) => config.models.filter((item) => item.providerId === provider.id).map((item) => ({ value: item.id, label: item.name, group: provider.name })))} />
              ) : null}
              {busy ? (
                <button type="button" className="ai-send cancel" aria-label="停止生成" title="停止生成" onClick={() => chat && wb.ai.cancel(chat.id)}><Stop size={16} weight="fill" /></button>
              ) : (
                <button type="button" className="ai-send" aria-label="发送" title="发送" disabled={!input.trim()} onClick={() => void send(input)}><PaperPlaneRight size={16} weight="fill" /></button>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
