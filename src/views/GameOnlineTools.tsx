import { useRef, useState } from 'react';
import { ArrowSquareOut, Camera, Circle, ClipboardText, Copy, Globe, PencilSimple, Plus, SidebarSimple, X } from '@phosphor-icons/react';
import { Modal, Select as GameSelect, errorText } from '../ui/controls';
import { GameOnlineUrlSchema, type GameArtifact, type GameOnlineState } from '../../shared/game-contracts';
import type { BrowserFrameState } from '../../shared/browser-contracts';

export function GameOnlineAddress({ url, close, save, variant = 'game' }: { url: string; close(): void; save(url: string): Promise<void>; variant?: 'game' | 'website' }) {
  const [draft, setDraft] = useState(url), [saving, setSaving] = useState(false), [error, setError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const website = variant === 'website', id = website ? 'hush-hour-online-url' : 'game-online-url';
  return <Modal title={website ? '设置正式网页地址' : '设置线上地址'} close={close} dirty={draft !== url} busy={website && saving} className="game-settings">
    <form noValidate onSubmit={event => {
      event.preventDefault();
      const parsed = GameOnlineUrlSchema.safeParse(draft);
      if (!parsed.success) { setError('请填写完整的 HTTP 或 HTTPS 地址，不包含账号密码。'); input.current?.focus(); return; }
      setSaving(true); setError('');
      void save(parsed.data).then(close, cause => setError(errorText(cause))).finally(() => setSaving(false));
    }}>
      <label htmlFor={id}>{website ? '正式网页地址' : '线上地址'}</label>
      <input ref={input} id={id} type="url" autoComplete="off" value={draft} readOnly={saving} placeholder={website ? 'https://你的域名/' : 'https://你的域名/游戏目录/'} aria-invalid={!!error} aria-describedby={error ? `${id}-help ${id}-error` : `${id}-help`} onChange={event => setDraft(event.target.value)} />
      <p id={`${id}-help`}>{website ? '支持完整页面地址或子目录。保存后打开正式网页；留空取消配置，原站点的浏览数据保留。' : '支持完整页面地址或子目录。保存后打开线上浏览器；留空取消配置，原站点的试玩数据保留。'}</p>
      {error ? <p className="game-error" id={`${id}-error`} role="alert">{error}</p> : null}
      <div className="actions"><button type="button" onClick={close}>取消</button><button type="submit" className="primary" disabled={saving}>{saving ? '正在保存…' : draft.trim() ? '保存并打开' : '保存'}</button></div>
    </form>
  </Modal>;
}

export function GameOnlineTools({ online, browser, profile, busy, notes, artifacts, edit, close, recordIssue, selectProfile, fresh, capture, copyReport, copyAddress, openExternal, openArtifact, removeArtifact, check, setNotes }: {
  online: GameOnlineState; browser: BrowserFrameState; profile: string; busy: boolean;
  notes: string; artifacts: GameArtifact[]; edit(): void; close(): void; recordIssue(): void; selectProfile(value: string): void;
  fresh(): void; capture(): void; copyReport(): void; copyAddress(): void; openExternal(): void;
  openArtifact(id: string): void; removeArtifact(id: string): void; check(): void; setNotes(value: string): void;
}) {
  const ready = !!online.url && !!browser.target && !browser.loading && !browser.error;
  return <aside id="game-test-panel" className="game-tests game-online-tools glass" aria-label="线上试玩工具">
    <div className="game-pane-heading"><strong><Globe />线上试玩工具 <small className="game-environment-label">正式环境</small></strong><button className="game-icon-button" aria-label="收起线上试玩工具" title="收起线上试玩工具" onClick={close}><SidebarSimple /></button></div>
    <div className="game-online-scroll">
      <section className="game-online-section">
        <div className="game-tools-heading"><h2>线上地址</h2><button className="game-text-button" onClick={edit}><PencilSimple />{online.url ? '编辑' : '设置'}</button></div>
        <div className="game-site-address"><span title={online.url}>{online.url || '尚未配置线上地址'}</span><button className="game-icon-button" disabled={!online.url || busy} onClick={copyAddress} aria-label="复制线上地址" title="复制线上地址"><Copy /></button></div>
        <p className={`game-online-status ${online.check?.status || ''}`} role="status"><Circle weight="fill" size={9} />{online.check?.message || (online.url ? '尚未检查访问' : '设置地址后即可独立试玩')}{online.check?.checkedAt ? <small>{new Date(online.check.checkedAt).toLocaleString('zh-CN')}</small> : null}</p>
      </section>
      <section className="game-online-section">
        <div className="game-tools-heading"><h2>试玩存档</h2></div>
        <GameSelect aria-label="线上试玩存档" value={profile} onChange={selectProfile} options={[{ value: 'keep', label: '保留线上试玩档' }, { value: 'fresh', label: '新档试玩（临时）' }]} />
        <p>{profile === 'keep' ? '与本地独立保存，刷新后继续进度。' : '当前使用临时新档，不覆盖保留的线上试玩档。'}</p>
        <button className="game-new-trial" disabled={!online.url || busy} onClick={fresh}><Plus />新档试玩</button>
      </section>
      <section className="game-online-section">
        <div className="game-tools-heading"><h2>问题记录</h2><button onClick={recordIssue}><ClipboardText />记录问题</button></div>
        <div className="game-capture-row"><button disabled={!ready || busy} onClick={capture}><Camera />截取当前页面</button><span>{artifacts.length ? `已添加 ${artifacts.length} 张截图` : '尚未添加截图'}</span></div>
        {artifacts.length ? <div className="game-issue-artifacts">{artifacts.map((item, index) => <span key={item.id}><button title={item.url} onClick={() => openArtifact(item.id)}>截图 {index + 1}</button><button title="从本次问题记录移除，不删除截图文件" aria-label={`移除截图 ${index + 1}`} onClick={() => removeArtifact(item.id)}><X /></button></span>)}</div> : null}
        <label htmlFor="game-online-notes" className="game-note-label">复现步骤 / 期望与实际表现</label>
        <textarea id="game-online-notes" className="resize-none" maxLength={4000} rows={4} value={notes} placeholder="记录复现步骤、期望与实际表现…" onChange={event => setNotes(event.target.value)} />
        <p>快捷备注仅在当前会话保留。点击「记录问题」可将描述和截图一起保存到本机。</p>
        <button className="game-primary game-copy-issue" disabled={!online.url || busy} onClick={copyReport}><ClipboardText />复制问题报告</button>
      </section>
      <details className="game-detail"><summary>线上检查</summary><p>检查配置地址的 HTTP 访问结果。本地案件规则与完整通关结果保留在「本地开发」。</p><button disabled={!online.url || online.check?.status === 'checking'} onClick={check}>{online.check?.status === 'checking' ? '正在检查…' : '检查线上访问'}</button>{online.check?.httpStatus ? <p>HTTP {online.check.httpStatus} · {online.check.url}</p> : null}</details>
      <details className="game-detail"><summary>版本与诊断</summary><p>发布版本：未接入。站点提供版本信息后可扩展读取。</p><p>当前页面：{browser.target?.url || '尚未打开'}</p><p>{browser.error ? `载入失败：${browser.error.description || browser.error.code}` : browser.loading ? '页面载入中…' : browser.target ? '页面已载入' : '等待配置地址'} · 缩放 {Math.round(browser.zoomFactor * 100)}%</p><button disabled={!online.url || busy} onClick={openExternal}><ArrowSquareOut />在外部浏览器打开</button></details>
    </div>
  </aside>;
}
