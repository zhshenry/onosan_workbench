import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import { ArrowLeft, ClockCounterClockwise, X } from '@phosphor-icons/react';
import type { BotCard, BotOpen, BotTask } from '../../shared/bot-contracts';
import type { ChatEntry, ChatSession } from '../../shared/todo-contracts';
import { errorText, IconButton } from '../ui/controls';
import { BotTaskDetail } from './BotTasks';

type Archive = BotOpen['history'][number];
const dateFormat = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const dateLabel = (value: string) => Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : '日期不可用';

function ArchivedConversation({ item, canReference, onReference, renderEntry }: {
  item: Archive; canReference: boolean; onReference(chat: ChatSession): void; renderEntry(entry: ChatEntry): ReactNode;
}) {
  const [chat, setChat] = useState<ChatSession>(), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(20), [copyError, setCopyError] = useState('');
  useEffect(() => {
    let live = true;
    setError('');
    void window.workbench.ai.chatOpen(item.chatId).then(value => { if (live) setChat(value); }, cause => { if (live) setError(errorText(cause)); });
    return () => { live = false; };
  }, [item.chatId, attempt]);
  if (!chat) return error
    ? <p className="bot-error" role="alert">{error} <button onClick={() => setAttempt(value => value + 1)}>重试</button></p>
    : <p className="bot-work-muted" role="status">正在读取历史对话…</p>;
  return <>
    <h3>{chat.title || '历史对话'}</h3>
    <div className="bot-history-banner"><span>只读历史</span><button disabled={!item.canReference || !canReference} onClick={() => onReference(chat)}>在主对话引用</button></div>
    {chat.draft && <section className="bot-history-draft"><h4>历史未发送草稿</h4><p>{chat.draft}</p><button onClick={() => { setCopyError(''); void navigator.clipboard.writeText(chat.draft).catch(cause => setCopyError(errorText(cause))); }}>复制这段草稿</button>{copyError && <p role="alert">{copyError}</p>}</section>}
    {chat.entries.length > limit && <button className="bot-text-button" onClick={() => setLimit(value => value + 20)}>查看更早消息</button>}
    {chat.entries.length ? chat.entries.slice(-limit).map(renderEntry) : <p className="bot-work-muted">没有历史消息</p>}
  </>;
}

export function BotActivity({ ref, embedded = false, history, cards, taskId, onBack, close, reply, copyBusy, canReference, onReference, renderEntry }: {
  ref: Ref<HTMLElement>; history?: Archive[]; cards: BotCard[];
  embedded?: boolean; taskId?: string; onBack(): void; close(): void;
  reply(task: BotTask): void; copyBusy: boolean;
  canReference: boolean; onReference(chat: ChatSession): void; renderEntry(entry: ChatEntry): ReactNode;
}) {
  const [archiveId, setArchiveId] = useState<string>();
  const [taskTrail, setTaskTrail] = useState<string[]>([]);
  const childTaskId = taskTrail.at(-1);
  const archive = history?.find(item => item.chatId === archiveId);
  const heading = useRef<HTMLHeadingElement>(null);
  const archiveTrigger = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => {
    const row = archiveTrigger.current;
    (row?.isConnected && !archiveId ? row : heading.current)?.focus({ preventScroll: true });
  }, [archiveId, childTaskId]);
  const back = () => {
    if (childTaskId) setTaskTrail(trail => trail.slice(0, -1));
    else if (archiveId) setArchiveId(undefined);
    else onBack();
  };
  const title = childTaskId ? '子任务详情' : taskId ? '工作详情' : archiveId ? '历史对话' : '历史记录';
  const backLabel = childTaskId ? '返回上级任务' : taskId ? '返回对话' : archiveId ? '返回历史记录' : '返回 Bot 资料';
  const Surface = embedded ? 'section' : 'aside';
  return <Surface ref={ref} id={embedded ? undefined : 'bot-inspector'} className={embedded ? 'bot-activity bot-activity-embedded' : 'bot-inspector bot-activity'} aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); back(); }
  }}>
    <header className="bot-activity-header">
      <button type="button" className="bot-text-button" onClick={back}><ArrowLeft size={15} aria-hidden="true" />{backLabel}</button>
      <h2 ref={heading} tabIndex={-1}>{title}</h2>
      {!embedded && <IconButton label="关闭 Bot 侧栏" onClick={close}><X size={17} /></IconButton>}
    </header>
    {taskId ? <div className="bot-activity-detail" key={childTaskId ?? taskId}>
      <BotTaskDetail taskId={childTaskId ?? taskId} cards={cards} back={back} backLabel="" embedded reply={reply} copyBusy={copyBusy}
        onOpenChild={id => setTaskTrail(trail => [...trail, id])} />
    </div> : <>
      <div className="bot-activity-rows" hidden={!!archiveId}>
        {(history ?? []).map(item => <button key={item.chatId} type="button" className="bot-work-row" title={item.title} onClick={event => {
          archiveTrigger.current = event.currentTarget;
          setArchiveId(item.chatId);
        }}>
          <ClockCounterClockwise size={17} aria-hidden="true" />
          <span><strong>{item.title || '历史对话'}</strong><small>{[dateLabel(item.updatedAt), item.reason].filter(Boolean).join(' · ')}</small></span>
        </button>)}
      </div>
      {archiveId && <div className="bot-activity-detail" key={archiveId}>
        {archive ? <ArchivedConversation item={archive} canReference={canReference} onReference={onReference} renderEntry={renderEntry} />
          : <p className="bot-work-muted">此历史记录已不可用</p>}
      </div>}
    </>}
  </Surface>;
}
