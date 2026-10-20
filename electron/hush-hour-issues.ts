import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { zipSync } from 'fflate';
import { HushHourIssueDraftSchema, HushHourIssueIdSchema, HushHourIssueRecordSchema, hushHourIssueReport, type HushHourIssue, type HushHourIssueSummary, type HushHourState } from '../shared/hush-hour-contracts';

const inside = (root: string, file: string) => { const path = relative(root, file); return !!path && !path.startsWith('..') && !isAbsolute(path); };
export class HushHourIssues {
  readonly directory: string;
  constructor(dataDir: string) { this.directory = join(dataDir, 'issues'); }
  private async root(): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('问题目录不能是符号链接。');
    return realpath(this.directory);
  }
  private async file(directory: string, name: string): Promise<string> {
    const file = await realpath(join(directory, name));
    if (!inside(directory, file) || !(await lstat(file)).isFile()) throw new Error('问题附件不存在或路径无效。');
    return file;
  }
  async read(input: unknown): Promise<HushHourIssue> {
    const id = HushHourIssueIdSchema.parse(input), root = await this.root(), directory = join(root, id);
    if ((await lstat(directory)).isSymbolicLink() || !inside(root, await realpath(directory))) throw new Error('问题目录无效。');
    const file = await this.file(directory, 'issue.json');
    if ((await lstat(file)).size > 2 * 1024 * 1024) throw new Error('问题记录过大。');
    const record = HushHourIssueRecordSchema.parse(JSON.parse(await readFile(file, 'utf8')));
    if (record.id !== id) throw new Error('问题编号不匹配。');
    return { ...record, directory };
  }
  async list(): Promise<HushHourIssueSummary[]> {
    const entries = await readdir(await this.root(), { withFileTypes: true });
    const records = await Promise.all(entries.filter(item => item.isDirectory() && HushHourIssueIdSchema.safeParse(item.name).success).map(item => this.read(item.name)));
    return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(({ id, title, createdAt, environment }) => ({ id, title, createdAt, environment }));
  }
  async folder(id?: unknown): Promise<string> { return id === undefined ? this.root() : (await this.read(id)).directory; }
  async imagePath(input: unknown, imageId: unknown): Promise<string> {
    const record = await this.read(input), image = record.images.find(item => item.id === imageId);
    if (!image) throw new Error('问题截图不存在。');
    return this.file(record.directory, image.file);
  }
  async save(input: unknown, state: HushHourState, artifactPath: (id: string) => Promise<string>): Promise<HushHourIssue> {
    const draft = HushHourIssueDraftSchema.parse(input);
    if (new Set(draft.screenshotIds).size !== draft.screenshotIds.length) throw new Error('截图不能重复。');
    const online = draft.environment === 'online';
    if (online && (!draft.siteUrl || draft.siteUrl !== state.online.url || !draft.pageUrl || new URL(draft.pageUrl).origin !== new URL(draft.siteUrl).origin)) throw new Error('正式网页地址已变化，请重新打开问题记录。');
    if (online && (draft.includeLogs || draft.previewRevision)) throw new Error('正式网页问题不能附带本地构建信息。');
    const date = new Date(), stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const id = `HH-${stamp}-${randomUUID().slice(0, 8)}`, root = await this.root(), temporary = await mkdtemp(join(root, '.saving-'));
    try {
      const images: HushHourIssue['images'] = [];
      let total = 0;
      for (const imageId of draft.screenshotIds) {
        const image = state.captures.find(item => item.id === imageId);
        if (!image) throw new Error('截图不属于 Hush-Hour。');
        if (image.environment !== draft.environment || online && (image.siteUrl !== draft.siteUrl || new URL(image.url).origin !== new URL(draft.siteUrl).origin)) throw new Error('截图不属于当前网页环境或正式地址。');
        const file = await artifactPath(imageId), size = (await lstat(file)).size;
        total += size;
        if (size > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) throw new Error('截图总大小不能超过 40 MB，单张不能超过 20 MB。');
        const bytes = await readFile(file);
        if (!bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) throw new Error('截图文件不是有效的 PNG。');
        const name = `screenshots/${images.length + 1}.png`;
        await mkdir(join(temporary, 'screenshots'), { recursive: true }); await writeFile(join(temporary, name), bytes);
        images.push({ id: image.id, name: image.name, file: name });
      }
      const record = HushHourIssueRecordSchema.parse({ ...draft, schemaVersion: 1, id, createdAt: date.getTime(), projectRoot: state.root,
        currentBuildRevision: online ? '' : state.buildRevision, buildLog: draft.includeLogs ? state.build.output : '', images });
      await writeFile(join(temporary, 'issue.json'), JSON.stringify(record, null, 2));
      await writeFile(join(temporary, 'report.md'), hushHourIssueReport(record));
      if (draft.includeLogs) await writeFile(join(temporary, 'build-output.txt'), record.buildLog);
      await rename(temporary, join(root, id));
      return { ...record, directory: join(root, id) };
    } catch (error) { if (inside(root, temporary)) await rm(temporary, { recursive: true, force: true }); throw error; }
  }
  async archive(input: unknown): Promise<Uint8Array> {
    const record = await this.read(input), files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const name of ['issue.json', 'report.md', ...record.images.map(item => item.file), ...(record.includeLogs ? ['build-output.txt'] : [])]) {
      const file = await this.file(record.directory, name);
      total += (await lstat(file)).size;
      if (total > 42 * 1024 * 1024) throw new Error('问题包过大，请检查截图文件。');
      files[`${record.id}/${name}`] = await readFile(file);
    }
    return zipSync(files);
  }
}
