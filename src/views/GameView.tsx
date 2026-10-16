import { useEffect, useLayoutEffect, useRef, useState, useImperativeHandle, type Ref, type RefObject } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, Camera, CheckCircle, Circle, ClipboardText, FolderOpen, GearSix, Globe, Minus, Play, Stop, TerminalWindow, WarningCircle, XCircle } from '@phosphor-icons/react';
import { GuestFrame } from '../../modules/browser/ui/guest-frame';
import { WebviewPresentation } from '../../modules/browser/ui/webview-presentation';
import { Select as GameSelect, Segmented, Modal, errorText } from '../../modules/todo/ui/ui';
import { emptyBrowserFrame, type BrowserFrameState } from '../../shared/browser-contracts';
import { GAME_TASKS, GameConfigSchema, gameProblemReport, gameResultStale, type GameConfig, type GameState, type GameTaskId, type GameTaskStatus } from '../../shared/game-contracts';
import office from '../assets/trail-office.png';
import { GameTerminalPanel } from './GameTerminal';
import './game.css';

const STATUS: Record<GameTaskStatus, string> = { idle: '未运行', queued: '等待中', running: '运行中', passed: '通过', failed: '失败', cancelled: '已取消', unavailable: '未执行' };
interface PreviewApi { reload(): void; back(): void; forward(): void; }

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
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useImperativeHandle(apiRef, () => ({ reload: () => controller.current?.reload(), back: () => controller.current?.goBack(), forward: () => controller.current?.goForward() }), []);
  const width = viewport === 'desktop' ? 1440 : viewport === 'narrow' ? 390 : size.width;
  const height = viewport === 'desktop' ? 1000 : viewport === 'narrow' ? 844 : size.height;
  const scale = Math.min(1, size.width / width, size.height / height);
  return <div className="game-stage" ref={stage}>
    <div className="game-scaled" style={{ width: width * scale, height: height * scale }}>
      <div ref={host} className="game-viewport" style={{ width, height, transform: `scale(${scale})` }} />
    </div>
    {state.error ? <div className="game-preview-error" role="alert"><WarningCircle size={24} /><p>页面载入失败，请检查本地服务。</p><button onClick={() => controller.current?.reload()}>重新载入</button></div> : null}
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

