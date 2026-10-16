import { useEffect, useRef, useState, type RefObject } from 'react';
import { CaretRight, CheckCircle, Globe, ShieldCheck } from '@phosphor-icons/react';
import type { ChatSession } from '../../../shared/todo-contracts';
import type { BrowserSiteApproval, BrowserTask } from '../../../shared/browser-automation-contracts';
import { errorText } from '../../todo/ui/ui';

export function useBrowserApprovalTasks(chat: ChatSession | null) {
  const chatId = chat?.id;
  const references = new Map(chat?.entries.flatMap(entry => entry.browserTask ? [[entry.browserTask.id, entry.browserTask] as const] : []));
  const referenceKey = JSON.stringify([...references.values()]);
  const [snapshot, setSnapshot] = useState<{ chatId?: string; tasks: Record<string, BrowserTask>; error: string }>({ tasks: {}, error: '' });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    if (!chatId || referenceKey === '[]') return;
    const refs: { id: string; workspace: string }[] = JSON.parse(referenceKey);
    const belongs = (task: BrowserTask): boolean => (!task.chatId || task.chatId === chatId) && refs.some(ref => ref.id === task.id && ref.workspace === task.workspace);
    let live = true;
    const changed = new Set<string>();
    const api = window.workbench.browserAutomation;
    setSnapshot({ chatId, tasks: {}, error: '' });
    const off = api.onTask(task => {
      if (!live || !belongs(task)) return;
      changed.add(task.id);
      setSnapshot(previous => ({ chatId, tasks: { ...previous.tasks, [task.id]: task }, error: '' }));
    });
    void Promise.all([...new Set(refs.map(ref => ref.workspace))].map(workspace => api.state(workspace))).then(states => {
      if (!live) return;
      setSnapshot(previous => ({ chatId, tasks: { ...Object.fromEntries(states.flatMap(state => state.tasks).filter(task => belongs(task) && !changed.has(task.id)).map(task => [task.id, task])), ...previous.tasks }, error: '' }));
    }, cause => { if (live) setSnapshot(previous => ({ ...previous, error: `无法读取站点授权：${errorText(cause)}` })); });
    return () => { live = false; off(); };
  }, [chatId, referenceKey, reload]);
  return {
    tasks: snapshot.chatId === chatId ? snapshot.tasks : {},
    error: snapshot.chatId === chatId ? snapshot.error : '',
    retry: () => setReload(value => value + 1),
    update: (task: BrowserTask, expectedOrigin: string) => setSnapshot(previous => previous.chatId === chatId && references.get(task.id)?.workspace === task.workspace
      && previous.tasks[task.id]?.status === 'site-approval' && previous.tasks[task.id]?.pendingOrigin === expectedOrigin
      ? { ...previous, tasks: { ...previous.tasks, [task.id]: task }, error: '' } : previous),
  };
}

export function BrowserSiteApprovalCard({ task, id, elementRef, onTask }: {
  task: BrowserTask; id: string; elementRef: RefObject<HTMLElement | null>; onTask(task: BrowserTask): void;
}) {
  const [working, setWorking] = useState<'approve-site' | 'cancel' | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const origin = task.pendingOrigin;
  const decide = async (action: 'approve-site' | 'cancel'): Promise<void> => {
    if (inFlight.current || task.status !== 'site-approval' || !origin) return;
    inFlight.current = true; setWorking(action); setError('');
    try { onTask(await window.workbench.browserAutomation.control(task.id, action, origin)); }
    catch (cause) { setError(errorText(cause)); }
    finally { inFlight.current = false; setWorking(null); }
  };
  if (task.status !== 'site-approval' || !origin) return null;
  return <section id={id} ref={elementRef} className="ai-site-approval" aria-label="站点授权" aria-busy={working !== null} tabIndex={-1}>
    <header><h3><span className="ai-site-approval-icon"><ShieldCheck size={20} /></span>站点授权</h3><span className="ai-site-approval-badge">待处理</span></header>
    <div className="ai-site-approval-body">
      <div className="ai-site-approval-site"><span className="ai-site-approval-icon"><Globe size={20} /></span><div><strong>{origin.replace(/^https?:\/\//, '')}</strong><span>{origin}</span></div></div>
      <p>允许 AI 在本次任务中访问并操作此站点。</p>
      <p className="ai-site-approval-scope">仅本次任务有效。</p>
      {error && <p className="ai-error" role="alert">{error}</p>}
    </div>
    <footer><button type="button" className="ai-discard" disabled={working !== null} onClick={() => void decide('cancel')}>{working === 'cancel' ? '正在停止…' : '不允许'}</button>
      <button type="button" className="ai-apply" disabled={working !== null} onClick={() => void decide('approve-site')}>{working === 'approve-site' ? '正在授权…' : '允许并继续'}</button></footer>
  </section>;
}

export function BrowserSiteApprovalReceipts({ task, onLocate, cardId }: { task: BrowserTask; onLocate(): void; cardId: string }) {
  const approvals: BrowserSiteApproval[] = task.siteApprovals ?? (task.status === 'site-approval' && task.pendingOrigin ? [{ origin: task.pendingOrigin, status: 'pending' }] : []);
  return <>{approvals.map((approval, index) => {
    const pending = approval.status === 'pending' && task.status === 'site-approval' && task.pendingOrigin === approval.origin;
    const label = pending ? '等待站点授权' : approval.status === 'allowed' ? task.status === 'running' ? '已授权，正在继续' : '已允许访问此站点' : approval.status === 'denied' ? '未授权，已停止本次任务' : '授权请求已失效';
    return <div className="ai-site-approval-receipt" key={`${approval.origin}:${index}`} role="status">
      {approval.status === 'allowed' ? <CheckCircle size={15} /> : <ShieldCheck size={15} />}<div><span>{label}</span><small>{approval.origin}</small></div>
      {pending && <button type="button" aria-controls={cardId} onClick={onLocate}>定位授权卡<CaretRight size={12} /></button>}
    </div>;
  })}</>;
}
