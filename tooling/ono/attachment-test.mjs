// Isolated manual probe. No dependency install, credentials on disk, or product imports.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { deflateSync } from 'node:zlib';

export const REPO = 'zhshenry/onosan_workbench';
export const REPO_ID = 1372377655;
class ProbeError extends Error {}
const requireThat = (condition, message) => { if (!condition) throw new ProbeError(message); };
export function validateContext(env) {
  requireThat(env.GITHUB_EVENT_NAME === 'workflow_dispatch', 'Manual dispatch required');
  requireThat(env.GITHUB_REPOSITORY === REPO && env.GITHUB_REPOSITORY_ID === String(REPO_ID), 'Wrong repository');
  requireThat(env.GITHUB_REF === 'refs/heads/main', 'Trusted main required');
  requireThat(/^[a-f0-9]{40}$/.test(env.GITHUB_SHA ?? '') && env.APPROVED_SHA === env.GITHUB_SHA, 'Exact approved main SHA required');
  requireThat(/^[1-9][0-9]{0,8}$/.test(env.TARGET_ISSUE ?? ''), 'Explicit positive issue number required');
  requireThat(/^[a-z0-9][a-z0-9-]{7,63}$/.test(env.APPROVAL_ID ?? ''), 'Explicit unique approval ID required');
  requireThat(['false', 'true'].includes(env.POST_ATTACHMENT), 'Explicit boolean upload option required');
  requireThat(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'Run identity required');
  requireThat(Boolean(env.GH_TOKEN), 'ONOSAN_GH_TOKEN missing; no fallback');
  return { issue: env.TARGET_ISSUE, sha: env.GITHUB_SHA, upload: env.POST_ATTACHMENT === 'true',
    marker: `<!-- ono-attachment-test:${env.APPROVAL_ID} -->`,
    run: `https://github.com/${REPO}/actions/runs/${env.GITHUB_RUN_ID}`, attempt: env.GITHUB_RUN_ATTEMPT };
}
export function validatePreflight(data, context) {
  requireThat(!data.errors && data.data?.viewer?.login === 'zhshenry', 'PAT viewer must be zhshenry');
  const repo = data.data?.repository;
  requireThat(repo?.databaseId === REPO_ID && repo.nameWithOwner === REPO && !repo.isArchived, 'Repository identity mismatch or archived');
  requireThat(['WRITE', 'MAINTAIN', 'ADMIN'].includes(repo.viewerPermission), 'PAT viewer requires repository write access');
  requireThat(repo.defaultBranchRef?.name === 'main' && repo.defaultBranchRef?.target?.oid === context.sha, 'main moved; stop and obtain new approval');
  requireThat(repo.issue?.number === Number(context.issue) && repo.issue.state === 'OPEN' && !repo.issue.locked, 'Target must be an open, unlocked issue (not a PR)');
}
export function makePng() {
  const crc = bytes => { let value = 0xffffffff; for (const b of bytes) { value ^= b; for (let i = 0; i < 8; i++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0); } return (value ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length); const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, sum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(16, 0); header.writeUInt32BE(16, 4); header[8] = 8; header[9] = 6;
  const rows = Buffer.alloc(16 * (1 + 16 * 4));
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = y * 65 + 1 + x * 4; rows[p] = x * 16; rows[p + 1] = y * 16; rows[p + 2] = 128; rows[p + 3] = 255; }
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(rows)), chunk('IEND', Buffer.alloc(0))]);
}
export function makeRunner(env) {
  // Whitelist environment; never propagate GH_DEBUG, HTTP proxies, alternate hosts,
  // inherited auth tokens, editor hooks, or arbitrary CLI config into gh.
  const safeEnv = { PATH: '/usr/bin:/bin', HOME: env.RUNNER_TEMP, GH_CONFIG_DIR: join(env.RUNNER_TEMP, 'ono-gh-empty'),
    GH_TOKEN: env.GH_TOKEN, GH_HOST: 'github.com', GH_PROMPT_DISABLED: '1', GH_NO_UPDATE_NOTIFIER: '1', GH_NO_EXTENSION_UPDATE_NOTIFIER: '1' };
  const binary = join(env.RUNNER_TEMP, 'ono-gh/gh_2.102.0_linux_amd64/bin/gh');
  return args => {
    const result = spawnSync(binary, args, { env: safeEnv, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
    // No raw CLI errors/output in logs: upstream text can contain secrets or URLs.
    requireThat(result.status === 0 && !result.error, 'GitHub CLI operation failed; raw output suppressed');
    return result.stdout;
  };
}
export function executeProbe(env, run = makeRunner(env), log = console.log) {
  const ctx = validateContext(env);
  const query = `query { viewer { login } repository(owner:"zhshenry",name:"onosan_workbench") { databaseId nameWithOwner isArchived viewerPermission defaultBranchRef { name target { oid } } issue(number:${ctx.issue}) { number state locked } } }`;
  const preflight = () => validatePreflight(JSON.parse(run(['api', 'graphql', '-f', `query=${query}`])), ctx);
  preflight();
  const findExisting = () => {
    const pages = JSON.parse(run(['api', '--method', 'GET', '--paginate', '--slurp', `repos/${REPO}/issues/${ctx.issue}/comments?per_page=100`]));
    requireThat(Array.isArray(pages) && pages.every(Array.isArray), 'Incomplete comment query');
    return pages.flat().filter(comment => typeof comment.body === 'string' && comment.body.includes(ctx.marker));
  };
  const existing = findExisting();
  log(`Preflight passed; issue=${ctx.issue}; SHA=${ctx.sha}; run=${ctx.run}; attempt=${ctx.attempt}; marker=${ctx.marker}`);
  requireThat(existing.length === 0, 'Marker already present; no write. Inspect existing comment and attachment manually');
  if (!ctx.upload) { log('Read-only preflight complete; no image generated or uploaded'); return { status: 'preflight' }; }
  requireThat(ctx.attempt === '1', 'Reruns are read-only recovery; do not repeat an uncertain upload');
  const directory = mkdtempSync(join(tmpdir(), 'ono-attachment-'));
  try {
    const image = makePng();
    const imagePath = join(directory, 'ono-synthetic-test.png');
    const hash = createHash('sha256').update(image).digest('hex');
    writeFileSync(imagePath, image, { mode: 0o600 });
    const body = `[OnO] Native attachment capability test. Synthetic 16×16 PNG; not a design or acceptance screenshot.\n\n${ctx.marker}\n\nRun: ${ctx.run}\nAttempt: ${ctx.attempt}\nApproved main SHA: ${ctx.sha}\nPNG SHA256: ${hash}\n\nAudit only. This comment does not approve a plan, merge, or release.`;
    const bodyPath = join(directory, 'body.txt'); writeFileSync(bodyPath, body, { mode: 0o600 });
    // Recheck immediately before the sole write; no shell interpolation.
    preflight(); requireThat(findExisting().length === 0, 'Marker appeared; no write');
    let failed = false;
    try { run(['issue', 'comment', ctx.issue, '--repo', REPO, '--body-file', bodyPath, '--attach', `${imagePath}#Synthetic attachment capability test`]); }
    catch { failed = true; }
    // Even on a CLI timeout, query first. Never issue a second write automatically.
    let found;
    try { found = findExisting(); }
    catch { throw new ProbeError('Upload outcome uncertain; reconciliation query failed; do not retry; assets or comments may exist'); }
    requireThat(!failed, `Upload result uncertain; ${found.length} matching comments found. Stop for manual reconciliation; assets may remain without a comment`);
    requireThat(found.length === 1 && found[0].user?.login === 'zhshenry' && found[0].body.includes('https://github.com/user-attachments/assets/'), 'Post-write verification incomplete; stop without retry');
    log(`Comment recorded: https://github.com/${REPO}/issues/${ctx.issue}#issuecomment-${Number(found[0].id)}; PNG SHA256=${hash}. Attachment accessibility/rendering not yet verified.`);
    return { status: 'comment-recorded', hash };
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { executeProbe(process.env); } catch (error) { console.error(`Attachment test stopped: ${error instanceof ProbeError ? error.message : 'Unexpected failure; details suppressed'}`); process.exitCode = 1; }
}
