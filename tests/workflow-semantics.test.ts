import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { ACTIONLINT_VERSION, PILOT, recreateHistoricalContextError, checkWorkflows } from '../tooling/check-workflows.mjs';

test('browser path is step-scoped twice and regression reconstructs the historical job-level misuse', () => {
  const current = readFileSync(PILOT, 'utf8').replace(/\r\n?/g, '\n');
  const job = current.slice(current.indexOf('\n    env:\n'), current.indexOf('\n    steps:\n'));
  assert.doesNotMatch(job, /runner\.temp|PLAYWRIGHT_BROWSERS_PATH/);
  const value = '          PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/ono-render-browsers\n';
  assert.equal(current.split(value).length - 1, 2);
  const install = current.slice(current.indexOf('      - name: Verify checkout'), current.indexOf('      - name: Render with'));
  const render = current.slice(current.indexOf('      - name: Render with'), current.indexOf('      - name: Install verified official gh'));
  for (const step of [install, render]) assert.ok(step.includes(value));
  const old = recreateHistoricalContextError(current);
  assert.equal(recreateHistoricalContextError(current.replaceAll('\n', '\r\n')), old);
  assert.ok(old.includes('      PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/ono-render-browsers\n    steps:'));
  assert.equal(old.split(value).length - 1, 0);
  assert.throws(() => recreateHistoricalContextError(current.replace(value, '')));
  assert.throws(() => recreateHistoricalContextError(current.replace('      PROTOTYPE_STATE:', '      WRONG_STATE:')));
});

test('ordinary Linux PR CI verifies a pinned official actionlint before executing semantic regression', () => {
  const ci = readFileSync('.github/workflows/windows-cloud-pilot.yml', 'utf8');
  assert.match(ci, /pull_request:/);
  const step = ci.slice(ci.indexOf('      - name: Check Actions workflow semantics'), ci.indexOf('      - name: Install locked dependencies'));
  assert.equal(ACTIONLINT_VERSION, '1.7.12');
  assert.match(step, /https:\/\/github.com\/rhysd\/actionlint\/releases\/download\/v1\.7\.12\/actionlint_1\.7\.12_linux_amd64\.tar\.gz/);
  assert.match(step, /8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8/);
  assert.match(step, /sha256sum --check --strict/);
  assert.ok(step.indexOf('sha256sum') < step.indexOf('tar -xzf'));
  assert.ok(step.indexOf('tar -xzf') < step.indexOf('node tooling/check-workflows.mjs'));
  assert.match(step, /set -euo pipefail/);
  assert.doesNotMatch(step, /continue-on-error|secrets\.|\|\| true/);
  assert.throws(() => checkWorkflows(undefined));
});
