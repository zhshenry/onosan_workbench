import { taskDay } from '../shared/todo-date';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { BookOpen, Flask, GearSix, SidebarSimple, Sparkle, WarningCircle, X, Browser, ClockCounterClockwise, GlobeSimple, Images, ListChecks, MoonStars, PaperPlaneTilt, PencilSimpleLine } from '@phosphor-icons/react';
import { NAV, defaultViewOfWorkbench, ownerOfWorkbench, resolveView, workbenchById, type WorkbenchDef, type WorkbenchId } from './nav';
import type { AvatarColor, ViewId } from '../shared/contracts';
import type { CheckinProvider } from '../shared/checkin-contracts';
import { useAppearanceSettings } from './appearance';
import { localDay, openToday, taskTime, type CopySource, type Task, type TaskInput } from '../shared/todo-contracts';
import { isOverdue, meetingEndAt } from '../shared/todo-format';
import { topbarScheduleDate, topbarTodoDate } from './topbar-dates';
import { applyTopbarCapsulePlacement } from './topbar-layout';
import { HomeView } from './views/HomeView';
import { TodoView, useTodoData } from './views/TodoView';
import type { AiPanelContext, AiSeed } from './views/AiPanel';
import { BotPanel, type BotAssistantMode, type BotPanelHandle, type BotPanelPage } from './views/BotPanel';
import { BotAvatar } from './views/BotAvatar';
import { botActivityLabels } from '../shared/bot-activity';
import { BotContactMenu } from './views/BotContactMenu';
import { AiResponse } from './views/AiResponse';
import type { BotArtifact, BotCard, BotResourceRef } from '../shared/bot-contracts';
import { chatContextScope, type AiScope } from '../shared/ai-scope';
import { pageAiContext } from './ai-page-context';
import { SettingsDialog } from './views/SettingsDialog';
import { BotManagement } from './views/BotManagement';
import { errorText, IconButton, Select } from './ui/controls';
import { IslandMascot } from './ui/IslandMascot';
import { TopbarUpdate } from './views/TopbarUpdate';
import { AiSetupHint } from './views/AiSetupHint';
import { AiTopbarHint } from './ui/AiTopbarHint';
import { BaziView } from '../modules/bazi/ui/BaziView';
import { TaskEditor, type TaskEditHandle, type TaskEditorApi } from '../modules/todo/ui/TaskEditor';
import { MediaBrowserHost } from './views/MediaBrowserHost';
import { BrowserHost } from './views/BrowserView';
import { BrowserTabTargetContext, type BrowserTabTarget } from '../modules/browser/ui/pane';
import { HushHourView } from './views/HushHourView';
import { PersonalWebsiteView } from './views/PersonalWebsiteView';
import { GameHost } from './views/GameView';
import { AiTestHost } from './views/AiTestView';
import type { BrowserTask } from '../shared/browser-automation-contracts';
import type { AstroReadingTopic } from '../shared/astro-reading';
import { CopyView } from '../modules/copywriting/ui/CopyView';
import { PublishView } from '../modules/copywriting/ui/PublishView';
import { ReadingView } from './views/ReadingView';
import { CheckinView } from './views/CheckinView';
import {
  IconCalendar, IconCheckSquare, IconChevronDown,
  IconGamepad, IconHome, IconMoon, IconVideo, IconWeb, LogoMark,
} from './icons';

const topbarTaskEditorApi: TaskEditorApi = {
  create: (input) => window.workbench.todo.create(input),
  update: (id, patch, revision) => window.workbench.todo.update(id, patch, revision),
  remove: (id, revision) => window.workbench.todo.remove(id, revision),
  createCategory: (input) => window.workbench.todo.createCategory(input),
};

// 设置工作台图标:用户已定 Phosphor GearSix(自绘齿轮「太像太阳」被否),WB_ICONS 渲染无 props,包一层固定尺寸
const GearRail = () => <GearSix size={20} />;
const TestRail = () => <Flask size={20} />;
const ReadingRail = () => <BookOpen size={20} />;

const WB_ICONS = {
  home: IconHome,
  todo: IconCalendar,
  media: IconVideo,
  game: IconGamepad,
  web: IconWeb,
  life: IconMoon,
  bazi: IconMoon,
  reading: ReadingRail,
  'ai-test': TestRail,
  settings: GearRail,
} as const;


const WORKBENCH_PAGE_ICONS: Partial<Record<ViewId, typeof BookOpen>> = {
  copy: PencilSimpleLine,
  'copy-publish': PaperPlaneTilt,
  'media-browser': Images,
  browser: GlobeSimple,
  'hush-hour': MoonStars,
  'personal-website': Browser,
  'ai-test': Flask,
  'ai-test-tasks': ListChecks,
  'ai-test-history': ClockCounterClockwise,
};

const initialWorkbench = (): WorkbenchId => { const saved = localStorage.getItem('wb.bot.active'); if (saved === 'life') { const route = localStorage.getItem('wb.bot.route.life'); return route === 'reading' ? 'reading' : route === 'checkin' ? 'home' : 'bazi'; } return NAV.find(item => item.id === saved && item.id !== 'settings')?.id ?? 'home'; };
const initialView = (): ViewId => { const id = initialWorkbench(), remembered = localStorage.getItem(localStorage.getItem('wb.bot.active') === 'life' ? 'wb.bot.route.life' : `wb.bot.route.${id}`); return workbenchById(id).subs.find(sub => sub.view === remembered)?.view ?? defaultViewOfWorkbench(id); };

const SETTINGS_ROUTE_KEY = 'wb.bot.route.settings';
const rememberedSettingsView = (): ViewId => {
  const saved = localStorage.getItem(SETTINGS_ROUTE_KEY) as ViewId | null;
  return saved && ownerOfWorkbench(saved) === 'settings' ? resolveView(saved) : 'settings-general';
};

const BOT_MODE_LABELS: Record<BotAssistantMode, string> = { parallel: '固定', floating: '悬浮' };

