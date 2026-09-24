import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode, type ComponentPropsWithRef } from 'react';
import { createPortal } from 'react-dom';
import { CalendarBlank, CaretDown, CaretLeft, CaretRight, Clock, Question, X } from '@phosphor-icons/react';
import { localDay } from '../../../shared/todo-contracts';
export type SelectOption = { value: string; label: string };
export const HALF_HOUR_TIMES = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);
export function Select({ id, value, onChange, options, className, disabled = false, 'aria-label': ariaLabel, 'aria-invalid': invalid, 'aria-describedby': describedBy }: { id?: string; value: string; onChange(value: string): void; options: SelectOption[]; className?: string; disabled?: boolean; 'aria-label'?: string; 'aria-invalid'?: boolean | 'true' | 'false'; 'aria-describedby'?: string }) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  const [active, setActive] = useState(selected);
  const label = options.find(option => option.value === value)?.label ?? value;
  function pick(next: string) { if (!disabled) onChange(next); setOpen(false); trigger.current?.focus(); }
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    const list = menu.current; const button = trigger.current;
    if (!open || !list || !button) return;
    const rect = button.getBoundingClientRect();
    const boundary = list.parentElement instanceof HTMLDialogElement ? list.parentElement.getBoundingClientRect() : { top: 8, bottom: window.innerHeight - 8, left: 8, right: window.innerWidth - 8 };
    const width = rect.width;
    list.style.minWidth = `${width}px`;
    const height = list.offsetHeight;
    let top = rect.bottom + 4;
    if (top + height > boundary.bottom) top = Math.max(boundary.top, rect.top - height - 4);
    let left = rect.left;
    if (left + width > boundary.right) left = Math.max(boundary.left, boundary.right - width);
    list.style.top = `${top}px`; list.style.left = `${left}px`;
    list.classList.toggle('is-up', top < rect.bottom);
    scrollChild(`${listId}-${active}`, '.select-menu');
  }, [open, options, value, active, listId]);
  useEffect(() => {
    if (!open) return;
    setActive(selected);
    function onPointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || menu.current?.contains(node)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus();
    }
    function dismiss() { setOpen(false); }
    const openedAt = trigger.current?.getBoundingClientRect();
    function onScroll(event: Event) {
      const node = event.target;
      if (node instanceof Node && menu.current?.contains(node)) return;
      const current = trigger.current?.getBoundingClientRect();
      // A scroll queued before opening must not dismiss a correctly positioned menu.
      if (openedAt && current && Math.abs(current.top - openedAt.top) < 1 && Math.abs(current.left - openedAt.left) < 1) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, selected]);
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); setActive(selected); setOpen(true); return;
    }
    if (!open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive(index => Math.min(options.length - 1, index + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive(index => Math.max(0, index - 1)); }
    else if (event.key === 'Home') { event.preventDefault(); setActive(0); }
    else if (event.key === 'End') { event.preventDefault(); setActive(options.length - 1); }
    else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(options[active]?.value ?? value); }
    else if (event.key === 'Tab') setOpen(false);
  }
  return <div ref={root} className={`select${className ? ` ${className}` : ''}`}>
    <button type="button" ref={trigger} id={id} className="select-trigger" role="combobox" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId} aria-activedescendant={open ? `${listId}-${active}` : undefined} aria-invalid={invalid} aria-describedby={describedBy} disabled={disabled} onClick={() => setOpen(current => !current)} onKeyDown={onTriggerKeyDown}>
      <span>{label}</span><CaretDown size={12} weight="bold" />
    </button>
    {open ? createPortal(<div ref={menu} id={listId} className="select-menu" role="listbox" aria-label={ariaLabel}>
      {options.map((option, index) => <div key={option.value} id={`${listId}-${index}`} role="option" className={`select-option${index === active ? ' is-active' : ''}`} aria-selected={option.value === value} onMouseEnter={() => setActive(index)} onMouseDown={event => event.preventDefault()} onClick={() => pick(option.value)}>{option.label}</div>)}
    </div>, trigger.current?.closest('dialog') ?? document.body) : null}
  </div>;
}
export function Segmented({ value, onChange, options, 'aria-label': ariaLabel }: { value: string; onChange(value: string): void; options: (SelectOption & { icon?: ReactNode })[]; 'aria-label'?: string }) {
  const root = useRef<HTMLDivElement>(null);
  const selected = Math.max(0, options.findIndex(option => option.value === value));
  function move(delta: number) {
    const index = (selected + delta + options.length) % options.length;
    const next = options[index];
    if (next && next.value !== value) onChange(next.value);
    root.current?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[index]?.focus();
  }
  return <div ref={root} className="segmented" style={{ '--segment': selected, '--segment-count': Math.max(options.length, 1) } as CSSProperties} role="radiogroup" aria-label={ariaLabel} onKeyDown={event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); move(1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); move(-1); }
  }}>
    {options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} tabIndex={option.value === value ? 0 : -1} onClick={() => { if (option.value !== value) onChange(option.value); }}>{option.icon}{option.label}</button>)}
  </div>;
}
function placePopover(list: HTMLElement, button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  const parent = list.parentElement;
  const boundary = parent instanceof HTMLDialogElement ? parent.getBoundingClientRect() : { top: 8, bottom: window.innerHeight - 8, left: 8, right: window.innerWidth - 8 };
  const gap = 4;
  const below = Math.max(0, boundary.bottom - rect.bottom - gap);
  const above = Math.max(0, rect.top - boundary.top - gap);
  list.style.height = '';
  list.style.maxHeight = '';
  const natural = list.scrollHeight;
  const openUp = below < natural && above > below;
  const size = Math.min(natural, openUp ? above : below);
  list.style.maxHeight = `${size}px`;
  list.style.height = `${size}px`;
  list.style.top = '0px';
  list.style.left = '0px';
  const origin = list.getBoundingClientRect();
  const top = openUp ? rect.top - origin.height - gap : rect.bottom + gap;
  let left = rect.left;
  if (left + origin.width > boundary.right) left = Math.max(boundary.left, boundary.right - origin.width);
  list.style.top = `${top - origin.top}px`;
  list.style.left = `${left - origin.left}px`;
  list.classList.toggle('is-up', openUp);
}
function scrollChild(id: string, parentSelector: string) {
  const el = document.getElementById(id);
  const scroller = el?.closest(parentSelector);
  if (!(el instanceof HTMLElement) || !(scroller instanceof HTMLElement)) return;
  const elRect = el.getBoundingClientRect();
  const box = scroller.getBoundingClientRect();
  if (elRect.top < box.top) scroller.scrollTop -= box.top - elRect.top;
  else if (elRect.bottom > box.bottom) scroller.scrollTop += elRect.bottom - box.bottom;
}
const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日'];
function padDay(n: number) { return String(n).padStart(2, '0'); }
function toIso(y: number, m: number, d: number) { return `${y}-${padDay(m)}-${padDay(d)}`; }
function parseIso(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const y = Number(match[1]), m = Number(match[2]), d = Number(match[3]);
  if (localDay(new Date(y, m - 1, d)) !== value) return null;
  return { y, m, d };
}
function shiftMonth(y: number, m: number, delta: number) {
  const date = new Date(y, m - 1 + delta, 1);
  return { y: date.getFullYear(), m: date.getMonth() + 1 };
}
function shiftIso(value: string, days: number) {
  const parsed = parseIso(value) ?? parseIso(localDay())!;
  const date = new Date(parsed.y, parsed.m - 1, parsed.d + days);
  return toIso(date.getFullYear(), date.getMonth() + 1, date.getDate());
}
function monthCells(y: number, m: number) {
  const start = (new Date(y, m - 1, 1).getDay() + 6) % 7;
  const count = new Date(y, m, 0).getDate();
  const prev = shiftMonth(y, m, -1);
  const prevCount = new Date(prev.y, prev.m, 0).getDate();
  const next = shiftMonth(y, m, 1);
  const items: { iso: string; day: number; outside: boolean }[] = [];
  for (let i = 0; i < start; i++) {
    const day = prevCount - start + i + 1;
    items.push({ iso: toIso(prev.y, prev.m, day), day, outside: true });
  }
  for (let day = 1; day <= count; day++) items.push({ iso: toIso(y, m, day), day, outside: false });
  while (items.length % 7 !== 0) {
    const day = items.length - start - count + 1;
    items.push({ iso: toIso(next.y, next.m, day), day, outside: true });
  }
  return items;
}
export function DatePicker({ id, value, onChange, 'aria-invalid': invalid, 'aria-describedby': describedBy }: {
  id?: string; value: string; onChange(value: string): void; 'aria-invalid'?: boolean | 'true' | 'false'; 'aria-describedby'?: string;
}) {
  const gridId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = parseIso(value);
  const today = localDay();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => selected ? { y: selected.y, m: selected.m } : (() => { const now = parseIso(today)!; return { y: now.y, m: now.m }; })());
  const [cursor, setCursor] = useState(value || today);
  function close() { setOpen(false); trigger.current?.focus(); }
  function pick(next: string) { onChange(next); close(); }
  function show(next = !open) {
    if (next) {
      const parsed = parseIso(value);
      const now = parseIso(today)!;
      setView(parsed ? { y: parsed.y, m: parsed.m } : { y: now.y, m: now.m });
      setCursor(value || today);
    }
    setOpen(next);
  }
  useLayoutEffect(() => {
    const list = menu.current; const button = trigger.current;
    if (!open || !list || !button) return;
    placePopover(list, button);
    document.getElementById(`${gridId}-${cursor}`)?.focus();
  }, [open, view, cursor, gridId]);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || menu.current?.contains(node)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      const target = event.target;
      if (target instanceof HTMLElement && menu.current?.contains(target) && target.closest('.date-head, .date-menu-actions')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); setCursor(current => { const next = shiftIso(current, -1); const parsed = parseIso(next)!; setView({ y: parsed.y, m: parsed.m }); return next; }); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setCursor(current => { const next = shiftIso(current, 1); const parsed = parseIso(next)!; setView({ y: parsed.y, m: parsed.m }); return next; }); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setCursor(current => { const next = shiftIso(current, -7); const parsed = parseIso(next)!; setView({ y: parsed.y, m: parsed.m }); return next; }); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); setCursor(current => { const next = shiftIso(current, 7); const parsed = parseIso(next)!; setView({ y: parsed.y, m: parsed.m }); return next; }); }
      else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); pick(cursor); }
      else if (event.key === 'PageUp') { event.preventDefault(); setCursor(current => { const parsed = parseIso(current) ?? parseIso(today)!; const next = shiftMonth(parsed.y, parsed.m, -1); const last = new Date(next.y, next.m, 0).getDate(); const iso = toIso(next.y, next.m, Math.min(parsed.d, last)); setView({ y: next.y, m: next.m }); return iso; }); }
      else if (event.key === 'PageDown') { event.preventDefault(); setCursor(current => { const parsed = parseIso(current) ?? parseIso(today)!; const next = shiftMonth(parsed.y, parsed.m, 1); const last = new Date(next.y, next.m, 0).getDate(); const iso = toIso(next.y, next.m, Math.min(parsed.d, last)); setView({ y: next.y, m: next.m }); return iso; }); }
    }
    function dismiss() { setOpen(false); }
    function onScroll(event: Event) {
      const node = event.target;
      if (node instanceof Node && menu.current?.contains(node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, cursor]);
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); show(true);
    }
  }
  const parsed = selected;
  return <div ref={root} className="date-picker">
    <button type="button" ref={trigger} id={id} className="select-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? gridId : undefined} aria-invalid={invalid} aria-describedby={describedBy} onClick={() => show()} onKeyDown={onTriggerKeyDown}>
      <span>{parsed ? `${parsed.y}年${parsed.m}月${parsed.d}日` : '选择日期'}</span><CalendarBlank size={14} />
    </button>
    {open ? createPortal(<div ref={menu} className="date-menu" role="dialog" aria-label="选择日期">
      <div className="date-head">
        <button type="button" aria-label="上个月" onClick={() => setView(current => { const next = shiftMonth(current.y, current.m, -1); setCursor(iso => { const parsed = parseIso(iso) ?? parseIso(today)!; return toIso(next.y, next.m, Math.min(parsed.d, new Date(next.y, next.m, 0).getDate())); }); return next; })}><CaretLeft size={14} weight="bold" /></button>
        <span>{view.y}年{view.m}月</span>
        <button type="button" aria-label="下个月" onClick={() => setView(current => { const next = shiftMonth(current.y, current.m, 1); setCursor(iso => { const parsed = parseIso(iso) ?? parseIso(today)!; return toIso(next.y, next.m, Math.min(parsed.d, new Date(next.y, next.m, 0).getDate())); }); return next; })}><CaretRight size={14} weight="bold" /></button>
      </div>
      <div className="date-weekdays">{WEEKDAYS.map(day => <span key={day}>{day}</span>)}</div>
      <div id={gridId} className="date-grid" role="grid">
        {monthCells(view.y, view.m).map(cell => <button key={cell.iso} type="button" id={`${gridId}-${cell.iso}`} role="gridcell" aria-label={cell.iso} aria-selected={cell.iso === value} className={[cell.outside && 'is-outside', cell.iso === today && 'is-today', cell.iso === value && 'is-selected', cell.iso === cursor && 'is-active'].filter(Boolean).join(' ')} onMouseEnter={() => setCursor(cell.iso)} onClick={() => pick(cell.iso)}>{cell.day}</button>)}
      </div>
      <div className="date-menu-actions">
        <button type="button" onClick={() => pick('')}>清除</button>
        <button type="button" onClick={() => pick(today)}>今天</button>
      </div>
    </div>, trigger.current?.closest('dialog') ?? document.body) : null}
  </div>;
}
const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const MINUTES = Array.from({ length: 60 }, (_, minute) => minute);
function parseTime(value: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]), m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}
function formatTime(h: number, m: number) { return `${padDay(h)}:${padDay(m)}`; }
function nowTime() { const d = new Date(); return formatTime(d.getHours(), d.getMinutes()); }
export function TimePicker({ id, value, onChange, 'aria-invalid': invalid, 'aria-describedby': describedBy }: {
  id?: string; value: string; onChange(value: string): void; 'aria-invalid'?: boolean | 'true' | 'false'; 'aria-describedby'?: string;
}) {
  const listId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const selected = parseTime(value);
  const [open, setOpen] = useState(false);
  const [cursorH, setCursorH] = useState(selected?.h ?? new Date().getHours());
  const [cursorM, setCursorM] = useState(selected?.m ?? new Date().getMinutes());
  const [focusCol, setFocusCol] = useState<'h' | 'm'>('h');
  function close() { setOpen(false); trigger.current?.focus(); }
  function commit(h: number, m: number, dismiss = false) {
    onChange(formatTime(h, m));
    setCursorH(h); setCursorM(m);
    if (dismiss) close();
  }
  function show(next = !open) {
    if (next) {
      const parsed = parseTime(value);
      const now = new Date();
      setCursorH(parsed?.h ?? now.getHours());
      setCursorM(parsed?.m ?? now.getMinutes());
      setFocusCol('h');
    }
    setOpen(next);
  }
  useLayoutEffect(() => {
    const list = menu.current; const button = trigger.current;
    if (!open || !list || !button) return;
    placePopover(list, button);
    scrollChild(`${listId}-h-${cursorH}`, '.time-col');
    scrollChild(`${listId}-m-${cursorM}`, '.time-col');
    document.getElementById(`${listId}-${focusCol}-${focusCol === 'h' ? cursorH : cursorM}`)?.focus({ preventScroll: true });
  }, [open, cursorH, cursorM, focusCol, listId]);
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      const node = event.target as Node;
      if (root.current?.contains(node) || menu.current?.contains(node)) return;
      setOpen(false);
    }
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
      const target = event.target;
      if (target instanceof HTMLElement && menu.current?.contains(target) && target.closest('.date-menu-actions')) return;
      if (event.key === 'ArrowLeft') { event.preventDefault(); setFocusCol('h'); }
      else if (event.key === 'ArrowRight') { event.preventDefault(); setFocusCol('m'); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); if (focusCol === 'h') setCursorH(h => (h + 23) % 24); else setCursorM(m => (m + 59) % 60); }
      else if (event.key === 'ArrowDown') { event.preventDefault(); if (focusCol === 'h') setCursorH(h => (h + 1) % 24); else setCursorM(m => (m + 1) % 60); }
      else if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        if (focusCol === 'h') { commit(cursorH, selected?.m ?? cursorM); setFocusCol('m'); }
        else commit(selected?.h ?? cursorH, cursorM, true);
      }
    }
    function dismiss() { setOpen(false); }
    function onScroll(event: Event) {
      const node = event.target;
      if (node instanceof Node && menu.current?.contains(node)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open, cursorH, cursorM, focusCol, selected?.h, selected?.m]);
  function onTriggerKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!open && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault(); show(true);
    }
  }
  return <div ref={root} className="time-picker">
    <button type="button" ref={trigger} id={id} className="select-trigger" aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? listId : undefined} aria-invalid={invalid} aria-describedby={describedBy} onClick={() => show()} onKeyDown={onTriggerKeyDown}>
      <span>{selected ? formatTime(selected.h, selected.m) : '选择时间'}</span><Clock size={14} />
    </button>
    {open ? createPortal(<div ref={menu} id={listId} className="time-menu" role="dialog" aria-label="选择时间">
      <div className="time-cols">
        <div className="time-col-wrap">
          <span className="time-col-label">时</span>
          <div className="time-col" role="listbox" aria-label="小时">
            {HOURS.map(hour => <button key={hour} type="button" id={`${listId}-h-${hour}`} role="option" aria-label={`${padDay(hour)}时`} aria-selected={selected?.h === hour} className={[selected?.h === hour && 'is-selected', focusCol === 'h' && cursorH === hour && 'is-active'].filter(Boolean).join(' ')} onClick={() => commit(hour, selected?.m ?? cursorM)}>{padDay(hour)}</button>)}
          </div>
        </div>
        <div className="time-col-wrap">
          <span className="time-col-label">分</span>
          <div className="time-col" role="listbox" aria-label="分钟">
            {MINUTES.map(minute => <button key={minute} type="button" id={`${listId}-m-${minute}`} role="option" aria-label={`${padDay(minute)}分`} aria-selected={selected?.m === minute} className={[selected?.m === minute && 'is-selected', focusCol === 'm' && cursorM === minute && 'is-active'].filter(Boolean).join(' ')} onClick={() => commit(selected?.h ?? cursorH, minute, true)}>{padDay(minute)}</button>)}
          </div>
        </div>
      </div>
      <div className="date-menu-actions">
        <button type="button" onClick={() => { onChange(''); close(); }}>清除</button>
        <button type="button" onClick={() => { onChange(nowTime()); close(); }}>现在</button>
      </div>
    </div>, trigger.current?.closest('dialog') ?? document.body) : null}
  </div>;
}
export function BrandMark() {
  return (
    <svg viewBox="0 0 24 24" focusable="false">
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <g className="brand-logo-orbit">
        <circle cx="17.15" cy="6.85" r="2.15" fill="var(--accent)" />
      </g>
    </svg>
  );
}
export function IconButton({ label, children, onClick, className, ...props }: ComponentPropsWithRef<'button'> & { label: string }) {
  return <button type="button" className={`icon-button${className ? ` ${className}` : ''}`} aria-label={label} title={label} onClick={onClick} {...props}>{children}</button>;
}
export function HelpTip({ label, children, place = 'down' }: { label: string; children: string; place?: 'down' | 'up' }) {
  const id = useId();
  const hostRef = useRef<HTMLSpanElement>(null);
  const [bubbleStyle, setBubbleStyle] = useState<CSSProperties>({});
  // Bubbles are clipped by the settings modal (overflow-y: auto), so fit them inside
  // its padding box: keep the default left anchor while there is room, otherwise
  // anchor from the button's right edge and grow leftward. Re-measured lazily on
  // hover/focus so window resizes after mount are corrected.
  const fit = useCallback(() => {
    const host = hostRef.current;
    if (!host) return;
    const scope = host.closest('.modal');
    const scopeRect = scope?.getBoundingClientRect();
    const rightLimit = scopeRect ? scopeRect.right - 10 : window.innerWidth - 24;
    const leftLimit = scopeRect ? scopeRect.left + 10 : 24;
    const box = host.getBoundingClientRect();
    const natural = 240; // keep in sync with .help-tip-bubble max-width in styles.css
    const fromLeft = rightLimit - box.left;
    const fromRight = box.right - leftLimit;
    if (fromLeft >= natural) setBubbleStyle({});
    else if (fromLeft >= 160) setBubbleStyle({ maxWidth: fromLeft });
    else setBubbleStyle({ maxWidth: Math.min(natural, fromRight), left: 'auto', right: 0 });
  }, []);
  useLayoutEffect(fit, [fit]);
  return <span ref={hostRef} className={`help-tip${place === 'up' ? ' is-up' : ''}`}>
    <button type="button" className="help-tip-button" aria-label={label} aria-describedby={id} onPointerEnter={fit} onFocus={fit}><Question size={15} /></button>
    <span id={id} role="tooltip" className="help-tip-bubble" style={bubbleStyle}>{children}</span>
  </span>;
}
export function Modal({ title, children, close, dirty = false, subhead, headingExtra, titleIcon, closeText, className }: { title: string; children: ReactNode; close(): void; dirty?: boolean; subhead?: ReactNode; headingExtra?: ReactNode; titleIcon?: ReactNode; closeText?: string; className?: string }) {
  const ref = useRef<HTMLDialogElement>(null);
  const discard = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = ref.current!;
    const previous = document.activeElement;
    element.showModal();
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus(); };
  }, []);
  function requestClose() { if (dirty) discard.current?.showModal(); else close(); }
  return <>
    <dialog ref={ref} className={`modal${className ? ` ${className}` : ''}`} aria-label={title} onCancel={event => { event.preventDefault(); requestClose(); }}>
      <header className="modal-heading">
        <div className="modal-heading-row"><div className="modal-heading-lead"><h2>{titleIcon ? <span className="modal-title-icon" aria-hidden="true">{titleIcon}</span> : null}{title}</h2>{headingExtra}</div>{closeText ? <button type="button" className="modal-text-close" onClick={requestClose}>{closeText}</button> : <IconButton label="关闭" onClick={requestClose}><X size={20} /></IconButton>}</div>
        {subhead}
      </header>
      {children}
    </dialog>
    <dialog ref={discard} className="modal confirm" aria-label="放弃未保存的修改" onCancel={() => discard.current?.close()}>
      <h2>放弃未保存的修改？</h2><p>已填写的内容尚未保存。</p>
      <div className="actions"><button autoFocus onClick={() => discard.current?.close()}>继续编辑</button><button className="danger" onClick={close}>放弃修改</button></div>
    </dialog>
  </>;
}
export function errorText(error: unknown): string {
  return (error instanceof Error ? error.message : '操作未完成，请重试').replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
}
export { timeText, dateText, dateTimeText, scheduleStamp, stampLabel, isOverdue } from '../../../shared/todo-format';
