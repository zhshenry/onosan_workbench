// 内置浏览器租约契约(主进程 ↔ 渲染层共享)。模式移植自 DSH webview 租约:渲染层不自行创建
// webview,每次先向主进程申请一次性租约,主进程在 will-attach-webview 校验并强制安全配置。

/** 一次性租约 id(主进程签发,仅可用于一次 webview 附加,绑定签发窗口) */
export type BrowserLeaseId = string;

/** 主进程批准的租约与对应存储分区 */
export interface BrowserReservation {
  lease: BrowserLeaseId;
  partition: string;
}

/** guest 内弹窗转交请求(原生窗口一律拒绝,由渲染层自行开新标签/处理) */
export interface BrowserOpenRequest {
  lease: BrowserLeaseId;
  url: string;
}

/** 渲染层可用的租约操作(不暴露 IPC 与 Electron 对象) */
export interface BrowserBridge {
  acquire(workspace: string): Promise<BrowserReservation>;
  release(lease: BrowserLeaseId): Promise<void>;
  onOpenRequested(lease: BrowserLeaseId, listener: (url: string) => void): () => void;
}

/** 观察到的页面状态(载体中立,UI 直接消费) */
export interface BrowserFrameState {
  target: { url: string; title: string } | undefined;
  address: 'requested' | 'observed';
  loading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  error: { code?: number; description?: string } | undefined;
}

export const emptyBrowserFrame = (): BrowserFrameState => ({
  target: undefined,
  address: 'requested',
  loading: false,
  canGoBack: false,
  canGoForward: false,
  error: undefined,
});

/** 缺省存储身份:同一身份的分区进程内复用,cookie/登录态跨标签共享,进程退出即消失 */
export const DEFAULT_BROWSER_WORKSPACE = 'default';
