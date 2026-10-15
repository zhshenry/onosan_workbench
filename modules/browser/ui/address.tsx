import { useEffect, useId, useMemo, useState, type RefObject } from 'react';
import { LockSimple, X } from '@phosphor-icons/react';
import type { BrowserWorkspaceState } from '../../../shared/browser-automation-contracts';
import { browserAddressTarget, filterBrowserHistory } from '../../../shared/browser-history';

export function BrowserAddress({ workspace, value, onChange, onGo, readOnly, inputRef }: {
  workspace: string; value: string; onChange(value: string): void; onGo(value: string): void; readOnly: boolean; inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [open, setOpen] = useState(false), [selected, setSelected] = useState(-1), [history, setHistory] = useState<BrowserWorkspaceState['history']>([]);
  const listId = useId();
  useEffect(() => {
    if (!open || !window.workbench.browserAutomation) return;
    let mounted = true;
    void window.workbench.browserAutomation.state(workspace).then(state => { if (mounted) setHistory(state.history); }, () => { if (mounted) setHistory([]); });
    return () => { mounted = false; };
  }, [open, workspace]);
  const suggestions = useMemo(() => {
    const seen = new Set<string>();
    return filterBrowserHistory(history, value).filter(item => !seen.has(item.url) && !!seen.add(item.url)).slice(0, 8);
  }, [history, value]);
  const target = browserAddressTarget(value);
  const options = [...suggestions.map(item => ({ url: item.url, title: item.title || item.url })), ...(value.trim() && target ? [{ url: target, title: target.startsWith('https://www.google.com/search?') ? `用 Google 搜索：${value}` : `打开：${value}` }] : [])];
  const choose = (url: string) => { setOpen(false); setSelected(-1); onGo(url); };
  return <div className="mbp-address-box">
    <div className="mbp-addr"><LockSimple size={13} weight="bold" />
      <input ref={inputRef} aria-label="地址" role="combobox" aria-autocomplete="list" aria-expanded={open && options.length > 0} aria-controls={listId} aria-activedescendant={open && selected >= 0 && selected < options.length ? `${listId}-${selected}` : undefined}
        placeholder="搜索或输入网址" value={value} readOnly={readOnly}
        onFocus={() => { if (!readOnly) setOpen(true); }} onBlur={() => { setOpen(false); setSelected(-1); }}
        onChange={event => { onChange(event.target.value); setSelected(-1); setOpen(true); }}
        onKeyDown={event => {
          if (readOnly || event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { setOpen(false); setSelected(-1); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setSelected(previous => !options.length ? -1 : previous < 0 ? event.key === 'ArrowDown' ? 0 : options.length - 1 : (previous + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length); }
          if (event.key === 'Enter') { event.preventDefault(); if (open && selected >= 0 && options[selected]) choose(options[selected].url); else { setOpen(false); onGo(value); } }
        }} />
      {!readOnly && value && <button className="mbp-address-clear" aria-label="清空地址或搜索" title="清空" onMouseDown={event => event.preventDefault()} onClick={() => { onChange(''); setSelected(-1); inputRef.current?.focus(); setOpen(true); }}><X size={13} /></button>}
    </div>
    {open && !!options.length && <div id={listId} role="listbox" aria-label="地址与历史建议" className="mbp-address-suggestions">{options.map((item, index) => <button key={`${index}:${item.url}`} id={`${listId}-${index}`} role="option" aria-selected={selected === index} onMouseDown={event => event.preventDefault()} onClick={() => choose(item.url)}><strong>{item.title}</strong><span>{item.url}</span></button>)}</div>}
  </div>;
}
