// JEV accept gate. Calls the OpenRouter Decisions API (typesafe/jev) and emits an enum.
// Callers branch on the enum and the exit code. They do not re-threshold noul scores.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const ROOT = path.resolve(import.meta.dirname, '..');
export const POLICY_PATH = path.join(ROOT, 'tooling', 'jev-policy.json');
export const DEFAULT_LEDGER = path.join(ROOT, 'docs', 'issues', 'jev-ledger.jsonl');
export const MODES = ['functional', 'important_ui', 'optimize'];
const ID_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const KNOWN_FLAGS = new Set([
  'gate', 'issue', 'head', 'spec', 'mode', 'dynamic', 'base', 'dry-run', 'skip-tests',
  'issue-body', 'verify', 'help',
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

export function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [key, sortValue(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortValue(value));
}

export function parseArgs(argv) {
  const out = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') continue;
    if (!token.startsWith('--')) {
      out._.push(token);
      continue;
    }
    const body = token.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      out[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) out[body] = true;
    else {
      out[body] = next;
      index += 1;
    }
  }
  return out;
}

function flag(args, name) {
  const value = args[name];
  if (value === undefined || value === false || value === 'false') return false;
  if (value === true || value === '' || value === 'true') return true;
  throw fail('ARGS', `--${name} does not take a value`);
}

function needString(args, name) {
  const value = args[name];
  if (typeof value !== 'string' || !value.trim()) throw fail('ARGS', `missing --${name}`);
  return value.trim();
}

export function loadPolicy(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw fail('POLICY', 'jev-policy.json is not valid JSON');
  }
  const errors = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) errors.push('root');
  if (typeof raw?.policy_version !== 'string' || !raw.policy_version.trim()) errors.push('policy_version');
  if (raw?.model !== 'typesafe/jev-1.14') errors.push('model');
  if (raw?.endpoint_path !== '/api/alpha/decisions') errors.push('endpoint_path');
  if (typeof raw?.default_base_url !== 'string' || !raw.default_base_url.startsWith('https://')) errors.push('default_base_url');
  const approve = raw?.thresholds?.approve_min;
  const reject = raw?.thresholds?.reject_max;
  if (typeof approve !== 'number' || typeof reject !== 'number' || !Number.isFinite(approve) || !Number.isFinite(reject) || !(approve > reject) || approve > 1 || reject < 0) {
    errors.push('thresholds');
  }
  if (raw?.important_ui?.skip_jev_final !== true) errors.push('important_ui.skip_jev_final');
  if (!Array.isArray(raw?.fixed_propositions)) errors.push('fixed_propositions');
  const ids = new Set();
  for (const item of raw?.fixed_propositions ?? []) {
    if (!ID_RE.test(item?.id ?? '')) errors.push(`id:${item?.id ?? ''}`);
    else if (ids.has(item.id)) errors.push(`duplicate:${item.id}`);
    else ids.add(item.id);
    if (item?.type !== 'noul') errors.push(`type:${item?.id ?? ''}`);
    if (typeof item?.instructions !== 'string' || !item.instructions.trim()) errors.push(`instructions:${item?.id ?? ''}`);
    if (typeof item?.criteria?.true !== 'string' || !item.criteria.true.trim() || typeof item?.criteria?.false !== 'string' || !item.criteria.false.trim()) {
      errors.push(`criteria:${item?.id ?? ''}`);
    }
  }
  for (const required of ['A2_matches_spec', 'A5_regression_covered', 'A6_scope_contained', 'A8_evidence_sufficient']) {
    if (!ids.has(required)) errors.push(`missing:${required}`);
  }
  const a8 = raw?.fixed_propositions?.find(item => item.id === 'A8_evidence_sufficient');
  if (a8 && a8.gated_by_mode !== 'optimize') errors.push('A8:gated_by_mode');
  if (errors.length) throw fail('POLICY', `invalid jev policy: ${errors.join(', ')}`);
  return raw;
}

export function readPolicyFile(file = POLICY_PATH) {
  const bytes = readFileSync(file);
  return { policy: loadPolicy(bytes.toString('utf8')), policy_hash: sha256Hex(bytes), bytes };
}

