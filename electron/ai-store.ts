// 工作台 AI 独立存储(用户决策 2026-09-23 修订:AI 不与 To-Do-List 复用,仅待办数据共享):
// - 供应商/模型/Key/启用开关 → userData/ai-config.json(Key 为 safeStorage 密文)
// - 对话会话 → userData/chats.db(结构同上游 chats 表,逻辑自上游 store.ts 平移)
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { ChatSession, ChatSummary } from '../shared/todo-contracts';

export type StoredProvider = { id: string; kind: 'openai' | 'anthropic' | 'deepseek' | 'custom'; name: string; endpoint: string; protocol: 'openai-chat' | 'openai-responses' | 'anthropic'; apiKey: string };
export type StoredModel = { id: string; providerId: string; name: string };
export interface AiConfigFile {
  providers: StoredProvider[];
  models: StoredModel[];
  activeModelId: string;
  aiEnabled: boolean;
}

const EMPTY_CONFIG: AiConfigFile = { providers: [], models: [], activeModelId: '', aiEnabled: false };

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
      if (!existsSync(this.configPath)) return { ...EMPTY_CONFIG };
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as Partial<AiConfigFile>;
      return {
        providers: Array.isArray(parsed.providers) ? parsed.providers.filter(p => p && typeof p.id === 'string') : [],
        models: Array.isArray(parsed.models) ? parsed.models.filter(m => m && typeof m.id === 'string') : [],
        activeModelId: typeof parsed.activeModelId === 'string' ? parsed.activeModelId : '',
        aiEnabled: parsed.aiEnabled === true,
      };
    } catch {
      return { ...EMPTY_CONFIG };
    }
  }
  writeConfig(config: AiConfigFile): void {
    writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8');
  }

  // ---------- 会话(逻辑平移自上游 store.ts 的 chats 段) ----------
  chats(): ChatSummary[] {
    return (this.db.prepare('SELECT payload FROM chats').all() as { payload: string }[])
      .map(row => { const { id, title, updatedAt } = JSON.parse(row.payload) as ChatSession; return { id, title, updatedAt }; })
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
  newChat(): ChatSession {
    const chat = this.saveChat({ id: randomUUID(), title: '新对话', updatedAt: new Date().toISOString(), entries: [], draft: '' });
    this.setSetting('activeChatId', chat.id);
    return chat;
  }
  deleteChat(id: string): ChatSession {
    const all = this.chats();
    const index = all.findIndex(item => item.id === id);
    if (index < 0) throw new Error('对话不存在,请重新选择');
    this.db.prepare('DELETE FROM chats WHERE id=?').run(id);
    const active = this.setting('activeChatId', '');
    if (active && active !== id) return this.chat(active);
    const remaining = all.filter(item => item.id !== id);
    const next = remaining[Math.min(index, remaining.length - 1)];
    if (next) { this.setSetting('activeChatId', next.id); return this.chat(next.id); }
    return this.newChat();
  }
  resolveChatProposal(token: string, state: 'applied' | 'discarded' | 'expired' | 'revised'): ChatSession | undefined {
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      const entry = chat.entries.find(item => item.proposal?.token === token && item.actionState === 'pending');
      if (!entry) continue;
      entry.actionState = state;
      return this.saveChat(chat);
    }
    return undefined;
  }

  // 通知中心:各会话中待确认建议的汇总(只读,不改任何状态)
  pendingProposals(): { chatId: string; chatTitle: string; count: number }[] {
    const result: { chatId: string; chatTitle: string; count: number }[] = [];
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      const count = chat.entries.filter(item => item.proposal && item.actionState === 'pending').length;
      if (count > 0) result.push({ chatId: chat.id, chatTitle: chat.title, count });
    }
    return result;
  }
  recoverChats(): void {
    for (const summary of this.chats()) {
      const chat = this.chat(summary.id);
      let changed = false;
      for (const entry of chat.entries) {
        if (entry.streaming) {
          entry.streaming = false; entry.error = '上次回复因应用退出而中断,可以重新发送。'; changed = true;
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
