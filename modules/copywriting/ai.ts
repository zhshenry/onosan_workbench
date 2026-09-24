// 文案模块的 AI 贡献(模式同 modules/todo/ai-tools.ts):
// 工具只记建议不写草稿库;系统提示词注入模式规则与笔记信息;collect() 由 IPC 层校验后返回渲染层。
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { CopyAiAction, CopyAiMode, CopyDraft } from '../../shared/copy-contracts';
import type { AiModuleContribution } from '../../electron/ai-core';
import { buildCopySystemPrompt } from './prompts';

function toolText(text: string) { return { content: [{ type: 'text' as const, text }], details: {} }; }

/** 构建文案模块的一次性贡献(工具闭包持有建议收集器;一次任务只做一个模式) */
export function buildCopyContribution(mode: CopyAiMode, draft: CopyDraft): AiModuleContribution & { collect(): CopyAiAction[] } {
  const actions: CopyAiAction[] = [];
  const isTitles = mode === 'titles';
  return {
    toolNames: isTitles ? ['propose_titles'] : ['propose_edit'],
    labels: isTitles
      ? { propose_titles: '生成标题候选' }
      : { propose_edit: '生成改写建议' },
    systemPrompt: (now: Date) => buildCopySystemPrompt(now, mode, draft),
    collect: () => actions,
    buildTools: () => [
      ...isTitles ? [] : [
        defineTool({
          name: 'propose_edit', label: '提交改写', description: '提交优化后的完整正文,不会立即写入草稿。',
          parameters: Type.Object({
            text: Type.String({ minLength: 1, description: '优化后的完整正文' }),
            notes: Type.Optional(Type.Array(Type.String({ maxLength: 120 }), { maxItems: 3, description: '主要改动说明,最多3条' })),
          }),
          execute: async (_id, params) => {
            const text = params.text.trim();
            if (!text) return toolText('正文为空,请提交完整改写文本');
            if ([...text].length > 20000) return toolText('改写文本超长,请控制在2万字内');
            const notes = (params.notes ?? []).filter((n) => typeof n === 'string' && n.trim()).slice(0, 3);
            actions.push({ kind: 'edit', text, notes });
            return toolText('已记录改写建议,等待用户确认后才会写入。');
          },
        }),
      ],
      ...isTitles ? [
        defineTool({
          name: 'propose_titles', label: '提交标题候选', description: '提交标题候选列表,不会立即写入草稿。',
          parameters: Type.Object({
            titles: Type.Array(Type.String({ minLength: 1, maxLength: 30 }), { minItems: 1, maxItems: 8, description: '标题候选,每个10~20字' }),
          }),
          execute: async (_id, params) => {
            const titles = params.titles.map((t) => t.trim()).filter(Boolean);
            if (!titles.length) return toolText('标题候选为空');
            if (titles.length > 8) return toolText('标题候选最多8个');
            actions.push({ kind: 'titles', titles });
            return toolText('已记录标题候选,等待用户选择。');
          },
        }),
      ] : [],
    ],
  };
}
