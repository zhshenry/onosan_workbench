import { BotChatSynchronizer } from '../bot-chat-sync';
import { useBotChatHistory } from '../bot-chat-history';
import { groupBotChatEvents, type BotChatEventGroup, type BotChatEventSlot } from '../bot-chat-events';
import { Fragment, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, CaretRight, DotsThree, ListBullets, MinusSquare, Paperclip, PaperPlaneRight, Plus, Power, SidebarSimple, Sparkle, Square, StarFour, X } from '@phosphor-icons/react';
import type { BotArtifact, BotCard, BotMessage, BotOpen, BotResourceRef, BotSubmit, BotTask } from '../../shared/bot-contracts';
import { isQueuedBotMessage } from '../../shared/bot-contracts';
import { BotMessageQueue } from './BotMessageQueue';
import type { AiTurnContext, AiReference } from '../../shared/ai-reference';
import type { ChatEntry, CopySource } from '../../shared/todo-contracts';
import type { AiConfig } from '../../shared/workbench-api';
import { BotDraftController } from '../bot-draft';
import { groupBotProgress } from '../bot-progress';
import { playBotMarquee, playBotOpening } from '../bot-floating-motion';
import { errorText, IconButton } from '../ui/controls';
import type { AiPanelContext, AiSeed } from './AiPanel';
import { AiResponse, ResponseProcess } from './AiResponse';
import { botEntryOutcome, projectBotTurnOutcomes } from '../bot-turn-outcomes';
import { AiReferencePicker, loadReferenceOptions, type ReferenceMode, type ReferenceOption } from './AiReferencePicker';
import { SpeechInput } from './SpeechInput';
import { BotAvatar } from './BotAvatar';
import { BotProfile, type InspectorTab } from './BotProfile';
import { botStatusLabel, BotChatActions, BotTaskDetail } from './BotTasks';
import { BotSchedules } from './BotSchedules';
import { BotArtifactsView } from './BotWorkViews';
import { BotActivity } from './BotActivity';
import { BotCollaborationCard, BotExchangeView, BotIncomingMessage, BotMessageEvent, isCollaborationTask, projectBotCollaboration, useChatCollaborations } from './BotCollaboration';
import { BrowserSiteApprovalCard, browserSiteApprovalForCard, useBrowserApprovalTasks } from '../../modules/browser/ui/site-approval';

export type BotAssistantMode = 'parallel' | 'floating';
export type BotPanelPage = 'chat' | 'tasks' | 'artifacts' | 'history' | 'schedules' | 'exchange' | 'profile';
export type BotPanelHandle = {
  openProfileTab?: InspectorTab;
  prepareModeSwitch(mode: BotAssistantMode): void;
  prepareWorkspaceResize(): void;
};
type AmendmentChoice = { label: string; target: NonNullable<BotSubmit['target']> };
type RecordLocation = { kind: 'entry' | 'action'; id: string; taskId: string; focus: boolean };
const collaborationBeforeReply = (task: BotTask) => isCollaborationTask(task) && !task.assistantEntryIds?.length;
const wb = window.workbench;
const replyDateFormat = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const controllers = new Map<string, BotDraftController>();
const selections = new Map<string, { start: number; end: number }>();
export function botDraft(chatId: string): BotDraftController { let controller = controllers.get(chatId); if (!controller) { controller = new BotDraftController(chatId, wb.bot); controllers.set(chatId, controller); } return controller; }
const asRef = (value: AiReference): BotResourceRef => ({ kind: value.module, id: value.module === 'todo' ? value.taskId : value.module === 'copy' ? value.draftId : value.profileId });
const asAiRef = (value: BotResourceRef): AiReference | null => value.kind === 'todo' ? { module: 'todo', taskId: value.id } : value.kind === 'copy' ? { module: 'copy', draftId: value.id } : value.kind === 'bazi' || value.kind === 'reading' ? { module: value.kind, profileId: value.id } : null;

