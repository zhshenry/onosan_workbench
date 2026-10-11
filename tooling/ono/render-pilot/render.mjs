import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { normalizePng } from './png.mjs';
import { runStage, formatDiagnostic } from './diagnostics.mjs';
import { verifySystemChrome } from './system-chrome.mjs';
import { CANDIDATE, STATE, ISSUE13_STATE, getCandidate, verifySource } from './candidates.mjs';
export { CANDIDATE, STATE };
export const sha256 = b => createHash('sha256').update(b).digest('hex');
const need = (ok, code) => { if (!ok) throw new Error(code); };
export function validateRenderContext(env) {
  need(env.GITHUB_EVENT_NAME === 'workflow_dispatch' && env.GITHUB_REPOSITORY === 'zhshenry/onosan_workbench' && env.GITHUB_REPOSITORY_ID === '1372377655', 'MANUAL_REPOSITORY_REQUIRED');
  need(env.GITHUB_ACTOR === 'zhshenry' && env.GITHUB_ACTOR_ID === '54107847' && env.GITHUB_TRIGGERING_ACTOR === 'zhshenry', 'OWNER_ACTOR_REQUIRED');
  need(env.GITHUB_REF === 'refs/heads/main' && /^[a-f0-9]{40}$/.test(env.APPROVED_SHA ?? '') && env.APPROVED_SHA === env.GITHUB_SHA, 'APPROVED_MAIN_REQUIRED');
  const candidate = getCandidate(env.PROTOTYPE_STATE);
  need(/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID ?? '') && /^[1-9][0-9]*$/.test(env.GITHUB_RUN_ATTEMPT ?? ''), 'RUN_ID_REQUIRED');
  need(!env.GH_TOKEN && !env.GITHUB_TOKEN, 'RENDER_MUST_NOT_HAVE_TOKEN');
  return candidate;
}
// Only the reviewed three-card initial board is renderable. These selectors and
// values are code-owned, never workflow parameters or assertions from the page.
export async function verifyIssue13State(page) {
  await page.locator('#issue13-review[data-ready="true"]').waitFor();
  need(await page.locator('#issue13-review').count() === 1 &&
    await page.locator('#issue13-review article').count() === 3, 'ISSUE_STATE_NOT_READY');
  const text = async (selector, value) => {
    const locator = page.locator(selector);
    need(await locator.count() === 1 && (await locator.textContent()).trim() === value, 'ISSUE_STATE_NOT_READY');
  };
  for (const [state, dataState] of [['calendar', 'calendar-2026-10'], ['years', 'year-entry-1990'], ['jumped', 'calendar-1990-10']]) {
    const root = `#issue13-review article#state-${state}`;
    need(await page.locator(root).count() === 1, 'ISSUE_STATE_NOT_READY');
    const controller = page.locator(root);
    need(await controller.getAttribute('data-preview') === state && await controller.getAttribute('data-state') === dataState, 'ISSUE_STATE_NOT_READY');
    need(await page.locator(`${root} [data-ui="calendar-view"]`).isVisible() === (state !== 'years') &&
      await page.locator(`${root} [data-ui="year-view"]`).isVisible() === (state === 'years'), 'ISSUE_STATE_NOT_READY');
    await text(`${root} .date-value`, '选择日期');
  }
  await text('#state-calendar [data-ui="view-year"]', '2026年');
  await text('#state-calendar [data-ui="view-month"]', '10月');
  await text('#state-years .decade-label', '2020–2029');
  const input = page.locator('#state-years .year-input');
  need(await input.count() === 1 && await input.inputValue() === '1990', 'ISSUE_STATE_NOT_READY');
  await text('#state-jumped [data-ui="view-year"]', '1990年');
  await text('#state-jumped [data-ui="view-month"]', '10月');
}
// Adapters are an in-process test seam, never read from workflow inputs or files.
export async function render(env = process.env, adapters = {}) {
  const log = adapters.log ?? console.log;
  const stage = (name, operation) => runStage(name, operation, log);
  const candidate = await stage('preflight', () => validateRenderContext(env));
  const { chromium } = await stage('import', async () => {
    const module = await (adapters.loadPlaywright ?? (() => import('playwright')))();
    need(module?.chromium && typeof module.chromium.launch === 'function', 'PLAYWRIGHT_MODULE_INVALID');
    return module;
  });
  const { html, sourceSha256, output } = await stage('environment', () => {
    const bytes = (adapters.readSource ?? (() => readFileSync(resolve(candidate.source))))();
    const sourceSha256 = verifySource(candidate, bytes);
    const html = Buffer.from(bytes).toString('utf8');
    if (candidate.state === ISSUE13_STATE) need(html.split('<head>').length === 2, 'SOURCE_CSP_REQUIRED');
    const output = join(env.RUNNER_TEMP, 'ono-render-output');
    (adapters.createOutput ?? (path => mkdirSync(path, { recursive: true, mode: 0o700 })))(output);
    return { html, sourceSha256, output };
  });
  const systemChrome = await stage('system_chrome', () => (adapters.verifyChrome ?? verifySystemChrome)(env));
  const browser = await stage('browser_launch', () => chromium.launch({ channel: 'chrome', executablePath: systemChrome.executablePath, chromiumSandbox: true, env: { PATH: env.PATH, HOME: env.HOME, PLAYWRIGHT_BROWSERS_PATH: env.PLAYWRIGHT_BROWSERS_PATH } }));
  let failure;
  try {
    let blocked = 0, errors = 0;
    const page = await stage('page_load', async () => {
      need(browser.version() === systemChrome.version, 'SYSTEM_CHROME_RUNTIME_VERSION_MISMATCH');
      const context = await browser.newContext({ viewport: { width: candidate.width, height: candidate.height }, deviceScaleFactor: 1, locale: 'zh-CN', timezoneId: 'UTC', colorScheme: 'light', serviceWorkers: 'block', offline: true, acceptDownloads: false, permissions: [] });
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
      if (candidate.state === ISSUE13_STATE) await verifyIssue13State(page);
      else {
        await page.locator('#view-home.on').waitFor();
        need(await page.locator('#tree .nsub').count() === 3, 'INITIAL_STATE_NOT_READY');
      }
      await page.evaluate(() => document.fonts.ready);
      checkPage();
    });
    const raw = await stage('screenshot', () => page.screenshot({ type: 'png', animations: 'disabled', fullPage: false, timeout: 15000 }));
    const normalized = await stage('png', () => {
      checkPage();
      const png = (adapters.normalizeImage ?? normalizePng)(raw);
      need(png.width === candidate.width && png.height === candidate.height, 'RENDER_CHECK_FAILED');
      return png;
    });
    await stage('output', () => {
      const write = adapters.writeOutput ?? ((path, data) => writeFileSync(path, data, { mode: 0o600 }));
      write(join(output, 'prototype.png'), normalized.bytes);
      const manifest = { source: candidate.source, state: candidate.state, ...(candidate.issue === null ? {} : { issue: candidate.issue }), sha: env.GITHUB_SHA, run: env.GITHUB_RUN_ID, attempt: env.GITHUB_RUN_ATTEMPT, sourceSha256, width: normalized.width, height: normalized.height, rawSha256: sha256(raw), pixelSha256: sha256(normalized.pixels), imageSha256: sha256(normalized.bytes), browser: systemChrome.version, browserSource: 'system-google-chrome-stable', browserExecutable: systemChrome.executablePath, browserUid: systemChrome.uid, sandboxProfile: 'chrome', visualReview: 'not-performed', purpose: candidate.purpose };
      write(join(output, 'manifest.json'), JSON.stringify(manifest));
      log(`Render decoded and normalized: ${candidate.state}; ${candidate.width}x${candidate.height}; SHA256=${manifest.imageSha256}. Visual fidelity not yet reviewed.`);
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
