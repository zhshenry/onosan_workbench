import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import { ACTIONLINT_VERSION, HISTORICAL_CONTEXT_ERROR, checkWorkflows } from '../tooling/check-workflows.mjs';

test('historical runner-context regression is minimal and independent of retired manual entrypoints', () => {
  assert.equal(HISTORICAL_CONTEXT_ERROR.trimEnd().split('\n').length, 9);
  assert.match(HISTORICAL_CONTEXT_ERROR, /\n    env:\n      PLAYWRIGHT_BROWSERS_PATH: \$\{\{ runner\.temp \}\}\/browsers\n    steps:/);
  assert.equal(HISTORICAL_CONTEXT_ERROR.match(/runner\.temp/g)?.length, 1);
  assert.doesNotMatch(HISTORICAL_CONTEXT_ERROR, /uses:|secrets\.|render\.mjs|publish\.mjs|attachment-test\.mjs/);
  for (const name of ['ono-attachment-test.yml', 'ono-prototype-render.yml']) {
    assert.equal(existsSync(`.github/workflows/${name}`), false, `${name} must stay retired`);
  }
});

test('ordinary Windows PR CI verifies a pinned official actionlint before executing semantic regression', () => {
  const ci = readFileSync('.github/workflows/windows-cloud-pilot.yml', 'utf8').replace(/\r\n?/g, '\n');
  assert.match(ci, /pull_request:/);
  const step = ci.slice(ci.indexOf('      - name: Check Actions workflow semantics'), ci.indexOf('      - name: Install locked Windows dependencies'));
  assert.equal(ACTIONLINT_VERSION, '1.7.12');
  assert.match(step, /https:\/\/github.com\/rhysd\/actionlint\/releases\/download\/v1\.7\.12\/actionlint_1\.7\.12_windows_amd64\.zip/);
  assert.match(step, /6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9/);
  assert.match(step, /Get-FileHash -LiteralPath \$archive -Algorithm SHA256/);
  assert.ok(step.indexOf('Get-FileHash') < step.indexOf('Expand-Archive'));
  assert.ok(step.indexOf('Expand-Archive') < step.indexOf('node tooling/check-workflows.mjs'));
  assert.match(step, /shell: pwsh/);
  assert.match(step, /\$ErrorActionPreference = 'Stop'/);
  assert.match(step, /if \(\$LASTEXITCODE -ne 0\) \{ throw 'Workflow semantic validation failed' \}/);
  assert.doesNotMatch(step, /continue-on-error|secrets\.|\|\| true/);
  assert.throws(() => checkWorkflows(undefined));
});
