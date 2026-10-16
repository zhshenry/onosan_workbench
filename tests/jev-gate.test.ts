import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test, { after } from 'node:test';
import { run as floatRun, parseSimpleYaml } from '../tooling/accept-float.mjs';
import { questionsFromIssueText, run as dynamicRun } from '../tooling/jev-dynamic-from-issue.mjs';
import { assessLedger, decideFromHttp, exitCodeFor, loadPolicy, routeNoulScores, run as gateRun, selectFixed } from '../tooling/jev-gate.mjs';

const root = path.resolve(import.meta.dirname, '..');
const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
const thresholds = { approve_min: 0.9, reject_max: 0.1 };
const fixedIds = ['A2_matches_spec', 'A5_regression_covered', 'A6_scope_contained'];

function tempDir() {
  const directory = mkdtempSync(path.join(tmpdir(), 'jev-gate-'));
  return directory;
}

function ledgerEnv(directory: string, extra: Record<string, string> = {}) {
  return {
    JEV_LEDGER_PATH: path.join(directory, 'ledger.jsonl'),
    OPENROUTER_API_KEY: '',
    SYSTEM1_API_KEY: '',
    ...extra,
  };
}

function answers(scores: Record<string, number>, model = 'typesafe/jev-1.14') {
  return JSON.stringify({
    model,
    id: 'gen-test',
    usage: { cost: 0.000021 },
    answers: Object.fromEntries(Object.entries(scores).map(([id, noul]) => [id, { type: 'noul', noul }])),
  });
}

