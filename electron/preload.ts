import type { WorkbenchApi } from '../shared/workbench-api';
import type { ChatSession } from '../shared/todo-contracts';
import type { MediaCaptureItem } from '../shared/media-capture-contracts';
import type { BrowserTask, BrowserTabCommand } from '../shared/browser-automation-contracts';
import { contextBridge, ipcRenderer } from 'electron';

const onAsk = (callback: (ask: { id: string; sessionId: string; question: string; options: { label: string; description?: string }[] }) => void): (() => void) => {
  const listener = (_event: unknown, ask: { id: string; sessionId: string; question: string; options: { label: string; description?: string }[] }): void => callback(ask);
  ipcRenderer.on('ai:ask', listener);
  return () => {
    ipcRenderer.off('ai:ask', listener);
  };
};

const todo: WorkbenchApi['todo'] = {
  state: () => ipcRenderer.invoke('todo:state'),
  info: () => ipcRenderer.invoke('todo:info'),
  create: (input: unknown) => ipcRenderer.invoke('todo:create', input),
  update: (id: string, patch: unknown, revision: string) =>
    ipcRenderer.invoke('todo:update', id, patch, revision),
  remove: (id: string, revision: string) => ipcRenderer.invoke('todo:remove', id, revision),
  snooze: (id: string) => ipcRenderer.invoke('todo:snooze', id),
  restore: (id: string) => ipcRenderer.invoke('todo:restore', id),
  createCategory: (input: unknown) => ipcRenderer.invoke('todo:createCategory', input),
  updateCategory: (id: string, input: unknown, revision: string) =>
    ipcRenderer.invoke('todo:updateCategory', id, input, revision),
  removeCategory: (id: string, revision: string) =>
    ipcRenderer.invoke('todo:removeCategory', id, revision),
  review: (): Promise<string> => ipcRenderer.invoke('todo:review'),
  onChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('todo:changed', listener);
    return () => {
      ipcRenderer.off('todo:changed', listener);
    };
  },
};

// 阅读清单:书单与 Obsidian 读书库只读关联
const reading: WorkbenchApi['reading'] = {
  list: () => ipcRenderer.invoke('reading:list'),
  save: (input: unknown) => ipcRenderer.invoke('reading:save', input),
  remove: (id: string) => ipcRenderer.invoke('reading:remove', id),
  setVault: (vaultPath: string) => ipcRenderer.invoke('reading:setVault', vaultPath),
  scan: (vaultPath: string) => ipcRenderer.invoke('reading:scan', vaultPath),
  aggregate: (folder: string) => ipcRenderer.invoke('reading:aggregate', folder),
  openObsidian: (vault: string, rel?: string): Promise<void> => ipcRenderer.invoke('reading:openObsidian', vault, rel),
};

const ai: WorkbenchApi['ai'] = {
  openLink: (url: string): Promise<void> => ipcRenderer.invoke('ai:openLink', url),
  config: () => ipcRenderer.invoke('ai:config'),
  setEnabled: (enabled: boolean) => ipcRenderer.invoke('ai:setEnabled', { aiEnabled: enabled }),
  saveProvider: (input: unknown) => ipcRenderer.invoke('ai:provider:save', input),
  removeProvider: (id: string) => ipcRenderer.invoke('ai:provider:remove', id),
  saveModel: (input: unknown) => ipcRenderer.invoke('ai:model:save', input),
  removeModel: (id: string) => ipcRenderer.invoke('ai:model:remove', id),
  activateModel: (id: string) => ipcRenderer.invoke('ai:model:activate', id),
  test: (input: unknown): Promise<string> => ipcRenderer.invoke('ai:test', input),
  saveRlcdProvider: (input: unknown) => ipcRenderer.invoke('ai:rlcd:provider:save', input),
  removeRlcdProvider: (id: string) => ipcRenderer.invoke('ai:rlcd:provider:remove', id),
  saveRlcdModel: (input: unknown) => ipcRenderer.invoke('ai:rlcd:model:save', input),
  removeRlcdModel: (id: string) => ipcRenderer.invoke('ai:rlcd:model:remove', id),
  testRlcd: (input: unknown): Promise<string> => ipcRenderer.invoke('ai:rlcd:test', input),
  chatList: () => ipcRenderer.invoke('ai:chat:list'),
  chatOpen: (id?: string) => ipcRenderer.invoke('ai:chat:open', id),
  chatNew: (tag?: unknown) => ipcRenderer.invoke('ai:chat:new', tag),
    chatRename: (id: string, title: string) => ipcRenderer.invoke('ai:chat:rename', id, title),
    chatRemove: (id: string) => ipcRenderer.invoke('ai:chat:remove', id),
    chatDraft: (id: string, text: string): Promise<void> => ipcRenderer.invoke('ai:chat:draft', id, text),
    chatContext: (id: string, scope: import('../shared/ai-scope').AiScope) => ipcRenderer.invoke('ai:chat:context', id, scope),
    ask: (sessionId: string, text: string, context?: import('../shared/ai-reference').AiTurnContext): Promise<void> => ipcRenderer.invoke('ai:ask', sessionId, text, context),
  cancel: (sessionId: string): void => {
    ipcRenderer.send('ai:cancel', sessionId);
  },
  apply: (token: string, indices: number[]) => ipcRenderer.invoke('ai:apply', token, indices),
  undo: (token: string) => ipcRenderer.invoke('ai:undo', token),
  discard: (token: string) => ipcRenderer.invoke('ai:discard', token),
  onAsk: onAsk,
  answerAsk: (input: { id: string; sessionId: string; kind: 'option' | 'text' | 'skip'; value?: string }): void => {
    ipcRenderer.send('ai:answer', input);
  },
  onChat: (callback: (chat: ChatSession) => void): (() => void) => {
    const listener = (_event: unknown, chat: ChatSession): void => callback(chat);
    ipcRenderer.on('ai:chat', listener);
    return () => {
      ipcRenderer.off('ai:chat', listener);
    };
  },
};

