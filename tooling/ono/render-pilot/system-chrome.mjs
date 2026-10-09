import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { posix } from 'node:path';
// The verified target is Linux even when mocked tests run on Windows.
const { dirname, resolve } = posix;

const EXECUTABLE = '/opt/google/chrome/chrome';
const WRAPPER = '/opt/google/chrome/google-chrome';
const ENTRY = '/usr/bin/google-chrome';
const PROFILE = '/etc/apparmor.d/chrome';
const LOCAL_PROFILE = '/etc/apparmor.d/local/chrome';
const LOADED_PROFILES = '/sys/kernel/security/apparmor/profiles';
const PACKAGE = 'google-chrome-stable';
// Reviewed runner image 20261004.327.1. Image updates require a reviewed pin change:
// https://raw.githubusercontent.com/actions/runner-images/ubuntu24/20261004.327/images/ubuntu/Ubuntu2404-Readme.md
export const SYSTEM_CHROME_VERSION = '154.0.8037.97';
const VERSION = '[1-9][0-9]{0,3}\\.[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}';
const WRAPPER_LINKS = new Set([ENTRY, '/etc/alternatives/google-chrome', '/usr/bin/google-chrome-stable']);
export const SYSTEM_CHROME_CODES = Object.freeze([
  'SYSTEM_CHROME_CREDENTIALS_PRESENT', 'SYSTEM_CHROME_NONROOT_REQUIRED',
  'SYSTEM_CHROME_EXECUTABLE_UNVERIFIED', 'SYSTEM_CHROME_WRAPPER_UNVERIFIED',
  'SYSTEM_CHROME_PACKAGE_UNVERIFIED', 'SYSTEM_CHROME_APPARMOR_UNVERIFIED',
  'SYSTEM_CHROME_PROFILE_UNREADABLE', 'SYSTEM_CHROME_PROFILE_NOT_LOADED', 'SYSTEM_CHROME_VERSION_UNVERIFIED',
]);
const need = ok => { if (!ok) throw new Error('unverified'); };
const checked = (code, operation) => {
  try { return operation(); }
  catch { throw new Error(code); } // Never retain or expose raw file/command errors.
};
const boundedText = (value, limit) => {
  need(typeof value === 'string' && Buffer.byteLength(value, 'utf8') <= limit && !value.includes('\0'));
  return value;
};
function profileLines(text) {
  return text.split('\n').map(line => line.trim().replace(/^#include(?=\s)/, 'include')
    .replace(/#.*/, '').trim()).filter(Boolean);
}

// Read-only preconditions for the trusted GitHub-hosted Ubuntu runner. Installed
// package ownership/status, protected paths and matching versions are provenance
// evidence, NOT cryptographic attestation of a package or the loaded policy.
// The loaded profile list proves its name/mode, not byte equality with the file.
// Sources: actions/runner-images installs Google's official stable .deb:
// https://github.com/actions/runner-images/blob/main/images/ubuntu/scripts/build/install-google-chrome.sh
// Ubuntu's existing Chrome userns exception is documented by Chromium:
// https://chromium.googlesource.com/chromium/src/+/main/docs/security/apparmor-userns-restrictions.md
// We inspect that existing policy only; never install, reload, chmod or weaken it.
// Adapters are in-process test seams, never obtained from workflow input/files.
export function verifySystemChrome(env = process.env, adapters = {}) {
  const io = adapters.fs ?? fs;
  const account = adapters.process ?? process;
  const run = adapters.run ?? execFileSync;
  checked('SYSTEM_CHROME_CREDENTIALS_PRESENT', () => need(!env.GH_TOKEN && !env.GITHUB_TOKEN));
  const { uid, gid } = checked('SYSTEM_CHROME_NONROOT_REQUIRED', () => {
    need(account.platform === 'linux');
    const uid = account.getuid(), euid = account.geteuid(), gid = account.getgid(), egid = account.getegid();
    need([uid, euid, gid, egid].every(id => Number.isSafeInteger(id) && id > 0) && uid === euid && gid === egid);
    return { uid, gid };
  });
  const directories = path => {
    for (let current = dirname(path); ; current = dirname(current)) {
      const stat = io.lstatSync(current);
      need(stat.isDirectory() && stat.uid === 0 && (stat.mode & 0o022) === 0 && io.realpathSync(current) === current);
      if (current === '/') break;
    }
  };
  const regular = (path, { executable = false, maxSize = Infinity, allowSetuid = false } = {}) => {
    directories(path);
    const stat = io.lstatSync(path);
    need(stat.isFile() && stat.uid === 0 && (stat.mode & 0o022) === 0 && stat.size <= maxSize && io.realpathSync(path) === path);
    if (executable) {
      need((stat.mode & 0o005) === 0o005 && (stat.mode & (allowSetuid ? 0o2000 : 0o6000)) === 0);
      io.accessSync(path, fs.constants.X_OK);
    }
    return stat;
  };
  const command = (path, args, limit = 4096) => {
    regular(path, { executable: true, allowSetuid: path === '/usr/bin/sudo' });
    return boundedText(run(path, args, {
      encoding: 'utf8', timeout: 10000, maxBuffer: limit, shell: false, cwd: '/',
      stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' },
    }), limit);
  };
  checked('SYSTEM_CHROME_EXECUTABLE_UNVERIFIED', () => regular(EXECUTABLE, { executable: true }));
  checked('SYSTEM_CHROME_WRAPPER_UNVERIFIED', () => {
    regular(WRAPPER, { executable: true });
    let current = ENTRY;
    const visited = new Set();
    while (current !== WRAPPER) {
      need(WRAPPER_LINKS.has(current) && !visited.has(current));
      visited.add(current);
      directories(current);
      const stat = io.lstatSync(current);
      // POSIX symlink mode bits do not control writes; protect their owner and
      // containing directory instead, and only accept the fixed alternatives chain.
      need(stat.isSymbolicLink() && stat.uid === 0);
      current = resolve(dirname(current), boundedText(io.readlinkSync(current), 256));
    }
    need(io.realpathSync(ENTRY) === WRAPPER);
  });
  const version = checked('SYSTEM_CHROME_PACKAGE_UNVERIFIED', () => {
    const owned = command('/usr/bin/dpkg-query', ['--search', EXECUTABLE, WRAPPER]).trim().split('\n');
    need(owned.length === 2 && new Set(owned).size === 2 &&
      [EXECUTABLE, WRAPPER].every(path => owned.includes(`${PACKAGE}: ${path}`)));
    const installed = command('/usr/bin/dpkg-query', ['--show', '--showformat=${Package}\\t${Status}\\t${Version}\\n', PACKAGE]);
    const match = new RegExp(`^${PACKAGE}\\tinstall ok installed\\t(${VERSION})-[1-9][0-9]{0,3}\\n?$`).exec(installed);
    need(match);
    return match[1];
  });
  checked('SYSTEM_CHROME_VERSION_UNVERIFIED', () => need(version === SYSTEM_CHROME_VERSION));
  checked('SYSTEM_CHROME_APPARMOR_UNVERIFIED', () => {
    regular(PROFILE, { maxSize: 16384 });
    const text = boundedText(io.readFileSync(PROFILE, 'utf8'), 16384);
    // This is intentionally a small recognized profile grammar, not substring
    // searching: commented grants, globs, extra profiles/rules/includes fail closed.
    const normalized = profileLines(text).join(' ').replace(/\s+/g, ' ');
    need(/^abi <abi\/(?:4|5)\.0>, include <tunables\/global> profile chrome \/opt\/google\/chrome\/chrome flags=\(unconfined\) \{ userns, (?:@\{exec_path\} mr, )?(?:include if exists <local\/chrome> )?\}$/.test(normalized));
    if (normalized.includes('include if exists <local/chrome>')) {
      // Optional site overrides may be absent or comments-only, never unknown rules.
      // Verify even an empty existing local directory before accepting an absent file.
      let local;
      try { local = io.lstatSync(dirname(LOCAL_PROFILE)); }
      catch (error) { if (error?.code !== 'ENOENT') throw error; }
      if (local) {
        need(local.isDirectory() && local.uid === 0 && (local.mode & 0o022) === 0 && io.realpathSync(dirname(LOCAL_PROFILE)) === dirname(LOCAL_PROFILE));
        let exists = false;
        try { io.lstatSync(LOCAL_PROFILE); exists = true; }
        catch (error) { if (error?.code !== 'ENOENT') throw error; }
        if (exists) {
          regular(LOCAL_PROFILE, { maxSize: 4096 });
          need(profileLines(boundedText(io.readFileSync(LOCAL_PROFILE, 'utf8'), 4096)).length === 0);
        }
      }
    }
    need(boundedText(io.readFileSync('/sys/module/apparmor/parameters/enabled', 'utf8'), 16).trim() === 'Y');
    need(boundedText(io.readFileSync('/proc/sys/kernel/apparmor_restrict_unprivileged_userns', 'utf8'), 16).trim() === '1');
  });
  const profiles = checked('SYSTEM_CHROME_PROFILE_UNREADABLE', () => {
    regular('/usr/bin/cat', { executable: true });
    // Only this fixed read is elevated; Chrome itself is never launched by sudo.
    return command('/usr/bin/sudo', ['-n', '/usr/bin/cat', LOADED_PROFILES], 65536).split('\n');
  });
  checked('SYSTEM_CHROME_PROFILE_NOT_LOADED', () => {
    need(profiles.filter(line => /^chrome(?:\s|$)/.test(line)).length === 1 && profiles.includes('chrome (unconfined)'));
  });
  checked('SYSTEM_CHROME_VERSION_UNVERIFIED', () => {
    // Run only after identity, package, path and sandbox-policy checks pass.
    const actual = command(EXECUTABLE, ['--product-version'], 128);
    need(new RegExp(`^${VERSION}\\n?$`).test(actual) && actual.trim() === version);
  });
  return Object.freeze({ executablePath: EXECUTABLE, version, uid, gid });
}