export function selectFixed(policy, mode) {
  return policy.fixed_propositions.filter(item => {
    if (item.gated_by_mode) return item.gated_by_mode === mode;
    if (Array.isArray(item.modes) && item.modes.length > 0) return item.modes.includes(mode);
    return false;
  });
}

function toApiQuestion(item) {
  return {
    type: 'noul',
    instructions: item.instructions.trim(),
    criteria: { true: item.criteria.true.trim(), false: item.criteria.false.trim() },
  };
}

export function normalizeDynamic(value) {
  let list = value;
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(value.questions)) list = value.questions;
    else if (value.questions && typeof value.questions === 'object') {
      list = Object.entries(value.questions).map(([id, question]) => ({ id, ...question }));
    } else {
      throw fail('ARGS', 'dynamic questions file must contain a questions array or map');
    }
  }
  if (!Array.isArray(list)) throw fail('ARGS', 'dynamic questions file must contain 1 to 3 questions');
  if (list.length < 1 || list.length > 3) throw fail('ARGS', 'dynamic questions must contain 1 to 3 noul questions');
  return list.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw fail('ARGS', `dynamic question ${index + 1} is not an object`);
    if (!ID_RE.test(item.id ?? '')) throw fail('ARGS', `dynamic question ${index + 1} has an invalid id`);
    if (item.type !== undefined && item.type !== 'noul') throw fail('ARGS', `dynamic question ${item.id} must be type noul`);
    if (typeof item.instructions !== 'string' || !item.instructions.trim()) throw fail('ARGS', `dynamic question ${item.id} needs instructions`);
    if (typeof item.criteria?.true !== 'string' || !item.criteria.true.trim() || typeof item.criteria?.false !== 'string' || !item.criteria.false.trim()) {
      throw fail('ARGS', `dynamic question ${item.id} needs criteria.true and criteria.false`);
    }
    return { id: item.id, type: 'noul', instructions: item.instructions, criteria: { true: item.criteria.true, false: item.criteria.false } };
  });
}

export function mergeQuestions(fixedList, dynamicList) {
  const map = {};
  const ids = [];
  const add = item => {
    if (Object.prototype.hasOwnProperty.call(map, item.id)) throw fail('ARGS', `duplicate proposition id: ${item.id}`);
    map[item.id] = toApiQuestion(item);
    ids.push(item.id);
  };
  for (const item of fixedList) add(item);
  for (const item of dynamicList) add(item);
  if (ids.length === 0) throw fail('ARGS', 'no noul propositions to ask');
  return { map, ids };
}

export function expectedQuestionsHash(policy, mode, dynamicQuestions = []) {
  if (mode === 'important_ui') {
    return sha256Hex(canonicalJson({
      policy_version: policy.policy_version,
      mode,
      reason: 'skip_jev_final',
      questions: null,
    }));
  }
  const { map, ids } = mergeQuestions(selectFixed(policy, mode), dynamicQuestions);
  return sha256Hex(canonicalJson({ policy_version: policy.policy_version, mode, ids, questions: map }));
}

export function routeNoulScores(scores, thresholds) {
  const values = Object.values(scores);
  if (values.length === 0 || values.some(value => typeof value !== 'number' || !Number.isFinite(value))) {
    return { enum: 'HUMAN_REVIEW', reason: 'missing_answers' };
  }
  if (values.some(value => value <= thresholds.reject_max)) {
    return { enum: 'RETRY', reason: 'noul_at_or_below_reject_max' };
  }
  if (values.every(value => value >= thresholds.approve_min)) {
    return { enum: 'AUTO_ACCEPT', reason: 'all_noul_at_or_above_approve_min' };
  }
  return { enum: 'HUMAN_REVIEW', reason: 'noul_between_thresholds' };
}

export function scoresFromAnswers(answers, ids) {
  const scores = {};
  const missing = [];
  for (const id of ids) {
    const answer = answers?.[id];
    const noul = answer?.noul;
    if (!answer || (answer.type !== undefined && answer.type !== 'noul') || typeof noul !== 'number' || !Number.isFinite(noul) || noul < 0 || noul > 1) {
      missing.push(id);
      continue;
    }
    scores[id] = noul;
  }
  return { scores, missing };
}

function costOf(parsed) {
  const cost = parsed?.usage?.cost;
  return typeof cost === 'number' && Number.isFinite(cost) ? cost : null;
}

