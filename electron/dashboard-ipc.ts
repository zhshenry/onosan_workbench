import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { z } from 'zod';
import { DashboardStore } from './dashboard-store';

export function registerDashboardIpc(directory: string, owner: () => WebContents | undefined): () => void {
  const store = new DashboardStore(directory);
  function assertOwner(event: IpcMainInvokeEvent): void {
    if (event.sender !== owner() || event.senderFrame !== event.sender.mainFrame) throw new Error('请在主窗口操作看板。');
  }
  ipcMain.handle('dashboard:load', (event, legacy: unknown) => {
    assertOwner(event);
    const existing = store.read();
    return existing || (legacy === undefined ? null : store.initialize(z.string().max(65536).nullable().parse(legacy)));
  });
  ipcMain.handle('dashboard:save', (event, input: unknown) => {
    assertOwner(event);
    const receipt = store.save(input);
    if (receipt.changed.length) event.sender.send('dashboard:changed');
    return receipt;
  });
  return () => store.close();
}
