import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { POLICY, REPOSITORY, hash, readPolicy, targetKey, approvalCommand, sourceDigest, checkApproval,
  MemoryStore, SimulatedExecutor, WorkflowCore } from '../tooling/ono/core.mjs';
import { decodePng, embeddedImages, checkDesign, visualBinding, checkAcceptance, checkTaskEvidence } from '../tooling/ono/evidence.mjs';

const NOW = Date.parse('2026-10-08T02:00:00Z');
const content = readFileSync(new URL('../docs/ONO-ISSUE-WORKFLOW.md', import.meta.url), 'utf8');
const policyRead = async () => ({ ...POLICY, content, conflicts: [] });
const target = () => ({ repository: REPOSITORY, issue: 3, kind: 'plan', planVersion: 'v1', planDigest: hash('fixture plan') });
function source(t = target()) {
  const path = t.kind === 'merge' ? `pull/${t.pr}` : `issues/${t.issue}`;
  return { id: '123', repository: REPOSITORY, thread: t.kind === 'merge' ? `pr:${t.pr}` : `issue:${t.issue}`,
    url: `https://github.com/${REPOSITORY}/${path}#issuecomment-123`, author: 'same-account', active: true,
    createdAt: '2026-10-08T01:00:00Z', updatedAt: '2026-10-08T01:00:00Z', body: approvalCommand(t) };
}
// TEST-ONLY independent attestation list, never a production author-name heuristic.
function attest(s, t) {
  const expected = sourceDigest(s), key = targetKey(t);
  return async proof => proof.sourceDigest === expected && proof.targetKey === key;
}
function fixture(t = target()) {
  const state = { revision: 1, open: true, stage: ({ plan: 'awaiting-plan', merge: 'awaiting-merge', release: 'awaiting-release' })[t.kind], target: t };
  const store = new MemoryStore(); store.transaction(s => { s.tasks[t.issue] = state; });
  let now = NOW;
  const executor = new SimulatedExecutor(), approval = source(t);
  const options = { store, executor, read: policyRead, readApproval: async () => approval,
    verifyHuman: attest(approval, t), validateEvidence: async task => ({ valid: true, targetKey: targetKey(task.target) }), clock: () => now };
  const core = new WorkflowCore(options), lease = store.acquire('worker', now, 1000);
  return { state, store, executor, approval, options, core, lease, request: { id: 'operation1', revision: 1, target: t, sourceId: '123' }, advance: n => { now += n; }, now: () => now };
}

test('fixed repository policy is reread, CRLF-normalized, and rejects missing/ref/hash/conflict/unresolved inputs', async () => {
  assert.equal(await readPolicy(policyRead), POLICY);
  assert.equal(await readPolicy(async () => ({ ...await policyRead(), content: content.replace(/\r?\n/g, '\r\n') })), POLICY);
  for (const patch of [null, { commit: 'a'.repeat(40) }, { repository: 'other/repo' }, { content: content + '\n' },
    { content: '<<<<<<< ours\n' + content }, { conflicts: ['instructions conflict'] }, { conflicts: undefined }]) {
    await assert.rejects(readPolicy(async () => patch === null ? null : ({ ...await policyRead(), ...patch })));
  }
  await assert.rejects(readPolicy(async () => { throw new Error('unreadable'); }), /unreadable/);
});

test('all three approvals have explicit distinct targets and no default human trust', async () => {
  for (const t of [target(), { ...target(), kind: 'merge', pr: 4, sha: 'a'.repeat(40) },
    { ...target(), kind: 'release', pr: 4, sha: 'b'.repeat(40), version: '0.2.0', changeSetDigest: hash('PRs 4,5') }]) {
    const s = source(t);
    await assert.rejects(checkApproval(s, t, [], undefined, NOW), /HUMAN_PROVENANCE/);
    assert.equal((await checkApproval(s, t, [], attest(s, t), NOW)).targetKey, targetKey(t));
  }
});
for (const [name, change] of Object.entries({
  'self comment': s => s.id = '999', '[OnO]': s => s.body = '[OnO] ' + s.body,
  'quote': s => s.body = '> ' + s.body, 'code fence': s => s.body = '```\n' + s.body + '\n```',
  'inline example': s => s.body = '`' + s.body + '`', 'prose example': s => s.body = '示例：' + s.body,
  'bare approve': s => s.body = '/approve', 'edited': s => s.updatedAt = '2026-10-08T01:01:00Z',
  'revoked': s => s.active = false, 'future': s => { s.createdAt = s.updatedAt = '2027-01-01T00:00:00Z'; },
  'wrong thread': s => s.thread = 'issue:42', 'wrong repo': s => s.repository = 'x/y', 'wrong URL': s => s.url += '-wrong',
  'same account unknown source': s => s.author = 'same-account',
})) test(`approval fails closed: ${name}`, async () => {
  const t = target(), s = source(t); change(s);
  await assert.rejects(checkApproval(s, t, ['999'], name === 'same account unknown source' ? undefined : async () => true, NOW));
});

