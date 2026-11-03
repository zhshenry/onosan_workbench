import { dialog, ipcMain, shell, type WebContents } from 'electron';
import { z } from 'zod';
import { GameOnlineUrlSchema } from '../shared/game-contracts';
import type { GameTerminal } from './game-terminal';
import type { PersonalWebsite } from './personal-website';

export function registerPersonalWebsiteIpc(site: PersonalWebsite, terminal: GameTerminal, main: () => WebContents | undefined) {
  const handle = (channel: string, action: (input: unknown) => unknown) => ipcMain.handle(`web:personal:${channel}`, (event, input: unknown) => {
    if (event.sender !== main() || event.senderFrame !== event.sender.mainFrame) throw new Error('仅工作台主窗口可操作个人网站。');
    return action(input);
  });
  site.subscribe(state => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('web:personal:changed', state); });
  terminal.subscribe(event => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('web:personal:terminal:event', event); });
  handle('state', () => site.readState()); handle('start', () => site.start()); handle('stop', () => site.stop());
  handle('build', () => site.build()); handle('cancelBuild', () => site.cancelBuild()); handle('checkPages', () => site.checkPages());
  handle('list', () => site.content.list()); handle('read', input => site.content.read(input));
  handle('save', input => site.save(input));
  handle('previewSave', input => site.content.previewSave(input));
  handle('coverPreview', input => site.content.coverPreview(z.string().max(2000).parse(input)));
  handle('chooseCover', async () => {
    const choice = await dialog.showOpenDialog({ title: '选择个人网站封面', properties: ['openFile'], filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'] }] });
    return choice.canceled || !choice.filePaths[0] ? null : site.content.importCover(choice.filePaths[0]);
  });
  handle('configureOnline', input => site.configureOnline(input));
  handle('openFolder', async () => { const error = await shell.openPath(site.snapshot().root); if (error) throw new Error(error); });
  handle('openExternal', async input => {
    const url = GameOnlineUrlSchema.parse(input), state = site.snapshot();
    if (!url || ![state.service.url, state.onlineUrl].some(base => base && new URL(base).origin === new URL(url).origin)) throw new Error('只能打开当前个人网站的预览地址。');
    await shell.openExternal(url);
  });
  handle('terminal:state', () => terminal.snapshot()); handle('terminal:open', input => terminal.open(site.snapshot().root, input));
  const terminalInput = (input: unknown) => z.object({ id: z.string().uuid(), data: z.string().max(65536).optional(), cols: z.number().optional(), rows: z.number().optional() }).strict().parse(input);
  handle('terminal:write', input => { const value = terminalInput(input); terminal.write(value.id, z.string().max(65536).parse(value.data)); });
  handle('terminal:resize', input => { const value = terminalInput(input); terminal.resize(value.id, { cols: value.cols, rows: value.rows }); });
  handle('terminal:clear', input => terminal.clear(terminalInput(input).id)); handle('terminal:close', input => terminal.close(terminalInput(input).id));
}
