/**
 * 内置浏览器:主进程持有 guest 的附加审批与固定隔离策略。
 * 逐行移植自 DSH apps/desktop/src/browser-guests.ts(webview 租约模式),仅改名与中文注释。
 */
import { randomUUID } from 'node:crypto';
import { app, BrowserWindow, Menu, session, type Session, type WebContents } from 'electron';
import {
  XHS_CREATOR_WORKSPACE, isXhsCreatorNavigation,
  type BrowserLeaseId, type BrowserOpenRequest, type BrowserReservation,
} from '../shared/browser-contracts';

interface GuestLease {
  readonly owner: WebContents;
  readonly partition: string;
  readonly workspace: string;
  attached: boolean;
  guest?: WebContents;
}

/** 原图采集上下文:guest 内右键图片时由宿主决定抓取与落库。 */
export interface ImageSaveContext {
  readonly owner: WebContents;
  readonly partition: string;
  readonly mediaUrl: string;
  readonly pageUrl: string;
}

/** 存储分区按 workspace 确定性命名(persist: 前缀落盘):同一 workspace 的标签共享登录态,重启保留。 */
export class BrowserGuests {
  private readonly partitions = new Map<string, string>();
  private readonly leases = new Map<BrowserLeaseId, GuestLease>();
  private imageSaver: ((ctx: ImageSaveContext) => void | Promise<void>) | undefined;

  /** 注入原图采集实现(主进程受控抓取,不放宽下载禁令);不注入则右键菜单不出现。 */
  setImageSaver(fn: (ctx: ImageSaveContext) => void | Promise<void>): void {
    this.imageSaver = fn;
  }

  /** @param hostUrl - 应用自身地址(开发服务器);guest 不允许请求它。 */
  constructor(private readonly hostUrl: () => string | undefined) {}

