import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, CalendarBlank, Check, CheckCircle, CheckSquare, Clock, NotePencil, PencilSimple, Question, Tag } from '@phosphor-icons/react';
import { terminalTask } from '../../shared/bot-contracts';
import type { BotAction, BotBridge, BotCard, BotSchedule, BotTask, BotTaskStatus } from '../../shared/bot-contracts';
import type { AIPlan, ChatEntry } from '../../shared/todo-contracts';
import type { CopyAiAction } from '../../shared/copy-contracts';
import type { ProposalPreview, ProposalReceipt } from '../../shared/todo-proposal';
import { errorText, Modal } from '../ui/controls';
import { formatSchedule } from './BotSchedules';
import { TodoProposalCard, todoProposalTitle } from './TodoProposalCard';
import { AiResponse } from './AiResponse';
import { BotExecutionCard, BotExecutionDetails, hasBotExecutionDetails } from './BotExecutionCard';
import { BotOperationCard, BotOperationReceipt, BotOperationSubject, type BotOperationTone } from './BotOperationCard';
import { BotAvatar } from './BotAvatar';

const api = window.workbench.bot;
export const botStatusLabel: Record<BotTaskStatus, string> = { queued: '等待执行', running: '正在处理', waiting_user: '等待你确认', waiting_bot: '正在协作', waiting_resource: '等待资源', interrupted: '已中断', completed: '已完成', failed: '执行失败', cancelled: '已取消' };
export function BotTaskCard({ task, cards, open, reply }: { task: BotTask; cards: BotCard[]; open?(): void; reply?(): void }) {
  const owner = cards.find(bot => bot.id === task.botId);
  return <section className="bot-task-card" data-status={task.status}><CheckSquare size={21} /><div>{open ? <button className="bot-task-title" onClick={open}>{task.title}</button> : <strong className="bot-task-title">{task.title}</strong>}<p>{botStatusLabel[task.status]}{task.reason ? ` · ${task.reason}` : ''}</p><div className="bot-task-links">{owner && <span><BotAvatar avatar={owner.avatar} small />{owner.name}</span>}{open ? <button onClick={open}>{task.dependencyIds.length ? '协作记录' : '查看进度'}<ArrowRight size={14} /></button> : null}{reply && <button onClick={reply}>在对话中继续</button>}</div></div></section>;
}

const actionStatus = {
  pending: '待确认', executing: '执行中', applied: '已应用', discarded: '已取消',
  failed: '执行失败', unknown: '待核对', superseded: '更新中', undone: '已撤销',
} as const;

const replacedTodoAction = (action: BotAction) => action.kind === 'todo' && action.status === 'discarded'
  && Boolean((action.receipt as { supersededBy?: string } | undefined)?.supersededBy);

export function actionForConversation(action: BotAction, task?: BotTask): BotAction | undefined {
  if (action.kind !== 'todo') return action;
  if (replacedTodoAction(action)) return;
  const updating = action.status === 'superseded' || action.status === 'pending'
    && (action.requirementsRevision ?? 0) < (task?.requirementsRevision ?? 0);
  if (!updating) return action;
  if (task && (terminalTask(task.status) || task.status === 'interrupted')) return;
  return action.status === 'superseded' ? action : { ...action, status: 'superseded' };
}

