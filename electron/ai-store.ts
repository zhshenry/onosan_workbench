// 工作台 AI 独立存储(用户决策 2026-09-23 修订:AI 不与 To-Do-List 复用,仅待办数据共享):
// - 供应商/模型/Key/启用开关 → userData/ai-config.json(Key 为 safeStorage 密文)
// - 对话会话 → userData/chats.db(结构同上游 chats 表,逻辑自上游 store.ts 平移)
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatSession, ChatSummary, RlcdProviderKind } from '../shared/todo-contracts';
import { sameAiWorkbench, chatScope, type AiScope } from '../shared/ai-scope';

export type StoredProvider = { id: string; kind: 'openai' | 'anthropic' | 'deepseek' | 'custom'; name: string; endpoint: string; protocol: 'openai-chat' | 'openai-responses' | 'anthropic'; apiKey: string };
export type StoredModel = { id: string; providerId: string; name: string };
export type StoredRlcdProvider = Omit<StoredProvider, 'kind'> & { kind: RlcdProviderKind };
export interface AiConfigFile {
  providers: StoredProvider[];
  models: StoredModel[];
  activeModelId: string;
  rlcdProviders: StoredRlcdProvider[];
  rlcdModels: StoredModel[];
  activeRlcdModelId: string;
  aiEnabled: boolean;
}

const emptyConfig = (): AiConfigFile => ({ providers: [], models: [], activeModelId: '', rlcdProviders: [], rlcdModels: [], activeRlcdModelId: '', aiEnabled: false });

export class AiStore {
  readonly db: DatabaseSync;
  private readonly configPath: string;

  constructor(dir: string) {
    mkdirSync(dir, { recursive: true });
    this.configPath = join(dir, 'ai-config.json');
    this.db = new DatabaseSync(join(dir, 'chats.db'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS chats (id TEXT PRIMARY KEY, payload TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      PRAGMA user_version=1;`);
    this.recoverChats();
  }

  // ---------- 配置(JSON 文件,损坏时回到空配置) ----------
  readConfig(): AiConfigFile {
    try {
      if (!existsSync(this.configPath)) return emptyConfig();
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<AiConfigFile>;
      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers.filter(p => p && typeof p.id === 'string') : [],
        models: Array.isArray(parsed.models) ? parsed.models.filter(m => m && typeof m.id === 'string') : [],
        activeModelId: typeof parsed.activeModelId === 'string' ? parsed.activeModelId : '',
        rlcdProviders: Array.isArray(parsed.rlcdProviders) ? parsed.rlcdProviders.filter(p => p && typeof p.id === 'string') : [],
        rlcdModels: Array.isArray(parsed.rlcdModels) ? parsed.rlcdModels.filter(m => m && typeof m.id === 'string') : [],
        activeRlcdModelId: typeof parsed.activeRlcdModelId === 'string' ? parsed.activeRlcdModelId : '',
        aiEnabled: parsed.aiEnabled === true,
      };
    } catch {
      return emptyConfig();
    }
  }
  writeConfig(config: AiConfigFile): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  // ---------- 会话(逻辑平移自上游 store.ts 的 chats 段) ----------
  chats(): ChatSummary[] {
    return (this.db.prepare('SELECT payload FROM chats').all() as { payload: string }[])
      .map(row => {
        const { id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope, entries } = JSON.parse(row.payload) as ChatSession;
        const lastReply = [...entries].reverse().find(entry => entry.role === 'assistant');
        return { id, title, updatedAt, module, draftId, profileId, viewId, contextScope, pageScope, streaming: entries.some(entry => entry.streaming), completed: !!lastReply && !lastReply.streaming && !lastReply.error };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  chat(id: string): ChatSession {
    const row = this.db.prepare('SELECT payload FROM chats WHERE id=?').get(id) as { payload: string } | undefined;
    if (!row) throw new Error('对话不存在,请重新选择');
    return JSON.parse(row.payload) as ChatSession;
  }
  saveChat(chat: ChatSession): ChatSession {
    const next = { ...chat, updatedAt: new Date().toISOString() };
    this.db.prepare('INSERT OR REPLACE INTO chats(id,payload) VALUES (?,?)').run(next.id, JSON.stringify(next));
    return next;
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
