// 文案模块的 AI 贡献(写作助手模式,模式同 modules/todo/ai-tools.ts):
// 工具只记建议不写草稿库;系统提示词注入教练规则与草稿快照;collect() 由 IPC 层校验后组装 CopyProposal。
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import type { CopyAiAction, CopyDraft } from '../../shared/copy-contracts';
import type { AiModuleContribution } from '../../electron/ai-core';
import { buildCoachSystemPrompt } from './prompts';

function toolText(text: string) { return { content: [{ type: 'text' as const, text }], details: {} }; }

/** 构建写作助手贡献(工具闭包持有建议收集器;建议随会话走确认-应用流程) */
export function buildCopyContribution(draft: CopyDraft): AiModuleContribution & { collect(): CopyAiAction[] } {
  const actions: CopyAiAction[] = [];
  return {
    toolNames: ['propose_edit', 'propose_title'],
    labels: { propose_edit: '生成改写建议', propose_title: '生成标题候选' },
    systemPrompt: (now: Date) => buildCoachSystemPrompt(now, draft),
    collect: () => actions,
    buildTools: () => [
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
      defineTool({
        name: 'propose_title', label: '提交标题候选', description: '提交一个标题候选,不会立即写入草稿。起标题时逐个提交多个候选。',
        parameters: Type.Object({
          title: Type.String({ minLength: 1, maxLength: 30, description: '单个标题候选,10~20字' }),
        }),
        execute: async (_id, params) => {
          const title = params.title.trim();
          if (!title) return toolText('标题候选为空');
          actions.push({ kind: 'title', title });
          return toolText(`已记录标题候选「${title}」,等待用户选择。`);
        },
      }),
    ],
  };
}
