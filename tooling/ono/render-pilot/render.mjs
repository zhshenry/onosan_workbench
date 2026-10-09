import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizePng } from './png.mjs';
import { runStage, formatDiagnostic } from './diagnostics.mjs';
import { verifySystemChrome } from './system-chrome.mjs';
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
// Adapters are an in-process test seam, never read from workflow inputs or files.
export async function render(env = process.env, adapters = {}) {
  const log = adapters.log ?? console.log;
  const stage = (name, operation) => runStage(name, operation, log);
  await stage('preflight', () => validateRenderContext(env));
  const { chromium } = await stage('import', async () => {
    const module = await (adapters.loadPlaywright ?? (() => import('playwright')))();
    need(module?.chromium && typeof module.chromium.launch === 'function', 'PLAYWRIGHT_MODULE_INVALID');
    return module;
  });
  const { html, output } = await stage('environment', () => {
    const html = (adapters.readSource ?? (() => readFileSync(resolve(CANDIDATE), 'utf8')))();
    const output = join(env.RUNNER_TEMP, 'ono-render-output');
    (adapters.createOutput ?? (path => mkdirSync(path, { recursive: true, mode: 0o700 })))(output);
    return { html, output };
  });
  const systemChrome = await stage('system_chrome', () => (adapters.verifyChrome ?? verifySystemChrome)(env));
  const browser = await stage('browser_launch', () => chromium.launch({ channel: 'chrome', executablePath: systemChrome.executablePath, chromiumSandbox: true, env: { PATH: env.PATH, HOME: env.HOME, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH } }));
  let failure;
  try {
    let blocked = 0, errors = 0;
    const page = await stage('page_load', async () => {
      need(browser.version() === systemChrome.version, 'SYSTEM_CHROME_RUNTIME_VERSION_MISMATCH');
      const context = await browser.newContext({ viewport: { width: 1440, height: 1024 }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', serviceWorkers: 'block', offline: true, acceptDownloads: false, permissions: [] });
      await context.route('**/*', route => { blocked++; return route.abort(); });
      await context.routeWebSocket('**/*', socket => { blocked++; socket.close(); });
      const page = await context.newPage(); page.on('pageerror', () => errors++);
      // Reviewed inline-only source; no external resources or raw page logging.
      const csp = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; worker-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
      await page.setContent(html.replace('<head>', `<head><meta http-equiv="Content-Security-Policy" content="${csp}">`), { waitUntil: 'load', timeout: 15000 });
      return page;
    });
    const checkPage = () => { need(!blocked, 'PAGE_REQUEST_BLOCKED'); need(!errors, 'PAGE_SCRIPT_ERROR'); };
    await stage('assets', async () => {
      await page.locator('#view-home.on').waitFor();
      need(await page.locator('#tree .nsub').count() === 3, 'INITIAL_STATE_NOT_READY');
      await page.evaluate(() => document.fonts.ready);
      checkPage();
    });
    const raw = await stage('screenshot', () => page.screenshot({ type: 'png', animations: 'disabled', fullPage: false, timeout: 15000 }));
    const normalized = await stage('png', () => {
      checkPage();
      const png = (adapters.normalizeImage ?? normalizePng)(raw);
      need(png.width === 1440 && png.height === 1024, 'RENDER_CHECK_FAILED');
      return png;
    });
    await stage('output', () => {
      const write = adapters.writeOutput ?? ((path, data) => writeFileSync(path, data, { mode: 0o600 }));
      write(join(output, 'prototype.png'), normalized.bytes);
      const manifest = { source: CANDIDATE, state: STATE, sha: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sourceSha256: sha256(html), width: normalized.width, height: normalized.height, rawSha256: sha256(raw), pixelSha256: sha256(normalized.pixels), imageSha256: sha256(normalized.bytes), browser: systemChrome.version, browserSource: 'system-google-chrome-stable', browserExecutable: systemChrome.executablePath, browserUid: systemChrome.uid, sandboxProfile: 'chrome', visualReview: 'not-performed', purpose: 'historical-prototype-render-pilot' };
      write(join(output, 'manifest.json'), JSON.stringify(manifest));
      log(`Render decoded and normalized: ${STATE}; 1440x1024; SHA256=${manifest.imageSha256}. Visual fidelity not yet reviewed.`);
    });
  } catch (error) { failure = error; }
  try { await stage('cleanup', () => browser.close()); }
  catch (error) {
    if (!failure) failure = error;
    else log(formatDiagnostic(error)); // Preserve both safe codes; primary failure wins.
  }
  if (failure) throw failure;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  render().catch(error => { console.error(formatDiagnostic(error)); process.exitCode = 1; });
}
