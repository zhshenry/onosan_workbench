import type { BrowserWorkspaceState } from './browser-automation-contracts';

export const browserTimeOptions = [{ value: 'all', label: '所有时间' }, { value: 'hour', label: '最近 1 小时' }, { value: 'day', label: '最近 24 小时' }, { value: 'week', label: '最近 7 天' }, { value: 'month', label: '最近 4 周' }];
export function browserHistorySince(range: string, now = Date.now()): number | undefined {
  const duration = ({ hour: 3600000, day: 86400000, week: 604800000, month: 2419200000 } as Record<string, number>)[range];
  return duration === undefined ? undefined : now - duration;
}
export function filterBrowserHistory(history: BrowserWorkspaceState['history'], text: string, since?: number) {
  const query = text.trim().toLocaleLowerCase();
  return history.filter(item => (!query || `${item.title}\n${item.url}`.toLocaleLowerCase().includes(query)) && (since === undefined || Date.parse(item.at) >= since)).slice().reverse();
}
export function browserAddressTarget(input: string): string | undefined {
  const value = input.trim(); if (!value) return undefined;
  const address = /^https?:\/\//i.test(value) || !/\s/.test(value) && (/^(?:localhost|\[[\da-f:]+\]|[\w-]+(?:\.[\w-]+)+)(?::\d+)?(?:[/?#]|$)/i.test(value));
  if (!address) return /^[a-z][a-z\d+.-]*:/i.test(value) ? undefined : `https://www.google.com/search?q=${encodeURIComponent(value)}`;
  try { const url = new URL(/^https?:/i.test(value) ? value : `${/^localhost(?::|\/|$)/i.test(value) ? 'http' : 'https'}://${value}`); return url.username || url.password ? undefined : url.href; } catch { return undefined; }
}
