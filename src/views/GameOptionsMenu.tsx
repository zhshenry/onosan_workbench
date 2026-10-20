import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CaretUp, DotsThree } from '@phosphor-icons/react';

export function GameOptionsMenu({ kind, active, context, onOpen, children, label: customLabel }: { kind: 'project' | 'preview' | 'terminal'; active: boolean; context?: string; onOpen?(): void; children(close: () => void): ReactNode; label?: string }) {
  const id = useId(), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const terminal = kind === 'terminal';
  const label = customLabel ?? (terminal ? '终端更多操作' : kind === 'project' ? '项目更多功能' : '游戏预览更多功能');
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const element = menu.current, anchor = trigger.current.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8))}px`;
    const top = terminal && anchor.bottom + element.offsetHeight + 6 > window.innerHeight - 8 ? anchor.top - element.offsetHeight - 6 : anchor.bottom + 6;
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - element.offsetHeight - 8))}px`;
    element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
    const dismiss = () => element.hidePopover();
    window.addEventListener('resize', dismiss); return () => window.removeEventListener('resize', dismiss);
  }, [open, terminal]);
  useEffect(() => { menu.current?.hidePopover(); }, [active, context]);
  const close = () => { menu.current?.hidePopover(); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={terminal ? 'game-terminal-menu-trigger' : 'game-icon-button game-options-trigger'} aria-label={label} title={terminal ? '更多操作' : '更多功能'} aria-haspopup="menu" aria-expanded={open} aria-controls={id} popoverTarget={id} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.showPopover(); } }}><DotsThree size={22} weight="bold" />{terminal ? <><span>更多操作</span><CaretUp className="game-terminal-menu-caret" /></> : null}</button>
    <div ref={menu} id={id} className={terminal ? 'game-terminal-menu' : `browser-menu game-options-menu game-${kind}-menu`} popover="auto" role="menu" aria-label={label} onToggle={event => { const next = event.newState === 'open'; setOpen(next); if (next) onOpen?.(); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const index = items.findIndex(item => item === document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>{children(close)}</div>
  </>;
}
