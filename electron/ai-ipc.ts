// AI 编排(移植自上游 electron/main.ts 的 AI 段,存储独立化修订 2026-09-23):
// - 供应商/模型/Key/启用/会话 → 工作台自有 AiStore(userData,不碰共享库)
// - 待办数据(tasks/categories/applyPlan)→ 共享库(与 To-Do-List 互通)
// 建议-确认制 pending 管理与上游一致。
import { randomUUID } from 'node:crypto';
import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Store } from '../modules/todo/store';
import type { AiStore, StoredProvider, StoredModel } from './ai-store';
import { aiProtocolSchema, aiProviderKindSchema, type AIProvider, type AIModel, type ChatSession, type Proposal } from '../shared/todo-contracts';
import { runAgentLoop, testConnection, validateEndpoint } from './ai-core';
import { buildTodoContribution, planFromReply } from '../modules/todo/ai-tools';

const MAX_PROVIDERS = 8;
const MAX_MODELS = 8;

let activeRequest: AbortController | null = null;
let pending: { plan: Proposal; revisions: Map<string, string> } | null = null;

function encryptKey(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) throw new Error('系统加密暂不可用,未保存密钥,请稍后重试');
  return safeStorage.encryptString(value).toString('base64');
}
function decryptKey(encrypted: string): string {
  if (!encrypted) return '';
  try { return safeStorage.decryptString(Buffer.from(encrypted, 'base64')); }
  catch { return ''; }
}
function activeConnection(ai: AiStore): { provider: StoredProvider; model: StoredModel } | null {
  const config = ai.readConfig();
  const model = config.models.find(item => item.id === config.activeModelId) ?? config.models[0];
  if (!model) return null;
  const provider = config.providers.find(item => item.id === model.providerId);
  return provider ? { provider, model } : null;
}
function emitChat(chat: ChatSession): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('ai:chat', chat);
}
function emitChatWithToken(ai: AiStore, token: string): void {
  for (const summary of ai.chats()) {
    const chat = ai.chat(summary.id);
    if (chat.entries.some(entry => entry.proposal?.token === token)) emitChat(chat);
  }
}
function assertUniqueName(items: { id: string; name: string }[], name: string, exceptId: string | undefined, message: string): void {
  const normalized = name.trim().toLocaleLowerCase('zh-CN');
  if (items.some(item => item.id !== exceptId && item.name.toLocaleLowerCase('zh-CN') === normalized)) throw new Error(message);
}
function todoChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('todo:changed');
}

