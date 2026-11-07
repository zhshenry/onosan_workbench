import { Activity, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AlignLeft, AlignRight, AlignTop, ArrowSquareOut, CalendarBlank, CaretLeft, CaretRight, CaretUp, Check, Drop, Folder, GearSix, Minus, PersonSimpleWalk, PushPin, Sparkle, SquaresFour, X } from '@phosphor-icons/react';
import { focusRemaining, inTimeRange, islandPage, islandPages, islandSize, ISLAND_DOCKS, ISLAND_DOCK_LABELS, ISLAND_LABELS, ISLAND_MOTION_MS, ISLAND_QUOTA_LABELS, ISLAND_QUOTA_PROVIDERS, type IslandDock, type IslandMode, type IslandPage, type IslandReminder, type IslandState, type QuotaProvider, type QuotaWindow } from '../../shared/island-contracts';
import { quotaDisplayWindows } from '../../shared/island-quota';
import { localDay, type Task } from '../../shared/todo-contracts';
import type { TodoState } from '../../shared/workbench-api';
import { errorText, IconButton, Select, Segmented } from '../ui/controls';
import { IslandMascot as Mascot } from '../ui/IslandMascot';
import { useIslandState } from './island-state';
import { IslandShelf } from './IslandShelf';
import { GameOptionsMenu } from './GameOptionsMenu';
import { IslandAgentMessages, IslandMessageEntry } from './IslandAgentMessages';
import './desktop-island.css';

const icons = { schedule: CalendarBlank, files: Folder, quota: Sparkle, tools: SquaresFour };
const dockIcons = { top: AlignTop, left: AlignLeft, right: AlignRight };
const dockOptions = ISLAND_DOCKS.map(value => ({ value, label: ISLAND_DOCK_LABELS[value] }));
const clockText = (value: number | Date) => new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const countdown = (ms: number) => `${String(Math.floor(Math.ceil(ms / 1000) / 60)).padStart(2, '0')}:${String(Math.ceil(ms / 1000) % 60).padStart(2, '0')}`;
type Run = (action: () => Promise<unknown>) => Promise<boolean>;