test('independent human attestation binds original content, author, time and target, not arbitrary human flag', async () => {
  const t = target(), s = source(t), verify = attest(s, t);
  await assert.rejects(checkApproval({ ...s, human: true }, t, [], undefined, NOW));
  await assert.rejects(checkApproval({ ...s, author: 'changed' }, t, [], verify, NOW), /HUMAN_PROVENANCE/);
  for (const changed of [{ ...t, issue: 4 }, { ...t, planVersion: 'v2' }, { ...t, planDigest: hash('new') }])
    await assert.rejects(checkApproval(s, changed, [], verify, NOW));
  const merge = { ...t, kind: 'merge', pr: 4, sha: 'a'.repeat(40) }, original = source(merge);
  await assert.rejects(checkApproval(original, { ...merge, sha: 'b'.repeat(40) }, [], attest(original, merge), NOW));
});

test('each simulated gate transitions only once and approval consumption survives snapshot restart', async () => {
  for (const t of [target(), { ...target(), kind: 'merge', pr: 4, sha: 'a'.repeat(40) },
    { ...target(), kind: 'release', pr: 4, sha: 'a'.repeat(40), version: 'v2', changeSetDigest: hash('set') }]) {
    const f = fixture(t); const result = await f.core.run(f.request, f.lease);
    assert.equal(result.status, 'succeeded'); assert.equal(f.executor.calls, 1);
    const snapshot = f.store.snapshot(); assert.equal(snapshot.consumed['123'].operationId, f.request.id);
    assert.equal(snapshot.tasks[3].revision, 2);
    await assert.rejects(f.core.run(f.request, f.lease), /TASK_PRECONDITION/);
    const restored = new MemoryStore(snapshot);
    restored.transaction(s => { s.tasks[3] = f.state; });
    const another = new WorkflowCore({ ...f.options, store: restored });
    await assert.rejects(another.run({ ...f.request, id: 'other' }, f.lease), /APPROVAL_ALREADY_CONSUMED/);
  }
});
for (const [name, mutate, pattern] of [
  ['closed issue', f => f.store.transaction(s => { s.tasks[3].open = false; }), /TASK_CLOSED/],
  ['stale revision', f => f.request.revision++, /STALE_TASK/],
  ['illegal transition', f => f.store.transaction(s => { s.tasks[3].stage = 'completed'; }), /TASK_PRECONDITION/],
  ['another active developer', f => f.store.transaction(s => { s.tasks[9] = { stage: 'developing' }; }), /SLOT_BUSY/],
  ['reserved developer', f => f.store.transaction(s => { s.tasks[9] = { stage: 'development-reserved' }; }), /SLOT_BUSY/],
  ['missing evidence adapter', f => f.core.validateEvidence = undefined, /EVIDENCE_ADAPTER/],
  ['bad evidence', f => f.core.validateEvidence = async () => ({ valid: false }), /EVIDENCE_REJECTED/],
  ['source reader mismatch', f => f.core.readApproval = async () => ({ ...f.approval, id: '456' }), /SOURCE_CHANGED/],
]) test(`no simulated effect when ${name}`, async () => {
  const f = fixture(); mutate(f); await assert.rejects(f.core.run(f.request, f.lease), pattern);
  assert.equal(f.executor.calls, 0); assert.deepEqual(f.store.snapshot().consumed, {});
});

