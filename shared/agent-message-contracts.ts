import { z } from 'zod';

export const AGENT_PROVIDERS = ['codex', 'cursor'] as const;
export type AgentProvider = typeof AGENT_PROVIDERS[number];
export const AGENT_LABELS = { codex: 'Codex', cursor: 'Cursor' } as const;
const identifier = z.string().min(1).max(160).regex(/^[a-zA-Z0-9_.:-]+$/);
export const AgentEventSchema = z.object({
  provider: z.enum(AGENT_PROVIDERS), sessionId: identifier, turnId: identifier,
  kind: z.enum(['reply', 'failed', 'approval', 'resolved', 'finished']),
  requestKey: z.string().max(200).default(''), workspace: z.string().max(4096).default(''),
  title: z.string().max(200).default(''), detail: z.string().max(500).default(''),
  occurredAt: z.number().int().positive(),
}).strict();
export type AgentEvent = z.infer<typeof AgentEventSchema>;
export const AgentMessageSchema = z.object({
  id: z.string(), provider: z.enum(AGENT_PROVIDERS), sessionId: identifier, turnId: identifier,
  requestKey: z.string(), workspace: z.string(), project: z.string(),
  kind: z.enum(['reply', 'failed', 'approval']), title: z.string(), detail: z.string(),
  createdAt: z.number(), updatedAt: z.number(), readAt: z.number().nullable(), resolvedAt: z.number().nullable(),
});
export type AgentMessage = z.infer<typeof AgentMessageSchema>;
export type AgentReadTarget = Pick<AgentMessage, 'id' | 'updatedAt'>;
// connected confirms local hook configuration, not the client's trust decision or actual delivery.
export interface AgentConnection { provider: AgentProvider; connected: boolean; error?: string; }
// PermissionRequest runs before Codex's approval flow, including automatic review; it cannot prove user action is needed.
export function agentMessageVisible(message: AgentMessage): boolean { return message.provider !== 'codex' || message.kind !== 'approval'; }
export function agentPending(message: AgentMessage): boolean { return message.kind === 'approval' && message.resolvedAt === null; }
export function agentMessageStatus(message: AgentMessage): string {
  return agentPending(message) ? '待授权' : message.kind === 'approval' ? '已结束' : message.kind === 'failed' ? '运行失败' : message.readAt ? '已读' : '有新回复';
}
