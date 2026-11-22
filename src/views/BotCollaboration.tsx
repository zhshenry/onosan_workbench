import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, WarningCircle } from '@phosphor-icons/react';
import type { BotCard, BotCollaboration, BotExchange, BotExchangeQuery, BotMessage, BotSubmit, BotTask } from '../../shared/bot-contracts';
import { chatEventPeer, type BotChatEventGroup, type BotMessageLink } from '../bot-chat-events';
import { errorText } from '../ui/controls';
import { BotMessageTime, ReplyBubble } from './AiResponse';
import { BotOperationCard, BotOperationSubject } from './BotOperationCard';
import { ActionCard, actionForConversation, botStatusLabel } from './BotTasks';
import { BotAvatar } from './BotAvatar';
import './bot-collaboration.css';

const api = window.workbench.bot;
export function BotMessageEvent({ event, cards, onExchange }: { event: BotChatEventGroup; cards: BotCard[]; onExchange(message: BotMessageLink): void }) {
  const peer = cards.find(bot => bot.id === chatEventPeer(event));
  const direction = event.incoming ? '消息来自' : '已发消息给';
  const singleClass = event.incoming ? 'bot-incoming-event' : 'bot-handoff-event';
  const button = <button type="button" className={`bot-message-event ${event.count > 1 ? 'bot-exchange-summary' : singleClass}`} data-bot-event-id={event.message.id} title="查看双方往来" onClick={() => onExchange(event.message)}>
    <span>{event.count > 1 ? `${event.count} 条消息往来` : direction}</span><BotAvatar avatar={peer?.avatar ?? 'ring:blue'} small /><span className="bot-message-event-name">{peer?.name ?? 'Bot'}</span><ArrowRight size={14} />
  </button>;
  return event.incoming ? <div className="bot-incoming-event-row">{button}</div> : button;
}
export function BotIncomingMessage({ task, cards, onExchange, onLayout }: { task: BotTask; cards: BotCard[]; onExchange(message: BotMessageLink): void; onLayout(): void }) {
  const [message, setMessage] = useState<BotMessage>(), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void api.getTask(task.id).then(detail => {
      if (live) { setMessage(detail.messages.find(item => item.id === task.sourceMessageId && item.toBotId === task.botId)); setError(''); }
    }, cause => { if (live) setError(errorText(cause)); });
    return () => { live = false; };
  }, [task.id, task.sourceMessageId, task.botId, reload]);
  useLayoutEffect(() => onLayout(), [message, error, onLayout]);
  if (error) return <button className="bot-message-event bot-incoming-event" title={error} onClick={() => setReload(value => value + 1)}>重新读取消息来源</button>;
  if (!message) return null;
  return <BotMessageEvent event={{ message, incoming: true, count: 1 }} cards={cards} onExchange={onExchange} />;
}

type CollaborationState = { detail?: BotCollaboration; error?: string };

export function useChatCollaborations(rootIds: ReadonlySet<string>) {
  const key = [...rootIds].sort().join(',');
  const [records, setRecords] = useState(new Map<string, CollaborationState>());
  const reload = useRef<(rootId: string) => void>(() => {});
  useEffect(() => {
    let live = true;
    const roots = new Set(key ? key.split(',') : []);
    const requests = new Map<string, number>();
    setRecords(previous => {
      const active = new Map([...previous].filter(([id]) => roots.has(id)));
      return active.size === previous.size ? previous : active;
    });
    const load = (id: string) => {
      if (!live || !roots.has(id)) return;
      const ticket = (requests.get(id) ?? 0) + 1;
      requests.set(id, ticket);
      const publish = (update: CollaborationState) => {
        if (live && requests.get(id) === ticket) setRecords(previous => new Map(previous).set(id, { ...previous.get(id), ...update }));
      };
      void api.getCollaboration(id).then(detail => publish({ detail, error: '' }), cause => publish({ error: errorText(cause) }));
    };
    reload.current = load;
    roots.forEach(load);
    const off = api.onChanged(event => {
      if (event.kind === 'host') roots.forEach(load);
      else if (event.kind === 'task' && event.taskId) load(event.taskId);
    });
    return () => { live = false; off(); };
  }, [key]);
  return { records, refresh: (rootId: string) => reload.current(rootId) };
}

