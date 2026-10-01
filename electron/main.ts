import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, Notification, powerMonitor, session, shell, Tray, nativeImage } from 'electron';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { autoUpdater } from 'electron-updater';
import { AppUpdates } from './updater';
import { Store } from '../modules/todo/store';
import { BaziStore } from '../modules/bazi/store';
import { MediaCaptureStore } from '../modules/media-capture/store';
import { CopyStore } from '../modules/copywriting/store';
import { BrowserGuests } from './browser-guests';
import { registerAiIpc } from './ai-ipc';
import { FloatTodoWindow, registerFloatIpc } from './float-window';

type FloatFactory = () => FloatTodoWindow;
import { registerCopyIpc } from './copy-ipc';
import { AiStore } from './ai-store';
import { AppSettingsStore } from './app-settings';
import { OfficeConverter, OFFICE_CONVERT_OPTIONS } from './office-convert';
import { registerPdfAssetHandler, registerPdfAssetScheme } from './pdf-assets';
import type { OfficeConvertErrorCode, OfficeConvertResult } from '../shared/office-contracts';

const SMOKE = process.env.WORKBENCH_SMOKE === '1';
const DEV_URL = process.env.WORKBENCH_DEV_URL ?? '';

// 自动化验收使用完整隔离的数据根目录，避免触碰真实的待办共享库。
if (process.env.WORKBENCH_TEST_DATA_DIR) {
  mkdirSync(process.env.WORKBENCH_TEST_DATA_DIR, { recursive: true });
  app.setPath('appData', process.env.WORKBENCH_TEST_DATA_DIR);
}

// 自定义资源协议必须在 ready 前注册(PDF.js cMap/标准字体/wasm 本地加载)
registerPdfAssetScheme();

app.setPath('userData', join(app.getPath('appData'), 'OnoWorkbench'));
// WORKBENCH_ISOLATED=1:以独立 userData 启动(截图/测试用,不与正在运行的实例抢单实例锁)
if (process.env.WORKBENCH_ISOLATED === '1') {
  app.setPath('userData', join(app.getPath('userData'), 'isolated'));
}

// 跨应用共享(用户决策 2026-09-23):待办数据与 To-Do-List 完全同库同表,
// 读写同一个 %APPDATA%/To-Do-List/tasks.db(WAL + busy_timeout 支持多进程并发)。
// 工作台自身的设置、缓存一律存自己的 userData,不写此库的 settings/chats 表。
const TODO_DB = join(app.getPath('appData'), 'To-Do-List', 'tasks.db');
let store: Store | null = null;
let floatTodoFactory: FloatFactory | null = null;
let aiStore: AiStore | null = null;
let settingsStore: AppSettingsStore | null = null;
let browserGuests: BrowserGuests | null = null;
let baziStore: BaziStore | null = null;
let mediaCaptureStore: MediaCaptureStore | null = null;
let copyStore: CopyStore | null = null;
let officeConverter: OfficeConverter | null = null;
let tray: Tray | null = null;
let updates: AppUpdates | null = null;
const updateTimers: NodeJS.Timeout[] = [];

let notificationBusy = false;

// 开机自启(设置页可切换;开发态注册的是 electron.exe,打包后为应用本体)
const applyLoginItem = (enabled: boolean): void => {
  if (process.env.WORKBENCH_TEST_DATA_DIR) return;
  try {
    app.setLoginItemSettings({ enabled });
  } catch {
    // 个别环境(便携版/权限受限)注册失败不阻塞启动
  }
};

