import { useEffect, useRef, useState } from 'react';
import { ArrowClockwise, ArrowLeft, ArrowRight, ArrowSquareOut, CaretDown, CaretRight, CheckCircle, Circle, CornersIn, CornersOut, Desktop, FileText, FolderOpen, Globe, Play, Plus, SidebarSimple, Sparkle, Stop, TerminalWindow, DeviceMobile, WarningCircle } from '@phosphor-icons/react';
import { emptyBrowserFrame } from '../../shared/browser-contracts';
import { WEBSITE_COLLECTIONS, WebsiteSaveSchema, websitePreviewPath, type WebsiteCollection, type WebsiteContent, type WebsiteContentSummary, type WebsiteFields, type WebsiteSave, type WebsiteState } from '../../shared/personal-website-contracts';
import { localDay } from '../../shared/todo-contracts';
import { DatePicker, IconButton, Modal, Select as WebsiteSelect, Segmented, errorText } from '../ui/controls';
import { GamePreview, type PreviewApi } from './GameView';
import { GameOptionsMenu } from './GameOptionsMenu';
import { GameOnlineAddress } from './GameOnlineTools';
import { GameTerminalPanel } from './GameTerminal';
import './personal-website.css';

const api = () => window.workbench.personalWebsite;
const draftKey = 'personal-website-draft-v1';
const collectionOptions = Object.entries(WEBSITE_COLLECTIONS).map(([value, label]) => ({ value, label }));
const timestamp = (value?: number) => value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '尚未运行';
function initialFields(collection: WebsiteCollection, title: string): WebsiteFields {
  return collection === 'works' ? { title, description: '', year: new Date().getFullYear(), category: 'product', featured: false, order: 0 }
    : collection === 'blog' ? { title, summary: '', date: localDay(), tags: [] } : { title, summary: '', order: 0 };
}
function storedDraft(): WebsiteSave | undefined {
  try { const parsed = WebsiteSaveSchema.safeParse(JSON.parse(localStorage.getItem(draftKey) || 'null')); return parsed.success ? parsed.data : undefined; } catch { return undefined; }
}

