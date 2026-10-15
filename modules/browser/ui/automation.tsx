import { useEffect, useMemo, useState } from 'react';
import { Modal, Select, errorText } from '../../todo/ui/ui';
import type { BrowserClearData, BrowserSavedTab, BrowserTask, BrowserWorkspaceState } from '../../../shared/browser-automation-contracts';
import { browserClearDataSchema } from '../../../shared/browser-automation-contracts';
import { browserHistorySince, browserTimeOptions, filterBrowserHistory } from '../../../shared/browser-history';
import type { BrowserPaneProps } from './pane';
import { BrowserPane } from './pane';

const api = () => window.workbench.browserAutomation;
export const browserTaskLabels: Record<BrowserTask['status'], string> = { ready: '准备开始', running: 'AI 正在操作', paused: '已暂停 · 可手动操作', 'site-approval': '等待站点授权', completed: '页面条件验证通过', unverified: '执行结束 · 结果尚未验证', cancelled: '已停止', failed: '执行失败', interrupted: '任务已中断 · 请检查页面' };

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

export function BrowserAutomationBar({ workspace, url, ready, onNavigate, onState }: {
  workspace: string; url?: string; ready: boolean; onNavigate(url: string): void; onState(task: BrowserTask | null): void;
}) {
  const [task, setTask] = useState<BrowserTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [panel, setPanel] = useState<'history' | 'tasks' | 'clear-site' | 'clear-history' | null>(null);
  const [state, setState] = useState<BrowserWorkspaceState | null>(null);
  const [origin, setOrigin] = useState('');
  const [historyQuery, setHistoryQuery] = useState(''), [historyRange, setHistoryRange] = useState('all'), [historyPage, setHistoryPage] = useState(0);
  const [clearKinds, setClearKinds] = useState<BrowserClearData['kinds']>(['history']), [clearRange, setClearRange] = useState('all'), [clearScope, setClearScope] = useState('current');
  const history = useMemo(() => filterBrowserHistory(state?.history ?? [], historyQuery, browserHistorySince(historyRange)), [state?.history, historyQuery, historyRange]);
  const running = task && ['ready', 'running', 'paused', 'site-approval'].includes(task.status);
  useEffect(() => {
    let mounted = true;
    void api().state(workspace).then(value => { if (mounted) { setState(value); const latest = value.tasks.at(-1) ?? null; setTask(latest); onState(latest); } }, cause => { if (mounted) setError(errorText(cause)); });
    const unsubscribe = api().onTask(value => { if (value.workspace === workspace) { setTask(value); onState(value); } });
    return () => { mounted = false; unsubscribe(); };
  }, [workspace, onState]);
  const perform = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  };
  const control = (action: 'pause' | 'resume' | 'cancel' | 'approve-site') => perform(async () => {
    if (task) { const next = await api().control(task.id, action); setTask(next); onState(next); }
  });
  const open = (target: NonNullable<typeof panel>) => perform(async () => {
    const value = await api().state(workspace);
    setState(value);
    if (target === 'clear-site') {
      if (!url) throw new Error('请先打开要清理的站点。');
      setOrigin(new URL(url).origin); setClearKinds(['cookies', 'site-data']); setClearRange('all'); setClearScope('current');
    } else setOrigin('');
    setPanel(target);
  });
  return <div className="browser-automation">
    <div className="browser-task-status" role="status" aria-live="polite">
      <span>{task ? browserTaskLabels[task.status] : '直接在右侧 AI 助手说明要操作的内容。'}</span>
      {task?.status === 'running' && <button className="btn btn-sec" disabled={busy} onClick={() => void control('pause')}>接管 / 暂停</button>}
      {task?.status === 'paused' && <button className="btn btn-sec" disabled={busy} onClick={() => void control('resume')}>继续操作</button>}
      {task?.status === 'site-approval' && <><span className="browser-origin">{task.pendingOrigin}</span><button className="btn btn-sec" disabled={busy} onClick={() => void control('approve-site')}>允许此站点</button></>}
      {running && <button className="btn btn-sec" disabled={busy} onClick={() => void control('cancel')}>停止任务</button>}
      {task?.chatId && <span title={task.goal}>{task.steps.length} 条操作记录</span>}
    </div>
    <div className="browser-utilities">
      <button disabled={busy} onClick={() => void open('history')}>历史</button>
      <button disabled={busy} onClick={() => void open('tasks')}>任务记录</button>
      <button disabled={busy || !ready || Boolean(running)} onClick={() => void open('clear-site')}>清理当前站点数据</button>
      <span>密码、验证码和文件选择可暂停后手动完成</span>
    </div>
    {(error || task?.error || task?.persistenceError) && <div className="mbp-error" role="alert">{error || task?.error || task?.persistenceError}</div>}
    {panel && <Modal title={{ history: '浏览历史', tasks: '浏览器任务记录', 'clear-site': '清理站点数据', 'clear-history': '清空浏览历史' }[panel]} close={() => { if (!busy) { setPanel(null); setError(''); } }} className="browser-dialog">
      {panel === 'history' && <>
        <p>最近 5000 条访问记录；保留普通参数和锚点，含登录凭据的地址会脱敏。</p>
        <div className="browser-history-filters"><label htmlFor="browser-history-search">搜索历史</label><div className="browser-history-search"><input id="browser-history-search" type="search" placeholder="网页标题或网址" value={historyQuery} maxLength={300} onChange={event => { setHistoryQuery(event.target.value); setHistoryPage(0); }} />{historyQuery && <button aria-label="清空历史搜索" onClick={() => { setHistoryQuery(''); setHistoryPage(0); document.getElementById('browser-history-search')?.focus(); }}>清空</button>}</div>
          <label htmlFor="browser-history-range">时间范围</label><Select id="browser-history-range" aria-label="历史时间范围" value={historyRange} options={browserTimeOptions} onChange={value => { setHistoryRange(value); setHistoryPage(0); }} /></div>
        <div className="browser-records">{history.length ? history.slice(historyPage * 50, (historyPage + 1) * 50).map(item => <div className="browser-history-row" key={item.id}><button className="browser-history-item" onClick={() => { onNavigate(item.url); setPanel(null); }}><strong>{item.title || item.url}</strong><span>{item.url}</span><time>{new Date(item.at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</time></button><button className="btn btn-sec" aria-label={`删除历史：${item.title || item.url}`} disabled={busy} onClick={() => void perform(async () => { await api().deleteHistory(workspace, [item.id]); setState(await api().state(workspace)); setHistoryPage(0); })}>删除</button></div>) : <p>{state?.history.length ? '没有匹配的浏览记录。' : '还没有浏览记录。'}</p>}</div>
        <div className="browser-history-actions"><span role="status">{history.length} 条记录{history.length > 50 ? ` · 第 ${historyPage + 1} 页` : ''}</span><button className="btn btn-sec" disabled={!historyPage} onClick={() => setHistoryPage(page => page - 1)}>上一页</button><button className="btn btn-sec" disabled={(historyPage + 1) * 50 >= history.length} onClick={() => setHistoryPage(page => page + 1)}>下一页</button><button className="btn btn-sec" disabled={busy} onClick={() => { setClearKinds(['history']); setClearRange(historyRange); setClearScope('all'); setPanel('clear-history'); }}>清除浏览数据</button></div>
      </>}
      {panel === 'tasks' && <div className="browser-records">{state?.tasks.length ? [...state.tasks].reverse().map(item => <details key={item.id}><summary>{item.goal} · {browserTaskLabels[item.status]}</summary><p>{item.updatedAt} · {item.origins.join('、')}</p>{item.status === 'interrupted' && <p>重启只恢复地址和记录，不会自动重放网页操作；检查页面后在右侧 AI 助手重新提出操作要求。</p>}{item.steps.map((step, index) => <p key={index}>{step.operation} · {step.status === 'ok' ? '已返回' : '错误'} · {step.detail}</p>)}</details>) : <p>还没有任务记录。</p>}</div>}
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
