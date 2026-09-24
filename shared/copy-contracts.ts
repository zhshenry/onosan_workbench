/**
 * 文案工坊契约:小红书心得笔记草稿的持久化结构(Zod,主进程 CopyStore 校验用)
 * + AI 优化建议的结构(改写正文 / 标题候选)。
 * 建议由 AI 内核产出,渲染层展示确认卡,用户应用后才经 copy:save 写入草稿库。
 */
import { z } from 'zod';

/** 发布平台(本期只做小红书,枚举预留扩展) */
export const copyPlatformSchema = z.enum(['xiaohongshu']);
export type CopyPlatform = z.infer<typeof copyPlatformSchema>;

/** 草稿输入(标题可为空串;正文承载全部内容,含话题标签行) */
export const copyDraftInputSchema = z.object({
  title: z.string().trim().max(30, '标题最多30字'),
  body: z.string().max(20000, '正文最多2万字'),
  platform: copyPlatformSchema,
}).strict();
export type CopyDraftInput = z.infer<typeof copyDraftInputSchema>;
export interface CopyDraft extends CopyDraftInput { id: string; createdAt: string; updatedAt: string; }

/** 草稿库持久化结构(userData/copy-drafts.json;全量读写,写入即落盘) */
export const copyStoreDataSchema = z.object({
  drafts: z.array(z.object({
    id: z.string().min(1),
    title: copyDraftInputSchema.shape.title,
    body: copyDraftInputSchema.shape.body,
    platform: copyPlatformSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
}).strict();
export type CopyStoreData = z.infer<typeof copyStoreDataSchema>;

/** AI 优化模式:去AI味 / 润色 / 起标题 */
export const copyAiModeSchema = z.enum(['humanize', 'polish', 'titles']);
export type CopyAiMode = z.infer<typeof copyAiModeSchema>;

/** AI 建议(用户确认前不写入草稿;edit.notes 为改动说明,最多3条) */
export type CopyAiAction =
  | { kind: 'edit'; text: string; notes: string[] }
  | { kind: 'titles'; titles: string[] };

export const copyAiActionsSchema = z.array(z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit'),
    text: z.string().min(1, 'AI 返回的正文为空').max(20000, 'AI 返回的正文超长'),
    notes: z.array(z.string().min(1).max(120)).max(3),
  }),
  z.object({
    kind: z.literal('titles'),
    titles: z.array(z.string().trim().min(1, '标题候选为空').max(30, '标题候选超长')).min(1).max(8),
  }),
])).max(4);

/** 小红书笔记正文上限(平台限制 1000 字,编辑器实时提示用) */
export const XHS_BODY_LIMIT = 1000;
/** 小红书标题上限(平台限制 20 字) */
export const XHS_TITLE_LIMIT = 20;
