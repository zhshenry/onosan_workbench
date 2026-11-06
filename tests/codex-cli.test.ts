import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { resolveCodexExecutable } from '../electron/codex-cli';

function fixture(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), 'ono-codex-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const env = { Path: join(root, 'Windows'), LOCALAPPDATA: join(root, 'Local AppData'), APPDATA: join(root, 'Roaming') };
  const file = (...parts: string[]) => {
    const path = join(...parts); mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, 'synthetic executable fixture'); return path;
  };
  return { env, file, root };
}

test('Codex CLI: Explorer-style PATH still finds the desktop app native CLI without a version hash', t => {
  const { env, file } = fixture(t), bundled = join(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin');
  const older = file(bundled, 'old-version', 'codex.exe'), current = file(bundled, 'new-version', 'codex.exe');
  utimesSync(older, 1000, 1000); utimesSync(current, 2000, 2000);
  file(bundled, 'helper-only', 'codex-command-runner.exe');
  assert.equal(resolveCodexExecutable(env, 'win32'), current);
});

test('Codex CLI: a native command in quoted PATH takes priority over bundled copies', t => {
  const { env, file, root } = fixture(t), directory = join(root, 'Custom CLI');
  const executable = file(directory, 'codex.exe');
  file(env.LOCALAPPDATA, 'OpenAI', 'Codex', 'bin', 'new-version', 'codex.exe');
  assert.equal(resolveCodexExecutable({ ...env, PATH: `"${directory}"` }, 'win32'), executable);
});

test('Codex CLI: standalone installation and an explicit installer directory work without PATH changes', t => {
  const { env, file, root } = fixture(t);
  const standalone = file(env.LOCALAPPDATA, 'Programs', 'OpenAI', 'Codex', 'bin', 'codex.exe');
  assert.equal(resolveCodexExecutable(env, 'win32'), standalone);
  const custom = file(root, 'Standalone CLI', 'codex.exe');
  assert.equal(resolveCodexExecutable({ ...env, CODEX_INSTALL_DIR: dirname(custom) }, 'win32'), custom);
});

test('Codex CLI: Windows npm shims resolve to native binaries in both package layouts', t => {
  for (const layout of ['legacy', 'optional', 'nested']) {
    const { env, file } = fixture(t), prefix = join(env.APPDATA, 'npm');
    file(prefix, 'codex.cmd');
    const packages = join(prefix, 'node_modules', '@openai');
    const root = layout === 'legacy' ? join(packages, 'codex') : layout === 'optional' ? join(packages, 'codex-win32-x64') : join(packages, 'codex', 'node_modules', '@openai', 'codex-win32-x64');
    const executable = file(root, 'vendor', 'x86_64-pc-windows-msvc', 'codex', 'codex.exe');
    assert.equal(resolveCodexExecutable(env, 'win32'), executable);
  }
});

test('Codex CLI: missing installations keep the normal startup failure path and other platforms keep PATH lookup', t => {
  const { env } = fixture(t);
  assert.equal(resolveCodexExecutable(env, 'win32'), 'codex');
  assert.equal(resolveCodexExecutable(env, 'linux'), 'codex');
  assert.equal(resolveCodexExecutable({}, 'win32'), 'codex');
});
