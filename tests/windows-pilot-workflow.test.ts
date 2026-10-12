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
  assert.equal((source.match(/uses: actions\/checkout@v4/g) ?? []).length, 1);
  assert.equal((source.match(/persist-credentials: false/g) ?? []).length, 1);
  assert.doesNotMatch(source, /\n[ \t]+permissions:|\btoken:|\bGITHUB_TOKEN:/);
});

test('Windows CI keeps hosted runners, bounded jobs and per-route cancellation', () => {
  assert.deepEqual(source.match(/runs-on: .+/g), ['runs-on: windows-2022']);
  assert.deepEqual(source.match(/^    timeout-minutes: .+/gm), ['    timeout-minutes: 25']);
  assert.deepEqual(source.match(/^        timeout-minutes: .+/gm), ['        timeout-minutes: 2']);
  assert.ok(source.includes('group: windows-cloud-pilot-${{ github.event_name }}-${{ github.event.pull_request.number || github.ref }}'));
  assert.ok(source.includes('cancel-in-progress: true'));
});

test('Windows CI verifies the pinned official Windows actionlint archive before running checks', () => {
  const semantic = source.split('      - name: Check Actions workflow semantics and historical context regression\n')[1]?.split('      - name: ')[0];
  assert.ok(semantic);
  assert.ok(semantic.includes('timeout-minutes: 2'));
  assert.ok(semantic.includes('shell: pwsh'));
  assert.ok(semantic.includes("$ErrorActionPreference = 'Stop'"));
  assert.ok(semantic.includes("Join-Path $env:RUNNER_TEMP ('ono-actionlint-' + [guid]::NewGuid().ToString('N'))"));
  assert.ok(semantic.includes("curl.exe --fail --silent --show-error --location --connect-timeout 15 --max-time 90 --proto '=https' --tlsv1.2"));
  assert.ok(semantic.includes('https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_windows_amd64.zip --output $archive'));
  assert.ok(semantic.includes("$expectedHash = '6e7241b51e6817ea6a047693d8e6fed13b31819c9a0dd6c5a726e1592d22f6e9'"));
  assert.ok(semantic.includes('(Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedHash'));
  const checksum = semantic.indexOf('Get-FileHash');
  const extract = semantic.indexOf('Expand-Archive -LiteralPath $archive -DestinationPath $directory');
  const check = semantic.indexOf("node tooling/check-workflows.mjs (Join-Path $directory 'actionlint.exe')");
  assert.ok(checksum >= 0 && extract > checksum && check > extract);
  assert.ok(semantic.includes("if ($LASTEXITCODE -ne 0) { throw 'actionlint download failed' }"));
  assert.ok(semantic.includes("throw 'actionlint archive SHA256 mismatch'"));
  assert.ok(semantic.includes("if ($LASTEXITCODE -ne 0) { throw 'Workflow semantic validation failed' }"));
  assert.ok(semantic.includes('} finally {\n            Remove-Item -LiteralPath $directory -Recurse -Force'));
  assert.doesNotMatch(source, /continue-on-error|linux_amd64|ubuntu-|linux-baseline/);
});

test('Windows CI keeps semantic checks before the real test, build, install and UI acceptance sequence', () => {
  const names = [
    'Check Actions workflow semantics and historical context regression',
    'Install locked Windows dependencies',
    'Download the locked Electron Windows runtime explicitly',
    'Unit tests including Windows release packaging fixture',
    'Typography, types and production build',
    'Build real NSIS installer without release upload or portable ZIP',
    'Silent current-user installation into disposable runner directory',
    'Installed app UI flow and same-version persistence',
    'Enforce screenshot/report allowlist and 20 MB total run ceiling',
    'Retain only small screenshots and reports for 3 days',
  ];
  const positions = names.map(name => source.indexOf(`      - name: ${name}\n`));
  assert.ok(positions.every((position, index) => position >= 0 && (index === 0 || position > positions[index - 1])));
  for (const command of [
    'run: npm ci --no-audit --no-fund',
    'run: node node_modules/electron/install.js',
    'run: npm test',
    'run: npm run verify',
    'run: node node_modules/electron-builder/cli.js --win nsis --x64 --publish never --config.electronDist=node_modules/electron/dist',
    'run: ./tooling/windows-pilot-install.ps1',
    'run: npm run test:windows-pilot',
  ]) assert.ok(source.includes(command));
});

test('Windows CI has one guarded evidence artifact and replaces it on rerun', () => {
  assert.doesNotMatch(source, /actions\/cache/);
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
