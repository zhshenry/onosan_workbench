import { hash } from '../core.mjs'; // Pure digest only. Does not load/migrate POLICY or call WorkflowCore.

const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const digest = value => hash(JSON.stringify(value));
const number = value => Number.isSafeInteger(value) && value > 0;
const time = value => typeof value === 'string' ? Date.parse(value) : NaN;
const OWNER = { login: 'zhshenry', id: 54107847 };
const WORKFLOW = '.github/workflows/windows-cloud-pilot.yml';

export async function inspectApproval(snapshot, gate, request, ownComments, verifyHuman = async () => false) {
  snapshot = structuredClone(snapshot); request = structuredClone(request); ownComments = structuredClone(ownComments);
  const reasons = [];
  const add = code => reasons.push(code);
  if (!request || !number(request.requestCommentId) || !number(request.approvalCommentId) ||
      !['plan', 'merge'].includes(gate) || !Array.isArray(ownComments)) return { status: 'blocked', reasons: ['APPROVAL_CONTRACT_MISSING'] };
  // Both product gates stay in the original Issue. PR comments are observation only.
  const comments = snapshot.comments;
  const original = comments.find(c => c.id === request.requestCommentId);
  const approval = comments.find(c => c.id === request.approvalCommentId);
  if (!original || hash(original.body ?? '') !== request.requestDigest) add('REQUEST_MISSING_OR_CHANGED');
  if (!approval) return { status: 'blocked', reasons: [...reasons, 'APPROVAL_MISSING_OR_DELETED'] };
  const raw = approval.body ?? '';
  if (ownComments.includes(approval.id) || raw.includes('【OnO 自动化】') || raw.includes('[OnO]')) add('SELF_APPROVAL');
  if (approval.user?.login !== OWNER.login || approval.user?.id !== OWNER.id) add('OWNER_MISMATCH');
  const threadPath = `issues/${snapshot.issue.number}`;
  if (approval.html_url !== `https://github.com/${snapshot.repository}/${threadPath}#issuecomment-${approval.id}`) add('APPROVAL_WRONG_THREAD_URL');
  if (approval.created_at !== approval.updated_at || !Number.isFinite(time(approval.created_at)) || time(approval.created_at) > time(snapshot.collectedAt)) add('APPROVAL_EDITED_OR_INVALID_TIME');
  if (!original || !Number.isFinite(time(original.created_at)) || time(original.created_at) > time(snapshot.collectedAt) ||
      time(approval.created_at) <= time(original.created_at)) add('APPROVAL_PRECEDES_REQUEST');
  const expected = gate === 'plan' ? `APPROVE 方案 ${request.planVersion}` : `APPROVE PR #${snapshot.pr?.number} ${request.headSha}`;
  if (raw !== expected) add('APPROVAL_NOT_EXACT');
  if (!request.planVersion || !/^[a-f0-9]{64}$/.test(request.planDigest ?? '')) add('PLAN_BINDING_MISSING');
  if (gate === 'merge' && (!sha(request.headSha) || request.headSha !== snapshot.pr?.head?.sha)) add('APPROVAL_HEAD_DRIFT');
  // Request digest binds only the request's original text. Plan/image content is unverified below.
  const binding = { repository: snapshot.repository, issue: snapshot.issue.number, pr: snapshot.pr?.number ?? null,
    gate, requestCommentId: request.requestCommentId, requestDigest: request.requestDigest,
    planVersion: request.planVersion, planDigest: request.planDigest, headSha: request.headSha ?? null,
    closeAfterMain: request.closeAfterMain === true };
  const record = { id: approval.id, url: approval.html_url, body: raw, author: approval.user,
    createdAt: approval.created_at, updatedAt: approval.updated_at, binding };
  // An injected trusted verifier is a future boundary, never an issue field or username heuristic.
  // Even true remains blocked by the unimplemented checks below, never permission to act.
  let verified = false;
  if (!reasons.length) verified = await verifyHuman(structuredClone(record)) === true;
  if (!verified) add('HUMAN_PROVENANCE_UNVERIFIED');
  // Current collectors do not retrieve versioned plan content or Issue lifecycle events.
  // Do not let a caller-supplied digest or a prior approval stand in for either check.
  add('PLAN_CONTENT_BINDING_NOT_VERIFIED');
  add('APPROVAL_LIFECYCLE_NOT_VERIFIED');
  add('APPROVAL_PROTOCOL_ADAPTER_NOT_IMPLEMENTED');
  return { status: reasons.length ? 'blocked' : 'review-candidate', reasons, record };
}

