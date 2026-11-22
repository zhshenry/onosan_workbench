import { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { DASHBOARD_KEY } from '../shared/dashboard-layout';
import type { DashboardSnapshot } from '../shared/dashboard-operations';
import { errorText } from './ui/controls';

let draftOpen = false;
export const isHomeDashboardDraftOpen = () => draftOpen;

export function useHomeDashboardDraft(editing: boolean): void {
  useLayoutEffect(() => {
    draftOpen = editing;
    return () => { draftOpen = false; };
  }, [editing]);
}

export function useSavedHomeDashboard() {
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);
  const [loadError, setLoadError] = useState('');

  const accept = useCallback((next: DashboardSnapshot) => {
    setSnapshot(current => current && current.revision > next.revision ? current : next);
    setLoadError('');
  }, []);
  const reload = useCallback(async (initialize = false) => {
    try {
      let legacy: string | null | undefined;
      if (initialize) {
        try { legacy = localStorage.getItem(DASHBOARD_KEY); }
        catch { /* An already imported layout can still be read. */ }
      }
      const next = await window.workbench.dashboard.load(legacy);
      if (next) accept(next);
      else if (initialize) setLoadError('无法读取旧看板布局，请重试。');
    } catch (error) { setLoadError(errorText(error)); }
  }, [accept]);

  useEffect(() => {
    const refresh = () => { void reload(); };
    const unsubscribe = window.workbench.dashboard.onChanged(refresh);
    void reload(true);
    window.addEventListener('focus', refresh);
    return () => {
      unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [reload]);

  return { snapshot, loadError, reload, accept };
}
