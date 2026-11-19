import { hasTaskTime } from '../../shared/todo-date';
import { isOverdue } from '../../shared/todo-format';
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type DragEvent, type HTMLAttributes, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarBlank, ChartBar, CheckCircle, CheckSquare, DotsSixVertical, Gift, LinkSimple, Pause, PencilSimple, Play, Plus, Sparkle, Timer, VideoCamera, X } from '@phosphor-icons/react';
import type { ViewId } from '../../shared/contracts';
import { DASHBOARD_KEY, WIDGET_IDS, WIDGET_ROWS, WIDGET_STYLES, WIDGET_WIDTHS, dashboardPlacements, defaultDashboard, defaultWidget, findDashboardSlot, moveDashboardWidget, readDashboard, resizeDashboardPlacement, updateDashboardPlacement, type DashboardLayout, type DashboardWidget, type WidgetId, type WidgetPlacement, type WidgetRows, type WidgetStyle, type WidgetWidth } from '../../shared/dashboard-layout';
import { dashboardSummary } from '../../shared/dashboard-summary';
import { ISLAND_QUOTA_LABELS, focusRemaining, type QuotaProvider } from '../../shared/island-contracts';
import { localDay, type Task } from '../../shared/todo-contracts';
import type { TodoState } from '../../shared/workbench-api';
import { IconButton, Segmented, errorText } from '../ui/controls';
import { CheckinHomeCard, CheckinHomeContent, useCheckinState, type CheckinCardVariant, type OpenCheckinSettings } from './CheckinView';
import { GameOptionsMenu } from './GameOptionsMenu';
import { useIslandState } from './island-state';
import './home-dashboard.css';

const api = window.workbench;
const widgetNames: Record<WidgetId, string> = { today: '待办摘要', 'schedule-stats': '日程待办统计', focus: '专注计时', checkin: '每日签到', quota: 'AI 额度' };
const widgetIcons = { today: CalendarBlank, 'schedule-stats': ChartBar, focus: Timer, checkin: Gift, quota: Sparkle };
const CATALOG_IDS = WIDGET_IDS.filter(id => id !== 'focus');
type CatalogWidgetId = typeof CATALOG_IDS[number];
const styleNames: Record<WidgetStyle, string> = { history: '完成与待办堆叠图', counts: '日程与待办对比图', agenda: '今日安排', activity: '最近完成记录', digits: '数字倒计时', ring: '环形计时', bar: '横向进度', parallel: '应用并排', list: '列表', tiles: '应用卡片', progress: '领取进度', bars: '额度进度条', rings: '额度圆环' };
const availableStyles = { ...WIDGET_STYLES, today: ['history', 'counts'], 'schedule-stats': ['history', 'counts'], checkin: ['list', 'tiles'] } as const;
const widthOptions = WIDGET_WIDTHS.map((width, index) => ({ value: String(width), label: `${width} 列 · ${['1/3', '1/2', '2/3', '整行'][index]}` }));
const rowOptions = WIDGET_ROWS.map(rows => ({ value: String(rows), label: `${rows} 行` }));
const resizeEdges = { left: '左', right: '右', top: '上', bottom: '下' } as const;
type ResizeEdge = keyof typeof resizeEdges;
type ResizeStop = { value: number; pixels: number; layout: DashboardLayout };
const noAction = () => {};
const timeLabel = (at: string) => new Date(at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
const quotaLogos = {
  codex: new URL('../assets/quota-providers/codex.png', import.meta.url).href,
  zcode: new URL('../assets/quota-providers/zcode.png', import.meta.url).href,
  cursor: new URL('../assets/quota-providers/cursor.svg', import.meta.url).href,
  grokbot: new URL('../assets/quota-providers/grokbot.png', import.meta.url).href,
};
const quotaStatuses = { disconnected: '未连接', connecting: '待授权', ready: '暂无指标', stale: '更新延迟', recovering: '恢复中', error: '连接异常', unsupported: '暂无数据' };

function ActionLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return onClick ? <button className="dashboard-link" onClick={onClick}>{children}<ArrowRight size={15} /></button> : <span className="dashboard-link">{children}<ArrowRight size={15} /></span>;
}
function RoundValue({ value, children, label }: { value?: number; children: ReactNode; label: string }) {
  return <div className="dashboard-circle" role="img" aria-label={label}><svg viewBox="0 0 100 100" aria-hidden="true"><circle className="dashboard-circle-track" cx="50" cy="50" r="44" /><circle className="dashboard-circle-value" cx="50" cy="50" r="44" pathLength={100} strokeDasharray={`${Math.max(0, Math.min(100, value ?? 0))} 100`} /></svg><strong>{children}</strong></div>;
}

