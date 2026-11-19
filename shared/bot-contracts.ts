import { z } from 'zod';
import type { AiTurnContext } from './ai-reference';
import type { ChatEntry, ChatSession } from './todo-contracts';

export const BOT_CONTRACT_VERSION = 'bot-workbench/v12';
export const botSeeds = [
  { seedKey: 'coordinator', workspaceId: 'home', name: 'Ono', avatar: 'ring:blue', description: '总 Bot · 总台', instructions: '协调各领域负责人，跟进任务与交付。依据真实结果汇报，不把已委派当成已完成。', views: ['home', 'checkin'] },
  { seedKey: 'schedule', workspaceId: 'todo', name: '小历', avatar: 'square:violet', description: '待办与日程', instructions: '管理待办与日程。写入前展示具体建议并等待用户确认。', views: ['todo'] },
  { seedKey: 'media', workspaceId: 'media', name: '小墨', avatar: 'drop:graphite', description: '自媒体', instructions: '协助文章写作、整理和发布准备。修改原稿需用户确认，发布结果以实际回执为准。', views: ['copy', 'copy-publish', 'media-browser'] },
  { seedKey: 'game', workspaceId: 'game', name: '游伴', avatar: 'ghost:green', description: '游戏', instructions: '协助当前游戏工作区，明确区分建议与已执行操作。', views: ['game'] },
  { seedKey: 'web', workspaceId: 'web', name: '小舟', avatar: 'sail:orange', description: '网页与网站', instructions: '协助网页及网站工作区。浏览器操作遵守现有站点授权，缺少窗口或登录时等待资源。', views: ['browser', 'hush-hour', 'personal-website'] },
  { seedKey: 'ai-test', workspaceId: 'ai-test', name: '小测', avatar: 'hex:pink', description: 'AI 测试', instructions: '协助模型对比与测试工作，结论引用实际运行记录。', views: ['ai-test', 'ai-test-tasks', 'ai-test-history'] },
  { seedKey: 'utilities', workspaceId: 'bazi', name: '命理助理', avatar: 'flower:mint', description: '命理', instructions: '协助命例解读。只使用本次提供的命例和已授权资料。', views: ['bazi'] },
  { seedKey: 'reading', workspaceId: 'reading', name: '阅读助理', avatar: 'orb:cyan', description: '阅读清单', instructions: '协助书目、阅读进度和读书笔记。只使用本次提供的书目和已授权资料。', views: ['reading'] },
] as const;
export type BotSeedKey = typeof botSeeds[number]['seedKey'];
export type BotWorkspaceId = typeof botSeeds[number]['workspaceId'];
export interface BotProfile {
  id: string; seedKey: BotSeedKey; workspaceId: BotWorkspaceId; name: string; avatar: string;
  description: string; instructions: string; modelId?: string | null; mainChatId: string; enabled: boolean; revision: number; updatedAt: string;
}
export type BotRunActivity = 'thinking' | 'searching' | 'working' | 'sending' | 'replying';
export type BotActivity = BotRunActivity | 'idle' | 'queued' | 'waiting_bot' | 'waiting_user' | 'waiting_resource' | 'interrupted';
export type BotCard = Omit<BotProfile, 'instructions'> & { capabilities: string[]; unreadCount?: number; waitingCount?: number; runningCount?: number; activity?: BotActivity; completion?: string };
export const resourceRefSchema = z.object({ kind: z.enum(['todo', 'copy', 'bazi', 'reading', 'artifact', 'chat']), id: z.string().min(1).max(200), version: z.string().max(100).optional(), label: z.string().max(200).optional() }).strict();
export type BotResourceRef = z.infer<typeof resourceRefSchema>;
export const draftValueSchema = z.object({ text: z.string().max(10000), replyToTaskId: z.string().uuid().nullable(), resources: z.array(resourceRefSchema).max(8) }).strict();
export type BotDraftValue = z.infer<typeof draftValueSchema>;
export type BotDraftSurface = 'main' | 'island';
export const draftSnapshotSchema = draftValueSchema.extend({ chatId: z.string().uuid(), surface: z.enum(['main', 'island']), revision: z.number().int().nonnegative() }).strict();
export interface DraftSnapshot extends BotDraftValue { chatId: string; surface: BotDraftSurface; revision: number; }
export const taskStatuses = ['queued', 'running', 'waiting_user', 'waiting_bot', 'waiting_resource', 'interrupted', 'completed', 'failed', 'cancelled'] as const;
export type BotTaskStatus = typeof taskStatuses[number];
export const terminalTask = (status: BotTaskStatus): boolean => ['completed', 'failed', 'cancelled'].includes(status);
export interface BotTask {
  id: string; botId: string; chatId: string; rootTaskId: string; parentTaskId?: string;
  sourceMessageId: string; latestUserMessageId?: string; replyToEntryId?: string; kind: 'chat' | 'work' | 'delegated' | 'routine' | 'message';
  status: BotTaskStatus; title: string; input: string; context: AiTurnContext; resources: BotResourceRef[];
  revision: number; createdAt: string; updatedAt: string; reason?: string; result?: string;
  piSessionPath?: string; assistantEntryId?: string; resumeInput?: string; workerId?: string;
  assistantEntryIds?: string[];
  /** Delivered replies awaiting a new, durable assistant segment. */
  pendingReplyMessageIds?: string[];
  operationIds: string[]; dependencyIds: string[];
  requirementsRevision?: number; runGeneration?: number;
  amendedActionId?: string;
  messageIds?: string[];
}
export interface BotMessage {
  id: string; fromBotId: string; toBotId: string; taskId?: string; rootTaskId?: string; parentTaskId?: string;
  kind: 'request' | 'question' | 'notification' | 'result' | 'cancel'; content: string; references: BotResourceRef[];
  sourceUserMessageId?: string; replyTo?: string; createdAt: string; deliveredAt?: string;
  sourceAssistantEntryId?: string;
  purpose?: 'work' | 'query' | 'notification' | 'amendment' | 'reply';
  originTaskId?: string;
  when?: 'now' | 'queue';
  consumedAt?: string;
}
export interface BotAction {
  id: string; taskId: string; botId: string; kind: 'todo' | 'copy' | 'question' | 'delegate' | 'artifact' | 'schedule';
  status: 'pending' | 'executing' | 'applied' | 'discarded' | 'failed' | 'unknown' | 'undone' | 'superseded';
  requirementsRevision?: number;
  revision: number; payload: Record<string, unknown>; receipt?: unknown; error?: string; createdAt: string; updatedAt: string;
}
export interface BotArtifact {
  id: string; producerBotId: string; taskId: string; rootTaskId: string; chatId: string; title: string;
  mediaType: string; resource: BotResourceRef; content?: string; createdAt: string;
}
export interface BotMemory { id: string; botId: string | null; scope: 'private' | 'shared'; text: string; source: string; revision: number; updatedAt: string; }
export const scheduleSpecSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('once'), at: z.iso.datetime() }).strict(),
  z.object({ kind: z.literal('interval'), minutes: z.number().int().min(1).max(525600) }).strict(),
  z.object({ kind: z.literal('daily'), time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timeZone: z.string().min(1).max(100) }).strict(),
]);
export interface BotSchedule { id: string; botId: string; title: string; prompt: string; enabled: boolean; spec: z.infer<typeof scheduleSpecSchema>; nextRunAt: string; revision: number; updatedAt: string; }
export interface BotSubmit {
  botId: string; chatId: string; expectedDraftRevision: number; clientRequestId: string;
  text: string; replyToTaskId: string | null; resources: BotResourceRef[]; pageContext?: AiTurnContext;
  target?: { intent: 'amend'; rootTaskId: string; taskId: string; actionId?: string; expectedActionRevision?: number };
}
export interface BotSubmitReceipt { task: BotTask; messageId: string; draft: DraftSnapshot; duplicate: boolean; disposition?: 'created' | 'amended'; }
export type BotSubmissionStatus = { dataEpoch: string } & ({ status: 'accepted'; receipt: BotSubmitReceipt } | { status: 'not_found' } | { status: 'epoch_changed' });
export interface BotPendingSubmission { input: BotSubmit; dataEpoch: string; localDraft?: BotDraftValue; }
export interface BotCollaboration { root: BotTask; tasks: BotTask[]; actions: BotAction[]; messages: BotMessage[]; artifacts: BotArtifact[]; }
export interface BotExchangeQuery { anchorMessageId?: string; before?: string; after?: string; limit?: number; }
export interface BotExchange { messages: BotMessage[]; hasEarlier: boolean; hasLater: boolean; }
export interface BotChatUpdate { chatId: string; epoch: string; sequence: number; entry: ChatEntry; updatedAt: string; }
export const botChatPageSize = 30;
const chatEntryId = z.string().min(1);
export const botChatViewSchema = z.object({
  range: z.object({ kind: z.enum(['older', 'newer', 'from']), entryId: chatEntryId }).strict().optional(),
  collapsedAt: chatEntryId.optional(),
}).strict();
export type BotChatView = z.infer<typeof botChatViewSchema>;
export interface BotChatSnapshot {
  epoch: string; sequence: number; chat: ChatSession; hasEarlier: boolean; hasLater: boolean;
  lastEntryId?: string; collapsedAt?: string; pageTasks?: BotTask[];
  liveEntries: ChatEntry[]; latestUser?: Pick<ChatEntry, 'id' | 'content'>; toolReplyIds: string[];
}
export type BotChatSync = BotChatSnapshot | { epoch: string; sequence: number; updates: BotChatUpdate[] };
export interface BotOpen extends BotChatSnapshot { bot: BotProfile; history: { chatId: string; title: string; updatedAt: string; reason?: string; canReference: boolean }[]; }
export interface BotHostState { connected: boolean; running: boolean; independent: boolean; pid: number; activeTasks: number; queuedTasks: number; startedAt: string; supervised: boolean; error?: string; }
export interface BotNavigation { kind: 'task' | 'todo'; id: string; }
export interface BotChanged { botId?: string; chatId?: string; taskId?: string; revision?: number; draftSurface?: BotDraftSurface; kind: 'profile' | 'draft' | 'task' | 'activity' | 'chat' | 'artifact' | 'memory' | 'schedule' | 'host' | 'read' | 'navigation'; }
export interface BotBridge {
  list(): Promise<BotCard[]>;
  open(botId: string, view?: BotChatView): Promise<BotOpen>;
  markRead(botId: string): Promise<void>;
  getLaunchTarget(): Promise<BotNavigation | null>;
  updateProfile(botId: string, expectedRevision: number, patch: Pick<BotProfile, 'name' | 'avatar' | 'description' | 'instructions' | 'modelId'>): Promise<BotProfile>;
  getDraft(chatId: string): Promise<DraftSnapshot>;
  saveDraft(chatId: string, expectedRevision: number, value: BotDraftValue): Promise<DraftSnapshot>;
  submit(input: BotSubmit): Promise<BotSubmitReceipt>;
  getSubmissionStatus(input: BotSubmit, dataEpoch?: string): Promise<BotSubmissionStatus>;
  getPendingSubmission(chatId: string): Promise<BotPendingSubmission | null>;
  retainPendingDraft(chatId: string, value: BotDraftValue): Promise<void>;
  acknowledgeSubmission(chatId: string, requestId: string): Promise<void>;
  syncChat(chatId: string, after?: number, epoch?: string, view?: BotChatView): Promise<BotChatSync>;
  getConversationEntries(taskId: string): Promise<ChatEntry[]>;
  onChatUpdate(callback: (update: BotChatUpdate) => void): () => void;
  listTasks(botId: string, limit?: number): Promise<BotTask[]>;
  getTask(taskId: string): Promise<{ task: BotTask; children: BotTask[]; messages: BotMessage[]; actions: BotAction[] }>;
  getCollaboration(rootTaskId: string): Promise<BotCollaboration>;
  getBotExchange(botAId: string, botBId: string, query?: BotExchangeQuery): Promise<BotExchange>;
  cancelTask(taskId: string, revision: number): Promise<BotTask>;
  retryTask(taskId: string, revision: number): Promise<BotTask>;
  answerAction(operationId: string, revision: number, answer: { approved?: boolean; indices?: number[]; text?: string }): Promise<BotAction>;
  reconcileAction(operationId: string, revision: number, result: 'applied' | 'not_applied', note: string): Promise<BotAction>;
  undoAction(operationId: string, revision: number): Promise<BotAction>;
  listArtifacts(botId: string): Promise<BotArtifact[]>;
  openArtifact(id: string): Promise<BotArtifact>;
  listMemories(botId: string): Promise<BotMemory[]>;
  updateMemory(input: Omit<BotMemory, 'updatedAt'>): Promise<BotMemory>;
  removeMemory(id: string, revision: number): Promise<void>;
  listSchedules(botId: string): Promise<BotSchedule[]>;
  saveSchedule(input: Omit<BotSchedule, 'nextRunAt' | 'updatedAt'>): Promise<BotSchedule>;
  setScheduleEnabled(id: string, revision: number, enabled: boolean): Promise<BotSchedule>;
  removeSchedule(id: string, revision: number): Promise<void>;
  getHostState(): Promise<BotHostState>;
  setBackground(enabled: boolean): Promise<BotHostState>;
  onChanged(callback: (event: BotChanged) => void): () => void;
}