function safeSnippet(value) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!cleaned || /bearer|sk-or-|api[_-]?key/i.test(cleaned)) return null;
  return cleaned;
}

export function decideFromHttp({ status, body, ids, thresholds, requestedModel }) {
  const empty = { scores: {}, cost: null, provider_id: null, model: null, http_status: status ?? null };
  if (!Number.isInteger(status) || status < 200 || status >= 300) {
    let snippet = null;
    if (typeof body === 'string' && body.trim()) {
      try {
        const parsed = JSON.parse(body);
        snippet = safeSnippet(parsed?.error?.message ?? parsed?.error);
      } catch {
        snippet = null;
      }
    }
    return { enum: 'HUMAN_REVIEW', reason: status ? 'http_status' : 'network', ...empty, http_error: snippet };
  }
  let parsed = body;
  if (typeof body === 'string') {
    try {
      parsed = JSON.parse(body);
    } catch {
      return { enum: 'HUMAN_REVIEW', reason: 'invalid_json', ...empty };
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { enum: 'HUMAN_REVIEW', reason: 'invalid_json', ...empty };
  }
  const model = typeof parsed.model === 'string' ? parsed.model : '';
  const providerId = typeof parsed.id === 'string' ? parsed.id : null;
  const cost = costOf(parsed);
  if (!(model === requestedModel || model.startsWith(`${requestedModel}-`))) {
    return { enum: 'HUMAN_REVIEW', reason: 'model_mismatch', ...empty, model: model || null, cost, provider_id: providerId };
  }
  const { scores, missing } = scoresFromAnswers(parsed.answers, ids);
  if (missing.length > 0) {
    return { enum: 'HUMAN_REVIEW', reason: 'missing_answers', ...empty, scores, missing, model, cost, provider_id: providerId };
  }
  const routed = routeNoulScores(scores, thresholds);
  return { ...routed, scores, cost, provider_id: providerId, model, http_status: status };
}

export function exitCodeFor(decision) {
  switch (decision) {
    case 'AUTO_ACCEPT':
    case 'PENDING_HUMAN':
    case 'DRY_RUN':
      return 0;
    case 'RETRY':
      return 2;
    case 'HUMAN_REVIEW':
      return 3;
    default:
      return 1;
  }
}

export function humanLine(summary) {
  const issue = summary.issue ?? '-';
  const gate = summary.gate ?? 'accept';
  const decision = summary.enum ?? 'ERROR';
  const reason = summary.reason ? ` (${summary.reason})` : '';
  if (summary.reason === 'help') return summary.error ?? 'JEV accept gate help.';
  if (decision === 'PENDING_HUMAN') return `JEV ${gate} #${issue} PENDING_HUMAN (skip_jev_final). Human gate 2 still required.`;
  if (decision === 'DRY_RUN') return `JEV ${gate} #${issue} DRY_RUN. Not an accept decision.`;
  if (decision === 'AUTO_ACCEPT') return `JEV ${gate} #${issue} AUTO_ACCEPT${reason}. Not a merge approval.`;
  if (!summary.enum) return `JEV ${gate} #${issue} ERROR${reason}.`;
  return `JEV ${gate} #${issue} ${decision}${reason}.`;
}

function clip(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return { text: value, truncated: false };
  return { text: `${value.slice(0, max)}\n…[truncated]`, truncated: true };
}

export function apiKeyFromEnv(env = process.env) {
  const raw = env.OPENROUTER_API_KEY || env.SYSTEM1_API_KEY || '';
  const key = String(raw).trim();
  if (!key) return null;
  if (/\s/.test(key)) throw fail('ARGS', 'API key contains whitespace');
  return key;
}

export function resolveLedgerPath(env = process.env, cwd = process.cwd()) {
  const override = env.JEV_LEDGER_PATH;
  if (typeof override === 'string' && override.trim()) return path.resolve(cwd, override.trim());
  return DEFAULT_LEDGER;
}

export function endpointFromEnv(policy, env = process.env) {
  const base = env.SYSTEM1_API_BASE_URL || env.OPENROUTER_API_BASE_URL || policy.default_base_url;
  if (typeof base !== 'string' || !base.trim()) throw fail('ARGS', 'missing decisions base URL');
  const suffix = policy.endpoint_path.startsWith('/') ? policy.endpoint_path : `/${policy.endpoint_path}`;
  let url;
  try {
    url = new URL(base.trim());
  } catch {
    throw fail('ARGS', 'invalid decisions base URL');
  }
  if (url.username || url.password) throw fail('ARGS', 'decisions URL must not include credentials');
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw fail('ARGS', 'decisions URL must be https, or http on localhost');
  }
  // Base URL is the origin root. A pasted /api/alpha/decisions suffix is removed so it is not joined twice.
  let pathname = url.pathname.replace(/\/+$/, '');
  if (pathname === '/') pathname = '';
  while (pathname.endsWith(suffix)) pathname = pathname.slice(0, -suffix.length).replace(/\/+$/, '');
  if (pathname.includes(suffix)) throw fail('ARGS', `decisions base URL must be an origin root, not a path containing ${suffix}`);
  url.pathname = `${pathname}${suffix}`;
  url.search = '';
  url.hash = '';
  return url;
}

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 10_000_000 });
  if (result.error) throw fail('GIT', result.error.message);
  if (result.status !== 0) throw fail('GIT', (result.stderr || `git ${args[0]} failed`).trim());
  return result.stdout;
}

