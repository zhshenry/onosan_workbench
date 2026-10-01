/**
 * Electron 导航与 guest 生命周期,与 DOM 摆放无关。
 * 移植自 DSH ElectronWebViewImpl:去掉 SnapshotStore/持久化/workspace 解析器(DSH 特有),
 * 状态改为轻量订阅快照,workspace 由选项给定(缺省单一身份);租约流程逐行保留。
 */
import {
  DEFAULT_BROWSER_WORKSPACE,
  emptyBrowserFrame,
  type BrowserBridge,
  type BrowserFrameState,
  type BrowserLeaseId,
} from '../../../shared/browser-contracts';
import type { WebviewElement, WebviewPresentation } from './webview-presentation';

interface NavigationEvent extends Event {
  readonly isMainFrame: boolean;
}
interface LoadFailureEvent extends NavigationEvent {
  readonly errorCode: number;
  readonly errorDescription: string;
}

export interface GuestFrameOptions {
  /** 初始地址;不传则等 loadUrl。 */
  initialUrl?: string;
  /** guest 内弹窗转交(主进程已校验为目标地址)。 */
  openRequested?: (url: string) => void;
  /** 存储身份;同一身份共享分区与登录态。 */
  workspace?: string;
}

/** 输入地址归一化:无协议时按 https 补全;无法识别返回 undefined。 */
const normalizeAddress = (input: string): string | undefined => {
  const value = input.trim();
  if (value === '') return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  return URL.canParse(`https://${value}`) ? `https://${value}` : undefined;
};

export class GuestFrame {
  private state: BrowserFrameState;
  private readonly listeners = new Set<() => void>();
  private readonly lifetime = new AbortController();
  private guestLifetime: AbortController | undefined;
  private element: WebviewElement | undefined;
  private lease: BrowserLeaseId | undefined;
  private readonly workspaceKey: string;
  private initializing: Promise<void> | undefined;
  private ready = false;
  private pending: string | undefined;
  private revision = 0;
  private firstDocument = true;
  private disposal: Promise<void> | undefined;
  private attachment: AbortController | undefined;
  private readonly releases = new Set<Promise<void>>();

  constructor(
    private readonly options: GuestFrameOptions,
    private readonly bridge: BrowserBridge,
    private readonly presentation: WebviewPresentation,
  ) {
    this.workspaceKey = options.workspace ?? DEFAULT_BROWSER_WORKSPACE;
    this.state = emptyBrowserFrame();
    if (options.initialUrl !== undefined) this.pending = options.initialUrl;
  }

  getSnapshot = (): BrowserFrameState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(): void {
    for (const listener of [...this.listeners]) listener();
  }

