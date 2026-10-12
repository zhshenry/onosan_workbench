import test from 'node:test';
import assert from 'node:assert/strict';
import { hash } from '../tooling/ono/core.mjs';
import { collect, createGitHubReader } from '../tooling/ono/read-only/collect.mjs';
import { evaluate } from '../tooling/ono/read-only/evaluate.mjs';

const NOW = Date.parse('2026-10-12T08:30:00Z');
const HEAD = 'a'.repeat(40), MAIN = 'b'.repeat(40);
const date = (delta = 0) => new Date(NOW + delta).toISOString();
function fixture() {
  const request = { id: 1, body: '方案 v1，完整方案与图片清单绑定在此；这是模拟测试。', created_at: date(-2000), updated_at: date(-2000) };
  const approval = { id: 2, body: 'APPROVE 方案 v1', user: { login: 'zhshenry', id: 54107847 },
    html_url: 'https://github.com/zhshenry/onosan_workbench/issues/13#issuecomment-2', created_at: date(-1000), updated_at: date(-1000) };
  const snapshot = { schema: 'ono-read-only-snapshot-v1', source: 'fixture', repository: 'zhshenry/onosan_workbench',
    complete: true, stable: true, collectedAt: date(), issue: { id: 13, number: 13, state: 'open', state_reason: null,
      url: 'https://api.github.com/repos/zhshenry/onosan_workbench/issues/13', repository_url: 'https://api.github.com/repos/zhshenry/onosan_workbench' },
    pr: null, mainSha: MAIN, comments: [request, approval], prComments: [], runs: [] };
  const contract = { gate: 'plan', ui: false, ownCommentIds: [1], request: { requestCommentId: 1,
    approvalCommentId: 2, requestDigest: hash(request.body), planVersion: 'v1', planDigest: hash('plan') } };
  return { snapshot, contract };
}
async function inspect(change = () => {}, options = {}) {
  const data = fixture(); change(data);
  return evaluate(data.snapshot, data.contract, { now: NOW, ...options });
}
const has = (report, reason) => assert.ok(report.reasons.includes(reason), JSON.stringify(report.reasons));

test('no human verifier means blocked; fixture is not human proof or approval', async () => {
  const r = await inspect(); has(r, 'HUMAN_PROVENANCE_UNVERIFIED');
  assert.equal(r.capabilities.grantsApproval, false); assert.equal(r.capabilities.scheduled, false);
  assert.ok(r.observations.includes('FIXTURE_ONLY_NOT_PRODUCTION_PROOF'));
});
test('test human attestation cannot replace unimplemented plan/lifecycle checks', async () => {
  const r = await inspect(() => {}, { verifyHuman: async () => true });
  assert.equal(r.status, 'blocked'); has(r, 'PLAN_CONTENT_BINDING_NOT_VERIFIED'); has(r, 'APPROVAL_LIFECYCLE_NOT_VERIFIED');
  assert.equal(r.capabilities.executesActions, false);
});
for (const [name, change, reason] of [
  ['self ID', d => d.contract.ownCommentIds.push(2), 'SELF_APPROVAL'],
  ['new marker', d => d.snapshot.comments[1].body = '【OnO 自动化】APPROVE 方案 v1', 'SELF_APPROVAL'],
  ['old marker', d => d.snapshot.comments[1].body = '[OnO] APPROVE 方案 v1', 'SELF_APPROVAL'],
  ['edited', d => d.snapshot.comments[1].updated_at = date(), 'APPROVAL_EDITED_OR_INVALID_TIME'],
  ['deleted', d => d.snapshot.comments.pop(), 'APPROVAL_MISSING_OR_DELETED'],
  ['wrong numeric owner', d => d.snapshot.comments[1].user.id = 42, 'OWNER_MISMATCH'],
  ['request changed', d => d.snapshot.comments[0].body += 'new plan', 'REQUEST_MISSING_OR_CHANGED'],
  ['plan version drift', d => d.contract.request.planVersion = 'v2', 'APPROVAL_NOT_EXACT'],
  ['quote', d => d.snapshot.comments[1].body = '> APPROVE 方案 v1', 'APPROVAL_NOT_EXACT'],
  ['code', d => d.snapshot.comments[1].body = '`APPROVE 方案 v1`', 'APPROVAL_NOT_EXACT'],
  ['missing self log', d => delete d.contract.ownCommentIds, 'SELF_COMMENT_LOG_MISSING'],
  ['stale snapshot', d => d.snapshot.collectedAt = date(-3600000), 'SNAPSHOT_STALE'],
  ['changed snapshot', d => d.snapshot.stable = false, 'SNAPSHOT_INCOMPLETE_OR_CHANGED'],
] as const) test(`rejects ${name}`, async () => has(await inspect(change, { verifyHuman: async () => true }), reason));

