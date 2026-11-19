import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { botChatPageSize, type BotChatSnapshot, type BotChatView } from '../shared/bot-contracts';
import type { BotChatSynchronizer } from './bot-chat-sync';

type ReadingAnchor = { id: string; offset: number };
type ReadingPosition = { firstId?: string; anchor?: ReadingAnchor; follow: boolean };
const positions = new Map<string, ReadingPosition>();

function readingOffset(scroll: HTMLElement, viewport: DOMRect, row: Element) {
  // Convert the visual distance back to scroll pixels during the mode morph.
  return (row.getBoundingClientRect().top - viewport.top) * scroll.offsetHeight / viewport.height;
}

export function useBotChatHistory(chatId: string, island: boolean, floating: boolean, visible: boolean, layout: unknown) {
  const key = `bot-chat-history:${island ? 'island' : 'main'}:${chatId}`;
  const scroll = useRef<HTMLDivElement>(null);
  const sync = useRef<BotChatSynchronizer | null>(null);
  const [snapshot, setSnapshot] = useState<BotChatSnapshot>();
  const [aboveBottom, setAboveBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);
  const anchor = useRef<ReadingAnchor | undefined>(floating ? undefined : positions.get(key)?.anchor);
  const focusAfterLoad = useRef<string | undefined>(undefined);
  const following = useRef(floating || (positions.get(key)?.follow ?? true));
  const lastScrollTop = useRef(0);
  const lastFloating = useRef(floating);

  const initialView = (compact: boolean): BotChatView => {
    const saved = positions.get(key);
    return {
      range: !compact && saved?.firstId && !saved.follow ? { kind: 'from', entryId: saved.firstId } : undefined,
      collapsedAt: window.localStorage.getItem(key) ?? undefined,
    };
  };
  const restoreScroll = useCallback(() => {
    const node = scroll.current;
    if (!node || !node.clientHeight || !visible) return;
    if (following.current) node.scrollTop = node.scrollHeight;
    else if (anchor.current) {
      const row = node.querySelector<HTMLElement>(`[data-chat-entry-id="${CSS.escape(anchor.current.id)}"]`);
      if (row) node.scrollTop += readingOffset(node, node.getBoundingClientRect(), row) - anchor.current.offset;
    }
    lastScrollTop.current = node.scrollTop;
  }, [visible]);
  const remember = () => {
    const node = scroll.current;
    if (floating || !node?.clientHeight || !snapshot) return;
    if (following.current) {
      anchor.current = undefined;
      positions.set(key, { follow: true });
      return;
    }
    const viewport = node.getBoundingClientRect();
    const row = [...node.querySelectorAll<HTMLElement>(':scope > [data-chat-entry-id]')].find(item => {
      const rect = item.getBoundingClientRect();
      return rect.bottom > viewport.top && rect.top < viewport.bottom;
    });
    anchor.current = row ? { id: row.dataset.chatEntryId!, offset: readingOffset(node, viewport, row) } : undefined;
    positions.set(key, { follow: false, firstId: snapshot.chat.entries[0]?.id, anchor: anchor.current });
  };
  useLayoutEffect(() => {
    if (!snapshot || !visible || lastFloating.current !== floating) return;
    restoreScroll();
    if (focusAfterLoad.current) {
      const node = scroll.current;
      const row = node?.querySelector<HTMLElement>(`[data-chat-entry-id="${CSS.escape(focusAfterLoad.current)}"]`);
      (row ?? node)?.focus({ preventScroll: true });
      focusAfterLoad.current = undefined;
    }
    const node = scroll.current;
    setAboveBottom(!!snapshot.hasLater || !!node && node.scrollHeight - node.scrollTop - node.clientHeight > 64);
    remember();
  }, [snapshot, restoreScroll, visible, floating, layout]);

  const load = async (view: BotChatView, accept?: (value: BotChatSnapshot) => boolean): Promise<boolean> => {
    if (loadingRef.current || !sync.current) return false;
    loadingRef.current = true;
    setLoading(true);
    try { return await sync.current.load(view, accept); }
    finally { loadingRef.current = false; setLoading(false); }
  };
  useEffect(() => {
    if (lastFloating.current === floating) return;
    lastFloating.current = floating;
    const saved = positions.get(key);
    following.current = floating || (saved?.follow ?? true);
    anchor.current = floating ? undefined : saved?.anchor;
    void load(initialView(floating));
  }, [floating]);

  const collapsedAt = snapshot?.collapsedAt;
  const turnPage = async (kind: 'older' | 'newer', keyboard = false) => {
    if (!snapshot || !visible || floating || loadingRef.current || !(kind === 'older' ? snapshot.hasEarlier : snapshot.hasLater)) return;
    const entry = kind === 'older' ? snapshot.chat.entries[0] : snapshot.chat.entries.at(-1);
    if (!entry) return;
    following.current = false;
    remember();
    if (keyboard) scroll.current?.focus({ preventScroll: true });
    await load({ range: { kind, entryId: entry.id }, collapsedAt });
  };
  const onScroll = () => {
    const node = scroll.current;
    if (!visible || !node?.clientHeight || !snapshot) return;
    const top = node.scrollTop, previous = lastScrollTop.current;
    lastScrollTop.current = top;
    if (top === previous) return;
    const bottom = node.scrollHeight - top - node.clientHeight;
    following.current = !snapshot.hasLater && bottom <= 64;
    setAboveBottom(!following.current);
    remember();
    if (top < previous && top < 80) void turnPage('older');
    if (top > previous && bottom < 80) void turnPage('newer');
  };
  const latest = async () => {
    const previous = following.current;
    following.current = true;
    if (snapshot && (snapshot.hasLater || snapshot.chat.entries.length > botChatPageSize) && !await load({ collapsedAt })) { following.current = previous; return; }
    anchor.current = undefined;
    setAboveBottom(false);
    positions.set(key, { follow: true });
    restoreScroll();
  };
  const collapseHistory = async () => {
    if (!snapshot?.lastEntryId || loadingRef.current) return;
    const entryId = snapshot.lastEntryId;
    const previous = following.current;
    following.current = true;
    if (await load({ collapsedAt: entryId })) window.localStorage.setItem(key, entryId);
    else following.current = previous;
  };
  const revealHistory = async () => {
    if (!collapsedAt || loadingRef.current) return;
    const previous = following.current;
    following.current = floating;
    anchor.current = floating ? undefined : { id: collapsedAt, offset: 16 };
    focusAfterLoad.current = floating ? undefined : collapsedAt;
    if (await load(floating ? {} : { range: { kind: 'newer', entryId: collapsedAt } })) window.localStorage.removeItem(key);
    else { following.current = previous; focusAfterLoad.current = undefined; }
  };

  const findEntry = (entryId: string, signal: AbortSignal) => {
    const contains = (value: BotChatSnapshot) => !signal.aborted && value.chat.entries.some(entry => entry.id === entryId);
    if (snapshot && contains(snapshot)) return Promise.resolve(true);
    // Index navigation can visit a folded message without changing the saved cutoff.
    return load({ range: { kind: 'older', entryId } }, contains);
  };
  const scrollToEntry = (entryId: string) => {
    const node = scroll.current;
    const row = node?.querySelector<HTMLElement>(`[data-chat-entry-id="${CSS.escape(entryId)}"]`);
    if (!node || !row) return undefined;
    following.current = false;
    anchor.current = { id: entryId, offset: Math.max(12, parseFloat(getComputedStyle(node).scrollPaddingTop) || 0) };
    restoreScroll();
    setAboveBottom(!!snapshot?.hasLater || node.scrollHeight - node.scrollTop - node.clientHeight > 64);
    remember();
    return row;
  };

  return { snapshot, setSnapshot, sync, scroll, following, aboveBottom, loading, initialView, restoreScroll, rememberScroll: remember, onScroll, turnPage, latest, collapseHistory, revealHistory, findEntry, scrollToEntry };
}