after(() => {
  const ledger = readFileSync(path.join(root, 'docs/issues/jev-ledger.jsonl'), 'utf8');
  assert.match(ledger, /^# jev accept ledger/);
  assert.equal(ledger.includes('AUTO_ACCEPT'), false);
  assert.equal(ledger.includes('HUMAN_REVIEW'), false);
});

test('policy keeps the fixed propositions, thresholds, and important-ui skip', () => {
  const bytes = readFileSync(path.join(root, 'tooling/jev-policy.json'));
  const policy = loadPolicy(bytes.toString('utf8'));
  assert.equal(policy.model, 'typesafe/jev-1.14');
  assert.equal(policy.endpoint_path, '/api/alpha/decisions');
  assert.equal(policy.policy_version, 'jev-accept-1');
  assert.equal(policy.thresholds.approve_min, 0.9);
  assert.equal(policy.thresholds.reject_max, 0.1);
  assert.equal(policy.important_ui.skip_jev_final, true);
  assert.deepEqual(selectFixed(policy, 'functional').map(item => item.id), fixedIds);
  assert.deepEqual(selectFixed(policy, 'optimize').map(item => item.id), [...fixedIds, 'A8_evidence_sufficient']);
  assert.deepEqual(selectFixed(policy, 'important_ui').map(item => item.id), []);
  assert.equal(createHash('sha256').update(bytes).digest('hex').length, 64);
});

test('noul routing is fail-closed around the thresholds', () => {
  assert.equal(routeNoulScores({ a: 0.9, b: 1 }, thresholds).enum, 'AUTO_ACCEPT');
  assert.equal(routeNoulScores({ a: 0.1, b: 0.99 }, thresholds).enum, 'RETRY');
  assert.equal(routeNoulScores({ a: 0, b: 0.99 }, thresholds).enum, 'RETRY');
  assert.equal(routeNoulScores({ a: 0.11, b: 0.89 }, thresholds).enum, 'HUMAN_REVIEW');
  assert.equal(routeNoulScores({ a: 0.5 }, thresholds).reason, 'noul_between_thresholds');
  assert.equal(routeNoulScores({}, thresholds).reason, 'missing_answers');
  assert.deepEqual(exitCodeFor('AUTO_ACCEPT'), 0);
  assert.deepEqual(exitCodeFor('PENDING_HUMAN'), 0);
  assert.deepEqual(exitCodeFor('RETRY'), 2);
  assert.deepEqual(exitCodeFor('HUMAN_REVIEW'), 3);
  assert.deepEqual(exitCodeFor('NOPE'), 1);
});

test('http faults and missing answers never become AUTO_ACCEPT', () => {
  const ids = fixedIds;
  const common = { ids, thresholds, requestedModel: 'typesafe/jev-1.14' };
  assert.equal(decideFromHttp({ ...common, status: 503, body: '{"error":{"message":"unavailable"}}' }).enum, 'HUMAN_REVIEW');
  assert.equal(decideFromHttp({ ...common, status: 0, body: '' }).reason, 'network');
  assert.equal(decideFromHttp({ ...common, status: 200, body: 'not-json' }).reason, 'invalid_json');
  assert.equal(decideFromHttp({ ...common, status: 200, body: JSON.stringify({ model: 'other/model', answers: {} }) }).reason, 'model_mismatch');
  const partial = answers({ A2_matches_spec: 0.99, A5_regression_covered: 0.99 });
  assert.equal(decideFromHttp({ ...common, status: 200, body: partial }).reason, 'missing_answers');
  const strings = JSON.stringify({ model: 'typesafe/jev-1.14', answers: { A2_matches_spec: { type: 'noul', noul: '0.99' }, A5_regression_covered: { type: 'noul', noul: 0.99 }, A6_scope_contained: { type: 'noul', noul: 0.99 } } });
  assert.equal(decideFromHttp({ ...common, status: 200, body: strings }).reason, 'missing_answers');
  const dated = decideFromHttp({ ...common, status: 200, body: answers({ A2_matches_spec: 0.9, A5_regression_covered: 0.9, A6_scope_contained: 0.9 }, 'typesafe/jev-1.14-20260917') });
  assert.equal(dated.enum, 'AUTO_ACCEPT');
  assert.equal(dated.cost, 0.000021);
});

test('ledger verify uses the latest issue line and fails closed', () => {
  const hash = 'a'.repeat(64);
  const entry = {
    issue: '86', gate: 'accept', enum: 'AUTO_ACCEPT', head_sha: 'head-old', base_sha: 'base',
    policy_hash: 'policy', questions_hash: hash, dynamic_count: 0, reason: 'all_noul_at_or_above_approve_min', scores: { A2_matches_spec: 0.95 },
  };
  const older = JSON.stringify(entry);
  const newer = JSON.stringify({ ...entry, head_sha: 'head-new', enum: 'RETRY', reason: 'noul_at_or_below_reject_max' });
  const text = `# comment only\n${older}\n${newer}\n`;
  const current = assessLedger({ ledgerText: text, issue: '86', head: 'head-new', base: 'base', policyHash: 'policy', questionsHash: hash });
  assert.equal(current.exit_code, 2);
  assert.equal(current.enum, 'RETRY');
  const stale = assessLedger({ ledgerText: text, issue: '86', head: 'head-old', base: 'base', policyHash: 'policy', questionsHash: null });
  assert.equal(stale.reason, 'head_mismatch');
  assert.equal(stale.exit_code, 1);
  assert.equal(assessLedger({ ledgerText: text, issue: '86', head: 'head-new', base: 'base', policyHash: 'other', questionsHash: null }).reason, 'policy_hash_mismatch');
  assert.equal(assessLedger({ ledgerText: text, issue: '86', head: 'head-new', base: 'base', policyHash: 'policy', questionsHash: 'b'.repeat(64) }).reason, 'questions_hash_mismatch');
  assert.equal(assessLedger({ ledgerText: `${text}{not json}\n`, issue: '86', head: 'head-new', base: 'base', policyHash: 'policy', questionsHash: hash }).reason, 'ledger_corrupt');
  assert.equal(assessLedger({ ledgerText: '# none\n', issue: '86', head: 'head-new', base: 'base', policyHash: 'policy', questionsHash: null }).reason, 'no_ledger_entry');
});

test('package scripts point at the gate and the float stub', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.type, 'module');
  assert.equal(pkg.scripts.test, 'tsx --test tests/*.test.ts');
  assert.equal(pkg.scripts['jev:accept'], 'node tooling/jev-gate.mjs --gate accept');
  assert.equal(pkg.scripts['accept:float'], 'node tooling/accept-float.mjs');
  const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(ignore, /^\/artifacts\/$/m);
});

