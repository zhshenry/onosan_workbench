import type { Store } from '../modules/todo/store';
import type { AiStore } from './ai-store';
import type { Proposal } from '../shared/todo-contracts';
import type { ProposalReceipt } from '../shared/todo-proposal';

/** The Todo transaction is the commit boundary; chat-history I/O cannot undo it. */
export function applyTodoProposal(store: Store, ai: AiStore, item: { sessionId: string; plan: Proposal; revisions: Map<string, string> }, chosen: number[], consume: () => void): { todoReceipt: ProposalReceipt } {
  const chat = ai.chat(item.sessionId); // Any read failure happens before writes.
  const entry = chat.entries.find(entry => entry.proposal?.token === item.plan.token);
  if (!entry || entry.actionState !== 'pending') throw new Error('建议已应用或已过期，请重新生成');
  const appliedIndices = item.plan.actions.flatMap((_action, index) => chosen.includes(index) ? [index] : []);
  if (!appliedIndices.length) throw new Error('请选择要应用的操作');
  const actions = appliedIndices.map(index => item.plan.actions[index]);
  const todoReceipt = { appliedIndices, appliedCount: actions.length };
  try { store.applyPlan({ message: item.plan.message, actions }, item.revisions); }
  catch (cause) {
    entry.todoApplyError = cause instanceof Error ? cause.message : '应用失败';
    try { ai.saveChat(chat); } catch { /* Do not replace the transaction's error. */ }
    throw cause;
  }
  consume();
  ai.rememberTodoResult(item.plan.token, todoReceipt);
  entry.actionState = 'applied'; entry.todoReceipt = todoReceipt; delete entry.todoApplyError;
  try { ai.saveChat(chat); } catch { /* Receipt remains authoritative in this running session. */ }
  return { todoReceipt };
}
