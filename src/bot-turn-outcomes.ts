import type { BotTask } from '../shared/bot-contracts';
import type { ChatEntry } from '../shared/todo-contracts';

export type BotTurnOutcome = {
  kind: 'stopped' | 'timeout' | 'failed' | 'interrupted';
  reason?: string;
  taskId?: string;
};

export const botTurnOutcomeLabel = { stopped: '已停止', timeout: '任务超时', failed: '执行失败', interrupted: '已中断' } as const;

const cancelledText = /^已取消生成[,，]\s*输入内容已保留[。.]?$/;
const timeoutText = /^任务(?:超时(?:[：:]|$)|超过 [\d.]+ 分钟限制已自动停止)/;

export function botEntryOutcome(entry: ChatEntry): BotTurnOutcome | undefined {
  const reason = entry.error?.trim();
  if (entry.role !== 'assistant' || entry.streaming || !reason) return undefined;
  if (cancelledText.test(reason)) return { kind: 'interrupted' };
  return { kind: timeoutText.test(reason) ? 'timeout' : 'failed', reason };
}

export function projectBotTurnOutcomes(entries: readonly ChatEntry[], tasks: readonly BotTask[]) {
  const entriesById = new Map(entries.map(entry => [entry.id, entry]));
  const outcomes = new Map<string, BotTurnOutcome>();
  const hiddenReplies = new Set<string>();
  for (const task of tasks) {
    const stopped = task.status === 'cancelled' && task.reason === '用户已取消';
    if (!stopped && task.status !== 'failed' && task.status !== 'interrupted') continue;

    const replyId = task.assistantEntryId ?? task.assistantEntryIds?.at(-1);
    const reply = replyId ? entriesById.get(replyId) : undefined;
    if (replyId && !reply) continue;
    const source = entriesById.get(task.latestUserMessageId ?? '') ?? entriesById.get(task.sourceMessageId);
    const hasVisibleReply = reply && (reply.content.trim() || reply.thinking?.trim() || reply.tools?.length
      || reply.responseParts?.length || reply.receivedBotMessages?.length || reply.browserTask
      || reply.proposal || reply.copySource || reply.copyProposal || task.operationIds.length || task.dependencyIds.length || task.messageIds?.length);
    const anchor = !hasVisibleReply && source?.role === 'user' ? source : reply;
    if (!anchor) continue;

    const reason = task.reason?.trim() || reply?.error?.trim();
    const kind = stopped ? 'stopped' : task.status === 'interrupted' ? 'interrupted' : reason && timeoutText.test(reason) ? 'timeout' : 'failed';
    const detail = kind === 'stopped' || !reason || reason === botTurnOutcomeLabel[kind] ? undefined
      : cancelledText.test(reason) ? '生成已中断。' : reason;
    outcomes.set(anchor.id, { kind, reason: detail, taskId: task.id });
    if (reply && reply.id !== anchor.id) hiddenReplies.add(reply.id);
  }
  return { outcomes, hiddenReplies };
}