export function App() {
  const [curWb, setCurWb] = useState<WorkbenchId>(initialWorkbench);
  const [railBranch, setRailBranch] = useState<WorkbenchId>('home');
  const [navExpanded, setNavExpanded] = useState(() => localStorage.getItem('wb.bot.nav.expanded') !== '0');
  const railRef = useRef<HTMLElement>(null);
  const railSelectionRef = useRef<HTMLSpanElement>(null);
  const railSelectionGlow = useRef<Animation | null>(null);
  const lastRailWorkbench = useRef<WorkbenchId | null>(null);
  const railMenuRef = useRef<HTMLElement>(null);
  const railMenuCloseTimer = useRef<number | undefined>(undefined);
  const contentRef = useRef<HTMLElement>(null);
  const [curView, setCurView] = useState<ViewId>(initialView);
  const [settingsView, setSettingsView] = useState<ViewId | null>(null);
  const [checkinSettingsEntry, setCheckinSettingsEntry] = useState<{ provider?: CheckinProvider }>();
  const [maximized, setMaximized] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef<number | undefined>(undefined);
  const todo = useTodoData();
  const topbarRef = useRef<HTMLElement>(null);
  const aiTrigger = useRef<HTMLButtonElement>(null);
  const [homeEditor, setHomeEditor] = useState<Task | 'new' | null>(null);
  const todoEditHandle = useRef<TaskEditHandle>(null);
  const [topbarEditorKind, setTopbarEditorKind] = useState<TaskInput['kind'] | null>(null);
  const [islandPop, setIslandPop] = useState<null | 'sched' | 'todo'>(null);
  const [floatVisible, setFloatVisible] = useState(false);
  const appearance = useAppearanceSettings();
  useEffect(() => () => window.clearTimeout(railMenuCloseTimer.current), []);
  // 个人资料昵称(设置 → 个人资料):头像首字与首页问候共用
  const [profileName, setProfileName] = useState('Ono');
  const [profileAvatarColor, setProfileAvatarColor] = useState<AvatarColor>('blue');

  useEffect(() => {
    void window.workbench.settings.get().then(
      (s) => {
        if (s) {
          setProfileName(s.profile.name);
          setProfileAvatarColor(s.profile.avatarColor);
        }
      },
      () => undefined,
    );
  }, []);

  const [aiOpen, setAiOpen] = useState(() => localStorage.getItem('wb.ai.open') !== '0');
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [bots, setBots] = useState<BotCard[]>([]), [botError, setBotError] = useState('');
  const [assistantMode, setAssistantMode] = useState<BotAssistantMode>(() => localStorage.getItem('wb.bot.mode') === 'floating' ? 'floating' : 'parallel');
  const [botMenu, setBotMenu] = useState<{ card: BotCard; anchor: HTMLButtonElement; x: number; y: number }>();
  const [botPage, setBotPage] = useState<{ value: BotPanelPage; nonce: number; taskId?: string }>();
  const botPanel = useRef<BotPanelHandle>(null);
  const [initialProfileTab, setInitialProfileTab] = useState<BotPanelHandle['openProfileTab']>();
  const [workspaceCollapsed, setWorkspaceCollapsed] = useState(true);
  const [workspaceHeader, setWorkspaceHeader] = useState<HTMLDivElement | null>(null);
  useEffect(() => { localStorage.setItem('wb.bot.active', curWb); }, [curWb]);
  useEffect(() => {
    if (settingsView) localStorage.setItem(SETTINGS_ROUTE_KEY, settingsView);
  }, [settingsView]);
  const [artifactPreview, setArtifactPreview] = useState<BotArtifact | null>(null);
  const [requestedArtifactId, setRequestedArtifactId] = useState<string>();
  const [artifactError, setArtifactError] = useState('');
  const activeBot = bots.find(bot => bot.workspaceId === curWb);
  const workspaceHidden = !!activeBot && workspaceCollapsed && aiOpen && assistantMode === 'parallel';
  const botReadVersion = useRef(0);
  const readBots = useCallback(() => {
    const version = ++botReadVersion.current;
    return window.workbench.bot.list().then(value => { if (version === botReadVersion.current) { setBots(value); setBotError(''); } }, cause => { if (version === botReadVersion.current) setBotError(errorText(cause)); });
  }, []);
  useEffect(() => { void readBots(); return window.workbench.bot.onChanged(event => { if (['profile', 'read', 'task', 'activity'].includes(event.kind)) void readBots(); }); }, [readBots]);
  const selectAssistantMode = (value: BotAssistantMode) => {
    if (assistantMode !== value) botPanel.current?.prepareModeSwitch(value);
    if (assistantMode === 'floating' && value === 'parallel') setWorkspaceCollapsed(false);
    setAssistantMode(value);
    localStorage.setItem('wb.bot.mode', value);
  };
  const [aiWidth, setAiWidth] = useState(() => Math.max(340, Math.min(560, Number(localStorage.getItem('wb.ai.width')) || 380)));
  const navigationStarted = useRef(false);
  useEffect(() => { if (!bots.length) return; const navigate = () => { void window.workbench.bot.getLaunchTarget().then(async target => { if (!target) return; if (target.kind === 'todo') { const state = await window.workbench.todo.state(); const item = state.tasks.find(task => task.id === target.id && !task.deletedAt); if (item) openTaskEditor(item); return; } const id = target.id; const { task } = await window.workbench.bot.getTask(id); const owner = bots.find(card => card.id === task.botId); if (owner) activate(owner.workspaceId, { after: () => { setAiOpen(true); setBotPage({ value: 'tasks', nonce: Date.now(), taskId: id }); } }); }).catch(cause => showToast(errorText(cause))); }; if (!navigationStarted.current) { navigationStarted.current = true; navigate(); } return window.workbench.bot.onChanged(event => { if (event.kind === 'navigation') navigate(); }); }, [bots]);
  const [railMenu, setRailMenu] = useState<WorkbenchId | null>(null);
  const dismissedRailMenu = useRef<WorkbenchId | null>(null);
  const [aiJobs, setAiJobs] = useState<{ chatId: string; scope: AiScope; title: string; status: 'running' | 'done' | 'error' }[]>([]);
  const [browserTasks, setBrowserTasks] = useState<BrowserTask[]>([]);
  const [browserTabTarget, setBrowserTabTarget] = useState<BrowserTabTarget>();
  const [activeAiChatId, setActiveAiChatId] = useState<string | null>(null);
  const aiJob = aiJobs.find(job => job.status === 'running' && job.chatId !== activeAiChatId) ?? aiJobs.find(job => job.status === 'running') ?? aiJobs[0] ?? null;
  const completedAiJob = aiJob?.status === 'done' && (!aiOpen || aiJob.chatId !== activeAiChatId) ? aiJob : null;
  const completedAiChatId = completedAiJob?.chatId;
  const dismissAiCompletion = useCallback(() => setAiJobs(previous => previous.filter(job => job.chatId !== completedAiChatId)), [completedAiChatId]);
  const browserTask = browserTasks.find(task => ['running', 'paused', 'site-approval'].includes(task.status)) ?? browserTasks[0] ?? null;
  const [requestedAiChatId, setRequestedAiChatId] = useState<string | null>(null);
  const [requestedCopyId, setRequestedCopyId] = useState<string | null>(null);
  const [requestedCopySource, setRequestedCopySource] = useState<(CopySource & { nonce: number }) | null>(null);
  const [requestedProfileId, setRequestedProfileId] = useState<string | null>(null);
  const [requestedBaziDay, setRequestedBaziDay] = useState<{ profileId: string; nonce: number } | null>(null);
  const seedNonce = useRef(0);
  const sourceNonce = useRef(0);
  // 模块「AI 解读/共创」进线:由面板选择会话并直接发送,完成后清除请求。
  const [aiSeed, setAiSeed] = useState<AiSeed | null>(null);
  // 写作助手上下文:文案页当前草稿(id/标题),供 AI 面板绑定会话与显示
  const [copyCtx, setCopyCtx] = useState<{ id: string; title: string } | null>(null);
  const [copySaveState, setCopySaveState] = useState<{ id: string | null; status: 'saved' | 'saving' | 'error' }>({ id: null, status: 'saved' });
  const [baziCtx, setBaziCtx] = useState<{ id: string; name: string; system: 'bazi' | 'ziwei' | 'astro' } | null>(null);
  const [readingCtx, setReadingCtx] = useState<{ id: string; title: string } | null>(null);

  const aiContext: AiPanelContext = pageAiContext(curView, { copy: copyCtx, bazi: baziCtx, reading: readingCtx });

  useEffect(() => { localStorage.setItem('wb.ai.open', aiOpen ? '1' : '0'); }, [aiOpen]);
  useEffect(() => { localStorage.setItem('wb.ai.width', String(aiWidth)); }, [aiWidth]);
  useEffect(() => { localStorage.setItem('wb.bot.nav.expanded', navExpanded ? '1' : '0'); }, [navExpanded]);
  useEffect(() => { setArtifactPreview(null); document.title = `${activeBot?.name ?? workbenchById(curWb).title} · OnO Workbench`; }, [curWb, activeBot?.name]);
  useEffect(() => {
    if (curWb !== 'home' || !requestedArtifactId) return;
    let live = true;
    void window.workbench.bot.openArtifact(requestedArtifactId).then(artifact => { if (live) { setArtifactPreview(artifact); setWorkspaceCollapsed(false); setBotPage({ value: 'artifacts', nonce: Date.now() }); setRequestedArtifactId(undefined); } }, error => { if (live) { showToast(errorText(error)); setRequestedArtifactId(undefined); } });
    return () => { live = false; };
  }, [curWb, requestedArtifactId]);
  useEffect(() => window.workbench.browserAutomation?.onTask(task => setBrowserTasks(previous => [task, ...previous.filter(item => item.id !== task.id)].slice(0, 40))), []);
  useEffect(() => { if (copyCtx?.id === requestedCopyId) setRequestedCopyId(null); }, [copyCtx?.id, requestedCopyId]);
  useEffect(() => { if (baziCtx?.id === requestedProfileId) setRequestedProfileId(null); }, [baziCtx?.id, requestedProfileId]);
  useEffect(() => window.workbench.ai.onChat(chat => {
    const scope = chatContextScope(chat);
    const running = chat.entries.some(entry => entry.streaming);
    const failed = chat.entries.at(-1)?.error;
    setAiJobs(previous => running
      ? [{ chatId: chat.id, scope, title: chat.title, status: 'running' as const }, ...previous.filter(item => item.chatId !== chat.id)].slice(0, 40)
      : previous.map(item => item.chatId === chat.id && item.status === 'running' ? { ...item, title: chat.title, status: failed ? 'error' as const : 'done' as const } : item));
  }), []);
  useEffect(() => {
    if (aiOpen && aiJob?.status !== 'running' && aiJob?.chatId === activeAiChatId) setAiJobs(previous => previous.filter(item => item.chatId !== activeAiChatId));
  }, [aiJob, activeAiChatId, aiOpen]);

  const askAI = async (prompt: string, scope: AiScope = aiContext.scope, baziSystem = aiContext.baziSystem, copySource?: CopySource, astroReadingTopic?: AstroReadingTopic): Promise<void> => {
    const requestScope = scope;
    const requestSystem = requestScope.module === 'bazi' ? baziSystem : undefined;
    const requestSource = copySource;
    await window.workbench.ai.config().then((raw) => {
      const cfg = raw as { aiEnabled?: boolean };
      if (!cfg.aiEnabled) {
        showToast('请先在模型配置中添加对话模型');
        return;
      }
      setAiOpen(true);
      setAiSeed({ text: prompt, nonce: ++seedNonce.current, scope: requestScope, baziSystem: requestSystem, copySource: requestSource, astroReadingTopic });
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
  const leaveTodoEdit = (navigate: () => void): void => {
    const editor = todoEditHandle.current;
    if (editor) editor.leave(navigate);
    else navigate();
  };
  const openTopbarTaskCreator = (kind: TaskInput['kind']): void => leaveTodoEdit(() => {
    topbarRef.current?.querySelector<HTMLButtonElement>(kind === 'meeting' ? '.smore' : '.todopill')?.focus({ preventScroll: true });
    setIslandPop(null);
    setTopbarEditorKind(kind);
  });
  const openTaskEditor = (t: Task | null): void => leaveTodoEdit(() => {
    setArtifactPreview(null);
    setHomeEditor(t);
    switchView('todo');
    setIslandPop(null);
    if (!t) requestAnimationFrame(() => document.getElementById('view-todo')?.focus({ preventScroll: true }));
  });
  const openTodoTarget = (id?: string): void => {
    if (!id) { openTaskEditor(null); return; }
    void window.workbench.todo.state().then(({ tasks }) => {
      const task = tasks.find(item => item.id === id && !item.deletedAt);
      openTaskEditor(task ?? null);
      if (!task) showToast('原事项已不在当前列表。');
    }).catch(error => showToast(errorText(error)));
  };
  // 弹出面板:点击外部 / Esc 关闭
  useEffect(() => {
    if (!islandPop) return;
    const onPointerDown = (e: PointerEvent): void => {
      if (topbarRef.current?.contains(e.target as Node)) return;
      setIslandPop(null);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setIslandPop(null);
        topbarRef.current?.querySelector<HTMLButtonElement>(islandPop === 'sched' ? '.smore' : '.todopill')?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [islandPop]);

  const activate = (id: WorkbenchId, { keepLayout = false, after }: { keepLayout?: boolean; after?: () => void } = {}): void => {
    const navigate = () => {
      const keepWorkspace = keepLayout && !!activeBot && aiOpen && assistantMode === 'parallel';
      dismissedRailMenu.current = null;
      setRailMenu(null);
      setSettingsView(null);
      setCheckinSettingsEntry(undefined);
      if (id === 'home') localStorage.setItem('wb.bot.route.home', 'home');
      if (id !== curWb) {
        if (!keepWorkspace) setWorkspaceCollapsed(true);
        setInitialProfileTab(keepLayout ? botPanel.current?.openProfileTab : undefined);
      }
      if (id !== curWb || id === 'home' && curView === 'checkin') {
        setBotPage(undefined);
        // 内容区渲染跟随 curView:切工作台必须同步落位,否则停留在上一个工作台的页面
        const remembered = id === 'home' ? 'home' : localStorage.getItem(`wb.bot.route.${id}`);
        setCurView(workbenchById(id).subs.find(sub => sub.view === remembered)?.view ?? defaultViewOfWorkbench(id));
        setCurWb(id);
      }
      after?.();
    };
    if (id === 'todo' || id === 'settings') navigate();
    else leaveTodoEdit(navigate);
  };

  const switchView = (view: ViewId, after?: () => void): void => {
    view = resolveView(view);
    setRailMenu(null);
    if (view.startsWith('settings')) {
      setIslandPop(null);
      if (view === 'settings-general') setCheckinSettingsEntry(undefined);
      setSettingsView(view);
      after?.();
      return;
    }
    const navigate = () => {
      setSettingsView(null);
      setCheckinSettingsEntry(undefined);
      setWorkspaceCollapsed(false);
      setCurView(view);
      const owner = ownerOfWorkbench(view);
      if (owner) {
        setInitialProfileTab(undefined);
        setCurWb(owner);
        localStorage.setItem(`wb.bot.route.${owner}`, view);
      }
      after?.();
    };
    if (view === 'todo') navigate();
    else leaveTodoEdit(navigate);
  };
  const closeSettings = (): void => { setSettingsView(null); setCheckinSettingsEntry(undefined); };
  const openBrowserTask = (task: BrowserTask) => {
    void window.workbench.browserAutomation.state(task.workspace).then(({ tabs, activeId }) => {
      const eligible = task.tabIds.filter(id => tabs.some(tab => tab.id === id));
      const tabId = eligible.includes(activeId) ? activeId : eligible.at(-1);
      switchView(task.workspace === 'xhs-creator' ? 'media-browser' : 'browser', () => {
        setBrowserTabTarget(tabId ? { workspace: task.workspace, tabId } : undefined);
        if (!tabId) showToast('原网页标签已关闭。');
      });
    }).catch(error => showToast(errorText(error)));
  };
  const openCheckinSettings = (view: 'settings-apps' | 'settings-checkin', provider?: CheckinProvider): void => { setIslandPop(null); setCheckinSettingsEntry({ provider }); setSettingsView(view); };
  const openBotResource = (resource: BotResourceRef): void => {
    setArtifactError('');
    void (async () => {
      if (resource.kind === 'copy') { if (!(await window.workbench.copy.list()).drafts.some(item => item.id === resource.id)) throw new Error('原稿已删除，交付记录仍保留。'); setRequestedCopyId(resource.id); switchView('copy'); }
      else if (resource.kind === 'bazi') { if (!(await window.workbench.bazi.list()).profiles.some(item => item.id === resource.id)) throw new Error('原命例不存在或不可访问。'); setRequestedProfileId(resource.id); switchView('bazi'); }
      else if (resource.kind === 'reading') { if (!(await window.workbench.reading.list()).books.some(item => item.id === resource.id)) throw new Error('原书目不存在或不可访问。'); switchView('reading'); }
      else if (resource.kind === 'todo') { const task = (await window.workbench.todo.state()).tasks.find(item => item.id === resource.id && !item.deletedAt); if (!task) throw new Error('原事项已删除，交付记录仍保留。'); openTaskEditor(task); }
      setArtifactPreview(null); setWorkspaceCollapsed(false);
    })().catch(cause => setArtifactError(errorText(cause)));
  };
  useEffect(() => {
    if (!requestedAiChatId) return;
    const owner = bots.find(bot => bot.mainChatId === requestedAiChatId);
    if (owner) { activate(owner.workspaceId, { after: () => setBotPage({ value: 'chat', nonce: Date.now() }) }); setRequestedAiChatId(null); }
  }, [requestedAiChatId, bots]);

  const returnToAiJob = (): void => {
    if (!aiJob) return;
    setRequestedAiChatId(aiJob.chatId);
    setAiOpen(true);
    if (aiJob.status !== 'running') setAiJobs(previous => previous.filter(item => item.chatId !== aiJob.chatId));
  };

  useEffect(() => window.workbench.island?.onNavigate(target => {
    const view = target.view === 'settings-island' && (target.section === 'quota' || target.section === 'agents') ? 'settings-agent-quota' : target.view;
    if (target.view === 'todo') {
      openTodoTarget(target.taskId);
      return;
    }
    switchView(view, () => {
      if (target.view === 'home') { setAiOpen(true); setBotPage({ value: 'chat', nonce: Date.now() }); }
      if (target.view === 'home' && target.artifactId) setRequestedArtifactId(target.artifactId);
      if (target.botPanel && target.view === 'home') { setAiOpen(true); selectAssistantMode('parallel'); setWorkspaceCollapsed(true); setBotPage({ value: target.botPanel === 'details' ? 'profile' : 'artifacts', nonce: Date.now() }); }
      if (target.section) {
        sessionStorage.setItem('island-settings-section', target.section);
        window.dispatchEvent(new CustomEvent('island-settings-section', { detail: target.section }));
      }
    });
  }));

  const activeWorkbench = workbenchById(curWb);
  const ActiveWorkbenchIcon = WB_ICONS[curWb];
  const isPlanningWorkbench = activeWorkbench.pending === true || (
    activeWorkbench.subs.length > 0 && activeWorkbench.subs.every((sub) => sub.pending === true)
  );
  const showDashboardHeader = curView === 'home' && !isPlanningWorkbench && !artifactPreview;
  const backgroundAiRunning = aiJob?.status === 'running' && (!aiOpen || aiJob.chatId !== activeAiChatId);
  const aiModeLabel = `AI 助手 · ${aiOpen ? BOT_MODE_LABELS[assistantMode] : '已收起'}${backgroundAiRunning ? '，有对话正在后台生成' : ''}`;

  useEffect(() => {
    setRailMenu(null);
  }, [aiOpen]);

  useLayoutEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const closing = Array.from(rail.querySelectorAll<HTMLElement>('.rail-branch')).filter(branch =>
      branch.closest('.rail-entry')?.querySelector<HTMLElement>('[data-workbench]')?.dataset.workbench !== curWb && branch.getBoundingClientRect().height > 0);
    if (!navExpanded || motion.matches || closing.length === 0) {
      setRailBranch(curWb);
      return;
    }
    const open = (): void => setRailBranch(curWb);
    const settled = (event: TransitionEvent): void => {
      if (event.propertyName === 'height' && closing.every(branch => branch.getBoundingClientRect().height < 1)) open();
    };
    const reduceMotion = (): void => { if (motion.matches) open(); };
    const duration = getComputedStyle(rail).getPropertyValue('--rail-motion').trim();
    const timer = window.setTimeout(open, parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) + 32);
    rail.addEventListener('transitionend', settled);
    motion.addEventListener('change', reduceMotion);
    return () => {
      window.clearTimeout(timer);
      rail.removeEventListener('transitionend', settled);
      motion.removeEventListener('change', reduceMotion);
    };
  }, [curWb, navExpanded]);

  useLayoutEffect(() => {
    const rail = railRef.current, selection = railSelectionRef.current;
    const active = rail?.querySelector<HTMLButtonElement>('[data-workbench].on');
    const list = rail?.querySelector<HTMLElement>('.rail-nav');
    if (!rail || !selection || !active || !list || getComputedStyle(selection).display === 'none') return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed = lastRailWorkbench.current !== null && lastRailWorkbench.current !== curWb;
    lastRailWorkbench.current = curWb;
    const place = (): void => {
      const rect = active.getBoundingClientRect(), railRect = rail.getBoundingClientRect(), listRect = list.getBoundingClientRect();
      const inList = list.contains(active);
      const index = Array.from(list.querySelectorAll('[data-workbench]')).indexOf(active);
      const top = inList
        ? listRect.top - railRect.top - list.scrollTop + index * (rect.height + parseFloat(getComputedStyle(list).rowGap))
        : rect.top - railRect.top;
      selection.style.transform = `translateY(${top}px)`;
      const visible = !inList || rect.top >= listRect.top - 1 && rect.bottom <= listRect.bottom + 1;
      rail.dataset.selectionVisible = String(visible);
      selection.style.opacity = visible ? '1' : '0';
    };
    const snap = (): void => {
      rail.dataset.selectionMotion = 'off';
      place();
      selection.getBoundingClientRect();
      delete rail.dataset.selectionMotion;
    };
    railSelectionGlow.current?.cancel();
    if (rail.dataset.selectionReady !== 'true' || motion.matches) snap();
    else place();
    rail.dataset.selectionReady = 'true';
    if (changed && !motion.matches) {
      const style = getComputedStyle(rail), shadow = getComputedStyle(selection).boxShadow;
      const duration = style.getPropertyValue('--rail-motion').trim();
      const light = `${shadow}, 0 0 0 1px ${style.getPropertyValue('--acc-ring')}, 0 0 18px ${style.getPropertyValue('--acc-soft')}`;
      railSelectionGlow.current = selection.animate([{ boxShadow: shadow }, { boxShadow: light, offset: 0.35 }, { boxShadow: shadow }], {
        duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000) * 1.5, easing: 'ease-out',
      });
    }
    const observer = new ResizeObserver(place);
    observer.observe(rail);
    observer.observe(active);
    const settled = (event: TransitionEvent): void => {
      if (event.propertyName === 'height' || event.propertyName === 'margin-top') place();
    };
    const reduceMotion = (): void => { railSelectionGlow.current?.cancel(); snap(); };
    list.addEventListener('scroll', snap);
    rail.addEventListener('transitionend', settled);
    window.addEventListener('resize', snap);
    motion.addEventListener('change', reduceMotion);
    return () => {
      observer.disconnect();
      railSelectionGlow.current?.cancel();
      list.removeEventListener('scroll', snap);
      rail.removeEventListener('transitionend', settled);
      window.removeEventListener('resize', snap);
      motion.removeEventListener('change', reduceMotion);
    };
  }, [curWb, navExpanded]);

  const openBotMenu = (card: BotCard, anchor: HTMLButtonElement, x?: number, y?: number) => {
    const bounds = anchor.getBoundingClientRect();
    anchor.focus({ preventScroll: true });
    setBotMenu({ card, anchor, x: x ?? bounds.right, y: y ?? bounds.top });
  };
  const editBot = (card: BotCard) => {
    setBotMenu(undefined); activate(card.workspaceId); selectAssistantMode('parallel'); setAiOpen(true);
    setBotPage({ value: 'profile', nonce: Date.now() });
  };
  const renderRailWorkbench = (workbench: WorkbenchDef) => {
    const bot = bots.find(item => item.workspaceId === workbench.id);
    const activity = bot?.activity ?? (bot?.runningCount ? 'working' : 'idle'), activityLabel = botActivityLabels[activity];
    const attention = !!bot?.waitingCount || ['waiting_user', 'waiting_resource', 'interrupted'].includes(activity);
    if (workbench.id !== 'settings' && bot) return <div className="rail-entry bot-contact" key={bot.id} data-selected={curWb === workbench.id} onContextMenu={event => { event.preventDefault(); openBotMenu(bot, event.currentTarget.querySelector<HTMLButtonElement>('button.ritem')!, event.clientX, event.clientY); }}>
      <button className={`ritem${curWb === workbench.id ? ' on' : ''}`} data-workbench={workbench.id} aria-current={curWb === workbench.id ? 'page' : undefined} aria-label={`${bot.name}，${bot.description}${activityLabel ? `，${activityLabel}` : ''}`} aria-haspopup="menu" aria-expanded={botMenu?.card.id === bot.id} aria-keyshortcuts="Shift+F10" title={`${bot.name} · ${bot.description}${activityLabel ? ` · ${activityLabel}` : ''}（右键编辑 Bot）`} onClick={() => activate(workbench.id, { keepLayout: true })} onKeyDown={event => { if (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10') { event.preventDefault(); openBotMenu(bot, event.currentTarget); } }}><BotAvatar avatar={bot.avatar} activity={activity} motionId={bot.id} completion={bot.completion} /><span className="rail-label"><strong>{bot.name}</strong><small>{activityLabel || bot.description}</small></span></button>
      {!!(attention || bot.unreadCount) && <span className="bot-contact-badge" aria-label={bot.waitingCount ? `${bot.waitingCount} 项等待确认` : attention ? activityLabel : `${bot.unreadCount} 项未读结果`}>{attention ? `?${(bot.waitingCount ?? 0) > 1 ? bot.waitingCount : ''}` : bot.unreadCount}</span>}
    </div>;
    const Icon = WB_ICONS[workbench.id];
    const hasBranch = workbench.id !== 'home' && workbench.id !== 'settings' && workbench.subs.length > 0;
    const branchVisible = hasBranch && workbench.id === curWb && railBranch === curWb;
    const menuAvailable = hasBranch && !navExpanded;
    const menuOpen = menuAvailable && railMenu === workbench.id;
    const selectedChild = workbench.subs.findIndex(sub => sub.view === curView);
    const children = hasBranch ? workbench.subs.map((sub) => (
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
        {sub.label}
        {sub.pending && <span className="ntag">规划中</span>}
      </button>
    )) : null;
    return (
      <div
        key={workbench.id}
        className="rail-entry"
        onMouseEnter={() => { window.clearTimeout(railMenuCloseTimer.current); dismissedRailMenu.current = null; setRailMenu(menuAvailable ? workbench.id : null); }}
        onMouseLeave={(event) => {
          const entry = event.currentTarget;
          if (entry.querySelector(':focus-visible')) return;
          if (appearance.value.navigationStyle === 'classic') { setRailMenu(null); return; }
          // Give the pointer time to cross the floating capsule/menu gap, including its entry animation.
          window.clearTimeout(railMenuCloseTimer.current);
          railMenuCloseTimer.current = window.setTimeout(() => {
            if (!entry.matches(':hover') && !entry.querySelector(':focus-visible')) {
              setRailMenu(current => current === workbench.id ? null : current);
            }
          }, 180);
        }}
        onFocusCapture={() => { window.clearTimeout(railMenuCloseTimer.current); if (menuAvailable && dismissedRailMenu.current !== workbench.id) setRailMenu(workbench.id); }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            dismissedRailMenu.current = null;
            if (!event.currentTarget.matches(':hover')) setRailMenu(current => current === workbench.id ? null : current);
          }
        }}
        onKeyDown={(event) => {
          if ((event.key === 'Escape' || event.key === 'ArrowLeft') && menuOpen) {
            event.preventDefault();
            event.stopPropagation();
            dismissedRailMenu.current = workbench.id;
            setRailMenu(null);
            event.currentTarget.querySelector<HTMLButtonElement>('[data-workbench]')?.focus();
          } else if (event.key === 'ArrowRight' && menuAvailable) {
            event.preventDefault();
            dismissedRailMenu.current = null;
            setRailMenu(workbench.id);
            requestAnimationFrame(() => railMenuRef.current?.querySelector<HTMLButtonElement>('button')?.focus());
          }
        }}
      >
        <button
          type="button"
          data-workbench={workbench.id}
          className={curWb === workbench.id ? 'ritem on' : workbench.pending ? 'ritem dim' : 'ritem'}
          title={workbench.pending ? `${workbench.title}(即将上线)` : workbench.title}
          aria-label={workbench.title}
          aria-haspopup={workbench.id === 'settings' ? 'dialog' : undefined}
          aria-current={curWb === workbench.id ? 'true' : undefined}
          aria-expanded={hasBranch ? (navExpanded ? branchVisible : menuOpen) : undefined}
          aria-controls={navExpanded && branchVisible ? `rail-branch-${workbench.id}` : menuOpen ? `rail-menu-${workbench.id}` : undefined}
          onClick={() => workbench.id === 'settings' ? switchView(rememberedSettingsView()) : activate(workbench.id)}
        >
          <span className="rail-icon" aria-hidden="true"><Icon /></span>
          <span className="rail-label">{workbench.title}</span>
        </button>
        {hasBranch && (
          <div className="rail-branch" data-open={branchVisible} style={{ '--branch-rows': workbench.subs.length, '--branch-selected': selectedChild } as CSSProperties}
            inert={!navExpanded || !branchVisible} aria-hidden={!navExpanded || !branchVisible || undefined}>
            <nav id={`rail-branch-${workbench.id}`} aria-label={`${workbench.title}二级目录`}>
              <span className="rail-child-selection" aria-hidden="true" hidden={selectedChild < 0} />
              {children}
            </nav>
          </div>
        )}
        {menuOpen && (
          <nav ref={railMenuRef} id={`rail-menu-${workbench.id}`} className="rail-flyout" aria-label={`${workbench.title}二级目录`}>
            <div className="rail-flyout-card">
              <div className="rail-flyout-title">{workbench.title}</div>
              <div className="rail-flyout-list" style={{ '--branch-selected': selectedChild } as CSSProperties}>
                <span className="rail-child-selection" aria-hidden="true" hidden={selectedChild < 0} />
                {children}
              </div>
            </div>
          </nav>
        )}
      </div>
    );
  };

  useLayoutEffect(() => {
    const menu = railMenuRef.current;
    const trigger = railRef.current?.querySelector<HTMLButtonElement>(`[data-workbench="${railMenu}"]`);
    if (!menu || !trigger) return;
    const place = (): void => {
      const rect = trigger.getBoundingClientRect();
      menu.style.left = `${rect.right}px`;
      menu.style.top = `${Math.max(74, Math.min(rect.top + (rect.height - menu.offsetHeight) / 2, innerHeight - menu.offsetHeight - 12))}px`;
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(trigger);
    railRef.current?.querySelectorAll('.rail-entry').forEach(entry => observer.observe(entry));
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [railMenu]);

  // 顶栏胶囊：工作台的今日待办统计与今日日程
  const today = localDay(todo.clock);
  const todayMeetings = (todo.data?.tasks ?? [])
    .filter((t) => !t.deletedAt && t.kind === 'meeting' && t.status !== 'done' && taskDay(t) !== null && taskDay(t)! <= today)
    .sort((a, b) => taskTime(a) - taskTime(b))
    .slice(0, 4);
  const openCount = todo.data ? openToday(todo.data.tasks, today).length : 0;
  const doneCount = todo.data
    ? todo.data.tasks.filter((t) => !t.deletedAt && t.status === 'done' && t.completedAt && localDay(new Date(t.completedAt)) === today).length
    : 0;
  const totalCount = openCount + doneCount;
  const todaySchedule = (todo.data?.tasks ?? [])
    .filter((t) => !t.deletedAt && t.kind === 'meeting' && taskDay(t) !== null && taskDay(t)! <= today)
    .sort((a, b) => taskTime(a) - taskTime(b));
  const openTodos = todo.data ? openToday(todo.data.tasks, today) : [];
  const overdueCount = todo.data
    ? openToday(todo.data.tasks, today).filter((t) => isOverdue(t, todo.clock.getTime())).length
    : 0;
  const topbarCapsuleKey = [
    todayMeetings.map((t) => `${t.id}:${t.title}:${t.dateAt ?? ''}:${t.endAt ?? ''}:${t.status}`).join(','),
    `${doneCount}/${totalCount}`,
    overdueCount,
    `${todo.clock.getFullYear()}-${todo.clock.getMonth()}-${todo.clock.getDate()}`,
    aiJob ? `${aiJob.chatId}:${aiJob.status}:${aiJob.title}` : '',
    aiOpen ? 'ai' : '',
    activeAiChatId ?? '',
    browserTask ? `${browserTask.status}:${browserTask.workspace}` : '',
    curView, appearance.value.navigationStyle,
  ].join('|');
  useLayoutEffect(() => {
    const bar = topbarRef.current;
    if (!bar) return;
    const place = (): void => { applyTopbarCapsulePlacement(bar); };
    place();
    const right = bar.querySelector('.tb-right');
    const observer = new ResizeObserver(place);
    observer.observe(bar);
    if (right) observer.observe(right);
    return () => observer.disconnect();
  }, [topbarCapsuleKey]);

  return (
    <div className={'win bot-shell' + (aiOpen ? ' bot-assistant-open' : '')} data-workspace-hidden={workspaceHidden || undefined} data-assistant-mode={assistantMode} data-workbench={curWb} data-game={curView === 'game'} data-nav-expanded={navExpanded} style={{ '--ai-width': aiWidth + 'px' } as CSSProperties}>
      <aside id="workbench-navigation" className="rail" ref={railRef} aria-label="工作台导航">
        <span className="rail-selection" ref={railSelectionRef} aria-hidden="true" />
        <div className="rail-nav-shell">
        <nav className="rail-nav" aria-label="工作台" onScroll={() => setRailMenu(null)}>
          {NAV.filter((w) => w.id !== 'settings').map(renderRailWorkbench)}
        </nav>
        </div>
        <div className="rbot">
          {renderRailWorkbench(workbenchById('settings'))}
        </div>
      </aside>
      <div className="main">
      <header className="topbar" ref={topbarRef}>
        <div className="tb-brand">
        <div className="logo" title="个人工作台">
          <LogoMark />
        </div>
        <button type="button" className="ibtn nav-toggle" title={navExpanded ? '收起导航' : '展开导航'} aria-label={navExpanded ? '收起导航' : '展开导航'}
          aria-expanded={navExpanded} aria-controls="workbench-navigation" onClick={() => { botPanel.current?.prepareWorkspaceResize(); setRailMenu(null); setNavExpanded(value => !value); }}>
          <SidebarSimple size={20} />
        </button>
        </div>
        <div className="tb-middle">
        <div className="tb-left">
        <div className="sched" data-open={islandPop === 'sched' || undefined} onClick={() => toggleIslandPop('sched')}>
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
              const start = t.dateAt ? Date.parse(t.dateAt) : null;
              const end = start !== null && Number.isFinite(start) ? meetingEndAt(t) : null;
              const live = start !== null && end ? start <= todo.clock.getTime() && Date.parse(end) > todo.clock.getTime() : false;
              return (
                <button key={t.id} className={live ? 'schip now' : 'schip'} title={t.title} onClick={(e) => { e.stopPropagation(); openTaskEditor(t); }}>
                  {live && <span className="live" />}
                  <span className="t">{topbarScheduleDate(t, todo.clock)}</span>
                  <span className="n">{t.title}</span>
                </button>
              );
            })}
          </div>
          <button className="smore" title="今日日程面板" aria-expanded={islandPop === 'sched'} aria-controls="topbar-day-panel" onClick={(e) => { e.stopPropagation(); toggleIslandPop('sched'); }}>
            <IconChevronDown size={12} />
          </button>
        </div>
      </div>

      <div className="tb-center">
        <button className="todopill glass" title="今日待办" aria-label={`待办 ${doneCount}/${totalCount}${overdueCount > 0 ? `，逾期 ${overdueCount}` : ''}`} aria-expanded={islandPop === 'todo'} aria-controls="topbar-day-panel" onClick={() => toggleIslandPop('todo')}>
          <IconCheckSquare />
          <span className="lbl">待办</span>
          <span className="sdiv" />
          <span className="num">{doneCount}/{totalCount}</span>
          {overdueCount > 0 && <span className="pill-badge"><span className="pill-badge-label">逾期&nbsp;</span><WarningCircle className="pill-badge-icon" size={14} aria-hidden="true" />{overdueCount}</span>}
          <span className="pill-caret"><IconChevronDown size={12} /></span>
        </button>
      </div>
        {islandPop && (
        <div id="topbar-day-panel" className={'ipop ipop-' + islandPop} role="region" aria-label={islandPop === 'sched' ? '今日日程' : '今日待办'}>
          <div className="ipop-head">
            <span>{islandPop === 'sched' ? '今日日程' : '今日待办'}</span>
            <span className="ipop-count">
              {islandPop === 'todo' && overdueCount > 0 && <span className="pill-badge">逾期 {overdueCount}</span>}
              <span>{islandPop === 'sched' ? todaySchedule.length : openTodos.length} 项</span>
            </span>
          </div>
          {islandPop === 'sched' ? <>
            {todaySchedule.length === 0 && <div className="ipop-empty">今天没有日程。</div>}
            {todaySchedule.map((t) => (
              <div key={t.id} className={t.status === 'done' ? 'ipop-row done' : 'ipop-row'}>
                <button className="ipop-title" title={t.title} onClick={() => openTaskEditor(t)}>{t.title}</button>
                <span className="ipop-time">{topbarScheduleDate(t, todo.clock)}</span>
              </div>
            ))}
          </> : <>
            {openTodos.length === 0 && <div className="ipop-empty">今天没有待办,点下方新增。</div>}
            {openTodos.map((t) => (
              <div key={t.id} className="ipop-row">
                <button
                  className={t.status === 'done' ? 'ipop-check done' : 'ipop-check'}
                  title={t.status === 'done' ? '恢复待办' : '完成'}
                  onClick={() => todo.mutate(() => window.workbench.todo.update(t.id, { status: t.status === 'done' ? 'todo' : 'done' }, t.updatedAt))}
                >
                  {t.status === 'done' ? '✓' : ''}
                </button>
                <button className="ipop-title" title={t.title} onClick={() => openTaskEditor(t)}>{t.title}</button>
                <span className="ipop-time">{topbarTodoDate(t, todo.clock)}</span>
              </div>
            ))}
          </>}
          <div className="ipop-foot">
            {islandPop === 'sched'
              ? <button className="ipop-link" onClick={() => openTopbarTaskCreator('meeting')}>+ 新增日程</button>
              : <button className="ipop-link" onClick={() => openTopbarTaskCreator('task')}>+ 新增待办</button>}
          </div>
        </div>
        )}
        </div>

      <div className="tb-right">
        <div className="tb-tools">
        {aiJob && aiJob.status !== 'done' && (!aiOpen || aiJob.chatId !== activeAiChatId) && <button className="ai-job-btn" title="返回生成的对话" onClick={returnToAiJob}>{aiJob.scope.module === 'copy' ? '博客' : aiJob.scope.module === 'bazi' ? '命理' : '助手'}{aiJob.status === 'running' ? '生成中' : '请求失败'}</button>}
        {browserTask && ['running', 'paused', 'site-approval'].includes(browserTask.status) && curView !== (browserTask.workspace === 'xhs-creator' ? 'media-browser' : 'browser') && <button className="ai-job-btn" title="返回浏览器任务" onClick={() => switchView(browserTask.workspace === 'xhs-creator' ? 'media-browser' : 'browser')}>{browserTask.status === 'site-approval' ? '浏览器等待站点授权' : browserTask.status === 'paused' ? '浏览器已暂停' : '浏览器后台操作中'}</button>}
        <TopbarUpdate onOpen={() => setIslandPop(null)} />
        <button className="ibtn float-topbar-btn" title={floatVisible ? '隐藏桌面灵动岛' : '打开桌面灵动岛'} aria-label={floatVisible ? '隐藏桌面灵动岛' : '打开桌面灵动岛'} aria-pressed={floatVisible} onClick={() => { setIslandPop(null); void window.workbench.float.toggle().catch(e => showToast(errorText(e))); }}><span className="topbar-mascot-icon" aria-hidden="true"><IslandMascot /></span></button>
        <Select className={`ai-topbar-mode${aiOpen ? ' is-open' : ''}${backgroundAiRunning ? ' has-running' : ''}`} menuClassName="ai-topbar-mode-menu" triggerClassName="ai-topbar-btn" triggerRef={aiTrigger} triggerContent={<Sparkle size={18} weight={aiOpen || backgroundAiRunning ? 'fill' : 'regular'} />} title={aiModeLabel} aria-label="AI 助手" value={aiOpen ? assistantMode : 'hidden'} options={[{ value: 'parallel', label: BOT_MODE_LABELS.parallel }, { value: 'floating', label: BOT_MODE_LABELS.floating }, { value: 'hidden', label: '收起助手' }]}
          renderOption={option => <span className="ai-mode-option-label">
            {option.value !== 'hidden' && <svg className="ai-mode-diagram" width="24" height="18" viewBox="0 0 24 18" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <rect x="1" y="1" width="22" height="16" rx="2.5" />
              {option.value === 'parallel' ? <>
                <path d="M9 1v16" />
                <path d="M4 5h2M4 8h2M12 5h7M12 8h5" />
              </> : <>
                <path d="M5 5h14M5 8h9" />
                <rect x="6" y="11" width="12" height="3.5" rx="1.75" fill="currentColor" fillOpacity=".12" />
              </>}
            </svg>}
            {option.label}
          </span>}
          onOpenChange={setAiMenuOpen} onChange={value => { if (value === 'hidden') setAiOpen(false); else { selectAssistantMode(value as BotAssistantMode); setAiOpen(true); } }} />
        <AiSetupHint trigger={aiTrigger} active={!settingsView && !aiMenuOpen && !completedAiJob} onConfigure={() => switchView('settings-ai')} />
        <AiTopbarHint trigger={aiTrigger} active={!settingsView && !aiMenuOpen && !!completedAiJob} kind="completion" title={`${completedAiJob?.scope.module === 'copy' ? '博客' : completedAiJob?.scope.module === 'bazi' ? '命理' : '助手'}已完成`}
          message={`“${completedAiJob?.title || '当前对话'}”已生成新回复。`} closeLabel="关闭完成提示" actionLabel="查看对话" onDismiss={dismissAiCompletion} onAction={returnToAiJob} />
        <span className="vdiv" />
        <button type="button" className="avatar" data-avatar-color={profileAvatarColor} title={profileName} aria-label={`打开个人资料：${profileName}`} onClick={() => switchView('settings-profile')}>
          {profileName.trim().charAt(0).toUpperCase() || 'O'}
        </button>

        </div>
        <span className="vdiv window-divider" />
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

      <div id="bot-workspace" className="body bot-workspace" inert={workspaceHidden} aria-hidden={workspaceHidden || undefined}>
      <header className="bot-workspace-header" data-dashboard={showDashboardHeader || undefined}><div className="bot-workspace-title" ref={setWorkspaceHeader}>
        {!showDashboardHeader && <h2>工作台</h2>}
        {curWb !== 'home' && activeWorkbench.subs.filter(sub => sub.view).length > 1 && (
          <nav className="content-tabs" aria-label="当前工作台页面" onKeyDown={event => {
            if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
            const direction = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
            if (!direction || !(event.target instanceof HTMLButtonElement)) return;
            const tabs = Array.from(event.currentTarget.querySelectorAll('button'));
            const index = tabs.indexOf(event.target);
            const next = tabs[(index + direction + tabs.length) % tabs.length];
            event.preventDefault();
            next.focus();
            next.click();
          }}>
            {activeWorkbench.subs.filter(sub => sub.view).map(sub => {
              const view = sub.view!;
              const PageIcon = WORKBENCH_PAGE_ICONS[view];
              return <button type="button" key={view} aria-current={view === curView ? 'page' : undefined} onFocus={event => event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })} onClick={() => switchView(view)}>{PageIcon && <PageIcon size={16} aria-hidden="true" />}{sub.label}</button>;
            })}
          </nav>
        )}
      </div></header>
      {botError && <div className="bot-error" role="alert">{botError}<button onClick={() => void readBots()}>重新连接</button></div>}
      {artifactError && <div className="bot-error bot-artifact-error" role="alert">{artifactError}<button onClick={() => setArtifactError('')}>关闭提示</button></div>}
      {artifactPreview && <section className="bot-artifact-preview" aria-label="交付件预览"><header><div><h3>{artifactPreview.title}</h3><span>{bots.find(bot => bot.id === artifactPreview.producerBotId)?.name}生成 · {new Date(artifactPreview.createdAt).toLocaleString('zh-CN')}</span></div>{artifactPreview.resource.kind !== 'artifact' && <button className="bot-text-button" onClick={() => openBotResource(artifactPreview.resource)}>打开原件</button>}<IconButton label="关闭交付件预览" onClick={() => setArtifactPreview(null)}><X size={19} /></IconButton></header>{artifactPreview.content ? <AiResponse entry={{ id: artifactPreview.id, role: 'assistant', content: artifactPreview.content }} /> : <p className="bot-empty">这是工作区原件的引用。打开原件查看当前内容。</p>}</section>}


      <div className="body bot-native-workspace" inert={!!artifactPreview} aria-hidden={!!artifactPreview || undefined}>


      {/* 主区 */}
      <BrowserTabTargetContext.Provider value={browserTabTarget}><main className="content" ref={contentRef} tabIndex={-1}>
          {todo.error && <div className="todo-load-error" role="alert">{todo.error}</div>}
          {/* 内容切换沿用 .view-fade，设置弹窗独立保留当前工作台。 */}
          {(isPlanningWorkbench || !curView.startsWith('ai-test') && curView !== 'media-browser' && curView !== 'browser' && curView !== 'hush-hour' && curView !== 'personal-website' && curView !== 'game') && <div className="view-fade" key={curView}>
          {isPlanningWorkbench ? (
            <section className="pending-workbench" role="status">
              <span className="pending-workbench-icon" aria-hidden="true"><ActiveWorkbenchIcon /></span>
              <h1>{activeWorkbench.title}</h1>
              <p>规划中 · 敬请期待</p>
            </section>
          ) : curView === 'bazi' ? (
            <BaziView onPending={showToast} onAskAI={(prompt, profileId, system, topic) => askAI(prompt, { module: 'bazi', profileId }, system, undefined, topic)} onCurrentProfile={setBaziCtx} requestedProfileId={requestedProfileId} requestedDayLocate={requestedBaziDay} onDayLocated={() => setRequestedBaziDay(null)}
              aiBusy={(aiSeed?.scope.module === 'bazi' && aiSeed.scope.profileId === baziCtx?.id) || aiJobs.some(job => job.status === 'running' && job.scope.module === 'bazi' && job.scope.profileId === baziCtx?.id)}
              onViewAI={() => { setAiOpen(true); const job = aiJobs.find(item => item.status === 'running' && item.scope.module === 'bazi' && item.scope.profileId === baziCtx?.id); if (job) setRequestedAiChatId(job.chatId); }}
              onOpenAISettings={() => switchView('settings-ai')} />
          ) : curView === 'copy' ? (
            <CopyView onPending={showToast} onCurrentDraft={setCopyCtx} onSaveState={setCopySaveState} requestedDraftId={requestedCopyId} requestedSource={requestedCopySource} onSourceLocated={() => setRequestedCopySource(null)} onGoPublish={() => switchView('copy-publish')} />
          ) : curView === 'copy-publish' ? (
            <PublishView onPending={showToast} onGoEdit={() => switchView('copy')} onOpenCreator={() => switchView('media-browser')} />
          ) : curView === 'reading' ? (
            <ReadingView onPending={showToast} onAskAI={(prompt, bookId) => askAI(prompt, { module: 'reading', profileId: bookId })} onCurrentBook={setReadingCtx} />
          ) : curView === 'checkin' ? (
            <CheckinView onOpenSettings={openCheckinSettings} onBack={() => switchView('home')} />
          ) : curView === 'todo' ? (
            todo.data ? <TodoView data={todo.data} clock={todo.clock} mutate={todo.mutate} editor={homeEditor} setEditor={setHomeEditor} editHandle={todoEditHandle} workspaceHeader={artifactPreview ? null : workspaceHeader} /> : <div className="todo-loading" role="status">正在读取本地待办…</div>
          ) : (
            <HomeView workspaceHeader={showDashboardHeader ? workspaceHeader : null} data={todo.data} clock={todo.clock} userName={profileName} onNavigate={switchView} onOpenTask={openTaskEditor} onPending={showToast} onOpenCheckinSettings={openCheckinSettings} />
          )}
          </div>}
          <MediaBrowserHost active={!workspaceHidden && !isPlanningWorkbench && curView === 'media-browser'} focusTarget={contentRef}
            onPending={showToast} />
          <BrowserHost active={!workspaceHidden && !isPlanningWorkbench && curView === 'browser'} focusTarget={contentRef} onPending={showToast} />
          <BrowserHost active={!workspaceHidden && !isPlanningWorkbench && curView === 'hush-hour'} focusTarget={contentRef} onPending={showToast}>
            <HushHourView active={!workspaceHidden && !isPlanningWorkbench && curView === 'hush-hour'} onPending={showToast} />
          </BrowserHost>
          <GameHost active={!workspaceHidden && !isPlanningWorkbench && curView === 'game'} focusTarget={contentRef} onPending={showToast} />
          <BrowserHost active={!workspaceHidden && !isPlanningWorkbench && curView === 'personal-website'} focusTarget={contentRef} onPending={showToast}>
            <PersonalWebsiteView active={!workspaceHidden && !isPlanningWorkbench && curView === 'personal-website'} onPending={showToast} onAskAI={prompt => askAI(prompt, { module: 'workbench', viewId: 'personal-website' })} />
          </BrowserHost>
          <AiTestHost active={!workspaceHidden && !isPlanningWorkbench && curView.startsWith('ai-test')} view={curView} onNavigate={switchView} />
        </main></BrowserTabTargetContext.Provider>

      </div>
      </div>
      </div>
      {topbarEditorKind ? <TaskEditor key={topbarEditorKind} initialKind={topbarEditorKind} categories={todo.data?.categories ?? []} api={topbarTaskEditorApi}
        changed={(state) => todo.mutate(async () => state)} saved={(state) => todo.mutate(async () => state)} close={() => setTopbarEditorKind(null)} /> : null}
      {aiOpen && activeBot && assistantMode === 'parallel' && !workspaceHidden && <IconButton className="bot-workspace-toggle" label="收起工作台" aria-controls="bot-workspace" aria-expanded={true} onClick={() => { botPanel.current?.prepareWorkspaceResize(); setWorkspaceCollapsed(true); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.bot-identity-pill')?.focus()); }}><SidebarSimple size={18} mirrored /></IconButton>}
      {activeBot && <BotPanel key={`panel-${activeBot.id}`} ref={botPanel} bot={activeBot} cards={bots} open={aiOpen} mode={assistantMode} onMode={selectAssistantMode} onClose={() => setAiOpen(false)} context={aiContext} seed={aiSeed} onSeedFinished={nonce => setAiSeed(previous => previous?.nonce === nonce ? null : previous)} onActiveChatChange={setActiveAiChatId} onOpenSettings={() => switchView('settings-ai')} onOpenResource={openBotResource} onOpenTodo={openTodoTarget} onOpenBrowser={openBrowserTask} onOpenDashboard={() => switchView('home')} onLocateCopySource={source => { setRequestedCopySource({ ...source, nonce: ++sourceNonce.current }); setRequestedCopyId(source.draftId); switchView('copy'); }} onLocateBaziDay={profileId => { setRequestedBaziDay({ profileId, nonce: ++sourceNonce.current }); setRequestedProfileId(profileId); switchView('bazi'); }} onSelectBot={id => { const selected = bots.find(bot => bot.id === id); if (selected) activate(selected.workspaceId, { keepLayout: true }); }} workspaceHidden={workspaceHidden} navExpanded={navExpanded} onOpenWorkspace={() => setWorkspaceCollapsed(false)} initialPage={botPage} initialProfileTab={botPage ? undefined : initialProfileTab} width={aiWidth} onWidthChange={setAiWidth} copySaveState={copySaveState} />}
      {botMenu && <BotContactMenu x={botMenu.x} y={botMenu.y} anchor={botMenu.anchor} close={() => setBotMenu(undefined)} edit={() => editBot(botMenu.card)} />}
      {settingsView && <SettingsDialog view={settingsView} onNavigate={switchView} close={closeSettings} checkinProvider={checkinSettingsEntry?.provider}
        checkinReturnLabel={checkinSettingsEntry && (curView === 'checkin' ? '返回每日签到' : '返回看板')}
        appearance={appearance} onAvatarColorChange={setProfileAvatarColor} onProfileNameChange={setProfileName}
        botManagement={<BotManagement />} />}
      <div className="toast glass" data-show={toast ? '1' : '0'}>{toast}</div>
    </div>
  );
}
