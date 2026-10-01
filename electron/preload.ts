import { contextBridge, ipcRenderer } from 'electron';

const onAsk = (callback: (ask: { id: string; question: string; options: { label: string; description?: string }[] }) => void): (() => void) => {
  const listener = (_event: unknown, ask: { id: string; question: string; options: { label: string; description?: string }[] }): void => callback(ask);
  ipcRenderer.on('ai:ask', listener);
  return () => {
    ipcRenderer.off('ai:ask', listener);
  };
};

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
  openLink: (url: string): Promise<void> => ipcRenderer.invoke('ai:openLink', url),
  config: (): Promise<unknown> => ipcRenderer.invoke('ai:config'),
  setEnabled: (enabled: boolean): Promise<unknown> => ipcRenderer.invoke('ai:setEnabled', { aiEnabled: enabled }),
  saveProvider: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:provider:save', input),
  removeProvider: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:provider:remove', id),
  saveModel: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:model:save', input),
  removeModel: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:model:remove', id),
  activateModel: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:model:activate', id),
  test: (input: unknown): Promise<string> => ipcRenderer.invoke('ai:test', input),
  saveRlcdProvider: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:rlcd:provider:save', input),
  removeRlcdProvider: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:rlcd:provider:remove', id),
  saveRlcdModel: (input: unknown): Promise<unknown> => ipcRenderer.invoke('ai:rlcd:model:save', input),
  removeRlcdModel: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:rlcd:model:remove', id),
  testRlcd: (input: unknown): Promise<string> => ipcRenderer.invoke('ai:rlcd:test', input),
  chatList: (): Promise<unknown> => ipcRenderer.invoke('ai:chat:list'),
  chatOpen: (id?: string): Promise<unknown> => ipcRenderer.invoke('ai:chat:open', id),
  chatNew: (tag?: unknown): Promise<unknown> => ipcRenderer.invoke('ai:chat:new', tag),
    chatRename: (id: string, title: string): Promise<unknown> => ipcRenderer.invoke('ai:chat:rename', id, title),
    chatRemove: (id: string): Promise<unknown> => ipcRenderer.invoke('ai:chat:remove', id),
    chatDraft: (id: string, text: string): Promise<void> => ipcRenderer.invoke('ai:chat:draft', id, text),
    chatContext: (id: string, scope: import('../shared/ai-scope').AiScope): Promise<unknown> => ipcRenderer.invoke('ai:chat:context', id, scope),
    ask: (sessionId: string, text: string, context?: { scope?: import('../shared/ai-scope').AiScope; pageScope?: import('../shared/ai-scope').AiScope; references?: import('../shared/ai-scope').AiScope[]; baziSystem?: 'bazi' | 'ziwei' | 'astro'; copySource?: import('../shared/todo-contracts').CopySource }): Promise<void> => ipcRenderer.invoke('ai:ask', sessionId, text, context),
  cancel: (): void => {
    ipcRenderer.send('ai:cancel');
  },
  apply: (token: string, indices: number[]): Promise<unknown> => ipcRenderer.invoke('ai:apply', token, indices),
  undo: (token: string): Promise<unknown> => ipcRenderer.invoke('ai:undo', token),
  discard: (token: string): Promise<unknown> => ipcRenderer.invoke('ai:discard', token),
  onAsk: onAsk,
  answerAsk: (input: { id: string; kind: 'option' | 'text' | 'skip'; value?: string }): void => {
    ipcRenderer.send('ai:answer', input);
  },
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

// 文案工坊:小红书心得草稿库(userData/copy-drafts.json);AI 建议走 ai 会话体系,应用后经 onChanged 刷新
// 素材采集:自媒体浏览器的「采集到素材」(索引 JSON + 截图 PNG 文件)
const mediaCapture = {
  list: (): Promise<unknown> => ipcRenderer.invoke('media-capture:list'),
  save: (input: unknown): Promise<unknown> => ipcRenderer.invoke('media-capture:save', input),
  remove: (id: string): Promise<unknown> => ipcRenderer.invoke('media-capture:remove', id),
  setNote: (id: string, note: string): Promise<unknown> => ipcRenderer.invoke('media-capture:setNote', id, note),
  onChanged: (callback: (items: unknown) => void): (() => void) => {
    const listener = (_event: unknown, items: unknown): void => callback(items);
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

const copy = {
  list: (): Promise<unknown> => ipcRenderer.invoke('copy:list'),
  save: (input: unknown): Promise<unknown> => ipcRenderer.invoke('copy:save', input),
  remove: (id: string): Promise<unknown> => ipcRenderer.invoke('copy:remove', id),
  markXhsPublished: (id: string, url: string): Promise<unknown> => ipcRenderer.invoke('copy:markXhsPublished', id, url),
  clearXhsPublished: (id: string): Promise<unknown> => ipcRenderer.invoke('copy:clearXhsPublished', id),
  onChanged: (callback: () => void): (() => void) => {
    const listener = (): void => callback();
    ipcRenderer.on('copy:changed', listener);
    return () => {
      ipcRenderer.off('copy:changed', listener);
    };
  },
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
  // 外链白名单在主进程校验(仅小红书创作者中心发布页)
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('app:openExternal', url),
};

const updater = {
  status: (): Promise<import('../shared/contracts').UpdateStatus> => ipcRenderer.invoke('updater:status'),
  check: (): Promise<void> => ipcRenderer.invoke('updater:check'),
  install: (): Promise<void> => ipcRenderer.invoke('updater:install'),
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
  pin: (): Promise<boolean> => ipcRenderer.invoke('float:pin'),
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
  float,
  bazi,
  copy,
  ai,
  browser,
  mediaCapture,
  office,
  settings,
  appInfo,
  updater,
  clipboard,
};

contextBridge.exposeInMainWorld('workbench', api);

export type WorkbenchApi = typeof api;