export function PersonalWebsiteView({ active, onPending, onAskAI }: { active: boolean; onPending(message: string): void; onAskAI(prompt: string): void }) {
  const [state, setState] = useState<WebsiteState>();
  const [items, setItems] = useState<WebsiteContentSummary[]>([]), [document, setDocument] = useState<WebsiteContent>(), [draft, setDraft] = useState<WebsiteSave>();
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [failure, setFailure] = useState(''), [notice, setNotice] = useState('');
  const [previewMode, setPreviewMode] = useState<'split' | 'hidden' | 'expanded'>('split'), [compact, setCompact] = useState(false);
  const [checksOpen, setChecksOpen] = useState(false), [groups, setGroups] = useState<Record<WebsiteCollection, boolean>>({ works: true, blog: false, library: false });
  const [viewport, setViewport] = useState('website-desktop'), [environment, setEnvironment] = useState('local'), [onlineEntered, setOnlineEntered] = useState(false);
  const [browser, setBrowser] = useState(emptyBrowserFrame), [onlineBrowser, setOnlineBrowser] = useState(emptyBrowserFrame);
  const [cover, setCover] = useState(''), [coverFailure, setCoverFailure] = useState('');
  const [newOpen, setNewOpen] = useState(false), [addressOpen, setAddressOpen] = useState(false), [logs, setLogs] = useState<'dev' | 'build'>();
  const [difference, setDifference] = useState<{ before: string; after: string }>();
  const [discard, setDiscard] = useState<(() => void) | null>(null);
  const [terminalOpen, setTerminalOpen] = useState(false), [terminalEntered, setTerminalEntered] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const localPreview = useRef<PreviewApi>(null), onlinePreview = useRef<PreviewApi>(null), readSequence = useRef(0), form = useRef<HTMLFormElement>(null);
  const workspace = useRef<HTMLElement>(null), showPreview = useRef<HTMLButtonElement>(null), hidePreview = useRef<HTMLButtonElement>(null);
  const [sessionId] = useState(() => crypto.randomUUID());
  const dirty = !!draft && (!draft.version || !document || draft.version !== document.version || draft.body !== document.body || JSON.stringify(draft.fields) !== JSON.stringify(document.fields));
  const running = state?.service.phase === 'running', starting = state?.service.phase === 'starting', building = state?.build.phase === 'running';
  const collection = (draft?.id.split('/')[0] ?? 'works') as WebsiteCollection;
  const isOnline = environment === 'online', currentBrowser = isOnline ? onlineBrowser : browser, preview = isOnline ? onlinePreview : localPreview;
  const previewUrl = isOnline ? state?.onlineUrl || '' : state?.service.url ? new URL(websitePreviewPath(document), state.service.url).href : '';
  const previewVisible = previewMode !== 'hidden' && (!compact || previewMode === 'expanded');
  const checkStatus = building ? '构建中…' : state?.checks.phase === 'running' ? '检查中…' : state?.build.phase === 'failed' ? '构建失败' : state?.checks.phase === 'failed' ? '页面检查失败' : '';

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => { if (entry.contentRect.width > 0) setCompact(entry.contentRect.width < 900); });
    observer.observe(workspace.current!); return () => observer.disconnect();
  }, []);

  function changePreview(mode: typeof previewMode) {
    setPreviewMode(mode);
    requestAnimationFrame(() => (mode !== 'hidden' && (!compact || mode === 'expanded') ? hidePreview : showPreview).current?.focus());
  }

  useEffect(() => {
    let alive = true;
    const off = api().onChanged(value => { if (alive) setState(value); });
    void api().start().then(value => { if (alive) setState(value); }, error => { if (alive) setFailure(errorText(error)); });
    void (async () => {
      const restored = storedDraft();
      if (restored) {
        setDraft(restored); setDocument({ ...restored, version: '', collection: restored.id.split('/')[0] as WebsiteCollection, source: '' });
        setNotice('已恢复上次未保存的草稿。');
      }
      try {
        const list = await api().list(); if (!alive) return; setItems(list);
        const id = restored?.id || list.find(item => item.id === 'works/data-harness.md')?.id || list[0]?.id;
        if (id) {
          const content = restored && !restored.version ? { ...restored, collection: id.split('/')[0] as WebsiteCollection, source: '' } : await api().read(id);
          if (!alive) return;
          setDocument(content); setDraft(restored ?? { id: content.id, version: content.version, fields: content.fields, body: content.body });
          setGroups(previous => ({ ...previous, [content.collection]: true }));
          if (restored) setNotice('已恢复上次未保存的草稿。');
        }
      } catch (error) { if (alive) setFailure((restored ? '草稿已保留，读取项目原文件失败：' : '') + errorText(error)); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; off(); readSequence.current++; };
  }, []);
  useEffect(() => {
    if (loading || !draft) return;
    try { if (dirty && draft) localStorage.setItem(draftKey, JSON.stringify(draft)); else localStorage.removeItem(draftKey); }
    catch { setNotice('本机草稿暂存失败，请及时保存到项目。'); }
  }, [draft, dirty, loading]);
  useEffect(() => {
    let alive = true; setCover(''); setCoverFailure('');
    if (draft?.fields.cover) void api().coverPreview(draft.fields.cover).then(value => { if (alive) setCover(value); }, error => { if (alive) setCoverFailure(errorText(error)); });
    return () => { alive = false; };
  }, [draft?.fields.cover]);

  async function act<T,>(action: () => Promise<T>): Promise<T | undefined> {
    setBusy(true); setFailure('');
    try { return await action(); } catch (error) { setFailure(errorText(error)); return undefined; } finally { setBusy(false); }
  }
  function guard(action: () => void) { if (dirty) setDiscard(() => action); else action(); }
  async function select(id: string) {
    const sequence = ++readSequence.current; setLoading(true); setFailure('');
    try {
      const content = await api().read(id); if (sequence !== readSequence.current) return;
      setDocument(content); setDraft({ id, version: content.version, fields: content.fields, body: content.body }); setFieldErrors({}); setNotice('');
    } catch (error) { if (sequence === readSequence.current) setFailure(errorText(error)); }
    finally { if (sequence === readSequence.current) setLoading(false); }
  }
  function update(key: keyof WebsiteFields, value: WebsiteFields[keyof WebsiteFields]) {
    setDraft(previous => previous ? { ...previous, fields: { ...previous.fields, [key]: value } } : previous);
    setFieldErrors(previous => { const next = { ...previous }; delete next[key]; return next; }); setNotice('');
  }
  async function save() {
    if (!draft || busy) return;
    const errors: Record<string, string> = {};
    if (!draft.fields.title.trim()) errors.title = '请填写标题。';
    if (collection === 'works' && (!Number.isInteger(draft.fields.year) || !draft.fields.year || draft.fields.year < 1 || draft.fields.year > 9999)) errors.year = '请填写 1–9999 之间的年份。';
    if (collection === 'blog' && !draft.fields.date) errors.date = '请选择日期。';
    setFieldErrors(errors);
    if (Object.keys(errors).length) { requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()); return; }
    const saved = await act(() => api().save(collection === 'blog' ? { ...draft, fields: { ...draft.fields, tags: draft.fields.tags?.map(tag => tag.trim()).filter(Boolean) } } : draft));
    if (saved) {
      setDocument(saved); setDraft({ id: saved.id, version: saved.version, fields: saved.fields, body: saved.body });
      setNotice('已保存到项目，开发预览自动更新。');
      try { setItems(await api().list()); } catch (error) { setFailure('内容已保存，但列表刷新失败：' + errorText(error)); }
    }
  }
  function newContent(target: WebsiteCollection, title: string, filename: string) {
    const id = `${target}/${filename.replace(/\.md$/i, '')}.md`, content: WebsiteContent = { id, collection: target, version: '', fields: initialFields(target, title), body: '', source: '' };
    setDocument(content); setDraft({ id, version: '', fields: content.fields, body: '' }); setGroups(previous => ({ ...previous, [target]: true })); setNewOpen(false); setFieldErrors({}); setNotice('新内容尚未保存到项目。'); setFailure('');
  }
  const textField = (key: keyof WebsiteFields, label: string, multiline = false) => <div className={`personal-field${multiline ? ' personal-field-wide' : ''}`}>
    <label htmlFor={`personal-${key}`}>{label}</label>
    {multiline ? <textarea className="resize-none" id={`personal-${key}`} rows={3} value={String(draft?.fields[key] ?? '')} onChange={event => update(key, event.target.value)} /> : <input id={`personal-${key}`} value={String(draft?.fields[key] ?? '')} onChange={event => update(key, event.target.value)} aria-invalid={!!fieldErrors[key]} aria-describedby={fieldErrors[key] ? `personal-${key}-error` : undefined} />}
    {fieldErrors[key] ? <span className="personal-field-error" id={`personal-${key}-error`}>{fieldErrors[key]}</span> : null}
  </div>;

  return <section ref={workspace} className="view on media-browser-view game-workspace personal-workspace" aria-label="个人网站内容工作室" data-preview={previewMode} data-preview-visible={previewVisible} onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented && previewMode === 'expanded' && !(event.target as HTMLElement).closest('dialog, [popover]')) { event.preventDefault(); changePreview('split'); } }}>
    <header className="game-project personal-project glass">
      <Globe className="personal-project-icon" aria-hidden="true" />
      <div className="game-project-name" title={state?.root || 'C:/Myself/Personal_Website'}><div className="game-project-heading"><strong>个人网站</strong><span className={`game-service ${running ? 'is-ready' : ''}`} data-phase={state?.service.phase} role="status" title={state?.service.message}><Circle weight="fill" size={9} />{state?.service.message || '正在读取项目…'}</span></div></div>
      {checkStatus ? <button type="button" className="personal-check-status" data-failed={!building && state?.checks.phase !== 'running'} onClick={() => setChecksOpen(true)}>{building || state?.checks.phase === 'running' ? <Circle weight="fill" /> : <WarningCircle />}{checkStatus}</button> : null}
      <div className="game-project-actions"><button type="button" className="game-primary" disabled={busy || starting} onClick={() => { void act(async () => setState(await (running ? api().stop() : api().start()))); }}>{running ? <Stop /> : <Play />}{running ? '停止' : starting ? '正在启动…' : '启动本地'}</button>
        <button type="button" aria-expanded={terminalOpen} aria-controls="personal-site-terminal" onClick={() => { setTerminalEntered(true); setTerminalOpen(value => !value); }}><TerminalWindow />终端</button>
        <GameOptionsMenu kind="project" active={active} label="个人网站更多功能">{close => <>
          <button type="button" role="menuitem" onClick={() => { close(); setChecksOpen(true); }}><CheckCircle />网站检查</button>
          <button type="button" role="menuitem" onClick={() => { close(); void act(() => api().openFolder()); }}><FolderOpen />打开项目目录</button>
          <button type="button" role="menuitem" onClick={() => { close(); setAddressOpen(true); }}><Globe />设置正式网页地址</button>
          <button type="button" role="menuitem" onClick={() => { close(); setLogs('dev'); }}><TerminalWindow />查看开发日志</button>
          <button type="button" role="menuitem" disabled={!document || busy} onClick={() => { close(); guard(() => { if (document) void select(document.id); }); }}><ArrowClockwise />重新读取当前内容</button>
        </>}</GameOptionsMenu>
      </div>
    </header>
    {failure ? <div className="personal-error" role="alert"><WarningCircle /><span>{failure}</span><button type="button" onClick={() => setFailure('')}>收起</button></div> : null}
    <div className="personal-body">
      <section className="personal-content glass" aria-label="网站内容编辑" hidden={previewMode === 'expanded'} inert={previewMode === 'expanded'}>
        <aside className="personal-tree" aria-label="网站内容目录"><div className="personal-tree-heading"><strong>网站内容</strong><IconButton label="新建内容" disabled={busy || loading} onClick={() => guard(() => setNewOpen(true))}><Plus /></IconButton></div>
          {collectionOptions.map(({ value, label }) => { const key = value as WebsiteCollection, entries = items.filter(item => item.collection === key); return <div className="personal-tree-group" key={key}>
            <button type="button" className="personal-folder" aria-expanded={groups[key]} onClick={() => setGroups(previous => ({ ...previous, [key]: !previous[key] }))}>{groups[key] ? <CaretDown /> : <CaretRight />}{label}{entries.length ? <span>{entries.length}</span> : null}</button>
            {groups[key] ? <div className="personal-tree-items">{entries.map(item => <button type="button" key={item.id} disabled={busy || loading} aria-current={draft?.id === item.id ? 'true' : undefined} title={`src/content/${item.id}`} onClick={() => { if (draft?.id !== item.id) guard(() => { void select(item.id); }); }}><FileText /><span>{item.title}</span>{item.error ? <WarningCircle /> : null}</button>)}{!entries.length ? <p>暂无{label}，可新建内容。</p> : null}</div> : null}
          </div>; })}
        </aside>
        <div className="personal-editor">
          <header className="personal-editor-heading"><div className="personal-editor-identity"><div><strong>{draft ? `${WEBSITE_COLLECTIONS[collection]} / ${draft.fields.title || '未命名'}` : '内容编辑'}</strong>{draft ? <span className="personal-save-state" data-dirty={dirty} role="status"><Circle weight="fill" size={7} />{busy ? '处理中…' : dirty ? '未保存' : '已保存'}</span> : null}</div>{draft ? <span title={`src/content/${draft.id}`}>src/content/{draft.id}</span> : null}</div><button ref={showPreview} type="button" className="personal-show-preview" hidden={previewVisible} aria-controls="personal-site-preview" aria-expanded={previewVisible} onClick={() => changePreview(compact ? 'expanded' : 'split')}><SidebarSimple />显示预览</button></header>
          {loading ? <div className="personal-empty" role="status">正在读取内容…</div> : draft && document ? <>
            <form ref={form} id="personal-content-form" className="personal-form" noValidate onSubmit={event => { event.preventDefault(); void save(); }}>
              <fieldset disabled={busy}>
                {textField('title', '标题')}
                {textField(collection === 'works' ? 'description' : 'summary', collection === 'works' ? '简介' : '摘要', true)}
                {collection === 'works' ? <div className="personal-field-pair"><div className="personal-field"><label htmlFor="personal-category">类别</label><WebsiteSelect id="personal-category" value={draft.fields.category ?? 'product'} onChange={value => update('category', value as WebsiteFields['category'])} options={[{ value: 'product', label: '产品' }, { value: 'game', label: '游戏' }, { value: 'skills', label: 'Skills' }]} /></div><div className="personal-field"><label htmlFor="personal-year">年份</label><input id="personal-year" type="number" value={draft.fields.year ?? ''} onChange={event => update('year', event.target.value === '' ? undefined : Number(event.target.value))} aria-invalid={!!fieldErrors.year} aria-describedby={fieldErrors.year ? 'personal-year-error' : undefined} />{fieldErrors.year ? <span className="personal-field-error" id="personal-year-error">{fieldErrors.year}</span> : null}</div></div> : <div className="personal-field"><label htmlFor="personal-date">日期{collection === 'library' ? '（可选）' : ''}</label><DatePicker id="personal-date" value={draft.fields.date || ''} onChange={value => update('date', value)} aria-invalid={!!fieldErrors.date} aria-describedby={fieldErrors.date ? 'personal-date-error' : undefined} />{fieldErrors.date ? <span className="personal-field-error" id="personal-date-error">{fieldErrors.date}</span> : null}</div>}
                {collection === 'blog' ? <div className="personal-field"><label htmlFor="personal-tags">标签</label><input id="personal-tags" value={(draft.fields.tags ?? []).join('，')} onChange={event => update('tags', event.target.value.split(/[,，]/))} placeholder="用逗号分隔标签" /></div> : null}
                {collection !== 'blog' ? <div className="personal-cover-field"><span>封面</span><div className="personal-cover-row">{cover ? <img src={cover} alt="当前内容封面" /> : <div className="personal-cover-empty"><FileText /><span>{draft.fields.cover ? '外部图片' : '尚未设置封面'}</span></div>}<button type="button" onClick={() => { void act(async () => { const result = await api().chooseCover(); if (result) { update('cover', result.path); setCover(result.preview); } }); }}><FolderOpen />更换图片</button></div>{coverFailure ? <p className="personal-field-error">{coverFailure}</p> : null}</div> : null}
                {collection === 'works' ? <label className="personal-featured"><input type="checkbox" checked={!!draft.fields.featured} onChange={event => update('featured', event.target.checked)} />首页展示</label> : null}
                <details className="personal-extra"><summary>更多内容信息</summary>{collection === 'works' ? textField('link', '作品链接') : collection === 'library' ? <>{textField('titleEn', '英文标题')}{textField('board', '栏目')}{textField('topic', '主题')}{textField('section', '分组')}</> : <p>标签和日期会随正文一起保存。</p>}{collection !== 'blog' ? <>{textField('cover', '封面路径')}<div className="personal-field"><label htmlFor="personal-order">排序</label><input id="personal-order" type="number" value={draft.fields.order ?? 0} onChange={event => update('order', Number(event.target.value))} /></div></> : null}</details>
                <div className="personal-body-heading"><label htmlFor="personal-body">正文（Markdown）</label><button type="button" disabled={!draft.body.trim()} onClick={() => onAskAI(`请润色以下个人网站${WEBSITE_COLLECTIONS[collection]}的 Markdown 正文，保留事实、链接和格式，直接给出可复制的建议稿。标题：${draft.fields.title}\n\n${draft.body.slice(0, 16000)}`)}><Sparkle />AI 润色</button></div>
                <textarea id="personal-body" className="personal-markdown resize-none" value={draft.body} onChange={event => { setDraft(previous => previous ? { ...previous, body: event.target.value } : previous); setNotice(''); }} spellCheck={false} />
              </fieldset>
            </form>
            <footer className="personal-editor-footer"><span role="status">{notice || '保存到本地项目，开发预览自动更新。'}</span><div><button type="submit" form="personal-content-form" className="personal-primary" disabled={busy || !dirty} aria-busy={busy}>{busy ? '处理中…' : '保存到项目'}</button><button type="button" disabled={busy || !dirty} onClick={() => { void act(async () => setDifference(await api().previewSave(draft))); }}>查看改动</button></div></footer>
          </> : <div className="personal-empty"><FileText size={32} /><h2>从内容开始</h2><p>选择作品、博客或文库，开始编辑。</p><button type="button" onClick={() => setNewOpen(true)}><Plus />新建内容</button></div>}
        </div>
      </section>
      <section id="personal-site-preview" className="personal-preview glass" aria-label="个人网站实时预览" hidden={!previewVisible} inert={!previewVisible}>
        <header className="personal-preview-heading"><strong>{isOnline ? '正式网页' : '实时预览'}</strong><Segmented aria-label="预览设备" value={viewport} onChange={setViewport} options={[{ value: 'website-desktop', label: '桌面', icon: <Desktop /> }, { value: 'narrow', label: '手机', icon: <DeviceMobile /> }]} /><button type="button" className="personal-online" aria-pressed={isOnline} title={isOnline ? '返回本地开发预览' : state?.onlineUrl || '尚未配置正式网页，点击设置地址'} onClick={() => { if (!state?.onlineUrl) setAddressOpen(true); else { setEnvironment(isOnline ? 'local' : 'online'); setOnlineEntered(true); } }}>{isOnline ? '开发预览' : '正式网页'}</button><button type="button" className="game-icon-button" aria-label={previewMode === 'expanded' ? '返回编辑' : '展开预览'} title={previewMode === 'expanded' ? '返回编辑' : '展开预览'} aria-pressed={previewMode === 'expanded'} onClick={() => changePreview(previewMode === 'expanded' ? 'split' : 'expanded')}>{previewMode === 'expanded' ? <CornersIn /> : <CornersOut />}</button><button ref={hidePreview} type="button" className="game-icon-button" aria-label="收起预览" title="收起预览" aria-controls="personal-site-preview" aria-expanded={previewVisible} onClick={() => changePreview('hidden')}><SidebarSimple /></button></header>
        <div className="game-preview-toolbar"><button type="button" className="game-icon-button" title="后退" aria-label="后退" disabled={!currentBrowser.canGoBack} onClick={() => preview.current?.back()}><ArrowLeft /></button><button type="button" className="game-icon-button" title="前进" aria-label="前进" disabled={!currentBrowser.canGoForward} onClick={() => preview.current?.forward()}><ArrowRight /></button><button type="button" className="game-icon-button" title="刷新预览" aria-label="刷新预览" disabled={!previewUrl} onClick={() => preview.current?.reload()}><ArrowClockwise /></button><span className="game-address" title={currentBrowser.target?.url || previewUrl}>{currentBrowser.target?.url || previewUrl || '开发预览未启动'}</span><button type="button" className="game-icon-button" title="在外部浏览器打开" aria-label="在外部浏览器打开" disabled={!previewUrl} onClick={() => { void act(() => api().openExternal(currentBrowser.target?.url || previewUrl)); }}><ArrowSquareOut /></button></div>
        <div className="personal-preview-surface" hidden={isOnline} inert={isOnline}>{running && state ? <GamePreview url={new URL(websitePreviewPath(document), state.service.url).href} workspace="personal-website" tabId={`personal-website-${sessionId}`} viewport={viewport} apiRef={localPreview} onState={setBrowser} /> : <div className="personal-empty"><Globe size={40} /><h2>个人网站</h2><p>{state?.service.message || '正在读取项目…'}</p><button type="button" disabled={starting || busy} onClick={() => { void act(async () => setState(await api().start())); }}><Play />启动开发预览</button><button type="button" onClick={() => setLogs('dev')}>查看开发日志</button></div>}</div>
        <div className="personal-preview-surface" hidden={!isOnline} inert={!isOnline}>{onlineEntered && state?.onlineUrl ? <GamePreview url={state.onlineUrl} workspace="personal-website-online" tabId={`personal-website-online-${sessionId}`} viewport={viewport} apiRef={onlinePreview} onState={setOnlineBrowser} /> : null}</div>
        {!isOnline && document?.version === '' ? <p className="personal-preview-note" role="status">新内容尚未保存，当前显示栏目页；保存后预览会更新。</p> : null}
        {currentBrowser.error ? <p className="personal-field-error" role="alert">页面载入失败：{currentBrowser.error.description}</p> : null}
      </section>
    </div>
    {terminalEntered ? <GameTerminalPanel id="personal-site-terminal" bridge={api().terminal} active={active} open={terminalOpen} close={() => setTerminalOpen(false)} onPending={onPending} /> : null}
    {checksOpen ? <Modal title="网站检查" className="personal-checks-drawer" close={() => setChecksOpen(false)} subhead={<p>构建与页面可访问性分别检查，结果来自实际运行。</p>}>
      <div className="personal-checks">
        {failure ? <p className="personal-field-error" role="alert">{failure}</p> : null}
        <section className="personal-check-block"><div><strong>构建检查</strong><span role="status" data-phase={state?.build.phase}>{state?.build.message || '尚未构建'}</span></div><button type="button" disabled={building} aria-busy={building} onClick={() => { setFailure(''); void api().build().then(setState, error => setFailure(errorText(error))); }}><Play />{building ? '正在构建…' : '运行构建'}</button>{building ? <button type="button" onClick={() => { void act(() => api().cancelBuild()); }}>取消构建</button> : null}<small>上次完成：{timestamp(state?.build.finishedAt)}</small><button type="button" onClick={() => setLogs('build')}>查看构建日志</button></section>
        <section className="personal-check-block"><div><strong>页面可访问性</strong><span role="status" data-phase={state?.checks.phase}>{state?.checks.phase === 'running' ? '正在检查…' : state?.checks.phase === 'passed' ? '全部通过' : state?.checks.phase === 'failed' ? '检查未通过' : '尚未运行'}</span></div><button type="button" disabled={!running || state?.checks.phase === 'running'} aria-busy={state?.checks.phase === 'running'} onClick={() => { setFailure(''); void api().checkPages().then(setState, error => setFailure(errorText(error))); }}><ArrowClockwise />{state?.checks.phase === 'running' ? '正在检查…' : '检查页面'}</button><small>上次完成：{timestamp(state?.checks.finishedAt)}</small>
          {state?.checks.results.map(item => <div className="personal-check-result" data-status={item.status} key={item.path}>{item.status === 'passed' ? <CheckCircle /> : <WarningCircle />}<span>{item.label}<small>{item.message}</small></span></div>)}
          <p>验证页面 HTTP 响应，不代表布局、交互或全部链接已通过测试。</p>
        </section>
      </div><footer className="personal-checks-footer"><button type="button" onClick={() => setChecksOpen(false)}>关闭</button></footer>
    </Modal> : null}
    {newOpen ? <NewWebsiteContent close={() => setNewOpen(false)} create={newContent} existing={items.map(item => item.id)} /> : null}
    {discard ? <Modal title="放弃当前未保存的修改？" className="personal-discard-modal" close={() => setDiscard(null)}><p>切换内容前，可以继续编辑并保存当前草稿。</p><div className="actions"><button type="button" autoFocus onClick={() => setDiscard(null)}>继续编辑</button><button type="button" className="danger" onClick={() => { const next = discard; setDiscard(null); next(); }}>放弃修改</button></div></Modal> : null}
    {addressOpen ? <GameOnlineAddress variant="website" url={state?.onlineUrl || ''} close={() => setAddressOpen(false)} save={async url => { const next = await api().configureOnline(url); setState(next); setOnlineBrowser(emptyBrowserFrame()); setEnvironment(next.onlineUrl ? 'online' : 'local'); setOnlineEntered(!!next.onlineUrl); }} /> : null}
    {logs ? <Modal title={logs === 'dev' ? '个人网站 · 开发日志' : '个人网站 · 构建日志'} className="game-document" close={() => setLogs(undefined)}><p>{logs === 'dev' ? state?.service.message : state?.build.message}</p><pre className="personal-log">{(logs === 'dev' ? state?.service.output : state?.build.output) || '尚无日志。'}</pre></Modal> : null}
    {difference ? <Modal title="查看本次改动" className="personal-diff-modal" close={() => setDifference(undefined)}><p>以下为文件保存前后的完整内容；关闭此窗口不会写入文件。</p><div className="personal-diff"><section><h3>修改前</h3><pre>{difference.before || '新建文件'}</pre></section><section><h3>修改后</h3><pre>{difference.after}</pre></section></div></Modal> : null}
  </section>;
}

