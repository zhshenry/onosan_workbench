import { useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from 'react';
import { MediaBrowserView } from './MediaBrowserView';

type MediaBrowserHostProps = ComponentProps<typeof MediaBrowserView> & {
  active: boolean;
  focusTarget: RefObject<HTMLElement | null>;
};

/** 工作台切换只隐藏创作者页的整个 DOM。此页不再进入素材浏览器。 */
export function MediaBrowserHost({ active, focusTarget, ...viewProps }: MediaBrowserHostProps) {
  const [creatorEntered, setCreatorEntered] = useState(active);
  const hostRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (active) setCreatorEntered(true);
  }, [active]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (active || !host) return;
    const focused = document.activeElement;
    // hidden/inert 可能已令浏览器把焦点移至 body;保留在当前工作台的明确焦点。
    if (focused === document.body || host.contains(focused)) {
      if (focused instanceof HTMLElement) focused.blur();
      focusTarget.current?.focus({ preventScroll: true });
    }
  }, [active, focusTarget]);

  if (!active && !creatorEntered) return null;
  return (
    <div
      ref={hostRef}
      className="view-fade media-browser-host"
      data-active={active}
      hidden={!active}
      inert={!active}
      aria-hidden={!active}
      onFocusCapture={(event) => {
        if (active) return;
        (event.target as HTMLElement).blur();
        focusTarget.current?.focus({ preventScroll: true });
      }}
    >
      <MediaBrowserView {...viewProps} />
    </div>
  );
}
