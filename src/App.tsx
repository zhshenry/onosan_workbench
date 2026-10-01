import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CheckSquareOffset, GearSix, Sparkle } from '@phosphor-icons/react';
import { NAV, defaultViewOfWorkbench, ownerOfWorkbench, workbenchById, type WorkbenchDef, type WorkbenchId } from './nav';
import type { AvatarColor, UiTheme, ViewId } from '../shared/contracts';
import { localDay, openToday, taskTime, type ChatSession, type CopySource, type Task, type TaskInput } from '../shared/todo-contracts';
import { isOverdue, meetingEndAt, scheduleTimeRange } from '../shared/todo-format';
import { HomeView, useTodoData } from './views/HomeView';
import { AiPanel, type AiPanelContext, type AiSeed } from './views/AiPanel';
import { chatContextScope, TODO_AI_WORKBENCH_NAME, type AiScope } from '../shared/ai-scope';
import { SettingsView } from './views/SettingsView';
import { BaziView } from '../modules/bazi/ui/BaziView';
import { TaskEditor, type TaskEditorApi, type TodoState } from '../modules/todo/ui/TaskEditor';
import { MediaBrowserView, type MediaBrowserMode } from './views/MediaBrowserView';
import { CopyView } from '../modules/copywriting/ui/CopyView';
import { PublishView } from '../modules/copywriting/ui/PublishView';
import {
  IconCalendar, IconCheckSquare, IconChevronDown,
  IconGamepad, IconHome, IconMoon, IconVideo, IconWeb, LogoMark,
} from './icons';

const topbarTaskEditorApi: TaskEditorApi = {
  create: (input) => window.workbench.todo.create(input) as Promise<TodoState>,
  update: (id, patch, revision) => window.workbench.todo.update(id, patch, revision) as Promise<TodoState>,
  remove: (id, revision) => window.workbench.todo.remove(id, revision) as Promise<TodoState>,
  createCategory: (input) => window.workbench.todo.createCategory(input) as Promise<TodoState>,
};

// 设置工作台图标:用户已定 Phosphor GearSix(自绘齿轮「太像太阳」被否),WB_ICONS 渲染无 props,包一层固定尺寸
const GearRail = () => <GearSix size={20} />;

const WB_ICONS = {
  home: IconHome,
  media: IconVideo,
  game: IconGamepad,
  web: IconWeb,
  life: IconMoon,
  settings: GearRail,
} as const;


