import type { BotArtifact, BotTask } from '../shared/bot-contracts';
import type { ChatEntry } from '../shared/todo-contracts';

export function groupBotProgress(tasks: BotTask[], entries: ChatEntry[], artifacts: BotArtifact[], toolReplyIds?: string[]) {
  const groups = { attention: [] as BotTask[], active: [] as BotTask[], ended: [] as BotTask[], conversations: [] as BotTask[] };
  const toolReplies = new Set(toolReplyIds ?? entries.filter(entry => entry.tools?.length || entry.browserTask || entry.proposal || entry.copyProposal).map(entry => entry.id));
  const deliveries = new Set(artifacts.map(artifact => artifact.taskId));
  for (const task of tasks) {
    if (task.status === 'completed' || task.status === 'cancelled') {
      const conversation = task.kind === 'chat' && !task.resources.length && !task.operationIds.length && !task.dependencyIds.length && !toolReplies.has(task.assistantEntryId ?? '') && !deliveries.has(task.id);
      (conversation ? groups.conversations : groups.ended).push(task);
    } else if (['queued', 'running', 'waiting_bot'].includes(task.status)) groups.active.push(task);
    else groups.attention.push(task);
  }
  return groups;
}
