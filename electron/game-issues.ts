import { randomUUID } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, join, relative } from 'node:path';
import { zipSync } from 'fflate';
import { GAME_TASKS, type GameState } from '../shared/game-contracts';
import { GameIssueDraftSchema, GameIssueIdSchema, GameIssueRecordSchema, type GameIssue, type GameIssueSummary } from '../shared/game-issues';

const inside = (root: string, file: string) => { const path = relative(root, file); return !!path && !path.startsWith('..') && !isAbsolute(path); };
const pngSignature = Buffer.from('89504e470d0a1a0a', 'hex');

export class GameIssues {
  readonly directory: string;
  constructor(dataDir: string) { this.directory = join(dataDir, 'issues'); }

  private async root(): Promise<string> {
    await mkdir(this.directory, { recursive: true });
    if ((await lstat(this.directory)).isSymbolicLink()) throw new Error('问题目录不能是符号链接。');
    return realpath(this.directory);
  }
  async read(input: unknown): Promise<GameIssue> {
    const id = GameIssueIdSchema.parse(input), root = await this.root(), directory = join(root, id);
    if ((await lstat(directory)).isSymbolicLink() || !inside(root, await realpath(directory))) throw new Error('问题目录无效。');
    const manifest = await this.file(directory, 'issue.json');
    if ((await lstat(manifest)).size > 2 * 1024 * 1024) throw new Error('问题记录过大。');
    const record = GameIssueRecordSchema.parse(JSON.parse(await readFile(manifest, 'utf8')));
    if (record.id !== id) throw new Error('问题编号不匹配。');
    return { ...record, directory };
  }
  async list(): Promise<GameIssueSummary[]> {
    const entries = await readdir(await this.root(), { withFileTypes: true });
    const records = await Promise.all(entries.filter(entry => entry.isDirectory() && GameIssueIdSchema.safeParse(entry.name).success).map(entry => this.read(entry.name)));
    return records.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50).map(({ id, title, createdAt, environment }) => ({ id, title, createdAt, environment }));
  }
  async folder(id?: unknown): Promise<string> { return id === undefined ? this.root() : (await this.read(id)).directory; }
  private async file(directory: string, name: string): Promise<string> {
    const file = join(directory, name), canonical = await realpath(file);
    if (!inside(directory, canonical) || !(await lstat(canonical)).isFile()) throw new Error('问题附件不存在或路径无效。');
    return canonical;
  }
  async imagePath(input: unknown, imageId: unknown): Promise<string> {
    const issue = await this.read(input), image = issue.images.find(item => item.id === imageId);
    if (!image) throw new Error('问题截图不存在。');
    return this.file(issue.directory, image.file);
  }
  async save(input: unknown, current: GameState, artifactPath: (id: string) => Promise<string>): Promise<GameIssue> {
    const draft = GameIssueDraftSchema.parse(input), state = structuredClone(current);
    if (new Set(draft.screenshotIds).size !== draft.screenshotIds.length) throw new Error('截图不能重复。');
    if (draft.environment === 'online' && (!state.online.url || draft.includeTest || draft.includeLogs)) throw new Error('线上问题不能附带本地测试和服务日志。');
    const result = draft.includeTest && draft.taskId ? state.results[draft.taskId] : undefined;
    if (draft.includeTest && !result) throw new Error('所选测试结果不存在，请取消勾选后重试。');
    const known = [...state.captures, ...Object.values(state.results).flatMap(item => item?.artifacts ?? [])];
    const createdAt = Date.now(), date = new Date(createdAt);
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    const id = `TD-${stamp}-${randomUUID().slice(0, 8)}`;
    const root = await this.root(), temporary = await mkdtemp(join(root, '.saving-'));
    try {
      const images: GameIssue['images'] = [];
      let total = 0;
      for (const imageId of draft.screenshotIds) {
        const image = known.find(item => item.id === imageId);
        if (!image || (draft.environment === 'online' ? image.environment !== 'online' || image.siteUrl !== state.online.url : image.environment === 'online')) throw new Error('截图不属于当前试玩环境。');
        const source = await artifactPath(imageId), size = (await lstat(source)).size;
        total += size;
        if (size > 20 * 1024 * 1024 || total > 40 * 1024 * 1024) throw new Error('截图总大小不能超过 40 MB，单张不能超过 20 MB。');
        const bytes = await readFile(source);
        if (!bytes.subarray(0, 8).equals(pngSignature)) throw new Error('截图文件不是有效的 PNG。');
        const file = `screenshots/${images.length + 1}.png`;
        await mkdir(join(temporary, 'screenshots'), { recursive: true });
        await writeFile(join(temporary, file), bytes);
        images.push({ id: image.id, name: image.name, file });
      }
      const record = GameIssueRecordSchema.parse({
        ...draft, schemaVersion: 1, id, createdAt, projectRoot: state.config.root,
        revision: draft.environment === 'local' ? state.revision : '', siteUrl: draft.environment === 'online' ? state.online.url : '',
        onlineCheck: draft.environment === 'online' ? state.online.check ?? null : null,
        test: result ? { taskId: result.taskId, status: result.status, output: result.output, message: result.message, revision: result.revision, startedAt: result.startedAt, finishedAt: result.finishedAt, exitCode: result.exitCode } : null,
        logs: draft.includeLogs ? state.logs : [], images,
      });
      const report = ['# ' + record.title, '', `问题编号：${id}`, `保存时间：${date.toLocaleString('zh-CN')}`, `环境：${draft.environment === 'local' ? '本地开发' : '线上试玩'}`, `页面：${draft.pageUrl || '尚未打开'}`, `视口：${draft.viewport} · 缩放 ${Math.round(draft.zoom * 100)}% · 试玩档 ${draft.profile}`, `项目：${record.projectRoot}`, record.revision ? `代码指纹：${record.revision}` : `线上地址：${record.siteUrl}`, '', '## 复现步骤', record.steps, '', '## 期望表现', record.expected, '', '## 实际表现', record.actual, '', '## 附件', ...images.map(image => `![${image.name}](${image.file})`), '', '## 检查与日志', result ? `${GAME_TASKS.find(task => task.id === result.taskId)!.label}：${result.status}（提交时快照，详见 test-output.txt）` : '未附带本地测试结果。', record.onlineCheck ? `线上访问：${record.onlineCheck.message}` : '', draft.includeLogs ? '服务日志：service-log.txt（提交时快照）' : '未附带服务日志。'].join('\n');
      await writeFile(join(temporary, 'issue.json'), JSON.stringify(record, null, 2), 'utf8');
      await writeFile(join(temporary, 'report.md'), report, 'utf8');
      if (record.test) await writeFile(join(temporary, 'test-output.txt'), record.test.output, 'utf8');
      if (draft.includeLogs) await writeFile(join(temporary, 'service-log.txt'), record.logs.join('\n'), 'utf8');
      await rename(temporary, join(root, id));
      return { ...record, directory: join(root, id) };
    } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  }
  async archive(input: unknown): Promise<Uint8Array> {
    const issue = await this.read(input);
    const names = ['issue.json', 'report.md', ...issue.images.map(image => image.file), ...(issue.test ? ['test-output.txt'] : []), ...(issue.includeLogs ? ['service-log.txt'] : [])];
    const files: Record<string, Uint8Array> = {};
    let total = 0;
    for (const name of names) {
      const file = await this.file(issue.directory, name);
      total += (await lstat(file)).size;
      if (total > 42 * 1024 * 1024) throw new Error('问题包过大，请检查截图文件。');
      files[`${issue.id}/${name}`] = await readFile(file);
    }
    return zipSync(files);
  }
}