function resolveCommit(ref) {
  const trimmed = String(ref).trim();
  // A full SHA is already resolved. Shallow CI checkouts have no parents, and a
  // hash-bound mismatch check may use a SHA that is not in this clone.
  if (/^[0-9a-f]{40}$/i.test(trimmed)) return trimmed.toLowerCase();
  return git(['rev-parse', '--verify', `${trimmed}^{commit}`]).trim();
}

function collectDiff(base, head) {
  // Name-only and stat are separate calls so a stat graph cannot be mistaken for a path.
  const read = (label, range) => {
    const names = spawnSync('git', ['diff', '--name-only', range], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10_000_000 });
    const stat = spawnSync('git', ['diff', '--stat', range], { cwd: ROOT, encoding: 'utf8', maxBuffer: 10_000_000 });
    if (names.status === 0 && stat.status === 0) {
      return {
        diff_mode: label,
        changed_files: names.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean),
        diffstat: stat.stdout.trim(),
      };
    }
    return { error: (names.stderr || stat.stderr || 'git diff failed').trim() };
  };
  const triple = read('triple-dot', `${base}...${head}`);
  if (!triple.error) return triple;
  const dual = read('double-dot', `${base}..${head}`);
  if (!dual.error) return dual;
  throw fail('GIT', triple.error || dual.error || 'git diff failed');
}

function runNpmTest(env) {
  if (env.npm_lifecycle_event === 'test' || env.JEV_GATE_RUNNING_TESTS === '1') {
    throw fail('ARGS', 'refusing to spawn npm test from inside npm test; pass --skip-tests');
  }
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const result = spawnSync(npm, ['test'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8_000_000,
    timeout: 15 * 60 * 1000,
    env: { ...env, JEV_GATE_RUNNING_TESTS: '1' },
  });
  if (result.error && result.error.code === 'ENOENT') throw fail('ARGS', 'npm was not found');
  const timedOut = result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM';
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  const tail = clip(output, 2000).text;
  if (timedOut || result.error) {
    return { status: 'failed', exit_code: result.status ?? null, command: 'npm test', tail, timed_out: Boolean(timedOut), spawn_error: result.error ? result.error.code ?? result.error.message : null };
  }
  return {
    status: result.status === 0 ? 'passed' : 'failed',
    exit_code: result.status,
    command: 'npm test',
    tail,
    timed_out: false,
  };
}

function readOptionalFile(fileArg, cwd, label) {
  if (fileArg === undefined) return null;
  if (typeof fileArg !== 'string' || !fileArg.trim()) throw fail('ARGS', `missing ${label} path`);
  const candidate = path.resolve(cwd, fileArg.trim());
  if (!existsSync(candidate) || !statSync(candidate).isFile()) throw fail('ARGS', `${label} file not found: ${fileArg}`);
  return readFileSync(candidate, 'utf8');
}

