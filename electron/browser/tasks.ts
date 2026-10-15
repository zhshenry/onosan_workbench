import { randomUUID } from 'node:crypto';
import type { WebContents } from 'electron';
import type { BrowserGuests } from '../browser-guests';
import { BrowserControlError, BrowserDriver } from './driver';
import { createGuestDriver } from './guest-driver';
import { BrowserStore } from './store';
import type { BrowserAction, BrowserClearData, BrowserCondition, BrowserQuery, BrowserTask, BrowserTabCommand } from '../../shared/browser-automation-contracts';
import { browserRecordUrl } from '../../shared/browser-automation-contracts';

interface ActiveTask { task: BrowserTask; owner: WebContents; controller: AbortController; signal?: AbortSignal; wake: Set<() => void>; verified: boolean; busy: boolean; }
export class BrowserAutomation {
  private tasks = new Map<string, ActiveTask>();
  private drivers = new Map<number, Promise<BrowserDriver>>();
  private tails = new Map<number, Promise<unknown>>();
  private owners = new WeakSet<WebContents>();
  constructor(private readonly guests: BrowserGuests, readonly store: BrowserStore) {
    guests.observeNavigation((workspace, url, title, tabId) => { try { store.visit(workspace, url, title, tabId); } catch (error) { console.error('浏览历史保存失败', error); } });
    guests.observePopup((owner, parent) => {
      if (guests.resolve(owner, parent).workspace === 'xhs-creator') return undefined;
      const active = [...this.tasks.values()].find(item => item.owner === owner && item.busy && item.task.tabIds.includes(parent));
      if (!active || active.task.tabIds.length >= 20) return undefined;
      const id = randomUUID(); active.task.tabIds.push(id); active.verified = false; this.publish(active); return id;
    });
  }
  private publish(active: ActiveTask): BrowserTask {
    active.task.updatedAt = new Date().toISOString();
    active.task.persistenceError = undefined;
    try { this.store.task(active.task); }
    catch { active.task.persistenceError = '浏览器任务记录保存失败，请检查数据目录空间与写入权限；暂停和停止仍然可用。'; }
    if (!active.owner.isDestroyed()) active.owner.send('browser:task', structuredClone(active.task));
    return structuredClone(active.task);
  }
  start(owner: WebContents, tabId: string | undefined, goal: string, workspace = 'default'): BrowserTask {
    if (!this.owners.has(owner)) {
      this.owners.add(owner);
      owner.once('destroyed', () => { for (const active of this.tasks.values()) if (active.owner === owner) active.controller.abort(); });
    }
    const lease = tabId ? this.guests.resolve(owner, tabId) : undefined;
    const url = lease?.guest.getURL();
    if (url && !this.guests.canNavigate(url, lease!.workspace)) throw new Error('请先打开一个允许的网页。');
    if ([...this.tasks.values()].some(item => item.owner === owner && ['ready', 'running', 'paused', 'site-approval'].includes(item.task.status))) throw new Error('请先结束当前浏览器任务。');
    const task: BrowserTask = { id: randomUUID(), workspace: lease?.workspace ?? workspace, tabIds: tabId ? [tabId] : [], origins: url ? [new URL(url).origin] : [], goal, status: 'ready', steps: [], updatedAt: new Date().toISOString() };
    const active: ActiveTask = { task, owner, controller: new AbortController(), wake: new Set(), verified: false, busy: false };
    for (const [id, old] of this.tasks) if (!old.busy && !['ready', 'paused', 'site-approval'].includes(old.task.status)) this.tasks.delete(id);
    this.tasks.set(task.id, active);
    return this.publish(active);
  }
  private get(owner: WebContents, id: string): ActiveTask {
    const active = this.tasks.get(id);
    if (!active || active.owner !== owner) throw new Error('浏览器任务已失效，请重新选择页面并开始。');
    return active;
  }
  taskFor(owner: WebContents, id: string): BrowserTask { return structuredClone(this.get(owner, id).task); }
  forChat(owner: WebContents, workspace: string, goal: string, chatId: string, previousId?: string, tabId?: string): BrowserTask {
    const tab = this.guests.tabs(owner, workspace).find(tab => (tabId ? tab.id === tabId : tab.active) && tab.ready && this.guests.canNavigate(tab.url, workspace));
    if (tabId && !tab) throw new BrowserControlError('tab-unavailable', '关联的网页已经关闭或不可操作，请重新选择页面后发送。');
    const previous = previousId ? this.continuation(owner, previousId, chatId) : undefined;
    return previous?.workspace === workspace && (tab ? previous.tabIds.includes(tab.id) : !previous.tabIds.length) ? previous : this.start(owner, tab?.id, goal, workspace);
  }
  continuation(owner: WebContents, id: string, chatId: string): BrowserTask | undefined {
    const active = this.tasks.get(id);
    return active?.owner === owner && active.task.chatId === chatId && !active.busy && ['ready', 'paused', 'unverified'].includes(active.task.status) ? structuredClone(active.task) : undefined;
  }
  signal(owner: WebContents, id: string): AbortSignal { const active = this.get(owner, id); return active.signal ?? active.controller.signal; }
  bind(owner: WebContents, id: string, chatId: string, signal: AbortSignal): BrowserTask {
    const active = this.get(owner, id);
    if (!['ready', 'paused', 'unverified'].includes(active.task.status) || active.busy || active.task.chatId && active.task.chatId !== chatId) throw new Error('浏览器任务不可在此对话启动，请重新开始任务。');
    active.busy = true; active.signal = AbortSignal.any([signal, active.controller.signal]);
    active.task.chatId = chatId; active.task.status = 'running'; active.task.error = undefined;
    return this.publish(active);
  }
  control(owner: WebContents, id: string, action: 'pause' | 'resume' | 'cancel' | 'approve-site'): BrowserTask {
    const active = this.get(owner, id);
    if (!['ready', 'running', 'paused', 'site-approval', 'unverified'].includes(active.task.status)) throw new Error('该任务已结束。');
    if (action === 'cancel') { active.controller.abort(); active.task.status = 'cancelled'; }
    else if (action === 'pause' && active.task.status === 'running') {
      active.task.status = 'paused'; active.verified = false;
      for (const tabId of active.task.tabIds) {
        try { void this.drivers.get(this.guests.resolve(owner, tabId).guest.id)?.then(driver => driver.invalidate()); } catch { /* The next operation reports a closed tab. */ }
      }
    }
    else if (action === 'approve-site' && active.task.pendingOrigin && active.task.status === 'site-approval') {
      active.task.origins.push(active.task.pendingOrigin); active.task.pendingOrigin = undefined; active.task.status = active.busy ? 'running' : 'ready';
    } else if (action === 'resume' && active.task.status === 'paused' && !active.task.pendingOrigin) active.task.status = active.busy ? 'running' : 'ready';
    else throw new Error('当前状态不能执行此操作。');
    this.publish(active); for (const wake of active.wake) wake();
    return structuredClone(active.task);
  }
  finish(owner: WebContents, id: string, error?: string): void {
    const active = this.get(owner, id);
    active.busy = false;
    if (active.task.status !== 'cancelled') active.task.status = error ? active.signal?.aborted ? 'interrupted' : 'failed' : active.verified ? 'completed' : 'unverified';
    active.task.error ||= error; active.task.pendingOrigin = undefined;
    this.publish(active);
  }
  private async permit(active: ActiveTask, url?: string): Promise<void> {
    const signal = active.signal ?? active.controller.signal;
    signal.throwIfAborted();
    if (!active.busy || !['running', 'paused', 'site-approval'].includes(active.task.status)) throw new BrowserControlError('task-ended', '浏览器任务已经结束。');
    const origin = url && /^https?:/.test(url) ? new URL(url).origin : undefined;
    if (origin && !active.task.origins.includes(origin)) { active.task.pendingOrigin = origin; active.task.status = 'site-approval'; this.publish(active); }
    while (active.task.status !== 'running') {
      await new Promise<void>((resolve, reject) => {
        const cleanup = () => { active.wake.delete(wake); signal.removeEventListener('abort', abort); clearTimeout(timer); };
        const wake = () => { cleanup(); resolve(); };
        const abort = () => { cleanup(); reject(new BrowserControlError('cancelled', '浏览器任务已停止。')); };
        const timer = setTimeout(() => { cleanup(); reject(new BrowserControlError('handoff-timeout', '等待人工接管超时，请检查页面后重新开始。')); }, 300000);
        active.wake.add(wake); signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      signal.throwIfAborted();
    }
  }
  private async driver(owner: WebContents, tabId: string): Promise<BrowserDriver> {
    const lease = this.guests.resolve(owner, tabId), guest = lease.guest;
    let promise = this.drivers.get(guest.id);
    if (!promise) {
      promise = (async () => {
        if (guest.isDevToolsOpened()) throw new Error('请先关闭该网页的开发者工具，再由 AI 操作。');
        guest.debugger.attach('1.3');
        const driver = createGuestDriver(guest, () => this.guests.tabs(owner, lease.workspace).find(tab => tab.id === tabId)!);
        guest.debugger.on('message', (_event, method, params, sessionId) => driver.event(method, params, sessionId));
        const lost = (reason: string) => {
          driver.invalidate(); this.drivers.delete(guest.id);
          for (const active of this.tasks.values()) if (active.owner === owner && active.task.tabIds.includes(tabId) && active.busy) { active.controller.abort(); active.task.error = reason; active.task.status = 'interrupted'; this.publish(active); }
        };
        guest.debugger.once('detach', () => lost('浏览器控制连接断开，请检查页面并重新开始。'));
        guest.once('destroyed', () => lost('目标标签已关闭。'));
        for (const method of ['Page.enable', 'DOM.enable', 'Runtime.enable']) await guest.debugger.sendCommand(method);
        await guest.debugger.sendCommand('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });
        return driver;
      })();
      this.drivers.set(guest.id, promise);
      void promise.catch(() => this.drivers.delete(guest.id));
    }
    return promise;
  }
  private serial<T>(owner: WebContents, tabId: string, execute: () => Promise<T>): Promise<T> {
    const guestId = this.guests.resolve(owner, tabId).guest.id;
    const current = (this.tails.get(guestId) ?? Promise.resolve()).catch(() => {}).then(execute);
    this.tails.set(guestId, current);
    void current.finally(() => { if (this.tails.get(guestId) === current) this.tails.delete(guestId); }).catch(() => {});
    return current;
  }
  private async operation<T>(owner: WebContents, taskId: string, tabId: string, name: string, mutate: boolean, run: (driver: BrowserDriver, active: ActiveTask) => Promise<T>): Promise<T> {
    const active = this.get(owner, taskId);
    if (!active.task.tabIds.includes(tabId)) throw new BrowserControlError('tab-denied', '该标签不属于当前任务。');
    return this.serial(owner, tabId, async () => {
      let driver: BrowserDriver | undefined;
      try {
        if (active.task.steps.length >= 75) throw new BrowserControlError('step-limit', '本次任务达到操作上限，请检查已完成结果后重新开始。');
        await this.permit(active, this.guests.resolve(owner, tabId).guest.getURL());
        if (mutate) active.verified = false;
        driver = await this.driver(owner, tabId);
        driver.setReadPermission(url => { try { return active.task.origins.includes(new URL(url).origin); } catch { return false; } });
        const result = await run(driver, active);
        await this.permit(active, this.guests.resolve(owner, tabId).guest.getURL());
        const check = result && typeof result === 'object' && 'passed' in result && 'evidence' in result ? result as { passed: boolean; evidence: string } : undefined;
        active.task.steps.push({ at: new Date().toISOString(), operation: name, status: check?.passed === false ? 'error' : 'ok', detail: check ? check.evidence : browserRecordUrl(this.guests.resolve(owner, tabId).guest.getURL()) });
        active.task.steps = active.task.steps.slice(-80); this.publish(active);
        return result;
      } catch (error) {
        active.task.steps.push({ at: new Date().toISOString(), operation: name, status: 'error', detail: error instanceof BrowserControlError ? error.message : '页面操作失败，请重新观察或手动接管。' });
        active.task.steps = active.task.steps.slice(-80); this.publish(active);
        throw error;
      } finally { driver?.setReadPermission(); }
    });
  }
  tabs(owner: WebContents, taskId: string) { const active = this.get(owner, taskId); return this.guests.tabs(owner, active.task.workspace).filter(tab => active.task.tabIds.includes(tab.id)); }
  observe(owner: WebContents, taskId: string, tabId: string, screenshot = false, fullPage = false, query?: BrowserQuery) {
    return this.operation(owner, taskId, tabId, 'observe', false, (driver, active) => {
      driver.setReadPermission(async (url, frameId) => { if (query?.frameId === frameId) await this.permit(active, url); try { return active.task.origins.includes(new URL(url).origin); } catch { return false; } });
      return driver.observe(screenshot, fullPage, active.signal, query);
    });
  }
  act(owner: WebContents, taskId: string, tabId: string, action: BrowserAction) { return this.operation(owner, taskId, tabId, action.type, true, (driver, active) => {
    if (action.type === 'locator') driver.setReadPermission(async (url, frameId) => { if (action.query.frameId === frameId) await this.permit(active, url); try { return active.task.origins.includes(new URL(url).origin); } catch { return false; } });
    return driver.act(action, url => this.permit(active, url), active.signal);
  }); }
  navigate(owner: WebContents, taskId: string, tabId: string, url: string) {
    return this.operation(owner, taskId, tabId, 'navigate', true, async (driver, active) => {
      if (!this.guests.canNavigate(url, active.task.workspace)) throw new BrowserControlError('url-denied', '目标地址不符合此浏览器分区的导航范围。');
      await this.permit(active, url); return driver.navigate(url, active.signal);
    });
  }
  check(owner: WebContents, taskId: string, tabId: string, condition: BrowserCondition, timeoutMs = 0, verify = true) {
    return this.operation(owner, taskId, tabId, verify ? 'check' : 'wait', false, async (driver, active) => {
      const deadline = Date.now() + timeoutMs;
      const frameId = condition.type === 'locator' ? condition.query.frameId : 'frameId' in condition ? condition.frameId : undefined;
      driver.setReadPermission(async (url, id) => { if (frameId === id) await this.permit(active, url); try { return active.task.origins.includes(new URL(url).origin); } catch { return false; } });
      let result;
      do {
        await this.permit(active, this.guests.resolve(owner, tabId).guest.getURL());
        result = await driver.check(condition, active.signal);
        if (result.passed) break;
        if (Date.now() >= deadline) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      } while (Date.now() < deadline);
      if (verify) active.verified = result.passed;
      return result;
    });
  }
  async tab(owner: WebContents, taskId: string, type: BrowserTabCommand['type'], tabId: string, url?: string) {
    const active = this.get(owner, taskId);
    await this.permit(active);
    if (type === 'open') {
      if (!url || !this.guests.canNavigate(url, active.task.workspace) || this.guests.tabs(owner, active.task.workspace).length >= 20) throw new Error('新标签地址不可用或标签数量达到上限。');
      await this.permit(active, url); tabId = randomUUID(); active.task.tabIds.push(tabId);
    } else if (!active.task.tabIds.includes(tabId)) throw new Error('该标签未授权。');
    if (type === 'close' && active.task.tabIds.length === 1) throw new Error('请保留至少一个任务标签。');
    const command: BrowserTabCommand = { workspace: active.task.workspace, type, tabId, url };
    if (type !== 'select') active.verified = false;
    if (type === 'close') active.task.tabIds = active.task.tabIds.filter(id => id !== tabId);
    owner.send('browser:tab-command', command);
    if (type === 'close') {
      await this.guests.closeTab(owner, tabId);
      const remaining = active.task.tabIds[0];
      owner.send('browser:tab-command', { workspace: active.task.workspace, type: 'select', tabId: remaining } satisfies BrowserTabCommand);
      this.guests.activate(owner, remaining);
    }
    else if (type === 'select') this.guests.activate(owner, tabId);
    else {
      const deadline = Date.now() + 15000;
      while (!this.guests.tabs(owner, active.task.workspace).some(tab => tab.id === tabId && tab.ready && /^https?:/.test(tab.url))) {
        active.signal?.throwIfAborted(); if (Date.now() >= deadline) throw new Error('新标签打开超时，请查看浏览器。');
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    this.publish(active); return this.tabs(owner, taskId);
  }
  async clearData(owner: WebContents, input: BrowserClearData): Promise<void> {
    const { workspace, origin, kinds, since } = input;
    if (origin && (new URL(origin).origin !== origin || !this.guests.canNavigate(origin, workspace))) throw new Error('站点清理范围无效。');
    if (kinds.some(kind => kind !== 'history')) {
      for (const active of this.tasks.values()) if (active.owner === owner && active.task.workspace === workspace && (active.busy || active.task.status === 'ready')) throw new Error('请先停止浏览器任务，再清理站点数据。');
      const tab = this.guests.tabs(owner, workspace).find(item => !origin || new URL(item.url).origin === origin);
      if (!tab) throw new Error('请先打开要清理的浏览器站点。');
      const session = this.guests.resolve(owner, tab.id).guest.session;
      const dataTypes: Array<'cookies' | 'cache' | 'fileSystems' | 'indexedDB' | 'localStorage' | 'serviceWorkers' | 'webSQL'> = [];
      if (kinds.includes('cookies')) dataTypes.push('cookies');
      if (kinds.includes('cache')) dataTypes.push('cache');
      if (kinds.includes('site-data')) dataTypes.push('fileSystems', 'indexedDB', 'localStorage', 'serviceWorkers', 'webSQL');
      await session.clearData({ dataTypes, ...(origin ? { origins: [origin] } : {}) });
      if (kinds.includes('cookies')) await session.cookies.flushStore();
    }
    if (kinds.includes('history')) this.store.clearHistory(workspace, since, origin);
  }
  async clear(owner: WebContents, workspace: string, kind: 'history' | 'site-data', origin?: string): Promise<void> {
    if (kind === 'history') { this.store.clearHistory(workspace); return; }
    if (!origin || new URL(origin).origin !== origin) throw new Error('请指定要清理的站点来源。');
    const tab = this.guests.tabs(owner, workspace).find(item => { try { return new URL(item.url).origin === origin; } catch { return false; } });
    if (!tab) throw new Error('请先打开该站点。');
    for (const active of this.tasks.values()) if (active.owner === owner && active.task.workspace === workspace && active.busy) throw new Error('请先停止浏览器任务，再清理站点数据。');
    const lease = this.guests.resolve(owner, tab.id);
    await lease.guest.session.clearStorageData({ origin });
    await lease.guest.session.cookies.flushStore();
  }
}
