import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowRight, CaretRight } from '@phosphor-icons/react';
import type { BotCard, BotCollaboration, BotExchange, BotExchangeQuery, BotMessage, BotSubmit, BotTask } from '../../shared/bot-contracts';
import { chatEventPeer, type BotChatEventGroup, type BotMessageLink } from '../bot-chat-events';
import { errorText } from '../ui/controls';
import { ActionCard, botStatusLabel } from './BotTasks';
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

export function projectBotCollaboration(task: BotTask, detail: BotCollaboration, entryId?: string) {
  const showActions = !entryId || entryId === task.assistantEntryId;
  const blocked = showActions ? detail.tasks.filter(item => ['failed', 'interrupted', 'waiting_resource'].includes(item.status)) : [];
  const replyIds = task.assistantEntryIds ?? (task.assistantEntryId ? [task.assistantEntryId] : []);
  const anchor = (message: BotMessage) => message.sourceAssistantEntryId && replyIds.includes(message.sourceAssistantEntryId) ? message.sourceAssistantEntryId : replyIds[0];
  const actions = detail.actions.filter(action => {
    if (['delegate', 'artifact'].includes(action.kind)) return false;
    const request = detail.messages.find(message => message.kind === 'request' && message.taskId === action.taskId && message.fromBotId === task.botId);
    return request ? !entryId || anchor(request) === entryId : showActions;
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

export function BotCollaborationCard({ task, entryId, state, groups, cards, copyBusy, onExchange, onAmend, onLayout, onRefresh }: {
  task: BotTask; entryId?: string; state?: CollaborationState; groups?: readonly BotChatEventGroup[];
  cards: BotCard[]; copyBusy: boolean; onExchange(message: BotMessageLink): void;
  onAmend(target: NonNullable<BotSubmit['target']>, label: string): void; onLayout(): void; onRefresh(): void;
}) {
  const [actionError, setActionError] = useState(''), [busy, setBusy] = useState(false);
  const detail = state?.detail, error = actionError || state?.error;
  useLayoutEffect(() => onLayout(), [detail, error, onLayout]);
  const refresh = () => { setActionError(''); onRefresh(); };
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await job(); refresh(); } catch (cause) { setActionError(errorText(cause)); } finally { setBusy(false); } };
  if (!detail) return error ? <p className="bot-error" role="alert">{error}<button onClick={refresh}>重试</button></p> : <p className="bot-help" role="status">正在读取协作…</p>;
  const { events, actions, blocked } = projectBotCollaboration(task, detail, entryId);
  const rows = groups ?? events.map(event => ({ ...event, count: 1 }));
  if (!rows.length && !actions.length && !blocked.length && !error) return null;
  return <section className="bot-collaboration-inline" aria-label="协作与确认">
    {rows.map(event => <BotMessageEvent key={event.message.id} event={event} cards={cards} onExchange={onExchange} />)}
    {actions.map(action => {
      const owner = cards.find(bot => bot.id === action.botId);
      const name = owner?.name ?? 'Bot';
      const content = <ActionCard action={action} refresh={refresh} copyBusy={copyBusy} />;
      if (['applied', 'discarded', 'undone'].includes(action.status)) {
        const status = action.status === 'applied' ? '已处理' : action.status === 'undone' ? '已撤销' : '已保留原内容';
        const label = action.kind === 'question' ? '补充回答' : action.kind === 'todo' ? '待办修改' : action.kind === 'copy' ? '文章修改' : '定时任务';
        return <div key={action.id} className="bot-projected-action"><details>
          <summary>
            <BotAvatar avatar={owner?.avatar ?? 'ring:blue'} small />
            <span className="bot-projected-receipt-name" title={name}>{name}</span>{' '}
            <span className="bot-projected-receipt-status">{status} · {label}</span>
            <CaretRight size={13} className="ai-activity-caret" aria-hidden="true" />
          </summary>
          {content}
        </details></div>;
      }
      return <div key={action.id} className="bot-projected-action">
        <div className="bot-projected-owner"><small>{name}</small>
          {action.status === 'pending' && <button type="button" className="bot-text-button" onClick={() => onAmend({
            intent: 'amend', rootTaskId: task.rootTaskId, taskId: action.taskId, actionId: action.id, expectedActionRevision: action.revision,
          }, detail.tasks.find(item => item.id === action.taskId)?.title ?? task.title)}>补充此项</button>}
        </div>
        {content}
      </div>;
    })}
    {blocked.map(item => <div className="bot-collaboration-blocked" key={item.id}><p>{cards.find(bot => bot.id === item.botId)?.name} · {item.reason || botStatusLabel[item.status]}</p><button disabled={busy} onClick={() => void run(() => api.retryTask(item.id, item.revision))}>继续处理</button><button disabled={busy} onClick={() => void run(() => api.cancelTask(item.id, item.revision))}>取消</button></div>)}
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
    <p className="bot-exchange-hint">双方的连续往来 · 只读</p>
    {data?.hasEarlier && <button className="bot-text-button" disabled={busy} onClick={() => setQuery({ before: data.messages[0].id })}>更早的消息</button>}
    {data?.messages.map(message => {
      const from = cards.find(bot => bot.id === message.fromBotId);
      return <article key={message.id} data-message-id={message.id} data-anchor={message.id === anchorMessageId || undefined} className="bot-exchange-message"><BotAvatar avatar={from?.avatar ?? 'ring:blue'} small /><div><header><strong>{from?.name ?? 'Bot'}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></header><p>{message.content}</p><small>{message.deliveredAt ? '已投递' : '待投递'}</small></div></article>;
    })}
    {data?.hasLater && <button className="bot-text-button" disabled={busy} onClick={() => setQuery({ after: data.messages.at(-1)!.id })}>后续消息</button>}
    {data && !data.messages.length && <p className="bot-empty">还没有双方往来</p>}
    {error && <p className="bot-error" role="alert">{error}<button onClick={() => setQuery({ ...query })}>重试</button></p>}
  </div>;
}
