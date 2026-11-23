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
  const positioned = useRef<HTMLDivElement | null>(null);
  const followFrame = useRef<number | undefined>(undefined);

  const stopFollowMotion = useCallback(() => {
    if (followFrame.current !== undefined) cancelAnimationFrame(followFrame.current);
    followFrame.current = undefined;
  }, []);

  useLayoutEffect(() => () => {
    stopFollowMotion();
    positioned.current = null;
  }, [key, floating, visible, stopFollowMotion]);

  const initialView = (compact: boolean): BotChatView => {
    const saved = positions.get(key);
    return {
      range: !compact && saved?.firstId && !saved.follow ? { kind: 'from', entryId: saved.firstId } : undefined,
      collapsedAt: window.localStorage.getItem(key) ?? undefined,
    };
  };
  const restoreScroll = useCallback(() => {
    stopFollowMotion();
    const node = scroll.current;
    if (!node || !node.clientHeight || !visible) return;
    if (following.current) node.scrollTop = node.scrollHeight;
    else if (anchor.current) {
      const row = node.querySelector<HTMLElement>(`[data-chat-entry-id="${CSS.escape(anchor.current.id)}"]`);
      if (row) node.scrollTop += readingOffset(node, node.getBoundingClientRect(), row) - anchor.current.offset;
    }
    lastScrollTop.current = node.scrollTop;
  }, [visible, stopFollowMotion]);
  const followContent = useCallback(() => {
    const node = scroll.current;
    if (!visible || !node?.clientHeight) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!following.current || motion.matches) { restoreScroll(); return; }
    if (followFrame.current !== undefined) return;
    if (node.scrollHeight - node.clientHeight - node.scrollTop <= 1) { restoreScroll(); return; }

    let frameTime = performance.now();
    const follow = (now: number) => {
      followFrame.current = undefined;
      if (node !== scroll.current || !node.clientHeight || !following.current) return;
      const top = node.scrollTop, distance = node.scrollHeight - node.clientHeight - top;
      if (distance <= 1 || motion.matches) { restoreScroll(); return; }
      // Let the user's scroll event take over if they moved up before this frame.
      if (top < lastScrollTop.current) return;
      const elapsed = Math.min(32, now - frameTime);
      node.scrollTop = top + Math.min(distance, Math.max(1, distance * (1 - Math.exp(-elapsed / 48))));
      frameTime = now;
      lastScrollTop.current = node.scrollTop;
      followFrame.current = requestAnimationFrame(follow);
    };
    followFrame.current = requestAnimationFrame(follow);
  }, [restoreScroll, visible]);
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
    const node = scroll.current;
    if (!snapshot || !visible || lastFloating.current !== floating || !node?.clientHeight) return;
    if (positioned.current === node && !loadingRef.current && !focusAfterLoad.current) followContent();
    else restoreScroll();
    positioned.current = node;
    if (focusAfterLoad.current) {
      const row = node.querySelector<HTMLElement>(`[data-chat-entry-id="${CSS.escape(focusAfterLoad.current)}"]`);
      (row ?? node).focus({ preventScroll: true });
      focusAfterLoad.current = undefined;
    }
    setAboveBottom(!!snapshot.hasLater || !following.current && node.scrollHeight - node.scrollTop - node.clientHeight > 1);
    remember();
  }, [snapshot, restoreScroll, followContent, visible, floating, layout]);

  const load = async (view: BotChatView): Promise<boolean> => {
    if (loadingRef.current || !sync.current) return false;
    loadingRef.current = true;
    setLoading(true);
    try { return await sync.current.load(view); }
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
    stopFollowMotion();
    const bottom = node.scrollHeight - top - node.clientHeight;
    following.current = !snapshot.hasLater && (bottom <= 1 || top > previous && bottom <= 64);
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

  return { snapshot, setSnapshot, sync, scroll, following, aboveBottom, loading, initialView, restoreScroll, followContent, rememberScroll: remember, onScroll, turnPage, latest, collapseHistory, revealHistory };
}