test('unmarked same-account automation remains unknown, not approval', async () => {
  const r = await inspect(d => { d.snapshot.comments[1].human = true; });
  has(r, 'HUMAN_PROVENANCE_UNVERIFIED');
});
test('closed completed without completion evidence is paused; no advancement', async () => {
  const r = await inspect(d => { d.snapshot.issue.state = 'closed'; d.snapshot.issue.state_reason = 'completed'; });
  assert.equal(r.status, 'closed-paused'); assert.equal(r.approval, null);
  assert.equal(r.observedClosure, 'completed'); assert.equal(r.deliveryCompletionVerified, false);
  assert.ok(r.observations.includes('HISTORICAL_REVIEW:CI_CURRENT_RUN_MISSING'));
});
test('early closed is paused, never automatically reopened', async () => {
  const r = await inspect(d => { d.snapshot.issue.state = 'closed'; d.snapshot.issue.state_reason = 'not_planned'; });
  assert.equal(r.status, 'closed-paused'); assert.equal(r.capabilities.executesActions, false);
});
test('duplicate event reports unchanged but recomputes; restart cannot reuse approval', async () => {
  const { snapshot, contract } = fixture();
  const first = await evaluate(snapshot, contract, { now: NOW, verifyHuman: async () => true });
  const duplicate = await evaluate(snapshot, contract, { now: NOW, previousReport: first, verifyHuman: async () => true });
  assert.equal(duplicate.changed, false);
  snapshot.comments.pop();
  const recovered = await evaluate(snapshot, contract, { now: NOW, previousReport: first });
  has(recovered, 'APPROVAL_MISSING_OR_DELETED'); assert.equal(recovered.changed, true);
});

function merge(d) {
  d.snapshot.pr = { id: 19, number: 19, state: 'open', merged: false, draft: false, mergeable: true, head: { sha: HEAD }, base: { sha: MAIN } };
  d.contract.gate = 'merge'; d.contract.request.headSha = HEAD; d.contract.request.closeAfterMain = true;
  d.snapshot.comments[1].body = `APPROVE PR #19 ${HEAD}`;
  d.snapshot.prComments = structuredClone(d.snapshot.comments);
  d.snapshot.prComments[1].body = `APPROVE PR #19 ${HEAD}`;
  d.snapshot.prComments[1].html_url = 'https://github.com/zhshenry/onosan_workbench/pull/19#issuecomment-2';
  d.snapshot.runs = [{ id: 99, path: '.github/workflows/windows-cloud-pilot.yml', event: 'pull_request', head_sha: HEAD,
    run_attempt: 1, stable: true, status: 'completed', conclusion: 'success', created_at: date(-10000), updated_at: date(-1000),
    pull_requests: [{ number: 19, base: { sha: MAIN } }], jobs: ['linux-baseline', 'windows-installed-app'].map(name => ({ name, status: 'completed', conclusion: 'success', run_id: 99, run_attempt: 1, head_sha: HEAD })),
    artifacts: [{ id: 100, name: 'evidence', expired: false, expires_at: date(10000), workflow_run: { id: 99, head_sha: HEAD } }] }];
}
test('PR metadata green does not prove actual tested merge parents', async () => has(await inspect(merge), 'CI_TESTED_MERGE_NOT_VERIFIED'));
for (const [name, change, reason] of [
  ['head drift', d => d.snapshot.pr.head.sha = MAIN, 'APPROVAL_HEAD_DRIFT'],
  ['base drift', d => d.snapshot.mainSha = HEAD, 'CI_BASE_DRIFT'],
  ['old attempt', d => d.snapshot.runs[0].jobs[0].run_attempt = 2, 'CI_JOB_INVALID:linux-baseline'],
  ['expired evidence', d => d.snapshot.runs[0].artifacts[0].expires_at = date(-1), 'EVIDENCE_EXPIRED_OR_UNKNOWN'],
] as const) test(`merge rejects ${name}`, async () => has(await inspect(d => { merge(d); change(d); }), reason));
test('merge-only scope does not authorize close or add an artificial merge rejection', async () => {
  const r = await inspect(d => { merge(d); d.contract.request.closeAfterMain = false; });
  assert.ok(r.observations.includes('CLOSE_NOT_AUTHORIZED_BY_REQUEST_SCOPE'));
  assert.ok(!r.reasons.includes('CLOSE_SCOPE_NOT_INCLUDED'));
  assert.equal(r.approval.record.binding.closeAfterMain,false);
});
test('actual Issue 13 merge wording is observed in Issue, with parser limitation rather than wrong thread', async () => {
  const r = await inspect(d => { merge(d); d.snapshot.comments[1].body = '同意合入 PR #19，版本 e74922f'; });
  assert.ok(!r.reasons.includes('APPROVAL_WRONG_THREAD_URL'));
  has(r,'APPROVAL_NOT_EXACT'); has(r,'APPROVAL_PROTOCOL_ADAPTER_NOT_IMPLEMENTED');
});
test('PR discussion cannot substitute for original Issue approval', async () => {
  const r = await inspect(d => { merge(d); d.snapshot.comments.pop(); });
  has(r,'APPROVAL_MISSING_OR_DELETED');
});

