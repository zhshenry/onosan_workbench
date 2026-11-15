import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { DEFAULT_APPEARANCE, type AppearanceSettings, type WindowLight } from '../shared/contracts';

export function pickAppearance(settings: AppearanceSettings): AppearanceSettings {
  return { uiTheme: settings.uiTheme, navigationStyle: settings.navigationStyle,
    glassIntensity: settings.glassIntensity };
}

function windowLightAt(now: Date): WindowLight {
  const hour = now.getHours();
  return hour >= 6 && hour < 12 ? 'morning' : hour >= 12 && hour < 18 ? 'afternoon' : 'dusk';
}

export interface AppearanceController {
  value: AppearanceSettings;
  windowLight: WindowLight;
  ready: boolean;
  status: 'loading' | 'saving' | 'saved' | 'error';
  error: string;
  change(patch: Partial<AppearanceSettings>): void;
  retry(): void;
}

/** Owned by App: opening/closing settings never cancels a save or remounts a workspace. */
export function useAppearanceSettings(): AppearanceController {
  const [value, setValue] = useState(DEFAULT_APPEARANCE);
  const [windowLight, setWindowLight] = useState(() => windowLightAt(new Date()));
  const [status, setStatus] = useState<AppearanceController['status']>('loading');
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loaded = useRef(false);
  const desired = useRef(DEFAULT_APPEARANCE);
  const confirmed = useRef(DEFAULT_APPEARANCE);
  const failed = useRef(DEFAULT_APPEARANCE);
  const revision = useRef(0);
  const queue = useRef(Promise.resolve());

  useEffect(() => {
    let timer: number | undefined;
    const syncClock = (): void => {
      window.clearTimeout(timer);
      setWindowLight(windowLightAt(new Date()));
      // Align to minute boundaries; always read wall time again after wake or clock changes.
      timer = window.setTimeout(syncClock, 60_000 - Date.now() % 60_000);
    };
    syncClock();
    window.addEventListener('focus', syncClock);
    document.addEventListener('visibilitychange', syncClock);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', syncClock);
      document.removeEventListener('visibilitychange', syncClock);
    };
  }, []);

  useEffect(() => {
    let active = true;
    void window.workbench.settings.get().then(settings => {
      if (!active) return;
      if (!settings) { setStatus('error'); setError('外观设置读取失败，请重试。'); return; }
      desired.current = confirmed.current = pickAppearance(settings);
      loaded.current = true;
      setValue(confirmed.current);
      setStatus('saved');
      setError('');
    }, () => {
      if (!active) return;
      setStatus('error');
      setError('外观设置读取失败，请重试。');
    });
    return () => { active = false; };
  }, [loadAttempt]);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = value.uiTheme;
    root.dataset.navigation = value.navigationStyle;
    root.dataset.glass = value.glassIntensity;
    root.dataset.windowLight = windowLight;
  }, [value, windowLight]);

  const change = (patch: Partial<AppearanceSettings>): void => {
    if (!loaded.current) return;
    const snapshot = { ...desired.current, ...patch };
    desired.current = snapshot;
    const request = ++revision.current;
    setValue(snapshot);
    setStatus('saving');
    setError('');
    // Serialize complete appearance snapshots. Late results cannot overwrite a newer selection.
    queue.current = queue.current.then(async () => {
      try {
        const saved = await window.workbench.settings.patch(snapshot);
        if (!saved) throw new Error('Settings save returned no value');
        const next = pickAppearance(saved);
        confirmed.current = next;
        if (request !== revision.current) return;
        desired.current = next;
        setValue(next);
        setStatus('saved');
      } catch {
        if (request !== revision.current) return;
        failed.current = snapshot;
        desired.current = confirmed.current;
        setValue(confirmed.current);
        setStatus('error');
        setError('外观未能保存，已恢复上次保存的设置。');
      }
    });
  };
  return { value, windowLight, ready: loaded.current, status, error, change, retry: () => {
    if (loaded.current) change(failed.current);
    else { setStatus('loading'); setError(''); setLoadAttempt(attempt => attempt + 1); }
  } };
}
