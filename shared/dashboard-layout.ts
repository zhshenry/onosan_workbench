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
export interface DashboardWidget { id: WidgetId; width: WidgetWidth; rows: WidgetRows; style: WidgetStyle; topOffset?: number; position?: { column: number; top: number }; }
export interface DashboardLayout { widgets: DashboardWidget[]; }
export interface WidgetPlacement { id: WidgetId; column: number; span: number; top: number; height: number; }

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
      const position = item.position;
      return [{ id: item.id, width: item.width, rows: WIDGET_ROWS.includes(item.rows) ? item.rows : fallback.rows, style: (WIDGET_STYLES[item.id] as readonly string[]).includes(item.style) ? item.style : fallback.style, ...(Number.isSafeInteger(item.topOffset) && item.topOffset! > 0 ? { topOffset: item.topOffset } : {}), ...(position && Number.isInteger(position.column) && position.column >= 0 && position.column < 6 && typeof position.top === 'number' && Number.isFinite(position.top) && position.top >= 0 ? { position: { column: position.column, top: position.top } } : {}) }];
    });
    return { widgets };
  } catch { return defaultDashboard(); }
}

export function moveDashboardWidget(layout: DashboardLayout, id: WidgetId, target: WidgetId): DashboardLayout {
  const from = layout.widgets.findIndex(item => item.id === id), to = layout.widgets.findIndex(item => item.id === target);
  if (from < 0 || to < 0 || from === to) return layout;
  const widgets = [...layout.widgets];
  widgets.splice(to, 0, ...widgets.splice(from, 1));
  return { ...layout, widgets: layout.widgets.some(widget => widget.position) ? widgets.map((widget, index) => ({ ...widget, position: layout.widgets[index].position })) : widgets };
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
    const hits = occupied.filter(item => column < item.column + item.span && column + span > item.column && top < item.top + item.height + gap && top + height + gap > item.top);
    if (!hits.length) return { column, top };
    top = Math.ceil(Math.max(...hits.map(item => item.top + item.height + gap)) / step) * step;
  }
}

export function dashboardPlacements(widgets: DashboardWidget[], columns: number, step: number, base: number, gap: number): WidgetPlacement[] {
  const placed: WidgetPlacement[] = [];
  for (const widget of widgets) {
    const span = columns === 1 ? 1 : columns === 2 ? widget.width >= 4 ? 2 : 1 : widget.width, height = base + widget.rows * step;
    let slot;
    if (widget.position) {
      const column = Math.min(columns - span, Math.floor(widget.position.column * columns / 6));
      slot = findDashboardSlot(column, ((widget.position.top ?? 0) + (widget.topOffset ?? 0)) * step, span, height, placed, gap);
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
