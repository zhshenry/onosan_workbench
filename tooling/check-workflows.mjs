// Real GitHub Actions schema/expression checks; never executes workflow commands.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTIONLINT_VERSION = '1.7.12';
// Standalone regression only: never registered as an Actions entrypoint or run.
export const HISTORICAL_CONTEXT_ERROR = `name: Historical runner context regression
on: workflow_dispatch
jobs:
  invalid-context:
    runs-on: ubuntu-24.04
    env:
      PLAYWRIGHT_BROWSERS_PATH: \${{ runner.temp }}/browsers
    steps:
      - run: echo regression
`;
const RUNNER_CONTEXT_ERROR = 'context "runner" is not allowed here. available contexts are "github", "inputs", "matrix", "needs", "secrets", "strategy", "vars". see https://docs.github.com/en/actions/learn-github-actions/contexts#context-availability for more details';
const need = (ok, message) => { if (!ok) throw new Error(message); };
export function checkWorkflows(binary) {
  need(typeof binary === 'string' && binary.length > 0, 'Pass the checksum-verified actionlint binary');
  const invoke = (args, input) => {
    const result = spawnSync(binary, args, { input, encoding: 'utf8', timeout: 30000, maxBuffer: 2_000_000, shell: false });
    need(!result.error && !result.signal, 'actionlint could not finish');
    return { status: result.status, output: result.stdout + result.stderr };
  };
  const version = invoke(['-version']);
  need(version.status === 0 && version.output.split(/\r?\n/, 1)[0] === ACTIONLINT_VERSION, 'Unexpected actionlint version');
  const paths = readdirSync('.github/workflows').filter(name => /\.ya?ml$/.test(name)).sort().map(name => `.github/workflows/${name}`);
  need(paths.length > 0, 'Workflow files missing');
  // Only disable optional external language linters. Schema, expressions, context
  // availability and action/workflow checks remain enabled with no ignore rules.
  const flags = ['-no-color', '-shellcheck=', '-pyflakes='];
  const valid = invoke([...flags, ...paths]);
  need(valid.status === 0, `Workflow semantic validation failed:\n${valid.output}`);
  const rejected = invoke([...flags, '-format', '{{json .}}', '-stdin-filename', 'historical-runner-context.yml', '-'], HISTORICAL_CONTEXT_ERROR);
  need(rejected.status === 1, 'Historical invalid workflow was not rejected');
  const errors = JSON.parse(rejected.output);
  need(Array.isArray(errors) && errors.length === 1 && errors[0].kind === 'expression' && errors[0].message === RUNNER_CONTEXT_ERROR, 'Historical failure did not identify the exact runner context misuse');
  console.log(`actionlint ${ACTIONLINT_VERSION}: all ${paths.length} current workflows passed; historical job-env runner context rejected.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { checkWorkflows(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