export function registerAiIpc(store: Store, ai: AiStore): void {
  const configSummary = () => {
    const config = ai.readConfig();
    const providers: AIProvider[] = config.providers.map(({ id, kind, name, endpoint, protocol, apiKey }) => ({ id, kind, name, endpoint, protocol, hasKey: Boolean(apiKey) }));
    const models: AIModel[] = config.models;
    return {
      aiEnabled: config.aiEnabled,
      providers,
      models,
      activeModelId: config.activeModelId,
      hasConnection: Boolean(activeConnection(ai)),
    };
  };
  const mutateConfig = (change: (config: ReturnType<AiStore['readConfig']>) => ReturnType<AiStore['readConfig']>): void => {
    ai.writeConfig(change(ai.readConfig()));
  };

  ipcMain.handle('ai:config', () => configSummary());
  ipcMain.handle('ai:setEnabled', (_event, input: unknown) => {
    const data = z.object({ aiEnabled: z.boolean() }).strict().parse(input);
    if (data.aiEnabled && !activeConnection(ai)) throw new Error('开启 AI 前,请先添加供应商和模型');
    mutateConfig(config => ({ ...config, aiEnabled: data.aiEnabled }));
    activeRequest?.abort();
    pending = null;
    return configSummary();
  });
  ipcMain.handle('ai:provider:save', (_event, input: unknown) => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(), kind: aiProviderKindSchema,
      name: z.string().trim().min(1, '请填写供应商名称').max(30, '供应商名称最多30字'),
      endpoint: z.string().max(2000), protocol: aiProtocolSchema,
      apiKey: z.string().max(4000).optional(), clearKey: z.boolean().optional(),
    }).strict().parse(input);
    const endpoint = validateEndpoint(data.endpoint.trim());
    const providers = ai.readConfig().providers;
    let next: StoredProvider;
    if (data.id) {
      const current = providers.find(provider => provider.id === data.id);
      if (!current) throw new Error('供应商不存在');
      assertUniqueName(providers, data.name, current.id, '已有同名供应商');
      next = {
        ...current, kind: data.kind, name: data.name, endpoint, protocol: data.protocol,
        apiKey: data.clearKey ? '' : data.apiKey ? encryptKey(data.apiKey) : current.apiKey,
      };
      providers.splice(providers.findIndex(provider => provider.id === current.id), 1, next);
    } else {
      if (providers.length >= MAX_PROVIDERS) throw new Error('最多保存8个供应商');
      assertUniqueName(providers, data.name, undefined, '已有同名供应商');
      next = { id: randomUUID(), kind: data.kind, name: data.name, endpoint, protocol: data.protocol, apiKey: data.apiKey ? encryptKey(data.apiKey) : '' };
      providers.push(next);
    }
    mutateConfig(current => ({ ...current, providers: [...providers] }));
    activeRequest?.abort();
    pending = null;
    return configSummary();
  });
  ipcMain.handle('ai:provider:remove', (_event, id: unknown) => {
    const providerId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.providers.some(provider => provider.id === providerId)) throw new Error('供应商不存在');
    const models = config.models.filter(model => model.providerId !== providerId);
    mutateConfig(current => ({ ...current, providers: current.providers.filter(p => p.id !== providerId), models, aiEnabled: models.length ? current.aiEnabled : false }));
    activeRequest?.abort();
    pending = null;
    return configSummary();
  });
  ipcMain.handle('ai:model:save', (_event, input: unknown) => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(),
      providerId: z.string().uuid(),
      name: z.string().trim().min(1, '请填写模型名称或 ID').max(200, '模型名称最多200字'),
    }).strict().parse(input);
    const config = ai.readConfig();
    if (!config.providers.some(provider => provider.id === data.providerId)) throw new Error('请先保存供应商');
    const models = config.models;
    const siblings = models.filter(model => model.providerId === data.providerId);
    let next: StoredModel;
    if (data.id) {
      const current = models.find(model => model.id === data.id);
      if (!current || current.providerId !== data.providerId) throw new Error('模型不存在');
      assertUniqueName(siblings, data.name, current.id, '该供应商已有同名模型');
      next = { ...current, name: data.name };
      models.splice(models.findIndex(model => model.id === current.id), 1, next);
    } else {
      if (siblings.length >= MAX_MODELS) throw new Error('每个供应商最多保存8个模型');
      assertUniqueName(siblings, data.name, undefined, '该供应商已有同名模型');
      next = { id: randomUUID(), providerId: data.providerId, name: data.name };
      models.push(next);
    }
    mutateConfig(current => ({ ...current, models: [...models], activeModelId: current.activeModelId || next.id }));
    return configSummary();
  });
  ipcMain.handle('ai:model:remove', (_event, id: unknown) => {
    const modelId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.models.some(model => model.id === modelId)) throw new Error('模型不存在');
    mutateConfig(current => ({
      ...current,
      models: current.models.filter(m => m.id !== modelId),
      aiEnabled: current.models.filter(m => m.id !== modelId).length ? current.aiEnabled : false,
      activeModelId: current.activeModelId === modelId ? '' : current.activeModelId,
    }));
    activeRequest?.abort();
    pending = null;
    return configSummary();
  });
  ipcMain.handle('ai:model:activate', (_event, id: unknown) => {
    const modelId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.models.some(model => model.id === modelId)) throw new Error('模型不存在');
    mutateConfig(current => ({ ...current, activeModelId: modelId }));
    return configSummary();
  });
  ipcMain.handle('ai:test', async (_event, input: unknown) => {
    const data = z.object({
      providerId: z.string().uuid().optional(),
      endpoint: z.string().max(2000).optional(),
      protocol: aiProtocolSchema.optional(),
      apiKey: z.string().max(4000).optional(),
      model: z.string().trim().min(1, '请填写模型名称或 ID').max(200),
    }).strict().parse(input);
    const provider = data.providerId ? ai.readConfig().providers.find(item => item.id === data.providerId) : undefined;
    if (data.providerId && !provider) throw new Error('供应商不存在');
    const endpoint = data.endpoint?.trim() || provider?.endpoint || '';
    const protocol = data.protocol ?? provider?.protocol ?? 'openai-chat';
    const key = data.apiKey || (provider ? decryptKey(provider.apiKey) : '');
    if (!endpoint) throw new Error('请填写服务地址');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try { return await testConnection({ endpoint, model: data.model, protocol, key }, controller.signal); }
    finally { clearTimeout(timeout); }
  });

  // ---- 会话(工作台自有 chats.db) ----
  ipcMain.handle('ai:chat:list', () => ai.chats());
  // 通知中心:待确认建议汇总(只读派生)
  ipcMain.handle('ai:pending', () => ai.pendingProposals());
  ipcMain.handle('ai:chat:open', (_event, id: unknown) => {
    const activeId = ai.setting('activeChatId', '');
    const selected = id ? z.string().uuid().parse(id) : activeId;
    const chat = selected ? ai.chat(selected) : ai.newChat();
    if (!activeRequest) {
      for (const entry of chat.entries) if (entry.actionState === 'pending' && entry.proposal?.token !== pending?.plan.token) entry.actionState = 'expired';
    }
    return ai.saveChat(chat);
  });
  ipcMain.handle('ai:chat:new', () => {
    if (activeRequest) throw new Error('请先等待回复完成或取消生成');
    const currentId = ai.setting('activeChatId', '');
    const currentPending = pending;
    if (currentPending && currentId && ai.chat(currentId).entries.some(entry => entry.proposal?.token === currentPending.plan.token)) {
      ai.resolveChatProposal(currentPending.plan.token, 'discarded');
      pending = null;
    }
    return ai.newChat();
  });
  ipcMain.handle('ai:chat:remove', (_event, id: unknown) => {
    if (activeRequest) throw new Error('请先等待回复完成或取消生成');
    const chatId = z.string().uuid().parse(id);
    const pendingSnapshot = pending;
    if (pendingSnapshot && ai.chats().some(item => item.id === chatId) && ai.chat(chatId).entries.some(entry => entry.proposal?.token === pendingSnapshot.plan.token)) pending = null;
    return ai.deleteChat(chatId);
  });
  ipcMain.handle('ai:chat:draft', (_event, id: unknown, text: unknown) => {
    const chat = ai.chat(z.string().uuid().parse(id));
    chat.draft = z.string().max(10000).parse(text);
    ai.saveChat(chat);
  });

  const ask = async (sessionId: string, text: string): Promise<void> => {
    const request = z.object({ sessionId: z.string().uuid(), text: z.string().trim().min(1).max(10000, '输入最多10000字') }).strict().parse({ sessionId, text });
    const connection = activeConnection(ai);
    if (!ai.readConfig().aiEnabled || !connection) throw new Error('请先在 AI 设置中配置并启用');
    if (activeRequest) throw new Error('已有 AI 请求正在处理');
    const key = decryptKey(connection.provider.apiKey);
    const chat = ai.chat(request.sessionId);
    const pendingAtStart = pending;
    const pendingInChat = pendingAtStart && chat.entries.some(entry => entry.actionState === 'pending' && entry.proposal?.token === pendingAtStart.plan.token) ? pendingAtStart : null;
    if (pendingAtStart && !pendingInChat) { ai.resolveChatProposal(pendingAtStart.plan.token, 'expired'); pending = null; }
    const previousPending = pendingInChat;
    const assistantId = randomUUID();
    const history = chat.entries.filter(entry => !entry.streaming && !entry.error && entry.content.trim()).slice(-12).map(entry => ({ role: entry.role, content: entry.content }));
    chat.entries.push({ id: randomUUID(), role: 'user', content: request.text }, { id: assistantId, role: 'assistant', content: '', streaming: true, tools: [] });
    if (chat.title === '新对话') chat.title = request.text.slice(0, 32);
    chat.draft = '';
    emitChat(ai.saveChat(chat));
    const updateEntry = (change: (entry: ChatSession['entries'][number]) => void): void => {
      const latest = ai.chat(chat.id);
      const entry = latest.entries.find(item => item.id === assistantId)!;
      change(entry);
      emitChat(ai.saveChat(latest));
    };
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 45000);
    const tasks = store.all();
    const categories = store.categories();
    const contribution = buildTodoContribution(tasks, categories);
    let deltaTimer: ReturnType<typeof setTimeout> | null = null;
    let latestDelta = '';
    const onDelta = (streamText: string): void => {
      latestDelta = streamText;
      if (deltaTimer) return;
      deltaTimer = setTimeout(() => { deltaTimer = null; if (latestDelta) updateEntry(entry => { entry.content = latestDelta; }); }, 50);
    };
    try {
      const { reply } = await runAgentLoop({ endpoint: connection.provider.endpoint, model: connection.model.name, protocol: connection.provider.protocol, key }, request.text,
        history,
        controller.signal, contribution, onDelta,
        tool => updateEntry(entry => {
          const tools = entry.tools ?? [];
          const index = tools.findIndex(item => item.id === tool.id);
          if (index < 0) tools.push(tool); else tools[index] = tool;
          entry.tools = tools;
        }));
      if (controller.signal.aborted) throw new Error('已取消生成,输入内容已保留。');
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      const plan = planFromReply(reply, contribution.collect(), new Set(tasks.map(t => t.id)), new Set(categories.map(c => c.id)));
      const proposal: Proposal = { ...plan, token: randomUUID() };
      if (proposal.actions.length) {
        if (previousPending) ai.resolveChatProposal(previousPending.plan.token, 'revised');
        pending = { plan: proposal, revisions: new Map([...tasks, ...categories].map(item => [item.id, item.updatedAt])) };
      }
      updateEntry(entry => {
        entry.content = proposal.message;
        entry.streaming = false;
        if (proposal.actions.length) { entry.proposal = proposal; entry.actionState = 'pending'; }
      });
    } catch (cause) {
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      updateEntry(entry => {
        entry.streaming = false;
        entry.error = cause instanceof Error ? cause.message : '请求失败,请重试';
        for (const tool of entry.tools ?? []) if (tool.status === 'running') tool.status = 'interrupted';
      });
      const latest = ai.chat(chat.id);
      latest.draft ||= request.text;
      emitChat(ai.saveChat(latest));
      throw cause;
    } finally {
      if (deltaTimer) clearTimeout(deltaTimer);
      clearTimeout(timeout);
      activeRequest = null;
    }
  };
  ipcMain.handle('ai:ask', async (_event, sessionId: unknown, text: unknown) => {
    await ask(z.string().uuid().parse(sessionId), z.string().parse(text));
  });
  ipcMain.on('ai:cancel', () => {
    activeRequest?.abort();
  });
  ipcMain.handle('ai:apply', (_event, token: unknown, indices: number[]) => {
    const tokenText = z.string().uuid().parse(token);
    if (!pending || pending.plan.token !== tokenText) throw new Error('建议已应用或已过期,请重新生成');
    const planMessage = pending.plan.message;
    const revisionsAll = pending.revisions;
    const selected = pending.plan.actions.filter((_action, index) => indices.includes(index));
    if (!selected.length) throw new Error('请选择要应用的操作');
    const revisions = new Map<string, string>();
    for (const action of selected) {
      if (action.type === 'update' || action.type === 'remove' || action.type === 'update_category' || action.type === 'remove_category') {
        const revision = revisionsAll.get(action.id);
        if (revision !== undefined) revisions.set(action.id, revision);
      }
    }
    // 不向上游 applyPlan 传 proposalToken:会话状态在工作台库,由下一行手动落地
    store.applyPlan({ message: planMessage, actions: selected }, revisions);
    pending = null;
    ai.resolveChatProposal(tokenText, 'applied');
    todoChanged();
    emitChatWithToken(ai, tokenText);
    return null;
  });
  ipcMain.handle('ai:discard', (_event, token: unknown) => {
    const tokenText = z.string().uuid().parse(token);
    if (pending && pending.plan.token === tokenText) {
      ai.resolveChatProposal(tokenText, 'discarded');
      pending = null;
      emitChatWithToken(ai, tokenText);
    }
    return null;
  });
}
