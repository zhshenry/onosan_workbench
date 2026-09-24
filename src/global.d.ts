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
        enhance(draftId: string, mode: 'humanize' | 'polish' | 'titles'): Promise<unknown>;
        cancel(): Promise<void>;
      };
      ai: {
        config(): Promise<unknown>;
        pending(): Promise<import('../shared/contracts').AiPendingProposal[]>;
        setEnabled(enabled: boolean): Promise<unknown>;
        saveProvider(input: unknown): Promise<unknown>;
        removeProvider(id: string): Promise<unknown>;
        saveModel(input: unknown): Promise<unknown>;
        removeModel(id: string): Promise<unknown>;
        activateModel(id: string): Promise<unknown>;
        test(input: unknown): Promise<string>;
        chatList(): Promise<unknown>;
        chatOpen(id?: string): Promise<unknown>;
        chatNew(): Promise<unknown>;
        chatRemove(id: string): Promise<unknown>;
        chatDraft(id: string, text: string): Promise<void>;
        ask(sessionId: string, text: string): Promise<void>;
        cancel(): void;
        apply(token: string, indices: number[]): Promise<unknown>;
        discard(token: string): Promise<unknown>;
        onChat(callback: (chat: unknown) => void): () => void;
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
      };
    };
  }
}

export {};
