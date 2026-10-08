import { createHash } from 'node:crypto';

export const REPOSITORY = 'zhshenry/onosan_workbench';
// Fixed reviewed input, not an assertion that runtime deployment is authorized.
export const POLICY = Object.freeze({
  repository: REPOSITORY,
  commit: '1fbb152818b02e6a7163e420dfc7725c955c3339',
  path: 'docs/ONO-ISSUE-WORKFLOW.md',
  sha256: '1fde7417e4a28ebdecc076511eb351faec58b8577c9f0aa221d388213c9e035e',
});
export const hash = value => createHash('sha256').update(value).digest('hex');
export function requireThat(condition, code) { if (!condition) throw new Error(code); }
export const digest = value => hash(JSON.stringify(value));
const sha = value => typeof value === 'string' && /^[a-f0-9]{40}$/.test(value);
const hex = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const positive = value => Number.isSafeInteger(value) && value > 0;
const word = value => typeof value === 'string' && /^[a-zA-Z0-9._-]+$/.test(value);

export async function readPolicy(read) {
  const actual = await read(POLICY);
  requireThat(actual && actual.repository === POLICY.repository && actual.commit === POLICY.commit &&
    actual.path === POLICY.path && typeof actual.content === 'string', 'POLICY_UNREADABLE_OR_REF_MISMATCH');
  // Normalize checkout line endings only; never normalize other content changes.
  const content = actual.content.replace(/\r\n/g, '\n');
  requireThat(!/^(<<<<<<<|=======|>>>>>>>)/m.test(content) && actual.conflicts?.length === 0,
    'POLICY_CONFLICT_OR_INSTRUCTIONS_UNRESOLVED');
  requireThat(hash(content) === POLICY.sha256, 'POLICY_CHANGED');
  return POLICY;
}

export function targetKey(target) {
  requireThat(target?.repository === REPOSITORY && positive(target.issue) &&
    word(target.planVersion) && hex(target.planDigest), 'INVALID_TARGET');
  const common = [target.repository, target.issue, target.planVersion, target.planDigest];
  if (target.kind === 'plan') return JSON.stringify([...common, 'plan']);
  requireThat(positive(target.pr) && sha(target.sha), 'INVALID_COMMIT_TARGET');
  if (target.kind === 'merge') return JSON.stringify([...common, 'merge', target.pr, target.sha]);
  requireThat(target.kind === 'release' && word(target.version) && hex(target.changeSetDigest), 'INVALID_RELEASE_TARGET');
  return JSON.stringify([...common, 'release', target.pr, target.sha, target.version, target.changeSetDigest]);
}

// Strict one-line grammar intentionally rejects bare /approve and natural-language guesses.
export function approvalCommand(target) {
  targetKey(target);
  let command = `/ono approve ${target.kind} issue=${target.issue} plan=${target.planVersion} digest=${target.planDigest}`;
  if (target.kind !== 'plan') command += ` pr=${target.pr} sha=${target.sha}`;
  if (target.kind === 'release') command += ` version=${target.version} changes=${target.changeSetDigest}`;
  return command;
}
export function sourceDigest(source) {
  return digest([source.id, source.url, source.author, source.createdAt, source.updatedAt, source.body]);
}
export async function checkApproval(source, target, ownComments, verifyHuman = async () => false, now = Date.now()) {
  requireThat(source && typeof source.id === 'string' && /^[0-9]+$/.test(source.id) &&
    typeof source.author === 'string' && source.author.trim().length > 0 && source.repository === REPOSITORY &&
    source.thread === (target.kind === 'merge' ? `pr:${target.pr}` : `issue:${target.issue}`), 'APPROVAL_WRONG_THREAD');
  requireThat(!ownComments.includes(source.id) && !source.body.includes('[OnO]'), 'SELF_APPROVAL');
  requireThat(source.active === true && source.createdAt === source.updatedAt &&
    Number.isFinite(Date.parse(source.createdAt)) && Date.parse(source.createdAt) <= now, 'APPROVAL_EDITED_REVOKED_OR_FUTURE');
  const number = target.kind === 'merge' ? target.pr : target.issue;
  const path = target.kind === 'merge' ? 'pull' : 'issues';
  requireThat(source.url === `https://github.com/${REPOSITORY}/${path}/${number}#issuecomment-${source.id}`,
    'APPROVAL_SOURCE_URL');
  requireThat(source.body === approvalCommand(target), 'APPROVAL_NOT_EXPLICIT_OR_TARGET_CHANGED');
  // This verifier is a TRUSTED adapter, not a flag from a comment or GitHub author field.
  // It must independently attest to this exact content, identity, time and target.
  requireThat(await verifyHuman({ source: structuredClone(source), sourceDigest: sourceDigest(source),
    targetKey: targetKey(target) }) === true, 'HUMAN_PROVENANCE_UNVERIFIED');
  return { id: source.id, url: source.url, author: source.author, createdAt: source.createdAt,
    updatedAt: source.updatedAt, digest: sourceDigest(source), targetKey: targetKey(target) };
}

