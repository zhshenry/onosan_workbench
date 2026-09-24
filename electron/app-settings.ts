// 应用设置(工作台自有,2026-09-24 定稿:设置 = 第六个大工作台):
// - 存储 userData/app-settings.json,与 ai-config.json 平级;损坏时整体回落默认值
// - 纯存储,不依赖 electron;开机自启/关闭行为等副作用在 main.ts 应用
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppSettingsSchema, DEFAULT_APP_SETTINGS, type AppSettings, type AppSettingsPatch } from '../shared/contracts';

export class AppSettingsStore {
  private readonly configPath: string;
  private cached: AppSettings | null = null;

  constructor(dir: string) {
    this.configPath = join(dir, 'app-settings.json');
  }

  read(): AppSettings {
    if (this.cached) return this.cached;
    this.cached = this.readFromDisk();
    return this.cached;
  }

  patch(input: AppSettingsPatch): AppSettings {
    // 逐字段校验:非法值丢弃,合法部分照常生效;未知键忽略(字段已各自过 schema,收尾断言类型安全)
    const next: Record<string, unknown> = { ...this.read() };
    for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
      if (key in input) {
        const field = AppSettingsSchema.shape[key].safeParse((input as Record<string, unknown>)[key]);
        if (field.success) next[key] = field.data;
      }
    }
    this.cached = next as AppSettings;
    try {
      writeFileSync(this.configPath, JSON.stringify(next, null, 2), 'utf8');
    } catch {
      // 写失败(磁盘只读等)保留内存值,下次启动回落
    }
    return this.cached;
  }

  private readFromDisk(): AppSettings {
    try {
      if (!existsSync(this.configPath)) return { ...DEFAULT_APP_SETTINGS };
      const parsed = JSON.parse(readFileSync(this.configPath, 'utf8')) as unknown;
      if (typeof parsed !== 'object' || parsed === null) return { ...DEFAULT_APP_SETTINGS };
      const raw = { ...DEFAULT_APP_SETTINGS, ...(parsed as Record<string, unknown>) };
      // 逐字段恢复:单个字段损坏只丢弃该字段,其余保留(兼容旧文件/局部损坏)
      const next: Record<string, unknown> = { ...DEFAULT_APP_SETTINGS };
      for (const key of Object.keys(DEFAULT_APP_SETTINGS) as (keyof AppSettings)[]) {
        const field = AppSettingsSchema.shape[key].safeParse(raw[key]);
        if (field.success) next[key] = field.data;
      }
      return next as AppSettings;
    } catch {
      return { ...DEFAULT_APP_SETTINGS };
    }
  }
}
