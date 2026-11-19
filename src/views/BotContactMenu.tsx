import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { PencilSimple } from '@phosphor-icons/react';

export type BotMenuPosition = { x: number; y: number; anchor: HTMLButtonElement };

export function BotContextMenu({ x, y, anchor, close, label, children }: BotMenuPosition & { close(): void; label: string; children: ReactNode }) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = menu.current!;
    const bounds = anchor.closest('.bot-inspector')?.getBoundingClientRect();
    node.style.left = Math.max((bounds?.left ?? 0) + 8, Math.min(x, (bounds?.right ?? window.innerWidth) - node.offsetWidth - 8)) + 'px';
    node.style.top = Math.max((bounds?.top ?? 0) + 8, Math.min(y, (bounds?.bottom ?? window.innerHeight) - node.offsetHeight - 8)) + 'px';
    node.querySelector('button')?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => { if (!node.contains(event.target as Node)) close(); };
    window.addEventListener('pointerdown', outside); window.addEventListener('resize', close);
    return () => { window.removeEventListener('pointerdown', outside); window.removeEventListener('resize', close); };
  }, [x, y, anchor]);
  return createPortal(<div className="bot-contact-menu" ref={menu} role="menu" aria-label={label} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) close(); }} onKeyDown={event => {
    if (event.key === 'Escape') { event.preventDefault(); close(); anchor.focus({ preventScroll: true }); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button'));
      const index = items.indexOf(document.activeElement as HTMLButtonElement);
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    }
  }}>{children}</div>, document.body);
}

export function BotContactMenu({ edit, ...menu }: BotMenuPosition & { close(): void; edit(): void }) {
  return <BotContextMenu {...menu} label="Bot 操作"><button type="button" role="menuitem" onClick={edit}><PencilSimple size={16} />编辑 Bot</button></BotContextMenu>;
}
