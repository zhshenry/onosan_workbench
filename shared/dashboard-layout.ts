export const DASHBOARD_KEY = 'wb.home.dashboard';
export const WIDGET_IDS = ['today', 'schedule-stats', 'focus', 'checkin', 'quota'] as const;
export type WidgetId = typeof WIDGET_IDS[number];
export const WIDGET_WIDTHS = [2, 3, 4, 6] as const;
export type WidgetWidth = typeof WIDGET_WIDTHS[number];
export const WIDGET_ROWS = [1, 2, 3, 4] as const;
export type WidgetRows = typeof WIDGET_ROWS[number];
export const WIDGET_STYLES = {
  today: ['history', 'agenda', 'activity'],
  'schedule-stats': ['counts'],
  focus: ['digits', 'ring', 'bar'],
  checkin: ['parallel', 'list', 'tiles', 'progress'],
  quota: ['bars', 'rings', 'list'],
} as const;
export type WidgetStyle = typeof WIDGET_STYLES[WidgetId][number];
/** Optional positions use six-column coordinates and vertical height-step units. */
export interface DashboardWidget { id: WidgetId; width: WidgetWidth; rows: WidgetRows; style: WidgetStyle; topOffset?: number; position?: { column: number; top: number }; singleColumnTop?: number; }
export interface DashboardLayout { widgets: DashboardWidget[]; }
export interface WidgetPlacement { id: WidgetId; column: number; span: number; top: number; height: number; }

export interface DashboardGrid { columns: number; step: number; base: number; gap: number; }
export type DashboardResizeEdge = 'left' | 'right' | 'top' | 'bottom';

function columnSpan(width: WidgetWidth, columns: number) {
  return columns === 1 ? 1 : columns === 2 ? (width >= 4 ? 2 : 1) : width;
}

function overlaps(a: Omit<WidgetPlacement, 'id'>, b: WidgetPlacement, gap: number) {
  // Allow for rounding between rendered coordinates and saved height-step units.
  const tolerance = 0.02;
  return a.column < b.column + b.span && a.column + a.span > b.column
    && a.top < b.top + b.height + gap - tolerance && a.top + a.height + gap > b.top + tolerance;
}

export function resizeDashboardPlacement(origin: WidgetPlacement, size: Pick<DashboardWidget, 'width' | 'rows'>, edge: DashboardResizeEdge, occupied: readonly WidgetPlacement[], grid: DashboardGrid): WidgetPlacement | null {
  const span = columnSpan(size.width, grid.columns);
  const height = grid.base + size.rows * grid.step;
  const column = edge === 'left' ? origin.column + origin.span - span : origin.column;
  const top = edge === 'top' ? origin.top + origin.height - height : origin.top;
  if (column < 0 || column + span > grid.columns || top < -0.02) return null;
  const placement = { ...origin, column, span, top: Math.max(0, top), height };
  return occupied.some(other => other.id !== origin.id && overlaps(placement, other, grid.gap)) ? null : placement;
}

export function updateDashboardPlacement(layout: DashboardLayout, widget: DashboardWidget, placement: WidgetPlacement, occupied: readonly WidgetPlacement[], grid: DashboardGrid): DashboardLayout {
  const widgets = layout.widgets.map(item => {
    const changed = item.id === widget.id;
    const slot = changed ? placement : occupied.find(other => other.id === item.id);
    if (!slot) return item;
    const next = changed ? widget : item;
    const top = Math.max(0, slot.top) / grid.step;
    if (grid.columns === 1) return { ...next, singleColumnTop: top };
    return { ...next, topOffset: undefined, position: { column: Math.round(slot.column * 6 / grid.columns), top } };
  });
  return { ...layout, widgets };
}

export function defaultWidget(id: WidgetId): DashboardWidget {
  return { id, width: id === 'today' || id === 'checkin' || id === 'schedule-stats' ? 4 : 2, rows: 2, style: id === 'focus' ? 'ring' : WIDGET_STYLES[id][0] };
}

export function defaultDashboard(): DashboardLayout {
  return { widgets: WIDGET_IDS.filter(id => id !== 'schedule-stats').map(defaultWidget) };
}

