import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Check, PaperPlaneTilt, Plus, TrashSimple } from '@phosphor-icons/react';
import {
  copyStoreDataSchema, XHS_BODY_LIMIT, XHS_TITLE_LIMIT,
  type CopyDraft, type CopyStoreData,
} from '../../../shared/copy-contracts';
import type { CopySource } from '../../../shared/todo-contracts';
import { errorText } from '../../todo/ui/ui';

const wb = window.workbench;
const CUR_KEY = 'wb.copy.curDraftId';

const charCount = (text: string): number => [...text.trim()].length;
const snippetOf = (body: string): string => [...body.replace(/#[^\s#]+/g, '').trim()].slice(0, 32).join('');

function fmtTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const hhmm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return d.toDateString() === now.toDateString()
    ? hhmm
    : `${d.getMonth() + 1}月${d.getDate()}日 ${hhmm}`;
}

export function CopyView({ onPending, onCurrentDraft, onSaveState, requestedDraftId, requestedSource, onSourceLocated, onGoPublish }: {
  onPending(message: string): void;
  /** 向外壳上报当前草稿(id/标题),供 AI 面板绑定写作会话 */
  onCurrentDraft(draft: { id: string; title: string } | null): void;
  onSaveState(state: { id: string | null; status: 'saved' | 'saving' | 'error' }): void;
  requestedDraftId?: string | null;
  requestedSource?: CopySource & { nonce: number } | null;
  onSourceLocated(): void;
  /** 跳转「图文发布」二级页(当前草稿经 localStorage 交接) */
  onGoPublish(): void;
}) {
  const [storeData, setStoreData] = useState<CopyStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'error'>('saved');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const removeTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<{ id: string; title: string; body: string; platform: 'xiaohongshu' } | null>(null);
  const handledRequest = useRef<string | null>(null);
  const handledSource = useRef(0);
  // 编辑器即时值(stateRef 供防抖保存与跨事件读取,避免闭包拿到旧值)
  const stateRef = useRef({ curId, title, body });
  stateRef.current = { curId, title, body };

  const flushSave = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    window.clearTimeout(saveTimer.current);
    if (stateRef.current.curId === pending.id) setSaveStatus('saving');
    try {
      const next = copyStoreDataSchema.parse(await wb.copy.save(pending));
      setStoreData(next);
      const saved = next.drafts.find((d) => d.id === pending.id);
      if (saved && stateRef.current.curId === pending.id && !pendingRef.current) {
        setSavedAt(saved.updatedAt);
        setSaveStatus('saved');
        onSaveState({ id: pending.id, status: 'saved' });
      }
    } catch (error) {
      const hasNewerPending = Boolean(pendingRef.current);
      if (!pendingRef.current) pendingRef.current = pending;
      if (stateRef.current.curId === pending.id && !hasNewerPending) {
        setSaveStatus('error');
        onSaveState({ id: pending.id, status: 'error' });
      }
      onPending(errorText(error) || '保存失败,请重试');
    }
  }, [onPending, onSaveState]);

  const queueSave = useCallback((id: string, nextTitle: string, nextBody: string): void => {
    pendingRef.current = { id, title: nextTitle, body: nextBody, platform: 'xiaohongshu' };
    setSaveStatus('saving');
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 600);
  }, [flushSave]);

  const openDraft = useCallback((draft: CopyDraft | undefined): void => {
    if (draft) {
      setCurId(draft.id);
      setTitle(draft.title);
      setBody(draft.body);
      setSavedAt(draft.updatedAt);
      setSaveStatus('saved');
      localStorage.setItem(CUR_KEY, draft.id);
    } else {
      setCurId(null);
      setTitle('');
      setBody('');
      setSavedAt(null);
      setSaveStatus('saved');
      localStorage.removeItem(CUR_KEY);
    }
    setConfirmRemove(null);
  }, []);

  // 首次加载:草稿库(AI 可用性由 AI 面板自行处理)
  useEffect(() => {
    const wantedId = requestedDraftId ?? localStorage.getItem(CUR_KEY);
    void wb.copy.list().then((raw) => {
      const data = copyStoreDataSchema.parse(raw);
      setStoreData(data);
      openDraft(data.drafts.find((d) => d.id === wantedId) ?? data.drafts[0]);
    }).catch((error: unknown) => setLoadError(errorText(error) || '草稿库读取失败,请重启应用'));
    return () => { if (pendingRef.current) void flushSave(); window.clearTimeout(saveTimer.current); window.clearTimeout(removeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!requestedDraftId || !storeData || handledRequest.current === requestedDraftId || curId === requestedDraftId) return;
    const target = storeData.drafts.find(draft => draft.id === requestedDraftId);
    if (!target) return;
    handledRequest.current = requestedDraftId;
    void flushSave().then(() => openDraft(target));
  }, [requestedDraftId, storeData, curId, flushSave, openDraft]);

  useEffect(() => {
    if (!requestedSource || handledSource.current === requestedSource.nonce || curId !== requestedSource.draftId) return;
    handledSource.current = requestedSource.nonce;
    if (body.slice(requestedSource.start, requestedSource.end) !== requestedSource.text) {
      onPending('引用的原文已变化，无法定位原选区');
      onSourceLocated();
      return;
    }
    requestAnimationFrame(() => {
      const editor = document.getElementById('copy-body') as HTMLTextAreaElement | null;
      editor?.focus();
      editor?.setSelectionRange(requestedSource.start, requestedSource.end);
      onSourceLocated();
    });
  }, [requestedSource, curId, body, onPending, onSourceLocated]);

  // 向外壳上报当前草稿,供 AI 面板绑定写作会话
  useLayoutEffect(() => {
    onCurrentDraft(curId ? { id: curId, title } : null);
  }, [curId, title, onCurrentDraft]);
  useLayoutEffect(() => { onSaveState({ id: curId, status: saveStatus }); }, [curId, saveStatus, onSaveState]);

  // AI 面板应用建议后主进程广播 copy:changed:以主进程版本为准刷新编辑器
  // (应用即「用建议替换正文」;期间本地未保存的改动会被丢弃,与确认卡语义一致)
  useEffect(() => {
    return wb.copy.onChanged(() => {
      pendingRef.current = null;
      window.clearTimeout(saveTimer.current);
      void wb.copy.list().then((raw) => {
        const data = copyStoreDataSchema.parse(raw);
        setStoreData(data);
        const cur = stateRef.current.curId;
        if (!cur) return;
        const fresh = data.drafts.find((d) => d.id === cur);
        if (fresh) { setTitle(fresh.title); setBody(fresh.body); setSavedAt(fresh.updatedAt); setSaveStatus('saved'); }
      }).catch(() => undefined);
    });
  }, []);

  const drafts = storeData?.drafts ?? [];
  const curDraft = drafts.find((d) => d.id === curId);
  const bodyCount = charCount(body);
  const titleCount = charCount(title);

  const createDraft = (): void => {
    void (async () => {
      await flushSave();
      try {
        const next = copyStoreDataSchema.parse(await wb.copy.save({ title: '', body: '', platform: 'xiaohongshu' }));
        setStoreData(next);
        openDraft(next.drafts[0]);
      } catch (error) { onPending(errorText(error) || '新建失败,请重试'); }
    })();
  };

  const removeDraft = (id: string): void => {
    if (confirmRemove !== id) {
      setConfirmRemove(id);
      window.clearTimeout(removeTimer.current);
      removeTimer.current = window.setTimeout(() => setConfirmRemove(null), 3000);
      return;
    }
    window.clearTimeout(removeTimer.current);
    setConfirmRemove(null);
    void wb.copy.remove(id).then((raw) => {
      const next = copyStoreDataSchema.parse(raw);
      setStoreData(next);
      onPending('已删除');
      if (stateRef.current.curId === id) openDraft(next.drafts[0]);
    }).catch((error: unknown) => onPending(errorText(error) || '删除失败,请重试'));
  };

  // 发布流程已独立到「图文发布」二级页;此处仅负责把当前草稿交接过去
  const goPublish = (): void => {
    if (!curId) return;
    localStorage.setItem('wb.copy.pubDraftId', curId);
    onGoPublish();
  };

  return (
    <div className="copy-wrap">
      {loadError && <div className="todo-load-error" role="alert">{loadError}</div>}

      {/* 左:草稿列表 */}
      <section className="panel glass copy-list" aria-label="博客列表">
        <div className="phead">
          <span className="ptitle">我的博客</span>
          <span className="copy-count">{drafts.length}</span>
          <button className="btn btn-pri btn-sm copy-new" onClick={createDraft} title="新建一篇博客">
            <Plus weight="bold" /> 新建
          </button>
        </div>
        <div className="copy-items">
          {drafts.length === 0 && (
            <div className="copy-none">还没有博客,点「新建」开始写第一篇心得。</div>
          )}
          {drafts.map((d) => (
            <div key={d.id} className={d.id === curId ? 'copy-item on' : 'copy-item'}>
              <button
                type="button"
                className="copy-item-open"
                aria-current={d.id === curId ? 'true' : undefined}
                title={d.title || '未命名博客'}
                onClick={() => { if (d.id !== stateRef.current.curId) { void flushSave().then(() => openDraft(d)); } }}
              >
                <span className="copy-item-title">{d.title || '未命名博客'}</span>
                <span className="copy-item-snip">{snippetOf(d.body) || '空博客'}</span>
                <span className="copy-item-time">{fmtTime(d.updatedAt)}</span>
              </button>
              <button
                className={confirmRemove === d.id ? 'copy-del sure' : 'copy-del'}
                title={confirmRemove === d.id ? '再点一次确认删除' : '删除博客'}
                onClick={(e) => { e.stopPropagation(); removeDraft(d.id); }}
              >
                {confirmRemove === d.id ? <Check weight="bold" /> : <TrashSimple />}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 右:编辑器 */}
      <section className="panel glass copy-editor" aria-label="博客编辑">
        {curDraft ? (
          <>
            <div className="copy-editor-head">
              <div>
                <span className="copy-eyebrow">小红书 · 草稿</span>
                <h1>博客编辑</h1>
              </div>
              <div className="copy-head-actions">
                <div className="copy-save-state" role="status">
                  <span className={saveStatus === 'error' ? 'copy-saved error' : 'copy-saved'}>
                    {saveStatus === 'saving' ? '保存中…' : saveStatus === 'error' ? '保存失败' : savedAt ? `已保存 ${fmtTime(savedAt)}` : '自动保存'}
                  </span>
                  {saveStatus === 'error' && <button type="button" className="copy-save-retry" onClick={() => { void flushSave(); }}>重试</button>}
                </div>
                <button type="button" className="btn btn-sec btn-sm" title="到「图文发布」页走发布流程" onClick={goPublish}>
                  <PaperPlaneTilt /> 去发布
                </button>
              </div>
            </div>
            <div className="copy-writing">
              <div className="copy-field-head">
                <label htmlFor="copy-title">标题</label>
                <span className={titleCount > XHS_TITLE_LIMIT ? 'copy-count-num over' : 'copy-count-num'} title={`小红书标题上限 ${XHS_TITLE_LIMIT} 字`}>
                  {titleCount}/{XHS_TITLE_LIMIT}
                </span>
              </div>
              <input
                id="copy-title"
                className="copy-title"
                value={title}
                placeholder="给这篇博客起个标题"
                maxLength={30}
                onChange={(e) => { setTitle(e.target.value); queueSave(curDraft.id, e.target.value, stateRef.current.body); }}
              />
              <div className="copy-field-head copy-body-head">
                <label htmlFor="copy-body">正文</label>
                <span className={bodyCount > XHS_BODY_LIMIT ? 'copy-count-num over' : 'copy-count-num'} title={`小红书正文上限 ${XHS_BODY_LIMIT} 字`}>
                  {bodyCount}/{XHS_BODY_LIMIT}
                </span>
              </div>
              <textarea
                id="copy-body"
                className="copy-body"
                value={body}
                placeholder={'把你的心得写在这里…\n\n素材不够没关系，AI 只会整理你说过的，不会替你编。'}
                onChange={(e) => { setBody(e.target.value); queueSave(curDraft.id, stateRef.current.title, e.target.value); }}
              />
            </div>

          </>
        ) : (
          <div className="copy-empty">
            <p>在左边新建一篇博客,开始写你的小红书心得。</p>
            <button className="btn btn-pri" onClick={createDraft}><Plus weight="bold" /> 新建博客</button>
          </div>
        )}
      </section>
    </div>
  );
}
