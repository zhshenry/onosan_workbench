import { existsSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { writeJsonAtomic } from '../modules/storage/json-file';
import { AgentEventSchema, AgentMessageSchema, agentPending, type AgentMessage, type AgentReadTarget } from '../shared/agent-message-contracts';

export class AgentMessageStore {
  private messages: AgentMessage[] = [];
  readonly loadError: string = '';
  private file: string;
  constructor(dir: string, private now = Date.now) {
    this.file = join(dir, 'agent-messages.json');
    if (existsSync(this.file)) {
      try { this.messages = z.array(AgentMessageSchema).parse(JSON.parse(readFileSync(this.file, 'utf8'))); }
      catch { this.loadError = 'Agent 消息无法读取，原文件已保留'; }
    }
  }
  read(): AgentMessage[] { return structuredClone(this.messages); }
  get(id: string): AgentMessage {
    const message = this.messages.find(value => value.id === id);
    if (!message) throw new Error('这条 Agent 消息已不可用');
    return structuredClone(message);
  }
  private commit(messages: AgentMessage[]): void {
    if (this.loadError) throw new Error(this.loadError);
    writeJsonAtomic(this.file, messages); this.messages = messages;
  }
  markRead(id: string): void {
    this.get(id);
    if (this.messages.find(message => message.id === id)!.readAt !== null) return;
    this.commit(this.messages.map(message => message.id === id ? { ...message, readAt: this.now() } : message));
  }
  markReadAll(targets: AgentReadTarget[]): string[] {
    const versions = new Map(targets.map(target => [target.id, target.updatedAt])), marked: string[] = [], now = this.now();
    const messages = this.messages.map(message => {
      if (message.readAt !== null || versions.get(message.id) !== message.updatedAt) return message;
      marked.push(message.id); return { ...message, readAt: now };
    });
    if (marked.length) this.commit(messages);
    return marked;
  }
  ingest(input: unknown): AgentMessage | null {
    const event = AgentEventSchema.parse(input), messages = this.read();
    const sameTurn = (message: AgentMessage) => message.provider === event.provider && message.sessionId === event.sessionId && message.turnId === event.turnId;
    let changed = false;
    if (event.kind !== 'approval') {
      for (const message of messages) {
        if (sameTurn(message) && agentPending(message) && (event.kind !== 'resolved' || message.requestKey === event.requestKey) && event.occurredAt >= message.updatedAt) {
          message.resolvedAt = event.occurredAt; message.updatedAt = event.occurredAt; changed = true;
        }
      }
    }
    if (event.kind === 'resolved' || event.kind === 'finished') { if (changed) this.commit(messages); return null; }
    const id = createHash('sha256').update(JSON.stringify([event.provider, event.sessionId, event.turnId, event.kind === 'approval' ? event.requestKey : 'response'])).digest('hex').slice(0, 32);
    const previous = messages.find(message => message.id === id);
    // A completed stop event must not replace an already captured final response or make a read reply unread again.
    if (previous && (event.occurredAt <= previous.updatedAt || previous.kind === 'failed' && event.kind === 'reply' || event.kind !== 'approval' && previous.kind === event.kind || event.kind === 'approval' && previous.resolvedAt === null)) {
      if (changed) this.commit(messages); return null;
    }
    const workspace = (isAbsolute(event.workspace) || win32.isAbsolute(event.workspace)) && !/^[/\\]{2}/.test(event.workspace) ? event.workspace : '';
    const clean = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
    const message: AgentMessage = {
      id, provider: event.provider, sessionId: event.sessionId, turnId: event.turnId, requestKey: event.requestKey,
      workspace, project: clean(win32.basename(workspace) || basename(workspace) || '未命名项目'),
      kind: event.kind, title: clean(event.title) || (event.kind === 'approval' ? '有操作需要你授权' : event.kind === 'failed' ? '运行失败，请回到客户端查看' : '有新回复，回来看看吧。'),
      detail: clean(event.detail), createdAt: previous?.createdAt ?? event.occurredAt, updatedAt: event.occurredAt, readAt: null, resolvedAt: null,
    };
    this.commit([message, ...messages.filter(value => value.id !== id)].sort((a, b) => b.updatedAt - a.updatedAt));
    return structuredClone(message);
  }
}

export function agentMessageUrl(message: AgentMessage): string {
  if (message.provider === 'codex') return `codex://threads/${encodeURIComponent(message.sessionId)}`;
  if (!message.workspace) throw new Error('这条 Cursor 消息没有项目路径，请在 Cursor 中按会话编号定位');
  const url = new URL('cursor://file/');
  url.pathname = `/${message.workspace.replace(/\\/g, '/').replace(/^\//, '')}`;
  return url.href;
}
