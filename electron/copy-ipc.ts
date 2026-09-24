// 文案工坊 IPC(编排模式同 ai-ipc.ts,但独立于待办建议-确认管线):
// - 草稿 CRUD → CopyStore(userData/copy-drafts.json)
// - AI 优化 → 一次性 runAgentLoop,工具建议经 copyAiActionsSchema 校验后返回渲染层;
//   写入永远走用户确认后的 copy:save,主进程不持跨请求 pending(简化,渲染层确认卡即确认制)。
import { ipcMain, safeStorage } from 'electron';
import { z } from 'zod';
import type { AiStore, StoredProvider, StoredModel } from './ai-store';
import { runAgentLoop } from './ai-core';
import { CopyStore } from '../modules/copywriting/store';
import { buildCopyContribution } from '../modules/copywriting/ai';
import { buildCopyUserMessage } from '../modules/copywriting/prompts';
import { copyAiActionsSchema, copyAiModeSchema, type CopyAiMode } from '../shared/copy-contracts';

let activeRequest: AbortController | null = null;

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

const modeAsk: Record<CopyAiMode, string> = {
  humanize: '去 AI 味',
  polish: '润色',
  titles: '起标题',
};

export function registerCopyIpc(copy: CopyStore, ai: AiStore): void {
  ipcMain.handle('copy:list', () => copy.all());
  ipcMain.handle('copy:save', (_event, input: unknown) => copy.save(input));
  ipcMain.handle('copy:remove', (_event, id: unknown) => copy.remove(z.string().min(1).parse(id)));

  ipcMain.handle('copy:ai:enhance', async (_event, input: unknown) => {
    const request = z.object({
      draftId: z.string().min(1),
      mode: copyAiModeSchema,
    }).strict().parse(input);
    if (activeRequest) throw new Error('已有 AI 任务正在处理,请稍候');
    const connection = activeConnection(ai);
    if (!ai.readConfig().aiEnabled || !connection) throw new Error('请先在 AI 设置中配置并启用 AI');
    const draft = copy.get(request.draftId);
    if (!draft) throw new Error('笔记不存在或已删除');
    if (request.mode !== 'titles' && !draft.body.trim()) throw new Error('正文为空,先写点内容再优化');

    const contribution = buildCopyContribution(request.mode, draft);
    const controller = new AbortController();
    activeRequest = controller;
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      await runAgentLoop(
        { endpoint: connection.provider.endpoint, model: connection.model.name, protocol: connection.provider.protocol, key: decryptKey(connection.provider.apiKey) },
        buildCopyUserMessage(request.mode, draft.body),
        [], controller.signal, contribution,
      );
      const actions = copyAiActionsSchema.parse(contribution.collect());
      if (!actions.length) throw new Error(`AI 未返回${modeAsk[request.mode]}结果,请重试`);
      return { actions };
    } finally {
      clearTimeout(timeout);
      activeRequest = null;
    }
  });

  ipcMain.handle('copy:ai:cancel', () => {
    activeRequest?.abort();
    return null;
  });
}
