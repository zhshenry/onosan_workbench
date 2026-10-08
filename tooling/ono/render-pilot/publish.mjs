// Dependency-free upload adapter. Called only after browser/renderer exit.
import { readFileSync, writeFileSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeRunner, validateContext, validatePreflight, REPO } from '../attachment-test.mjs';
import { normalizePng } from './png.mjs';
import { CANDIDATE, STATE, sha256 } from './render.mjs';
const need = (ok, code) => { if (!ok) throw new Error(code); };
function regularFile(path, limit) {
  const info = lstatSync(path); need(info.isFile() && !info.isSymbolicLink() && info.size > 0 && info.size <= limit, 'OUTPUT_NOT_REGULAR_OR_BOUNDED');
  return readFileSync(path);
}
export function checkManifest(manifest, bytes, env) {
  need(env.GITHUB_ACTOR === 'zhshenry' && env.GITHUB_ACTOR_ID === '54107847' && env.GITHUB_TRIGGERING_ACTOR === 'zhshenry', 'OWNER_ACTOR_REQUIRED');
  need(env.PROTOTYPE_STATE === STATE && manifest.state === STATE && manifest.source === CANDIDATE && manifest.sha === env.GITHUB_SHA, 'SOURCE_BINDING');
  need(manifest.sourceSha256 === sha256(readFileSync(resolve(CANDIDATE))), 'SOURCE_CHANGED');
  need(manifest.width === 1440 && manifest.height === 1024 && manifest.run === env.GITHUB_RUN_ID && manifest.attempt === env.GITHUB_RUN_ATTEMPT && manifest.purpose === 'historical-prototype-render-pilot' && manifest.visualReview === 'not-performed' && typeof manifest.browser === 'string' && /^[0-9]+(?:\.[0-9]+){3}$/.test(manifest.browser) && /^[a-f0-9]{64}$/.test(manifest.rawSha256 ?? ''), 'MANIFEST_BINDING');
  const png = normalizePng(bytes);
  need(sha256(png.pixels) === manifest.pixelSha256, 'PIXEL_BINDING');
  need(png.width === 1440 && png.height === 1024 && sha256(bytes) === manifest.imageSha256 && Buffer.from(bytes).equals(png.bytes), 'PNG_BINDING');
}
export function publish(env = process.env, run = makeRunner(env)) {
  const ctx = validateContext(env); need(ctx.upload && ctx.attempt === '1', 'EXPLICIT_FIRST_ATTEMPT_ONLY');
  const directory = join(env.RUNNER_TEMP, 'ono-render-output');
  need(lstatSync(directory).isDirectory() && !lstatSync(directory).isSymbolicLink(), 'OUTPUT_DIRECTORY');
  const path = join(directory, 'prototype.png'), bytes = regularFile(path, 20_000_000), manifest = JSON.parse(regularFile(join(directory, 'manifest.json'), 8192).toString('utf8'));
  checkManifest(manifest, bytes, env);
  // Marker is distinct from the earlier 16x16 capability test.
  const marker = `<!-- ono-prototype-render:${env.APPROVAL_ID} -->`;
  const query = `query { viewer { login } repository(owner:"zhshenry",name:"onosan_workbench") { databaseId nameWithOwner isArchived viewerPermission defaultBranchRef { name target { oid } } issue(number:${ctx.issue}) { number state locked } } }`;
  const preflight = () => validatePreflight(JSON.parse(run(['api', 'graphql', '-f', `query=${query}`])), ctx);
  const find = () => {
    const pages = JSON.parse(run(['api', '--method', 'GET', '--paginate', '--slurp', `repos/${REPO}/issues/${ctx.issue}/comments?per_page=100`]));
    need(Array.isArray(pages) && pages.every(Array.isArray), 'COMMENT_QUERY_INCOMPLETE');
    return pages.flat().filter(c => typeof c.body === 'string' && c.body.includes(marker));
  };
  preflight(); need(find().length === 0, 'MARKER_ALREADY_PRESENT');
  const body = `[OnO] Historical Design A, initial home, 1440×1024, 1×. Render/attachment pilot only; not current product acceptance or plan approval.\n\n${marker}\nSource: ${CANDIDATE}\nState: ${STATE}\nApproved source SHA: ${ctx.sha}\nPNG SHA256: ${manifest.imageSha256}\nRun: ${ctx.run}\nAttempt: ${ctx.attempt}\nVisual review: pending. Font fallback may differ from Windows.\n\nThe plan must reuse the exact attachment URL returned in this comment; no second image upload.`;
  const bodyPath = join(directory, 'comment.txt'); writeFileSync(bodyPath, body, { mode: 0o600 });
  preflight(); need(find().length === 0, 'MARKER_APPEARED');
  checkManifest(manifest, regularFile(path, 20_000_000), env);
  let failed = false;
  try { run(['issue', 'comment', ctx.issue, '--repo', REPO, '--body-file', bodyPath, '--attach', `${path}#Historical Design A initial home`]); } catch { failed = true; }
  // A failed/uncertain call never causes a second upload. Reconcile externally.
  const found = find(); need(!failed && found.length === 1 && found[0].user?.login === 'zhshenry', 'UPLOAD_UNCERTAIN_NO_RETRY');
  need(found[0].body.startsWith(body), 'COMMENT_BODY_CHANGED');
  const match = found[0].body.slice(body.length).trim().match(/^!\[[^\]\r\n]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\)$/);
  need(match, 'ATTACHMENT_URL_NOT_UNIQUE');
  const urls = [match[1]];
  console.log(`Recorded: https://github.com/${REPO}/issues/${ctx.issue}#issuecomment-${Number(found[0].id)}; attachment=${urls[0]}; SHA256=${manifest.imageSha256}. Plan backfill and visual/access verification pending.`);
  return { commentId: found[0].id, url: urls[0], sha256: manifest.imageSha256 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { publish(); } catch { console.error('Prototype publication stopped or uncertain. Do not retry upload; reconcile comment and asset first.'); process.exitCode = 1; }
}
