import { useEffect, useLayoutEffect, useRef, useState, useImperativeHandle, type CSSProperties, type Ref, type RefObject } from 'react';
import { ArrowClockwise, ArrowCounterClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, Camera, Check, CheckCircle, Circle, ClipboardText, Clock, FileText, FolderOpen, GearSix, Globe, Play, SidebarSimple, Stop, TerminalWindow, Warning, WarningCircle, XCircle } from '@phosphor-icons/react';
import { GuestFrame } from '../../modules/browser/ui/guest-frame';
import { WebviewPresentation } from '../../modules/browser/ui/webview-presentation';
import { PageZoomControls } from '../../modules/browser/ui/page-zoom';
import { Select as GameSelect, Segmented, Modal, errorText } from '../ui/controls';
import { emptyBrowserFrame, type BrowserFrameState } from '../../shared/browser-contracts';
import { GAME_TASKS, GameConfigSchema, gameProblemReport, gameTrialReport, gameResultStale, type GameArtifact, type GameConfig, type GameState, type GameTaskId, type GameTaskStatus, type GameTrialReset } from '../../shared/game-contracts';
import office from '../assets/trail-office.png';
import { GameTerminalPanel } from './GameTerminal';
import { GameOptionsMenu } from './GameOptionsMenu';
import { GameOnlineAddress, GameOnlineTools } from './GameOnlineTools';
import { GameDocument } from './GameDocument';
import { GameIssueDrawer } from './GameIssueDrawer';
import './game.css';

const STATUS: Record<GameTaskStatus, string> = { idle: '未运行', queued: '等待中', running: '运行中', passed: '通过', failed: '失败', cancelled: '已取消', unavailable: '未执行' };
const CHECK_DETAILS: Record<GameTaskId, { what: string; how: string }> = {
  rules: {
    what: '案件能否推出唯一凶手，人物与物证是否可达。',
    how: '将每个人分别假设为凶手，结合证词、物证、移动和视线规则求解，再核对预设答案与地图路径。',
  },
  progress: {
    what: '初始案件限制，以及存档损坏、保存失败时的进度处理。',
    how: '用模拟存储制造丢失、损坏和读写失败，检查无效数据过滤、进度临时保留与恢复写入。',
  },
  entry: {
    what: '进入案件时的页面跳转、防重复点击与返回状态。',
    how: '在模拟页面中点击案件链接、推进计时器和触发返回事件，核对跳转地址、重复点击拦截与页面恢复。',
  },
  theme: {
    what: '雨夜与晨雾切换、主题记忆，以及游戏存档是否保持。',
    how: '在模拟页面中切换主题、重新创建页面，核对按钮状态、主题存储、跨页同步与文字对比度。',
  },
  loading: {
    what: '正常加载、资源报错或等待超时后，加载界面如何处理。',
    how: '用模拟页面和计时器触发加载完成、脚本报错、字体等待与超时，核对加载遮罩和重试提示。',
  },
  playthrough: {
    what: '三个案件的实际通关流程、存档与解锁，以及桌面和窄屏页面。',
    how: '在独立 Edge 中自动进入案件、移动对话、收集证据并提交预设答案，核对通关结果、进度恢复和页面布局。',
  },
};
interface PreviewApi { reload(): void; back(): void; forward(): void; setZoomFactor(factor: number): void; refreshZoom(): void; }

function GamePreview({ url, workspace, tabId, viewport, apiRef, onState }: { url: string; workspace: string; tabId: string; viewport: string; apiRef: Ref<PreviewApi>; onState(state: BrowserFrameState): void }) {
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const controller = useRef<GuestFrame | null>(null);
  const [state, setState] = useState(emptyBrowserFrame);
  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    let frame: GuestFrame;
    const presentation = new WebviewPresentation({ mounted: () => frame.attach(), unmounted: () => frame.detach() });
    frame = new GuestFrame({ workspace, tabId, initialUrl: url }, window.workbench.browser, presentation);
    controller.current = frame;
    const off = frame.subscribe(() => setState(frame.getSnapshot()));
    const unmount = presentation.mount(element);
    return () => { off(); unmount(); void frame.dispose(); if (controller.current === frame) controller.current = null; };
  }, [workspace, tabId, url]);
  const [size, setSize] = useState({ width: 800, height: 600 });
  useEffect(() => onState(state), [onState, state]);
  useLayoutEffect(() => {
    const element = stage.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0 && entry.contentRect.height > 0) setSize({ width: entry.contentRect.width, height: entry.contentRect.height }); });
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useImperativeHandle(apiRef, () => ({ reload: () => controller.current?.reload(), back: () => controller.current?.goBack(), forward: () => controller.current?.goForward(), setZoomFactor: factor => controller.current?.setZoomFactor(factor), refreshZoom: () => controller.current?.refreshZoom() }), []);
  const width = viewport === 'desktop' ? 1440 : viewport === 'narrow' ? 390 : size.width;
  const height = viewport === 'desktop' ? 1000 : viewport === 'narrow' ? 844 : size.height;
  const scale = Math.min(1, size.width / width, size.height / height);
  return <div className="game-stage" ref={stage}>
    <div className="game-scaled" style={{ width: width * scale, height: height * scale }}>
      <div ref={host} className="game-viewport" style={{ width, height, transform: `scale(${scale})` }} />
    </div>
    {state.error ? <div className="game-preview-error" role="alert"><WarningCircle size={24} /><p>页面载入失败，请检查当前环境的地址与连接。</p><button onClick={() => controller.current?.reload()}>重新载入</button></div> : null}
  </div>;
}

