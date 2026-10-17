import { useEffect, useState } from 'react';
import { errorText } from '../../../src/ui/controls';
import type { BrowserWorkspaceState } from '../../../shared/browser-automation-contracts';
import { BrowserPane, type BrowserPaneProps } from './pane';

const api = () => window.workbench.browserAutomation;

/** The entire host stays mounted across workbench switches. Only URLs and IDs restore after restart. */
export function BrowserWorkspacePane(props: BrowserPaneProps) {
  const [saved, setSaved] = useState<BrowserWorkspaceState | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    if (!api()) { setSaved({ tabs: [], activeId: '', history: [], tasks: [] }); return; }
    void api().state(props.workspace).then(value => { if (current) setSaved(value); }, cause => { if (current) setError(errorText(cause)); });
    return () => { current = false; };
  }, [props.workspace]);
  if (error) return <div className="mbp-error" role="alert">浏览器记录读取失败：{error}<button className="btn btn-sec" onClick={() => { setError(''); setSaved({ tabs: [], activeId: '', history: [], tasks: [] }); }}>打开新页面</button></div>;
  if (!saved) return <div className="mbp-start" role="status">正在恢复浏览器标签…</div>;
  return <BrowserPane {...props} savedTabs={saved.tabs} savedActiveId={saved.activeId} automation={!!api()} />;
}
