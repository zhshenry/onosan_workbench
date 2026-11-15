import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { CaretUp, DotsThree, PaintBrush } from '@phosphor-icons/react';

export function GameOptionsMenu({ kind, active, context, onOpen, children, label: customLabel, disabled = false }: { kind: 'project' | 'preview' | 'terminal' | 'island' | 'dashboard'; active: boolean; context?: string; onOpen?(): void; children(close: () => void): ReactNode; label?: string; disabled?: boolean }) {
  const id = useId(), menu = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const terminal = kind === 'terminal';
  const dashboard = kind === 'dashboard';
  const label = customLabel ?? (terminal ? '终端更多操作' : kind === 'island' ? '更多操作' : kind === 'project' ? '项目更多功能' : '游戏预览更多功能');
  useLayoutEffect(() => {
    if (!open || !menu.current || !trigger.current) return;
    const element = menu.current, anchor = trigger.current.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8))}px`;
    const top = (terminal || kind === 'island' || dashboard) && anchor.bottom + element.offsetHeight + 6 > window.innerHeight - 8 ? anchor.top - element.offsetHeight - 6 : anchor.bottom + 6;
    element.style.top = `${Math.max(8, Math.min(top, window.innerHeight - element.offsetHeight - 8))}px`;
    const item = (dashboard ? element.querySelector<HTMLButtonElement>('[aria-checked="true"]') : null) ?? element.querySelector<HTMLButtonElement>(dashboard ? '[role="menuitemradio"]:not(:disabled)' : 'button:not(:disabled)');
    item?.focus({ preventScroll: dashboard });
    if (dashboard && item) {
      const option = item.getBoundingClientRect(), frame = element.getBoundingClientRect();
      element.scrollTop += option.bottom > frame.bottom ? option.bottom - frame.bottom : Math.min(0, option.top - frame.top);
    }
    const dismiss = () => element.hidePopover();
    const scroll = (event: Event) => { const current = trigger.current?.getBoundingClientRect(); if (!element.contains(event.target as Node) && current && (Math.abs(current.top - anchor.top) > 1 || Math.abs(current.left - anchor.left) > 1)) dismiss(); };
    window.addEventListener('resize', dismiss);
    if (dashboard) window.addEventListener('scroll', scroll, true);
    return () => { window.removeEventListener('resize', dismiss); if (dashboard) window.removeEventListener('scroll', scroll, true); };
  }, [open, terminal, kind, dashboard]);
  useEffect(() => { menu.current?.hidePopover(); }, [active, context]);
  const close = () => { menu.current?.hidePopover(); trigger.current?.focus(); };
  return <>
    <button ref={trigger} type="button" className={dashboard ? 'ibtn dashboard-style-trigger' : terminal ? 'game-terminal-menu-trigger' : kind === 'island' ? 'icon-button island-shelf-menu-trigger' : 'game-icon-button game-options-trigger'} aria-label={label} title={dashboard ? disabled ? '该类卡片目前只有一种样式' : '更换样式' : terminal || kind === 'island' ? '更多操作' : '更多功能'} disabled={disabled} aria-haspopup="menu" aria-expanded={open} aria-controls={id} popoverTarget={id} onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.showPopover(); } }}>{dashboard ? <PaintBrush size={16} /> : <DotsThree size={22} weight="bold" />}{terminal ? <><span>更多操作</span><CaretUp className="game-terminal-menu-caret" /></> : null}</button>
    <div ref={menu} id={id} className={dashboard ? 'dashboard-style-menu' : terminal ? 'game-terminal-menu' : kind === 'island' ? 'island-shelf-menu' : `browser-menu game-options-menu game-${kind}-menu`} popover="auto" role="menu" aria-label={label} onToggle={event => { const next = event.newState === 'open'; setOpen(next); if (next) onOpen?.(); }} onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End', ...(dashboard ? ['ArrowLeft', 'ArrowRight'] : [])].includes(event.key)) return;
      event.preventDefault();
      const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>(dashboard ? '[role="menuitemradio"]:not(:disabled)' : 'button:not(:disabled)') ?? []);
      const index = items.findIndex(item => item === document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : -1) + items.length) % items.length]?.focus();
    }}>{!dashboard || open ? children(close) : null}</div>
  </>;
}