export function readSpec(specArg, cwd = process.cwd()) {
  if (typeof specArg !== 'string' || !specArg.trim()) throw fail('ARGS', 'missing --spec');
  const spec = specArg.trim();
  const looksPath = spec.includes('/') || spec.includes('\\') || /\.(md|txt|json|ya?ml)$/i.test(spec);
  for (const candidate of [path.resolve(cwd, spec), path.resolve(ROOT, spec)]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return readFileSync(candidate, 'utf8');
  }
  if (looksPath) throw fail('ARGS', `spec file not found: ${specArg}`);
  return specArg;
}

function issueMeta(issue, bodyText) {
  if (bodyText == null) return { number: String(issue) };
  const clipped = clip(bodyText, 16_000);
  const trimmed = clipped.text.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const meta = { number: String(issue) };
        for (const key of Object.keys(parsed)) {
          if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === 'number') continue;
          meta[key] = parsed[key];
        }
        return meta;
      }
    } catch {
      // Fall through and keep the body as text.
    }
  }
  return { number: String(issue), body: clipped.text, body_truncated: clipped.truncated };
}

function artifactsNote(issue) {
  const relative = path.join('artifacts', 'accept', String(issue), 'state.json');
  if (existsSync(path.join(ROOT, relative))) {
    return `accept-float state present at ${relative.split(path.sep).join('/')}; placeholder automation is not visual evidence`;
  }
  return 'no accept-float artifacts recorded';
}

function buildState({ issue, spec, head, base, diff, testResult, bodyText }) {
  const specClip = clip(spec, 24_000);
  const statClip = clip(diff.diffstat, 12_000);
  const files = diff.changed_files.slice(0, 500);
  const truncated = [];
  if (specClip.truncated) truncated.push('spec');
  if (statClip.truncated) truncated.push('diffstat');
  if (files.length < diff.changed_files.length) truncated.push('changed_files');
  return {
    issue: issueMeta(issue, bodyText),
    spec: specClip.text,
    evidence: {
      head,
      base,
      diffstat: statClip.text,
      changed_files: files,
      test_result: testResult,
      artifacts_note: artifactsNote(issue),
      diff_mode: diff.diff_mode,
      ...(truncated.length ? { truncated_fields: truncated } : {}),
    },
  };
}

function appendLedger(file, entry) {
  mkdirSync(path.dirname(file), { recursive: true });
  let prefix = '';
  if (existsSync(file) && statSync(file).size > 0) {
    const fd = openSync(file, 'r');
    try {
      const byte = Buffer.alloc(1);
      readSync(fd, byte, 0, 1, statSync(file).size - 1);
      if (byte[0] !== 0x0a) prefix = '\n';
    } finally {
      closeSync(fd);
    }
  }
  appendFileSync(file, `${prefix}${JSON.stringify(entry)}\n`, 'utf8');
}

export function assessLedger({ ledgerText, issue, head, base, policyHash, questionsHash }) {
  const entries = [];
  const lines = String(ledgerText ?? '').split(/\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line || line.startsWith('#')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return { exit_code: 1, reason: 'ledger_corrupt', line: index + 1 };
    }
    if (!row || typeof row !== 'object' || Array.isArray(row)) return { exit_code: 1, reason: 'ledger_corrupt', line: index + 1 };
    entries.push(row);
  }
  const forIssue = entries.filter(row => String(row.issue) === String(issue) && row.gate === 'accept');
  const entry = forIssue.at(-1);
  if (!entry) return { exit_code: 1, reason: 'no_ledger_entry' };
  if (entry.enum === 'DRY_RUN') return { exit_code: 1, reason: 'dry_run_not_verifiable', entry };
  if (entry.head_sha !== head) return { exit_code: 1, reason: 'head_mismatch', entry };
  if (entry.base_sha !== base) return { exit_code: 1, reason: 'base_mismatch', entry };
  if (entry.policy_hash !== policyHash) return { exit_code: 1, reason: 'policy_hash_mismatch', entry };
  if (typeof entry.questions_hash !== 'string' || !/^[a-f0-9]{64}$/.test(entry.questions_hash)) {
    return { exit_code: 1, reason: 'questions_hash_missing', entry };
  }
  if (!Number.isInteger(entry.dynamic_count) || entry.dynamic_count < 0) {
    return { exit_code: 1, reason: 'ledger_incomplete', entry };
  }
  if (questionsHash && entry.questions_hash !== questionsHash) {
    return { exit_code: 1, reason: 'questions_hash_mismatch', entry };
  }
  const exitCode = exitCodeFor(entry.enum);
  if (exitCode === 1) return { exit_code: 1, reason: 'unknown_enum', entry };
  return { exit_code: exitCode, reason: entry.reason ?? entry.enum, enum: entry.enum, entry };
}

