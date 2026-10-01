// 悬浮待办窗(用户方案 2026-09-26):独立无边框窗,展开=完整待办卡,迷你=任务卡;
// 独立窗口经 ?window=float 分流复用同一 bundle(上游 AI 窗模式)。
import { BrowserWindow, screen, ipcMain } from 'electron';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const EXPANDED = { width: 440, height: 1200 };
const MINI = { width: 440, height: 176 };
const INITIAL_HEIGHT = 860;

export class FloatTodoWindow {
  private win: BrowserWindow | null = null;
  private pinned = true;
  private expandedHeight = INITIAL_HEIGHT;
  private collapsed = false;
  private motion: Promise<void> | null = null;
  private cancelMotion: (() => void) | null = null;

  constructor(private readonly devUrl: string | undefined, private readonly preloadPath: string) {}

  get window(): BrowserWindow | null {
    return this.win;
  }

  isVisible(): boolean {
    return this.win?.isVisible() ?? false;
  }

  private publishVisibility(): void {
    const visible = this.isVisible();
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('float:visibility-changed', visible);
    }
  }

  showOrHide(): void {
    if (!this.win) {
      this.create();
      return;
    }
    if (this.win.isVisible()) this.win.hide();
    else this.win.show();
  }

  show(): void {
    if (!this.win) this.create();
    else this.win.show();
  }

  private create(): void {
    const area = screen.getPrimaryDisplay().workArea;
    const height = Math.min(this.expandedHeight, area.height - 24);
    this.win = new BrowserWindow({
      width: EXPANDED.width,
      height,
      x: area.x + area.width - EXPANDED.width - 24,
      y: area.y + area.height - height - 24,
      frame: false,
      transparent: true,
      resizable: false,
      maximizable: false,
      fullscreenable: false,
      alwaysOnTop: this.pinned,
      skipTaskbar: true,
      show: false,
      title: '待办',
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        spellcheck: false,
      },
    });
    this.win.once('ready-to-show', () => this.win?.show());
    this.win.on('show', () => this.publishVisibility());
    this.win.on('hide', () => this.publishVisibility());
    if (this.devUrl) {
      void this.win.loadURL(`${this.devUrl}?window=float`);
    } else {
      const index = join(this.preloadPath, '../../dist/index.html');
      if (existsSync(index)) void this.win.loadFile(index, { query: { window: 'float' } });
    }
    // 关闭 = 隐藏(随时再唤起);销毁仅在应用退出
    this.win.on('close', (event) => {
      event.preventDefault();
      this.win?.hide();
    });
    this.win.on('closed', () => {
      this.cancelMotion?.();
      this.win = null;
      this.collapsed = false;
    });
  }

  setCollapsed(collapsed: boolean, animate = true): Promise<void> {
    if (this.motion) return this.motion;
    if (!this.win) return Promise.resolve();
    const win = this.win;
    const bounds = win.getBounds();
    if (collapsed && !this.collapsed) this.expandedHeight = bounds.height;
    const area = screen.getDisplayMatching(bounds).workArea;
    const size = collapsed ? MINI : { width: EXPANDED.width, height: Math.min(this.expandedHeight, area.height - 24) };
    // 与 To-Do-List 一致:固定上沿,仅在超出屏幕工作区时挪动窗口。
    const target = {
      x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - size.width)),
      y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - size.height)),
      ...size,
    };
    const settle = (): void => {
      if (!win.isDestroyed()) {
        win.setBounds(target);
        this.collapsed = collapsed;
      }
    };
    if (!animate) {
      settle();
      return Promise.resolve();
    }
    const duration = collapsed ? 180 : 240;
    this.motion = new Promise<void>((resolve) => {
      const started = Date.now();
      const finish = (): void => {
        clearInterval(timer);
        this.motion = null;
        this.cancelMotion = null;
        resolve();
      };
      const timer = setInterval(() => {
        if (win.isDestroyed()) { finish(); return; }
        const progress = Math.min(1, (Date.now() - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        win.setBounds({
          x: Math.round(bounds.x + (target.x - bounds.x) * eased),
          y: Math.round(bounds.y + (target.y - bounds.y) * eased),
          width: target.width,
          height: Math.round(bounds.height + (target.height - bounds.height) * eased),
        });
        if (progress === 1) { settle(); finish(); }
      }, 16);
      this.cancelMotion = finish;
    });
    return this.motion;
  }

  setExpandedHeight(height: number): void {
    if (!Number.isFinite(height) || this.motion) return;
    const next = Math.max(330, Math.min(EXPANDED.height, Math.round(height)));
    if (next === this.expandedHeight) return;
    this.expandedHeight = next;
    if (this.win && !this.collapsed) void this.setCollapsed(false, false);
  }

  // 迷你卡 AI 等场景的临时高度(上游 compactHeight 同义):只改当前窗口,不改 expandedHeight 记忆
  setTempHeight(height: number | null): void {
    if (!this.win || this.motion) return;
    const target = height ?? MINI.height;
    const bounds = this.win.getBounds();
    if (bounds.height === target) return;
    const y = bounds.y + bounds.height - target;
    this.win.setBounds({ x: bounds.x, y, width: bounds.width, height: target });
  }

  togglePin(): boolean {
    this.pinned = !this.pinned;
    this.win?.setAlwaysOnTop(this.pinned, 'screen-saver');
    return this.pinned;
  }

  isPinned(): boolean {
    return this.pinned;
  }

  destroy(): void {
    this.cancelMotion?.();
    if (!this.win) return;
    this.win.removeAllListeners('close');
    this.win.destroy();
    this.win = null;
  }
}

export function registerFloatIpc(factory: () => FloatTodoWindow): void {
  ipcMain.on('float:subscribe', (event) => {
    event.sender.send('float:visibility-changed', factory().isVisible());
  });
  ipcMain.handle('float:toggle', () => {
    factory().showOrHide();
    return factory().isVisible();
  });
  ipcMain.handle('float:show', () => factory().show());
  ipcMain.handle('float:collapse', (_event, collapsed: unknown, animate: unknown) => factory().setCollapsed(collapsed === true, animate !== false));
  ipcMain.on('float:tempHeight', (_event, height: unknown) => {
    factory().setTempHeight(typeof height === 'number' ? height : null);
  });

  ipcMain.on('float:resize', (_event, height: unknown) => {
    if (typeof height === 'number') factory().setExpandedHeight(height);
  });
  ipcMain.handle('float:pin', () => factory().togglePin());
}
