import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { AgentMessageStore, agentMessageUrl } from '../electron/agent-message-store';
import { AgentHooks } from '../electron/agent-hooks';
import { agentMessageVisible, agentPending, type AgentEvent } from '../shared/agent-message-contracts';

function fixture(t: any) {
  const dir = mkdtempSync(join(tmpdir(), 'ono-agent-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, store: new AgentMessageStore(dir, () => 2000), hooks: new AgentHooks(dir, join(dir, 'clients'), join(dir, 'clients', '.codex')) };
}
const event = (patch: Partial<AgentEvent> = {}): AgentEvent => ({ provider: 'codex', sessionId: 'session-1', turnId: 'turn-1', kind: 'reply', workspace: 'C:\\project', title: '修复已完成', detail: '', requestKey: '', occurredAt: 1000, ...patch });

test('Agent messages: Codex permission checks never imply user action or a completed conversation', t => {
  const f = fixture(t), approval = f.store.ingest(event({ kind: 'approval', requestKey: 'automatic-review' }))!;
  assert.equal(agentMessageVisible(approval), false);
  f.store.ingest(event({ kind: 'resolved', requestKey: 'automatic-review', occurredAt: 3000 }));
  assert.equal(agentMessageVisible(f.store.get(approval.id)), false);
  assert.equal(f.store.get(approval.id).readAt, null, 'filtering does not mark the underlying record read');
  const reply = f.store.ingest(event({ occurredAt: 4000 }))!;
  assert.equal(agentMessageVisible(reply), true);
  assert.equal(agentMessageVisible(f.store.ingest(event({ kind: 'failed', occurredAt: 5000 }))!), true);
});

test('Agent messages: close/restart never loses unread or pending state; reading is not resolving', t => {
  const f = fixture(t), approval = f.store.ingest(event({ kind: 'approval', requestKey: 'command-1' }))!;
  f.store.markRead(approval.id);
  const recovered = new AgentMessageStore(f.dir).get(approval.id);
  assert.equal(recovered.readAt, 2000); assert.equal(agentPending(recovered), true);
  assert.equal(f.store.ingest(event({ kind: 'approval', requestKey: 'command-1', occurredAt: 1100 })), null);
  f.store.ingest(event({ kind: 'resolved', requestKey: 'different-command', occurredAt: 3000 }));
  assert.equal(agentPending(f.store.get(approval.id)), true);
  f.store.ingest(event({ kind: 'resolved', requestKey: 'command-1', turnId: 'other-turn', occurredAt: 3000 }));
  assert.equal(agentPending(f.store.get(approval.id)), true);
  f.store.ingest(event({ kind: 'resolved', requestKey: 'command-1', occurredAt: 3000 }));
  assert.equal(agentPending(f.store.get(approval.id)), false); assert.equal(f.store.get(approval.id).readAt, 2000);
});

test('Agent messages: deduplicates client completion callbacks without making a read reply unread', t => {
  const f = fixture(t), message = f.store.ingest(event())!;
  f.store.markRead(message.id);
  assert.equal(f.store.ingest(event({ title: '有新回复', occurredAt: 3000 })), null);
  assert.equal(f.store.get(message.id).title, '修复已完成'); assert.equal(f.store.get(message.id).readAt, 2000);
  f.store.ingest(event({ turnId: 'next-turn', occurredAt: 4000 }));
  assert.equal(f.store.read().length, 2); assert.equal(f.store.read()[0].readAt, null);
});

test('Agent messages: bulk read persists once, preserves approvals, and skips new or updated messages', t => {
  const f = fixture(t), read = f.store.ingest(event({ turnId: 'already-read' }))!;
  f.store.markRead(read.id);
  const store = new AgentMessageStore(f.dir, () => 6000);
  const approval = store.ingest(event({ kind: 'approval', requestKey: 'pending' }))!;
  const reply = store.ingest(event({ provider: 'cursor', turnId: 'changing' }))!;
  const targets = [read, approval, reply].map(({ id, updatedAt }) => ({ id, updatedAt }));
  const late = store.ingest(event({ turnId: 'arrived-after-click', occurredAt: 3000 }))!;
  const updated = store.ingest(event({ provider: 'cursor', turnId: 'changing', kind: 'failed', occurredAt: 4000 }))!;
  assert.equal(updated.id, reply.id);
  assert.deepEqual(store.markReadAll(targets), [approval.id]);
  assert.equal(store.get(read.id).readAt, 2000);
  assert.equal(store.get(approval.id).readAt, 6000); assert.equal(agentPending(store.get(approval.id)), true);
  assert.equal(store.get(late.id).readAt, null); assert.equal(store.get(updated.id).readAt, null);
  const recovered = new AgentMessageStore(f.dir);
  assert.equal(recovered.read().length, 4); assert.equal(recovered.get(approval.id).readAt, 6000);
  assert.deepEqual(store.markReadAll(targets), []);
  assert.deepEqual(store.markReadAll([]), []);
});

test('Agent messages: failed bulk persistence leaves every message unread and keeps the old file', t => {
  const f = fixture(t);
  const first = f.store.ingest(event())!, second = f.store.ingest(event({ turnId: 'second' }))!;
  const saved = readFileSync(join(f.dir, 'agent-messages.json'), 'utf8');
  mkdirSync(join(f.dir, 'agent-messages.json.tmp'));
  assert.throws(() => f.store.markReadAll([first, second].map(({ id, updatedAt }) => ({ id, updatedAt }))));
  assert.equal(f.store.get(first.id).readAt, null); assert.equal(f.store.get(second.id).readAt, null);
  assert.equal(readFileSync(join(f.dir, 'agent-messages.json'), 'utf8'), saved);
});

test('Agent messages: failures supersede a turn reply; completion resolves only its own pending requests', t => {
  const f = fixture(t);
  const own = f.store.ingest(event({ kind: 'approval', requestKey: 'one' }))!;
  const other = f.store.ingest(event({ kind: 'approval', sessionId: 'session-2', requestKey: 'two' }))!;
  f.store.ingest(event({ occurredAt: 3000 }));
  assert.equal(agentPending(f.store.get(own.id)), false); assert.equal(agentPending(f.store.get(other.id)), true);
  f.store.ingest(event({ kind: 'failed', title: '运行失败', occurredAt: 4000 }));
  f.store.ingest(event({ kind: 'reply', title: '迟到的回复', occurredAt: 5000 }));
  assert.equal(f.store.read().filter(message => message.kind === 'failed').length, 1);
});

test('Agent messages: out-of-order resolution does not close a newer approval', t => {
  const f = fixture(t), approval = f.store.ingest(event({ kind: 'approval', requestKey: 'one', occurredAt: 5000 }))!;
  f.store.ingest(event({ kind: 'resolved', requestKey: 'one', occurredAt: 4000 }));
  assert.equal(agentPending(f.store.get(approval.id)), true);
});

test('Agent messages: corrupted/save-failed storage preserves the old file and in-memory unread state', t => {
  const f = fixture(t), message = f.store.ingest(event())!, saved = readFileSync(join(f.dir, 'agent-messages.json'), 'utf8');
  mkdirSync(join(f.dir, 'agent-messages.json.tmp'));
  assert.throws(() => f.store.markRead(message.id));
  assert.equal(f.store.get(message.id).readAt, null); assert.equal(readFileSync(join(f.dir, 'agent-messages.json'), 'utf8'), saved);
  writeFileSync(join(f.dir, 'agent-messages.json'), '{broken');
  const broken = new AgentMessageStore(f.dir); assert.ok(broken.loadError);
  assert.throws(() => broken.ingest(event())); assert.equal(readFileSync(join(f.dir, 'agent-messages.json'), 'utf8'), '{broken');
});

test('Agent messages: only generated client destinations are accepted, including Unicode/space project paths', t => {
  const f = fixture(t), codex = f.store.ingest(event())!;
  assert.equal(agentMessageUrl(codex), 'codex://threads/session-1');
  const cursor = f.store.ingest(event({ provider: 'cursor', workspace: 'C:\\项目 空格\\app#1' }))!;
  const url = new URL(agentMessageUrl(cursor)); assert.equal(url.protocol, 'cursor:'); assert.equal(decodeURIComponent(url.pathname), '/C:/项目 空格/app#1');
  const missing = f.store.ingest(event({ provider: 'cursor', turnId: 'other', workspace: 'https://evil.example' }))!;
  assert.equal(missing.workspace, ''); assert.throws(() => agentMessageUrl(missing), /项目路径/);
  assert.throws(() => f.store.ingest({ ...event(), url: 'https://evil.example' }));
});

test('Agent hooks: merges and disconnects only owned commands, keeps backup and unrelated hooks', t => {
  const f = fixture(t), directory = join(f.dir, 'clients', '.codex'); mkdirSync(directory, { recursive: true });
  const original = { description: 'user hooks', hooks: { Stop: [{ matcher: 'keep', hooks: [{ type: 'command', command: 'original-stop' }] }], SessionStart: [{ hooks: [{ command: 'keep-session' }] }] } };
  writeFileSync(join(directory, 'hooks.json'), JSON.stringify(original));
  assert.equal(f.hooks.connect('codex', true)[0].connected, true); f.hooks.connect('codex', true);
  const connected = JSON.parse(readFileSync(join(directory, 'hooks.json'), 'utf8'));
  assert.equal(connected.hooks.Stop.length, 2); assert.deepEqual(connected.hooks.Stop[0], original.hooks.Stop[0]);
  assert.ok(readdirSync(directory).some(name => name.includes('.ono-backup-')));
  assert.equal(f.hooks.connect('codex', false)[0].connected, false);
  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'hooks.json'), 'utf8')), original);
  assert.equal(f.hooks.connect('cursor', true)[1].connected, true);
  const cursor = JSON.parse(readFileSync(join(f.dir, 'clients', '.cursor', 'hooks.json'), 'utf8'));
  assert.equal(cursor.version, 1); assert.deepEqual(Object.keys(cursor.hooks).sort(), ['afterAgentResponse', 'stop']);
  assert.equal(cursor.hooks.beforeShellExecution, undefined, 'never pretends every shell invocation is waiting for approval');
});

