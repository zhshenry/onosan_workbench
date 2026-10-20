import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Camera, CheckCircle, ClipboardText, Copy, DownloadSimple, FolderOpen } from '@phosphor-icons/react';
import { HushHourIssueDraftSchema, hushHourIssueReport, type HushHourArtifact, type HushHourEnvironment, type HushHourIssue, type HushHourIssueDraft, type HushHourIssueSummary, type HushHourState } from '../../shared/hush-hour-contracts';
import { Modal, errorText } from '../ui/controls';

const fields = [{ name: 'title', label: '问题标题', max: 160 }, { name: 'steps', label: '复现步骤', max: 4000 }, { name: 'expected', label: '期望表现', max: 2000 }, { name: 'actual', label: '实际表现', max: 2000 }] as const;
function IssueImage({ id, name, issueId }: { id: string; name: string; issueId?: string }) {
  const [url, setUrl] = useState(''), [failure, setFailure] = useState('');
  useEffect(() => {
    let current = true;
    void window.workbench.hushHour.issues.preview({ id, issueId }).then(value => { if (current) setUrl(value); }, error => { if (current) setFailure(errorText(error)); });
    return () => { current = false; };
  }, [id, issueId]);
  return <><button type="button" className="game-issue-thumbnail" disabled={!url} title="打开截图" aria-label={`打开截图：${name}`} onClick={() => { void window.workbench.hushHour.issues.openImage({ id, issueId }).catch(error => setFailure(errorText(error))); }}>{url ? <img src={url} alt={name} /> : <span>{failure || '正在读取截图…'}</span>}</button>{failure ? <p role="alert" className="game-issue-field-error">{failure}</p> : null}</>;
}

