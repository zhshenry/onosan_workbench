import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowCounterClockwise, CheckCircle, ClockCounterClockwise, DotsThree, ListChecks, Minus, Pause, Play, Plus, ShieldCheck, SpinnerGap, Stop, Trash, WarningCircle } from '@phosphor-icons/react';
import { Modal, Select, errorText } from '../../todo/ui/ui';
import type { BrowserClearData, BrowserSavedTab, BrowserTask, BrowserWorkspaceState } from '../../../shared/browser-automation-contracts';
import { browserClearDataSchema } from '../../../shared/browser-automation-contracts';
import { browserHistorySince, browserTimeOptions, filterBrowserHistory } from '../../../shared/browser-history';
import type { BrowserPaneProps } from './pane';
import { BrowserPane } from './pane';
import { BrowserTaskDetails, browserTaskLabels } from './task-record';

export { browserTaskLabels } from './task-record';

const api = () => window.workbench.browserAutomation;
const ZOOM_STEPS = [25, 33, 50, 67, 75, 80, 90, 100, 110, 125, 150, 175, 200, 250, 300, 400, 500];

/** The entire host stays mounted across workbench switches. Only URLs and IDs restore after restart. */
export function BrowserWorkspacePane(props: BrowserPaneProps) {
  const [saved, setSaved] = useState<BrowserWorkspaceState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (!api()) { setSaved({ tabs: [], activeId: '', history: [], tasks: [] }); return; }
    void api().state(props.workspace).then(value => { if (current) setSaved(value); }, cause => { if (current) setError(errorText(cause)); });
    return () => { current = false; };
  }, [props.workspace]);
  if (error) return <div className="mbp-error" role="alert">浏览器记录读取失败：{error}<button className="btn btn-sec" onClick={() => { setError(''); setSaved({ tabs: [], activeId: '', history: [], tasks: [] }); }}>打开新页面</button></div>;
  if (!saved) return <div className="mbp-start" role="status">正在恢复浏览器标签…</div>;
  return <BrowserPane {...props} savedTabs={saved.tabs} savedActiveId={saved.activeId} automation={!!api()} />;
}

