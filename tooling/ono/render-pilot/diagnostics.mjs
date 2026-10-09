import { SYSTEM_CHROME_CODES } from './system-chrome.mjs';
// Finite diagnostics only. Never serialize an exception, environment or page data.
export const STAGES = Object.freeze(['preflight', 'import', 'environment', 'system_chrome', 'browser_launch', 'page_load', 'assets', 'screenshot', 'png', 'output', 'cleanup']);
const GUARD_CODES = Object.freeze([...SYSTEM_CHROME_CODES, 'SYSTEM_CHROME_RUNTIME_VERSION_MISMATCH', 'MANUAL_REPOSITORY_REQUIRED', 'OWNER_ACTOR_REQUIRED', 'APPROVED_MAIN_REQUIRED', 'UNSUPPORTED_STATE', 'RUN_ID_REQUIRED', 'RENDER_MUST_NOT_HAVE_TOKEN', 'PLAYWRIGHT_MODULE_INVALID', 'INITIAL_STATE_NOT_READY', 'RENDER_CHECK_FAILED', 'PAGE_REQUEST_BLOCKED', 'PAGE_SCRIPT_ERROR', 'PNG_SIGNATURE', 'PNG_TRUNCATED', 'PNG_CRC', 'PNG_HEADER', 'PNG_FORMAT', 'PNG_ORDER', 'PNG_END', 'PNG_UNSUPPORTED_CHUNK', 'PNG_NO_END', 'PNG_DEFLATE', 'PNG_FILTER', 'PIXEL_LIMIT']);
export const ERROR_CODES = Object.freeze([...GUARD_CODES, 'TIMEOUT', 'PERMISSION_DENIED', 'FILE_NOT_FOUND', 'MODULE_NOT_FOUND', 'INVALID_ARGUMENT', 'BROWSER_SANDBOX_UNAVAILABLE', 'BROWSER_NAMESPACE_FAILED', 'BROWSER_EXECUTABLE_MISSING', 'OPERATION_FAILED']);
export function classifyError(stage, error) {
  // Even property access may throw for an arbitrary exception object.
  try {
    const message = error?.message, name = error?.name, code = error?.code;
    if (GUARD_CODES.includes(message)) return message;
    if (name === 'TimeoutError' || code === 'ETIMEDOUT') return 'TIMEOUT';
    if (['EACCES', 'EPERM'].includes(code)) return 'PERMISSION_DENIED';
    if (code === 'ENOENT') return 'FILE_NOT_FOUND';
    if (['ERR_MODULE_NOT_FOUND', 'MODULE_NOT_FOUND'].includes(code)) return 'MODULE_NOT_FOUND';
    if (['ERR_INVALID_ARG_TYPE', 'ERR_INVALID_ARG_VALUE'].includes(code)) return 'INVALID_ARGUMENT';
    if (stage === 'browser_launch' && typeof message === 'string') {
      if (/No usable sandbox!|Running as root without --no-sandbox is not supported/.test(message)) return 'BROWSER_SANDBOX_UNAVAILABLE';
      if (/Failed to move to new namespace/.test(message)) return 'BROWSER_NAMESPACE_FAILED';
      if (/Executable doesn't exist at/.test(message)) return 'BROWSER_EXECUTABLE_MISSING';
    }
  } catch { /* Do not inspect or serialize the object again. */ }
  return 'OPERATION_FAILED';
}
export class RenderDiagnosticError extends Error {
  constructor(stage, code) {
    super('Prototype render failed');
    this.stage = STAGES.includes(stage) ? stage : 'preflight';
    this.code = ERROR_CODES.includes(code) ? code : 'OPERATION_FAILED';
  }
}
export function formatDiagnostic(error) {
  // Revalidate even a forged/mutated error; output cannot include arbitrary strings.
  let stage = 'preflight', code = 'OPERATION_FAILED';
  try {
    if (error instanceof RenderDiagnosticError) {
      const observedStage = error.stage, observedCode = error.code;
      if (STAGES.includes(observedStage)) stage = observedStage;
      if (ERROR_CODES.includes(observedCode)) code = observedCode;
    }
  } catch { /* fixed fallback */ }
  return `Prototype render stopped: stage=${stage}; code=${code}. Raw exception details suppressed.`;
}
export async function runStage(stage, operation, log = console.log) {
  if (!STAGES.includes(stage)) throw new RenderDiagnosticError('preflight', 'INVALID_ARGUMENT');
  log(`Prototype render stage=${stage}; status=start`);
  try {
    const result = await operation();
    log(`Prototype render stage=${stage}; status=passed`);
    return result;
  } catch (error) { throw new RenderDiagnosticError(stage, classifyError(stage, error)); }
}