if (!app.requestSingleInstanceLock()) {
  if (DEV_URL) {
    console.error('开发模式无法启动：已有工作台实例在运行。请从系统托盘退出旧实例后重试，或设置 WORKBENCH_ISOLATED=1 使用独立工作台配置与 AI 会话（待办数据库仍共享）。');
    app.exit(1);
  } else app.quit();
} else {
  let mainWindow: BrowserWindow | null = null;

  const createWindow = (): void => {
    mainWindow = new BrowserWindow({
      width: 1280,
      height: 820,
      minWidth: 1024,
      minHeight: 680,
      show: false,
      frame: false,
      backgroundColor: '#e9eaee', // 与 shell.css 默认主题 mist 的 --field-base 一致,避免启动闪色
      title: '个人工作台',
      webPreferences: {
        preload: join(__dirname, 'preload.cjs'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        webviewTag: true,
        spellcheck: false,
      },
    });

    mainWindow.once('ready-to-show', () => mainWindow?.show());
    // 内置浏览器租约:在渲染层有机会创建 webview 前装好附加审批
    browserGuests?.bind(mainWindow);
    if (DEV_URL) {
      void mainWindow.loadURL(DEV_URL);
    } else {
      const index = join(__dirname, '../dist/index.html');
      if (!existsSync(index)) {
        mainWindow.show();
        mainWindow.loadURL(
          'data:text/html;charset=utf-8,' +
            encodeURIComponent('<h2 style="font-family:sans-serif">尚未构建渲染层:请先运行 npm run build</h2>'),
        );
      } else {
        void mainWindow.loadFile(index);
      }
    }

    // 外壳为无边框自绘窗口:拦截一切外跳与嵌入式导航
    mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    mainWindow.webContents.on('will-navigate', (event, url) => {
      const allowed = DEV_URL ? url.startsWith(DEV_URL) : url.startsWith('file://');
      if (!allowed) event.preventDefault();
    });

    mainWindow.on('maximize', () => mainWindow?.webContents.send('win:maximized', true));
    mainWindow.on('unmaximize', () => mainWindow?.webContents.send('win:maximized', false));
    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  };

  const registerIpc = (): void => {
    ipcMain.on('win:minimize', (event) => {
      BrowserWindow.fromWebContents(event.sender)?.minimize();
    });
    ipcMain.on('win:maximizeToggle', (event) => {
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
      if (win.isMaximized()) win.unmaximize();
      else win.maximize();
    });
    ipcMain.on('win:close', (event) => {
      // 关闭行为由设置决定(默认与 To-Do-List 一致:隐藏到托盘,提醒继续;托盘菜单退出才结束)
      const win = BrowserWindow.fromWebContents(event.sender);
      if (!win) return;
      if (settingsStore?.read().closeAction === 'exit') {
        app.quit();
      } else {
        win.hide();
      }
    });

    // 应用设置(工作台自有存储;副作用:自启注册即时生效,关闭行为在 win:close 时读取)
    ipcMain.handle('settings:get', () => settingsStore?.read() ?? null);
    ipcMain.handle('settings:patch', (_event, input: unknown) => {
      if (typeof input !== 'object' || input === null || Array.isArray(input)) {
        throw new Error('设置更新格式不正确');
      }
      const next = settingsStore!.patch(input as Record<string, unknown>);
      if ('launchAtLogin' in (input as Record<string, unknown>)) {
        applyLoginItem(next.launchAtLogin);
      }
      return next;
    });

    // 关于页:应用元信息与数据位置(只读)
    ipcMain.handle('app:about', () => ({
      name: '个人工作台',
      version: app.getVersion(),
      electron: process.versions.electron ?? '',
      chrome: process.versions.chrome ?? '',
      userDataPath: app.getPath('userData'),
      todoDbPath: TODO_DB,
    }));
    ipcMain.handle('app:openUserDataDir', () => { void shell.openPath(app.getPath('userData')); });
    ipcMain.handle('app:openTodoDir', () => { void shell.openPath(dirname(TODO_DB)); });
    const assertUpdateSender = (event: Electron.IpcMainInvokeEvent): void => {
      if (event.sender !== mainWindow?.webContents || event.senderFrame !== mainWindow.webContents.mainFrame) {
        throw new Error('仅工作台主窗口可操作应用更新');
      }
    };
    ipcMain.handle('updater:status', event => { assertUpdateSender(event); return updates!.status(); });
    ipcMain.handle('updater:check', event => { assertUpdateSender(event); return updates!.check(); });
    ipcMain.handle('updater:install', event => { assertUpdateSender(event); updates!.install(); });
    // 外链白名单:渲染层不可打开任意 URL,仅放行小红书创作者中心发布页(发布助手用)
    ipcMain.handle('app:openExternal', (_event, url: unknown) => {
      if (typeof url !== 'string') throw new Error('链接无效');
      const target = new URL(url);
      if (target.origin !== 'https://creator.xiaohongshu.com' || !target.pathname.startsWith('/publish')) {
        throw new Error('仅允许打开小红书创作者中心发布页');
      }
      void shell.openExternal(target.href);
    });
    // 剪贴板:发布助手复制标题/正文用(经主进程,比渲染层 clipboard API 可靠)
    ipcMain.handle('clipboard:write', (_event, text: unknown) => {
      if (typeof text !== 'string' || [...text].length > 20000) throw new Error('剪贴板内容无效或超长');
      clipboard.writeText(text);
    });

    // 内置浏览器(租约模式;仅主窗口文档可申请)
    const assertMainWindow = (event: Electron.IpcMainInvokeEvent): void => {
      if (!browserGuests || event.sender !== mainWindow?.webContents) {
        throw new Error('内置浏览器:仅主窗口可使用租约');
      }
    };
    ipcMain.handle('browser:acquire', (event, workspace: unknown) => {
      assertMainWindow(event);
      return browserGuests!.acquire(event.sender, workspace);
    });
    ipcMain.handle('browser:release', (event, lease: unknown) => {
      assertMainWindow(event);
      return browserGuests!.release(event.sender, lease);
    });

    // 文档转 PDF(主进程 LibreOffice;仅主窗口可调用)
    ipcMain.handle('office:convert', (event, filename: unknown, bytes: unknown): Promise<OfficeConvertResult> => {
      if (!officeConverter || event.sender !== mainWindow?.webContents) {
        return Promise.resolve({ ok: false, code: 'unavailable' });
      }
      if (typeof filename !== 'string' || !(bytes instanceof Uint8Array)) {
        return Promise.resolve({ ok: false, code: 'unsupported-format' });
      }
      const suffix = filename.slice(filename.lastIndexOf('.') + 1).toLowerCase();
      if (suffix !== 'doc' && suffix !== 'docx' && suffix !== 'ppt' && suffix !== 'pptx') {
        return Promise.resolve({ ok: false, code: 'unsupported-format' });
      }
      return officeConverter.convert(bytes as Uint8Array<ArrayBuffer>, suffix).then(
        ({ pdf, missingFonts }) => ({ ok: true as const, pdf, missingFonts }),
        (error: unknown) => ({ ok: false as const, code: OfficeConverter.codeOf(error) as OfficeConvertErrorCode }),
      );
    });

    // 待办共享库状态(设置 → 待办与数据;只读,不写共享库任何表)
    ipcMain.handle('todo:info', () => ({
      path: TODO_DB,
      connected: !!store,
      schemaVersion: store
        ? (store.db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
        : 0,
      taskCount: store ? store.all().length : 0,
      categoryCount: store ? store.categories().length : 0,
    }));

    // 待办模块(数据层;校验在 Store 内经 Zod 执行,失败以中文错误抛回渲染层)
    if (!store) return;
    const todoState = () => ({ tasks: store!.all(), categories: store!.categories() });
    const broadcast = (): void => {
      for (const win of BrowserWindow.getAllWindows()) win.webContents.send('todo:changed');
    };
    ipcMain.handle('todo:state', () => todoState());
    ipcMain.handle('todo:create', (_event, input: unknown) => {
      store!.create(input);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:update', (_event, id: string, patch: unknown, revision: string) => {
      store!.update(id, patch, revision);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:remove', (_event, id: string, revision: string) => {
      store!.remove(id, revision);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:restore', (_event, id: string) => {
      store!.restore(id);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:snooze', (_event, id: string) => {
      store!.snooze(id);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:createCategory', (_event, input: unknown) => {
      store!.createCategory(input);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:updateCategory', (_event, id: string, input: unknown, revision: string) => {
      store!.updateCategory(id, input, revision);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:removeCategory', (_event, id: string, revision: string) => {
      store!.removeCategory(id, revision);
      const next = todoState();
      broadcast();
      return next;
    });
    ipcMain.handle('todo:review', () => store!.review());

    // 八字排盘(命例库;校验在 BaziStore 内经 Zod 执行,失败以中文错误抛回渲染层)
    if (!baziStore) return;
    ipcMain.handle('bazi:list', () => baziStore!.all());
    ipcMain.handle('bazi:saveProfile', (_event, input: unknown) => baziStore!.saveProfile(input));
    ipcMain.handle('bazi:removeProfile', (_event, id: string) => baziStore!.removeProfile(id));
    ipcMain.handle('bazi:saveNote', (_event, id: string, text: string) => baziStore!.saveNote(id, text));

    // 素材采集(自媒体浏览器;校验在 Store 内经 Zod 执行,失败以中文错误抛回渲染层)
    if (!mediaCaptureStore) return;
    ipcMain.handle('media-capture:list', () => mediaCaptureStore!.list());
    ipcMain.handle('media-capture:save', (_event, input: unknown) => mediaCaptureStore!.save(input));
    ipcMain.handle('media-capture:remove', (_event, id: string) => mediaCaptureStore!.remove(id));
  };

  void app.whenReady().then(() => {
    // 目录兜底:未装 To-Do-List 或首次运行时初始化空库(建表由 Store 构造完成)
    mkdirSync(dirname(TODO_DB), { recursive: true });
    try {
      store = new Store(TODO_DB, 'shared-tasks');
    } catch (error) {
      dialog.showErrorBox('待办共享库无法打开', error instanceof Error ? error.message : String(error));
      app.quit();
      return;
    }
    baziStore = new BaziStore(app.getPath('userData'));
    mediaCaptureStore = new MediaCaptureStore(app.getPath('userData'));
    copyStore = new CopyStore(app.getPath('userData'));
    settingsStore = new AppSettingsStore(app.getPath('userData'));
    applyLoginItem(settingsStore.read().launchAtLogin);
    browserGuests = new BrowserGuests(() => (DEV_URL || undefined));
    officeConverter = new OfficeConverter(OFFICE_CONVERT_OPTIONS);
    registerPdfAssetHandler(app.isPackaged ? join(process.resourcesPath, 'pdfjs') : join(__dirname, '../node_modules/pdfjs-dist'));
    const updateEnabled = app.isPackaged && !SMOKE && !process.env.WORKBENCH_TEST_DATA_DIR && existsSync(join(process.resourcesPath, 'app-update.yml'));
    const unavailableMessage = !app.isPackaged ? '开发模式不检查更新，请安装正式安装版。'
      : SMOKE || process.env.WORKBENCH_TEST_DATA_DIR ? '测试模式不检查自动更新。'
      : '便携版请下载新版本并替换应用。';
    updates = new AppUpdates(updateEnabled ? autoUpdater : null, unavailableMessage, status => {
      mainWindow?.webContents.send('updater:status', status);
      if (status.phase === 'ready' && Notification.isSupported()) {
        const notification = new Notification({ title: `新版本 v${status.version} 已下载`, body: '点击重启并安装，退出应用时也会安装。' });
        notification.on('click', () => updates?.install());
        notification.show();
      }
    });
    registerIpc();
    browserGuests.setImageSaver(async ({ owner, partition, mediaUrl, pageUrl }) => {
      if (!mediaCaptureStore) return;
      try {
        const res = await session.fromPartition(partition).fetch(mediaUrl);
        if (!res.ok) throw new Error(`原图下载失败 (HTTP ${res.status})`);
        const type = res.headers.get('content-type') || '';
        if (!type.startsWith('image/')) throw new Error('链接不是图片');
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 20 * 1024 * 1024) throw new Error('图片超过 20MB 上限');
        const img = nativeImage.createFromBuffer(buf);
        if (img.isEmpty()) throw new Error('无法解析的图片');
        mediaCaptureStore.save({
          url: mediaUrl,
          title: pageUrl,
          png: img.toPNG().toString('base64'),
          thumb: img.resize({ width: 320 }).toDataURL(),
        });
        owner.send('media-capture:changed', mediaCaptureStore.list());
      } catch (error) {
        const message = error instanceof Error ? error.message : '原图采集失败';
        owner.send('media-capture:failed', message);
      }
    });
    const floatTodo = new FloatTodoWindow(DEV_URL || undefined, join(__dirname, 'preload.cjs'));
    floatTodoFactory = () => floatTodo;
    registerFloatIpc(floatTodoFactory);
    aiStore = new AiStore(app.getPath('userData'));
    registerAiIpc(store, aiStore, copyStore, baziStore);
    registerCopyIpc(copyStore);
    createWindow();
    void createTray();
    startReminders();
    if (updateEnabled) {
      updateTimers.push(setTimeout(() => { void updates?.check(); }, 30000));
      updateTimers.push(setInterval(() => { void updates?.check(); }, 4 * 60 * 60 * 1000));
      updateTimers.forEach(timer => timer.unref());
    }
    if (SMOKE) {
      setTimeout(() => {
        console.log('WORKBENCH_SMOKE_OK');
        app.quit();
      }, 2500);
    }
  });

  // ---------- 提醒轮询(模式同上游 To-Do-List,认领式去重) ----------
  const tick = (): void => {
    if (!store || notificationBusy) return;
    // 设置页「待办提醒」总开关:关闭后跳过弹窗,认领留待重新开启后下一轮处理
    if (settingsStore && !settingsStore.read().remindersEnabled) return;
    const tasks = store.claimDue();
    if (!tasks.length) return;
    if (!Notification.isSupported()) {
      store.markNotified(tasks);
      return;
    }
    notificationBusy = true;
    const release = (): void => {
      notificationBusy = false;
    };
    const notification = new Notification({
      title: tasks.length === 1 ? tasks[0].title : `${tasks.length} 条待办需要处理`,
      body:
        tasks.length === 1
          ? '到提醒时间了,点击打开待办,可完成或稍后提醒。'
          : `${tasks.slice(0, 3).map((t) => t.title).join('、')}。点击查看。`,
      icon: nativeImage.createFromPath(join(__dirname, '../assets/tray.png')),
      timeoutType: 'default',
    });
    notification.once('failed', () => {
      // 认领归还,提醒不丢,下一轮重试
      if (store) for (const task of tasks) store.unclaim(task);
      release();
    });
    notification.once('click', () => {
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        if (win.isMinimized()) win.restore();
        win.show();
        win.focus();
      }
    });
    try {
      notification.show();
    } catch {
      if (store) for (const task of tasks) store.unclaim(task);
      release();
    }
    setTimeout(release, 15000).unref();
  };

  const startReminders = (): void => {
    // 与 To-Do-List 的 0 秒对齐轮询错峰 7 秒,进一步压小双弹窗口
    setTimeout(() => tick(), 7000).unref();
    setInterval(tick, 15000);
    powerMonitor.on('resume', () => tick());
  };

  // ---------- 托盘 ----------
  const createTray = async (): Promise<void> => {
    const iconPath = join(__dirname, '../assets/tray.png');
    const icon = await app.getFileIcon(process.execPath, { size: 'large' })
      .catch(() => nativeImage.createFromPath(iconPath));
    if (icon.isEmpty()) return;
    tray = new Tray(icon);
    tray.setToolTip('个人工作台 · 待办提醒运行中');
    const showApp = (): void => {
      const win = BrowserWindow.getAllWindows()[0];
      if (!win) return;
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    };
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: '打开工作台', click: showApp },
        { label: '待办悬浮窗', click: () => floatTodoFactory?.().showOrHide() },
        { label: '打开数据目录', click: () => { void shell.openPath(dirname(TODO_DB)); } },
        { type: 'separator' },
        {
          label: '退出(停止提醒)',
          click: () => {
            app.quit();
          },
        },
      ]),
    );
    tray.on('double-click', showApp);
  };

  app.on('will-quit', () => {
    updateTimers.forEach(timer => clearTimeout(timer));
    tray?.destroy();
    tray = null;
    void officeConverter?.dispose();
    officeConverter = null;
    aiStore?.close();
    aiStore = null;
    settingsStore = null;
    copyStore?.close();
    copyStore = null;
    baziStore?.close();
    baziStore = null;
    mediaCaptureStore?.close();
    mediaCaptureStore = null;
    store?.close();
    store = null;
  });

  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.on('window-all-closed', () => {
    app.quit();
  });
}
