import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { constants, readFileSync } from 'node:fs';
import { verifySystemChrome, SYSTEM_CHROME_CODES, SYSTEM_CHROME_VERSION } from '../tooling/ono/render-pilot/system-chrome.mjs';

const executable = '/opt/google/chrome/chrome';
const wrapper = '/opt/google/chrome/google-chrome';
const profile = '/etc/apparmor.d/chrome';
const local = '/etc/apparmor.d/local/chrome';
const enabled = '/sys/module/apparmor/parameters/enabled';
const restricted = '/proc/sys/kernel/apparmor_restrict_unprivileged_userns';
const loaded = '/sys/kernel/security/apparmor/profiles';
const officialProfile = `# Ubuntu's existing user-namespace exception, not a new policy.
abi <abi/4.0>,
include <tunables/global>
profile chrome /opt/google/chrome/chrome flags=(unconfined) {
  userns,
  # Site-specific additions and overrides.
  include if exists <local/chrome>
}
`;
type Entry = { dev: number; ino: number; mtimeMs: number; ctimeMs: number; kind: 'file' | 'dir' | 'link'; uid: number; mode: number; size: number; text?: string; link?: string; canonical?: string; denied?: boolean };
const missing = () => Object.assign(new Error('private filesystem contents must not escape'), { code: 'ENOENT' });
function fixture() {
  // Every filesystem/account/command operation is mocked. These tests must never
  // execute system Chrome, sudo, package tools, or mutate host security settings.
  const entries = new Map<string, Entry>();
  let inode = 1;
  const set = (path: string, patch: Partial<Entry> = {}) => entries.set(path, { dev: 1, ino: inode++, mtimeMs: 1, ctimeMs: 1, kind: 'file', uid: 0, mode: 0o100755, size: 100, ...patch });
  const text = (path: string, value: string) => set(path, { mode: 0o100644, text: value, size: Buffer.byteLength(value) });
  for (const path of ['/', '/opt', '/opt/google', '/opt/google/chrome', '/usr', '/usr/bin', '/etc', '/etc/alternatives', '/etc/apparmor.d', '/etc/apparmor.d/local']) set(path, { kind: 'dir', mode: 0o40755 });
  for (const path of [executable, wrapper, '/usr/bin/dpkg-query', '/usr/bin/cat']) set(path);
  set('/usr/bin/sudo', { mode: 0o104755 });
  for (const path of ['/opt', '/opt/google', '/opt/google/chrome']) entries.get(path)!.mode = 0o40777;
  for (const path of [executable, wrapper]) {
    const value = `synthetic fixture bytes for ${path}`;
    set(path, { mode: 0o100777, text: value, size: Buffer.byteLength(value) });
  }
  set('/opt/google/chrome/locales', { kind: 'dir', mode: 0o40777 });
  text('/opt/google/chrome/locales/en-US.pak', 'synthetic locale bytes');
  text('/opt/google/chrome/empty-resource', '');
  const manifest = {
    schema: 1, version: SYSTEM_CHROME_VERSION,
    package: {
      url: `https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${SYSTEM_CHROME_VERSION}-1_amd64.deb`,
      sha256: 'a4edbe95e9b01db6c9b97d7a1323121eda18362b5620df06abac1b59bee80053',
      version: `${SYSTEM_CHROME_VERSION}-1`, architecture: 'amd64', authentication: 'Google official HTTPS; no APT signature claim',
    },
    entries: [...entries].filter(([path]) => path.startsWith('/opt/google/chrome/')).map(([path, value]) => ({
      path: path.slice('/opt/google/chrome/'.length), type: value.kind === 'dir' ? 'directory' : 'file',
      ...(value.kind === 'file' ? { size: value.size, sha256: createHash('sha256').update(value.text!).digest('hex') } : {}),
    })),
  };
  for (const [path, link] of [
    ['/usr/bin/google-chrome', '/etc/alternatives/google-chrome'],
    ['/etc/alternatives/google-chrome', '/usr/bin/google-chrome-stable'],
    ['/usr/bin/google-chrome-stable', wrapper],
  ]) set(path, { kind: 'link', mode: 0o120777, link });
  text(profile, officialProfile); text(local, '# No overrides.\n'); text(enabled, 'Y\n'); text(restricted, '1\n');
  const outputs: Record<string, string | Error> = {
    owned: `google-chrome-stable: ${executable}\ngoogle-chrome-stable: ${wrapper}\n`,
    installed: `google-chrome-stable\tinstall ok installed\t${SYSTEM_CHROME_VERSION}-1\n`,
    loaded: 'some-other-profile (enforce)\nchrome (unconfined)\n',
    actual: `${SYSTEM_CHROME_VERSION}\n`,
  };
  const calls: Array<{ path: string; args: string[]; options: any }> = [];
  const reads: string[] = [];
  const entry = (path: string) => { reads.push(path); const value = entries.get(path); if (!value) throw missing(); return value; };
  const stats = (value: Entry) => ({ ...value, isFile: () => value.kind === 'file', isDirectory: () => value.kind === 'dir', isSymbolicLink: () => value.kind === 'link' });
  const handles = new Map<number, { value: Entry; offset: number }>(); let nextFd = 1;
  const adapters = {
    manifest,
    process: { platform: 'linux', getuid: () => 1001, geteuid: () => 1001, getgid: () => 1001, getegid: () => 1001 },
    fs: {
      lstatSync: (path: string) => {
        const value = entry(path);
        return stats(value);
      },
      readdirSync: (path: string) => [...entries.keys()].filter(name => name.startsWith(`${path}/`) && !name.slice(path.length + 1).includes('/')).map(name => name.slice(path.length + 1)),
      openSync: (path: string, flags: number) => {
        assert.equal(flags, constants.O_RDONLY | constants.O_NOFOLLOW);
        const value = entry(path); assert.equal(value.kind, 'file'); const fd = nextFd++; handles.set(fd, { value, offset: 0 }); return fd;
      },
      fstatSync: (fd: number) => stats(handles.get(fd)!.value),
      readSync: (fd: number, buffer: Buffer, offset: number, length: number, position: null) => {
        assert.equal(position, null); assert.ok(length <= 1024 * 1024);
        const handle = handles.get(fd)!, bytes = Buffer.from(handle.value.text!);
        const count = bytes.copy(buffer, offset, handle.offset, Math.min(bytes.length, handle.offset + length)); handle.offset += count; return count;
      },
      closeSync: (fd: number) => { assert.ok(handles.delete(fd)); },
      realpathSync: (path: string) => { const value = entry(path); return value.canonical ?? (path === '/usr/bin/google-chrome' ? wrapper : path); },
      accessSync: (path: string, mode: number) => { assert.equal(mode, 1); if (entry(path).denied) throw new Error('private access failure'); },
      readlinkSync: (path: string) => entry(path).link,
      readFileSync: (path: string, encoding: string) => { assert.equal(encoding, 'utf8'); return entry(path).text; },
    },
    run: (path: string, args: string[], options: any) => {
      calls.push({ path, args, options });
      let key: string;
      if (path === '/usr/bin/dpkg-query' && args[0] === '--search') key = 'owned';
      else if (path === '/usr/bin/dpkg-query' && args[0] === '--show') key = 'installed';
      else if (path === '/usr/bin/sudo') key = 'loaded';
      else if (path === executable) key = 'actual';
      else throw new Error('Unexpected command: tests must remain mocked');
      const result = outputs[key]; if (result instanceof Error) throw result; return result;
    },
  };
  return { entries, set, text, outputs, calls, reads, handles, manifest, adapters };
}
const fails = (f: ReturnType<typeof fixture>, code: string, env = {}) => {
  assert.throws(() => verifySystemChrome(env, f.adapters), (error: Error) => {
    assert.equal(error.message, code); assert.ok(SYSTEM_CHROME_CODES.includes(error.message));
    assert.equal(error.cause, undefined); return true;
  });
};
const noChrome = (f: ReturnType<typeof fixture>) => assert.equal(f.calls.filter(call => call.path === executable).length, 0);

