import { Children, useId, useState, type HTMLAttributes, type ReactNode, type Ref } from 'react';
import { CaretDown, CheckCircle, Info } from '@phosphor-icons/react';

export type BotOperationTone = 'neutral' | 'pending' | 'active' | 'success' | 'error';
type CardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  label: string;
  summary?: ReactNode;
  icon: ReactNode;
  status: string;
  tone?: BotOperationTone;
  action?: ReactNode;
  initialOpen?: boolean;
  collapsible?: boolean;
  ref?: Ref<HTMLElement>;
};

export function BotOperationCard({ label, summary, icon, status, tone = 'neutral', action, initialOpen = false,
  collapsible = true, children, className, ref, ...attributes }: CardProps) {
  const detailId = useId();
  const [expanded, setExpanded] = useState<boolean>();
  const open = !collapsible || (expanded ?? initialOpen);
  const hasDetails = Children.toArray(children).some(child => child !== '');
  const target = <><span className="bot-operation-icon" aria-hidden="true">{icon}</span>
    <span className="bot-operation-copy">
      <strong title={hasDetails ? undefined : label}>{label}</strong>
      {summary && <small title={!hasDetails && typeof summary === 'string' ? summary : undefined}>{summary}</small>}
    </span></>;
  const badge = <span className="bot-operation-status" role="status">{status}</span>;
  return <section {...attributes} ref={ref} className={['bot-operation-card', className].filter(Boolean).join(' ')} data-tone={tone}>
    <header className="bot-operation-header">
      {hasDetails && collapsible ? <button type="button" className="bot-operation-target" aria-expanded={open} aria-controls={detailId}
        aria-label={(open ? '收起 ' : '查看 ') + label} onClick={() => setExpanded(!open)}>{target}{!action && badge}<CaretDown className="bot-operation-caret" size={13} aria-hidden="true" /></button>
        : <div className="bot-operation-target">{target}{!action && badge}</div>}
      {action && <div className="bot-operation-actions">{badge}{action}</div>}
    </header>
    {hasDetails && <div id={detailId} className="bot-operation-details" hidden={!open} inert={!open}>{children}</div>}
  </section>;
}

export function BotOperationSubject({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="bot-operation-subject"><strong>{title}</strong>{children && <div>{children}</div>}</div>;
}

export function BotOperationReceipt({ children, neutral = false }: { children: ReactNode; neutral?: boolean }) {
  const Icon = neutral ? Info : CheckCircle;
  return <p className="bot-operation-receipt" data-neutral={neutral || undefined}>
    <Icon size={16} aria-hidden="true" /><span>{children}</span>
  </p>;
}
