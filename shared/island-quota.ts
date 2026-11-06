import type { QuotaWindow } from './island-contracts';

const object = (value: unknown): Record<string, unknown> => value && typeof value === 'object' ? value as Record<string, unknown> : {};
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
export function quotaPeriod(minutes: unknown): string {
  if (!finite(minutes) || minutes <= 0) return '当前周期';
  if (minutes === 10080) return '周';
  if (minutes % 1440 === 0) return `${minutes / 1440}天`;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}分钟`;
}
const remaining = (used: number) => Math.round(Math.max(0, Math.min(100, 100 - used)));
const resetTime = (value: unknown) => finite(value) && value > 0 ? value < 1e12 ? value * 1000 : value : null;

export function codexQuotaWindows(input: unknown): QuotaWindow[] {
  const data = object(input), byId = object(data.rateLimitsByLimitId);
  const snapshot = object(byId.codex ?? data.rateLimits);
  return [snapshot.primary, snapshot.secondary].flatMap(raw => {
    const window = object(raw);
    return finite(window.usedPercent) ? [{ label: quotaPeriod(window.windowDurationMins), remaining: remaining(window.usedPercent), resetsAt: resetTime(window.resetsAt) }] : [];
  });
}
export function zcodeQuotaWindows(input: unknown): QuotaWindow[] {
  const response = object(input), data = object(response.data ?? response);
  if (!Array.isArray(data.limits)) return [];
  return data.limits.flatMap(raw => {
    const limit = object(raw);
    if (!finite(limit.percentage)) return [];
    const fallback = limit.type === 'TOKENS_LIMIT' ? 'Token 配额' : limit.type === 'CREDIT_LIMIT' ? '积分配额' : limit.type === 'TIME_LIMIT' ? 'MCP 配额' : '服务配额';
    // Z Code reports hours as unit 3 and weeks as unit 6, with the count in number.
    const minutes = finite(limit.windowDurationMins) && limit.windowDurationMins > 0 ? limit.windowDurationMins
      : finite(limit.number) && limit.number > 0 ? limit.number * (limit.unit === 3 ? 60 : limit.unit === 6 ? 10080 : 0) : 0;
    // Unknown periods stay unnamed; the UI must not invent a 5h/week window.
    const label = minutes > 0 ? quotaPeriod(minutes) : typeof limit.name === 'string' ? limit.name.slice(0, 60) : fallback;
    return [{ label, remaining: remaining(limit.percentage), resetsAt: resetTime(limit.nextResetTime) }];
  });
}
const usageReset = (value: unknown): number | null => {
  if (typeof value === 'string') { const parsed = Date.parse(value); return Number.isFinite(parsed) ? parsed : null; }
  return resetTime(value);
};
export function cursorQuotaWindows(input: unknown): QuotaWindow[] {
  const data = object(input), plan = object(object(data.individualUsage).plan);
  if (plan.enabled === false) return [];
  const resetsAt = usageReset(data.billingCycleEnd);
  const pools = [['Cursor 模型', plan.autoPercentUsed], ['其他模型', plan.apiPercentUsed]] as const;
  const windows = pools.flatMap(([label, used]) => finite(used) && used >= 0 ? [{ label, remaining: remaining(used), resetsAt }] : []);
  if (windows.length) return windows;
  const used = finite(plan.totalPercentUsed) ? plan.totalPercentUsed : finite(plan.used) && finite(plan.limit) && plan.limit > 0 ? 100 * plan.used / plan.limit : null;
  return finite(used) && used >= 0 ? [{ label: '套餐额度', remaining: remaining(used), resetsAt }] : [];
}
export function grokbotQuotaWindows(input: unknown): QuotaWindow[] {
  const data = object(input);
  if (data.usesPooledEnterpriseAllowance === true || data.hasNonZeroIncludedLimit === false || !finite(data.usagePercent) || data.usagePercent < 0) return [];
  return [{ label: '周', remaining: remaining(data.usagePercent), resetsAt: usageReset(data.nextResetTimestampUtc) }];
}
export function quotaSummary(windows: QuotaWindow[]): string {
  const lowest = windows.reduce<QuotaWindow | null>((a, b) => !a || b.remaining < a.remaining ? b : a, null);
  return lowest ? `${lowest.remaining}% · ${lowest.label}` : '暂无指标';
}
export function quotaDisplayWindows(windows: QuotaWindow[]): QuotaWindow[] {
  const order = (label: string) => label === '5h' ? 0 : label === '周' ? 1 : 2;
  return [...windows].sort((a, b) => order(a.label) - order(b.label));
}