test('lease competition, renewal, expiration, fencing and atomic rollback', () => {
  const f = fixture(); assert.throws(() => f.store.acquire('other', NOW, 100), /LOCK_BUSY/);
  const renewed = f.store.renew(f.lease, NOW + 500, 1000); assert.equal(renewed.token, f.lease.token);
  f.advance(1600); const next = f.store.acquire('other', f.now(), 1000);
  assert.ok(next.token > f.lease.token);
  assert.throws(() => f.store.guarded(f.lease, f.now(), () => true), /LOCK_LOST/);
  assert.throws(() => f.store.transaction(s => { s.tasks = {}; throw new Error('rollback'); }), /rollback/);
  assert.ok(f.store.snapshot().tasks[3]);
});

test('loss during validation prevents reservation or simulated execution', async () => {
  const f = fixture(); f.core.verifyHuman = async () => { f.advance(2000); return true; };
  await assert.rejects(f.core.run(f.request, f.lease), /LOCK_LOST/);
  assert.equal(f.executor.calls, 0); assert.deepEqual(f.store.snapshot().consumed, {});
});

test('two concurrent calls cannot reserve duplicate operations or consume twice', async () => {
  const f = fixture({ ...target(), kind: 'merge', pr: 4, sha: 'a'.repeat(40) });
  const result = await Promise.allSettled([f.core.run(f.request, f.lease), f.core.run(f.request, f.lease)]);
  assert.equal(result.filter(x => x.status === 'fulfilled').length, 1); assert.equal(f.executor.calls, 1);
});

test('interruption after simulated effect is queried on recovery, never executed twice', async () => {
  const f = fixture(); const execute = f.executor.execute.bind(f.executor);
  f.executor.execute = async op => { await execute(op); throw new Error('interrupted'); };
  await assert.rejects(f.core.run(f.request, f.lease), /interrupted/);
  assert.equal(f.store.snapshot().operations.operation1.status, 'prepared');
  f.advance(2000); const restored = new MemoryStore(f.store.snapshot());
  const executor = new SimulatedExecutor(f.executor.effects), lease = restored.acquire('recovery', f.now(), 1000);
  const core = new WorkflowCore({ ...f.options, store: restored, executor });
  assert.equal((await core.recover('operation1', lease)).status, 'succeeded');
  assert.equal(executor.queries, 1); assert.equal(executor.calls, 0);
  await assert.rejects(core.recover('operation1', lease), /NO_PENDING/);
});

test('absent/unknown outcome, revoked approval, changed task or policy block recovery without retry', async () => {
  for (const condition of ['absent', 'unknown', 'revoked', 'closed', 'policy']) {
    const f = fixture(); const execute = f.executor.execute.bind(f.executor);
    f.executor.execute = async op => { if (!['absent', 'unknown'].includes(condition)) await execute(op); throw new Error('interrupt'); };
    await assert.rejects(f.core.run(f.request, f.lease));
    if (condition === 'unknown') f.executor.query = async () => ({ status: 'unknown' });
    if (condition === 'revoked') f.approval.active = false;
    if (condition === 'closed') f.store.transaction(s => { s.tasks[3].open = false; });
    if (condition === 'policy') f.core.read = async () => null;
    await assert.rejects(f.core.recover('operation1', f.lease));
    assert.equal(f.store.snapshot().operations.operation1.status, 'prepared');
  }
});

test('loss after effect cannot finalize with an expired token; recovery requires current fence', async () => {
  const f = fixture(), execute = f.executor.execute.bind(f.executor);
  f.executor.execute = async op => { const result = await execute(op); f.advance(2000); return result; };
  await assert.rejects(f.core.run(f.request, f.lease), /LOCK_LOST/);
  const next = f.store.acquire('recovery', f.now(), 1000);
  assert.equal((await f.core.recover('operation1', next)).status, 'succeeded'); assert.equal(f.executor.calls, 1);
});

