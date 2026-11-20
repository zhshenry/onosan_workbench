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
  const [displayed, setDisplayed] = useState({ view, checkinProvider, checkinReturnLabel });
  const [checkinBusy, setCheckinBusy] = useState(false);
  const displayedSection = navigationView(displayed.view);
  const leaving = displayedSection !== section;

  useLayoutEffect(() => {
    if (displayed.view === view && displayed.checkinProvider === checkinProvider && displayed.checkinReturnLabel === checkinReturnLabel) return;
    const fade = leaving ? page.current?.getAnimations?.().find(animation =>
      'animationName' in animation && animation.animationName === 'settings-page-out') : undefined;
    let current = true;
    const showSelected = (): void => { if (current) setDisplayed({ view, checkinProvider, checkinReturnLabel }); };
    if (!fade) { showSelected(); return; }
    void fade.finished.then(showSelected, showSelected);
    return () => { current = false; };
  }, [view, checkinProvider, checkinReturnLabel, displayed, leaving]);

  useLayoutEffect(() => {
    const content = page.current?.parentElement;
    if (content) content.scrollTop = 0;
  }, [displayed.view]);

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
    const observer = new ResizeObserver(place);
    observer.observe(nav);
    observer.observe(active);
    const reduceMotion = (): void => { if (motion.matches) snap(); };
    motion.addEventListener('change', reduceMotion);
    return () => {
      observer.disconnect();
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
        <div className="settings-dialog-page" key={displayedSection} ref={page} data-leaving={leaving || undefined} inert={leaving}>
          {displayed.checkinReturnLabel && <button type="button" className="set-btn settings-checkin-return" onClick={close} disabled={checkinBusy}><ArrowLeft size={15} />{displayed.checkinReturnLabel}</button>}
          <SettingsView view={displayed.view} {...settings} onNavigate={onNavigate} checkinProvider={displayed.checkinProvider} checkinBusy={checkinBusy}
            onCheckinConnected={displayed.checkinReturnLabel ? close : undefined} onCheckinSavingChange={setCheckinBusy} />
        </div>
      </div>
    </div>
  </Modal>;
}
