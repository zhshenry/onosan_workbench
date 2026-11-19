import { createHash, randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { Temporal } from '@js-temporal/polyfill';
import { botSeeds, terminalTask, type BotCollaboration, type BotExchange, type BotExchangeQuery, type BotAction, type BotArtifact, type BotCard, type BotChatSnapshot, type BotChatView, type BotDraftSurface, type BotDraftValue, type BotMemory, type BotMessage, type BotOpen, type BotProfile, type BotSchedule, type BotSeedKey, type BotSubmit, type BotSubmitReceipt, type BotTask, type DraftSnapshot } from '../shared/bot-contracts';
import type { AiScope } from '../shared/ai-scope';
import type { ChatSession } from '../shared/todo-contracts';
import type { AiStore } from './ai-store';
import { normalizeBotAvatar } from '../shared/bot-avatar';
import type { BotActivity, BotRunActivity } from '../shared/bot-contracts';

export class BotError extends Error {
  constructor(readonly code: string, message: string, readonly current?: unknown) { super(message); }
}
const now = () => new Date().toISOString();
const json = JSON.stringify;
const modelSelectionMigrationKey = 'bot.modelSelectionsMigrated';
// The old boolean marker could be set before any model bindings were written.
const modelSelectionMigrationVersion = 2;
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${json(k)}:${canonical(v)}`).join(',')}}`;
  return json(value);
}
export const payloadHash = (value: unknown): string => createHash('sha256').update(canonical(value)).digest('hex');
export const seedScope = (key: BotSeedKey): AiScope => key === 'schedule' ? { module: 'todo' } : { module: 'workbench', viewId: key === 'coordinator' ? 'home' : `workspace:${botSeeds.find(seed => seed.seedKey === key)!.workspaceId}` };

/** Identity comes from the original scope, never the last visited page or a fallback parser. */
export function legacyBotOwner(raw: unknown): { key?: BotSeedKey; main: boolean; reason?: string } {
  if (!raw || typeof raw !== 'object') return { main: false, reason: '对话结构无效' };
  const chat = raw as Record<string, unknown>;
  const contexts = [chat.contextScope, chat.pageScope, ...(Array.isArray(chat.entries) ? chat.entries.flatMap(entry => entry && typeof entry === 'object' ? [entry.contextScope, entry.pageScope] : []) : [])];
  if (chat.module === undefined || chat.module === 'todo') {
    const main = contexts.every(context => context === undefined || !!context && typeof context === 'object' && (context as Record<string, unknown>).module === 'todo');
    return { key: 'schedule', main, ...(main ? {} : { reason: '含其他领域或无效上下文' }) };
  }
  if (['copy', 'bazi', 'reading'].includes(String(chat.module))) {
    const id = chat.module === 'copy' ? chat.draftId : chat.profileId;
    return typeof id === 'string' && id ? { key: chat.module === 'copy' ? 'media' : chat.module === 'reading' ? 'reading' : 'utilities', main: false, reason: '原对象专属对话' } : { main: false, reason: '缺少原对象标识' };
  }
  if (chat.module !== 'workbench' || typeof chat.viewId !== 'string') return { main: false, reason: '未知对话类型' };
  if (chat.viewId.startsWith('settings') || chat.viewId === 'workspace:settings') return { main: false, reason: '设置历史，仅供查阅' };
  const seed = botSeeds.find(item => (item.views as readonly string[]).includes(chat.viewId as string) || chat.viewId === `workspace:${item.workspaceId}` || item.seedKey === 'utilities' && chat.viewId === 'workspace:life');
  if (!seed) return { main: false, reason: '未识别的工作区' };
  let main = true;
  for (const context of contexts) {
    if (context === undefined) continue;
    if (!context || typeof context !== 'object') { main = false; continue; }
    const scope = context as Record<string, unknown>;
    if (scope.module !== 'workbench' && !(seed.seedKey === 'schedule' && scope.module === 'todo')) { main = false; continue; }
    if (scope.module === 'workbench' && !(seed.views as readonly unknown[]).includes(scope.viewId) && scope.viewId !== `workspace:${seed.workspaceId}` && !(seed.seedKey === 'utilities' && scope.viewId === 'workspace:life')) main = false;
  }
  return { key: seed.seedKey, main, ...(main ? {} : { reason: '含对象或其他领域上下文' }) };
}

export function nextScheduleAt(spec: BotSchedule['spec'], after: string): string {
  if (spec.kind === 'once') return spec.at;
  if (spec.kind === 'interval') return new Date(Date.parse(after) + spec.minutes * 60000).toISOString();
  const zoned = Temporal.Instant.from(after).toZonedDateTimeISO(spec.timeZone);
  const [hour, minute] = spec.time.split(':').map(Number);
  let next = zoned.with({ hour, minute, second: 0, millisecond: 0, microsecond: 0, nanosecond: 0 }, { disambiguation: 'compatible' });
  if (Temporal.ZonedDateTime.compare(next, zoned) <= 0) next = next.add({ days: 1 });
  return next.toInstant().toString();
}

