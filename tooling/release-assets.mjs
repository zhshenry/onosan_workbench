import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const requireCheck = (condition, message) => { if (!condition) throw new Error(message); };
export const releaseFiles = version => [
  `installer/Ono-Workbench-Setup-${version}-x64.exe`,
  `installer/Ono-Workbench-Setup-${version}-x64.exe.blockmap`,
  'metadata/latest.yml',
  `portable/Ono-Workbench-${version}-Windows-x64-Portable.zip`,
  'SHA256SUMS.txt',
];
export async function hashFile(file, algorithm = 'sha256', encoding = 'hex') {
  const hash = createHash(algorithm);
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest(encoding);
}
export async function inspectReleaseFiles(directory, version, flat = false) {
  requireCheck(/^\d+\.\d+\.\d+$/.test(version), 'Expected a stable release version.');
  const files = releaseFiles(version);
  const filename = file => path.join(directory, flat ? path.basename(file) : file);
  for (const file of files) requireCheck(statSync(filename(file), { throwIfNoEntry: false })?.size > 0, `缺少发布产物或文件为空：${file}。`);
  const metadata = readFileSync(filename(files[2]), 'utf8').replace(/^\uFEFF/, '');
  requireCheck(/^version:\s*(\S+)/m.exec(metadata)?.[1] === version, 'latest.yml 版本不一致。');
  const entry = /^  - url:\s*(\S+)\r?\n    sha512:\s*(\S+)\r?\n    size:\s*(\d+)/m.exec(metadata);
  const sha512 = await hashFile(filename(files[0]), 'sha512', 'base64');
  requireCheck(entry?.[1] === path.basename(files[0]) && /^path:\s*(\S+)/m.exec(metadata)?.[1] === entry[1], 'latest.yml 的文件名与安装器不一致。');
  requireCheck(Number(entry?.[3]) === statSync(filename(files[0])).size && entry?.[2] === sha512 && /^sha512:\s*(\S+)/m.exec(metadata)?.[1] === sha512, 'latest.yml 的大小或 SHA512 与安装器不一致。');
  const assets = await Promise.all(files.map(async file => ({ name: path.basename(file), file: filename(file), size: statSync(filename(file)).size, sha256: await hashFile(filename(file)) })));
  const checksums = readFileSync(filename(files[4]), 'utf8').replace(/^\uFEFF/, '');
  for (const index of [0, 3]) {
    const expected = checksums.split(/\r?\n/).find(line => line.endsWith(` *${files[index]}`))?.split(' ')[0];
    requireCheck(expected?.toLowerCase() === assets[index].sha256, `SHA256SUMS.txt 校验失败：${files[index]}。`);
  }
  return assets;
}

// A draft is absent from releases/tags/{tag}. Resolve it from the authenticated
// release list, then keep using its numeric ID throughout verification/publication.
export function findRelease(run, gh, repo, tag) {
  const ids = run(gh, ['api', '--paginate', `repos/${repo}/releases?per_page=100`, '--jq', `.[] | select(.tag_name == ${JSON.stringify(tag)}) | .id`]).split(/\r?\n/).filter(Boolean);
  requireCheck(ids.length <= 1 && ids.every(id => /^\d+$/.test(id)), 'Unexpected release identity.');
  return ids.length ? JSON.parse(run(gh, ['api', `repos/${repo}/releases/${ids[0]}`])) : null;
}

export async function downloadRelease({ run, gh, curl, repo, tag, release, directory, expected, draft = false }) {
  const version = tag.replace(/^v/, '');
  const names = releaseFiles(version).map(file => path.basename(file));
  requireCheck(release?.tag_name === tag && release.draft === draft, `GitHub Release 必须是对应版本的${draft ? '草稿' : '已发布版本'}。`);
  requireCheck(release.assets.length === names.length && names.every(name => release.assets.filter(asset => asset.name === name).length === 1), 'Release must contain exactly the five expected assets.');
  mkdirSync(directory, { recursive: true });
  const report = { status: 'running', tag, releaseId: release.id, draft, verifiedAt: new Date().toISOString(), assets: [] };
  const reportFile = path.join(directory, 'verification.json');
  try {
    for (const name of names) {
      const asset = release.assets.find(value => value.name === name);
      requireCheck(asset.state === 'uploaded' && /^sha256:[0-9a-f]{64}$/.test(asset.digest), `Missing uploaded asset SHA256: ${name}`);
      const sha256 = asset.digest.slice('sha256:'.length);
      if (expected) requireCheck(expected.some(value => value.name === name && value.size === asset.size && value.sha256 === sha256), `Remote asset differs from the accepted build: ${name}`);
      const destination = path.join(directory, name);
      const cached = existsSync(destination) && statSync(destination).size === asset.size && await hashFile(destination) === sha256;
      if (!cached) {
        const partial = `${destination}.partial`;
        if (draft) {
          run(gh, ['release', 'download', tag, '--repo', repo, '--pattern', name, '--output', partial, '--clobber'], true);
        } else {
          const url = `https://github.com/${repo}/releases/download/${tag}/${name}`;
          requireCheck(asset.browser_download_url === url, `Unexpected asset download URL: ${name}`);
          run(curl, ['--fail', '--location', '--silent', '--show-error', '--retry', '3', '--connect-timeout', '30', '--max-time', '900', '--proto', '=https', '--proto-redir', '=https', '--output', partial, url], true);
        }
        requireCheck(statSync(partial, { throwIfNoEntry: false })?.size === asset.size && await hashFile(partial) === sha256, `Downloaded file size or SHA256 mismatch: ${name}`);
        renameSync(partial, destination);
      }
      report.assets.push({ name, size: asset.size, sha256, downloaded: !cached, file: destination });
      console.log(`RELEASE_DOWNLOAD_OK ${name} sha256=${sha256}${cached ? ' (verified existing download)' : ''}`);
    }
    await inspectReleaseFiles(directory, version, true);
    report.updateMetadata = { version, installer: names[0], sha512: await hashFile(path.join(directory, names[0]), 'sha512', 'base64'), checksumsVerified: true };
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed'; report.error = String(error);
    throw error;
  } finally {
    writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');
  }
  return report;
}