// Generated 1×1 RGBA PNG is a TEST FIXTURE, never a high-fidelity design or product screenshot.
function png(filter = 0) {
  function chunk(type, data) {
    const payload = Buffer.concat([Buffer.from(type), data]); let crc = 0xffffffff;
    for (const b of payload) { crc ^= b; for (let n = 0; n < 8; n++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
    const result = Buffer.alloc(data.length + 12); result.writeUInt32BE(data.length); payload.copy(result, 4);
    result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4); return result;
  }
  const header = Buffer.alloc(13); header.writeUInt32BE(1, 0); header.writeUInt32BE(1, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([filter, 20, 30, 40, 255]))), chunk('IEND', Buffer.alloc(0))]);
}
function design() {
  const image = png(), url = 'https://fixtures.invalid/v1/fixture.png';
  const plan = `![TEST FIXTURE](${url})`, comment = `[OnO] 方案 v1\n\n${plan}`;
  const t = { ...target(), planDigest: hash(plan) };
  const images = [{ url, state: 'TEST FIXTURE ONLY', sha256: hash(image), planVersion: t.planVersion, planDigest: t.planDigest }];
  return { input: { target: t, ui: true, plan, comment, images,
    visual: { decision: 'approved-high-fidelity', reviewer: 'TEST REVIEWER', notes: 'TEST ATTESTATION ONLY', binding: visualBinding(t, plan, comment, images) } },
    read: async () => image, verify: async () => true, image };
}

test('PNG decoder reconstructs supported filters and rejects signature-only, truncation, CRC, trailing data and invalid filter', () => {
  for (let filter = 0; filter <= 4; filter++) assert.equal(decodePng(png(filter)).pixelDigest, hash(Buffer.from([20, 30, 40, 255])));
  const corrupt = png(); corrupt[45] ^= 1;
  for (const bytes of [png().subarray(0, 8), png().subarray(0, 40), corrupt, Buffer.concat([png(), Buffer.from('x')]), png(5)])
    assert.throws(() => decodePng(bytes));
});

test('Markdown extraction ignores quoted/code/HTML examples; accepts real image in list or reference', () => {
  assert.deepEqual(embeddedImages('> ![x](https://x)\n\n```md\n![x](https://x)\n```\n\n`![x](https://x)`\n\n<img src="https://x">'), []);
  assert.deepEqual(embeddedImages('- ![fixture][image]\n\n[image]: https://fixtures.invalid/image.png'), ['https://fixtures.invalid/image.png']);
});

test('design needs both rendered embeddings, decoded bytes and independent semantic visual review', async () => {
  const f = design(); assert.equal((await checkDesign(f.input, f.read, f.verify)).valid, true);
  await assert.rejects(checkDesign(f.input, f.read), /VISUAL_REVIEW_UNVERIFIED/);
  assert.equal((await checkDesign({ target: target(), ui: false, nonUiReason: 'checker-only task, no product UI' })).visual, 'not-applicable');
  await assert.rejects(checkDesign({ target: target(), ui: false }), /NON_UI_REASON/);
});
for (const [name, mutate] of Object.entries({
  'missing plan image': f => { f.input.plan = 'text only'; },
  'missing comment image': f => { f.input.comment = '[OnO] see plan'; },
  'example not image': f => { f.input.comment = '```md\n' + f.input.plan + '\n```'; },
  'quoted image': f => { f.input.comment = '> ' + f.input.plan; },
  'old image version': f => { f.input.images[0].planVersion = 'v0'; },
  'old image digest': f => { f.input.images[0].planDigest = hash('old'); },
  'replaced remote image': f => { f.read = async () => Buffer.from('other'); },
  'unreachable image': f => { f.read = async () => { throw new Error('404'); }; },
  'undecodable image': f => { const b = Buffer.from('not PNG'); f.read = async () => b; f.input.images[0].sha256 = hash(b); },
  'no visual review': f => { delete f.input.visual; },
  'old visual review': f => { f.input.visual.binding = hash('old'); },
  'dimension-only review': f => { f.input.visual.decision = 'large-resolution'; },
  'extra image': f => { f.input.comment += '\n![extra](https://fixtures.invalid/extra.png)'; },
})) test(`UI guard rejects ${name}`, async () => {
  const f = design(); mutate(f); await assert.rejects(checkDesign(f.input, f.read, f.verify));
});

