import { z } from 'zod';
import type { AiTurnContext } from './ai-reference';
import {
  WIDGET_IDS, WIDGET_ROWS, WIDGET_STYLES, WIDGET_WIDTHS, dashboardPlacements, defaultWidget, findDashboardSlot,
  moveDashboardWidget, resizeDashboardPlacement, updateDashboardPlacement,
  type DashboardGrid, type DashboardLayout, type DashboardResizeEdge, type DashboardWidget,
  type WidgetId, type WidgetPlacement, type WidgetStyle,
} from './dashboard-layout';

export const dashboardTitles: Record<WidgetId, string> = { today: '待办摘要', 'schedule-stats': '日程待办统计', focus: '专注计时', checkin: '每日签到', quota: 'AI 额度' };
export const dashboardStyleNames: Record<WidgetStyle, string> = { history: '完成与待办堆叠图', counts: '日程与待办对比图', agenda: '今日安排', activity: '最近完成记录', digits: '数字倒计时', ring: '环形计时', bar: '横向进度', parallel: '应用并排', list: '列表', tiles: '应用卡片', progress: '领取进度', bars: '额度进度条', rings: '额度圆环' };
export const DASHBOARD_CATALOG = WIDGET_IDS.filter(id => id !== 'focus');
export const dashboardStyles = { ...WIDGET_STYLES, today: ['history', 'counts'], 'schedule-stats': ['history', 'counts'], checkin: ['list', 'tiles'] } as const;

export function dashboardStyleTarget(id: WidgetId, style: WidgetStyle): WidgetId {
  if (id !== 'today' && id !== 'schedule-stats') return id;
  return style === 'counts' ? 'schedule-stats' : 'today';
}

export const DASHBOARD_GRID: DashboardGrid = { columns: 6, step: 80, base: 100, gap: 12 };
export const dashboardUsesLastMove = (text: string) =>
  /(?:刚(?:刚|才)?|上次|上一(?:个|次)).{0,12}(?:挪|拖|移动|移过|移到|调整位置).{0,18}(?:卡|[这那][张个])|last (?:card (?:i|we) moved|moved card)/iu.test(text);
export function dashboardRequest(text: string): boolean {
  return dashboardUsesLastMove(text) || /(?:看板|(?:AI\s*额度|待办摘要|日程待办统计|专注计时|每日签到)(?:卡片|卡)|卡片.{0,10}(?:样式|布局|尺寸)|dashboard)/iu.test(text);
}

export function isDashboardScope(context?: AiTurnContext): boolean {
  return [context?.pageScope, context?.scope].every(scope =>
    !scope || scope.module === 'workbench' && scope.viewId === 'home');
}

const widgetId = z.enum(WIDGET_IDS);
const width = z.literal(WIDGET_WIDTHS), rows = z.literal(WIDGET_ROWS);
const styles = z.enum([...new Set(Object.values(WIDGET_STYLES).flat())]);
const column = z.number().int().min(0).max(DASHBOARD_GRID.columns - 1);
const top = z.number().min(0).max(Number.MAX_SAFE_INTEGER / DASHBOARD_GRID.step - 1000);
const position = z.object({ column, top }).strict();
const widget = z.object({
  id: widgetId, width, rows, style: styles, position: position.optional(),
  topOffset: z.number().int().positive().max(Math.floor(Number.MAX_SAFE_INTEGER / DASHBOARD_GRID.step - 1000)).optional(),
  singleColumnTop: top.optional(),
}).strict();
const layout = z.object({ widgets: z.array(widget).max(WIDGET_IDS.length) }).strict();
const target = z.union([widgetId, z.literal('last_moved')]);
export const dashboardActionSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('add'), id: widgetId, width: width.optional(), rows: rows.optional(), style: styles.optional() }).strict(),
  z.object({ kind: z.literal('move'), id: target, column, top }).strict(),
  z.object({ kind: z.literal('reorder'), id: target, targetId: widgetId }).strict(),
  z.object({ kind: z.literal('resize'), id: target, width: width.optional(), rows: rows.optional(), edge: z.enum(['left', 'right', 'top', 'bottom']).optional() }).strict(),
  z.object({ kind: z.literal('style'), id: target, style: styles }).strict(),
  z.object({ kind: z.literal('remove'), id: target }).strict(),
]);
export type DashboardAction = z.infer<typeof dashboardActionSchema>;
export const dashboardRevision = z.number().int().positive();
export const dashboardSaveSchema = z.object({
  operationId: z.string().uuid(), expectedRevision: dashboardRevision, layout,
  movedIds: z.array(widgetId).max(WIDGET_IDS.length),
}).strict();
export type DashboardSave = z.infer<typeof dashboardSaveSchema>;