export const isCollaborationTask = (task: BotTask) => !task.parentTaskId && !!(task.dependencyIds.length || task.messageIds?.length);

export function projectBotCollaboration(task: BotTask, detail: BotCollaboration, entryId?: string, visibleEntryIds?: ReadonlySet<string>) {
  const showActions = !entryId || entryId === task.assistantEntryId;
  const blocked = showActions ? detail.tasks.filter(item => item.status === 'waiting_resource' || item.id !== task.id && ['failed', 'interrupted'].includes(item.status)) : [];
  const replyIds = task.assistantEntryIds ?? (task.assistantEntryId ? [task.assistantEntryId] : []);
  const anchor = (message: BotMessage) => message.sourceAssistantEntryId && replyIds.includes(message.sourceAssistantEntryId) ? message.sourceAssistantEntryId : replyIds[0];
  const actions = detail.actions.flatMap(action => {
    if (['delegate', 'artifact'].includes(action.kind)) return [];
    const request = detail.messages.find(message => message.kind === 'request' && message.taskId === action.taskId && message.fromBotId === task.botId);
    const ownEntry = task.todoActionEntryIds?.[action.id];
    const show = request ? !entryId || anchor(request) === entryId
      : ownEntry && visibleEntryIds?.has(ownEntry) ? !entryId || ownEntry === entryId : showActions;
    if (!show) return [];
    const owner = action.taskId === task.id ? task : detail.tasks.find(item => item.id === action.taskId);
    const current = actionForConversation(action, owner);
    return current ? [current] : [];
  });
  const events = detail.messages.filter(message => {
    if (['request', 'question', 'notification'].includes(message.kind)) return message.fromBotId === task.botId && (!entryId || anchor(message) === entryId);
    // Legacy runs overwrote one reply. Keep their recorded events before the final
    // reply without inventing earlier text or moving events on a status change.
    return !task.assistantEntryIds?.length && message.toBotId === task.botId && (message.parentTaskId === task.id || message.originTaskId === task.id);
  }).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
    .map(message => ({ message, incoming: message.toBotId === task.botId }));
  return { events, actions, blocked };
}

export function BotCollaborationCard({ task, entryId, visibleEntryIds, state, groups, cards, copyBusy, onExchange, onAmend, onLayout, onRefresh, onOpenWork, onOpenTodo }: {
  task: BotTask; entryId?: string; visibleEntryIds?: ReadonlySet<string>; state?: CollaborationState; groups?: readonly BotChatEventGroup[];
  cards: BotCard[]; copyBusy: boolean; onExchange(message: BotMessageLink): void;
  onAmend(target: NonNullable<BotSubmit['target']>, label: string): void; onLayout(): void; onRefresh(): void; onOpenWork(id: string): void; onOpenTodo(id?: string): void;
}) {
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState(false);
  const detail = state?.detail, error = actionError || state?.error;
  useLayoutEffect(() => onLayout(), [detail, error, onLayout]);
  const refresh = () => { setActionError(''); onRefresh(); };
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await job(); refresh(); } catch (cause) { setActionError(errorText(cause)); } finally { setBusy(false); } };
  if (!detail) return error ? <p className="bot-error" role="alert">{error}<button onClick={refresh}>重试</button></p> : <p className="bot-help" role="status">正在读取协作…</p>;
  const { events, actions, blocked } = projectBotCollaboration(task, detail, entryId, visibleEntryIds);
  const rows = groups ?? events.map(event => ({ ...event, count: 1 }));
  if (!rows.length && !actions.length && !blocked.length && !error) return null;
  return <section className="bot-collaboration-inline" aria-label="协作与确认">
    {rows.map(event => <BotMessageEvent key={event.message.id} event={event} cards={cards} onExchange={onExchange} />)}
    {actions.map(action => {
      const owner = cards.find(bot => bot.id === action.botId);
      const amend = action.status === 'pending' && <button type="button" className="bot-text-button" onClick={() => onAmend({
        intent: 'amend', rootTaskId: task.rootTaskId, taskId: action.taskId, actionId: action.id, expectedActionRevision: action.revision,
      }, detail.tasks.find(item => item.id === action.taskId)?.title ?? task.title)}>补充此项</button>;
      return <div key={action.id} className="bot-projected-action"><ActionCard action={action} owner={owner}
        onOpenWork={() => onOpenWork(action.taskId)} onOpenTodo={onOpenTodo} refresh={refresh} copyBusy={copyBusy} amend={amend} conversation /></div>;
    })}
    {blocked.map(item => <BotOperationCard key={item.id} className="bot-collaboration-blocked"
      label={item.title} summary={cards.find(bot => bot.id === item.botId)?.name} icon={<WarningCircle size={18} />}
      status={botStatusLabel[item.status]} tone={item.status === 'waiting_resource' ? 'pending' : 'error'} initialOpen>
      <BotOperationSubject title={cards.find(bot => bot.id === item.botId)?.name || item.title}>{item.reason}</BotOperationSubject>
      <div className="bot-action-buttons"><button type="button" disabled={busy} onClick={() => void run(() => api.cancelTask(item.id, item.revision))}>取消这项</button>
        <button type="button" className="primary" disabled={busy} onClick={() => void run(() => api.retryTask(item.id, item.revision))}>继续</button></div>
    </BotOperationCard>)}
    {error && <p className="bot-error" role="alert">{error}<button onClick={refresh}>重新读取</button></p>}
  </section>;
}