export function BotPanel({ ref, bot, cards, open, mode = 'parallel', onMode, context, seed, onSeedFinished, onOpenSettings, onActiveChatChange, onOpenResource, workspaceHidden = false, navExpanded, onOpenWorkspace, onSelectBot, onLocateCopySource, onLocateBaziDay, initialPage, initialProfileTab, width = 400, onWidthChange, copySaveState, island = false }: {
  ref?: Ref<BotPanelHandle>; bot: BotCard; cards: BotCard[]; open: boolean; mode?: BotAssistantMode; onMode?(mode: BotAssistantMode): void; onClose(): void;
  context: AiPanelContext; seed?: AiSeed | null; onSeedFinished?(nonce: number): void; onOpenSettings(): void; onActiveChatChange?(id: string): void;
  onOpenResource?(ref: BotResourceRef): void; workspaceHidden?: boolean; navExpanded?: boolean; onOpenWorkspace?(): void; onSelectBot?(id: string): void;
  onLocateCopySource?(source: CopySource): void; onLocateBaziDay?(profileId: string): void;
  initialPage?: { value: BotPanelPage; nonce: number; taskId?: string }; initialProfileTab?: InspectorTab; width?: number; onWidthChange?(width: number): void;
  copySaveState?: { id: string | null; status: 'saved' | 'saving' | 'error' }; island?: boolean;
}) {
  const draft = useMemo(() => botDraft(bot.mainChatId), [bot.mainChatId]);
  const [, render] = useState(0), [data, setData] = useState<Pick<BotOpen, 'bot' | 'history'>>(), [config, setConfig] = useState<AiConfig>();
  const [tasks, setTasks] = useState<BotTask[]>([]), [artifacts, setArtifacts] = useState<BotArtifact[]>([]), [page, setPage] = useState<BotPanelPage>('chat');
  const [error, setError] = useState(''), [reload, setReload] = useState(0), [busy, setBusy] = useState(false);
  const [inspectorView, setInspectorView] = useState<{ tab: InspectorTab | 'activity'; open: boolean; retained?: boolean; workspaceExitWidth?: number } | undefined>(
    () => initialProfileTab ? { tab: initialProfileTab, open: true, retained: true } : undefined,
  );
  const [activityStart, setActivityStart] = useState<{ key: number; taskId?: string; historyFirst?: boolean }>({ key: 0 });
  const [recordLocation, setRecordLocation] = useState<RecordLocation>();
  const inspector = inspectorView?.open ? inspectorView.tab : undefined;
  const inspectorPanel = useRef<HTMLElement>(null);
  const setInspector = useCallback((tab?: InspectorTab | 'activity') => {
    setInspectorView(view => {
      if (!tab) return view?.open ? { ...view, open: false } : view;
      if (view?.open && view.tab === tab) return view;
      return { tab, open: true, retained: tab !== 'activity' && view?.open && view.retained };
    });
  }, []);
  const openActivity = useCallback((taskId?: string, historyFirst = false) => {
    setActivityStart(last => ({ key: last.key + 1, taskId, historyFirst }));
    setInspector('activity'); setPage('chat'); setMenu(false); setCollapsed(false);
  }, [setInspector]);
  const [sourceTaskId, setSourceTaskId] = useState<string>();
  const badge = useRef<HTMLButtonElement>(null);
  const exchangeBack = useRef<HTMLButtonElement>(null);
  const [artifactId, setArtifactId] = useState<string>();
  const [exchange, setExchange] = useState<Pick<BotMessage, 'id' | 'fromBotId' | 'toBotId'>>();
  const [amendmentTarget, setAmendmentTarget] = useState<AmendmentChoice>();
  useEffect(() => { setAmendmentTarget(undefined); }, [bot.id]);
  const artifactTaskReturn = useRef<HTMLElement | null>(null);
  const [collapsed, setCollapsed] = useState(true), [replyVisible, setReplyVisible] = useState(false), [menu, setMenu] = useState(false);
  const [motionPhase, setMotionPhase] = useState('closed');
  const [referencesOpen, setReferencesOpen] = useState(false), [referenceMode, setReferenceMode] = useState<ReferenceMode | null>(bot.seedKey === 'schedule' ? 'todo' : bot.seedKey === 'media' ? 'copy' : bot.seedKey === 'utilities' ? 'reading' : bot.seedKey === 'coordinator' ? 'todo' : null);
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>([]), [referenceLoading, setReferenceLoading] = useState(false), [referenceError, setReferenceError] = useState(''), [referenceReload, setReferenceReload] = useState(0), [speechBusy, setSpeechBusy] = useState(false);
  const composer = useRef<HTMLDivElement>(null), editor = useRef<HTMLTextAreaElement>(null), referenceTrigger = useRef<HTMLButtonElement>(null), menuRef = useRef<HTMLDivElement>(null);
  const usedSeed = useRef<number | undefined>(undefined), submitBusy = useRef(false);
  const inputSurface = useRef<HTMLDivElement>(null), pill = useRef<HTMLButtonElement>(null), openingSnapshot = useRef(Promise.resolve(''));
  const glint = useRef<HTMLSpanElement>(null);
  const motion = useRef<Animation | null>(null), wave = useRef(() => {}), motionTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const panel = useRef<HTMLElement>(null), wasParallel = useRef(open && mode === 'parallel' && !island);
  const modeOrigin = useRef<{ mode: BotAssistantMode; rect: DOMRect } | null>(null);
  const floating = mode === 'floating' && !island;
  const embeddedActivity = !floating && !island;
  const openProfileTab = open && !floating && inspector !== 'activity' ? inspector : undefined;
  const history = useBotChatHistory(bot.mainChatId, !!island, floating, open && page === 'chat' && (!floating || !collapsed && replyVisible), tasks);
  const { scroll, snapshot, aboveBottom, restoreScroll: followChat } = history;
  const chat = snapshot?.chat;
  const workspaceResizeOrigin = useRef<{ left: number; width: number } | undefined>(undefined);
  const prepareWorkspaceResize = () => {
    const node = panel.current;
    if (!node || floating || island || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = node.getBoundingClientRect();
    const transform = node.dataset.workspaceResizing ? getComputedStyle(node, '::before').transform : 'none';
    const matrix = transform === 'none' ? undefined : new DOMMatrixReadOnly(transform);
    workspaceResizeOrigin.current = { left: rect.left + (matrix?.e ?? 0), width: rect.width * (matrix?.a ?? 1) };
    node.dataset.workspaceResizing = 'true';
  };
  useImperativeHandle(ref, () => ({
    openProfileTab,
    prepareWorkspaceResize,
    prepareModeSwitch(next) {
      const node = panel.current;
      if (!node || island || page !== 'chat' || inspector === 'activity') return;
      if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
        const source = floating && collapsed && !node.dataset.modeMorph ? inputSurface.current ?? node : node;
        modeOrigin.current = { mode: next, rect: source.getBoundingClientRect() };
      }
      if (next === 'floating') {
        setCollapsed(false);
        setReplyVisible(true);
        setMotionPhase('open');
      }
    },
  }), [openProfileTab, island, page, inspector, floating, collapsed]);
  useLayoutEffect(() => {
    const node = panel.current, from = workspaceResizeOrigin.current;
    workspaceResizeOrigin.current = undefined;
    if (!node || from === undefined) return;

    const media = matchMedia('(prefers-reduced-motion: reduce)');
    if (!open || floating || media.matches) {
      delete node.dataset.workspaceResizing;
      return;
    }
    node.dataset.workspaceResizing = 'true';
    const to = node.getBoundingClientRect();
    if (Math.abs(from.left - to.left) < 0.5 && Math.abs(from.width - to.width) < 0.5) {
      delete node.dataset.workspaceResizing;
      return;
    }
    followChat();
    const style = getComputedStyle(node), token = style.getPropertyValue('--rail-motion').trim();
    const timing = {
      duration: parseFloat(token) * (token.endsWith('ms') ? 1 : 1000),
      easing: style.getPropertyValue('--ease').trim(),
      fill: 'both' as const,
    };
    // Move the visible edge while the conversation keeps its final layout and scroll anchor.
    const frame = node.animate([
      { transform: `translateX(${from.left - to.left}px) scaleX(${from.width / to.width})` },
      { transform: 'none' },
    ], { ...timing, pseudoElement: '::before' });
    const revealLeft = Math.max(0, from.left - to.left);
    const revealRight = Math.max(0, to.right - from.left - from.width);
    const reveal = revealLeft || revealRight ? node.querySelector('.bot-conversation-column')?.animate([
      { clipPath: `inset(0 ${revealRight}px 0 ${revealLeft}px)` }, { clipPath: 'inset(0)' },
    ], timing) : undefined;
    const finish = () => {
      frame.cancel();
      reveal?.cancel();
      delete node.dataset.workspaceResizing;
      media.removeEventListener('change', finish);
      window.removeEventListener('resize', finish);
    };
    frame.onfinish = finish;
    media.addEventListener('change', finish);
    window.addEventListener('resize', finish);
    return finish;
  }, [workspaceHidden, navExpanded, open, floating, followChat]);
  useLayoutEffect(() => {
    const parallel = open && mode === 'parallel' && !island;
    const entering = open && !island && parallel !== wasParallel.current;
    wasParallel.current = parallel;
    const origin = modeOrigin.current;
    modeOrigin.current = null;
    const node = panel.current, media = matchMedia('(prefers-reduced-motion: reduce)');
    if (!entering || !node || media.matches) return;
    if (parallel) node.dataset.parallelEntering = 'true';
    const from = origin?.mode === mode ? origin.rect : undefined;
    if (from) node.dataset.modeMorph = 'true';
    const style = getComputedStyle(node), token = style.getPropertyValue('--rail-motion').trim();
    const duration = parseFloat(token) * (token.endsWith('ms') ? 1 : 1000);
    const easing = style.getPropertyValue('--ease').trim();
    const to = from ? node.getBoundingClientRect() : undefined;
    const animation = from && to && to.width && to.height
      ? node.animate([
        { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
        { transform: 'none' },
      ], { duration, easing, fill: 'both' })
      : node.animate([{ opacity: 0 }, { opacity: 1 }], { duration: duration * .8, delay: duration * .2, easing, fill: 'backwards' });
    const finish = () => {
      animation.cancel();
      delete node.dataset.parallelEntering;
      delete node.dataset.modeMorph;
      media.removeEventListener('change', finish);
      window.removeEventListener('resize', finish);
    };
    animation.onfinish = finish;
    media.addEventListener('change', finish);
    window.addEventListener('resize', finish);
    return finish;
  }, [open, mode, island]);
  const clearMotion = () => { motion.current?.cancel(); wave.current(); motionTimers.current.forEach(clearTimeout); motionTimers.current = []; openingSnapshot.current = Promise.resolve(''); };
  const later = (job: () => void, delay: number) => { motionTimers.current.push(setTimeout(job, delay)); };
  const expandInput = () => {
    if (motionPhase === 'press' || motionPhase === 'opening') return;
    clearMotion(); history.following.current = true;
    if (tasks.some(task => task.status === 'waiting_user')) setReplyVisible(true);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setCollapsed(false); setMotionPhase('open'); later(() => editor.current?.focus({ preventScroll: true }), 0); return; }
    openingSnapshot.current = wb.captureAssistantBackdrop?.().catch(() => '') ?? Promise.resolve('');
    setMotionPhase('press'); later(() => { setCollapsed(false); setMotionPhase('opening'); }, 90);
  };
  const collapseInput = () => {
    if (speechBusy || motionPhase === 'closing') return;
    clearMotion(); setMenu(false); setReplyVisible(false); setMotionPhase('closing');
    const node = inputSurface.current;
    const done = () => { setCollapsed(true); setMotionPhase('closed'); later(() => pill.current?.focus({ preventScroll: true }), 0); };
    if (!node || matchMedia('(prefers-reduced-motion: reduce)').matches) { done(); return; }
    motion.current = node.animate([{ width: `${node.offsetWidth}px`, height: `${node.offsetHeight}px`, borderRadius: '16px' }, { width: `${Math.min(300, node.offsetWidth)}px`, height: '44px', borderRadius: '22px' }], { duration: 320, easing: 'ease-in-out', fill: 'forwards' });
    later(done, 320);
  };
  useLayoutEffect(() => {
    if (!floating || collapsed || motionPhase !== 'opening' || !inputSurface.current) return;
    const node = inputSurface.current;
    if (editor.current) { editor.current.style.height = '0px'; editor.current.style.height = `${Math.min(98, Math.max(40, editor.current.scrollHeight))}px`; }
    const target = node.getBoundingClientRect(), protectedBounds = node.closest('.bot-panel')!.getBoundingClientRect();
    motion.current = node.animate(Array.from({ length: 31 }, (_, index) => { const t = index / 30, p = index === 30 ? 1 : 1 - Math.exp(-8 * t) * Math.cos(6 * t); return { width: `${Math.min(300, target.width) + (target.width - Math.min(300, target.width)) * p}px`, height: `${44 + (target.height - 44) * p}px`, borderRadius: `${22 - 6 * p}px`, offset: t }; }), { duration: 580, easing: 'linear' });
    later(() => { wave.current = playBotOpening(node, openingSnapshot.current, protectedBounds); }, 40);
    later(() => editor.current?.focus({ preventScroll: true }), 190);
    later(() => setMotionPhase('open'), 580);
    later(() => { openingSnapshot.current = Promise.resolve(''); }, 1100);
  }, [collapsed, motionPhase, floating]);
  useLayoutEffect(() => {
    const surface = inputSurface.current, light = glint.current;
    if (open && floating && surface && light && (motionPhase === 'closed' || motionPhase === 'open')) {
      return playBotMarquee(surface, light);
    }
  }, [open, floating, motionPhase]);
  useEffect(() => { if (!open || !floating) { clearMotion(); setMotionPhase(collapsed ? 'closed' : 'open'); } return clearMotion; }, [open, floating]);
  useEffect(() => { const media = matchMedia('(prefers-reduced-motion: reduce)'); const change = () => { if (!media.matches) return; clearMotion(); if (motionPhase === 'closing') setCollapsed(true); setMotionPhase(collapsed || motionPhase === 'closing' ? 'closed' : 'open'); }; media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, [collapsed, motionPhase]);
  useEffect(() => { if (!open) return; return draft.attach(() => render(value => value + 1)); }, [draft, open]);
  useLayoutEffect(() => {
    if (!inspectorView || inspectorView.open) return;
    // A reversed transition must not unmount the reopened inspector.
    const unmount = () => setInspectorView(view => view === inspectorView ? undefined : view);
    const slide = inspectorPanel.current?.getAnimations().find(animation =>
      animation instanceof CSSTransition && animation.transitionProperty === 'transform');
    const reading = inspectorView.workspaceExitWidth === undefined ? null : scroll.current;
    const resize = reading && slide ? new ResizeObserver(followChat) : undefined;
    if (reading) {
      followChat();
      resize?.observe(reading);
    }
    if (slide) void slide.finished.then(unmount, unmount);
    else unmount();
    return () => resize?.disconnect();
  }, [inspectorView, followChat, scroll]);
  useEffect(() => { if (initialPage) {
    if (initialPage.value === 'tasks' || initialPage.value === 'history') { openActivity(initialPage.taskId, initialPage.value === 'history'); return; }
    const tab = initialPage.value === 'profile' ? 'details' : initialPage.value === 'artifacts' ? 'library' : undefined;
    setInspector(tab); setPage(tab ? 'chat' : initialPage.value); setCollapsed(false); setReplyVisible(true); } }, [initialPage, openActivity, setInspector]);
  useEffect(() => {
    let live = true, configUpdated = false, taskTimer: ReturnType<typeof setTimeout> | undefined;
    const sync = new BotChatSynchronizer(bot.mainChatId, wb.bot, value => { if (live) { history.setSnapshot(value); setError(''); } }, cause => { if (live) setError(errorText(cause)); }, () => history.following.current);
    history.sync.current = sync;
    const offUpdates = wb.bot.onChatUpdate(value => sync.receive(value));
    const opened = wb.bot.open(bot.id, history.initialView(floating));
    void sync.start(opened);
    void opened.then(({ bot: profile, history: archived }) => {
      if (live) { setData({ bot: profile, history: archived }); onActiveChatChange?.(profile.mainChatId); }
    }, () => { /* The synchronizer reports the same failure. */ });
    const loadTasks = () => { clearTimeout(taskTimer); taskTimer = setTimeout(() => { void Promise.all([wb.bot.listTasks(bot.id), wb.bot.listArtifacts(bot.id)]).then(([nextTasks, nextArtifacts]) => { if (live) { setTasks(nextTasks); setArtifacts(nextArtifacts); } }, cause => { if (live) setError(errorText(cause)); }); }, 80); };
    void Promise.all([wb.ai.config(), wb.bot.listTasks(bot.id), wb.bot.listArtifacts(bot.id)]).then(([cfg, nextTasks, nextArtifacts]) => { if (!live) return; if (!configUpdated) setConfig(cfg); setTasks(nextTasks); setArtifacts(nextArtifacts); }, cause => { if (live) setError(errorText(cause)); });
    const offChat = wb.ai.onChat(value => { if (value.id === bot.mainChatId && live) void sync.refresh(); });
    const offConfig = wb.ai.onConfigChanged(value => { if (live) { configUpdated = true; setConfig(value); } });
    const off = wb.bot.onChanged(event => { if (event.kind === 'host') { void sync.refresh(); loadTasks(); return; } if (event.kind === 'chat' && event.chatId && event.chatId !== bot.mainChatId) return; if ((!event.botId || event.botId === bot.id) && ['task', 'artifact', 'chat'].includes(event.kind)) { void sync.refresh(); if (event.kind !== 'chat') loadTasks(); } });
    return () => { live = false; clearTimeout(taskTimer); sync.stop(); history.sync.current = null; offUpdates(); off(); offChat(); offConfig(); };
  }, [bot.id, bot.mainChatId, reload]);
  useEffect(() => { if (!referencesOpen || !referenceMode) return; let live = true; setReferenceLoading(true); setReferenceError(''); void loadReferenceOptions(referenceMode).then(value => { if (live) setReferenceOptions(value); }, cause => { if (live) setReferenceError(errorText(cause)); }).finally(() => { if (live) setReferenceLoading(false); }); return () => { live = false; }; }, [referenceMode, referencesOpen, referenceReload]);
  useLayoutEffect(() => { if (page !== 'chat') scroll.current?.scrollTo({ top: 0 }); }, [page]);
  useLayoutEffect(() => { const saved = selections.get(bot.mainChatId); if (saved && editor.current) editor.current.setSelectionRange(saved.start, saved.end); }, [bot.mainChatId, open, collapsed, mode]);
  useEffect(() => {
    if (!menu) return;
    const dismiss = (event: PointerEvent) => { if (!menuRef.current?.contains(event.target as Node)) setMenu(false); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setMenu(false); menuRef.current?.querySelector('button')?.focus(); event.preventDefault(); } };
    window.addEventListener('pointerdown', dismiss); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('pointerdown', dismiss); window.removeEventListener('keydown', key); };
  }, [menu]);
  useLayoutEffect(() => { if (!floating || collapsed || !editor.current) return; editor.current.style.height = '0px'; editor.current.style.height = `${Math.min(98, Math.max(40, editor.current.scrollHeight))}px`; }, [floating, collapsed, open, draft.value.text]);
  useEffect(() => { if (open && !(floating && collapsed) && (!floating || replyVisible) && page === 'chat') void wb.bot.markRead(bot.id).catch(() => {}); }, [bot.id, open, floating, collapsed, replyVisible, page, tasks]);
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setBusy(true); setError(''); try { await job(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } };
  const hasModel = config?.models.some(model => model.id === bot.modelId && config.providers.some(provider => provider.id === model.providerId));
  const modelReady = !!(config?.aiEnabled && hasModel);
  const canSubmit = modelReady || draft.hasPendingSubmit;
  const send = async (override?: AiSeed) => {
    if (submitBusy.current || speechBusy) return;
    submitBusy.current = true; setError('');
    try {
      if (draft.hasPendingSubmit) { await draft.submit(bot.id, undefined); void history.latest(); setPage('chat'); setCollapsed(false); setReplyVisible(true); return; }
      if (!modelReady) throw new Error('请检查 Bot 的模型选择及模型配置');
      const scope = override?.scope ?? context.scope;
      const object: BotResourceRef | undefined = scope.module === 'copy' ? { kind: 'copy', id: scope.draftId, label: context.object } : scope.module === 'bazi' || scope.module === 'reading' ? { kind: scope.module, id: scope.profileId, label: context.object } : undefined;
      if (object && !draft.hasPendingSubmit && !draft.value.resources.some(ref => ref.kind === object.kind && ref.id === object.id)) {
        if (draft.value.resources.length >= 8) throw new Error('引用最多 8 项，请移除一项后发送');
        draft.edit({ resources: [...draft.value.resources, object] });
      }
      const pageContext: AiTurnContext = { scope, pageScope: scope, baziSystem: override?.baziSystem ?? context.baziSystem, copySource: override?.copySource, astroReadingTopic: override?.astroReadingTopic };
      if (scope.module === 'workbench' && ['browser', 'media-browser'].includes(scope.viewId)) pageContext.browserTabId = (await wb.browserAutomation.tabs(scope.viewId === 'media-browser' ? 'xhs-creator' : 'default')).find(tab => tab.active && tab.ready)?.id ?? null;
      const target = override ? undefined : amendmentTarget?.target;
      await draft.submit(bot.id, pageContext, target); setAmendmentTarget(undefined); void history.latest(); setPage('chat'); setCollapsed(false); setReplyVisible(true);
    } catch (cause) { setError(errorText(cause)); } finally { submitBusy.current = false; }
  };
  useEffect(() => {
    if (!seed || usedSeed.current === seed.nonce || !draft.ready || !config) return;
    usedSeed.current = seed.nonce; setCollapsed(false); setReplyVisible(true); setPage('chat');
    if (draft.value.text.trim()) { draft.edit({ text: `${draft.value.text}\n\n${seed.text}`.slice(0, 10000) }); setError('已将工作区请求追加到现有草稿，请检查后发送'); }
    else { draft.edit({ text: seed.text }); if (modelReady) void send(seed); }
    onSeedFinished?.(seed.nonce);
  }, [seed, draft.ready, config, modelReady]);
  const closeInspector = () => {
    setInspector(undefined);
    if (page === 'exchange') {
      requestAnimationFrame(() => exchangeBack.current?.focus({ preventScroll: true }));
      return;
    }
    (floating ? menuRef.current?.querySelector('button') : badge.current)?.focus({ preventScroll: true });
  };
  const returnFromActivity = () => {
    setInspector('details');
    requestAnimationFrame(() => inspectorPanel.current?.querySelector<HTMLElement>('[data-open-activity]')?.focus({ preventScroll: true }));
  };
  const openWorkspace = () => {
    if (workspaceHidden && onOpenWorkspace) prepareWorkspaceResize();
    const profileOpen = !!inspector && inspector !== 'activity';
    if (profileOpen && !island && workspaceHidden && onOpenWorkspace) {
      const workspaceExitWidth = inspectorPanel.current?.parentElement?.getBoundingClientRect().width;
      if (workspaceExitWidth) {
        history.rememberScroll();
        setInspectorView(view => view?.open ? { ...view, workspaceExitWidth } : view);
      }
    }
    if (profileOpen) closeInspector();
    if (island) void run(() => wb.island.navigate({ view: 'home' }));
    else onOpenWorkspace?.();
  };
  const openInspector = (tab: InspectorTab) => {
    setMenu(false);
    if (floating) onMode?.('parallel');
    setInspector(tab);
  };
  const changePage = (next: BotPanelPage, { keepInspector = false }: { keepInspector?: boolean } = {}) => {
    if (next === 'tasks' || next === 'history') { openActivity(undefined, next === 'history'); return; }
    if (next === 'artifacts' || next === 'profile') { openInspector(next === 'artifacts' ? 'library' : 'details'); return; }
    if (!keepInspector) setInspector(undefined);
    setPage(next); setMenu(false); setCollapsed(false); setReplyVisible(true);
    if (next === 'chat') requestAnimationFrame(() => editor.current?.focus({ preventScroll: true }));
  };
  const showExchange = (message: Pick<BotMessage, 'id' | 'fromBotId' | 'toBotId'>) => {
    setExchange(message); changePage('exchange', { keepInspector: !floating });
    requestAnimationFrame(() => exchangeBack.current?.focus({ preventScroll: true }));
  };
  const backFromExchange = () => {
    const id = exchange?.id;
    changePage('chat', { keepInspector: true });
    if (id) requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-bot-event-id="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }));
  };
  const chooseAmendment = (choice: AmendmentChoice) => { setAmendmentTarget(choice); draft.edit({ replyToTaskId: null }); changePage('chat'); };
  const chatActions = (task: BotTask, replyText?: string, entryId?: string, groups?: readonly BotChatEventGroup[]) => isCollaborationTask(task)
    ? <BotCollaborationCard key={entryId ?? task.id} task={task} entryId={entryId} state={collaborations.records.get(task.rootTaskId)} groups={groups} cards={cards} copyBusy={copyBusy} onExchange={showExchange} onAmend={(target, label) => chooseAmendment({ target, label })} onLayout={followChat} onRefresh={() => collaborations.refresh(task.rootTaskId)} onOpenWork={openActivity} />
    : <BotChatActions key={task.id} task={task} cards={cards} copyBusy={copyBusy} open={() => openActivity(task.id)} onLayout={followChat} replyText={replyText} />;
  const reply = (task: BotTask) => { if (task.botId !== bot.id) { onSelectBot?.(task.botId); return; } draft.edit({ replyToTaskId: task.id }); changePage('chat'); editor.current?.focus(); };
  const approvalChat = useMemo(() => chat && { ...chat, entries: [...chat.entries, ...(snapshot?.liveEntries ?? [])] }, [chat, snapshot?.liveEntries]);
  const browserApprovals = useBrowserApprovalTasks(approvalChat ?? null);
  const siteApprovalEntries = useMemo(() => new Map(approvalChat?.entries.flatMap(entry => {
    const task = entry.role === 'assistant' && entry.browserTask ? browserApprovals.tasks[entry.browserTask.id] : undefined;
    const approval = browserSiteApprovalForCard(task);
    return task && approval ? [[task.id, { ...approval, entryId: entry.id }] as const] : [];
  })), [approvalChat, browserApprovals.tasks]);
  const pendingSiteEntries = useMemo(() => new Map([...siteApprovalEntries].flatMap(([id, approval]) =>
    approval.status === 'pending' ? [[id, approval.entryId] as const] : [])), [siteApprovalEntries]);
  const pendingSiteForTask = (task: BotTask) => [...pendingSiteEntries].find(([, entryId]) =>
    entryId === task.assistantEntryId || task.assistantEntryIds?.includes(entryId))?.[0];
  const hasEditor = page !== 'exchange' && (floating || page === 'chat');
  const chooseReferenceMode = (value: string) => { setReferenceMode(value as ReferenceMode); setReferenceOptions([]); };
  const copyBusy = copySaveState?.status !== undefined && copySaveState.status !== 'saved';
  const progress = useMemo(() => groupBotProgress(tasks, [], artifacts, snapshot?.toolReplyIds), [tasks, snapshot?.toolReplyIds, artifacts]);
  const pageTasks = useMemo(() => {
    const latest = new Map(tasks.map(task => [task.id, task]));
    for (const task of snapshot?.pageTasks ?? []) {
      if ((latest.get(task.id)?.revision ?? -1) < task.revision) latest.set(task.id, task);
    }
    return [...latest.values()];
  }, [snapshot?.pageTasks, tasks]);
  const queuedMessages = pageTasks.filter(task => task.chatId === bot.mainChatId && isQueuedBotMessage(task))
    .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  const queuedMessageIds = new Set(queuedMessages.map(task => task.sourceMessageId));
  const steerTarget = pageTasks.find(task => task.chatId === bot.mainChatId && task.rootTaskId === task.id && task.status === 'running');
  const { outcomes, hiddenReplies } = useMemo(() => projectBotTurnOutcomes(
    approvalChat?.entries ?? [], pageTasks.filter(task => task.botId === bot.id && task.chatId === approvalChat?.id),
  ), [approvalChat, pageTasks, bot.id]);
  const renderPromptOutcome = (entryId: string) => {
    const outcome = outcomes.get(entryId);
    if (!outcome) return null;
    const taskId = outcome.taskId;
    return <div className="bot-prompt-outcome"><ResponseProcess outcome={outcome} onOpenWork={taskId ? () => openActivity(taskId) : undefined} /></div>;
  };
  const actionTasks = useMemo(() => pageTasks.filter(task => task.botId === bot.id && task.chatId === bot.mainChatId && (task.operationIds.length || task.dependencyIds.length || task.messageIds?.length)), [pageTasks, bot.id, bot.mainChatId]);
  const locateRecord = async (task: BotTask, conversation: boolean, keyboard: boolean, signal: AbortSignal) => {
    if (task.chatId !== bot.mainChatId) return false;
    let target: Pick<RecordLocation, 'kind' | 'id'> | undefined;
    if (!conversation && task.status === 'waiting_user') {
      const siteTaskId = pendingSiteForTask(task);
      if (siteTaskId) {
        target = { kind: 'action', id: siteTaskId };
      } else if (actionTasks.some(item => item.id === task.id)) {
        target = { kind: 'action', id: task.id };
      }
    }
    if (!target) {
      const ids = conversation ? [task.sourceMessageId] : new Set([task.assistantEntryId, task.latestUserMessageId, task.sourceMessageId]);
      for (const id of ids) {
        if (signal.aborted) return false;
        if (id && await history.findEntry(id, signal, page => id !== task.assistantEntryId
          || !projectBotTurnOutcomes([...page.chat.entries, ...page.liveEntries], [task]).hiddenReplies.has(id))) {
          target = { kind: 'entry', id }; break;
        }
      }
    }
    if (!target || signal.aborted) return false;
    const narrow = !!scroll.current && getComputedStyle(scroll.current).getPropertyValue('--bot-activity-overlay').trim() === '1';
    setRecordLocation({ ...target, taskId: task.id, focus: keyboard || narrow });
    if (narrow) setInspector(undefined);
    return true;
  };
  useLayoutEffect(() => {
    if (!recordLocation || !open || page !== 'chat' || floating) return;
    const { id, kind, focus } = recordLocation;
    const selector = kind === 'entry' ? 'data-chat-entry-id' : 'data-chat-action-id';
    const row = kind === 'entry' ? history.scrollToEntry(id) : undefined;
    const target = row ?? panel.current?.querySelector<HTMLElement>(`[${selector}="${CSS.escape(id)}"]`);
    if (!row) target?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (focus) target?.focus({ preventScroll: true });
  }, [recordLocation, open, page, floating]);
  const taskForEntry = useMemo(() => new Map(actionTasks.flatMap(task => {
    const ids = isCollaborationTask(task) ? task.assistantEntryIds : undefined;
    return (ids ?? (task.assistantEntryId ? [task.assistantEntryId] : [])).map(id => [id, task] as const);
  })), [actionTasks]);
  const incomingForEntry = useMemo(() => new Map(pageTasks.filter(task => task.parentTaskId && task.botId === bot.id && task.chatId === bot.mainChatId && task.assistantEntryId).map(task => [task.assistantEntryIds?.[0] ?? task.assistantEntryId!, task])), [pageTasks, bot.id, bot.mainChatId]);
  const legacyReplyTimes = useMemo(() => new Map(pageTasks.filter(task => task.chatId === chat?.id).flatMap(task => (task.assistantEntryIds ?? (task.assistantEntryId ? [task.assistantEntryId] : [])).map(id => [id, task.createdAt] as const))), [pageTasks, chat?.id]);
  const replyTime = (entry: ChatEntry) => {
    const value = entry.createdAt ?? legacyReplyTimes.get(entry.id);
    if (!value || !Number.isFinite(Date.parse(value))) return <span className="bot-message-time">时间未记录</span>;
    return <time className="bot-message-time" dateTime={value} title={entry.createdAt ? '回复开始时间' : '旧消息未单独记录时间，显示关联请求的时间'}>{replyDateFormat.format(new Date(value))}</time>;
  };
  const visibleAction = (entry: ChatEntry) => {
    const task = taskForEntry.get(entry.id);
    return page === 'chat' && entry.role === 'assistant' && task && !waitingActionIds.has(task.id) ? task : undefined;
  };
  const entryActions = (entry: ChatEntry, before: boolean, groups?: readonly BotChatEventGroup[]) => {
    const task = visibleAction(entry);
    return task && before === collaborationBeforeReply(task) ? chatActions(task, entry.content, entry.id, groups) : null;
  };
  const activeTasks = tasks.filter(task => (!task.parentTaskId || task.status === 'waiting_user') && (
    ['waiting_user', 'waiting_resource'].includes(task.status) ||
    ['queued', 'running', 'waiting_bot'].includes(task.status) && (['delegated', 'routine'].includes(task.kind) || task.operationIds.length > 0 || task.dependencyIds.length > 0)
  )).slice(0, 8).reverse();
  const replying = tasks.some(task => !task.parentTaskId && ['chat', 'work'].includes(task.kind) && task.status === 'running' && !task.operationIds.length && !task.dependencyIds.length && !task.messageIds?.length);
  const quickPrompts = bot.seedKey === 'media' ? ['整理当前文章', '帮我起几个标题'] : bot.seedKey === 'schedule' ? ['看看今天有哪些待办', '整理本周日程'] : ['帮我梳理今天的工作', '看看有哪些负责人'];
  const latestUser = snapshot?.collapsedAt || queuedMessageIds.has(snapshot?.latestUser?.id ?? '')
    ? chat?.entries.slice().reverse().find(entry => entry.role === 'user' && !queuedMessageIds.has(entry.id)) : snapshot?.latestUser;
  const currentTask = tasks.find(task => !task.parentTaskId && task.chatId === bot.mainChatId && ['running', 'waiting_bot'].includes(task.status)) ?? tasks.find(task => (task.latestUserMessageId ?? task.sourceMessageId) === latestUser?.id);
  const floatingPrompt = chat?.entries.find(entry => entry.id === (currentTask?.latestUserMessageId ?? currentTask?.sourceMessageId)) ?? latestUser;
  const floatingQuestion = floatingPrompt?.content;
  const compactReply = floating && page === 'chat';
  const workPage = page === 'schedules';
  const turnEntries = currentTask?.assistantEntryId ? chat?.entries.filter(entry => (currentTask.assistantEntryIds ?? [currentTask.assistantEntryId]).includes(entry.id)) : chat?.entries.slice(latestUser ? chat.entries.findIndex(entry => entry.id === latestUser.id) + 1 : 0).filter(entry => entry.role === 'assistant');
  const renderedEntries = ((compactReply ? turnEntries : chat?.entries) ?? []).filter(entry => !hiddenReplies.has(entry.id) && !queuedMessageIds.has(entry.id));
  const renderedIds = new Set(renderedEntries.map(entry => entry.id));
  const extraLiveEntries = (snapshot?.liveEntries ?? []).filter(entry => !renderedIds.has(entry.id) && !hiddenReplies.has(entry.id));
  const visibleIds = new Set([...renderedIds, ...extraLiveEntries.map(entry => entry.id)]);
  const waitingActions = actionTasks.filter(task => task.status === 'waiting_user' && (!task.assistantEntryId || !visibleIds.has(task.assistantEntryId) || recordLocation?.kind === 'action' && recordLocation.id === task.id));
  const waitingActionIds = new Set(waitingActions.map(task => task.id));
  const detachedActions = actionTasks.filter(task => !task.assistantEntryId && !waitingActionIds.has(task.id) && (!compactReply || task.id === currentTask?.id));
  const roots = new Set<string>();
  if (open) {
    for (const entry of [...renderedEntries, ...extraLiveEntries]) {
      const task = taskForEntry.get(entry.id), incoming = incomingForEntry.get(entry.id);
      if (task && isCollaborationTask(task)) roots.add(task.rootTaskId);
      if (incoming && !entry.receivedBotMessages?.some(message => message.id === incoming.sourceMessageId)) roots.add(incoming.rootTaskId);
    }
    for (const task of [...waitingActions, ...detachedActions]) if (isCollaborationTask(task)) roots.add(task.rootTaskId);
  }
  const collaborations = useChatCollaborations(roots);
  const siteApprovalKey = JSON.stringify([...siteApprovalEntries.values()]);
  useLayoutEffect(() => followChat(), [collaborations.records, siteApprovalKey, browserApprovals.error, queuedMessages.length, followChat]);
  const incomingEvents = (entry: ChatEntry, readOnly = false) => {
    const links = entry.receivedBotMessages ?? [];
    const task = readOnly ? undefined : incomingForEntry.get(entry.id);
    const state = task && collaborations.records.get(task.rootTaskId);
    const source = task && state?.detail?.messages.find(message => message.id === task.sourceMessageId && message.toBotId === task.botId);
    const unresolved = task && !source && !links.some(message => message.id === task.sourceMessageId);
    const messages = source && !links.some(message => message.id === source.id) ? [...links, source] : links;
    return { events: messages.map(message => ({ message, incoming: true })), unresolved, fallback: unresolved && (state?.detail || state?.error) ? task : undefined };
  };
  const timeline: (BotChatEventSlot | null)[] = [];
  const eventOnlyEntries = new Map<string, number>();
  for (const entry of chat?.entries ?? []) {
    if (!renderedIds.has(entry.id)) { timeline.push(null); continue; }
    const incoming = incomingEvents(entry), task = visibleAction(entry);
    const before = task && collaborationBeforeReply(task);
    const state = task && isCollaborationTask(task) ? collaborations.records.get(task.rootTaskId) : undefined;
    const projected = task && state?.detail ? projectBotCollaboration(task, state.detail, entry.id) : undefined;
    const card: (BotChatEventSlot | null)[] = [];
    if (projected) card.push({ id: `task:${entry.id}`, events: projected.events });
    const hasAction = task && (!projected || projected.actions.length || projected.blocked.length || state?.error);
    if (hasAction) card.push(null);
    timeline.push({ id: `received:${entry.id}`, events: incoming.events });
    if (incoming.unresolved) timeline.push(null);
    if (before) timeline.push(...card);
    const hasReply = entry.role === 'user' || entry.content.trim() || entry.streaming || entry.error || outcomes.has(entry.id) || entry.browserTask || entry.copySource || entry.actionState === 'pending';
    if (hasReply) timeline.push(null);
    if (!before) timeline.push(...card);
    const eventCount = incoming.events.length + (projected?.events.length ?? 0);
    if (eventCount && !hasReply && !entry.thinking?.trim() && !entry.tools?.length && !hasAction && !incoming.unresolved) {
      eventOnlyEntries.set(entry.id, eventCount);
    }
  }
  const eventGroups = groupBotChatEvents(timeline);
  const waitingNotices = tasks.filter(task => {
    if (task.status !== 'waiting_user' || task.chatId !== bot.mainChatId || actionTasks.includes(task)) return false;
    // The browser can settle an approval before the Bot task leaves waiting_user.
    return !approvalChat?.entries.some(entry => entry.browserTask
      && (entry.id === task.assistantEntryId || task.assistantEntryIds?.includes(entry.id))
      && browserApprovals.tasks[entry.browserTask.id]?.status !== 'paused');
  });
  const hasFloatingReply = !!(floatingQuestion || turnEntries?.length || activeTasks.length || extraLiveEntries.length || pendingSiteEntries.size || snapshot?.collapsedAt);
  const replyHidden = floating && (inspector === 'activity' || collapsed || !replyVisible || !hasFloatingReply && page === 'chat');
  const collapseHistoryDisabled = history.loading || !snapshot?.lastEntryId || snapshot.collapsedAt === snapshot.lastEntryId;
  const collapseItem = <button disabled={collapseHistoryDisabled} onClick={() => {
    setMenu(false); menuRef.current?.querySelector('button')?.focus({ preventScroll: true }); setReplyVisible(true); void history.collapseHistory();
  }}>收起历史消息</button>;
  const taskNotice = (task: BotTask) => <button key={task.id} type="button" className="bot-task-notice" data-status={task.status} aria-label={`${botStatusLabel[task.status]}：${task.title}，查看详情`} onClick={() => openActivity(task.id)}>
    <span><strong>{botStatusLabel[task.status]}</strong><span>{task.title}</span></span><ArrowRight size={16} aria-hidden="true" />
  </button>;
  const needsModelSelection = config?.aiEnabled && config.models.length > 0 && !hasModel;
  const missingModelTitle = bot.modelId ? '此 Bot 的模型不可用' : '此 Bot 尚未选择模型';
  const modelNotice = config && !modelReady && <div className="bot-config-hint">
    <Power size={19} aria-hidden="true" />
    <div role="status">
      <strong>{needsModelSelection ? missingModelTitle : '尚未配置对话模型'}</strong>
      <p>可先写草稿，配置后发送</p>
    </div>
    <button type="button" onClick={needsModelSelection ? () => openInspector('details') : onOpenSettings}>
      {needsModelSelection ? '选择模型' : '前往模型配置'}<ArrowRight size={15} aria-hidden="true" />
    </button>
  </div>;
  const messageQueue = <BotMessageQueue key={bot.id} items={queuedMessages} active={steerTarget} onChange={wb.bot.changeQueuedMessage}
    focusComposer={() => editor.current?.focus({ preventScroll: true })} />;
  const compose = <div className="bot-compose" ref={composer}>
        {amendmentTarget && <div className="bot-reply-target"><span>{`补充：${amendmentTarget.label}`}</span><button type="button" onClick={() => setAmendmentTarget(undefined)}>作为新工作发送</button></div>}
        {floating && <div className="bot-floating-tools" role="group" aria-label="悬浮对话操作">
          {draft.value.replyToTaskId && <span>回复：{tasks.find(task => task.id === draft.value.replyToTaskId)?.title ?? '当前任务'}</span>}
          <IconButton label="固定对话面板" onClick={() => {
            onMode?.('parallel');
            requestAnimationFrame(() => editor.current?.focus({ preventScroll: true }));
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 18H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4M7.5 12V8h4m-4 0 4 4" />
              <rect x="11.5" y="13" width="9.5" height="7" rx="2" />
            </svg>
          </IconButton>
          {hasFloatingReply && inspector !== 'activity' && (compactReply || !replyVisible) &&
            <IconButton label={replyVisible ? '收起对话' : '展开对话'} aria-expanded={replyVisible} aria-controls="bot-reply-surface"
              onClick={() => setReplyVisible(visible => !visible)}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="3.5" y="3.5" width="17" height="17" rx="2.25" />
                <path d={replyVisible ? 'M8 10l4 4 4-4' : 'M8 14l4-4 4 4'} />
              </svg>
            </IconButton>}
          <IconButton label="收起输入框" disabled={speechBusy} onClick={collapseInput}><MinusSquare size={18} aria-hidden="true" /></IconButton>
        </div>}
        {!!draft.value.resources.length && <div className="bot-reference-chips">{draft.value.resources.map(ref => <span key={`${ref.kind}:${ref.id}`}><Paperclip size={12} /><span title={ref.label || ref.id}>{ref.label || `${ref.kind} · ${ref.id.slice(0, 8)}`}</span><IconButton label={`移除引用 ${ref.label || ref.id}`} disabled={!draft.ready} onClick={() => draft.edit({ resources: draft.value.resources.filter(item => item !== ref) })}><X size={12} /></IconButton></span>)}</div>}
        {draft.value.replyToTaskId && !floating && <div className="bot-reply-target"><span>回复：{tasks.find(task => task.id === draft.value.replyToTaskId)?.title ?? '当前任务'}</span><IconButton label="取消回复任务" onClick={() => draft.edit({ replyToTaskId: null })}><X size={13} /></IconButton></div>}
        <textarea ref={editor} rows={floating ? 2 : 3} maxLength={10000} aria-label={`给${bot.name}发送消息`} value={draft.value.text} onSelect={event => { const node = event.currentTarget; selections.set(bot.mainChatId, { start: node.selectionStart, end: node.selectionEnd }); }} placeholder={`给${bot.name}发送消息…`} onChange={event => draft.edit({ text: event.target.value })} onCompositionStart={() => draft.composition(true)} onCompositionEnd={() => draft.composition(false)} onKeyDown={event => { if (canSubmit && event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(); } }} />
        <div className="bot-compose-toolbar"><button type="button" className="ibtn" ref={referenceTrigger} aria-label="选择参考内容" disabled={!draft.ready || !referenceMode} onClick={() => setReferencesOpen(!referencesOpen)}><Plus size={18} /></button><SpeechInput anchor={composer} contextKey={bot.mainChatId} draft={draft.value.text} onChange={text => draft.edit({ text })} enabled={draft.ready} visible={open && !(floating && collapsed)} onBusyChange={setSpeechBusy} />
          <button className="bot-send" aria-label={draft.hasPendingSubmit ? '核对发送结果' : '发送'} title={draft.hasPendingSubmit ? '使用原请求标识核对，不会重复提交' : '发送'} disabled={!canSubmit || draft.sending || speechBusy || !draft.hasPendingSubmit && !draft.value.text.trim()} onClick={() => void send()}><PaperPlaneRight size={18} weight="fill" /></button>
        </div>
        {floating && (draft.sending || draft.hasPendingSubmit) && <p className="bot-floating-save" role="status">{draft.sending ? '正在发送…' : '发送结果待核对，请重试'}</p>}

        {draft.error && <div className="bot-error" role="alert">{draft.error}<div className="bot-action-buttons"><button onClick={() => void run(() => navigator.clipboard.writeText(draft.value.text))}>复制本地输入</button><button disabled={draft.hasPendingSubmit || draft.sending} onClick={() => void run(() => draft.retrySave())}>重试保存当前输入</button></div></div>}
      </div>;
  const renderEntry = (entry: ChatEntry, readOnly = false, grouped = false) => {
    const outcome = (!readOnly ? outcomes.get(entry.id) : undefined) ?? botEntryOutcome(entry);
    const outcomeTaskId = outcome?.taskId;
    const browserTask = entry.browserTask ? browserApprovals.tasks[entry.browserTask.id] : undefined;
    const siteApproval = !readOnly && browserTask ? siteApprovalEntries.get(browserTask.id) : undefined;
    const incoming = incomingEvents(entry, readOnly);
    const received = grouped ? eventGroups.get(`received:${entry.id}`) ?? [] : incoming.events.map(event => ({ ...event, count: 1 }));
    const groups = grouped ? eventGroups.get(`task:${entry.id}`) ?? [] : undefined;
    const incomingNotices = received.map(event => <BotMessageEvent key={event.message.id} event={event} cards={cards} onExchange={showExchange} />);
    const eventCount = grouped ? eventOnlyEntries.get(entry.id) : undefined;
    if (eventCount !== undefined && (
      received.length + (groups?.length ?? 0) < eventCount ||
      received.some(event => event.count > 1) || groups?.some(event => event.count > 1)
    )) {
      return <Fragment key={entry.id}>{incomingNotices}{entryActions(entry, true, groups)}{entryActions(entry, false, groups)}</Fragment>;
    }
    return <Fragment key={entry.id}>
      {incomingNotices}
      {incoming.fallback && <BotIncomingMessage task={incoming.fallback} cards={cards} onExchange={showExchange} onLayout={followChat} />}
      <article className={`bot-chat-entry ${entry.role}`}>{entry.role === 'assistant' && <BotAvatar avatar={bot.avatar} small />}<div>{entry.role === 'assistant' && <header className="bot-message-meta"><strong className="bot-message-name">{bot.name}</strong>{replyTime(entry)}</header>}{!readOnly && entryActions(entry, true, groups)}{entry.role === 'user' ? <><p className="bot-user-bubble">{entry.content}</p>{!readOnly && renderPromptOutcome(entry.id)}</> : <>
        <AiResponse entry={entry} showTimeline browserTask={browserTask} outcome={outcome}
          onOpenWork={outcomeTaskId && !readOnly ? () => openActivity(outcomeTaskId) : undefined} />
        {browserTask && siteApproval?.entryId === entry.id && <BrowserSiteApprovalCard key={`${browserTask.id}:${siteApproval.origin}`} task={browserTask} inline
          located={recordLocation?.kind === 'action' && recordLocation.id === browserTask.id}
          onTask={task => browserApprovals.update(task, siteApproval.origin)} />}
      </>}{entry.copySource && onLocateCopySource && <button className="ai-source-chip" title={entry.copySource.text} onClick={() => onLocateCopySource(entry.copySource!)}>引用原文 · 定位</button>}{entry.role === 'assistant' && entry.baziSystem === 'bazi' && entry.content.includes('日主') && entry.contextScope?.module === 'bazi' && onLocateBaziDay && <button className="ai-source-chip" onClick={() => { if (entry.contextScope?.module === 'bazi') onLocateBaziDay(entry.contextScope.profileId); }}>在盘面中定位日主</button>}{!readOnly && entryActions(entry, false, groups)}</div></article>
    </Fragment>;
  };
  const library = <>
    <div className="bot-artifacts-surface" hidden={!!sourceTaskId}>
      <BotArtifactsView artifacts={artifacts} cards={cards} selectedId={artifactId} onSelect={setArtifactId} onTask={id => {
        artifactTaskReturn.current = document.activeElement as HTMLElement; setSourceTaskId(id);
        requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('.bot-work-source-task')?.focus());
      }} onOpenResource={onOpenResource} onExternalPreview={island ? artifact => void run(() => wb.island.navigate({ view: 'home', artifactId: artifact.id })) : undefined} />
    </div>
    {sourceTaskId && <div className="bot-work-source-task" tabIndex={-1} aria-label="来源任务"><BotTaskDetail key={sourceTaskId} taskId={sourceTaskId} cards={cards} back={() => {
      setSourceTaskId(undefined); requestAnimationFrame(() => artifactTaskReturn.current?.focus({ preventScroll: true }));
    }} backLabel="返回资料库" embedded reply={reply} copyBusy={copyBusy} /></div>}
  </>;
  const activity = inspectorView?.tab === 'activity' && <BotActivity key={activityStart.key} ref={embeddedActivity ? null : inspectorPanel}
    active={inspectorView.open} embedded={embeddedActivity} progress={progress} history={data?.history} cards={cards}
    initialTaskId={activityStart.taskId} historyFirst={activityStart.historyFirst} close={closeInspector} onProfile={floating ? undefined : returnFromActivity}
    onLocate={embeddedActivity ? locateRecord : undefined} chatLoading={history.loading} locatedTaskId={recordLocation?.taskId}
    reply={reply} copyBusy={copyBusy} renderEntry={entry => renderEntry(entry, true)} canReference={draft.ready && draft.value.resources.length < 8}
    onReference={archive => {
      if (!draft.value.resources.some(ref => ref.kind === 'chat' && ref.id === archive.id)) draft.edit({ resources: [...draft.value.resources, { kind: 'chat', id: archive.id, label: archive.title }] });
      closeInspector(); requestAnimationFrame(() => editor.current?.focus({ preventScroll: true }));
    }} />;
  if (!open) return null;
  return <section ref={panel} id="workbench-ai-panel" className={`bot-panel${floating ? ' bot-floating' : ''}${island ? ' bot-island' : ''}`} data-inspector={inspector || undefined} data-task-visible={floating && workPage || undefined} data-work-page={workPage || undefined} data-exchange={page === 'exchange' || undefined} data-collapsed={floating && collapsed} data-reply-visible={replyVisible} data-phase={floating ? motionPhase : undefined} onKeyDown={event => { if (floating && !collapsed && event.key === 'Escape' && !event.defaultPrevented && !menu && !referencesOpen) { event.preventDefault(); collapseInput(); } }} aria-label={`${bot.name}的对话`}>
    {!floating && !island && <div className="bot-resizer" role="separator" aria-label="调整对话宽度" aria-orientation="vertical" tabIndex={0} aria-valuemin={340} aria-valuemax={560} aria-valuenow={width} onKeyDown={event => { if (['ArrowLeft', 'ArrowRight'].includes(event.key)) { event.preventDefault(); onWidthChange?.(Math.max(340, Math.min(560, width + (event.key === 'ArrowRight' ? 20 : -20)))); } }} onPointerDown={event => { const start = event.clientX; event.currentTarget.setPointerCapture(event.pointerId); const move = (moveEvent: PointerEvent) => onWidthChange?.(Math.max(340, Math.min(560, width + moveEvent.clientX - start))); const stop = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); }; window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop, { once: true }); }} />}
    <div className="bot-conversation-column">
      <div id="bot-reply-surface" className="bot-reply-surface" data-compact={compactReply || undefined} data-attention={compactReply && (actionTasks.some(task => task.status === 'waiting_user') || pendingSiteEntries.size > 0) || undefined} hidden={replyHidden} inert={replyHidden}>
        {page === 'exchange' && exchange ? <header className="bot-panel-header bot-exchange-header"><button ref={exchangeBack} className="bot-text-button" onClick={backFromExchange}><ArrowLeft size={16} />返回对话</button><strong><BotAvatar avatar={cards.find(card => card.id === exchange.fromBotId)?.avatar ?? bot.avatar} small />{cards.find(card => card.id === exchange.fromBotId)?.name} ⇄ <BotAvatar avatar={cards.find(card => card.id === exchange.toBotId)?.avatar ?? bot.avatar} small />{cards.find(card => card.id === exchange.toBotId)?.name}</strong></header> : workPage ? <header className="bot-panel-header bot-work-header"><button className="bot-text-button bot-work-chat-back" aria-label="返回对话" title="返回对话" onClick={() => changePage('chat')}><ArrowLeft size={16} /><span>返回对话</span></button><strong>定时任务</strong><div className="bot-work-header-context">{floating && <IconButton label="收起答复" onClick={() => { setReplyVisible(false); editor.current?.focus(); }}><X size={16} /></IconButton>}</div></header> : (!floating || currentTask?.status === 'running') && <header className="bot-identity-bar">
          {!floating && <button className="bot-identity-pill" type="button" ref={badge} title={inspector ? '收起 Bot 侧栏' : '展开 Bot 侧栏'} aria-label={`${bot.name}的 Bot 资料`} aria-controls="bot-inspector" aria-expanded={!!inspector} onClick={() => inspector ? closeInspector() : openInspector('details')}><BotAvatar avatar={bot.avatar} small /><strong>{bot.name}</strong><CaretRight size={14} weight="bold" aria-hidden="true" /></button>}
          <div className="bot-header-actions">
            {island && <div className="bot-history-menu" ref={menuRef}><IconButton label="对话更多操作" aria-expanded={menu} onClick={() => setMenu(!menu)}><DotsThree size={21} /></IconButton>{menu && <div className="bot-more-menu">{collapseItem}</div>}</div>}
            {!floating && !island && <div className="bot-chat-tools" role="group" aria-label="对话快捷操作">
              <IconButton label={workspaceHidden ? '打开工作台' : '悬浮对话面板'}
                aria-controls={workspaceHidden ? 'bot-workspace' : undefined}
                onClick={workspaceHidden ? openWorkspace : () => {
                  onMode?.('floating');
                  requestAnimationFrame(() => (pill.current ?? editor.current)?.focus({ preventScroll: true }));
                }}>
                {workspaceHidden ? <SidebarSimple size={18} mirrored aria-hidden="true" /> :
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 7H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-4" />
                    <rect x="10.5" y="3.5" width="10.5" height="8" rx="2" />
                  </svg>}
              </IconButton>
              <span aria-hidden="true" />
              <IconButton label="收起历史消息" disabled={collapseHistoryDisabled} onClick={() => {
                scroll.current?.focus({ preventScroll: true });
                void history.collapseHistory();
              }}><ListBullets size={18} aria-hidden="true" /></IconButton>
            </div>}
            {floating && currentTask?.status === 'running' && <IconButton label="停止回复" disabled={busy} onClick={() => void run(() => wb.bot.cancelTask(currentTask.id, currentTask.revision))}><Square size={13} weight="fill" /></IconButton>}
        </div></header>}
        <div className="bot-chat-scroll" ref={scroll} role="region" aria-label={workPage ? '定时任务' : page === 'exchange' ? '协作对话' : '对话内容'} tabIndex={0} onScroll={history.onScroll}>
          {page === 'exchange' && exchange ? <BotExchangeView botA={exchange.fromBotId} botB={exchange.toBotId} anchorMessageId={exchange.id} cards={cards} /> : page === 'schedules' ? <><button className="bot-text-button" onClick={() => changePage('tasks')}><ArrowLeft size={15} />返回工作列表</button><BotSchedules key={bot.id} botId={bot.id} botName={bot.name} /></> : <>
            {snapshot?.collapsedAt && <div className="bot-history-line">已收起之前的消息 <span aria-hidden="true">·</span> <button className="bot-text-button" aria-label="查看已收起的消息" disabled={history.loading} onClick={() => void history.revealHistory()}>查看</button></div>}
            {!compactReply && snapshot?.hasEarlier && <button className="bot-text-button bot-history-page" disabled={history.loading} onClick={() => void history.turnPage('older', true)}>查看更早消息</button>}
            {compactReply && floatingQuestion && <p className="bot-floating-question" title={floatingQuestion}>{floatingQuestion}</p>}{compactReply && floatingPrompt && renderPromptOutcome(floatingPrompt.id)}{!chat && <p className="bot-empty" role="status">正在读取对话…</p>}{!floating && chat && !snapshot?.lastEntryId && <div className="bot-chat-empty"><BotAvatar avatar={bot.avatar} /><h3>和{bot.name}开始工作</h3><p>{bot.description}。把想做的事告诉我，我们从这里继续。</p><div>{quickPrompts.map(text => <button key={text} disabled={!draft.ready} onClick={() => { draft.edit({ text }); editor.current?.focus(); }}>{text}</button>)}</div></div>}
            {renderedEntries.map(entry => <div data-chat-entry-id={entry.id} data-located={recordLocation?.kind === 'entry' && recordLocation.id === entry.id || undefined} key={entry.id} tabIndex={-1}>{renderEntry(entry, false, true)}</div>)}
            {!compactReply && snapshot?.hasLater && <button className="bot-text-button bot-history-page" disabled={history.loading} onClick={() => void history.turnPage('newer', true)}>查看较新消息</button>}
            {extraLiveEntries.map(entry => <div key={entry.id} data-chat-entry-id={entry.id} data-located={recordLocation?.kind === 'entry' && recordLocation.id === entry.id || undefined} tabIndex={-1}>{renderEntry(entry)}</div>)}
            {replying && !renderedEntries.some(entry => entry.streaming) && !extraLiveEntries.some(entry => entry.streaming) && <p className="bot-chat-progress" role="status">正在回复…</p>}
            {detachedActions.map(task => chatActions(task))}
            {activeTasks.filter(task => task.status !== 'waiting_user' && !task.dependencyIds.length && !task.messageIds?.length).map(taskNotice)}
            {waitingActions.map(task => <div key={task.id} data-chat-action-id={task.id} data-located={recordLocation?.kind === 'action' && recordLocation.id === task.id || undefined} tabIndex={-1}>{chatActions(task)}</div>)}
            {waitingNotices.map(taskNotice)}
            {browserApprovals.error && <p className="bot-error" role="alert">{browserApprovals.error}<button onClick={browserApprovals.retry}>重试</button></p>}
          </>}
        </div>
        {aboveBottom && !compactReply && page === 'chat' && <button className="bot-jump-latest" disabled={history.loading} onClick={() => { setRecordLocation(undefined); scroll.current?.focus({ preventScroll: true }); void history.latest(); }}><ArrowDown size={15} />回到底部</button>}
      </div>

      {floating && inspector !== 'activity' && !collapsed && !hasFloatingReply && <div className="bot-floating-suggestions">{quickPrompts.map(text => <button key={text} disabled={!draft.ready} onClick={() => { draft.edit({ text }); editor.current?.focus(); }}>{text}</button>)}</div>}
      {floating && page !== 'exchange' && <>
        {!collapsed && motionPhase !== 'opening' && motionPhase !== 'closing' && modelNotice}
        <div className="bot-compose-stack">
          {!collapsed && messageQueue}
          <div className="bot-floating-input-surface" ref={inputSurface}>
            {collapsed ? <button className="bot-floating-pill" ref={pill} aria-label={`展开与${bot.name}的对话`} aria-expanded="false" onClick={expandInput}><Sparkle size={19} /><span>{draft.value.text.trim() || `问问${bot.name}…`}</span>{tasks.some(task => task.status === 'waiting_user') ? <span className="bot-pill-count">待确认 {tasks.filter(task => task.status === 'waiting_user').length}</span> : <span className="bot-pill-hint">AI</span>}</button> : compose}
            <span className="bot-metal-edge" aria-hidden="true" /><span ref={glint} className="bot-glint" aria-hidden="true"><StarFour size={12} weight="fill" /></span>
          </div>
        </div>
      </>}
      {!floating && hasEditor && <>{modelNotice}<div className="bot-compose-stack">{messageQueue}{compose}</div></>}
    </div>
    {inspectorView && (!floating || inspectorView.tab === 'activity' && !collapsed) && <div className="bot-inspector-clip" data-view={inspectorView.tab} data-retained={inspectorView.retained || undefined} data-workspace-exit={inspectorView.workspaceExitWidth !== undefined || undefined}
      style={{ width: inspectorView.workspaceExitWidth }} inert={!inspectorView.open}>
      {activity && !embeddedActivity ? activity : <BotProfile ref={inspectorPanel} key={initialPage?.value === 'profile' ? initialPage.nonce : undefined} card={bot} profile={data?.bot} config={config} tab={inspectorView.tab === 'library' ? 'library' : 'details'} expanded={inspectorView.open || inspectorView.workspaceExitWidth !== undefined} focusOnOpen={!inspectorView.retained || initialPage?.value === 'profile'} onTab={setInspector} close={closeInspector} onSettings={onOpenSettings} activity={activity}
        onSaved={profile => setData(current => current && { ...current, bot: profile })} onReload={() => setReload(value => value + 1)} library={library}
        onManageInMain={island ? () => void run(() => wb.island.navigate({ view: 'home', botPanel: 'details' })) : undefined}
        onWorkspace={openWorkspace} onActivity={() => openActivity()} />}
    </div>}
    {error && <div className="bot-error bot-panel-error" role="alert">{error}<button onClick={() => { setReload(value => value + 1); void draft.refresh(); }}>重新读取</button><IconButton label="收起提示" onClick={() => setError('')}><X size={13} /></IconButton></div>}
    {referencesOpen && <AiReferencePicker id="bot-reference-picker" mode={referenceMode} modeOptions={bot.seedKey === 'coordinator' ? ['todo', 'copy', 'bazi', 'reading'] : bot.seedKey === 'utilities' ? ['bazi', 'reading'] : referenceMode ? [referenceMode] : []} onModeChange={chooseReferenceMode} unavailable="这个 Bot 没有可选业务对象" options={referenceOptions} selected={draft.value.resources.map(asAiRef).filter((item): item is AiReference => !!item && item.module === referenceMode)} loading={referenceLoading} error={referenceError} notice="选择的资料仅用于本次任务" anchor={composer} trigger={referenceTrigger} onChange={refs => { const retained = draft.value.resources.filter(ref => ref.kind !== referenceMode); const next = refs.map(value => ({ ...asRef(value), label: referenceOptions.find(option => JSON.stringify(option.reference) === JSON.stringify(value))?.title })); if (retained.length + next.length > 8) { setReferenceError('最多选择 8 项参考内容'); return; } draft.edit({ resources: [...retained, ...next] }); }} onRetry={() => setReferenceReload(value => value + 1)} onClose={() => { setReferencesOpen(false); referenceTrigger.current?.focus(); }} />}
  </section>;
}
