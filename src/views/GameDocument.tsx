import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { ArrowLeft, FileText } from '@phosphor-icons/react';
import { Modal, errorText } from '../ui/controls';
import { resolveGameDocumentLink, type GameDocument as DocumentData } from '../../shared/game-documents';
import { renderMarkdown } from '../markdown';
import type { GameBridge } from '../../shared/game-contracts';

export function GameDocument({ close, bridge = window.workbench.game, projectName = '轨迹侦探' }: { close(): void; bridge?: Pick<GameBridge, 'readDocument' | 'openDocumentLink'>; projectName?: string }) {
  const [history, setHistory] = useState([{ path: 'README.md', hash: '' }]);
  const current = history[history.length - 1];
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [error, setError] = useState(''), [linkError, setLinkError] = useState(''), [retry, setRetry] = useState(0);
  const content = useRef<HTMLElement>(null);
  const html = useMemo(() => document ? renderMarkdown(document.content, true) : '', [document]);
  useEffect(() => {
    let active = true;
    setDocument(null); setError(''); setLinkError('');
    void bridge.readDocument(current.path).then(value => { if (active) setDocument(value); }, cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [bridge, current.path, retry]);
  useEffect(() => {
    const element = content.current;
    if (!element || !document) return;
    const used = new Map<string, number>();
    for (const heading of element.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
      const slug = (heading.textContent || '').trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, '').replace(/\s+/g, '-');
      const count = used.get(slug) ?? 0; used.set(slug, count + 1);
      heading.id = `game-doc-${slug}${count ? `-${count}` : ''}`;
    }
    element.focus({ preventScroll: true }); element.scrollTop = 0;
    if (current.hash) {
      try { element.querySelector(`#${CSS.escape(`game-doc-${decodeURIComponent(current.hash)}`)}`)?.scrollIntoView({ block: 'start' }); }
      catch { setLinkError('文档中的章节链接无效。'); }
    }
  }, [html, current.hash, document]);
  function followLink(event: MouseEvent<HTMLElement>) {
    const anchor = (event.target as Element).closest('a[href]');
    if (!anchor) return;
    event.preventDefault();
    if (event.button !== 0 && event.button !== 1 || !document) return;
    setLinkError('');
    try {
      const target = resolveGameDocumentLink(document.path, anchor.getAttribute('href')!);
      if (target.kind === 'external') void bridge.openDocumentLink(target.url).catch(cause => setLinkError(errorText(cause)));
      else if (target.path !== current.path || target.hash !== current.hash) setHistory(previous => [...previous, target]);
    } catch (cause) { setLinkError(errorText(cause)); }
  }
  return <Modal title={`${projectName} · 项目说明`} titleIcon={<FileText />} close={close} className="game-document">
    <nav className="game-document-nav" aria-label="项目说明导航">
      <button type="button" disabled={history.length < 2} onClick={() => setHistory(previous => previous.slice(0, -1))}><ArrowLeft />上一篇</button>
      <button type="button" disabled={history.length === 1} onClick={() => setHistory([{ path: 'README.md', hash: '' }])}>运行说明</button>
      <span title={document?.path || current.path}>只读 · {document?.path || current.path}</span>
    </nav>
    {linkError ? <p className="game-document-error" role="alert">{linkError}</p> : null}
    {error ? <div className="game-document-message" role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>重试读取</button></div> : !document ? <div className="game-document-message" role="status">正在读取项目说明…</div> : <article ref={content} className="ai-markdown game-document-content" aria-label={document.path} tabIndex={0} onClick={followLink} onAuxClick={followLink} dangerouslySetInnerHTML={{ __html: html }} />}
  </Modal>;
}