function NewWebsiteContent({ close, create, existing }: { close(): void; create(collection: WebsiteCollection, title: string, filename: string): void; existing: string[] }) {
  const [collection, setCollection] = useState<WebsiteCollection>('works'), [title, setTitle] = useState(''), [filename, setFilename] = useState(''), [error, setError] = useState('');
  const name = filename || title.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[. ]+$/g, '');
  return <Modal title="新建网站内容" close={close} dirty={!!title || !!filename}><form noValidate className="personal-new-form" onSubmit={event => { event.preventDefault(); const id = `${collection}/${name.replace(/\.md$/i, '')}.md`; const parsed = WebsiteSaveSchema.shape.id.safeParse(id); if (!title.trim() || !name || !parsed.success) { setError('请填写标题和有效文件名；文件名可使用中文、英文与短横线。'); return; } if (existing.includes(id)) { setError('同名内容已存在，请更换文件名。'); return; } create(collection, title.trim(), name); }}>
    <label htmlFor="personal-new-collection">内容类型</label><WebsiteSelect id="personal-new-collection" value={collection} onChange={value => setCollection(value as WebsiteCollection)} options={collectionOptions} />
    <label htmlFor="personal-new-title">标题</label><input id="personal-new-title" autoFocus value={title} onChange={event => { setTitle(event.target.value); setError(''); }} aria-invalid={!!error && !title.trim()} />
    <label htmlFor="personal-new-filename">文件名</label><input id="personal-new-filename" value={filename} placeholder={name || '例如 my-first-post'} onChange={event => { setFilename(event.target.value); setError(''); }} /><p>src/content/{collection}/{name || '文件名'}.md</p>
    {error ? <p className="personal-field-error" role="alert">{error}</p> : null}<div className="actions"><button type="submit" className="personal-primary">开始编辑</button></div>
  </form></Modal>;
}