const stages = { plan: ['awaiting-plan', 'developing'], merge: ['awaiting-merge', 'main-validation'],
  release: ['awaiting-release', 'released'] };
function checkTask(task, target) {
  requireThat(task?.open === true, 'TASK_CLOSED');
  requireThat(Number.isSafeInteger(task.revision) && task.revision >= 0, 'INVALID_TASK_REVISION');
  requireThat(task.stage === stages[target.kind]?.[0] && targetKey(task.target) === targetKey(target), 'TASK_PRECONDITION');
}

/** Storage contract: transaction callbacks are synchronous, atomic and must not escape live state.
 * Remote implementation must enforce lease fencing and expected revision atomically at commit.
 * This memory implementation proves only simulation behavior, not cloud durability/concurrency.
 */
export class MemoryStore {
  constructor(snapshot) {
    this.data = structuredClone(snapshot ?? { epoch: 0, lease: null, tasks: {}, ownComments: [], consumed: {}, operations: {} });
  }
  snapshot() { return structuredClone(this.data); }
  transaction(fn) {
    const next = this.snapshot(); const result = fn(next);
    requireThat(!result?.then, 'ASYNC_TRANSACTION_FORBIDDEN');
    this.data = structuredClone(next); return structuredClone(result);
  }
  acquire(owner, now, ttl) {
    requireThat(word(owner) && Number.isFinite(now) && Number.isSafeInteger(ttl) && ttl > 0, 'INVALID_LEASE');
    return this.transaction(s => {
      requireThat(!s.lease || s.lease.until <= now, 'LOCK_BUSY');
      s.lease = { owner, token: ++s.epoch, until: now + ttl }; return s.lease;
    });
  }
  renew(lease, now, ttl) {
    requireThat(Number.isSafeInteger(ttl) && ttl > 0, 'INVALID_LEASE');
    return this.transaction(s => { assertLease(s, lease, now); s.lease.until = now + ttl; return s.lease; });
  }
  guarded(lease, now, fn) { return this.transaction(s => { assertLease(s, lease, now); return fn(s); }); }
}
function assertLease(state, lease, now) {
  requireThat(Number.isFinite(now) && state.lease && lease && state.lease.owner === lease.owner &&
    state.lease.token === lease.token && state.lease.until > now, 'LOCK_LOST');
}

/** No network or product actions. Query is mandatory after an interrupted operation.
 * A real executor is intentionally not provided. A future writer must enforce fencing itself.
 */
export class SimulatedExecutor {
  constructor(snapshot = {}) { this.effects = structuredClone(snapshot); this.calls = 0; this.queries = 0; }
  async execute(operation) {
    this.calls++;
    requireThat(!Object.hasOwn(this.effects, operation.id), 'SIMULATED_DUPLICATE');
    const result = { simulated: true, operationId: operation.id, targetKey: operation.targetKey };
    this.effects[operation.id] = result; return structuredClone(result);
  }
  async query(operation) {
    this.queries++; return this.effects[operation.id] ? { status: 'found', result: structuredClone(this.effects[operation.id]) } : { status: 'absent' };
  }
}

