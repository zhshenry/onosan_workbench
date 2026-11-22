import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';

export function ScheduleDetailTabs<T extends string>({ selected, onTab, tabs, leaveDetails = navigate => navigate(), label = '日程详情页签' }: {
  selected: T;
  onTab(tab: T): void;
  tabs: { id: T; label: string; content(active: boolean): ReactNode }[];
  leaveDetails?(navigate: () => void): void;
  label?: string;
}) {
  const id = useId(), strip = useRef<HTMLDivElement>(null);
  const index = Math.max(0, tabs.findIndex(tab => tab.id === selected));
  function select(next: number, focus: boolean) {
    const apply = () => {
      if (index !== next) onTab(tabs[next].id);
      if (focus) strip.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
    };
    if (index === next) apply();
    else leaveDetails(apply);
  }
  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1
      : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length
      : event.key === 'ArrowRight' ? (index + 1) % tabs.length : -1;
    if (next < 0) return;
    event.preventDefault(); select(next, true);
  }
  return <>
    <div ref={strip} className="calendar-detail-tabs" role="tablist" aria-label={label} onKeyDown={navigate}>
      {tabs.map((tab, i) => <button key={tab.id} type="button" role="tab" id={id + '-tab-' + tab.id} aria-selected={i === index}
        aria-controls={id + '-panel-' + tab.id} tabIndex={i === index ? 0 : -1} onClick={() => select(i, true)}>{tab.label}</button>)}
    </div>
    {tabs.map((tab, i) => <section key={tab.id} className="calendar-detail-panel" id={id + '-panel-' + tab.id} role="tabpanel"
      aria-labelledby={id + '-tab-' + tab.id} tabIndex={0} hidden={i !== index}>{tab.content(i === index)}</section>)}
  </>;
}
