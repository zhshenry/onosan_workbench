import { useCallback, useEffect, useId, useRef, type ReactNode, type RefObject } from 'react';
import { ArrowRight, CaretUp, X } from '@phosphor-icons/react';
import { IconButton } from './controls';

export function AiTopbarHint({ trigger, active, kind, title, message, closeLabel, actionLabel, onDismiss, onAction }: {
  trigger: RefObject<HTMLButtonElement | null>; active: boolean; kind: 'setup' | 'completion';
  title: string; message: ReactNode; closeLabel: string; actionLabel: string; onDismiss(): void; onAction(): void;
}) {
  const panel = useRef<HTMLDivElement>(null), shown = useRef(false), titleId = useId(), messageId = useId();
  const dismiss = useCallback(() => {
    shown.current = false;
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
    onDismiss();
  }, [onDismiss]);

  useEffect(() => {
    if (!active) return;
    const element = panel.current!, button = trigger.current!;
    let timer: number;
    let waitingForLayer: Element | null = null;
    const place = (): void => {
      if (!element.matches(':popover-open')) return;
      const anchor = button.getBoundingClientRect();
      const left = Math.max(12, Math.min(anchor.left + anchor.width / 2 - element.offsetWidth * .6, window.innerWidth - element.offsetWidth - 12));
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(12, Math.min(anchor.bottom + 18, window.innerHeight - element.offsetHeight - 12))}px`;
      element.style.setProperty('--ai-setup-pointer-left', `${Math.max(14, Math.min(anchor.left + anchor.width / 2 - left - element.clientLeft - 12, element.offsetWidth - 38))}px`);
    };
    const queue = (): void => {
      window.clearTimeout(timer);
      if (element.matches(':popover-open')) return;
      timer = window.setTimeout(() => {
        if (document.hidden) return;
        waitingForLayer = document.querySelector(':modal, [popover]:popover-open');
        if (waitingForLayer) return;
        element.showPopover(); shown.current = true; place();
      }, 1000);
    };
    const layerChanged = (event: Event): void => { if (event.target !== element) queue(); };
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || !element.matches(':popover-open')) return;
      event.preventDefault(); event.stopPropagation();
      const focused = element.contains(document.activeElement);
      dismiss(); if (focused) button.focus({ preventScroll: true });
    };
    const layers = new window.MutationObserver(() => {
      if (waitingForLayer && !waitingForLayer.isConnected) { waitingForLayer = null; queue(); }
    });
    layers.observe(document.body, { childList: true, subtree: true });
    queue();
    document.addEventListener('toggle', layerChanged, true);
    document.addEventListener('visibilitychange', queue);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.clearTimeout(timer); shown.current = false;
      layers.disconnect();
      document.removeEventListener('toggle', layerChanged, true);
      document.removeEventListener('visibilitychange', queue);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', escape, true);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [active, dismiss, trigger]);

  return <div ref={panel} className="ai-setup-hint" data-ai-hint={kind} popover="auto" role="dialog" aria-labelledby={titleId} aria-describedby={messageId}
    onToggle={event => {
      if (event.newState === 'open') shown.current = true;
      else if (shown.current) { shown.current = false; onDismiss(); }
    }}>
    <CaretUp className="ai-setup-pointer" size={24} weight="fill" aria-hidden="true" />
    <header><h2 id={titleId}>{title}</h2><IconButton label={closeLabel} onClick={() => { dismiss(); trigger.current?.focus({ preventScroll: true }); }}><X size={18} /></IconButton></header>
    <p id={messageId} role="status">{message}</p>
    <footer><button type="button" className="ai-setup-configure" onClick={() => { dismiss(); onAction(); }}>{actionLabel}<ArrowRight size={16} aria-hidden="true" /></button></footer>
  </div>;
}
