import assert from 'node:assert/strict';
import test from 'node:test';
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
type Entry = { kind: 'file' | 'dir' | 'link'; uid: number; mode: number; size: number; text?: string; link?: string; canonical?: string; denied?: boolean };
const missing = () => Object.assign(new Error('private filesystem contents must not escape'), { code: 'ENOENT' });
function fixture() {
  // Every filesystem/account/command operation is mocked. These tests must never
  // execute system Chrome, sudo, package tools, or mutate host security settings.
  const entries = new Map<string, Entry>();
  const set = (path: string, patch: Partial<Entry> = {}) => entries.set(path, { kind: 'file', uid: 0, mode: 0o100755, size: 100, ...patch });
  const text = (path: string, value: string) => set(path, { mode: 0o100644, text: value, size: Buffer.byteLength(value) });
  for (const path of ['/', '/opt', '/opt/google', '/opt/google/chrome', '/usr', '/usr/bin', '/etc', '/etc/alternatives', '/etc/apparmor.d', '/etc/apparmor.d/local']) set(path, { kind: 'dir', mode: 0o40755 });
  for (const path of [executable, wrapper, '/usr/bin/dpkg-query', '/usr/bin/cat']) set(path);
  set('/usr/bin/sudo', { mode: 0o104755 });
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
  const adapters = {
    process: { platform: 'linux', getuid: () => 1001, geteuid: () => 1001, getgid: () => 1001, getegid: () => 1001 },
    fs: {
      lstatSync: (path: string) => {
        const value = entry(path);
        return { ...value, isFile: () => value.kind === 'file', isDirectory: () => value.kind === 'dir', isSymbolicLink: () => value.kind === 'link' };
      },
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
  return { entries, set, text, outputs, calls, reads, adapters };
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

test('Chrome executable and every ancestor must be canonical protected root-owned paths', () => {
  for (const path of [executable, '/opt/google/chrome', '/opt/google', '/opt', '/']) {
    for (const patch of [{ uid: 1001 }, { mode: 0o100777 }, { kind: 'link' as const }, { canonical: '/untrusted' }]) {
      const f = fixture(); Object.assign(f.entries.get(path)!, patch); fails(f, 'SYSTEM_CHROME_EXECUTABLE_UNVERIFIED');
      assert.equal(f.calls.length, 0);
    }
    const f = fixture(); f.entries.delete(path); fails(f, 'SYSTEM_CHROME_EXECUTABLE_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  for (const patch of [{ mode: 0o100644 }, { mode: 0o100750 }, { mode: 0o104755 }, { mode: 0o102755 }, { denied: true }]) {
    const f = fixture(); Object.assign(f.entries.get(executable)!, patch); fails(f, 'SYSTEM_CHROME_EXECUTABLE_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
});

test('wrapper alternatives must resolve only through root-owned protected fixed package paths', () => {
  for (const path of [wrapper, '/usr/bin/google-chrome', '/etc/alternatives/google-chrome', '/usr/bin/google-chrome-stable', '/usr', '/usr/bin', '/etc', '/etc/alternatives']) {
    const f = fixture(); Object.assign(f.entries.get(path)!, { uid: 1001 }); fails(f, 'SYSTEM_CHROME_WRAPPER_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  for (const patch of [
    { kind: 'file' as const }, { link: '/tmp/chrome' }, { link: '/usr/bin/google-chrome' },
    { link: '/opt/google/chrome/chrome' }, { canonical: '/tmp/chrome' }, { link: 'x'.repeat(257) },
  ]) {
    const f = fixture(); Object.assign(f.entries.get('/usr/bin/google-chrome')!, patch); fails(f, 'SYSTEM_CHROME_WRAPPER_UNVERIFIED'); assert.equal(f.calls.length, 0);
  }
  for (const path of [wrapper, '/usr/bin', '/etc/alternatives']) {
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
