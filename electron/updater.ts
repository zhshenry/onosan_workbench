import type { AppUpdater } from 'electron-updater';
import type { UpdateStatus } from '../shared/contracts';

export type UpdateDriver = Pick<AppUpdater, 'on' | 'checkForUpdates' | 'quitAndInstall' | 'autoDownload' | 'autoInstallOnAppQuit'>;

/** 更新状态由主进程维护，切换设置页后仍可继续查看下载进度。 */
export class AppUpdates {
  private current: UpdateStatus;

  constructor(
    private readonly driver: UpdateDriver | null,
    unavailableMessage: string,
    private readonly publish: (status: UpdateStatus) => void,
  ) {
    this.current = { enabled: !!driver, phase: 'idle', version: '', progress: 0,
      message: driver ? '启动后自动检查更新，也可手动检查。' : unavailableMessage };
    if (!driver) return;
    driver.autoDownload = true;
    driver.autoInstallOnAppQuit = true;
    driver.on('checking-for-update', () => this.set({ phase: 'checking', progress: 0, message: '正在检查更新…' }));
    driver.on('update-not-available', () => this.set({ phase: 'latest', version: '', message: '当前已是最新版本。' }));
    driver.on('update-available', info => this.set({ phase: 'downloading', version: info.version, progress: 0, message: `正在下载 v${info.version}…` }));
    driver.on('download-progress', info => this.set({ progress: Math.floor(info.percent), message: `正在下载 v${this.current.version}（${Math.floor(info.percent)}%）` }));
    driver.on('update-downloaded', info => this.set({ phase: 'ready', version: info.version, progress: 100, message: `v${info.version} 已下载，可重启安装；退出应用时也会安装。` }));
    driver.on('error', error => this.fail(error));
  }

  status(): UpdateStatus { return { ...this.current }; }

  async check(): Promise<void> {
    if (!this.driver || ['checking', 'downloading', 'ready'].includes(this.current.phase)) return;
    this.set({ phase: 'checking', version: '', progress: 0, message: '正在检查更新…' });
    try {
      await this.driver.checkForUpdates();
    } catch (error) {
      this.fail(error);
    }
  }

  install(): void {
    if (this.current.phase === 'ready') this.driver?.quitAndInstall(false, true);
  }

  private set(patch: Partial<UpdateStatus>): void {
    this.current = { ...this.current, ...patch };
    this.publish(this.status());
  }

  private fail(error: unknown): void {
    const detail = error instanceof Error ? error.message : String(error);
    const message = /404|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|Cannot find latest/i.test(detail)
      ? '发布源暂时没有可用版本，请稍后重试。'
      : /ETIMEDOUT|ENOTFOUND|ECONN|ERR_PROXY|net::/i.test(detail)
        ? '连接更新服务失败，请检查网络或代理后重试。'
        : '检查或下载更新失败，请稍后重试。';
    this.set({ phase: 'error', progress: 0, message });
  }
}
