import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { browserRecordUrl, type BrowserTask, type BrowserWorkspaceState } from '../../shared/browser-automation-contracts';

const tabsSchema = z.array(z.object({ id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/), url: z.string().max(4096) }).strict()).max(20);
export class BrowserStore {
  private data: Record<string, BrowserWorkspaceState> = {};
  constructor(private readonly filename: string) {
    if (existsSync(filename)) {
      try {
        const parsed = JSON.parse(readFileSync(filename, 'utf8'));
        if (parsed.version === 1 && parsed.workspaces && typeof parsed.workspaces === 'object') {
          for (const [workspace, raw] of Object.entries(parsed.workspaces)) {
            const value = raw as BrowserWorkspaceState;
            if (!Array.isArray(value.tasks) || !Array.isArray(value.history)) continue;
            const tabs = tabsSchema.safeParse(value.tabs);
            if (!tabs.success) continue;
            this.data[workspace] = { tabs: tabs.data, activeId: value.activeId, history: value.history.slice(-5000).map(item => ({ ...item, id: item.id || randomUUID(), url: browserRecordUrl(item.url) })).filter(item => item.url), tasks: value.tasks.slice(-40).map(task => ({ ...task, status: ['ready', 'running', 'paused', 'site-approval'].includes(task.status) ? 'interrupted' : task.status, pendingOrigin: undefined, siteApprovals: task.siteApprovals?.map(approval => approval.status === 'pending' ? { ...approval, status: 'expired' as const } : approval) })) };
          }
        }
      } catch { /* A damaged browser journal must not prevent opening the workbench. */ }
    }
  }
  state(workspace: string): BrowserWorkspaceState { return structuredClone(this.data[workspace] ?? { tabs: [], activeId: '', history: [], tasks: [] }); }
  private update(workspace: string, change: (state: BrowserWorkspaceState) => void): void {
    const next = this.state(workspace); change(next);
    const data = { ...this.data, [workspace]: next };
    writeFileSync(`${this.filename}.tmp`, JSON.stringify({ version: 1, workspaces: data }), 'utf8');
    renameSync(`${this.filename}.tmp`, this.filename);
    this.data = data;
  }
  saveTabs(workspace: string, raw: unknown, activeId: string): void {
    const tabs = tabsSchema.parse(raw).map(tab => ({ ...tab, url: browserRecordUrl(tab.url) }));
    if (new Set(tabs.map(tab => tab.id)).size !== tabs.length) throw new Error('标签标识重复');
    this.update(workspace, state => { state.tabs = tabs; state.activeId = tabs.some(tab => tab.id === activeId) ? activeId : tabs[0]?.id ?? ''; });
  }
  visit(workspace: string, url: string, title: string, tabId?: string): void {
    const safe = browserRecordUrl(url); if (!safe) return;
    this.update(workspace, state => {
      const last = state.history.at(-1), at = new Date().toISOString();
      if (last?.url === safe && Date.now() - Date.parse(last.at) < 1000) { last.title = title.slice(0, 180); last.at = at; }
      else state.history = [...state.history, { id: randomUUID(), url: safe, title: title.slice(0, 180), at }].slice(-5000);
      if (tabId) {
        const tab = state.tabs.find(tab => tab.id === tabId);
        if (tab) tab.url = safe;
        else if (state.tabs.length < 20) state.tabs.push({ id: tabId, url: safe });
        state.activeId ||= tabId;
      }
    });
  }
  task(task: BrowserTask): void { this.update(task.workspace, state => { state.tasks = [...state.tasks.filter(item => item.id !== task.id), task].slice(-40); }); }
  deleteHistory(workspace: string, ids: string[]): void { const selected = new Set(ids); this.update(workspace, state => { state.history = state.history.filter(item => !selected.has(item.id)); }); }
  clearHistory(workspace: string, since?: number, origin?: string): void {
    this.update(workspace, state => { state.history = state.history.filter(item => since !== undefined && Date.parse(item.at) < since || origin !== undefined && new URL(item.url).origin !== origin); });
  }
}
