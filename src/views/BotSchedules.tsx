import { useEffect, useId, useRef, useState } from 'react';
import { Clock, Pause, PencilSimple, Play, Plus, Trash } from '@phosphor-icons/react';
import type { BotSchedule } from '../../shared/bot-contracts';
import { localDay } from '../../shared/todo-contracts';
import { DatePicker, errorText, Modal, Segmented, TimePicker } from '../ui/controls';
import { BotContextMenu, type BotMenuPosition } from './BotContactMenu';

type ScheduleSpec = BotSchedule['spec'];
type Changes = Pick<BotSchedule, 'id' | 'title' | 'prompt' | 'spec'>;
type ScheduleDialog = { kind: 'edit'; schedule?: BotSchedule } | { kind: 'delete'; schedule: BotSchedule };
const api = window.workbench.bot;
const frequencies = [{ value: 'once', label: '一次' }, { value: 'daily', label: '每天' }, { value: 'interval', label: '固定间隔' }];

export function formatSchedule(spec: ScheduleSpec): string {
  if (spec.kind === 'once') return new Date(spec.at).toLocaleString('zh-CN');
  if (spec.kind === 'daily') return `每天 ${spec.time} · ${spec.timeZone}`;
  return `每 ${spec.minutes} 分钟`;
}

function ScheduleEditor({ schedule, botName, busy, error, close, save }: {
  schedule?: BotSchedule; botName: string; busy: boolean; error: string; close(): void; save(changes: Changes): void;
}) {
  const fieldId = useId(), original = schedule?.spec;
  const [id] = useState(() => schedule?.id ?? crypto.randomUUID());
  const [initialDate] = useState(() => original?.kind === 'once' ? new Date(original.at) : new Date(Date.now() + 3600000));
  const [title, setTitle] = useState(schedule?.title ?? ''), [prompt, setPrompt] = useState(schedule?.prompt ?? '');
  const [kind, setKind] = useState<ScheduleSpec['kind']>(original?.kind ?? 'once');
  const [date, setDate] = useState(localDay(initialDate));
  const [time, setTime] = useState(original?.kind === 'daily' ? original.time : initialDate.toTimeString().slice(0, 5));
  const [minutes, setMinutes] = useState(String(original?.kind === 'interval' ? original.minutes : 60));
  const [validation, setValidation] = useState('');
  const timeZone = original?.kind === 'daily' ? original.timeZone : Intl.DateTimeFormat().resolvedOptions().timeZone;

  function submit() {
    let spec: ScheduleSpec;
    if (kind === 'once') {
      if (original?.kind === 'once' && date === localDay(initialDate) && time === initialDate.toTimeString().slice(0, 5)) {
        spec = original;
      } else {
        const at = new Date(`${date}T${time}:00`);
        if (!(at.getTime() > Date.now())) { setValidation('请选择未来的执行时间'); return; }
        spec = { kind, at: at.toISOString() };
      }
    } else if (kind === 'daily') {
      spec = { kind, time, timeZone };
    } else {
      const interval = Number(minutes);
      if (!Number.isInteger(interval) || interval < 1 || interval > 525600) { setValidation('间隔须为 1 至 525600 之间的整数分钟'); return; }
      spec = { kind, minutes: interval };
    }
    setValidation('');
    save({ id, title: title.trim(), prompt: prompt.trim(), spec });
  }

  return <Modal title={schedule ? '编辑定时任务' : '新建定时任务'} className="bot-schedule-dialog" close={close} busy={busy}>
    <form className="bot-schedule-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy}>
        <div className="bot-schedule-field"><span>执行 Bot</span><strong>{botName}</strong></div>
        <label className="bot-schedule-field">任务名称<input aria-label="任务名称" autoFocus required maxLength={100} value={title} placeholder="例如，早间简报" onChange={event => setTitle(event.target.value)} /></label>
        <label className="bot-schedule-block">工作内容<textarea aria-label="工作内容" required rows={3} maxLength={10000} value={prompt} placeholder="希望这个 Bot 定时做什么？" onChange={event => setPrompt(event.target.value)} /></label>
        <div className="bot-schedule-block"><span>执行频率</span>
          <Segmented aria-label="执行频率" options={frequencies} value={kind} onChange={value => { setKind(value as ScheduleSpec['kind']); setValidation(''); }} />
          <div className="bot-schedule-time">
            {kind === 'once' && <div><label htmlFor={fieldId + '-date'}>日期</label><DatePicker id={fieldId + '-date'} value={date} onChange={setDate} clearable={false} /></div>}
            {kind === 'interval' ? <label>间隔分钟<input type="number" required min={1} max={525600} step={1} value={minutes} onChange={event => setMinutes(event.target.value)} /></label>
              : <div><label htmlFor={fieldId + '-time'}>时间</label><TimePicker id={fieldId + '-time'} value={time} onChange={setTime} /></div>}
          </div>
          <small className="bot-schedule-note">{validation ? <span role="alert">{validation}</span> : kind === 'daily' ? timeZone : null}</small>
        </div>
      </fieldset>
      {error && <p className="bot-error" role="alert">{error}</p>}
      <div className="actions"><button type="button" disabled={busy} onClick={close}>取消</button><button type="submit" className="primary" disabled={busy || !title.trim() || !prompt.trim()}>{busy ? '保存中…' : schedule ? '保存修改' : '创建定时任务'}</button></div>
    </form>
  </Modal>;
}