export interface DashboardMove {
  revision: number;
  widgetIds: WidgetId[];
}

export interface DashboardSnapshot {
  revision: number;
  layout: DashboardLayout;
  lastUserMove?: DashboardMove;
  addedAt: Partial<Record<WidgetId, number>>;
}

export interface DashboardHandoff {
  revision: number;
  targetIds: WidgetId[];
  draftOpen?: boolean;
}

export interface DashboardReceipt {
  operationId: string;
  actor: 'user' | 'bot';
  snapshot: DashboardSnapshot;
  changed: { id: WidgetId; before?: DashboardWidget; after?: DashboardWidget }[];
}

export interface DashboardBridge {
  load(legacy?: string | null): Promise<DashboardSnapshot | null>;
  save(input: DashboardSave): Promise<DashboardReceipt>;
  onChanged(listener: () => void): () => void;
}

export class DashboardError extends Error {
  constructor(readonly code: 'UNINITIALIZED' | 'VERSION_CONFLICT' | 'REQUEST_ID_CONFLICT' | 'INVALID_LAYOUT' | 'INVALID_CARD', message: string) { super(message); }
}

const includesStyle = (values: readonly WidgetStyle[], style: WidgetStyle) => values.includes(style);

export function validateDashboardLayout(previous: DashboardLayout, next: DashboardLayout): DashboardLayout {
  const parsed = layout.parse(next);
  const existing = new Map(previous.widgets.map(item => [item.id, item]));
  const seen = new Set<WidgetId>();
  for (const item of parsed.widgets) {
    const old = existing.get(item.id);
    if (seen.has(item.id) || (!old && !DASHBOARD_CATALOG.some(id => id === item.id))) {
      throw new DashboardError('INVALID_LAYOUT', '每种卡片只能添加一次，并须来自当前看板的卡片目录。');
    }
    if (!includesStyle(WIDGET_STYLES[item.id], item.style) ||
      (old?.style !== item.style && !includesStyle(dashboardStyles[item.id], item.style))) {
      throw new DashboardError('INVALID_CARD', dashboardTitles[item.id] + '不支持这个样式。');
    }
    seen.add(item.id);
  }
  return { widgets: parsed.widgets.map(({ position, topOffset, singleColumnTop, ...fields }) => ({
    ...fields,
    ...(singleColumnTop === undefined ? {} : { singleColumnTop }),
    ...(topOffset === undefined ? {} : { topOffset }),
    ...(position === undefined ? {} : { position }),
  })) };
}

export function putDashboardWidget(layout: DashboardLayout, widget: DashboardWidget): DashboardLayout {
  const widgets = layout.widgets.some(item => item.id === widget.id)
    ? layout.widgets.map(item => item.id === widget.id ? widget : item)
    : [...layout.widgets, widget];
  return { widgets };
}

export function removeDashboardWidget(layout: DashboardLayout, id: WidgetId): DashboardLayout {
  return { widgets: layout.widgets.filter(widget => widget.id !== id) };
}

export function setDashboardStyle(layout: DashboardLayout, id: WidgetId, style: WidgetStyle): DashboardLayout {
  const current = layout.widgets.find(widget => widget.id === id);
  if (!current || !includesStyle(dashboardStyles[id], style)) {
    throw new DashboardError('INVALID_CARD', dashboardTitles[id] + '不支持这个样式或已从看板移除。');
  }
  const nextId = dashboardStyleTarget(id, style);
  if (nextId !== id && layout.widgets.some(widget => widget.id === nextId)) {
    throw new DashboardError('INVALID_CARD', dashboardTitles[nextId] + '已在看板中，请先移除再切换。');
  }
  return { widgets: layout.widgets.map(widget => widget.id === id ? { ...widget, id: nextId, style } : widget) };
}

