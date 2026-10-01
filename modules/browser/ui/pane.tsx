/**
 * 通用浏览器外壳:chrome 条 + GuestFrame + 起始页(平台快捷入口),与具体业务解耦。
 * 整页「素材浏览器」与编辑器侧栏(v1b)共用本组件;采集与「AI 看这页」为可选能力。
 * 多标签:每个标签一个独立 GuestFrame;隐藏标签的 guest 保持存活(页面状态不丢)。
 */
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, LockSimple, Plus, Sparkle, X } from '@phosphor-icons/react';
import { GuestFrame } from './guest-frame';
import { WebviewPresentation } from './webview-presentation';
import './pane.css';

export interface PaneChip { name: string; url: string; dot: string; }

export interface PaneCapture {
  label: string;
  onCapture(shot: { url: string; title: string; png: string; thumb: string }): Promise<void> | void;
}

export interface PanePage { url: string; title: string; text: string; }

export interface BrowserPaneApi { loadUrl(url: string): void; }

export interface BrowserPaneProps {
  /** 存储身份:同 workspace 共享分区与登录态(持久化) */
  workspace: string;
  initialUrl?: string;
  slogan?: ReactNode;
  chips?: PaneChip[];
  /** 起始页附加内容(如最近采集列表) */
  startSlot?: ReactNode;
  capture?: PaneCapture;
  /** 提供时显示「AI 看这页」按钮,点击带上页面正文调用 */
  onAskPage?: (page: PanePage) => Promise<void> | void;
  /** 宿主可通过此引用驱动当前标签导航 */
  apiRef?: { current: BrowserPaneApi | null };
  onPending(message: string): void;
  /** 侧栏等窄容器形态:无标签条 */
  compact?: boolean;
  /** 开启多标签(整页形态) */
  tabs?: boolean;
  /** 专用后台仅展示当前地址,导航由页面和起始页入口完成。 */
  readOnlyAddress?: boolean;
}

interface PaneTab {
  id: string;
  frame: GuestFrame;
  presentation: WebviewPresentation;
}

/** guest 正文提取(AI 看这页):优先 article,退回 body,截 6000 字 */
const PAGE_TEXT_CODE = `(() => {
  const main = document.querySelector('article') || document.body;
  const t = (main && main.innerText) || '';
  return t.replace(/\\n{3,}/g, '\\n\\n').trim().slice(0, 6000);
})()`;

