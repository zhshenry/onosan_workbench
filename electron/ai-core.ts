// AI 内核(移植自上游 electron/ai.ts 的通用部分,工具改为模块注入)。
// 上游文件内嵌待办工具;工作台将其拆为「内核(electron/ai-core)+ 模块贡献(modules/todo/ai-tools)」,
// 供应商适配/循环/错误映射/流式语义与上游逐行一致。
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  defineTool,
} from '@earendil-works/pi-coding-agent';
import type { AIConversationTurn, AIProtocol, AIToolEvent } from '../shared/todo-contracts';

const providerId = 'workbench';
const emptyUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };

/** 模块贡献契约:每个工作台向 AI 内核注册自己的工具与上下文 */
export interface AiModuleContribution {
  /** 工具定义(闭包内持有模块上下文与建议收集器) */
  buildTools(): ReturnType<typeof defineTool>[];
  /** 允许模型使用的工具名(顺序即暴露顺序) */
  toolNames: string[];
  /** 工具名 → 用户可见标签(工具事件展示) */
  labels: Record<string, string>;
  /** 系统提示词(注入当前时间与模块上下文) */
  systemPrompt(now: Date): string;
}

export function piApi(protocol: AIProtocol): 'openai-completions' | 'openai-responses' | 'anthropic-messages' {
  return protocol === 'anthropic' ? 'anthropic-messages' : protocol === 'openai-responses' ? 'openai-responses' : 'openai-completions';
}
export function validateEndpoint(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || !['https:', 'http:'].includes(url.protocol)) {
    throw new Error('服务地址需使用 HTTP 或 HTTPS;HTTP 不加密传输 API Key 和事项内容,地址中不能包含密钥或参数');
  }
  return url.href.replace(/\/$/, '');
}
export async function testConnection(config: { endpoint: string; model: string; protocol: AIProtocol; key: string }, signal: AbortSignal): Promise<string> {
  const endpoint = validateEndpoint(config.endpoint);
  const model = config.model.trim();
  if (!model) throw new Error('请填写模型名称或 ID');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const key = config.key || 'local';
  let url: string;
  let body: unknown;
  if (config.protocol === 'anthropic') {
    url = endpoint.endsWith('/v1') ? `${endpoint}/messages` : `${endpoint}/v1/messages`;
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
    body = { model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] };
  } else if (config.protocol === 'openai-responses') {
    url = `${endpoint}/responses`;
    headers.Authorization = `Bearer ${key}`;
    body = { model, input: 'ping', max_output_tokens: 16 };
  } else {
    url = `${endpoint}/chat/completions`;
    headers.Authorization = `Bearer ${key}`;
    body = { model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 8, stream: false };
  }
  let response: Response;
  try { response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal }); }
  catch (error) {
    if (signal.aborted) throw new Error('连接测试超时,请检查服务地址');
    throw mapAiError(error, signal);
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw mapAiError(Object.assign(new Error(text.slice(0, 300) || response.statusText), { status: response.status }), signal);
  }
  return `模型 ${model} 连接成功`;
}

export function assistantText(message: unknown): string {
  if (!message || typeof message !== 'object' || (message as { role?: string }).role !== 'assistant') return '';
  const content = (message as { content?: unknown }).content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(part => part && typeof part === 'object' && (part as { type?: string }).type === 'text' && typeof (part as { text?: unknown }).text === 'string' ? (part as { text: string }).text : '').join('');
}
export function visibleReply(text: string): string | undefined {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith('{')) return undefined;
  return text;
}
function historyMessages(history: AIConversationTurn[], model: string) {
  return history.map(turn => turn.role === 'user'
    ? { role: 'user' as const, content: [{ type: 'text' as const, text: turn.content }], timestamp: Date.now() }
    : { role: 'assistant' as const, content: [{ type: 'text' as const, text: turn.content }], api: 'openai-completions' as const, provider: providerId, model, usage: emptyUsage, stopReason: 'stop' as const, timestamp: Date.now() });
}
function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  for (const key of ['status', 'statusCode']) {
    const value = (error as Record<string, unknown>)[key];
    if (typeof value === 'number' && value > 0) return value;
  }
  const nested = (error as { error?: unknown; cause?: unknown }).error ?? (error as { cause?: unknown }).cause;
  return nested && nested !== error ? statusOf(nested) : undefined;
}
export function mapAiError(error: unknown, signal: AbortSignal): Error {
  if (signal.aborted) return new Error('已取消生成,输入内容已保留。');
  const status = statusOf(error);
  const text = error instanceof Error ? error.message : String(error);
  if (status === 401 || status === 403 || /(?:^|\D)(401|403)(?:\D|$)|authentication|unauthorized|api key/i.test(text)) {
    return new Error('模型认证失败,请检查 API Key 和模型权限');
  }
  if (status === 429 || /429|rate limit/i.test(text)) return new Error('模型请求达到限额,请稍后重试');
  return new Error(status ? `模型服务请求失败(HTTP ${status}),请检查服务地址和模型名称` : '模型服务请求失败,请检查服务地址和模型名称');
}

