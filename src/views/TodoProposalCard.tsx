import { useRef, useState } from 'react';
import { CalendarBlank, Check, NotePencil, Tag } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { BotOperationCard, BotOperationReceipt } from './BotOperationCard';
import type { AIAction, ChatEntry } from '../../shared/todo-contracts';
import type { ProposalField, ProposalPreview, ProposalReceipt } from '../../shared/todo-proposal';

const stateLabels = { applied: '已应用', discarded: '已保留原内容', expired: '已过期，未应用', revised: '已被后续建议替代', undone: '已撤销', failed: '执行失败', unknown: '待核对' };
const appliedLabels = { create: '已创建', update: '已修改', remove: '已删除', create_category: '已创建', update_category: '已修改', remove_category: '已删除' };
const operationVerbs = { create: '新建', update: '修改', remove: '删除' };
const dateFields = new Set(['完成期限', '开始时间', '结束时间', '提醒时间']);
function formatPreviewDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}:\d{2}))?$/.exec(value);
  if (!match) return value;
  const [, year, month, day, time] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day));
  const label = date.toLocaleDateString('zh-CN', { year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric', month: 'long', day: 'numeric' });
  return [label, date.toLocaleDateString('zh-CN', { weekday: 'short' }), time].filter(Boolean).join(' ');
}
const confirmationLabels: Record<AIAction['type'], string> = {
  create: '确认创建', update: '确认修改', remove: '确认删除',
  create_category: '确认创建', update_category: '确认修改', remove_category: '确认删除',
};

function operationTitle(action: AIAction, preview?: ProposalPreview): string {
  if (action.type !== 'create' && action.type !== 'update' && action.type !== 'remove') return '编辑标签';

  let kind = preview?.taskKind;
  if (action.type === 'create') kind = action.task.kind ?? kind;
  if (action.type === 'update') {
    kind = action.patch.kind ?? kind;
    if (!kind) {
      // A saved date comparison can identify older proposals without taskKind metadata.
      const date = preview?.fields.find(field => field.before !== '无原始快照' && ['开始时间', '完成期限'].includes(field.label));
      if (date) kind = date.label === '开始时间' ? 'meeting' : 'task';
    }
  }
  const name = kind === 'meeting' ? '日程' : kind === 'task' ? '待办' : '事项';
  return operationVerbs[action.type] + name;
}

export function todoProposalTitle(actions: AIAction[], previews?: ProposalPreview[]): string {
  if (!actions.length) return '事项变更';
  const titles = actions.map((action, index) => operationTitle(action, previews?.[index]));
  return titles.every(title => title === titles[0]) ? titles[0] : '批量变更';
}
type Reconciliation = { indices?: readonly number[] } & (
  { form: ReactNode } | { result: 'applied' | 'not_applied'; note?: string }
);
export function TodoProposalCard({ entry, busy, apply, discard, variant, conversation, owner, trace, amend, actionPending = false, actionFailure, failureAction, reconciliation }: {
  entry: ChatEntry; busy: boolean; apply(token: string, indices: number[]): Promise<unknown>; discard(token: string): Promise<unknown>;
  variant?: 'island' | 'bot';
  conversation?: boolean;
  owner?: string; trace?: ReactNode; amend?: ReactNode; actionPending?: boolean; actionFailure?: string; failureAction?: ReactNode; reconciliation?: Reconciliation;
}) {
  const proposal = entry.proposal!;
  const [selected, setSelected] = useState<number[]>(() => proposal.actions.map((_action, index) => index));
  const [working, setWorking] = useState<'apply' | 'discard'>();
  const [error, setError] = useState('');
  const [localReceipt, setLocalReceipt] = useState<ProposalReceipt>();
  const inFlight = useRef(false);
  // Use the write receipt or the saved manual reconciliation, never the checkbox state.
  const checking = reconciliation && 'form' in reconciliation ? reconciliation : undefined;
  const checked = reconciliation && 'result' in reconciliation ? reconciliation : undefined;
  const state = checking ? 'unknown' : actionFailure ? 'failed' : localReceipt ? 'applied' : entry.actionState;
  const pending = state === 'pending';
  const failed = state === 'failed';
  const receipt = entry.todoReceipt ?? localReceipt;
  const failure = actionFailure || error || entry.todoApplyError;
  const busyNow = !!working || actionPending;
  const locked = busy || busyNow;
  const recording = !!checking && busy;
  const run = async (kind: 'apply' | 'discard', operation: () => Promise<unknown>): Promise<void> => {
    if (inFlight.current || locked || !pending) return;
    inFlight.current = true; setWorking(kind); setError('');
    try {
      const result = await operation() as { todoReceipt?: ProposalReceipt } | null;
      if (result?.todoReceipt) setLocalReceipt(result.todoReceipt);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setWorking(undefined); }
  };
  const compact = variant === 'bot';
  const inChat = compact && conversation;
  const showResult = inChat && (state === 'applied' || !!checked);
  const single = proposal.actions.length === 1 ? proposal.actions[0] : undefined;
  const preview = single ? proposal.preview?.[0] : undefined;
  const confirmLabel = (compact && single && confirmationLabels[single.type]) || (variant === 'island' ? '确认修改' : '应用所选');
  const deleting = single?.type === 'remove' || single?.type === 'remove_category';
  const taskKind = single?.type === 'create' ? single.task.kind ?? 'task' : preview?.taskKind;
  const savingLabel = taskKind === 'meeting' ? '保存日程' : taskKind === 'task' ? '保存待办' : '保存事项变更';
  const busyLabel = compact && (working === 'apply' || actionPending) ? savingLabel : '执行中';
  const appliedStatus = state === 'applied' && single && (single.type === 'create' || showResult) && receipt?.appliedIndices.includes(0)
    ? appliedLabels[single.type] : undefined;
  const status = busyNow ? busyLabel : recording ? '记录中' : pending ? failure ? '本次未应用' : '待确认'
    : checked ? checked.result === 'applied' ? '已确认写入' : '已确认未写入'
    : appliedStatus ?? stateLabels[state as keyof typeof stateLabels] ?? '未应用';
  const tone = busyNow || recording ? 'active' : checking ? 'pending' : failure && !showResult ? 'error' : pending ? 'pending' : state === 'applied' || checked?.result === 'applied' ? 'success' : 'neutral';
  const header = <header className="todo-proposal-header"><h3><NotePencil size={22} />{variant === 'island' && proposal.actions.length === 1 ? proposal.preview?.[0]?.title ?? 'AI 修改建议' : 'AI 修改建议'}</h3>
      <span className={`todo-proposal-badge ${pending ? failure ? 'failed' : 'pending' : state}`}>
        {pending ? failure ? '本次未应用' : '待确认' : stateLabels[state as keyof typeof stateLabels] ?? '未应用'}
      </span>
    </header>;
  const body = <section className={compact ? `todo-proposal-card bot-operation-proposal${inChat ? ' bot-conversation-proposal' : ''}` : `todo-proposal-card${variant === 'island' ? ' todo-proposal-island' : ''}${proposal.actions.length === 1 ? ' is-single' : ''}`} aria-label={reconciliation ? '核对操作结果' : 'AI 修改建议'} aria-busy={busyNow || recording}>
    {variant !== 'bot' && header}
    {failed ? <p className="todo-proposal-error" role="alert">{failure}</p>
      : !reconciliation && state !== 'applied' && (!pending || !!failure) && <p className="todo-proposal-intro">{pending ? '本次操作未写入，请查看原因。' : '以下建议未写入。'}</p>}
    {proposal.actions.map((action, index) => {
      if (reconciliation?.indices && !reconciliation.indices.includes(index)) return null;
      const preview: ProposalPreview = proposal.preview?.[index] ?? { title: action.type === 'create' ? action.task.title : action.type === 'create_category' ? action.category.name : '原始目标快照不可用', verb: '操作详情', fields: [] };
      const applied = receipt?.appliedIndices.includes(index);
      if (showResult) {
        const values = preview.fields.filter(field => field.before !== field.after
          && (action.type === 'update' || ['完成期限', '开始时间', '结束时间'].includes(field.label)))
          .map(field => field.label.replace('（建议生成时名称）', '') + '为 ' + (dateFields.has(field.label) ? formatPreviewDate(field.after) : field.after));
        const result = !receipt ? '逐项执行回执不可用。' : !applied ? '本轮未应用' : action.type === 'remove' ? '已移入回收站。'
          : [appliedLabels[action.type], ...values].join('，') + '。';
        return <div className="todo-proposal-operation" key={index}>
          <div className="todo-proposal-target bot-operation-subject"><strong>{preview.title}</strong></div>
          {!checked && <BotOperationReceipt neutral={!applied}>{result}</BotOperationReceipt>}
        </div>;
      }
      const isNew = action.type === 'create' || action.type === 'create_category';
      const afterLabel = isNew || reconciliation ? '建议值' : '修改后';
      const fields = compact && action.type === 'create' ? preview.fields.filter(field => field.label !== '事项名称') : preview.fields;
      const changed = isNew ? fields.filter(field => field.before !== field.after) : fields;
      const unchanged = isNew ? fields.filter(field => field.before === field.after) : [];
      const fieldValue = (field: ProposalField, value: string) => inChat && dateFields.has(field.label) ? formatPreviewDate(value) : value;
      const fieldRow = (field: ProposalField, fieldIndex: number) => <div className="todo-proposal-field" key={fieldIndex}>
        <b title={field.label}>{field.label === '标签（建议生成时名称）' ? '标签' : field.label}</b><div className="todo-proposal-diff">
          {!isNew && <><div className="todo-proposal-before"><small className="todo-proposal-field-caption">修改前</small><span>{fieldValue(field, field.before)}</span></div><span className="todo-proposal-arrow" aria-hidden="true">→</span></>}
          <div className="todo-proposal-after"><small className="todo-proposal-field-caption">{afterLabel}</small><span>{fieldValue(field, field.after)}</span></div>
        </div>
      </div>;
      return <div className={`todo-proposal-operation${isNew ? ' is-new' : ''}`} key={index}>
        {inChat && single ? <div className="todo-proposal-target bot-operation-subject"><strong>{preview.title}</strong></div> : <div className="todo-proposal-target">
          {pending ? <input type="checkbox" aria-label={`选择${preview.verb}：${preview.title}`} checked={selected.includes(index)} disabled={locked}
            onChange={event => setSelected(previous => event.target.checked ? [...previous, index] : previous.filter(value => value !== index))} />
            : <span className={`todo-proposal-result-icon ${applied ? 'applied' : ''}`} aria-hidden="true">{applied ? <Check size={17} weight="bold" /> : '—'}</span>}
          <div><strong>{preview.title}</strong><small>{preview.verb}{fields.length ? ` · ${fields.length} 个字段` : ''}</small></div>
        </div>}
        {!pending && receipt && <p className="todo-proposal-item-result">{applied ? '已应用' : '未选择（本轮未应用）'}</p>}
        {!proposal.preview && <p className="todo-proposal-note">原始快照不可用，无法展示修改前后对照。</p>}
        {!inChat && !!fields.length && <div className="todo-proposal-columns" aria-hidden="true"><span>字段</span><div className="todo-proposal-diff">{!isNew && <><span>修改前</span><span /></>}<span>{afterLabel}</span></div></div>}
        {changed.map(fieldRow)}
        {!reconciliation && !!unchanged.length && <details className="todo-proposal-unchanged"><summary>未设置字段 · {unchanged.length} 项</summary>{unchanged.map(fieldRow)}</details>}
        {!reconciliation && preview.warning && <p className="todo-proposal-warning">{preview.warning}</p>}
      </div>;
    })}
    {pending && failure && <p className="todo-proposal-error" role="alert">本次未应用：{failure}</p>}
    {showResult && checked && <BotOperationReceipt neutral={checked.result !== 'applied'}>{checked.note || status}</BotOperationReceipt>}
    {checking ? checking.form : !(showResult && (single || checked)) && <footer className="todo-proposal-footer">
      {!(inChat && single && pending) && <span>{checked ? checked.note || status : pending ? variant === 'island' && proposal.actions.length === 1 ? '尚未修改待办' : `已选择 ${selected.length} / ${proposal.actions.length} 项` : receipt ? `已应用 ${receipt.appliedCount} 项` : state === 'applied' ? '逐项执行回执不可用' : '本轮未应用'}</span>}
      {!checked && (pending ? <div className={compact ? 'bot-action-buttons' : 'todo-proposal-buttons'}>
        <button type="button" className={compact ? undefined : 'ai-discard'} disabled={locked} onClick={() => void run('discard', () => discard(proposal.token))}>{variant === 'island' ? '取消' : '保留原内容'}</button>
        <button type="button" className={compact ? inChat && deleting ? 'danger' : 'primary' : 'ai-apply'} disabled={locked || !selected.length}
          onClick={() => void run('apply', () => apply(proposal.token, [...selected]))}>{busyNow ? '处理中…' : confirmLabel}</button>
      </div> : failed ? failureAction : !showResult && <span>此建议已处理</span>)}
    </footer>}
  </section>;
  if (!compact) return body;
  const label = todoProposalTitle(proposal.actions, proposal.preview);
  const subject = preview?.title ?? (single?.type === 'create' ? single.task.title : label);
  return <BotOperationCard label={label} summary={[owner, subject !== label && subject].filter(Boolean).join(' · ')} icon={label === '编辑标签' ? <Tag size={18} /> : <CalendarBlank size={18} />} status={status} tone={tone}
    aria-label={subject} aria-busy={busyNow || recording} initialOpen={pending || !!checking} collapsible={!showResult}>
    {amend}{body}{trace}
  </BotOperationCard>;
}