function acceptance() {
  const t = { ...target(), kind: 'merge', pr: 4, sha: 'a'.repeat(40) };
  const expected = { head: t.sha, base: 'b'.repeat(40), tested: 'c'.repeat(40), run: 123, attempt: 2, event: 'pull_request' };
  const checks = ['linux-test', 'linux-verify', 'windows-test', 'windows-verify', 'windows-install', 'windows-persistence'].map(name => ({ ...expected, name, status: 'passed' }));
  const bytes = Buffer.from(JSON.stringify({ fixture: true }));
  const artifacts = [{ name: 'report.json', url: 'https://fixtures.invalid/persistent/report.json', bytes: bytes.length, sha256: hash(bytes),
    sha: t.sha, run: 123, attempt: 2, critical: true, expiresAt: null }];
  return { input: { target: t, expected, checks, artifacts }, read: async () => bytes, verify: async () => true };
}
test('acceptance manifest binds latest run/attempt/head/base/tested and requires persistence adapter', async () => {
  const f = acceptance(); assert.equal((await checkAcceptance(f.input, f.read, f.verify, NOW)).valid, true);
  await assert.rejects(checkAcceptance(f.input, f.read, undefined, NOW), /PERSISTENCE_UNVERIFIED/);
});
for (const [name, mutate] of Object.entries({
  'old SHA': f => f.input.checks[0].head = 'd'.repeat(40),
  'old attempt': f => f.input.checks[0].attempt = 1,
  'old base': f => f.input.checks[0].base = 'd'.repeat(40),
  'missing check': f => f.input.checks.pop(),
  'skipped check': f => f.input.checks[0].status = 'skipped',
  'failed check': f => f.input.checks[0].status = 'failed',
  'uncovered check': f => f.input.checks[0].status = 'uncovered',
  'expired artifact': f => f.input.artifacts[0].expiresAt = '2020-01-01T00:00:00Z',
  'installer upload': f => f.input.artifacts[0].name = 'installer.exe',
  'video upload': f => f.input.artifacts[0].name = 'video.mp4',
  'wrong content': f => f.read = async () => Buffer.from('bad'),
  'wrong artifact SHA': f => f.input.artifacts[0].sha = 'f'.repeat(40),
  'no critical evidence': f => { f.input.artifacts[0].critical = false; f.input.artifacts[0].expiresAt = '2027-01-01T00:00:00Z'; },
})) test(`acceptance rejects ${name}`, async () => {
  const f = acceptance(); mutate(f); await assert.rejects(checkAcceptance(f.input, f.read, f.verify, NOW));
});

test('composed evidence guard cannot bypass design, acceptance or UI implementation screenshot', async () => {
  const d = design(), a = acceptance(); a.input.target.planDigest = d.input.target.planDigest;
  const task = { target: a.input.target, design: d.input, acceptance: a.input };
  const adapters = { readImage: d.read, verifyVisual: d.verify, readArtifact: a.read, verifyPersistence: a.verify, now: NOW };
  await assert.rejects(checkTaskEvidence(task, adapters), /IMPLEMENTATION_SCREENSHOT_MISSING/);
  task.design = { ui: false, nonUiReason: 'non UI fixture' };
  assert.equal((await checkTaskEvidence(task, adapters)).valid, true);
});

test('task mutation while awaiting trusted verifier invalidates original revision before effect', async () => {
  const f = fixture();
  f.core.verifyHuman = async () => { f.store.transaction(s => { s.tasks[3].revision++; }); return true; };
  await assert.rejects(f.core.run(f.request, f.lease), /STALE_TASK_REVISION/); assert.equal(f.executor.calls, 0);
});

test('self comment registered during validation cannot be consumed', async () => {
  const f = fixture();
  f.core.validateEvidence = async task => {
    f.store.transaction(s => { s.ownComments.push('123'); });
    return { valid: true, targetKey: targetKey(task.target) };
  };
  await assert.rejects(f.core.run(f.request, f.lease), /SELF_APPROVAL/); assert.equal(f.executor.calls, 0);
});

test('changed head, release version or change set invalidates old approvals', async () => {
  const t = { ...target(), kind: 'release', pr: 4, sha: 'a'.repeat(40), version: 'v1', changeSetDigest: hash('set1') };
  const s = source(t);
  for (const patch of [{ sha: 'b'.repeat(40) }, { version: 'v2' }, { changeSetDigest: hash('set2') }, { pr: 5 }])
    await assert.rejects(checkApproval(s, { ...t, ...patch }, [], async () => true, NOW));
});

test('policy is reloaded on next round even after first successful approval', async () => {
  const f = fixture(); await f.core.run(f.request, f.lease); f.core.read = async () => null;
  await assert.rejects(f.core.run(f.request, f.lease), /POLICY/); assert.equal(f.executor.calls, 1);
});

