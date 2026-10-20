import { dialog, ipcMain, nativeImage, shell, type WebContents } from 'electron';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import type { HushHourWorkbench } from './hush-hour-workbench';
import type { GameTerminal } from './game-terminal';
import type { BrowserGuests } from './browser-guests';
import { GameOnlineUrlSchema } from '../shared/game-contracts';

export function registerHushHourIpc(site: HushHourWorkbench, terminal: GameTerminal, guests: BrowserGuests, main: () => WebContents | undefined): void {
  const handle = (channel: string, action: (input: unknown) => unknown) => {
    ipcMain.handle(`web:hush-hour:${channel}`, (event, input: unknown) => {
      if (event.sender !== main() || event.senderFrame !== event.sender.mainFrame) throw new Error('仅工作台主窗口可操作 Hush-Hour。');
      return action(input);
    });
  };
  site.subscribe(state => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('web:hush-hour:changed', state); });
  terminal.subscribe(event => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('web:hush-hour:terminal:event', event); });
  handle('state', () => site.readState()); handle('open', () => site.open()); handle('stop', () => site.stop()); handle('restart', () => site.restart());
  handle('build', () => site.build()); handle('cancelBuild', () => site.cancelBuild());
  handle('configureOnline', input => site.configureOnline(input));
  handle('openFolder', async () => { const error = await shell.openPath(site.snapshot().root); if (error) throw new Error(error); });
  handle('readDocument', input => site.readDocument(input));
  handle('openDocumentLink', async input => { const url = GameOnlineUrlSchema.parse(input); if (!url) throw new Error('网页链接无效。'); await shell.openExternal(url); });
  const guest = (input: unknown) => {
    const tabId = z.string().regex(/^hush-hour-[\w-]+$/).parse(input), lease = guests.resolve(main()!, tabId), state = site.snapshot();
    const environment = lease.workspace === 'hush-hour-online' ? 'online' : 'local';
    const siteUrl = environment === 'online' ? state.online.url : state.service.url;
    if (environment === 'local' && (lease.workspace !== 'hush-hour' || state.service.phase !== 'running') || !siteUrl || new URL(lease.guest.getURL()).origin !== new URL(siteUrl).origin) throw new Error('操作只限当前 Hush-Hour 网页环境。');
    return { contents: lease.guest, environment, siteUrl } as const;
  };
  handle('capture', async input => {
    const request = z.object({ tabId: z.string(), revision: z.string().regex(/^(?:[a-f0-9]{64})?$/) }).strict().parse(input);
    const context = guest(request.tabId), { contents } = context, url = contents.getURL(), image = await contents.capturePage();
    if (contents.isDestroyed() || contents.getURL() !== url || guest(request.tabId).siteUrl !== context.siteUrl) throw new Error('截图期间页面或正式地址已变化，请重新截图。');
    return site.capture(image.toPNG(), url, context.environment === 'online' ? '' : request.revision, { environment: context.environment, siteUrl: context.siteUrl });
  });
  handle('openExternal', async input => { await shell.openExternal(guest(input).contents.getURL()); });
  handle('terminal:state', () => terminal.snapshot());
  handle('terminal:open', input => terminal.open(site.snapshot().root, input));
  const terminalInput = (input: unknown) => z.object({ id: z.string().uuid(), data: z.string().max(65536).optional(), cols: z.number().optional(), rows: z.number().optional() }).strict().parse(input);
  handle('terminal:write', input => { const value = terminalInput(input); terminal.write(value.id, z.string().max(65536).parse(value.data)); });
  handle('terminal:resize', input => { const value = terminalInput(input); terminal.resize(value.id, { cols: value.cols, rows: value.rows }); });
  handle('terminal:clear', input => terminal.clear(terminalInput(input).id));
  handle('terminal:close', input => terminal.close(terminalInput(input).id));
  handle('issues:directory', () => site.issues.folder()); handle('issues:list', () => site.issues.list());
  handle('issues:read', input => site.issues.read(input));
  handle('issues:save', input => site.issues.save(input, site.snapshot(), id => site.artifactPath(id)));
  const imagePath = async (input: unknown) => {
    const image = z.object({ issueId: z.string().optional(), id: z.string().uuid() }).strict().parse(input);
    return image.issueId ? site.issues.imagePath(image.issueId, image.id) : site.artifactPath(image.id);
  };
  handle('issues:preview', async input => { const image = nativeImage.createFromPath(await imagePath(input)); if (image.isEmpty()) throw new Error('截图无法读取。'); return image.resize({ width: 480 }).toDataURL(); });
  handle('issues:openImage', async input => { const error = await shell.openPath(await imagePath(input)); if (error) throw new Error(error); });
  handle('issues:openFolder', async input => { const error = await shell.openPath(await site.issues.folder(input)); if (error) throw new Error(error); });
  handle('issues:export', async input => {
    const record = await site.issues.read(input), destination = await dialog.showSaveDialog({ title: '导出 Hush-Hour 问题包', defaultPath: `${record.id}.zip`, filters: [{ name: 'ZIP 问题包', extensions: ['zip'] }], properties: ['showOverwriteConfirmation'] });
    if (destination.canceled || !destination.filePath) return null;
    await writeFile(destination.filePath, await site.issues.archive(record.id)); return destination.filePath;
  });
}
