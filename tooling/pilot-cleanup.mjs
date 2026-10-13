import { execFile } from 'node:child_process';
import path from 'node:path';

export async function bounded(action, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs); }),
    ]);
  } finally { clearTimeout(timer); }
}

// Only the exact process launched by this pilot is eligible, never image-name kills.
export async function terminatePilotProcess(child, executablePath, timeoutMs = 5000) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0 ||
      path.resolve(child.spawnfile).toLowerCase() !== path.resolve(executablePath).toLowerCase()) {
    throw new Error('Refusing termination: process is not the installed pilot executable');
  }
  if (process.platform !== 'win32') throw new Error('Installed pilot termination is Windows-only');
  await new Promise((resolve, reject) => {
    execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: timeoutMs, windowsHide: true }, error => {
      if (error && child.exitCode === null && child.signalCode === null) reject(error);
      else resolve();
    });
  });
}

export async function finalizePilot({ report, saveReport, application, executablePath,
  closeTimeoutMs = 10000, killTimeoutMs = 5000, terminate = terminatePilotProcess }) {
  const saveBeforeCleanup = async () => {
    try { await saveReport(); } catch (error) {
      report.status = 'failed';
      report.errors.push(`Report write before cleanup: ${String(error)}`);
    }
  };
  // A failed evidence write must never prevent bounded process cleanup.
  await saveBeforeCleanup();
  if (application) {
    const child = application.process();
    try {
      await bounded(() => application.close(), closeTimeoutMs, 'Electron cleanup close');
    } catch (error) {
      report.status = 'failed';
      report.errors.push(`Cleanup: ${String(error)}`);
      report.cleanup = { status: 'fallback-required', error: String(error) };
      await saveBeforeCleanup();
      try {
        await bounded(() => terminate(child, executablePath, killTimeoutMs), killTimeoutMs + 1000, 'Pilot process termination');
        report.cleanup.status = 'fallback-completed';
      } catch (killError) {
        report.cleanup.status = 'fallback-failed';
        report.errors.push(`Cleanup termination: ${String(killError)}`);
      }
    }
  }
  report.finishedAt = new Date().toISOString();
  await saveReport();
}

export function failurePage(application, mainPage, failedCheck = '') {
  return (/^Floating group:/.test(failedCheck) && application?.windows().find(candidate =>
    !candidate.isClosed() && /[?&]window=float(?:&|$)/.test(candidate.url()))) || mainPage;
}

// A timed-out Playwright close can retain pipe/socket handles even after taskkill.
// Call only after report writes and evidence validation have completed.
export function exitPilot(status) { process.exit(status === 'passed' ? 0 : 1); }
