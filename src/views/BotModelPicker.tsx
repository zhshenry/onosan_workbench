import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { CaretDown, CaretRight, Check, Sparkle } from '@phosphor-icons/react';
import type { AiConfig } from '../../shared/workbench-api';

export function BotModelPicker({ config, value, disabled, saving, errorId, onChange, onSettings, children }: {
  config?: AiConfig; value: string | null; disabled: boolean; saving?: boolean; errorId?: string; children?: ReactNode;
  onChange(modelId: string): void; onSettings(): void;
}) {
  const id = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false), [expandedProviders, setExpandedProviders] = useState<string[]>([]);
  const models = config?.models ?? [];
  const current = models.find(model => model.id === value);
  const provider = config?.providers.find(item => item.id === current?.providerId);
  const title = current?.name ?? (value ? '所选模型已移除' : '未选择模型');
  const detail = current ? provider?.name : value ? '请重新选择模型' : !models.length ? '尚未配置对话模型' : undefined;

  useEffect(() => { if (disabled && open) menu.current?.hidePopover(); }, [disabled, open]);
  useLayoutEffect(() => {
    const button = trigger.current, popup = menu.current, panel = button?.closest('.bot-inspector');
    if (!open || !button || !popup || !panel) return;
    const fit = () => {
      const anchor = button.getBoundingClientRect(), bounds = panel.getBoundingClientRect();
      const above = anchor.top - bounds.top - 10, below = bounds.bottom - anchor.bottom - 10;
      const up = below < Math.min(popup.scrollHeight + 2, 360) && above > below;
      popup.toggleAttribute('data-above', up);
      popup.style.maxHeight = `${Math.max(0, Math.min(360, up ? above : below))}px`;
    };
    fit();
    const resize = new ResizeObserver(fit);
    resize.observe(panel);
    resize.observe(button);
    const scroller = button.closest('.bot-inspector-body');
    const openingScrollTop = scroller?.scrollTop;
    const dismiss = () => { if (scroller?.scrollTop !== openingScrollTop) popup.hidePopover(); };
    scroller?.addEventListener('scroll', dismiss);
    return () => { resize.disconnect(); scroller?.removeEventListener('scroll', dismiss); };
  }, [open, expandedProviders, config, value]);
  useLayoutEffect(() => {
    if (!open) return;
    const first = menu.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? menu.current?.querySelector<HTMLButtonElement>('button');
    first?.focus({ preventScroll: true });
  }, [open]);

  const close = () => { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); };
  const choose = (modelId: string) => { close(); onChange(modelId); };
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (open && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return; }
    if (!open && event.target === trigger.current) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); trigger.current.click(); }
      return;
    }
    const keys = ['ArrowDown', 'ArrowUp', 'Home', 'End'];
    if (!open || !keys.includes(event.key)) return;
    event.preventDefault();
    const buttons = Array.from(menu.current!.querySelectorAll<HTMLButtonElement>('button'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'Home') buttons[0]?.focus();
    else if (event.key === 'End') buttons.at(-1)?.focus();
    else {
      const step = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + step + buttons.length) % buttons.length]?.focus();
    }
  };

  return <div className="bot-model-field" onKeyDown={keyboard}>
    <label htmlFor={id}>模型</label>
    <button ref={trigger} id={id} type="button" className="bot-model-trigger" role="combobox" aria-label="此 Bot 的模型"
      aria-describedby={errorId ? `${id}-value ${errorId}` : `${id}-value`} aria-invalid={errorId ? true : undefined} aria-busy={saving}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={`${id}-menu`} popoverTarget={`${id}-menu`} disabled={disabled} title={[title, detail].filter(Boolean).join(' · ')}>
      <span id={`${id}-value`}><strong>{title}</strong>{detail && <small>{detail}</small>}</span><CaretDown size={13} aria-hidden="true" />
    </button>
    <div ref={menu} id={`${id}-menu`} className="bot-model-menu" popover="auto" role="dialog" aria-label="选择 Bot 模型"
      onBeforeToggle={event => {
        const next = event.newState === 'open';
        setOpen(next);
        const initial = current?.providerId ?? models[0]?.providerId;
        if (next) setExpandedProviders(initial ? [initial] : []);
      }}
      onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) menu.current?.hidePopover(); }}>
      {open && <>
        {config?.providers.map(item => {
          const choices = models.filter(model => model.providerId === item.id);
          if (!choices.length) return null;
          const expanded = expandedProviders.includes(item.id);
          return <div key={item.id} className="bot-model-group">
            <button type="button" className="bot-model-provider" aria-expanded={expanded} aria-controls={expanded ? `${id}-${item.id}` : undefined}
              onClick={() => setExpandedProviders(ids => ids.includes(item.id) ? ids.filter(key => key !== item.id) : [...ids, item.id])}>
              <CaretRight size={13} weight="bold" aria-hidden="true" /><span>{item.name}</span>
            </button>
            {expanded && <div id={`${id}-${item.id}`} role="listbox" aria-label={`${item.name}的模型`}>
              {choices.map(model => <button key={model.id} type="button" role="option" className="bot-model-option" aria-label={model.name}
                aria-selected={model.id === current?.id} onClick={() => choose(model.id)}>
                <span>{model.name}</span>{model.id === current?.id && <Check size={15} weight="bold" aria-hidden="true" />}
              </button>)}
            </div>}
          </div>;
        })}
        {!models.length && <p className="bot-model-empty">还没有配置对话模型</p>}
        <div className="bot-model-commands">
          <button type="button" onClick={() => { close(); onSettings(); }}><Sparkle size={20} aria-hidden="true" />模型配置</button>
        </div>
      </>}
    </div>
    {children}
  </div>;
}
