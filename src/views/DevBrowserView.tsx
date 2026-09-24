/**
 * 开发调试页(不进导航,经 #dev/browser 进入):
 * 内置浏览器租约模式的最小外壳,兼作模块验收入口。
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { CSSProperties } from 'react';
import { GuestFrame } from '../../modules/browser/ui/guest-frame';
import { WebviewPresentation } from '../../modules/browser/ui/webview-presentation';

const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  fontFamily: 'system-ui, sans-serif',
  background: '#eef3f8',
};
const bar: CSSProperties = {
  display: 'flex',
  gap: 8,
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid #d7e2ec',
  background: '#fff',
};
const btn: CSSProperties = {
  border: '1px solid #c9d6e2',
  background: '#f7fafc',
  borderRadius: 8,
  padding: '6px 12px',
  cursor: 'pointer',
  fontSize: 13,
};
const host: CSSProperties = { flex: 1, minHeight: 0, position: 'relative' };

export function DevBrowserView() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [{ frame, presentation }] = useState(() => {
    let frameRef: GuestFrame;
    const presentation = new WebviewPresentation({
      mounted: () => frameRef.attach(),
      unmounted: () => frameRef.detach(),
    });
    frameRef = new GuestFrame({}, window.workbench.browser, presentation);
    return { frame: frameRef, presentation };
  });
  const state = useSyncExternalStore(frame.subscribe, frame.getSnapshot);
  const [input, setInput] = useState('');

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    return presentation.mount(el);
  }, [presentation]);

  useEffect(() => () => void frame.dispose(), [frame]);

  const go = (raw: string): void => {
    if (raw.trim() !== '') setInput(raw.trim());
    frame.loadUrl(raw);
  };

  return (
    <div style={page}>
      <div style={bar}>
        <button style={btn} title="后退" disabled={!state.canGoBack} onClick={() => frame.goBack()}>←</button>
        <button style={btn} title="前进" disabled={!state.canGoForward} onClick={() => frame.goForward()}>→</button>
        <button style={btn} title="刷新" onClick={() => frame.reload()}>⟳</button>
        <input
          style={{ flex: 1, border: '1px solid #c9d6e2', borderRadius: 8, padding: '6px 10px', fontSize: 13 }}
          placeholder="输入网址,回车打开(仅 http/https)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') go(input);
          }}
        />
        <button style={btn} onClick={() => go(input)}>打开</button>
      </div>
      <div
        style={{
          padding: '4px 12px',
          fontSize: 12,
          color: state.error ? '#b33' : '#5a6b7a',
          borderBottom: '1px solid #d7e2ec',
          background: '#fbfdfe',
          minHeight: 22,
        }}
      >
        {state.loading && '加载中… '}
        {state.error && `错误 ${state.error.code ?? ''} ${state.error.description ?? ''} `}
        {state.target?.url}
      </div>
      <div style={host} ref={hostRef} />
    </div>
  );
}
