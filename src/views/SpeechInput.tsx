import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { ArrowClockwise, Microphone, SpinnerGap, Stop, Translate } from '@phosphor-icons/react';
import { insertSpeechDraft, type SpeechInsertion } from '../../shared/speech-audio';
import { SPEECH_LANGUAGES, SPEECH_MAX_SECONDS, type SpeechLanguage } from '../../shared/speech-contracts';
import { errorText, Select } from '../ui/controls';
import { SpeechRecorder } from '../ui/speech-recorder';

type Phase = 'idle' | 'preparing' | 'recording' | 'transcribing' | 'review' | 'error';
type RecordingMode = 'new' | 'append' | 'replace';
const languages = [
  { value: 'auto', label: '自动识别' }, { value: 'zh', label: '中文' }, { value: 'en', label: '英语' },
  { value: 'yue', label: '粤语' }, { value: 'ja', label: '日语' }, { value: 'ko', label: '韩语' },
];
type Preferences = { deviceId: string; language: SpeechLanguage };
const preferenceKey = 'ono-speech-preferences-v1';
function preferences(): Preferences {
  try {
    const value = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    if (typeof value.deviceId === 'string' && value.deviceId.length <= 1024 && SPEECH_LANGUAGES.includes(value.language)) return value;
  } catch { /* A blocked preference store must not prevent recording. */ }
  return { deviceId: '', language: 'auto' };
}

function SpeechWaveform({ recorder, recording }: { recorder: RefObject<SpeechRecorder | null>; recording: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let frame = 0;
    const history = new Float32Array(48);
    const draw = (): void => {
      const element = canvas.current, context = element?.getContext('2d');
      if (!element || !context) return;
      const width = element.clientWidth, height = element.clientHeight, ratio = window.devicePixelRatio || 1;
      if (element.width !== width * ratio || element.height !== height * ratio) { element.width = width * ratio; element.height = height * ratio; }
      context.setTransform(ratio, 0, 0, ratio, 0, 0); context.clearRect(0, 0, width, height);
      context.fillStyle = getComputedStyle(element).color;
      const samples = recording ? recorder.current?.readLevels() : null;
      if (samples) {
        let energy = 0;
        for (const sample of samples) energy += ((sample - 128) / 128) ** 2;
        history.copyWithin(0, 1); history[47] = Math.min(1, Math.sqrt(energy / samples.length) * 16);
      }
      const range = Math.max(.2, ...history);
      for (let i = 0; i < 48; i++) {
        const bar = Math.max(2, history[i] / range * height);
        context.fillRect(i * width / 48 + 1, (height - bar) / 2, 2, bar);
      }
      if (recording) frame = requestAnimationFrame(draw);
    };
    draw(); return () => cancelAnimationFrame(frame);
  }, [recording, recorder]);
  return <canvas ref={canvas} className="ai-speech-wave" role="img" aria-label={recording ? '麦克风实时音量' : '麦克风音量'} />;
}