function apiFixture() {
  const d = fixture(), counts = new Map(), urls = [];
  const get = async url => {
    urls.push(url); const p = new URL(url).pathname.replace('/repos/zhshenry/onosan_workbench', '');
    counts.set(p, (counts.get(p) ?? 0) + 1);
    if (p === '/issues/13') return d.snapshot.issue;
    if (p === '/issues/13/comments') return d.snapshot.comments;
    if (p === '/git/ref/heads/main') return { ref: 'refs/heads/main', object: { sha: MAIN } };
    if (p === '/actions/runs') return { total_count: 0, workflow_runs: [] };
    throw new Error(`unexpected read ${p}`);
  };
  return { d, get, counts, urls };
}
test('collector runs fresh GET reads each invocation; same snapshot is not cached', async () => {
  const api = apiFixture(); const reader = createGitHubReader(api.get, { clock: () => NOW });
  const first = await collect(reader, { issue: 13 }); const second = await collect(reader, { issue: 13 });
  assert.equal(first.stable, true); assert.equal(second.source, 'fixture');
  assert.equal(api.counts.get('/issues/13/comments'), 4);
  assert.equal(first.reads.length, second.reads.length);
  assert.ok(api.urls.every(u => u.startsWith('https://api.github.com/repos/zhshenry/onosan_workbench/')));
});
test('collector notices deletion during read and fails closed', async () => {
  const api = apiFixture();
  const reader = createGitHubReader(async url => {
    if (url.includes('/comments') && api.counts.get('/issues/13/comments') === 1) api.d.snapshot.comments.pop();
    return api.get(url);
  }, { clock: () => NOW });
  assert.equal((await collect(reader, { issue: 13 })).stable, false);
});
test('new run appearing after initial enumeration makes snapshot unstable', async () => {
  const api = apiFixture();
  const reader = createGitHubReader(async url => {
    const response = await api.get(url);
    if (url.includes('/actions/runs?') && api.counts.get('/actions/runs') > 1) return { total_count: 1, workflow_runs: [{ id: 999, status: 'in_progress' }] };
    return response;
  }, { clock: () => NOW });
  assert.equal((await collect(reader, { issue: 13 })).stable, false);
});
test('allowlist rejects foreign URLs, writes and arbitrary endpoints', async () => {
  let calls = 0; const reader = createGitHubReader(async () => { calls++; return {}; });
  for (const path of ['/issues', '/actions/secrets', '/../../users', 'https://evil.test', '/issues/13/comments?evil=https://evil.test']) await assert.rejects(reader.read(path), /DENIED/);
  assert.equal(calls, 0);
});
test('read failure aborts collection rather than recycling previous successful report', async () => {
  const reader = createGitHubReader(async () => { throw new Error('offline'); });
  await assert.rejects(collect(reader, { issue: 13 }), /offline/);
});
test('async caller mutation cannot alter validated snapshot or contract', async () => {
  const { snapshot, contract } = fixture();
  const r = await evaluate(snapshot, contract, { now: NOW, verifyHuman: async () => {
    snapshot.issue.number = 99; snapshot.mainSha = HEAD; contract.request.planVersion = 'v99'; return true;
  } });
  assert.equal(r.issue, 13); assert.equal(r.mainSha, MAIN); assert.equal(r.approval.record.binding.planVersion, 'v1');
});
test('invalid request time is rejected', async () => has(await inspect(d => { d.snapshot.comments[0].created_at = 'nonsense'; }), 'APPROVAL_PRECEDES_REQUEST'));
test('missing attempts and foreign job run IDs cannot yield green CI', async () => {
  const r = await inspect(d => { merge(d); delete d.snapshot.runs[0].run_attempt; delete d.snapshot.runs[0].jobs[0].run_attempt; d.snapshot.runs[0].jobs[1].run_id = 999; });
  has(r, 'CI_RUN_IDENTITY_INVALID'); has(r, 'CI_JOB_INVALID:linux-baseline'); has(r, 'CI_JOB_INVALID:windows-installed-app');
});
test('plan content changes and reopened lifecycle cannot inherit old approval', async () => {
  const r = await inspect(d => { d.contract.request.planDigest = hash('changed plan'); d.snapshot.issue.state_reason = 'reopened'; }, { verifyHuman: async () => true });
  has(r, 'PLAN_CONTENT_BINDING_NOT_VERIFIED'); has(r, 'APPROVAL_LIFECYCLE_NOT_VERIFIED');
});
test('historical completed state survives evidence expiry without claiming current availability', async () => {
  const r = await inspect(d => {
    merge(d); d.snapshot.issue.state = 'closed'; d.snapshot.issue.state_reason = 'completed';
    d.snapshot.pr.merged = true; d.snapshot.pr.state = 'closed'; d.snapshot.pr.merge_commit_sha = HEAD; d.snapshot.mainSha = HEAD;
    d.snapshot.runs[0].event = 'push'; d.snapshot.runs[0].artifacts[0].expires_at = date(-1);
  });
  assert.equal(r.status, 'closed-completed'); assert.equal(r.ci.run.historicalConclusion, 'success');
  assert.ok(r.observations.includes('HISTORICAL_REVIEW:EVIDENCE_EXPIRED_OR_UNKNOWN'));
});
test('keyed pagination refuses total mismatch, duplicate IDs and search cap', async () => {
  for (const [payload, pattern] of [[{ total_count: 3, jobs: [{id:1}] }, /INCOMPLETE/],
    [{total_count:2,jobs:[{id:1},{id:1}]}, /DUPLICATE/]] as const) {
    const r = createGitHubReader(async () => payload); await assert.rejects(r.pages('/actions/runs/1/jobs','jobs'), pattern);
  }
  const r = createGitHubReader(async () => ({total_count:1000,workflow_runs:[]}));
  await assert.rejects(r.pages('/actions/runs?head_sha='+HEAD,'workflow_runs'), /LIMIT_INCOMPLETE/);
});
test('collector rejects final issue identity mismatch', async () => {
  const api = apiFixture();
  const reader = createGitHubReader(async url => {
    const response = await api.get(url);
    if (url.endsWith('/issues/13') && api.counts.get('/issues/13') === 2) return {...response,number:99};
    return response;
  }, {clock:()=>NOW});
  await assert.rejects(collect(reader,{issue:13}),/IDENTITY_MISMATCH/);
});
test('closed completed never hides invalid technical identity behind historical success', async () => {
  const r = await inspect(d => {
    merge(d); d.snapshot.issue.state = 'closed'; d.snapshot.issue.state_reason = 'completed';
    d.snapshot.pr.merged = true; d.snapshot.pr.state = 'closed'; d.snapshot.mainSha = HEAD;
    d.snapshot.runs[0].event = 'push'; delete d.snapshot.runs[0].run_attempt;
  });
  assert.equal(r.status, 'closed-paused');
  assert.ok(r.observations.includes('HISTORICAL_REVIEW:CI_RUN_IDENTITY_INVALID'));
  assert.ok(r.observations.includes('HISTORICAL_REVIEW:MERGE_COMMIT_SHA_MISSING'));
});