/** Restore supported card settings; an intentionally empty board stays empty. */
export function readDashboard(raw: string | null): DashboardLayout {
  if (!raw) return defaultDashboard();
  try {
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.widgets)) return defaultDashboard();
    const seen = new Set<WidgetId>();
    const widgets = data.widgets.flatMap((item: DashboardWidget) => {
      if (!item || !WIDGET_IDS.includes(item.id) || !WIDGET_WIDTHS.includes(item.width) || seen.has(item.id)) return [];
      seen.add(item.id);
      const fallback = defaultWidget(item.id);
      const position = item.position, singleColumnTop = item.singleColumnTop;
      return [{ id: item.id, width: item.width, rows: WIDGET_ROWS.includes(item.rows) ? item.rows : fallback.rows, style: (WIDGET_STYLES[item.id] as readonly string[]).includes(item.style) ? item.style : fallback.style, ...(typeof singleColumnTop === 'number' && Number.isFinite(singleColumnTop) && singleColumnTop >= 0 ? { singleColumnTop } : {}), ...(Number.isSafeInteger(item.topOffset) && item.topOffset! > 0 ? { topOffset: item.topOffset } : {}), ...(position && Number.isInteger(position.column) && position.column >= 0 && position.column < 6 && typeof position.top === 'number' && Number.isFinite(position.top) && position.top >= 0 ? { position: { column: position.column, top: position.top } } : {}) }];
    });
    return { widgets };
  } catch { return defaultDashboard(); }
}

export function moveDashboardWidget(layout: DashboardLayout, id: WidgetId, target: WidgetId): DashboardLayout {
  const from = layout.widgets.findIndex(item => item.id === id), to = layout.widgets.findIndex(item => item.id === target);
  if (from < 0 || to < 0 || from === to) return layout;
  const widgets = [...layout.widgets];
  widgets.splice(to, 0, ...widgets.splice(from, 1));
  return {
    ...layout,
    widgets: layout.widgets.some(widget => widget.position || widget.singleColumnTop !== undefined)
      ? widgets.map((widget, index) => {
        const slot = layout.widgets[index];
        const next = { ...widget, position: slot.position };
        if (slot.singleColumnTop === undefined) delete next.singleColumnTop;
        else next.singleColumnTop = slot.singleColumnTop;
        return next;
      })
      : widgets,
  };
}

export function resizeDashboardHeight(widget: DashboardWidget, rows: WidgetRows, edge: 'top' | 'bottom'): DashboardWidget {
  const topOffset = (widget.position?.top ?? 0) + (widget.topOffset ?? 0) + (edge === 'top' ? widget.rows - rows : 0);
  if (topOffset < 0) return widget;
  const next = { ...widget, rows };
  if (widget.position) { next.position = { ...widget.position, top: topOffset }; delete next.topOffset; }
  else if (topOffset) next.topOffset = topOffset; else delete next.topOffset;
  return next;
}

export function findDashboardSlot(column: number, top: number, span: number, height: number, occupied: WidgetPlacement[], gap: number, step = 1) {
  for (;;) {
    const hits = occupied.filter(item => overlaps({ column, span, top, height }, item, gap));
    if (!hits.length) return { column, top };
    top = Math.ceil(Math.max(...hits.map(item => item.top + item.height + gap)) / step) * step;
  }
}

export function dashboardPlacements(widgets: DashboardWidget[], columns: number, step: number, base: number, gap: number): WidgetPlacement[] {
  const placed: WidgetPlacement[] = [];
  for (const widget of widgets) {
    const span = columnSpan(widget.width, columns), height = base + widget.rows * step;
    let slot;
    const singleColumnTop = columns === 1 ? widget.singleColumnTop : undefined;
    if (widget.position || singleColumnTop !== undefined) {
      const column = Math.min(columns - span, Math.floor((widget.position?.column ?? 0) * columns / 6));
      const top = singleColumnTop ?? ((widget.position?.top ?? 0) + (widget.topOffset ?? 0));
      slot = findDashboardSlot(column, top * step, span, height, placed, gap);
    } else {
      const candidates = [...new Set([0, ...placed.map(item => item.top + item.height + gap)])].sort((a, b) => a - b);
      for (const top of candidates) {
        for (let column = 0; column <= columns - span; column++) {
          const candidate = findDashboardSlot(column, top + (widget.topOffset ?? 0) * step, span, height, placed, gap);
          if (candidate.top === top + (widget.topOffset ?? 0) * step) { slot = candidate; break; }
        }
        if (slot) break;
      }
    }
    placed.push({ id: widget.id, span, height, ...slot! });
  }
  return placed;
}
