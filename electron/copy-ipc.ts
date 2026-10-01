// 文案工坊 IPC:草稿 CRUD(写作助手的对话与建议走 ai-ipc 的会话体系,按会话模块路由)。
import { ipcMain } from 'electron';
import { z } from 'zod';
import { CopyStore } from '../modules/copywriting/store';

export function registerCopyIpc(copy: CopyStore): void {
  ipcMain.handle('copy:list', () => copy.all());
  ipcMain.handle('copy:save', (_event, input: unknown) => copy.save(input));
  ipcMain.handle('copy:remove', (_event, id: unknown) => copy.remove(z.string().min(1).parse(id)));
  ipcMain.handle('copy:markXhsPublished', (_event, id: unknown, url: unknown) =>
    copy.markXhsPublished(z.string().min(1).parse(id), z.string().parse(url)));
  ipcMain.handle('copy:clearXhsPublished', (_event, id: unknown) =>
    copy.clearXhsPublished(z.string().min(1).parse(id)));
}
