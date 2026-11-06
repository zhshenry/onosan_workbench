import { app, BrowserWindow, dialog, ipcMain, nativeImage, Notification, powerMonitor, screen, shell, type IpcMainInvokeEvent, type Rectangle } from 'electron';
import { join } from 'node:path';
import { z } from 'zod';
import type { Store } from '../modules/todo/store';
import type { Task } from '../shared/todo-contracts';
import { inTimeRange, islandBounds, ISLAND_MOTION_MS, ISLAND_QUOTA_LABELS, ISLAND_QUOTA_PROVIDERS, type IslandMode, type IslandNavigation, type IslandReminder, type IslandState } from '../shared/island-contracts';
import { IslandStore } from './island-store';
import { IslandQuotas } from './island-quotas';
import { watchFullscreen } from './island-fullscreen';
import { readIslandFileIcons } from './island-file-icons';

export class DesktopIsland {
  private win: BrowserWindow | null = null;
  readonly store: IslandStore;
  private quotas: IslandQuotas;
  private mode: IslandMode = 'collapsed';
  private pinned = false;
  private held = false;
  private locked = false;
  private fullscreen = false;
  private fullscreenDetection = false;
  private motion: NodeJS.Timeout | null = null;
  private shape: Rectangle | null = null;
  private speechHeight = 132;
  private reminderTimer: NodeJS.Timeout | null = null;
  private timer: NodeJS.Timeout;
  private stopFullscreen: () => void;
  private lastQuotaRead = 0;
  private error = '';
  private icons: Promise<Record<string, string>> | null = null;
  constructor(private devUrl: string | undefined, private preload: string, dir: string, private main: () => BrowserWindow | null, private todo: Store) {
    this.store = new IslandStore(dir);
    this.quotas = new IslandQuotas(dir, () => {
      try { if (!this.store.loadError) this.checkLowQuota(); }
      catch { this.error = '低额度提醒保存失败，请检查数据目录权限'; }
      this.publish();
    });
    screen.on('display-removed', this.reposition); screen.on('display-metrics-changed', this.reposition);
    powerMonitor.on('lock-screen', this.lock); powerMonitor.on('unlock-screen', this.unlock);
    powerMonitor.on('resume', this.tick);
    this.stopFullscreen = watchFullscreen(value => {
      const changed = !this.fullscreenDetection || this.fullscreen !== value;
      this.fullscreenDetection = true; this.fullscreen = value;
      if (changed) this.visibility();
    }, () => { this.fullscreenDetection = false; this.publish(); });
    this.timer = setInterval(this.tick, 1000); this.timer.unref();
  }
  get window(): BrowserWindow | null { return this.win; }
  isVisible(): boolean { return this.store.read().settings.enabled; }
  private quiet(): boolean { const s = this.store.read().settings; return this.locked || inTimeRange(new Date(), s.dndStart, s.dndEnd) && s.dnd; }
  state(): IslandState {
    return { ...this.store.read(), files: this.store.files(), mode: this.mode, pinned: this.pinned, quiet: this.quiet(), fullscreenDetection: this.fullscreenDetection, error: this.store.loadError || this.error || undefined };
  }
  private async fileIcon(id: string): Promise<string> {
    this.store.file(id);
    const icons = await (this.icons ??= readIslandFileIcons(this.store.files()).catch(error => { this.icons = null; throw error; }));
    return icons[id] || '';
  }
  private publish = (): void => {
    const state = this.state();
    for (const win of BrowserWindow.getAllWindows()) {
      if (win !== this.win && win !== this.main()) continue;
      win.webContents.send('island:changed', state);
      win.webContents.send('float:visibility-changed', state.settings.enabled);
    }
  };
  private lock = (): void => { this.locked = true; this.visibility(); };
  private unlock = (): void => { this.locked = false; this.mode = this.pinned ? 'expanded' : 'collapsed'; this.reposition(); this.visibility(); };
  private visibility(): void {
    const s = this.store.read().settings;
    if (s.enabled && !this.locked && !(s.hideFullscreen && this.fullscreen)) {
      this.win?.showInactive();
      this.win?.setAlwaysOnTop(true, 'floating');
    }
    else this.win?.hide();
    this.publish();
  }
  showOrHide(): void {
    if (this.isVisible()) { this.store.patch({ enabled: false }); this.pinned = false; this.mode = 'collapsed'; this.visibility(); }
    else this.show();
  }
  show(): void {
    this.store.patch({ enabled: true });
    if (!this.win) this.create();
    this.reposition(); this.visibility();
  }
  private create(): void {
    this.win = new BrowserWindow({ ...this.bounds('expanded'), frame: false, transparent: true, resizable: false, maximizable: false, fullscreenable: false, alwaysOnTop: true, skipTaskbar: true, show: false, title: '桌面灵动岛', hasShadow: false, webPreferences: { preload: this.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } });
    this.win.setAlwaysOnTop(true, 'floating');
    this.win.once('ready-to-show', () => this.visibility());
    this.win.on('blur', () => { if (!this.pinned && !this.held) this.setMode('collapsed'); });
    this.win.on('close', event => { event.preventDefault(); this.store.patch({ enabled: false }); this.pinned = false; this.mode = 'collapsed'; this.visibility(); });
    this.win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.win.webContents.on('will-navigate', event => event.preventDefault());
    if (this.devUrl) void this.win.loadURL(`${this.devUrl}?window=float`);
    else void this.win.loadFile(join(this.preload, '../../dist/index.html'), { query: { window: 'float' } });
  }
  private bounds(mode: IslandMode = this.mode) {
    const s = this.store.read().settings;
    const display = screen.getAllDisplays().find(d => d.id === s.displayId) ?? screen.getPrimaryDisplay();
    return islandBounds(mode, display.workArea, s.topOffset, s.dock);
  }
  private shapeBounds(): Rectangle {
    const frame = this.bounds('expanded'), bounds = this.bounds();
    return { x: bounds.x - frame.x, y: bounds.y - frame.y, width: bounds.width, height: bounds.height };
  }
  private applyShape(shape: Rectangle): void {
    this.shape = shape;
    if (this.mode !== 'speech') { this.win?.setShape([shape]); return; }
    const frame = this.bounds('expanded'), bar = this.bounds('collapsed'), bounds = this.shapeBounds();
    const summary = { x: bar.x - frame.x, y: bar.y - frame.y, width: bar.width, height: bar.height };
    const dock = this.store.read().settings.dock;
    const width = Math.min(224, bounds.width - (dock === 'top' ? 24 : summary.width + 24));
    const bubble = dock === 'top'
      ? { x: bounds.x + 12, y: summary.y + summary.height, width, height: Math.min(this.speechHeight + 12, bounds.height - summary.height) }
      : { x: dock === 'left' ? summary.x + summary.width : summary.x - width - 12, y: bounds.y + 12, width: width + 12, height: Math.min(this.speechHeight, bounds.height - 12) };
    this.win?.setShape([summary, bubble]);
  }
  private reposition = (): void => {
    if (this.motion) clearTimeout(this.motion); this.motion = null;
    this.win?.setBounds(this.bounds('expanded')); this.applyShape(this.shapeBounds());
  };
  setMode(mode: IslandMode, reduce = false): void {
    if (this.pinned && mode !== 'expanded') return;
    this.mode = mode;
    const win = this.win;
    if (this.motion) clearTimeout(this.motion);
    this.motion = null;
    if (!win || win.isDestroyed()) return;
    const to = this.shapeBounds(), from = this.shape ?? to;
    if (reduce || this.store.read().settings.reducedMotion || this.quiet()) this.applyShape(to);
    else {
      // Keep Chromium's surface stable; the native region also lets clicks pass through outside it.
      const x = Math.min(from.x, to.x), y = Math.min(from.y, to.y);
      const width = Math.max(from.x + from.width, to.x + to.width) - x, height = Math.max(from.y + from.height, to.y + to.height) - y;
      this.applyShape({ x, y, width, height });
      if (width !== to.width || height !== to.height) this.motion = setTimeout(() => {
        this.motion = null;
        if (!win.isDestroyed()) this.applyShape(to);
      }, ISLAND_MOTION_MS[mode] + 50);
    }
    this.publish();
  }
  private tick = (): void => {
    try {
      const before = this.store.read(), alerts = this.store.tick();
      if (alerts.length) this.notify(alerts);
      else if (JSON.stringify(before) !== JSON.stringify(this.store.read())) this.publish();
      const interval = this.mode === 'expanded' && before.settings.lastPage === 'quota' && this.win?.isVisible() ? 60000 : 300000;
      if (Date.now() - this.lastQuotaRead >= interval) { this.lastQuotaRead = Date.now(); void this.quotas.refresh(); }
    } catch { this.error = '灵动岛状态保存失败，请检查数据目录权限'; this.win?.webContents.send('island:error', this.error); }
  };
  private checkLowQuota(): void {
    const threshold = this.store.read().settings.lowQuota;
    for (const provider of this.quotas.read()) {
      if (provider.status !== 'ready') continue;
      for (const window of provider.windows) {
        const key = `${provider.id}:${provider.accountKey}:${window.label}:${window.resetsAt}`;
        if (threshold > 0 && window.remaining < threshold && this.store.claimQuota(key)) {
          this.notify([{ id: `quota:${key}`, kind: 'quota', title: `${ISLAND_QUOTA_LABELS[provider.id]} ${window.label}剩余 ${window.remaining}%`, createdAt: Date.now() }]);
        }
      }
    }
  }
  private notify(alerts: IslandReminder[], failed?: () => void): void {
    this.store.enqueue(alerts); this.publish();
    if (this.quiet() || this.fullscreen && this.store.read().settings.hideFullscreen) return;
    if (this.win?.isVisible()) {
      if (this.store.read().settings.sound) shell.beep();
      if (this.mode === 'collapsed' && !this.held) { this.setMode(this.store.read().settings.mascotEnabled ? 'speech' : 'reminder'); this.armReminderTimer(); }
      else if (this.mode === 'speech') this.armReminderTimer();
      return;
    }
    const systemAlerts = alerts.filter(alert => alert.kind !== 'water');
    if (systemAlerts.length && Notification.isSupported()) {
      const notification = new Notification({ title: systemAlerts.length > 1 ? `${systemAlerts.length} 条提醒` : systemAlerts[0].title, body: '点击在工作台中查看', silent: !this.store.read().settings.sound });
      if (failed) notification.once('failed', failed);
      notification.on('click', () => this.navigate({ view: 'home', taskId: systemAlerts[0].taskId })); notification.show();
    }
  }
  private armReminderTimer(): void {
    if (this.reminderTimer) clearTimeout(this.reminderTimer);
    this.reminderTimer = setTimeout(() => { if (this.held) this.armReminderTimer(); else if (this.mode === 'reminder' || this.mode === 'speech') this.setMode('collapsed'); }, 8000);
  }
  remindTasks(tasks: Task[]): boolean {
    if (this.store.loadError) return false;
    const s = this.store.read().settings;
    const accepted = tasks.filter(t => t.kind === 'meeting' ? s.scheduleReminders : s.todoReminders);
    for (const task of tasks) if (!accepted.includes(task)) this.todo.unclaim(task);
    if (accepted.length) this.notify(accepted.map(task => ({ id: `${task.id}:${task.remindAt}`, kind: task.kind, title: task.title, taskId: task.id, createdAt: Date.now() })), () => { for (const task of accepted) this.todo.unclaim(task); });
    return true;
  }
  navigate(target: IslandNavigation): void {
    const win = this.main(); if (!win) return;
    if (win.isMinimized()) win.restore(); win.show(); win.focus();
    win.webContents.send('island:navigate', target);
  }
  register(): void {
    const guard = (event: IpcMainInvokeEvent): void => {
      if (![this.main()?.webContents, this.win?.webContents].includes(event.sender) || event.senderFrame !== event.sender.mainFrame) throw new Error('仅工作台窗口可使用桌面灵动岛');
    };
    const handle = (name: string, action: (...args: any[]) => unknown) => ipcMain.handle(name, (event, ...args) => { guard(event); return action(...args); });
    handle('float:toggle', () => { this.showOrHide(); return this.isVisible(); });
    handle('float:show', () => this.show());
    ipcMain.on('float:subscribe', event => { if ([this.main()?.webContents, this.win?.webContents].includes(event.sender)) event.sender.send('float:visibility-changed', this.isVisible()); });
    handle('island:state', () => this.state());
    handle('island:patch', input => {
      const previousDock = this.store.read().settings.dock;
      this.store.patch(z.record(z.string(), z.unknown()).parse(input));
      if (this.mode === 'speech' && !this.store.read().settings.mascotEnabled) this.mode = 'reminder';
      if (!this.isVisible()) { this.pinned = false; this.mode = 'collapsed'; this.held = false; }
      if (this.isVisible() && !this.win) this.create();
      this.reposition();
      if (this.win && previousDock !== this.store.read().settings.dock) {
        // Moving the native window can miss mouseleave; reconcile the real pointer position.
        const { x, y } = screen.getCursorScreenPoint(), bounds = this.bounds();
        this.held = x >= bounds.x && x < bounds.x + bounds.width && y >= bounds.y && y < bounds.y + bounds.height;
        if (!this.pinned && !this.held && this.mode === 'expanded') this.setMode('collapsed');
      }
      this.visibility(); return this.state();
    });
    handle('island:mode', (mode, reduce) => { this.setMode(z.enum(['collapsed', 'expanded', 'reminder', 'speech']).parse(mode), reduce === true); });
    handle('island:pin', () => { this.pinned = !this.pinned; if (this.pinned) this.setMode('expanded'); else this.publish(); return this.state(); });
    ipcMain.on('island:hold', (event, held) => {
      if (event.sender !== this.win?.webContents || event.senderFrame !== event.sender.mainFrame) return;
      const wasHeld = this.held; this.held = held === true;
      if (wasHeld && !this.held && this.mode === 'speech') this.armReminderTimer();
    });
    ipcMain.on('island:speechHeight', (event, height) => {
      if (event.sender !== this.win?.webContents || event.senderFrame !== event.sender.mainFrame || this.mode !== 'speech' || !Number.isFinite(height)) return;
      const value = Math.max(1, Math.min(this.store.read().settings.dock === 'top' ? 132 : 160, Math.ceil(height)));
      if (this.speechHeight === value) return;
      this.speechHeight = value; this.applyShape(this.shapeBounds());
    });
    handle('island:navigate', target => this.navigate(z.object({ view: z.enum(['home', 'settings-island', 'settings-general']), taskId: z.string().optional(), section: z.literal('quota').optional() }).parse(target)));
    handle('island:displays', () => screen.getAllDisplays().map((d, i) => ({ id: d.id, label: `${d.label || `显示器 ${i + 1}`} · ${d.size.width}×${d.size.height}${d.id === screen.getPrimaryDisplay().id ? ' · 主屏' : ''}` })));
    const changed = () => {
      if (!this.store.read().reminders.length && (this.mode === 'reminder' || this.mode === 'speech')) this.setMode('collapsed');
      this.publish(); return this.state();
    };
    handle('island:filesAdd', async (paths, directory) => {
      let selected = paths;
      if (!selected) { const result = await dialog.showOpenDialog({ title: '添加到文件暂存', properties: [directory === true ? 'openDirectory' : 'openFile', 'multiSelections'] }); selected = result.filePaths; }
      this.store.addFiles(selected); this.icons = null; return changed();
    });
    handle('island:filesRemove', id => { if (id !== undefined) z.string().parse(id); this.store.removeFiles(id); this.icons = null; return changed(); });
    const noteChanged = (action: () => unknown) => {
      try { action(); return changed(); }
      catch (error) { if (error instanceof Error && 'code' in error) throw new Error('文字记录更新失败，请检查数据目录权限后重试'); throw error; }
    };
    handle('island:noteDraft', draft => noteChanged(() => this.store.setNoteDraft(draft)));
    handle('island:noteSave', (text, id) => noteChanged(() => this.store.saveNote(text, id === undefined ? undefined : z.string().parse(id))));
    handle('island:noteRemove', id => noteChanged(() => this.store.removeNote(z.string().parse(id))));
    handle('island:fileIcon', id => this.fileIcon(z.string().parse(id)));
    handle('island:fileOpen', async id => { const error = await shell.openPath(this.store.file(z.string().parse(id))); if (error) throw new Error('无法打开文件，文件可能已移动或不存在'); });
    handle('island:fileRelocate', async id => { this.store.file(z.string().parse(id)); const file = this.store.read().files.find(f => f.id === id)!; const result = await dialog.showOpenDialog({ title: '重新定位文件', properties: [file.directory ? 'openDirectory' : 'openFile'] }); if (result.filePaths[0]) this.store.relocate(id, result.filePaths[0]); this.icons = null; return changed(); });
    ipcMain.on('island:fileDrag', async (event, id) => {
      if (event.sender !== this.win?.webContents || event.senderFrame !== event.sender.mainFrame) return;
      try { const file = this.store.file(z.string().parse(id)); const data = await this.fileIcon(id).catch(() => ''); const icon = data ? nativeImage.createFromDataURL(data) : await app.getFileIcon(file, { size: 'large' }); event.sender.startDrag({ file, icon }); }
      catch { event.sender.send('island:error', '无法拖出文件，请检查原文件是否仍存在'); }
      this.held = false;
    });
    handle('island:focus', (action, minutes, taskId) => {
      if (taskId && !this.todo.all().some(t => t.id === taskId && !t.deletedAt)) throw new Error('关联事项已不存在');
      this.store.focus(z.enum(['start', 'pause', 'resume', 'stop']).parse(action), minutes, taskId); return changed();
    });
    handle('island:water', action => { this.store.water(z.enum(['drink', 'snooze', 'pause']).parse(action)); return changed(); });
    handle('island:dismiss', id => { this.store.dismiss(z.string().parse(id)); return changed(); });
    handle('island:quotas', () => this.quotas.read());
    handle('island:quotaRefresh', () => this.quotas.refresh());
    handle('island:quotaConnect', (provider, key) => this.quotas.connect(z.enum(ISLAND_QUOTA_PROVIDERS).parse(provider), key === undefined ? undefined : z.string().parse(key)));
    handle('island:quotaDisconnect', provider => this.quotas.disconnect(z.enum(ISLAND_QUOTA_PROVIDERS).parse(provider)));
    handle('island:quotaOfficial', provider => shell.openExternal({ codex: 'https://chatgpt.com/codex/settings/usage', zcode: 'https://bigmodel.cn/coding-plan/personal/usage', cursor: 'https://cursor.com/dashboard', grokbot: 'https://x.ai/bot' }[z.enum(ISLAND_QUOTA_PROVIDERS).parse(provider)]));
  }
  destroy(): void {
    clearInterval(this.timer); if (this.motion) clearTimeout(this.motion); if (this.reminderTimer) clearTimeout(this.reminderTimer);
    this.stopFullscreen(); this.quotas.stop();
    screen.off('display-removed', this.reposition); screen.off('display-metrics-changed', this.reposition);
    powerMonitor.off('lock-screen', this.lock); powerMonitor.off('unlock-screen', this.unlock); powerMonitor.off('resume', this.tick);
    if (this.store.read().settings.clearFilesOnExit) { try { this.store.removeFiles(); } catch { /* Preserve references if saving fails. */ } }
    this.win?.destroy(); this.win = null;
  }
}
