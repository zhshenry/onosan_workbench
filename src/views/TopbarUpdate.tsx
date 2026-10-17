import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { CaretUp, CheckCircle, Circle, DownloadSimple, SpinnerGap, WarningCircle } from '@phosphor-icons/react';
import type { UpdateStatus } from '../../shared/contracts';
import { errorText } from '../ui/controls';

export function TopbarUpdate({ onOpen }: { onOpen(): void }) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), panel = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [status, setStatus] = useState<UpdateStatus | null>(null);
  const [version, setVersion] = useState(''), [error, setError] = useState(''), [notesError, setNotesError] = useState('');
  const [acting, setActing] = useState(false);
  const revision = useRef(0), pending = useRef(false), mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    const currentRevision = ++revision.current;
    const off = window.workbench.updater.onStatus(value => {
      revision.current++;
      setStatus(value); setError('');
    });
    void window.workbench.updater.status().then(value => {
      if (mounted.current && revision.current === currentRevision) setStatus(value);
    }, cause => { if (mounted.current && revision.current === currentRevision) setError(errorText(cause)); });
    void window.workbench.appInfo.about().then(info => { if (mounted.current) setVersion(info.version); }, () => {});
    return () => { mounted.current = false; revision.current++; off(); };
  }, []);
  useLayoutEffect(() => {
    if (!open || !panel.current || !trigger.current) return;
    const element = panel.current;
    const place = (): void => {
      const anchor = trigger.current!.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.right, window.innerWidth - 12) - element.offsetWidth);
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(12, Math.min(anchor.bottom + 8, window.innerHeight - element.offsetHeight - 12))}px`;
      element.style.setProperty('--update-pointer-left', `${Math.max(14, Math.min(anchor.left + anchor.width / 2 - left - 9, element.offsetWidth - 32))}px`);
    };
    place();
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({ preventScroll: true });
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !element.matches(':popover-open')) return;
      event.preventDefault(); event.stopPropagation();
      element.hidePopover(); trigger.current?.focus({ preventScroll: true });
    };
    window.addEventListener('resize', place);
    window.addEventListener('keydown', escape, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('keydown', escape, true); };
  }, [open]);

  const failed = !!error || status?.phase === 'error';
  const ready = status?.enabled && status.phase === 'ready';
  const busy = acting || status?.phase === 'checking' || status?.phase === 'downloading';
  const title = failed ? status ? '更新失败' : '无法读取更新状态' : !status ? '正在读取更新状态…'
    : !status.enabled ? '自动更新不可用' : status.phase === 'ready' ? '更新已就绪'
      : status.phase === 'downloading' ? '正在下载更新' : status.phase === 'checking' ? '正在检查更新'
        : status.phase === 'latest' ? '已是最新版本' : '应用更新';
  const message = error || (ready ? '新版本已下载，重启即可完成更新' : status?.message || '正在读取应用更新状态…');
  const action = !status && error ? '重新读取' : ready ? '重启并安装' : status?.phase === 'downloading' ? '下载中…' : status?.phase === 'checking' ? '检查中…' : '检查更新';
  const updateAction = async (): Promise<void> => {
    if (pending.current || busy || (status ? !status.enabled : !error)) return;
    pending.current = true; setActing(true); setError('');
    const currentRevision = revision.current;
    try {
      if (!status) {
        const value = await window.workbench.updater.status();
        if (mounted.current && revision.current === currentRevision) setStatus(value);
      } else if (ready) await window.workbench.updater.install();
      else await window.workbench.updater.check();
    } catch (cause) { if (mounted.current && revision.current === currentRevision) setError(errorText(cause)); }
    finally { pending.current = false; if (mounted.current) setActing(false); }
  };
  const spinning = status?.enabled && (status.phase === 'checking' || status.phase === 'downloading');
  const StatusIcon = failed ? WarningCircle : ready || status?.phase === 'latest' ? CheckCircle : spinning ? SpinnerGap : DownloadSimple;
  const accessibleLabel = `${title}${status?.version ? `，v${status.version}` : ''}${status?.phase === 'downloading' ? `，${status.progress}%` : ''}`;
  return <>
    <button ref={trigger} type="button" className="ibtn topbar-update" data-phase={failed ? 'error' : status?.enabled ? status.phase : 'disabled'}
      title={accessibleLabel} aria-label={`应用更新：${accessibleLabel}`} aria-haspopup="dialog" aria-expanded={open} aria-controls={id} popoverTarget={id}
      onClick={() => { if (!open) { setNotesError(''); onOpen(); } }}>
      <span className={spinning ? 'topbar-update-spin' : undefined}>{spinning ? <SpinnerGap size={18} /> : <DownloadSimple size={18} />}</span>
      {(ready || spinning || failed) && <Circle className="topbar-update-dot" size={8} weight="fill" aria-hidden="true" />}
    </button>
    <div ref={panel} id={id} className="topbar-update-popover" popover="auto" role="dialog" aria-label="应用更新"
      onToggle={event => setOpen(event.newState === 'open')}>
      <CaretUp className="topbar-update-pointer" size={20} weight="fill" aria-hidden="true" />
      <div className="topbar-update-heading" data-tone={failed ? 'error' : ready || status?.phase === 'latest' ? 'success' : 'info'}>
        <span className={`topbar-update-symbol${spinning ? ' topbar-update-spin' : ''}`}><StatusIcon size={31} weight={ready || failed ? 'fill' : 'regular'} aria-hidden="true" /></span>
        <div role="status" aria-live="polite" aria-atomic="true"><strong>{title}</strong>
          {(version || status?.version) && <span className="topbar-update-version" title={`${version ? `v${version}` : ''}${version && status?.version ? ' → ' : ''}${status?.version ? `v${status.version}` : ''}`}>
            {version && `v${version}`}{version && status?.version && ' → '}{status?.version && `v${status.version}`}
          </span>}
        </div>
      </div>
      <p className="topbar-update-message" role={failed ? 'alert' : undefined}>{message}</p>
      {status?.enabled && status.phase === 'downloading' && <div className="topbar-update-progress"><progress aria-label="更新下载进度" value={status.progress} max={100} /><span>{status.progress}%</span></div>}
      <button type="button" className="topbar-update-primary" disabled={!!busy || (status ? !status.enabled : !error)} aria-busy={acting} onClick={() => void updateAction()}>{action}</button>
      <button type="button" className="topbar-update-notes" onClick={() => { setNotesError(''); void window.workbench.updater.notes().catch(cause => { if (mounted.current) setNotesError(errorText(cause)); }); }}>查看更新说明</button>
      {notesError && <p className="topbar-update-link-error" role="alert">{notesError}</p>}
    </div>
  </>;
}