function TodayContent({ data, clock, style, rows = 2, navigate, openTask }: { data: TodoState | null; clock: Date; style: WidgetStyle; rows?: number; navigate?: () => void; openTask?: (task: Task) => void }) {
  const summary = dashboardSummary(data?.tasks ?? [], clock), maximum = Math.max(1, ...summary.days.map(day => day.completed + day.pending));
  function taskRow(task: Task, completed = false) {
    const Icon = completed ? CheckCircle : task.kind === 'meeting' ? VideoCamera : CheckSquare;
    const at = completed ? task.completedAt! : hasTaskTime(task.dateAt) ? task.dateAt : null, date = at ? new Date(at) : null;
    const caption = completed ? `${localDay(date!) === summary.today ? '今天' : `${date!.getMonth() + 1}/${date!.getDate()}`} ${timeLabel(at!)}` : `${task.kind === 'meeting' ? '日程' : isOverdue(task, clock.getTime()) ? '逾期待办' : '待办'}${at ? ` · ${timeLabel(at)}` : ''}`;
    const content = <><Icon size={18} /><span><strong>{task.title}</strong><small>{caption}</small></span></>;
    return openTask ? <button className="dashboard-task" key={task.id} aria-label={`${task.title}，${caption}`} title={task.title} onClick={() => openTask(task)}>{content}</button> : <div className="dashboard-task" key={task.id}>{content}</div>;
  }
  return <div className={`dashboard-today dashboard-${style}`}>
    {!data ? <p className="dashboard-muted">正在读取日程待办…</p> : style === 'history' ? <>
      <div className="dashboard-summary-heading"><strong>近7天 · 按事项日期</strong><div className="dashboard-chart-legend"><span data-series="completed">已完成 {summary.plannedCompleted}</span><span data-series="pending">待办 {summary.plannedPending}</span></div></div>
      <div className="dashboard-history-bars" role="img" aria-label={`按事项日期，${summary.days.map(day => `${day.date} 已完成 ${day.completed} 项、待办 ${day.pending} 项`).join('；')}`}>
        {summary.days.map(day => <div className="dashboard-history-day" key={day.date} data-date={day.date} data-today={day.date === summary.today} title={`${day.date} · 已完成 ${day.completed} 项 · 待办 ${day.pending} 项`}><span>{day.completed + day.pending}</span><div className="dashboard-history-stack" data-empty={!day.completed && !day.pending} style={{ '--bar-share': (day.completed + day.pending) / maximum } as CSSProperties}>{day.pending ? <i data-series="pending" style={{ flex: day.pending }} /> : null}{day.completed ? <i data-series="completed" style={{ flex: day.completed }} /> : null}</div><small>{day.date === summary.today ? '今' : ['日', '一', '二', '三', '四', '五', '六'][day.weekday]}</small></div>)}
      </div>
    </> : <><strong className="dashboard-section-title">{style === 'agenda' ? '今天要做什么' : '最近做了什么'}</strong><div className="dashboard-task-list">
      {(style === 'agenda' ? summary.agenda : summary.completed).slice(0, rows).map(task => taskRow(task, style === 'activity'))}
      {!(style === 'agenda' ? summary.agenda : summary.completed).length ? <p className="dashboard-muted">{style === 'agenda' ? '今天暂无待处理事项' : '还没有已记录完成时间的事项'}</p> : null}
    </div></>}
    <footer><span>{style === 'history' ? summary.earlierPending ? `更早待办 ${summary.earlierPending} 项` : `今天已完成 ${summary.days[6].completed} · 待办 ${summary.days[6].pending}` : style === 'agenda' ? `待办 ${summary.pending} 项 · 日程 ${summary.meetings} 项` : '按实际完成时间排序'}</span><ActionLink onClick={navigate}>日程待办</ActionLink></footer>
  </div>;
}

function ScheduleStatsContent({ data, clock, navigate }: { data: TodoState | null; clock: Date; navigate?: () => void }) {
  const summary = dashboardSummary(data?.tasks ?? [], clock), days = summary.upcomingDays, maximum = Math.max(1, ...days.flatMap(day => [day.meetings, day.tasks]));
  return <div className="dashboard-today dashboard-schedule-stats">
    {!data ? <p className="dashboard-muted">正在读取日程待办…</p> : <>
      <div className="dashboard-summary-heading"><strong>未来7天</strong><div className="dashboard-chart-legend"><span data-series="meetings">日程 {days.reduce((sum, day) => sum + day.meetings, 0)}</span><span data-series="pending">待办 {days.reduce((sum, day) => sum + day.tasks, 0)}</span></div></div>
      <div className="dashboard-history-bars" role="img" aria-label={`未完成事项，${days.map(day => `${day.date} 日程 ${day.meetings} 项、待办 ${day.tasks} 项`).join('；')}`}>
        {days.map(day => <div className="dashboard-history-day" key={day.date} data-date={day.date} title={`${day.date} · 未完成日程 ${day.meetings} 项 · 待办 ${day.tasks} 项`}><div className="dashboard-count-pair">{(['meetings', 'tasks'] as const).map(kind => <div className="dashboard-count-series" key={kind}><span>{day[kind]}</span><i data-series={kind === 'tasks' ? 'pending' : 'meetings'} data-empty={!day[kind]} style={{ '--bar-share': day[kind] / maximum } as CSSProperties} /></div>)}</div><small>{day.date === summary.today ? '今' : ['日', '一', '二', '三', '四', '五', '六'][day.weekday]}</small></div>)}
      </div>
    </>}
    <footer><span>{days[0].date.slice(5).replace('-', '/')}–{days[6].date.slice(5).replace('-', '/')} · 未完成事项</span><ActionLink onClick={navigate}>日程待办</ActionLink></footer>
  </div>;
}