export function inspectCI(snapshot, now, maxAgeMs) {
  const reasons = [], observations = [];
  const pr = snapshot.pr;
  const postMerge = !pr || pr.merged === true;
  const expectedSha = postMerge ? snapshot.mainSha : pr.head?.sha;
  const event = postMerge ? 'push' : 'pull_request';
  const eligible = snapshot.runs.filter(run => run.path?.split('@')[0] === WORKFLOW && run.event === event && run.head_sha === expectedSha &&
    (postMerge || run.pull_requests?.some(p => p.number === pr.number)));
  eligible.sort((a, b) => time(b.created_at) - time(a.created_at) || b.id - a.id);
  const run = eligible[0];
  if (!run) return { reasons: ['CI_CURRENT_RUN_MISSING'], observations, run: null };
  if (!number(run.id) || !number(run.run_attempt) || !sha(run.head_sha) || !Number.isFinite(time(run.created_at)) || time(run.created_at) > now) reasons.push('CI_RUN_IDENTITY_INVALID');
  if (run.stable !== true || run.status !== 'completed' || run.conclusion !== 'success') reasons.push('CI_NOT_STABLE_SUCCESS');
  if (!Number.isFinite(time(run.updated_at)) || time(run.updated_at) > now || now - time(run.updated_at) > maxAgeMs) reasons.push('CI_FRESHNESS_REVIEW_REQUIRED');
  for (const name of ['linux-baseline', 'windows-installed-app']) {
    const jobs = run.jobs.filter(job => job.name === name);
    if (jobs.length !== 1 || jobs[0].status !== 'completed' || jobs[0].conclusion !== 'success' ||
        !number(jobs[0].run_attempt) || jobs[0].run_attempt !== run.run_attempt || jobs[0].run_id !== run.id || jobs[0].head_sha !== expectedSha) reasons.push(`CI_JOB_INVALID:${name}`);
  }
  if (!postMerge) {
    const reported = run.pull_requests?.find(p => p.number === pr.number);
    if (reported?.base?.sha !== snapshot.mainSha || pr.base?.sha !== snapshot.mainSha) reasons.push('CI_BASE_DRIFT');
    // REST run metadata cannot establish the actual checkout merge's parents.
    reasons.push('CI_TESTED_MERGE_NOT_VERIFIED');
  } else if (pr && !sha(pr.merge_commit_sha)) {
    reasons.push('MERGE_COMMIT_SHA_MISSING');
  } else if (pr?.merge_commit_sha && pr.merge_commit_sha !== snapshot.mainSha) {
    observations.push('MAIN_ADVANCED_AFTER_MERGE');
    reasons.push('MERGED_DELIVERY_ANCESTRY_NOT_VERIFIED');
  }
  const artifacts = run.artifacts ?? [];
  if (!artifacts.length) reasons.push('EVIDENCE_ARTIFACT_MISSING');
  if (artifacts.some(a => a.expired === true || !Number.isFinite(time(a.expires_at)) || time(a.expires_at) <= now)) reasons.push('EVIDENCE_EXPIRED_OR_UNKNOWN');
  if (artifacts.some(a => a.workflow_run?.id !== run.id || a.workflow_run?.head_sha !== expectedSha)) reasons.push('EVIDENCE_RUN_BINDING_MISMATCH');
  observations.push('ARTIFACT_METADATA_ONLY_NO_BYTE_OR_VISUAL_VERIFICATION');
  return { reasons, observations, run: { id: run.id, url: run.html_url, headSha: run.head_sha, attempt: run.run_attempt,
    historicalConclusion: run.conclusion, updatedAt: run.updated_at },
    artifacts: artifacts.map(a => ({ id: a.id, name: a.name, expiresAt: a.expires_at, expired: a.expired, bytes: a.size_in_bytes })) };
}

/** Contract comes from the trusted coordinator, never deserialized from Issue instructions.
 * previousReport is for change display only. Every conclusion is recomputed from a fresh snapshot.
 */
