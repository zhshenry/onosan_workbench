import type { BotMessage } from '../shared/bot-contracts';

export type BotMessageLink = Pick<BotMessage, 'id' | 'fromBotId' | 'toBotId'>;
export type BotChatEvent = { message: BotMessageLink; incoming: boolean };
export type BotChatEventGroup = BotChatEvent & { count: number };
export type BotChatEventSlot = { id: string; events: readonly BotChatEvent[] };

export const chatEventPeer = ({ message, incoming }: BotChatEvent) => incoming ? message.fromBotId : message.toBotId;

export function groupBotChatEvents(timeline: readonly (BotChatEventSlot | null)[]) {
  const groups = new Map<string, BotChatEventGroup[]>();
  const seen = new Set<string>();
  let last: BotChatEventGroup | undefined;
  for (const slot of timeline) {
    if (!slot) { last = undefined; continue; }
    const rows: BotChatEventGroup[] = [];
    for (const event of slot.events) {
      if (seen.has(event.message.id)) continue;
      seen.add(event.message.id);
      if (last && chatEventPeer(last) === chatEventPeer(event)) last.count++;
      else { last = { ...event, count: 1 }; rows.push(last); }
    }
    groups.set(slot.id, rows);
  }
  return groups;
}
