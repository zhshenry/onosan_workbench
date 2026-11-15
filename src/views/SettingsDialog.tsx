import { useLayoutEffect, useRef } from 'react';
import { Desktop, GearSix, Info, ListChecks, Sparkle, UserCircle } from '@phosphor-icons/react';
import type { AvatarColor, UiTheme, ViewId } from '../../shared/contracts';
import { workbenchById } from '../nav';
import { Modal } from '../ui/controls';
import { SettingsView } from './SettingsView';

const SECTION_ICONS: Partial<Record<ViewId, typeof GearSix>> = {
  'settings-profile': UserCircle,
  'settings-general': GearSix,
  'settings-island': Desktop,
  'settings-ai': Sparkle,
  'settings-data': ListChecks,
  'settings-about': Info,
};

export function SettingsDialog({ view, onNavigate, close, ...settings }: {
  view: ViewId;
  onNavigate(view: ViewId): void;
  close(): void;
  uiTheme: UiTheme;
  onUiThemeChange(theme: UiTheme): void;
  onAvatarColorChange(color: AvatarColor): void;
  onProfileNameChange(name: string): void;
}) {
  const sections = useRef<HTMLElement>(null);
  const selection = useRef<HTMLSpanElement>(null);
  const page = useRef<HTMLDivElement>(null);
  const lastView = useRef<ViewId | null>(null);

  useLayoutEffect(() => {
    const previous = lastView.current;
    lastView.current = view;
    const content = page.current?.parentElement;
    if (content) content.scrollTop = 0;
    const nav = sections.current, marker = selection.current;
    const active = nav?.querySelector<HTMLButtonElement>('[aria-current="page"]');
    if (!nav || !marker || !active) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const place = (): void => {
      marker.style.width = `${active.offsetWidth}px`;
      marker.style.height = `${active.offsetHeight}px`;
      marker.style.transform = `translate(${active.offsetLeft}px, ${active.offsetTop}px)`;
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
    if (previous !== null && previous !== view && !motion.matches) {
      const views = Array.from(nav.querySelectorAll<HTMLButtonElement>('[data-settings-view]')).map(button => button.dataset.settingsView);
      const direction = Math.sign(views.indexOf(view) - views.indexOf(previous));
      const style = getComputedStyle(nav), duration = style.getPropertyValue('--settings-motion').trim();
      pageMotion = page.current?.animate([
        { opacity: 0, transform: `translateY(${direction * 16}px)` },
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
  }, [view]);

  return <Modal title="设置" className="settings-dialog" close={close}>
    <div className="settings-dialog-layout">
      <nav className="settings-sections" aria-label="设置分类" ref={sections}>
        <span className="settings-selection" ref={selection} aria-hidden="true" />
        {workbenchById('settings').subs.map(sub => {
          if (!sub.view) return null;
          const Icon = SECTION_ICONS[sub.view];
          return <button key={sub.view} type="button" data-settings-view={sub.view}
            aria-current={sub.view === view ? 'page' : undefined} onClick={() => onNavigate(sub.view!)}>
            {Icon && <Icon size={20} aria-hidden="true" />}<span>{sub.label}</span>
          </button>;
        })}
      </nav>
      <div className="settings-content">
        <div className="settings-dialog-page" key={view} ref={page}>
          <SettingsView view={view} {...settings} />
        </div>
      </div>
    </div>
  </Modal>;
}