export function dashboardDropPlacement(id: WidgetId, column: number, top: number, occupied: WidgetPlacement[], grid: DashboardGrid): WidgetPlacement {
  const source = occupied.find(item => item.id === id)!;
  const slot = findDashboardSlot(Math.max(0, Math.min(grid.columns - source.span, column)), Math.max(0, top),
    source.span, source.height, occupied.filter(item => item.id !== id), grid.gap);
  return { ...source, ...slot };
}

export function placeDashboardWidget(layout: DashboardLayout, widget: DashboardWidget, slot: WidgetPlacement, occupied: WidgetPlacement[], grid: DashboardGrid): DashboardLayout {
  const result = updateDashboardPlacement(layout, widget, slot, occupied, grid);
  result.widgets.sort((a, b) => grid.columns === 1 ? a.singleColumnTop! - b.singleColumnTop!
    : a.position!.top - b.position!.top || a.position!.column - b.position!.column);
  return result;
}

export function sizeDashboardWidget(layout: DashboardLayout, widget: DashboardWidget, edge: DashboardResizeEdge, origin: WidgetPlacement, occupied: WidgetPlacement[], grid: DashboardGrid): DashboardLayout | null {
  const slot = resizeDashboardPlacement(origin, widget, edge, occupied, grid);
  if (!slot) return null;
  return grid.columns === 1 && Math.abs(slot.height - origin.height) < 0.02
    ? putDashboardWidget(layout, widget)
    : updateDashboardPlacement(layout, widget, slot, occupied, grid);
}

export function applyDashboardAction(layout: DashboardLayout, action: DashboardAction, id: WidgetId): DashboardLayout {
  if (action.kind === 'add') {
    const defaults = defaultWidget(id);
    const style = action.style ?? (includesStyle(dashboardStyles[id], defaults.style) ? defaults.style : dashboardStyles[id][0]);
    if (layout.widgets.some(widget => widget.id === id) || !DASHBOARD_CATALOG.some(key => key === id) || dashboardStyleTarget(id, style) !== id) {
      throw new DashboardError('INVALID_CARD', '请选择目录中尚未添加的卡片与对应样式。');
    }
    return putDashboardWidget(layout, { id, width: action.width ?? defaults.width, rows: action.rows ?? defaults.rows, style });
  }
  const widget = layout.widgets.find(item => item.id === id);
  if (!widget) throw new DashboardError('INVALID_CARD', dashboardTitles[id] + '已不在看板中。');
  if (action.kind === 'remove') return removeDashboardWidget(layout, id);
  if (action.kind === 'style') return setDashboardStyle(layout, id, action.style);
  if (action.kind === 'reorder') {
    if (!layout.widgets.some(item => item.id === action.targetId)) throw new DashboardError('INVALID_CARD', '排序参照卡已不在看板中。');
    return moveDashboardWidget(layout, id, action.targetId);
  }
  const grid = DASHBOARD_GRID, occupied = dashboardPlacements(layout.widgets, grid.columns, grid.step, grid.base, grid.gap);
  const current = occupied.find(item => item.id === id)!;
  if (action.kind === 'move') {
    const slot = dashboardDropPlacement(id, action.column, action.top * grid.step, occupied, grid);
    return slot.column === current.column && Math.abs(slot.top - current.top) < 0.02 ? layout
      : placeDashboardWidget(layout, widget, slot, occupied, grid);
  }
  if (action.width === undefined && action.rows === undefined) throw new DashboardError('INVALID_LAYOUT', '请指定宽度或高度。');
  const updated = { ...widget, width: action.width ?? widget.width, rows: action.rows ?? widget.rows };
  if (updated.width === widget.width && updated.rows === widget.rows) return layout;
  const resized = sizeDashboardWidget(layout, updated, action.edge ?? 'right', current, occupied, grid);
  if (!resized) throw new DashboardError('INVALID_LAYOUT', '卡片周围空间不足，请选择较小尺寸或先移动卡片。');
  return resized;
}
