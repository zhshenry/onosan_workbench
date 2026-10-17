export interface GameDocument { path: string; content: string; }
export type GameDocumentLink = { kind: 'document'; path: string; hash: string } | { kind: 'external'; url: string };

export function resolveGameDocumentLink(currentPath: string, href: string): GameDocumentLink {
  if (/^https?:\/\//i.test(href)) {
    const url = new URL(href);
    if (url.username || url.password) throw new Error('文档链接不能包含账号密码。');
    return { kind: 'external', url: url.href };
  }
  if (/^[a-z][a-z\d+.-]*:/i.test(href) || /^[\\/]{2}/.test(href) || href.includes('\\')) throw new Error('只支持项目内的 Markdown 文档或 HTTP(S) 网页链接。');
  const split = href.indexOf('#'), hash = split < 0 ? '' : href.slice(split + 1);
  const value = decodeURIComponent((split < 0 ? href : href.slice(0, split)).split('?')[0]);
  if (!value) return { kind: 'document', path: currentPath, hash };
  if (value.includes('\\') || value.includes(':') || value.includes('\0') || value.startsWith('//')) throw new Error('文档路径无效。');
  const parts = value.startsWith('/') ? [] : currentPath.split('/').slice(0, -1);
  for (const part of value.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') { if (!parts.length) throw new Error('文档链接超出项目目录。'); parts.pop(); }
    else parts.push(part);
  }
  const path = parts.join('/');
  if (!/\.(md|markdown)$/i.test(path)) throw new Error('应用内说明只支持 Markdown 文档。');
  return { kind: 'document', path, hash };
}
