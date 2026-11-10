import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { obj, str, type CheckinCredential } from './checkin-providers';

/** Read only device metadata; never inspect another app's login databases or tokens. */
export function checkinDeviceId(provider: string, fallback: string): string {
  if (provider !== 'trae') return fallback;
  for (const name of ['TRAE SOLO CN', 'Trae CN']) {
    try {
      const file = process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', name, 'machineid') : join(process.env.APPDATA || '', name, 'machineid');
      const id = readFileSync(file, 'utf8').trim();
      if (/^[a-zA-Z0-9_-]{16,128}$/.test(id)) return id;
    } catch { /* Use the same persisted local identifier for authorization and checking. */ }
  }
  return fallback;
}
export async function qoderNativeIdentity(userId: string): Promise<CheckinCredential['native']> {
  if (process.platform !== 'win32') return undefined;
  const roots: string[] = [];
  for (const name of ['Qoder CN', 'QoderCN']) {
    for (const launcher of [`${name} Launcher`, 'Launcher']) {
      try {
        const ini = readFileSync(join(process.env.LOCALAPPDATA || '', name, launcher, 'state.ini'), 'utf8');
        const path = /^installDir\s*=\s*(.+)$/im.exec(ini)?.[1]?.trim();
        if (path) roots.push(path);
      } catch { /* The official desktop app is optional. */ }
    }
    roots.push(join(process.env.LOCALAPPDATA || '', 'Programs', name), join(process.env.ProgramFiles || 'C:\\Program Files', name));
  }
  for (const root of roots) {
    const executable = join(root, 'resources', 'umid', 'runtime-info.exe');
    if (!existsSync(executable)) continue;
    try {
      // Use one real native sample. No identity rotation, seed changes or VM overrides.
      const stdout = await new Promise<string>((resolve, reject) => {
        const child = execFile(executable, ['0', '--account-stdin'], { cwd: dirname(executable), timeout: 25000, windowsHide: true, maxBuffer: 128 * 1024 }, (error, output) => error ? reject(error) : resolve(output));
        child.stdin?.on('error', reject);
        child.stdin?.end(`${JSON.stringify({ account: userId })}\n`);
      });
      const d = obj(JSON.parse(stdout.trim().split('\n')[0]));
      let version = '0.4.8';
      try { version = str(obj(JSON.parse(readFileSync(join(root, 'resources', 'app', 'package.json'), 'utf8'))).version) || version; } catch { /* Protocol version fallback. */ }
      if (typeof d.machineToken === 'string' && d.machineToken && d.machineType !== undefined && typeof d.machineCode === 'string' && d.machineCode) return { machineToken: d.machineToken, machineType: String(d.machineType), machineCode: d.machineCode, version };
    } catch { return undefined; }
  }
  return undefined;
}