export function HushHourIssueDrawer({ state, environment, siteUrl, pageUrl, viewport, zoom, previewRevision, canCapture, capture, close }: {
  environment: HushHourEnvironment; siteUrl: string;
  state: HushHourState; pageUrl: string; viewport: HushHourIssueDraft['viewport']; zoom: number; previewRevision: string;
  canCapture: boolean; capture(): Promise<HushHourArtifact | undefined>; close(): void;
}) {
  const api = window.workbench.hushHour.issues;
  const captures = state.captures.filter(item => item.environment === environment && (environment === 'local' || item.siteUrl === siteUrl));
  const initial = (): HushHourIssueDraft => ({ title: '', steps: '', expected: '', actual: '', pageUrl, viewport, zoom, previewRevision, environment, siteUrl, screenshotIds: captures.slice(-6).map(item => item.id), includeLogs: environment === 'local' && !!state.build.output });
  const [draft, setDraft] = useState(initial), [baseline, setBaseline] = useState(initial);
  const [record, setRecord] = useState<HushHourIssue | null>(null), [history, setHistory] = useState<HushHourIssueSummary[]>([]);
  const [directory, setDirectory] = useState(''), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    let current = true;
    void api.directory().then(value => { if (current) setDirectory(value); }, error => { if (current) setFailure(errorText(error)); });
    void api.list().then(value => { if (current) setHistory(value); }, error => { if (current) setFailure(errorText(error)); });
    return () => { current = false; };
  }, [api]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline), value = record ?? draft;
  const images = record?.images ?? captures.filter((image, index) => index >= captures.length - 6 || draft.screenshotIds.includes(image.id)), path = record?.directory || directory;
  async function act(action: () => Promise<void>) {
    setBusy(true); setFailure(''); setNotice('');
    try { await action(); } catch (error) { setFailure(errorText(error)); } finally { setBusy(false); }
  }
  function submit(event: FormEvent) {
    event.preventDefault(); if (record || busy) return;
    const parsed = HushHourIssueDraftSchema.safeParse(draft);
    if (!parsed.success) {
      const next: Record<string, string> = {}; for (const issue of parsed.error.issues) next[String(issue.path[0])] ??= issue.message;
      setErrors(next); form.current?.querySelector<HTMLElement>(`[name="${Object.keys(next)[0]}"]`)?.focus(); return;
    }
    setErrors({});
    void act(async () => {
      const saved = await api.save(parsed.data); setRecord(saved); setDraft(parsed.data); setBaseline(parsed.data); setHistory(await api.list()); setNotice('问题已保存到本机。');
    });
  }
  return <Modal title={`Hush-Hour · ${value.environment === 'online' ? '正式网页' : '本地预览'} · ${record ? '已保存问题' : '记录问题'}`} titleIcon={<ClipboardText />} className="game-issue" close={close} dirty={dirty} busy={busy}>
    <form ref={form} className="game-issue-form" noValidate onSubmit={submit}>
      <div className="game-issue-scroll">
        {record ? <p className="game-issue-success"><CheckCircle weight="fill" />已归档 · {record.id}</p> : null}
        <details className="game-issue-history"><summary>最近问题 · {history.length} 条</summary>{history.length ? history.map(item => <button key={item.id} type="button" disabled={busy} onClick={() => { void act(async () => { setRecord(await api.read(item.id)); }); }}><span>{item.title}</span><small>{item.environment === 'online' ? '正式网页' : '本地预览'} · {item.id} · {new Date(item.createdAt).toLocaleString('zh-CN')}</small></button>) : <p>尚无已保存的问题。</p>}</details>
        {fields.map(field => <div key={field.name} className="game-issue-field"><label htmlFor={`hush-issue-${field.name}`}>{field.label}</label>
          {field.name === 'title' ? <input id={`hush-issue-${field.name}`} name={field.name} value={value[field.name]} maxLength={field.max} readOnly={!!record} disabled={busy} aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `hush-issue-${field.name}-error` : undefined} onChange={event => { const text = event.target.value; setDraft(previous => ({ ...previous, [field.name]: text })); setErrors(previous => ({ ...previous, [field.name]: '' })); }} /> :
            <textarea className="resize-none" id={`hush-issue-${field.name}`} name={field.name} rows={field.name === 'steps' ? 4 : 3} value={value[field.name]} maxLength={field.max} readOnly={!!record} disabled={busy} aria-invalid={!!errors[field.name]} aria-describedby={errors[field.name] ? `hush-issue-${field.name}-error` : undefined} onChange={event => { const text = event.target.value; setDraft(previous => ({ ...previous, [field.name]: text })); setErrors(previous => ({ ...previous, [field.name]: '' })); }} />}
          {errors[field.name] ? <p className="game-issue-field-error" id={`hush-issue-${field.name}-error`}>{errors[field.name]}</p> : null}
        </div>)}
        <div className="game-issue-section-heading"><h3>截图附件</h3>{!record ? <button type="button" disabled={busy || !canCapture} onClick={() => { void act(async () => { const image = await capture(); if (image) setDraft(previous => ({ ...previous, screenshotIds: [...previous.screenshotIds, image.id].slice(-6) })); }); }}><Camera />截图</button> : null}</div>
        <div className="game-issue-images">{images.map((image, index) => <div key={image.id}><IssueImage id={image.id} name={image.name} issueId={record?.id} />{!record ? <label className="game-issue-image-choice"><input type="checkbox" checked={draft.screenshotIds.includes(image.id)} disabled={busy || !draft.screenshotIds.includes(image.id) && draft.screenshotIds.length >= 6} onChange={event => { const checked = event.target.checked; setDraft(previous => ({ ...previous, screenshotIds: checked ? [...previous.screenshotIds, image.id] : previous.screenshotIds.filter(id => id !== image.id) })); }} />附带截图 {index + 1}</label> : null}</div>)}</div>
        {!images.length ? <p className="game-issue-empty">暂无截图。可以直接保存文字问题。</p> : null}
        <section className="game-issue-evidence"><h3>附带证据</h3>{value.environment === 'online' ? <p>正式网页运行日志尚未接入。</p> : <label><input type="checkbox" checked={value.includeLogs} disabled={busy || !!record} onChange={event => setDraft(previous => ({ ...previous, includeLogs: event.target.checked }))} /><span>构建日志 · 保存时快照</span></label>}</section>
        <details className="game-issue-context"><summary>{value.environment === 'online' ? '正式网页' : '本地预览'} · {value.viewport === 'fit' ? '跟随窗口' : value.viewport === 'desktop' ? '1440×1000' : '390×844'} · {Math.round(value.zoom * 100)}%</summary><dl><div><dt>页面</dt><dd>{value.pageUrl || '尚未打开'}</dd></div>{value.environment === 'online' ? <div><dt>正式地址</dt><dd>{value.siteUrl}</dd></div> : <div><dt>预览构建</dt><dd>{value.previewRevision.slice(0, 12) || '尚未载入'}</dd></div>}{record ? <div><dt>保存于</dt><dd>{new Date(record.createdAt).toLocaleString('zh-CN')}</dd></div> : null}</dl></details>
      </div>
      <footer className="game-issue-footer">
        {failure ? <p className="game-issue-field-error" role="alert">{failure}</p> : null}{notice ? <p className="game-issue-success" role="status">{notice}</p> : null}
        <div className="game-issue-save-heading"><strong>{record ? '保存位置' : '保存到本机'}</strong>{!record ? <small>提交后创建独立问题目录</small> : null}</div><code className="game-issue-path">{path || '正在读取保存位置…'}</code>
        <div className="game-issue-footer-actions"><button type="button" disabled={busy || !path} onClick={() => { void act(() => api.openFolder(record?.id)); }}><FolderOpen />打开文件夹</button>
          <button type="button" disabled={busy || !path} onClick={() => { void act(async () => { await window.workbench.clipboard.write(record ? hushHourIssueReport(record).slice(0, 19000) : path); setNotice(record ? '问题报告已复制。' : '保存路径已复制。'); }); }}><Copy />{record ? '复制报告' : '复制路径'}</button>
          {record ? <><button type="button" disabled={busy} onClick={() => { void act(async () => { const path = await api.export(record.id); if (path) setNotice(`已导出：${path}`); }); }}><DownloadSimple />导出 ZIP</button><button type="button" className="game-primary" disabled={busy} onClick={() => { if (!dirty) { const next = initial(); setDraft(next); setBaseline(next); setErrors({}); } setRecord(null); }}>{dirty ? '继续填写草稿' : '新问题'}</button></> : <button type="submit" className="game-primary" disabled={busy}>{busy ? '正在保存…' : '提交并保存'}</button>}
        </div>
      </footer>
    </form>
  </Modal>;
}
