import { createHash } from 'node:crypto';
import { Type } from 'typebox';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { z } from 'zod';
import { dashboardPlacements, type WidgetId } from '../shared/dashboard-layout';
import {
  DASHBOARD_CATALOG, DASHBOARD_GRID, DashboardError, dashboardActionSchema, dashboardRevision,
  dashboardStyleNames, dashboardStyles, dashboardTitles, type DashboardHandoff, type DashboardSnapshot,
} from '../shared/dashboard-operations';
import type { BotTask } from '../shared/bot-contracts';
import type { BotHost } from './bot-host';
import type { DashboardStore } from './dashboard-store';

export const dashboardPrompt = '总台看板由你负责。用户要求查看或改动看板时先调用 dashboard_read，按真实卡片目录和版本执行。把“刚挪的那张”等说法交给 last_moved；它指发送时最近一次手动保存的移动。需要用户选择时先停下。用户只要求改某个属性时只提交该属性。位置列从 0 到 5，top 是每 80px 一单位，右上角按卡片宽度右对齐。只在用户明确要求时修改布局；移除仅指看板中的卡片。执行成功后按回执说明实际卡片和变化。遇到版本变化先读取最新状态，若同一属性被改则请用户核对。';

const result = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value) }], details: {} });
const editInput = z.object({ expectedRevision: dashboardRevision, action: dashboardActionSchema }).strict();

function savedTargets(handoff: DashboardHandoff, snapshot: DashboardSnapshot): WidgetId[] {
  return handoff.targetIds.filter(id => (snapshot.addedAt[id] ?? Infinity) <= handoff.revision);
}

export function dashboardTools(task: BotTask, store: DashboardStore, host: BotHost, changed: () => void) {
  let observed: DashboardSnapshot | null = null;
  const handoff = task.dashboardHandoff;
  const choiceId = task.id + ':dashboard-target:' + (task.requirementsRevision ?? 0);

  function resolveHandoff(snapshot: DashboardSnapshot): { id?: WidgetId; issue?: string; choices?: WidgetId[] } {
    if (!handoff) return {};
    if (handoff.draftOpen) return { issue: '请先在看板点「完成」，再让我接手刚移动的卡片。也可以直接指定卡片名称。' };
    const choices = savedTargets(handoff, snapshot);
    if (!choices.length) return { issue: '没有可接手的已保存移动，或原卡片已被移除。请保存移动，或告诉我卡片名称。' };
    if (choices.length === 1) return { id: choices[0] };
    const answer = host.store.actions(task.id).find(action => action.id === choiceId && action.status === 'applied')?.receipt as { answer?: string } | undefined;
    const selected = choices.find(id => dashboardTitles[id] === answer?.answer);
    return selected ? { id: selected } : { choices };
  }

  return [
    defineTool({
      name: 'dashboard_read', label: '读取看板', description: '读取已保存的看板版本、卡片、有效位置、可用样式以及本次人机接续的目标。',
      parameters: Type.Object({}), executionMode: 'sequential',
      execute: async () => {
        const snapshot = store.read();
        if (!snapshot) throw new DashboardError('UNINITIALIZED', '请先打开总台看板，完成首次加载。');
        observed = snapshot;
        const target = resolveHandoff(snapshot);
        if (target.choices) {
          const options = target.choices.map(id => ({ label: dashboardTitles[id] }));
          host.waitForAction(task.id, choiceId, 'question', { question: '刚才保存时移动了多张卡片，你想接着改哪一张？', options });
          return result({ waitingForChoice: true, options });
        }
        const { columns, step, base, gap } = DASHBOARD_GRID;
        const placements = dashboardPlacements(snapshot.layout.widgets, columns, step, base, gap);
        return result({
          revision: snapshot.revision,
          widgets: snapshot.layout.widgets.map(widget => {
            const place = placements.find(item => item.id === widget.id)!;
            return { ...widget, title: dashboardTitles[widget.id], styleName: dashboardStyleNames[widget.style],
              effectivePosition: { column: place.column, top: place.top / step },
              styles: dashboardStyles[widget.id].map(style => ({ style, title: dashboardStyleNames[style] })) };
          }),
          catalog: DASHBOARD_CATALOG.map(id => ({ id, title: dashboardTitles[id],
            styles: dashboardStyles[id].map(style => ({ style, title: dashboardStyleNames[style] })) })),
          lastMoved: target.id ?? null, handoffIssue: target.issue,
        });
      },
    }),
    defineTool({
      name: 'dashboard_edit', label: '修改看板',
      description: '用已读取的版本对单张卡执行 add、move、reorder、resize、style 或 remove。id 使用目录 ID，或使用 last_moved 接续用户刚移动的卡。返回实际写入的卡片和版本。',
      parameters: Type.Unsafe<z.infer<typeof editInput>>(z.toJSONSchema(editInput)), executionMode: 'sequential',
      execute: async (callId, input) => {
        const { expectedRevision, action } = editInput.parse(input);
        if (!observed || observed.revision !== expectedRevision) {
          throw new DashboardError('VERSION_CONFLICT', '请先读取当前看板，再使用返回的版本。');
        }
        const target = resolveHandoff(observed);
        if (action.kind !== 'add' && (handoff || action.id === 'last_moved') && !target.id) {
          throw new DashboardError('INVALID_CARD', target.issue ?? '请先确定要接着修改的卡片。');
        }
        if (handoff && (action.kind === 'add' || action.id !== 'last_moved' && action.id !== target.id)) {
          throw new DashboardError('INVALID_CARD', '这次要求指向用户已选定的卡片，请按接续目标操作。');
        }
        const id = action.id === 'last_moved' ? target.id! : action.id;
        const toolKey = createHash('sha256').update(callId).digest('hex').slice(0, 20);
        const operationId = task.id + ':' + (task.requirementsRevision ?? 0) + ':' + toolKey;
        const receipt = store.edit(operationId, expectedRevision, action, id);
        observed = receipt.snapshot;
        if (receipt.changed.length) changed();
        if (host.store.task(task.id).kind === 'chat') {
          host.store.updateTask(task.id, { kind: 'work' });
          host.changed({ kind: 'task', taskId: task.id, botId: task.botId, chatId: task.chatId });
        }
        return result({ id, operationId, revision: receipt.snapshot.revision, appliedCount: receipt.changed.length, changed: receipt.changed });
      },
    }),
  ];
}
