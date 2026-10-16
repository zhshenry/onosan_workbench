import assert from 'node:assert/strict';
import test from 'node:test';
import { tmpdir } from 'node:os';
import type { IPtyForkOptions } from 'node-pty';
import { GameTerminal } from '../electron/game-terminal';
import type { GameTerminalEvent } from '../shared/game-contracts';

function fixture() {
  const data = new Set<(text: string) => void>(), exits = new Set<(event: { exitCode: number }) => void>();
  const writes: string[] = [], sizes: number[][] = [], starts: { shell: string; args: string[]; options: IPtyForkOptions }[] = [];
  let killed = 0, cleared = 0;
  const pty = {
    pid: 12345,
    write: (text: string) => { writes.push(text); },
    resize: (cols: number, rows: number) => { sizes.push([cols, rows]); },
    clear: () => { cleared++; },
    onData: (fn: (text: string) => void) => { data.add(fn); return { dispose: () => { data.delete(fn); } }; },
    onExit: (fn: (event: { exitCode: number }) => void) => { exits.add(fn); return { dispose: () => { exits.delete(fn); } }; },
    kill: () => { killed++; for (const fn of [...exits]) fn({ exitCode: 0 }); exits.clear(); data.clear(); },
  };
  const terminal = new GameTerminal({ shell: process.execPath, spawn: (shell, args, options) => { starts.push({ shell, args, options }); return pty; } });
  return { terminal, starts, writes, sizes, killed: () => killed, cleared: () => cleared, data: (text: string) => { for (const fn of data) fn(text); }, exit: (code: number) => { for (const fn of [...exits]) fn({ exitCode: code }); exits.clear(); data.clear(); } };
}
const size = { cols: 120, rows: 12 };

test('one project terminal owns one shell, restores live output, and rejects stale session input', async t => {
  const f = fixture(); t.after(() => f.terminal.dispose());
  const [first, concurrent] = await Promise.all([f.terminal.open(tmpdir(), size), f.terminal.open(tmpdir(), size)]);
  assert.equal(first.phase, 'running'); assert.equal(first.id, concurrent.id); assert.equal(f.starts.length, 1);
  assert.deepEqual(f.starts[0].args, ['-NoLogo', '-NoProfile']);
  assert.equal(f.starts[0].options.env?.ELECTRON_RUN_AS_NODE, undefined);
  f.data('中文输出\r\nPS> ');
  const restored = await f.terminal.open(tmpdir(), size);
  assert.equal(restored.output, '中文输出\r\nPS> '); assert.equal(f.starts.length, 1);
  f.terminal.write(first.id, 'Write-Output test\r'); f.terminal.write(first.id, '\x03');
  assert.deepEqual(f.writes, ['Write-Output test\r', '\x03']);
  assert.throws(() => f.terminal.write('old-session', 'bad'), /会话已变化/);
  assert.throws(() => f.terminal.write(first.id, 'x'.repeat(65537)), /64KB/);
  f.terminal.resize(first.id, { cols: 80, rows: 8 });
  assert.deepEqual(f.sizes.at(-1), [80, 8]);
  assert.throws(() => f.terminal.resize(first.id, { cols: 0, rows: 8 }));
});

test('clear and output share monotonic sequence; terminal history stays bounded', async t => {
  const f = fixture(); t.after(() => f.terminal.dispose());
  const events: GameTerminalEvent[] = []; f.terminal.subscribe(event => events.push(event));
  const first = await f.terminal.open(tmpdir(), size);
  f.data('x'.repeat(600000)); assert.equal(f.terminal.snapshot().output.length, 500000);
  f.terminal.clear(first.id); f.data('new output');
  assert.equal(f.cleared(), 1);
  assert.equal(f.terminal.snapshot().output, 'new output');
  assert.deepEqual(events.filter(event => event.kind !== 'state').map(event => event.sequence), [1, 2, 3]);
});

test('natural exit preserves the transcript and reconnect creates a fresh session', async t => {
  const f = fixture(); t.after(() => f.terminal.dispose());
  const first = await f.terminal.open(tmpdir(), size); f.data('finished'); f.exit(7);
  assert.equal(f.terminal.snapshot().phase, 'exited'); assert.equal(f.terminal.snapshot().exitCode, 7);
  assert.match(f.terminal.snapshot().output, /finished/);
  assert.throws(() => f.terminal.write(first.id, 'command'), /未连接/);
  const next = await f.terminal.open(tmpdir(), size);
  assert.notEqual(first.id, next.id); assert.equal(next.output, '');
  assert.throws(() => f.terminal.clear(first.id), /会话已变化/);
  await f.terminal.close(next.id); assert.equal(f.killed(), 1); assert.equal(f.terminal.active, false);
});

test('unavailable project or native runtime produces a recoverable error without a shell', async () => {
  const terminal = new GameTerminal({ shell: process.execPath, spawn: () => { throw new Error('native runtime unavailable'); } });
  const missing = await terminal.open('Z:/ono-terminal-does-not-exist', size); assert.equal(missing.phase, 'error');
  const runtime = await terminal.open(tmpdir(), size); assert.equal(runtime.phase, 'error'); assert.match(runtime.message, /native runtime unavailable/);
  assert.equal(terminal.active, false); await terminal.dispose();
  assert.equal((await terminal.open(tmpdir(), size)).phase, 'error');
});
