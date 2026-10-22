import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, Camera, CheckCircle, Circle, ClipboardText, CornersIn, CornersOut, FileText, FolderOpen, GearSix, Globe, Play, Stop, TerminalWindow, WarningCircle } from '@phosphor-icons/react';
import { emptyBrowserFrame } from '../../shared/browser-contracts';
import type { HushHourArtifact, HushHourEnvironment, HushHourState } from '../../shared/hush-hour-contracts';
import { PageZoomControls } from '../../modules/browser/ui/page-zoom';
import { Modal, Select as WebsiteSelect, Segmented, errorText } from '../ui/controls';
import { GamePreview as ProjectPreview, type PreviewApi } from './GameView';
import { GameOptionsMenu } from './GameOptionsMenu';
import { GameTerminalPanel } from './GameTerminal';
import { GameDocument } from './GameDocument';
import { GameOnlineAddress } from './GameOnlineTools';
import { HushHourIssueDrawer } from './HushHourIssueDrawer';
import './hush-hour.css';

const api = () => window.workbench.hushHour;
export function HushHourView({ active, onPending }: { active: boolean; onPending(message: string): void }) {
  const [state, setState] = useState<HushHourState>();
  const [failure, setFailure] = useState(''), [busy, setBusy] = useState(false);
  const [localFailure, setLocalFailure] = useState('');
  const [localBrowser, setBrowser] = useState(emptyBrowserFrame), [viewport, setViewport] = useState('fit');
  const [environment, setEnvironment] = useState<HushHourEnvironment>('local'), [onlineEntered, setOnlineEntered] = useState(false), [onlineSettings, setOnlineSettings] = useState(false);
  const [onlineBrowser, setOnlineBrowser] = useState(emptyBrowserFrame), [onlineViewport, setOnlineViewport] = useState('fit');
  const [loadedRevision, setLoadedRevision] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(false), [terminalEntered, setTerminalEntered] = useState(false);
  const [expanded, setExpanded] = useState(false), [documentOpen, setDocumentOpen] = useState(false), [logsOpen, setLogsOpen] = useState(false), [issueOpen, setIssueOpen] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const tabId = `hush-hour-${sessionId}`, onlineTabId = `hush-hour-online-${sessionId}`;
  const localPreview = useRef<PreviewApi>(null), onlinePreview = useRef<PreviewApi>(null), expandButton = useRef<HTMLButtonElement>(null), restoreButton = useRef<HTMLButtonElement>(null), terminalToggle = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let current = true;
    const off = api().onChanged(value => { if (current) { setState(value); if (value.service.phase === 'running' || value.build.phase === 'running') setLocalFailure(''); } });
    void api().open().then(value => { if (current) { setState(value); setLoadedRevision(value.buildRevision); } }, error => { if (current) setLocalFailure(errorText(error)); });
    return () => { current = false; off(); };
  }, []);
  useLayoutEffect(() => { if (active && expanded) restoreButton.current?.focus({ preventScroll: true }); }, [active, expanded]);
  useEffect(() => { if (!active) setOnlineSettings(false); }, [active]);
  async function act<T,>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setFailure('');
    try { return await action(); } catch (error) { setFailure(errorText(error)); return undefined; } finally { setBusy(false); }
  }
  const running = state?.service.phase === 'running', building = state?.build.phase === 'running';
  const pending = busy || building || state?.service.phase === 'starting';
  const isOnline = environment === 'online', preview = isOnline ? onlinePreview : localPreview, browser = isOnline ? onlineBrowser : localBrowser;
  const siteUrl = isOnline ? state?.online.url || '' : state?.service.url || '', hasPreview = isOnline ? !!siteUrl : running;
  const currentViewport = isOnline ? onlineViewport : viewport, currentTabId = isOnline ? onlineTabId : tabId;
  const previewBusy = busy || !isOnline && building;
  const ready = !!hasPreview && !!browser.target && !browser.loading && !browser.error;
  const needsRefresh = !isOnline && !!state?.buildRevision && !!loadedRevision && loadedRevision !== state.buildRevision;
  const buildFailed = state?.build.phase === 'failed';
  const error = building ? '' : failure || (buildFailed ? state.build.message : '') || (!isOnline ? state?.sourceError || (!running ? localFailure || (state?.service.phase === 'error' ? state.service.message : '') : '') : '');
  const statusPhase = building ? 'building' : error ? 'failed' : state?.sourceChanged || needsRefresh ? 'pending' : state?.buildRevision ? 'synced' : 'idle';
  const statusLabel = building ? '正在构建…' : error ? failure ? '操作失败' : buildFailed ? '构建失败' : state?.sourceError ? '项目读取失败' : '本地启动失败'
    : state?.sourceChanged ? '有更新，待构建' : needsRefresh ? '有新构建，待刷新' : state?.buildRevision ? '已同步' : state?.service.message || '正在读取项目…';
  const refresh = () => { preview.current?.reload(); if (!isOnline) setLoadedRevision(state?.buildRevision ?? ''); };
  async function build() {
    setLocalFailure('');
    const next = await act(() => api().build());
    if (next) {
      setState(next);
      if (next.build.phase === 'passed' && next.service.phase === 'running') { setLoadedRevision(next.buildRevision); requestAnimationFrame(() => localPreview.current?.reload()); onPending(isOnline ? 'Hush-Hour 本地构建已完成。' : 'Hush-Hour 已构建并刷新。'); }
      else onPending(next.build.message);
    }
  }
  async function start(restart = false) {
    setLocalFailure('');
    const next = await act(() => restart ? api().restart() : api().open());
    if (next) { setState(next); setLoadedRevision(next.buildRevision); if (restart) requestAnimationFrame(() => localPreview.current?.reload()); }
  }
  async function capture(): Promise<HushHourArtifact | undefined> {
    if (!ready) return;
    const image = await act(() => api().capture({ tabId: currentTabId, revision: isOnline ? '' : loadedRevision }));
    if (!image && issueOpen) throw new Error('截图未保存，请确认当前网页已加载后重试。');
    if (image) onPending('Hush-Hour 截图已保存，可在问题记录中附带。');
    return image;
  }
  return <section className="view on media-browser-view game-workspace hush-hour-workspace" id="view-hush-hour" aria-label="Hush-Hour 项目工作区" data-expanded={expanded}>
    {expanded ? <header className="game-expanded-bar">
      <div className="game-expanded-identity"><Globe /><strong>Hush-Hour</strong><span className="game-expanded-environment" data-environment={environment}><Circle weight="fill" size={8} />{isOnline ? '正式网页' : '本地预览'}</span></div>
      <span className="game-expanded-label">窗口内展开</span><div className="game-expanded-actions">
        <button type="button" disabled={!hasPreview || previewBusy} onClick={refresh}><ArrowClockwise /><span>刷新</span></button>
        <button type="button" className="game-expanded-capture" disabled={!ready || previewBusy} onClick={() => { void capture(); }}><Camera /><span>截图记录</span></button>
        <div className="game-expanded-restore"><button ref={restoreButton} type="button" onClick={() => { setExpanded(false); requestAnimationFrame(() => expandButton.current?.focus({ preventScroll: true })); }}><CornersIn />还原布局</button></div>
      </div>
    </header> : null}
    <header className="game-project glass">
      <Globe className="hush-hour-project-icon" aria-hidden="true" />
      <div className="game-project-name"><div className="game-project-heading"><strong>Hush-Hour</strong><div className="hush-hour-project-status">
        <span className="game-service hush-hour-status" data-phase={statusPhase} role="status" aria-live="polite" aria-atomic="true" title={error || state?.service.message}>
          {building ? <ArrowClockwise className="hush-hour-build-spinner" size={14} aria-hidden="true" /> : error ? <WarningCircle size={14} aria-hidden="true" /> : statusPhase === 'synced' ? <CheckCircle weight="fill" size={14} aria-hidden="true" /> : <Circle weight="fill" size={10} aria-hidden="true" />}{statusLabel}
        </span>
        {error ? <button type="button" className="hush-hour-status-details" onClick={() => setLogsOpen(true)}>{buildFailed && !failure ? '查看日志' : '查看详情'}</button> : null}
      </div></div><span title={state?.root}>{state?.root || '正在读取项目目录…'}</span></div>
      <div className="game-project-actions">
        <div className="game-service-actions"><button type="button" className="game-primary" title="自动检测源码更新，点击后手动构建并刷新本地预览" disabled={!state || pending} aria-busy={building} onClick={() => { void build(); }}><ArrowClockwise className={building ? 'hush-hour-build-spinner' : undefined} />{building ? '正在构建…' : buildFailed ? '重新构建' : isOnline ? '构建本地' : '构建并刷新'}{statusPhase === 'pending' && state?.sourceChanged ? <span className="game-refresh-badge">有更新</span> : null}</button>
          {running ? <><button type="button" disabled={pending} onClick={() => { void start(true); }}><ArrowClockwise />重启本地</button><button type="button" disabled={pending} onClick={() => { void act(async () => { setState(await api().stop()); }); }}><Stop />停止</button></> : <button type="button" disabled={pending} onClick={() => { void start(); }}><Play weight="fill" />启动本地</button>}
        </div>
        <div className="game-project-panels"><button ref={terminalToggle} type="button" aria-expanded={terminalOpen} aria-controls="hush-hour-project-terminal" onClick={() => { setTerminalEntered(true); setTerminalOpen(value => !value); }}><TerminalWindow />终端</button><button type="button" disabled={!state || isOnline && !siteUrl} title={isOnline && !siteUrl ? '请先设置正式网页地址' : undefined} onClick={() => setIssueOpen(true)}><ClipboardText />记录问题</button></div>
        <GameOptionsMenu kind="project" active={active && !expanded}>{close => <>
          <button type="button" role="menuitem" onClick={() => { close(); void act(() => api().openFolder()); }}><FolderOpen />打开项目目录</button>
          <button type="button" role="menuitem" onClick={() => { close(); setDocumentOpen(true); }}><FileText />项目运行说明</button>
          <button type="button" role="menuitem" onClick={() => { close(); setLogsOpen(true); }}><TerminalWindow />构建日志</button>
          {building ? <button type="button" role="menuitem" onClick={() => { close(); void act(() => api().cancelBuild()); }}><Stop />取消构建</button> : null}
        </>}</GameOptionsMenu>
      </div>
    </header>
    <div className="game-panels">
      <section className="game-preview glass" aria-label="网页预览">
        <div className="game-pane-heading game-preview-heading"><div className="game-preview-heading-main"><strong><Globe />双环境预览</strong><div className="game-environments"><Segmented aria-label="网页环境" value={environment} onChange={value => { setEnvironment(value === 'online' ? 'online' : 'local'); setFailure(''); if (value === 'online') setOnlineEntered(true); }} options={[{ value: 'local', label: '本地预览' }, { value: 'online', label: '正式网页' }]} /></div></div><button type="button" className="game-text-button" disabled={!state} onClick={() => setOnlineSettings(true)}><GearSix />设置正式地址</button></div>
        <div className="game-preview-toolbar">
          <button type="button" className="game-icon-button" aria-label="后退" title="后退" disabled={!hasPreview || !browser.canGoBack || previewBusy} onClick={() => preview.current?.back()}><ArrowLeft /></button>
          <button type="button" className="game-icon-button" aria-label="前进" title="前进" disabled={!hasPreview || !browser.canGoForward || previewBusy} onClick={() => preview.current?.forward()}><ArrowRight /></button>
          <button type="button" className={needsRefresh ? 'game-refresh' : 'game-icon-button'} aria-label="刷新网页" title={needsRefresh ? '已有新构建，刷新查看最新网页' : '刷新网页'} disabled={!hasPreview || previewBusy} onClick={refresh}><ArrowClockwise />{needsRefresh ? <><span>刷新网页</span><span className="game-refresh-badge">有更新</span></> : null}</button>
          <span className="game-address" title={browser.target?.url || siteUrl}>{hasPreview ? browser.target?.url || siteUrl : isOnline ? '请设置正式网页地址' : '本地预览未启动'}</span>
          <WebsiteSelect aria-label="预览尺寸" value={currentViewport} onChange={isOnline ? setOnlineViewport : setViewport} options={[{ value: 'fit', label: '跟随窗口' }, { value: 'desktop', label: '桌面 1440×1000' }, { value: 'narrow', label: '窄屏 390×844' }]} />
          <button ref={expandButton} type="button" className="game-icon-button" aria-label="窗口内展开" title="窗口内展开" disabled={!hasPreview} onClick={() => setExpanded(true)}><CornersOut /></button>
          <GameOptionsMenu kind="preview" label="网页预览更多功能" active={active && !expanded} context={`${environment}:${browser.target?.url}`} onOpen={() => preview.current?.refreshZoom()}>{close => <>
            <PageZoomControls zoomFactor={browser.zoomFactor} disabled={!ready || previewBusy} onZoomChange={factor => preview.current?.setZoomFactor(factor)} />
            <div role="separator" />
            <button type="button" role="menuitem" disabled={!ready || previewBusy} onClick={() => { close(); void capture(); }}><Camera />截图记录问题</button>
            <button type="button" role="menuitem" disabled={!ready} onClick={() => { close(); void act(() => api().openExternal(currentTabId)); }}><ArrowSquareOut />在外部浏览器打开</button>
          </>}</GameOptionsMenu>
        </div>
        <div className="game-environment" hidden={isOnline} inert={isOnline} aria-hidden={isOnline}>{running && state ? <ProjectPreview url={state.service.url} workspace="hush-hour" tabId={tabId} viewport={expanded && !isOnline ? 'fit' : viewport} apiRef={localPreview} onState={setBrowser} /> : <div className="game-preview-empty"><Globe size={44} /><h1>Hush-Hour</h1><p>{state?.service.phase === 'starting' ? '正在打开本地网页…' : '启动本地预览，或构建后查看最新网页。'}</p><button type="button" disabled={pending} onClick={() => { void start(); }}>启动本地</button></div>}</div>
        <div className="game-environment" hidden={!isOnline} inert={!isOnline} aria-hidden={!isOnline}>{onlineEntered && state?.online.url ? <ProjectPreview url={state.online.url} workspace="hush-hour-online" tabId={onlineTabId} viewport={expanded && isOnline ? 'fit' : onlineViewport} apiRef={onlinePreview} onState={setOnlineBrowser} /> : <div className="game-preview-empty"><Globe size={44} /><h1>正式网页</h1><p>设置发布地址，即可查看正式网页。</p><button type="button" disabled={!state} onClick={() => setOnlineSettings(true)}>设置正式地址</button></div>}</div>
        <footer className="game-preview-footer"><span>{isOnline ? browser.error ? '正式网页载入失败，请检查地址与网络。' : browser.loading ? '正式网页载入中…' : browser.target ? '当前为正式网页预览，与本地独立。' : '正式网页可独立于本地服务访问。' : state?.sourceChanged ? '源码有更新，构建后查看最新网页。' : state?.buildRevision ? '当前为本地静态构建预览。' : '请先生成网页构建。'}</span>{!isOnline ? <button type="button" onClick={() => setLogsOpen(true)}>查看构建日志</button> : null}</footer>
      </section>
      {terminalEntered ? <GameTerminalPanel id="hush-hour-project-terminal" bridge={api().terminal} active={active} open={terminalOpen} onPending={onPending} close={() => { setTerminalOpen(false); requestAnimationFrame(() => terminalToggle.current?.focus({ preventScroll: true })); }} /> : null}
    </div>
    {documentOpen ? <GameDocument projectName="Hush-Hour" bridge={api()} close={() => setDocumentOpen(false)} /> : null}
    {onlineSettings && state ? <GameOnlineAddress variant="website" url={state.online.url} close={() => setOnlineSettings(false)} save={async url => { const next = await api().configureOnline(url); if (next.online.url !== state.online.url) setOnlineBrowser(emptyBrowserFrame()); setState(next); setEnvironment('online'); setOnlineEntered(true); setFailure(''); }} /> : null}
    {logsOpen ? <Modal title={error && (!buildFailed || failure) ? 'Hush-Hour · 错误详情' : 'Hush-Hour · 构建日志'} className="game-document" close={() => setLogsOpen(false)}><div className="game-document-nav"><span role={error ? 'alert' : 'status'}>{error || state?.build.message || '尚未构建'}</span></div><pre className="hush-hour-build-output">{state?.build.output || error || '尚无构建日志。点击「构建并刷新」后在这里查看输出。'}</pre></Modal> : null}
    {issueOpen && state ? <HushHourIssueDrawer key={`${environment}:${isOnline ? siteUrl : ''}`} state={state} environment={environment} siteUrl={siteUrl} pageUrl={browser.target?.url || (isOnline ? siteUrl : '')} viewport={currentViewport as 'fit' | 'desktop' | 'narrow'} zoom={browser.zoomFactor} previewRevision={isOnline ? '' : loadedRevision} canCapture={ready && !previewBusy} capture={capture} close={() => setIssueOpen(false)} /> : null}
  </section>;
}