export function ActionCard({ action, owner, onOpenWork, onOpenTodo, refresh, copyBusy, questionInReply = false, trace, amend, conversation = false }: { action: BotAction; owner?: BotCard; onOpenWork?(): void; onOpenTodo?(id?: string): void; refresh(): void; copyBusy: boolean; questionInReply?: boolean; trace?: ReactNode; amend?: ReactNode; conversation?: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [answer, setAnswer] = useState('');
  const [copyReview, setCopyReview] = useState<{ index: number; revision: number }>();
  const answerId = useId();
  const [selectedOption, setSelectedOption] = useState<string>();
  const submitting = useRef(false);
  const actions = action.kind === 'copy' ? action.payload.actions as CopyAiAction[] : [];
  const [indices, setIndices] = useState<number[]>(() => actions.findIndex(a => a.kind === 'edit') >= 0 ? [actions.findIndex(a => a.kind === 'edit')] : []);
  const run = async (operation: () => Promise<unknown>) => { if (submitting.current) return; submitting.current = true; setBusy(true); setError(''); try { const result = await operation(); refresh(); return result; } catch (cause) { setError(errorText(cause)); throw cause; } finally { submitting.current = false; setBusy(false); } };
  const submit = (approved: boolean, chosen?: number[]) => run(() => api.answerAction(action.id, action.revision, { approved, indices: chosen, text: answer }));
  if (action.kind === 'delegate' || action.kind === 'artifact') return null;
  const pending = action.status === 'pending';
  const copyTitle = action.kind === 'copy' ? String(action.payload.title || '未命名文章') : undefined;
  const todoPlan = action.kind === 'todo' ? action.payload.plan as AIPlan : undefined;
  const todoActions = todoPlan?.actions ?? [];
  const todoPreview = action.kind === 'todo' ? action.payload.preview as ProposalPreview[] | undefined : undefined;
  const answered = action.kind === 'question' && action.status === 'applied';
  const receipt = action.receipt as { answer?: string; supersededBy?: string } | undefined;
  const answerValue = (action.payload.answer as { text?: string } | undefined)?.text;
  const skipped = answered && answerValue === '';
  const answerText = receipt?.answer ?? answerValue;
  const scheduleTitle = action.kind === 'schedule' ? String(action.payload.title || '未命名任务') : undefined;
  const label = action.kind === 'question' ? String(questionInReply ? '补充信息' : action.payload.question || '补充信息')
    : action.kind === 'todo' ? todoProposalTitle(todoActions, todoPreview)
    : action.kind === 'copy' ? '文章修改'
    : action.kind === 'schedule' ? '定时任务' : '业务操作';
  const status = busy ? '执行中' : answered ? skipped ? '已跳过' : '已回答' : action.kind === 'question' && pending ? '待回答'
    : receipt?.supersededBy ? '已被后续建议替代'
    : action.kind === 'copy' && action.status === 'applied' ? '已修改'
    : action.kind === 'copy' && action.status === 'discarded' ? '已保留原文'
    : action.kind === 'schedule' && action.status === 'applied' ? '已启用'
    : action.kind === 'schedule' && action.status === 'discarded' ? '已保留原设置' : actionStatus[action.status];
  const tone: BotOperationTone = busy || action.status === 'executing' || action.kind === 'todo' && action.status === 'superseded' ? 'active' : pending || action.status === 'unknown' ? 'pending'
    : action.status === 'failed' ? 'error' : action.status === 'applied' ? 'success' : 'neutral';
  const icon = action.kind === 'question' ? <Question size={18} /> : action.kind === 'schedule' ? <Clock size={18} />
    : action.kind === 'todo' ? label === '编辑标签' ? <Tag size={18} /> : <CalendarBlank size={18} />
    : action.kind === 'copy' ? <NotePencil size={18} /> : <CheckSquare size={18} />;
  const card = (body: ReactNode, initialOpen = false, className?: string, detailSummary?: string) =>
    <BotOperationCard label={label} summary={[owner?.name, copyTitle ?? scheduleTitle, detailSummary].filter(Boolean).join(' · ')}
      icon={icon} status={status} tone={tone} aria-label={action.kind === 'question' ? String(action.payload.question || label) : copyTitle ? label + ' · ' + copyTitle : label} aria-busy={busy} initialOpen={initialOpen} collapsible={!answered} className={className}>
      {amend}{body}{trace}
    </BotOperationCard>;
  const workDetails = onOpenWork && <button type="button" className="bot-text-button" onClick={onOpenWork}>查看工作详情<ArrowRight size={14} aria-hidden="true" /></button>;
  if (action.kind !== 'todo' && action.status === 'failed' && onOpenWork) return card(<div className="bot-action-failure">
      <BotOperationSubject title={copyTitle ?? scheduleTitle ?? label}>{action.error || '本次操作未完成。'}</BotOperationSubject>
      <div className="bot-action-buttons">{workDetails}</div>
    </div>, false, undefined, action.error || '本次操作未完成');
  if (action.status === 'superseded') {
    if (action.kind === 'todo' && conversation) {
      const subject = todoPreview?.length === 1 ? todoPreview[0].title : todoActions.length === 1 && todoActions[0].type === 'create' ? todoActions[0].task.title : label;
      return card(<BotOperationSubject title={subject}>已收到补充，正在更新建议。</BotOperationSubject>, true, undefined, subject);
    }
    if (action.kind !== 'todo') return card(<AiResponse entry={{ id: action.id, role: 'assistant', content: action.kind === 'question' ? String(action.payload.question) : String(action.payload.title ?? '') }} />, false, undefined, '已接收补充，正在更新建议');
  }
  const confirmedIndices = action.kind === 'todo' ? (action.payload.answer as { indices?: number[] } | undefined)?.indices : undefined;
  if (conversation && action.kind === 'todo' && action.status === 'unknown' && onOpenTodo) {
    const selected = confirmedIndices ?? (todoActions.length === 1 ? [0] : []);
    const index = selected.length === 1 ? selected[0] : undefined;
    const subject = index === undefined ? undefined : todoPreview?.[index]?.title;
    const operation = index === undefined ? undefined : todoActions[index];
    const id = operation?.type === 'update' || operation?.type === 'remove' ? operation.id : undefined;
    const target = subject ?? (operation?.type === 'create' ? operation.task.title : label);
    return card(<>
      <BotOperationSubject title={target} />
      <p className="bot-help">打开{id ? '原事项' : '日程待办'}核对实际结果。</p>
      <div className="bot-action-buttons">
        <button type="button" onClick={() => onOpenTodo(id)}>{id ? '查看事项' : '打开日程待办'}<ArrowRight size={14} aria-hidden="true" /></button>
      </div>
    </>, true, undefined, target);
  }
  const undoing = action.payload.undoing === true;
  const reconciliationForm = action.status === 'unknown' ? <div className="bot-reconcile-form">
    <p className="bot-help" id={answerId}>
      {action.error || '尚未收到操作结果。'}<br />
      请到{action.kind === 'todo' ? '「日程待办」' : '原工作台'}核对{undoing ? '是否已撤销' : '实际结果'}。
    </p>
    <textarea rows={2} required maxLength={2000} aria-label="核对说明" aria-describedby={answerId}
      placeholder="填写核对说明（必填）" disabled={busy} value={answer} onChange={event => setAnswer(event.target.value)} />
    <div className="bot-action-buttons">
      <button type="button" disabled={busy || !answer.trim()}
        onClick={() => void run(() => api.reconcileAction(action.id, action.revision, 'not_applied', answer.trim())).catch(() => {})}>
        {undoing ? '确认未撤销' : '确认未写入'}
      </button>
      <button type="button" disabled={busy || !answer.trim()}
        onClick={() => void run(() => api.reconcileAction(action.id, action.revision, 'applied', answer.trim())).catch(() => {})}>
        {undoing ? '确认已撤销' : '确认已写入'}
      </button>
    </div>
    {error && <p role="alert" className="bot-error">{error}</p>}
  </div> : undefined;
  if (reconciliationForm && action.kind !== 'todo') return card(reconciliationForm, true);
  if (action.kind === 'todo') {
    const receipt = action.receipt as Partial<ProposalReceipt> & {
      supersededBy?: string; manual?: boolean; result?: 'applied' | 'not_applied'; note?: string;
    } | undefined;
    const actionFailure = action.status === 'failed' ? action.error || '本次操作未完成。' : undefined;
    const reconciliation = reconciliationForm ? { form: reconciliationForm, indices: confirmedIndices }
      : receipt?.manual && receipt.result ? { result: receipt.result, note: receipt.note, indices: confirmedIndices } : undefined;
    const entry: ChatEntry = {
      id: action.id, role: 'assistant', content: '',
      proposal: { message: todoPlan?.message ?? '', actions: todoActions, token: action.id, preview: todoPreview },
      actionState: actionFailure ? undefined : ['pending', 'executing'].includes(action.status) ? 'pending'
        : action.status === 'applied' ? 'applied' : receipt?.supersededBy ? 'revised' : action.status === 'superseded' ? 'expired' : 'discarded',
      todoReceipt: action.status === 'applied' && Array.isArray(receipt?.appliedIndices) ? receipt as ProposalReceipt : undefined,
    };
    return <TodoProposalCard key={action.requirementsRevision} entry={entry} busy={busy || action.status === 'executing'} apply={(_token, selected) => submit(true, selected)}
      discard={() => submit(false)} variant="bot" conversation={conversation} owner={owner?.name} amend={amend} trace={trace}
      actionPending={action.status === 'executing'} actionFailure={actionFailure} failureAction={workDetails} reconciliation={reconciliation} />;
  }
  if (action.kind === 'question') {
    const options = (action.payload.options ?? []) as { label: string; description?: string }[];
    const hasOptions = options.length > 0;
    const response = selectedOption ?? answer.trim();
    const answerIndex = options.findIndex(option => option.label === answerText);
    const answerLetter = hasOptions && answerText ? String.fromCharCode(65 + (answerIndex >= 0 ? answerIndex : options.length)) : undefined;
    const answerInput = <input type="text" disabled={busy}
      aria-label={hasOptions ? '其他回答' : '回答'} placeholder={hasOptions ? '输入其他回答' : '输入回答'}
      value={answer} onChange={event => { setSelectedOption(undefined); setAnswer(event.target.value); }}
      onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} />;
    return card(<div className="bot-question-body">
      {pending && questionInReply && hasOptions && <h3>请选择一项</h3>}
      {pending ? <form className="bot-question-form" noValidate onSubmit={event => {
        event.preventDefault();
        if (!busy && response) void run(() => api.answerAction(action.id, action.revision, { text: response })).catch(() => {});
      }}>
        <div className="bot-question-options" role="group" aria-label={hasOptions ? '可选回答' : '自由回答'}>
          {options.map((option, index) => <button key={option.label} type="button" disabled={busy} aria-label={option.label}
            aria-describedby={option.description ? `${answerId}-option-${index}` : undefined}
            aria-pressed={selectedOption === option.label}
            onClick={() => { setSelectedOption(option.label); setAnswer(''); }}>
            <span className="bot-question-letter" aria-hidden="true">{String.fromCharCode(65 + index)}</span>
            <span className="bot-question-choice"><strong>{option.label}</strong>{option.description && <small id={`${answerId}-option-${index}`}>{option.description}</small>}</span>
            <Check className="bot-question-check" size={16} aria-hidden="true" />
          </button>)}
          <label className={`bot-question-other${answer.trim() ? ' is-selected' : ''}`}>
            <span className="bot-question-letter" aria-hidden="true">{hasOptions ? String.fromCharCode(65 + options.length) : <PencilSimple size={15} />}</span>
            {answerInput}
          </label>
        </div>
        <div className="bot-action-buttons">
          <button type="button" disabled={busy} onClick={() => void run(() => api.answerAction(action.id, action.revision, { text: '' })).catch(() => {})}>跳过</button>
          <button type="submit" className="primary" aria-label="提交回答" disabled={busy || !response}>{busy ? '提交中…' : '提交'}</button>
        </div>
      </form> : answered && !skipped ? <div className="bot-question-answer">
        <span className="bot-question-letter" aria-hidden="true">{answerLetter ?? <Check size={15} />}</span>
        <span>{answerText || '回答已提交'}</span>
        {answerLetter && <Check className="bot-question-check" size={16} aria-hidden="true" />}
      </div> : <BotOperationReceipt neutral>{skipped ? '已跳过本次补充提问。' : action.status === 'discarded' ? '已取消' : action.status === 'executing' ? '正在提交回答…' : '回答未提交'}</BotOperationReceipt>}
      {error && <p role="alert" className="bot-error">{error}<button onClick={refresh}>重新读取</button></p>}
    </div>, pending || answered, 'bot-question');
  }
  if (action.kind === 'copy') {
    const reviewed = copyReview?.revision === action.revision ? actions[copyReview.index] : undefined;
    const applied = action.status === 'applied';
    const failure = error || (action.status === 'failed' ? action.error : undefined);
    return <>
      {card(pending || applied || failure || action.status === 'discarded' ? <div className="bot-copy-operation">
        <BotOperationSubject title={copyTitle!} />
        {pending && actions.map((item, index) => <div key={index} className="bot-copy-choice">
          <label>
            <input type="checkbox" checked={indices.includes(index)} disabled={busy || copyBusy}
              onChange={event => setIndices(old => event.target.checked ? [...old.filter(i => actions[i].kind !== item.kind), index] : old.filter(i => i !== index))} />
            <span>{item.kind === 'edit' ? '替换正文' : item.title}</span>
          </label>
          {item.kind === 'edit' && <button type="button" className="bot-text-button" aria-haspopup="dialog" disabled={busy}
            onClick={() => setCopyReview({ index, revision: action.revision })}>查看改稿</button>}
        </div>)}
        {copyBusy && pending && <p className="bot-help">请等待工作区原稿保存完成。</p>}
        {pending && <div className="bot-action-buttons">
          <button type="button" disabled={busy} onClick={() => void submit(false).catch(() => {})}>保留原文</button>
          <button type="button" className="primary" disabled={busy || copyBusy || !indices.length}
            onClick={() => void submit(true, indices).catch(() => {})}>{busy ? '处理中…' : '应用修改'}</button>
        </div>}
        {applied && <BotOperationReceipt>已修改「{copyTitle}」</BotOperationReceipt>}
        {action.status === 'discarded' && <BotOperationReceipt neutral>已保留原文。</BotOperationReceipt>}
        {failure && <p role="alert" className="bot-error">{failure}</p>}
      </div> : null, pending || applied)}
      {pending && reviewed?.kind === 'edit' && createPortal(<Modal title="查看改稿" className="bot-copy-review" close={() => setCopyReview(undefined)}>
        <div className="bot-copy-review-body">
          <p className="bot-help">{copyTitle}</p>
          <details>
            <summary>查看原文</summary>
            <AiResponse entry={{ id: 'before', role: 'assistant', content: String(action.payload.body || '（空白）') }} />
          </details>
          <AiResponse entry={{ id: 'after', role: 'assistant', content: reviewed.text }} />
        </div>
      </Modal>, document.body)}
    </>;
  }
  const scheduleSpec = formatSchedule(action.payload.spec as BotSchedule['spec']);
  const enabled = action.status === 'applied';
  return card(<div className="bot-operation-form">
    <BotOperationSubject title={scheduleTitle!}>{pending ? String(action.payload.prompt || '') : undefined}</BotOperationSubject>
    {pending ? <><dl className="bot-operation-fields"><dt>执行时间</dt><dd>{scheduleSpec}</dd>{owner && <><dt>负责 Bot</dt><dd>{owner.name}</dd></>}</dl>
      <p className="bot-help">本机开机运行，错过时合并补跑一次。</p>
      <div className="bot-action-buttons"><button type="button" disabled={busy} onClick={() => void submit(false).catch(() => {})}>保留原设置</button>
        <button type="button" className="primary" disabled={busy} onClick={() => void submit(true).catch(() => {})}>{busy ? '处理中…' : '确认启用'}</button></div>
    </> : <BotOperationReceipt neutral={!enabled}>{enabled ? '已启用，' + scheduleSpec : action.status === 'undone' ? '已撤销' : action.status === 'executing' ? '正在提交，请勿重复操作' : action.status === 'failed' ? action.error : '已保留原设置'}</BotOperationReceipt>}
    {error && <p role="alert" className="bot-error">{error}</p>}
  </div>, pending || enabled);
}