// 内置浏览器:仅暴露三个租约操作,不暴露 IPC 与 Electron 对象
const browser = {
  acquire: (workspace: string, tabId?: string) => ipcRenderer.invoke('browser:acquire', workspace, tabId),
  release: (lease: string): Promise<void> => ipcRenderer.invoke('browser:release', lease),
  onOpenRequested: (lease: string, listener: (url: string, tabId?: string) => void): (() => void) => {
    const l = (_event: unknown, request: unknown): void => {
      if (typeof request !== 'object' || request === null) return;
      const r = request as Record<string, unknown>;
      if (r.lease !== lease || typeof r.url !== 'string') return;
      listener(r.url, typeof r.tabId === 'string' ? r.tabId : undefined);
    };
    ipcRenderer.on('browser:open-requested', l);
    return () => {
      ipcRenderer.off('browser:open-requested', l);
    };
  },
};

const browserAutomation: WorkbenchApi['browserAutomation'] = {
  tabs: (workspace: string) => ipcRenderer.invoke('browser:tabs', workspace),
  deleteHistory: (workspace: string, ids: string[]) => ipcRenderer.invoke('browser:delete-history', workspace, ids),
  clearData: (input: unknown) => ipcRenderer.invoke('browser:clear-data', input),
  state: (workspace: string) => ipcRenderer.invoke('browser:state', workspace),
  saveTabs: (workspace: string, tabs: unknown, activeId: string) => ipcRenderer.invoke('browser:save-tabs', workspace, tabs, activeId),
  activate: (workspace: string, tabId: string) => ipcRenderer.invoke('browser:activate', workspace, tabId),
  control: (id: string, action: string, expectedOrigin?: string) => ipcRenderer.invoke('browser:task-control', id, action, expectedOrigin),
  clear: (workspace: string, kind: string, origin?: string) => ipcRenderer.invoke('browser:clear', workspace, kind, origin),
  onTask: (listener: (task: BrowserTask) => void) => {
    const callback = (_event: unknown, task: BrowserTask) => listener(task);
    ipcRenderer.on('browser:task', callback); return () => ipcRenderer.off('browser:task', callback);
  },
  onTabCommand: (listener: (command: BrowserTabCommand) => void) => {
    const callback = (_event: unknown, command: BrowserTabCommand) => listener(command);
    ipcRenderer.on('browser:tab-command', callback); return () => ipcRenderer.off('browser:tab-command', callback);
  },
};

// 八字排盘:命例库与笔记(userData/bazi-profiles.json)
const bazi: WorkbenchApi['bazi'] = {
  list: () => ipcRenderer.invoke('bazi:list'),
  saveProfile: (input: unknown) => ipcRenderer.invoke('bazi:saveProfile', input),
  removeProfile: (id: string) => ipcRenderer.invoke('bazi:removeProfile', id),
  saveNote: (id: string, text: string) => ipcRenderer.invoke('bazi:saveNote', id, text),
};

