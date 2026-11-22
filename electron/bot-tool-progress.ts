import { dashboardActionSchema, dashboardTitles, type DashboardHandoff } from '../shared/dashboard-operations';

export function describeBotToolProgress(name: string, input: unknown, context: {
  dashboardHandoff?: DashboardHandoff;
  botName(id: string): string | undefined;
}): string | undefined {
  if (!input || typeof input !== 'object') return undefined;
  const args = input as Record<string, unknown>;
  if (name === 'dashboard_edit') {
    const parsed = dashboardActionSchema.safeParse(args.action);
    if (!parsed.success) return undefined;
    const { kind, id } = parsed.data;
    const handoff = context.dashboardHandoff;
    const lastMoved = handoff && !handoff.draftOpen && handoff.targetIds.length === 1 ? handoff.targetIds[0] : undefined;
    const cardId = id === 'last_moved' ? lastMoved : id;
    const card = cardId === 'quota' ? '额度卡' : cardId ? dashboardTitles[cardId] + '卡片' : '看板卡片';
    switch (kind) {
      case 'add': return '添加' + card;
      case 'move': return '移动' + card;
      case 'reorder': return '调整' + card + '顺序';
      case 'resize': return '调整' + card + '尺寸';
      case 'style': return '调整' + card + '样式';
      case 'remove': return '移除' + card;
    }
  }
  if (name === 'send_to_bot' && typeof args.botId === 'string') {
    const botName = context.botName(args.botId)?.replace(/\s+/g, ' ').trim();
    const recipient = botName && botName.length <= 16 ? botName : undefined;
    if (args.purpose === 'query') return recipient ? `向${recipient}查询` : '查询协作信息';
    if (args.purpose === 'notification') return recipient ? `通知${recipient}` : '发送协作通知';
    return recipient ? `交给${recipient}处理` : undefined;
  }
  if (name === 'propose_create' && args.kind === 'meeting') return '准备日程建议';
  if (name === 'browser_check' && args.operation === 'plan') return '准备网页核对';
  return undefined;
}
