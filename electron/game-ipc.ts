import { dialog, ipcMain, shell, type WebContents } from 'electron';
import { join, resolve } from 'node:path';
import type { GameWorkbench } from './game-workbench';
import type { BrowserGuests } from './browser-guests';
import type { GameTerminal } from './game-terminal';
import { GameConfigSchema, GameRunScopeSchema } from '../shared/game-contracts';

export function registerGameIpc(game: GameWorkbench, terminal: GameTerminal, guests: BrowserGuests, main: () => WebContents | undefined): void {
  const handle = (channel: string, action: (input: unknown) => unknown) => {
    ipcMain.handle(`game:${channel}`, (event, input: unknown) => {
      if (event.sender !== main() || event.senderFrame !== event.sender.mainFrame) throw new Error('仅工作台主窗口可操作游戏项目。');
      return action(input);
    });
  };
  game.subscribe(state => { const owner = main(); if (owner && !owner.isDestroyed()) owner.send('game:changed', state); });
  handle('state', () => game.snapshot());
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
    const lease = guests.resolve(main()!, input);
    const state = game.snapshot();
    if (!lease.workspace.startsWith('game-trail-') || state.service.phase !== 'running' || new URL(lease.guest.getURL()).origin !== new URL(state.service.url).origin) throw new Error('截图只限当前游戏试玩页面。');
    const image = await lease.guest.capturePage();
    return game.capture(image.toPNG().toString('base64'));
  });
  handle('openArtifact', async input => {
    if (typeof input !== 'string') throw new Error('附件标识无效');
    const error = await shell.openPath(await game.artifactPath(input)); if (error) throw new Error(error);
  });
}