export function BotChatActions({ task, actionIds, cards, copyBusy, open, onOpenTodo, onLayout, replyText }: { task: BotTask; actionIds: readonly string[]; cards: BotCard[]; copyBusy: boolean; open(): void; onOpenTodo(id?: string): void; onLayout(): void; replyText?: string }) {
  const [actions, setActions] = useState<BotAction[]>(), [error, setError] = useState(''), [reload, setReload] = useState(0);
  useEffect(() => {
    let live = true;
    void api.getTask(task.id).then(detail => { if (live) { setActions(detail.actions.filter(action => !['delegate', 'artifact'].includes(action.kind)).sort((a, b) => a.createdAt.localeCompare(b.createdAt))); setError(''); } }, cause => { if (live) setError(errorText(cause)); });
    return () => { live = false; };
  }, [task.id, task.revision, reload]);
  useLayoutEffect(() => { onLayout(); }, [actions, error, onLayout]);
  const refresh = () => setReload(value => value + 1);
  const placed = actions?.flatMap(action => {
    if (!actionIds.includes(action.id)) return [];
    const current = actionForConversation(action, task);
    return current ? [current] : [];
  });
  if (actions?.length && !placed?.length && !error) return null;
  return <div className="bot-chat-actions" role="group" aria-label="对话操作">
    {placed?.map(action => {
      const projected = task.status === 'cancelled' && ['pending', 'executing'].includes(action.status)
        ? { ...action, status: 'discarded' as const } : action;
      const owner = action.botId === task.botId && action.kind !== 'schedule' ? undefined : cards.find(bot => bot.id === action.botId);
      return <ActionCard key={action.id} action={projected} owner={owner} onOpenWork={open} onOpenTodo={onOpenTodo} refresh={refresh} copyBusy={copyBusy} conversation
        questionInReply={action.kind === 'question' && String(action.payload.question).trim() === replyText?.trim()} />;
    })}
    {!actions && !error && <p className="bot-help" role="status">正在读取操作…</p>}
    {actions?.length === 0 && <button className="bot-text-button" onClick={open}>查看工作进度<ArrowRight size={14} /></button>}
    {error && <p className="bot-error" role="alert">{error}<button onClick={refresh}>重新读取</button></p>}
  </div>;
}