/**
 * 运行一次会话:历史 + 当前输入 → 流式回复 + 工具事件 → 由 module 侧收集的 actions 组装计划。
 * actions 的收集与校验在模块工具内完成(上游同款纪律:工具只记建议,不写库)。
 */
export async function runAgentLoop(config: { endpoint: string; model: string; protocol: AIProtocol; key: string }, text: string, history: AIConversationTurn[], signal: AbortSignal, module: AiModuleContribution, onDelta?: (text: string) => void, onTool?: (event: AIToolEvent) => void): Promise<{ reply: string }> {
  const endpoint = validateEndpoint(config.endpoint);
  const workspace = mkdtempSync(path.join(tmpdir(), 'workbench-pi-'));
  const settingsManager = SettingsManager.inMemory({ compaction: { enabled: false }, retry: { enabled: false } });
  const loader = new DefaultResourceLoader({
    cwd: workspace, agentDir: workspace, settingsManager,
    noExtensions: true, noSkills: true, noPromptTemplates: true, noThemes: true, noContextFiles: true,
    systemPromptOverride: () => module.systemPrompt(new Date()),
  });
  await loader.reload();
  const modelRuntime = await ModelRuntime.create({
    authPath: path.join(workspace, 'auth.json'), modelsPath: null, modelsStorePath: path.join(workspace, 'models-store.json'),
    allowModelNetwork: false, refreshOnCreate: false, signal,
  });
  modelRuntime.registerProvider(providerId, {
    name: 'Ono Workbench', baseUrl: endpoint, api: piApi(config.protocol), apiKey: config.key || 'local',
    authHeader: config.protocol !== 'anthropic',
    models: [{
      id: config.model, name: config.model, reasoning: false, input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 3500,
      compat: { supportsDeveloperRole: false, supportsReasoningEffort: false },
    }],
  });
  await modelRuntime.setRuntimeApiKey(providerId, config.key || 'local');
  const model = modelRuntime.getModel(providerId, config.model);
  if (!model) throw new Error('无法创建模型会话,请检查服务协议和模型名称');
  let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined;
  try {
    session = (await createAgentSession({
      cwd: workspace, agentDir: workspace, model, thinkingLevel: 'off', modelRuntime, settingsManager, resourceLoader: loader,
      sessionManager: SessionManager.inMemory(workspace), noTools: 'builtin', customTools: module.buildTools(),
      tools: module.toolNames,
    })).session;
    const abort = () => { void session?.abort(); };
    signal.addEventListener('abort', abort);
    const unsubscribe = session.subscribe(event => {
      if (event.type === 'tool_execution_start' || event.type === 'tool_execution_update' || event.type === 'tool_execution_end') {
        if (!module.labels[event.toolName]) return;
        const result = event.type === 'tool_execution_end' ? event.result : event.type === 'tool_execution_update' ? event.partialResult : undefined;
        // Only tool text is visible; never forward model reasoning, request headers, or raw events.
        const output = Array.isArray(result?.content) ? result.content.filter((part: { type?: string; text?: unknown }) => part.type === 'text' && typeof part.text === 'string').map((part: { text: string }) => part.text).join('\n').slice(0, 20000) : '';
        onTool?.({ id: event.toolCallId, name: event.toolName, label: module.labels[event.toolName], status: event.type === 'tool_execution_end' ? event.isError ? 'error' : 'complete' : 'running', output });
        return;
      }
      if (event.type !== 'message_update' && event.type !== 'message_end') return;
      if (!('message' in event)) return;
      const next = visibleReply(assistantText(event.message));
      if (next) onDelta?.(next);
    });
    try {
      if (signal.aborted) throw new Error('已取消生成,输入内容已保留。');
      session.state.messages = historyMessages(history, config.model);
      await session.prompt(text);
      const last = [...session.state.messages].reverse().find(message => message.role === 'assistant');
      if (last && 'stopReason' in last && (last.stopReason === 'error' || last.stopReason === 'aborted')) {
        throw mapAiError(new Error(('errorMessage' in last && typeof last.errorMessage === 'string' && last.errorMessage) || last.stopReason), signal);
      }
      return { reply: session.getLastAssistantText() ?? '' };
    } finally { unsubscribe(); signal.removeEventListener('abort', abort); }
  } catch (error) {
    throw error instanceof Error && /未修改数据|未返回可用|事项格式不正确|无法创建模型|分类|标签/.test(error.message) ? error : mapAiError(error, signal);
  } finally {
    session?.dispose();
    rmSync(workspace, { recursive: true, force: true });
  }
}
