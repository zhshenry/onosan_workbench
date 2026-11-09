import { useState, type Ref } from 'react';
import { Check, Copy, GearSix, X } from '@phosphor-icons/react';
import { AGENT_LABELS, agentMessageStatus, agentPending } from '../../shared/agent-message-contracts';
import type { IslandState } from '../../shared/island-contracts';
import { IconButton, Segmented } from '../ui/controls';
import { IslandMascot } from '../ui/IslandMascot';
import './island-agent-messages.css';

type Run = (action: () => Promise<unknown>) => Promise<boolean>;
export function IslandMessageEntry({ state, onClick, buttonRef }: { state: IslandState; onClick(): void; buttonRef?: Ref<HTMLButtonElement> }) {
  const messages = state.agentMessages ?? [], unread = messages.filter(message => message.readAt === null).length;
  const reminders = state.reminders.filter(reminder => reminder.kind !== 'agent').length;
  const pending = messages.some(agentPending), count = unread + reminders;
  if (!state.settings.mascotEnabled && !messages.length && !reminders) return null;
  return <button ref={buttonRef} type="button" className="island-mascot-entry" aria-label={`打开待办助手，消息：${unread} 条 Agent 未读${pending ? '，有待授权' : ''}${reminders ? `，${reminders} 条事项提醒` : ''}`} aria-haspopup="dialog" onClick={onClick} title="点击伙伴对话或查看消息">
    <IslandMascot moving={state.settings.mascotEnabled && state.settings.mascotMotion && !state.quiet} />
    {count > 0 ? <span className="island-message-badge" aria-hidden="true">{count > 99 ? '99+' : count}</span> : pending && <span className="island-message-pending-dot" aria-hidden="true" />}
  </button>;
}

export function IslandAgentMessages({ state, busy, run, close, showReminders, now, embedded = false }: { state: IslandState; busy: boolean; run: Run; close(): void; showReminders(): void; now: number; embedded?: boolean }) {
  const messages = state.agentMessages ?? [], unread = messages.filter(message => message.readAt === null).length;
  const pending = messages.filter(agentPending).length, reminders = state.reminders.filter(reminder => reminder.kind !== 'agent').length;
  const [filter, setFilter] = useState(unread ? 'unread' : 'all'), [copied, setCopied] = useState('');
  const visible = messages.filter(message => filter === 'all' || message.readAt === null);
  const api = window.workbench.island;
  return <>
    {!embedded && <header className="island-messages-header"><div><h2 id="island-messages-title">Agent 消息</h2><small role="status">{unread} 条未读{pending ? ` · ${pending} 条待授权` : ''}</small></div><IconButton label="关闭消息列表" onClick={close}><X size={16} /></IconButton></header>}
    <div className="island-messages-filters"><div className="island-message-filter-row">
      <Segmented value={filter} onChange={setFilter} aria-label="消息范围" options={[{ value: 'unread', label: `未读 ${unread}` }, { value: 'all', label: '全部' }]} />
      <button type="button" className="island-text-button island-messages-read-all" disabled={busy || !unread} title="将当前未读消息全部标为已读，待授权事项仍需处理" onClick={() => void run(() => api.agentReadAll(messages.filter(message => message.readAt === null).map(({ id, updatedAt }) => ({ id, updatedAt }))))}><Check size={14} />全部已读</button>
    </div>{pending > 0 && <button className="island-text-button" onClick={() => setFilter('all')}>待授权 {pending}</button>}{reminders > 0 && <button className="island-text-button" onClick={showReminders}>事项提醒 {reminders}</button>}</div>
    <div className="island-message-list">
      {visible.map(message => <article key={message.id} className="island-agent-message" data-provider={message.provider} data-read={message.readAt !== null}>
        <span className="island-message-unread" data-unread={message.readAt === null} aria-label={message.readAt === null ? '未读' : '已读'} />
        <span className="island-message-provider-marker" aria-hidden="true"><IslandMascot /></span>
        <div className="island-message-copy"><small title={message.workspace}>{AGENT_LABELS[message.provider]} · {message.project}</small><b title={message.title}>{message.title}</b>{message.detail && <p>{message.detail}</p>}<div className="island-message-meta"><span data-status={agentPending(message) ? 'approval' : message.kind === 'approval' ? 'resolved' : message.kind === 'reply' && message.readAt !== null ? 'read' : message.kind}>{agentMessageStatus(message)}</span>{message.readAt !== null && agentPending(message) && <span>已读</span>}<time dateTime={new Date(message.updatedAt).toISOString()}>{now - message.updatedAt < 60000 ? '刚刚' : now - message.updatedAt < 3600000 ? `${Math.floor((now - message.updatedAt) / 60000)}分钟前` : new Date(message.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div></div>
        <div className="island-message-actions"><button className={agentPending(message) ? 'primary' : ''} disabled={busy} title={message.provider === 'cursor' ? '打开对应项目；可复制会话编号，在 Cursor 历史中定位' : '在 Codex 打开原对话'} onClick={() => void run(() => api.agentOpen(message.id))}>{message.provider === 'cursor' ? '打开项目' : agentPending(message) ? '去处理' : '查看对话'}</button><div>{message.readAt === null && <IconButton label={`标为已读：${message.title}`} disabled={busy} onClick={() => void run(() => api.agentRead(message.id))}><Check size={14} /></IconButton>}{message.provider === 'cursor' && <IconButton label={copied === message.id ? '已复制会话编号' : '复制会话编号'} disabled={busy} onClick={() => void run(() => window.workbench.clipboard.write(message.sessionId)).then(ok => { if (ok) setCopied(message.id); })}><Copy size={14} /></IconButton>}</div></div>
      </article>)}
      {!visible.length && <div className="island-message-empty"><p>{filter === 'unread' ? '没有未读消息' : '还没有 Agent 消息'}</p>{!messages.length && <p className="island-message-setup-help">消息提醒需要单独接入。Codex 开启后，还需在设置 → Hooks 中审核并信任。</p>}{messages.length ? <button onClick={() => setFilter('all')}>查看全部消息</button> : <button onClick={() => void run(() => api.navigate({ view: 'settings-island', section: 'agents' }))}><GearSix size={14} />接入与管理消息提醒</button>}</div>}
    </div>
  </>;
}
