import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle, CheckSquare } from '@phosphor-icons/react';
import type { BotAction, BotBridge, BotCard, BotSchedule, BotTask, BotTaskStatus } from '../../shared/bot-contracts';
import type { AIPlan, ChatEntry } from '../../shared/todo-contracts';
import type { CopyAiAction } from '../../shared/copy-contracts';
import type { ProposalPreview, ProposalReceipt } from '../../shared/todo-proposal';
import { errorText } from '../ui/controls';
import { formatSchedule } from './BotSchedules';
import { TodoProposalCard } from './TodoProposalCard';
import { AiResponse } from './AiResponse';
import { BotAvatar } from './BotAvatar';

const api = window.workbench.bot;
export const botStatusLabel: Record<BotTaskStatus, string> = { queued: '等待执行', running: '正在处理', waiting_user: '等待你确认', waiting_bot: '正在协作', waiting_resource: '等待资源', interrupted: '已中断', completed: '已完成', failed: '执行失败', cancelled: '已取消' };
export function BotTaskCard({ task, cards, open, reply }: { task: BotTask; cards: BotCard[]; open?(): void; reply?(): void }) {
  const owner = cards.find(bot => bot.id === task.botId);
  return <section className="bot-task-card" data-status={task.status}><CheckSquare size={21} /><div>{open ? <button className="bot-task-title" onClick={open}>{task.title}</button> : <strong className="bot-task-title">{task.title}</strong>}<p>{botStatusLabel[task.status]}{task.reason ? ` · ${task.reason}` : ''}</p><div className="bot-task-links">{owner && <span><BotAvatar avatar={owner.avatar} small />{owner.name}</span>}{open ? <button onClick={open}>{task.dependencyIds.length ? '协作记录' : '查看进度'}<ArrowRight size={14} /></button> : null}{reply && <button onClick={reply}>在对话中继续</button>}</div></div></section>;
}

function ActionReceiptSummary({ action, owner, status }: { action: BotAction; owner?: BotCard; status: string }) {
  const name = owner?.name ?? 'Bot';
  const title = action.kind === 'question' ? '补充回答' : action.kind === 'todo' ? '待办修改' : action.kind === 'copy' ? '文章修改' : '定时任务';
  return <summary><span className="bot-action-completed-owner"><BotAvatar avatar={owner?.avatar ?? 'ring:blue'} small /><span title={name}>{name}</span></span>{' '}
    <span>{title} · {action.status === 'failed' ? <strong className="bot-outcome-error">{status}</strong> : status}</span>
  </summary>;
}

