/**
 * 内置浏览器:主进程持有 guest 的附加审批与固定隔离策略。
 * 逐行移植自 DSH apps/desktop/src/browser-guests.ts(webview 租约模式),仅改名与中文注释。
 */
import { randomUUID } from 'node:crypto';
import { app, session, type BrowserWindow, type Session, type WebContents } from 'electron';
import type { BrowserLeaseId, BrowserOpenRequest, BrowserReservation } from '../shared/browser-contracts';

interface GuestLease {
  readonly owner: WebContents;
  readonly partition: string;
  attached: boolean;
  guest?: WebContents;
}

/** 存储分区独立于单个 guest 存活:进程生命周期内复用,同一 workspace 的标签共享登录态。 */
export class BrowserGuests {
  private readonly partitions = new Map<string, string>();
  private readonly leases = new Map<BrowserLeaseId, GuestLease>();

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
      partition = `workbench-browser-${randomUUID()}`;
      this.configureSession(session.fromPartition(partition));
      this.partitions.set(workspace, partition);
    }
    const lease = randomUUID();
    this.leases.set(lease, { owner, partition, attached: false });
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
          this.allowedNavigation(url)
        ) {
          const request: BrowserOpenRequest = { lease: attachedLease, url: new URL(url).href };
          owner.send('browser:open-requested', request);
        }
        return { action: 'deny' };
      });
      guest.on('will-frame-navigate', (event) => {
        if (event.isMainFrame && !this.allowedNavigation(event.url)) event.preventDefault();
      });
      guest.on('will-redirect', (event, url, _inPlace, mainFrame) => {
        if (mainFrame && !this.allowedNavigation(url)) event.preventDefault();
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
  private configureSession(browserSession: Session): void {
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
        cancel: network
          ? url.username !== '' || url.password !== '' || this.isApplicationHost(url)
          : !['about:', 'data:', 'blob:'].includes(url.protocol),
      });
    });
  }

  /** 导航白名单:仅无内嵌凭据的 http/https,且拒绝应用自身地址。 */
  private allowedNavigation(value: string): boolean {
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
