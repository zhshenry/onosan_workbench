// Real GitHub Actions schema/expression checks; never executes workflow commands.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ACTIONLINT_VERSION = '1.7.12';
export const PILOT = '.github/workflows/ono-prototype-render.yml';
const need = (ok, message) => { if (!ok) throw new Error(message); };
export function recreateHistoricalContextError(source) {
  source = source.replace(/\r\n?/g, '\n');
  const stepValue = '          PLAYWRIGHT_BROWSERS_PATH: ${{ runner.temp }}/ono-render-browsers\n';
  need(source.split(stepValue).length - 1 === 2, 'Expected the same browser path in exactly two step environments');
  const anchor = '      PROTOTYPE_STATE: ${{ inputs.prototype_state }}\n';
  need(source.split(anchor).length === 2, 'Expected exactly one prototype job environment');
  return source.replaceAll(stepValue, '').replace(anchor,
    `${anchor}      PLAYWRIGHT_BROWSERS_PATH: \${{ runner.temp }}/ono-render-browsers\n`);
}
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
  need(paths.length > 0 && paths.includes(PILOT), 'Workflow files missing');
  // Only disable optional external language linters. Schema, expressions, context
  // availability and action/workflow checks remain enabled with no ignore rules.
  const flags = ['-no-color', '-shellcheck=', '-pyflakes='];
  const valid = invoke([...flags, ...paths]);
  need(valid.status === 0, `Workflow semantic validation failed:\n${valid.output}`);
  const old = recreateHistoricalContextError(readFileSync(PILOT, 'utf8'));
  const rejected = invoke([...flags, '-format', '{{json .}}', '-stdin-filename', 'historical-runner-context.yml', '-'], old);
  need(rejected.status === 1, 'Historical invalid workflow was not rejected');
  const errors = JSON.parse(rejected.output);
  need(Array.isArray(errors) && errors.some(error => error.kind === 'expression' && /context "runner" is not allowed here/.test(error.message)), 'Historical failure did not identify runner context misuse');
  console.log(`actionlint ${ACTIONLINT_VERSION}: all ${paths.length} current workflows passed; historical job-env runner context rejected.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { checkWorkflows(process.argv[2]); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