function GameView({ onPending }: { onPending(message: string): void }) {
  const [state, setState] = useState<GameState | null>(null);
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [settings, setSettings] = useState(false);
  const [scope, setScope] = useState('quick');
  const [selected, setSelected] = useState<GameTaskId>('rules');
  const [testsOpen, setTestsOpen] = useState(window.innerWidth >= 1180);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [terminalEntered, setTerminalEntered] = useState(false);
  const terminalToggle = useRef<HTMLButtonElement>(null);
  const [viewport, setViewport] = useState('fit');
  const [profile, setProfile] = useState('keep');
  const [freshId, setFreshId] = useState('');
  const [loadedRevision, setLoadedRevision] = useState('');
  const [browser, setBrowser] = useState(emptyBrowserFrame);
  const [notes, setNotes] = useState('');
  const [clock, setClock] = useState(Date.now());
  const preview = useRef<PreviewApi>(null);
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
  useEffect(() => { if (!state?.running) return; const timer = setInterval(() => setClock(Date.now()), 1000); return () => clearInterval(timer); }, [state?.running]);
  async function act(action: () => Promise<unknown>) {
    setFailure(''); setBusy(true);
    try { await action(); } catch (error) { setFailure(errorText(error)); } finally { setBusy(false); }
  }
  if (!state) return <section className="game-loading" role="status">{failure || '正在读取游戏项目…'}</section>;
  const service = state.service;
  const running = service.phase === 'running';
  const result = state.results[selected];
  const stale = gameResultStale(result, state.revision);
  const task = GAME_TASKS.find(task => task.id === selected)!;
  const quick = GAME_TASKS.filter(task => task.group === 'quick');
  const passed = quick.filter(task => state.results[task.id]?.status === 'passed' && !gameResultStale(state.results[task.id], state.revision)).length;
  const sourceChanged = !!loadedRevision && loadedRevision !== state.revision;
  const workspace = profile === 'keep' ? 'game-trail-detective' : `game-trail-fresh-${freshId}`;
  const previewTabId = profile === 'keep' ? 'game-trial-keep' : `game-trial-${freshId}`;
  const artifacts = [...(result?.artifacts ?? []), ...state.captures];
  const projectBusy = busy || state.running || service.phase === 'starting';
  const refresh = () => { preview.current?.reload(); setLoadedRevision(state.revision); };
  const run = (single = false) => { void act(() => window.workbench.game.run(single ? selected : scope === 'full' ? 'full' : 'quick')); };
  const copyReport = () => {
    if (!result) return;
    void act(async () => { await window.workbench.clipboard.write(gameProblemReport(state, result, browser.target?.url || service.url, viewport === 'fit' ? '跟随窗口' : viewport === 'desktop' ? '1440×1000' : '390×844', notes)); onPending('问题报告已复制，可粘贴到开发工具。'); });
  };
  return <section className="game-workspace" aria-label="轨迹侦探运行与测试">
    <header className="game-project glass">
      <img src={office} alt="轨迹侦探事务所" />
      <div className="game-project-name"><strong>轨迹侦探</strong><span title={state.config.root}>{state.config.root}</span></div>
      <span className={`game-service ${running ? 'is-ready' : ''}`} role="status"><Circle weight="fill" size={10} />{service.phase === 'starting' ? '正在启动…' : running ? `${service.owned ? '本地服务' : '外部服务'} · 运行中` : '本地服务 · 未运行'}</span>
      <div className="game-project-actions">
        {running ? <><button disabled={projectBusy || !service.owned} onClick={() => { void act(async () => { await window.workbench.game.stop(); await window.workbench.game.start(); setLoadedRevision(''); }); }}><ArrowClockwise />重启</button><button disabled={projectBusy} onClick={() => { void act(() => window.workbench.game.stop()); }}><Stop />{service.owned ? '停止' : '断开'}</button></> : <button className="game-primary" disabled={projectBusy || !!state.sourceError} onClick={() => { setLoadedRevision(state.revision); void act(() => window.workbench.game.start()); }}><Play weight="fill" />启动游戏</button>}
        <button className="game-icon-button" title="打开项目目录" aria-label="打开项目目录" onClick={() => { void act(() => window.workbench.game.open('root')); }}><FolderOpen /></button>
        <button disabled={projectBusy || running} title={running ? '停止服务后可修改项目设置' : '项目设置'} onClick={() => setSettings(true)}><GearSix /><span>项目设置</span></button>
        <button ref={terminalToggle} aria-expanded={terminalOpen} aria-controls="game-project-terminal" onClick={() => { setTerminalEntered(true); setTerminalOpen(!terminalOpen); }}><TerminalWindow />终端</button>
        <button className="game-test-toggle" aria-expanded={testsOpen} onClick={() => setTestsOpen(!testsOpen)}><ClipboardText />{testsOpen ? '收起检查' : '展开检查'}</button>
      </div>
    </header>
    {failure || state.sourceError || service.phase === 'error' ? <div className="game-error" role="alert"><WarningCircle /><span>{failure || state.sourceError || service.message}</span>{service.phase === 'error' ? <button disabled={projectBusy} onClick={() => { void act(() => window.workbench.game.connect()); }}>连接已有服务</button> : null}</div> : null}
    {sourceChanged ? <div className="game-update" role="status">代码已变化 · 刷新查看最新画面，上次测试结果需重新验证。<button disabled={!running} onClick={refresh}>刷新试玩</button></div> : null}
    <div className="game-panels"><div className={`game-grid${testsOpen ? '' : ' tests-hidden'}`}>
      <section className="game-preview glass" aria-label="游戏预览">
        <div className="game-pane-heading"><strong><Globe />游戏预览 <small>（本地）</small></strong><span>使用独立的本地试玩存档</span></div>
        <div className="game-preview-toolbar">
          <button className="game-icon-button" disabled={!browser.canGoBack || !running} title="后退" aria-label="后退" onClick={() => preview.current?.back()}><ArrowLeft /></button>
          <button className="game-icon-button" disabled={!browser.canGoForward || !running} title="前进" aria-label="前进" onClick={() => preview.current?.forward()}><ArrowRight /></button>
          <button className="game-icon-button" disabled={!running} title="刷新试玩" aria-label="刷新试玩" onClick={refresh}><ArrowClockwise /></button>
          <span className="game-address" title={browser.target?.url || service.url}>{browser.target?.url || service.url || `127.0.0.1:${state.config.port}`}</span>
          <GameSelect aria-label="预览尺寸" value={viewport} onChange={setViewport} options={[{ value: 'fit', label: '跟随窗口' }, { value: 'desktop', label: '桌面 1440×1000' }, { value: 'narrow', label: '窄屏 390×844' }]} />
          <GameSelect aria-label="试玩存档" value={profile} onChange={value => { if (value === 'fresh') setFreshId(crypto.randomUUID()); setProfile(value); }} options={[{ value: 'keep', label: '保留试玩档' }, { value: 'fresh', label: '新档试玩' }]} />
          <button className="game-icon-button" disabled={!running || busy} aria-label="截图记录问题" title="截图记录问题" onClick={() => { void act(async () => { await window.workbench.game.capture(previewTabId); onPending('试玩截图已保存到 Ono，可在附件中打开。'); }); }}><Camera /></button>
          <button className="game-icon-button" disabled={!running} aria-label="在外部浏览器打开" title="在外部浏览器打开（使用该浏览器自己的存档）" onClick={() => { void act(() => window.workbench.game.open('preview')); }}><Globe /></button>
        </div>
        {running ? <GamePreview key={`${service.url}:${workspace}`} url={service.url} workspace={workspace} tabId={previewTabId} viewport={viewport} apiRef={preview} onState={setBrowser} /> : <div className="game-preview-empty"><img src={office} alt="雨窗前的侦探事务所" /><h1>轨迹侦探</h1><p>{state.sourceError ? '请在项目设置中核对目录。' : '启动游戏，在这里直接试玩最新代码。'}</p><button onClick={() => { void act(() => window.workbench.game.open('docs')); }}>查看项目运行说明</button></div>}
        <div className="game-preview-footer"><span><Circle weight="fill" size={9} />{service.message}</span><span>{browser.loading && running ? '页面载入中…' : running ? '人工试玩 · 自动测试使用独立档案' : '代码继续在现有开发工具中修改'}</span></div>
      </section>
      {testsOpen ? <aside className="game-tests glass" aria-label="测试检查">
        <div className="game-pane-heading"><strong><ClipboardText />测试检查</strong><button className="game-icon-button" aria-label="收起测试栏" title="收起测试栏" onClick={() => setTestsOpen(false)}><Minus /></button></div>
        <p className="game-pane-description">运行项目现有测试，查看结果与日志。</p>
        <Segmented aria-label="测试范围" value={scope} onChange={value => { setScope(value); setSelected(value === 'full' ? 'playthrough' : 'rules'); }} options={[{ value: 'quick', label: '快速检查（5项）' }, { value: 'full', label: '完整通关' }]} />
        <div className="game-test-scroll">
          {scope === 'full' ? <p className="game-quick-summary">快速检查：{passed}/5 项通过</p> : null}
          <div className="game-task-list">{GAME_TASKS.filter(task => task.group === scope).map(task => {
            const record = state.results[task.id];
            const outdated = gameResultStale(record, state.revision);
            const status = record?.status ?? 'idle';
            return <button key={task.id} className={`game-task ${selected === task.id ? 'selected' : ''}`} aria-pressed={selected === task.id} onClick={() => setSelected(task.id)}>
              <span className={`game-status-icon ${outdated ? 'stale' : status}`}>{status === 'passed' ? <CheckCircle weight="fill" /> : status === 'failed' ? <XCircle weight="fill" /> : <Circle weight={status === 'running' ? 'duotone' : 'regular'} />}</span><span>{task.label}</span><small>{outdated ? '待重测' : STATUS[status]}</small>
            </button>;
          })}</div>
          <div className="game-result" aria-live="polite">
            <span className="game-script">{task.script}</span>
            {stale ? <p className="game-update">代码已变化，上次结果仅供参考。</p> : null}
            <p className={`game-result-message ${result?.status === 'failed' ? 'failed' : ''}`}>{result?.message || '尚未运行此项检查。'}</p>
            {result?.startedAt ? <span className="game-result-time">{new Date(result.startedAt).toLocaleString('zh-CN')} · {Math.max(0, Math.round(((result.finishedAt ?? clock) - result.startedAt) / 1000))} 秒</span> : null}
            {result?.status === 'failed' ? <div className="game-next"><strong>下一步</strong><p>查看原始输出，并在试玩中核对对应流程。</p><p>复制问题报告，回开发工具修复后重新运行。</p></div> : null}
          </div>
          <div className="game-run-actions">{state.running ? <button disabled={busy} onClick={() => { void act(() => window.workbench.game.cancel()); }}><Stop />停止测试</button> : <>
            {result?.status === 'failed' ? <button className="game-primary" disabled={busy} onClick={copyReport}><ClipboardText />复制问题报告</button> : null}
            <button className={result?.status === 'failed' ? '' : 'game-primary'} disabled={busy} onClick={() => run()}><Play weight="fill" />{scope === 'full' ? '运行完整通关' : '运行快速检查'}</button>
            {scope === 'quick' && result ? <button disabled={busy} title="只重跑当前选中任务" onClick={() => run(true)}><ArrowClockwise />重跑此项</button> : null}
          </>}</div>
          <details className="game-detail" open={result?.status === 'failed' ? true : undefined}><summary>原始输出</summary><pre tabIndex={0}>{result?.output || '脚本暂无输出。运行状态以进程完成结果为准。'}</pre></details>
          <details className="game-detail"><summary>附件 · {artifacts.length ? `${artifacts.length} 项` : '暂无'}</summary>{artifacts.length ? artifacts.map(item => <button key={item.id} onClick={() => { void act(() => window.workbench.game.openArtifact(item.id)); }}><Camera />{item.name}</button>) : <p>脚本已生成的检查点截图和手动试玩截图显示在这里。</p>}</details>
          <details className="game-detail"><summary>补充问题描述</summary><label htmlFor="game-notes">复现步骤 / 期望表现 / 实际表现</label><textarea id="game-notes" className="resize-none" rows={4} value={notes} onChange={event => setNotes(event.target.value)} /><button disabled={!result || busy} onClick={copyReport}><ClipboardText />复制问题报告</button></details>
          <details className="game-detail"><summary>运行日志</summary><pre tabIndex={0}>{state.logs.join('\n') || '暂无服务日志'}</pre></details>
        </div>
        <p className="game-tests-footer">完整通关使用独立 Edge，不影响左侧试玩档。</p>
      </aside> : null}
    </div>
    {terminalEntered ? <GameTerminalPanel open={terminalOpen} close={() => { setTerminalOpen(false); terminalToggle.current?.focus(); }} onPending={onPending} /> : null}
    </div>
    {settings ? <ProjectSettings state={state} close={() => setSettings(false)} onSave={async config => { await window.workbench.game.configure(config); setLoadedRevision(''); }} /> : null}
  </section>;
}

export function GameHost({ active, focusTarget, onPending }: { active: boolean; focusTarget: RefObject<HTMLElement | null>; onPending(message: string): void }) {
  const [entered, setEntered] = useState(active);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) setEntered(true); }, [active]);
  useLayoutEffect(() => { if (!active && host.current && (document.activeElement === document.body || host.current.contains(document.activeElement))) focusTarget.current?.focus({ preventScroll: true }); }, [active, focusTarget]);
  if (!active && !entered) return null;
  return <div ref={host} className="game-host" hidden={!active} inert={!active} aria-hidden={!active} onFocusCapture={event => { if (!active) { (event.target as HTMLElement).blur(); focusTarget.current?.focus({ preventScroll: true }); } }}><GameView onPending={onPending} /></div>;
}