test('important UI prechecks pass without calling JEV and verify is hash-bound', async () => {
  const directory = tempDir();
  try {
    const env = ledgerEnv(directory);
    const first = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'important_ui', '--spec', 'Show the assistant reply.', '--skip-tests'], { env });
    assert.equal(first.exitCode, 0);
    assert.equal(first.summary.enum, 'PENDING_HUMAN');
    assert.equal(first.summary.reason, 'skip_jev_final');
    assert.equal(first.summary.called_jev, false);
    assert.equal(first.summary.ledger_written, true);
    assert.equal(first.summary.merge_authorized, false);
    const verified = await gateRun(['--verify', '--issue', '86', '--head', head, '--base', head], { env });
    assert.equal(verified.exitCode, 0);
    assert.equal(verified.summary.enum, 'PENDING_HUMAN');
    assert.equal(verified.summary.hash_ok, true);
    const parent = spawnSync('git', ['rev-parse', 'HEAD^'], { cwd: root, encoding: 'utf8' }).stdout.trim();
    const moved = await gateRun(['--verify', '--issue', '86', '--head', parent, '--base', head], { env });
    assert.equal(moved.exitCode, 1);
    assert.equal(moved.summary.enum, null);
    assert.equal(moved.summary.reason, 'head_mismatch');
    assert.equal(moved.summary.rejected_ledger_enum, 'PENDING_HUMAN');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('functional decisions consume only the gate enum and a later line wins', async () => {
  const directory = tempDir();
  try {
    const env = ledgerEnv(directory, { OPENROUTER_API_KEY: 'test-key', SYSTEM1_API_BASE_URL: 'https://openrouter.ai' });
    let calls = 0;
    const fetchImpl = async (_url: string, init: { body?: string; headers?: Record<string, string> }) => {
      calls += 1;
      assert.equal(init.headers?.Authorization, 'Bearer test-key');
      const body = JSON.parse(String(init.body));
      assert.equal(body.model, 'typesafe/jev-1.14');
      assert.equal(String(init.body).includes('test-key'), false);
      const scores = calls === 1
        ? { A2_matches_spec: 0.95, A5_regression_covered: 0.91, A6_scope_contained: 0.99 }
        : { A2_matches_spec: 0.1, A5_regression_covered: 0.99, A6_scope_contained: 0.99 };
      return { status: 200, text: async () => answers(scores, 'typesafe/jev-1.14-20260917') };
    };
    const accepted = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.', '--skip-tests'], { env, fetchImpl });
    assert.equal(accepted.exitCode, 0);
    assert.equal(accepted.summary.enum, 'AUTO_ACCEPT');
    assert.equal(accepted.summary.scores.A2_matches_spec, 0.95);
    assert.equal(accepted.summary.called_jev, true);
    assert.equal(accepted.summary.cost, 0.000021);
    assert.equal(accepted.summary.merge_authorized, false);
    const verified = await gateRun(['--verify', '--issue', '86', '--head', head, '--base', head], { env });
    assert.equal(verified.exitCode, 0);
    assert.equal(verified.summary.enum, 'AUTO_ACCEPT');
    const retried = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.', '--skip-tests'], { env, fetchImpl });
    assert.equal(retried.exitCode, 2);
    assert.equal(retried.summary.enum, 'RETRY');
    const latest = await gateRun(['--verify', '--issue', '86', '--head', head, '--base', head], { env });
    assert.equal(latest.exitCode, 2);
    assert.equal(latest.summary.enum, 'RETRY');
    assert.equal(calls, 2);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing key, dry-run, bad dynamic input, and failed tests do not call JEV', async () => {
  const directory = tempDir();
  try {
    const env = ledgerEnv(directory, { SYSTEM1_API_BASE_URL: 'http://127.0.0.1:9' });
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      throw new Error('network should not be used');
    };
    const args = ['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.', '--skip-tests'];
    const missing = await gateRun(args, { env, fetchImpl });
    assert.equal(missing.exitCode, 3);
    assert.equal(missing.summary.enum, 'HUMAN_REVIEW');
    assert.equal(missing.summary.reason, 'missing_api_key');
    assert.equal(missing.summary.called_jev, false);
    assert.equal(missing.summary.ledger_written, true);
    const dry = await gateRun([...args, '--dry-run'], { env, fetchImpl });
    assert.equal(dry.exitCode, 3);
    assert.equal(dry.summary.ledger_written, false);
    assert.equal(dry.summary.request.model, 'typesafe/jev-1.14');
    assert.deepEqual(dry.summary.question_ids, fixedIds);
    const withKey = await gateRun([...args, '--dry-run'], { env: { ...env, OPENROUTER_API_KEY: 'sk-or-test-jev-do-not-send' }, fetchImpl });
    assert.equal(withKey.exitCode, 0);
    assert.equal(withKey.summary.enum, 'DRY_RUN');
    assert.equal(withKey.summary.called_jev, false);
    assert.equal(JSON.stringify(withKey.summary).includes('sk-or-test-jev-do-not-send'), false);
    const dynamic = path.join(directory, 'too-many.json');
    writeFileSync(dynamic, JSON.stringify({ questions: [1, 2, 3, 4].map(id => ({ id: `q${id}`, type: 'noul', instructions: 'Does this hold?', criteria: { true: 'Yes it holds.', false: 'No it does not.' } })) }));
    const tooMany = await gateRun([...args, '--dynamic', dynamic], { env: { ...env, OPENROUTER_API_KEY: 'test-key' }, fetchImpl });
    assert.equal(tooMany.exitCode, 1);
    const collision = path.join(directory, 'collision.json');
    writeFileSync(collision, JSON.stringify({ questions: [{ id: 'A2_matches_spec', type: 'noul', instructions: 'Does this hold?', criteria: { true: 'Yes it holds.', false: 'No it does not.' } }] }));
    const collided = await gateRun([...args, '--dynamic', collision], { env: { ...env, OPENROUTER_API_KEY: 'test-key' }, fetchImpl });
    assert.equal(collided.exitCode, 1);
    assert.match(collided.summary.error, /duplicate proposition/);
    const uiDynamic = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'important_ui', '--spec', 'Show the reply.', '--skip-tests', '--dynamic', collision], { env, fetchImpl });
    assert.equal(uiDynamic.exitCode, 1);
    const failed = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.'], {
      env: { ...env, OPENROUTER_API_KEY: 'test-key' },
      fetchImpl,
      testRunner: () => ({ status: 'failed', exit_code: 1, command: 'npm test', tail: 'failed', timed_out: false }),
    });
    assert.equal(failed.exitCode, 2);
    assert.equal(failed.summary.reason, 'tests_failed');
    assert.equal(failed.summary.called_jev, false);
    const nested = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.'], {
      env: { ...env, npm_lifecycle_event: 'test' },
      fetchImpl,
    });
    assert.equal(nested.exitCode, 1);
    assert.match(nested.summary.error, /skip-tests/);
    assert.equal(calls, 0);
    const optimize = await gateRun(['--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'optimize', '--spec', 'Keep behavior.', '--skip-tests', '--dry-run'], {
      env: { ...env, OPENROUTER_API_KEY: 'test-key' },
      fetchImpl,
    });
    assert.equal(optimize.summary.enum, 'DRY_RUN');
    assert.equal(optimize.summary.question_ids.at(-1), 'A8_evidence_sufficient');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('cli prints json to stdout and keeps a non-zero exit for human review', () => {
  const directory = tempDir();
  try {
    const result = spawnSync(process.execPath, ['tooling/jev-gate.mjs', '--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional', '--spec', 'A pure chat reply must remain visible.', '--skip-tests'], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env, ...ledgerEnv(directory), SYSTEM1_API_BASE_URL: 'http://127.0.0.1:9' },
    });
    const help = spawnSync(process.execPath, ['tooling/jev-gate.mjs', '--help'], { cwd: root, encoding: 'utf8' });
    assert.equal(help.status, 0);
    assert.match(help.stderr, /--mode functional\|important_ui\|optimize/);
    assert.equal(JSON.parse(help.stdout).reason, 'help');
    assert.equal(result.status, 3);
    const summary = JSON.parse(result.stdout);
    assert.equal(summary.enum, 'HUMAN_REVIEW');
    assert.match(result.stderr, /HUMAN_REVIEW/);
    assert.equal(result.stdout.includes('OPENROUTER'), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('issue 86 scenario validates and emits a placeholder state blob', async () => {
  const directory = tempDir();
  try {
    const scenario = readFileSync(path.join(root, 'accept/examples/86.functional.yaml'), 'utf8');
    const doc = parseSimpleYaml(scenario);
    assert.equal(doc.issue, 86);
    assert.equal(doc.mode, 'functional');
    assert.equal(doc.steps.length, 3);
    assert.equal(doc.expect.length, 3);
    assert.equal(doc.judge.fixed.length, 3);
    assert.throws(() => parseSimpleYaml('steps:\n\t- id: bad\n'), /tabs are not allowed/);
    const result = floatRun(['--scenario', 'accept/examples/86.functional.yaml', '--head', head, '--out-dir', directory]);
    assert.equal(result.exitCode, 0);
    assert.equal(result.summary.visual_evidence, false);
    assert.equal(result.summary.placeholder, true);
    const state = JSON.parse(readFileSync(path.join(directory, 'state.json'), 'utf8'));
    assert.equal(state.placeholder, true);
    assert.equal(state.visual_evidence, false);
    assert.equal(state.automation, 'not_implemented');
    assert.equal(state.head, head);
    assert.equal(state.issue, '86');
    const dynamic = JSON.parse(readFileSync(path.join(directory, 'dynamic-questions.json'), 'utf8'));
    assert.deepEqual(dynamic.questions.map((item: { id: string }) => item.id), ['issue86_chat_reply_visible', 'issue86_edit_cards_intact', 'issue86_errors_visible']);
    const missing = floatRun(['--scenario', 'accept/examples/missing.yaml', '--head', head, '--out-dir', directory]);
    assert.equal(missing.exitCode, 1);
    const gated = await gateRun([
      '--gate', 'accept', '--issue', '86', '--head', head, '--base', head, '--mode', 'functional',
      '--spec', path.join(directory, 'state.json'),
      '--dynamic', path.join(directory, 'dynamic-questions.json'),
      '--skip-tests', '--dry-run',
    ], { env: ledgerEnv(directory, { OPENROUTER_API_KEY: 'test-key' }) });
    assert.equal(gated.exitCode, 0);
    assert.equal(gated.summary.enum, 'DRY_RUN');
    assert.equal(gated.summary.question_ids[0], 'A2_matches_spec');
    assert.equal(gated.summary.question_ids.at(-1), 'issue86_errors_visible');
    assert.deepEqual(Object.keys(gated.summary.request.questions.A2_matches_spec).sort(), ['criteria', 'instructions', 'type']);
    assert.equal(gated.summary.called_jev, false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('dynamic starter follows acceptance bullets and stays inside 1 to 3 questions', () => {
  const scenario = readFileSync(path.join(root, 'accept/examples/86.functional.yaml'), 'utf8');
  const fromScenario = questionsFromIssueText(scenario);
  assert.equal(fromScenario.questions.length, 3);
  assert.match(fromScenario.questions[0].source_bullet, /助手文字回复/);
  assert.equal(fromScenario.questions.some(item => item.source_bullet?.includes('issue86_')), false);
  const markdown = '# 背景\n- 这条在验收标题之前，不应入选\n## 验收要点\n- 对话区出现助手文字回复\n- 修改卡片仍然出现\n- 错误有可见反馈\n- 第四条不应入选\n## 其他\n- 其他段落不要\n';
  const fromMarkdown = questionsFromIssueText(markdown);
  assert.deepEqual(fromMarkdown.questions.map(item => item.source_bullet), ['对话区出现助手文字回复', '修改卡片仍然出现', '错误有可见反馈']);
  const empty = questionsFromIssueText('没有验收条目');
  assert.equal(empty.questions.length, 1);
  assert.equal(empty.questions[0].id, 'dyn_1');
  assert.equal(empty.questions[0].needs_review, true);
  const directory = tempDir();
  try {
    const body = path.join(directory, 'body.md');
    const out = path.join(directory, 'dynamic.json');
    writeFileSync(body, markdown);
    const result = dynamicRun(['--issue-body', body, '--out', out, '--max', '2']);
    assert.equal(result.exitCode, 0);
    const written = JSON.parse(readFileSync(out, 'utf8'));
    assert.equal(written.questions.length, 2);
    assert.equal(written.questions[0].type, 'noul');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