export function BrowserPane({
  workspace, initialUrl, slogan, chips = [], startSlot, capture, onAskPage, apiRef, onPending,
  compact = false, tabs: tabsEnabled = false, readOnlyAddress = false,
}: BrowserPaneProps) {
  const [tabs, setTabs] = useState<PaneTab[]>(() => {
    let f: GuestFrame;
    const pres = new WebviewPresentation({
      mounted: () => f.attach(),
      unmounted: () => f.detach(),
    });
    f = new GuestFrame({ workspace }, window.workbench.browser, pres);
    if (initialUrl) f.loadUrl(initialUrl);
    return [{ id: 't1', frame: f, presentation: pres }];
  });
  const [activeId, setActiveId] = useState('t1');
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];
  const state = useSyncExternalStore(active.frame.subscribe, active.frame.getSnapshot);
  const [input, setInput] = useState('');
  const [capBusy, setCapBusy] = useState(false);
  const [capDone, setCapDone] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 卸载:释放全部标签的 guest 与租约
  useEffect(() => () => {
    for (const t of tabsRef.current) void t.frame.dispose();
  }, []);

  // 地址输入跟随实际加载的 URL;用户输入中不覆盖
  useEffect(() => {
    if (state.address === 'observed' && state.target) setInput(state.target.url.replace(/^https?:\/\//, ''));
  }, [state.address, state.target?.url]);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { loadUrl: (url: string) => active.frame.loadUrl(url) };
    return () => { apiRef.current = null; };
  }, [apiRef, active?.frame]);

  const go = (raw: string): void => {
    const value = raw.trim();
    if (value === '') return;
    setInput(value.replace(/^https?:\/\//, ''));
    active.frame.loadUrl(value);
  };

  const onCaptureClick = async (): Promise<void> => {
    if (!capture || capBusy) return;
    setCapBusy(true);
    try {
      const shot = await active.frame.capturePage();
      if (!shot) { onPending('先打开一个页面,再采集'); return; }
      await capture.onCapture(shot);
      setCapDone(true);
      window.setTimeout(() => setCapDone(false), 1500);
    } finally {
      setCapBusy(false);
    }
  };

  const onAskClick = async (): Promise<void> => {
    if (!onAskPage) return;
    if (state.target === undefined) { onPending('先打开一个页面,再让 AI 看'); return; }
    const text = (await active.frame.executeJavaScript<string>(PAGE_TEXT_CODE)) ?? '';
    if (text === '') { onPending('没能读取到页面正文(该站点可能限制脚本)'); return; }
    await onAskPage({ url: state.target.url, title: state.target.title, text });
  };

  const newTab = (): void => {
    let f: GuestFrame;
    const pres = new WebviewPresentation({
      mounted: () => f.attach(),
      unmounted: () => f.detach(),
    });
    f = new GuestFrame({ workspace }, window.workbench.browser, pres);
    const tab: PaneTab = { id: `t${Date.now()}`, frame: f, presentation: pres };
    setTabs((list) => [...list, tab]);
    setActiveId(tab.id);
    setInput('');
  };

  const closeTab = (id: string): void => {
    const idx = tabs.findIndex((t) => t.id === id);
    if (idx < 0) return;
    const tab = tabs[idx];
    void tab.frame.dispose();
    const rest = tabs.filter((t) => t.id !== id);
    setTabs(rest);
    if (activeId === id) {
      const next = rest[Math.max(idx - 1, 0)] ?? rest[0];
      if (next) {
        setActiveId(next.id);
        setInput(next.frame.getSnapshot().target?.url.replace(/^https?:\/\//, '') ?? '');
      }
    }
  };

  const startVisible = state.target === undefined;

  return (
    <div className={compact ? 'mbp compact' : 'mbp'}>
      {tabsEnabled && (
        <div className="mbp-tabs" role="tablist" aria-label="浏览器标签页">
          {tabs.map((t) => {
            const title = t.frame.getSnapshot().target?.title || '新标签页';
            return (
              <div key={t.id} className={t.id === active.id ? 'mbp-tab on' : 'mbp-tab'} role="tab" aria-selected={t.id === active.id}>
                <button className="mbp-tab-btn" title={title} onClick={() => { setActiveId(t.id); setInput(t.frame.getSnapshot().target?.url.replace(/^https?:\/\//, '') ?? ''); }}>
                  <span className="mbp-tab-title">{title}</span>
                </button>
                {tabs.length > 1 && (
                  <button className="mbp-tab-x" title="关闭标签页" aria-label={`关闭 ${title}`} onClick={() => closeTab(t.id)}>
                    <X size={9} weight="bold" />
                  </button>
                )}
              </div>
            );
          })}
          <button className="mbp-tabnew" title="新标签页" onClick={newTab}><Plus size={12} weight="bold" /></button>
        </div>
      )}
      <div className="mbp-chrome">
        <button className="mbp-navbtn" title="后退" disabled={!state.canGoBack} onClick={() => active.frame.goBack()}>
          <ArrowLeft size={15} />
        </button>
        <button className="mbp-navbtn" title="前进" disabled={!state.canGoForward} onClick={() => active.frame.goForward()}>
          <ArrowRight size={15} />
        </button>
        <button className="mbp-navbtn" title="刷新" onClick={() => active.frame.reload()}>
          <ArrowClockwise size={14} />
        </button>
        <div className="mbp-addr">
          <LockSimple size={13} weight="bold" />
          <input
            ref={inputRef}
            aria-label="地址"
            placeholder="搜索或输入网址,回车打开(仅 http/https)"
            value={input}
            readOnly={readOnlyAddress}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (!readOnlyAddress && e.key === 'Enter') go(input); }}
          />
        </div>
        {onAskPage && (
          <button
            className="mbp-navbtn"
            title="AI 看这页:总结页面内容并提炼选题"
            disabled={state.target === undefined}
            onClick={() => void onAskClick()}
          >
            <Sparkle size={15} weight="fill" />
          </button>
        )}
        {capture && (
          <button
            className={capDone ? 'mbp-capbtn done' : 'mbp-capbtn'}
            disabled={capBusy}
            onClick={() => void onCaptureClick()}
          >
            {capDone ? <>已采集 ✓</> : <><Plus size={13} weight="bold" />{capture.label}</>}
          </button>
        )}
      </div>
      <div className="mbp-stage">
        {state.loading && <div className="mbp-progress" aria-hidden="true" />}
        {state.error && (
          <div className="mbp-error" role="alert">
            页面加载失败{state.error.code !== undefined ? `(错误 ${state.error.code})` : ''}:{state.error.description || '请检查网络或稍后重试'}
          </div>
        )}
        <div className="mbp-hosts" style={{ position: 'absolute', inset: 0 }}>
          {tabs.map((t) => (
            <TabHost key={t.id} tab={t} active={t.id === active.id} />
          ))}
        </div>
        {startVisible && (
          <div className="mbp-start">
            <div className="mbp-biglogo" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="8.2" /><ellipse cx="12" cy="12" rx="3.6" ry="8.2" />
                <path d="M4.4 9.4h15.2M4.4 14.6h15.2" />
              </svg>
            </div>
            <div className="mbp-slogan">{slogan ?? '逛平台、找选题,看到即采集'}</div>
            <div className="mbp-chips">
              {chips.map((c) => (
                <button key={c.url} className="mbp-chip" onClick={() => go(c.url)}>
                  <span className="mbp-pdot" style={{ background: c.dot }} />
                  {c.name}
                </button>
              ))}
            </div>
            {startSlot}
          </div>
        )}
      </div>
    </div>
  );
}

/** 单个标签的 guest 宿主:保持挂载使页面状态存活,非活动标签仅隐藏。 */
function TabHost({ tab, active }: { tab: PaneTab; active: boolean }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    return tab.presentation.mount(el);
  }, [tab.presentation]);
  return <div ref={ref} className="mbp-host" style={{ display: active ? 'block' : 'none' }} />;
}
