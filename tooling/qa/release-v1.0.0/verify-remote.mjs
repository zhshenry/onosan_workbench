import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const repo = 'repos/zhshenry/onosan_workbench';
const release = JSON.parse(execFileSync('gh.exe', ['api', `${repo}/releases/tags/v1.0.0`], { encoding: 'utf8' }));
const latest = JSON.parse(execFileSync('gh.exe', ['api', `${repo}/releases/latest`], { encoding: 'utf8' }));
assert.equal(release.name, 'OnO Workbench v1.0.0'); assert.equal(latest.id, release.id);
assert.equal(release.draft, false); assert.equal(release.prerelease, false);
const files = ['installer/Ono-Workbench-Setup-1.0.0-x64.exe', 'installer/Ono-Workbench-Setup-1.0.0-x64.exe.blockmap', 'metadata/latest.yml', 'portable/Ono-Workbench-1.0.0-Windows-x64-Portable.zip', 'SHA256SUMS.txt'];
assert.equal(release.assets.length, files.length);
const assets = [];
for (const file of files) {
  const hash = createHash('sha256'); for await (const chunk of createReadStream(path.join('release', file))) hash.update(chunk);
  const sha256 = hash.digest('hex'); const asset = release.assets.find(asset => asset.name === path.basename(file));
  assert.ok(asset); assert.equal(asset.digest, `sha256:${sha256}`);
  assets.push({ name: asset.name, size: asset.size, sha256, state: asset.state });
}
const evidence = { name: release.name, url: release.html_url, latest: true, draft: release.draft, prerelease: release.prerelease, assets };
await writeFile('test-results/release-v1.0.0/remote-verification.json', JSON.stringify(evidence, null, 2));
console.log(JSON.stringify(evidence, null, 2));