export function BrowserAutomationBar({ workspace, tabId, url, ready, zoomFactor, onZoomChange, onRefreshZoom, onNavigate, onState }: {
  workspace: string; url?: string; ready: boolean; onNavigate(url: string): void; onState(task: BrowserTask | null): void;
  tabId?: string;
  zoomFactor: number; onZoomChange(factor: number): void; onRefreshZoom(): void;
}) {
  const [tasks, setTasks] = useState<BrowserTask[]>([]);
  const task = [...tasks].reverse().find(task => !tabId || task.tabIds.includes(tabId) || !ready && !task.tabIds.length && ['ready', 'running', 'paused', 'site-approval'].includes(task.status)) ?? null;
  const setTask = (task: BrowserTask) => setTasks(previous => [...previous.filter(item => item.id !== task.id), task].slice(-40));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'history' | 'tasks' | 'clear-site' | 'clear-history' | null>(null);
  const [state, setState] = useState<BrowserWorkspaceState | null>(null);
  const [origin, setOrigin] = useState('');
  const [historyQuery, setHistoryQuery] = useState(''), [historyRange, setHistoryRange] = useState('all'), [historyPage, setHistoryPage] = useState(0);
  const [clearKinds, setClearKinds] = useState<BrowserClearData['kinds']>(['history']), [clearRange, setClearRange] = useState('all'), [clearScope, setClearScope] = useState('current');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuId = useId(), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const history = useMemo(() => filterBrowserHistory(state?.history ?? [], historyQuery, browserHistorySince(historyRange)), [state?.history, historyQuery, historyRange]);
  const running = task && ['ready', 'running', 'paused', 'site-approval'].includes(task.status);
  const anyRunning = tasks.some(task => ['ready', 'running', 'paused', 'site-approval'].includes(task.status));
  const zoomPercent = Math.round(zoomFactor * 100);
  const smallerZoom = [...ZOOM_STEPS].reverse().find(value => value < zoomPercent), largerZoom = ZOOM_STEPS.find(value => value > zoomPercent);
  useEffect(() => {
    let mounted = true;
    void api().state(workspace).then(value => { if (mounted) { setState(value); setTasks(previous => [...value.tasks.filter(item => !previous.some(current => current.id === item.id)), ...previous].slice(-40)); } }, cause => { if (mounted) setError(errorText(cause)); });
    const unsubscribe = api().onTask(value => { if (value.workspace === workspace) { setTask(value); setState(previous => previous ? { ...previous, tasks: [...previous.tasks.filter(item => item.id !== value.id), value].slice(-40) } : previous); } });
    return () => { mounted = false; unsubscribe(); };
  }, [workspace]);
  useEffect(() => onState(task), [task, onState]);
  useLayoutEffect(() => {
    if (!menuOpen || !menu.current || !trigger.current) return;
    const element = menu.current, anchor = trigger.current.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(anchor.bottom + 6, window.innerHeight - element.offsetHeight - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const close = () => element.hidePopover();
    window.addEventListener('resize', close);
    return () => window.removeEventListener('resize', close);
  }, [menuOpen, task?.status]);
  useEffect(() => { if (menu.current?.matches(':popover-open')) menu.current.hidePopover(); }, [url]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const control = (action: 'pause' | 'resume' | 'cancel' | 'approve-site') => perform(async () => {
    if (task) { const next = await api().control(task.id, action, action === 'approve-site' ? task.pendingOrigin : undefined); setTask(next); onState(next); if (action === 'approve-site') menu.current?.hidePopover(); }
  });
  const zoom = (percent: number) => perform(async () => {
    if (task?.status === 'running') { const paused = await api().control(task.id, 'pause'); setTask(paused); onState(paused); }
    onZoomChange(percent / 100);
  });
  const open = (target: NonNullable<typeof panel>) => perform(async () => {
    menu.current?.hidePopover();
    const value = await api().state(workspace);
    setState(value);
    if (target === 'clear-site') {
      if (!url) throw new Error('请先打开要清理的站点。');
      setOrigin(new URL(url).origin); setClearKinds(['cookies', 'site-data']); setClearRange('all'); setClearScope('current');
    } else setOrigin('');
    setPanel(target);
  });
  return <div className="browser-automation">
    {task && <div className={`browser-task-controls${running ? ' is-active' : ''}`}>
      <button type="button" className={`browser-task-label ${task.status}`} title={browserTaskLabels[task.status]} aria-label={browserTaskLabels[task.status]} disabled={busy}
        onClick={() => task.status === 'site-approval' ? menu.current?.showPopover() : void open('tasks')}>
        {task.status === 'running' || task.status === 'ready' ? <SpinnerGap size={17} className="browser-task-spinner" /> : task.status === 'completed' ? <CheckCircle size={18} /> : task.status === 'paused' ? <Pause size={17} /> : task.status === 'cancelled' ? <Stop size={17} /> : task.status === 'site-approval' ? <ShieldCheck size={18} /> : <WarningCircle size={18} />}
        {running && <span role="status">{browserTaskLabels[task.status]}</span>}
      </button>
      {task.status === 'running' && <button type="button" className="mbp-navbtn" title="接管 / 暂停" aria-label="接管 / 暂停" disabled={busy} onClick={() => void control('pause')}><Pause size={16} /></button>}
      {task.status === 'paused' && <button type="button" className="mbp-navbtn" title="继续操作" aria-label="继续操作" disabled={busy} onClick={() => void control('resume')}><Play size={16} /></button>}
      {(running || task.status === 'unverified') && <button type="button" className="mbp-navbtn" title="停止任务" aria-label="停止任务" disabled={busy} onClick={() => void control('cancel')}><Stop size={16} weight="fill" /></button>}
    </div>}
    <button type="button" ref={trigger} className="mbp-navbtn browser-menu-trigger" title="浏览器选项" aria-label="浏览器选项" aria-haspopup="menu" aria-expanded={menuOpen} popoverTarget={menuId}><DotsThree size={22} weight="bold" /></button>
    <div ref={menu} id={menuId} className="browser-menu" popover="auto" role="menu" aria-label="浏览器选项" onToggle={event => { setMenuOpen(event.newState === 'open'); if (event.newState === 'open') onRefreshZoom(); }} onKeyDown={event => {
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = items.findIndex(item => item === document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>
      {task?.status === 'site-approval' && <div className="browser-site-approval" role="group" aria-label="站点授权"><strong>等待站点授权</strong><p>{task.pendingOrigin}</p><button type="button" role="menuitem" disabled={busy} onClick={() => void control('approve-site')}>允许此站点</button></div>}
      <button type="button" role="menuitem" disabled={busy} onClick={() => void open('history')}><ClockCounterClockwise size={18} />历史记录</button>
      <button type="button" role="menuitem" disabled={busy} onClick={() => void open('tasks')}><ListChecks size={18} />任务记录</button>
      <hr />
      <div className="browser-zoom" role="group" aria-label="网页缩放">
        <span>缩放</span>
        <div className="browser-zoom-steps">
          <button type="button" aria-label="缩小网页" title="缩小网页" disabled={busy || !ready || smallerZoom === undefined} onClick={() => smallerZoom !== undefined && void zoom(smallerZoom)}><Minus size={16} /></button>
          <output aria-label="当前网页缩放" aria-live="polite">{zoomPercent}%</output>
          <button type="button" aria-label="放大网页" title="放大网页" disabled={busy || !ready || largerZoom === undefined} onClick={() => largerZoom !== undefined && void zoom(largerZoom)}><Plus size={16} /></button>
        </div>
        <button type="button" aria-label="重置网页缩放" title="恢复 100%" disabled={busy || !ready || zoomPercent === 100} onClick={() => void zoom(100)}><ArrowCounterClockwise size={18} /></button>
      </div>
      <hr />
      <button type="button" role="menuitem" disabled={busy || !ready || anyRunning} onClick={() => void open('clear-site')}><Trash size={18} />清理当前站点数据…</button>
      <button type="button" role="menuitem" disabled={busy || anyRunning} onClick={() => { setClearKinds(['history']); setClearRange('all'); setClearScope('all'); void open('clear-history'); }}><Trash size={18} />清除浏览数据…</button>
    </div>
    {(error || task?.error || task?.persistenceError) && <div className="browser-toolbar-error" role="alert">{error || task?.error || task?.persistenceError}</div>}
    {panel && <Modal title={{ history: '浏览历史', tasks: '浏览器任务记录', 'clear-site': '清理站点数据', 'clear-history': '清空浏览历史' }[panel]} close={() => { if (!busy) { setPanel(null); setError(''); } }} className={`browser-dialog${panel === 'tasks' ? ' browser-task-dialog' : ''}`}>
      {panel === 'history' && <>
        <p>最近 5000 条访问记录；保留普通参数和锚点，含登录凭据的地址会脱敏。</p>
        <div className="browser-history-filters"><label htmlFor="browser-history-search">搜索历史</label><div className="browser-history-search"><input id="browser-history-search" type="search" placeholder="网页标题或网址" value={historyQuery} maxLength={300} onChange={event => { setHistoryQuery(event.target.value); setHistoryPage(0); }} />{historyQuery && <button aria-label="清空历史搜索" onClick={() => { setHistoryQuery(''); setHistoryPage(0); document.getElementById('browser-history-search')?.focus(); }}>清空</button>}</div>
          <label htmlFor="browser-history-range">时间范围</label><Select id="browser-history-range" aria-label="历史时间范围" value={historyRange} options={browserTimeOptions} onChange={value => { setHistoryRange(value); setHistoryPage(0); }} /></div>
        <div className="browser-records">{history.length ? history.slice(historyPage * 50, (historyPage + 1) * 50).map(item => <div className="browser-history-row" key={item.id}><button className="browser-history-item" onClick={() => { onNavigate(item.url); setPanel(null); }}><strong>{item.title || item.url}</strong><span>{item.url}</span><time>{new Date(item.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time></button><button className="btn btn-sec" aria-label={`删除历史：${item.title || item.url}`} disabled={busy} onClick={() => void perform(async () => { await api().deleteHistory(workspace, [item.id]); setState(await api().state(workspace)); setHistoryPage(0); })}>删除</button></div>) : <p>{state?.history.length ? '没有匹配的浏览记录。' : '还没有浏览记录。'}</p>}</div>
        <div className="browser-history-actions"><span role="status">{history.length} 条记录{history.length > 50 ? ` · 第 ${historyPage + 1} 页` : ''}</span><button className="btn btn-sec" disabled={!historyPage} onClick={() => setHistoryPage(page => page - 1)}>上一页</button><button className="btn btn-sec" disabled={(historyPage + 1) * 50 >= history.length} onClick={() => setHistoryPage(page => page + 1)}>下一页</button><button className="btn btn-sec" disabled={busy} onClick={() => { setClearKinds(['history']); setClearRange(historyRange); setClearScope('all'); setPanel('clear-history'); }}>清除浏览数据</button></div>
      </>}
      {panel === 'tasks' && <div className="browser-records">{state?.tasks.length ? [...state.tasks].reverse().map(item => <details key={item.id}><summary>{item.goal} · {browserTaskLabels[item.status]}</summary><BrowserTaskDetails task={item} /></details>) : <p>还没有任务记录。</p>}</div>}
      {(panel === 'clear-site' || panel === 'clear-history') && <div className="browser-clear-data">
        <p>只清理当前浏览器分区。清理 Cookie 后可能需要重新登录；Cookie 可能由同一主域的站点共享。已打开的标签保留。</p>
        {origin && <><label htmlFor="browser-clear-scope">站点范围</label><Select id="browser-clear-scope" aria-label="清理站点范围" value={clearScope} options={[{ value: 'current', label: `当前站点：${origin}` }, { value: 'all', label: '此浏览器分区的所有站点' }]} onChange={setClearScope} /></>}
        <fieldset><legend>选择要清理的数据</legend>{([['history', '浏览历史'], ['cookies', 'Cookie 和登录状态'], ['site-data', '站点存储'], ['cache', '缓存']] as const).map(([kind, label]) => <label key={kind}><input type="checkbox" checked={clearKinds.includes(kind)} onChange={event => setClearKinds(previous => event.target.checked ? [...previous, kind] : previous.filter(value => value !== kind))} />{label}</label>)}</fieldset>
        <label htmlFor="browser-clear-range">历史时间范围</label><Select id="browser-clear-range" aria-label="清理历史时间范围" disabled={!clearKinds.includes('history')} value={clearRange} options={browserTimeOptions} onChange={setClearRange} />
        {clearKinds.some(kind => kind !== 'history') && <p>时间范围仅用于浏览历史。Cookie、站点存储和缓存会清理所选站点的全部时间数据。</p>}
        <div className="browser-history-actions"><button className="btn btn-sec" disabled={busy} onClick={() => setPanel(null)}>取消</button><button className="btn btn-pri" disabled={busy || !clearKinds.length} onClick={() => void perform(async () => { await api().clearData(browserClearDataSchema.parse({ workspace, kinds: clearKinds, since: browserHistorySince(clearRange), ...(origin && clearScope === 'current' ? { origin: origin } : {}) })); setState(await api().state(workspace)); setPanel(null); })}>确认清理</button></div>
      </div>}
      {error && <p className="mbp-error" role="alert">{error}</p>}
    </Modal>}
  </div>;
}

export function restorableBrowserTabs(tabs: BrowserSavedTab[], initialUrl?: string, single = false): BrowserSavedTab[] {
  const safe = tabs.filter(tab => /^https?:\/\//.test(tab.url));
  return safe.length ? safe.slice(0, single ? 1 : 20) : [{ id: crypto.randomUUID(), url: initialUrl ?? '' }];
}
