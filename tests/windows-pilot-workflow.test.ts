import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// These are intentionally narrow source-contract checks, not a YAML parser or
// a simulation of GitHub's event delivery. Real PR CI verifies the parsed file.
const workflow = readFileSync(new URL('../.github/workflows/windows-cloud-pilot.yml', import.meta.url), 'utf8');
function sourceContract(text: string) {
  // Windows checkout normally uses CRLF; match the same config on both runners.
  return text.replace(/\r\n?/g, '\n').split('\n').filter(line => !line.trimStart().startsWith('#')).join('\n');
}
const source = sourceContract(workflow);
const triggers = source.split('\non:\n')[1]?.split('\npermissions:\n')[0];

test('Windows CI source contract accepts both LF and CRLF checkout line endings', () => {
  const lf = workflow.replace(/\r\n?/g, '\n');
  assert.equal(sourceContract(lf), source);
  assert.equal(sourceContract(lf.replace(/\n/g, '\r\n')), source);
  assert.doesNotMatch(source, /\r/);
});

test('Windows CI has PR, main push and manual routes without duplicate feature pushes', () => {
  assert.equal(triggers?.trim(), [
    'pull_request:', '    branches: [main]', '    types: [opened, reopened, synchronize]',
    '  push:', '    branches: [main]', '  workflow_dispatch:',
  ].join('\n'));
  assert.doesNotMatch(source, /pull_request_target|\bdraft\b|\bsecrets\b/);
});

test('Windows CI keeps only read access and does not persist checkout credentials', () => {
  assert.equal(source.split('\npermissions:\n')[1]?.split('\nconcurrency:\n')[0].trim(), 'contents: read');
  assert.equal((source.match(/uses: actions\/checkout@v4/g) ?? []).length, 2);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 2);
  assert.doesNotMatch(source, /\n[ \t]+permissions:|\btoken:|\bGITHUB_TOKEN:/);
});

test('Windows CI keeps hosted runners, bounded jobs and per-route cancellation', () => {
  assert.deepEqual(source.match(/runs-on: .+/g), ['runs-on: ubuntu-24.04', 'runs-on: windows-2022']);
  assert.deepEqual(source.match(/timeout-minutes: .+/g), ['timeout-minutes: 15', 'timeout-minutes: 25']);
  assert.ok(source.includes('group: windows-cloud-pilot-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}'));
  assert.ok(source.includes('cancel-in-progress: true'));
});

test('Windows CI has one guarded evidence artifact across jobs and replaces it on rerun', () => {
  const linux = source.split('\n  linux-baseline:\n')[1]?.split('\n  windows-installed-app:\n')[0];
  assert.ok(linux);
  assert.doesNotMatch(linux, /upload-artifact|actions\/cache/);
  assert.equal((source.match(/uses: actions\/upload-artifact@/g) ?? []).length, 1);
  const upload = source.split('uses: actions/upload-artifact@v4')[1];
  assert.ok(upload);
  assert.ok(source.includes('node tooling/pilot-artifacts.mjs test-results/windows-pilot'));
  assert.ok(source.includes("if: always() && steps.evidence.outputs.safe == 'true'"));
  assert.ok(upload.includes('name: windows-cloud-pilot-${{ github.run_id }}'));
  assert.ok(upload.includes('overwrite: true'));
  assert.ok(upload.includes('path: test-results/windows-pilot/*'));
  assert.ok(upload.includes('retention-days: 3'));
  assert.doesNotMatch(upload, /run_attempt|\binclude-hidden-files: true/);
});

test('Windows CI binds evidence to head/base while testing the proposed merge', () => {
  assert.ok(source.includes('WORKBENCH_CI_HEAD_SHA: ${{ github.event.pull_request.head.sha || github.sha }}'));
  assert.ok(source.includes("WORKBENCH_CI_BASE_SHA: ${{ github.event.pull_request.base.sha || '' }}"));
  assert.doesNotMatch(source, /\n\s+ref:/);
  const acceptance = readFileSync(new URL('../tooling/windows-pilot.mjs', import.meta.url), 'utf8');
  assert.ok(acceptance.includes('commit: process.env.GITHUB_SHA'));
  assert.ok(acceptance.includes('headCommit: process.env.WORKBENCH_CI_HEAD_SHA'));
  assert.ok(acceptance.includes('baseCommit: process.env.WORKBENCH_CI_BASE_SHA'));
  assert.ok(acceptance.includes('runAttempt: process.env.GITHUB_RUN_ATTEMPT'));
});
