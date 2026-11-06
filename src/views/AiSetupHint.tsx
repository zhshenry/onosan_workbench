import { useCallback, useEffect, useId, useRef, useState, type RefObject } from 'react';
import { ArrowRight, CaretUp, X } from '@phosphor-icons/react';
import type { AiConfig } from '../../shared/workbench-api';
import { IconButton } from '../ui/controls';

const DISMISSED_KEY = 'wb.ai.setup-hint.dismissed.v1';

export function AiSetupHint({ trigger, active, onConfigure }: {
  trigger: RefObject<HTMLButtonElement | null>; active: boolean; onConfigure(): void;
}) {
  const panel = useRef<HTMLDivElement>(null), shown = useRef(false), titleId = useId(), messageId = useId();
  const [needsSetup, setNeedsSetup] = useState(false);
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const dismiss = useCallback(() => {
    localStorage.setItem(DISMISSED_KEY, '1'); setDismissed(true);
    if (panel.current?.matches(':popover-open')) panel.current.hidePopover();
  }, []);

  useEffect(() => {
    let mounted = true, received = false;
    const apply = (config: AiConfig): void => {
      setNeedsSetup(config.models.length === 0);
      if (config.models.length > 0) dismiss();
    };
    const off = window.workbench.ai.onConfigChanged(config => { received = true; apply(config); });
    void window.workbench.ai.config().then(config => { if (mounted && !received) apply(config); }, () => {});
    return () => { mounted = false; off(); };
  }, [dismiss]);

  useEffect(() => {
    if (!active || !needsSetup || dismissed) return;
    const element = panel.current!, button = trigger.current!;
    let timer: number;
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
        if (document.hidden || document.querySelector(':modal, [popover]:popover-open')) return;
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
    queue();
    document.addEventListener('toggle', layerChanged, true);
    document.addEventListener('visibilitychange', queue);
    window.addEventListener('resize', place);
    window.addEventListener('keydown', escape, true);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('toggle', layerChanged, true);
      document.removeEventListener('visibilitychange', queue);
      window.removeEventListener('resize', place);
      window.removeEventListener('keydown', escape, true);
      if (element.matches(':popover-open')) element.hidePopover();
    };
  }, [active, needsSetup, dismissed, dismiss, trigger]);

  return <div ref={panel} className="ai-setup-hint" popover="auto" role="dialog" aria-labelledby={titleId} aria-describedby={messageId}
    onToggle={event => {
      if (event.newState === 'open') shown.current = true;
      else if (shown.current) { shown.current = false; dismiss(); }
    }}>
    <CaretUp className="ai-setup-pointer" size={24} weight="fill" aria-hidden="true" />
    <header><h2 id={titleId}>配置模型，开启 AI 助手</h2><IconButton label="关闭配置引导" onClick={() => { dismiss(); trigger.current?.focus({ preventScroll: true }); }}><X size={18} /></IconButton></header>
    <p id={messageId} role="status">添加一个对话模型，<br />就能在工作台里对话与创作。</p>
    <footer><button type="button" className="ai-setup-configure" onClick={() => { dismiss(); onConfigure(); }}>去配置<ArrowRight size={16} aria-hidden="true" /></button></footer>
  </div>;
}
