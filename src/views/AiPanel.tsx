import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaretDown, DotsThree, GearSix, Info, MagnifyingGlass, PaperPlaneRight, Plus, PushPin, SidebarSimple, Sparkle, Stop, Trash, X } from '@phosphor-icons/react';
import { IconCheckSquare, IconGamepad, IconHome, IconMoon, IconVideo, IconWeb } from '../icons';
import type { AIAction, AIModel, AIProvider, ChatSession, ChatSummary, CopySource, RlcdModel, RlcdProvider } from '../../shared/todo-contracts';
import { aiScopeKey, chatContextScope, chatScope, defaultAiScopeForWorkbench, sameAiWorkbench, TODO_AI_WORKBENCH_NAME, workbenchForScope, type AiScope } from '../../shared/ai-scope';
import type { CopyStoreData } from '../../shared/copy-contracts';
import type { BaziStoreData } from '../../shared/bazi-contracts';
import { errorText, Modal, Select as TodoSelect } from '../../modules/todo/ui/ui';
import { scheduleStamp } from '../../shared/todo-format';
import { AiResponse } from './AiResponse';
import { NAV } from '../nav';

const wb = window.workbench;
/** ⓘ 悬浮说明:每个工作台一段固定文案,不拼接 */
const SCOPE_TIPS: Record<string, string> = {
  copy: 'AI 能看到这篇博客的正文;它建议的修改,你确认后才会写入。',
  bazi: 'AI 能看到当前命例的命盘(八字 / 紫微 / 占星),只做解读,不会改任何数据。',
  todo: 'AI 可以查看和整理你的待办与日程;任何修改都会先征求你同意。',
};
const SCOPE_TIP_DEFAULT = 'AI 在这里只回答一般问题,不会读取你的文件内容。';
const workspaceKey = (scope: AiScope): string => workbenchForScope(scope) ?? aiScopeKey(scope);
export interface AiConfig {
  aiEnabled: boolean; providers: AIProvider[]; models: AIModel[];
  activeModelId: string; hasConnection: boolean;
  rlcdProviders: RlcdProvider[]; rlcdModels: RlcdModel[]; activeRlcdModelId: string;
}
export interface AiPanelContext {
  scope: AiScope; label: string; object: string;
  baziSystem?: 'bazi' | 'ziwei' | 'astro';
}
export interface AiSeed {
  text: string; nonce: number; scope: AiScope; baziSystem?: AiPanelContext['baziSystem']; copySource?: CopySource;
}
const COPY_QUICK_ACTIONS = [
  { label: '帮我成稿', prompt: '根据我们聊过的内容和当前草稿,帮我写一版可以直接发布的正文;材料不够就先问我。' },
  { label: '去 AI 味', prompt: '把当前正文去掉 AI 味:信息一条不丢,清掉模型腔和翻案句,改完用工具提交完整新版。' },
  { label: '润色', prompt: '润色当前正文:只顺句子删冗余,不动结构和声口,用工具提交完整新版。' },
  { label: '起标题', prompt: '根据正文内容,用工具逐个提交 6 个标题候选。' },
];
type ChatChoice = { id: string; title: string; group: string; detail: string; updatedAt: string; status?: 'running' | 'done'; streaming?: boolean };
type ChatGroup = { id: string; label: string; emptyScope: AiScope | null };
type ReferenceOption = { scope: AiScope; title: string; detail: string };

function ChatDeleteButton({ title, streaming, className, showLabel, onDelete }: { title: string; streaming?: boolean; className: string; showLabel?: boolean; onDelete(): Promise<void> }) {
  const button = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  useEffect(() => {
    if (!confirming || deleting) return;
    const cancel = (event: PointerEvent): void => {
      if (!button.current?.contains(event.target as Node)) { setConfirming(false); setDeleteError(''); }
    };
    document.addEventListener('pointerdown', cancel);
    return () => document.removeEventListener('pointerdown', cancel);
  }, [confirming, deleting]);
  return <button ref={button} type="button" className={`${className}${confirming ? ' ai-delete-confirm' : ''}`}
    aria-label={`${confirming ? deleteError ? '重试删除对话' : '确认删除对话' : '删除对话'}：${title}`}
    title={streaming ? '请先停止生成' : deleteError || (confirming ? '再次点击将删除此对话' : '删除')}
    disabled={streaming || deleting} onBlur={() => { if (!deleting) { setConfirming(false); setDeleteError(''); } }}
    onClick={() => {
      if (!confirming) { setConfirming(true); return; }
      setDeleting(true); setDeleteError('');
      void onDelete().then(() => { setConfirming(false); setDeleting(false); }, error => { setDeleteError(errorText(error)); setDeleting(false); });
    }}>
    {confirming ? deleting ? '删除中…' : deleteError ? '重试删除' : '确认删除' : showLabel ? '删除' : <Trash size={15} />}
  </button>;
}

