import { draftSnapshotSchema, type BotBridge, type BotDraftValue, type BotSubmit, type DraftSnapshot } from '../shared/bot-contracts';

function readDraft(value: unknown): DraftSnapshot {
  const result = draftSnapshotSchema.safeParse(value);
  if (!result.success) throw Object.assign(new Error('后台返回的草稿格式不兼容，请更新或重启 Bot 后台。当前输入已保留。'), { code: 'HOST_VERSION_MISMATCH' });
  return result.data;
}

function draftValue({ text, replyToTaskId, resources, generatedPrompts }: BotDraftValue): BotDraftValue {
  return { text, replyToTaskId, resources, ...(generatedPrompts?.length && { generatedPrompts }) };
}

/** One controller per chat in this window, shared by parallel/floating layouts. */
export class BotDraftController {
  value: BotDraftValue = { text: '', replyToTaskId: null, resources: [] };
  snapshot?: DraftSnapshot;
  error = '';
  saving = false;
  sending = false;
  composing = false;
  private dirty = false;
  private generation = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private timer?: ReturnType<typeof setTimeout>;
  private unlisten: (() => void)[] = [];
  private pendingSubmit?: BotSubmit;
  readonly outgoing = new Map<string, { id: string; text: string; createdAt: string; resources: BotSubmit['resources']; messageId?: string }>();
  private active = false;
  private readonly listeners = new Set<() => void>();
  private lifecycle: Promise<unknown> = Promise.resolve();
  constructor(readonly chatId: string, private readonly api: BotBridge, private readonly changed: () => void = () => {}) {}
  get ready(): boolean { return !!this.snapshot; }
  get hasPendingSubmit(): boolean { return !!this.pendingSubmit; }
  get hasUnsavedInput(): boolean { return this.dirty; }
  attach(listener: () => void): () => void {
    this.listeners.add(listener);
    this.lifecycle = this.lifecycle.catch(() => {}).then(() => { if (this.listeners.size && !this.active) return this.start(); });
    return () => { this.listeners.delete(listener); setTimeout(() => { this.lifecycle = this.lifecycle.catch(() => {}).then(() => { if (!this.listeners.size && this.active) return this.stop(); }); }, 0); };
  }
  private notify(): void { this.changed(); for (const listener of this.listeners) listener(); }
  private apply(snapshot: DraftSnapshot): void {
    snapshot = readDraft(snapshot);
    this.snapshot = snapshot;
    if (!this.dirty) this.value = draftValue(snapshot);
    this.notify();
  }
  async start(): Promise<void> {
    this.active = true; ++this.generation;
    this.unlisten.push(this.api.onChanged(event => {
      if (!this.saving && !this.sending && (event.kind === 'host' || event.kind === 'draft' && event.chatId === this.chatId && event.draftSurface === this.snapshot?.surface)) void this.refresh();
    }));
    await this.refresh();
  }
  async refresh(): Promise<void> {
    const generation = this.generation;
    try {
      const pending = await this.api.getPendingSubmission?.(this.chatId);
      if (!this.active || generation !== this.generation) return;
      if (pending && !this.pendingSubmit) {
        this.pendingSubmit = pending.input;
        if (!this.dirty) { this.value = pending.localDraft ?? draftValue(pending.input); this.dirty = true; }
      }
      this.notify();
      const snapshot = await this.api.getDraft(this.chatId);
      if (!this.active || generation !== this.generation) return;
      this.apply(snapshot); this.error = ''; this.notify();
      if (this.pendingSubmit && !this.sending) { await this.submit(this.pendingSubmit.botId, this.pendingSubmit.pageContext); return; }
      if (this.dirty && !this.composing && !this.pendingSubmit) void this.flush().catch(() => {});
    } catch (error) { if (this.active) this.failed(error); }
  }
  edit(patch: Partial<BotDraftValue>): void {
    this.value = { ...this.value, ...patch };
    if (!this.value.text.trim()) delete this.value.generatedPrompts;
    this.dirty = true; this.error = ''; this.notify();
    clearTimeout(this.timer); if (!this.composing && !this.sending && !this.pendingSubmit) this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, 250);
    if (this.pendingSubmit) void this.api.retainPendingDraft?.(this.chatId, this.value).catch(error => this.failed(error));
  }
  composition(active: boolean): void {
    this.composing = active;
    if (!active && this.dirty && !this.sending) void this.flush().catch(() => {});
  }
  private failed(error: unknown): void {
    this.error = error instanceof Error ? error.message : '草稿保存失败，输入已保留'; this.notify();
  }
  flush(submitted?: BotDraftValue): Promise<void> {
    clearTimeout(this.timer);
    const job = this.tail.catch(() => {}).then(async () => {
      if (!this.dirty || this.composing || this.pendingSubmit) return;
      const value = submitted ?? structuredClone(this.value); this.saving = true; this.notify();
      try {
        const snapshot = this.snapshot ?? readDraft(await this.api.getDraft(this.chatId));
        const saved = readDraft(await this.api.saveDraft(this.chatId, snapshot.revision, value));
        this.snapshot = saved; this.dirty = JSON.stringify(this.value) !== JSON.stringify(value); this.error = '';
      } catch (error) { this.failed(error); throw error; }
      finally { this.saving = false; this.notify(); }
    });
    this.tail = job; return job;
  }
  async retrySave(): Promise<void> {
    if (this.pendingSubmit) return;
    try { this.apply(await this.api.getDraft(this.chatId)); await this.flush(); this.error = ''; this.notify(); }
    catch (error) { this.failed(error); }
  }
  async submit(botId: string, pageContext: BotSubmit['pageContext'], target?: BotSubmit['target']): Promise<void> {
    if (this.sending || this.composing || !this.pendingSubmit && !this.value.text.trim()) return;
    const submission = this.pendingSubmit ?? structuredClone(this.value);
    const requestId = this.pendingSubmit?.clientRequestId ?? crypto.randomUUID();
    if (!this.outgoing.has(requestId)) this.outgoing.set(requestId, { id: requestId, text: submission.text, createdAt: new Date().toISOString(), resources: structuredClone(submission.resources) });
    this.sending = true; this.error = ''; this.notify();
    try {
      if (!this.pendingSubmit) {
        await this.flush(submission);
        const snapshot = this.snapshot!;
        this.pendingSubmit = { botId, chatId: this.chatId, expectedDraftRevision: snapshot.revision, ...(snapshot.generatedPrompts?.length ? { generatedPrompts: structuredClone(snapshot.generatedPrompts) } : {}), clientRequestId: requestId, text: snapshot.text, replyToTaskId: snapshot.replyToTaskId, resources: structuredClone(snapshot.resources), pageContext, ...(target ? { target } : {}) };
      }
      const request = this.pendingSubmit;
      const result = await this.api.submit(request);
      const echo = this.outgoing.get(requestId);
      if (echo) echo.messageId = result.messageId;
      const typedWhileSending = JSON.stringify(this.value) !== JSON.stringify(draftValue(request));
      this.snapshot = readDraft(result.draft);
      if (!typedWhileSending) { this.value = draftValue(result.draft); this.dirty = false; }
      else this.dirty = true;
      this.pendingSubmit = undefined;
      try {
        if (this.dirty) await this.flush();
        await this.api.acknowledgeSubmission?.(this.chatId, request.clientRequestId);
      } catch (error) { this.pendingSubmit = request; throw Object.assign(new Error(error instanceof Error ? error.message : '发送状态待核对，输入已保留'), { code: 'SEND_ACK_PENDING' }); }
    } catch (error) {
      this.failed(error);
      // Transport failures keep the exact request id so checking a lost receipt cannot enqueue twice.
      if (!['HOST_DISCONNECTED', 'HOST_TIMEOUT', 'HOST_UNAVAILABLE', 'HOST_VERSION_MISMATCH', 'DATA_EPOCH_CHANGED', 'SEND_ACK_PENDING'].includes((error as { code?: string }).code ?? '')) this.pendingSubmit = undefined;
      if (!this.pendingSubmit) this.outgoing.delete(requestId);
      throw error;
    } finally { this.sending = false; this.notify(); }
    if (this.dirty) await this.flush();
  }
  async stop(): Promise<void> {
    this.active = false; ++this.generation; clearTimeout(this.timer); this.unlisten.splice(0).forEach(fn => fn());
    try { await this.flush(); }
    catch { /* Retain unsaved input in this controller for copying or retrying on reopening. */ }
    this.notify();
  }
}
