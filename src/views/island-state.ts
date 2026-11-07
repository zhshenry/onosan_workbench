import { useEffect, useState } from 'react';
import type { IslandState } from '../../shared/island-contracts';
import { errorText } from '../ui/controls';

export function useIslandState() {
  const [state, setState] = useState<IslandState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let alive = true, version = 0;
    const receive = (value: IslandState) => { if (alive) { version++; setState(value); if (value.error) setError(value.error); } };
    const load = () => { const request = ++version; void window.workbench.island.state().then(value => { if (request === version) receive(value); }, e => { if (alive && request === version) setError(errorText(e)); }); };
    const off = window.workbench.island.onChanged(receive);
    const offError = window.workbench.island.onError(setError);
    load();
    window.addEventListener('focus', load);
    return () => { alive = false; off(); offError(); window.removeEventListener('focus', load); };
  }, []);
  return { state, setState, error, setError };
}