function ChatPicker({ currentId, workbenchName, groups, choices, onNew, onOpen, onRename, onDelete }: {
  currentId?: string; workbenchName: string; groups: ChatGroup[]; choices: ChatChoice[]; onNew(scope?: AiScope): void; onOpen(id: string): void;
  onRename(chat: ChatChoice): void; onDelete(id: string): Promise<void>;
}) {
  const menuId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const actionMenu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filterId, setFilterId] = useState('all');
  const [actions, setActions] = useState<{ id: string; left: number; top: number } | null>(null);
  const selected = choices.find(chat => chat.id === currentId);
  const activeFilter = filterId === 'all' || groups.some(group => group.id === filterId) ? filterId : 'all';
  const searchText = query.trim().toLocaleLowerCase('zh-CN');
  const matches = [...choices].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).filter(chat =>
    (activeFilter === 'all' || groups.find(group => group.id === activeFilter)?.label === chat.group) &&
    (!searchText || `${chat.title} ${chat.group} ${chat.detail}`.toLocaleLowerCase('zh-CN').includes(searchText)));
  const recent = matches.slice(0, 4);
  if (!searchText && activeFilter === 'all' && selected && !recent.some(chat => chat.id === selected.id)) recent[3] = selected;
  const visibleChoices = searchText || activeFilter !== 'all' ? matches : recent;
  const emptyGroup = groups.find(group => group.id === activeFilter);
  const reset = (): void => { setOpen(false); setActions(null); setQuery(''); setFilterId('all'); };
  const close = (): void => { reset(); trigger.current?.focus(); };
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const list = menu.current;
    const rect = trigger.current.getBoundingClientRect();
    const panel = trigger.current.closest('.ai-panel')?.getBoundingClientRect();
    list.style.width = `${Math.min(320, (panel?.right ?? window.innerWidth) - rect.left - 12, window.innerWidth - rect.left - 8)}px`;
    const top = rect.bottom + 4 + list.offsetHeight <= window.innerHeight - 8 ? rect.bottom + 4 : Math.max(8, rect.top - list.offsetHeight - 4);
    list.style.top = `${top}px`;
    list.style.left = `${rect.left}px`;
    list.classList.toggle('is-up', top < rect.bottom);
    list.querySelector<HTMLInputElement>('.ai-context-search input')?.focus();
  }, [open]);
  useLayoutEffect(() => { if (actions) actionMenu.current?.querySelector<HTMLButtonElement>('button')?.focus(); }, [actions]);
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;
      if (trigger.current?.contains(target) || menu.current?.contains(target) || actionMenu.current?.contains(target) || document.querySelector('.ai-context-filter-menu')?.contains(target)) return;
      reset();
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.ai-context-filter-menu')) return;
      event.preventDefault(); event.stopPropagation(); close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', reset);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', reset);
    };
  }, [open]);
  return <div className="ai-context-select">
    <button type="button" ref={trigger} className="select-trigger" aria-label={`选择历史对话，当前：${selected?.group ?? workbenchName} / ${selected?.title ?? '新对话'}`} title={`${selected?.group ?? workbenchName} / ${selected?.title ?? '新对话'}`} aria-haspopup="dialog" aria-controls={menuId} aria-expanded={open} onClick={() => open ? close() : setOpen(true)}>
      <span className="ai-context-header-label"><strong>{selected?.title ?? '新对话'}</strong></span><CaretDown size={12} weight="bold" />
    </button>
    {open && createPortal(<div ref={menu} id={menuId} className="select-menu ai-context-menu" role="dialog" aria-label="切换对话" onKeyDown={event => {
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      if ((event.target as HTMLElement).closest('.ai-context-workbench-filter')) return;
      const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-chat-main]')];
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[Math.max(0, Math.min(buttons.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))]?.focus();
    }}>
      <label className="ai-context-search"><MagnifyingGlass size={15} /><input value={query} onChange={event => { setQuery(event.target.value); setActions(null); }} placeholder="搜索对话" aria-label="搜索对话标题或关联对象" /></label>
      <div className="ai-context-filter-row"><span>{searchText ? `找到 ${matches.length} 条` : activeFilter === 'all' ? `最近 ${visibleChoices.length} 条` : `共 ${matches.length} 条`}</span>
        <TodoSelect value={activeFilter} aria-label="选择工作区" className="ai-context-workbench-filter" menuClassName="ai-context-filter-menu"
          options={[{ value: 'all', label: '选择工作区' }, ...groups.map(group => ({ value: group.id, label: group.label }))]}
          onChange={value => { setFilterId(value); setActions(null); }} />
      </div>
      <div className="ai-context-results" onScroll={() => setActions(null)}>
        {visibleChoices.map(chat => <div className={chat.id === currentId ? 'ai-context-row is-selected' : 'ai-context-row'} key={chat.id}>
          <button type="button" className="ai-context-chat-main" data-chat-main aria-current={chat.id === currentId ? 'true' : undefined} onClick={() => { close(); onOpen(chat.id); }}>
            <span className="ai-context-option-main"><span className="ai-context-option-text">{chat.title}</span>
              <span className="ai-context-option-meta"><small>{chat.detail === chat.group ? chat.group : `${chat.group} · ${chat.detail}`}</small>
                {chat.status && <span className={`ai-chat-status ${chat.status}`}>{chat.status === 'running' ? '执行中' : '已完成'}</span>}</span>
            </span>
          </button>
          <button type="button" className="ai-context-more" aria-label={`管理对话：${chat.title}`} aria-expanded={actions?.id === chat.id} onClick={event => {
            const rect = event.currentTarget.getBoundingClientRect();
            setActions(previous => previous?.id === chat.id ? null : { id: chat.id,
              left: Math.max(8, Math.min(rect.right - 112, window.innerWidth - 120)),
              top: rect.bottom + 76 <= window.innerHeight - 8 ? rect.bottom + 4 : rect.top - 72 });
          }}><DotsThree size={16} weight="bold" /></button>
          {actions?.id === chat.id && createPortal(<div ref={actionMenu} className="ai-context-actions-menu" style={{ left: actions.left, top: actions.top }} role="group" aria-label={`管理对话：${chat.title}`}>
            <button type="button" disabled={chat.streaming} onClick={() => { close(); onRename(chat); }}>重命名</button>
            <ChatDeleteButton title={chat.title} streaming={chat.streaming} className="ai-context-action-delete" showLabel onDelete={async () => { await onDelete(chat.id); setActions(null); }} />
          </div>, document.body)}
        </div>)}
        {visibleChoices.length === 0 && <div className="ai-context-no-results">{searchText ? '没有找到匹配的对话' : emptyGroup?.emptyScope ?
          <button type="button" data-chat-main onClick={() => { close(); onNew(emptyGroup.emptyScope!); }}>此工作台暂无对话 · 点击开始</button> : '暂无对话，点击右上角 ＋ 开始'}</div>}
      </div>
    </div>, document.body)}
  </div>;
}
function chatSummary(chat: ChatSession): ChatSummary {
  const lastReply = [...chat.entries].reverse().find(entry => entry.role === 'assistant');
  return { id: chat.id, title: chat.title, updatedAt: chat.updatedAt, module: chat.module,
    draftId: chat.draftId, profileId: chat.profileId, viewId: chat.viewId, contextScope: chat.contextScope, pageScope: chat.pageScope,
    streaming: chat.entries.some(entry => entry.streaming), completed: !!lastReply && !lastReply.streaming && !lastReply.error };
}
function actionSummary(action: AIAction): { verb: string; detail: string; danger?: boolean } {
  switch (action.type) {
    case 'create': return { verb: action.task.kind === 'meeting' ? '新增日程' : '新增待办', detail: action.task.title + (action.task.dueAt ? ' · ' + (action.task.kind === 'meeting' ? scheduleStamp(action.task) : new Date(action.task.dueAt).toLocaleString('zh-CN')) : '') };
    case 'update': return { verb: '修改事项', detail: Object.entries(action.patch).map(([key, value]) => key + ': ' + (value === null ? '清空' : String(value).slice(0, 40))).join(' · ') || '无字段' };
    case 'remove': return { verb: '删除事项', detail: action.id.slice(0, 8), danger: true };
    case 'create_category': return { verb: '新增标签', detail: action.category.name };
    case 'update_category': return { verb: '修改标签', detail: action.id.slice(0, 8) };
    case 'remove_category': return { verb: '删除标签', detail: action.id.slice(0, 8), danger: true };
  }
}