function ProjectSettings({ state, close, onSave }: { state: GameState; close(): void; onSave(config: GameConfig): Promise<void> }) {
  const [draft, setDraft] = useState(state.config);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dirty = JSON.stringify(draft) !== JSON.stringify(state.config);
  return <Modal title="轨迹侦探 · 项目设置" close={close} dirty={dirty} className="game-settings">
    <form noValidate onSubmit={event => { event.preventDefault(); const parsed = GameConfigSchema.safeParse(draft); if (!parsed.success) { setError('请填写项目与网页目录，端口需为 1024–65535 的整数。'); return; } setError(''); setSaving(true); void onSave(parsed.data).then(close, error => setError(errorText(error))).finally(() => setSaving(false)); }}>
      <label htmlFor="game-root">项目目录</label><div className="game-path-input"><input id="game-root" value={draft.root} onChange={event => setDraft({ ...draft, root: event.target.value })} /><button type="button" onClick={() => { void window.workbench.game.chooseRoot().then(root => { if (root) setDraft({ ...draft, root }); }, error => setError(errorText(error))); }}>选择目录</button></div>
      <label htmlFor="game-webroot">网页目录（相对于项目）</label><input id="game-webroot" value={draft.webRoot} onChange={event => setDraft({ ...draft, webRoot: event.target.value })} />
      <label htmlFor="game-port">本地端口</label><input id="game-port" type="number" min="1024" max="65535" value={draft.port} onChange={event => setDraft({ ...draft, port: Number(event.target.value) })} />
      <label htmlFor="game-playwright">Playwright 模块路径（可选）</label><input id="game-playwright" value={draft.playwrightModule} placeholder="留空使用 Ono 自带的 Playwright" onChange={event => setDraft({ ...draft, playwrightModule: event.target.value })} />
      <p>固定执行项目已有的六项脚本。修改代码请继续使用现有开发工具。</p>
      {error ? <p className="game-error" role="alert">{error}</p> : null}
      <div className="actions"><button type="button" onClick={close}>取消</button><button type="submit" className="primary" disabled={saving}>{saving ? '正在保存…' : '保存项目设置'}</button></div>
    </form>
  </Modal>;
}

function GameTrialResetDialog({ request, close, reset }: { request: GameTrialReset; close(): void; reset(): Promise<void> }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const submitting = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => { cancel.current?.focus(); }, []);
  const environment = request.environment === 'online' ? '线上试玩' : '本地开发';
  return <Modal title="重置保留试玩档？" titleIcon={<ArrowCounterClockwise size={28} />} className="game-trial-reset" busy={busy} close={close}>
    <div className="game-trial-reset-body">
      <p className="game-trial-reset-intro">将清空{environment}的试玩数据，下次试玩从头开始。</p>
      <dl className="game-trial-reset-scope"><div><dt>当前环境</dt><dd><span>{environment}</span></dd></div><div><dt>试玩存档</dt><dd>保留试玩档</dd></div></dl>
      <p className="game-trial-reset-help">本次重置仅影响该站点在此设备保存的进度与网页设置。<br />项目文件和{request.environment === 'online' ? '本地' : '线上'}试玩档会保留。</p>
      <p className="game-trial-reset-origin" title={request.origin}>{request.origin}</p>
      {error ? <p className="game-trial-reset-error" role="alert">{error}</p> : null}
      <footer className="game-trial-reset-footer"><span><Warning size={20} />此操作无法撤销。</span><div className="actions"><button ref={cancel} type="button" autoFocus disabled={busy} onClick={close}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => {
        if (submitting.current) return;
        submitting.current = true; setBusy(true); setError('');
        void reset().then(close, error => setError(errorText(error))).finally(() => { submitting.current = false; setBusy(false); });
      }}>{busy ? '正在重置…' : '确认重置'}</button></div></footer>
    </div>
  </Modal>;
}