test('verified system Chrome returns only fixed path, pinned bounded version and nonroot identity', () => {
  const f = fixture();
  const result = verifySystemChrome({ PATH: '/untrusted', LD_PRELOAD: 'private', HOME: '/private', OTHER_SECRET: 'private', CHROME_BIN: '/alternate' }, f.adapters);
  assert.deepEqual(result, { executablePath: executable, version: SYSTEM_CHROME_VERSION, uid: 1001, gid: 1001 });
  assert.ok(Object.isFrozen(result)); assert.ok(Object.isFrozen(SYSTEM_CHROME_CODES));
  assert.deepEqual(f.calls.map(({ path, args }) => ({ path, args })), [
    { path: '/usr/bin/dpkg-query', args: ['--search', executable, wrapper] },
    { path: '/usr/bin/dpkg-query', args: ['--show', '--showformat=${Package}\\t${Status}\\t${Version}\\n', 'google-chrome-stable'] },
    { path: '/usr/bin/sudo', args: ['-n', '/usr/bin/cat', loaded] },
    { path: executable, args: ['--product-version'] },
  ]);
  for (const call of f.calls) {
    assert.deepEqual(call.options.env, { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' });
    assert.equal(call.options.shell, false); assert.equal(call.options.cwd, '/');
    assert.equal(call.options.encoding, 'utf8'); assert.equal(call.options.timeout, 10000);
    assert.ok(call.options.maxBuffer <= 65536); assert.deepEqual(call.options.stdio, ['ignore', 'pipe', 'pipe']);
  }
});

test('credentials, root/effective-root, group zero, mismatched or unavailable identity fail before any file or command', () => {
  for (const env of [{ GH_TOKEN: 'private' }, { GITHUB_TOKEN: 'private' }]) {
    const f = fixture(); fails(f, 'SYSTEM_CHROME_CREDENTIALS_PRESENT', env); assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
  }
  for (const patch of [
    { platform: 'darwin' }, { getuid: () => 0 }, { geteuid: () => 0 }, { getgid: () => 0 }, { getegid: () => 0 },
    { geteuid: () => 1002 }, { getegid: () => 1002 }, { getuid: () => -1 }, { getuid: () => NaN },
    { getuid: () => 1.5 }, { getuid: undefined }, { geteuid: undefined }, { getgid: undefined }, { getegid: undefined },
  ]) {
    const f = fixture(); Object.assign(f.adapters.process, patch); fails(f, 'SYSTEM_CHROME_NONROOT_REQUIRED');
    assert.equal(f.reads.length, 0); assert.equal(f.calls.length, 0);
  }
});

test('Chrome chain refusals identify only the fixed path label and exact failed predicate', () => {
  for (const [path, label] of [[executable, 'BINARY'], ['/opt/google/chrome', 'CHROME_DIR'], ['/opt/google', 'GOOGLE'], ['/opt', 'OPT'], ['/', 'ROOT']]) {
    for (const [patch, reason] of [
      [{ uid: 1001 }, 'OWNER_UNVERIFIED'],
      [{ kind: 'link' }, 'TYPE_UNVERIFIED'], [{ canonical: '/private/untrusted-path' }, 'CANONICAL_UNVERIFIED'],
    ] as const) {
      const f = fixture(); Object.assign(f.entries.get(path)!, patch); fails(f, `SYSTEM_CHROME_${label}_${reason}`);
      assert.equal(f.calls.length, 0);
    }
    const absent = fixture(); absent.entries.delete(path); fails(absent, `SYSTEM_CHROME_${label}_UNREADABLE`); assert.equal(absent.calls.length, 0);
    const denied = fixture(); const original = denied.adapters.fs.realpathSync;
    denied.adapters.fs.realpathSync = current => { if (current === path) throw new Error('private path and details'); return original(current); };
    fails(denied, `SYSTEM_CHROME_${label}_UNREADABLE`); assert.equal(denied.calls.length, 0);
  }
  const rootWritable = fixture(); rootWritable.entries.get('/')!.mode = 0o40777; fails(rootWritable, 'SYSTEM_CHROME_ROOT_WRITABLE');
  for (const [patch, reason] of [
    [{ mode: 0o100644 }, 'EXECUTABLE_UNVERIFIED'], [{ mode: 0o100750 }, 'EXECUTABLE_UNVERIFIED'],
    [{ mode: 0o104755 }, 'PRIVILEGED'], [{ mode: 0o102755 }, 'PRIVILEGED'],
    [{ denied: true }, 'ACCESS_UNVERIFIED'], [{ size: NaN }, 'SIZE_UNVERIFIED'],
  ] as const) {
    const f = fixture(); Object.assign(f.entries.get(executable)!, patch); fails(f, `SYSTEM_CHROME_BINARY_${reason}`); assert.equal(f.calls.length, 0);
  }
});

test('precise chain errors retain no raw data and arbitrary exceptions cannot forge a diagnostic', () => {
  const f = fixture();
  const raw = Object.assign(new Error('SYSTEM_CHROME_OPT_OWNER_UNVERIFIED'), {
    cause: new Error('private nested error'), path: '/private/path', uid: 123456, stdout: 'private', stderr: 'private',
  });
  f.adapters.fs.lstatSync = () => { throw raw; };
  fails(f, 'SYSTEM_CHROME_CHROME_DIR_UNREADABLE'); assert.equal(f.calls.length, 0);
  assert.throws(() => verifySystemChrome({}, f.adapters), (error: Error) => {
    assert.deepEqual(Object.keys(error), []);
    assert.doesNotMatch(error.message, /private|123456|\//);
    assert.notEqual(error, raw); return true;
  });
  const hostile = fixture();
  hostile.adapters.fs.lstatSync = () => { throw Object.defineProperty({}, 'message', { get() { throw new Error('private getter'); } }); };
  fails(hostile, 'SYSTEM_CHROME_CHROME_DIR_UNREADABLE'); assert.equal(hostile.calls.length, 0);
  const proxy = fixture();
  proxy.adapters.fs.lstatSync = () => { throw new Proxy({}, { getPrototypeOf() { throw new Error('private prototype'); } }); };
  fails(proxy, 'SYSTEM_CHROME_CHROME_DIR_UNREADABLE'); assert.equal(proxy.calls.length, 0);
});

test('wrapper alternatives must resolve only through root-owned protected fixed package paths', () => {
  for (const path of [wrapper, '/usr/bin/google-chrome', '/etc/alternatives/google-chrome', '/usr/bin/google-chrome-stable', '/usr', '/usr/bin', '/etc', '/etc/alternatives']) {
    const f = fixture(); Object.assign(f.entries.get(path)!, { uid: 1001 }); fails(f, path === wrapper ? 'SYSTEM_CHROME_PAYLOAD_UNVERIFIED' : 'SYSTEM_CHROME_WRAPPER_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  for (const patch of [
    { kind: 'file' as const }, { link: '/tmp/chrome' }, { link: '/usr/bin/google-chrome' },
    { link: '/opt/google/chrome/chrome' }, { canonical: '/tmp/chrome' }, { link: 'x'.repeat(257) },
  ]) {
    const f = fixture(); Object.assign(f.entries.get('/usr/bin/google-chrome')!, patch); fails(f, 'SYSTEM_CHROME_WRAPPER_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  for (const path of ['/usr/bin', '/etc/alternatives']) {
    const f = fixture(); Object.assign(f.entries.get(path)!, { mode: 0o777 }); fails(f, 'SYSTEM_CHROME_WRAPPER_UNVERIFIED');
  }
  const f = fixture(); f.entries.get('/usr/bin/google-chrome')!.link = '../bin/google-chrome-stable';
  assert.equal(verifySystemChrome({}, f.adapters).executablePath, executable);
});

test('package ownership requires exactly both fixed files and the official stable package', () => {
  for (const owned of [
    '', `google-chrome-stable: ${executable}\n`, `google-chrome-stable: ${executable}\ngoogle-chrome-stable: ${executable}\n`,
    `google-chrome-beta: ${executable}\ngoogle-chrome-stable: ${wrapper}\n`,
    `google-chrome-stable, other: ${executable}\ngoogle-chrome-stable: ${wrapper}\n`,
    `diversion by evil from: ${executable}\ngoogle-chrome-stable: ${executable}\ngoogle-chrome-stable: ${wrapper}\n`,
    `google-chrome-stable: ${executable}\ngoogle-chrome-stable: ${wrapper}\nprivate extra output`,
  ]) {
    const f = fixture(); f.outputs.owned = owned; fails(f, 'SYSTEM_CHROME_PACKAGE_UNVERIFIED');
    assert.equal(f.calls.length, 1); noChrome(f);
  }
});

test('package status and version require one bounded installed stable package record', () => {
  for (const installed of [
    '', `google-chrome-stable\tdeinstall ok config-files\t${SYSTEM_CHROME_VERSION}-1\n`,
    `google-chrome-beta\tinstall ok installed\t${SYSTEM_CHROME_VERSION}-1\n`,
    `google-chrome-stable\tinstall ok installed\t${SYSTEM_CHROME_VERSION}\n`,
    `google-chrome-stable\tinstall ok installed\t${SYSTEM_CHROME_VERSION}-custom\n`,
    `google-chrome-stable\tinstall ok installed\t${SYSTEM_CHROME_VERSION}-1\nprivate`, 'x'.repeat(4097),
  ]) {
    const f = fixture(); f.outputs.installed = installed; fails(f, 'SYSTEM_CHROME_PACKAGE_UNVERIFIED'); assert.equal(f.calls.length, 2); noChrome(f);
  }
  const f = fixture(); f.outputs.installed = 'google-chrome-stable\tinstall ok installed\t155.0.0.1-1\n';
  fails(f, 'SYSTEM_CHROME_VERSION_UNVERIFIED'); assert.equal(f.calls.length, 2); noChrome(f);
});

test('existing recognized Ubuntu/AppArmor profile formats allow comments and no custom overrides', () => {
  for (const value of [officialProfile, officialProfile.replace('abi/4.0', 'abi/5.0').replace('userns,', 'userns,\n  @{exec_path} mr,'),
    officialProfile.replace('include <tunables/global>', '#include <tunables/global>'),
    officialProfile.replace('  include if exists <local/chrome>\n', ''),
  ]) {
    const f = fixture(); f.text(profile, value); assert.equal(verifySystemChrome({}, f.adapters).version, SYSTEM_CHROME_VERSION);
  }
  for (const absent of [local, '/etc/apparmor.d/local']) {
    const f = fixture(); f.entries.delete(absent); assert.equal(verifySystemChrome({}, f.adapters).version, SYSTEM_CHROME_VERSION);
  }
});

test('commented grants, wrong attachments, wildcard paths and unknown profile rules are rejected', () => {
  for (const value of [
    officialProfile.replace('userns,', '# userns,'), officialProfile.replace('userns,', 'deny userns,'),
    officialProfile.replace('profile chrome ', 'profile another '), officialProfile.replace(executable, '/tmp/chrome'),
    officialProfile.replace(executable, '/opt/google/**/chrome'), officialProfile.replace('flags=(unconfined)', 'flags=(complain)'),
    officialProfile.replace('userns,', 'userns,\n  network,'), officialProfile.replace('userns,', 'userns,\n  userns,'),
    officialProfile.replace('include if exists <local/chrome>', 'include <local/unknown>'),
    officialProfile.replace('userns,', 'include <abstractions/base>\n  userns,'),
    `${officialProfile}\nprofile extra /tmp/extra { userns, }`, officialProfile.replace('abi/4.0', 'abi/6.0'),
    `${officialProfile}\0`,
  ]) {
    const f = fixture(); f.text(profile, value); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED');
    assert.equal(f.calls.filter(call => call.path === '/usr/bin/sudo').length, 0); noChrome(f);
  }
});

test('profile files and parents must be protected root-owned bounded regular paths', () => {
  for (const path of [profile, '/etc/apparmor.d']) for (const patch of [
    { uid: 1001 }, { mode: 0o777 }, { kind: 'link' as const }, { canonical: '/tmp/profile' },
  ]) {
    const f = fixture(); Object.assign(f.entries.get(path)!, patch); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
  }
  for (const size of [16385, Infinity]) { const f = fixture(); f.entries.get(profile)!.size = size; fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f); }
  const f = fixture(); f.entries.delete(profile); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
});

test('local overrides must be absent or only comments in a protected root-owned file', () => {
  for (const value of ['userns,', 'deny userns,', 'include <local/other>', '#include <local/other>', 'x'.repeat(4097)]) {
    const f = fixture(); f.text(local, value); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
  }
  for (const path of [local, '/etc/apparmor.d/local']) for (const patch of [
    { uid: 1001 }, { mode: 0o777 }, { kind: 'link' as const }, { canonical: '/tmp/local' },
  ]) {
    const f = fixture(); Object.assign(f.entries.get(path)!, patch); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
  }
});

test('AppArmor and its unprivileged-userns restriction must already be enabled', () => {
  for (const [path, values] of [[enabled, ['', 'N\n', 'Y\nprivate']], [restricted, ['', '0\n', '2\n', '1\nprivate']]] as const) {
    for (const value of values) { const f = fixture(); f.text(path, value); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f); }
    const f = fixture(); f.entries.delete(path); fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
  }
});

test('loaded profile must be exactly chrome in its documented unconfined mode', () => {
  for (const value of ['', 'chrome-dev (unconfined)\n', 'chrome (complain)\n', 'chrome (enforce)\n',
    ':other://chrome (unconfined)\n', 'chrome (unconfined)\nchrome (unconfined)\n',
    'chrome (unconfined)\nchrome (complain)\n',
  ]) {
    const f = fixture(); f.outputs.loaded = value; fails(f, 'SYSTEM_CHROME_PROFILE_NOT_LOADED'); noChrome(f);
  }
});

test('unreadable loaded profile evidence is separate from an absent recognized profile', () => {
  for (const value of [new Error('private read failure'), `chrome (unconfined)\0`, 'x'.repeat(65537)]) {
    const f = fixture(); f.outputs.loaded = value; fails(f, 'SYSTEM_CHROME_PROFILE_UNREADABLE'); noChrome(f);
  }
});

test('fixed package and loaded-profile tools must be root-owned, executable and available', () => {
  for (const [path, code] of [
    ['/usr/bin/dpkg-query', 'SYSTEM_CHROME_PACKAGE_UNVERIFIED'],
    ['/usr/bin/sudo', 'SYSTEM_CHROME_PROFILE_UNREADABLE'], ['/usr/bin/cat', 'SYSTEM_CHROME_PROFILE_UNREADABLE'],
  ]) {
    for (const patch of [{ uid: 1001 }, { mode: 0o777 }, { kind: 'link' as const }, { denied: true }]) {
      const f = fixture(); Object.assign(f.entries.get(path)!, patch); fails(f, code); noChrome(f);
    }
    const f = fixture(); f.entries.delete(path); fails(f, code); noChrome(f);
  }
});

test('actual Chrome version must exactly match the package and approved pin with no arbitrary output', () => {
  for (const value of ['', '155.0.0.1\n', `Google Chrome ${SYSTEM_CHROME_VERSION}\n`, `${SYSTEM_CHROME_VERSION}\nprivate`,
    ` ${SYSTEM_CHROME_VERSION}\n`, `${SYSTEM_CHROME_VERSION}\0`, 'x'.repeat(129),
  ]) {
    const f = fixture(); f.outputs.actual = value; fails(f, 'SYSTEM_CHROME_VERSION_UNVERIFIED');
    assert.equal(f.calls.filter(call => call.path === executable).length, 1);
  }
});

test('read and command errors are replaced with finite codes without raw messages or causes', () => {
  for (const [key, code] of [
    ['owned', 'SYSTEM_CHROME_PACKAGE_UNVERIFIED'], ['installed', 'SYSTEM_CHROME_PACKAGE_UNVERIFIED'],
    ['loaded', 'SYSTEM_CHROME_PROFILE_UNREADABLE'], ['actual', 'SYSTEM_CHROME_VERSION_UNVERIFIED'],
  ]) {
    const f = fixture(); f.outputs[key] = Object.assign(new Error('private stdout stderr exception text'), { stdout: 'private', stderr: 'private' });
    fails(f, code);
  }
  const f = fixture(); f.adapters.fs.readFileSync = () => { throw new Error('private policy text'); };
  fails(f, 'SYSTEM_CHROME_APPARMOR_UNVERIFIED'); noChrome(f);
});

test('committed manifest has the pinned source digest and complete exact-version runtime inventory', () => {
  const bytes = readFileSync(new URL('../tooling/ono/render-pilot/chrome-154.0.8037.97-manifest.json', import.meta.url));
  // Scoped .gitattributes keeps this reviewed source byte-identical on Windows.
  assert.match(readFileSync(new URL('../.gitattributes', import.meta.url), 'utf8'), /chrome-154\.0\.8037\.97-manifest\.json text eol=lf/);
  const text = bytes.toString('utf8');
  assert.equal(createHash('sha256').update(text).digest('hex'), 'f9dd5a61fcfd187eac5beecf9fa0e81c2b43751ad24779dea67af2fcc2bc9d9e');
  const manifest = JSON.parse(text);
  assert.equal(manifest.version, SYSTEM_CHROME_VERSION); assert.equal(manifest.entries.length, 263);
  assert.equal(manifest.entries.filter((item: any) => item.type === 'file').length, 255);
  assert.equal(manifest.entries.filter((item: any) => item.type === 'directory').length, 8);
  assert.equal(manifest.entries.reduce((sum: number, item: any) => sum + (item.size ?? 0), 0), 456937066);
});

test('default source manifest must match its exact reviewed digest before parsing or execution', () => {
  for (const text of ['{}', '{private malformed json', JSON.stringify(fixture().manifest), 'x'.repeat(65537)]) {
    const f = fixture(); (f.adapters as any).manifest = undefined;
    f.adapters.fs.readFileSync = () => text;
    fails(f, 'SYSTEM_CHROME_MANIFEST_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  const f = fixture(); (f.adapters as any).manifest = undefined;
  f.adapters.fs.readFileSync = (path: any) => {
    assert.ok(path instanceof URL);
    assert.ok(path.pathname.endsWith('/chrome-154.0.8037.97-manifest.json'));
    return readFileSync(path, 'utf8');
  };
  // Real committed manifest is accepted, then the intentionally tiny fake tree
  // fails its inventory match. No host browser or host security file is touched.
  fails(f, 'SYSTEM_CHROME_PAYLOAD_UNVERIFIED'); assert.equal(f.calls.length, 0);
});

test('manifest version, official HTTPS package binding, paths, inventory and bounds fail closed', () => {
  const changes: Array<(m: any) => void> = [
    m => { m.schema = 2; }, m => { m.version = 'other'; }, m => { m.package.url = 'https://untrusted/package.deb'; },
    m => { m.package.sha256 = '0'.repeat(64); }, m => { m.package.version = 'other'; }, m => { m.package.architecture = 'arm64'; },
    m => { m.package.authentication = 'signed by APT'; }, m => { m.entries = []; },
    m => { m.entries.push(m.entries[0]); }, m => { m.entries[0].path = '../chrome'; },
    m => { m.entries[0].path = '/opt/google/chrome/chrome'; }, m => { m.entries[0].path = 'locales/../chrome'; },
    m => { m.entries[0].path = 'locales/./chrome'; }, m => { m.entries[0].path = 'private\0name'; },
    m => { m.entries[0].path = 'x'.repeat(257); }, m => { m.entries[0].path = 'unknown-parent/chrome'; },
    m => { m.entries[0].type = 'symlink'; }, m => { m.entries[0].size = -1; }, m => { m.entries[0].size = 1.5; },
    m => { m.entries[0].size = 536870913; }, m => { m.entries[0].sha256 = 'private'; },
    m => { m.entries = m.entries.filter((item: any) => item.path !== 'chrome'); },
    m => { m.entries = m.entries.filter((item: any) => item.path !== 'locales'); },
    m => { m.entries[0].size = 536870912; m.entries[1].size = 536870912; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f.manifest); fails(f, 'SYSTEM_CHROME_MANIFEST_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
});

test('official writable opt layout is accepted only after exact full payload verification', () => {
  const f = fixture();
  for (const [path, item] of f.entries) if (path === '/opt' || path.startsWith('/opt/')) item.mode = item.kind === 'dir' ? 0o40777 : 0o100777;
  const original = f.adapters.run;
  f.adapters.run = (path, args, options) => {
    assert.equal(f.handles.size, 0);
    for (const resource of f.manifest.entries) assert.ok(f.reads.includes(`/opt/google/chrome/${resource.path}`));
    return original(path, args, options);
  };
  assert.equal(verifySystemChrome({}, f.adapters).version, SYSTEM_CHROME_VERSION);
  assert.equal(f.calls.at(-1)?.path, executable);
});

test('missing, added, tampered, redirected and substituted runtime entries stop before every command', () => {
  const changes: Array<(f: ReturnType<typeof fixture>) => void> = [
    f => { f.entries.delete('/opt/google/chrome/empty-resource'); },
    f => { f.entries.delete('/opt/google/chrome/locales/en-US.pak'); },
    f => { f.text('/opt/google/chrome/unreviewed.so', 'private'); },
    f => { f.text('/opt/google/chrome/locales/new.pak', 'private'); },
    f => { f.set('/opt/google/chrome/extra', { kind: 'dir' }); },
    f => { f.entries.get(wrapper)!.text = f.entries.get(wrapper)!.text!.replace('synthetic', 'different'); },
    f => { f.entries.get('/opt/google/chrome/locales/en-US.pak')!.size++; },
    f => { f.entries.get('/opt/google/chrome/locales/en-US.pak')!.kind = 'link'; },
    f => { f.entries.get('/opt/google/chrome/locales')!.kind = 'link'; },
    f => { f.entries.get('/opt/google/chrome/locales')!.uid = 1001; },
    f => { f.entries.get('/opt/google/chrome/locales/en-US.pak')!.uid = 1001; },
    f => { f.entries.get('/opt/google/chrome/locales/en-US.pak')!.canonical = '/private/elsewhere'; },
  ];
  for (const change of changes) {
    const f = fixture(); change(f); fails(f, 'SYSTEM_CHROME_PAYLOAD_UNVERIFIED'); assert.equal(f.calls.length, 0); assert.equal(f.handles.size, 0);
  }
});

test('payload hashing streams bounded chunks and closes file descriptors', () => {
  const f = fixture(), value = 'x'.repeat(1024 * 1024 + 17), path = '/opt/google/chrome/locales/en-US.pak';
  f.entries.get(path)!.text = value; f.entries.get(path)!.size = Buffer.byteLength(value);
  const item = f.manifest.entries.find(item => item.path === 'locales/en-US.pak')!;
  item.size = Buffer.byteLength(value); item.sha256 = createHash('sha256').update(value).digest('hex');
  const lengths: number[] = []; const original = f.adapters.fs.readSync;
  f.adapters.fs.readSync = (...args) => { lengths.push(args[3]); return original(...args); };
  verifySystemChrome({}, f.adapters); assert.ok(lengths.includes(1024 * 1024)); assert.ok(lengths.includes(17));
  assert.equal(f.handles.size, 0);
});

test('short, excess, failed or concurrently changed payload reads reject without raw details', () => {
  for (const behavior of ['short', 'excess', 'failed', 'opened-inode', 'changed-inode', 'changed-directory']) {
    const f = fixture(), originalRead = f.adapters.fs.readSync, originalStat = f.adapters.fs.fstatSync;
    if (behavior === 'opened-inode') f.adapters.fs.fstatSync = fd => ({ ...originalStat(fd), ino: -1 });
    else f.adapters.fs.readSync = (...args) => {
      if (behavior === 'short') return 0;
      if (behavior === 'failed') throw new Error('private error /opt/untrusted-file');
      const count = originalRead(...args);
      if (behavior === 'excess' && count === 0) return 1;
      if (behavior === 'changed-inode') f.handles.get(args[0])!.value.ino++;
      if (behavior === 'changed-directory') f.entries.get('/opt/google/chrome')!.mtimeMs++;
      return count;
    };
    fails(f, 'SYSTEM_CHROME_PAYLOAD_UNVERIFIED'); assert.equal(f.calls.length, 0); assert.equal(f.handles.size, 0);
  }
});
