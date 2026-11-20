import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';

export function ScheduleDetailTabs({ initialTab, tabs, leaveDetails }: {
  initialTab: string;
  tabs: { id: string; label: string; content(active: boolean): ReactNode }[];
  leaveDetails(navigate: () => void): void;
}) {
  const id = useId(), strip = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState(initialTab);
  const index = Math.max(0, tabs.findIndex(tab => tab.id === selection));
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault();
    leaveDetails(() => {
      setSelection(tabs[next].id);
      strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    });
  }
  return <>
    <div ref={strip} className="calendar-detail-tabs" role="tablist" aria-label="日程详情页签" onKeyDown={navigate}>
      {tabs.map((tab, i) => <button key={tab.id} type="button" role="tab" id={id + '-tab-' + tab.id} aria-selected={i === index}
        aria-controls={id + '-panel-' + tab.id} tabIndex={i === index ? 0 : -1} onClick={() => leaveDetails(() => setSelection(tab.id))}>{tab.label}</button>)}
    </div>
    {tabs.map((tab, i) => <section key={tab.id} className="calendar-detail-panel" id={id + '-panel-' + tab.id} role="tabpanel"
      aria-labelledby={id + '-tab-' + tab.id} tabIndex={0} hidden={i !== index}>{tab.content(i === index)}</section>)}
  </>;
}
