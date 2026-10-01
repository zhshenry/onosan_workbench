import type { CopyDraft } from '../../shared/copy-contracts';

/** 只接受小红书作品直链,不把创作者后台地址或短链误记为已发布证据。 */
export function parseXhsNoteUrl(input: string): { url: string; remoteId: string } {
  const value = input.trim();
  if (value.length === 0 || value.length > 4096) throw new Error('请输入小红书作品直链');
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error('作品链接格式不正确'); }
  const host = parsed.hostname.toLowerCase();
  const match = parsed.pathname.match(/^\/(?:explore|discovery\/item)\/([a-z0-9]{8,64})\/?$/i);
  if (parsed.protocol !== 'https:' || parsed.port || parsed.username || parsed.password ||
      !['xiaohongshu.com', 'www.xiaohongshu.com'].includes(host) || !match) {
    throw new Error('请粘贴小红书已发布作品的直链');
  }
  parsed.hash = '';
  return { url: parsed.href, remoteId: match[1] };
}

export interface XhsPublishedCandidate {
  title: string;
  url: string;
  remoteId?: string;
  views?: number;
  likes?: number;
  comments?: number;
}

/** 已存作品 ID / 链接优先;标题相同只给候选,由人核对。 */
export function matchXhsPublished(
  draft: Pick<CopyDraft, 'title' | 'xhsPublished'>,
  posts: readonly XhsPublishedCandidate[],
): Array<{ post: XhsPublishedCandidate; reason: 'id' | 'url' | 'title' }> {
  const known = draft.xhsPublished;
  const title = draft.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
  return posts.flatMap((post) => {
    let reason: 'id' | 'url' | 'title' | undefined;
    if (known?.remoteId && post.remoteId === known.remoteId) reason = 'id';
    else if (known?.url && post.url === known.url) reason = 'url';
    else if (title && post.title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '') === title) reason = 'title';
    return reason ? [{ post, reason }] : [];
  }).sort((a, b) => ({ id: 0, url: 1, title: 2 })[a.reason] - ({ id: 0, url: 1, title: 2 })[b.reason]);
}