function usageText() {
  return `Usage:
  node tooling/jev-gate.mjs --gate accept --issue <n> --head <sha> --spec <path-or-text> --mode functional|important_ui|optimize [--dynamic <file>] [--base <sha>] [--issue-body <file>] [--skip-tests] [--dry-run]
  node tooling/jev-gate.mjs --verify --issue <n> --head <sha> [--base <sha>] [--dynamic <file>]

Exit codes:
  0  AUTO_ACCEPT, PENDING_HUMAN after important_ui prechecks pass, or DRY_RUN
  1  hard error (args, policy, git, unreadable dynamic file, ledger write). Not an accept.
  2  RETRY
  3  HUMAN_REVIEW
PENDING_HUMAN and DRY_RUN are not acceptances and do not approve a merge. Read the enum.`;
}

function finish(partial, exitCode) {
  const summary = {
    consume: 'enum_and_exit_code_only',
    merge_authorized: false,
    called_jev: false,
    ledger_written: false,
    ...partial,
    exit_code: exitCode,
  };
  summary.human = humanLine(summary);
  return { summary, exitCode };
}

function ledgerEntry(fields) {
  const entry = {
    timestamp: fields.timestamp,
    issue: String(fields.issue),
    gate: 'accept',
    enum: fields.enum,
    scores: fields.scores ?? {},
    head_sha: fields.head,
    base_sha: fields.base,
    policy_hash: fields.policy_hash,
    policy_version: fields.policy_version,
    questions_hash: fields.questions_hash,
    latency_ms: fields.latency_ms ?? 0,
    reason: fields.reason,
    mode: fields.mode,
    dynamic_count: fields.dynamic_count ?? 0,
    called_jev: Boolean(fields.called_jev),
    prechecks_ok: Boolean(fields.prechecks_ok),
  };
  if (fields.cost != null) entry.cost = fields.cost;
  if (fields.provider_id) entry.provider_id = fields.provider_id;
  if (fields.model) entry.model = fields.model;
  return entry;
}

async function postDecision(url, key, body, fetchImpl) {
  const started = Date.now();
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(60_000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, text, latency_ms: Date.now() - started };
  } catch {
    return { status: 0, text: '', latency_ms: Date.now() - started };
  }
}

