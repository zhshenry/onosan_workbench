import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizePng } from './png.mjs';
export const CANDIDATE = 'design/mockups/design-a-glass.html';
export const STATE = 'historical-design-a-home';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
const need = (ok, code) => { if (!ok) throw new Error(code); };
export function validateRenderContext(env) {
  need(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === 'zhshenry/onosan_workbench' && env.GITHUB_REPOSITORY_ID === '1372377655', 'MANUAL_REPOSITORY_REQUIRED');
  need(env.GITHUB_ACTOR === 'zhshenry' && env.GITHUB_ACTOR_ID === '54107847' && env.GITHUB_TRIGGERING_ACTOR === 'zhshenry', 'OWNER_ACTOR_REQUIRED');
  need(env.GITHUB_REF === 'refs/heads/main' && /^[a-f0-9]{40}$/.test(env.APPROVED_SHA ?? '') && env.APPROVED_SHA === env.GITHUB_SHA, 'APPROVED_MAIN_REQUIRED');
  need(env.PROTOTYPE_STATE === STATE, 'UNSUPPORTED_STATE');
  need(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RUN_ID_REQUIRED');
  need(!env.GH_TOKEN && !env.GITHUB_TOKEN, 'RENDER_MUST_NOT_HAVE_TOKEN');
}
export async function render(env = process.env) {
  validateRenderContext(env);
  const { chromium } = await import('playwright');
  const html = readFileSync(resolve(CANDIDATE), 'utf8');
  const output = join(env.RUNNER_TEMP, 'ono-render-output'); mkdirSync(output, { recursive: true, mode: 0o700 });
  const browser = await chromium.launch({ chromiumSandbox: true, env: { PATH: env.PATH, HOME: env.HOME, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH } });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', serviceWorkers: 'block', offline: true, acceptDownloads: false, permissions: [] });
    let blocked = 0, errors = 0;
    await context.route('**/*', route => { blocked++; return route.abort(); });
    await context.routeWebSocket('**/*', socket => { blocked++; socket.close(); });
    const page = await context.newPage(); page.on('pageerror', () => errors++);
    // This reviewed file is inline-only. No repo server, file: URL, external font or asset fetch.
    const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
    await page.setContent(html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`), { waitUntil: 'load', timeout: 15000 });
    await page.locator('#view-home.on').waitFor();
    need(await page.locator('#tree .nsub').count() === 3, 'INITIAL_STATE_NOT_READY');
    await page.evaluate(() => document.fonts.ready);
    const raw = await page.screenshot({ type: 'png', animations: 'disabled', fullPage: false, timeout: 15000 });
    const normalized = normalizePng(raw);
    need(!blocked && !errors && normalized.width === 1440 && normalized.height === 1024, 'RENDER_CHECK_FAILED');
    writeFileSync(join(output, 'prototype.png'), normalized.bytes, { mode: 0o600 });
    const manifest = { source: CANDIDATE, state: STATE, sha: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sourceSha256: sha256(html), width: normalized.width, height: normalized.height, rawSha256: sha256(raw), pixelSha256: sha256(normalized.pixels), imageSha256: sha256(normalized.bytes), browser: browser.version(), visualReview: 'not-performed', purpose: 'historical-prototype-render-pilot' };
    writeFileSync(join(output, 'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    console.log(`Render decoded and normalized: ${STATE}; 1440x1024; SHA256=${manifest.imageSha256}. Visual fidelity not yet reviewed.`);
  } finally { await browser.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  render().catch(() => { console.error('Prototype render stopped; raw browser output suppressed'); process.exitCode = 1; });
}