export function BotTaskDetail({ taskId, cards, back, reply, copyBusy = false, embedded = false, backLabel = '返回', onOpenChild }: {
  taskId: string; cards: BotCard[]; back(): void; reply(task: BotTask): void;
  copyBusy?: boolean; embedded?: boolean; backLabel?: string; onOpenChild?(id: string): void;
}) {
  const [trail, setTrail] = useState<string[]>([]);
  const currentTaskId = trail.at(-1) ?? taskId;
  const openChild = onOpenChild ?? ((id: string) => setTrail(value => [...value, id]));
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
  const actions = detail.actions.filter(action => !['delegate', 'artifact'].includes(action.kind));
  const latestAction = actions.filter(action => !replacedTodoAction(action)).at(-1) ?? actions.at(-1);
  const actionReply = actions.length ? detail.entries?.find(entry => entry.id === task.assistantEntryId && entry.role === 'assistant' && hasBotExecutionDetails(entry)) : undefined;
  return <div className="bot-task-detail" data-embedded={embedded || undefined}>{returnButton}{embedded ? <header className="bot-work-task-heading"><h3>{task.title}</h3><div><span className="bot-work-status" data-status={task.status}>{task.status === 'completed' ? <CheckCircle size={16} /> : <CheckSquare size={16} />}{botStatusLabel[task.status]}</span><span>{owner?.name ?? 'Bot'} · {new Date(task.updatedAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>{task.reason && <p className="bot-work-muted">{task.reason}</p>}</header> : <BotTaskCard task={task} cards={cards} reply={() => reply(task)} />}
    {!!detail.entries?.length && <section className="bot-work-history"><h4>工作记录</h4>{detail.entries.map(entry => <article key={entry.id}>
      <small>{entry.role === 'user' ? '你' : owner?.name ?? 'Bot'}</small>
      {entry.content && <p>{entry.content}</p>}
      {entry.role === 'assistant' && entry.id !== actionReply?.id && <BotExecutionCard entry={entry} />}
    </article>)}</section>}
    {actions.map(action => <ActionCard key={action.id} action={action} refresh={() => setReload(value => value + 1)}
      copyBusy={copyBusy} trace={action === latestAction && actionReply ? <BotExecutionDetails entry={actionReply} collapsed /> : undefined} />)}
    {!!detail.children.length && <><h3>协作任务</h3>{detail.children.map(child => <BotTaskCard key={child.id} task={child} cards={cards} open={() => openChild(child.id)} />)}</>}
    {!!detail.messages.length && <details className="bot-collaboration"><summary>协作记录 · {detail.messages.length}</summary>{detail.messages.map(message => <article key={message.id}><strong>{cards.find(bot => bot.id === message.fromBotId)?.name ?? 'Bot'} → {cards.find(bot => bot.id === message.toBotId)?.name ?? 'Bot'}</strong><small>{new Date(message.createdAt).toLocaleString('zh-CN')}</small><p>{message.content}</p></article>)}</details>}
    {task.result && <section className="bot-work-result">{embedded && <h4>工作结果</h4>}<AiResponse entry={{ id: task.id, role: 'assistant', content: task.result }} /></section>}
    <div className="bot-action-buttons">{['queued', 'running', 'waiting_bot', 'waiting_user', 'waiting_resource', 'interrupted'].includes(task.status) && <button disabled={busy} onClick={() => void run(() => api.cancelTask(task.id, task.revision))}>取消任务</button>}{['failed', 'interrupted', 'waiting_resource'].includes(task.status) && <button className="primary" disabled={busy} onClick={() => void run(() => api.retryTask(task.id, task.revision))}>继续任务</button>}</div>
    {error && <p role="alert" className="bot-error">{error}</p>}
  </div>;
}
