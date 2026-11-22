import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { BOT_CONTRACT_VERSION, draftValueSchema, type BotSubmit, type BotHostState, type BotNavigation, type BotTask } from '../shared/bot-contracts';
import { BotOutbox } from './bot-outbox';
import type { BrowserAutomation } from './browser/tasks';
import { buildBrowserContribution } from '../modules/browser/ai';
import type { AiModuleContribution } from './ai-core';
import { BotError } from './bot-store';
import { BotPeer, connectHost } from './bot-transport';
import { hostSupervisionState, setHostSupervision, startSupervisedHost } from './bot-supervisor';

export class BotGateway {
  private peer?: BotPeer;
  private connecting?: Promise<BotPeer>;
  private stopping = false;
  private readonly sessionId = randomUUID();
  private readonly browsers = new Map<string, { contribution: AiModuleContribution; taskId: string; owner: WebContents; controller: AbortController }>();
  private background = false;
  private supervisionError = '';
  private readonly outbox: BotOutbox;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempt = 0;
  private launchTarget: BotNavigation | null = this.readNavigation(process.argv);
  private readNavigation(args: string[]): BotNavigation | null {
    const kind = args.includes('--bot-todo-id') ? 'todo' : 'task', index = args.indexOf(kind === 'todo' ? '--bot-todo-id' : '--bot-task-id'), id = index >= 0 ? args[index + 1] : undefined;
    return id && /^[a-f0-9-]{36}$/i.test(id) ? { kind, id } : null;
  }
  navigateTask(args: string[]): void {
    const target = this.readNavigation(args); if (!target) return;
    this.launchTarget = target; this.main()?.send('bot:changed', { kind: 'navigation' });
  }
  private readonly stopObserving: () => void;
  constructor(private readonly directory: string, private readonly todoPath: string, private readonly main: () => WebContents | undefined, private readonly island: () => WebContents | undefined, private readonly automation: BrowserAutomation) {
    this.outbox = new BotOutbox(directory);
    this.stopObserving = automation.observeTasks(task => {
      if (!['site-approval', 'paused'].includes(task.status)) return;
      const owner = [...this.browsers.entries()].find(([, value]) => value.taskId === task.id);
      if (owner) void this.peer?.call('resource-wait', [owner[0]]).catch(() => {});
    });
  }
  private reconnect(): void {
    if (this.stopping || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connection().catch(error => {
        if ((error as { code?: string }).code !== 'HOST_VERSION_MISMATCH') this.reconnect();
      });
    }, Math.min(10000, 300 * 2 ** Math.min(this.reconnectAttempt++, 5)));
    this.reconnectTimer.unref();
  }
  private get args(): string[] { return [...(app.isPackaged ? [] : [app.getAppPath()]), '--bot-host', '--bot-data-dir', this.directory, '--bot-todo-db', this.todoPath]; }
  private async connection(): Promise<BotPeer> {
    if (this.stopping) throw new BotError('HOST_UNAVAILABLE', 'Bot 后台正在退出');
    if (this.peer && !this.peer.socket.destroyed) return this.peer;
    if (this.connecting) return this.connecting;
    this.connecting = (async () => {
      let peer: BotPeer | undefined;
      try { peer = await connectHost(this.directory); } catch { /* Start the independent host below. */ }
      if (peer && peer.contractVersion !== BOT_CONTRACT_VERSION) {
        if (peer.contractVersion && !['bot-workbench/v1', 'bot-workbench/v2', 'bot-workbench/v3', 'bot-workbench/v4', 'bot-workbench/v5', 'bot-workbench/v6', 'bot-workbench/v7', 'bot-workbench/v8', 'bot-workbench/v9', 'bot-workbench/v10', 'bot-workbench/v11', 'bot-workbench/v12', 'bot-workbench/v13', 'bot-workbench/v14', 'bot-workbench/v15', 'bot-workbench/v16', 'bot-workbench/v17', 'bot-workbench/v18'].includes(peer.contractVersion)) { peer.close(); throw new BotError('HOST_VERSION_MISMATCH', 'Bot 后台使用了不兼容的版本，请使用匹配版本的工作台。'); }
        const old = peer;
        try {
          const state = await old.call<BotHostState>('bot', ['getHostState', [], { id: this.sessionId, kind: 'main' }]);
          if (state.activeTasks || state.queuedTasks) throw new BotError('HOST_VERSION_MISMATCH', 'Bot 后台仍有旧版任务正在处理，请等待任务结束后重新启动工作台。');
          await new Promise<void>((resolve, reject) => {
            const closed = () => { clearTimeout(timer); resolve(); };
            const timer = setTimeout(() => { old.close(); reject(new BotError('HOST_STOP_TIMEOUT', '旧版 Bot 后台正在退出，请稍后重新启动工作台。')); }, 15000);
            old.socket.once('close', closed);
            void old.call('shutdown').catch(error => { clearTimeout(timer); old.socket.off('close', closed); reject(error); });
          });
        } finally { old.close(); }
        peer = undefined;
      }
      if (!peer) {
        const supervision = join(this.directory, 'bot-host-supervision.json');
        let supervised = false;
        try { supervised = existsSync(supervision) && JSON.parse(readFileSync(supervision, 'utf8')).enabled === true; } catch { /* Display a startup error if the supervisor cannot run. */ }
        if (supervised) { try { await startSupervisedHost(this.directory); } catch (error) { this.supervisionError = error instanceof Error ? error.message : '系统托管不可用'; } }
        if (!supervised || this.supervisionError) {
          const child = spawn(process.execPath, this.args, { detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined } });
          child.on('error', error => { this.supervisionError = error.message; }); child.unref();
        }
        for (let attempt = 0; attempt < 50; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 150));
          try { peer = await connectHost(this.directory); break; } catch { /* Another process may still be holding the single-instance lock during shutdown. */ }
        }
      }
      if (!peer) throw new BotError('HOST_UNAVAILABLE', '本地 Bot 后台启动失败，请检查数据目录权限和后台日志');
      if (peer.contractVersion !== BOT_CONTRACT_VERSION) { peer.close(); throw new BotError('HOST_VERSION_MISMATCH', 'Bot 后台版本与当前应用不一致，请完整退出旧版工作台后重试。'); }
      this.peer = peer;
      peer.handler = (method, args) => this.resource(method, args);
      peer.on('event', (channel: string, value: any) => {
        if (['bot:changed', 'bot:chat-update', 'ai:chat', 'ai:config-changed', 'todo:changed', 'dashboard:changed', 'copy:changed'].includes(channel)) {
          for (const win of BrowserWindow.getAllWindows()) if (win.webContents === this.main() || win.webContents === this.island()) win.webContents.send(channel, value);
        }
      });
      peer.on('disconnected', () => { for (const current of this.browsers.values()) { current.controller.abort(); if (!current.owner.isDestroyed()) this.automation.finish(current.owner, current.taskId, 'Bot 后台已断开，请重新开始浏览器任务'); } this.browsers.clear(); this.peer = undefined; if (this.stopping) return; this.reconnect(); for (const win of BrowserWindow.getAllWindows()) if (win.webContents === this.main() || win.webContents === this.island()) win.webContents.send('bot:changed', { kind: 'host' }); });
      await peer.call('attach'); this.background = await peer.call<boolean>('background-state'); this.reconnectAttempt = 0;
      for (const win of BrowserWindow.getAllWindows()) if (win.webContents === this.main() || win.webContents === this.island()) win.webContents.send('bot:changed', { kind: 'host' });
      this.main()?.send('dashboard:changed');
      return peer;
    })().finally(() => { this.connecting = undefined; });
    return this.connecting;
  }
  private entryId(contents: WebContents): string { return `${this.sessionId}:${contents.id}`; }
  private surface(event: IpcMainInvokeEvent) {
    if (event.senderFrame !== event.sender.mainFrame || ![this.main(), this.island()].includes(event.sender)) throw new BotError('SURFACE_FORBIDDEN', '仅 OnO 主窗口和灵动岛可连接 Bot');
    return { id: this.entryId(event.sender), kind: event.sender === this.island() ? 'island' : 'main' };
  }
  async start(): Promise<void> {
    const peer = await this.connection();
    const attached = await peer.call<{ channels: string[] }>('attach');
    const channels = [...attached.channels, 'copy:list', 'copy:save', 'copy:remove', 'copy:markXhsPublished', 'copy:clearXhsPublished', 'bazi:list', 'bazi:saveProfile', 'bazi:removeProfile', 'bazi:saveNote', 'reading:list', 'reading:save', 'reading:remove', 'reading:setVault', 'reading:scan', 'reading:aggregate'];
    for (const channel of channels) {
      if (['ai:cancel', 'ai:answer'].includes(channel)) continue;
      ipcMain.removeHandler(channel);
      ipcMain.handle(channel, async (event, ...args) => { this.surface(event); return (await this.connection()).call('legacy', [channel, args]); });
    }
    ipcMain.handle('bot:call', async (event, method: unknown, args: unknown) => {
      try {
        const surface = this.surface(event);
        if (typeof method !== 'string' || !Array.isArray(args)) throw new BotError('INVALID_INPUT', '无效的 Bot 请求');
        if (method === 'getLaunchTarget') { if (surface.kind !== 'main') return { ok: true, value: null }; const value = this.launchTarget; this.launchTarget = null; return { ok: true, value }; }
        if (method === 'setBackground') {
          if (surface.kind !== 'main' || typeof args[0] !== 'boolean') throw new BotError('SURFACE_FORBIDDEN', '请从主窗口管理后台运行');
          const enabled = args[0];
          await setHostSupervision(this.directory, process.execPath, this.args, enabled);
          writeFileSync(join(this.directory, 'bot-host-supervision.json'), JSON.stringify({ enabled }), { mode: 0o600 });
          await (await this.connection()).call('background', [enabled]); this.background = enabled; this.supervisionError = '';
          if (enabled) {
            const old = await this.connection();
            const stopped = new Promise<void>((resolve, reject) => { const timer = setTimeout(() => reject(new BotError('HOST_STOP_TIMEOUT', '后台正在保存任务，请稍后重新启用')), 15000); old.socket.once('close', () => { clearTimeout(timer); resolve(); }); });
            await old.call('shutdown'); await stopped; this.peer = undefined;
            // The supervised task must own the actual process, not a launcher that exits.
            await new Promise(resolve => setTimeout(resolve, 200)); await startSupervisedHost(this.directory); await this.connection();
          }
          return { ok: true, value: await this.state() };
        }
        if (method === 'getHostState') return { ok: true, value: await this.state() };
        const transport = async (name: string, values: unknown[]) => (await this.connection()).call('bot', [name, values, surface]);
        if (['getPendingSubmission', 'retainPendingDraft', 'acknowledgeSubmission'].includes(method)) {
          // Only previously authorized records exist here. Local draft retention must work while Host is offline.
          const chatId = String(args[0]);
          if (method === 'getPendingSubmission') return { ok: true, value: this.outbox.pending(chatId, surface.kind as 'main' | 'island', args[1] === true) };
          if (method === 'retainPendingDraft') this.outbox.retainDraft(chatId, surface.kind as 'main' | 'island', draftValueSchema.parse(args[1]));
          else this.outbox.acknowledge(chatId, surface.kind as 'main' | 'island', String(args[1]));
          return { ok: true, value: undefined };
        }
        const value = method === 'submit' ? await this.outbox.send(args[0] as BotSubmit, surface.kind as 'main' | 'island', transport) : await transport(method, args); return { ok: true, value };
      } catch (error) { return { ok: false, error: { code: error instanceof BotError ? error.code : 'REQUEST_FAILED', message: error instanceof Error ? error.message : '操作失败', ...(error instanceof BotError && error.current !== undefined ? { current: error.current } : {}) } }; }
    });
  }
  private async state(): Promise<BotHostState> {
    const peer = await this.connection();
    const value = await peer.call<BotHostState>('bot', ['getHostState', [], { id: `${this.sessionId}:host`, kind: 'main' }]);
    let supervised = false;
    if (this.background) {
      try { supervised = await hostSupervisionState(this.directory) === 'Running'; if (!supervised) this.supervisionError = '后台进程已连接，但 Windows 托管尚未运行，请重新启用后台'; }
      catch (error) { this.supervisionError = error instanceof Error ? error.message : '无法核对 Windows 后台状态'; }
    }
    return { ...value, supervised, ...(this.supervisionError ? { error: this.supervisionError } : {}) };
  }
  private async resource(method: string, args: unknown[]): Promise<unknown> {
    if (method === 'resource:browser:start') {
      const task = args[0] as BotTask, owner = this.main();
      if (!owner || owner.isDestroyed() || this.stopping) throw new BotError('RESOURCE_OFFLINE', '浏览器窗口未连接，请打开工作区后继续');
      if (this.browsers.size) throw new BotError('RESOURCE_BUSY', '另一个任务正在操作浏览器，请稍后继续');
      const page = task.context.pageScope ?? task.context.scope;
      if (page?.module !== 'workbench' || !['browser', 'media-browser'].includes(page.viewId)) throw new BotError('RESOURCE_FORBIDDEN', '任务没有关联浏览器工作区');
      const browserTask = this.automation.forChat(owner, page.viewId === 'media-browser' ? 'xhs-creator' : 'default', task.input, task.chatId, undefined, task.context.browserTabId);
      const controller = new AbortController(); this.automation.bind(owner, browserTask.id, task.chatId, controller.signal);
      const contribution = buildBrowserContribution(this.automation, owner, browserTask, true);
      this.browsers.set(task.id, { contribution, taskId: browserTask.id, owner, controller });
      return { reference: { id: browserTask.id, workspace: browserTask.workspace }, prompt: contribution.systemPrompt(new Date()), tools: contribution.buildTools().map(tool => ({ name: tool.name, label: tool.label, description: tool.description, parameters: tool.parameters })) };
    }
    const taskId = String(args[0]), current = this.browsers.get(taskId);
    if (!current) throw new BotError('RESOURCE_OFFLINE', '浏览器任务已断开，请重新打开工作区');
    if (method === 'resource:browser:finish') { current.controller.abort(); this.automation.finish(current.owner, current.taskId, typeof args[1] === 'string' ? args[1] : undefined); this.browsers.delete(taskId); return; }
    if (method === 'resource:browser:execute') {
      const tool = current.contribution.buildTools().find(tool => tool.name === args[1]); if (!tool) throw new BotError('TOOL_FORBIDDEN', '未注册这个浏览器工具');
      try {
        const result = await tool.execute(String(args[2]), args[3] as any, current.controller.signal, undefined, {} as any);
        await this.peer?.call('resource-resume', [taskId], 600000); return result;
      } catch (error) { if (this.stopping || current.owner.isDestroyed()) throw new BotError('RESOURCE_OFFLINE', '工作区窗口已关闭，请重新打开后继续'); await this.peer?.call('resource-resume', [taskId], 600000); throw error; }
    }
    throw new BotError('UNKNOWN_METHOD', '不可用的工作区操作');
  }
  async stop(): Promise<void> {
    this.stopping = true; clearTimeout(this.reconnectTimer);
    this.stopObserving();
    for (const current of this.browsers.values()) { current.controller.abort(); this.automation.finish(current.owner, current.taskId, '工作区已退出，浏览器资源不可用'); } this.browsers.clear();
    if (this.peer && !this.background) { try { await this.peer.call('shutdown', [], 15000); } catch (error) { appendFileSync(join(this.directory, 'bot-host-errors.log'), `${new Date().toISOString()} ${error instanceof Error ? error.message : '停止失败'}\n`); } }
    this.peer?.close();
  }
}