// 文案工坊:小红书心得草稿库(userData/copy-drafts.json);AI 建议走 ai 会话体系,应用后经 onChanged 刷新
// 素材采集:自媒体浏览器的「采集到素材」(索引 JSON + 截图 PNG 文件)
const mediaCapture: WorkbenchApi['mediaCapture'] = {
  list: () => ipcRenderer.invoke('media-capture:list'),
  save: (input: unknown) => ipcRenderer.invoke('media-capture:save', input),
  remove: (id: string) => ipcRenderer.invoke('media-capture:remove', id),
  setNote: (id: string, note: string) => ipcRenderer.invoke('media-capture:setNote', id, note),
  onChanged: (callback: (items: MediaCaptureItem[]) => void): (() => void) => {
    const listener = (_event: unknown, items: MediaCaptureItem[]): void => callback(items);
    ipcRenderer.on('media-capture:changed', listener);
    return () => {
      ipcRenderer.off('media-capture:changed', listener);
    };
  },
  onFailed: (callback: (message: string) => void): (() => void) => {
    const listener = (_event: unknown, message: unknown): void => {
      if (typeof message === 'string') callback(message);
    };
    ipcRenderer.on('media-capture:failed', listener);
    return () => {
      ipcRenderer.off('media-capture:failed', listener);
    };
  },
};

const copy: WorkbenchApi['copy'] = {
  list: () => ipcRenderer.invoke('copy:list'),
  save: (input: unknown) => ipcRenderer.invoke('copy:save', input),
  remove: (id: string) => ipcRenderer.invoke('copy:remove', id),
  markXhsPublished: (id: string, url: string) => ipcRenderer.invoke('copy:markXhsPublished', id, url),
  clearXhsPublished: (id: string) => ipcRenderer.invoke('copy:clearXhsPublished', id),
  onChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('copy:changed', listener);
    return () => {
      ipcRenderer.off('copy:changed', listener);
    };
  },
};

// 文档转 PDF:Word/PPT 字节进,PDF 字节出(结果用 {ok} 判别联合,错误码见 shared/office-contracts)
const office: WorkbenchApi['office'] = {
  convert: (filename: string, bytes: Uint8Array) =>
    ipcRenderer.invoke('office:convert', filename, bytes),
};

// 应用设置与关于页(工作台自有,存 userData/app-settings.json)
const settings: WorkbenchApi['settings'] = {
  get: () => ipcRenderer.invoke('settings:get'),
  patch: (patch: unknown) => ipcRenderer.invoke('settings:patch', patch),
};

const appInfo: WorkbenchApi['appInfo'] = {
  about: () => ipcRenderer.invoke('app:about'),
  openUserDataDir: (): Promise<void> => ipcRenderer.invoke('app:openUserDataDir'),
  openTodoDir: (): Promise<void> => ipcRenderer.invoke('app:openTodoDir'),
  // 外链白名单在主进程校验(仅小红书创作者中心发布页)
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
};

const updater = {
  status: (): Promise<import('../shared/contracts').UpdateStatus> => ipcRenderer.invoke('updater:status'),
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
  notes: (): Promise<void> => ipcRenderer.invoke('updater:notes'),
  onStatus: (callback: (status: import('../shared/contracts').UpdateStatus) => void): (() => void) => {
    const listener = (_event: unknown, status: import('../shared/contracts').UpdateStatus): void => callback(status);
    ipcRenderer.on('updater:status', listener);
    return () => ipcRenderer.off('updater:status', listener);
  },
};

// 系统剪贴板(发布助手复制标题/正文用)
const clipboard = {
  write: (text: string): Promise<void> => ipcRenderer.invoke('clipboard:write', text),
};

  const float = {
  toggle: (): Promise<boolean> => ipcRenderer.invoke('float:toggle'),
  show: (): Promise<void> => ipcRenderer.invoke('float:show'),
  onVisibilityChanged: (callback: (visible: boolean) => void): (() => void) => {
    const listener = (_event: unknown, visible: unknown): void => {
      if (typeof visible === 'boolean') callback(visible);
    };
    ipcRenderer.on('float:visibility-changed', listener);
    ipcRenderer.send('float:subscribe');
    return () => ipcRenderer.off('float:visibility-changed', listener);
  },
  collapse: (collapsed: boolean, animate: boolean): Promise<void> => ipcRenderer.invoke('float:collapse', collapsed, animate),
  tempHeight: (height: number | null): void => {
    ipcRenderer.send('float:tempHeight', height);
  },
  resize: (height: number): void => {
    ipcRenderer.send('float:resize', height);
  },
  width: (narrow?: boolean, animate?: boolean): Promise<number> => ipcRenderer.invoke('float:width', narrow, animate),
  pin: (): Promise<boolean> => ipcRenderer.invoke('float:pin'),
};

