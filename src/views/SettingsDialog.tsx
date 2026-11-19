import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, Desktop, GearSix, Info, ListChecks, Palette, Robot, PlugsConnected, Sparkle, UserCircle } from '@phosphor-icons/react';
import type { AvatarColor, ViewId } from '../../shared/contracts';
import type { CheckinProvider } from '../../shared/checkin-contracts';
import type { AppearanceController } from '../appearance';
import { navigationView, workbenchById } from '../nav';
import { Modal } from '../ui/controls';
import { SettingsView } from './SettingsView';

const SECTION_ICONS: Partial<Record<ViewId, typeof GearSix>> = {
  'settings-profile': UserCircle,
  'settings-general': GearSix,
  'settings-appearance': Palette,
  'settings-island': Desktop,
  'settings-ai': Sparkle,
  'settings-bots': Robot,
  'settings-apps': PlugsConnected,
  'settings-data': ListChecks,
  'settings-about': Info,
};

export function SettingsDialog({ view, onNavigate, close, checkinProvider, checkinReturnLabel, ...settings }: {
  view: ViewId;
  onNavigate(view: ViewId): void;
  close(): void;
  checkinProvider?: CheckinProvider;
  checkinReturnLabel?: string;
  appearance: AppearanceController;
  botManagement?: ReactNode;
  onAvatarColorChange(color: AvatarColor): void;
  onProfileNameChange(name: string): void;
}) {
  const sections = useRef<HTMLElement>(null);
  const selection = useRef<HTMLSpanElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const section = navigationView(view);
  const lastSection = useRef<ViewId | null>(null);
  const [checkinBusy, setCheckinBusy] = useState(false);

  useLayoutEffect(() => {
    const content = page.current?.parentElement;
    if (content) content.scrollTop = 0;
  }, [view]);

  useLayoutEffect(() => {
    const previous = lastSection.current;
    lastSection.current = section;
    const nav = sections.current, marker = selection.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    if (!nav || !marker || !active) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const place = (): void => {
      const { offsetWidth, offsetHeight, offsetLeft, offsetTop } = active;
      marker.style.width = `${offsetWidth}px`;
      marker.style.height = `${offsetHeight}px`;
      marker.style.transform = `translate(${offsetLeft}px, ${offsetTop}px)`;
    };
    const snap = (): void => {
      nav.dataset.selectionMotion = 'off';
      place();
      marker.getBoundingClientRect();
      delete nav.dataset.selectionMotion;
    };
    if (previous === null || motion.matches) snap();
    else place();
    nav.dataset.selectionReady = 'true';
    if (previous === null) active.focus({ preventScroll: true });
    let pageMotion: Animation | undefined;
    if (previous !== null && previous !== section && !motion.matches) {
      const views = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-settings-view]')).map(button => button.dataset.settingsView);
      const direction = Math.sign(views.indexOf(section) - views.indexOf(previous));
      const style = getComputedStyle(nav), duration = style.getPropertyValue('--settings-motion').trim();
      pageMotion = page.current?.animate([
        { opacity: .45, transform: `translateY(${direction * 8}px)` },
        { opacity: 1, transform: 'translateY(0)' },
      ], { duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000), easing: style.getPropertyValue('--ease').trim() });
    }
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    observer.observe(active);
    const reduceMotion = (): void => { if (motion.matches) { pageMotion?.cancel(); snap(); } };
    motion.addEventListener('change', reduceMotion);
    return () => {
      observer.disconnect();
      pageMotion?.cancel();
      motion.removeEventListener('change', reduceMotion);
    };
  }, [section]);

  return <Modal title="设置" className="settings-dialog" close={close} busy={checkinBusy}>
    <div className="settings-dialog-layout">
      <nav className="settings-sections" aria-label="设置分类" ref={sections}>
        <span className="settings-selection" ref={selection} aria-hidden="true" />
        {workbenchById('settings').subs.map(sub => {
          if (!sub.view) return null;
          const Icon = SECTION_ICONS[sub.view];
          return <button key={sub.view} type="button" data-settings-view={sub.view}
            aria-current={sub.view === section ? 'page' : undefined} disabled={checkinBusy}
            onClick={() => { if (sub.view !== section) onNavigate(sub.view!); }}>
            {Icon && <Icon size={20} aria-hidden="true" />}<span>{sub.label}</span>
          </button>;
        })}
      </nav>
      <div className="settings-content">
        <div className="settings-dialog-page" key={section} ref={page}>
          {checkinReturnLabel && <button type="button" className="set-btn settings-checkin-return" onClick={close} disabled={checkinBusy}><ArrowLeft size={15} />{checkinReturnLabel}</button>}
          <SettingsView view={view} {...settings} onNavigate={onNavigate} checkinProvider={checkinProvider} checkinBusy={checkinBusy}
            onCheckinConnected={checkinReturnLabel ? close : undefined} onCheckinSavingChange={setCheckinBusy} />
        </div>
      </div>
    </div>
  </Modal>;
}