export async function run(argv, options = {}) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const cwd = options.cwd ?? process.cwd();
  const now = options.now ?? (() => new Date().toISOString());
  let args;
  try {
    args = parseArgs(argv);
    if (args._.length) throw fail('ARGS', `unexpected arguments: ${args._.join(' ')}`);
    for (const key of Object.keys(args)) {
      if (key !== '_' && !KNOWN_FLAGS.has(key)) throw fail('ARGS', `unknown flag --${key}`);
    }
    if (flag(args, 'help')) {
      return finish({ gate: 'accept', enum: null, reason: 'help', error: usageText() }, 0);
    }
  } catch (error) {
    return finish({ gate: 'accept', enum: null, reason: 'invalid_args', error: error.message }, 1);
  }

  const verify = flag(args, 'verify');
  try {
    if (!verify) {
      const gate = args.gate === undefined ? 'accept' : args.gate;
      if (gate !== 'accept') throw fail('ARGS', '--gate must be accept');
    } else if (args.gate !== undefined && args.gate !== 'accept' && args.gate !== true) {
      throw fail('ARGS', '--verify only applies to --gate accept');
    }
    if (flag(args, 'dry-run') && verify) throw fail('ARGS', '--dry-run cannot be combined with --verify');
    const issue = needString(args, 'issue');
    if (!/^\d+$/.test(issue)) throw fail('ARGS', '--issue must be a number');
    const headRef = needString(args, 'head');
    const baseRef = typeof args.base === 'string' && args.base.trim() ? args.base.trim() : 'main';
    const { policy, policy_hash: policyHash } = readPolicyFile(options.policyPath ?? POLICY_PATH);
    const head = resolveCommit(headRef);
    const base = resolveCommit(baseRef);
    const ledgerPath = resolveLedgerPath(env, cwd);

    if (verify) {
      if (args.mode !== undefined) throw fail('ARGS', '--mode is not used with --verify; the ledger line has the mode');
      const ledgerText = existsSync(ledgerPath) ? readFileSync(ledgerPath, 'utf8') : '';
      const preliminary = assessLedger({ ledgerText, issue, head, base, policyHash, questionsHash: null });
      if (preliminary.exit_code === 1) {
        return finish({
          gate: 'accept',
          issue,
          enum: null,
          reason: preliminary.reason,
          rejected_ledger_enum: preliminary.entry?.enum ?? null,
          head_sha: head,
          base_sha: base,
          policy_version: policy.policy_version,
          policy_hash: policyHash,
          ledger: ledgerPath,
          hash_ok: false,
        }, 1);
      }
      const mode = preliminary.entry.mode;
      if (!MODES.includes(mode)) throw fail('LEDGER', 'ledger mode is not valid');
      if (mode === 'important_ui' && args.dynamic !== undefined) {
        throw fail('ARGS', '--dynamic is not used for an important_ui ledger line');
      }
      let dynamic = [];
      if (mode !== 'important_ui' && preliminary.entry.dynamic_count > 0) {
        const text = readOptionalFile(args.dynamic, cwd, 'dynamic');
        if (text == null) throw fail('ARGS', '--dynamic is required to re-check a run that used dynamic propositions');
        dynamic = normalizeDynamic(JSON.parse(text.replace(/^\uFEFF/, '')));
      } else if (args.dynamic !== undefined && preliminary.entry.dynamic_count === 0) {
        throw fail('ARGS', '--dynamic was not part of the recorded run');
      }
      const questionsHash = expectedQuestionsHash(policy, mode, dynamic);
      const assessed = assessLedger({ ledgerText, issue, head, base, policyHash, questionsHash });
      const failed = assessed.exit_code === 1;
      return finish({
        gate: 'accept',
        issue,
        mode,
        enum: failed ? null : assessed.enum ?? null,
        reason: assessed.reason,
        rejected_ledger_enum: failed ? assessed.entry?.enum ?? null : null,
        head_sha: head,
        base_sha: base,
        policy_version: policy.policy_version,
        policy_hash: policyHash,
        questions_hash: questionsHash,
        scores: failed ? {} : assessed.entry?.scores ?? {},
        ledger: ledgerPath,
        hash_ok: !failed,
        questions_rechecked: true,
      }, assessed.exit_code);
    }

    const mode = needString(args, 'mode');
    if (!MODES.includes(mode)) throw fail('ARGS', '--mode must be functional, important_ui, or optimize');
    const dryRun = flag(args, 'dry-run');
    const skipTests = flag(args, 'skip-tests');
    const spec = readSpec(needString(args, 'spec'), cwd);
    const bodyText = readOptionalFile(args['issue-body'], cwd, 'issue-body');
    if (mode === 'important_ui' && args.dynamic !== undefined) {
      throw fail('ARGS', '--dynamic is not used when mode is important_ui (skip_jev_final)');
    }
    let dynamic = [];
    if (args.dynamic !== undefined) {
      const text = readOptionalFile(args.dynamic, cwd, 'dynamic');
      dynamic = normalizeDynamic(JSON.parse(text.replace(/^\uFEFF/, '')));
    }
    const diff = collectDiff(base, head);
    const testResult = skipTests
      ? { status: 'skipped', exit_code: null, command: null, tail: null, timed_out: false, reason: 'skip-tests' }
      : (options.testRunner ? options.testRunner() : runNpmTest(env));
    const questionsHash = expectedQuestionsHash(policy, mode, dynamic);
    const prechecksOk = testResult.status === 'passed' || testResult.status === 'skipped';
    const common = {
      gate: 'accept',
      issue,
      mode,
      head_sha: head,
      base_sha: base,
      policy_version: policy.policy_version,
      policy_hash: policyHash,
      questions_hash: questionsHash,
      test_result: testResult,
      ledger: ledgerPath,
      scores: {},
    };

    const writeAndFinish = (fields, exitCode) => {
      const entry = ledgerEntry({
        timestamp: now(),
        issue,
        enum: fields.enum,
        scores: fields.scores ?? {},
        head,
        base,
        policy_hash: policyHash,
        policy_version: policy.policy_version,
        questions_hash: questionsHash,
        latency_ms: fields.latency_ms ?? 0,
        reason: fields.reason,
        mode,
        dynamic_count: mode === 'important_ui' ? 0 : dynamic.length,
        called_jev: fields.called_jev,
        prechecks_ok: fields.prechecks_ok,
        cost: fields.cost,
        provider_id: fields.provider_id,
        model: fields.model,
      });
      if (dryRun) {
        return finish({ ...common, ...fields, ledger_written: false, dry_run: true }, exitCode);
      }
      try {
        appendLedger(ledgerPath, entry);
      } catch (error) {
        return finish({ ...common, ...fields, ledger_written: false, reason: 'ledger_write_failed', error: error.message, enum: fields.enum }, 1);
      }
      return finish({ ...common, ...fields, ledger_written: true }, exitCode);
    };

    if (!prechecksOk) {
      const reason = testResult.timed_out ? 'tests_timeout' : 'tests_failed';
      return writeAndFinish({ enum: 'RETRY', reason, prechecks_ok: false, called_jev: false, latency_ms: 0 }, 2);
    }

    if (mode === 'important_ui') {
      if (policy.important_ui?.skip_jev_final !== true) throw fail('POLICY', 'important_ui.skip_jev_final must stay true');
      return writeAndFinish({
        enum: 'PENDING_HUMAN',
        reason: 'skip_jev_final',
        prechecks_ok: true,
        called_jev: false,
        latency_ms: 0,
      }, 0);
    }

    const { map, ids } = mergeQuestions(selectFixed(policy, mode), dynamic);
    const state = buildState({ issue, spec, head, base, diff, testResult, bodyText });
    const request = { model: policy.model, state, questions: map };
    const endpoint = endpointFromEnv(policy, env);
    if (dryRun) {
      const key = apiKeyFromEnv(env);
      const preview = {
        ...common,
        api_key_present: Boolean(key),
        called_jev: false,
        prechecks_ok: true,
        endpoint: endpoint.toString(),
        question_ids: ids,
        request,
        dry_run: true,
      };
      if (!key) return finish({ ...preview, enum: 'HUMAN_REVIEW', reason: 'missing_api_key' }, 3);
      return finish({ ...preview, enum: 'DRY_RUN', reason: 'dry_run' }, 0);
    }

    const key = apiKeyFromEnv(env);
    if (!key) {
      return writeAndFinish({ enum: 'HUMAN_REVIEW', reason: 'missing_api_key', prechecks_ok: true, called_jev: false, latency_ms: 0 }, 3);
    }
    const posted = await postDecision(endpoint, key, request, fetchImpl);
    const decision = decideFromHttp({
      status: posted.status,
      body: posted.text,
      ids,
      thresholds: policy.thresholds,
      requestedModel: policy.model,
    });
    return writeAndFinish({
      enum: decision.enum,
      reason: decision.reason,
      scores: decision.scores,
      cost: decision.cost,
      provider_id: decision.provider_id,
      model: decision.model,
      http_status: decision.http_status,
      prechecks_ok: true,
      called_jev: true,
      latency_ms: posted.latency_ms,
      endpoint: endpoint.toString(),
      question_ids: ids,
    }, exitCodeFor(decision.enum));
  } catch (error) {
    const reason = error.code === 'GIT' ? 'git_failed' : error.code === 'POLICY' ? 'invalid_policy' : error.code === 'LEDGER' ? 'ledger_invalid' : 'invalid_args';
    return finish({
      gate: 'accept',
      issue: typeof args.issue === 'string' ? args.issue : null,
      enum: null,
      reason,
      error: error.message,
    }, 1);
  }
}

function invokedDirectly() {
  return process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
}

if (invokedDirectly()) {
  run(process.argv.slice(2)).then(result => {
    process.stdout.write(`${JSON.stringify(result.summary, null, 2)}\n`);
    process.stderr.write(`${result.summary.human}\n`);
    process.exit(result.exitCode);
  }).catch(error => {
    const summary = { enum: null, reason: 'invalid_args', error: error.message, exit_code: 1, merge_authorized: false, consume: 'enum_and_exit_code_only' };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
    process.stderr.write(`JEV accept ERROR (${error.message}).\n`);
    process.exit(1);
  });
}
