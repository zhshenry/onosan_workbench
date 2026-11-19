import type { BotBridge, BotChatSnapshot, BotChatSync, BotChatUpdate, BotChatView } from '../shared/bot-contracts';

/** Keep the reader's window and the live updates on the same sequence. */
export class BotChatSynchronizer {
  private snapshot?: BotChatSnapshot;
  private request?: Promise<boolean>;
  private navigating = false;
  private refreshQueued = false;
  private readonly buffered = new Map<number, BotChatUpdate>();
  private live = true;

  constructor(private readonly chatId: string, private readonly api: Pick<BotBridge, 'syncChat'>,
    private readonly changed: (snapshot: BotChatSnapshot) => void, private readonly failed: (error: unknown) => void,
    private readonly followsLatest: () => boolean = () => true) {}

  start(opened: Promise<BotChatSnapshot>): Promise<boolean> {
    return this.requestSnapshot(opened);
  }

  receive(update: BotChatUpdate): void {
    if (!this.live || update.chatId !== this.chatId) return;
    const snapshot = this.snapshot;
    if (snapshot && update.epoch !== snapshot.epoch) { void this.refresh(); return; }
    if (snapshot && update.sequence <= snapshot.sequence) return;
    this.buffered.set(update.sequence, update);
    if (!this.request && !this.navigating) {
      this.drain(snapshot);
      if (this.buffered.size) void this.refresh();
    }
  }

  refresh(): Promise<boolean> {
    if (this.request || this.navigating) {
      this.refreshQueued = true;
      return this.request ?? Promise.resolve(false);
    }
    const snapshot = this.snapshot;
    const first = snapshot?.chat.entries[0];
    const range = !this.followsLatest() && first ? { kind: 'from' as const, entryId: first.id } : undefined;
    return this.requestSnapshot(this.api.syncChat(this.chatId, snapshot?.sequence, snapshot?.epoch, { range, collapsedAt: snapshot?.collapsedAt }));
  }

  async load(view: BotChatView, accept?: (snapshot: BotChatSnapshot) => boolean): Promise<boolean> {
    if (this.navigating) return false;
    this.navigating = true;
    try {
      if (this.request) await this.request;
      if (!this.live) return false;
      return await this.requestSnapshot(this.api.syncChat(this.chatId, undefined, this.snapshot?.epoch, view), accept);
    } finally {
      this.navigating = false;
      this.flushRefresh();
    }
  }

  private requestSnapshot(result: Promise<BotChatSync>, accept?: (snapshot: BotChatSnapshot) => boolean): Promise<boolean> {
    const previous = this.snapshot;
    this.request = result.then(next => {
      if (!this.live) return false;
      if (accept && (!('chat' in next) || !accept(next))) {
        this.drain(previous);
        if (this.buffered.size) this.refreshQueued = true;
        return false;
      }
      if ('chat' in next) {
        for (const [sequence, update] of this.buffered) {
          if (update.epoch !== next.epoch || sequence <= next.sequence) this.buffered.delete(sequence);
        }
        this.snapshot = next;
      } else {
        for (const update of next.updates) this.apply(update);
      }
      this.drain(previous);
      // An impossible future sequence must not cause repeated identical requests.
      if (this.buffered.size && (this.snapshot?.sequence !== previous?.sequence || this.snapshot?.epoch !== previous?.epoch)) this.refreshQueued = true;
      return true;
    }).catch(error => {
      if (this.live) this.failed(error);
      return false;
    }).finally(() => {
      this.request = undefined;
      this.flushRefresh();
    });
    return this.request;
  }

  private apply(update: BotChatUpdate): void {
    const snapshot = this.snapshot;
    if (!snapshot || update.epoch !== snapshot.epoch || update.sequence !== snapshot.sequence + 1) return;
    const { entry } = update;
    const window = snapshot.chat.entries.map(item => item.id === entry.id ? entry : item);
    const live = snapshot.liveEntries.filter(item => item.id !== entry.id);
    if (entry.streaming || entry.actionState === 'pending') live.push(entry);
    let toolReplyIds = snapshot.toolReplyIds;
    const hasTools = !!(entry.tools?.length || entry.browserTask || entry.proposal || ('copyProposal' in entry && entry.copyProposal));
    if (hasTools !== toolReplyIds.includes(entry.id)) toolReplyIds = hasTools ? [...toolReplyIds, entry.id] : toolReplyIds.filter(id => id !== entry.id);
    this.snapshot = {
      ...snapshot, sequence: update.sequence, liveEntries: live, toolReplyIds,
      latestUser: snapshot.latestUser?.id === entry.id ? { id: entry.id, content: entry.content } : snapshot.latestUser,
      chat: { ...snapshot.chat, updatedAt: update.updatedAt, entries: window },
    };
  }

  private drain(previous: BotChatSnapshot | undefined): void {
    for (const sequence of [...this.buffered.keys()].sort((a, b) => a - b)) {
      if (sequence > (this.snapshot?.sequence ?? 0) + 1) break;
      const update = this.buffered.get(sequence)!;
      this.buffered.delete(sequence);
      this.apply(update);
    }
    if (this.snapshot && this.snapshot !== previous) this.changed(this.snapshot);
  }

  private flushRefresh(): void {
    if (!this.live || this.navigating || this.request || !this.refreshQueued) return;
    this.refreshQueued = false;
    void this.refresh();
  }

  stop(): void { this.live = false; this.buffered.clear(); }
}