function FocusFace({ remaining, duration, variant }: { remaining: number; duration: number; variant: WidgetStyle }) {
  const seconds = Math.ceil(remaining / 1000), text = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`, percent = duration ? Math.min(100, remaining / duration * 100) : 0;
  return <div className="dashboard-focus-visual" data-style={variant}>{variant === 'ring' ? <RoundValue value={percent} label={`专注剩余 ${text}`}>{text}</RoundValue> : <><strong className="dashboard-timer" aria-label="专注剩余时间">{text}</strong>{variant === 'bar' ? <progress max={100} value={percent} aria-label="专注剩余时间比例" /> : null}</>}</div>;
}
function FocusWidget({ variant, settings }: { variant: WidgetStyle; settings(): void }) {
  const { state, setState, error, setError } = useIslandState();
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false);
  const lock = useRef(false);
  useEffect(() => { setNow(Date.now()); if (!state?.focus?.endsAt) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [state?.focus?.endsAt]);
  const focus = state?.focus, duration = focus?.durationMs ?? (state?.settings.focusMinutes ?? 25) * 60000;
  async function run(action: 'start' | 'pause' | 'resume' | 'stop') {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { setState(await api.island.focus(action)); } catch (e) { setError(errorText(e)); } finally { lock.current = false; setBusy(false); }
  }
  return <div className="dashboard-focus"><FocusFace remaining={focus ? focusRemaining(focus, now) : duration} duration={duration} variant={variant} />
    <span>{!state ? '正在读取专注状态…' : !state.settings.focusEnabled ? '专注计时未启用' : focus ? focus.endsAt ? '专注进行中' : '已暂停' : '专注一件事'}</span>
    {state?.settings.focusEnabled ? <div className="dashboard-focus-actions"><button className="btn btn-pri btn-sm" disabled={busy} onClick={() => void run(focus ? focus.endsAt ? 'pause' : 'resume' : 'start')}>{focus?.endsAt ? <Pause size={14} /> : <Play size={14} />}{focus ? focus.endsAt ? '暂停' : '继续专注' : '开始专注'}</button>{focus ? <button className="btn btn-sec btn-sm" disabled={busy} onClick={() => void run('stop')}>结束</button> : null}</div> : <ActionLink onClick={state ? settings : undefined}>打开设置</ActionLink>}
    {error ? <p className="dashboard-error" role="alert">{error}</p> : null}
  </div>;
}

function useQuotaProviders() {
  const [providers, setProviders] = useState<QuotaProvider[] | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let alive = true, version = 0;
    const load = () => { const current = ++version; void api.island.quotas().then(value => { if (alive && current === version) { setProviders(value); setError(''); } }, e => { if (alive && current === version) setError(errorText(e)); }); };
    load(); const off = api.island.onChanged(load); window.addEventListener('focus', load);
    return () => { alive = false; off(); window.removeEventListener('focus', load); };
  }, []);
  return { providers, error };
}
function QuotaContent({ providers, error = '', variant, settings }: { providers: QuotaProvider[] | null; error?: string; variant: WidgetStyle; settings?: () => void }) {
  const connected = providers?.filter(provider => provider.status !== 'disconnected') ?? [], displayed = providers ?? [];
  return <div className="dashboard-quotas" data-variant={variant}>
    {!providers && !error ? <p className="dashboard-muted">正在读取额度…</p> : null}
    {variant === 'list' && displayed.length ? <div className="dashboard-quota-columns" aria-hidden="true"><span>账号</span><span>剩余</span></div> : null}
    <div className="dashboard-quota-items" role="list" aria-label="额度来源">{displayed.map(provider => {
      const lowest = provider.windows.reduce<QuotaProvider['windows'][number] | null>((a, b) => !a || b.remaining < a.remaining ? b : a, null);
      const caption = lowest ? `${lowest.label}${provider.status === 'ready' ? '' : ` · ${quotaStatuses[provider.status]}`}` : quotaStatuses[provider.status];
      const value = lowest ? <>{lowest.remaining}<small>%</small></> : <LinkSimple size={18} aria-hidden="true" />;
      return <div className="dashboard-quota-row" data-style={variant} data-provider={provider.id} data-status={provider.status} data-empty={!lowest} data-remaining={lowest?.remaining} key={provider.id} role="listitem">
        <div className="dashboard-quota-brand"><img src={quotaLogos[provider.id]} alt="" /><strong>{ISLAND_QUOTA_LABELS[provider.id]}</strong></div>
        {variant === 'rings' ? <RoundValue value={lowest?.remaining} label={`${ISLAND_QUOTA_LABELS[provider.id]} ${caption}${lowest ? `，剩余 ${lowest.remaining}%` : ''}`}>{value}</RoundValue> : <strong className="dashboard-quota-value" aria-label={lowest ? `剩余 ${lowest.remaining}%` : caption}>{value}</strong>}
        <small className="dashboard-quota-caption" title={[caption, provider.message].filter(Boolean).join(' · ')}>{caption}</small>
        {variant === 'bars' ? <div className="dashboard-quota-gauge">{lowest ? <progress aria-label={`${ISLAND_QUOTA_LABELS[provider.id]} ${lowest.label}剩余额度`} max={100} value={lowest.remaining} /> : <span className="dashboard-quota-empty-track" />}</div> : null}
      </div>;
    })}</div>
    {error ? <p className="dashboard-error" role="alert">{error}</p> : null}
    <footer><span>{connected.length ? `${connected.length} 个账号已接入` : '账号未连接'}</span><ActionLink onClick={settings}>{connected.length ? '管理账号' : '连接账号'}</ActionLink></footer>
  </div>;
}
function QuotaWidget({ variant, settings }: { variant: WidgetStyle; settings(): void }) { const snapshot = useQuotaProviders(); return <QuotaContent {...snapshot} variant={variant} settings={settings} />; }

function DashboardCard({ widget, children, drag, tools, resize, ...props }: { widget: DashboardWidget; children: ReactNode; drag?: ReactNode; tools?: ReactNode; resize?: ReactNode } & HTMLAttributes<HTMLElement>) {
  const Icon = widgetIcons[widget.id];
  return <article {...props} className="dashboard-widget" data-widget={widget.id} data-width={widget.width} data-rows={widget.rows} data-style={widget.style} style={{ '--widget-span': widget.width, '--widget-rows': widget.rows, '--widget-top-offset': widget.topOffset ?? 0, ...props.style } as CSSProperties}>
    <header className="dashboard-widget-heading"><Icon size={19} /><h2 title={widgetNames[widget.id]}>{widgetNames[widget.id]}</h2><div className="dashboard-widget-tools">{drag}{tools}</div></header>
    <div className="dashboard-widget-body" inert={!!drag}>{children}</div>{resize}
  </article>;
}

function measureDashboardCanvas(grid: HTMLDivElement) {
  const style = getComputedStyle(grid);
  return {
    width: parseFloat(style.width) || grid.clientWidth,
    columns: style.display === 'grid' ? 6 : 1,
    step: parseFloat(style.getPropertyValue('--widget-row-step')),
    base: parseFloat(style.getPropertyValue('--widget-base-height')),
    gap: parseFloat(style.columnGap),
  };
}

function widgetPixelWidth(grid: HTMLDivElement, width: WidgetWidth) {
  const canvas = measureDashboardCanvas(grid);
  return (canvas.width + canvas.gap) * Math.min(width, canvas.columns) / canvas.columns - canvas.gap;
}

function DashboardPreview({ widget, grid, children }: { widget: DashboardWidget; grid: HTMLDivElement; children: ReactNode }) {
  const viewport = useRef<HTMLDivElement>(null), canvas = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    function fit() {
      const stage = viewport.current!, surface = canvas.current!, card = surface.firstElementChild as HTMLElement;
      const width = widgetPixelWidth(grid, widget.width);
      card.style.width = `${width}px`;
      const height = card.offsetHeight, scale = Math.min(1, stage.clientWidth / width, stage.clientHeight / height);
      surface.style.width = `${width * scale}px`; surface.style.height = `${height * scale}px`;
      card.style.transform = `scale(${scale})`;
    }
    fit(); const observer = new ResizeObserver(fit); observer.observe(grid); observer.observe(viewport.current!);
    return () => observer.disconnect();
  }, [grid, widget.width, widget.rows]);
  return <div ref={viewport} className="dashboard-style-preview" inert aria-hidden="true"><div ref={canvas} className="dashboard-preview-canvas"><DashboardCard widget={widget}>{children}</DashboardCard></div></div>;
}

function DashboardCatalog({ initial, trigger, panelId, grid, layout, data, clock, close, apply }: { initial: CatalogWidgetId; trigger: HTMLButtonElement; panelId: string; grid: HTMLDivElement; layout: DashboardLayout; data: TodoState | null; clock: Date; close(): void; apply(widget: DashboardWidget): string | void }) {
  const panel = useRef<HTMLDivElement>(null);
  const [sizeError, setSizeError] = useState('');
  const [id, setId] = useState(initial);
  const scheduleChoice = useRef<CatalogWidgetId>(initial === 'schedule-stats' ? 'schedule-stats' : 'today');
  const [choices, setChoices] = useState(() => Object.fromEntries(CATALOG_IDS.map(key => {
    const widget = layout.widgets.find(widget => widget.id === key) ?? defaultWidget(key);
    return [key, { ...widget, style: key === 'today' ? 'history' : key === 'checkin' && (widget.style === 'progress' || widget.style === 'parallel') ? 'list' : widget.style }];
  })) as Record<CatalogWidgetId, DashboardWidget>);
  const checkin = useCheckinState(), quota = useQuotaProviders(), selected = choices[id], exists = layout.widgets.some(widget => widget.id === id);
  const schedule = id === 'today' || id === 'schedule-stats', name = schedule ? '日程待办' : widgetNames[id];
  const styles = availableStyles[id];
  const sourceError = id === 'checkin' ? checkin.error : id === 'quota' ? quota.error : '';
  const dismiss = () => { close(); trigger.focus({ preventScroll: true }); };
  useLayoutEffect(() => {
    const element = panel.current!;
    element.showPopover();
    function place() {
      const anchor = trigger.getBoundingClientRect(), gap = 8, edge = 12;
      element.style.maxHeight = '';
      const below = window.innerHeight - anchor.bottom - gap - edge, above = anchor.top - gap - edge;
      const up = element.offsetHeight > below && above > below;
      element.style.maxHeight = `${Math.max(0, Math.min(440, up ? above : below))}px`;
      element.style.left = `${Math.max(edge, Math.min(anchor.right - element.offsetWidth, window.innerWidth - element.offsetWidth - edge))}px`;
      element.style.top = `${up ? anchor.top - element.offsetHeight - gap : anchor.bottom + gap}px`;
    }
    place();
    element.querySelector<HTMLButtonElement>('.dashboard-catalog-nav [aria-pressed="true"]')?.focus({ preventScroll: true });
    const openedAt = trigger.getBoundingClientRect();
    const pointer = (event: globalThis.PointerEvent) => { if (!element.contains(event.target as Node) && !trigger.contains(event.target as Node)) close(); };
    const escape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); trigger.focus({ preventScroll: true }); } };
    const scroll = (event: Event) => {
      if (element.contains(event.target as Node)) return;
      const anchor = trigger.getBoundingClientRect();
      if (Math.abs(anchor.top - openedAt.top) > 1 || Math.abs(anchor.left - openedAt.left) > 1) close();
    };
    const observer = new ResizeObserver(place);
    const header = trigger.closest('.bot-workspace-header');
    observer.observe(element);
    if (header) observer.observe(header);
    document.addEventListener('pointerdown', pointer);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', scroll, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('pointerdown', pointer);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', scroll, true);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [trigger]);
  function update(patch: Partial<DashboardWidget>, key = id) {
    setSizeError('');
    setChoices(current => ({ ...current, [key]: { ...current[key], ...patch } })); setId(key);
    if (key === 'today' || key === 'schedule-stats') scheduleChoice.current = key;
  }
  function preview(widget: DashboardWidget) {
    if (widget.id === 'today') return <TodayContent data={data} clock={clock} style={widget.style} rows={widget.rows} navigate={noAction} />;
    if (widget.id === 'schedule-stats') return <ScheduleStatsContent data={data} clock={clock} navigate={noAction} />;
    if (widget.id === 'checkin') return <CheckinHomeContent state={checkin.state} error={checkin.error} open={noAction} run={noAction} variant={widget.style as CheckinCardVariant} embedded />;
    return <QuotaContent {...quota} variant={widget.style} settings={noAction} />;
  }
  return <div ref={panel} id={panelId} className="dashboard-catalog-popover" popover="manual" role="dialog" aria-label="添加卡片">
    <header className="dashboard-catalog-heading"><h2>添加卡片</h2><IconButton label="关闭" onClick={dismiss}><X size={18} /></IconButton></header>
    <div className="dashboard-catalog"><nav className="dashboard-catalog-nav" aria-label="卡片类型">{CATALOG_IDS.filter(key => key !== 'schedule-stats').map(key => { const Icon = widgetIcons[key]; return <button key={key} type="button" aria-pressed={key === 'today' ? schedule : id === key} onClick={() => { setSizeError(''); setId(key === 'today' ? scheduleChoice.current : key); }}><Icon size={18} />{key === 'today' ? '日程待办' : widgetNames[key]}</button>; })}</nav>
      <div className="dashboard-catalog-content"><h3>{name}</h3><div className="dashboard-style-options" style={{ '--style-count': styles.length } as CSSProperties} role="group" aria-label="展示样式">{styles.map(style => {
        const key = style === 'counts' ? 'schedule-stats' : schedule ? 'today' : id, widget = { ...choices[key], style };
        return <div className="dashboard-style-option" key={style}><DashboardPreview widget={widget} grid={grid}>{preview(widget)}</DashboardPreview><button className="dashboard-style-choice" type="button" aria-label={`${name}，${styleNames[style]}样式`} aria-pressed={selected.style === style} onClick={() => update({ style }, key)}><span>{styleNames[style]}</span><CheckCircle size={15} weight="fill" aria-hidden="true" /></button></div>;
      })}</div>
        {sourceError ? <p className="field-error" role="alert">{sourceError}</p> : null}
        {sizeError && <p className="field-error" role="alert">{sizeError}</p>}
        <div className="dashboard-size-controls"><div><span>卡片宽度</span><Segmented aria-label="卡片宽度" value={String(selected.width)} onChange={value => update({ width: Number(value) as WidgetWidth })} options={widthOptions} /></div><div><span>卡片高度</span><Segmented aria-label="卡片高度" value={String(selected.rows)} onChange={value => update({ rows: Number(value) as DashboardWidget['rows'] })} options={rowOptions} /></div></div>
      </div>
    </div><div className="dashboard-catalog-actions"><button type="button" className="btn btn-sec btn-sm" onClick={dismiss}>取消</button><button type="button" className="btn btn-pri btn-sm" onClick={() => { const error = apply(selected); if (error) setSizeError(error); }}>{exists ? '应用设置' : '添加到看板'}</button></div>
  </div>;
}

export function HomeView({ data, clock, userName, workspaceHeader, onNavigate, onOpenTask, onPending, onOpenCheckinSettings }: {
  data: TodoState | null; clock: Date; userName: string; workspaceHeader: HTMLDivElement | null; onNavigate(view: ViewId): void; onOpenTask(task: Task): void; onPending(message: string): void;
  onOpenCheckinSettings?: OpenCheckinSettings;
}) {
  const [saved, setSaved] = useState(() => { try { return readDashboard(localStorage.getItem(DASHBOARD_KEY)); } catch { return defaultDashboard(); } });
  const [draft, setDraft] = useState<DashboardLayout | null>(null), [catalog, setCatalog] = useState<{ initial: CatalogWidgetId; trigger: HTMLButtonElement } | null>(null);
  const catalogId = useId();
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (!workspaceHeader) setCatalog(null); }, [workspaceHeader]);
  const [dragged, setDragged] = useState<WidgetId | null>(null), [dropTarget, setDropTarget] = useState<WidgetId | null>(null), [announcement, setAnnouncement] = useState('');
  const [gapTarget, setGapTarget] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const [canvas, setCanvas] = useState<ReturnType<typeof measureDashboardCanvas> | null>(null);
  const resizing = useRef<{
    widget: DashboardWidget; original: DashboardLayout; edge: ResizeEdge; handle: HTMLButtonElement;
    pointerId: number; origin: number; initial: ResizeStop; value: number; stops: ResizeStop[];
    canvas: ReturnType<typeof measureDashboardCanvas>;
  } | null>(null), grid = useRef<HTMLDivElement>(null);
  const [activeResize, setActiveResize] = useState<{ id: WidgetId; edge: ResizeEdge } | null>(null);
  const [resizeCanvasHeight, setResizeCanvasHeight] = useState(0);
  useLayoutEffect(() => {
    const element = grid.current!;
    const measure = () => {
      const next = measureDashboardCanvas(element);
      const capture = resizing.current;
      if (capture && (capture.canvas.width !== next.width || capture.canvas.columns !== next.columns)) endResize(true);
      setCanvas(current => JSON.stringify(current) === JSON.stringify(next) ? current : next);
    };
    measure(); const observer = new ResizeObserver(measure); observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!activeResize) return;
    const cancel = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); endResize(true); } };
    window.addEventListener('keydown', cancel, true);
    return () => window.removeEventListener('keydown', cancel, true);
  }, [activeResize]);
  const layout = draft ?? saved, editing = draft !== null;
  const singleColumn = canvas?.columns === 1;
  const positioned = layout.widgets.some(widget => widget.position || (singleColumn && widget.singleColumnTop !== undefined)), placements = canvas ? dashboardPlacements(layout.widgets, canvas.columns, canvas.step, canvas.base, canvas.gap) : [];
  const beginEdit = () => setDraft(current => current ?? structuredClone(saved));
  const gridMinHeight = Math.max(editing ? resizeCanvasHeight : 0, ...(positioned ? placements.map(item => item.top + item.height) : []));
  function keepResizeCanvasHeight() {
    const height = grid.current?.clientHeight ?? 0;
    setResizeCanvasHeight(previous => Math.max(previous, height));
  }
  function readPlacements(element: HTMLDivElement, frame: ReturnType<typeof measureDashboardCanvas>): WidgetPlacement[] {
    const bounds = element.getBoundingClientRect(), unit = (frame.width + frame.gap) / frame.columns;
    return layout.widgets.map(widget => {
      const rect = element.querySelector<HTMLElement>(`[data-widget="${widget.id}"]`)!.getBoundingClientRect();
      return {
        id: widget.id, column: Math.round((rect.left - bounds.left) / unit),
        span: Math.round((rect.width + frame.gap) / unit), top: rect.top - bounds.top, height: rect.height,
      };
    });
  }
  function atSize(widget: DashboardWidget, edge: ResizeEdge, origin: WidgetPlacement, occupied: WidgetPlacement[], frame: ReturnType<typeof measureDashboardCanvas>) {
    const slot = resizeDashboardPlacement(origin, widget, edge, occupied, frame);
    if (!slot) return null;
    if (frame.columns === 1 && Math.abs(slot.height - origin.height) < 0.02) {
      return { ...layout, widgets: layout.widgets.map(item => item.id === widget.id ? widget : item) };
    }
    return updateDashboardPlacement(layout, widget, slot, occupied, frame);
  }
  function applyCatalogWidget(widget: DashboardWidget) {
    const existing = layout.widgets.find(item => item.id === widget.id);
    let next = { ...layout, widgets: existing ? layout.widgets.map(item => item.id === widget.id ? widget : item) : [...layout.widgets, widget] };
    if (existing && (existing.width !== widget.width || existing.rows !== widget.rows) && canvas && grid.current) {
      const occupied = readPlacements(grid.current, canvas);
      const resized = atSize(widget, 'right', occupied.find(item => item.id === widget.id)!, occupied, canvas);
      if (!resized) return '当前卡片周围空间不足，请选择较小尺寸或先移动卡片。';
      keepResizeCanvasHeight();
      next = resized;
    }
    setDraft(current => current ? next : current);
    setCatalog(null);
    setAnnouncement(`${widgetNames[widget.id]}卡片设置已应用，点击完成保存布局`);
    requestAnimationFrame(() => addButton.current?.focus({ preventScroll: true }));
  }
  function openCatalog(trigger: HTMLButtonElement) { if (resizing.current) return; if (catalog?.trigger === trigger) { setCatalog(null); return; } beginEdit(); setCatalog({ initial: CATALOG_IDS.find(key => !layout.widgets.some(widget => widget.id === key)) ?? 'today', trigger }); }
  function finish() {
    if (!draft) return;
    endResize();
    try { localStorage.setItem(DASHBOARD_KEY, JSON.stringify(draft)); setSaved(draft); setDraft(null); setResizeCanvasHeight(0); setAnnouncement('看板布局已保存'); } catch { onPending('看板布局保存失败，请重试'); }
  }
  function move(id: WidgetId, target: WidgetId) { setDraft(current => current ? moveDashboardWidget(current, id, target) : current); setAnnouncement(`${widgetNames[id]}已移动`); }
  function placeInCanvas(id: WidgetId, column: number, top: number, commit: boolean) {
    if (!canvas || !grid.current) return;
    const unit = (canvas.width + canvas.gap) / canvas.columns;
    const occupied = readPlacements(grid.current, canvas);
    const source = occupied.find(item => item.id === id)!;
    // 拖动已吸附网格；碰撞后保留卡片间距，避免再次跳过可用行。
    const slot = findDashboardSlot(Math.max(0, Math.min(canvas.columns - source.span, column)), Math.max(0, top), source.span, source.height, occupied.filter(item => item.id !== id), canvas.gap);
    if (commit) {
      const widget = layout.widgets.find(item => item.id === id)!;
      const next = updateDashboardPlacement(layout, widget, { ...source, ...slot }, occupied, canvas);
      const widgets = next.widgets.sort((a, b) => singleColumn
        ? a.singleColumnTop! - b.singleColumnTop!
        : a.position!.top - b.position!.top || a.position!.column - b.position!.column);
      setDraft(current => current ? { ...next, widgets } : current); setAnnouncement(`${widgetNames[id]}已放置，点击完成保存布局`); setDragged(null); setDropTarget(null); setGapTarget(null);
    } else {
      const width = unit * source.span - canvas.gap;
      setDropTarget(null); setGapTarget({ left: slot.column * unit + width / 2, top: slot.top + source.height / 2, width, height: source.height });
    }
  }
  function dropInGap(event: DragEvent<HTMLDivElement>, commit = false) {
    const target = (event.target as Element).closest<HTMLElement>('.dashboard-widget');
    if (!dragged || !canvas || (target && target.dataset.widget !== dragged)) return;
    event.preventDefault(); event.dataTransfer.dropEffect = 'move';
    const bounds = event.currentTarget.getBoundingClientRect(), unit = (canvas.width + canvas.gap) / canvas.columns;
    placeInCanvas(dragged, Math.round((event.clientX - bounds.left - dragOrigin.current.x) / unit), Math.round((event.clientY - bounds.top - dragOrigin.current.y) / canvas.step) * canvas.step, commit);
  }
  function moveByKey(event: KeyboardEvent, id: WidgetId) {
    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.altKey && canvas && grid.current) {
      event.preventDefault(); const bounds = grid.current.getBoundingClientRect(), rect = grid.current.querySelector<HTMLElement>(`[data-widget="${id}"]`)!.getBoundingClientRect();
      placeInCanvas(id, Math.round((rect.left - bounds.left) / ((canvas.width + canvas.gap) / canvas.columns)) + (event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0), (Math.round((rect.top - bounds.top) / canvas.step) + (event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0)) * canvas.step, true); return;
    }
    event.preventDefault(); const index = layout.widgets.findIndex(item => item.id === id), delta = ['ArrowUp', 'ArrowLeft'].includes(event.key) ? -1 : 1;
    const target = layout.widgets[index + delta]; if (target) move(id, target.id);
  }
  function resizeStops(widget: DashboardWidget, edge: ResizeEdge): ResizeStop[] {
    if (!canvas || !grid.current) return [];
    const horizontal = edge === 'left' || edge === 'right';
    const occupied = readPlacements(grid.current, canvas), origin = occupied.find(item => item.id === widget.id)!;
    const sizes = horizontal ? WIDGET_WIDTHS : WIDGET_ROWS;
    return sizes.flatMap(value => {
      const next = horizontal ? { ...widget, width: value as WidgetWidth } : { ...widget, rows: value as WidgetRows };
      const sized = value === (horizontal ? widget.width : widget.rows) ? layout : atSize(next, edge, origin, occupied, canvas);
      if (!sized) return [];
      const pixels = horizontal ? widgetPixelWidth(grid.current!, next.width) : canvas.base + next.rows * canvas.step;
      return [{ value, pixels, layout: sized }];
    });
  }
  function startResize(event: PointerEvent<HTMLButtonElement>, widget: DashboardWidget, edge: ResizeEdge) {
    const horizontal = edge === 'left' || edge === 'right';
    if (event.button !== 0 || !canvas || !grid.current || resizing.current || (horizontal && singleColumn)) return;
    const stops = resizeStops(widget, edge);
    const initial = stops.find(stop => stop.value === (horizontal ? widget.width : widget.rows));
    if (!initial) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    resizing.current = { widget, original: layout, edge, handle: event.currentTarget, pointerId: event.pointerId, origin: horizontal ? event.clientX : event.clientY, initial, value: initial.value, stops, canvas };
    event.currentTarget.setPointerCapture(event.pointerId);
    keepResizeCanvasHeight();
    setActiveResize({ id: widget.id, edge });
  }
  function resize(event: PointerEvent<HTMLButtonElement>) {
    const current = resizing.current;
    if (!current || current.pointerId !== event.pointerId) return;
    const horizontal = current.edge === 'left' || current.edge === 'right';
    const sign = current.edge === 'left' || current.edge === 'top' ? -1 : 1;
    const desired = current.initial.pixels + ((horizontal ? event.clientX : event.clientY) - current.origin) * sign;
    const next = current.stops.reduce((a, b) => Math.abs(b.pixels - desired) < Math.abs(a.pixels - desired) ? b : a, current.initial);
    if (next.value === current.value) return;
    current.value = next.value;
    setDraft(draft => draft ? next.layout : draft);
  }
  function endResize(cancel = false) {
    const current = resizing.current;
    if (!current) return;
    resizing.current = null;
    setActiveResize(null);
    const horizontal = current.edge === 'left' || current.edge === 'right';
    if (cancel) setDraft(draft => draft ? current.original : draft);
    if (current.handle.hasPointerCapture(current.pointerId)) current.handle.releasePointerCapture(current.pointerId);
    setAnnouncement(cancel ? '已撤销本次尺寸调整' : `${widgetNames[current.widget.id]}尺寸：${horizontal ? current.value : current.widget.width}列 × ${horizontal ? current.widget.rows : current.value}行，点击完成保存布局`);
  }
  function endPointerResize(pointerId: number, cancel = false) {
    if (resizing.current?.pointerId === pointerId) endResize(cancel);
  }
  function resizeByKey(event: KeyboardEvent<HTMLButtonElement>, widget: DashboardWidget, edge: ResizeEdge) {
    if (event.key === 'Escape' && resizing.current) { event.preventDefault(); event.stopPropagation(); endResize(true); return; }
    if (resizing.current) return;
    const horizontal = edge === 'left' || edge === 'right', keys = horizontal ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown'];
    if (![...keys, 'Home', 'End'].includes(event.key)) return;
    const stops = resizeStops(widget, edge);
    const index = stops.findIndex(stop => stop.value === (horizontal ? widget.width : widget.rows));
    if (index < 0) return;
    event.preventDefault();
    const motion = (event.key === keys[1] ? 1 : -1) * (edge === 'left' || edge === 'top' ? -1 : 1);
    const next = stops[event.key === 'Home' ? 0 : event.key === 'End' ? stops.length - 1 : Math.max(0, Math.min(stops.length - 1, index + motion))];
    if (next !== stops[index]) {
      keepResizeCanvasHeight();
      setDraft(draft => draft ? next.layout : draft);
    }
  }
  function openToolSettings() {
    const section = 'tools';
    sessionStorage.setItem('island-settings-section', section); onNavigate('settings-island');
    window.dispatchEvent(new CustomEvent('island-settings-section', { detail: section }));
  }
  function body(widget: DashboardWidget): ReactNode {
    if (widget.id === 'today') return <TodayContent data={data} clock={clock} style={widget.style} rows={widget.rows} navigate={() => onNavigate('todo')} openTask={onOpenTask} />;
    if (widget.id === 'schedule-stats') return <ScheduleStatsContent data={data} clock={clock} navigate={() => onNavigate('todo')} />;
    if (widget.id === 'focus') return <FocusWidget variant={widget.style} settings={openToolSettings} />;
    if (widget.id === 'checkin') return <CheckinHomeCard open={() => onNavigate('checkin')} connect={provider => onOpenCheckinSettings ? onOpenCheckinSettings('settings-apps', provider) : onNavigate('settings-apps')} embedded variant={widget.style as CheckinCardVariant} />;
    return <QuotaWidget variant={widget.style} settings={() => onNavigate('settings-agent-quota')} />;
  }
  const name = userName.trim();
  const title = name ? `${name} 的看板` : '我的看板';
  const dateLabel = `${clock.getMonth() + 1}月${clock.getDate()}日 ${['周日', '周一', '周二', '周三', '周四', '周五', '周六'][clock.getDay()]}`;
  return <section className="home-dashboard on" id="view-home" data-editing={editing}>
    {workspaceHeader && createPortal(
      <div className="dashboard-heading">
        <div className="dashboard-heading-copy">
          <h1 title={title}>{title}</h1>
          <span className="dashboard-heading-date">{dateLabel}</span>
        </div>
        <div className="dashboard-heading-actions">
          <button ref={addButton} className={`btn dashboard-heading-command ${editing ? 'btn-sec' : 'btn-pri'}`} aria-haspopup="dialog" aria-expanded={catalog !== null} aria-controls={catalog ? catalogId : undefined} onClick={event => openCatalog(event.currentTarget)}><Plus size={16} aria-hidden="true" />添加卡片</button>
          {editing ? <>
            <button className="btn btn-sec" onClick={() => { endResize(true); setDraft(null); setResizeCanvasHeight(0); setDragged(null); setDropTarget(null); }}>取消</button>
            <button className="btn btn-pri" onClick={finish}>完成</button>
          </> : <button className="btn btn-sec dashboard-heading-command" onClick={beginEdit}><PencilSimple size={16} aria-hidden="true" />编辑布局</button>}
        </div>
      </div>,
      workspaceHeader,
    )}
    <div ref={grid} className="dashboard-grid" data-positioned={positioned} style={gridMinHeight ? { minHeight: gridMinHeight } : undefined} onDragOver={event => dropInGap(event)} onDrop={event => dropInGap(event, true)} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setGapTarget(null); }}>{layout.widgets.map(widget => {
      const { id, width, rows, style } = widget;
      const place = positioned ? placements.find(item => item.id === id) : undefined;
      return <DashboardCard key={id} widget={widget} data-dragging={dragged === id} data-drop-target={dropTarget === id} data-resizing={activeResize?.id === id}
        style={place && canvas ? { left: (canvas.width + canvas.gap) * place.column / canvas.columns, top: place.top, width: (canvas.width + canvas.gap) * place.span / canvas.columns - canvas.gap } : undefined}
        onDragOver={event => { if (dragged && dragged !== id) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDropTarget(id); setGapTarget(null); } }} onDrop={event => { if (dragged === id) return; event.preventDefault(); event.stopPropagation(); if (dragged) move(dragged, id); setDragged(null); setDropTarget(null); setGapTarget(null); }}
        drag={editing ? <button className="dashboard-drag" draggable aria-label={`移动${widgetNames[id]}卡片`} title="拖动放置；方向键排序；Alt＋方向键移到空白网格" onKeyDown={event => moveByKey(event, id)} onDragStart={event => { const rect = event.currentTarget.closest('.dashboard-widget')!.getBoundingClientRect(); dragOrigin.current = { x: event.clientX - rect.left, y: event.clientY - rect.top }; event.dataTransfer.setData('text/plain', id); event.dataTransfer.effectAllowed = 'move'; setDragged(id); }} onDragEnd={() => { setDragged(null); setDropTarget(null); setGapTarget(null); }}><DotsSixVertical size={19} /></button> : undefined}
        tools={<><span className="dashboard-style-control" aria-hidden={!editing}><GameOptionsMenu kind="dashboard" active={editing} context={style} label={`更换${widgetNames[id]}卡片样式`} disabled={!editing || !availableStyles[id].some(option => option !== style)}>{close => <>
          <div className="dashboard-style-menu-title">更换样式</div><div className="dashboard-style-options" style={{ '--style-count': availableStyles[id].length } as CSSProperties} role="group" aria-label="展示样式">{availableStyles[id].map(option => {
            const optionId = option === 'counts' ? 'schedule-stats' : option === 'history' ? 'today' : id, preview = { ...widget, id: optionId, style: option };
            const exists = optionId !== id && layout.widgets.some(item => item.id === optionId);
            return <div className="dashboard-style-option" key={option}>
              <DashboardPreview widget={preview} grid={grid.current!}>{body(preview)}</DashboardPreview>
              <button className="dashboard-style-choice" type="button" role="menuitemradio" aria-label={`${widgetNames[id]}，${styleNames[option]}样式${exists ? '，已在看板中' : ''}`} aria-checked={option === style} disabled={exists} title={exists ? `${widgetNames[optionId]}已在看板中，移除后可切换` : undefined} onClick={() => { setDraft(current => current ? { ...current, widgets: current.widgets.map(item => item.id === id ? { ...item, id: optionId, style: option } : item) } : current); setAnnouncement(`${widgetNames[id]}已切换为${styleNames[option]}，点击完成保存布局`); close(); if (optionId !== id) requestAnimationFrame(() => grid.current?.querySelector<HTMLButtonElement>(`[data-widget="${optionId}"] .dashboard-style-trigger`)?.focus({ preventScroll: true })); }}><span>{styleNames[option]}</span>{exists ? <small>已在看板中</small> : <CheckCircle size={15} weight="fill" aria-hidden="true" />}</button>
            </div>;
          })}</div>
        </>}</GameOptionsMenu></span><button className="ibtn dashboard-remove" disabled={!editing} aria-hidden={!editing} aria-label={`移除${widgetNames[id]}卡片`} title="从看板移除" onClick={() => setDraft(current => current ? { ...current, widgets: current.widgets.filter(item => item.id !== id) } : current)}><X size={16} /></button></>}
        resize={editing ? <>{(Object.entries(resizeEdges) as [ResizeEdge, string][]).map(([edge, label]) => {
          const horizontal = edge === 'left' || edge === 'right';
          const size = horizontal ? width : rows;
          const unit = horizontal ? (singleColumn ? '列（宽窗）' : '列') : '行';
          const opposite = resizeEdges[edge === 'left' ? 'right' : edge === 'right' ? 'left' : edge === 'top' ? 'bottom' : 'top'];
          const title = horizontal
            ? (singleColumn ? '单列看板按画布宽度显示。用左右键设置宽窗宽度' : `拖动${label}边调整宽度，固定${opposite}边。支持左右键及 Home／End`)
            : `拖动${label}边调整高度，固定${opposite}边。支持上下键及 Home／End`;
          return <button key={edge} type="button" className="dashboard-resize" data-edge={edge} data-active={activeResize?.id === id && activeResize.edge === edge} role="slider" aria-label={`${widgetNames[id]}卡片${horizontal ? '宽度' : '高度'}，${label}边缘`} aria-orientation={horizontal ? 'horizontal' : 'vertical'} aria-valuemin={horizontal ? 2 : 1} aria-valuemax={horizontal ? 6 : 4} aria-valuenow={size} aria-valuetext={`${size}${unit}`} title={title} onPointerDown={event => startResize(event, widget, edge)} onPointerMove={resize} onPointerUp={event => endPointerResize(event.pointerId)} onPointerCancel={event => endPointerResize(event.pointerId, true)} onLostPointerCapture={event => endPointerResize(event.pointerId, true)} onKeyDown={event => resizeByKey(event, widget, edge)} />;
        })}{activeResize?.id === id ? <span className="dashboard-resize-hint" aria-hidden="true">{width}列 × {rows}行</span> : null}</> : undefined}>{body(widget)}</DashboardCard>;
    })}{gapTarget ? <span className="dashboard-gap-target" data-slot={!!gapTarget.width} aria-hidden="true" style={gapTarget}>松开放置</span> : null}</div>
    <span className="sr-only" role="status" aria-live="polite">{announcement}</span>
    {catalog && workspaceHeader ? <DashboardCatalog initial={catalog.initial} trigger={catalog.trigger} panelId={catalogId} grid={grid.current!} layout={layout} data={data} clock={clock} close={() => setCatalog(null)} apply={applyCatalogWidget} /> : null}
  </section>;
}
