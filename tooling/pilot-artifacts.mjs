// Only bounded synthetic screenshots and reports may leave the hosted runner.
import assert from 'node:assert/strict';
import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_ARTIFACT_BYTES = 19_000_000; // Zip overhead stays within the approved 20 MB ceiling.
const allowed = new Set(['initial.png', 'created.png', 'edited.png', 'completed.png', 'relaunched.png', 'failure.png', 'install.json', 'report.json', 'report.md']);
export async function inspectPilotArtifacts(directory, maxBytes = MAX_ARTIFACT_BYTES) {
  assert.ok(Number.isSafeInteger(maxBytes) && maxBytes > 0);
  const root = path.resolve(directory);
  // Walk actual entries rather than comparing strings: Windows TEMP may use an
  // 8.3 alias (RUNNER~1) for the same non-linked directory. Reject links at every level.
  for (let current = root; ; current = path.dirname(current)) {
    const entry = await lstat(current);
    assert.ok(entry.isDirectory() && !entry.isSymbolicLink(), 'Artifact directory must not traverse a link');
    if (path.dirname(current) === current) break;
  }
  const names = (await readdir(root)).sort();
  assert.ok(names.length > 0, 'No pilot evidence was produced');
  let bytes = 0;
  for (const name of names) {
    assert.ok(allowed.has(name), `Refusing unapproved artifact: ${name}`);
    const file = path.join(root, name);
    const stat = await lstat(file);
    assert.ok(stat.isFile() && !stat.isSymbolicLink(), `Refusing non-regular artifact: ${name}`);
    bytes += stat.size;
    assert.ok(bytes <= maxBytes, `Pilot artifacts exceed ${maxBytes} bytes; nothing may be uploaded`);
    const content = await readFile(file);
    if (name.endsWith('.png')) assert.equal(content.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `Invalid PNG: ${name}`);
    else if (name.endsWith('.json')) JSON.parse(content.toString('utf8'));
  }
  return { files: names, bytes, uploadCeilingBytes: 20_000_000, retentionDays: 3 };
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  console.log(JSON.stringify(await inspectPilotArtifacts(process.argv[2] ?? 'test-results/windows-pilot')));
}