type Table = 'bots' | 'bot_tasks' | 'bot_messages' | 'bot_actions' | 'bot_artifacts' | 'bot_memories' | 'bot_schedules';
type Link = { chat_id: string; bot_id: string | null; role: string; draft_revision: number; draft_context: string; reason: string | null; pi_session_path: string | null; pi_imported_at: string | null };
export class BotStore {
  readonly db: AiStore['db'];
  private readonly activities = new Map<string, BotRunActivity>();
  constructor(readonly ai: AiStore, readonly directory: string) {
    this.db = ai.db; this.migrate(); this.migrateModelSelections(); this.splitUtilities(); this.migrateCommunication();
    this.db.exec('CREATE TABLE IF NOT EXISTS bot_message_requests(id TEXT PRIMARY KEY, input_hash TEXT NOT NULL, message_id TEXT NOT NULL); PRAGMA user_version=6');
    // A missing receipt across Host restarts may be a restored database. Never silently replay it.
    this.ai.setSetting('bot.dataEpoch', randomUUID());
  }
  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const value = fn(); this.db.exec('COMMIT'); return value; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  private migrate(): void {
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if ([4, 5, 6].includes(version)) return;
    if (![1, 2, 3].includes(version)) throw new BotError('SCHEMA_VERSION', 'AI 数据版本无法迁移');
    // VACUUM INTO takes a consistent SQLite snapshot including committed WAL pages.
    this.db.prepare('VACUUM INTO ?').run(join(this.directory, `chats-before-bots-${Date.now()}-${randomUUID().slice(0, 8)}.db`));
    if (version === 3) { this.transaction(() => this.migrateDrafts()); return; }
    if (version === 2) { this.transaction(() => { this.db.exec('ALTER TABLE bot_chat_links ADD COLUMN pi_session_path TEXT; ALTER TABLE bot_chat_links ADD COLUMN pi_imported_at TEXT'); this.migrateDrafts(); }); return; }
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE bots(id TEXT PRIMARY KEY, seed_key TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL UNIQUE, payload TEXT NOT NULL);
        CREATE TABLE bot_chat_links(chat_id TEXT PRIMARY KEY REFERENCES chats(id), bot_id TEXT REFERENCES bots(id), role TEXT NOT NULL, draft_revision INTEGER NOT NULL DEFAULT 0, draft_context TEXT NOT NULL DEFAULT '{"replyToTaskId":null,"resources":[]}', reason TEXT, pi_session_path TEXT, pi_imported_at TEXT);
        CREATE UNIQUE INDEX bot_main_chat ON bot_chat_links(bot_id) WHERE role='main';
        CREATE TABLE bot_tasks(id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, chat_id TEXT NOT NULL, status TEXT NOT NULL, parent_id TEXT, client_request_id TEXT UNIQUE, input_hash TEXT, payload TEXT NOT NULL);
        CREATE INDEX bot_task_queue ON bot_tasks(status,bot_id);
        CREATE TABLE bot_messages(id TEXT PRIMARY KEY, to_bot_id TEXT NOT NULL, delivered INTEGER NOT NULL DEFAULT 0, payload TEXT NOT NULL);
        CREATE INDEX bot_inbox ON bot_messages(to_bot_id,delivered);
        CREATE TABLE bot_actions(id TEXT PRIMARY KEY, task_id TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE INDEX bot_task_actions ON bot_actions(task_id);
        CREATE TABLE bot_artifacts(id TEXT PRIMARY KEY, task_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(task_id,idempotency_key));
        CREATE TABLE bot_memories(id TEXT PRIMARY KEY, bot_id TEXT, payload TEXT NOT NULL);
        CREATE TABLE bot_schedules(id TEXT PRIMARY KEY, bot_id TEXT NOT NULL, enabled INTEGER NOT NULL, next_run_at TEXT NOT NULL, payload TEXT NOT NULL);
        CREATE TABLE bot_schedule_firings(schedule_id TEXT NOT NULL, scheduled_at TEXT NOT NULL, task_id TEXT NOT NULL, PRIMARY KEY(schedule_id,scheduled_at));
      `);
      const rows = this.db.prepare('SELECT id,payload FROM chats').all() as { id: string; payload: string }[];
      const old = rows.map(row => {
        try {
          const chat = JSON.parse(row.payload) as ChatSession;
          if (chat.id !== row.id || !Array.isArray(chat.entries) || chat.entries.some(entry => !entry || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') || typeof chat.updatedAt !== 'string' || typeof chat.draft !== 'string') throw new Error('invalid');
          return { id: row.id, chat, owner: legacyBotOwner(chat) };
        } catch { return { id: row.id, chat: undefined, owner: { main: false, key: undefined, reason: '原始记录损坏，已保留' } }; }
      });
      const remembered = new Set<string>();
      for (const row of this.db.prepare('SELECT value FROM settings WHERE key LIKE ?').all('%active%') as { value: string }[]) {
        try { const value = JSON.parse(row.value); if (typeof value === 'string') remembered.add(value); else if (value && typeof value === 'object') Object.values(value).filter(v => typeof v === 'string').forEach(v => remembered.add(v as string)); } catch { /* Keep malformed legacy settings untouched. */ }
      }
      const assigned = new Map<BotSeedKey, string>();
      for (const seed of botSeeds) {
        const id = randomUUID(); assigned.set(seed.seedKey, id);
        const candidates = old.filter(row => row.owner.key === seed.seedKey && row.owner.main && row.chat).sort((a, b) => Number(remembered.has(b.id)) - Number(remembered.has(a.id)) || b.chat!.updatedAt.localeCompare(a.chat!.updatedAt) || a.id.localeCompare(b.id));
        let mainChat = candidates[0]?.chat;
        if (!mainChat) {
          mainChat = { id: randomUUID(), title: seed.name, updatedAt: now(), entries: [], draft: '', ...seedScope(seed.seedKey) };
          this.ai.saveChat(mainChat);
        }
        const profile: BotProfile = { id, seedKey: seed.seedKey, workspaceId: seed.workspaceId, name: seed.name, avatar: seed.avatar, description: seed.description, instructions: seed.instructions, mainChatId: mainChat.id, enabled: true, revision: 0, updatedAt: now() };
        this.db.prepare('INSERT INTO bots VALUES(?,?,?,?)').run(id, seed.seedKey, seed.workspaceId, json(profile));
        this.db.prepare("INSERT INTO bot_chat_links(chat_id,bot_id,role) VALUES(?,?,'main')").run(mainChat.id, id);
      }
      for (const row of old) {
        if (this.link(row.id)) continue;
        this.db.prepare("INSERT INTO bot_chat_links(chat_id,bot_id,role,reason) VALUES(?,?,'history',?)").run(row.id, row.owner.key ? assigned.get(row.owner.key)! : null, row.owner.reason ?? '旧对话归档');
      }
      this.migrateDrafts();
      if (!rows.length && !this.ai.readConfig().hasConfiguredModel) {
        this.ai.setSetting(modelSelectionMigrationKey, modelSelectionMigrationVersion);
      }
    });
  }
  private migrateModelSelections(): void {
    this.transaction(() => {
      if (this.ai.setting<unknown>(modelSelectionMigrationKey, null) === modelSelectionMigrationVersion) return;
      const { models, providers, activeModelId } = this.ai.readConfig();
      const inherited = activeModelId ? models.find(model => model.id === activeModelId) : models[0];
      if (!inherited || !providers.some(provider => provider.id === inherited.providerId)) return;
      const updatedAt = now();
      for (const bot of this.all<BotProfile>('bots')) {
        if (bot.modelId) continue;
        this.put('bots', bot.id, { ...bot, modelId: inherited.id, revision: bot.revision + 1, updatedAt });
      }
      this.ai.setSetting(modelSelectionMigrationKey, modelSelectionMigrationVersion);
    });
  }
  private migrateDrafts(): void {
    this.db.exec('CREATE TABLE bot_drafts(chat_id TEXT NOT NULL REFERENCES chats(id),surface TEXT NOT NULL CHECK(surface IN (\'main\',\'island\')),revision INTEGER NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(chat_id,surface))');
    const links = this.db.prepare("SELECT * FROM bot_chat_links WHERE role='main'").all() as Link[];
    for (const link of links) this.writeDraft(link.chat_id, 'main', { text: this.ai.chat(link.chat_id).draft, ...JSON.parse(link.draft_context) as Omit<BotDraftValue, 'text'> }, link.draft_revision);
    this.db.exec('PRAGMA user_version=4');
  }
  private migrateCommunication(): void {
    if ((this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version >= 5) return;
    this.db.prepare('VACUUM INTO ?').run(join(this.directory, `chats-before-communication-${Date.now()}-${randomUUID().slice(0, 8)}.db`));
    this.transaction(() => {
      this.db.exec(`CREATE TABLE IF NOT EXISTS bot_submissions(id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, surface TEXT NOT NULL, input_hash TEXT NOT NULL, task_id TEXT NOT NULL, message_id TEXT NOT NULL, disposition TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS bot_submissions_chat ON bot_submissions(chat_id,surface);
        CREATE INDEX IF NOT EXISTS bot_message_pair ON bot_messages(json_extract(payload,'$.fromBotId'),to_bot_id,json_extract(payload,'$.createdAt'),id);
        CREATE INDEX IF NOT EXISTS bot_task_root ON bot_tasks(json_extract(payload,'$.rootTaskId'));
        PRAGMA user_version=5;`);
      this.ai.setSetting('bot.dataEpoch', randomUUID());
    });
  }
  private splitUtilities(): void {
    const profiles = this.all<BotProfile>('bots'), utilities = profiles.find(bot => bot.seedKey === 'utilities'), reading = profiles.find(bot => bot.seedKey === 'reading');
    if (utilities?.workspaceId === 'bazi' && reading) return;
    this.db.prepare('VACUUM INTO ?').run(join(this.directory, `chats-before-workspace-split-${Date.now()}-${randomUUID().slice(0, 8)}.db`));
    this.transaction(() => {
      if (utilities && String(utilities.workspaceId) === 'life') {
        const seed = botSeeds.find(bot => bot.seedKey === 'utilities')!;
        const next = { ...utilities, workspaceId: seed.workspaceId, revision: utilities.revision + 1, updatedAt: now() };
        if (next.name === '工具助理') next.name = seed.name;
        if (next.description === '阅读与小工具') next.description = seed.description;
        if (next.instructions === '协助阅读、命理与小工具工作区。只使用本次提供的对象和已授权资料。') next.instructions = seed.instructions;
        this.db.prepare('UPDATE bots SET workspace_id=?,payload=? WHERE id=?').run(next.workspaceId, json(next), next.id);
      }
      let readingId = reading?.id;
      if (!readingId) {
        const seed = botSeeds.find(bot => bot.seedKey === 'reading')!, id = randomUUID(); readingId = id;
        const chat: ChatSession = { id: randomUUID(), title: seed.name, updatedAt: now(), entries: [], draft: '', ...seedScope(seed.seedKey) };
        this.ai.saveChat(chat);
        const profile: BotProfile = { id, seedKey: seed.seedKey, workspaceId: seed.workspaceId, name: seed.name, avatar: seed.avatar, description: seed.description, instructions: seed.instructions, mainChatId: chat.id, enabled: true, revision: 0, updatedAt: now() };
        this.db.prepare('INSERT INTO bots VALUES(?,?,?,?)').run(id, seed.seedKey, seed.workspaceId, json(profile));
        this.db.prepare("INSERT INTO bot_chat_links(chat_id,bot_id,role) VALUES(?,?,'main')").run(chat.id, id);
        this.writeDraft(chat.id, 'main', { text: '', replyToTaskId: null, resources: [] }, 0);
      }
      if (utilities) for (const link of this.db.prepare("SELECT chat_id FROM bot_chat_links WHERE bot_id=? AND role='history'").all(utilities.id) as { chat_id: string }[]) {
        if (legacyBotOwner(this.ai.chat(link.chat_id)).key === 'reading') this.db.prepare('UPDATE bot_chat_links SET bot_id=? WHERE chat_id=?').run(readingId, link.chat_id);
      }
    });
  }
  all<T>(table: Table): T[] { return (this.db.prepare(`SELECT payload FROM ${table}`).all() as { payload: string }[]).map(row => JSON.parse(row.payload) as T); }
  get<T>(table: Table, id: string): T {
    const row = this.db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id) as { payload: string } | undefined;
    if (!row) throw new BotError('NOT_FOUND', '记录不存在或已移除');
    return JSON.parse(row.payload) as T;
  }
  private put(table: Table, id: string, value: unknown): void { this.db.prepare(`UPDATE ${table} SET payload=? WHERE id=?`).run(json(value), id); }
  link(chatId: string): Link | undefined { return this.db.prepare('SELECT * FROM bot_chat_links WHERE chat_id=?').get(chatId) as Link | undefined; }
  bindMainSession(chatId: string, path: string): void { this.db.prepare("UPDATE bot_chat_links SET pi_session_path=?,pi_imported_at=COALESCE(pi_imported_at,?) WHERE chat_id=? AND role='main'").run(path, now(), chatId); }
  profile(id: string): BotProfile { const bot = this.get<BotProfile>('bots', id); return { ...bot, avatar: normalizeBotAvatar(bot.avatar) }; }
  cards(): BotCard[] {
    const tasks = this.tasks(undefined, Number.MAX_SAFE_INTEGER);
    return this.all<BotProfile>('bots').map(({ instructions: _private, ...bot }) => {
      const owned = tasks.filter(task => task.botId === bot.id), readAt = this.ai.setting(`bot.read.${bot.id}`, '');
      const running = owned.filter(task => task.status === 'running');
      const waiting = (['waiting_user', 'waiting_resource', 'waiting_bot', 'queued', 'interrupted'] as const).find(status => owned.some(task => task.status === status));
      const activity: BotActivity = running.length ? this.activities.get(running[0].id) ?? 'thinking' : waiting ?? 'idle';
      const completed = owned.filter(task => task.kind !== 'message' && task.status === 'completed').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
      return { ...bot, avatar: normalizeBotAvatar(bot.avatar), capabilities: this.capabilities(bot.seedKey), runningCount: running.length, activity, completion: completed ? `${completed.id}:${completed.updatedAt}` : undefined, waitingCount: owned.filter(task => task.status === 'waiting_user').length, unreadCount: owned.filter(task => task.kind !== 'message' && ['completed', 'failed', 'waiting_user'].includes(task.status) && task.updatedAt > readAt).length };
    });
  }
  capabilities(key: BotSeedKey): string[] {
    const common = ['Bot 协作', '交付件', '例行工作'];
    return [...({ schedule: ['待办查询与确认写入'], media: ['文章读取与修改建议', '浏览器（需工作区在线）'], utilities: ['命例解读'], reading: ['阅读分析'], web: ['浏览器（需工作区在线）'] } as Partial<Record<BotSeedKey, string[]>>)[key] ?? [], ...common];
  }
  open(botId: string, view?: BotChatView): BotOpen {
    const bot = this.profile(botId);
    const rows = this.db.prepare(`SELECT l.chat_id,l.bot_id,l.reason,
      CASE WHEN json_valid(c.payload) THEN json_extract(c.payload,'$.title') END AS title,
      CASE WHEN json_valid(c.payload) THEN json_extract(c.payload,'$.updatedAt') END AS updatedAt
      FROM bot_chat_links l JOIN chats c ON c.id=l.chat_id
      WHERE (l.bot_id=? OR (?=1 AND l.bot_id IS NULL)) AND l.role='history'`).all(botId, bot.seedKey === 'coordinator' ? 1 : 0) as { chat_id: string; bot_id: string | null; reason: string; title: unknown; updatedAt: unknown }[];
    return { ...this.withPageTasks(this.ai.syncChat(bot.mainChatId, undefined, undefined, view, this.internalReplyIds(bot.mainChatId))), bot, history: rows.map(row => ({
      chatId: row.chat_id, title: typeof row.title === 'string' ? row.title : '待恢复的历史记录',
      updatedAt: typeof row.updatedAt === 'string' ? row.updatedAt : '', reason: row.reason, canReference: row.bot_id === botId,
    })).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) };
  }
  private internalReplyIds(chatId: string): Set<string> {
    const rows = this.db.prepare("SELECT id FROM bot_messages WHERE to_bot_id=? AND json_extract(payload,'$.kind') IN ('result','cancel')").all(this.link(chatId)?.bot_id ?? '') as { id: string }[];
    return new Set(rows.map(row => row.id));
  }
  chatForDisplay(chat: ChatSession): ChatSession {
    const internal = this.internalReplyIds(chat.id);
    return { ...chat, entries: chat.entries.filter(entry => !internal.has(entry.id)) };
  }
  syncChat(chatId: string, after?: number, epoch?: string, view?: BotChatView) {
    const result = this.ai.syncChat(chatId, after, epoch, view, this.internalReplyIds(chatId));
    return 'chat' in result ? this.withPageTasks(result) : result;
  }
  private withPageTasks(snapshot: BotChatSnapshot): BotChatSnapshot {
    const ids = [...snapshot.chat.entries, ...snapshot.liveEntries].filter(entry => entry.role === 'assistant').map(entry => entry.id);
    if (!ids.length) return snapshot;
    const rows = this.db.prepare(`SELECT payload FROM bot_tasks WHERE chat_id=? AND json_extract(payload,'$.kind') <> 'message'
      AND (json_extract(payload,'$.assistantEntryId') IN (SELECT value FROM json_each(?)) OR EXISTS (
        SELECT 1 FROM json_each(bot_tasks.payload,'$.assistantEntryIds') WHERE value IN (SELECT value FROM json_each(?))))`)
      .all(snapshot.chat.id, json(ids), json(ids)) as { payload: string }[];
    return { ...snapshot, pageTasks: rows.map(row => JSON.parse(row.payload) as BotTask) };
  }
  conversationEntries(task: BotTask) {
    const ids = new Set([task.sourceMessageId, task.latestUserMessageId, task.assistantEntryId, ...(task.assistantEntryIds ?? [])]);
    return this.chatForDisplay(this.ai.chat(task.chatId)).entries.filter(entry => ids.has(entry.id));
  }
  updateProfile(id: string, revision: number, patch: Pick<BotProfile, 'name' | 'avatar' | 'description' | 'instructions' | 'modelId'>): BotProfile {
    return this.transaction(() => { const bot = this.profile(id); this.checkRevision(bot, revision); const next = { ...bot, ...patch, avatar: normalizeBotAvatar(patch.avatar), revision: revision + 1, updatedAt: now() }; this.put('bots', id, next); return next; });
  }
  checkRevision(current: { revision: number }, revision: number): void { if (current.revision !== revision) throw new BotError('VERSION_CONFLICT', '内容已更新，请刷新后重试', current); }
  draft(chatId: string, surface: BotDraftSurface = 'main'): DraftSnapshot {
    const link = this.link(chatId);
    if (!link || link.role !== 'main') throw new BotError('HISTORY_READ_ONLY', '历史对话仅供查阅，请回到 Bot 主对话继续');
    const row = this.db.prepare('SELECT revision,payload FROM bot_drafts WHERE chat_id=? AND surface=?').get(chatId, surface) as { revision: number; payload: string } | undefined;
    return { chatId, surface, revision: row?.revision ?? 0, ...(row ? JSON.parse(row.payload) as BotDraftValue : { text: '', replyToTaskId: null, resources: [] }) };
  }
  private writeDraft(chatId: string, surface: BotDraftSurface, value: BotDraftValue, revision: number): DraftSnapshot {
    this.db.prepare('INSERT INTO bot_drafts VALUES(?,?,?,?) ON CONFLICT(chat_id,surface) DO UPDATE SET revision=excluded.revision,payload=excluded.payload').run(chatId, surface, revision, json(value));
    return { chatId, surface, revision, ...value };
  }
  saveDraft(chatId: string, expectedRevision: number, value: BotDraftValue, surface: BotDraftSurface = 'main'): DraftSnapshot {
    return this.transaction(() => { const current = this.draft(chatId, surface); if (current.revision !== expectedRevision) throw new BotError('DRAFT_CONFLICT', '这处草稿已更新，当前输入仍保留。请核对后重试保存。', current); return this.writeDraft(chatId, surface, value, current.revision + 1); });
  }
  submit(input: BotSubmit, validate: () => void, surface: BotDraftSurface = 'main'): BotSubmitReceipt {
    return this.transaction(() => {
      const hash = payloadHash({ botId: input.botId, chatId: input.chatId, surface, text: input.text, replyToTaskId: input.replyToTaskId, resources: input.resources, pageContext: input.pageContext ?? {}, ...(input.target ? { target: input.target } : {}) });
      const accepted = this.db.prepare('SELECT * FROM bot_submissions WHERE id=?').get(input.clientRequestId) as { input_hash: string; task_id: string; message_id: string; disposition: 'created' | 'amended' } | undefined;
      if (accepted) {
        if (accepted.input_hash !== hash) throw new BotError('REQUEST_ID_CONFLICT', '同一个发送标识不能提交不同内容');
        return { task: this.task(accepted.task_id), messageId: accepted.message_id, draft: this.draft(input.chatId, surface), duplicate: true, disposition: accepted.disposition };
      }
      const existing = this.db.prepare('SELECT input_hash,payload FROM bot_tasks WHERE client_request_id=?').get(input.clientRequestId) as { input_hash: string; payload: string } | undefined;
      if (existing) {
        if (existing.input_hash !== hash) throw new BotError('REQUEST_ID_CONFLICT', '同一个发送标识不能提交不同内容');
        const task = JSON.parse(existing.payload) as BotTask;
        return { task, messageId: task.sourceMessageId, draft: this.draft(input.chatId, surface), duplicate: true };
      }
      const bot = this.profile(input.botId);
      if (!bot.enabled || bot.mainChatId !== input.chatId) throw new BotError('WRONG_BOT', '对话不属于当前 Bot');
      validate();
      const draft = this.draft(input.chatId, surface);
      if (draft.revision !== input.expectedDraftRevision) throw new BotError('DRAFT_CONFLICT', '草稿已更新，请核对后发送', draft);
      if (payloadHash({ text: input.text, replyToTaskId: input.replyToTaskId, resources: input.resources }) !== payloadHash({ text: draft.text, replyToTaskId: draft.replyToTaskId, resources: draft.resources })) throw new BotError('DRAFT_CONFLICT', '发送内容尚未保存，请重试', draft);
      if (input.replyToTaskId && this.task(input.replyToTaskId).chatId !== input.chatId) throw new BotError('WRONG_TASK', '回复目标不属于当前对话');
      if (input.target) return this.amend(input, surface, hash, draft);
      const id = randomUUID(), messageId = randomUUID();
      const task: BotTask = { id, botId: bot.id, chatId: input.chatId, rootTaskId: id, sourceMessageId: messageId, kind: input.resources.length > 0 || !!input.replyToTaskId || input.pageContext?.scope && ['copy', 'bazi', 'reading'].includes(input.pageContext.scope.module) || input.pageContext?.scope?.module === 'workbench' && ['browser', 'media-browser'].includes(input.pageContext.scope.viewId) ? 'work' : 'chat', status: 'queued', title: input.text.slice(0, 60), input: input.text, resources: input.resources, context: input.pageContext ?? {}, operationIds: [], dependencyIds: [], revision: 0, createdAt: now(), updatedAt: now(), ...(input.replyToTaskId ? { replyToEntryId: this.task(input.replyToTaskId).assistantEntryId } : {}) };
      const chat = this.ai.chat(input.chatId);
      chat.entries.push({ id: messageId, role: 'user', content: input.text, contextScope: input.pageContext?.scope ?? seedScope(bot.seedKey), pageScope: input.pageContext?.pageScope, references: input.pageContext?.references, copySource: input.pageContext?.copySource, baziSystem: input.pageContext?.baziSystem });
      this.ai.saveChat(chat);
      this.insertTask(task, input.clientRequestId, hash);
      this.db.prepare('INSERT INTO bot_submissions VALUES(?,?,?,?,?,?,?)').run(input.clientRequestId, input.chatId, surface, hash, id, messageId, 'created');
      const cleared = this.writeDraft(input.chatId, surface, { text: '', replyToTaskId: null, resources: [] }, draft.revision + 1);
      return { task, messageId, draft: cleared, duplicate: false };
    });
  }
  submissionStatus(input: BotSubmit, surface: BotDraftSurface, dataEpoch?: string): import('../shared/bot-contracts').BotSubmissionStatus {
    const epoch = this.ai.setting('bot.dataEpoch', '');
    const accepted = this.db.prepare('SELECT id FROM bot_submissions WHERE id=?').get(input.clientRequestId) || this.db.prepare('SELECT id FROM bot_tasks WHERE client_request_id=?').get(input.clientRequestId);
    if (!accepted && dataEpoch && dataEpoch !== epoch) return { status: 'epoch_changed', dataEpoch: epoch };
    if (!accepted) return { status: 'not_found', dataEpoch: epoch };
    // submit's duplicate path checks the immutable fingerprint before returning a receipt.
    return { status: 'accepted', dataEpoch: epoch, receipt: this.submit(input, () => { throw new BotError('REQUEST_NOT_FOUND', '发送记录未找到'); }, surface) };
  }
  private amend(input: BotSubmit, surface: BotDraftSurface, hash: string, draft: DraftSnapshot): BotSubmitReceipt {
    const target = input.target!, root = this.task(target.rootTaskId), task = this.task(target.taskId);
    if (root.rootTaskId !== root.id || root.chatId !== input.chatId || root.botId !== input.botId || task.rootTaskId !== root.id) throw new BotError('WRONG_TASK', '补充目标不属于发起对话');
    if (terminalTask(root.status) || terminalTask(task.status)) throw new BotError('TASK_FINISHED', '原工作已经结束，请根据真实结果发起新的修改');
    const page = task.context.pageScope ?? task.context.scope;
    if (task.status === 'running' && page?.module === 'workbench' && ['browser', 'media-browser'].includes(page.viewId)) throw new BotError('TASK_BUSY', '浏览器步骤正在执行，请等实际结果返回后补充');
    const actions = this.actions(task.id);
    if (actions.some(action => ['executing', 'unknown'].includes(action.status))) throw new BotError('RECONCILIATION_REQUIRED', '原操作正在写入或结果待核对，请先等待真实回执');
    if (target.actionId) {
      const action = this.action(target.actionId);
      if (action.taskId !== task.id || target.expectedActionRevision === undefined) throw new BotError('WRONG_ACTION', '补充操作与工作不一致');
      this.checkRevision(action, target.expectedActionRevision);
      if (!['pending', 'superseded', 'failed'].includes(action.status)) throw new BotError('ACTION_NOT_PENDING', '原建议已经处理，请读取实际结果');
    }
    const messageId = randomUUID(), requirementsRevision = (task.requirementsRevision ?? 0) + 1;
    for (const action of actions) if (action.status === 'pending') this.updateAction(action.id, { status: 'superseded', error: '已接收补充，正在更新建议；原版本不能再应用' });
    const previous = target.actionId ? this.action(target.actionId) : actions.find(action => ['todo', 'copy'].includes(action.kind) && action.status === 'pending');
    const updated = this.updateTask(task.id, { status: 'queued', requirementsRevision, amendedActionId: previous?.id, ...(task.id === root.id ? { latestUserMessageId: messageId } : {}),
      input: `${task.input}\n\n用户补充：${input.text}`,
      resumeInput: `继续同一项工作，不要另建或重复委派。原目标：${task.input}\n最新补充：${input.text}\n${previous ? `原建议（未执行，必须重新生成完整预览）：${json(previous.payload)}` : ''}`,
      reason: '已接收补充，正在更新建议' });
    if (task.id !== root.id) this.updateTask(root.id, { latestUserMessageId: messageId });
    const chat = this.ai.chat(input.chatId); chat.entries.push({ id: messageId, role: 'user', content: input.text }); this.ai.saveChat(chat);
    if (task.botId !== root.botId) this.insertMessage({ id: randomUUID(), fromBotId: root.botId, toBotId: task.botId, taskId: task.id, rootTaskId: root.id, parentTaskId: task.parentTaskId!, sourceUserMessageId: messageId, replyTo: task.sourceMessageId, kind: 'request', content: `原目标：${task.input}\n补充要求：${input.text}`, references: task.resources, createdAt: now(), deliveredAt: now() });
    this.db.prepare('INSERT INTO bot_submissions VALUES(?,?,?,?,?,?,?)').run(input.clientRequestId, input.chatId, surface, hash, task.id, messageId, 'amended');
    return { task: updated, messageId, disposition: 'amended', duplicate: false, draft: this.writeDraft(input.chatId, surface, { text: '', replyToTaskId: null, resources: [] }, draft.revision + 1) };
  }
  collaboration(rootTaskId: string): BotCollaboration {
    const root = this.task(rootTaskId);
    if (root.rootTaskId !== root.id) throw new BotError('WRONG_TASK', '请从原发起工作读取协作');
    const tasks = (this.db.prepare("SELECT payload FROM bot_tasks WHERE json_extract(payload,'$.rootTaskId')=?").all(root.id) as { payload: string }[]).map(row => JSON.parse(row.payload) as BotTask).sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    return { root, tasks, actions: tasks.flatMap(task => this.actions(task.id)), messages: this.all<BotMessage>('bot_messages').filter(message => message.rootTaskId === root.id), artifacts: this.all<BotArtifact>('bot_artifacts').filter(artifact => artifact.rootTaskId === root.id) };
  }
  exchange(botA: string, botB: string, query: BotExchangeQuery = {}, allowedRootBot?: string): BotExchange {
    this.profile(botA); this.profile(botB);
    if (botA === botB) throw new BotError('INVALID_PAIR', '请选择两位不同的 Bot');
    const pair = "((json_extract(payload,'$.fromBotId')=? AND to_bot_id=?) OR (json_extract(payload,'$.fromBotId')=? AND to_bot_id=?))";
    const permission = allowedRootBot ? " AND (EXISTS(SELECT 1 FROM bot_tasks t WHERE t.id=json_extract(bot_messages.payload,'$.rootTaskId') AND t.bot_id=?) OR (json_extract(payload,'$.rootTaskId') IS NULL AND (json_extract(payload,'$.fromBotId')=? OR to_bot_id=?)))" : '';
    const params = [botA, botB, botB, botA, ...(allowedRootBot ? [allowedRootBot, allowedRootBot, allowedRootBot] : [])];
    const time = "json_extract(payload,'$.createdAt')", limit = Math.min(50, Math.max(1, query.limit ?? 30));
    const anchorId = query.anchorMessageId ?? query.before ?? query.after;
    const anchor = anchorId ? this.db.prepare('SELECT payload FROM bot_messages WHERE ' + pair + permission + ' AND id=?').get(...params, anchorId) as { payload: string } | undefined : undefined;
    if (anchorId && !anchor) throw new BotError('MESSAGE_FORBIDDEN', '该消息不属于当前可见的双方记录');
    const point = anchor ? JSON.parse(anchor.payload) as BotMessage : undefined;
    const read = (direction: '<' | '>', count: number) => (this.db.prepare('SELECT payload FROM bot_messages WHERE ' + pair + permission + (point ? ' AND (' + time + ',id)' + direction + '(?,?)' : '') + ' ORDER BY ' + time + (direction === '<' ? ' DESC,id DESC' : ',id') + ' LIMIT ?').all(...params, ...(point ? [point.createdAt, point.id] : []), count) as { payload: string }[]).map(row => JSON.parse(row.payload) as BotMessage);
    let messages: BotMessage[];
    if (query.anchorMessageId && point) { const before = read('<', Math.floor(limit / 2)).reverse(); messages = [...before, point, ...read('>', limit - before.length - 1)]; }
    else messages = query.after ? read('>', limit) : read('<', limit).reverse();
    const exists = (message: BotMessage | undefined, direction: '<' | '>') => !!message && !!this.db.prepare('SELECT 1 FROM bot_messages WHERE ' + pair + permission + ' AND (' + time + ',id)' + direction + '(?,?) LIMIT 1').get(...params, message.createdAt, message.id);
    return { messages, hasEarlier: exists(messages[0], '<'), hasLater: exists(messages.at(-1), '>') };
  }

  insertTask(task: BotTask, requestId: string | null = null, hash: string | null = null): void { this.db.prepare('INSERT INTO bot_tasks VALUES(?,?,?,?,?,?,?,?)').run(task.id, task.botId, task.chatId, task.status, task.parentTaskId ?? null, requestId, hash, json(task)); }
  task(id: string): BotTask { return this.get('bot_tasks', id); }
  setActivity(id: string, activity: BotRunActivity): boolean {
    if (this.task(id).status !== 'running' || this.activities.get(id) === activity) return false;
    this.activities.set(id, activity); return true;
  }
  tasks(botId?: string, limit = 100): BotTask[] { return this.all<BotTask>('bot_tasks').filter(t => !botId || t.botId === botId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, limit); }
  updateTask(id: string, patch: Partial<BotTask>): BotTask {
    const current = this.task(id), next = { ...current, ...patch, id, revision: current.revision + 1, updatedAt: now() };
    this.db.prepare('UPDATE bot_tasks SET status=?,payload=? WHERE id=?').run(next.status, json(next), id);
    if (next.status !== 'running' || current.status !== 'running') this.activities.delete(id);
    return next;
  }
  action(id: string): BotAction { return this.get('bot_actions', id); }
  actions(taskId: string): BotAction[] { return (this.db.prepare('SELECT payload FROM bot_actions WHERE task_id=?').all(taskId) as { payload: string }[]).map(row => JSON.parse(row.payload)); }
  insertAction(action: BotAction): void { this.db.prepare('INSERT INTO bot_actions VALUES(?,?,?)').run(action.id, action.taskId, json(action)); }
  updateAction(id: string, patch: Partial<BotAction>): BotAction { const current = this.action(id), next = { ...current, ...patch, id, revision: current.revision + 1, updatedAt: now() }; this.put('bot_actions', id, next); return next; }
  insertMessage(message: BotMessage): void { this.db.prepare('INSERT INTO bot_messages VALUES(?,?,?,?)').run(message.id, message.toBotId, Number(!!message.deliveredAt), json(message)); }
  deliverMessage(id: string): void { const message = this.get<BotMessage>('bot_messages', id); this.db.prepare('UPDATE bot_messages SET delivered=1,payload=? WHERE id=?').run(json({ ...message, deliveredAt: now() }), id); }
  notifications(botId: string): BotMessage[] { return (this.db.prepare("SELECT payload FROM bot_messages WHERE to_bot_id=? AND json_extract(payload,'$.purpose')='notification' AND json_extract(payload,'$.consumedAt') IS NULL ORDER BY json_extract(payload,'$.createdAt'),id LIMIT 16").all(botId) as { payload: string }[]).map(row => JSON.parse(row.payload)); }
  consumeNotification(id: string): void { const message = this.get<BotMessage>('bot_messages', id); this.put('bot_messages', id, { ...message, consumedAt: now() }); }
  artifact(value: BotArtifact, key: string): BotArtifact {
    const existing = this.db.prepare('SELECT payload FROM bot_artifacts WHERE task_id=? AND idempotency_key=?').get(value.taskId, key) as { payload: string } | undefined;
    if (existing) return JSON.parse(existing.payload) as BotArtifact;
    this.db.prepare('INSERT INTO bot_artifacts VALUES(?,?,?,?)').run(value.id, value.taskId, key, json(value)); return value;
  }
  memories(botId: string): BotMemory[] { return this.all<BotMemory>('bot_memories').filter(m => m.scope === 'shared' || m.botId === botId); }
  saveMemory(input: Omit<BotMemory, 'updatedAt'>): BotMemory {
    return this.transaction(() => { const existing = this.all<BotMemory>('bot_memories').find(m => m.id === input.id); if (existing) this.checkRevision(existing, input.revision); const next = { ...input, revision: input.revision + 1, updatedAt: now() }; this.db.prepare('INSERT INTO bot_memories VALUES(?,?,?) ON CONFLICT(id) DO UPDATE SET bot_id=excluded.bot_id,payload=excluded.payload').run(next.id, next.botId, json(next)); return next; });
  }
  removeMemory(id: string, revision: number): void { this.transaction(() => { this.checkRevision(this.get<BotMemory>('bot_memories', id), revision); this.db.prepare('DELETE FROM bot_memories WHERE id=?').run(id); }); }
  saveSchedule(input: Omit<BotSchedule, 'nextRunAt' | 'updatedAt'>): BotSchedule {
    return this.transaction(() => {
      this.profile(input.botId);
      const existing = this.all<BotSchedule>('bot_schedules').find(s => s.id === input.id);
      if (existing) {
        this.checkRevision(existing, input.revision);
        if (existing.botId !== input.botId) throw new BotError('INVALID_SCHEDULE', '定时任务属于其他 Bot');
      } else if (input.revision !== 0) {
        throw new BotError('NOT_FOUND', '定时任务已移除');
      }
      const updatedAt = now(), resuming = existing?.enabled === false && input.enabled;
      const nextRunAt = existing && !resuming && canonical(existing.spec) === canonical(input.spec)
        ? existing.nextRunAt : nextScheduleAt(input.spec, updatedAt);
      const next = { ...input, nextRunAt, revision: input.revision + 1, updatedAt };
      this.writeSchedule(next);
      return next;
    });
  }
  removeSchedule(id: string, revision: number): string {
    return this.transaction(() => {
      const schedule = this.get<BotSchedule>('bot_schedules', id);
      this.checkRevision(schedule, revision);
      this.db.prepare('DELETE FROM bot_schedules WHERE id=?').run(id);
      return schedule.botId;
    });
  }
  private writeSchedule(s: BotSchedule): void { this.db.prepare('INSERT INTO bot_schedules VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET enabled=excluded.enabled,next_run_at=excluded.next_run_at,payload=excluded.payload').run(s.id, s.botId, Number(s.enabled), s.nextRunAt, json(s)); }
  fireSchedules(at = now()): BotTask[] {
    return this.transaction(() => {
      const tasks: BotTask[] = [];
      for (const schedule of this.all<BotSchedule>('bot_schedules').filter(s => s.enabled && Date.parse(s.nextRunAt) <= Date.parse(at))) {
        const bot = this.profile(schedule.botId), id = randomUUID();
        const inserted = this.db.prepare('INSERT OR IGNORE INTO bot_schedule_firings VALUES(?,?,?)').run(schedule.id, schedule.nextRunAt, id).changes;
        if (inserted) {
          const task: BotTask = { id, botId: bot.id, chatId: bot.mainChatId, rootTaskId: id, sourceMessageId: randomUUID(), kind: 'routine', status: 'queued', title: schedule.title, input: schedule.prompt, context: {}, resources: [], operationIds: [], dependencyIds: [], revision: 0, createdAt: at, updatedAt: at };
          this.insertTask(task); tasks.push(task);
        }
        this.writeSchedule({ ...schedule, enabled: schedule.spec.kind !== 'once', nextRunAt: nextScheduleAt(schedule.spec, at), revision: schedule.revision + 1, updatedAt: at });
      }
      return tasks;
    });
  }
  recover(): void {
    this.transaction(() => {
      for (const task of this.all<BotTask>('bot_tasks')) {
        if (task.status === 'running') this.updateTask(task.id, { status: 'interrupted', reason: '后台运行中断，请核对任务记录后继续', workerId: undefined });
        if (task.status === 'waiting_user' && task.reason === '等待浏览器站点授权或继续操作') this.updateTask(task.id, { status: 'waiting_resource', reason: '浏览器授权会话已中断，请打开工作区后继续' });
        for (const action of this.actions(task.id)) if (action.status === 'executing') { this.updateAction(action.id, { status: 'unknown', error: '写入回执待核对，不会自动重试' }); this.updateTask(task.id, { status: 'waiting_user', reason: '业务写入结果待核对' }); }
      }
      for (const bot of this.all<BotProfile>('bots')) {
        const chat = this.ai.chat(bot.mainChatId); let changed = false;
        for (const entry of chat.entries) if (entry.streaming) { changed = true; entry.streaming = false; entry.thinkingActive = false; delete entry.responsePhase; for (const tool of entry.tools ?? []) if (tool.status === 'running') tool.status = 'interrupted'; }
        if (changed) this.ai.saveChat(chat);
      }
    });
  }
}