  private set(patch: Partial<BrowserFrameState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  /** 物理挂载(重建丢失的 guest);普通隐藏不会调用。 */
  attach(): void {
    if (this.lifetime.signal.aborted) return;
    this.attachment = new AbortController();
    this.pending ??= this.state.target?.url;
    if (this.pending !== undefined) {
      this.set({ address: 'requested', loading: true, canGoBack: false, canGoForward: false, error: undefined });
      this.initialize();
    }
  }

  /** 容器 DOM 即将移除:作废未完成的附加并释放 guest。 */
  detach(): void {
    this.attachment?.abort();
    this.attachment = undefined;
    this.pending = this.state.target?.url;
    void this.dropGuest();
  }

  /** @param input - 用户输入地址,加载而不替换 guest。 */
  loadUrl(input: string): void {
    if (this.lifetime.signal.aborted) return;
    const url = normalizeAddress(input);
    if (url === undefined) {
      this.set({ loading: false, error: { description: '无法识别的地址' } });
      return;
    }
    const current = this.state;
    if (this.ready && current.address === 'observed' && current.target?.url === url) {
      this.reload();
      return;
    }
    this.revision++;
    this.pending = url;
    this.set({ target: { url, title: '' }, address: 'requested', loading: true, error: undefined });
    if (this.ready) this.loadPending();
    else this.initialize();
  }

  goBack(): void {
    if (this.state.canGoBack) this.navigate('goBack');
  }

  goForward(): void {
    if (this.state.canGoForward) this.navigate('goForward');
  }

  /** 重载当前页,或重试失败的 guest 创建。 */
  reload(): void {
    const current = this.state;
    if (this.lifetime.signal.aborted || current.target === undefined) return;
    if (!this.ready || current.error !== undefined) {
      this.revision++;
      this.pending = current.target.url;
      this.set({ loading: true, error: undefined });
      if (this.ready) this.loadPending();
      else this.initialize();
    } else this.navigate('reload');
  }

  /** 整页截图(采集用);guest 未就绪或无已加载页面时返回 null。 */
  async capturePage(): Promise<{ url: string; title: string; png: string; thumb: string } | null> {
    const current = this.state;
    if (!this.ready || this.element === undefined || current.target === undefined || current.error !== undefined) {
      return null;
    }
    try {
      const image = await this.element.capturePage();
      const bytes = image.toPNG();
      let binary = '';
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      return {
        url: current.target.url,
        title: current.target.title,
        png: btoa(binary),
        thumb: image.resize({ width: 320 }).toDataURL(),
      };
    } catch (error) {
      console.error('内置浏览器截图失败', error);
      return null;
    }
  }

  /** 在 guest 主文档执行脚本(AI 读取正文用);未就绪或执行失败返回 null。 */
  async executeJavaScript<T>(code: string): Promise<T | null> {
    if (!this.ready || this.element === undefined) return null;
    try {
      return (await this.element.executeJavaScript<T>(code, false)) ?? null;
    } catch (error) {
      console.error('内置浏览器脚本执行失败', error);
      return null;
    }
  }

  /** @returns 待完成的初始化与持有的 guest 全部释放后 resolve。 */
  dispose(): Promise<void> {
    if (this.disposal !== undefined) return this.disposal;
    this.lifetime.abort();
    this.pending = undefined;
    this.disposal = Promise.all([this.dropGuest(), this.initializing])
      .then(() => Promise.all(this.releases))
      .then(() => {});
    this.presentation.dispose();
    return this.disposal;
  }

  private navigate(command: 'goBack' | 'goForward' | 'reload'): void {
    if (this.lifetime.signal.aborted || !this.ready || this.element === undefined) return;
    this.revision++;
    this.pending = undefined;
    this.set({ loading: true, error: undefined });
    try {
      this.element[command]();
    } catch (error) {
      this.commandFailed(error);
    }
  }

  private initialize(): void {
    const attachment = this.attachment;
    if (attachment === undefined || this.initializing !== undefined || this.element !== undefined || this.lifetime.signal.aborted) return;
    const signal = AbortSignal.any([this.lifetime.signal, attachment.signal]);
    this.initializing = this.createGuest(signal)
      .catch(async (error: unknown) => {
        await this.dropGuest();
        if (!signal.aborted) this.commandFailed(error);
      })
      .finally(() => {
        this.initializing = undefined;
        if (this.attachment !== attachment && this.pending !== undefined) this.initialize();
      });
  }

  private async createGuest(attachmentSignal: AbortSignal): Promise<void> {
    const reservation = await this.bridge.acquire(this.workspaceKey);
    // 信号可能在 acquire 挂起期间中止
    if (attachmentSignal.aborted) {
      await this.release(reservation.lease);
      return;
    }
    this.lease = reservation.lease;
    this.guestLifetime = new AbortController();
    const signal = AbortSignal.any([attachmentSignal, this.guestLifetime.signal]);
    const element = this.presentation.createElement(reservation);
    this.element = element;
    const unsubscribeOpen = this.bridge.onOpenRequested(reservation.lease, (url) => {
      if (this.element === element && !signal.aborted) this.options.openRequested?.(url);
    });
    signal.addEventListener('abort', unsubscribeOpen, { once: true });
    element.addEventListener(
      'dom-ready',
      () => {
        this.ready = true;
        this.observe(this.state.address !== 'requested');
        this.loadPending();
      },
      { signal },
    );
    element.addEventListener('did-navigate', () => this.observe(true), { signal });
    element.addEventListener(
      'did-navigate-in-page',
      (event) => {
        if ((event as NavigationEvent).isMainFrame) this.observe(true);
      },
      { signal },
    );
    element.addEventListener(
      'did-start-navigation',
      (event) => {
        if ((event as NavigationEvent).isMainFrame) this.set({ loading: true, error: undefined });
      },
      { signal },
    );
    for (const name of ['did-start-loading', 'did-stop-loading', 'page-title-updated']) {
      element.addEventListener(
        name,
        () => {
          this.observe(name === 'page-title-updated' && this.state.address === 'observed');
        },
        { signal },
      );
    }
    element.addEventListener(
      'did-fail-load',
      (event) => {
        const failure = event as LoadFailureEvent;
        // -3 = ERR_ABORTED(导航被新的导航取代,不是失败)
        if (failure.isMainFrame && failure.errorCode !== -3) {
          this.failed({ code: failure.errorCode, description: failure.errorDescription });
        }
      },
      { signal },
    );
    for (const name of ['render-process-gone', 'destroyed']) {
      element.addEventListener(
        name,
        () => {
          void this.dropGuest();
          this.failed();
        },
        { signal },
      );
    }
    this.presentation.present(element);
  }

  private loadPending(): void {
    const target = this.pending;
    const element = this.element;
    if (!this.ready || target === undefined || element === undefined) return;
    const revision = this.revision;
    this.pending = undefined;
    void element.loadURL(target).catch((error: unknown) => {
      if (this.element !== element || this.lifetime.signal.aborted || this.revision !== revision) return;
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_ABORTED') return;
      if (this.state.error === undefined) this.commandFailed(error);
    });
  }

  private observe(committed: boolean): void {
    if (!this.ready || this.element === undefined || this.lifetime.signal.aborted) return;
    try {
      this.observeReady(this.element, committed);
    } catch (error) {
      this.commandFailed(error);
    }
  }

  private observeReady(element: WebviewElement, committed: boolean): void {
    const current = this.state;
    const url = committed ? element.getURL() : '';
    const observed = committed && /^https?:\/\//i.test(url);
    if (observed && this.firstDocument) {
      // 携带租约的引导文档不作为用户历史入口
      element.clearHistory();
      this.firstDocument = false;
    }
    let target = current.target;
    let address = current.address;
    if (observed) {
      target = { url, title: element.getTitle() || target?.url || url };
      address = 'observed';
      this.presentation.show(target.title);
    }
    const loading = current.error === undefined && element.isLoading();
    const canGoBack = element.canGoBack();
    const canGoForward = element.canGoForward();
    if (
      target?.url !== current.target?.url ||
      target?.title !== current.target?.title ||
      address !== current.address ||
      loading !== current.loading ||
      canGoBack !== current.canGoBack ||
      canGoForward !== current.canGoForward
    ) {
      this.set({ target, address, loading, canGoBack, canGoForward });
    }
  }

  private failed(error: BrowserFrameState['error'] = { code: undefined, description: undefined }): void {
    if (this.lifetime.signal.aborted) return;
    const current = this.state;
    this.set({
      loading: false,
      error,
      canGoBack: this.ready && current.canGoBack,
      canGoForward: this.ready && current.canGoForward,
    });
  }

  private commandFailed(error: unknown): void {
    console.error('内置浏览器操作失败', error);
    this.failed();
  }

  private dropGuest(): Promise<void> {
    this.guestLifetime?.abort();
    this.guestLifetime = undefined;
    this.presentation.clear();
    this.element = undefined;
    this.ready = false;
    this.firstDocument = true;
    const lease = this.lease;
    this.lease = undefined;
    return lease === undefined ? Promise.resolve() : this.release(lease);
  }

  private release(lease: BrowserLeaseId): Promise<void> {
    const released = this.bridge
      .release(lease)
      .catch((error: unknown) => {
        console.error('内置浏览器租约释放失败', error);
      })
      .finally(() => {
        this.releases.delete(released);
      });
    this.releases.add(released);
    return released;
  }
}
