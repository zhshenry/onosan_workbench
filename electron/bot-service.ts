import { z } from 'zod';
import { isBotAvatar, normalizeBotAvatar } from '../shared/bot-avatar';
import { BOT_MEMORY_TEXT_LIMIT, botMemoryRequestSchema, botChatViewSchema, botQueueChangeSchema, draftValueSchema, isQueuedBotMessage, resourceRefSchema, scheduleSpecSchema, type BotArtifact, type BotMemory, type BotMemoryView, type BotSchedule } from '../shared/bot-contracts';
import { aiReferencesSchema } from '../shared/ai-reference';
import { ASTRO_READING_TOPIC_IDS } from '../shared/astro-reading';
import { memoryLabelFields, memoryLabels } from './bot-memory';
import { BotError } from './bot-store';
import type { BotHost } from './bot-host';

const id = z.string().uuid(), revision = z.number().int().nonnegative();
const memoryView = ({ sources, ...memory }: BotMemory): BotMemoryView => ({ ...memory, ...memoryLabels(memory), sourceCount: sources?.length ?? 0 });
const scope = z.discriminatedUnion('module', [z.object({ module: z.literal('todo') }).strict(), z.object({ module: z.literal('copy'), draftId: z.string().min(1) }).strict(), z.object({ module: z.literal('bazi'), profileId: z.string().min(1) }).strict(), z.object({ module: z.literal('reading'), profileId: z.string().min(1) }).strict(), z.object({ module: z.literal('workbench'), viewId: z.string().min(1).max(100) }).strict()]);
const context = z.object({ dashboardDraftOpen: z.boolean().optional(), scope: scope.optional(), pageScope: scope.optional(), browserTabId: z.string().max(100).nullable().optional(), references: aiReferencesSchema.optional(), baziSystem: z.enum(['bazi', 'ziwei', 'astro']).optional(), astroReadingTopic: z.enum(ASTRO_READING_TOPIC_IDS).optional(), copySource: z.object({ draftId: z.string(), start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().max(1000) }).strict().optional() }).strict();
const submitSchema = z.object({ memoryRequest: botMemoryRequestSchema.optional(), generatedPrompts: draftValueSchema.shape.generatedPrompts, botId: id, chatId: id, expectedDraftRevision: revision, clientRequestId: id, text: z.string().min(1).max(10000).refine(s => !!s.trim(), '请输入消息'), replyToTaskId: id.nullable(), resources: z.array(resourceRefSchema).max(8), pageContext: context.optional(), target: z.object({ intent: z.literal('amend'), rootTaskId: id, taskId: id, actionId: z.string().min(1).max(200).optional(), expectedActionRevision: revision.optional() }).strict().optional() }).strict();
export function botService(host: BotHost, method: string, args: unknown[], rawSurface: unknown): unknown {
  const surface = z.object({ id: z.string().min(1).max(100), kind: z.enum(['main', 'island']) }).strict().parse(rawSurface);
  const store = host.store;
  const mainOnly = () => { if (surface.kind !== 'main') throw new BotError('SURFACE_FORBIDDEN', '请在主窗口管理 Bot 资料和后台设置'); };
  const changed = (kind: 'profile' | 'memory' | 'schedule', botId?: string) => host.changed({ kind, botId });
  if (surface.kind === 'island') {
    const coordinator = host.coordinator();
    if (['listTasks', 'listArtifacts', 'listSchedules'].includes(method) && args[0] !== coordinator.id) throw new BotError('SURFACE_FORBIDDEN', '灵动岛只查看总 Bot 的工作');
    let taskId: string | undefined;
    if (['getTask', 'getCollaboration', 'cancelTask', 'retryTask'].includes(method)) taskId = id.parse(args[0]);
    if (['answerAction', 'reconcileAction', 'undoAction'].includes(method)) taskId = store.action(z.string().parse(args[0])).taskId;
    if (method === 'openArtifact') taskId = store.get<BotArtifact>('bot_artifacts', id.parse(args[0])).taskId;
    if (taskId && store.task(store.task(taskId).rootTaskId).botId !== coordinator.id) throw new BotError('SURFACE_FORBIDDEN', '请在原负责人工作台查看这项工作');
  }
  switch (method) {
    case 'list': return store.cards();
    case 'markRead': { const botId = id.parse(args[0]); if (surface.kind === 'island' && botId !== host.coordinator().id) throw new BotError('SURFACE_FORBIDDEN', '灵动岛只连接总 Bot'); store.profile(botId); store.ai.setSetting(`bot.read.${botId}`, new Date().toISOString()); host.changed({ kind: 'read', botId }); return; }
    case 'open': {
      const botId = id.parse(args[0]); if (surface.kind === 'island' && botId !== host.coordinator().id) throw new BotError('SURFACE_FORBIDDEN', '灵动岛只连接总 Bot'); return store.open(botId, botChatViewSchema.optional().parse(args[1] ?? undefined));
    }
    case 'updateProfile': {
      mainOnly(); const botId = id.parse(args[0]), rev = revision.parse(args[1]);
      const patch = z.object({ name: z.string().trim().min(1).max(30), avatar: z.string().refine(isBotAvatar, '请选择有效的头像和颜色').transform(normalizeBotAvatar), description: z.string().trim().max(100), instructions: z.string().max(6000), modelId: z.string().uuid().nullable().optional() }).strict().parse(args[2]);
      if (patch.modelId && patch.modelId !== store.profile(botId).modelId && !store.ai.readConfig().models.some(model => model.id === patch.modelId)) throw new BotError('NOT_FOUND', '此模型已移除，请重新选择');
      const profile = store.updateProfile(botId, rev, patch); changed('profile', botId); return profile;
    }
    case 'getDraft': return host.getDraft(id.parse(args[0]), surface);
    case 'syncChat': {
      const chatId = id.parse(args[0]); host.getDraft(chatId, surface);
      return store.syncChat(chatId, revision.optional().parse(args[1] ?? undefined), z.string().uuid().optional().parse(args[2] ?? undefined), botChatViewSchema.optional().parse(args[3] ?? undefined));
    }
    case 'getConversationEntries': {
      const task = store.task(id.parse(args[0])); host.getDraft(task.chatId, surface);
      return store.conversationEntries(task);
    }
    case 'saveDraft': return host.saveDraft(id.parse(args[0]), revision.parse(args[1]), draftValueSchema.parse(args[2]), surface);
    case 'submit': return host.submit(submitSchema.parse(args[0]), surface);
    case 'getSubmissionStatus': return host.submissionStatus(submitSchema.parse(args[0]), surface, z.string().uuid().optional().parse(args[1] ?? undefined));
    case 'listTasks': {
      const botId = id.parse(args[0]), limit = z.number().int().min(1).max(200).optional().parse(args[1] ?? undefined);
      if (limit !== undefined) return store.tasks(botId, limit).filter(task => task.kind !== 'message');
      return store.tasks(botId, Number.MAX_SAFE_INTEGER).filter(task => task.kind !== 'message')
        .filter((task, index) => index < 100 || task.status === 'waiting_user' || task.status === 'running' || isQueuedBotMessage(task));
    }
    case 'getTask': { const task = store.task(id.parse(args[0])); return { task, entries: store.conversationEntries(task), children: store.tasks(undefined, Number.MAX_SAFE_INTEGER).filter(t => t.parentTaskId === task.id), messages: store.all<any>('bot_messages').filter(m => m.taskId === task.id || m.parentTaskId === task.id), actions: store.actions(task.id) }; }
    case 'getCollaboration': return store.collaboration(id.parse(args[0]));
    case 'getBotExchange': return store.exchange(id.parse(args[0]), id.parse(args[1]), z.object({ anchorMessageId: id.optional(), before: id.optional(), after: id.optional(), limit: z.number().int().min(1).max(50).optional() }).strict().parse(args[2] ?? {}), surface.kind === 'island' ? host.coordinator().id : undefined);
    case 'changeQueuedMessage': return host.changeQueuedMessage(botQueueChangeSchema.parse(args[0]), surface);
    case 'cancelTask': return host.cancelTask(id.parse(args[0]), revision.parse(args[1]));
    case 'retryTask': return host.retryTask(id.parse(args[0]), revision.parse(args[1]));
    case 'answerAction': return host.answerAction(z.string().min(1).max(200).parse(args[0]), revision.parse(args[1]), z.object({ approved: z.boolean().optional(), indices: z.array(z.number().int().nonnegative()).max(20).optional(), text: z.string().max(10000).optional() }).strict().parse(args[2]));
    case 'reconcileAction': return host.reconcileAction(z.string().min(1).max(200).parse(args[0]), revision.parse(args[1]), z.enum(['applied', 'not_applied']).parse(args[2]), z.string().trim().min(1).max(2000).parse(args[3]));
    case 'undoAction': return host.undoAction(z.string().min(1).max(200).parse(args[0]), revision.parse(args[1]));
    case 'listArtifacts': {
      const botId = id.parse(args[0]);
      return store.all<BotArtifact>('bot_artifacts')
        .filter(artifact => !artifact.libraryRemovedAt && (artifact.producerBotId === botId || store.task(artifact.rootTaskId).botId === botId))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    case 'openArtifact': return store.get<BotArtifact>('bot_artifacts', id.parse(args[0]));
    case 'removeArtifactFromLibrary': {
      mainOnly();
      if (store.removeArtifactFromLibrary(id.parse(args[0]))) host.changed({ kind: 'artifact' });
      return;
    }
    case 'listMemories': mainOnly(); return store.memories(id.parse(args[0])).map(memoryView);
    case 'memorySources': {
      mainOnly();
      const botId = id.parse(args[0]), memoryId = id.parse(args[1]);
      store.profile(botId);
      return store.memorySources(botId, memoryId);
    }
    case 'getAutomaticMemory': mainOnly(); return !!store.memoryEpoch();
    case 'setAutomaticMemory': mainOnly(); return host.setAutomaticMemory(z.boolean().parse(args[0]));
    case 'updateMemory': {
      mainOnly(); const input = z.object({ id, botId: id.nullable(), scope: z.enum(['private', 'shared']), ...memoryLabelFields, text: z.string().trim().min(1).max(BOT_MEMORY_TEXT_LIMIT, '每条记忆最多 300 字，请缩短或拆开保存'), source: z.string().max(200), revision }).strict().parse(args[0]);
      if (!input.revision) throw new BotError('MEMORY_CHAT_REQUIRED', '请在 Bot 对话中添加记忆');
      if (input.scope === 'private' && !input.botId) throw new BotError('BOT_REQUIRED', '私人记忆需要指定 Bot');
      if (input.scope === 'shared' && input.botId) throw new BotError('INVALID_SCOPE', '共享记忆不绑定单个 Bot');
      if (input.botId) store.profile(input.botId); const memory = store.saveMemory(input); changed('memory', memory.scope === 'shared' ? undefined : memory.botId ?? undefined); return memoryView(memory);
    }
    case 'removeMemory': { mainOnly(); const memory = store.get<BotMemory>('bot_memories', id.parse(args[0])); store.removeMemory(memory.id, revision.parse(args[1])); changed('memory', memory.botId ?? undefined); return; }
    case 'listSchedules': return store.all<BotSchedule>('bot_schedules').filter(s => s.botId === id.parse(args[0]));
    case 'saveSchedule': {
      mainOnly(); const input = z.object({ id, botId: id, title: z.string().trim().min(1).max(100), prompt: z.string().trim().min(1).max(10000), enabled: z.boolean(), spec: scheduleSpecSchema, revision }).strict().parse(args[0]);
      const schedule = store.saveSchedule(input); changed('schedule', input.botId); host.wake(); return schedule;
    }
    case 'setScheduleEnabled': { mainOnly(); const old = store.get<BotSchedule>('bot_schedules', id.parse(args[0])); const schedule = store.saveSchedule({ ...old, enabled: z.boolean().parse(args[2]), revision: revision.parse(args[1]) }); changed('schedule', old.botId); host.wake(); return schedule; }
    case 'removeSchedule': { mainOnly(); const botId = store.removeSchedule(id.parse(args[0]), revision.parse(args[1])); changed('schedule', botId); return; }
    case 'getHostState': return host.state();
    default: throw new BotError('UNKNOWN_METHOD', '后台不支持这个操作');
  }
}
