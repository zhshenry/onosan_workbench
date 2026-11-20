// 工作台 AI 独立存储，与 OnO / CMO 共用的事项库分开。
// - 供应商/模型/Key → userData/ai-config.json(Key 为 safeStorage 密文)
// - 对话会话 → userData/chats.db(结构同上游 chats 表,逻辑自上游 store.ts 平移)
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatSession, ChatSummary, RlcdProviderKind } from '../shared/todo-contracts';
import { sameAiWorkbench, chatScope, type AiScope } from '../shared/ai-scope';
import { botChatPageSize, type BotChatSnapshot, type BotChatSync, type BotChatUpdate, type BotChatView } from '../shared/bot-contracts';

export type StoredProvider = { id: string; kind: 'openai' | 'anthropic' | 'deepseek' | 'custom'; name: string; endpoint: string; protocol: 'openai-chat' | 'openai-responses' | 'anthropic'; apiKey: string };
export type StoredModel = { id: string; providerId: string; name: string; supportsImages?: boolean };
export type StoredRlcdProvider = Omit<StoredProvider, 'kind'> & { kind: RlcdProviderKind };
export interface AiConfigFile {
  providers: StoredProvider[];
  models: StoredModel[];
  activeModelId: string;
  rlcdProviders: StoredRlcdProvider[];
  rlcdModels: StoredModel[];
  activeRlcdModelId: string;
  aiEnabled: boolean;
  hasConfiguredModel?: boolean;
}

const emptyConfig = (): AiConfigFile => ({ providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '', aiEnabled: false, hasConfiguredModel: false });

function hasConversationModel(providers: StoredProvider[], models: StoredModel[]): boolean {
  return models.some(model => providers.some(provider => provider.id === model.providerId));
}

export class AiStore {
  private readonly todoCards = new Map<string, Pick<ChatSession['entries'][number], 'todoReceipt' | 'todoApplyError' | 'actionState'> & { preview?: import('../shared/todo-proposal').ProposalPreview[] }>();
  readonly db: DatabaseSync;
  private readonly configPath: string;

