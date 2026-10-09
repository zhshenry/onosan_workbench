import * as fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { posix } from 'node:path';
// The verified target is Linux even when mocked tests run on Windows.
const { dirname, resolve } = posix;

const EXECUTABLE = '/opt/google/chrome/chrome';
const PAYLOAD_ROOT = '/opt/google/chrome';
const WRAPPER = '/opt/google/chrome/google-chrome';
const ENTRY = '/usr/bin/google-chrome';
const PROFILE = '/etc/apparmor.d/chrome';
const LOCAL_PROFILE = '/etc/apparmor.d/local/chrome';
const LOADED_PROFILES = '/sys/kernel/security/apparmor/profiles';
const PACKAGE = 'google-chrome-stable';
// Reviewed runner image 20261004.327.1. Image updates require a reviewed pin change:
// https://raw.githubusercontent.com/actions/runner-images/ubuntu24/20261004.327/images/ubuntu/Ubuntu2404-Readme.md
export const SYSTEM_CHROME_VERSION = '154.0.8037.97';
const PACKAGE_SHA256 = 'a4edbe95e9b01db6c9b97d7a1323121eda18362b5620df06abac1b59bee80053';
const MANIFEST_SHA256 = 'f9dd5a61fcfd187eac5beecf9fa0e81c2b43751ad24779dea67af2fcc2bc9d9e';
const PAYLOAD_ANCESTORS = new Set(['/opt', '/opt/google', PAYLOAD_ROOT]);
const VERSION = '[1-9][0-9]{0,3}\\.[0-9]{1,6}\\.[0-9]{1,6}\\.[0-9]{1,6}';
const WRAPPER_LINKS = new Set([ENTRY, '/etc/alternatives/google-chrome', '/usr/bin/google-chrome-stable']);
// Fixed labels expose which reviewed precondition was unverifiable, never a
// discovered path, owner/mode value, raw exception or filesystem contents.
const EXECUTABLE_CHAIN = Object.freeze([
  Object.freeze({ path: '/opt/google/chrome', label: 'CHROME_DIR', directory: true }),
  Object.freeze({ path: '/opt/google', label: 'GOOGLE', directory: true }),
  Object.freeze({ path: '/opt', label: 'OPT', directory: true }),
  Object.freeze({ path: '/', label: 'ROOT', directory: true }),
  Object.freeze({ path: EXECUTABLE, label: 'BINARY', directory: false }),
]);
const PATH_REASONS = Object.freeze(['UNREADABLE', 'TYPE_UNVERIFIED', 'OWNER_UNVERIFIED', 'WRITABLE', 'CANONICAL_UNVERIFIED']);
const BINARY_REASONS = Object.freeze(['SIZE_UNVERIFIED', 'EXECUTABLE_UNVERIFIED', 'PRIVILEGED', 'ACCESS_UNVERIFIED']);
export const SYSTEM_CHROME_CODES = Object.freeze([
  'SYSTEM_CHROME_CREDENTIALS_PRESENT', 'SYSTEM_CHROME_NONROOT_REQUIRED',
  'SYSTEM_CHROME_EXECUTABLE_UNVERIFIED', 'SYSTEM_CHROME_WRAPPER_UNVERIFIED',
  'SYSTEM_CHROME_PACKAGE_UNVERIFIED', 'SYSTEM_CHROME_APPARMOR_UNVERIFIED',
  'SYSTEM_CHROME_PROFILE_UNREADABLE', 'SYSTEM_CHROME_PROFILE_NOT_LOADED', 'SYSTEM_CHROME_PACKAGE_VERSION_MISMATCH',
  'SYSTEM_CHROME_MANIFEST_UNVERIFIED', 'SYSTEM_CHROME_PAYLOAD_UNVERIFIED',
  ...EXECUTABLE_CHAIN.flatMap(({ label }) => PATH_REASONS.map(reason => `SYSTEM_CHROME_${label}_${reason}`)),
  ...BINARY_REASONS.map(reason => `SYSTEM_CHROME_BINARY_${reason}`),
]);
const need = ok => { if (!ok) throw new Error('unverified'); };
const diagnosticErrors = new WeakSet();
const checked = (code, operation) => {
  try { return operation(); }
  catch (error) {
    // Only our internal diagnostics survive an outer guard. Arbitrary I/O errors,
    // even ones whose messages resemble a code, never supply diagnostic text.
    // WeakSet membership never invokes hostile exception properties/prototypes.
    if (diagnosticErrors.has(error)) throw error;
    const diagnostic = new Error(code);
    diagnosticErrors.add(diagnostic);
    throw diagnostic;
  }
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
// package metadata plus a pinned full-runtime SHA256 manifest verify content
// against the exact package obtained from Google HTTPS. This is not a signed-APT
// claim or attestation of the machine or loaded policy. GitHub intentionally
// makes /opt writable; never infer content integrity from those permission bits:
// https://github.com/actions/runner-images/blob/ubuntu24/20261004.327/images/ubuntu/scripts/build/configure-system.sh
// The trusted single-job model excludes hostile concurrent host processes (the
// runner already has passwordless sudo). Descriptor/stat checks detect ordinary
// changes, but cannot eliminate TOCTOU before Playwright's later path-based exec.
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
  let payloadVerified = false;
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
      need(stat.isDirectory() && stat.uid === 0 && ((stat.mode & 0o022) === 0 || (payloadVerified && PAYLOAD_ANCESTORS.has(current))) && io.realpathSync(current) === current);
      if (current === '/') break;
    }
  };
  const regular = (path, { executable = false, maxSize = Infinity, allowSetuid = false } = {}) => {
    directories(path);
    const stat = io.lstatSync(path);
    need(stat.isFile() && stat.uid === 0 && ((stat.mode & 0o022) === 0 || (payloadVerified && [EXECUTABLE, WRAPPER].includes(path))) && stat.size <= maxSize && io.realpathSync(path) === path);
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
  checked('SYSTEM_CHROME_EXECUTABLE_UNVERIFIED', () => {
    // /opt is deliberately writable in the official image. These preliminary
    // type/owner/path checks never suffice alone: verify all payload bytes below.
    for (const { path, label, directory } of EXECUTABLE_CHAIN) {
      const verify = (reason, operation) => checked(`SYSTEM_CHROME_${label}_${reason}`, operation);
      const stat = verify('UNREADABLE', () => io.lstatSync(path));
      verify('TYPE_UNVERIFIED', () => need(directory ? stat.isDirectory() : stat.isFile()));
      verify('OWNER_UNVERIFIED', () => need(stat.uid === 0));
      if (path === '/') verify('WRITABLE', () => need((stat.mode & 0o022) === 0));
      if (!directory) verify('SIZE_UNVERIFIED', () => need(stat.size <= Infinity));
      const canonical = verify('UNREADABLE', () => io.realpathSync(path));
      verify('CANONICAL_UNVERIFIED', () => need(canonical === path));
      if (!directory) {
        verify('EXECUTABLE_UNVERIFIED', () => need((stat.mode & 0o005) === 0o005));
        verify('PRIVILEGED', () => need((stat.mode & 0o6000) === 0));
        verify('ACCESS_UNVERIFIED', () => io.accessSync(path, fs.constants.X_OK));
      }
    }
  });
  const expected = checked('SYSTEM_CHROME_MANIFEST_UNVERIFIED', () => {
    // A synthetic manifest is an in-process unit-test seam only. Production
    // reads the fixed reviewed source file and verifies its exact byte digest.
    let manifest = adapters.manifest;
    if (manifest === undefined) {
      const text = boundedText(io.readFileSync(new URL('./chrome-154.0.8037.97-manifest.json', import.meta.url), 'utf8'), 65536);
      need(createHash('sha256').update(text).digest('hex') === MANIFEST_SHA256);
      manifest = JSON.parse(text);
    }
    need(manifest?.schema === 1 && manifest.version === SYSTEM_CHROME_VERSION &&
      manifest.package?.url === `https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${SYSTEM_CHROME_VERSION}-1_amd64.deb` &&
      manifest.package.sha256 === PACKAGE_SHA256 && manifest.package.version === `${SYSTEM_CHROME_VERSION}-1` &&
      manifest.package.architecture === 'amd64' && manifest.package.authentication === 'Google official HTTPS; no APT signature claim' &&
      Array.isArray(manifest.entries) && manifest.entries.length >= 2 && manifest.entries.length <= 1024);
    const expected = new Map(); let total = 0;
    for (const item of manifest.entries) {
      need(typeof item.path === 'string' && item.path.length <= 256 && /^[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*$/.test(item.path) &&
        item.path.split('/').every(part => !['.', '..'].includes(part)) && !expected.has(item.path));
      need(item.type === 'directory' || (item.type === 'file' && Number.isSafeInteger(item.size) && item.size >= 0 && item.size <= 536870912 && /^[a-f0-9]{64}$/.test(item.sha256)));
      if (item.type === 'file') total += item.size;
      expected.set(item.path, item);
    }
    need(total <= 536870912 && expected.get('chrome')?.type === 'file' && expected.get('google-chrome')?.type === 'file');
    for (const path of expected.keys()) if (dirname(path) !== '.') need(expected.get(dirname(path))?.type === 'directory');
    return expected;
  });
  checked('SYSTEM_CHROME_PAYLOAD_UNVERIFIED', () => {
    const buffer = Buffer.alloc(1024 * 1024);
    const unchanged = (a, b) => ['dev', 'ino', 'uid', 'mode', 'size', 'mtimeMs', 'ctimeMs'].every(key => a[key] === b[key]);
    const visit = (relative = '') => {
      const path = relative ? `${PAYLOAD_ROOT}/${relative}` : PAYLOAD_ROOT;
      const before = io.lstatSync(path);
      need(before.uid === 0 && io.realpathSync(path) === path);
      const item = relative ? expected.get(relative) : { type: 'directory' };
      need(item);
      if (item.type === 'directory') {
        need(before.isDirectory());
        const names = io.readdirSync(path);
        const wanted = [...expected.keys()].filter(name => (dirname(name) === '.' ? '' : dirname(name)) === relative)
          .map(name => name.slice(relative ? relative.length + 1 : 0)).sort();
        need(Array.isArray(names) && names.every(name => typeof name === 'string') && names.length === wanted.length && names.slice().sort().every((name, index) => name === wanted[index]));
        for (const name of wanted) visit(relative ? `${relative}/${name}` : name);
        need(unchanged(before, io.lstatSync(path)));
      } else {
        // This pinned package has no symlinks. A replaced file/link or extra
        // resource is rejected; no unreviewed runtime member is skipped.
        need(before.isFile() && before.size === item.size);
        const fd = io.openSync(path, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          const opened = io.fstatSync(fd);
          need(opened.isFile() && unchanged(before, opened));
          const hash = createHash('sha256'); let total = 0;
          while (total < item.size) {
            const length = Math.min(buffer.length, item.size - total);
            const count = io.readSync(fd, buffer, 0, length, null);
            need(Number.isSafeInteger(count) && count > 0 && count <= length);
            hash.update(buffer.subarray(0, count)); total += count;
          }
          need(io.readSync(fd, buffer, 0, 1, null) === 0 && hash.digest('hex') === item.sha256 &&
            unchanged(opened, io.fstatSync(fd)) && unchanged(opened, io.lstatSync(path)));
        } finally { io.closeSync(fd); }
      }
    };
    visit();
    payloadVerified = true;
  });
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
  checked('SYSTEM_CHROME_PACKAGE_VERSION_MISMATCH', () => need(version === SYSTEM_CHROME_VERSION));
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
  // Eligibility is pure inspection: never invoke Chrome, even for metadata.
  // The separately authorized renderer checks browser.version() after launch,
  // before creating any page. Here the exact payload and dpkg pin bind version.
  return Object.freeze({ executablePath: EXECUTABLE, version, uid, gid });
}