test('Agent hooks: malformed client config is never overwritten', t => {
  const f = fixture(t), directory = join(f.dir, 'clients', '.cursor'); mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, 'hooks.json'), '{malformed');
  assert.throws(() => f.hooks.connect('cursor', true), /未覆盖/);
  assert.equal(readFileSync(join(directory, 'hooks.json'), 'utf8'), '{malformed');
  assert.equal(f.hooks.status()[1].connected, false); assert.ok(f.hooks.status()[1].error);
});

test('Agent hooks: durable inbox recovers while workbench was closed; malformed files cannot block valid events', t => {
  const f = fixture(t); mkdirSync(f.hooks.inbox, { recursive: true });
  writeFileSync(join(f.hooks.inbox, '1000-aa.json'), '{bad');
  writeFileSync(join(f.hooks.inbox, '1001-bb.json'), JSON.stringify(event()));
  const result = f.hooks.poll(); assert.equal(result.alerts.length, 1); assert.equal(result.changed, true); assert.ok(result.error);
  assert.equal(existsSync(join(f.hooks.inbox, '1000-aa.json.invalid')), true);
  assert.equal(existsSync(join(f.hooks.inbox, '1001-bb.json')), false);
  assert.equal(new AgentMessageStore(f.dir).read()[0].readAt, null);
  assert.equal(f.hooks.poll().alerts.length, 0);
});

