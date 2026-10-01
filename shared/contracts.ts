/**
 * 前后端唯一契约源(沿用 To-Do-List 模式):
 * Zod schema 同时生成运行时校验与 TS 类型;渲染进程只经 preload 暴露的类型化 API 通信。
 * 待办/日程契约将在待办模块移植阶段并入此处(与上游 To-Do-List contracts.ts 保持平行)。
 */
import { z } from 'zod';

/** 大工作台标识(图标栏一级导航;settings = 设置工作台,2026-09-24 定稿方案 C) */
export const WorkbenchIdSchema = z.enum(['home', 'media', 'game', 'web', 'life', 'settings']);
export type WorkbenchId = z.infer<typeof WorkbenchIdSchema>;

/** 工作台内页面标识(设置工作台分区对应 settings-* view) */
export const ViewIdSchema = z.enum([
  'home',
  'bazi',
  'copy',
  'copy-publish',
  'media-browser',
  'settings-profile',
  'settings-general',
  'settings-appearance',
  'settings-ai',
  'settings-data',
  'settings-notifications',
  'settings-about',
]);
export type ViewId = z.infer<typeof ViewIdSchema>;

/** 设置工作台的分区(导航与路由共用) */
export const SETTINGS_VIEWS = {
  profile: 'settings-profile',
  general: 'settings-general',
  appearance: 'settings-appearance',
  ai: 'settings-ai',
  data: 'settings-data',
  notifications: 'settings-notifications',
  about: 'settings-about',
} as const;

/** 界面主题:雾灰轻雾(默认)、冷灰凝霜、暖砂柔雾 */
export const UiThemeSchema = z.enum(['mist', 'cool', 'warm']);
export type UiTheme = z.infer<typeof UiThemeSchema>;

export const AvatarColorSchema = z.enum(['blue', 'teal', 'violet', 'rose', 'amber']);
export type AvatarColor = z.infer<typeof AvatarColorSchema>;

/**
 * 应用设置(工作台自有,存 userData/app-settings.json;与 To-Do-List 无关)。
 * 新增字段必须给默认值并兼容旧文件(存储层逐字段恢复,旧文件缺字段自动落默认)。
 */
export const AppSettingsSchema = z.object({
  profile: z.object({
    name: z.string().min(1).max(20),
    avatarColor: AvatarColorSchema.default('blue'),
  }),
  launchAtLogin: z.boolean(),
  closeAction: z.enum(['minimize', 'exit']),
  language: z.enum(['zh-CN']),
  remindersEnabled: z.boolean(),
  uiTheme: UiThemeSchema,
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type AppSettingsPatch = Partial<Omit<AppSettings, 'profile'>> & {
  profile?: Partial<AppSettings['profile']>;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  profile: { name: 'Ono', avatarColor: 'blue' },
  launchAtLogin: false,
  closeAction: 'minimize',
  language: 'zh-CN',
  remindersEnabled: true,
  uiTheme: 'mist',
};

/** 待办共享库状态(设置 → 待办与数据,只读展示) */
export interface TodoDbInfo {
  path: string;
  connected: boolean;
  /** 上游 To-Do-List 的 PRAGMA user_version */
  schemaVersion: number;
  taskCount: number;
  categoryCount: number;
}

/** 应用元信息(渲染层只读) */
export const AppMetaSchema = z.object({
  name: z.string(),
  version: z.string(),
});
export type AppMeta = z.infer<typeof AppMetaSchema>;

export interface UpdateStatus {
  enabled: boolean;
  phase: 'idle' | 'checking' | 'latest' | 'downloading' | 'ready' | 'error';
  version: string;
  progress: number;
  message: string;
}
