import { useEffect, useRef, useState } from 'react';
import type { CopyDraft } from '../../../shared/copy-contracts';
import { parseXhsNoteUrl } from '../xhs-publish';
import { errorText } from '../../../src/ui/controls';

type Target = ReturnType<typeof parseXhsNoteUrl> & { draftId: string; input: string };

/** One keyed instance per blog: unchecked input and late replies never move to another blog. */
export function PublishAssociation({ draft, writePending, onCommit, onPending, onOpenCreator }: {
  draft: CopyDraft;
  writePending: boolean;
  onCommit(id: string, url: string | null): Promise<boolean>;
  onPending(message: string): void;
  onOpenCreator(): void;
}) {
  const [input, setInput] = useState('');
  const [target, setTarget] = useState<Target | null>(null);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState('');
  const [formatError, setFormatError] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const changeRef = useRef<HTMLButtonElement>(null);
  const removeRef = useRef<HTMLButtonElement>(null);
  const removeCancelRef = useRef<HTMLButtonElement>(null);
  const prepared = useRef<Target | null>(null);
  const locked = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const linked = draft.xhsPublished;
  const title = draft.title || '未命名博客';
  const showInput = !linked || editing || input !== '' || target !== null;
  const state = formatError ? '链接格式不正确' : target ? '待确认' : linked ? '已关联 · 手动确认' : '尚未关联作品';

  const reset = (): void => {
    prepared.current = null;
    setTarget(null); setInput(''); setError(''); setFormatError(false);
    setEditing(false); setRemoving(false);
  };
  const cancel = (): void => {
    if (locked.current) return;
    reset();
    requestAnimationFrame(() => {
      if (mounted.current) (linked ? changeRef.current : inputRef.current)?.focus();
    });
  };
  const cancelRemoval = (): void => {
    if (locked.current) return;
    setRemoving(false);
    requestAnimationFrame(() => { if (mounted.current) removeRef.current?.focus(); });
  };
  const check = (): void => {
    if (locked.current) return;
    try {
      const next = { ...parseXhsNoteUrl(input), draftId: draft.id, input };
      prepared.current = next; setTarget(next); setError(''); setFormatError(false);
    } catch {
      prepared.current = null; setTarget(null); setFormatError(true);
      setError('请粘贴已发布作品的完整直链,支持 /explore/作品ID 或 /discovery/item/作品ID;不支持创作者后台首页或分享短链。');
      inputRef.current?.focus();
    }
  };
  const commit = async (remove = false): Promise<void> => {
    const next = prepared.current;
    if (locked.current || writePending || (!remove && (!next || next.draftId !== draft.id || next.input !== input))) return;
    // React's busy state alone does not guard repeated activations in the same event turn.
    locked.current = true; setBusy(true); setError('');
    try {
      if (!await onCommit(draft.id, remove ? null : next!.url)) return;
      if (mounted.current) {
        reset();
        onPending(remove ? '已移除此博客的作品关联,正文与线上作品未改变' : '作品链接已关联,来源为手动确认');
        // The new state may remove the confirmation button. Restore focus after it renders.
        requestAnimationFrame(() => {
          if (mounted.current) (remove ? inputRef.current : changeRef.current)?.focus();
        });
      }
    } catch (cause) {
      if (mounted.current) setError(errorText(cause) || '保存未确认,请重新检查当前关联后重试');
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const copy = async (): Promise<void> => {
    if (!linked) return;
    try { await window.workbench.clipboard.write(linked.url); onPending('作品链接已复制'); }
    catch (cause) { if (mounted.current) setError(errorText(cause) || '复制失败,请重试'); }
  };

  return (
    <section className="pub-linked" aria-label="发布后关联" aria-busy={busy}>
      <div className="copy-pub-head">
        <h2 className="copy-pub-title">发布后关联</h2>
        <span className={`pub-association-state${formatError ? ' bad' : target ? ' pending' : linked ? ' linked' : ''}`} role="status">{state}</span>
      </div>
      <p className="pub-tip">已发布后,关联当前博客与作品直链,方便以后查找。</p>
      <button type="button" className="btn btn-sec btn-sm" onClick={onOpenCreator}>在工作台打开小红书创作者中心</button>
      {linked && (
        <div className="pub-linked-record">
          <dl className="pub-association-details">
            <div><dt>本地博客</dt><dd>{title}</dd></div>
            <div><dt>作品 ID</dt><dd>{linked.remoteId}</dd></div>
            <div><dt>作品链接</dt><dd>{linked.url}</dd></div>
            <div><dt>来源</dt><dd>用户手动确认</dd></div>
            <div><dt>确认时间</dt><dd><time dateTime={linked.confirmedAt}>{new Date(linked.confirmedAt).toLocaleString('zh-CN')}</time></dd></div>
          </dl>
          <div className="pub-association-actions">
            <button type="button" className="btn btn-sec btn-sm" onClick={() => void copy()}>复制作品链接</button>
            <button ref={changeRef} type="button" className="btn btn-sec btn-sm" disabled={busy || showInput} onClick={() => {
              reset(); setEditing(true); requestAnimationFrame(() => inputRef.current?.focus());
            }}>更换关联</button>
            <button ref={removeRef} type="button" className="btn btn-sec btn-sm pub-remove" disabled={busy || writePending || showInput || removing} onClick={() => {
              setRemoving(true); setError('');
              requestAnimationFrame(() => { if (mounted.current) removeCancelRef.current?.focus(); });
            }}>移除关联</button>
          </div>
          {removing && (
            <div className="pub-remove-confirm" role="group" aria-label="移除关联确认" onKeyDown={(event) => {
              if (event.key === 'Escape' && !busy) { event.preventDefault(); cancelRemoval(); }
            }}>
              <p>只移除《{title}》的本机关联,不删除博客正文或线上作品。</p>
              <div className="pub-association-actions">
                <button ref={removeCancelRef} type="button" className="btn btn-sec btn-sm" disabled={busy} onClick={cancelRemoval}>取消</button>
                <button type="button" className="btn btn-sec btn-sm pub-remove" disabled={busy || writePending} onClick={() => void commit(true)}>确认移除关联</button>
              </div>
            </div>
          )}
        </div>
      )}
      {showInput && (
        <form className="pub-association-form" noValidate onSubmit={(event) => { event.preventDefault(); check(); }} onKeyDown={(event) => {
          if (event.key === 'Escape' && !busy) { event.preventDefault(); cancel(); }
        }}>
          <label htmlFor="pub-association-url">小红书已发布作品直链</label>
          <p className="pub-tip">当前本地博客:《{title}》</p>
          <p id="pub-association-help" className="pub-tip">仅检查本地链接格式,不访问平台核验作品。{linked ? '确认更换前,旧关联保持不变。' : '检查通过后,仍需你确认对应关系。'}</p>
          <div className="pub-linked-input">
            <input ref={inputRef} id="pub-association-url" type="url" placeholder="https://www.xiaohongshu.com/explore/..." value={input} disabled={busy}
              aria-invalid={formatError} aria-describedby={`pub-association-help${formatError ? ' pub-association-error' : ''}`} onChange={(event) => {
                prepared.current = null; setTarget(null); setInput(event.target.value); setError(''); setFormatError(false);
              }} />
            <button type="submit" className="btn btn-sec btn-sm" disabled={!input.trim() || busy}>检查链接格式</button>
          </div>
          {target && (
            <div className="pub-linked-preview">
              <p>请确认《{title}》对应以下作品。这里只检查了链接格式,未核验平台作品。</p>
              <dl className="pub-association-details">
                <div><dt>作品 ID</dt><dd>{target.remoteId}</dd></div>
                <div><dt>作品链接</dt><dd>{target.url}</dd></div>
              </dl>
              <div className="pub-association-actions">
                <button type="button" className="btn btn-pri btn-sm" disabled={busy || writePending} onClick={() => void commit()}>确认关联</button>
                <button type="button" className="btn btn-sec btn-sm" disabled={busy} onClick={cancel}>取消</button>
              </div>
            </div>
          )}
          {linked && !target && <button type="button" className="btn btn-sec btn-sm pub-association-cancel" disabled={busy} onClick={cancel}>取消</button>}
        </form>
      )}
      {error && <p id="pub-association-error" className="pub-association-error" role="alert" tabIndex={0}>{error}</p>}
      {busy && <p className="pub-tip" role="status">正在保存本机关联…</p>}
      {writePending && !busy && <p className="pub-tip" role="status">本机关联正在保存,完成后可确认当前关联。</p>}
      <p className="pub-association-retention">关联保存在本机,切页、正常重启后仍保留。修改本地博客不会修改线上作品。手动移除关联、删除博客或清理应用数据会影响保留状态。</p>
      <p className="pub-association-retention">不提供账号同步、作品抓取或自动发布;不自动检测线上删除或失效,不承诺链接永久有效。</p>
    </section>
  );
}
