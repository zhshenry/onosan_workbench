import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Chromium persists Local State asynchronously on first use. Wait before starting the other process. */
export async function waitForMainEncryption(directory: string): Promise<void> {
  if (process.platform !== 'win32') return;
  const source = join(directory, 'Local State');
  for (let attempt = 0; attempt < 200; attempt++) {
    try { if (JSON.parse(readFileSync(source, 'utf8')).os_crypt?.encrypted_key) return; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('系统加密状态尚未保存，请稍后重新启动 OnO；未启动独立 Bot 后台');
}

/** Both Electron processes must use the same OS-protected encryption key. No plaintext key is exported. */
export function prepareHostEncryption(directory: string): void {
  if (process.platform !== 'win32') return;
  const source = join(directory, 'Local State'), targetDirectory = join(directory, 'bot-process'), target = join(targetDirectory, 'Local State');
  if (!existsSync(source)) return;
  const state = JSON.parse(readFileSync(source, 'utf8')) as { os_crypt?: { encrypted_key?: string } };
  if (!state.os_crypt?.encrypted_key) return;
  const hostState = existsSync(target) ? JSON.parse(readFileSync(target, 'utf8')) : {};
  if (hostState.os_crypt?.encrypted_key === state.os_crypt.encrypted_key) return;
  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(target, JSON.stringify({ ...hostState, os_crypt: { ...hostState.os_crypt, encrypted_key: state.os_crypt.encrypted_key } }), { mode: 0o600 });
}
