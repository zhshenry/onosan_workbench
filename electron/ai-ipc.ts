// AI 编排(移植自上游 electron/main.ts 的 AI 段,存储独立化修订 2026-09-23):
// - 供应商/模型/Key/启用/会话 → 工作台自有 AiStore(userData,不碰共享库)
// - 待办数据(tasks/categories/applyPlan)→ 共享库(与 To-Do-List 互通)
// - 2026-09-26 写作助手:会话带 module 标签,copy 会话绑定草稿,建议(copyProposal)应用时写草稿库并广播 copy:changed。
// 建议-确认制 pending 管理与上游一致。
import { applyTodoProposal } from './todo-proposal';
import { previewTodoActions } from '../shared/todo-proposal';
import { randomUUID } from 'node:crypto';
import { ipcMain, safeStorage, BrowserWindow, shell } from 'electron';
import { z } from 'zod';
import type { Store } from '../modules/todo/store';
import type { CopyStore } from '../modules/copywriting/store';
import type { BaziStore } from '../modules/bazi/store';
import type { AiStore, StoredProvider, StoredModel, StoredRlcdProvider } from './ai-store';
import { aiProtocolSchema, aiProviderKindSchema, rlcdProviderKindSchema, type AIProvider, type AIModel, type RlcdProvider, type ChatSession, type Proposal } from '../shared/todo-contracts';
import { copyAiActionsSchema, type CopyAiAction } from '../shared/copy-contracts';
import { runAgentLoop, testConnection, validateEndpoint, type AiModuleContribution } from './ai-core';
import { buildTodoContribution, planFromReply, taskSnapshot } from '../modules/todo/ai-tools';
import { buildCopyContribution } from '../modules/copywriting/ai';
import { buildBaziContribution } from '../modules/bazi/ai';
import { buildReadingContribution } from '../modules/reading/ai';
import type { ReadingStore } from '../modules/reading/store';
import { buildWorkbenchContribution, describeAiScope, withWorkbenchContext } from '../modules/workbench-ai';
import { buildBrowserContribution } from '../modules/browser/ai';
import type { BrowserAutomation } from './browser/tasks';
import type { WebContents } from 'electron';
import { aiScopeKey, chatContextScope, chatScope, sameAiWorkbench, type AiScope } from '../shared/ai-scope';

import { aiReferencesSchema, describeAiReference } from '../shared/ai-reference';
import { resolveAiReferences, withAiReferenceSnapshots } from './ai-reference';

const MAX_PROVIDERS = 8;
const MAX_MODELS = 8;

const activeRequests = new Map<string, AbortController>();
const pendingAsks = new Map<string, { ask: { id: string; question: string; options: { label: string; description?: string }[] }; resolve: (answer: string) => void; reject: () => void }>();
function cancelRequests(): void {
  for (const controller of activeRequests.values()) controller.abort();
  for (const question of pendingAsks.values()) question.reject();
  pendingAsks.clear();
}
type Pending = { sessionId: string; plan: Proposal; revisions: Map<string, string>; copy?: { draftId: string; updatedAt: string; title: string; body: string; actions: CopyAiAction[] } };
const pending = new Map<string, Pending>();

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
    if (chat.entries.some(entry => entry.proposal?.token === token || entry.copyProposal?.token === token)) emitChat(chat);
  }
}
function assertUniqueName(items: { id: string; name: string }[], name: string, exceptId: string | undefined, message: string): void {
  const normalized = name.trim().toLocaleLowerCase('zh-CN');
  if (items.some(item => item.id !== exceptId && item.name.toLocaleLowerCase('zh-CN') === normalized)) throw new Error(message);
}
function todoChanged(): void {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('todo:changed');
}

