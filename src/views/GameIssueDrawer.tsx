import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, CheckCircle, Circle, ClipboardText, Copy, DownloadSimple, FolderOpen } from '@phosphor-icons/react';
import { Modal, errorText } from '../ui/controls';
import { GAME_TASKS, type GameArtifact, type GameState, type GameTaskId } from '../../shared/game-contracts';
import { GameIssueDraftSchema, type GameIssue, type GameIssueDraft, type GameIssueSummary } from '../../shared/game-issues';

function IssueThumbnail({ id, issueId, name }: { id: string; issueId?: string; name: string }) {
  const [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void window.workbench.game.issues.preview({ id, issueId }).then(url => { if (active) setUrl(url); }, cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, [id, issueId]);
  return <button type="button" className="game-issue-thumbnail" title={`打开${name}`} onClick={() => { void window.workbench.game.issues.openImage({ id, issueId }).catch(cause => setError(errorText(cause))); }}>
    {url ? <img src={url} alt={name} /> : <span>{error || '正在载入截图…'}</span>}<span>{name}</span>{error && url ? <small role="alert">{error}</small> : null}
  </button>;
}

export function GameIssueDrawer({ state, environment, pageUrl, viewport, zoom, profile, taskId, artifacts, initialNotes = '', capture, close }: {
  state: GameState; environment: 'local' | 'online'; pageUrl: string; viewport: string; zoom: number; profile: string;
  taskId: GameTaskId; artifacts: GameArtifact[]; initialNotes?: string; capture?: () => Promise<GameArtifact>; close(): void;
}) {
  const [draft, setDraft] = useState<GameIssueDraft>(() => ({ title: '', steps: initialNotes, expected: '', actual: '', environment, pageUrl,
    viewport: viewport as GameIssueDraft['viewport'], zoom, profile: profile as GameIssueDraft['profile'], taskId,
    screenshotIds: artifacts.slice(-2).map(item => item.id), includeTest: environment === 'local' && !!state.results[taskId], includeLogs: environment === 'local' }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const [extraImages, setExtraImages] = useState<GameArtifact[]>([]);
  const [directory, setDirectory] = useState(''), [history, setHistory] = useState<GameIssueSummary[]>([]);
  const [selectedId, setSelectedId] = useState(''), [record, setRecord] = useState<GameIssue | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [validation, setValidation] = useState<Record<string, string>>({});
  const lock = useRef(false), form = useRef<HTMLFormElement>(null);
  const opener = useRef(document.activeElement);
  const dismiss = () => {
    if (busy) return;
    close();
    requestAnimationFrame(() => { if (opener.current instanceof HTMLElement && opener.current.isConnected) opener.current.focus(); });
  };
  const dirty = JSON.stringify(draft) !== baseline;
  useEffect(() => {
    let active = true;
    void Promise.all([window.workbench.game.issues.directory(), window.workbench.game.issues.list()]).then(([directory, history]) => {
      if (active) { setDirectory(directory); setHistory(history); }
    }, cause => { if (active) setError(errorText(cause)); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!selectedId) { setRecord(null); return; }
    let active = true;
    setBusy(true); setError('');
    void window.workbench.game.issues.read(selectedId).then(issue => { if (active) { setRecord(issue); setBusy(false); } }, cause => { if (active) { setBusy(false); setSelectedId(''); setRecord(null); setError(errorText(cause)); } });
    return () => { active = false; };
  }, [selectedId]);
  const images = [...new Map([...artifacts, ...extraImages].map(image => [image.id, image])).values()];
  const value = record ?? draft;
  const local = value.environment === 'local';
  const savedTest = record ? record.test : state.results[taskId];
  const taskLabel = GAME_TASKS.find(task => task.id === (savedTest?.taskId ?? taskId))!.label;
  const testStatus = savedTest ? `${({ passed: '通过', failed: '失败', running: '运行中', queued: '等待中', cancelled: '已取消', unavailable: '未执行', idle: '未运行' } as Record<string, string>)[savedTest.status] || savedTest.status}${savedTest.revision !== (record?.revision ?? state.revision) ? '（待重测）' : ''}` : '未附带测试结果';
  const path = record?.directory || directory;
  const change = (key: 'title' | 'steps' | 'expected' | 'actual', text: string) => { setDraft(previous => ({ ...previous, [key]: text })); setValidation(previous => ({ ...previous, [key]: '' })); };
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (cause) { setError(errorText(cause)); } finally { lock.current = false; setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (record || selectedId || busy) return;
    const parsed = GameIssueDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const errors = Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]), issue.message]));
      setValidation(errors); form.current?.querySelector<HTMLElement>(`[name="${String(parsed.error.issues[0].path[0])}"]`)?.focus(); return;
    }
    void action(async () => {
      const issue = await window.workbench.game.issues.save(parsed.data);
      setBaseline(JSON.stringify(draft)); setRecord(issue); setSelectedId(issue.id);
      setHistory(previous => [issue, ...previous].slice(0, 50)); setNotice('问题已保存，证据已归档。');
    });
  }
  return <Modal title="问题反馈" titleIcon={<ClipboardText />} className="game-issue" close={dismiss} dirty={dirty}
    headingExtra={<><span className="game-issue-tag">{record ? record.id : environment === 'local' ? '本地开发' : '线上试玩'}</span>{record ? <span className="game-issue-saved-label"><CheckCircle weight="fill" />已保存到本机</span> : null}</>}>
    <form ref={form} className="game-issue-form" noValidate onSubmit={submit} aria-busy={busy}>
      <div className="game-issue-scroll">
        <div className="game-issue-history-row"><details className="game-issue-history"><summary>已保存的问题（最近 {history.length} 条）</summary>
          {history.length ? history.map(issue => <button type="button" key={issue.id} disabled={busy} aria-pressed={selectedId === issue.id} onClick={() => { setSelectedId(issue.id); setNotice(''); }}><span>{issue.title}</span><small>{issue.environment === 'local' ? '本地' : '线上'} · {new Date(issue.createdAt).toLocaleString('zh-CN')}</small></button>) : <p>保存后可在这里重新打开，重启 Ono 后仍保留。</p>}
        </details>
        {selectedId ? <button type="button" className="game-issue-return" disabled={busy} onClick={() => { setSelectedId(''); setRecord(null); setNotice(''); }}><ArrowLeft />返回填写</button> : null}</div>
        {!record ? <p className="game-issue-intro">记录复现过程，将截图和检查证据一起保存到本机。</p> : null}
        <label htmlFor="game-issue-title">问题标题{!record ? <span>必填</span> : null}</label>
        <input id="game-issue-title" name="title" maxLength={160} value={value.title} readOnly={!!record || busy} placeholder="简要描述你遇到的问题" aria-invalid={!!validation.title} aria-describedby={validation.title ? 'game-issue-title-error' : undefined} onChange={event => change('title', event.target.value)} />
        {validation.title ? <p id="game-issue-title-error" className="game-issue-field-error">{validation.title}</p> : null}
        <label htmlFor="game-issue-steps">复现步骤{!record ? <span>必填</span> : null}</label>
        <textarea id="game-issue-steps" name="steps" className="resize-none" rows={3} maxLength={4000} value={value.steps} readOnly={!!record || busy} placeholder={'1. 进入哪个案件或页面\n2. 执行了什么操作\n3. 出现了什么问题'} aria-invalid={!!validation.steps} aria-describedby={validation.steps ? 'game-issue-steps-error' : undefined} onChange={event => change('steps', event.target.value)} />
        {validation.steps ? <p id="game-issue-steps-error" className="game-issue-field-error">{validation.steps}</p> : null}
        <div className="game-issue-behavior">{(['expected', 'actual'] as const).map(key => <div key={key}><label htmlFor={`game-issue-${key}`}>{key === 'expected' ? '期望表现' : '实际表现'}{!record ? <span>必填</span> : null}</label><textarea id={`game-issue-${key}`} name={key} className="resize-none" rows={2} maxLength={2000} value={value[key]} readOnly={!!record || busy} aria-invalid={!!validation[key]} aria-describedby={validation[key] ? `game-issue-${key}-error` : undefined} onChange={event => change(key, event.target.value)} />{validation[key] ? <p id={`game-issue-${key}-error`} className="game-issue-field-error">{validation[key]}</p> : null}</div>)}</div>
        <div className="game-issue-section-heading"><h3>截图附件 <small>{record ? record.images.length : draft.screenshotIds.length}/6</small></h3>{!record ? <button type="button" disabled={busy || !capture || draft.screenshotIds.length >= 6} title={!capture ? '打开游戏页面后可截图' : '截图并加入本次问题'} onClick={() => { void action(async () => { const image = await capture!(); setExtraImages(previous => [...previous, image]); setDraft(previous => ({ ...previous, screenshotIds: [...previous.screenshotIds, image.id] })); }); }}><Camera />截取当前页面</button> : null}</div>
        <div className="game-issue-images">{record ? record.images.map(image => <div key={image.id}><IssueThumbnail {...image} issueId={record.id} /></div>) : images.map((image, index) => <div key={image.id}><IssueThumbnail {...image} /><label className="game-issue-image-choice"><input type="checkbox" checked={draft.screenshotIds.includes(image.id)} disabled={busy || !draft.screenshotIds.includes(image.id) && draft.screenshotIds.length >= 6} onChange={event => { const checked = event.target.checked; setDraft(previous => ({ ...previous, screenshotIds: checked ? [...previous.screenshotIds, image.id] : previous.screenshotIds.filter(id => id !== image.id) })); }} />附带截图 {index + 1}</label></div>)}</div>
        {!(record ? record.images.length : images.length) ? <p className="game-issue-empty">暂无截图。可以先保存文字问题，截图为可选附件。</p> : !record ? <p className="game-issue-help">勾选要附带的截图；提交后保存独立副本，点击图片可放大查看。</p> : null}
        <section className="game-issue-evidence"><h3>{record ? '已归档证据' : '附带证据'}</h3>
          <label>{record ? value.includeTest ? <CheckCircle weight="fill" /> : <Circle /> : <input type="checkbox" checked={value.includeTest} disabled={busy || !local || !state.results[taskId]} onChange={event => setDraft(previous => ({ ...previous, includeTest: event.target.checked }))} />}<span>{local ? `${taskLabel} · ${testStatus}` : '本地测试结果 · 线上环境不可用'}</span></label>
          <label>{record ? value.includeLogs ? <CheckCircle weight="fill" /> : <Circle /> : <input type="checkbox" checked={value.includeLogs} disabled={busy || !local} onChange={event => setDraft(previous => ({ ...previous, includeLogs: event.target.checked }))} />}<span>{local ? value.includeLogs ? '服务日志 · 提交时快照' : '服务日志 · 未附带' : '服务日志 · 未接入服务器日志'}</span></label>
          {!local ? <p>线上访问检查：{(record ? record.onlineCheck : state.online.check)?.message || '尚未检查'}</p> : null}
          <p>保存当时的检查结果，后续重跑不会改写这份证据。</p>
        </section>
        <details className="game-issue-context"><summary>当前环境 · {local ? '本地开发' : '线上试玩'} · {value.viewport === 'fit' ? '跟随窗口' : value.viewport === 'desktop' ? '1440×1000' : '390×844'} · {Math.round(value.zoom * 100)}%</summary><dl><div><dt>试玩档</dt><dd>{value.profile === 'keep' ? '保留试玩档' : '临时新档'}</dd></div><div><dt>页面</dt><dd>{value.pageUrl || '尚未打开'}</dd></div>{record ? <div><dt>保存于</dt><dd>{new Date(record.createdAt).toLocaleString('zh-CN')}</dd></div> : null}</dl></details>
      </div>
      <footer className="game-issue-footer">
        {error ? <p className="game-issue-field-error" role="alert">{error}</p> : null}
        {notice ? <p className="game-issue-success" role="status">{notice}</p> : null}
        <div className="game-issue-save-heading"><strong>{record ? '保存位置' : '保存到本机'}</strong>{!record ? <small>提交后创建独立问题目录</small> : null}</div>
        <code className="game-issue-path">{path || '正在读取保存位置…'}</code>
        <div className="game-issue-footer-actions"><button type="button" disabled={busy || !path} onClick={() => { void action(() => window.workbench.game.issues.openFolder(record?.id)); }}><FolderOpen />打开文件夹</button><button type="button" disabled={busy || !path} onClick={() => { void action(async () => { await window.workbench.clipboard.write(path); setNotice('保存路径已复制。'); }); }}><Copy />复制路径</button>
          {record ? <><button type="button" disabled={busy} onClick={() => { void action(async () => { const path = await window.workbench.game.issues.export(record.id); if (path) setNotice(`已导出：${path}`); }); }}><DownloadSimple />导出 ZIP</button><button type="button" className="game-primary" disabled={busy} onClick={dirty ? () => { setSelectedId(''); setRecord(null); } : dismiss}>{dirty ? '继续填写草稿' : '完成'}</button></> : <button type="submit" className="game-primary" disabled={busy}>{busy ? '正在处理…' : '提交并保存'}</button>}
        </div>
      </footer>
    </form>
  </Modal>;
}
