import { useRef, useState } from 'react';
import { Check, NotePencil } from '@phosphor-icons/react';
import type { ChatEntry } from '../../shared/todo-contracts';
import type { ProposalPreview, ProposalReceipt } from '../../shared/todo-proposal';

const stateLabels = { applied: '已应用', discarded: '已保留原内容', expired: '已过期，未应用', revised: '已被后续建议替代', undone: '已撤销' };
export function TodoProposalCard({ entry, busy, apply, discard }: {
  entry: ChatEntry; busy: boolean; apply(token: string, indices: number[]): Promise<unknown>; discard(token: string): Promise<unknown>;
}) {
  const proposal = entry.proposal!;
  const [selected, setSelected] = useState<number[]>(() => proposal.actions.map((_action, index) => index));
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [localReceipt, setLocalReceipt] = useState<ProposalReceipt>();
  const inFlight = useRef(false);
  // The receipt comes from main-process transaction success, never the checkbox state.
  const state = localReceipt ? 'applied' : entry.actionState;
  const pending = state === 'pending';
  const receipt = entry.todoReceipt ?? localReceipt;
  const failure = error || entry.todoApplyError;
  const run = async (operation: () => Promise<unknown>): Promise<void> => {
    if (inFlight.current || !pending) return;
    inFlight.current = true; setWorking(true); setError('');
    try {
      const result = await operation() as { todoReceipt?: ProposalReceipt } | null;
      if (result?.todoReceipt) setLocalReceipt(result.todoReceipt);
    }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { inFlight.current = false; setWorking(false); }
  };
  return <section className="todo-proposal-card" aria-label="AI 修改建议" aria-busy={working}>
    <header className="todo-proposal-header"><h3><NotePencil size={22} />AI 修改建议</h3>
      <span className={`todo-proposal-badge ${pending ? failure ? 'failed' : 'pending' : state}`}>
        {pending ? failure ? '本次未应用' : '待确认' : stateLabels[state as keyof typeof stateLabels] ?? '未应用'}
      </span>
    </header>
    <p className="todo-proposal-intro">{pending ? failure ? '本次操作未写入，请查看原因。' : '确认后将更新以下事项。' : state === 'applied' ? '变更结果保留如下。' : '以下建议未写入。'}</p>
    {proposal.actions.map((action, index) => {
      const preview: ProposalPreview = proposal.preview?.[index] ?? { title: action.type === 'create' ? action.task.title : action.type === 'create_category' ? action.category.name : '原始目标快照不可用', verb: '操作详情', fields: [] };
      const applied = receipt?.appliedIndices.includes(index);
      return <div className="todo-proposal-operation" key={index}>
        <div className="todo-proposal-target">
          {pending ? <input type="checkbox" aria-label={`选择${preview.verb}：${preview.title}`} checked={selected.includes(index)} disabled={busy || working}
            onChange={event => setSelected(previous => event.target.checked ? [...previous, index] : previous.filter(value => value !== index))} />
            : <span className={`todo-proposal-result-icon ${applied ? 'applied' : ''}`} aria-hidden="true">{applied ? <Check size={17} weight="bold" /> : '—'}</span>}
          <div><strong>{preview.title}</strong><small>{preview.verb}{preview.fields.length ? ` · ${preview.fields.length} 个字段` : ''}</small></div>
        </div>
        {!pending && receipt && <p className="todo-proposal-item-result">{applied ? '已应用' : '未选择（本轮未应用）'}</p>}
        {!proposal.preview && <p className="todo-proposal-note">原始快照不可用，无法展示修改前后对照。</p>}
        {preview.fields.map((field, fieldIndex) => <div className="todo-proposal-field" key={fieldIndex}>
          <b>{field.label}</b><div className="todo-proposal-diff">
            <div className="todo-proposal-before"><small>修改前</small><span>{field.before}</span></div>
            <span className="todo-proposal-arrow" aria-hidden="true">→</span>
            <div className="todo-proposal-after"><small>修改后</small><span>{field.after}</span></div>
          </div>
        </div>)}
        {preview.warning && <p className="todo-proposal-warning">{preview.warning}</p>}
        {action.type === 'update' && <p className="todo-proposal-note">其余字段保持不变。</p>}
      </div>;
    })}
    {pending && failure && <p className="todo-proposal-error" role="alert">本次未应用：{failure}</p>}
    <footer className="todo-proposal-footer">
      <span>{pending ? `已选择 ${selected.length} / ${proposal.actions.length} 项` : receipt ? `已应用 ${receipt.appliedCount} 项` : state === 'applied' ? '逐项执行回执不可用' : '本轮未应用'}</span>
      {pending ? <div className="todo-proposal-buttons">
        <button type="button" className="ai-discard" disabled={busy || working} onClick={() => void run(() => discard(proposal.token))}>保留原内容</button>
        <button type="button" className="ai-apply" disabled={busy || working || !selected.length} onClick={() => void run(() => apply(proposal.token, [...selected]))}>{working ? '处理中…' : '应用所选'}</button>
      </div> : <span>此建议已处理</span>}
    </footer>
  </section>;
}
