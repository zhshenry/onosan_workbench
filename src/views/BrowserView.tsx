import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { BrowserWorkspacePane } from '../../modules/browser/ui/automation';
import { DEFAULT_BROWSER_WORKSPACE } from '../../shared/browser-contracts';

export function BrowserHost({ active, focusTarget, onPending }: {
  active: boolean; focusTarget: RefObject<HTMLElement | null>; onPending(message: string): void;
}) {
  const [entered, setEntered] = useState(active);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) setEntered(true); }, [active]);
  useLayoutEffect(() => {
    if (!active && host.current && (document.activeElement === document.body || host.current.contains(document.activeElement))) focusTarget.current?.focus({ preventScroll: true });
  }, [active, focusTarget]);
  if (!active && !entered) return null;
  return <div ref={host} className="view-fade media-browser-host" hidden={!active} inert={!active} aria-hidden={!active} onFocusCapture={event => { if (!active) { (event.target as HTMLElement).blur(); focusTarget.current?.focus({ preventScroll: true }); } }}>
    <section className="view on media-browser-view" id="view-browser">
      <div className="media-browser-header"><div><h1>浏览器</h1><p>保留登录状态 · 直接在右侧 AI 助手提出操作要求</p></div></div>
      <BrowserWorkspacePane workspace={DEFAULT_BROWSER_WORKSPACE} tabs slogan="输入网址开始浏览，再让右侧 AI 助手帮你操作网页" onPending={onPending} />
    </section>
  </div>;
}
