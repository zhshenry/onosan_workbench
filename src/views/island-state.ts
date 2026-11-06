import { useEffect, useState } from 'react';
import type { IslandState } from '../../shared/island-contracts';
import { errorText } from '../ui/controls';

export function useIslandState() {
  const [state, setState] = useState<IslandState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    const receive = (value: IslandState) => { if (alive) { setState(value); if (value.error) setError(value.error); } };
    const load = () => { void window.workbench.island.state().then(receive, e => { if (alive) setError(errorText(e)); }); };
    const off = window.workbench.island.onChanged(receive);
    const offError = window.workbench.island.onError(setError);
    load();
    window.addEventListener('focus', load);
    return () => { alive = false; off(); offError(); window.removeEventListener('focus', load); };
  }, []);
  return { state, setState, error, setError };
}
