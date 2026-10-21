import { BrowserWindow, dialog, ipcMain, safeStorage, session, type WebContents } from 'electron';
import { randomUUID } from 'node:crypto';
import { join, basename, extname } from 'node:path';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { z } from 'zod';
import type { AiStore } from './ai-store';
import { AiTestStore } from './ai-test-store';
import { executeTestLane, type TestConnection } from './ai-test-runner';
import { AiTestBrowser, installArtifactProtocol, previewAddress } from './ai-test-browser';
import { writeTestFile } from './ai-test-artifacts';
import { testTaskSchema, testFileSchema, testPrompts, type TestFile, type TestRun, type TestTaskInput } from '../shared/ai-test-contracts';

export class AiTestService {
  readonly store: AiTestStore;
  private readonly roots = new Map<string, string>();
  private readonly active = new Map<string, TestRun>();
  private readonly loaded = new Map<string, TestRun>();
  private readonly controllers = new Map<string, AbortController>();
  private readonly validators = new Map<string, { controller: AbortController; browser: AiTestBrowser }>();
  private readonly updates = new Map<string, ReturnType<typeof setTimeout>>();
  private closed = false;
  onChanged?: (run: TestRun) => void;
  constructor(directory: string, private readonly ai: AiStore) {
    this.store = new AiTestStore(join(directory, 'ai-tests'));
    for (const summary of this.store.runs()) for (const lane of this.store.run(summary.id).lanes) this.roots.set(lane.id, join(this.store.directory, 'artifacts', lane.id));
    installArtifactProtocol(session.defaultSession, id => this.roots.get(id));
  }
  private publish(run: TestRun, immediate = false): void {
    if (this.closed) return;
    if (immediate) {
      clearTimeout(this.updates.get(run.id)); this.updates.delete(run.id);
      this.store.saveRun(run); this.onChanged?.(structuredClone(run)); return;
    }
    if (this.updates.has(run.id)) return;
    this.updates.set(run.id, setTimeout(() => { this.updates.delete(run.id); this.publish(run, true); }, 100));
  }
  run(id: string): TestRun {
    const existing = this.loaded.get(id);
    if (existing) return existing;
    const run = this.store.run(id); this.loaded.set(id, run); return run;
  }
  start(input: TestTaskInput): TestRun {
    const task = testTaskSchema.parse(input);
    if (this.active.size) throw new Error('已有测试正在执行，请等待结束或先停止');
    const config = this.ai.readConfig();
    if (!config.aiEnabled) throw new Error('请先在 AI 设置中启用模型服务');
    const connections: TestConnection[] = task.modelIds.map(id => {
      const model = config.models.find(item => item.id === id);
      const provider = config.providers.find(item => item.id === model?.providerId);
      if (!model || !provider) throw new Error('选中的模型已移除，请重新选择');
      let key = '';
      try { key = provider.apiKey ? safeStorage.decryptString(Buffer.from(provider.apiKey, 'base64')) : ''; }
      catch { throw new Error('模型密钥不可用，请重新保存供应商配置'); }
      return { id, name: model.name, providerName: provider.name, protocol: provider.protocol, endpoint: provider.endpoint, key };
    });
    const run: TestRun = {
      id: randomUUID(), createdAt: new Date().toISOString(), task: structuredClone(task), input: testPrompts(task),
      lanes: connections.map(({ key: _key, ...model }) => ({ id: randomUUID(), model, status: 'queued', reply: '', files: [], steps: [], elapsedMs: 0, tokens: 0, toolCalls: 0, checks: [] })),
    };
    for (const lane of run.lanes) {
      const root = join(this.store.directory, 'artifacts', lane.id);
      mkdirSync(root, { recursive: true }); this.roots.set(lane.id, root);
    }
    this.loaded.set(run.id, run); this.active.set(run.id, run); this.publish(run, true);
    // Return the persisted run before the independent streams begin.
    setTimeout(() => {
      if (this.closed) return;
      const jobs = run.lanes.map((lane, index) => {
        const controller = this.controllers.get(lane.id) ?? new AbortController();
        this.controllers.set(lane.id, controller);
        return executeTestLane(task, connections[index], lane, this.roots.get(lane.id)!, controller, () => this.publish(run))
          .finally(() => this.controllers.delete(lane.id));
      });
      void Promise.allSettled(jobs).then(() => { this.publish(run, true); this.active.delete(run.id); });
    }, 0);
    return structuredClone(run);
  }
  cancel(runId: string, laneId?: string): void {
    const run = this.run(runId);
    for (const lane of run.lanes.filter(item => !laneId || item.id === laneId)) {
      if (lane.status === 'queued' || lane.status === 'running') {
        const controller = this.controllers.get(lane.id) ?? new AbortController();
        this.controllers.set(lane.id, controller); controller.abort();
      }
      this.validators.get(lane.id)?.controller.abort();
    }
  }
  preview(runId: string, laneId: string): string | null {
    const run = this.run(runId), lane = run.lanes.find(item => item.id === laneId);
    if (!lane) throw new Error('模型结果不存在');
    if (lane.status === 'queued' || lane.status === 'running') return null;
    const root = this.roots.get(lane.id)!;
    for (const file of lane.files) writeTestFile(root, file);
    return previewAddress(lane.id, lane.files);
  }
  async validate(runId: string, laneId: string): Promise<TestRun> {
    const run = this.run(runId), lane = run.lanes.find(item => item.id === laneId);
    if (!lane) throw new Error('模型结果不存在');
    if (['queued', 'running'].includes(lane.status)) throw new Error('请等待此模型执行结束后再校验');
    if (this.validators.has(laneId)) throw new Error('此结果正在校验');
    if (!run.task.checks.length) throw new Error('本次测试未配置校验项，可复跑时添加');
    this.preview(runId, laneId);
    const controller = new AbortController(), browser = new AiTestBrowser(lane.id + '-check', this.roots.get(lane.id)!);
    const validator = { controller, browser };
    this.validators.set(laneId, validator);
    lane.checking = true; lane.checkError = undefined; lane.checks = []; this.publish(run, true);
    try { lane.checks = await browser.checks(lane.files, run.task.checks, controller.signal); }
    catch (error) { lane.checkError = error instanceof Error ? error.message : '校验失败'; }
    finally { lane.checking = false; lane.logs = [...(lane.logs ?? []), ...browser.logs].slice(-100); browser.close(); this.validators.delete(laneId); this.publish(run, true); }
    return structuredClone(run);
  }
  async export(runId: string, laneId: string, owner: WebContents): Promise<boolean> {
    const lane = this.run(runId).lanes.find(item => item.id === laneId);
    if (!lane?.files.length) throw new Error('此结果没有可导出的文件');
    if (lane.status === 'running' || lane.status === 'queued') throw new Error('请等待执行结束后导出');
    const win = BrowserWindow.fromWebContents(owner);
    const options = { title: '导出本次生成产物', defaultPath: 'ai-test-artifacts.zip', filters: [{ name: 'ZIP 文件', extensions: ['zip'] }] };
    const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    writeFileSync(result.filePath, zipSync(Object.fromEntries(lane.files.map(file => [file.path, strToU8(file.content)]))));
    return true;
  }
  shutdown(): void {
    for (const controller of this.controllers.values()) controller.abort();
    for (const value of this.validators.values()) { value.controller.abort(); value.browser.close(); }
    for (const run of this.active.values()) this.publish(run, true);
    this.closed = true;
    for (const timer of this.updates.values()) clearTimeout(timer);
    this.updates.clear(); this.store.close();
  }
}

