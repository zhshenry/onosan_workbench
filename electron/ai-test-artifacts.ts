import { readFileSync, writeFileSync, mkdirSync, lstatSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve, sep, extname } from 'node:path';
import { artifactPathSchema, type TestFile } from '../shared/ai-test-contracts';

export function scopedFile(root: string, name: string): string {
  artifactPathSchema.parse(name);
  const path = resolve(root, name);
  if (!path.startsWith(resolve(root) + sep)) throw new Error('文件超出产物目录');
  let current = root;
  for (const part of name.split('/')) {
    current = join(current, part);
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('产物中不允许符号链接');
  }
  return path;
}
export function writeTestFile(root: string, file: TestFile): void {
  if (Buffer.byteLength(file.content) > 1000000) throw new Error('单个文件最多 1 MB');
  const path = scopedFile(root, file.path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, file.content, 'utf8');
}
export function readTestFiles(root: string): TestFile[] {
  const files: TestFile[] = [];
  let bytes = 0;
  function visit(folder: string, prefix = ''): void {
    if (!existsSync(folder)) return;
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error('产物中不允许符号链接');
      const name = prefix + entry.name;
      if (entry.isDirectory()) { if (name.split('/').length > 8) throw new Error('文件目录过深'); visit(join(folder, entry.name), name + '/'); }
      else {
        const path = scopedFile(root, name), info = lstatSync(path);
        bytes += info.size;
        if (info.size > 1000000 || bytes > 4000000 || files.length >= 40) throw new Error('产物超出 40 个文件或 4 MB 上限');
        files.push({ path: name, content: readFileSync(path, 'utf8') });
      }
    }
  }
  visit(root);
  return files;
}
export function extractTestFiles(reply: string): TestFile[] {
  const fence = String.fromCharCode(96).repeat(3);
  const blocks = new RegExp(fence + '([^\\n]*)\\n([\\s\\S]*?)' + fence, 'g');
  const files = new Map<string, TestFile>();
  let index = 0;
  for (const block of reply.matchAll(blocks)) {
    const header = block[1].trim();
    const explicit = /(?:^|\s)(?:file(?:name)?=)?["']?((?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]+)["']?$/i.exec(header);
    const colon = /^[a-z0-9+-]+:(.+)$/i.exec(header);
    const language = header.split(/\s/)[0].toLowerCase();
    const extension: Record<string, string> = { html: 'html', javascript: 'js', js: 'js', typescript: 'ts', ts: 'ts', python: 'py', py: 'py', css: 'css', json: 'json', csv: 'csv', svg: 'svg', sql: 'sql', markdown: 'md' };
    const name = colon?.[1] ?? explicit?.[1] ?? ((language === 'html' ? 'index' : 'output' + (++index === 1 ? '' : index)) + '.' + (extension[language] ?? 'txt'));
    artifactPathSchema.parse(name);
    if (Buffer.byteLength(block[2]) > 1000000 || files.size >= 40) throw new Error('生成文件超出限制');
    if (files.has(name.toLowerCase())) throw new Error('生成文件包含重复路径：' + name);
    files.set(name.toLowerCase(), { path: name, content: block[2].replace(/\n$/, '') });
  }
  if (!files.size && /^\s*(?:<!doctype html|<html[\s>])/i.test(reply)) files.set('index.html', { path: 'index.html', content: reply });
  return [...files.values()];
}
export function entryFile(files: TestFile[]): string | undefined {
  return files.find(file => file.path === 'index.html')?.path ?? files.find(file => /\.html?$/i.test(file.path))?.path;
}
export const ARTIFACT_CSP = "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";
export function artifactMime(name: string): string {
  return ({ '.html': 'text/html', '.htm': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.csv': 'text/csv' } as Record<string, string>)[extname(name).toLowerCase()] ?? 'text/plain';
}