  constructor(dir: string, options: { recover?: boolean } = {}) {
    mkdirSync(dir, { recursive: true });
    this.configPath = join(dir, 'ai-config.json');
    this.db = new DatabaseSync(join(dir, 'chats.db'));
    const version = (this.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version;
    if (version > 6) { this.db.close(); throw new Error('AI 数据来自更新版本，请升级应用后再打开'); }
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS bot_chat_cursors(chat_id TEXT PRIMARY KEY, sequence INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS bot_chat_records(chat_id TEXT NOT NULL,entry_id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(chat_id,entry_id));
      CREATE TABLE IF NOT EXISTS bot_chat_events(chat_id TEXT NOT NULL,sequence INTEGER NOT NULL,payload TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(chat_id,sequence));`);
    if (version === 0) this.db.exec('PRAGMA user_version=1');
    if (options.recover !== false && version < 2) this.recoverChats();
  }

  // ---------- 配置(JSON 文件,损坏时回到空配置) ----------
  readConfig(): AiConfigFile {
    try {
      if (!existsSync(this.configPath)) return emptyConfig();
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<AiConfigFile>;
      const providers = Array.isArray(parsed.providers) ? parsed.providers.filter(p => p && typeof p.id === 'string') : [];
      const models = Array.isArray(parsed.models) ? parsed.models.filter(m => m && typeof m.id === 'string') : [];
      return {
        providers,
        models,
        activeModelId: typeof parsed.activeModelId === 'string' ? parsed.activeModelId : '',
        rlcdProviders: Array.isArray(parsed.rlcdProviders) ? parsed.rlcdProviders.filter(p => p && typeof p.id === 'string') : [],
        rlcdModels: Array.isArray(parsed.rlcdModels) ? parsed.rlcdModels.filter(m => m && typeof m.id === 'string') : [],
        activeRlcdModelId: typeof parsed.activeRlcdModelId === 'string' ? parsed.activeRlcdModelId : '',
        aiEnabled: hasConversationModel(providers, models),
        hasConfiguredModel: parsed.hasConfiguredModel === true || models.length > 0,
      };
    } catch {
      return emptyConfig();
    }
  }
  writeConfig(config: AiConfigFile): void {
    const snapshot = { ...config, aiEnabled: hasConversationModel(config.providers, config.models) };
    writeFileSync(this.configPath, JSON.stringify(snapshot, null, 2), 'utf8');
  }

  // ---------- 会话(逻辑平移自上游 store.ts 的 chats 段) ----------
  chats(): ChatSummary[] {
    return (this.db.prepare('SELECT payload FROM chats').all() as { payload: string }[])
      .flatMap(row => {
        let parsed: ChatSession;
        try { parsed = JSON.parse(row.payload) as ChatSession; } catch { return []; }
        if (!parsed || !Array.isArray(parsed.entries) || parsed.entries.some(entry => !entry || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string') || typeof parsed.id !== 'string' || typeof parsed.updatedAt !== 'string') return [];
        const { id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope, entries } = this.withBotRecords(parsed);
        const lastReply = [...entries].reverse().find(entry => entry.role === 'assistant');
        return [{ id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope, baziSystem: [...entries].reverse().find(entry => entry.baziSystem)?.baziSystem, streaming: entries.some(entry => entry.streaming), completed: !!lastReply && !lastReply.streaming && !lastReply.error }];
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  chat(id: string): ChatSession {
    const row = this.db.prepare('SELECT payload FROM chats WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) throw new Error('对话不存在,请重新选择');
    let chat: ChatSession;
    try { chat = JSON.parse(row.payload) as ChatSession; }
    catch { throw new Error('历史记录格式已损坏，原数据仍保留在本地备份中'); }
    if (!chat || !Array.isArray(chat.entries) || chat.entries.some(entry => !entry || !['user', 'assistant'].includes(entry.role) || typeof entry.content !== 'string')) throw new Error('历史记录结构无效，原数据仍保留在本地备份中');
    this.withBotRecords(chat);
    for (const entry of chat.entries) if (entry.proposal) {
      const card = this.todoCards.get(entry.proposal.token);
      if (card) { entry.proposal.preview = card.preview; entry.todoReceipt = card.todoReceipt; entry.todoApplyError = card.todoApplyError; if (card.actionState) entry.actionState = card.actionState; }
    }
    return chat;
  }
  private withBotRecords(chat: ChatSession): ChatSession {
    const records = new Map((this.db.prepare('SELECT entry_id,payload FROM bot_chat_records WHERE chat_id=?').all(chat.id) as { entry_id: string; payload: string }[]).map(row => [row.entry_id, JSON.parse(row.payload) as ChatSession['entries'][number]]));
    chat.entries = chat.entries.map(entry => records.get(entry.id) ?? entry);
    const last = this.db.prepare('SELECT updated_at FROM bot_chat_events WHERE chat_id=? ORDER BY sequence DESC LIMIT 1').get(chat.id) as { updated_at: string } | undefined;
    if (last) chat.updatedAt = last.updated_at;
    return chat;
  }
  saveChat(chat: ChatSession): ChatSession {
    const next = { ...chat, updatedAt: new Date().toISOString() };
    const persisted = structuredClone(next);
    for (const entry of persisted.entries) if (entry.proposal) {
      this.todoCards.set(entry.proposal.token, { preview: entry.proposal.preview, todoReceipt: entry.todoReceipt, todoApplyError: entry.todoApplyError, actionState: entry.actionState });
      delete entry.proposal.preview; delete entry.todoReceipt; delete entry.todoApplyError;
    }
    this.db.exec('SAVEPOINT save_chat');
    try {
      this.db.prepare('INSERT OR REPLACE INTO chats(id,payload) VALUES (?,?)').run(next.id, JSON.stringify(persisted));
      this.db.prepare('DELETE FROM bot_chat_records WHERE chat_id=?').run(next.id);
      this.recordChatEvent(next.id, null, next.updatedAt);
      this.db.exec('RELEASE save_chat');
    } catch (error) { this.db.exec('ROLLBACK TO save_chat; RELEASE save_chat'); throw error; }
    return next;
  }
  private recordChatEvent(chatId: string, payload: string | null, updatedAt: string): number {
    const sequence = Number((this.db.prepare('INSERT INTO bot_chat_cursors VALUES(?,1) ON CONFLICT(chat_id) DO UPDATE SET sequence=sequence+1 RETURNING sequence').get(chatId) as { sequence: number }).sequence);
    this.db.prepare('INSERT INTO bot_chat_events VALUES(?,?,?,?)').run(chatId, sequence, payload, updatedAt);
    this.db.prepare('DELETE FROM bot_chat_events WHERE chat_id=? AND sequence<=?').run(chatId, sequence - 256);
    return sequence;
  }
  saveBotEntry(chatId: string, entry: ChatSession['entries'][number]): BotChatUpdate {
    const updatedAt = new Date().toISOString(), payload = JSON.stringify(entry);
    this.db.exec('SAVEPOINT save_entry');
    try {
      this.db.prepare('INSERT INTO bot_chat_records VALUES(?,?,?) ON CONFLICT(chat_id,entry_id) DO UPDATE SET payload=excluded.payload').run(chatId, entry.id, payload);
      const sequence = this.recordChatEvent(chatId, payload, updatedAt);
      this.db.exec('RELEASE save_entry'); return { chatId, epoch: this.setting('bot.dataEpoch', ''), sequence, entry: structuredClone(entry), updatedAt };
    } catch (error) { this.db.exec('ROLLBACK TO save_entry; RELEASE save_entry'); throw error; }
  }
  syncChat(chatId: string, after?: undefined, previousEpoch?: string, view?: BotChatView, hidden?: ReadonlySet<string>): BotChatSnapshot;
  syncChat(chatId: string, after?: number, previousEpoch?: string, view?: BotChatView, hidden?: ReadonlySet<string>): BotChatSync;
  syncChat(chatId: string, after?: number, previousEpoch?: string, view?: BotChatView, hidden?: ReadonlySet<string>): BotChatSync {
    // The cursor, event rows and legacy JSON must come from the same read transaction.
    this.db.exec('SAVEPOINT read_bot_chat');
    try {
      const epoch = this.setting('bot.dataEpoch', '');
      const sequence = (this.db.prepare('SELECT sequence FROM bot_chat_cursors WHERE chat_id=?').get(chatId) as { sequence: number } | undefined)?.sequence ?? 0;
      if (after !== undefined && after <= sequence && (previousEpoch === undefined || previousEpoch === epoch)) {
        const rows = this.db.prepare('SELECT sequence,payload,updated_at FROM bot_chat_events WHERE chat_id=? AND sequence>? ORDER BY sequence').all(chatId, after) as { sequence: number; payload: string | null; updated_at: string }[];
        if (after === sequence || rows[0]?.sequence === after + 1 && rows.every(row => row.payload !== null)) {
          const updates: BotChatUpdate[] = rows.map(row => ({ chatId, epoch, sequence: row.sequence, entry: JSON.parse(row.payload!), updatedAt: row.updated_at }));
          if (!hidden || updates.every(update => !hidden.has(update.entry.id))) return { epoch, sequence, updates };
        }
      }
      const chat = this.chat(chatId);
      const entries = hidden?.size ? chat.entries.filter(entry => !hidden.has(entry.id)) : chat.entries;
      const cutoff = view?.collapsedAt ? entries.findIndex(entry => entry.id === view.collapsedAt) + 1 : 0;
      const range = view?.range;
      const anchor = range ? entries.findIndex((entry, index) => index >= cutoff && entry.id === range.entryId) : -1;
      let start = Math.max(cutoff, entries.length - botChatPageSize), end = entries.length;
      if (anchor >= 0 && range?.kind === 'older') {
        start = Math.max(cutoff, anchor - botChatPageSize);
        end = Math.min(entries.length, anchor + botChatPageSize);
      } else if (anchor >= 0 && range?.kind === 'newer') {
        start = Math.max(cutoff, anchor + 1 - botChatPageSize);
        end = Math.min(entries.length, anchor + 1 + botChatPageSize);
      } else if (anchor >= 0 && range?.kind === 'from') {
        start = anchor;
        end = Math.min(entries.length, anchor + 2 * botChatPageSize);
      }
      const user = entries.slice().reverse().find(entry => entry.role === 'user');
      return {
        epoch, sequence, chat: { ...chat, entries: entries.slice(start, end) },
        hasEarlier: start > cutoff, hasLater: end < entries.length,
        lastEntryId: entries.at(-1)?.id, collapsedAt: cutoff ? entries[cutoff - 1].id : undefined,
        liveEntries: entries.filter(entry => entry.streaming || entry.actionState === 'pending'),
        latestUser: user ? { id: user.id, content: user.content } : undefined,
        toolReplyIds: entries.filter(entry => entry.tools?.length || entry.browserTask || entry.proposal || ('copyProposal' in entry && entry.copyProposal)).map(entry => entry.id),
      };
    } finally { this.db.exec('RELEASE read_bot_chat'); }
  }
  rememberTodoResult(token: string, receipt: import('../shared/todo-proposal').ProposalReceipt): void {
    this.todoCards.set(token, { ...this.todoCards.get(token), actionState: 'applied', todoReceipt: structuredClone(receipt) });
  }
  newChat(tag: AiScope = { module: 'todo' }): ChatSession {
    const chat = this.saveChat({ id: randomUUID(), title: '新对话', updatedAt: new Date().toISOString(), entries: [], draft: '', ...tag, contextScope: tag, pageScope: tag });
    this.setSetting('activeChatId', chat.id);
    return chat;
  }
  renameChat(id: string, title: string): ChatSession {
    const name = title.trim();
    if (!name || name.length > 80) throw new Error('对话名称需为 1–80 字');
    const chat = this.chat(id);
    if (chat.entries.some(entry => entry.streaming)) throw new Error('这条对话正在生成，请先停止生成');
    return this.saveChat({ ...chat, title: name, titleEdited: true });
  }
  deleteChat(id: string): ChatSession {
    const all = this.chats();
    const index = all.findIndex(item => item.id === id);
    if (index < 0) throw new Error('对话不存在,请重新选择');
    const scope = chatScope(all[index]);
    this.db.prepare('DELETE FROM chats WHERE id=?').run(id);
    const active = this.setting('activeChatId', '');
    if (active && active !== id && all.some(item => item.id === active)) return this.chat(active);
    const remaining = all.filter(item => item.id !== id && sameAiWorkbench(item, scope));
    const next = remaining[Math.min(index, remaining.length - 1)];
    if (next) { this.setSetting('activeChatId', next.id); return this.chat(next.id); }
    return this.newChat(scope);
  }
  resolveChatProposal(token: string, state: 'applied' | 'discarded' | 'expired' | 'revised'): ChatSession | undefined {
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      const entry = chat.entries.find(item => (item.proposal?.token === token || item.copyProposal?.token === token) && item.actionState === 'pending');
      if (!entry) continue;
      entry.actionState = state;
      return this.saveChat(chat);
    }
    return undefined;
  }
  findCopyUndo(token: string): { chat: ChatSession; entry: ChatSession['entries'][number] } | undefined {
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      const entry = chat.entries.find(item => item.copyProposal?.token === token && item.copyUndo && item.actionState === 'applied');
      if (entry) return { chat, entry };
    }
    return undefined;
  }

  recoverChats(): void {
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      let changed = false;
      for (const entry of chat.entries) {
        if (entry.streaming) {
          delete entry.responsePhase;
          delete entry.thinkingStartedAt;
          entry.streaming = false; entry.thinkingActive = false; entry.error = '上次回复因应用退出而中断,可以重新发送。'; changed = true;
          for (const tool of entry.tools ?? []) if (tool.status === 'running') tool.status = 'interrupted';
          chat.draft ||= [...chat.entries].reverse().find(item => item.role === 'user')?.content ?? '';
        }
        if (entry.actionState === 'pending') { entry.actionState = 'expired'; changed = true; }
      }
      if (changed) this.saveChat(chat);
    }
  }
  setting<T>(key: string, fallback: T): T {
    const row = this.db.prepare('SELECT value FROM settings WHERE key=?').get(key) as { value: string } | undefined;
    return row ? JSON.parse(row.value) : fallback;
  }
  setSetting(key: string, value: unknown): void {
    this.db.prepare('INSERT OR REPLACE INTO settings(key,value) VALUES (?,?)').run(key, JSON.stringify(value));
  }
  close(): void { this.db.close(); }
}
