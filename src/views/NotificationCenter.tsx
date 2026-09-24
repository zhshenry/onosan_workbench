// 通知中心 v1(2026-09-24,派生式):不建事件存储,
// 内容 =「现在有什么需要我注意」——逾期待办 + AI 待确认建议,全部实时派生自现有数据。
// 系统级到点提醒仍由主进程轮询负责,这里只是应用内入口。
import { useEffect, useRef, useState } from 'react';
import { localDay, openToday, type Task } from '../../shared/todo-contracts';
import type { AiPendingProposal } from '../../shared/contracts';
import { errorText } from '../../modules/todo/ui/ui';
import { IconBell } from '../icons';

const wb = window.workbench;

function timeLabel(task: Task, clock: Date): string {
  if (task.dueAt) {
    const d = new Date(task.dueAt);
    const sameDay = localDay(d) === localDay(clock);
    const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    return sameDay ? hhmm : `${d.getMonth() + 1}月${d.getDate()}日`;
  }
  return task.plannedDate;
}

export function NotificationBell({ tasks, clock, onOpenHome, onOpenAi }: {
  tasks: Task[];
  clock: Date;
  onOpenHome(): void;
  onOpenAi(): void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<AiPendingProposal[]>([]);
  const [error, setError] = useState('');
  const popRef = useRef<HTMLElement>(null);
  const pendingRequest = useRef(0);

  // 逾期:已到期未完成(与首页统计同口径)
  const today = localDay(clock);
  const overdue = openToday(tasks, today).filter((t) =>
    t.dueAt ? Date.parse(t.dueAt) < clock.getTime() : new Date(`${t.plannedDate}T23:59:59`).getTime() < clock.getTime(),
  );
  const aiCount = pending.reduce((sum, p) => sum + p.count, 0);
  const badge = overdue.length + aiCount;

  const reloadPending = (): void => {
    const request = ++pendingRequest.current;
    void wb.ai.pending().then(
      (items) => { if (request === pendingRequest.current) { setPending(items); setError(''); } },
      (e) => { if (request === pendingRequest.current) setError(errorText(e)); },
    );
  };

  useEffect(() => {
    reloadPending();
    let timer: number | undefined;
    const schedule = (): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout(reloadPending, 150);
    };
    const off = wb.ai.onChat(schedule);
    window.addEventListener('focus', reloadPending);
    const poll = window.setInterval(reloadPending, 15000);
    return () => {
      pendingRequest.current++;
      window.clearTimeout(timer);
      window.clearInterval(poll);
      window.removeEventListener('focus', reloadPending);
      off();
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    reloadPending();
    // 点击 popover 外部关闭
    const onDown = (e: MouseEvent): void => {
      if (!popRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const timer = window.setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open]);

  return (
    <>
      <button className={open ? 'ibtn on' : 'ibtn'} title="通知" aria-pressed={open}
        onClick={() => setOpen((v) => !v)}>
        <IconBell />
        {badge > 0 && <span className="bdg">{badge > 99 ? '99+' : badge}</span>}
      </button>
      {open && (
        <aside className="notif-pop" ref={popRef} role="dialog" aria-label="通知中心">
          <header className="notif-head">
            <b>通知</b>
            <span className="notif-sub">{badge > 0 ? `${badge} 项待处理` : '全部清爽'}</span>
          </header>

          {overdue.length > 0 && (
            <section className="notif-group">
              <h4 className="notif-title danger">逾期待办 · {overdue.length}</h4>
              {overdue.slice(0, 5).map((t) => (
                <button key={t.id} className="notif-item" onClick={() => { setOpen(false); onOpenHome(); }}>
                  <span className="n-title">{t.title}</span>
                  <span className="n-meta over">逾期 · {timeLabel(t, clock)}</span>
                </button>
              ))}
              {overdue.length > 5 && <p className="notif-more">还有 {overdue.length - 5} 项,去首页处理</p>}
            </section>
          )}

          {pending.length > 0 && (
            <section className="notif-group">
              <h4 className="notif-title">AI 待确认 · {aiCount}</h4>
              {pending.map((p) => (
                <button key={p.chatId} className="notif-item" onClick={() => { setOpen(false); onOpenAi(); }}>
                  <span className="n-title">{p.chatTitle}</span>
                  <span className="n-meta">{p.count} 条建议待确认</span>
                </button>
              ))}
            </section>
          )}

          {badge === 0 && (
            <div className="notif-empty">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.2" /><path d="m8.8 12.4 2.2 2.2 4.4-4.8" /></svg>
              <p>没有逾期,也没有待确认的 AI 建议。</p>
            </div>
          )}
          {error && <p className="notif-error" role="alert">{error}</p>}
        </aside>
      )}
    </>
  );
}