export function registerAiIpc(store: Store, ai: AiStore, copy: CopyStore, bazi: BaziStore, reading: ReadingStore, browserAutomation?: BrowserAutomation): void {
  const configSummary = () => {
    const config = ai.readConfig();
    const providers: AIProvider[] = config.providers.map(({ id, kind, name, endpoint, protocol, apiKey }) => ({ id, kind, name, endpoint, protocol, hasKey: Boolean(apiKey) }));
    const models: AIModel[] = config.models;
    const rlcdProviders: RlcdProvider[] = config.rlcdProviders.map(({ id, kind, name, endpoint, protocol, apiKey }) => ({ id, kind, name, endpoint, protocol, hasKey: Boolean(apiKey) }));
    return {
      aiEnabled: config.aiEnabled,
      providers,
      models,
      activeModelId: config.activeModelId,
      rlcdProviders,
      rlcdModels: config.rlcdModels,
      activeRlcdModelId: config.activeRlcdModelId,
      hasConnection: Boolean(activeConnection(ai)),
    };
  };
  const mutateConfig = (change: (config: ReturnType<AiStore['readConfig']>) => ReturnType<AiStore['readConfig']>): void => {
    ai.writeConfig(change(ai.readConfig()));
  };

  ipcMain.handle('ai:config', () => configSummary());
  ipcMain.handle('ai:openLink', async (_event, value: unknown) => {
    const url = new URL(z.string().url().parse(value));
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('仅支持打开网页链接');
    await shell.openExternal(url.href);
  });
  ipcMain.handle('ai:setEnabled', (_event, input: unknown) => {
    const data = z.object({ aiEnabled: z.boolean() }).strict().parse(input);
    if (data.aiEnabled && !activeConnection(ai)) throw new Error('开启 AI 前,请先添加供应商和模型');
    mutateConfig(config => ({ ...config, aiEnabled: data.aiEnabled }));
    cancelRequests();
    pending.clear();
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
    cancelRequests();
    pending.clear();
    return configSummary();
  });
  ipcMain.handle('ai:provider:remove', (_event, id: unknown) => {
    const providerId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.providers.some(provider => provider.id === providerId)) throw new Error('供应商不存在');
    const models = config.models.filter(model => model.providerId !== providerId);
    mutateConfig(current => ({ ...current, providers: current.providers.filter(p => p.id !== providerId), models, aiEnabled: models.length ? current.aiEnabled : false }));
    cancelRequests();
    pending.clear();
    return configSummary();
  });
  ipcMain.handle('ai:model:save', (_event, input: unknown) => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(),
      providerId: z.string().uuid(),
      name: z.string().trim().min(1, '请填写模型名称或 ID').max(200, '模型名称最多200字'),
      supportsImages: z.boolean().optional(),
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
      next = { ...current, name: data.name, ...(data.supportsImages === undefined ? {} : { supportsImages: data.supportsImages }) };
      models.splice(models.findIndex(model => model.id === current.id), 1, next);
    } else {
      if (siblings.length >= MAX_MODELS) throw new Error('每个供应商最多保存8个模型');
      assertUniqueName(siblings, data.name, undefined, '该供应商已有同名模型');
      next = { id: randomUUID(), providerId: data.providerId, name: data.name, ...(data.supportsImages === undefined ? {} : { supportsImages: data.supportsImages }) };
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
    cancelRequests();
    pending.clear();
    return configSummary();
  });
  ipcMain.handle('ai:model:activate', (_event, id: unknown) => {
    const modelId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.models.some(model => model.id === modelId)) throw new Error('模型不存在');
    mutateConfig(current => ({ ...current, activeModelId: modelId }));
    return configSummary();
  });
  ipcMain.handle('ai:rlcd:provider:save', (_event, input: unknown) => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(), kind: rlcdProviderKindSchema,
      name: z.string().trim().min(1, '请填写供应商名称').max(30, '供应商名称最多30字'),
      endpoint: z.string().max(2000), protocol: aiProtocolSchema,
      apiKey: z.string().max(4000).optional(), clearKey: z.boolean().optional(),
    }).strict().parse(input);
    const endpoint = validateEndpoint(data.endpoint.trim());
    const config = ai.readConfig();
    const providers = config.rlcdProviders;
    let next: StoredRlcdProvider;
    if (data.id) {
      const current = providers.find(provider => provider.id === data.id);
      if (!current) throw new Error('RLCD 供应商不存在');
      assertUniqueName(providers, data.name, current.id, '已有同名 RLCD 供应商');
      next = { ...current, kind: data.kind, name: data.name, endpoint, protocol: data.protocol,
        apiKey: data.clearKey ? '' : data.apiKey ? encryptKey(data.apiKey) : current.apiKey };
      providers.splice(providers.findIndex(provider => provider.id === current.id), 1, next);
    } else {
      if (providers.length >= MAX_PROVIDERS) throw new Error('最多保存8个 RLCD 供应商');
      assertUniqueName(providers, data.name, undefined, '已有同名 RLCD 供应商');
      next = { id: randomUUID(), kind: data.kind, name: data.name, endpoint, protocol: data.protocol, apiKey: data.apiKey ? encryptKey(data.apiKey) : '' };
      providers.push(next);
    }
    mutateConfig(current => ({ ...current, rlcdProviders: [...providers] }));
    return configSummary();
  });
  ipcMain.handle('ai:rlcd:provider:remove', (_event, id: unknown) => {
    const providerId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.rlcdProviders.some(provider => provider.id === providerId)) throw new Error('RLCD 供应商不存在');
    const models = config.rlcdModels.filter(model => model.providerId !== providerId);
    const activeRlcdModelId = models.some(model => model.id === config.activeRlcdModelId) ? config.activeRlcdModelId : models[0]?.id ?? '';
    mutateConfig(current => ({ ...current, rlcdProviders: current.rlcdProviders.filter(provider => provider.id !== providerId), rlcdModels: models, activeRlcdModelId }));
    return configSummary();
  });
  ipcMain.handle('ai:rlcd:model:save', (_event, input: unknown) => {
    const data = z.object({
      id: z.union([z.string().uuid(), z.literal('')]).optional(), providerId: z.string().uuid(),
      name: z.string().trim().min(1, '请填写模型名称或 ID').max(200, '模型名称最多200字'),
    }).strict().parse(input);
    const config = ai.readConfig();
    if (!config.rlcdProviders.some(provider => provider.id === data.providerId)) throw new Error('请先保存 RLCD 供应商');
    const models = config.rlcdModels;
    const siblings = models.filter(model => model.providerId === data.providerId);
    let next: StoredModel;
    if (data.id) {
      const current = models.find(model => model.id === data.id);
      if (!current || current.providerId !== data.providerId) throw new Error('RLCD 模型不存在');
      assertUniqueName(siblings, data.name, current.id, '该 RLCD 供应商已有同名模型');
      next = { ...current, name: data.name };
      models.splice(models.findIndex(model => model.id === current.id), 1, next);
    } else {
      if (siblings.length >= MAX_MODELS) throw new Error('每个 RLCD 供应商最多保存8个模型');
      assertUniqueName(siblings, data.name, undefined, '该 RLCD 供应商已有同名模型');
      next = { id: randomUUID(), providerId: data.providerId, name: data.name };
      models.push(next);
    }
    mutateConfig(current => ({ ...current, rlcdModels: [...models], activeRlcdModelId: current.activeRlcdModelId || next.id }));
    return configSummary();
  });
  ipcMain.handle('ai:rlcd:model:remove', (_event, id: unknown) => {
    const modelId = z.string().uuid().parse(id);
    const config = ai.readConfig();
    if (!config.rlcdModels.some(model => model.id === modelId)) throw new Error('RLCD 模型不存在');
    const models = config.rlcdModels.filter(model => model.id !== modelId);
    const activeRlcdModelId = models.some(model => model.id === config.activeRlcdModelId) ? config.activeRlcdModelId : models[0]?.id ?? '';
    mutateConfig(current => ({ ...current, rlcdModels: models, activeRlcdModelId }));
    return configSummary();
  });
  const testProvider = async (input: unknown, surface: 'llm' | 'rlcd'): Promise<string> => {
    const data = z.object({
      providerId: z.string().uuid().optional(),
      endpoint: z.string().max(2000).optional(),
      protocol: aiProtocolSchema.optional(),
      apiKey: z.string().max(4000).optional(),
      model: z.string().trim().min(1, '请填写模型名称或 ID').max(200),
    }).strict().parse(input);
    const providers = surface === 'rlcd' ? ai.readConfig().rlcdProviders : ai.readConfig().providers;
    const provider = data.providerId ? providers.find(item => item.id === data.providerId) : undefined;
    if (data.providerId && !provider) throw new Error('供应商不存在');
    const endpoint = data.endpoint?.trim() || provider?.endpoint || '';
    const protocol = data.protocol ?? provider?.protocol ?? 'openai-chat';
    const key = data.apiKey || (provider ? decryptKey(provider.apiKey) : '');
    if (!endpoint) throw new Error('请填写服务地址');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try { return await testConnection({ endpoint, model: data.model, protocol, key }, controller.signal); }
    finally { clearTimeout(timeout); }
  };
  ipcMain.handle('ai:test', (_event, input: unknown) => testProvider(input, 'llm'));
  ipcMain.handle('ai:rlcd:test', (_event, input: unknown) => testProvider(input, 'rlcd'));

  // ---- 会话(工作台自有 chats.db) ----
  ipcMain.handle('ai:chat:list', () => ai.chats());
  ipcMain.handle('ai:chat:open', (_event, id: unknown) => {
    const activeId = ai.setting('activeChatId', '');
    const selected = id ? z.string().uuid().parse(id) : activeId;
    const chat = selected ? ai.chat(selected) : ai.newChat();
    if (!activeRequests.has(chat.id)) {
      for (const entry of chat.entries) if (entry.actionState === 'pending' && !pending.has(entry.proposal?.token ?? entry.copyProposal?.token ?? '')) entry.actionState = 'expired';
    }
    ai.setSetting('activeChatId', chat.id);
    return ai.saveChat(chat);
  });
  const scopeSchema = z.discriminatedUnion('module', [
    z.object({ module: z.literal('todo') }).strict(),
    z.object({ module: z.literal('copy'), draftId: z.string().min(1) }).strict(),
    z.object({ module: z.literal('bazi'), profileId: z.string().min(1) }).strict(),
    z.object({ module: z.literal('reading'), profileId: z.string().min(1) }).strict(),
    z.object({ module: z.literal('workbench'), viewId: z.string().min(1) }).strict(),
  ]);
  ipcMain.handle('ai:chat:new', (_event, tag: unknown) => {
    const scope: AiScope = tag === undefined || tag === null ? { module: 'todo' } : scopeSchema.parse(tag);
    return ai.newChat(scope);
  });
  ipcMain.handle('ai:chat:rename', (_event, id: unknown, title: unknown) => {
    const updated = ai.renameChat(z.string().uuid().parse(id), z.string().parse(title));
    emitChat(updated);
    return updated;
  });
  ipcMain.handle('ai:chat:remove', (_event, id: unknown) => {
    const chatId = z.string().uuid().parse(id);
    if (activeRequests.has(chatId)) throw new Error('这条对话正在生成，请先停止生成');
    for (const [token, item] of pending) if (item.sessionId === chatId) pending.delete(token);
    return ai.deleteChat(chatId);
  });
  ipcMain.handle('ai:chat:draft', (_event, id: unknown, text: unknown) => {
    const chat = ai.chat(z.string().uuid().parse(id));
    chat.draft = z.string().max(10000).parse(text);
    ai.saveChat(chat);
  });
  ipcMain.handle('ai:chat:context', (_event, id: unknown, rawScope: unknown) => {
    const chat = ai.chat(z.string().uuid().parse(id));
    const scope = scopeSchema.parse(rawScope) as AiScope;
    if (!sameAiWorkbench(chat, scope)) throw new Error('只能关联同一工作台内的页面');
    if (chat.entries.some(entry => entry.streaming)) throw new Error('这条对话正在生成，请完成后再关联页面');
    if (scope.module !== 'workbench' || chatContextScope(chat).module === 'workbench') chat.contextScope = scope;
    chat.pageScope = scope;
    const updated = ai.saveChat(chat);
    ai.setSetting('activeChatId', chat.id);
    emitChat(updated);
    return updated;
  });

  const ask = async (sessionId: string, text: string, turnContext: unknown, owner: WebContents, isMainFrame: boolean): Promise<void> => {
    const request = z.object({ sessionId: z.string().uuid(), text: z.string().trim().min(1).max(10000, '输入最多10000字') }).strict().parse({ sessionId, text });
    const context = z.object({
      baziSystem: z.enum(['bazi', 'ziwei', 'astro']).optional(),
      copySource: z.object({ draftId: z.string().min(1), start: z.number().int().nonnegative(), end: z.number().int().positive(), text: z.string().min(1).max(1000) }).strict().optional(),
      scope: scopeSchema.optional(),
      pageScope: scopeSchema.optional(),
      browserTabId: z.string().min(1).max(100).nullable().optional(),
      references: aiReferencesSchema.optional(),
    }).strict().parse(turnContext ?? {});
    const selectedSystem = context.baziSystem ?? 'bazi';
    const connection = activeConnection(ai);
    if (!ai.readConfig().aiEnabled || !connection) throw new Error('请先在 AI 设置中配置并启用');
    if (activeRequests.has(request.sessionId)) throw new Error('这条对话正在生成，请先停止生成');
    const chat = ai.chat(request.sessionId);
    const priorScope = chatContextScope(chat);
    const requestedScope = context.scope ?? priorScope;
    if (!sameAiWorkbench(chat, requestedScope)) throw new Error('只能在同一工作台内延续这条对话');
    if (context.pageScope && !sameAiWorkbench(chat, context.pageScope)) throw new Error('当前页面不属于这条对话的工作台');
    const scope = requestedScope;
    const pageScope = context.pageScope ?? (aiScopeKey(requestedScope) === aiScopeKey(priorScope) ? chat.pageScope ?? scope : requestedScope);
    const isBrowserPage = pageScope.module === 'workbench' && ['browser', 'media-browser'].includes(pageScope.viewId);
    if (isBrowserPage && !isMainFrame) throw new Error('浏览器任务仅允许主窗口文档。');
    if (context.browserTabId !== undefined && !isBrowserPage) throw new Error('请在关联的浏览器页面发送网页操作要求。');
    const referenceSnapshots = resolveAiReferences(context.references, pageScope, scope, { todo: store, copy, bazi, reading }, { now: new Date(), baziSystem: selectedSystem });
    const references = referenceSnapshots.map(snapshot => snapshot.reference);
    const selectedTaskIds = references.flatMap(reference => reference.module === 'todo' ? [reference.taskId] : []);
    const draft = scope.module === 'copy' ? copy.get(scope.draftId) : undefined;
    if (scope.module === 'copy' && !draft) throw new Error('这条对话绑定的笔记不存在或已删除,请新建一篇笔记后再聊');
    if (context.copySource && (scope.module !== 'copy' || context.copySource.draftId !== scope.draftId || draft?.body.slice(context.copySource.start, context.copySource.end) !== context.copySource.text)) {
      throw new Error('引用的原文已经变化，请重新选择后发送');
    }
    const baziData = scope.module === 'bazi' ? bazi.all() : undefined;
    const profile = scope.module === 'bazi' ? baziData?.profiles.find(item => item.id === scope.profileId) : undefined;
    if (scope.module === 'bazi' && !profile) throw new Error('这条对话绑定的命例不存在或已删除');
    const tasks = scope.module === 'todo' ? store.all() : [];
    const categories = scope.module === 'todo' ? store.categories() : [];
    const todoContribution = scope.module === 'todo' ? buildTodoContribution(tasks, categories, (ask) => new Promise<string>((resolve, reject) => {
      const abort = () => { pendingAsks.delete(chat.id); reject(new Error('已停止此对话的澄清请求。')); };
      controller.signal.addEventListener('abort', abort, { once: true });
      pendingAsks.set(chat.id, { ask, resolve: answer => { controller.signal.removeEventListener('abort', abort); resolve(answer); }, reject: abort });
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed() && win.isVisible()) win.webContents.send('ai:ask', { ...ask, sessionId: chat.id });
      }
    }), selectedTaskIds) : null;
    const copyContribution = draft ? buildCopyContribution(draft) : null;
    let contribution: AiModuleContribution = scope.module === 'bazi' && profile
      ? buildBaziContribution(profile, selectedSystem, baziData?.notes[profile.id] ?? '')
      : scope.module === 'reading' ? (() => {
        const bookData = reading.all();
        const book = bookData.books.find(item => item.id === (scope as { profileId: string }).profileId);
        if (!book) throw new Error('这条对话绑定的书目不存在或已删除');
        return buildReadingContribution(book, bookData.vaultPath);
      })()
      : scope.module === 'workbench' ? buildWorkbenchContribution(scope.viewId)
      : copyContribution ?? todoContribution!;
    const key = decryptKey(connection.provider.apiKey);
    const browserTask = isBrowserPage ? browserAutomation?.forChat(owner, pageScope.viewId === 'media-browser' ? 'xhs-creator' : 'default', request.text, chat.id, chat.browserTaskId, context.browserTabId) : undefined;
    if (browserTask) {
      const browser = buildBrowserContribution(browserAutomation!, owner, browserTask, connection.model.supportsImages === true);
      const business = scope.module === 'workbench' ? undefined : contribution;
      contribution = {
        directBrowserOperations: true,
        toolNames: [...(business?.toolNames ?? []), ...browser.toolNames], labels: { ...business?.labels, ...browser.labels },
        buildTools: () => [...(business?.buildTools() ?? []), ...browser.buildTools()],
        systemPrompt: now => `${business?.systemPrompt(now) ?? ''}\n\n${browser.systemPrompt(now)}\n业务协助对象保持不变，网页是本轮独立操作目标。本地博客修改仍只生成待确认建议；把已有内容填写到网页不需要修改本地博客。`,
      };
    }
    contribution = withAiReferenceSnapshots(contribution, referenceSnapshots);
    const assistantId = randomUUID();
    const history = chat.entries.filter(entry => !entry.streaming && !entry.error && entry.content.trim()).slice(-12).map(entry => {
      const earlierScope = entry.contextScope ?? chatScope(chat);
      const earlierSystem = earlierScope.module === 'bazi' && entry.baziSystem ? `[${entry.baziSystem === 'ziwei' ? '紫微斗数' : entry.baziSystem === 'astro' ? '占星' : '八字'}]\n` : '';
      const earlierContext = aiScopeKey(earlierScope) === aiScopeKey(scope) ? '' : `[历史关联：${describeAiScope(earlierScope)}]\n`;
      const earlierPage = entry.pageScope && aiScopeKey(entry.pageScope) !== aiScopeKey(earlierScope) ? `[当时页面：${describeAiScope(entry.pageScope)}]\n` : '';
      const earlierReferences = entry.references?.length ? `[历史参考（非本轮选择）：${entry.references.map(describeAiReference).join('、')}]\n` : '';
      return { role: entry.role, content: earlierContext + earlierPage + earlierSystem + earlierReferences + entry.content };
    });
    const systemTag = scope.module === 'bazi' ? { baziSystem: selectedSystem } : {};
    const controller = new AbortController();
    if (browserTask) browserAutomation!.bind(owner, browserTask.id, chat.id, controller.signal);
    chat.contextScope = scope;
    chat.pageScope = pageScope;
    if (browserTask) chat.browserTaskId = browserTask.id;
    chat.entries.push({ id: randomUUID(), role: 'user', content: request.text, contextScope: scope, pageScope, references, referenceSnapshots, copySource: context.copySource, ...systemTag }, { id: assistantId, role: 'assistant', content: '', contextScope: scope, pageScope, references, referenceSnapshots, streaming: true, tools: [], ...(browserTask ? { browserTask: { id: browserTask.id, workspace: browserTask.workspace } } : {}), ...systemTag });
    if (chat.title === '新对话' && !chat.titleEdited) chat.title = request.text.slice(0, 32);
    chat.draft = '';
    try { emitChat(ai.saveChat(chat)); }
    catch (error) {
      if (browserTask) browserAutomation!.finish(owner, browserTask.id, '对话保存失败，浏览器任务未执行。');
      throw error;
    }
    const updateEntry = (change: (entry: ChatSession['entries'][number]) => void): void => {
      const latest = ai.chat(chat.id);
      const entry = latest.entries.find(item => item.id === assistantId)!;
      change(entry);
      if (!entry.streaming) delete entry.responsePhase;
      emitChat(ai.saveChat(latest));
    };
    const revisePending = (): void => {
      for (const [token, item] of pending) {
        if (item.sessionId !== chat.id) continue;
        if (item.copy && (scope.module !== 'copy' || item.copy.draftId !== scope.draftId)) continue;
        if (!item.copy && scope.module !== 'todo') continue;
        ai.resolveChatProposal(token, 'revised');
        pending.delete(token);
      }
    };
    activeRequests.set(chat.id, controller);
    // 写作助手可能整段成稿,超时放宽到 90s(待办保持 45s)
    const timeout = setTimeout(() => controller.abort(), browserTask ? 600000 : scope.module === 'copy' ? 90000 : 45000);
    let deltaTimer: ReturnType<typeof setTimeout> | null = null;
    let latestDelta = '', latestThinking = '', latestThinkingActive = false;
    const applyStream = (entry: ChatSession['entries'][number]): void => {
      if (latestDelta) entry.content = latestDelta;
      if (latestThinking) entry.thinking = latestThinking;
      entry.thinkingActive = latestThinkingActive;
    };
    const scheduleDelta = (): void => {
      if (deltaTimer) return;
      deltaTimer = setTimeout(() => { deltaTimer = null; updateEntry(applyStream); }, 50);
    };
    const onDelta = (streamText: string): void => {
      latestDelta = streamText;
      scheduleDelta();
    };
    try {
      const { reply } = await runAgentLoop({ endpoint: connection.provider.endpoint, model: connection.model.name, protocol: connection.provider.protocol, key, supportsImages: browserTask && connection.model.supportsImages === true }, request.text,
        history,
        browserTask ? browserAutomation!.signal(owner, browserTask.id) : controller.signal, withWorkbenchContext(contribution, scope, draft?.title || profile?.name, pageScope), onDelta,
        tool => updateEntry(entry => {
          const tools = entry.tools ?? [];
          const index = tools.findIndex(item => item.id === tool.id);
          if (index < 0) tools.push(tool); else tools[index] = tool;
          entry.tools = tools;
        }), (thinking, active) => {
          latestThinking = thinking; latestThinkingActive = active;
          scheduleDelta();
        }, phase => updateEntry(entry => { entry.responsePhase = phase; }));
      if (controller.signal.aborted) throw new Error('已取消生成,输入内容已保留。');
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      latestThinkingActive = false;
      if (copyContribution && draft) {
        const actions = copyAiActionsSchema.parse(copyContribution.collect());
        if (!reply.trim() && !actions.length) throw new Error('模型未返回可用内容,请检查服务协议和模型输出');
        const token = randomUUID();
        if (actions.length) {
          revisePending();
          pending.set(token, { sessionId: chat.id, plan: { message: reply, actions: [], token }, revisions: new Map(), copy: { draftId: draft.id, updatedAt: draft.updatedAt, title: draft.title, body: draft.body, actions } });
        }
        updateEntry(entry => {
          applyStream(entry);
          entry.content = reply;
          entry.streaming = false;
          if (actions.length) { entry.copyProposal = { token, message: reply, actions, original: { title: draft.title, body: draft.body } }; entry.actionState = 'pending'; }
        });
      } else if (todoContribution) {
        const plan = planFromReply(reply, todoContribution!.collect(), taskSnapshot(tasks, categories, selectedTaskIds).known, new Set(categories.map(c => c.id)));
        const proposal: Proposal = { ...plan, token: randomUUID(), preview: previewTodoActions(plan.actions, tasks, categories) };
        if (proposal.actions.length) {
          revisePending();
          pending.set(proposal.token, { sessionId: chat.id, plan: proposal, revisions: new Map([...tasks, ...categories].map(item => [item.id, item.updatedAt])) });
        }
        updateEntry(entry => {
          applyStream(entry);
          entry.content = proposal.message;
          entry.streaming = false;
          if (proposal.actions.length) { entry.proposal = proposal; entry.actionState = 'pending'; }
        });
      } else {
        if (!reply.trim()) throw new Error('模型未返回可用内容,请检查服务协议和模型输出');
        updateEntry(entry => { applyStream(entry); entry.content = reply; entry.streaming = false; });
      }
      if (browserTask) browserAutomation!.finish(owner, browserTask.id);
    } catch (cause) {
      if (browserTask) browserAutomation!.finish(owner, browserTask.id, cause instanceof Error ? cause.message : '请求失败');
      if (deltaTimer) { clearTimeout(deltaTimer); deltaTimer = null; }
      latestThinkingActive = false;
      updateEntry(entry => {
        applyStream(entry);
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
      if (activeRequests.get(chat.id) === controller) activeRequests.delete(chat.id);
      pendingAsks.get(chat.id)?.reject(); pendingAsks.delete(chat.id);
    }
  };
  ipcMain.handle('ai:ask', async (event, sessionId: unknown, text: unknown, context: unknown) => {
    await ask(z.string().uuid().parse(sessionId), z.string().parse(text), context, event.sender, event.senderFrame === event.sender.mainFrame);
  });
  // 用户回答 AI 的澄清提问(上游 ask:answer 同义;跳过=空答案)
  ipcMain.on('ai:answer', (_event, input: unknown) => {
    const parsed = z.object({ id: z.string(), sessionId: z.string().uuid(), kind: z.enum(['option', 'text', 'skip']), value: z.string().max(10000).optional() }).strict().safeParse(input);
    if (!parsed.success) return;
    const data = parsed.data, question = pendingAsks.get(data.sessionId);
    if (!question || data.id !== question.ask.id) return;
    const answer = data.kind === 'skip' ? '(用户选择跳过,请按你的判断继续并说明假设)' : data.kind === 'option' ? data.value ?? '' : data.value ?? '';
    pendingAsks.delete(data.sessionId); question.resolve(answer);
  });

  ipcMain.on('ai:cancel', (_event, input: unknown) => {
    const id = z.string().uuid().safeParse(input);
    if (!id.success) return;
    activeRequests.get(id.data)?.abort();
    pendingAsks.get(id.data)?.reject(); pendingAsks.delete(id.data);
  });
  ipcMain.handle('ai:apply', (_event, token: unknown, indices: number[]) => {
    const tokenText = z.string().uuid().parse(token);
    const item = pending.get(tokenText);
    if (!item) throw new Error('建议已应用或已过期,请重新生成');
    const chosen = z.array(z.number().int().nonnegative()).max(50).parse(indices);
    // 写作助手建议:按选中项直接写草稿(局部补丁),并广播 copy:changed 让编辑器刷新
    if (item.copy) {
      const { draftId, actions, updatedAt, title, body } = item.copy;
      const selected = actions.filter((_action, index) => chosen.includes(index));
      if (!selected.length) throw new Error('请选择要应用的操作');
      const before = copy.get(draftId);
      if (!before) throw new Error('这篇博客已删除，不能应用旧建议');
      if (before.updatedAt !== updatedAt || before.title !== title || before.body !== body) throw new Error('博客内容已变化，请根据最新正文重新生成建议');
      const patch: { title?: string; body?: string } = {};
      for (const action of selected) {
        if (action.kind === 'edit') patch.body = action.text;
        else patch.title = action.title;
      }
      const saved = copy.save({ id: draftId, ...patch }).drafts.find(draft => draft.id === draftId)!;
      pending.delete(tokenText);
      const resolved = ai.resolveChatProposal(tokenText, 'applied');
      const entry = resolved?.entries.find(entry => entry.copyProposal?.token === tokenText);
      if (resolved && entry) {
        entry.copyUndo = { draftId, beforeTitle: before.title, beforeBody: before.body, appliedTitle: saved.title, appliedBody: saved.body, appliedAt: saved.updatedAt };
        ai.saveChat(resolved);
      }
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('copy:changed');
      emitChatWithToken(ai, tokenText);
      return null;
    }
    let result;
    try { result = applyTodoProposal(store, ai, item, chosen, () => pending.delete(tokenText)); }
    catch (cause) { try { emitChatWithToken(ai, tokenText); } catch { /* Original failure remains visible to the caller. */ } throw cause; }
    // Delivery/history errors after commit are not transaction failures.
    try { todoChanged(); emitChatWithToken(ai, tokenText); } catch { /* Caller also receives the committed receipt. */ }
    return result;
  });
  ipcMain.handle('ai:discard', (_event, token: unknown) => {
    const tokenText = z.string().uuid().parse(token);
    if (pending.has(tokenText)) {
      ai.resolveChatProposal(tokenText, 'discarded');
      pending.delete(tokenText);
      emitChatWithToken(ai, tokenText);
    }
    return null;
  });
  ipcMain.handle('ai:undo', (_event, token: unknown) => {
    const tokenText = z.string().uuid().parse(token);
    const found = ai.findCopyUndo(tokenText);
    if (!found?.entry.copyUndo) throw new Error('这条修改已经撤销或无法撤销');
    const undo = found.entry.copyUndo;
    const current = copy.get(undo.draftId);
    if (!current || current.updatedAt !== undo.appliedAt || current.title !== undo.appliedTitle || current.body !== undo.appliedBody) {
      throw new Error('博客在应用后又有修改，撤销会覆盖新内容，已停止操作');
    }
    copy.save({ id: undo.draftId, title: undo.beforeTitle, body: undo.beforeBody });
    found.entry.actionState = 'undone';
    delete found.entry.copyUndo;
    emitChat(ai.saveChat(found.chat));
    for (const win of BrowserWindow.getAllWindows()) win.webContents.send('copy:changed');
    return null;
  });
}
