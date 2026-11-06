import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function isFile(path: string): boolean {
  try { return statSync(path).isFile(); } catch { return false; }
}

function inDirectory(directory: string): string | undefined {
  const executable = join(directory, 'codex.exe');
  if (isFile(executable)) return executable;
  // npm exposes a .cmd shim on Windows; start its native binary without a shell.
  if (!isFile(join(directory, 'codex.cmd'))) return;
  const packages = join(directory, 'node_modules', '@openai');
  for (const [name, target] of [['codex-win32-x64', 'x86_64-pc-windows-msvc'], ['codex-win32-arm64', 'aarch64-pc-windows-msvc']]) {
    for (const root of [join(packages, name), join(packages, 'codex'), join(packages, 'codex', 'node_modules', '@openai', name)]) {
      const binary = join(root, 'vendor', target, 'codex', 'codex.exe');
      if (isFile(binary)) return binary;
    }
  }
}

export function resolveCodexExecutable(env: NodeJS.ProcessEnv = process.env, platform: NodeJS.Platform = process.platform): string {
  if (platform !== 'win32') return 'codex';
  const directories = Object.entries(env).filter(([name]) => name.toLowerCase() === 'path')
    .flatMap(([, value]) => (value ?? '').split(';')).map(value => value.trim().replace(/^"(.*)"$/, '$1')).filter(Boolean);
  if (env.CODEX_INSTALL_DIR) directories.push(env.CODEX_INSTALL_DIR);
  if (env.LOCALAPPDATA) directories.push(join(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin'));
  if (env.APPDATA) directories.push(join(env.APPDATA, 'npm'));
  for (const directory of new Set(directories)) {
    const executable = inDirectory(directory);
    if (executable) return executable;
  }
  if (env.LOCALAPPDATA) {
    const bundled = join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
    const direct = inDirectory(bundled);
    if (direct) return direct;
    try {
      const binaries = readdirSync(bundled, { withFileTypes: true }).filter(entry => entry.isDirectory())
        .map(entry => join(bundled, entry.name, 'codex.exe')).filter(isFile)
        .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
      if (binaries[0]) return binaries[0];
    } catch { /* The desktop app may not be installed. */ }
  }
  return 'codex';
}