export function App() {
  const [curWb, setCurWb] = useState<WorkbenchId>('home');
  const [selectionTop, setSelectionTop] = useState(0);
  const [selectionReady, setSelectionReady] = useState(false);
  const railRef = useRef<HTMLElement>(null);
  const [curView, setCurView] = useState<ViewId>('home');
  const [mediaBrowserMode, setMediaBrowserMode] = useState<MediaBrowserMode>('creator');
  const [maximized, setMaximized] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const todo = useTodoData();
  const topbarRef = useRef<HTMLElement>(null);
  const [homeEditor, setHomeEditor] = useState<Task | 'new' | null>(null);
  const [topbarEditorKind, setTopbarEditorKind] = useState<TaskInput['kind'] | null>(null);
  const [islandPop, setIslandPop] = useState<null | 'sched' | 'todo'>(null);
  const [floatVisible, setFloatVisible] = useState(false);
  const snavTimer = useRef<number | undefined>(undefined);
  const [snavPhase, setSnavPhase] = useState<'open' | 'closing' | 'closed'>('closed');
  const [snavWorkbench, setSnavWorkbench] = useState<WorkbenchId>('home');
  const [snavView, setSnavView] = useState<ViewId>('home');
  const [snavSwapPhase, setSnavSwapPhase] = useState<'idle' | 'exit' | 'enter'>('idle');
  const [treeSelectionTop, setTreeSelectionTop] = useState(0);
  const [treeSelectionHeight, setTreeSelectionHeight] = useState(0);
  const [treeSelectionVisible, setTreeSelectionVisible] = useState(false);
  const treeRef = useRef<HTMLElement>(null);
  const snavSwapTimer = useRef<number | undefined>(undefined);
  // 界面主题(mist 默认,cool / warm 可选),写入 <html data-theme> 驱动 shell.css
  const [uiTheme, setUiTheme] = useState<UiTheme>('mist');
  const applyUiTheme = (theme: UiTheme): void => {
    document.documentElement.dataset.theme = theme;
    setUiTheme(theme);
  };
  // 个人资料昵称(设置 → 个人资料):头像首字与首页问候共用
  const [profileName, setProfileName] = useState('Ono');
  const [profileAvatarColor, setProfileAvatarColor] = useState<AvatarColor>('blue');

  useEffect(() => {
    void window.workbench.settings.get().then(
      (s) => {
        if (s) {
          applyUiTheme(s.uiTheme);
          setProfileName(s.profile.name);
          setProfileAvatarColor(s.profile.avatarColor);
        }
      },
      () => undefined,
    );
  }, []);

  // 二级目录显示/退出动效阶段(首页时播放退出动画后卸载)
  useEffect(() => {
    if (curWb === 'home') {
      setSnavPhase((p) => {
        if (p !== 'open') return p;
        snavTimer.current = window.setTimeout(() => setSnavPhase('closed'), 190);
        return 'closing';
      });
    } else {
      window.clearTimeout(snavTimer.current);
      setSnavPhase('open');
    }
  }, [curWb]);

  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('wb.ai.open') !== '0');
  const [aiWidth, setAiWidth] = useState(() => Math.max(340, Math.min(480, Number(localStorage.getItem('wb.ai.width')) || 380)));
  const [railMenu, setRailMenu] = useState<WorkbenchId | null>(null);
  const dismissedRailMenu = useRef<WorkbenchId | null>(null);
  const [aiJob, setAiJob] = useState<{ chatId: string; scope: AiScope; title: string; status: 'running' | 'done' | 'error' } | null>(null);
  const [activeAiChatId, setActiveAiChatId] = useState<string | null>(null);
  const [requestedAiChatId, setRequestedAiChatId] = useState<string | null>(null);
  const [requestedCopyId, setRequestedCopyId] = useState<string | null>(null);
  const [requestedCopySource, setRequestedCopySource] = useState<(CopySource & { nonce: number }) | null>(null);
  const [requestedProfileId, setRequestedProfileId] = useState<string | null>(null);
  const [requestedBaziDay, setRequestedBaziDay] = useState<{ profileId: string; nonce: number } | null>(null);
  const seedNonce = useRef(0);
  const sourceNonce = useRef(0);
  // 模块「AI 解读/共创」进线:打开面板、新建会话并直接发送(避免与面板自身的 chatOpen 竞态)
  const [aiSeed, setAiSeed] = useState<AiSeed | null>(null);
  // 写作助手上下文:文案页当前草稿(id/标题),供 AI 面板绑定会话与显示
  const [copyCtx, setCopyCtx] = useState<{ id: string; title: string } | null>(null);
  const [copySaveState, setCopySaveState] = useState<{ id: string | null; status: 'saved' | 'saving' | 'error' }>({ id: null, status: 'saved' });
  const [baziCtx, setBaziCtx] = useState<{ id: string; name: string; system: 'bazi' | 'ziwei' | 'astro' } | null>(null);

  const aiContext: AiPanelContext = curView === 'home'
    ? { scope: { module: 'todo' }, label: '待办与日程', object: TODO_AI_WORKBENCH_NAME }
    : curView === 'copy' && copyCtx
      ? { scope: { module: 'copy', draftId: copyCtx.id }, label: '博客编辑', object: copyCtx.title || '未命名博客' }
      : curView === 'bazi' && baziCtx
        ? { scope: { module: 'bazi', profileId: baziCtx.id }, label: '命理解读', object: baziCtx.name, baziSystem: baziCtx.system }
        : { scope: { module: 'workbench', viewId: curView }, label: '工作台助手', object: curView === 'copy' ? '尚未选择博客' : curView === 'bazi' ? '尚未选择命例' : curView === 'copy-publish' ? '图文发布' : curView === 'media-browser' ? '素材浏览器' : curView.startsWith('settings') ? '设置' : '当前页面' };

  useEffect(() => { localStorage.setItem('wb.ai.open', aiOpen ? '1' : '0'); }, [aiOpen]);
  useEffect(() => { localStorage.setItem('wb.ai.width', String(aiWidth)); }, [aiWidth]);
  useEffect(() => { if (copyCtx?.id === requestedCopyId) setRequestedCopyId(null); }, [copyCtx?.id, requestedCopyId]);
  useEffect(() => { if (baziCtx?.id === requestedProfileId) setRequestedProfileId(null); }, [baziCtx?.id, requestedProfileId]);
  useEffect(() => window.workbench.ai.onChat(raw => {
    const chat = raw as ChatSession;
    const scope = chatContextScope(chat);
    const running = chat.entries.some(entry => entry.streaming);
    const failed = chat.entries.at(-1)?.error;
    setAiJob(previous => running
      ? { chatId: chat.id, scope, title: chat.title, status: 'running' }
      : previous && previous.chatId === chat.id && previous.status === 'running'
        ? { chatId: chat.id, scope, title: chat.title, status: failed ? 'error' : 'done' }
        : previous);
  }), []);
  useEffect(() => {
    if (aiOpen && aiJob?.status !== 'running' && aiJob?.chatId === activeAiChatId) setAiJob(null);
  }, [aiJob, activeAiChatId, aiOpen]);

  const askAI = (prompt: string, scope: AiScope = aiContext.scope, baziSystem = aiContext.baziSystem, copySource?: CopySource): void => {
    const requestScope = scope;
    const requestSystem = requestScope.module === 'bazi' ? baziSystem : undefined;
    const requestSource = copySource;
    void window.workbench.ai.config().then((raw) => {
      const cfg = raw as { aiEnabled?: boolean };
      if (!cfg.aiEnabled) {
        showToast('请先在 AI 设置中配置并启用 AI');
        return;
      }
      setAiOpen(true);
      setAiSeed({ text: prompt, nonce: ++seedNonce.current, scope: requestScope, baziSystem: requestSystem, copySource: requestSource });
    }, () => showToast('AI 状态读取失败,请重试'));
  };

  useEffect(() => window.workbench.onMaximized(setMaximized), []);
  useEffect(() => window.workbench.float.onVisibilityChanged(setFloatVisible), []);

  const showToast = (msg: string): void => {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(''), 1800);
  };

  const toggleIslandPop = (which: 'sched' | 'todo'): void => {
    setIslandPop((p) => (p === which ? null : which));
  };
  const openTopbarTaskCreator = (kind: TaskInput['kind']): void => {
    setIslandPop(null);
    setTopbarEditorKind(kind);
  };
  const openTaskEditor = (t: Task): void => {
    setHomeEditor(t);
    switchView('home');
    setIslandPop(null);
  };
  // 弹出面板:点击外部 / Esc 关闭
  useEffect(() => {
    if (!islandPop) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (topbarRef.current?.contains(e.target as Node)) return;
      setIslandPop(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setIslandPop(null);
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [islandPop]);

  const changeWorkbench = (id: WorkbenchId, nextView = defaultViewOfWorkbench(id)): void => {
    if (id === curWb) return;
    window.clearTimeout(snavSwapTimer.current);
    const hasVisibleMenu = !aiOpen && curWb !== 'home' && snavPhase === 'open';
    const canSwapContents = hasVisibleMenu && id !== 'home';
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (canSwapContents && reduceMotion) {
      setSnavWorkbench(id);
      setSnavView(nextView);
      setSnavSwapPhase('idle');
    } else if (canSwapContents) {
      setSnavSwapPhase('exit');
      snavSwapTimer.current = window.setTimeout(() => {
        setSnavWorkbench(id);
        setSnavView(nextView);
        setSnavSwapPhase('enter');
        snavSwapTimer.current = window.setTimeout(() => setSnavSwapPhase('idle'), 240);
      }, 160);
    } else if (hasVisibleMenu && id === 'home') {
      setSnavSwapPhase('idle');
      snavSwapTimer.current = window.setTimeout(() => {
        setSnavWorkbench(id);
        setSnavView(nextView);
      }, 200);
    } else {
      setSnavWorkbench(id);
      setSnavView(nextView);
      setSnavSwapPhase('idle');
    }
    setCurWb(id);
  };

  useEffect(() => () => window.clearTimeout(snavSwapTimer.current), []);

  const activate = (id: WorkbenchId): void => {
    setRailMenu(null);
    if (id !== curWb) {
      // 内容区渲染跟随 curView:切工作台必须同步落位,否则停留在上一个工作台的页面
      setCurView(defaultViewOfWorkbench(id));
    }
    changeWorkbench(id, defaultViewOfWorkbench(id));
  };

  const switchView = (view: ViewId): void => {
    setRailMenu(null);
    setCurView(view);
    const owner = ownerOfWorkbench(view);
    if (owner === curWb) setSnavView(view);
    else if (owner) changeWorkbench(owner, view);
  };

  const returnToAiJob = (): void => {
    if (!aiJob) return;
    setRequestedAiChatId(aiJob.chatId);
    setAiOpen(true);
    if (aiJob.status !== 'running') setAiJob(null);
  };

  const activeWorkbench = workbenchById(curWb);
  const ActiveWorkbenchIcon = WB_ICONS[curWb];
  const isPlanningWorkbench = activeWorkbench.pending === true || (
    activeWorkbench.subs.length > 0 && activeWorkbench.subs.every((sub) => sub.pending === true)
  );
  const wb = workbenchById(snavWorkbench);
  const backgroundAiRunning = aiJob?.status === 'running' && (!aiOpen || aiJob.chatId !== activeAiChatId);
  const aiToggleLabel = `${aiOpen ? '收起' : '展开'} AI 助手${backgroundAiRunning ? '，有对话正在后台生成' : ''}`;

  useEffect(() => {
    if (!aiOpen) setRailMenu(null);
  }, [aiOpen]);

  const renderRailWorkbench = (workbench: WorkbenchDef) => {
    const Icon = WB_ICONS[workbench.id];
    const menuOpen = aiOpen && railMenu === workbench.id;
    return (
      <div
        key={workbench.id}
        className="rail-entry"
        onMouseEnter={() => { dismissedRailMenu.current = null; if (aiOpen) setRailMenu(workbench.id); }}
        onMouseLeave={(event) => { if (!event.currentTarget.contains(document.activeElement)) setRailMenu(null); }}
        onFocusCapture={() => { if (aiOpen && dismissedRailMenu.current !== workbench.id) setRailMenu(workbench.id); }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            dismissedRailMenu.current = null;
            setRailMenu(null);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && menuOpen) {
            event.preventDefault();
            event.stopPropagation();
            dismissedRailMenu.current = workbench.id;
            setRailMenu(null);
            event.currentTarget.querySelector<HTMLButtonElement>('[data-workbench]')?.focus();
          }
        }}
      >
        <button
          type="button"
          data-workbench={workbench.id}
          className={curWb === workbench.id ? 'ritem on' : workbench.pending ? 'ritem dim' : 'ritem'}
          title={workbench.pending ? `${workbench.title}(即将上线)` : workbench.title}
          aria-label={workbench.title}
          aria-expanded={aiOpen ? menuOpen : undefined}
          aria-controls={menuOpen ? `rail-menu-${workbench.id}` : undefined}
          onClick={() => workbench.id === 'settings' ? switchView('settings-general') : activate(workbench.id)}
        >
          <Icon />
        </button>
        {menuOpen && (
          <nav id={`rail-menu-${workbench.id}`} className="rail-flyout" aria-label={`${workbench.title}二级目录`}>
            <div className="rail-flyout-card">
              <div className="rail-flyout-title">{workbench.title}</div>
              <div className="rail-flyout-list">
                {workbench.subs.map((sub) => (
                  <button
                    type="button"
                    key={sub.label}
                    className={sub.view === curView ? 'nsub on' : 'nsub'}
                    aria-current={sub.view === curView ? 'page' : undefined}
                    onClick={() => {
                      setRailMenu(null);
                      if (sub.view) switchView(sub.view);
                      else showToast(`「${sub.label}」规划中,敬请期待`);
                    }}
                  >
                    <span className="ndot" />
                    {sub.label}
                    {sub.pending && <span className="ntag">规划中</span>}
                  </button>
                ))}
              </div>
            </div>
          </nav>
        )}
      </div>
    );
  };

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const active = rail.querySelector<HTMLButtonElement>(`[data-workbench="${curWb}"]`);
    if (!active) return;
    const updatePosition = (): void => {
      setSelectionTop(active.getBoundingClientRect().top - rail.getBoundingClientRect().top);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(rail);
    const middle = rail.querySelector('.rmid');
    if (middle) observer.observe(middle);
    if (!selectionReady) requestAnimationFrame(() => setSelectionReady(true));
    return () => observer.disconnect();
  }, [curWb, selectionReady]);

  useLayoutEffect(() => {
    const tree = treeRef.current;
    if (!tree) return;
    const active = tree.querySelector<HTMLButtonElement>('[aria-current="page"]');
    setTreeSelectionVisible(Boolean(active));
    if (!active) return;
    const updatePosition = (): void => {
      const treeRect = tree.getBoundingClientRect();
      setTreeSelectionTop(active.getBoundingClientRect().top - treeRect.top + tree.scrollTop);
      setTreeSelectionHeight(active.getBoundingClientRect().height);
    };
    updatePosition();
    const observer = new ResizeObserver(updatePosition);
    observer.observe(tree);
    observer.observe(active);
    tree.addEventListener('scroll', updatePosition);
    return () => {
      observer.disconnect();
      tree.removeEventListener('scroll', updatePosition);
    };
  }, [snavWorkbench, snavView, snavPhase, snavSwapPhase, aiOpen]);

  // 顶栏胶囊:今日待办统计与今日日程(真数据,与 To-Do-List 同库)
  const today = localDay(todo.clock);
  const todayMeetings = (todo.data?.tasks ?? [])
    .filter((t) => !t.deletedAt && t.kind === 'meeting' && t.status !== 'done' && t.plannedDate <= today)
    .sort((a, b) => taskTime(a) - taskTime(b))
    .slice(0, 4);
  const openCount = todo.data ? openToday(todo.data.tasks, today).length : 0;
  const doneCount = todo.data
    ? todo.data.tasks.filter((t) => !t.deletedAt && t.status === 'done' && t.completedAt && localDay(new Date(t.completedAt)) === today).length
    : 0;
  const totalCount = openCount + doneCount;
  const todaySchedule = (todo.data?.tasks ?? [])
    .filter((t) => !t.deletedAt && t.kind === 'meeting' && t.plannedDate <= today)
    .sort((a, b) => taskTime(a) - taskTime(b));
  const openTodos = todo.data ? openToday(todo.data.tasks, today) : [];
  const overdueCount = todo.data
    ? openToday(todo.data.tasks, today).filter((t) => isOverdue(t, todo.clock.getTime())).length
    : 0;

  return (
    <div className={'win' + (aiOpen ? ' ai-dock' : '')} style={{ '--ai-width': aiWidth + 'px' } as CSSProperties}>
      {/* 图标栏 = 一级:大工作台切换 */}
      <aside className="rail" ref={railRef} data-selection-ready={selectionReady}>
        <div className="logo" title="个人工作台">
          <LogoMark />
        </div>
        <span className="rail-selection" style={{ transform: `translateY(${selectionTop}px)` }} aria-hidden="true" />
        <nav className="rnav">
          {NAV.filter((w) => w.id === 'home').map((w) => {
            const Icon = WB_ICONS[w.id];
            return (
              <span key={w.id} className="rnav-item">
                <button
                  data-workbench={w.id}
                  className={curWb === w.id ? 'ritem on' : w.pending ? 'ritem dim' : 'ritem'}
                  title={w.pending ? `${w.title}(即将上线)` : w.title}
                  onClick={() => activate(w.id)}
                >
                  <Icon />
                </button>
              </span>
            );
          })}
        </nav>
        {/* 工作台图标:在剩余空间垂直居中(设置不在此渲染,唯一入口在底部) */}
        <div className="rmid">
          {NAV.filter((w) => w.id !== 'home' && w.id !== 'settings').map(renderRailWorkbench)}
        </div>
        <div className="rbot">
          {/* 设置唯一入口:当前在设置页时点亮 */}
          {renderRailWorkbench(workbenchById('settings'))}
        </div>
      </aside>
      <div className="main">
      <header className="topbar" ref={topbarRef}>
        <div className="tb-middle">
        <div className="tb-left">
        <div className="sched" onClick={() => toggleIslandPop('sched')}>
          <span className="sched-label">
            <IconCalendar />
            <span className="lbl">日程</span>
          </span>
          <span className="sdiv" />
          <div className="sched-track">
            <span className="date">{todo.clock.getMonth() + 1}月{todo.clock.getDate()}日 {['周日', '周一', '周二', '周三', '周四', '周五', '周六'][todo.clock.getDay()]}</span>
            <span className="sdiv" />
            {todayMeetings.length === 0 && (
              <span className="sched-none">无日程</span>
            )}
            {todayMeetings.map((t) => {
              const start = t.dueAt ? Date.parse(t.dueAt) : null;
              const end = meetingEndAt(t);
              const live = start !== null && end ? start <= todo.clock.getTime() && Date.parse(end) > todo.clock.getTime() : false;
              return (
                <button key={t.id} className={live ? 'schip now' : 'schip'} title={t.title} onClick={(e) => { e.stopPropagation(); openTaskEditor(t); }}>
                  {live && <span className="live" />}
                  <span className="t">{scheduleTimeRange(t)}</span>
                  <span className="n">{t.title}</span>
                </button>
              );
            })}
          </div>
          <button className="smore" title="今日日程面板" onClick={(e) => { e.stopPropagation(); toggleIslandPop('sched'); }}>
            <IconChevronDown />
          </button>
          {islandPop === 'sched' && (
          <div className="ipop ipop-sched" role="menu" aria-label="今日日程">
            <div className="ipop-head">今日日程</div>
            {todaySchedule.length === 0 && <div className="ipop-empty">今天没有日程。</div>}
            {todaySchedule.map((t) => {
              return (
                <div key={t.id} className={t.status === 'done' ? 'ipop-row done' : 'ipop-row'}>
                  <span className="ipop-time">{scheduleTimeRange(t)}</span>
                  <button className="ipop-title" onClick={() => openTaskEditor(t)}>{t.title}</button>
                </div>
              );
            })}
            <div className="ipop-foot">
              <button className="ipop-link" onClick={() => openTopbarTaskCreator('meeting')}>+ 新增日程</button>
            </div>
          </div>
          )}
        </div>
      </div>

      <div className="tb-center">
        <button className="todopill glass" title="今日待办" aria-expanded={islandPop === 'todo'} onClick={() => toggleIslandPop('todo')}>
          <IconCheckSquare />
          <span className="lbl">待办</span>
          <span className="sdiv" />
          <span className="num">{doneCount}/{totalCount}</span>
          {overdueCount > 0 && <span className="pill-badge">逾期 {overdueCount}</span>}
          <IconChevronDown size={12} className="pill-caret" />
        </button>
        {islandPop === 'todo' && (
        <div className="ipop ipop-todo" role="menu" aria-label="今日待办">
          <div className="ipop-head">今日待办 · {openTodos.length} 项</div>
          {openTodos.length === 0 && <div className="ipop-empty">今天没有待办,点下方新增。</div>}
          {openTodos.map((t) => (
            <div key={t.id} className="ipop-row">
              <button
                className={t.status === 'done' ? 'ipop-check done' : 'ipop-check'}
                title={t.status === 'done' ? '恢复待办' : '完成'}
                onClick={() => todo.mutate(() => window.workbench.todo.update(t.id, { status: t.status === 'done' ? 'todo' : 'done' }, t.updatedAt) as Promise<never>)}
              >
                {t.status === 'done' ? '✓' : ''}
              </button>
              <button className="ipop-title" title={t.title} onClick={() => openTaskEditor(t)}>{t.title}</button>
              <span className="ipop-time">{t.dueAt ? new Date(t.dueAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) : '不限时'}</span>
            </div>
          ))}
          <div className="ipop-foot">
            <button className="ipop-link" onClick={() => openTopbarTaskCreator('task')}>+ 新增待办</button>
          </div>
        </div>
        )}
      </div>
        </div>

      <div className="tb-right">
        {aiJob && (!aiOpen || aiJob.chatId !== activeAiChatId) && <button className="ai-job-btn" title="返回生成的对话" onClick={returnToAiJob}>{aiJob.scope.module === 'copy' ? '博客' : aiJob.scope.module === 'bazi' ? '命理' : '助手'}{aiJob.status === 'running' ? '生成中' : aiJob.status === 'error' ? '请求失败' : '已完成'}</button>}
        <button className="ibtn float-topbar-btn" title={floatVisible ? '隐藏悬浮待办窗' : '打开悬浮待办窗'} aria-label={floatVisible ? '隐藏悬浮待办窗' : '打开悬浮待办窗'} aria-pressed={floatVisible} onClick={() => { setIslandPop(null); void window.workbench.float.toggle(); }}><CheckSquareOffset size={18} weight={floatVisible ? 'fill' : 'regular'} /></button>
        <button className="ibtn ai-topbar-btn" title={aiToggleLabel} aria-label={aiToggleLabel} aria-expanded={aiOpen} aria-controls="workbench-ai-panel" data-background-running={backgroundAiRunning || undefined} onClick={() => setAiOpen(v => !v)}><Sparkle size={18} weight={aiOpen || backgroundAiRunning ? 'fill' : 'regular'} /></button>
        <span className="vdiv" />
        <button type="button" className="avatar" data-avatar-color={profileAvatarColor} title={profileName} aria-label={`打开个人资料：${profileName}`} onClick={() => switchView('settings-profile')}>
          {profileName.trim().charAt(0).toUpperCase() || 'O'}
        </button>

        <span className="vdiv" />
        <div className="wbtns">
          <button className="wbtn" title="最小化" onClick={() => window.workbench.minimize()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14" /></svg>
          </button>
          <button className="wbtn" title={maximized ? '还原' : '最大化'} onClick={() => window.workbench.maximizeToggle()}>
            {maximized ? (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M5 16V6a1 1 0 0 1 1-1h10" /></svg>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><rect x="5" y="5" width="14" height="14" rx="2" /></svg>
            )}
          </button>
          <button className="wbtn close" title="关闭" onClick={() => window.workbench.close()}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
      </div>
      </header>

      <div className="body">


      <div className="body">


      {/* 二级导航 = 当前工作台的二级目录(首页内容自明,不显示二级目录) */}
      {snavPhase !== 'closed' && (
      <aside className={snavPhase === 'closing' ? 'snav closing' : 'snav'}>
      <div className="snav-content" data-swap={snavSwapPhase}>
        <div className="shead">
          <span className="stitle">{wb.title}</span>
        </div>
        <nav className="tree" ref={treeRef} data-switching={snavSwapPhase !== 'idle'}>
          <span
            className="tree-selection"
            aria-hidden="true"
            hidden={!treeSelectionVisible}
            style={{ height: `${treeSelectionHeight}px`, transform: `translateY(${treeSelectionTop}px)` }}
          />
          {wb.subs.map((sub) => (
            <button
              type="button"
              key={sub.label}
              className={sub.view && sub.view === snavView ? 'nsub on' : 'nsub'}
              aria-current={sub.view === snavView ? 'page' : undefined}
              onClick={() => {
                if (sub.view) switchView(sub.view);
                else showToast(`「${sub.label}」规划中,敬请期待`);
              }}
            >
              <span className="ndot" />
              {sub.label}
              {sub.pending && <span className="ntag">规划中</span>}
            </button>
          ))}
        </nav>
      </div>
      </aside>
      )}

      {/* 主区 */}
      <main className="content">
          {todo.error && <div className="todo-load-error" role="alert">{todo.error}</div>}
          {/* 视图切换动效:按 curView 换 key 重挂载,统一淡入上移(见 shell.css .view-fade) */}
          <div className="view-fade" key={curView}>
          {isPlanningWorkbench ? (
            <section className="pending-workbench" role="status">
              <span className="pending-workbench-icon" aria-hidden="true"><ActiveWorkbenchIcon /></span>
              <h1>{activeWorkbench.title}</h1>
              <p>规划中 · 敬请期待</p>
            </section>
          ) : curView === 'bazi' ? (
            <BaziView onPending={showToast} onAskAI={(prompt, profileId, system) => askAI(prompt, { module: 'bazi', profileId }, system)} onCurrentProfile={setBaziCtx} requestedProfileId={requestedProfileId} requestedDayLocate={requestedBaziDay} onDayLocated={() => setRequestedBaziDay(null)} />
          ) : curView === 'copy' ? (
            <CopyView onPending={showToast} onCurrentDraft={setCopyCtx} onSaveState={setCopySaveState} requestedDraftId={requestedCopyId} requestedSource={requestedCopySource} onSourceLocated={() => setRequestedCopySource(null)} onGoPublish={() => switchView('copy-publish')} />
          ) : curView === 'copy-publish' ? (
            <PublishView onPending={showToast} onGoEdit={() => switchView('copy')} onOpenCreator={() => { setMediaBrowserMode('creator'); switchView('media-browser'); }} />
          ) : curView === 'media-browser' ? (
            <MediaBrowserView mode={mediaBrowserMode} onModeChange={setMediaBrowserMode} onPending={showToast} onAskAI={askAI} />
          ) : curView.startsWith('settings') ? (
            <SettingsView view={curView} uiTheme={uiTheme} onUiThemeChange={applyUiTheme} onAvatarColorChange={setProfileAvatarColor} />
          ) : todo.data ? (
            <HomeView data={todo.data} clock={todo.clock} mutate={todo.mutate} userName={profileName} onPending={showToast} onOpenMedia={() => switchView('copy')} onOpenBazi={() => switchView('bazi')} editor={homeEditor} setEditor={setHomeEditor} onAskAi={askAI} />
          ) : (
            <div className="todo-loading" role="status">正在读取本地待办…</div>
          )}
          </div>
        </main>

      </div>
      </div>
      </div>
      {topbarEditorKind ? <TaskEditor key={topbarEditorKind} initialKind={topbarEditorKind} categories={todo.data?.categories ?? []} api={topbarTaskEditorApi}
        changed={(state) => todo.mutate(async () => state)} saved={(state) => todo.mutate(async () => state)} close={() => setTopbarEditorKind(null)} /> : null}
      <AiPanel open={aiOpen} onClose={() => setAiOpen(false)} seed={aiSeed} requestedChatId={requestedAiChatId} onChatLocated={() => setRequestedAiChatId(null)} onActiveChatChange={setActiveAiChatId} onOpenSettings={() => { setAiOpen(false); switchView('settings-ai'); }} onLocateCopySource={source => { setRequestedCopySource({ ...source, nonce: ++sourceNonce.current }); setRequestedCopyId(source.draftId); switchView('copy'); if (window.innerWidth < 1160) setAiOpen(false); }} onLocateBaziDay={profileId => { setRequestedBaziDay({ profileId, nonce: ++sourceNonce.current }); setRequestedProfileId(profileId); switchView('bazi'); if (window.innerWidth < 1160) setAiOpen(false); }} onQuickAsk={(prompt, scope) => askAI(prompt, scope)} context={aiContext} width={aiWidth} onWidthChange={setAiWidth} copySaveState={copySaveState} />
      <div className="toast glass" data-show={toast ? '1' : '0'}>{toast}</div>
    </div>
  );
}
