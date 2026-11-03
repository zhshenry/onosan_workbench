import { createHash, randomUUID } from 'node:crypto';
import { copyFile, lstat, mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, sep } from 'node:path';
import { isMap, parseDocument } from 'yaml';
import { slug as githubSlug } from 'github-slugger';
import { WEBSITE_COLLECTIONS, WebsiteFieldsSchema, WebsiteIdSchema, WebsiteSaveSchema, type WebsiteCollection, type WebsiteContent, type WebsiteContentSummary, type WebsiteFields } from '../shared/personal-website-contracts';

const keys: Record<WebsiteCollection, (keyof WebsiteFields)[]> = {
  works: ['title', 'description', 'year', 'category', 'cover', 'link', 'featured', 'order'],
  blog: ['title', 'summary', 'date', 'tags'],
  library: ['title', 'titleEn', 'summary', 'board', 'topic', 'section', 'cover', 'date', 'order'],
};
const digest = (source: string) => createHash('sha256').update(source).digest('hex');
const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const missing = (error: unknown) => (error as NodeJS.ErrnoException).code === 'ENOENT';
const inside = (root: string, file: string) => { const path = relative(root, file); return path !== '..' && !path.startsWith('..' + sep) && !isAbsolute(path); };
function parseSource(source: string) {
  const match = /^(\uFEFF?)---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error('文件缺少有效的 YAML 信息区，请在编辑器中修正后重新读取。');
  const document = parseDocument(match[2], { uniqueKeys: true });
  if (document.errors.length || !isMap(document.contents)) throw new Error('内容信息区无法解析：' + (document.errors[0]?.message || '需要键值字段。'));
  return { document, fields: document.toJS({ maxAliasCount: 50 }) as Record<string, unknown>, body: match[3], bom: match[1], newline: source.includes('\r\n') ? '\r\n' : '\n' };
}
function validateFields(collection: WebsiteCollection, fields: WebsiteFields) {
  if (!fields.title.trim()) throw new Error('请填写标题。');
  if (collection === 'works' && (fields.year === undefined || fields.description === undefined)) throw new Error('请填写作品年份和简介。');
  if (collection !== 'works' && fields.summary === undefined) throw new Error('请填写内容摘要。');
  if (collection === 'blog' && !fields.date) throw new Error('请填写博客日期。');
  if (fields.date && (!/^\d{4}-\d{2}-\d{2}$/.test(fields.date) || !Number.isFinite(Date.parse(fields.date)) || new Date(fields.date).toISOString().slice(0, 10) !== fields.date)) throw new Error('日期格式应为有效的 YYYY-MM-DD。');
  for (const key of ['link', 'cover'] as const) {
    const value = fields[key];
    if (value && !(key === 'cover' && value.startsWith('/') && !value.startsWith('//')) && !(URL.canParse(value) && ['http:', 'https:'].includes(new URL(value).protocol) && !new URL(value).username && !new URL(value).password)) throw new Error(key === 'link' ? '作品链接应为完整的 HTTP(S) 地址。' : '封面应为项目图片路径或 HTTP(S) 地址。');
  }
}