export function BotSchedules({ botId, botName, compact = false }: { botId: string; botName: string; compact?: boolean }) {
  const [schedules, setSchedules] = useState<BotSchedule[]>(), [reload, setReload] = useState(0);
  const [menu, setMenu] = useState<(BotMenuPosition & { schedule: BotSchedule })>();
  const [dialog, setDialog] = useState<ScheduleDialog>();
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let version = 0;
    const load = () => {
      const request = ++version;
      void api.listSchedules(botId).then(items => {
        if (request === version) setSchedules(items.sort((a, b) => Number(b.enabled) - Number(a.enabled) || Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt)));
      }, cause => { if (request === version) setError(errorText(cause)); });
    };
    load();
    const off = api.onChanged(event => { if (event.kind === 'schedule' && event.botId === botId) load(); });
    return () => { version++; off(); };
  }, [botId, reload]);

  async function run(job: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await job(); setDialog(undefined); }
    catch (cause) { setError(errorText(cause)); }
    finally { setBusy(false); }
  }
  function openMenu(schedule: BotSchedule, anchor: HTMLButtonElement, x?: number, y?: number) {
    if (busy) return;
    const rect = anchor.getBoundingClientRect();
    setMenu({ schedule, anchor, x: x ?? rect.left, y: y ?? rect.bottom });
  }
  function closeMenu() {
    menu?.anchor.focus({ preventScroll: true });
    setMenu(undefined);
  }
  function openDialog(next: ScheduleDialog) {
    closeMenu(); setError(''); setDialog(next);
  }
  function toggle(schedule: BotSchedule) {
    closeMenu();
    void run(() => api.setScheduleEnabled(schedule.id, schedule.revision, !schedule.enabled));
  }
  const closeDialog = () => { setDialog(undefined); setError(''); };

  return <section className={`bot-schedules${compact ? ' bot-schedules-profile' : ''}`} aria-label="定时任务" onKeyDown={event => {
    if (event.key === 'Escape' && dialog) event.stopPropagation();
  }}>
    <div className="bot-schedule-heading"><h3>定时任务</h3><button ref={addButton} type="button" aria-label="新建定时任务" disabled={busy} onClick={() => openDialog({ kind: 'edit' })}><Plus size={14} />新建</button></div>
    {!compact && <p className="bot-help">本机休眠或关机时暂停，恢复后合并补跑一次。退出界面后执行需启用独立后台。</p>}
    {!schedules && !error && <p className="bot-schedule-empty" role="status">正在读取定时任务…</p>}
    {schedules?.length === 0 && <p className="bot-schedule-empty is-empty">还没有定时任务</p>}
    {!!schedules?.length && <ul className="bot-schedule-list">{schedules.map(schedule => <li key={schedule.id} className="bot-schedule-row" onContextMenu={event => {
      event.preventDefault();
      const anchor = event.currentTarget.querySelector('button')!;
      if (event.clientX || event.clientY) openMenu(schedule, anchor, event.clientX, event.clientY);
      else openMenu(schedule, anchor);
    }}>
      <button className="bot-schedule-item" type="button" aria-label={schedule.title + '的操作'} aria-haspopup="menu" aria-expanded={menu?.schedule.id === schedule.id} disabled={busy}
        onClick={event => openMenu(schedule, event.currentTarget)} onKeyDown={event => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) { event.preventDefault(); openMenu(schedule, event.currentTarget); }
        }}>
        <Clock size={18} aria-hidden="true" /><span><strong>{schedule.title}</strong><small>{schedule.enabled ? formatSchedule(schedule.spec) : '已暂停 · ' + formatSchedule(schedule.spec)}</small>
          {!compact && schedule.enabled && <small>下次：{new Date(schedule.nextRunAt).toLocaleString('zh-CN')}</small>}</span>
      </button>
      <button type="button" className="toggle" role="switch" aria-label={schedule.title} aria-checked={schedule.enabled} disabled={busy}
        title={schedule.enabled ? '下次：' + new Date(schedule.nextRunAt).toLocaleString('zh-CN') : '已暂停'} onClick={() => toggle(schedule)} />
    </li>)}</ul>}
    {menu && <BotContextMenu {...menu} label="定时任务操作" close={() => setMenu(undefined)}>
      <button type="button" role="menuitem" onClick={() => toggle(menu.schedule)}>{menu.schedule.enabled ? <Pause size={16} /> : <Play size={16} />}{menu.schedule.enabled ? '暂停' : '启用'}</button>
      <button type="button" role="menuitem" onClick={() => openDialog({ kind: 'edit', schedule: menu.schedule })}><PencilSimple size={16} />编辑</button>
      <button type="button" role="menuitem" className="bot-menu-delete" onClick={() => openDialog({ kind: 'delete', schedule: menu.schedule })}><Trash size={16} />删除</button>
    </BotContextMenu>}
    {dialog?.kind === 'edit' && <ScheduleEditor schedule={dialog.schedule} botName={botName} busy={busy} error={error} close={closeDialog} save={changes => {
      const original = dialog.schedule;
      void run(() => api.saveSchedule({ ...changes, botId, revision: original?.revision ?? 0, enabled: original?.enabled ?? true }));
    }} />}
    {dialog?.kind === 'delete' && <Modal title="删除定时任务" className="confirm bot-schedule-delete" close={closeDialog} busy={busy}>
      <p>删除「{dialog.schedule.title}」后，这项任务将停止定时执行。</p>
      {error && <p className="bot-error" role="alert">{error}</p>}
      <div className="actions"><button type="button" autoFocus disabled={busy} onClick={closeDialog}>取消</button><button type="button" className="danger" disabled={busy} onClick={() => void run(async () => {
        await api.removeSchedule(dialog.schedule.id, dialog.schedule.revision);
        requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true }));
      })}>确认删除</button></div>
    </Modal>}
    {error && !dialog && <p role="alert" className="bot-error">{error}<button disabled={busy} onClick={() => { setError(''); setReload(n => n + 1); }}>重新读取</button></p>}
  </section>;
}