export function ActionCard({ action, owner, onOpenWork, refresh, copyBusy, questionInReply = false }: { action: BotAction; owner?: BotCard; onOpenWork?(): void; refresh(): void; copyBusy: boolean; questionInReply?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [answer, setAnswer] = useState('');
  const submitting = useRef(false);
  const actions = action.kind === 'copy' ? action.payload.actions as CopyAiAction[] : [];
  const [indices, setIndices] = useState<number[]>(() => actions.findIndex(a => a.kind === 'edit') >= 0 ? [actions.findIndex(a => a.kind === 'edit')] : []);
  const run = async (operation: () => Promise<unknown>) => { if (submitting.current) return; submitting.current = true; setBusy(true); setError(''); try { const result = await operation(); refresh(); return result; } catch (cause) { setError(errorText(cause)); throw cause; } finally { submitting.current = false; setBusy(false); } };
  const submit = (approved: boolean, chosen?: number[]) => run(() => api.answerAction(action.id, action.revision, { approved, indices: chosen, text: answer }));
  if (action.kind === 'delegate' || action.kind === 'artifact') return null;
  if (action.status === 'failed' && onOpenWork) return <details className="bot-action-completed" data-action-status="failed">
    <ActionReceiptSummary action={action} owner={owner} status={action.kind === 'question' ? '提交失败' : '应用失败'} />
    <div className="bot-action-failure">
      <p className="bot-outcome-reason">{action.error || '本次操作未完成。'}</p>
      <button type="button" className="bot-text-button" onClick={onOpenWork}>查看工作详情<ArrowRight size={14} aria-hidden="true" /></button>
    </div>
  </details>;
  if (action.status === 'superseded') return <section className="bot-action"><p className="bot-help" role="status">已接收补充，正在更新建议。原版本已停用。</p><details><summary>查看原建议</summary><AiResponse entry={{ id: action.id, role: 'assistant', content: action.kind === 'question' ? String(action.payload.question) : action.kind === 'todo' ? (action.payload.plan as AIPlan).message : String(action.payload.title ?? '') }} /></details></section>;
  if (action.status === 'unknown') return <section className="bot-action"><h3>写入结果待核对</h3><p>{action.error || '后台中断时尚未收到写入回执，不会重复执行。'}</p><p className="bot-help">请在原工作区核对实际内容，再记录结果。{action.payload.undoing ? '本次待核对的是撤销操作。' : ''}</p><label>核对说明<textarea rows={2} value={answer} onChange={event => setAnswer(event.target.value)} /></label><div className="bot-action-buttons"><button disabled={busy || !answer.trim()} onClick={() => void run(() => api.reconcileAction(action.id, action.revision, 'not_applied', answer)).catch(() => {})}>确认未写入</button><button disabled={busy || !answer.trim()} onClick={() => void run(() => api.reconcileAction(action.id, action.revision, 'applied', answer)).catch(() => {})}>确认已写入</button></div>{error && <p role="alert" className="bot-error">{error}</p>}</section>;
  if (action.kind === 'todo') {
    const plan = action.payload.plan as AIPlan;
    const receipt = action.receipt as Partial<ProposalReceipt> & { supersededBy?: string } | undefined;
    const entry: ChatEntry = { id: action.id, role: 'assistant', content: '', proposal: { ...plan, token: action.id, preview: action.payload.preview as ProposalPreview[] | undefined }, actionState: ['pending', 'executing'].includes(action.status) ? 'pending' : action.status === 'applied' ? 'applied' : receipt?.supersededBy ? 'revised' : 'discarded', todoReceipt: action.status === 'applied' && Array.isArray(receipt?.appliedIndices) ? receipt as ProposalReceipt : undefined };
    return <><TodoProposalCard entry={entry} busy={busy || action.status === 'executing'} apply={(_token, selected) => submit(true, selected)} discard={() => submit(false)} />{action.status === 'failed' && <p className="bot-error">{action.error}</p>}</>;
  }
  const pending = action.status === 'pending';
  if (action.kind === 'question') {
    const options = (action.payload.options ?? []) as { label: string; description?: string }[];
    const question = String(action.payload.question), receipt = action.receipt as { answer?: string } | undefined;
    const skipped = (action.payload.answer as { text?: string } | undefined)?.text === '';
    return <section className="bot-action bot-question" aria-label={question} aria-busy={busy}>
      <h3>{pending && questionInReply ? options.length ? '请选择一项' : '请输入回答' : question}</h3>
      {pending ? <>
        {!!options.length && <div className="bot-question-options" role="group" aria-label="可选回答">{options.map((option, index) => <button key={option.label} type="button" disabled={busy} aria-label={option.label} aria-describedby={option.description ? `${action.id}-option-${index}` : undefined} onClick={() => void run(() => api.answerAction(action.id, action.revision, { text: option.label })).catch(() => {})}><span className="bot-question-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span><span><strong>{option.label}</strong>{option.description && <small id={`${action.id}-option-${index}`}>{option.description}</small>}</span></button>)}</div>}
        <form className="bot-question-other" onSubmit={event => { event.preventDefault(); if (!busy && answer.trim()) void submit(true).catch(() => {}); }}><label><span>{options.length ? '其他' : '你的回答'}</span><input type="text" disabled={busy} placeholder={options.length ? '输入其他回答' : '输入你的回答'} value={answer} onChange={event => setAnswer(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} /></label><button type="submit" className="bot-button primary" aria-label="提交回答" disabled={busy || !answer.trim()}>{busy ? '提交中…' : '提交'}</button></form>
        <div className="bot-action-buttons"><button disabled={busy} onClick={() => void submit(false).catch(() => {})}>取消本次工作</button><button disabled={busy} onClick={() => void run(() => api.answerAction(action.id, action.revision, { text: '' })).catch(() => {})}>跳过问题</button></div>
      </> : <p className="bot-action-receipt" role="status">{action.status === 'applied' ? skipped ? '已跳过' : `已回答：${receipt?.answer || '回答已提交'}` : action.status === 'discarded' ? '已取消' : action.status === 'executing' ? '正在提交回答…' : '回答未提交'}</p>}
      {error && <p role="alert" className="bot-error">{error}<button onClick={refresh}>重新读取</button></p>}
    </section>;
  }
  return <section className="bot-action" aria-busy={busy}><h3>{action.kind === 'copy' ? '文章修改建议' : '确认定时任务'}</h3>
    {action.kind === 'copy' && <><p className="bot-help">原稿：{String(action.payload.title || '未命名文章')}</p>{actions.map((item, index) => <div key={index} className="bot-copy-choice"><label><input type="checkbox" checked={indices.includes(index)} disabled={!pending || busy || copyBusy} onChange={event => setIndices(old => event.target.checked ? [...old.filter(i => actions[i].kind !== item.kind), index] : old.filter(i => i !== index))} />{item.kind === 'edit' ? '替换正文' : item.title}</label>{item.kind === 'edit' && <><p className="bot-help">{item.notes.join(' · ')}</p><details><summary>查看原文与改稿</summary><h4>原文</h4><AiResponse entry={{ id: 'before', role: 'assistant', content: String(action.payload.body || '（空白）') }} /><h4>改稿</h4><AiResponse entry={{ id: 'after', role: 'assistant', content: item.text }} /></details></>}</div>)}{copyBusy && pending && <p className="bot-help">工作区原稿尚未保存，请等待保存完成后应用。</p>}</>}
    {action.kind === 'schedule' && <><strong>{String(action.payload.title)}</strong><p>{String(action.payload.prompt)}</p><p className="bot-help">{formatSchedule(action.payload.spec as BotSchedule['spec'])} · 本机开机运行，错过时合并补跑一次</p></>}
    {pending ? <div className="bot-action-buttons"><button disabled={busy} onClick={() => void submit(false).catch(() => {})}>取消</button><button className="primary" disabled={busy || action.kind === 'copy' && (copyBusy || !indices.length)} onClick={() => void submit(true, action.kind === 'copy' ? indices : undefined).catch(() => {})}>{busy ? '处理中…' : '确认应用'}</button></div> : <p className="bot-help">{action.status === 'applied' ? '已应用' : action.status === 'undone' ? '已撤销' : action.status === 'executing' ? '正在提交，请勿重复操作' : action.status === 'failed' ? action.error : '已保留原内容'}</p>}
    {action.kind === 'copy' && action.status === 'applied' && !(action.receipt as { manual?: boolean })?.manual && <button className="bot-text-button" disabled={busy || copyBusy} onClick={() => void run(() => api.undoAction(action.id, action.revision)).catch(() => {})}>撤销本次修改</button>}
    {error && <p role="alert" className="bot-error">{error}</p>}
  </section>;
}

export function BotChatActions({ task, cards, copyBusy, open, onLayout, replyText }: { task: BotTask; cards: BotCard[]; copyBusy: boolean; open(): void; onLayout(): void; replyText?: string }) {
  const [actions, setActions] = useState<BotAction[]>(), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void api.getTask(task.id).then(detail => { if (live) { setActions(detail.actions.filter(action => !['delegate', 'artifact'].includes(action.kind)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setError(''); } }, cause => { if (live) setError(errorText(cause)); });
    return () => { live = false; };
  }, [task.id, task.revision, reload]);
  useLayoutEffect(() => { onLayout(); }, [actions, error, onLayout]);
  const refresh = () => setReload(value => value + 1);
  const labels = { applied: '已应用', discarded: '已取消', undone: '已撤销' };
  return <div className="bot-chat-actions" role="group" aria-label="对话操作">
    {actions?.map(action => {
      if (task.status === 'cancelled' && ['pending', 'executing'].includes(action.status)) {
        return <p key={action.id} className="bot-action-receipt">这项工作已取消。</p>;
      }
      const owner = cards.find(bot => bot.id === action.botId);
      if (action.kind !== 'question' && ['applied', 'discarded', 'undone'].includes(action.status)) {
        const status = (action.receipt as { supersededBy?: string } | undefined)?.supersededBy ? '已被新建议替代' : labels[action.status as keyof typeof labels];
        return <details key={action.id} className="bot-action-completed">
          <ActionReceiptSummary action={action} owner={owner} status={status} />
          <ActionCard action={action} refresh={refresh} copyBusy={copyBusy} />
        </details>;
      }
      return <ActionCard key={action.id} action={action} owner={owner} onOpenWork={open} refresh={refresh} copyBusy={copyBusy} questionInReply={action.kind === 'question' && String(action.payload.question).trim() === replyText?.trim()} />;
    })}
    {!actions && !error && <p className="bot-help" role="status">正在读取操作…</p>}
    {actions?.length === 0 && <button className="bot-text-button" onClick={open}>查看工作进度<ArrowRight size={14} /></button>}
    {error && <p className="bot-error" role="alert">{error}<button onClick={refresh}>重新读取</button></p>}
  </div>;
}

export function BotTaskDetail({ taskId, cards, back, reply, copyBusy = false, embedded = false, backLabel = '返回' }: { taskId: string; cards: BotCard[]; back(): void; reply(task: BotTask): void; copyBusy?: boolean; embedded?: boolean; backLabel?: string }) {
  const [trail, setTrail] = useState<string[]>([]);
  const currentTaskId = trail.at(-1) ?? taskId;
  const goBack = () => trail.length ? setTrail(value => value.slice(0, -1)) : back();
  const [detail, setDetail] = useState<Awaited<ReturnType<BotBridge['getTask']>>>(), [error, setError] = useState(''), [busy, setBusy] = useState(false), [reload, setReload] = useState(0);
  useEffect(() => { setTrail([]); }, [taskId]);
  useEffect(() => { let live = true; let sequence = 0; setDetail(undefined); const load = () => { const ticket = ++sequence; void api.getTask(currentTaskId).then(value => { if (live && ticket === sequence) { setDetail(value); setError(''); } }, cause => { if (live && ticket === sequence) setError(errorText(cause)); }); }; load(); const off = api.onChanged(event => { if (event.kind === 'task' || event.kind === 'host') load(); }); return () => { live = false; off(); }; }, [currentTaskId, reload]);
  const run = async (job: () => Promise<unknown>) => { if (busy) return; setBusy(true); try { await job(); setReload(value => value + 1); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); } };
  const returnLabel = trail.length ? '返回上级任务' : backLabel;
  const returnButton = returnLabel && <button className={`bot-text-button${trail.length ? '' : ' bot-work-root-back'}`} onClick={goBack}><ArrowLeft size={15} />{returnLabel}</button>;
  if (!detail) return <div className="bot-task-detail" data-embedded={embedded || undefined}>{returnButton}<p className="bot-empty" role={error ? 'alert' : 'status'}>{error || '正在读取任务…'}{error && <button onClick={() => setReload(value => value + 1)}>重试</button>}</p></div>;
  const { task } = detail;
  const owner = cards.find(card => card.id === task.botId);
  return <div className="bot-task-detail" data-embedded={embedded || undefined}>{returnButton}{embedded ? <header className="bot-work-task-heading"><h3>{task.title}</h3><div><span className="bot-work-status" data-status={task.status}>{task.status === 'completed' ? <CheckCircle size={16} /> : <CheckSquare size={16} />}{botStatusLabel[task.status]}</span><span>{owner?.name ?? 'Bot'} · {new Date(task.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>{task.reason && <p className="bot-work-muted">{task.reason}</p>}</header> : <BotTaskCard task={task} cards={cards} reply={() => reply(task)} />}
    {detail.actions.map(action => <ActionCard key={action.id} action={action} refresh={() => setReload(value => value + 1)} copyBusy={copyBusy} />)}
    {!!detail.children.length && <><h3>协作任务</h3>{detail.children.map(child => <BotTaskCard key={child.id} task={child} cards={cards} open={() => setTrail(value => [...value, child.id])} />)}</>}
    {!!detail.messages.length && <details className="bot-collaboration"><summary>协作记录 · {detail.messages.length}</summary>{detail.messages.map(message => <article key={message.id}><strong>{cards.find(bot => bot.id === message.fromBotId)?.name ?? 'Bot'} → {cards.find(bot => bot.id === message.toBotId)?.name ?? 'Bot'}</strong><small>{new Date(message.createdAt).toLocaleString('zh-CN')}</small><p>{message.content}</p></article>)}</details>}
    {task.result && <section className="bot-work-result">{embedded && <h4>工作结果</h4>}<AiResponse entry={{ id: task.id, role: 'assistant', content: task.result }} /></section>}
    <div className="bot-action-buttons">{['queued', 'running', 'waiting_bot', 'waiting_user', 'waiting_resource', 'interrupted'].includes(task.status) && <button disabled={busy} onClick={() => void run(() => api.cancelTask(task.id, task.revision))}>取消任务</button>}{['failed', 'interrupted', 'waiting_resource'].includes(task.status) && <button className="primary" disabled={busy} onClick={() => void run(() => api.retryTask(task.id, task.revision))}>继续任务</button>}</div>
    {error && <p role="alert" className="bot-error">{error}</p>}
  </div>;
}
