import { dialog, ipcMain, nativeImage, shell, type WebContents } from 'electron';
import { writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { join, resolve } from 'node:path';
import type { GameWorkbench } from './game-workbench';
import type { BrowserGuests } from './browser-guests';
import type { GameTerminal } from './game-terminal';
import { GameConfigSchema, GameOnlineUrlSchema, GameRunScopeSchema, GameTrialResetSchema } from '../shared/game-contracts';

export function registerGameIpc(game: GameWorkbench, terminal: GameTerminal, guests: BrowserGuests, main: () => WebContents | undefined): void {
  const handle = (channel: string, action: (input: unknown) => unknown) => {
    ipcMain.handle(`game:${channel}`, (event, input: unknown) => {
      if (event.sender !== main() || event.senderFrame !== event.sender.mainFrame) throw new Error('仅工作台主窗口可操作游戏项目。');
      return action(input);
    });
  };
  game.subscribe(state => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('game:changed', state); });
  handle('state', () => game.snapshot());
  handle('issues:directory', () => game.issues.directory);
  handle('issues:list', () => game.issues.list());
  handle('issues:read', input => game.issues.read(input));
  handle('issues:save', input => game.issues.save(input, game.snapshot(), id => game.artifactPath(id)));
  const issueImage = async (input: unknown) => {
    const image = z.object({ issueId: z.string().optional(), id: z.string().min(1).max(100) }).parse(input);
    return image.issueId ? game.issues.imagePath(image.issueId, image.id) : game.artifactPath(image.id);
  };
  handle('issues:preview', async input => {
    const image = nativeImage.createFromPath(await issueImage(input));
    if (image.isEmpty()) throw new Error('截图无法读取。');
    return image.resize({ width: 480 }).toDataURL();
  });
  handle('issues:openImage', async input => { const error = await shell.openPath(await issueImage(input)); if (error) throw new Error(error); });
  handle('issues:openFolder', async input => {
    const directory = await game.issues.folder(input);
    const error = await shell.openPath(directory); if (error) throw new Error(error);
  });
  handle('issues:export', async input => {
    const issue = await game.issues.read(input);
    const destination = await dialog.showSaveDialog({ title: '导出问题包', defaultPath: `${issue.id}.zip`, filters: [{ name: 'ZIP 问题包', extensions: ['zip'] }], properties: ['showOverwriteConfirmation'] });
    if (destination.canceled || !destination.filePath) return null;
    await writeFile(destination.filePath, await game.issues.archive(issue.id));
    return destination.filePath;
  });
  handle('readDocument', input => game.readDocument(input));
  handle('openDocumentLink', async input => {
    const url = GameOnlineUrlSchema.parse(input);
    if (!url) throw new Error('网页链接无效。');
    await shell.openExternal(url);
  });
  handle('configureOnline', input => game.configureOnline(input));
  handle('checkOnline', () => game.checkOnline());
  handle('resetTrial', async input => {
    const request = GameTrialResetSchema.parse(input), state = game.snapshot();
    const url = request.environment === 'online' ? state.online.url : `http://127.0.0.1:${state.config.port}`;
    if (!url || new URL(url).origin !== request.origin) throw new Error('试玩站点已变化，请关闭确认框后重试。');
    await guests.resetGameTrial(main()!, request.environment === 'online' ? 'game-trail-online' : 'game-trail-detective', request.origin);
  });
  const onlineGuest = (input: unknown) => {
    if (typeof input !== 'string' || !/^game-trial-online-[\w-]+$/.test(input)) throw new Error('线上试玩标签标识无效');
    const lease = guests.resolve(main()!, input);
    const url = game.snapshot().online.url;
    if (!url || !(lease.workspace === 'game-trail-online' || lease.workspace.startsWith('game-trail-fresh-online-')) || new URL(lease.guest.getURL()).origin !== new URL(url).origin) throw new Error('操作只限当前配置的线上试玩站点。');
    return lease;
  };
  handle('openOnline', async input => {
    const url = input === undefined ? game.snapshot().online.url : onlineGuest(input).guest.getURL();
    if (!url) throw new Error('请先设置线上地址。');
    await shell.openExternal(GameOnlineUrlSchema.parse(url));
  });
  handle('configure', input => {
    const config = GameConfigSchema.parse(input);
    if (terminal.active && resolve(config.root).toLowerCase() !== resolve(game.snapshot().config.root).toLowerCase()) throw new Error('请先结束项目终端会话，再修改游戏项目目录。');
    return game.configure(config);
  });
  terminal.subscribe(event => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('game:terminal:event', event); });
  handle('terminal:state', () => terminal.snapshot());
  handle('terminal:open', input => terminal.open(game.snapshot().config.root, input));
  const terminalInput = (input: unknown): { id: string; data: string; cols: number; rows: number } => {
    if (!input || typeof input !== 'object' || typeof (input as { id?: unknown }).id !== 'string') throw new Error('终端会话标识无效');
    return input as { id: string; data: string; cols: number; rows: number };
  };
  handle('terminal:write', input => { const value = terminalInput(input); terminal.write(value.id, value.data); });
  handle('terminal:resize', input => { const value = terminalInput(input); terminal.resize(value.id, { cols: value.cols, rows: value.rows }); });
  handle('terminal:clear', input => terminal.clear(terminalInput(input).id));
  handle('terminal:close', input => terminal.close(terminalInput(input).id));
  handle('start', () => game.start());
  handle('stop', () => game.stop());
  handle('connect', () => game.connect());
  handle('run', input => game.run(GameRunScopeSchema.parse(input)));
  handle('cancel', () => game.cancel());
  handle('chooseRoot', async () => { const result = await dialog.showOpenDialog({ title: '选择轨迹侦探项目目录', properties: ['openDirectory'] }); return result.canceled ? null : result.filePaths[0] ?? null; });
  handle('open', async input => {
    const state = game.snapshot();
    if (input === 'preview') {
      if (state.service.phase !== 'running') throw new Error('请先启动游戏。');
      await shell.openExternal(state.service.url); return;
    }
    if (input !== 'root' && input !== 'docs') throw new Error('无效项目入口');
    const error = await shell.openPath(input === 'root' ? state.config.root : join(state.config.root, 'README.md'));
    if (error) throw new Error(error);
  });
  handle('capture', async input => {
    if (typeof input !== 'string' || !/^game-trial-[\w-]+$/.test(input)) throw new Error('试玩标签标识无效');
    if (input.startsWith('game-trial-online-')) {
      const lease = onlineGuest(input), siteUrl = game.snapshot().online.url, url = lease.guest.getURL();
      const image = await lease.guest.capturePage();
      if (game.snapshot().online.url !== siteUrl || lease.guest.getURL() !== url) throw new Error('截图期间页面已变化，请重新截图。');
      return game.capture(image.toPNG().toString('base64'), { environment: 'online', url, siteUrl });
    }
    const lease = guests.resolve(main()!, input);
    const state = game.snapshot();
    if (!(lease.workspace === 'game-trail-detective' || lease.workspace.startsWith('game-trail-fresh-') && !lease.workspace.startsWith('game-trail-fresh-online-')) || state.service.phase !== 'running' || new URL(lease.guest.getURL()).origin !== new URL(state.service.url).origin) throw new Error('截图只限当前游戏试玩页面。');
    const image = await lease.guest.capturePage();
    return game.capture(image.toPNG().toString('base64'), { environment: 'local', url: lease.guest.getURL() });
  });
  handle('openArtifact', async input => {
    if (typeof input !== 'string') throw new Error('附件标识无效');
    const error = await shell.openPath(await game.artifactPath(input)); if (error) throw new Error(error);
  });
}
