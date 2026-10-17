import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ArrowClockwise, CaretDoubleDown, Copy, Stop, TerminalWindow, Trash } from '@phosphor-icons/react';
import { errorText } from '../ui/controls';
import type { GameTerminalEvent, GameTerminalState } from '../../shared/game-contracts';
import '@xterm/xterm/css/xterm.css';

export function GameTerminalPanel({ open, close, onPending }: { open: boolean; close(): void; onPending(message: string): void }) {
  const dock = useRef<HTMLElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const terminal = useRef<Terminal | null>(null);
  const session = useRef('');
  const reconnect = useRef<() => void>(() => {});
  const fit = useRef<() => void>(() => {});
  const visible = useRef(open);
  const [status, setStatus] = useState<GameTerminalState>();
  const [failure, setFailure] = useState('');
  const [busy, setBusy] = useState(false);
  const [height, setHeight] = useState(240);
  const [available, setAvailable] = useState(600);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; height: number } | null>(null);
  const maximum = Math.max(160, Math.min(520, Math.floor(available - 260)));
  const effectiveHeight = Math.min(height, maximum);
  const bridge = window.workbench.game.terminal;
  useLayoutEffect(() => {
    const parent = dock.current?.parentElement;
    if (!parent) return;
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.height > 0) setAvailable(entry.contentRect.height); });
    observer.observe(parent); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!host.current) return;
    let active = true, ready = false, sequence = 0;
    let pending: Exclude<GameTerminalEvent, { kind: 'state' }>[] = [];
    const style = getComputedStyle(host.current);
    const term = new Terminal({
      fontFamily: '"Cascadia Mono", Consolas, "Microsoft YaHei", monospace',
      fontSize: parseFloat(style.getPropertyValue('--type-body')) || 14,
      cursorBlink: !matchMedia('(prefers-reduced-motion: reduce)').matches,
      scrollback: 2000, screenReaderMode: true, disableStdin: true,
      theme: { background: style.getPropertyValue('--game-terminal-bg').trim(), foreground: style.getPropertyValue('--game-terminal-fg').trim(), cursor: style.getPropertyValue('--game-terminal-fg').trim(), selectionBackground: style.getPropertyValue('--game-terminal-pressed').trim(), black: style.getPropertyValue('--game-terminal-bg').trim(), red: '#f29898', green: '#6fdfc3', yellow: '#e8cd91', blue: '#8fb8ed', magenta: '#c6a5e8', cyan: '#80d5d1', white: style.getPropertyValue('--game-terminal-fg').trim() },
    });
    const addon = new FitAddon(); term.loadAddon(addon); term.open(host.current);
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const motionChanged = () => { term.options.cursorBlink = !motion.matches; };
    motion.addEventListener('change', motionChanged);
    terminal.current = term;
    const resize = () => { if (host.current && host.current.clientWidth > 0 && host.current.clientHeight > 0) addon.fit(); };
    fit.current = resize;
    const receive = (event: Exclude<GameTerminalEvent, { kind: 'state' }>) => {
      if (event.id !== session.current || event.sequence <= sequence) return;
      sequence = event.sequence;
      if (event.kind === 'clear') term.clear(); else term.write(event.data);
    };
    const off = bridge.onEvent(event => {
      if (event.kind === 'state') { setStatus(event.state); term.options.disableStdin = !ready || event.state.phase !== 'running'; }
      else if (!ready) pending.push(event); else receive(event);
    });
    async function connect() {
      setBusy(true); setFailure(''); ready = false; pending = []; resize();
      try {
        const next = await bridge.open({ cols: Math.max(20, term.cols), rows: Math.max(2, term.rows) });
        if (!active) return;
        session.current = next.id; sequence = next.sequence;
        term.reset(); term.write(next.output); term.options.disableStdin = next.phase !== 'running';
        setStatus(next); ready = true; pending.forEach(receive); pending = [];
        if (visible.current) term.focus();
      } catch (error) { if (active) setFailure(errorText(error)); }
      finally { if (active) setBusy(false); }
    }
    reconnect.current = () => { void connect(); };
    const input = term.onData(data => { if (session.current) void bridge.write(session.current, data).catch(error => { if (active) setFailure(errorText(error)); }); });
    const dimensions = term.onResize(({ cols, rows }) => { if (session.current && ready) void bridge.resize(session.current, Math.max(20, cols), Math.max(2, rows)).catch(error => { if (active) setFailure(errorText(error)); }); });
    term.attachCustomKeyEventHandler(event => {
      if (event.ctrlKey && event.shiftKey && event.code === 'KeyC') {
        if (event.type === 'keydown' && term.hasSelection()) void window.workbench.clipboard.write(term.getSelection().slice(-19000)).catch(error => { if (active) setFailure(errorText(error)); });
        return false;
      }
      return true;
    });
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    void connect();
    return () => { active = false; off(); observer.disconnect(); motion.removeEventListener('change', motionChanged); input.dispose(); dimensions.dispose(); term.dispose(); terminal.current = null; session.current = ''; fit.current = () => {}; reconnect.current = () => {}; };
  }, [bridge]);
  useLayoutEffect(() => { visible.current = open; if (open) { fit.current(); terminal.current?.focus(); } }, [open]);
  async function act(action: () => Promise<unknown>) {
    setFailure(''); setBusy(true);
    try { await action(); } catch (error) { setFailure(errorText(error)); } finally { setBusy(false); }
  }
  function copy() {
    const term = terminal.current;
    if (!term) return;
    const buffer = term.buffer.active;
    const text = term.getSelection() || Array.from({ length: buffer.length }, (_, index) => buffer.getLine(index)?.translateToString(true) ?? '').join('\n').trimEnd();
    if (!text) { onPending('终端暂无可复制内容。'); return; }
    void act(async () => { await window.workbench.clipboard.write(text.slice(-19000)); onPending(text.length > 19000 ? '已复制最近的终端输出（最多 19000 字符）。' : '终端内容已复制。'); });
  }
  const running = status?.phase === 'running';
  return <section ref={dock} id="game-project-terminal" className="game-terminal-dock" aria-label="项目终端" hidden={!open} inert={!open} aria-hidden={!open} style={{ '--game-terminal-height': `${effectiveHeight}px` } as CSSProperties}>
    <div className="game-terminal-resize" role="separator" tabIndex={0} aria-label="调整终端高度" aria-orientation="horizontal" aria-valuemin={160} aria-valuemax={maximum} aria-valuenow={Math.round(effectiveHeight)} data-dragging={dragging}
      onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { y: event.clientY, height: effectiveHeight }; event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); }}
      onPointerMove={event => { if (drag.current) setHeight(Math.max(160, Math.min(maximum, drag.current.height + drag.current.y - event.clientY))); }}
      onPointerUp={event => { drag.current = null; setDragging(false); if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId); }} onLostPointerCapture={() => { drag.current = null; setDragging(false); }}
      onKeyDown={event => { if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); setHeight(event.key === 'Home' ? 160 : event.key === 'End' ? maximum : Math.max(160, Math.min(maximum, effectiveHeight + (event.key === 'ArrowUp' ? 24 : -24)))); }} />
    <div className="game-terminal">
      <header className="game-terminal-heading">
        <strong><TerminalWindow />项目终端</strong><span className="game-terminal-shell">PowerShell</span>
        <span className="game-terminal-directory" title={`会话初始目录：${status?.cwd || ''}`}>{status?.cwd || '正在读取项目目录…'}</span>
        <span className="game-terminal-status" role="status">{busy ? '正在处理…' : status?.message || '正在连接…'}</span>
        <div className="game-terminal-actions">
          {running ? <><button className="game-terminal-icon" disabled={busy} title="中断当前命令（Ctrl+C）" aria-label="中断当前命令" onClick={() => { void act(() => bridge.write(session.current, '\x03')); terminal.current?.focus(); }}><Stop /></button><button disabled={busy} title="结束此 PowerShell 及其子进程" onClick={() => { void act(() => bridge.close(session.current)); }}><Stop />结束会话</button></> : <button disabled={busy} onClick={() => reconnect.current()}><ArrowClockwise />重新连接</button>}
          <button disabled={!status?.id || busy} onClick={() => { void act(() => bridge.clear(session.current)); }}><Trash />清空</button>
          <button disabled={busy} onClick={copy}><Copy />复制</button>
          <button aria-label="收起项目终端" onClick={close}><CaretDoubleDown /><span>收起</span></button>
        </div>
      </header>
      {failure || status?.phase === 'error' ? <p className="game-terminal-error" role="alert">{failure || status?.message}</p> : null}
      <div ref={host} className="game-terminal-screen" />
    </div>
  </section>;
}