export function BotExchangeView({ botA, botB, anchorMessageId, cards }: { botA: string; botB: string; anchorMessageId?: string; cards: BotCard[] }) {
  const [data, setData] = useState<BotExchange>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [query, setQuery] = useState<BotExchangeQuery>({ anchorMessageId });
  const container = useRef<HTMLDivElement>(null);
  const locate = useRef(true);
  useEffect(() => { setQuery({ anchorMessageId }); }, [botA, botB, anchorMessageId]);
  useEffect(() => {
    let live = true, timer: ReturnType<typeof setTimeout> | undefined; setBusy(true); locate.current = true;
    const load = () => { void api.getBotExchange(botA, botB, query).then(value => { if (live) { setData(value); setError(''); } }, cause => { if (live) setError(errorText(cause)); }).finally(() => { if (live) setBusy(false); }); };
    load(); const off = api.onChanged(event => { if (event.kind === 'host' || event.kind === 'task' && (!event.botId || [botA, botB].includes(event.botId))) { clearTimeout(timer); timer = setTimeout(load, 100); } });
    return () => { live = false; clearTimeout(timer); off(); };
  }, [botA, botB, query]);
  useLayoutEffect(() => { if (!data || !locate.current) return; locate.current = false; const target = query.anchorMessageId && container.current?.querySelector<HTMLElement>(`[data-message-id="${query.anchorMessageId}"]`); if (target) target.scrollIntoView({ block: 'center' }); else container.current?.scrollIntoView({ block: 'start' }); }, [data]);
  return <div className="bot-exchange" ref={container} aria-label="双方消息记录" aria-busy={busy}>
    {!data && !error && <p className="bot-empty" role="status">正在读取消息往来</p>}
    {data?.hasEarlier && <button className="bot-text-button bot-history-page" disabled={busy} onClick={() => setQuery({ before: data.messages[0].id })}>更早的消息</button>}
    {data?.messages.map(message => {
      const from = cards.find(bot => bot.id === message.fromBotId);
      return <article key={message.id} data-message-id={message.id} data-anchor={message.id === anchorMessageId || undefined} className="bot-exchange-message">
        <strong className="bot-exchange-speaker">{from?.name ?? 'Bot'}</strong>
        <BotAvatar avatar={from?.avatar ?? 'ring:blue'} small />
        <div className="ai-response"><ReplyBubble text={message.content} /></div>
        <div className="bot-exchange-meta"><BotMessageTime value={message.createdAt} />{!message.deliveredAt && <span>待投递</span>}</div>
      </article>;
    })}
    {data?.hasLater && <button className="bot-text-button bot-history-page" disabled={busy} onClick={() => setQuery({ after: data.messages.at(-1)!.id })}>后续消息</button>}
    {data && !data.messages.length && <p className="bot-empty">还没有双方往来</p>}
    {error && <p className="bot-error" role="alert">{error}<button onClick={() => setQuery({ ...query })}>重试</button></p>}
  </div>;
}