export async function evaluate(snapshot, contract = {}, { now = Date.now(), previousReport = null, verifyHuman } = {}) {
  snapshot = structuredClone(snapshot); contract = structuredClone(contract); previousReport = structuredClone(previousReport);
  if (snapshot?.schema !== 'ono-read-only-snapshot-v1' || snapshot.repository !== 'zhshenry/onosan_workbench' ||
      !Array.isArray(snapshot.comments) || !Array.isArray(snapshot.prComments) || !Array.isArray(snapshot.runs)) throw new Error('INVALID_SNAPSHOT');
  const reasons = [], observations = [];
  const maxSnapshotAgeMs = contract.maxSnapshotAgeMs ?? 5 * 60_000;
  const maxCIAgeMs = contract.maxCIAgeMs ?? 24 * 60 * 60_000;
  if (!Number.isFinite(now) || !Number.isFinite(maxSnapshotAgeMs) || maxSnapshotAgeMs <= 0 || !Number.isFinite(maxCIAgeMs) || maxCIAgeMs <= 0) throw new Error('INVALID_FRESHNESS_CONTRACT');
  if (!['fixture', 'live-connector'].includes(snapshot.source)) reasons.push('SOURCE_UNVERIFIED');
  if (snapshot.source === 'fixture') observations.push('FIXTURE_ONLY_NOT_PRODUCTION_PROOF');
  if (snapshot.complete !== true || snapshot.stable !== true) reasons.push('SNAPSHOT_INCOMPLETE_OR_CHANGED');
  if (!Number.isFinite(time(snapshot.collectedAt)) || time(snapshot.collectedAt) > now || now - time(snapshot.collectedAt) > maxSnapshotAgeMs) reasons.push('SNAPSHOT_STALE');
  if (!sha(snapshot.mainSha)) reasons.push('MAIN_SHA_MISSING');
  const ci = inspectCI(snapshot, now, maxCIAgeMs);
  observations.push(...ci.observations);
  let status = 'needs-analysis', approval = null;
  if (snapshot.issue.state === 'closed') {
    const availabilityOnly = new Set(['CI_FRESHNESS_REVIEW_REQUIRED', 'EVIDENCE_EXPIRED_OR_UNKNOWN', 'EVIDENCE_ARTIFACT_MISSING']);
    const technicalHistoryValid = ci.run?.historicalConclusion === 'success' && ci.reasons.every(reason => availabilityOnly.has(reason));
    status = snapshot.issue.state_reason === 'completed' && snapshot.pr?.merged === true && technicalHistoryValid ? 'closed-completed' : 'closed-paused';
    if (snapshot.issue.state_reason === 'completed') observations.push('GITHUB_COMPLETED_IS_NOT_FULL_DELIVERY_VERIFICATION');
    observations.push(...ci.reasons.map(r => `HISTORICAL_REVIEW:${r}`));
    observations.push('CLOSED_ISSUE_NO_ADVANCEMENT_OR_AUTOMATIC_REOPEN');
  } else {
    if (snapshot.issue.state !== 'open') reasons.push('ISSUE_STATE_UNKNOWN');
    const gate = contract.gate;
    if (gate && !['plan', 'merge'].includes(gate)) reasons.push('UNKNOWN_GATE');
    if (gate === 'merge') {
      if (contract.request?.closeAfterMain !== true) observations.push('CLOSE_NOT_AUTHORIZED_BY_REQUEST_SCOPE');
      reasons.push(...ci.reasons);
      if (!snapshot.pr || snapshot.pr.state !== 'open' || snapshot.pr.merged) reasons.push('MERGE_TARGET_NOT_OPEN');
      if (snapshot.pr?.mergeable !== true) reasons.push('MERGEABILITY_UNVERIFIED');
      if (snapshot.pr?.draft === true) observations.push('DRAFT_PR_REQUIRES_REVIEW');
    }
    if (gate) {
      if (!Array.isArray(contract.ownCommentIds)) reasons.push('SELF_COMMENT_LOG_MISSING');
      approval = await inspectApproval(snapshot, gate, contract.request, contract.ownCommentIds, verifyHuman);
      reasons.push(...approval.reasons);
      if (contract.ui !== false) reasons.push('DESIGN_IMAGE_ACCESS_AND_VISUAL_REVIEW_NOT_VERIFIED');
      if (gate === 'merge' && contract.ui !== false) reasons.push('IMPLEMENTATION_VISUAL_REVIEW_NOT_VERIFIED');
      status = 'review-candidate';
    }
  }
  if (reasons.length) status = 'blocked';
  const summary = { repository: snapshot.repository, issue: snapshot.issue.number, pr: snapshot.pr?.number ?? null,
    status, source: snapshot.source, mainSha: snapshot.mainSha, headSha: snapshot.pr?.head?.sha ?? null,
    reasons: [...new Set(reasons)], observations: [...new Set(observations)], ci, approval };
  const conclusionDigest = digest(summary);
  return { schema: 'ono-read-only-report-v1', ...summary, collectedAt: snapshot.collectedAt,
    evaluatedAt: new Date(now).toISOString(), conclusionDigest,
    changed: previousReport?.conclusionDigest !== conclusionDigest,
    observedClosure: snapshot.issue.state === 'closed' ? snapshot.issue.state_reason ?? 'unspecified' : null,
    deliveryCompletionVerified: false,
    capabilities: { readOnly: true, grantsApproval: false, executesActions: false, scheduled: false },
    gates: ['原 Issue 方案批准后实现和测试', '原 Issue 批准准确 PR head 合入；仅批准范围含主干通过后关单时可后续关单'],
    limits: ['No human identity adapter is implemented.', 'Release authorization remains separate.',
      'No durable execution state, task lock, mutation, approval consumption or runtime policy migration.',
      'A previous report never authorizes or substitutes for a new read.'] };
}
