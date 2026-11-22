import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { readDashboard, type DashboardLayout, type DashboardWidget, type WidgetId } from '../shared/dashboard-layout';
import {
  DashboardError, applyDashboardAction, dashboardActionSchema, dashboardRevision, dashboardSaveSchema,
  validateDashboardLayout, type DashboardReceipt, type DashboardSnapshot,
} from '../shared/dashboard-operations';

export class DashboardStore {
  private readonly db: DatabaseSync;

  constructor(directory: string) {
    this.db = new DatabaseSync(join(directory, 'dashboard.db'), { timeout: 5000 });
    this.db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;');
    this.db.exec('CREATE TABLE IF NOT EXISTS dashboard (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);');
    this.db.exec('CREATE TABLE IF NOT EXISTS dashboard_operations (id TEXT PRIMARY KEY, request TEXT NOT NULL, receipt TEXT NOT NULL);');
  }

  read(): DashboardSnapshot | null {
    const row = this.db.prepare('SELECT payload FROM dashboard WHERE id=1').get() as { payload: string } | undefined;
    return row ? JSON.parse(row.payload) as DashboardSnapshot : null;
  }

  initialize(legacy: string | null): DashboardSnapshot {
    const layout = readDashboard(legacy);
    const snapshot: DashboardSnapshot = { layout, revision: 1, addedAt: Object.fromEntries(layout.widgets.map(widget => [widget.id, 1])) };
    this.db.prepare('INSERT OR IGNORE INTO dashboard VALUES (1, ?)').run(JSON.stringify(snapshot));
    return this.read()!;
  }

  save(input: unknown): DashboardReceipt {
    const request = dashboardSaveSchema.parse(input);
    return this.commit(request.operationId, request.expectedRevision, 'user', request, () => request.layout, request.movedIds);
  }

  edit(operationId: string, expectedRevision: number, input: unknown, resolvedId: WidgetId): DashboardReceipt {
    const action = dashboardActionSchema.parse(input);
    dashboardRevision.parse(expectedRevision);
    if (action.id !== 'last_moved' && action.id !== resolvedId) throw new DashboardError('INVALID_CARD', '看板操作的目标已变化。');
    return this.commit(operationId, expectedRevision, 'bot', { action, resolvedId },
      layout => applyDashboardAction(layout, action, resolvedId));
  }

  private commit(operationId: string, expectedRevision: number, actor: DashboardReceipt['actor'], content: unknown, update: (layout: DashboardLayout) => DashboardLayout, movedIds: WidgetId[] = []): DashboardReceipt {
    const request = JSON.stringify({ actor, expectedRevision, content });
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const prior = this.db.prepare('SELECT request, receipt FROM dashboard_operations WHERE id=?').get(operationId) as { request: string; receipt: string } | undefined;
      if (prior && prior.request !== request) throw new DashboardError('REQUEST_ID_CONFLICT', '此操作标识已经用于另一项看板修改。');
      const receipt = prior ? JSON.parse(prior.receipt) as DashboardReceipt : this.write(operationId, expectedRevision, actor, update, movedIds);
      if (!prior) this.db.prepare('INSERT INTO dashboard_operations VALUES (?, ?, ?)').run(operationId, request, JSON.stringify(receipt));
      this.db.exec('COMMIT');
      return receipt;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }

  private write(operationId: string, expectedRevision: number, actor: DashboardReceipt['actor'], update: (layout: DashboardLayout) => DashboardLayout, movedIds: WidgetId[]): DashboardReceipt {
    const previous = this.read();
    if (!previous) throw new DashboardError('UNINITIALIZED', '请先打开总台看板，完成首次加载。');
    if (previous.revision !== expectedRevision) {
      throw new DashboardError('VERSION_CONFLICT', '看板已更新，请读取最新布局后再修改。');
    }
    const layout = validateDashboardLayout(previous.layout, update(previous.layout));
    const before = new Map(previous.layout.widgets.map(widget => [widget.id, widget]));
    const after = new Map(layout.widgets.map(widget => [widget.id, widget]));
    const oldOrder = previous.layout.widgets.filter(widget => after.has(widget.id)).map(widget => widget.id);
    const newOrder = layout.widgets.filter(widget => before.has(widget.id)).map(widget => widget.id);
    const ordered = new Set(newOrder.filter((id, index) => id !== oldOrder[index]));
    const changed = [...new Set([...before.keys(), ...after.keys()])].flatMap(id => {
      const old = before.get(id), current = after.get(id);
      if (!ordered.has(id) && old && current && old.style === current.style && old.width === current.width
        && old.rows === current.rows && movement(old) === movement(current)) return [];
      return [{ id, ...(old ? { before: old } : {}), ...(current ? { after: current } : {}) }];
    });
    if (!changed.length) return { operationId, actor, snapshot: previous, changed };

    const revision = previous.revision + 1;
    const explicitMoves = [...new Set(movedIds)].filter(id => {
      const old = before.get(id), current = after.get(id);
      return old && current && (ordered.has(id) || movement(old) !== movement(current));
    });
    const lastUserMove = explicitMoves.length ? { revision, widgetIds: explicitMoves }
      : previous.lastUserMove && { ...previous.lastUserMove, widgetIds: previous.lastUserMove.widgetIds.filter(id => after.has(id)) };
    const addedAt = Object.fromEntries(layout.widgets.map(widget => [widget.id, previous.addedAt[widget.id] ?? revision]));
    const snapshot: DashboardSnapshot = { revision, layout, ...(lastUserMove && lastUserMove.widgetIds.length ? { lastUserMove } : {}), addedAt };
    this.db.prepare('UPDATE dashboard SET payload=? WHERE id=1').run(JSON.stringify(snapshot));
    return { operationId, actor, snapshot, changed };
  }

  close(): void { this.db.close(); }
}

function movement(widget: DashboardWidget): string {
  return JSON.stringify([widget.position, widget.singleColumnTop, widget.topOffset]);
}
