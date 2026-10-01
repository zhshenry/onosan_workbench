declare global {
  interface Window {
    workbench: {
      minimize(): void;
      maximizeToggle(): void;
      close(): void;
      onMaximized(callback: (maximized: boolean) => void): () => void;
      browser: import('../shared/browser-contracts').BrowserBridge;
      office: {
        convert(
          filename: string,
          bytes: Uint8Array,
        ): Promise<import('../shared/office-contracts').OfficeConvertResult>;
      };
      todo: {
        state(): Promise<unknown>;
        info(): Promise<import('../shared/contracts').TodoDbInfo>;
        create(input: unknown): Promise<unknown>;
        update(id: string, patch: unknown, revision: string): Promise<unknown>;
        remove(id: string, revision: string): Promise<unknown>;
        snooze(id: string): Promise<unknown>;
        restore(id: string): Promise<unknown>;
        createCategory(input: unknown): Promise<unknown>;
        updateCategory(id: string, input: unknown, revision: string): Promise<unknown>;
        removeCategory(id: string, revision: string): Promise<unknown>;
        review(): Promise<string>;
        onChanged(callback: () => void): () => void;
      };
      mediaCapture: {
        list(): Promise<unknown>;
        save(input: unknown): Promise<unknown>;
        remove(id: string): Promise<unknown>;
        setNote(id: string, note: string): Promise<unknown>;
        onChanged(callback: (items: unknown) => void): () => void;
        onFailed(callback: (message: string) => void): () => void;
      };
      bazi: {
        list(): Promise<unknown>;
        saveProfile(input: unknown): Promise<unknown>;
        removeProfile(id: string): Promise<unknown>;
        saveNote(id: string, text: string): Promise<unknown>;
      };
      copy: {
        list(): Promise<unknown>;
        save(input: unknown): Promise<unknown>;
        remove(id: string): Promise<unknown>;
        markXhsPublished(id: string, url: string): Promise<unknown>;
        clearXhsPublished(id: string): Promise<unknown>;
        onChanged(callback: () => void): () => void;
      };
      ai: {
        openLink(url: string): Promise<void>;
        config(): Promise<unknown>;
        setEnabled(enabled: boolean): Promise<unknown>;
        saveProvider(input: unknown): Promise<unknown>;
        removeProvider(id: string): Promise<unknown>;
        saveModel(input: unknown): Promise<unknown>;
        removeModel(id: string): Promise<unknown>;
        activateModel(id: string): Promise<unknown>;
        test(input: unknown): Promise<string>;
        saveRlcdProvider(input: unknown): Promise<unknown>;
        removeRlcdProvider(id: string): Promise<unknown>;
        saveRlcdModel(input: unknown): Promise<unknown>;
        removeRlcdModel(id: string): Promise<unknown>;
        testRlcd(input: unknown): Promise<string>;
        chatList(): Promise<unknown>;
        chatOpen(id?: string): Promise<unknown>;
        chatNew(tag?: import('../shared/ai-scope').AiScope): Promise<unknown>;
        chatRename(id: string, title: string): Promise<unknown>;
        chatRemove(id: string): Promise<unknown>;
        chatDraft(id: string, text: string): Promise<void>;
        chatContext(id: string, scope: import('../shared/ai-scope').AiScope): Promise<unknown>;
        ask(sessionId: string, text: string, context?: { scope?: import('../shared/ai-scope').AiScope; pageScope?: import('../shared/ai-scope').AiScope; references?: import('../shared/ai-scope').AiScope[]; baziSystem?: 'bazi' | 'ziwei' | 'astro'; copySource?: import('../shared/todo-contracts').CopySource }): Promise<void>;
        cancel(): void;
        apply(token: string, indices: number[]): Promise<unknown>;
        undo(token: string): Promise<unknown>;
        discard(token: string): Promise<unknown>;
        onChat(callback: (chat: unknown) => void): () => void;
        onAsk(callback: (ask: { id: string; question: string; options: { label: string; description?: string }[] }) => void): () => void;
        answerAsk(input: { id: string; kind: 'option' | 'text' | 'skip'; value?: string }): void;
      };
      float: {
        toggle(): Promise<boolean>;
        show(): Promise<void>;
        onVisibilityChanged(callback: (visible: boolean) => void): () => void;
        collapse(collapsed: boolean, animate: boolean): Promise<void>;
        tempHeight(height: number | null): void;
        resize(height: number): void;
        pin(): Promise<boolean>;
      };
      settings: {
        get(): Promise<import('../shared/contracts').AppSettings | null>;
        patch(patch: import('../shared/contracts').AppSettingsPatch): Promise<import('../shared/contracts').AppSettings>;
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
        status(): Promise<import('../shared/contracts').UpdateStatus>;
        check(): Promise<void>;
        install(): Promise<void>;
        onStatus(callback: (status: import('../shared/contracts').UpdateStatus) => void): () => void;
      };
      clipboard: {
        write(text: string): Promise<void>;
      };
    };
  }
}

export {};
