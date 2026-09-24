import { contextBridge, ipcRenderer } from 'electron';

const todo = {
  state: (): Promise<unknown> => ipcRenderer.invoke('todo:state'),
  info: (): Promise<unknown> => ipcRenderer.invoke('todo:info'),
  create: (input: unknown): Promise<unknown> => ipcRenderer.invoke('todo:create', input),
  update: (id: string, patch: unknown, revision: string): Promise<unknown> =>
    ipcRenderer.invoke('todo:update', id, patch, revision),
  remove: (id: string, revision: string): Promise<unknown> => ipcRenderer.invoke('todo:remove', id, revision),
  snooze: (id: string): Promise<unknown> => ipcRenderer.invoke('todo:snooze', id),
  restore: (id: string): Promise<unknown> => ipcRenderer.invoke('todo:restore', id),
  createCategory: (input: unknown): Promise<unknown> => ipcRenderer.invoke('todo:createCategory', input),
  updateCategory: (id: string, input: unknown, revision: string): Promise<unknown> =>
    ipcRenderer.invoke('todo:updateCategory', id, input, revision),
  removeCategory: (id: string, revision: string): Promise<unknown> =>
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

const ai = {
  config: (): Promise<unknown> => ipcRenderer.invoke('ai:config'),
  pending: (): Promise<unknown> => ipcRenderer.invoke('ai:pending'),
  setEnabled: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke('ai:setEnabled', { aiEnabled: enabled }),
  saveProvider: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:provider:save', input),
  removeProvider: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:provider:remove', id),
  saveModel: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:model:save', input),
  removeModel: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:model:remove', id),
  activateModel: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:model:activate', id),
  test: (input: unknown): Promise<string> => ipcRenderer.invoke('ai:test', input),
  chatList: (): Promise<unknown> => ipcRenderer.invoke('ai:chat:list'),
  chatOpen: (id?: string): Promise<unknown> => ipcRenderer.invoke('ai:chat:open', id),
  chatNew: (): Promise<unknown> => ipcRenderer.invoke('ai:chat:new'),
  chatRemove: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:chat:remove', id),
  chatDraft: (id: string, text: string): Promise<void> => ipcRenderer.invoke('ai:chat:draft', id, text),
  ask: (sessionId: string, text: string): Promise<void> => ipcRenderer.invoke('ai:ask', sessionId, text),
  cancel: (): void => {
    ipcRenderer.send('ai:cancel');
  },
  apply: (token: string, indices: number[]): Promise<unknown> => ipcRenderer.invoke('ai:apply', token, indices),
  discard: (token: string): Promise<unknown> => ipcRenderer.invoke('ai:discard', token),
  onChat: (callback: (chat: unknown) => void): (() => void) => {
    const listener = (_event: unknown, chat: unknown): void => callback(chat);
    ipcRenderer.on('ai:chat', listener);
    return () => {
      ipcRenderer.off('ai:chat', listener);
    };
  },
};

// 内置浏览器:仅暴露三个租约操作,不暴露 IPC 与 Electron 对象
const browser = {
  acquire: (workspace: string): Promise<unknown> => ipcRenderer.invoke('browser:acquire', workspace),
  release: (lease: string): Promise<void> => ipcRenderer.invoke('browser:release', lease),
  onOpenRequested: (lease: string, listener: (url: string) => void): (() => void) => {
    const l = (_event: unknown, request: unknown): void => {
      if (typeof request !== 'object' || request === null) return;
      const r = request as Record<string, unknown>;
      if (r.lease !== lease || typeof r.url !== 'string') return;
      listener(r.url);
    };
    ipcRenderer.on('browser:open-requested', l);
    return () => {
      ipcRenderer.off('browser:open-requested', l);
    };
  },
};

// 八字排盘:命例库与笔记(userData/bazi-profiles.json)
const bazi = {
  list: (): Promise<unknown> => ipcRenderer.invoke('bazi:list'),
  saveProfile: (input: unknown): Promise<unknown> => ipcRenderer.invoke('bazi:saveProfile', input),
  removeProfile: (id: string): Promise<unknown> => ipcRenderer.invoke('bazi:removeProfile', id),
  saveNote: (id: string, text: string): Promise<unknown> => ipcRenderer.invoke('bazi:saveNote', id, text),
};

// 文案工坊:小红书心得草稿库(userData/copy-drafts.json)与 AI 优化
const copy = {
  list: (): Promise<unknown> => ipcRenderer.invoke('copy:list'),
  save: (input: unknown): Promise<unknown> => ipcRenderer.invoke('copy:save', input),
  remove: (id: string): Promise<unknown> => ipcRenderer.invoke('copy:remove', id),
  enhance: (draftId: string, mode: string): Promise<unknown> => ipcRenderer.invoke('copy:ai:enhance', { draftId, mode }),
  cancel: (): Promise<void> => ipcRenderer.invoke('copy:ai:cancel'),
};

// 文档转 PDF:Word/PPT 字节进,PDF 字节出(结果用 {ok} 判别联合,错误码见 shared/office-contracts)
const office = {
  convert: (filename: string, bytes: Uint8Array): Promise<unknown> =>
    ipcRenderer.invoke('office:convert', filename, bytes),
};

// 应用设置与关于页(工作台自有,存 userData/app-settings.json)
const settings = {
  get: (): Promise<unknown> => ipcRenderer.invoke('settings:get'),
  patch: (patch: unknown): Promise<unknown> => ipcRenderer.invoke('settings:patch', patch),
};

const appInfo = {
  about: (): Promise<unknown> => ipcRenderer.invoke('app:about'),
  openUserDataDir: (): Promise<void> => ipcRenderer.invoke('app:openUserDataDir'),
  openTodoDir: (): Promise<void> => ipcRenderer.invoke('app:openTodoDir'),
};

const api = {
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
  bazi,
  copy,
  ai,
  browser,
  office,
  settings,
  appInfo,
};

contextBridge.exposeInMainWorld('workbench', api);

export type WorkbenchApi = typeof api;