function GameView({ active, onPending }: { active: boolean; onPending(message: string): void }) {
  const [state, setState] = useState<GameState | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [documentOpen, setDocumentOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [resetTrial, setResetTrial] = useState<GameTrialReset | null>(null);
  const [trialVersion, setTrialVersion] = useState({ local: 0, online: 0 });
  const [environment, setEnvironment] = useState('local');
  const [onlineEntered, setOnlineEntered] = useState(false);
  const [onlineSettings, setOnlineSettings] = useState(false);
  const [onlineViewport, setOnlineViewport] = useState('fit');
  const [onlineProfile, setOnlineProfile] = useState('keep');
  const [onlineFreshId, setOnlineFreshId] = useState('');
  const [onlineBrowser, setOnlineBrowser] = useState(emptyBrowserFrame);
  const [onlineIssues, setOnlineIssues] = useState<Record<string, { notes: string; artifacts: GameArtifact[] }>>({});
  const [scope, setScope] = useState('quick');
  const [selected, setSelected] = useState<GameTaskId>('rules');
  const [testsOpen, setTestsOpen] = useState(window.innerWidth >= 1180);
  const grid = useRef<HTMLDivElement>(null);
  const testScroll = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [testsWidth, setTestsWidth] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const maximumTestsWidth = Math.max(330, availableWidth - 12 - 420);
  const effectiveTestsWidth = Math.max(330, Math.min(maximumTestsWidth, testsWidth ?? availableWidth * (environment === 'online' ? .3 : .35)));
  const clampTestsWidth = (width: number) => Math.max(330, Math.min(maximumTestsWidth, width));
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalEntered, setTerminalEntered] = useState(false);
  const terminalToggle = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState('fit');
  const [profile, setProfile] = useState('keep');
  const [freshId, setFreshId] = useState('');
  const [loadedRevision, setLoadedRevision] = useState('');
  const [localBrowser, setBrowser] = useState(emptyBrowserFrame);
  const [clock, setClock] = useState(Date.now());
  const localPreview = useRef<PreviewApi>(null), onlinePreview = useRef<PreviewApi>(null);
  useEffect(() => { if (!active) { setDocumentOpen(false); setResetTrial(null); } }, [active]);
  useEffect(() => {
    let observed = false, active = true;
    const off = window.workbench.game.onChanged(next => { observed = true; if (active) setState(next); });
    void window.workbench.game.state().then(next => { if (active && !observed) setState(next); }, error => { if (active) setFailure(errorText(error)); });
    return () => { active = false; off(); };
  }, []);
  useEffect(() => {
    const media = matchMedia('(max-width: 1179px)');
    const change = () => { if (media.matches) setTestsOpen(false); };
    media.addEventListener('change', change); return () => media.removeEventListener('change', change);
  }, []);
  useLayoutEffect(() => {
    const element = grid.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setAvailableWidth(entry.contentRect.width); });
    observer.observe(element); return () => observer.disconnect();
  }, [state !== null]);
  useEffect(() => { if (!state?.running) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [state?.running]);
  async function act(action: () => Promise<unknown>) {
    setFailure(''); setBusy(true);
    try { await action(); } catch (error) { setFailure(errorText(error)); } finally { setBusy(false); }
  }
  if (!state) return <section className="game-loading" role="status">{failure || '正在读取游戏项目…'}</section>;
  const service = state.service;
  const running = service.phase === 'running';
  const isOnline = environment === 'online';
  const browser = isOnline ? onlineBrowser : localBrowser;
  const preview = isOnline ? onlinePreview : localPreview;
  const hasPreview = isOnline ? !!state.online.url : running;
  const currentViewport = isOnline ? onlineViewport : viewport;
  const currentProfile = isOnline ? onlineProfile : profile;
  const trialUrl = isOnline ? state.online.url : `http://127.0.0.1:${state.config.port}`;
  const result = state.results[selected];
  const stale = gameResultStale(result, state.revision);
  const task = GAME_TASKS.find(task => task.id === selected)!;
  const quick = GAME_TASKS.filter(task => task.group === 'quick');
  const passed = quick.filter(task => state.results[task.id]?.status === 'passed' && !gameResultStale(state.results[task.id], state.revision)).length;
  const outdatedCount = quick.filter(task => gameResultStale(state.results[task.id], state.revision)).length;
  const previewNeedsRefresh = !isOnline && running && !!loadedRevision && loadedRevision !== state.revision;
  const workspace = profile === 'keep' ? 'game-trail-detective' : `game-trail-fresh-${freshId}`;
  const localTabId = profile === 'keep' ? 'game-trial-keep' : `game-trial-${freshId}`;
  const onlineWorkspace = onlineProfile === 'keep' ? 'game-trail-online' : `game-trail-fresh-online-${onlineFreshId}`;
  const onlineTabId = onlineProfile === 'keep' ? 'game-trial-online-keep' : `game-trial-online-${onlineFreshId}`;
  const previewTabId = isOnline ? onlineTabId : localTabId;
  const issueKey = `${state.online.url}:${onlineWorkspace}`;
  const onlineIssue = onlineIssues[issueKey] ?? { notes: '', artifacts: [] };
  const artifacts = [...(result?.artifacts ?? []), ...state.captures.filter(item => item.environment !== 'online')];
  const projectBusy = busy || state.running || service.phase === 'starting';
  const refresh = () => { preview.current?.reload(); if (!isOnline) setLoadedRevision(state.revision); };
  const selectProfile = (value: string) => {
    if (isOnline) { if (value === 'fresh') setOnlineFreshId(crypto.randomUUID()); setOnlineProfile(value); }
    else { if (value === 'fresh') setFreshId(crypto.randomUUID()); setProfile(value); }
  };
  const capture = () => { void act(async () => {
    const artifact = await window.workbench.game.capture(previewTabId);
    if (isOnline) setOnlineIssues(previous => ({ ...previous, [issueKey]: { notes: previous[issueKey]?.notes ?? '', artifacts: [...(previous[issueKey]?.artifacts ?? []), artifact].slice(-10) } }));
    onPending('试玩截图已保存到 Ono，可在附件中打开。');
  }); };
  const viewportLabel = currentViewport === 'fit' ? '跟随窗口' : currentViewport === 'desktop' ? '1440×1000' : '390×844';
  const copyOnlineReport = () => { void act(async () => {
    await window.workbench.clipboard.write(gameTrialReport(state.online, browser.target?.url || state.online.url, viewportLabel, browser.zoomFactor, onlineProfile === 'keep' ? '保留线上试玩档' : '新档试玩（临时）', onlineIssue.notes, onlineIssue.artifacts));
    onPending('线上问题报告已复制，可粘贴到开发工具。');
  }); };
  const run = (single = false) => { void act(() => window.workbench.game.run(single ? selected : scope === 'full' ? 'full' : 'quick')); };
  const copyReport = () => {
    if (!result) return;
    void act(async () => { await window.workbench.clipboard.write(gameProblemReport(state, result, browser.target?.url || service.url, viewport === 'fit' ? '跟随窗口' : viewport === 'desktop' ? '1440×1000' : '390×844')); onPending('问题报告已复制，可粘贴到开发工具。'); });
  };
  return <section className="game-workspace" aria-label="轨迹侦探运行与测试">
    <header className="game-project glass">
      <img src={office} alt="轨迹侦探事务所" />
      <div className="game-project-name"><div className="game-project-heading"><strong>轨迹侦探</strong><span className={`game-service ${running ? 'is-ready' : ''}`} role="status" title={service.message}><Circle weight="fill" size={10} />{service.phase === 'starting' ? '本地启动中…' : running ? service.owned ? '本地运行中' : '外部本地服务 · 运行中' : service.phase === 'error' ? '本地启动失败' : '本地未启动'}</span></div><span title={state.config.root}>{state.config.root}</span></div>
      <div className="game-project-actions">
        <div className="game-service-actions">{running ? <><button className="game-primary" disabled={projectBusy || !service.owned} onClick={() => { void act(async () => { await window.workbench.game.stop(); await window.workbench.game.start(); setLoadedRevision(''); }); }}><ArrowClockwise />重启本地</button><button disabled={projectBusy} onClick={() => { void act(() => window.workbench.game.stop()); }}><Stop />{service.owned ? '停止' : '断开'}</button></> : <button className="game-primary" disabled={projectBusy || !!state.sourceError} onClick={() => { setLoadedRevision(state.revision); void act(() => window.workbench.game.start()); }}><Play weight="fill" />启动本地</button>}</div>
        <div className="game-project-panels" role="group" aria-label="面板开关">
          <button ref={terminalToggle} aria-expanded={terminalOpen} aria-controls="game-project-terminal" title={terminalOpen ? '收起项目终端' : '展开项目终端'} onClick={() => { setTerminalEntered(true); setTerminalOpen(!terminalOpen); }}><TerminalWindow />终端</button>
          <button className="game-test-toggle" aria-expanded={testsOpen} title={testsOpen ? '收起测试栏' : '展开测试栏'} onClick={() => setTestsOpen(!testsOpen)}><ClipboardText />检查</button>
        </div>
        <GameOptionsMenu kind="project" active={active}>{close => <>
          <button type="button" role="menuitem" onClick={() => { close(); void act(() => window.workbench.game.open('root')); }}><FolderOpen />打开项目目录</button>
          <button type="button" role="menuitem" onClick={() => { close(); setDocumentOpen(true); }}><FileText />项目运行说明</button>
          <button type="button" role="menuitem" disabled={projectBusy || running} title={running ? '停止服务后可修改项目设置' : '项目设置'} onClick={() => { close(); setSettings(true); }}><GearSix />项目设置</button>
        </>}</GameOptionsMenu>
      </div>
    </header>
    {failure || !isOnline && (state.sourceError || service.phase === 'error') ? <div className="game-error" role="alert"><WarningCircle /><span>{failure || state.sourceError || service.message}</span>{!isOnline && service.phase === 'error' ? <button disabled={projectBusy} onClick={() => { void act(() => window.workbench.game.connect()); }}>连接已有服务</button> : null}</div> : null}
    <div className="game-panels"><div ref={grid} className={`game-grid${testsOpen ? '' : ' tests-hidden'}`} style={{ '--game-tests-width': `${effectiveTestsWidth}px` } as CSSProperties}>
      <section className="game-preview glass" aria-label="游戏预览">
        <div className="game-pane-heading game-preview-heading"><div className="game-preview-heading-main"><strong><Globe />双环境试玩</strong><div className="game-environments"><Segmented aria-label="试玩环境" value={environment} onChange={value => { setEnvironment(value); setFailure(''); if (value === 'online') setOnlineEntered(true); }} options={[{ value: 'local', label: '本地开发' }, { value: 'online', label: '线上试玩' }]} /></div></div><span>{isOnline ? '使用独立的线上试玩存档' : '使用独立的本地试玩存档'}</span></div>
        <div className="game-preview-toolbar">
          <button className="game-icon-button" disabled={!browser.canGoBack || !hasPreview} title="后退" aria-label="后退" onClick={() => preview.current?.back()}><ArrowLeft /></button>
          <button className="game-icon-button" disabled={!browser.canGoForward || !hasPreview} title="前进" aria-label="前进" onClick={() => preview.current?.forward()}><ArrowRight /></button>
          <button type="button" className={previewNeedsRefresh ? 'game-refresh' : 'game-icon-button'} disabled={!hasPreview} title={previewNeedsRefresh ? '本地代码已更新，刷新试玩查看最新画面。' : '刷新试玩'} aria-label="刷新试玩" aria-description={previewNeedsRefresh ? '本地代码有更新' : undefined} onClick={refresh}><ArrowClockwise />{previewNeedsRefresh ? <><span>刷新试玩</span><span className="game-refresh-badge" role="status"><Circle weight="fill" aria-hidden="true" />有更新</span></> : null}</button>
          <span className="game-address" title={browser.target?.url || (isOnline ? state.online.url : service.url)}>{browser.target?.url || (isOnline ? state.online.url || '请设置线上地址' : service.url || `127.0.0.1:${state.config.port}`)}</span>
          <GameSelect aria-label="预览尺寸" value={currentViewport} onChange={isOnline ? setOnlineViewport : setViewport} options={[{ value: 'fit', label: '跟随窗口' }, { value: 'desktop', label: '桌面 1440×1000' }, { value: 'narrow', label: '窄屏 390×844' }]} />
          <GameOptionsMenu kind="preview" active={active} context={`${environment}:${browser.target?.url}`} onOpen={() => preview.current?.refreshZoom()}>{close => <>
            <PageZoomControls zoomFactor={hasPreview ? browser.zoomFactor : 1} disabled={!hasPreview || browser.loading || !browser.target || !!browser.error || busy} onZoomChange={factor => { void act(async () => preview.current?.setZoomFactor(factor)); }} />
            <hr />
            <div className="game-profile-options" role="group" aria-label="试玩存档">
              <span className="game-menu-label">试玩存档</span>
              <button type="button" role="menuitemradio" aria-checked={currentProfile === 'keep'} onClick={() => { close(); selectProfile('keep'); }}><Check weight="bold" />保留试玩档</button>
              <button type="button" role="menuitemradio" aria-checked={currentProfile === 'fresh'} onClick={() => { close(); selectProfile('fresh'); }}><Check weight="bold" />新档试玩</button>
            </div>
            <hr />
            <button type="button" role="menuitem" className="game-reset-trial-action" disabled={currentProfile !== 'keep' || !trialUrl || busy || browser.loading} title={currentProfile !== 'keep' ? '切换至保留试玩档后可重置' : '清空当前环境的保留试玩数据'} onClick={() => { close(); setResetTrial({ environment: isOnline ? 'online' : 'local', origin: new URL(trialUrl).origin }); }}><ArrowCounterClockwise />重置保留试玩档…</button>
            <hr />
            <button type="button" role="menuitem" disabled={!hasPreview || browser.loading || !!browser.error || busy} onClick={() => { close(); capture(); }}><Camera />截图记录问题</button>
            <button type="button" role="menuitem" disabled={!hasPreview} title="使用该浏览器自己的存档" onClick={() => { close(); void act(() => isOnline ? window.workbench.game.openOnline(browser.target ? onlineTabId : undefined) : window.workbench.game.open('preview')); }}><ArrowSquareOut />在外部浏览器打开</button>
          </>}</GameOptionsMenu>
        </div>
        <div className="game-environment" hidden={isOnline} inert={isOnline} aria-hidden={isOnline}>{running ? <GamePreview key={`${service.url}:${workspace}:${trialVersion.local}`} url={service.url} workspace={workspace} tabId={localTabId} viewport={viewport} apiRef={localPreview} onState={setBrowser} /> : <div className="game-preview-empty"><img src={office} alt="雨窗前的侦探事务所" /><h1>轨迹侦探</h1><p>{state.sourceError ? '请在项目设置中核对目录。' : '启动游戏，在这里直接试玩最新代码。'}</p><button onClick={() => setDocumentOpen(true)}>查看项目运行说明</button></div>}</div>
        <div className="game-environment" hidden={!isOnline} inert={!isOnline} aria-hidden={!isOnline}>{onlineEntered && state.online.url ? <GamePreview key={`${state.online.url}:${onlineWorkspace}:${trialVersion.online}`} url={state.online.url} workspace={onlineWorkspace} tabId={onlineTabId} viewport={onlineViewport} apiRef={onlinePreview} onState={setOnlineBrowser} /> : <div className="game-preview-empty"><Globe size={44} /><h1>线上试玩</h1><p>设置发布地址，直接体验服务器上的游戏。</p><button onClick={() => { setTestsOpen(true); setOnlineSettings(true); }}>设置线上地址</button></div>}</div>
        <div className="game-preview-footer"><span><Circle weight="fill" size={9} />{isOnline ? onlineProfile === 'keep' ? '线上试玩档 · 与本地独立' : '线上临时新档 · 不覆盖保留档' : service.message}</span><span>{browser.loading && hasPreview ? '页面载入中…' : isOnline ? '本地服务未启动时也可试玩' : running ? '人工试玩 · 自动测试使用独立档案' : '代码继续在现有开发工具中修改'}</span></div>
      </section>
      {testsOpen ? <><div className="game-column-resize" role="separator" tabIndex={0} aria-label="调整游戏预览和测试检查宽度" title="左右拖动调整宽度（← / →）" aria-orientation="vertical" aria-controls="game-test-panel" aria-valuemin={330} aria-valuemax={Math.round(maximumTestsWidth)} aria-valuenow={Math.round(effectiveTestsWidth)} aria-valuetext={`测试检查 ${Math.round(effectiveTestsWidth)} 像素`} data-dragging={resizing}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); event.currentTarget.focus({ preventScroll: true }); drag.current = { x: event.clientX, width: effectiveTestsWidth }; event.currentTarget.setPointerCapture(event.pointerId); setResizing(true); }}
        onPointerMove={event => { if (drag.current) setTestsWidth(clampTestsWidth(drag.current.width + drag.current.x - event.clientX)); }}
        onPointerUp={event => { drag.current = null; setResizing(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; setResizing(false); }}
        onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); setTestsWidth(event.key === 'Home' ? 330 : event.key === 'End' ? maximumTestsWidth : clampTestsWidth(effectiveTestsWidth + (event.key === 'ArrowLeft' ? 24 : -24))); }} />
      {isOnline ? <GameOnlineTools online={state.online} browser={onlineBrowser} profile={onlineProfile} busy={busy} notes={onlineIssue.notes} artifacts={onlineIssue.artifacts}
        edit={() => setOnlineSettings(true)} close={() => setTestsOpen(false)} recordIssue={() => setIssueOpen(true)} selectProfile={selectProfile} fresh={() => selectProfile('fresh')} capture={capture}
        copyReport={copyOnlineReport} copyAddress={() => { void act(async () => { await window.workbench.clipboard.write(state.online.url); onPending('线上地址已复制。'); }); }}
        openExternal={() => { void act(() => window.workbench.game.openOnline(onlineBrowser.target ? onlineTabId : undefined)); }} openArtifact={id => { void act(() => window.workbench.game.openArtifact(id)); }}
        removeArtifact={id => setOnlineIssues(previous => ({ ...previous, [issueKey]: { notes: previous[issueKey]?.notes ?? '', artifacts: (previous[issueKey]?.artifacts ?? []).filter(item => item.id !== id) } }))}
        check={() => { void window.workbench.game.checkOnline().catch(error => setFailure(errorText(error))); }} setNotes={value => setOnlineIssues(previous => ({ ...previous, [issueKey]: { notes: value, artifacts: previous[issueKey]?.artifacts ?? [] } }))} /> : <aside id="game-test-panel" className="game-tests glass" aria-label="测试检查">
        <div className="game-pane-heading"><strong><ClipboardText />测试检查</strong><div className="game-pane-actions"><button type="button" onClick={() => setIssueOpen(true)}><ClipboardText />记录问题</button><button className="game-icon-button" aria-label="收起测试栏" title="收起测试栏" onClick={() => setTestsOpen(false)}><SidebarSimple /></button></div></div>
        <p className="game-pane-description">选择检查项，查看说明与结果。</p>
        <Segmented aria-label="测试范围" value={scope} onChange={value => { setScope(value); setSelected(value === 'full' ? 'playthrough' : 'rules'); testScroll.current?.scrollTo(0, 0); }} options={[{ value: 'quick', label: '快速检查（5项）' }, { value: 'full', label: '完整通关' }]} />
        {scope === 'quick' ? <>
          {outdatedCount ? <p className="game-update game-check-notice" role="status"><WarningCircle size={18} />{outdatedCount}项待重测 · 代码已变化。</p> : null}
          <div className="game-check-picker"><label htmlFor="game-current-check">当前检查</label><GameSelect id="game-current-check" aria-label="当前检查" value={selected} onChange={value => { setSelected(value as GameTaskId); testScroll.current?.scrollTo(0, 0); }} className="game-check-select" menuClassName="game-check-menu" options={quick.map(task => ({ value: task.id, label: task.label }))} renderOption={option => {
            const record = state.results[option.value as GameTaskId];
            const outdated = gameResultStale(record, state.revision);
            const status = record?.status ?? 'idle';
            return <span className={`game-check-choice ${outdated ? 'stale' : status}`}><span className={`game-status-icon ${outdated ? 'stale' : status}`}>{status === 'passed' ? <CheckCircle weight="fill" /> : status === 'failed' ? <XCircle weight="fill" /> : <Circle weight={status === 'running' ? 'duotone' : 'regular'} />}</span><span>{option.label}</span><small>{outdated ? '待重测' : STATUS[status]}</small></span>;
          }} /></div>
        </> : null}
        <div className="game-test-scroll" ref={testScroll}>
          {scope === 'full' ? <p className="game-quick-summary">快速检查：{passed}/5 项通过</p> : null}
          <div className="game-result">
            <h2 className="game-check-title">{task.label}</h2>
            <span className="game-script">{task.script}</span>
            <dl className="game-check-explanation"><div><dt><FileText />检查什么</dt><dd>{CHECK_DETAILS[selected].what}</dd></div><div><dt><GearSix />怎么检查</dt><dd>{CHECK_DETAILS[selected].how}</dd></div></dl>
            <section className="game-check-result" aria-label="检查结果" aria-live="polite">
              <div className="game-result-line">
                <h3><Clock />{result?.status === 'running' || result?.status === 'queued' ? '运行状态' : result ? '上次结果' : '检查结果'}</h3>
                <span className={`game-result-message ${result?.status === 'failed' ? 'failed' : ''}`}>{result ? STATUS[result.status] : '尚未运行此项检查。'}</span>
                {result?.startedAt ? <time className="game-result-time" dateTime={new Date(result.startedAt).toISOString()} title={new Date(result.startedAt).toLocaleString('zh-CN')}>{new Date(result.startedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })} · {Math.max(0, Math.round(((result.finishedAt ?? clock) - result.startedAt) / 1000))} 秒</time> : null}
              </div>
              {result?.message && (result.status === 'failed' || result.status === 'unavailable') ? <p className="game-result-note">{result.message}</p> : null}
              {stale ? <p className="game-check-stale">上次结果仅供参考，请重新运行。</p> : null}
            </section>
            {result?.status === 'failed' ? <div className="game-next"><strong>下一步</strong><p>查看原始输出，并在试玩中核对对应流程。</p><p>复制问题报告，回开发工具修复后重新运行。</p></div> : null}
          </div>
          <details key={selected} className="game-detail" open={result?.status === 'failed' ? true : undefined}><summary>原始输出</summary><pre tabIndex={0}>{result?.output || '脚本暂无输出。运行状态以进程完成结果为准。'}</pre></details>
          <details className="game-detail"><summary>附件 · {artifacts.length ? `${artifacts.length} 项` : '暂无'}</summary>{artifacts.length ? artifacts.map(item => <button key={item.id} onClick={() => { void act(() => window.workbench.game.openArtifact(item.id)); }}><Camera />{item.name}</button>) : <p>脚本已生成的检查点截图和手动试玩截图显示在这里。</p>}</details>
          <details className="game-detail"><summary>问题反馈</summary><p>将问题描述、截图副本、测试输出和服务日志一起保存到本机。</p><button onClick={() => setIssueOpen(true)}><ClipboardText />记录问题 / 查看已保存记录</button></details>
          <details className="game-detail"><summary>运行日志</summary><pre tabIndex={0}>{state.logs.join('\n') || '暂无服务日志'}</pre></details>
        </div>
        <div className="game-run-actions">{state.running ? <button disabled={busy} onClick={() => { void act(() => window.workbench.game.cancel()); }}><Stop />停止测试</button> : <>
            {result?.status === 'failed' ? <button className="game-primary" disabled={busy} onClick={copyReport}><ClipboardText />复制问题报告</button> : null}
            <button className={result?.status === 'failed' ? '' : 'game-primary'} disabled={busy} onClick={() => run()}><Play weight="fill" />{scope === 'full' ? '运行完整通关' : '运行快速检查'}</button>
            {scope === 'quick' && result ? <button disabled={busy} title="只重跑当前选中任务" onClick={() => run(true)}><ArrowClockwise />重跑此项</button> : null}
        </>}</div>
        <p className="game-tests-footer">完整通关使用独立 Edge，不影响左侧试玩档。</p>
      </aside>}</> : null}
    </div>
    {terminalEntered ? <GameTerminalPanel active={active} open={terminalOpen} close={() => { setTerminalOpen(false); terminalToggle.current?.focus(); }} onPending={onPending} /> : null}
    </div>
    {settings ? <ProjectSettings state={state} close={() => setSettings(false)} onSave={async config => { await window.workbench.game.configure(config); setLoadedRevision(''); }} /> : null}
    {documentOpen ? <GameDocument close={() => setDocumentOpen(false)} /> : null}
    {resetTrial ? <GameTrialResetDialog request={resetTrial} close={() => setResetTrial(null)} reset={async () => {
      try { await window.workbench.game.resetTrial(resetTrial); }
      finally { setTrialVersion(previous => ({ ...previous, [resetTrial.environment]: previous[resetTrial.environment] + 1 })); }
      onPending(`${resetTrial.environment === 'online' ? '线上' : '本地'}保留试玩档已重置。`);
    }} /> : null}
    {issueOpen ? <GameIssueDrawer state={state} environment={isOnline ? 'online' : 'local'} pageUrl={browser.target?.url || (isOnline ? state.online.url : service.url)} viewport={currentViewport} zoom={browser.zoomFactor} profile={currentProfile} taskId={selected} artifacts={isOnline ? onlineIssue.artifacts : artifacts} initialNotes={isOnline ? onlineIssue.notes : ''} capture={hasPreview && !!browser.target && !browser.loading && !browser.error ? () => window.workbench.game.capture(previewTabId) : undefined} close={() => setIssueOpen(false)} /> : null}
    {onlineSettings ? <GameOnlineAddress url={state.online.url} close={() => setOnlineSettings(false)} save={async url => { await window.workbench.game.configureOnline(url); setOnlineEntered(true); setEnvironment('online'); if (url) void window.workbench.game.checkOnline().catch(error => setFailure(errorText(error))); }} /> : null}
  </section>;
}

export function GameHost({ active, focusTarget, onPending }: { active: boolean; focusTarget: RefObject<HTMLElement | null>; onPending(message: string): void }) {
  const [entered, setEntered] = useState(active);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) setEntered(true); }, [active]);
  useLayoutEffect(() => { if (!active && host.current && (document.activeElement === document.body || host.current.contains(document.activeElement))) focusTarget.current?.focus({ preventScroll: true }); }, [active, focusTarget]);
  if (!active && !entered) return null;
  return <div ref={host} className="game-host" hidden={!active} inert={!active} aria-hidden={!active} onFocusCapture={event => { if (!active) { (event.target as HTMLElement).blur(); focusTarget.current?.focus({ preventScroll: true }); } }}><GameView active={active} onPending={onPending} /></div>;
}
