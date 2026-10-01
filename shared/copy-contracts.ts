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

/** 用户确认的已发布作品关联;不等同于创作者后台同步结果。 */
export const xhsPublishedSchema = z.object({
  status: z.literal('published'),
  source: z.literal('manual'),
  url: z.url(),
  remoteId: z.string().min(1),
  confirmedAt: z.iso.datetime(),
}).strict();
export type XhsPublished = z.infer<typeof xhsPublishedSchema>;
export interface CopyDraft extends CopyDraftInput {
  id: string;
  createdAt: string;
  updatedAt: string;
  xhsPublished?: XhsPublished;
}

/** 草稿库持久化结构(userData/copy-drafts.json;全量读写,写入即落盘) */
export const copyStoreDataSchema = z.object({
  drafts: z.array(z.object({
    id: z.string().min(1),
    title: copyDraftInputSchema.shape.title,
    body: copyDraftInputSchema.shape.body,
    platform: copyPlatformSchema,
    createdAt: z.string(),
    updatedAt: z.string(),
    xhsPublished: xhsPublishedSchema.optional(),
  })),
}).strict();
export type CopyStoreData = z.infer<typeof copyStoreDataSchema>;

/**
 * AI 建议动作(写作助手模式,经工具 propose_edit/propose_title 产出,用户确认后应用):
 * - edit:完整正文改写(一次一条,应用即替换正文)
 * - title:单个标题候选(起标题时逐个提交,便于逐条选用)
 */
export type CopyAiAction =
  | { kind: 'edit'; text: string; notes: string[] }
  | { kind: 'title'; title: string };

export const copyAiActionsSchema = z.array(z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('edit'),
    text: z.string().min(1, 'AI 返回的正文为空').max(20000, 'AI 返回的正文超长'),
    notes: z.array(z.string().min(1).max(120)).max(3),
  }),
  z.object({
    kind: z.literal('title'),
    title: z.string().trim().min(1, '标题候选为空').max(30, '标题候选超长'),
  }),
])).max(12);

/** 小红书笔记正文上限(平台限制 1000 字,编辑器实时提示用) */
export const XHS_BODY_LIMIT = 1000;
/** 小红书标题上限(平台限制 20 字) */
export const XHS_TITLE_LIMIT = 20;
/** 小红书创作者中心发布页(主进程外链白名单与其保持一致) */
export const XHS_PUBLISH_URL = 'https://creator.xiaohongshu.com/publish/publish?source=official';

/** 从正文提取话题标签(#开头、不含空白与#,去重,保持出现顺序;单个最长30字) */
export function extractXhsTags(body: string): string[] {
  const seen = new Set<string>();
  for (const match of body.matchAll(/#([^\s#]{1,30})/g)) {
    const tag = match[1].trim();
    if (tag) seen.add(tag);
  }
  return [...seen];
}
