/**
 * webview 标签的 DOM 载体:负责标签创建与附加,不测量、不跟随其它元素。
 * 移植自 DSH ElectronWebviewPresentation,挂载入口改为直接传容器元素(便于 React 使用)。
 */
import type { BrowserReservation } from '../../../shared/browser-contracts';

/** Electron NativeImage 的最小结构面(截图用)。 */
export interface WebviewNativeImage {
  toPNG(): Uint8Array;
  toDataURL(): string;
  resize(options: { width: number }): WebviewNativeImage;
}

/** Electron webview 标签的导航 API。 */
export interface WebviewElement extends HTMLElement {
  loadURL(url: string): Promise<void>;
  getURL(): string;
  getTitle(): string;
  canGoBack(): boolean;
  canGoForward(): boolean;
  clearHistory(): void;
  goBack(): void;
  goForward(): void;
  reload(): void;
  isLoading(): boolean;
  /** 整页截图(采集用)。 */
  capturePage(): Promise<WebviewNativeImage>;
  /** 在 guest 主文档执行脚本(AI 读取正文用);结果 JSON 可序列化。 */
  executeJavaScript<T>(code: string, userGesture?: boolean): Promise<T>;
}

/** 物理附加通知;普通隐藏(保留 DOM)不触发。 */
export interface PresentationEvents {
  readonly mounted: () => void;
  readonly unmounted: () => void;
}

export class WebviewPresentation {
  private element: WebviewElement | undefined;
  private host: HTMLElement | undefined;

  constructor(private readonly events: PresentationEvents) {}

  /** 绑定内容容器;返回解绑函数。 */
  mount(host: HTMLElement): () => void {
    if (this.host !== undefined && this.host !== host) this.events.unmounted();
    this.host = host;
    this.events.mounted();
    return () => {
      if (this.host !== host) return;
      this.events.unmounted();
      this.host = undefined;
    };
  }

  /** 为已批准的租约创建离线 webview(lease 编码在惰性 about:blank 的 fragment 里)。 */
  createElement(reservation: BrowserReservation): WebviewElement {
    const element = document.createElement('webview') as WebviewElement;
    element.style.cssText = 'display:flex;width:100%;height:100%;border:0;background:#fff';
    element.setAttribute('partition', reservation.partition);
    element.setAttribute('allowpopups', '');
    element.setAttribute('src', 'about:blank#' + reservation.lease);
    return element;
  }

  /** 附加已备好的 guest,替换容器里上一个 guest 的 DOM。 */
  present(element: WebviewElement): void {
    if (this.host === undefined) throw new Error('内置浏览器:内容容器未挂载');
    this.clear();
    this.element = element;
    this.host.append(element);
  }

  /** 设置 guest 元素的可访问标签(观察到的文档标题)。 */
  show(title: string): void {
    this.element?.setAttribute('aria-label', title);
  }

  /** 只销毁 guest DOM;替换者可复用同一容器。 */
  clear(): void {
    this.element?.remove();
    this.element = undefined;
  }

  /** 销毁 guest DOM 并释放内容容器。 */
  dispose(): void {
    this.clear();
    this.host = undefined;
  }
}