export function AiPanel({ open, onClose, seed, requestedChatId, onChatLocated, onActiveChatChange, onOpenSettings, onLocateCopySource, onLocateBaziDay, onQuickAsk, context, width, onWidthChange, copySaveState }: {
  open: boolean; onClose(): void; seed?: AiSeed | null; requestedChatId?: string | null; onChatLocated(): void; onOpenSettings(): void;
  onActiveChatChange(id: string | null): void;
  onLocateCopySource(source: CopySource): void;
  onLocateBaziDay(profileId: string): void;
  onQuickAsk(prompt: string, scope: AiScope): void;
  context: AiPanelContext; width: number; onWidthChange(width: number): void; copySaveState?: { id: string | null; status: 'saved' | 'saving' | 'error' };
}) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<ChatSession | null>(null);
  const [activeContext, setActiveContext] = useState<AiPanelContext>(context);
  const [fixedContexts, setFixedContexts] = useState<Record<string, AiPanelContext>>({});
  const [objectNames, setObjectNames] = useState<Record<string, string>>({});
  const [referenceOptions, setReferenceOptions] = useState<ReferenceOption[]>([]);
  const [referenceContexts, setReferenceContexts] = useState<Record<string, AiScope[]>>({});
  const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);
  const [pendingReferences, setPendingReferences] = useState<AiScope[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [switchingModel, setSwitchingModel] = useState(false);
  const [modelError, setModelError] = useState('');
  const [selected, setSelected] = useState<Record<string, number[]>>({});
  const [managing, setManaging] = useState<{ id: string; title: string } | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [manageBusy, setManageBusy] = useState(false);
  const [manageError, setManageError] = useState('');
  const renameInput = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followReply = useRef(true);
  const scrollPositions = useRef(new Map<string, number>());
  const selectedChats = useRef(new Map<string, string>());
  const loadSequence = useRef(0);
  const consumedSeed = useRef(0);
  const draftTimer = useRef<number | undefined>(undefined);
  const draftSnapshot = useRef<{ id: string; text: string } | null>(null);
  const currentRef = useRef(current);
  const pageContextRef = useRef(context);
  const pageWorkbench = workbenchForScope(context.scope);
  const previousPageWorkbench = useRef(pageWorkbench);
  const pageScopeKey = aiScopeKey(context.scope);
  const activeScopeKey = aiScopeKey(activeContext.scope);
  const contextKey = current?.id ?? workspaceKey(activeContext.scope);
  const fixedContext = fixedContexts[contextKey];
  const savedReferences = referenceContexts[contextKey] ?? [...(current?.entries ?? [])].reverse().find(entry => entry.references)?.references ?? [];
  const references = savedReferences.filter(scope => scope.module === activeContext.scope.module && aiScopeKey(scope) !== activeScopeKey);
  const selectableReferences = referenceOptions.filter(option => option.scope.module === activeContext.scope.module && aiScopeKey(option.scope) !== activeScopeKey);
  const activeScopeKeyRef = useRef(activeScopeKey);
  currentRef.current = current;
  pageContextRef.current = context;
  activeScopeKeyRef.current = activeScopeKey;

  const refreshChats = (): Promise<ChatSummary[]> => wb.ai.chatList().then(raw => {
    const list = raw as ChatSummary[];
    setChats(list);
    return list;
  });
  const flushDraft = (): void => {
    window.clearTimeout(draftTimer.current);
    const snapshot = draftSnapshot.current;
    if (snapshot) void wb.ai.chatDraft(snapshot.id, snapshot.text).catch(() => undefined);
    draftSnapshot.current = null;
  };
  const followCurrentPage = (previous: AiPanelContext): AiPanelContext => {
    const page = pageContextRef.current;
    if (workspaceKey(page.scope) !== workspaceKey(previous.scope)) return previous;
    if (page.scope.module === 'workbench' && previous.scope.module !== 'workbench'
      && page.scope.viewId !== 'copy' && page.scope.viewId !== 'bazi') return previous;
    return page;
  };
  const showChat = (chat: ChatSession): void => {
    setChats(previous => [chatSummary(chat), ...previous.filter(item => item.id !== chat.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    selectedChats.current.set(workspaceKey(chatScope(chat)), chat.id);
    const scope = chatContextScope(chat);
    const savedContext = contextForScope(scope);
    const lastSystem = [...chat.entries].reverse().find(entry => entry.baziSystem)?.baziSystem;
    const nextContext = scope.module === 'bazi' ? { ...savedContext, baziSystem: lastSystem ?? savedContext.baziSystem ?? 'bazi' } : savedContext;
    setActiveContext(fixedContexts[chat.id] ?? followCurrentPage(nextContext));
    setCurrent(chat);
    setInput(chat.draft);
    setError('');
    setReferenceDialogOpen(false);
  };
  const restoreWorkbenchChat = (scope: AiScope, sequence: number): void => {
    void wb.ai.chatList().then(async raw => {
      if (sequence !== loadSequence.current) return;
      const list = raw as ChatSummary[];
      setChats(list);
      const scoped = list.filter(chat => sameAiWorkbench(chat, scope));
      const wanted = selectedChats.current.get(workspaceKey(scope));
      const found = scoped.find(chat => chat.id === wanted) ?? scoped[0];
      if (!found) return;
      const chat = await wb.ai.chatOpen(found.id) as ChatSession;
      if (sequence === loadSequence.current) showChat(chat);
    }).catch(e => { if (sequence === loadSequence.current) setError(errorText(e)); });
  };
  useEffect(() => {
    if (open) void wb.ai.config().then(raw => setConfig(raw as AiConfig), e => setError(errorText(e)));
  }, [open]);
  useEffect(() => {
    const sequence = ++loadSequence.current;
    restoreWorkbenchChat(context.scope, sequence);
    return () => flushDraft();
  }, []);
  useLayoutEffect(() => {
    if (!pageWorkbench || previousPageWorkbench.current === pageWorkbench) return;
    previousPageWorkbench.current = pageWorkbench;
    const sequence = ++loadSequence.current;
    flushDraft();
    setCurrent(null);
    setActiveContext(context);
    setInput('');
    setError('');
    setManaging(null);
    setReferenceDialogOpen(false);
    restoreWorkbenchChat(context.scope, sequence);
  }, [pageWorkbench]);
  useEffect(() => { onActiveChatChange(current?.id ?? null); }, [current?.id, onActiveChatChange]);
  useEffect(() => {
    if (!managing) return;
    const frame = requestAnimationFrame(() => {
      renameInput.current?.focus(); renameInput.current?.select();
    });
    return () => cancelAnimationFrame(frame);
  }, [managing]);
  useEffect(() => {
    if (!open) return;
    let live = true;
    void Promise.all([wb.copy.list(), wb.bazi.list()]).then(([copy, bazi]) => {
      if (!live) return;
      const names: Record<string, string> = {};
      const options: ReferenceOption[] = [];
      for (const draft of (copy as CopyStoreData).drafts) {
        const scope: AiScope = { module: 'copy', draftId: draft.id };
        const title = draft.title || '未命名博客';
        names[aiScopeKey(scope)] = title;
        options.push({ scope, title, detail: draft.updatedAt ? `更新于 ${new Date(draft.updatedAt).toLocaleDateString('zh-CN')}` : '博客草稿' });
      }
      for (const profile of (bazi as BaziStoreData).profiles) {
        const scope: AiScope = { module: 'bazi', profileId: profile.id };
        names[aiScopeKey(scope)] = profile.name;
        options.push({ scope, title: profile.name, detail: `${profile.date} ${profile.time} · ${profile.gender === 1 ? '男' : '女'}${profile.tag ? ` · ${profile.tag}` : ''}` });
      }
      setObjectNames(names);
      setReferenceOptions(options);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [open, referenceDialogOpen]);
  useEffect(() => {
    if (fixedContext && aiScopeKey(fixedContext.scope) === pageScopeKey && fixedContext.object !== context.object) {
      setFixedContexts(previous => ({ ...previous, [contextKey]: { ...fixedContext, object: context.object } }));
    }
    setActiveContext(previous => fixedContext
      ? { ...fixedContext, object: aiScopeKey(fixedContext.scope) === pageScopeKey ? context.object : fixedContext.object }
      : followCurrentPage(previous));
  }, [pageScopeKey, context.label, context.object, context.baziSystem, current?.id, fixedContext]);
  useEffect(() => {
    if (!requestedChatId) return;
    void wb.ai.chatOpen(requestedChatId).then(raw => {
      const chat = raw as ChatSession;
      ++loadSequence.current;
      flushDraft();
      setActiveContext(context);
      showChat(chat);
      onChatLocated();
    }, e => { setError(errorText(e)); onChatLocated(); });
  }, [requestedChatId, pageScopeKey]);
  useEffect(() => {
    if (!open || !seed || consumedSeed.current === seed.nonce) return;
    consumedSeed.current = seed.nonce;
    const sequence = ++loadSequence.current;
    const targetKey = workspaceKey(seed.scope);
    void (async () => {
      const existing = currentRef.current;
      let chat: ChatSession;
      if (existing && sameAiWorkbench(existing, seed.scope)) chat = existing;
      else {
        const list = await refreshChats();
        const wanted = selectedChats.current.get(targetKey);
        const found = list.find(item => item.id === wanted && sameAiWorkbench(item, seed.scope))
          ?? list.find(item => sameAiWorkbench(item, seed.scope));
        chat = found ? await wb.ai.chatOpen(found.id) as ChatSession : await wb.ai.chatNew(seed.scope) as ChatSession;
      }
      if (sequence === loadSequence.current) {
        if (existing?.id !== chat.id) flushDraft();
        selectedChats.current.set(targetKey, chat.id);
        const targetContext = { ...(aiScopeKey(seed.scope) === pageScopeKey ? context : contextForScope(seed.scope)), baziSystem: seed.baziSystem };
        if (fixedContexts[chat.id] || (!existing && fixedContext)) setFixedContexts(previous => ({ ...previous, [chat.id]: targetContext }));
        setActiveContext(targetContext);
        setCurrent(chat);
        if (existing?.id !== chat.id) setInput(chat.draft);
      }
      setSending(true);
      try {
        const unsentDraft = existing?.id === chat.id ? input : chat.draft;
        const chosen = referenceContexts[chat.id] ?? (!existing ? savedReferences : [...chat.entries].reverse().find(entry => entry.references)?.references ?? []);
        const seedReferences = chosen.filter(scope => scope.module === seed.scope.module && aiScopeKey(scope) !== aiScopeKey(seed.scope));
        if (!existing && seedReferences.length) setReferenceContexts(previous => ({ ...previous, [chat.id]: seedReferences }));
        const request = wb.ai.ask(chat.id, seed.text, { scope: seed.scope, pageScope: workbenchForScope(seed.scope) === pageWorkbench ? context.scope : seed.scope, references: seedReferences, baziSystem: seed.baziSystem, copySource: seed.copySource });
        if (unsentDraft) void wb.ai.chatDraft(chat.id, unsentDraft).catch(() => undefined);
        await request;
      } catch (e) { if (sequence === loadSequence.current) setError(errorText(e)); }
      finally { setSending(false); }
    })().catch(e => { if (sequence === loadSequence.current) setError(errorText(e)); });
  }, [open, seed?.nonce]);
  useEffect(() => wb.ai.onChat(raw => {
    const chat = raw as ChatSession;
    const summary = chatSummary(chat);
    setChats(previous => [summary, ...previous.filter(item => item.id !== chat.id)]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
    setCurrent(previous => previous?.id === chat.id ? chat : previous);
  }), []);
  useEffect(() => {
    if (!current) return;
    draftSnapshot.current = { id: current.id, text: input };
    window.clearTimeout(draftTimer.current);
    draftTimer.current = window.setTimeout(() => {
      const snapshot = draftSnapshot.current;
      if (snapshot?.id === current.id) {
        void wb.ai.chatDraft(snapshot.id, snapshot.text).catch(() => undefined);
        draftSnapshot.current = null;
      }
    }, 350);
    return () => window.clearTimeout(draftTimer.current);
  }, [current?.id, input]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (current && element) {
      element.scrollTop = scrollPositions.current.get(current.id) ?? element.scrollHeight;
      followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
    }
  }, [current?.id]);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && followReply.current) element.scrollTop = element.scrollHeight;
  }, [current?.entries]);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (referenceDialogOpen || managing) return;
      { onClose(); requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.ai-topbar-btn')?.focus()); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, referenceDialogOpen, managing, onClose]);

  const visibleCurrent = current;
  const activeChat = chats.find(chat => chat.streaming);
  const busy = Boolean(activeChat) || sending;
  const currentBusy = visibleCurrent?.entries.some(entry => entry.streaming) ?? false;
  const copyWriteBlocked = (scope: AiScope | undefined): boolean => scope?.module === 'copy' && copySaveState?.id === scope.draftId && copySaveState.status !== 'saved';
  const activeCopyWriteBlocked = copyWriteBlocked(activeContext.scope);
  const copySaveHint = copySaveState?.status === 'error' ? '请回到博客编辑重试保存' : '请先等待当前博客保存完成';
  const linkedPageScope = pageWorkbench === workbenchForScope(activeContext.scope) ? context.scope : activeContext.scope;
  const model = config?.models.find(item => item.id === config.activeModelId) ?? config?.models[0];
  const modelOptions = config?.providers.flatMap(provider => config.models.filter(item => item.providerId === provider.id)
    .map(item => ({ value: item.id, label: item.name, group: provider.name }))) ?? [];
  const activeWorkbench = workbenchForScope(activeContext.scope);
  const activeWorkbenchName = activeWorkbench === 'home' ? TODO_AI_WORKBENCH_NAME : NAV.find(item => item.id === activeWorkbench)?.title ?? '其他工作台';
  const activeObjectName = activeContext.scope.module === 'todo' ? TODO_AI_WORKBENCH_NAME : activeContext.object;
  const contextForScope = (scope: AiScope): AiPanelContext => {
    const key = aiScopeKey(scope);
    if (scope.module === 'todo') return { scope, label: '待办与日程', object: TODO_AI_WORKBENCH_NAME };
    if (key === aiScopeKey(pageContextRef.current.scope)) return pageContextRef.current;
    if (key === activeScopeKey) return { ...activeContext, object: objectNames[key] ?? activeContext.object };
    const recent = chats.find(chat => aiScopeKey(chatContextScope(chat)) === key);
    if (scope.module === 'copy') return { scope, label: objectNames[key] ? '博客编辑' : '博客历史', object: objectNames[key] ?? recent?.title ?? '未命名博客' };
    if (scope.module === 'bazi') return { scope, label: objectNames[key] ? '命理解读' : '命理历史', object: objectNames[key] ?? recent?.title ?? '未命名命例', baziSystem: 'bazi' };
    if (scope.module === 'workbench' && scope.viewId.startsWith('workspace:')) return { scope, label: '工作台助手', object: NAV.find(workbench => workbench.id === workbenchForScope(scope))?.title ?? '当前工作台' };
    return { scope, label: '工作台助手', object: NAV.flatMap(workbench => workbench.subs).find(sub => sub.view === scope.viewId)?.label ?? scope.viewId };
  };
  const orderedWorkbenches = [...NAV.filter(workbench => workbench.id === activeWorkbench), ...NAV.filter(workbench => workbench.id !== activeWorkbench)];
  const contextGroups: ChatGroup[] = orderedWorkbenches.filter(workbench =>
    defaultAiScopeForWorkbench(workbench.id) || chats.some(chat => workbenchForScope(chatScope(chat)) === workbench.id))
    .map(workbench => ({ id: workbench.id, label: workbench.id === 'home' ? TODO_AI_WORKBENCH_NAME : workbench.title, emptyScope: defaultAiScopeForWorkbench(workbench.id) }));
  const contextOptions: ChatChoice[] = orderedWorkbenches.flatMap(workbench =>
    chats.filter(chat => workbenchForScope(chatScope(chat)) === workbench.id).map(chat => {
      const status = chat.streaming ? 'running' : chat.completed ? 'done' : undefined;
      const businessScope = chatContextScope(chat);
      const pageScope = chat.pageScope ?? businessScope;
      const detail = contextForScope(businessScope).object + (aiScopeKey(pageScope) === aiScopeKey(businessScope) ? '' : ` · ${contextForScope(pageScope).object}`);
      return { id: chat.id, title: chat.title, group: workbench.id === 'home' ? TODO_AI_WORKBENCH_NAME : workbench.title, detail, updatedAt: chat.updatedAt, status, streaming: chat.streaming };
    }));
  const toggleFixedContext = (): void => setFixedContexts(previous => {
    const next = { ...previous };
    if (fixedContext) delete next[contextKey];
    else next[contextKey] = activeContext;
    return next;
  });
  const editReferences = (): void => {
    setPendingReferences(references);
    setReferenceDialogOpen(true);
  };
  const selectModel = (id: string): void => {
    if (id === config?.activeModelId) return;
    setSwitchingModel(true); setModelError('');
    void wb.ai.activateModel(id).then(raw => setConfig(raw as AiConfig), e => setModelError(errorText(e)))
      .finally(() => {
        setSwitchingModel(false);
        requestAnimationFrame(() => {
          if (document.activeElement === document.body) document.querySelector<HTMLButtonElement>('.ai-panel.open .ai-model-select .select-trigger')?.focus();
        });
      });
  };
  const newChat = (scope: AiScope = activeContext.scope): void => {
    flushDraft(); const sequence = ++loadSequence.current; const targetKey = activeScopeKey;
    void wb.ai.chatNew(scope).then(raw => {
      if (sequence !== loadSequence.current || activeScopeKeyRef.current !== targetKey) return;
      showChat(raw as ChatSession); void refreshChats();
    }, e => { if (activeScopeKeyRef.current === targetKey) setError(errorText(e)); });
  };
  const openChat = (id: string): void => {
    flushDraft(); const sequence = ++loadSequence.current; const targetKey = activeScopeKey;
    void wb.ai.chatOpen(id).then(raw => {
      if (sequence === loadSequence.current && activeScopeKeyRef.current === targetKey) showChat(raw as ChatSession);
    }, e => { if (activeScopeKeyRef.current === targetKey) setError(errorText(e)); });
  };
  const removeChat = (id: string): Promise<void> => {
    flushDraft(); const sequence = ++loadSequence.current; const targetKey = activeScopeKey;
    return wb.ai.chatRemove(id).then(raw => {
      if (sequence === loadSequence.current && activeScopeKeyRef.current === targetKey && visibleCurrent?.id === id) showChat(raw as ChatSession);
      setChats(previous => previous.filter(chat => chat.id !== id));
      void refreshChats();
    });
  };
  const manageChat = (chat: { id: string; title: string }): void => {
    setManaging(chat); setRenameDraft(chat.title); setManageError('');
  };
  const confirmManage = (): void => {
    if (!managing || manageBusy) return;
    setManageBusy(true); setManageError('');
    void wb.ai.chatRename(managing.id, renameDraft).then(() => setManaging(null), e => setManageError(errorText(e))).finally(() => setManageBusy(false));
  };
  const send = (): void => {
    const text = input.trim();
    if (!text || busy || switchingModel || !config?.aiEnabled || activeCopyWriteBlocked) return;
    const targetKey = activeScopeKey;
    const sequence = loadSequence.current;
    window.clearTimeout(draftTimer.current); draftSnapshot.current = null;
    setInput(''); setSending(true); setError('');
    void (async () => {
      const chat = visibleCurrent ?? await wb.ai.chatNew(activeContext.scope) as ChatSession;
      if (!visibleCurrent && sequence === loadSequence.current && activeScopeKeyRef.current === targetKey) {
        if (fixedContext) setFixedContexts(previous => ({ ...previous, [chat.id]: fixedContext }));
        if (references.length) setReferenceContexts(previous => ({ ...previous, [chat.id]: references }));
        selectedChats.current.set(workspaceKey(chatScope(chat)), chat.id);
        setCurrent(chat);        void refreshChats();
      }
      try { await wb.ai.ask(chat.id, text, { scope: activeContext.scope, pageScope: linkedPageScope, references, baziSystem: activeContext.scope.module === 'bazi' ? activeContext.baziSystem : undefined }); }
      catch (e) {
        if (activeScopeKeyRef.current === targetKey) { setError(errorText(e)); setInput(previous => previous || text); }
      } finally { setSending(false); }
    })().catch(e => { if (activeScopeKeyRef.current === targetKey) { setError(errorText(e)); setInput(previous => previous || text); } setSending(false); });
  };
  const closePanel = (): void => {
    flushDraft(); onClose();
    requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('.ai-topbar-btn')?.focus());
  };

  return (
    <aside className={open ? 'ai-panel open' : 'ai-panel'} id="workbench-ai-panel" role="complementary" aria-label="AI 助手" aria-hidden={!open} inert={!open}>
      <div className="ai-resizer" role="separator" tabIndex={0} aria-label="调整助手宽度" aria-orientation="vertical" aria-valuemin={340} aria-valuemax={480} aria-valuenow={width}
        onKeyDown={event => {
          if (event.key === 'ArrowLeft') { event.preventDefault(); onWidthChange(Math.min(480, width + 20)); }
          if (event.key === 'ArrowRight') { event.preventDefault(); onWidthChange(Math.max(340, width - 20)); }
        }}
        onPointerDown={event => {
          const element = event.currentTarget;
          const startX = event.clientX; const startWidth = width;
          element.setPointerCapture(event.pointerId);
          const move = (next: PointerEvent): void => onWidthChange(Math.max(340, Math.min(480, startWidth + startX - next.clientX)));
          const end = (): void => {
            element.removeEventListener('pointermove', move);
            element.removeEventListener('pointerup', end);
            element.removeEventListener('pointercancel', end);
          };
          element.addEventListener('pointermove', move);
          element.addEventListener('pointerup', end, { once: true });
          element.addEventListener('pointercancel', end, { once: true });
        }}
      />
      <header className="ai-panel-head">
        <span className="ai-panel-title"><Sparkle size={16} weight="fill" />AI 助手</span>


        <button className="ai-icon-btn" aria-label="收起 AI 助手" title="收起 AI 助手" onClick={closePanel}><SidebarSimple size={17} /></button>
      </header>
      {/* 协助对象卡:对象为主行(模块图标+名称+固定/跟随+范围说明),工作区并入对话选择器前缀 */}
      <div className={fixedContext ? 'ai-ctxcard pinned' : 'ai-ctxcard'}>
        <div className="ai-ctx-main">
          <span className="ai-ctx-modicon" aria-hidden="true" title={activeContext.label}>
            {activeContext.scope.module === 'copy' ? <IconVideo /> : activeContext.scope.module === 'bazi' ? <IconMoon /> : activeContext.scope.module === 'todo' ? <IconCheckSquare /> : pageWorkbench === 'settings' ? <GearSix size={16} /> : ({ home: IconHome, media: IconVideo, game: IconGamepad, web: IconWeb, life: IconMoon } as const)[pageWorkbench ?? 'home']({})}
          </span>
          <div className="ai-ctx-body">
            <div className="ai-ctx-kicker">
              <span className="ai-ctx-modname">{activeContext.scope.module === 'bazi' ? (activeContext.baziSystem === 'ziwei' ? '紫微斗数' : activeContext.baziSystem === 'astro' ? '占星' : '八字') : activeContext.label}</span>
            </div>
            {/* 仅待办与日程无具体协助对象,不显示对象名(避免与次行工作区胶囊重复);其他工作台不动 */}
            {activeContext.scope.module !== 'todo' && (
              <div className="ai-ctx-name" aria-live="polite" title={activeObjectName}>{activeObjectName}</div>
            )}
          </div>
          {(activeContext.scope.module === 'copy' || activeContext.scope.module === 'bazi') && (
            <button type="button" className={fixedContext ? 'ai-ctx-pin on' : 'ai-ctx-pin'} aria-pressed={Boolean(fixedContext)} aria-label={fixedContext ? '取消固定，跟随当前编辑对象' : '固定本次协助对象'} title={fixedContext ? '取消固定后，下一次发送使用当前编辑页的对象' : '固定后，浏览其他页面时仍协助这个对象'} onClick={toggleFixedContext}>
              <PushPin size={13} weight={fixedContext ? 'fill' : 'regular'} />{fixedContext ? '取消固定' : '固定'}
            </button>
          )}
          <span className="ai-scope-tip">
            <button type="button" className="ai-ctx-info" aria-label="查看协助范围" aria-describedby="ai-scope-detail"><Info size={14} /></button>
            <span id="ai-scope-detail" className="ai-scope-tooltip" role="tooltip">{SCOPE_TIPS[activeContext.scope.module] ?? SCOPE_TIP_DEFAULT}</span>
          </span>
        </div>
        <div className="ai-ctx-sub">
          <span className="ai-ctx-wschip" title={`当前工作区：${activeWorkbenchName}`}>{activeWorkbenchName}</span>
          <ChatPicker key={pageWorkbench ?? 'unknown'} currentId={visibleCurrent?.id} workbenchName={activeWorkbenchName} groups={contextGroups} choices={contextOptions} onNew={newChat} onOpen={openChat} onRename={manageChat} onDelete={removeChat} />
          <button type="button" className="ai-ctx-new" aria-label={`在${activeWorkbenchName}新建对话`} title={`在${activeWorkbenchName}新建对话`} onClick={() => newChat()}><Plus size={13} weight="bold" /></button>
        </div>
      </div>
          <div className="ai-messages" ref={scrollRef} onScroll={event => {
            const element = event.currentTarget;
            followReply.current = element.scrollHeight - element.scrollTop - element.clientHeight < 80;
            if (visibleCurrent) scrollPositions.current.set(visibleCurrent.id, element.scrollTop);
          }}>
            {!visibleCurrent || visibleCurrent.entries.length === 0 ? (
              <div className="ai-empty">
                <span className="ai-empty-avatar"><Sparkle size={24} weight="fill" /></span>
                <b>{activeContext.label}</b>
                <p>{activeContext.scope.module === 'copy' ? '聊聊这篇博客。改写和标题先以建议展示，确认后才会写入。' : activeContext.scope.module === 'bazi' ? '围绕关联命例提问；回答以发送时的盘面为依据。' : activeContext.scope.module === 'todo' ? '查询待办、整理日程，修改会先让你确认。' : '说说你想解决的问题。'}</p>
              </div>
            ) : visibleCurrent.entries.map(entry => (
              <div key={entry.id} className={entry.role === 'user' ? 'ai-msg user' : 'ai-msg'}>
                {entry.role === 'user' && entry.contextScope && (aiScopeKey(entry.contextScope) !== activeScopeKey || (entry.pageScope && aiScopeKey(entry.pageScope) !== aiScopeKey(entry.contextScope))) &&
                  <span className="ai-message-tag">关联：{contextForScope(entry.contextScope).object}{entry.pageScope && aiScopeKey(entry.pageScope) !== aiScopeKey(entry.contextScope) ? ` · ${contextForScope(entry.pageScope).object}` : ''}</span>}
                {entry.baziSystem && entry.role === 'user' && <span className="ai-message-tag">{entry.baziSystem === 'ziwei' ? '紫微斗数' : entry.baziSystem === 'astro' ? '占星' : '八字'}</span>}
                {entry.copySource && <button className="ai-source-chip" title={entry.copySource.text} onClick={() => onLocateCopySource(entry.copySource!)}>引用原文 · 定位</button>}
                {entry.role === 'assistant' && entry.baziSystem === 'bazi' && entry.content.includes('日主') && (entry.contextScope ?? chatScope(visibleCurrent)).module === 'bazi' && <button className="ai-source-chip" onClick={() => { const scope = entry.contextScope ?? chatScope(visibleCurrent); if (scope.module === 'bazi') onLocateBaziDay(scope.profileId); }}>在盘面中定位日主</button>}
                {entry.role === 'assistant' ? <AiResponse entry={entry} /> : <div className="ai-bubble">{entry.content}</div>}
                {entry.error && <div className="ai-error" role="alert">{entry.error}</div>}
                {entry.proposal && entry.actionState === 'pending' && <div className="ai-proposal">
                  <div className="ai-proposal-head">请确认以下 {entry.proposal.actions.length} 项操作</div>
                  {entry.proposal.actions.map((action, index) => {
                    const summary = actionSummary(action);
                    const indices = selected[entry.proposal!.token] ?? [];
                    return <label key={index} className={summary.danger ? 'ai-proposal-item danger' : 'ai-proposal-item'}>
                      <input type="checkbox" checked={indices.includes(index)} onChange={event => setSelected(previous => {
                        const before = previous[entry.proposal!.token] ?? [];
                        return { ...previous, [entry.proposal!.token]: event.target.checked ? [...before, index] : before.filter(item => item !== index) };
                      })} />
                      <span className="ai-proposal-verb">{summary.verb}</span><span className="ai-proposal-detail">{summary.detail}</span>
                    </label>;
                  })}
                  <div className="ai-proposal-actions">
                    <button className="ai-apply" disabled={busy || !(selected[entry.proposal.token] ?? []).length} onClick={() => { void wb.ai.apply(entry.proposal!.token, selected[entry.proposal!.token] ?? []).then(() => setSelected(previous => ({ ...previous, [entry.proposal!.token]: [] })), e => setError(errorText(e))); }}>应用所选</button>
                    <button className="ai-discard" onClick={() => { void wb.ai.discard(entry.proposal!.token).catch(e => setError(errorText(e))); }}>保留原内容</button>
                  </div>
                </div>}
                {entry.copyProposal && entry.actionState === 'pending' && <div className="ai-proposal">
                  {entry.copyProposal.actions.map((action, index) => action.kind === 'edit' ? <div key={index} className="ai-copy-edit">
                    <b className="ai-proposal-head">正文改写 · 待确认</b>
                    {entry.copyProposal?.original && <details className="ai-original"><summary>查看原文</summary><pre>{entry.copyProposal.original.body}</pre></details>}
                    {action.notes.length > 0 && <ul className="copy-ai-notes">{action.notes.map((note, i) => <li key={i}>{note}</li>)}</ul>}
                    <pre className="copy-ai-preview">{action.text}</pre>
                    <div className="ai-proposal-actions"><button className="ai-apply" disabled={busy || copyWriteBlocked(entry.contextScope ?? chatScope(visibleCurrent))} title={copyWriteBlocked(entry.contextScope ?? chatScope(visibleCurrent)) ? '请先等待目标博客保存完成' : '确认后替换这篇博客的正文'} onClick={() => { void wb.ai.apply(entry.copyProposal!.token, [index]).catch(e => setError(errorText(e))); }}>应用到《{entry.copyProposal?.original?.title || contextForScope(entry.contextScope ?? chatScope(visibleCurrent)).object}》</button></div>
                  </div> : null)}
                  {entry.copyProposal.actions.some(action => action.kind === 'title') && <div className="copy-ai-titles">{entry.copyProposal.actions.map((action, index) => action.kind === 'title' ? <button key={index} className="copy-title-chip" disabled={busy || copyWriteBlocked(entry.contextScope ?? chatScope(visibleCurrent))} title={copyWriteBlocked(entry.contextScope ?? chatScope(visibleCurrent)) ? '请先等待目标博客保存完成' : `采用为《${entry.copyProposal?.original?.title || contextForScope(entry.contextScope ?? chatScope(visibleCurrent)).object}》的标题`} onClick={() => { void wb.ai.apply(entry.copyProposal!.token, [index]).catch(e => setError(errorText(e))); }}>{action.title}</button> : null)}</div>}
                  <div className="ai-proposal-actions"><button className="ai-discard" onClick={() => { void wb.ai.discard(entry.copyProposal!.token).catch(e => setError(errorText(e))); }}>保留原内容</button></div>
                </div>}
                {entry.actionState && entry.actionState !== 'pending' && <div className={'ai-action-state ' + entry.actionState}>
                  {({ applied: '已应用', discarded: '已保留原内容', expired: '已过期，未应用', revised: '已被后续建议替代', undone: '已撤销' } as const)[entry.actionState]}
                  {entry.actionState === 'applied' && entry.copyUndo && <button className="ai-undo" disabled={copyWriteBlocked({ module: 'copy', draftId: entry.copyUndo.draftId })} title={copyWriteBlocked({ module: 'copy', draftId: entry.copyUndo.draftId }) ? '请先等待目标博客保存完成' : undefined} onClick={() => { void wb.ai.undo(entry.copyProposal!.token).catch(e => setError(errorText(e))); }}>撤销修改</button>}
                </div>}
              </div>
            ))}
            {error && <div className="ai-error" role="alert">{error}</div>}
          </div>
          <div className="ai-compose-wrap">
            {(activeContext.scope.module === 'copy' || activeContext.scope.module === 'bazi') && <div className="ai-reference-row" aria-label="本轮只读参考资料">
              {references.map(scope => <span className="ai-reference-chip" key={aiScopeKey(scope)}><span title={objectNames[aiScopeKey(scope)]}>参考 · {objectNames[aiScopeKey(scope)] ?? '已删除的参考'}</span><button type="button" aria-label={`移除参考：${objectNames[aiScopeKey(scope)] ?? '已删除的参考'}`} onClick={() => setReferenceContexts(previous => ({ ...previous, [contextKey]: savedReferences.filter(item => aiScopeKey(item) !== aiScopeKey(scope)) }))}><X size={12} /></button></span>)}
              <button type="button" className="ai-add-reference" onClick={editReferences}><Plus size={13} />添加参考</button>
            </div>}
            {activeChat && activeChat.id !== visibleCurrent?.id && <div className="ai-busy-hint">“{activeChat.title}”正在生成，可继续输入，完成后再发送。</div>}
            {activeCopyWriteBlocked && <div className="ai-busy-hint">{copySaveHint}</div>}
            {activeContext.scope.module === 'copy' && <div className="ai-copy-actions" aria-label="博客写作快捷指令">
              {COPY_QUICK_ACTIONS.map(action => <button key={action.label} type="button" className="ai-copy-action" title={activeCopyWriteBlocked ? copySaveHint : action.prompt}
                disabled={!config?.aiEnabled || busy || switchingModel || activeCopyWriteBlocked} onClick={() => onQuickAsk(action.prompt, activeContext.scope)}>{action.label}</button>)}
            </div>}
            <div className="ai-compose">
              <div className="ai-compose-input">
                <textarea aria-label="发送给当前对话的 AI 助手" value={input} placeholder={config?.aiEnabled ? '围绕正在协助的对象继续聊聊…' : '请先在 AI 设置中配置并启用'} disabled={!config?.aiEnabled}
                  onChange={event => setInput(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
                <div className="ai-compose-toolbar">
                  {config?.models.length ? <TodoSelect aria-label="选择大模型" className="ai-model-select" menuClassName="ai-model-menu" value={model?.id ?? ''} onChange={selectModel}
                    options={modelOptions}
                    disabled={!open || busy || switchingModel} />
                    : <button className="ai-text-btn" onClick={onOpenSettings}>配置模型</button>}
                  {currentBusy ? <button className="ai-send cancel" aria-label="停止生成" title="停止生成" onClick={() => wb.ai.cancel()}><Stop size={16} weight="fill" /></button>
                    : <button className="ai-send" aria-label="发送" title="发送" disabled={!input.trim() || !config?.aiEnabled || busy || switchingModel || activeCopyWriteBlocked} onClick={send}><PaperPlaneRight size={16} weight="fill" /></button>}
                </div>
              </div>
            </div>
            {modelError && <div className="ai-model-error" role="alert">{modelError}</div>}
          </div>
      {referenceDialogOpen && <Modal title={activeContext.scope.module === 'copy' ? '添加参考博文' : '添加参考命例'} className="ai-reference-dialog" close={() => setReferenceDialogOpen(false)}>
        <div className="form-body">
          <p className="ai-reference-help">AI 按需读取所选参考。{activeContext.scope.module === 'copy' ? `修改仍应用到《${activeObjectName}》。` : '参考命例使用本次协助对象的盘型。'}最多选择 8 个。</p>
          <div className="ai-reference-options">
            {selectableReferences.map(option => {
              const checked = pendingReferences.some(scope => aiScopeKey(scope) === aiScopeKey(option.scope));
              return <label className="ai-reference-option" key={aiScopeKey(option.scope)}><input type="checkbox" checked={checked} disabled={!checked && pendingReferences.length >= 8} onChange={event => setPendingReferences(previous => event.target.checked ? [...previous, option.scope] : previous.filter(scope => aiScopeKey(scope) !== aiScopeKey(option.scope)))} /><span><strong>{option.title}</strong><small>{option.detail}</small></span></label>;
            })}
            {!selectableReferences.length && <p className="ai-reference-help">暂无其他可选的{activeContext.scope.module === 'copy' ? '博文' : '命例'}。</p>}
          </div>
          <div className="actions"><button type="button" onClick={() => setReferenceDialogOpen(false)}>取消</button><button type="button" className="primary" onClick={() => { setReferenceContexts(previous => ({ ...previous, [contextKey]: pendingReferences })); setReferenceDialogOpen(false); }}>使用所选参考</button></div>
        </div>
      </Modal>}
      {managing && <Modal title="重命名对话" className="ai-chat-manage-dialog" close={() => { if (!manageBusy) setManaging(null); }}>
        <form noValidate onSubmit={event => { event.preventDefault(); confirmManage(); }}>
          <label htmlFor="ai-chat-rename">对话名称</label><input ref={renameInput} id="ai-chat-rename" value={renameDraft} maxLength={80} disabled={manageBusy} onChange={event => setRenameDraft(event.target.value)} />
          {manageError && <p className="error" role="alert">{manageError}</p>}
          <div className="actions"><button type="button" disabled={manageBusy} onClick={() => setManaging(null)}>取消</button><button type="submit" className="primary" disabled={manageBusy || !renameDraft.trim()}>{manageBusy ? '保存中…' : '保存'}</button></div>
        </form>
      </Modal>}
    </aside>
  );
}
