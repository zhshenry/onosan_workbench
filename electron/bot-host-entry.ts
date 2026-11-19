import { app, Notification, powerMonitor, safeStorage } from 'electron';
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createServer } from 'node:net';
import { defineTool } from '@earendil-works/pi-coding-agent';
import { AiStore } from './ai-store';
import { BotStore, BotError } from './bot-store';
import { BotHost } from './bot-host';
import { BotRuntime } from './bot-runtime';
import { BotPeer, hostAddress, hostSecret } from './bot-transport';
import { botService } from './bot-service';
import { registerAiIpc } from './ai-ipc';
import { Store } from '../modules/todo/store';
import { CopyStore } from '../modules/copywriting/store';
import { BaziStore } from '../modules/bazi/store';
import { ReadingStore } from '../modules/reading/store';
import { aggregateBook, scanBooks } from '../modules/reading/obsidian';
import type { AiModuleContribution } from './ai-core';
import type { BotChanged } from '../shared/bot-contracts';
import { z } from 'zod';
import { prepareHostEncryption } from './bot-encryption';
import { AppSettingsStore } from './app-settings';
import { readIslandReminderSettings } from './island-store';
import { inReminderQuietHours, taskReminderEnabled } from '../shared/island-contracts';

const argument = (name: string) => { const index = process.argv.indexOf(name); if (index < 0 || !process.argv[index + 1]) throw new Error(`缺少后台启动参数 ${name}`); return process.argv[index + 1]; };
const directory = argument('--bot-data-dir'), todoPath = argument('--bot-todo-db');
const logError = (error: unknown) => { mkdirSync(directory, { recursive: true }); appendFileSync(join(directory, 'bot-host-errors.log'), `${new Date().toISOString()} ${error instanceof Error ? error.message : '后台异常'}\n`); };
app.setPath('userData', join(directory, 'bot-process'));
const locked = app.requestSingleInstanceLock();
if (!locked) app.exit(0);
else {
prepareHostEncryption(directory);
void app.whenReady().then(async () => {
  mkdirSync(dirname(todoPath), { recursive: true });
  const ai = new AiStore(directory, { recover: false }), store = new BotStore(ai, directory);
  const todo = new Store(todoPath, 'shared-tasks'), copy = new CopyStore(directory), bazi = new BaziStore(directory), reading = new ReadingStore(directory);
  const peers = new Set<BotPeer>();
  let resourcePeer: BotPeer | undefined;
  const broadcast = (channel: string, value?: unknown) => { for (const peer of peers) if (peer.authorized) peer.notify(channel, value); };
  const runtime = new BotRuntime(store, todo, copy, bazi, reading, {
    connection: modelId => {
      const config = ai.readConfig(); if (!config.aiEnabled) return null;
      const model = config.models.find(item => item.id === modelId);
      const provider = config.providers.find(item => item.id === model?.providerId);
      if (!model || !provider) return null;
      const key = provider.apiKey ? safeStorage.decryptString(Buffer.from(provider.apiKey, 'base64')) : '';
      return { endpoint: provider.endpoint, protocol: provider.protocol, key, model: model.name, supportsImages: model.supportsImages };
    },
    changed: broadcast,
    browser: async (task, signal) => {
      const peer = resourcePeer; if (!peer || peer.socket.destroyed) throw new BotError('RESOURCE_OFFLINE', '浏览器工作区未连接，请打开 OnO 后继续');
      const remote = await peer.call<{ reference: { id: string; workspace: string }; prompt: string; tools: { name: string; label: string; description: string; parameters: any }[] }>('resource:browser:start', [task]);
      const abort = () => { void peer.call('resource:browser:finish', [task.id, '任务已停止']).catch(() => {}); };
      signal.addEventListener('abort', abort, { once: true });
      const contribution: AiModuleContribution = {
        directBrowserOperations: true,
        toolNames: remote.tools.map(t => t.name), labels: Object.fromEntries(remote.tools.map(t => [t.name, t.label])), systemPrompt: () => remote.prompt,
        buildTools: () => remote.tools.map(tool => defineTool({ ...tool, executionMode: 'sequential', execute: async (id, args) => { if (signal.aborted) throw new Error('任务已取消'); try { return await peer.call<any>('resource:browser:execute', [task.id, tool.name, id, args], 600000); } catch (error) { if (!signal.aborted && (peer.socket.destroyed || error instanceof BotError && ['RESOURCE_OFFLINE', 'HOST_DISCONNECTED'].includes(error.code))) { store.updateTask(task.id, { status: 'waiting_resource', reason: '浏览器窗口已断开，请打开工作区后继续' }); host.changed({ kind: 'task', botId: task.botId, taskId: task.id }); } throw error; } } })),
      };
      return { reference: remote.reference, contribution, finish: async error => { signal.removeEventListener('abort', abort); await peer.call('resource:browser:finish', [task.id, error]); } };
    },
  });
  const host = new BotHost(store, runtime);
  host.on('changed', (event: BotChanged) => broadcast('bot:changed', event));
  if (process.env.WORKBENCH_BOT_METRICS === '1') host.on('metric', value => appendFileSync(join(directory, 'bot-metrics.jsonl'), JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'));
  const openTask = (taskId?: string, todoId?: string) => {
    const isolated = directory.endsWith(`${process.platform === 'win32' ? '\\' : '/'}isolated`);
    const customData = directory !== join(app.getPath('appData'), 'OnoWorkbench');
    const child = spawn(process.execPath, [...(app.isPackaged ? [] : [app.getAppPath()]), ...(taskId ? ['--bot-task-id', taskId] : todoId ? ['--bot-todo-id', todoId] : [])], { detached: true, windowsHide: true, stdio: 'ignore', env: { ...process.env, ELECTRON_RUN_AS_NODE: undefined, ...(customData ? { WORKBENCH_TEST_DATA_DIR: dirname(isolated ? dirname(directory) : directory), WORKBENCH_ISOLATED: isolated ? '1' : undefined } : {}) } });
    child.on('error', logError); child.unref();
  };
  host.on('changed', (event: BotChanged) => {
    if (event.kind !== 'task' || !event.taskId || resourcePeer || !ai.setting('bot.background.enabled', false) || !Notification.isSupported()) return;
    const task = store.task(event.taskId);
    if (task.kind === 'message' || !['completed', 'failed', 'waiting_user'].includes(task.status)) return;
    const key = `bot.notification.${task.id}.${task.status}`;
    if (ai.setting(key, false)) return;
    const title = `${store.profile(task.botId).name} · ${task.status === 'waiting_user' ? '等待确认' : task.status === 'completed' ? '工作已完成' : '需要处理'}`;
    const notification = new Notification({ title, body: task.title });
    notification.once('click', () => openTask(task.id));
    notification.once('failed', () => ai.setSetting(key, false));
    try { notification.show(); ai.setSetting(key, true); } catch (error) { logError(error); }
  });
  let reminding = false;
  const reminders = () => {
    if (resourcePeer || reminding || !Notification.isSupported() || !ai.setting('bot.background.enabled', false)) return;
    const { reminderRange } = new AppSettingsStore(directory).read();
    if (reminderRange === 'off') return;
    const settings = readIslandReminderSettings(directory), now = new Date();
    // Without the workbench, keep these occurrences claimable until delivery resumes.
    if (inReminderQuietHours(settings, now)) return;
    const tasks = todo.claimDue(now, task => taskReminderEnabled(reminderRange, task.kind));
    if (!tasks.length) return;
    reminding = true;
    const notification = new Notification({ title: tasks.length === 1 ? tasks[0].title : `${tasks.length} 条事项需要处理`, body: '到提醒时间了，点击返回工作台查看。', silent: !settings.sound });
    const failed = () => { for (const task of tasks) { try { todo.unclaim(task); } catch (error) { logError(error); } } reminding = false; };
    notification.once('failed', failed); notification.once('click', () => openTask(undefined, tasks[0].id));
    try { notification.show(); } catch { failed(); }
    setTimeout(() => { reminding = false; }, 15000).unref();
  };
  const reminderTimer = setInterval(reminders, 15000); reminderTimer.unref(); powerMonitor.on('resume', reminders);
  const handlers = new Map<string, (...args: any[]) => unknown>();
  registerAiIpc(todo, ai, copy, bazi, reading, undefined, { ipc: { handle: (name: string, callback: (...args: any[]) => unknown) => { handlers.set(name, callback); }, on: (name: string, callback: (...args: any[]) => unknown) => { handlers.set(name, callback); return undefined as any; } }, emit: (channel, value) => { broadcast(channel, value); if (channel === 'ai:config-changed') { host.suspend(); setTimeout(() => host.resume(), 100); } } });
  const native = (method: string, args: unknown[]): unknown => {
    const id = () => z.string().min(1).parse(args[0]);
    switch (method) {
      case 'copy:list': return copy.all();
      case 'copy:save': { const value = copy.save(args[0]); broadcast('copy:changed'); return value; }
      case 'copy:remove': { const value = copy.remove(id()); broadcast('copy:changed'); return value; }
      case 'copy:markXhsPublished': return copy.markXhsPublished(id(), z.string().parse(args[1]));
      case 'copy:clearXhsPublished': return copy.clearXhsPublished(id());
      case 'bazi:list': return bazi.all();
      case 'bazi:saveProfile': return bazi.saveProfile(args[0]);
      case 'bazi:removeProfile': return bazi.removeProfile(id());
      case 'bazi:saveNote': return bazi.saveNote(id(), z.string().parse(args[1]));
      case 'reading:list': return reading.all();
      case 'reading:save': return reading.save(args[0]);
      case 'reading:remove': return reading.remove(id());
      case 'reading:setVault': return reading.setVaultPath(z.string().parse(args[0]));
      case 'reading:scan': return scanBooks(z.string().parse(args[0]));
      case 'reading:aggregate': { const vault = reading.all().vaultPath; if (!vault) throw new Error('请先配置读书笔记库路径'); return aggregateBook(vault, z.string().parse(args[0])); }
      default: throw new BotError('UNKNOWN_METHOD', '后台不支持此数据操作');
    }
  };
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return; stopping = true;
    clearInterval(reminderTimer); await host.stop(); for (const peer of peers) peer.close(); server.close(); ai.close(); todo.close(); copy.close(); bazi.close(); reading.close(); app.exit(0);
  };
  const server = createServer(socket => {
    const peer = new BotPeer(socket, hostSecret(directory), true); peers.add(peer);
    peer.handler = async (method, args) => {
      if (method === 'attach') { resourcePeer = peer; return { channels: [...handlers.keys()], host: host.state() }; }
      if (method === 'resource-wait' || method === 'resource-resume') { if (peer !== resourcePeer) throw new BotError('RESOURCE_FORBIDDEN', '只有业务窗口可更新资源状态'); const id = z.string().uuid().parse(args[0]); return method === 'resource-wait' ? host.waitForResourceApproval(id) : host.resumeResourceExecution(id); }
      if (method === 'shutdown') { setTimeout(() => { void shutdown(); }, 20); return true; }
      if (method === 'background') { const enabled = z.boolean().parse(args[0]); ai.setSetting('bot.background.enabled', enabled); return enabled; }
      if (method === 'background-state') return ai.setting('bot.background.enabled', false);
      if (method === 'bot') { const [name, params, rawSurface] = args; const surface = z.object({ id: z.string().max(100), kind: z.enum(['main', 'island']) }).parse(rawSurface); return botService(host, z.string().parse(name), z.array(z.unknown()).parse(params), surface); }
      if (method === 'legacy') {
        const [channel, values] = args; if (typeof channel !== 'string') throw new Error('无效请求');
        const fn = handlers.get(channel); if (!fn) return native(channel, z.array(z.unknown()).parse(values));
        return fn({}, ...z.array(z.unknown()).parse(values));
      }
      throw new BotError('UNKNOWN_METHOD', '后台方法不可用');
    };
    peer.on('disconnected', () => { peers.delete(peer); if (resourcePeer === peer) resourcePeer = undefined; });
  });
  server.on('error', error => { logError(error); console.error('Bot Host 无法监听本地连接：', error.message); app.exit(1); });
  await new Promise<void>(resolve => server.listen(hostAddress(directory), resolve));
  host.start();
  powerMonitor.on('suspend', () => host.suspend()); powerMonitor.on('resume', () => host.resume());
  app.on('before-quit', event => { if (!stopping) { event.preventDefault(); void shutdown(); } });
  app.on('window-all-closed', () => {});
  process.on('SIGTERM', () => { void shutdown(); });
}).catch(error => { logError(error); console.error('Bot Host 启动失败：', error instanceof Error ? error.message : '未知错误'); app.exit(1); });
}
