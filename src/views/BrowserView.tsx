import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { BrowserWorkspacePane } from '../../modules/browser/ui/workspace-pane';
import { DEFAULT_BROWSER_WORKSPACE } from '../../shared/browser-contracts';

export function BrowserHost({ active, focusTarget, onPending, children }: {
  active: boolean; focusTarget: RefObject<HTMLElement | null>; onPending(message: string): void; children?: ReactNode;
}) {
  const [entered, setEntered] = useState(active);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => { if (active) setEntered(true); }, [active]);
  useLayoutEffect(() => {
    if (!active && host.current && (document.activeElement === document.body || host.current.contains(document.activeElement))) focusTarget.current?.focus({ preventScroll: true });
  }, [active, focusTarget]);
  if (!active && !entered) return null;
  return <div ref={host} className="view-fade browser-host" hidden={!active} inert={!active} aria-hidden={!active} onFocusCapture={event => { if (!active) { (event.target as HTMLElement).blur(); focusTarget.current?.focus({ preventScroll: true }); } }}>
    {children ?? <section className="view on media-browser-view" id="view-browser" aria-label="浏览器">
      <BrowserWorkspacePane workspace={DEFAULT_BROWSER_WORKSPACE} tabs slogan="输入网址开始浏览，或者让AI助手帮你操作浏览器" onPending={onPending} />
    </section>}
  </div>;
}