  /**
   * 在 workspace 的进程级分区里预留一个 guest。
   * @param owner - 主应用文档的 WebContents(IPC 发起方)。
   * @param workspace - 经 IPC 到达的存储身份。
   * @returns 不透明租约与批准给它的分区。
   */
  acquire(owner: WebContents, workspace: unknown): BrowserReservation {
    if (typeof workspace !== 'string' || workspace.length === 0 || workspace.length > 4096) {
      throw new Error('内置浏览器:缺少 workspace 存储标识');
    }
    let partition = this.partitions.get(workspace);
    if (partition === undefined) {
      // 确定性持久分区:同 workspace 重启后仍拿回同一存储(cookie/登录态保留)。
      // 仅保留安全字符,避免 workspace 拼接出路径歧义。
      const safe = workspace.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64) || 'default';
      partition = `persist:wb-browser-${safe}`;
      this.configureSession(session.fromPartition(partition), workspace);
      this.partitions.set(workspace, partition);
    }
    const lease = randomUUID();
    this.leases.set(lease, { owner, partition, workspace, attached: false });
    return { lease, partition };
  }

  /**
   * 仅释放签发给该窗口的租约;workspace 存储(cookie/存储)保留。
   * @param owner - IPC 发起方。
   * @param id - 经 IPC 到达的租约。
   */
  async release(owner: WebContents, id: unknown): Promise<void> {
    if (typeof id !== 'string') throw new Error('内置浏览器:无效租约');
    const lease = this.leases.get(id);
    if (lease === undefined) return;
    if (lease.owner !== owner) throw new Error('内置浏览器:租约属于其它窗口');
    this.leases.delete(id);
    const guest = lease.guest;
    if (guest !== undefined && !guest.isDestroyed()) {
      const destroyed = new Promise<void>((resolve) => {
        guest.once('destroyed', resolve);
      });
      guest.close({ waitForBeforeUnload: false });
      await destroyed;
    }
  }

  /**
   * 在应用文档能创建 webview 之前安装附加检查。
   * @param window - 主应用窗口。
   */
  bind(window: BrowserWindow): void {
    const owner = window.webContents;
    owner.on('will-attach-webview', (event, preferences, params) => {
      const id =
        typeof params.src === 'string' && params.src.startsWith('about:blank#')
          ? params.src.slice('about:blank#'.length)
          : '';
      const lease = this.leases.get(id);
      if (lease === undefined || lease.owner !== owner || lease.attached || params.partition !== lease.partition) {
        event.preventDefault();
        return;
      }
      lease.attached = true;
      // 保留 Electron 的 allowpopups 派发位;guest 侧的 setWindowOpenHandler 仍会拒绝原生窗口。
      for (const key of Object.keys(preferences)) {
        if (key !== 'disablePopups') Reflect.deleteProperty(preferences, key);
      }
      Object.assign(preferences, {
        partition: lease.partition,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        nodeIntegrationInSubFrames: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
        plugins: false,
        navigateOnDragDrop: false,
        disableDialogs: true,
        devTools: !app.isPackaged,
      });
      params.httpreferrer = '';
    });
    owner.on('did-attach-webview', (_event, guest) => {
      let attachedLease: BrowserLeaseId | undefined;
      // 首个文档是携带租约的惰性 about:blank。
      // 在主进程事件上绑定(先于渲染层能导航就绪的 guest)再验一次租约。
      guest.once('dom-ready', () => {
        const url = guest.getURL();
        const id = url.startsWith('about:blank#') ? url.slice('about:blank#'.length) : '';
        const lease = this.leases.get(id);
        if (lease === undefined || lease.owner !== owner || lease.guest !== undefined) {
          guest.close({ waitForBeforeUnload: false });
          return;
        }
        lease.guest = guest;
        attachedLease = id;
        guest.once('destroyed', () => {
          this.leases.delete(id);
        });
      });
      guest.setWindowOpenHandler(({ url, postBody }) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease);
        if (
          attachedLease !== undefined &&
          lease?.guest === guest &&
          lease.owner === owner &&
          !owner.isDestroyed() &&
          postBody === undefined &&
          this.allowedNavigation(url, lease.workspace)
        ) {
          const request: BrowserOpenRequest = { lease: attachedLease, url: new URL(url).href };
          owner.send('browser:open-requested', request);
        }
        return { action: 'deny' };
      });
      // 右键图片 → 弹「采集原图到素材库」菜单;抓取由注入的 imageSaver 在主进程完成。
      guest.on('context-menu', (_event, params) => {
        if (params.mediaType !== 'image' || this.imageSaver === undefined) return;
        const mediaUrl = params.srcURL;
        if (typeof mediaUrl !== 'string' || !this.allowedNavigation(mediaUrl)) return;
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease);
        if (lease === undefined || lease.guest !== guest || lease.workspace === XHS_CREATOR_WORKSPACE) return;
        const win = BrowserWindow.fromWebContents(owner);
        if (!win) return;
        Menu.buildFromTemplate([{
          label: '采集原图到素材库',
          click: () => {
            void this.imageSaver?.({ owner, partition: lease.partition, mediaUrl, pageUrl: params.pageURL });
          },
        }]).popup({ window: win });
      });
      guest.on('will-frame-navigate', (event) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease);
        if (event.isMainFrame && !this.allowedNavigation(event.url, lease?.workspace)) event.preventDefault();
      });
      guest.on('will-redirect', (event, url, _inPlace, mainFrame) => {
        const lease = attachedLease === undefined ? undefined : this.leases.get(attachedLease);
        if (mainFrame && !this.allowedNavigation(url, lease?.workspace)) event.preventDefault();
      });
      guest.on('will-attach-webview', (event) => {
        event.preventDefault();
      });
      guest.on('login', (event, _details, _authInfo, callback) => {
        event.preventDefault();
        callback();
      });
    });
    const releaseAll = (): void => {
      for (const [id, lease] of this.leases) {
        if (lease.owner === owner) {
          void this.release(owner, id).catch((error: unknown) => {
            console.error(error);
          });
        }
      }
    };
    owner.on('did-start-navigation', (_event, _url, inPlace, mainFrame) => {
      if (mainFrame && !inPlace) releaseAll();
    });
    owner.on('render-process-gone', releaseAll);
    owner.once('destroyed', releaseAll);
  }

  /** 会话级封锁:权限/下载/非 http(s) 请求与带凭据 URL 一律拒绝。 */
  private configureSession(browserSession: Session, workspace: string): void {
    browserSession.setPermissionRequestHandler((_contents, _permission, callback) => {
      callback(false);
    });
    browserSession.setPermissionCheckHandler(() => false);
    browserSession.setDevicePermissionHandler(() => false);
    browserSession.setDisplayMediaRequestHandler((_request, callback) => {
      callback({});
    });
    browserSession.on('will-download', (event) => {
      event.preventDefault();
    });
    browserSession.webRequest.onBeforeRequest((details, callback) => {
      const url = new URL(details.url);
      const network = ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol);
      callback({
        cancel: (workspace === XHS_CREATOR_WORKSPACE && details.resourceType === 'mainFrame' &&
          !isXhsCreatorNavigation(details.url)) ||
          (network
            ? url.username !== '' || url.password !== '' || this.isApplicationHost(url)
            : !['about:', 'data:', 'blob:'].includes(url.protocol)),
      });
    });
  }

  /** 导航白名单:仅无内嵌凭据的 http/https,且拒绝应用自身地址。 */
  private allowedNavigation(value: string, workspace?: string): boolean {
    if (workspace === XHS_CREATOR_WORKSPACE) return isXhsCreatorNavigation(value);
    if (!URL.canParse(value)) return false;
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      url.username === '' &&
      url.password === '' &&
      !this.isApplicationHost(url)
    );
  }

  private isApplicationHost(url: URL): boolean {
    const value = this.hostUrl();
    if (value === undefined) return false;
    const host = new URL(value);
    return (
      url.port === host.port &&
      (url.hostname === host.hostname || ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
    );
  }
}