export class PersonalWebsiteContent {
  private writes: Promise<unknown> = Promise.resolve();
  constructor(readonly root: string) {}
  private async safePath(name: string, create = false): Promise<string> {
    const project = await realpath(this.root), segments = name.split('/');
    if (segments.some(part => !part || part === '.' || part === '..' || part.includes('\\'))) throw new Error('项目路径无效。');
    let current = project;
    for (let index = 0; index < segments.length; index++) {
      current = join(current, segments[index]);
      const info = await lstat(current).catch(error => { if (create && missing(error)) return null; throw error; });
      if (info?.isSymbolicLink()) throw new Error('内容路径不能经过链接或联接目录。');
      if (info && !inside(project, await realpath(current))) throw new Error('内容路径超出个人网站目录。');
    }
    return current;
  }
  private path(id: string, create = false): Promise<string> { WebsiteIdSchema.parse(id); return this.safePath('src/content/' + id, create); }
  private async source(file: string): Promise<string> {
    if ((await lstat(file)).size > 1500000) throw new Error('此内容超过编辑器支持的 1.5 MB，请使用外部编辑器。');
    return readFile(file, 'utf8');
  }
  private content(id: string, source: string): WebsiteContent {
    const collection = id.split('/')[0] as WebsiteCollection, parsed = parseSource(source);
    const fields = Object.fromEntries(keys[collection].filter(key => parsed.fields[key] !== undefined).map(key => [key, parsed.fields[key]]));
    const slug = collection === 'blog' ? (typeof parsed.fields.slug === 'string' && parsed.fields.slug || id.slice(5, -3).split('/').map(segment => githubSlug(segment)).join('/').replace(/\/index$/, '')) : undefined;
    return { id, collection, version: digest(source), source, fields: WebsiteFieldsSchema.parse(fields), body: parsed.body, slug };
  }
  async read(input: unknown): Promise<WebsiteContent> {
    const id = WebsiteIdSchema.parse(input);
    return this.content(id, await this.source(await this.path(id)));
  }
  async list(): Promise<WebsiteContentSummary[]> {
    const result: WebsiteContentSummary[] = [];
    const walk = async (collection: WebsiteCollection, folder: string) => {
      const entries = await this.safePath('src/content/' + folder).then(directory => readdir(directory, { withFileTypes: true })).catch(error => { if (missing(error)) return []; throw error; });
      for (const entry of entries) {
        if (entry.isSymbolicLink()) continue;
        const id = folder + '/' + entry.name;
        if (entry.isDirectory()) await walk(collection, id);
        else if (entry.isFile() && entry.name.endsWith('.md')) {
          try { const content = await this.read(id); result.push({ id, collection, title: content.fields.title }); }
          catch (error) { result.push({ id, collection, title: basename(entry.name, '.md'), error: message(error) }); }
        }
      }
    };
    for (const collection of Object.keys(WEBSITE_COLLECTIONS) as WebsiteCollection[]) await walk(collection, collection);
    return result;
  }
  private async prepare(input: unknown, preview = false) {
    const request = WebsiteSaveSchema.parse(input), collection = request.id.split('/')[0] as WebsiteCollection;
    validateFields(collection, request.fields);
    const file = await this.path(request.id, !request.version);
    const before = await this.source(file).catch(error => { if (!request.version && missing(error)) return ''; throw error; });
    if (!preview && (request.version ? digest(before) !== request.version : !!before)) throw new Error('文件已被其他编辑器修改或同名内容已存在。请先查看改动，复制草稿后重新读取文件。');
    const parsed = parseSource(before || '---\ntitle: ""\n---\n');
    for (const key of keys[collection]) {
      const next = request.fields[key], previous = parsed.fields[key];
      if (JSON.stringify(next) === JSON.stringify(previous)) continue;
      if (next === undefined || next === '' && !['title', 'description', 'summary'].includes(key)) parsed.document.delete(key);
      else parsed.document.set(key, next);
    }
    const yaml = parsed.document.toString({ lineWidth: 0 }).replace(/\r?\n/g, parsed.newline);
    const after = parsed.bom + '---' + parsed.newline + yaml + '---' + parsed.newline + request.body.replace(/\r?\n/g, parsed.newline);
    return { request, file, before, after };
  }
  async previewSave(input: unknown): Promise<{ before: string; after: string }> {
    const { before, after } = await this.prepare(input, true); return { before, after };
  }
  save(input: unknown): Promise<WebsiteContent> {
    const action = this.writes.then(async () => {
      const prepared = await this.prepare(input), { request, file, before, after } = prepared;
      if (!request.version) { await mkdir(dirname(file), { recursive: true }); await this.path(request.id, true); await writeFile(file, after, { flag: 'wx' }); }
      else {
        const temporary = file + '.' + randomUUID() + '.tmp';
        try {
          await writeFile(temporary, after, { flag: 'wx' });
          await this.path(request.id);
          if (digest(await this.source(file)) !== digest(before)) throw new Error('保存期间文件发生变化，请重新读取后再保存。');
          await rename(temporary, file);
        } finally { await unlink(temporary).catch(error => { if (!missing(error)) throw error; }); }
      }
      return this.content(request.id, after);
    });
    this.writes = action.catch(() => {}); return action;
  }
  async coverPreview(input: string): Promise<string> {
    if (!input || !input.startsWith('/') || input.startsWith('//')) return '';
    const file = await this.safePath('public/' + input.slice(1));
    const mime = { '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }[extname(file).toLowerCase()];
    if (!mime || (await lstat(file)).size > 10000000) throw new Error('请选择小于 10 MB 的图片。');
    return `data:${mime};base64,${(await readFile(file)).toString('base64')}`;
  }
  async importCover(file: string): Promise<{ path: string; preview: string }> {
    const extension = extname(file).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(extension) || (await lstat(file)).size > 10000000) throw new Error('请选择小于 10 MB 的 PNG、JPEG、WebP、GIF 或 SVG 图片。');
    const path = '/images/workbench/' + randomUUID() + extension;
    const target = await this.safePath('public' + path, true);
    await mkdir(dirname(target), { recursive: true }); await this.safePath('public' + path, true);
    await copyFile(file, target, 1);
    return { path, preview: await this.coverPreview(path) };
  }
}