export function DesktopIslandApp() {
  const { state, setState, error, setError } = useIslandState();
  const [data, setData] = useState<TodoState | null>(null), [dataError, setDataError] = useState('');
  const [quotas, setQuotas] = useState<QuotaProvider[]>([]), [now, setNow] = useState(Date.now());
  const [quotaSelection, setQuotaSelection] = useState<QuotaProvider['id'] | null>(null);
  const [busy, setBusy] = useState(false), [notices, setNotices] = useState(false), [dragging, setDragging] = useState(false);
  const [agendaDay, setAgendaDay] = useState(() => localDay());
  const busyRef = useRef(false), pointerInside = useRef(false), currentMode = useRef(state?.mode);
  useLayoutEffect(() => { currentMode.current = state?.mode; }, [state?.mode]);
  const beforeDrag = useRef<{ page: IslandPage | null; mode: IslandMode } | null>(null);
  const root = useRef<HTMLElement>(null), summaryButton = useRef<HTMLButtonElement>(null), mascotButton = useRef<HTMLButtonElement>(null), navigation = useRef<HTMLElement>(null);
  const api = window.workbench.island;
  const page = state ? islandPage(state.settings) : null;
  const pages = state ? islandPages(state.settings) : [], pageOrder = pages.join(',');
  useLayoutEffect(() => {
    const node = navigation.current, selected = node?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    if (!node || !selected) return;
    const position = () => {
      node.style.setProperty('--island-tab-left', `${selected.offsetLeft}px`);
      node.style.setProperty('--island-tab-width', `${selected.offsetWidth}px`);
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(node); observer.observe(selected);
    return () => observer.disconnect();
  }, [page, pageOrder, state?.mode, notices]);
  const syncHold = () => api.hold(pointerInside.current || Boolean(root.current?.querySelector('.island-speech:focus-within, .island-messages:focus-within')));
  const run: Run = async action => {
    if (busyRef.current) return false;
    busyRef.current = true; setBusy(true); setError(''); api.hold(true);
    try { await action(); return true; } catch (e) { setError(errorText(e)); return false; }
    finally { busyRef.current = false; setBusy(false); syncHold(); }
  };
  const loadTasks = () => window.workbench.todo.state().then(next => { setData(next); setDataError(''); }, () => setDataError('暂时无法读取 To-Do-List'));
  const mode = (next: IslandMode) => { currentMode.current = next; void api.mode(next, window.matchMedia('(prefers-reduced-motion: reduce)').matches).catch(e => setError(errorText(e))); };
  const closeMessages = () => { mode(state?.pinned ? 'expanded' : 'collapsed'); setTimeout(() => (state?.pinned ? root.current?.querySelector<HTMLButtonElement>('.island-footer .island-mascot-entry') : mascotButton.current)?.focus(), 250); };
  useLayoutEffect(() => { if (state?.mode === 'messages') root.current?.querySelector<HTMLButtonElement>('.island-messages .segmented button[aria-checked="true"]')?.focus(); }, [state?.mode]);
  useLayoutEffect(() => {
    const node = document.documentElement;
    if (!state) return;
    const enter = (event?: MouseEvent) => { pointerInside.current = true; api.hold(true); const target = event && document.elementFromPoint?.(event.clientX, event.clientY); if (target?.closest('.island-mascot-entry') || root.current?.querySelector('.island-mascot-entry:hover')) return; if (currentMode.current === 'collapsed' && state.settings.hoverPreview) mode('expanded'); };
    const exit = () => { pointerInside.current = false; syncHold(); if (!state.pinned && currentMode.current !== 'collapsed' && currentMode.current !== 'speech') mode('collapsed'); };
    // The native document boundary includes portal menus and survives summary replacement.
    node.addEventListener('mouseenter', enter); node.addEventListener('mouseleave', exit);
    if (node.matches(':hover')) enter(); else exit();
    return () => { node.removeEventListener('mouseenter', enter); node.removeEventListener('mouseleave', exit); };
  }, [state?.pinned, state?.settings.hoverPreview]);
  useLayoutEffect(() => { document.documentElement.classList.add('island-document'); document.title = '桌面灵动岛'; return () => document.documentElement.classList.remove('island-document'); }, []);
  useLayoutEffect(() => {
    const scale = () => document.documentElement.style.setProperty('--island-scale', String(window.innerWidth / window.outerWidth || 1));
    scale(); window.addEventListener('resize', scale);
    return () => { window.removeEventListener('resize', scale); document.documentElement.style.removeProperty('--island-scale'); };
  }, []);
  useLayoutEffect(() => {
    const bubble = state?.mode === 'speech' ? root.current?.querySelector('.island-speech') : null;
    if (!bubble) return;
    const sync = () => api.speechHeight(Math.ceil(bubble.getBoundingClientRect().height * window.outerWidth / window.innerWidth));
    sync(); const observer = new ResizeObserver(sync); observer.observe(bubble);
    window.addEventListener('resize', sync);
    return () => { observer.disconnect(); window.removeEventListener('resize', sync); };
  }, [state?.mode, state?.settings.dock]);
  useLayoutEffect(() => {
    const panel = state?.mode === 'messages' ? root.current?.querySelector<HTMLElement>('.island-messages') : null, entry = mascotButton.current;
    if (!panel || !entry) return;
    const align = () => {
      const box = panel.getBoundingClientRect(), anchor = entry.getBoundingClientRect(), scale = box.width / panel.offsetWidth || 1;
      panel.style.setProperty('--agent-tail-x', `${Math.max(0, Math.min(panel.offsetWidth - 20, (anchor.left + anchor.width / 2 - box.left) / scale - 10))}px`);
      panel.style.setProperty('--agent-tail-y', `${Math.max(0, Math.min(panel.offsetHeight - 20, (anchor.top + anchor.height / 2 - box.top) / scale - 10))}px`);
    };
    align(); const observer = new ResizeObserver(align); observer.observe(panel); observer.observe(entry); window.addEventListener('resize', align);
    return () => { observer.disconnect(); window.removeEventListener('resize', align); };
  }, [state?.mode, state?.settings.dock]);
  useEffect(() => {
    let alive = true;
    const load = () => { if (alive) void loadTasks(); };
    load(); const off = window.workbench.todo.onChanged(load);
    const tick = setInterval(() => setNow(Date.now()), 1000), poll = setInterval(load, 5000);
    window.addEventListener('focus', load);
    return () => { alive = false; off(); clearInterval(tick); clearInterval(poll); window.removeEventListener('focus', load); };
  }, []);
  useEffect(() => { let alive = true; void api.quotas().then(q => { if (alive) setQuotas(q); }); return () => { alive = false; }; }, [state]);
  useEffect(() => { if (page === 'quota' && state?.mode === 'expanded') void api.quotaRefresh().then(setQuotas).catch(e => setError(errorText(e))); }, [page, state?.mode]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (root.current?.querySelector('[aria-expanded="true"]:not(.island-mascot-entry)')) return;
      if (state?.mode === 'messages') closeMessages();
      else if (notices) setNotices(false);
      else if (!state?.pinned) { api.hold(false); mode('collapsed'); setTimeout(() => summaryButton.current?.focus(), 250); }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [state?.pinned, state?.mode, notices]);
  if (!state) return <main className="desktop-island island-loading" role="status">{error || '正在打开灵动岛…'}</main>;
  const tasks = data?.tasks.filter(t => !t.deletedAt) ?? [], open = tasks.filter(t => t.status !== 'done');
  const today = localDay(new Date(now)), schedules = open.filter(t => t.kind === 'meeting' && t.plannedDate === today).sort((a, b) => (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z'));
  const next = schedules.find(t => !t.endAt || Date.parse(t.endAt) > now);
  const Icon = page ? icons[page] : GearSix;
  const expanded = state.mode === 'expanded';
  const speech = state.mode === 'speech';
  const messagesOpen = state.mode === 'messages';
  const SpeechTail = state.settings.dock === 'top' ? CaretUp : state.settings.dock === 'left' ? CaretLeft : CaretRight;
  const changePage = (nextPage: IslandPage) => { setNotices(false); void run(async () => { setState(await api.patch({ lastPage: nextPage })); }); };
  const navigate = (task?: Task) => run(() => api.navigate({ view: 'home', ...(task ? { taskId: task.id } : {}) }));
  const viewQuota = (reminder: IslandReminder) => run(async () => {
    const provider = ISLAND_QUOTA_PROVIDERS.find(id => reminder.id.startsWith(`quota:${id}:`));
    if (provider) setQuotaSelection(provider);
    await api.patch({ lastPage: 'quota' }); await api.mode('expanded'); await api.dismiss(reminder.id);
  });
  const scheduleSummary = dataError ? '日程暂不可用' : !data ? '正在读取日程…' : next ? `${next.dueAt ? clockText(Date.parse(next.dueAt)) : '当日安排'} ${next.title}` : '今天暂无日程';
  const [width, height] = islandSize(state.mode, state.settings.dock);
  const motionStyle = { '--island-width': `${width}px`, '--island-height': `${height}px`, '--island-duration': `${ISLAND_MOTION_MS[state.mode]}ms` } as CSSProperties;
  return <div className="island-viewport"><main ref={root} className={`desktop-island is-${state.mode}${dragging ? ' is-dropping' : ''}`} style={motionStyle} data-page={page ?? 'none'} data-dock={state.settings.dock} data-reduced-motion={state.settings.reducedMotion || state.quiet} onFocusCapture={syncHold} onBlurCapture={() => setTimeout(syncHold, 0)}
    onDragOver={event => { if (!event.dataTransfer.types.includes('Files') || !state.settings.pages.files) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; api.hold(true); if (!beforeDrag.current) { beforeDrag.current = { page, mode: state.mode }; void api.patch({ lastPage: 'files' }); mode('expanded'); } setDragging(true); }}
    onDragLeave={event => { if (event.relatedTarget && root.current?.contains(event.relatedTarget as Node)) return; const box = root.current?.getBoundingClientRect(); if (box && event.clientX > box.left && event.clientX < box.right && event.clientY > box.top && event.clientY < box.bottom) return; if (!beforeDrag.current) return; const previous = beforeDrag.current; beforeDrag.current = null; setDragging(false); api.hold(false); if (previous.page) void api.patch({ lastPage: previous.page }); mode(state.pinned ? previous.mode : 'collapsed'); }}
    onDrop={event => { if (!event.dataTransfer.types.includes('Files')) return; event.preventDefault(); setDragging(false); beforeDrag.current = null; api.hold(false); const paths = Array.from(event.dataTransfer.files).map(file => api.filePath(file)).filter(Boolean); if (paths.length) void run(async () => { setState(await api.filesAdd(paths)); }); }}>
    <div className="island-body">
    {!expanded && state.mode !== 'reminder' && <>
      <div className="island-summary-row">
        <IslandMessageEntry state={state} buttonRef={mascotButton} onClick={() => messagesOpen ? closeMessages() : mode('messages')} />
        <button ref={summaryButton} type="button" className="island-summary" onMouseEnter={() => { if (state.settings.hoverPreview && currentMode.current === 'collapsed') { pointerInside.current = true; api.hold(true); mode('expanded'); } }} onClick={() => page ? mode('expanded') : void run(() => api.navigate({ view: 'settings-island' }))} aria-label={page ? '展开桌面灵动岛' : '打开桌面灵动岛设置'} aria-describedby="island-summary-details">
          <span id="island-summary-details" className="island-summary-details">
            <span className="island-summary-schedule" title={dataError || scheduleSummary}><CalendarBlank size={16} /><span>{scheduleSummary}</span></span>
            <span className="island-quota-summary">{ISLAND_QUOTA_PROVIDERS.map(id => {
              const quota = quotas.find(q => q.id === id), provider = ISLAND_QUOTA_LABELS[id];
              const stale = Boolean(quota?.windows.length) && (quota?.status === 'error' || Boolean(quota?.updatedAt && now - quota.updatedAt > 600000));
              const windows = quotaDisplayWindows(quota?.windows ?? []);
              const status = windows.length ? stale ? '待更新' : '' : !quota ? '读取中' : quota.status === 'connecting' ? '连接中' : quota.status === 'error' ? '暂不可用' : quota.status === 'unsupported' ? '未提供' : '未连接';
              return <span key={id} data-provider={id} className={stale ? 'stale' : ''} title={`${provider} ${windows.map(w => `${w.label} 剩余 ${w.remaining}%`).join('；')} ${status}`}><span className="island-quota-caption"><span className="island-quota-provider">{provider}</span>{status && <span className="island-quota-value">{status}</span>}</span><QuotaRings windows={windows} compact /></span>;
            })}</span>
          </span>
        </button>
      </div>
    </>}
    {speech && <section className="island-speech" role="status" aria-live="polite" aria-label="圆环伙伴提醒"><SpeechTail className="island-speech-tail" size={20} weight="fill" aria-hidden="true" />{error && <p className="island-speech-error" role="alert">{error}</p>}<ReminderList state={state} tasks={tasks} busy={busy} run={run} navigate={navigate} viewQuota={viewQuota} speech /></section>}
    {messagesOpen && <section className="island-messages" role="dialog" aria-labelledby="island-messages-title"><SpeechTail className="island-speech-tail" size={20} weight="fill" aria-hidden="true" />{error && <p className="island-speech-error" role="alert">{error}</p>}<IslandAgentMessages state={state} busy={busy} run={run} close={closeMessages} showReminders={() => { setNotices(true); mode('expanded'); }} now={now} /></section>}
    <Activity mode={state.mode === 'collapsed' || speech || messagesOpen ? 'hidden' : 'visible'}><div className="island-panel">
      <header className="island-header"><span className="island-section-label"><Icon size={16} />{state.mode === 'reminder' ? '提醒' : page ? ISLAND_LABELS[page] : '桌面灵动岛'}</span><time>{new Date(now).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' })}<b>{clockText(now)}</b></time><div className="island-header-actions">
        {expanded && <><Select className="island-dock-select" menuClassName="island-dock-menu" aria-label="停靠位置" title={`停靠位置：${ISLAND_DOCK_LABELS[state.settings.dock]}`} value={state.settings.dock} disabled={busy} options={dockOptions} onChange={value => void run(async () => { const next = await api.patch({ dock: value as IslandDock }); if (next.mode === 'collapsed') pointerInside.current = false; setState(next); })} renderOption={option => { const DockIcon = dockIcons[option.value as IslandDock]; return <><DockIcon size={17} /><span className="island-dock-label">{option.label}</span></>; }} /><IconButton label={state.pinned ? '解除固定' : '固定展开'} aria-pressed={state.pinned} onClick={() => void run(() => api.pin())}><PushPin size={17} weight={state.pinned ? 'fill' : 'regular'} /></IconButton><IconButton label="桌面灵动岛设置" onClick={() => void run(() => api.navigate({ view: 'settings-island' }))}><GearSix size={17} /></IconButton></>}
        <IconButton label={state.mode === 'reminder' ? '收起提醒' : '隐藏桌面灵动岛'} onClick={() => state.mode === 'reminder' ? mode('collapsed') : void run(() => api.patch({ enabled: false }))}>{state.mode === 'reminder' ? <Minus size={17} /> : <X size={17} />}</IconButton>
      </div></header>
      <section className={`island-content${page && !notices && state.mode !== 'reminder' ? ' island-content-pages' : ''}`} aria-label={notices ? '未处理提醒' : page ? ISLAND_LABELS[page] : '设置'}>
        {(notices || state.mode === 'reminder') ? <ReminderList state={state} tasks={tasks} busy={busy} run={run} navigate={navigate} viewQuota={viewQuota} />
          : !page ? <div className="island-empty"><GearSix size={30} /><p>选择要显示的页面</p><button onClick={() => void run(() => api.navigate({ view: 'settings-island' }))}>打开设置</button></div>
          : <div className="island-page-track" style={{ transform: `translateX(${-pages.indexOf(page) * 100}%)` }}>{pages.map(value => <div key={value} className="island-page" data-island-page={value} inert={value !== page} aria-hidden={value !== page}>
            {value === 'schedule' ? !data ? <div className="island-empty" role="status">{dataError || '正在读取事项…'}{dataError && <button onClick={() => void loadTasks()}>重试</button>}</div> : <>{dataError && <div role="alert" className="island-data-error">{dataError} · 保留上次内容 <button onClick={() => void loadTasks()}>重试</button></div>}<Schedule tasks={tasks} now={now} busy={busy} run={run} open={navigate} day={agendaDay} setDay={setAgendaDay} /></>
              : value === 'files' ? <IslandShelf state={state} busy={busy} run={run} now={now} />
              : value === 'quota' ? <Quotas providers={quotas} selected={quotaSelection} select={setQuotaSelection} now={now} run={run} busy={busy} refresh={() => api.quotaRefresh().then(setQuotas)} />
              : <Tools state={state} tasks={open.filter(t => t.kind === 'task')} now={now} run={run} busy={busy} />}
          </div>)}</div>}
      </section>
      {expanded && <footer className="island-footer"><nav ref={navigation} aria-label="灵动岛页面"><span className="island-tab-indicator" aria-hidden="true" />{pages.map(value => { const PageIcon = icons[value]; return <button key={value} type="button" aria-current={!notices && page === value ? 'page' : undefined} className={!notices && page === value ? 'selected' : ''} onClick={() => changePage(value)} title={ISLAND_LABELS[value]} aria-label={ISLAND_LABELS[value]}><PageIcon size={18} /><span>{ISLAND_LABELS[value]}</span></button>; })}</nav><IslandMessageEntry state={state} onClick={() => mode('messages')} /></footer>}
    </div></Activity>
    {error && !speech && !messagesOpen && <div className="island-error" role="alert"><span>{error}</span><IconButton label="关闭错误提示" onClick={() => setError('')}><X size={14} /></IconButton></div>}
    {dragging && <div className="island-drop-target"><Folder size={28} /><b>松开以暂存文件</b><span>原文件保持原位</span></div>}
    </div>
  </main></div>;
}

function Schedule({ tasks, now, busy, run, open, day, setDay }: { tasks: Task[]; now: number; busy: boolean; run: Run; open(task?: Task): Promise<boolean>; day: string; setDay(day: string): void }) {
  const today = localDay(new Date(now)), [month, setMonth] = useState(() => day.slice(0, 7));
  const [filter, setFilter] = useState('day'), [armed, setArmed] = useState<string | null>(null);
  const start = new Date(`${month}-01T12:00:00`), first = (start.getDay() + 6) % 7;
  const days = Array.from({ length: 42 }, (_, i) => { const value = new Date(start); value.setDate(i - first + 1); return localDay(value); });
  const meetings = tasks.filter(t => t.kind === 'meeting' && t.status !== 'done' && t.plannedDate === day).sort((a, b) => (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z'));
  const items = tasks.filter(t => t.kind === 'task' && t.status !== 'done' && (filter === 'all' || (day === today ? t.plannedDate <= today : t.plannedDate === day))).sort((a, b) => Number(b.status === 'doing') - Number(a.status === 'doing') || (a.dueAt ?? 'z').localeCompare(b.dueAt ?? 'z'));
  const shift = (amount: number) => { const next = new Date(start); next.setMonth(next.getMonth() + amount); setMonth(localDay(next).slice(0, 7)); };
  const selectDay = (value: string) => { setDay(value); setMonth(value.slice(0, 7)); setFilter('day'); setArmed(null); };
  return <div className="island-schedule">
    <div className="island-calendar">
      <div className="island-calendar-head"><IconButton label="上个月" onClick={() => shift(-1)}><CaretLeft size={14} /></IconButton><b>{start.getFullYear()}年{start.getMonth() + 1}月</b><IconButton label="下个月" onClick={() => shift(1)}><CaretRight size={14} /></IconButton><button className="island-text-button" aria-label="回到今天" title="回到今天" onClick={() => selectDay(today)}>今天</button></div>
      <div className="island-weekdays">{'一二三四五六日'.split('').map(d => <span key={d}>{d}</span>)}</div>
      <div className="island-days" aria-label="选择日程日期">{days.map(value => <button key={value} type="button" className={`${value.slice(0, 7) !== month ? 'muted' : ''} ${value === day ? 'selected' : ''}`} aria-pressed={value === day} aria-current={value === today ? 'date' : undefined} aria-label={value} onClick={() => selectDay(value)} onKeyDown={event => {
        const offset = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key]; if (!offset) return; event.preventDefault();
        const next = new Date(`${value}T12:00:00`); next.setDate(next.getDate() + offset); const date = localDay(next); selectDay(date);
        setTimeout(() => document.querySelector<HTMLButtonElement>(`.island-days button[aria-label="${date}"]`)?.focus(), 0);
      }}>{Number(value.slice(-2))}{tasks.some(t => t.status !== 'done' && t.plannedDate === value) && <i />}</button>)}</div>
    </div>
    <div className="island-agenda">
      <div className="island-panel-title"><b>{day === today ? '今天 · ' : ''}{Number(day.slice(5, 7))}月{Number(day.slice(-2))}日</b><div className="island-agenda-actions"><Segmented value={filter} onChange={value => { setFilter(value); setArmed(null); }} options={[{ value: 'day', label: day === today ? '今天' : '当天' }, { value: 'all', label: '全部' }]} aria-label="待办范围" /><IconButton label="在工作台中打开" onClick={() => void open()}><ArrowSquareOut size={15} /></IconButton></div></div>
      <div className="island-list">
        <div className="island-panel-title island-list-heading"><span>日程</span><small>{meetings.length} 项</small></div>
        {meetings.length ? meetings.map(task => <button key={task.id} className="island-agenda-item" onClick={() => void open(task)}><span>{task.dueAt ? clockText(Date.parse(task.dueAt)) : '当日安排'}{task.endAt && <>–{clockText(Date.parse(task.endAt))}</>}</span><strong>{task.title}</strong></button>) : <p className="island-muted">这一天没有日程</p>}
        <div className="island-panel-title island-list-heading"><span>待办 <small>{items.length} 项</small></span></div>
        {items.length ? items.map(task => <div className="island-task" key={task.id}>
          <IconButton label={armed === task.id ? `确认完成 ${task.title}` : `完成 ${task.title}`} className={armed === task.id ? 'armed' : ''} disabled={busy} onClick={() => { if (armed !== task.id) setArmed(task.id); else void run(() => window.workbench.todo.update(task.id, { status: 'done' }, task.updatedAt)).then(ok => { if (ok) setArmed(null); }); }}><Check size={16} /></IconButton>
          <button className="island-task-title" title={task.title} onClick={() => void open(task)}><b>{task.title}</b><small>{task.status === 'doing' ? '进行中 · ' : ''}{task.dueAt ? `${Date.parse(task.dueAt) < now ? '已超期 · ' : ''}${new Date(task.dueAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}` : task.plannedDate}{task.priority === 'high' ? ' · 高优先级' : ''}</small></button>
          {armed === task.id && <button className="island-text-button" onClick={() => setArmed(null)}>取消</button>}
        </div>) : <p className="island-muted">没有未完成的待办</p>}
      </div>
    </div>
  </div>;
}

function QuotaRings({ windows, compact = false }: { windows: QuotaWindow[]; compact?: boolean }) {
  const rings = windows.slice(0, 2);
  return <span className={`island-quota-rings${compact ? ' compact' : ''}`}>
    <svg className="island-quota-chart" viewBox="0 0 100 100" role="img" aria-label={rings.length ? rings.map((w, i) => `${i ? '内圈' : '外圈'} ${w.label}剩余 ${w.remaining}%`).join('；') : '尚无额度数据'}>
      {(rings.length ? rings : [null]).map((w, i) => <g key={i} data-ring={i}>
        <circle className="island-quota-track" cx="50" cy="50" r={43 - i * 12} />
        {w && <circle className="island-quota-arc" cx="50" cy="50" r={43 - i * 12} pathLength="100" strokeDasharray={`${w.remaining} 100`} transform="rotate(-90 50 50)" visibility={w.remaining === 0 ? 'hidden' : undefined} />}
      </g>)}
    </svg>
    {!compact && <Sparkle className="island-quota-center" size={28} aria-hidden="true" />}
  </span>;
}

function Quotas({ providers, selected, select, now, run, busy, refresh }: { providers: QuotaProvider[]; selected: QuotaProvider['id'] | null; select(id: QuotaProvider['id']): void; now: number; run: Run; busy: boolean; refresh(): Promise<unknown> }) {
  const api = window.workbench.island;
  const id = selected ?? providers.find(p => p.windows.length)?.id ?? 'codex';
  const provider = providers.find(p => p.id === id), windows = quotaDisplayWindows(provider?.windows ?? []);
  const stale = provider?.status === 'error' || Boolean(provider?.updatedAt && now - provider.updatedAt > 600000);
  return <div className="island-quotas" data-provider={id}>
    <div className="island-quota-toolbar"><Segmented aria-label="额度来源" value={id} onChange={value => select(value as QuotaProvider['id'])} options={ISLAND_QUOTA_PROVIDERS.map(value => ({ value, label: ISLAND_QUOTA_LABELS[value] }))} /><small title={provider?.account}>{provider?.account || (provider ? '未连接账户' : '正在读取额度…')}</small></div>
    <div className="island-quota-body">
    <div className={`island-quota-overview${stale ? ' stale' : ''}`}>
      <QuotaRings windows={windows} />
      <div className="island-quota-details">
        <div className="island-quota-heading"><h2>{ISLAND_QUOTA_LABELS[id]}{provider?.plan && <span> · {provider.plan}</span>}</h2>{windows.length > 0 && <small>剩余</small>}</div>
        {windows.length ? <div className="island-quota-windows">{windows.map((w, i) => <div className="island-quota-window" key={i} data-ring={i}>
          <span className="island-quota-period" title={`${i === 0 ? '外圈 · ' : i === 1 ? '内圈 · ' : ''}${w.label}`}><i />{w.label === '5h' ? '5 小时' : w.label === '周' ? '本周' : w.label}</span><strong>{w.remaining}%</strong>
          <small>{w.resetsAt ? `${localDay(new Date(w.resetsAt)) === localDay(new Date(now)) ? '今天' : new Date(w.resetsAt).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })} ${clockText(w.resetsAt)} 重置` : '未提供重置时间'}</small>
        </div>)}</div> : <div className="island-quota-empty"><p role="status">{provider?.message || (provider ? '当前暂无可用指标' : '正在读取额度…')}</p></div>}
        {provider?.message && windows.length > 0 && <small className="island-quota-message" role="status" title={provider.message}>{provider.message}</small>}
      </div>
    </div>
    </div>
    <div className="island-quota-actions"><small className="island-quota-updated">{provider?.updatedAt ? `${stale ? '待更新 · ' : ''}${clockText(provider.updatedAt)} 更新` : '尚未读取额度'}</small><div className="island-inline"><button disabled={busy} onClick={() => void run(refresh)}>刷新</button><button disabled={busy} onClick={() => void run(() => api.navigate({ view: 'settings-island', section: 'quota' }))}>管理连接</button></div></div>
  </div>;
}

function HealthReminder({ kind, state, now, run, busy }: { kind: 'water' | 'sedentary'; state: IslandState; now: number; run: Run; busy: boolean }) {
  const water = kind === 'water', api = window.workbench.island, s = state.settings;
  const enabled = water ? s.waterEnabled : s.sedentaryEnabled, minutes = water ? s.waterMinutes : s.sedentaryMinutes;
  const data = water ? state.water : state.sedentary, paused = data.pausedDay === localDay(new Date(now));
  const label = water ? '喝水提醒' : '久坐提醒', Icon = water ? Drop : PersonSimpleWalk;
  const pending = state.reminders.some(reminder => reminder.kind === kind);
  const enabling = useRef(false), primary = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!enabled || busy || !enabling.current) return;
    enabling.current = false; if (document.hasFocus()) primary.current?.focus();
  }, [enabled, busy]);
  const enable = () => {
    if (enabling.current) return;
    enabling.current = true;
    void run(() => api.patch(water ? { waterEnabled: true } : { sedentaryEnabled: true })).then(ok => { if (!ok) enabling.current = false; });
  };
  const status = paused ? '今日已暂停' : !water && state.quiet ? '勿扰中' : pending ? water ? '该喝水了' : '该活动了'
    : data.nextAt ? water ? clockText(data.nextAt) : countdown(Math.max(0, data.nextAt - now)) : '待安排';
  const action = water ? '已喝水' : paused ? '恢复' : '已活动';
  return <section className="island-health-reminder" aria-label={label}>
    <div className="island-health-label"><h2><Icon size={17} aria-hidden="true" />{label}</h2><small>{enabled ? `每${minutes}分钟${water ? ` · ${state.water.count}次` : ''}` : '未开启'}</small></div>
    {enabled && <strong className="island-health-status" title={water ? `下次喝水：${status}；今日已记录 ${state.water.count} 次` : `距离下次活动提醒：${status}`} data-paused={paused || !water && state.quiet}>{status}</strong>}
    <button ref={primary} type="button" className="primary island-health-primary" aria-label={enabled ? water ? '已喝水' : paused ? '恢复久坐提醒' : '已活动' : `开启${label}`} disabled={busy}
      onClick={() => { if (!enabled) enable(); else void run(() => water ? api.water('drink') : api.sedentary('reset')); }}>{enabled ? action : '开启'}</button>
    <div className="island-health-menu" inert={busy}><GameOptionsMenu kind="island" active={state.mode === 'expanded' && islandPage(s) === 'tools'} context={`${kind}:${enabled}:${paused}`} label={`${label}更多操作`}>{close => <>
      {enabled && <><button type="button" role="menuitem" disabled={paused} onClick={() => { close(); void run(() => water ? api.water('snooze') : api.sedentary('snooze')); }}>10分钟后</button>
        <button type="button" role="menuitem" disabled={paused} onClick={() => { close(); void run(() => water ? api.water('pause') : api.sedentary('pause')); }}>今天暂停提醒</button></>}
      <button type="button" role="menuitem" onClick={() => { close(); void run(() => api.navigate({ view: 'settings-island', section: kind })); }}>提醒设置</button>
      {enabled && <button type="button" role="menuitem" onClick={() => { close(); void run(() => api.patch(water ? { waterEnabled: false } : { sedentaryEnabled: false })); }}>关闭提醒</button>}
    </>}</GameOptionsMenu></div>
  </section>;
}

function Tools({ state, tasks, now, run, busy }: { state: IslandState; tasks: Task[]; now: number; run: Run; busy: boolean }) {
  const [minutes, setMinutes] = useState(String(state.settings.focusMinutes)), [taskId, setTaskId] = useState('');
  const api = window.workbench.island, focus = state.focus, remaining = focusRemaining(focus, now), s = state.settings;
  const quiet = s.dnd && inTimeRange(new Date(now), s.dndStart, s.dndEnd);
  const focusTitle = focus?.taskId ? tasks.find(t => t.id === focus.taskId)?.title ?? '关联事项' : '';
  return <div className="island-tools" data-focus={s.focusEnabled || undefined}>{s.focusEnabled && <section className="island-focus"><div className="island-focus-ring" style={{ '--progress': `${focus ? 100 * remaining / focus.durationMs : 100}%` } as CSSProperties}><small>{focus ? focus.endsAt === null ? '已暂停' : '正在专注' : '专注计时'}</small><strong>{focus ? countdown(remaining) : `${String(Number(minutes) || 25).padStart(2, '0')}:00`}</strong>{focusTitle && <span title={focusTitle}>{focusTitle}</span>}</div>{focus ? <div className="island-inline"><button className="primary" disabled={busy} onClick={() => void run(() => api.focus(focus.endsAt === null ? 'resume' : 'pause'))}>{focus.endsAt === null ? '继续' : '暂停'}</button><button disabled={busy} onClick={() => void run(() => api.focus('stop'))}>结束</button></div> : <div className="island-focus-form"><div className="island-inline"><label className="island-focus-minutes"><input aria-label="自定义专注分钟" type="number" min="1" max="180" value={minutes} onChange={event => setMinutes(event.target.value)} /><span aria-hidden="true">分钟</span></label></div><Select value={taskId} onChange={setTaskId} aria-label="关联待办" options={[{ value: '', label: '不关联待办' }, ...tasks.map(t => ({ value: t.id, label: t.title }))]} /><button className="primary" disabled={busy || !Number.isInteger(Number(minutes)) || Number(minutes) < 1 || Number(minutes) > 180} onClick={() => void run(() => api.focus('start', Number(minutes), taskId || undefined))}>开始专注</button></div>}</section>}<section className="island-companions">{s.mascotEnabled && <div className="island-companion"><Mascot moving={s.mascotMotion && !quiet} /><span>{focus ? '陪你专注' : '安静陪伴'}</span></div>}<div className="island-health-reminders"><HealthReminder kind="water" state={state} now={now} run={run} busy={busy} /><HealthReminder kind="sedentary" state={state} now={now} run={run} busy={busy} /></div></section></div>;
}

function ReminderList({ state, tasks, busy, run, navigate, viewQuota, speech = false }: { state: IslandState; tasks: Task[]; busy: boolean; run: Run; navigate(task?: Task): Promise<boolean>; viewQuota(reminder: IslandReminder): Promise<boolean>; speech?: boolean }) {
  const api = window.workbench.island;
  const [armed, setArmed] = useState<string | null>(null);
  const reminders = state.mode === 'reminder' || speech ? state.reminders.slice(0, 1) : state.reminders;
  return <div className="island-reminders">{!speech && state.reminders.length > 1 && <small>{state.reminders.length} 条未处理提醒</small>}{reminders.map(reminder => {
    const task = tasks.find(t => t.id === reminder.taskId);
    const agent = reminder.kind === 'agent' ? state.agentMessages?.find(message => reminder.id === `agent:${message.id}`) : undefined;
    const title = !speech ? agent?.title || reminder.title : agent ? agent.kind === 'approval' ? '有操作需要你授权。' : agent.kind === 'failed' ? '运行遇到了问题，回来看看吧。' : '有新回复，回来看看吧。' : reminder.kind === 'water' ? '喝口水，歇一下吧。' : reminder.kind === 'meeting' ? `别忘了这个日程：${reminder.title}` : reminder.kind === 'quota' ? `${reminder.title.replace('剩余', '只剩')}啦。` : reminder.title;
    return <div className="island-reminder" key={reminder.id}>
      {speech && <IconButton className="island-speech-close" label="忽略本次提醒" disabled={busy} onClick={() => void run(async () => { await api.dismiss(reminder.id); await api.mode('collapsed'); })}><X size={14} /></IconButton>}
      {agent && <small className="island-agent-source">{agent.provider === 'codex' ? 'Codex' : 'Cursor'} · {agent.project}</small>}
      <b>{title}</b><div className="island-inline">
        {task && <><button className={speech ? 'primary' : undefined} disabled={busy} onClick={() => void navigate(task).then(ok => { if (ok && speech) void api.mode('collapsed'); })}>查看{task.kind === 'meeting' ? '日程' : '待办'}</button><button disabled={busy} onClick={() => void run(async () => { await window.workbench.todo.snooze(task.id); await api.dismiss(reminder.id); })}>稍后10分钟</button>{task.kind === 'task' && task.status !== 'done' && <button disabled={busy} onClick={() => { if (armed !== reminder.id) setArmed(reminder.id); else void run(async () => { await window.workbench.todo.update(task.id, { status: 'done' }, task.updatedAt); await api.dismiss(reminder.id); }).then(ok => { if (ok) setArmed(null); }); }}>{armed === reminder.id ? '确认完成' : '完成'}</button>}</>}
        {reminder.kind === 'water' && <><button className={speech ? 'primary' : undefined} disabled={busy} onClick={() => void run(() => api.water('drink'))}>已喝水</button><button disabled={busy} onClick={() => void run(() => api.water('snooze'))}>稍后10分钟</button></>}
        {reminder.kind === 'sedentary' && <><button className={speech ? 'primary' : undefined} disabled={busy} onClick={() => void run(() => api.sedentary('reset'))}>已活动</button><button disabled={busy} onClick={() => void run(() => api.sedentary('snooze'))}>10分钟后</button></>}
        {speech && reminder.kind === 'quota' && <button className="primary" disabled={busy} onClick={() => void viewQuota(reminder)}>查看额度</button>}
        {agent && <><button className={speech ? 'primary' : undefined} disabled={busy} onClick={() => void run(async () => { await api.agentOpen(agent.id); if (speech) await api.mode('collapsed'); })}>{agent.provider === 'cursor' ? '打开项目' : agent.kind === 'approval' ? '去处理' : '查看对话'}</button><button disabled={busy} onClick={() => void run(async () => { await api.dismiss(reminder.id); if (speech) await api.mode('collapsed'); })}>稍后</button></>}
        {reminder.kind !== 'agent' && (!speech || !task && reminder.kind !== 'water' && reminder.kind !== 'sedentary') && <button disabled={busy} onClick={() => void run(() => api.dismiss(reminder.id))}>{task || reminder.kind === 'water' || reminder.kind === 'sedentary' ? '忽略本次' : '知道了'}</button>}
      </div>
    </div>;
  })}{!reminders.length && <p className="island-muted">没有未处理提醒</p>}</div>;
}