test('Agent hooks: real Windows relay forwards only allowed fields and never returns approval decisions', { skip: process.platform !== 'win32' }, t => {
  const f = fixture(t); f.hooks.connect('codex', true); f.hooks.connect('cursor', true);
  const relay = (provider: string, input: unknown) => execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', join(f.dir, 'agent-hooks', 'ono-message-relay.ps1'), '-Provider', provider], { input: JSON.stringify(input), encoding: 'utf8', windowsHide: true });
  const base = { session_id: 'session-1', turn_id: 'turn-1', cwd: 'C:\\项目', tool_name: 'Bash', tool_input: { command: 'secret-command', description: '执行验证' }, private_token: 'NEVER-SAVE', transcript_path: 'private-transcript' };
  assert.equal(relay('codex', { ...base, hook_event_name: 'PermissionRequest' }).trim(), '{}');
  assert.equal(f.hooks.poll().alerts.length, 0); assert.deepEqual(f.hooks.messages.read(), []);
  const pending = f.hooks.messages.ingest(event({ kind: 'approval', requestKey: 'legacy-request' }))!;
  assert.equal(relay('codex', { ...base, hook_event_name: 'PostToolUse' }).trim(), '{}');
  assert.equal(f.hooks.poll().alerts.length, 0);
  assert.equal(agentPending(f.hooks.messages.get(pending.id)), true, 'unrelated legacy requests are not resolved');
  assert.equal(relay('codex', { ...base, hook_event_name: 'Stop', last_assistant_message: '验证完成\n后续正文不保存' }).trim(), '{}');
  f.hooks.poll();
  assert.equal(agentPending(f.hooks.messages.get(pending.id)), false, 'a final response still resolves legacy requests');
  assert.equal(relay('cursor', { hook_event_name: 'afterAgentResponse', conversation_id: 'cursor-1', generation_id: 'generation-1', workspace_roots: ['C:\\网站项目'], text: '首页已完成', private_token: 'NEVER-SAVE' }).trim(), '{}');
  f.hooks.poll();
  const saved = readFileSync(join(f.dir, 'agent-messages.json'), 'utf8');
  assert.match(saved, /验证完成/); assert.match(saved, /首页已完成/);
  assert.doesNotMatch(saved, /secret-command|NEVER-SAVE|private-transcript|后续正文/);
});