const game: import('../shared/game-contracts').GameBridge = {
  issues: {
    directory: () => ipcRenderer.invoke('game:issues:directory'),
    list: () => ipcRenderer.invoke('game:issues:list'),
    read: id => ipcRenderer.invoke('game:issues:read', id),
    save: draft => ipcRenderer.invoke('game:issues:save', draft),
    preview: image => ipcRenderer.invoke('game:issues:preview', image),
    openImage: image => ipcRenderer.invoke('game:issues:openImage', image),
    openFolder: id => ipcRenderer.invoke('game:issues:openFolder', id),
    export: id => ipcRenderer.invoke('game:issues:export', id),
  },
  terminal: {
    state: () => ipcRenderer.invoke('game:terminal:state'),
    open: size => ipcRenderer.invoke('game:terminal:open', size),
    write: (id, data) => ipcRenderer.invoke('game:terminal:write', { id, data }),
    resize: (id, cols, rows) => ipcRenderer.invoke('game:terminal:resize', { id, cols, rows }),
    clear: id => ipcRenderer.invoke('game:terminal:clear', { id }),
    close: id => ipcRenderer.invoke('game:terminal:close', { id }),
    onEvent: callback => {
      const listener = (_event: unknown, event: import('../shared/game-contracts').GameTerminalEvent) => callback(event);
      ipcRenderer.on('game:terminal:event', listener); return () => ipcRenderer.off('game:terminal:event', listener);
    },
  },
  state: () => ipcRenderer.invoke('game:state'),
  configure: config => ipcRenderer.invoke('game:configure', config),
  configureOnline: url => ipcRenderer.invoke('game:configureOnline', url),
  checkOnline: () => ipcRenderer.invoke('game:checkOnline'),
  openOnline: tabId => ipcRenderer.invoke('game:openOnline', tabId),
  resetTrial: input => ipcRenderer.invoke('game:resetTrial', input),
  readDocument: path => ipcRenderer.invoke('game:readDocument', path),
  openDocumentLink: url => ipcRenderer.invoke('game:openDocumentLink', url),
  chooseRoot: () => ipcRenderer.invoke('game:chooseRoot'),
  start: () => ipcRenderer.invoke('game:start'),
  stop: () => ipcRenderer.invoke('game:stop'),
  connect: () => ipcRenderer.invoke('game:connect'),
  run: scope => ipcRenderer.invoke('game:run', scope),
  cancel: () => ipcRenderer.invoke('game:cancel'),
  open: target => ipcRenderer.invoke('game:open', target),
  capture: tabId => ipcRenderer.invoke('game:capture', tabId),
  openArtifact: id => ipcRenderer.invoke('game:openArtifact', id),
  onChanged: callback => {
    const listener = (_event: unknown, state: import('../shared/game-contracts').GameState) => callback(state);
    ipcRenderer.on('game:changed', listener); return () => ipcRenderer.off('game:changed', listener);
  },
};

const api: WorkbenchApi = {
  minimize: (): void => {
    ipcRenderer.send('win:minimize');
  },
  maximizeToggle: (): void => {
    ipcRenderer.send('win:maximizeToggle');
  },
  close: (): void => {
    ipcRenderer.send('win:close');
  },
  onMaximized: (callback: (maximized: boolean) => void): (() => void) => {
    const listener = (_event: unknown, maximized: boolean): void => callback(maximized);
    ipcRenderer.on('win:maximized', listener);
    return () => {
      ipcRenderer.off('win:maximized', listener);
    };
  },
  todo,
  reading,
  float,
  bazi,
  copy,
  ai,
  browser,
  browserAutomation,
  mediaCapture,
  office,
  settings,
  appInfo,
  updater,
  game,
  clipboard,
};

contextBridge.exposeInMainWorld('workbench', api);

export type { WorkbenchApi } from '../shared/workbench-api';
