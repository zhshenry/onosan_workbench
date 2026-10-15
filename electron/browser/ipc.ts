import { ipcMain, type WebContents } from 'electron';
import { z } from 'zod';
import type { BrowserAutomation } from './tasks';
import type { BrowserGuests } from '../browser-guests';
import { browserClearDataSchema } from '../../shared/browser-automation-contracts';

export function registerBrowserAutomationIpc(automation: BrowserAutomation, guests: BrowserGuests, mainContents: () => WebContents | undefined): void {
  const id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
  const workspace = z.enum(['default', 'xhs-creator']);
  const handle = (name: string, callback: (owner: WebContents, ...args: any[]) => unknown) => ipcMain.handle(`browser:${name}`, (event, ...args: unknown[]) => {
    if (event.sender !== mainContents() || event.senderFrame !== event.sender.mainFrame) throw new Error('浏览器操作仅允许主窗口。');
    return callback(event.sender, ...args);
  });
  handle('state', (_owner, raw) => automation.store.state(workspace.parse(raw)));
  handle('tabs', (owner, raw) => guests.tabs(owner, workspace.parse(raw)));
  handle('save-tabs', (_owner, rawWorkspace, tabs, activeId) => automation.store.saveTabs(workspace.parse(rawWorkspace), tabs, id.parse(activeId)));
  handle('activate', (owner, rawWorkspace, tabId) => guests.activate(owner, id.parse(tabId), workspace.parse(rawWorkspace)));
  handle('task-control', (owner, taskId, action) => automation.control(owner, id.parse(taskId), z.enum(['pause', 'resume', 'cancel', 'approve-site']).parse(action)));
  handle('clear', (owner, rawWorkspace, kind, origin) => automation.clear(owner, workspace.parse(rawWorkspace), z.enum(['history', 'site-data']).parse(kind), z.string().url().optional().parse(origin)));
  handle('delete-history', (_owner, rawWorkspace, ids) => automation.store.deleteHistory(workspace.parse(rawWorkspace), z.array(id).max(5000).parse(ids)));
  handle('clear-data', (owner, input) => automation.clearData(owner, browserClearDataSchema.parse(input)));
}
