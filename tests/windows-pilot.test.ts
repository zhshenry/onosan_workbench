import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, symlink, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { inspectPilotArtifacts, MAX_ARTIFACT_BYTES } from '../tooling/pilot-artifacts.mjs';

async function fixture(t: test.TestContext) {
  const directory = await mkdtemp(path.join(tmpdir(), 'ono-pilot-artifacts-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}
test('Windows pilot permits only small synthetic screenshots and reports', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'report.json'), '{"status":"passed"}');
  await writeFile(path.join(directory, 'initial.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  const value = await inspectPilotArtifacts(directory);
  assert.deepEqual(value.files, ['initial.png', 'report.json']);
  assert.equal(value.bytes, 27); assert.equal(value.retentionDays, 3);
  assert.ok(MAX_ARTIFACT_BYTES < value.uploadCeilingBytes);
});
test('Windows pilot refuses installer, database, trace, video and unexpected nested evidence', async t => {
  for (const name of ['installer.exe', 'tasks.db', 'trace.zip', 'recording.webm', 'node_modules']) {
    await t.test(name, async child => {
      const directory = await fixture(child);
      if (name === 'node_modules') await mkdir(path.join(directory, name));
      else await writeFile(path.join(directory, name), 'unapproved');
      await assert.rejects(inspectPilotArtifacts(directory), /Refusing unapproved artifact/);
    });
  }
});
test('Windows pilot refuses oversized or malformed evidence', async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'report.json'), '{"status":"passed"}');
  await assert.rejects(inspectPilotArtifacts(directory, 1), /exceed/);
  await writeFile(path.join(directory, 'initial.png'), 'not a png');
  await assert.rejects(inspectPilotArtifacts(directory), /Invalid PNG/);
  await rm(path.join(directory, 'initial.png'));
  await writeFile(path.join(directory, 'report.json'), 'not json');
  await assert.rejects(inspectPilotArtifacts(directory), SyntaxError);
});
test('Windows pilot refuses evidence symlinks', { skip: process.platform === 'win32' }, async t => {
  const directory = await fixture(t);
  await writeFile(path.join(directory, 'report.md'), 'synthetic');
  await symlink(path.join(directory, 'report.md'), path.join(directory, 'report.json'));
  await assert.rejects(inspectPilotArtifacts(directory), /non-regular artifact/);
});
