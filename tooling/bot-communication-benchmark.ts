import { createServer } from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { AiStore } from '../electron/ai-store';
import { BotStore } from '../electron/bot-store';
import { runAgentLoop } from '../electron/ai-core';
import type { ChatSession } from '../shared/todo-contracts';

// Synthetic local-only benchmark. The 4 ms callback cadence is simulated, not a provider speed claim.
const output = process.argv[2]; if (!output) throw new Error('Provide an output JSON path');
const directory = mkdtempSync(join(tmpdir(), 'ono-bot-benchmark-'));
const ai = new AiStore(directory, { recover: false }); new BotStore(ai, directory);
const base: ChatSession = { id: randomUUID(), title: '固定100条历史', updatedAt: new Date().toISOString(), draft: '', entries: Array.from({ length: 100 }, (_, i) => ({ id: randomUUID(), role: i % 2 ? 'assistant' : 'user', content: '固定测试历史。'.repeat(60) })) };
const stats = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return { n: sorted.length, p50: sorted[Math.floor(sorted.length * .5)], p95: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * .95))] }; };
const sync: { beforeMs: number; afterMs: number; beforeBytes: number; afterBytes: number; beforeWrites: number; afterWrites: number }[] = [];
for (let sample = 0; sample < 30; sample++) {
  const chat = structuredClone(base); chat.id = randomUUID();
  const entry = { id: randomUUID(), role: 'assistant' as const, content: '', streaming: true }; chat.entries.push(entry);
  ai.saveChat(chat); let beforeBytes = 0, afterBytes = 0, afterWrites = 0;
  const start = performance.now();
  for (let i = 1; i <= 1000; i++) {
    entry.content += '文';
    // Reproduce the former save algorithm without the new event journal's extra writes.
    const persisted = structuredClone({ ...chat, updatedAt: new Date().toISOString() });
    ai.db.prepare('INSERT OR REPLACE INTO chats(id,payload) VALUES(?,?)').run(chat.id, JSON.stringify(persisted));
    beforeBytes += Buffer.byteLength(JSON.stringify(chat));
  }
  const beforeMs = performance.now() - start;
  entry.content = ''; ai.saveChat(chat); const next = performance.now();
  for (let i = 1; i <= 1000; i++) {
    entry.content += '文';
    if (i % 20 === 0 || i === 1000) { const delta = ai.saveBotEntry(chat.id, entry); afterWrites++; afterBytes += Buffer.byteLength(JSON.stringify(delta)); }
  }
  const afterMs = performance.now() - next;
  if (ai.chat(chat.id).entries.at(-1)?.content !== '文'.repeat(1000)) throw new Error('Final transcript differs');
  sync.push({ beforeMs, afterMs, beforeBytes, afterBytes, beforeWrites: 1000, afterWrites });
}
ai.close();
const server = createServer(async (req, res) => {
  for await (const _chunk of req) { /* discard synthetic prompt */ }
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  for (const [delta, finish_reason] of [[{ content: '本地固定回复' }, null], [{}, 'stop']]) res.write(`data: ${JSON.stringify({ id: 'benchmark', object: 'chat.completion.chunk', choices: [{ index: 0, delta, finish_reason }] })}\n\n`);
  res.end('data: [DONE]\n\n');
});
await new Promise<void>(done => server.listen(0, '127.0.0.1', done));
const cold: number[] = [], restored: number[] = [], firstText: number[] = [];
try {
  let path = '';
  for (let sample = 0; sample < 60; sample++) {
    const reopen = sample % 2 === 1;
    await runAgentLoop({ endpoint: `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`, model: 'fixed', protocol: 'openai-chat', key: '' }, '继续', base.entries.map(({ role, content }) => ({ role, content })), new AbortController().signal,
      { buildTools: () => [], toolNames: [], labels: {}, systemPrompt: () => '固定本地测量' }, undefined, undefined, undefined, undefined,
      { cwd: join(directory, 'runtime'), directory: join(directory, 'sessions'), path: reopen ? path : undefined, onSession: value => { path = value; }, measure: (stage, ms) => { if (stage === 'prepare') (reopen ? restored : cold).push(ms); if (stage === 'first_text') firstText.push(ms); } });
  }
} finally { server.closeAllConnections(); await new Promise<void>(done => server.close(() => done())); }
const mean = (field: keyof typeof sync[number]) => sync.reduce((sum, row) => sum + row[field], 0) / sync.length;
const report = {
  measuredAt: new Date().toISOString(), node: process.version, scope: 'synthetic local model; 100 history records; 1000 callbacks; 4ms logical cadence / 80ms batch', samples: 30,
  sync: { beforeMs: stats(sync.map(row => row.beforeMs)), afterMs: stats(sync.map(row => row.afterMs)), beforeWrites: 1000, afterWrites: 50, beforeBytes: mean('beforeBytes'), afterBytes: mean('afterBytes'), byteReduction: 1 - mean('afterBytes') / mean('beforeBytes'), writeReduction: .95 },
  preparationMs: { cold: stats(cold), fromPersistentSession: stats(restored) }, promptToFirstTextMs: stats(firstText),
  cacheDecision: 'Keep disposal after each run. These measurements compare fresh vs persisted reconstruction, not an idle-cache implementation or a real network model.',
  temporaryData: directory,
};
mkdirSync(resolve(output, '..'), { recursive: true }); writeFileSync(output, JSON.stringify(report, null, 2));
console.log(readFileSync(output, 'utf8'));