export function SpeechInput({ anchor, contextKey, draft, onChange, enabled, visible, onBusyChange }: {
  anchor: RefObject<HTMLDivElement | null>; contextKey: string; draft: string; onChange(value: string): void;
  enabled: boolean; visible: boolean; onBusyChange(value: boolean): void;
}) {
  const id = useId(), panel = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null);
  const recorder = useRef<SpeechRecorder | null>(null), token = useRef(0), request = useRef<string | null>(null);
  const insertion = useRef<SpeechInsertion | null>(null), started = useRef(0);
  const [phase, setPhase] = useState<Phase>('idle'), phaseRef = useRef<Phase>('idle');
  const [prefs, setPrefs] = useState(preferences), activePrefs = useRef(prefs);
  const [devices, setDevices] = useState<{ value: string; label: string }[]>([]);
  const [seconds, setSeconds] = useState(0), [text, setText] = useState(''), [notice, setNotice] = useState('');
  const segment = useRef<{ mode: RecordingMode; text: string }>({ mode: 'new', text: '' });
  const [previousText, setPreviousText] = useState<string | null>(null);
  const revision = useRef({ contextKey, draft, value: 0 });
  if (revision.current.contextKey !== contextKey || revision.current.draft !== draft) revision.current = { contextKey, draft, value: revision.current.value + 1 };
  const latest = useRef({ contextKey, draft, onChange, visible, enabled });
  latest.current = { contextKey, draft, onChange, visible, enabled };
  const active = phase === 'preparing' || phase === 'recording' || phase === 'transcribing';
  const transition = useCallback((next: Phase): void => { phaseRef.current = next; setPhase(next); onBusyChange(next !== 'idle'); }, [onBusyChange]);
  const dispose = useCallback((): void => {
    token.current++; recorder.current?.cancel(); recorder.current = null;
    if (request.current) void window.workbench.speech?.cancel(request.current).catch(() => {});
    request.current = null; onBusyChange(false);
  }, [onBusyChange]);
  const cancel = useCallback((): void => {
    dispose(); insertion.current = null; transition('idle'); setText(''); setNotice(''); setPreviousText(null); trigger.current?.focus({ preventScroll: true });
  }, [dispose, transition]);
  const cancelSegment = useCallback((): void => {
    if (segment.current.mode === 'new') { cancel(); return; }
    dispose(); setText(segment.current.text); setNotice(''); transition('review');
  }, [cancel, dispose, transition]);
  const fail = useCallback((message: string): void => {
    dispose(); setNotice(message);
    if (segment.current.mode !== 'new') { setText(segment.current.text); transition('review'); }
    else transition('error');
  }, [dispose, transition]);
  useEffect(() => { dispose(); insertion.current = null; transition('idle'); setText(''); setNotice(''); setPreviousText(null); }, [contextKey, visible, dispose, transition]);
  useEffect(() => { if (!enabled && ['preparing', 'recording', 'transcribing'].includes(phaseRef.current)) cancel(); }, [enabled, cancel]);
  useEffect(() => () => { dispose(); }, [dispose]);
  const updatePreferences = (value: Preferences): void => {
    setPrefs(value);
    try { localStorage.setItem(preferenceKey, JSON.stringify(value)); } catch { /* Preferences are optional, audio is never stored. */ }
  };
  const refreshDevices = async (): Promise<void> => {
    const values = await navigator.mediaDevices.enumerateDevices();
    setDevices(values.filter(device => device.kind === 'audioinput' && device.deviceId && device.deviceId !== 'default')
      .map((device, index) => ({ value: device.deviceId, label: device.label || '麦克风 ' + (index + 1) })));
  };
  const start = async (mode: RecordingMode = 'new'): Promise<void> => {
    if (!latest.current.enabled || ['preparing', 'recording', 'transcribing'].includes(phaseRef.current)) return;
    dispose(); const currentToken = token.current, requestId = crypto.randomUUID();
    request.current = requestId; activePrefs.current = prefs;
    segment.current = { mode, text };
    if (mode === 'new') {
      const input = anchor.current?.querySelector('textarea');
      insertion.current = { context: contextKey, revision: revision.current.value, start: input?.selectionStart ?? draft.length, end: input?.selectionEnd ?? draft.length };
      setText(''); setPreviousText(null);
    }
    setNotice('正在准备本地引擎…'); setSeconds(0); transition('preparing');
    try {
      await window.workbench.speech.prepare(requestId);
      if (token.current !== currentToken) return;
      setNotice('正在准备麦克风…');
      const capture = new SpeechRecorder(); recorder.current = capture;
      await capture.start(prefs.deviceId, () => {
        if (token.current !== currentToken) return;
        fail('麦克风已断开，请检查设备后重试。');
      });
      if (token.current !== currentToken) { capture.cancel(); return; }
      started.current = performance.now(); setNotice(''); transition('recording');
      void refreshDevices().catch(() => {});
    } catch (error) {
      if (token.current !== currentToken) return;
      const name = error instanceof DOMException ? error.name : '';
      fail(name === 'NotAllowedError' ? '无法使用麦克风，请在 Windows 隐私设置中允许桌面应用访问麦克风。'
        : name === 'NotFoundError' || name === 'OverconstrainedError' ? '未找到所选麦克风，请检查设备或切回默认麦克风。' : errorText(error));
    }
  };
  const stop = useCallback(async (): Promise<void> => {
    if (phaseRef.current !== 'recording' || !recorder.current || !request.current) return;
    const currentToken = token.current, requestId = request.current;
    transition('transcribing'); setNotice('');
    try {
      const audio = await recorder.current.finish();
      if (token.current !== currentToken) return;
      const result = await window.workbench.speech.transcribe({ id: requestId, audio, language: activePrefs.current.language });
      if (token.current !== currentToken || !latest.current.visible || insertion.current?.context !== latest.current.contextKey) return;
      request.current = null;
      const next = result.text.trim(), saved = segment.current;
      if (!next) { fail('未检测到清晰的讲话，请重新录音。'); return; }
      setPreviousText(saved.mode === 'replace' ? saved.text : null);
      setText(saved.mode === 'append' ? saved.text + (saved.text && !saved.text.endsWith('\n') ? '\n' : '') + next : next);
      recorder.current = null; transition('review');
    } catch (error) {
      if (token.current !== currentToken) return;
      fail(errorText(error));
    }
  }, [fail, transition]);
  useEffect(() => {
    if (phase !== 'recording') return;
    const timer = window.setInterval(() => {
      const elapsed = Math.min(SPEECH_MAX_SECONDS, (performance.now() - started.current) / 1000);
      setSeconds(elapsed); if (elapsed >= SPEECH_MAX_SECONDS) void stop();
    }, 200);
    return () => window.clearInterval(timer);
  }, [phase, stop]);
  useEffect(() => {
    if (phase === 'idle') return;
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || panel.current?.querySelector('[aria-expanded="true"]')) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (['preparing', 'recording', 'transcribing'].includes(phaseRef.current)) cancelSegment(); else cancel();
    };
    const blur = (): void => { if (['preparing', 'recording', 'transcribing'].includes(phaseRef.current)) cancelSegment(); };
    const hide = (): void => { if (document.hidden) cancel(); };
    window.addEventListener('keydown', escape, true); window.addEventListener('blur', blur); document.addEventListener('visibilitychange', hide);
    return () => { window.removeEventListener('keydown', escape, true); window.removeEventListener('blur', blur); document.removeEventListener('visibilitychange', hide); };
  }, [phase, cancel, cancelSegment]);
  useLayoutEffect(() => {
    const element = panel.current, compose = anchor.current;
    if (phase === 'idle' || !visible || !element || !compose) { if (element?.matches(':popover-open')) element.hidePopover(); return; }
    if (!element.matches(':popover-open')) element.showPopover();
    const place = (): void => {
      const rect = (compose.querySelector('.ai-compose-input') ?? compose).getBoundingClientRect();
      element.style.width = Math.min(432, rect.width) + 'px';
      element.style.maxHeight = Math.max(120, rect.top - 92) + 'px';
      element.style.left = Math.max(8, Math.min(rect.right - element.offsetWidth, window.innerWidth - element.offsetWidth - 8)) + 'px';
      element.style.top = Math.max(84, rect.top - element.offsetHeight - 8) + 'px';
      const bounds = element.getBoundingClientRect();
      element.style.setProperty('--speech-card-left', bounds.left + 'px');
      element.style.setProperty('--speech-card-width', bounds.width + 'px');
    };
    place();
    const observer = new ResizeObserver(place); observer.observe(compose); observer.observe(element);
    window.addEventListener('resize', place);
    return () => { observer.disconnect(); window.removeEventListener('resize', place); };
  }, [phase, visible, anchor, notice, text]);
  const insert = (): void => {
    if (!insertion.current || !text.trim()) return;
    const value = insertSpeechDraft(latest.current.draft, text, insertion.current, latest.current.contextKey, revision.current.value);
    if (value === null) { cancel(); return; }
    const cursor = insertion.current.revision === revision.current.value ? insertion.current.start + text.length : value.length;
    latest.current.onChange(value); cancel();
    requestAnimationFrame(() => { const input = anchor.current?.querySelector('textarea'); input?.focus(); input?.setSelectionRange(cursor, cursor); });
  };
  const changed = insertion.current?.revision !== revision.current.value;
  const deviceOptions = [{ value: '', label: '默认麦克风' }, ...devices];
  for (const deviceId of [prefs.deviceId, activePrefs.current.deviceId]) {
    if (deviceId && !deviceOptions.some(option => option.value === deviceId)) deviceOptions.push({ value: deviceId, label: '上次选择的麦克风' });
  }
  const time = String(Math.floor(seconds / 60)).padStart(2, '0') + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
  const selectedPrefs = active ? activePrefs.current : prefs;
  return <>
    <button ref={trigger} type="button" className={'ai-voice-trigger' + (phase !== 'idle' ? ' active' : '')}
      aria-label={phase === 'idle' ? '语音听写' : '取消语音听写'} title={!window.workbench.speech ? '请重启工作台以启用语音输入' : enabled ? phase === 'idle' ? '语音听写' : '取消语音听写' : '请先配置并启用 AI 助手'}
      aria-haspopup="dialog" aria-expanded={phase !== 'idle'} aria-controls={id} disabled={!enabled || !window.workbench.speech}
      onClick={() => { if (phase === 'idle') void start(); else cancel(); }}><Microphone size={18} weight={phase !== 'idle' ? 'fill' : 'regular'} /></button>
    {phase !== 'idle' && <div ref={panel} id={id} popover="manual" role="dialog" aria-labelledby={id + '-title'} className="ai-speech-card">
      <header><span className="ai-speech-icon"><Microphone size={16} /></span><strong id={id + '-title'}>语音听写</strong><span className="ai-speech-local">本地</span></header>
      <div className="ai-speech-selects"><span><Microphone size={14} /><Select aria-label="录音麦克风" value={selectedPrefs.deviceId}
        menuClassName="ai-speech-device-menu" title={deviceOptions.find(option => option.value === selectedPrefs.deviceId)?.label}
        options={deviceOptions} disabled={active} portalContainer={() => panel.current}
        onChange={deviceId => updatePreferences({ ...prefs, deviceId })} /></span><span><Translate size={14} /><Select aria-label="识别语言" value={selectedPrefs.language}
        options={languages} disabled={active} portalContainer={() => panel.current}
        onChange={language => updatePreferences({ ...prefs, language: language as SpeechLanguage })} /></span></div>
      {phase === 'review' ? <div className="ai-speech-body ai-speech-review">
        <div className="ai-speech-result-heading"><label htmlFor={id + '-text'}>识别结果，可编辑</label><button type="button" className="ai-speech-text-action" disabled={!enabled} onClick={() => void start('replace')}><ArrowClockwise size={14} />重新录音</button></div>
        <textarea id={id + '-text'} autoFocus value={text} onChange={event => { setText(event.target.value); setPreviousText(null); }} />
        {notice && <p className="ai-speech-error" role="alert">{notice}</p>}
        <div className="ai-speech-feedback"><span role="status">{changed ? '草稿已更新，插入时将追加到末尾。' : previousText !== null ? '已替换为新结果' : '确认文字后插入草稿，不会自动发送。'}</span>
          {previousText !== null && <button type="button" className="ai-speech-text-action" onClick={() => { setText(previousText); setPreviousText(null); setNotice(''); panel.current?.querySelector('textarea')?.focus(); }}>恢复上次结果</button>}</div>
      </div> : <div className="ai-speech-body ai-speech-recording"><div className="ai-speech-meter"><div className="ai-speech-status" role="status"><span>{active && phase !== 'recording' ? <SpinnerGap size={13} className="ai-speech-spinner" /> : phase === 'recording' ? <span className="ai-speech-dot" /> : null}
          {phase === 'preparing' ? notice : phase === 'transcribing' ? '正在本地转写…' : phase === 'error' ? '听写未完成' : segment.current.mode === 'append' ? '补充录音中' : segment.current.mode === 'replace' ? '重新录音中' : '录音中'}</span><time>{time}<small> / 02:00</small></time></div>
          <SpeechWaveform recorder={recorder} recording={phase === 'recording'} /><small className="ai-speech-hint">{segment.current.mode === 'append' ? '前文已保留，正在补充录音。' : segment.current.mode === 'replace' ? '新结果成功后替换，原文暂时保留。' : '停止后预览文字，确认再插入。'}</small></div>
        {phase === 'error' && <p className="ai-speech-error" role="alert">{notice}</p>}
      </div>}
      <footer><button type="button" className="ai-speech-cancel" onClick={phase === 'review' ? cancel : cancelSegment}>{phase === 'review' ? '丢弃' : segment.current.mode !== 'new' ? '取消本段' : '取消'}</button>
        <span className="ai-speech-actions">{phase === 'review' && <button type="button" className="ai-speech-continue" disabled={!enabled} onClick={() => void start('append')}>继续录音</button>}
        <button type="button" className="ai-speech-primary" disabled={!enabled || phase === 'preparing' || phase === 'transcribing' || phase === 'review' && !text.trim()}
          onClick={() => { if (phase === 'recording') void stop(); else if (phase === 'review') insert(); else if (phase === 'error') void start(); }}>
          {phase === 'recording' ? <Stop size={13} weight="fill" /> : phase === 'preparing' || phase === 'transcribing' ? <SpinnerGap size={13} className="ai-speech-spinner" /> : null}
          {phase === 'recording' ? '停止并转写' : phase === 'review' ? changed ? '追加到草稿' : '插入草稿' : phase === 'error' ? '重新录音' : '请稍候'}</button></span></footer>
    </div>}
  </>;
}
