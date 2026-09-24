import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Plus, Sparkle, TrashSimple, X } from '@phosphor-icons/react';
import {
  copyStoreDataSchema, XHS_BODY_LIMIT, XHS_TITLE_LIMIT,
  type CopyAiAction, type CopyDraft, type CopyStoreData,
} from '../../../shared/copy-contracts';
import { errorText } from '../../todo/ui/ui';

const wb = window.workbench;
const CUR_KEY = 'wb.copy.curDraftId';

type AiMode = 'humanize' | 'polish' | 'titles';

const MODE_META: Record<AiMode, { label: string; hint: string }> = {
  humanize: { label: '去 AI 味', hint: '清除 AI 腔,保留全部信息与经历' },
  polish: { label: '润色', hint: '只顺句子删冗余,不动结构' },
  titles: { label: '起标题', hint: '按正文内容给 6 个候选' },
};

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

export function CopyView({ onPending }: { onPending(message: string): void }) {
  const [storeData, setStoreData] = useState<CopyStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [aiReady, setAiReady] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<{ mode: AiMode; actions: CopyAiAction[] } | null>(null);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);

  const saveTimer = useRef<number | undefined>(undefined);
  const removeTimer = useRef<number | undefined>(undefined);
  const pendingRef = useRef<{ id: string; title: string; body: string } | null>(null);
  // 编辑器即时值(stateRef 供防抖保存与跨事件读取,避免闭包拿到旧值)
  const stateRef = useRef({ curId, title, body });
  stateRef.current = { curId, title, body };

  const flushSave = useCallback(async (): Promise<void> => {
    const pending = pendingRef.current;
    if (!pending) return;
    pendingRef.current = null;
    window.clearTimeout(saveTimer.current);
    try {
      const next = copyStoreDataSchema.parse(await wb.copy.save(pending));
      setStoreData(next);
      const saved = next.drafts.find((d) => d.id === pending.id);
      if (saved) setSavedAt(saved.updatedAt);
    } catch (error) {
      pendingRef.current = pending;
      onPending(errorText(error) || '保存失败,请重试');
    }
  }, [onPending]);

  const queueSave = useCallback((id: string, nextTitle: string, nextBody: string): void => {
    pendingRef.current = { id, title: nextTitle, body: nextBody };
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => { void flushSave(); }, 600);
  }, [flushSave]);

  const openDraft = useCallback((draft: CopyDraft | undefined): void => {
    if (draft) {
      setCurId(draft.id);
      setTitle(draft.title);
      setBody(draft.body);
      setSavedAt(draft.updatedAt);
      localStorage.setItem(CUR_KEY, draft.id);
    } else {
      setCurId(null);
      setTitle('');
      setBody('');
      setSavedAt(null);
      localStorage.removeItem(CUR_KEY);
    }
    setAiResult(null);
    setConfirmRemove(null);
  }, []);

  // 首次加载:草稿库 + AI 可用性
  useEffect(() => {
    const wantedId = localStorage.getItem(CUR_KEY);
    void wb.copy.list().then((raw) => {
      const data = copyStoreDataSchema.parse(raw);
      setStoreData(data);
      openDraft(data.drafts.find((d) => d.id === wantedId) ?? data.drafts[0]);
    }).catch((error: unknown) => setLoadError(errorText(error) || '草稿库读取失败,请重启应用'));
    void wb.ai.config().then((raw) => {
      const cfg = raw as { aiEnabled?: boolean; hasConnection?: boolean };
      setAiReady(Boolean(cfg.aiEnabled && cfg.hasConnection));
    }).catch(() => setAiReady(false));
    return () => { window.clearTimeout(saveTimer.current); window.clearTimeout(removeTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const runAi = (mode: AiMode): void => {
    const id = stateRef.current.curId;
    if (!id || aiBusy) return;
    if (!aiReady) { onPending('请先在 AI 设置中配置并启用 AI'); return; }
    if (mode !== 'titles' && !stateRef.current.body.trim()) { onPending('正文为空,先写点内容再优化'); return; }
    void (async () => {
      setAiBusy(true);
      setAiResult(null);
      try {
        await flushSave(); // 确保主进程读到最新正文
        const { actions } = await wb.copy.enhance(id, mode) as { actions: CopyAiAction[] };
        setAiResult({ mode, actions });
      } catch (error) {
        onPending(errorText(error) || 'AI 优化失败,请重试');
      } finally {
        setAiBusy(false);
      }
    })();
  };

  const applyEdit = (): void => {
    if (!curId || aiResult?.mode === 'titles') return;
    const action = aiResult?.actions.find((a) => a.kind === 'edit');
    if (!action || action.kind !== 'edit') return;
    setBody(action.text);
    queueSave(curId, stateRef.current.title, action.text);
    setAiResult(null);
    onPending('已应用到正文,记得核对一遍');
  };

  const applyTitle = (value: string): void => {
    if (!curId) return;
    setTitle(value);
    queueSave(curId, value, stateRef.current.body);
    setAiResult(null);
    onPending('已应用标题');
  };

  const cancelAi = (): void => {
    void wb.copy.cancel();
  };

  return (
    <div className="copy-wrap">
      {loadError && <div className="todo-load-error" role="alert">{loadError}</div>}

      {/* 左:草稿列表 */}
      <section className="panel glass copy-list" aria-label="笔记列表">
        <div className="phead">
          <span className="ptitle">我的笔记</span>
          <span className="copy-count">{drafts.length}</span>
          <button className="btn btn-pri btn-sm copy-new" onClick={createDraft} title="新建一篇笔记">
            <Plus weight="bold" /> 新建
          </button>
        </div>
        <div className="copy-items">
          {drafts.length === 0 && (
            <div className="copy-none">还没有笔记,点「新建」开始写第一篇心得。</div>
          )}
          {drafts.map((d) => (
            <div
              key={d.id}
              className={d.id === curId ? 'copy-item on' : 'copy-item'}
              onClick={() => { if (d.id !== stateRef.current.curId) { void flushSave().then(() => openDraft(d)); } }}
            >
              <div className="copy-item-main">
                <span className="copy-item-title">{d.title || '(未命名)'}</span>
                <span className="copy-item-snip">{snippetOf(d.body) || '空笔记'}</span>
                <span className="copy-item-time">{fmtTime(d.updatedAt)}</span>
              </div>
              <button
                className={confirmRemove === d.id ? 'copy-del sure' : 'copy-del'}
                title={confirmRemove === d.id ? '再点一次确认删除' : '删除笔记'}
                onClick={(e) => { e.stopPropagation(); removeDraft(d.id); }}
              >
                {confirmRemove === d.id ? <Check weight="bold" /> : <TrashSimple />}
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* 右:编辑器 */}
      <section className="panel glass copy-editor" aria-label="笔记编辑">
        {curDraft ? (
          <>
            <div className="copy-titlebar">
              <input
                className="copy-title sheet"
                value={title}
                placeholder="标题(发布时可再改)"
                maxLength={30}
                onChange={(e) => { setTitle(e.target.value); queueSave(curDraft.id, e.target.value, stateRef.current.body); }}
              />
              <span className={titleCount > XHS_TITLE_LIMIT ? 'copy-count-num over' : 'copy-count-num'} title={`小红书标题上限 ${XHS_TITLE_LIMIT} 字`}>
                {titleCount}/{XHS_TITLE_LIMIT}
              </span>
            </div>
            <textarea
              className="copy-body sheet"
              value={body}
              placeholder={'把你的心得写在这里…\n\n素材不够没关系,AI 只会整理你说过的,不会替你编。'}
              onChange={(e) => { setBody(e.target.value); queueSave(curDraft.id, stateRef.current.title, e.target.value); }}
            />
            <div className="copy-meta">
              <span className={bodyCount > XHS_BODY_LIMIT ? 'copy-count-num over' : 'copy-count-num'} title={`小红书正文上限 ${XHS_BODY_LIMIT} 字`}>
                正文 {bodyCount}/{XHS_BODY_LIMIT}
              </span>
              <span className="copy-saved">{savedAt ? `已保存 ${fmtTime(savedAt)}` : ''}</span>
            </div>

            <div className="copy-aibar">
              <span className="copy-aibar-label"><Sparkle weight="fill" /> AI 优化</span>
              {(Object.keys(MODE_META) as AiMode[]).map((mode) => (
                <button
                  key={mode}
                  className="btn btn-sec btn-sm"
                  disabled={aiBusy}
                  title={MODE_META[mode].hint}
                  onClick={() => runAi(mode)}
                >
                  {MODE_META[mode].label}
                </button>
              ))}
              {aiBusy && (
                <button className="btn btn-sec btn-sm" onClick={cancelAi}>取消</button>
              )}
              <span className="copy-aibar-hint">建议只做参考,应用前先读一遍</span>
            </div>

            {aiResult && (
              <div className="copy-ai" role="region" aria-label="AI 优化建议">
                <div className="copy-ai-head">
                  <span className="copy-ai-title">AI {MODE_META[aiResult.mode].label}建议</span>
                  <button className="ibtn copy-ai-close" title="放弃建议" onClick={() => setAiResult(null)}><X /></button>
                </div>
                {aiResult.actions.map((action, i) => action.kind === 'edit' ? (
                  <div className="copy-ai-edit" key={i}>
                    {action.notes.length > 0 && (
                      <ul className="copy-ai-notes">
                        {action.notes.map((note, j) => <li key={j}>{note}</li>)}
                      </ul>
                    )}
                    <pre className="copy-ai-preview sheet">{action.text}</pre>
                    <div className="copy-ai-foot">
                      <button className="btn btn-pri btn-sm" onClick={applyEdit}><Check weight="bold" /> 应用到正文</button>
                      <button className="btn btn-sec btn-sm" onClick={() => setAiResult(null)}>放弃</button>
                    </div>
                  </div>
                ) : (
                  <div className="copy-ai-titles" key={i}>
                    {action.titles.map((t, j) => (
                      <button key={j} className="copy-title-chip" title="点击采用这个标题" onClick={() => applyTitle(t)}>{t}</button>
                    ))}
                    <div className="copy-ai-foot">
                      <button className="btn btn-sec btn-sm" onClick={() => setAiResult(null)}>都不用</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="copy-empty">
            <p>在左边新建一篇笔记,开始写你的小红书心得。</p>
            <button className="btn btn-pri" onClick={createDraft}><Plus weight="bold" /> 新建笔记</button>
          </div>
        )}
      </section>
    </div>
  );
}
