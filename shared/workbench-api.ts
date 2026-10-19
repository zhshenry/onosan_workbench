import type { Task, Category, ChatSession, ChatSummary, AIProvider, AIModel, RlcdProvider, RlcdModel } from './todo-contracts';
import type { BaziStoreData } from './bazi-contracts';
import type { CopyStoreData } from './copy-contracts';
import type { MediaCaptureItem } from './media-capture-contracts';
import type { ReadingStoreData, BookCandidate, BookAggregate } from './reading-contracts';
import type { ProposalReceipt } from './todo-proposal';

export interface TodoState { tasks: Task[]; categories: Category[]; }

export interface AiConfig {
  aiEnabled: boolean; providers: AIProvider[]; models: AIModel[];
  activeModelId: string; hasConnection: boolean;
  rlcdProviders: RlcdProvider[]; rlcdModels: RlcdModel[]; activeRlcdModelId: string;
}

/** Shared preload/renderer contract; the main process validates mutation inputs. */
export interface WorkbenchApi {
  minimize(): void;
  maximizeToggle(): void;
  close(): void;
  onMaximized(callback: (maximized: boolean) => void): () => void;
  browser: import('./browser-contracts').BrowserBridge;
  game: import('./game-contracts').GameBridge;
  browserAutomation: import('./browser-automation-contracts').BrowserAutomationBridge;
  speech: import('./speech-contracts').SpeechBridge;
  office: {
    convert(
      filename: string,
      bytes: Uint8Array,
    ): Promise<import('./office-contracts').OfficeConvertResult>;
  };
  todo: {
    state(): Promise<TodoState>;
    info(): Promise<import('./contracts').TodoDbInfo>;
    create(input: unknown): Promise<TodoState>;
    update(id: string, patch: unknown, revision: string): Promise<TodoState>;
    remove(id: string, revision: string): Promise<TodoState>;
    snooze(id: string): Promise<TodoState>;
    restore(id: string): Promise<TodoState>;
    createCategory(input: unknown): Promise<TodoState>;
    updateCategory(id: string, input: unknown, revision: string): Promise<TodoState>;
    removeCategory(id: string, revision: string): Promise<TodoState>;
    review(): Promise<string>;
    onChanged(callback: () => void): () => void;
  };
  mediaCapture: {
    list(): Promise<MediaCaptureItem[]>;
    save(input: unknown): Promise<MediaCaptureItem[]>;
    remove(id: string): Promise<MediaCaptureItem[]>;
    setNote(id: string, note: string): Promise<MediaCaptureItem[]>;
    onChanged(callback: (items: MediaCaptureItem[]) => void): () => void;
    onFailed(callback: (message: string) => void): () => void;
  };
  reading: {
    list(): Promise<ReadingStoreData>;
    save(input: unknown): Promise<ReadingStoreData>;
    remove(id: string): Promise<ReadingStoreData>;
    setVault(vaultPath: string): Promise<ReadingStoreData>;
    scan(vaultPath: string): Promise<BookCandidate[]>;
    aggregate(folder: string): Promise<BookAggregate>;
    openObsidian(vault: string, rel?: string): Promise<void>;
  };
  bazi: {
    list(): Promise<BaziStoreData>;
    saveProfile(input: unknown): Promise<BaziStoreData>;
    removeProfile(id: string): Promise<BaziStoreData>;
    saveNote(id: string, text: string): Promise<BaziStoreData>;
  };
  copy: {
    list(): Promise<CopyStoreData>;
    save(input: unknown): Promise<CopyStoreData>;
    remove(id: string): Promise<CopyStoreData>;
    markXhsPublished(id: string, url: string): Promise<CopyStoreData>;
    clearXhsPublished(id: string): Promise<CopyStoreData>;
    onChanged(callback: () => void): () => void;
  };
  ai: {
    openLink(url: string): Promise<void>;
    config(): Promise<AiConfig>;
    setEnabled(enabled: boolean): Promise<AiConfig>;
    saveProvider(input: unknown): Promise<AiConfig>;
    removeProvider(id: string): Promise<AiConfig>;
    saveModel(input: unknown): Promise<AiConfig>;
    removeModel(id: string): Promise<AiConfig>;
    activateModel(id: string): Promise<AiConfig>;
    test(input: unknown): Promise<string>;
    saveRlcdProvider(input: unknown): Promise<AiConfig>;
    removeRlcdProvider(id: string): Promise<AiConfig>;
    saveRlcdModel(input: unknown): Promise<AiConfig>;
    removeRlcdModel(id: string): Promise<AiConfig>;
    testRlcd(input: unknown): Promise<string>;
    chatList(): Promise<ChatSummary[]>;
    chatOpen(id?: string): Promise<ChatSession>;
    chatNew(tag?: import('./ai-scope').AiScope): Promise<ChatSession>;
    chatRename(id: string, title: string): Promise<ChatSession>;
    chatRemove(id: string): Promise<ChatSession>;
    chatDraft(id: string, text: string): Promise<void>;
    chatContext(id: string, scope: import('./ai-scope').AiScope): Promise<ChatSession>;
    ask(sessionId: string, text: string, context?: import('./ai-reference').AiTurnContext): Promise<void>;
    cancel(sessionId: string): void;
    apply(token: string, indices: number[]): Promise<{ todoReceipt: ProposalReceipt } | null>;
    undo(token: string): Promise<null>;
    discard(token: string): Promise<null>;
    onChat(callback: (chat: ChatSession) => void): () => void;
    onAsk(callback: (ask: { id: string; sessionId: string; question: string; options: { label: string; description?: string }[] }) => void): () => void;
    answerAsk(input: { id: string; sessionId: string; kind: 'option' | 'text' | 'skip'; value?: string }): void;
  };
  float: {
    toggle(): Promise<boolean>;
    show(): Promise<void>;
    onVisibilityChanged(callback: (visible: boolean) => void): () => void;
    collapse(collapsed: boolean, animate: boolean): Promise<void>;
    tempHeight(height: number | null): void;
    resize(height: number): void;
    width(narrow?: boolean, animate?: boolean): Promise<number>;
    pin(): Promise<boolean>;
  };
  settings: {
    get(): Promise<import('./contracts').AppSettings | null>;
    patch(patch: import('./contracts').AppSettingsPatch): Promise<import('./contracts').AppSettings>;
  };
  appInfo: {
    about(): Promise<{
      name: string;
      version: string;
      electron: string;
      chrome: string;
      userDataPath: string;
      todoDbPath: string;
    }>;
    openUserDataDir(): Promise<void>;
    openTodoDir(): Promise<void>;
    openExternal(url: string): Promise<void>;
  };
  updater: {
    status(): Promise<import('./contracts').UpdateStatus>;
    check(): Promise<void>;
    install(): Promise<void>;
    notes(): Promise<void>;
    onStatus(callback: (status: import('./contracts').UpdateStatus) => void): () => void;
  };
  clipboard: {
    write(text: string): Promise<void>;
  };
}
