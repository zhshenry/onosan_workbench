/**
 * 素材采集契约:自媒体浏览器「采集到素材」的持久化结构。
 * 截图 PNG 落盘 userData/media-captures/<id>.png,索引与缩略图(dataURL)在 media-captures.json。
 * 选题库/素材库模块上线后,此结构作为迁移源。
 */
import { z } from 'zod';

/** 采集条目(索引形态;PNG 在独立文件) */
export const mediaCaptureItemSchema = z.object({
  id: z.string().min(1),
  url: z.string().max(2048),
  title: z.string().max(200),
  /** 截图文件名(位于 media-captures/ 目录内) */
  file: z.string(),
  /** 缩略图 dataURL(展示用) */
  thumb: z.string(),
  /** 用户备注(可选,采集后补记) */
  note: z.string().max(200).optional(),
  createdAt: z.string(),
}).strict();
export type MediaCaptureItem = z.infer<typeof mediaCaptureItemSchema>;

/** 采集入库输入(渲染层经 IPC 提交;png 为 base64) */
export const mediaCaptureSaveSchema = z.object({
  url: z.string().regex(/^https?:\/\//, '仅支持 http(s) 链接').max(2048),
  title: z.string().max(200, '标题过长').default(''),
  png: z.string().min(1, '截图内容为空'),
  thumb: z.string().optional(),
}).strict();
export type MediaCaptureSave = z.infer<typeof mediaCaptureSaveSchema>;

/** 索引文件结构 */
export const mediaCaptureIndexSchema = z.array(mediaCaptureItemSchema).max(200);
export type MediaCaptureIndex = z.infer<typeof mediaCaptureIndexSchema>;