export class WorkflowCore {
  constructor({ store, executor, read, readApproval, verifyHuman, validateEvidence, clock = Date.now }) {
    Object.assign(this, { store, executor, read, readApproval, verifyHuman, validateEvidence, clock });
  }
  async validate(request, lease) {
    await readPolicy(this.read); // Every round, including recovery; no cached policy success.
    const before = this.store.guarded(lease, this.clock(), s => s.tasks[request.target.issue]);
    checkTask(before, request.target);
    requireThat(before.revision === request.revision, 'STALE_TASK_REVISION');
    const source = await this.readApproval(request.sourceId);
    requireThat(source?.id === request.sourceId, 'APPROVAL_SOURCE_CHANGED');
    const approval = await checkApproval(source, request.target, this.store.snapshot().ownComments,
      this.verifyHuman, this.clock());
    requireThat(typeof this.validateEvidence === 'function', 'EVIDENCE_ADAPTER_MISSING');
    // Evidence adapter must fetch current documents/blobs; caller-supplied success flags are not evidence.
    const evidence = await this.validateEvidence(structuredClone(before));
    requireThat(evidence?.valid === true && evidence.targetKey === targetKey(request.target), 'EVIDENCE_REJECTED');
    return { before, approval, evidence };
  }
  async run(request, lease) {
    requireThat(word(request.id) && !['__proto__', 'constructor', 'prototype'].includes(request.id), 'INVALID_OPERATION_ID');
    const checked = await this.validate(request, lease);
    const operation = this.store.guarded(lease, this.clock(), s => {
      const task = s.tasks[request.target.issue]; checkTask(task, request.target);
      requireThat(task.revision === checked.before.revision, 'STALE_TASK_REVISION');
      requireThat(!Object.hasOwn(s.operations, request.id), 'DUPLICATE_OPERATION_USE_RECOVERY');
      requireThat(!Object.values(s.operations).some(op => op.issue === request.target.issue && op.status === 'prepared'), 'TASK_OPERATION_PENDING');
      requireThat(!s.ownComments.includes(checked.approval.id), 'SELF_APPROVAL');
      requireThat(!Object.hasOwn(s.consumed, checked.approval.id), 'APPROVAL_ALREADY_CONSUMED');
      if (request.target.kind === 'plan') requireThat(!Object.values(s.tasks).some(t => ['developing', 'development-reserved'].includes(t.stage)), 'DEVELOPMENT_SLOT_BUSY');
      const operation = { id: request.id, issue: request.target.issue, targetKey: targetKey(request.target),
        revision: task.revision, from: task.stage, to: stages[request.target.kind][1],
        status: 'prepared', approval: checked.approval, evidence: checked.evidence,
        policy: POLICY, time: this.clock(), leaseToken: lease.token };
      s.operations[request.id] = operation;
      s.consumed[checked.approval.id] = { operationId: request.id, time: operation.time };
      // Reserve the single developer slot before any asynchronous execution.
      if (request.target.kind === 'plan') task.stage = 'development-reserved';
      return operation;
    });
    // No automatic retry. Throws, interruption or lost lease leave a prepared record for query recovery.
    const result = await this.executor.execute(structuredClone(operation));
    await this.revalidate(operation);
    return this.finish(operation, result, lease);
  }
  finish(operation, result, lease) {
    requireThat(result?.simulated === true && result.operationId === operation.id && result.targetKey === operation.targetKey,
      'SIMULATED_RESULT_MISMATCH');
    return this.store.guarded(lease, this.clock(), s => {
      const op = s.operations[operation.id], task = s.tasks[operation.issue];
      requireThat(op?.status === 'prepared' && op.targetKey === operation.targetKey, 'OPERATION_NOT_PENDING');
      requireThat(task.open && task.revision === op.revision && targetKey(task.target) === op.targetKey &&
        task.stage === (op.from === 'awaiting-plan' ? 'development-reserved' : op.from), 'TASK_CHANGED_DURING_OPERATION');
      op.status = 'succeeded'; op.result = result; op.finishedAt = this.clock();
      task.stage = op.to; task.revision++; return op;
    });
  }
  async revalidate(operation) {
    const task = this.store.snapshot().tasks[operation.issue];
    requireThat(task?.open && targetKey(task.target) === operation.targetKey, 'TASK_CHANGED_DURING_OPERATION');
    const approval = await checkApproval(await this.readApproval(operation.approval.id), task.target,
      this.store.snapshot().ownComments, this.verifyHuman, this.clock());
    requireThat(approval.digest === operation.approval.digest, 'APPROVAL_SOURCE_CHANGED');
    const evidence = await this.validateEvidence(task);
    requireThat(evidence?.valid === true && evidence.targetKey === operation.targetKey &&
      digest(evidence) === digest(operation.evidence), 'EVIDENCE_CHANGED_DURING_OPERATION');
  }
  async recover(id, lease) {
    await readPolicy(this.read);
    const operation = this.store.guarded(lease, this.clock(), s => s.operations[id]);
    requireThat(operation?.status === 'prepared', 'NO_PENDING_OPERATION');
    // Query first. Never repeat an uncertain operation, even if the adapter reports absent.
    const outcome = await this.executor.query(structuredClone(operation));
    this.store.guarded(lease, this.clock(), s => { s.operations[id].lastQuery = { status: outcome.status, time: this.clock() }; });
    requireThat(outcome.status === 'found', 'RECOVERY_UNRESOLVED_NO_RETRY');
    // Recovery only records simulated outcome; it does not issue a new external action.
    await this.revalidate(operation);
    return this.finish(operation, outcome.result, lease);
  }
}
