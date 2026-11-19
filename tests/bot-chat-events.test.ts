import assert from 'node:assert/strict';
import test from 'node:test';
import { groupBotChatEvents, type BotChatEvent } from '../src/bot-chat-events';

function event(id: string, peer: string, incoming = false): BotChatEvent {
  return { incoming, message: { id, fromBotId: incoming ? peer : 'self', toBotId: incoming ? 'self' : peer } };
}

test('consecutive sends and receives to the same Bot share the first event slot', () => {
  const sent = event('sent', 'schedule');
  const received = event('received', 'schedule', true);
  const grouped = groupBotChatEvents([
    { id: 'after-first-entry', events: [sent] },
    { id: 'before-second-entry', events: [received, received] },
    { id: 'after-second-entry', events: [event('again', 'schedule')] },
    { id: 'before-third-entry', events: [event('result', 'schedule', true)] },
  ]);
  assert.deepEqual(grouped.get('after-first-entry'), [{ ...sent, count: 4 }]);
  assert.deepEqual([...grouped.values()].slice(1), [[], [], []]);
});

test('a visible output or a different Bot breaks the exchange group without changing event order', () => {
  const schedule = event('out', 'schedule'), result = event('reply', 'schedule', true);
  const other = event('other', 'office'), next = event('next', 'schedule');
  const grouped = groupBotChatEvents([
    { id: 'first', events: [schedule] },
    null,
    { id: 'next', events: [result, other, next] },
  ]);
  assert.deepEqual([...grouped.values()].flat(), [schedule, result, other, next].map(item => ({ ...item, count: 1 })));
});