test('large invalid image bytes fail decoding rather than proving high fidelity', async () => {
  const f = design(); const large = Buffer.alloc(10_000_001);
  const urls = ['https://fixtures.invalid/1.png', 'https://fixtures.invalid/2.png'];
  f.input.plan = urls.map(url => `![TEST](${url})`).join('\n'); f.input.comment = f.input.plan;
  f.input.target.planDigest = hash(f.input.plan);
  f.input.images = urls.map(url => ({ ...f.input.images[0], url, planDigest: f.input.target.planDigest, sha256: hash(large) }));
  // Invalid bytes are rejected even before reaching the aggregate limit.
  await assert.rejects(checkDesign(f.input, async () => large, f.verify), /PNG/);
});

test('core composes actual design checker; missing images prevent simulated development', async () => {
  const d = design(), f = fixture(d.input.target);
  f.store.transaction(s => { s.tasks[3].design = { ...d.input, comment: '[OnO] text only' }; });
  f.core.validateEvidence = task => checkTaskEvidence(task, { readImage: d.read, verifyVisual: d.verify });
  await assert.rejects(f.core.run(f.request, f.lease), /DESIGN_NOT_EMBEDDED/);
  assert.equal(f.executor.calls, 0); assert.deepEqual(f.store.snapshot().consumed, {});
});

test('UI acceptance requires bound implementation review in addition to design review', async () => {
  const d = design(), a = acceptance(); a.input.target.planDigest = d.input.target.planDigest;
  a.input.artifacts.push({ ...a.input.artifacts[0], name: 'implementation.png', url: 'https://fixtures.invalid/implementation.png',
    bytes: d.image.length, sha256: hash(d.image) });
  const task = { target: a.input.target, design: d.input, acceptance: a.input };
  const adapters = { readImage: d.read, verifyVisual: d.verify, readArtifact: async url => url.endsWith('.png') ? d.image : await a.read(), verifyPersistence: a.verify, now: NOW };
  await assert.rejects(checkTaskEvidence(task, adapters), /IMPLEMENTATION_VISUAL_REVIEW_REQUIRED/);
  task.implementationReview = { decision: 'approved-implementation', reviewer: 'TEST REVIEWER', notes: 'FIXTURE ONLY',
    binding: hash(JSON.stringify([targetKey(task.target), a.input.expected, a.input.artifacts])) };
  assert.equal((await checkTaskEvidence(task, adapters)).valid, true);
  a.input.expected.attempt++;
  await assert.rejects(checkTaskEvidence(task, adapters), /STALE_TEST_EVIDENCE/);
});

test('evidence size limit is shared by every artifact in the manifest', async () => {
  const f = acceptance(), bytes = Buffer.from('x'.repeat(10_000_001));
  f.input.artifacts = ['one.md', 'two.md'].map(name => ({ ...f.input.artifacts[0], name,
    url: `https://fixtures.invalid/${name}`, bytes: bytes.length, sha256: hash(bytes) }));
  await assert.rejects(checkAcceptance(f.input, async () => bytes, f.verify, NOW), /EVIDENCE_TOTAL_TOO_LARGE/);
});

test('untrusted operation keys cannot change object prototypes', async () => {
  for (const id of ['__proto__', 'constructor', 'prototype']) {
    const f = fixture(); await assert.rejects(f.core.run({ ...f.request, id }, f.lease), /INVALID_OPERATION_ID/);
    assert.equal(f.executor.calls, 0); assert.deepEqual(f.store.snapshot().operations, {});
  }
});

test('evidence changes while simulation is interrupted block finalization and preserve original audit binding', async () => {
  const f = fixture(); const execute = f.executor.execute.bind(f.executor);
  f.executor.execute = async op => {
    const result = await execute(op);
    f.core.validateEvidence = async task => ({ valid: true, targetKey: targetKey(task.target), changedAttempt: 3 });
    return result;
  };
  await assert.rejects(f.core.run(f.request, f.lease), /EVIDENCE_CHANGED_DURING_OPERATION/);
  assert.equal(f.store.snapshot().operations.operation1.status, 'prepared');
  await assert.rejects(f.core.recover('operation1', f.lease), /EVIDENCE_CHANGED_DURING_OPERATION/);
  assert.equal(f.executor.calls, 1);
});