async function chooseMaterials(owner: WebContents): Promise<TestFile[]> {
  const options = { title: '添加相同的参考材料或起始项目', properties: ['openFile', 'multiSelections'] as ('openFile' | 'multiSelections')[], filters: [{ name: '文本文件或 ZIP 项目', extensions: ['txt', 'md', 'html', 'css', 'js', 'mjs', 'ts', 'tsx', 'jsx', 'json', 'csv', 'py', 'sql', 'svg', 'zip'] }] };
  const win = BrowserWindow.fromWebContents(owner);
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options);
  if (result.canceled) return [];
  let total = 0, count = 0;
  const files: TestFile[] = [];
  const decoder = new TextDecoder('utf-8', { fatal: true });
  for (const path of result.filePaths) {
    if (statSync(path).size > 4000000) throw new Error('单个材料或 ZIP 最多 4 MB');
    const bytes = readFileSync(path);
    if (extname(path).toLowerCase() === '.zip') {
      const archive = unzipSync(bytes, { filter: item => {
        if (item.name.endsWith('/')) return false;
        if (/(^|\/)(node_modules|\.git|\.env(?:\.[^/]+)?)(\/|$)/i.test(item.name)) throw new Error('起始项目请排除 node_modules、.git 和 .env');
        total += item.originalSize; count++;
        if (item.originalSize > 500000 || total > 2000000 || count > 40) throw new Error('材料最多 40 个文件、总计 2 MB');
        return true;
      } });
      for (const [name, content] of Object.entries(archive)) files.push(testFileSchema.parse({ path: name, content: decoder.decode(content) }));
    } else {
      total += bytes.byteLength; count++;
      if (total > 2000000 || count > 40) throw new Error('材料最多 40 个文件、总计 2 MB');
      files.push(testFileSchema.parse({ path: basename(path), content: decoder.decode(bytes) }));
    }
  }
  return files;
}

export function registerAiTestIpc(service: AiTestService, owner: () => WebContents | undefined): void {
  const id = z.string().uuid();
  function handle(channel: string, action: (sender: WebContents, ...args: any[]) => unknown): void {
    ipcMain.handle('ai-test:' + channel, (event, ...args: unknown[]) => {
      if (event.sender !== owner() || event.senderFrame !== event.sender.mainFrame) throw new Error('AI 测试仅允许主窗口访问');
      return action(event.sender, ...args);
    });
  }
  handle('tasks', () => service.store.tasks());
  handle('save', (_sender, input) => service.store.saveTask(testTaskSchema.parse(input)));
  handle('runs', () => service.store.runs());
  handle('run', (_sender, runId) => service.run(id.parse(runId)));
  handle('start', (_sender, input) => service.start(testTaskSchema.parse(input)));
  handle('cancel', (_sender, runId, laneId) => service.cancel(id.parse(runId), laneId === undefined ? undefined : id.parse(laneId)));
  handle('materials', sender => chooseMaterials(sender));
  handle('preview', (_sender, runId, laneId) => service.preview(id.parse(runId), id.parse(laneId)));
  handle('validate', (_sender, runId, laneId) => service.validate(id.parse(runId), id.parse(laneId)));
  handle('export', (sender, runId, laneId) => service.export(id.parse(runId), id.parse(laneId), sender));
  service.onChanged = run => { const web = owner(); if (web && !web.isDestroyed()) web.send('ai-test:changed', run); };
}
