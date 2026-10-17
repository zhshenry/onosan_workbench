import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import {
  copyStoreDataSchema, extractXhsTags, XHS_BODY_LIMIT, XHS_PUBLISH_URL, XHS_TITLE_LIMIT,
  type CopyStoreData,
} from '../../../shared/copy-contracts';
import { PublishAssociation } from './PublishAssociation';
import { errorText } from '../../../src/ui/controls';

const wb = window.workbench;
const PUB_KEY = 'wb.copy.pubDraftId';
const EDIT_KEY = 'wb.copy.curDraftId';

// IPC may finish after navigating away. Keep the one in-flight write locked
// across page instances, without persisting an unchecked target or input.
let associationWritePending = false;
const associationListeners = new Set<() => void>();
const subscribeAssociation = (listener: () => void): (() => void) => {
  associationListeners.add(listener);
  return () => { associationListeners.delete(listener); };
};
const associationSnapshot = (): boolean => associationWritePending;
const notifyAssociation = (): void => { for (const listener of associationListeners) listener(); };

const charCount = (text: string): number => [...text.trim()].length;
const snippetOf = (body: string): string => [...body.replace(/#[^\s#]+/g, '').trim()].slice(0, 32).join('');

/** 单篇草稿的发布就绪度(列表摘要与右侧清单共用) */
function readiness(draft: { title: string; body: string }) {
  const titleCount = charCount(draft.title);
  const bodyCount = charCount(draft.body);
  const tagCount = extractXhsTags(draft.body).length;
  return {
    titleCount,
    bodyCount,
    tagCount,
    titleOk: titleCount > 0 && titleCount <= XHS_TITLE_LIMIT,
    bodyOk: bodyCount > 0 && bodyCount <= XHS_BODY_LIMIT,
    blocked: !(titleCount > 0 && titleCount <= XHS_TITLE_LIMIT) || !(bodyCount > 0 && bodyCount <= XHS_BODY_LIMIT),
  };
}

/** 图文发布:二级目录页。草稿在此走发布流程(检查清单/标签/复制/打开创作者中心),写作留在「博客编辑」。 */
export function PublishView({ onPending, onGoEdit, onOpenCreator }: {
  onPending(message: string): void;
  /** 回「博客编辑」修改当前草稿(由外壳切换视图) */
  onGoEdit(): void;
  onOpenCreator(): void;
}) {
  const [storeData, setStoreData] = useState<CopyStoreData | null>(null);
  const [loadError, setLoadError] = useState('');
  const [curId, setCurId] = useState<string | null>(null);
  const [tagInput, setTagInput] = useState('');
  const associationBusy = useSyncExternalStore(subscribeAssociation, associationSnapshot);
  const refreshSequence = useRef(0);

  const refreshStore = async (): Promise<void> => {
    const sequence = ++refreshSequence.current;
    const data = copyStoreDataSchema.parse(await wb.copy.list());
    if (sequence === refreshSequence.current) { setStoreData(data); setLoadError(''); }
  };

  const writeAssociation = async (id: string, url: string | null): Promise<boolean> => {
    if (associationWritePending) return false;
    associationWritePending = true; notifyAssociation();
    try {
      const written = copyStoreDataSchema.parse(url === null
        ? await wb.copy.clearXhsPublished(id)
        : await wb.copy.markXhsPublished(id, url));
      const recorded = written.drafts.find(draft => draft.id === id);
      if (!recorded) throw new Error('关联写入结果缺少当前博客,请重新打开核对');
      // The command already confirmed persistence. Merge only its association
      // field, so a later failed list read cannot invite a duplicate write or
      // overwrite a newer title/body response with this complete snapshot.
      setStoreData(previous => previous ? { drafts: previous.drafts.map(draft => {
        if (draft.id !== id) return draft;
        const { xhsPublished: _old, ...fields } = draft;
        return recorded.xhsPublished ? { ...fields, xhsPublished: recorded.xhsPublished } : fields;
      }) } : written);
      await refreshStore().catch((error: unknown) => setLoadError(`关联已保存,但博客列表重新读取失败:${errorText(error) || '请重新打开核对'}`));
      return true;
    } finally {
      associationWritePending = false; notifyAssociation();
    }
  };

  useEffect(() => {
    const wanted = localStorage.getItem(PUB_KEY);
    void wb.copy.list().then((raw) => {
      const data = copyStoreDataSchema.parse(raw);
      setStoreData(data);
      const next = (data.drafts.find((d) => d.id === wanted) ?? data.drafts[0])?.id ?? null;
      setCurId(next);
      if (next) localStorage.setItem(PUB_KEY, next);
    }).catch((error: unknown) => setLoadError(errorText(error) || '草稿库读取失败,请重启应用'));
  }, []);

  useEffect(() => {
    // Re-read after a write from a previous page instance; preserve selection and input.
    if (!associationBusy) void refreshStore().catch((error: unknown) => setLoadError(errorText(error) || '草稿库读取失败,请重启应用'));
  }, [associationBusy]);

  const drafts = storeData?.drafts ?? [];
  const cur = drafts.find((d) => d.id === curId);
  const state = cur ? readiness(cur) : null;
  const tags = cur ? extractXhsTags(cur.body) : [];

  const select = (id: string): void => {
    setCurId(id);
    localStorage.setItem(PUB_KEY, id);
  };

  const saveBody = (nextBody: string): void => {
    if (!curId) return;
    void wb.copy.save({ id: curId, body: nextBody }).then(refreshStore).catch((error: unknown) => onPending(errorText(error) || '保存失败,请重试'));
  };

  const addTag = (): void => {
    const tag = tagInput.trim().replace(/^#+/, '');
    setTagInput('');
    if (!tag || /\s|#/.test(tag) || charCount(tag) > 30 || !cur) return;
    const base = cur.body;
    saveBody((base && !/\s$/.test(base) ? `${base} ` : base) + `#${tag} `);
  };

  const copyTitle = async (): Promise<void> => {
    if (!cur) return;
    try { await wb.clipboard.write(cur.title); onPending('标题已复制'); }
    catch (error) { onPending(errorText(error) || '复制失败,请重试'); }
  };

  const copyBody = async (): Promise<void> => {
    if (!cur) return;
    try { await wb.clipboard.write(cur.body); onPending('正文已复制(含标签)'); }
    catch (error) { onPending(errorText(error) || '复制失败,请重试'); }
  };

  const goPublish = async (): Promise<void> => {
    if (!cur || !state) return;
    if (state.blocked) { onPending('标题或正文还没通过检查,先去编辑修改'); return; }
    try {
      await wb.clipboard.write(cur.body);
      await wb.appInfo.openExternal(XHS_PUBLISH_URL);
      onPending('正文已复制,去浏览器粘贴发布,记得选话题和传图');
    } catch (error) {
      onPending(errorText(error) || '打开发布页失败,请重试');
    }
  };

  const goEdit = (): void => {
    if (curId) localStorage.setItem(EDIT_KEY, curId);
    onGoEdit();
  };

  return (
    <div className="copy-wrap">
      {loadError && <div className="todo-load-error" role="alert">{loadError}</div>}

      {/* 左:草稿选择(带就绪度摘要) */}
      <section className="panel glass copy-list" aria-label="待发布草稿">
        <div className="phead">
          <span className="ptitle">我的博客</span>
          <span className="copy-count">{drafts.length}</span>
        </div>
        <div className="copy-items">
          {drafts.length === 0 && (
            <div className="copy-none">还没有博客,先去「博客编辑」写一篇。</div>
          )}
          {drafts.map((d) => {
            const r = readiness(d);
            return (
              <button type="button" key={d.id} className={d.id === curId ? 'copy-item pub-blog-option on' : 'copy-item pub-blog-option'} aria-label={`选择博客《${d.title || '未命名博客'}》`} aria-pressed={d.id === curId} onClick={() => select(d.id)}>
                <span className="copy-item-main">
                  <span className="copy-item-title">{d.title || '(未命名)'}</span>
                  <span className="copy-item-snip">{snippetOf(d.body) || '空笔记'}</span>
                  <span className="pub-ready-row">
                    {d.xhsPublished && <span className="pub-ready ok">已关联 · 手动确认</span>}
                    {!d.xhsPublished && !r.blocked && <span className="pub-ready ok">本地文字检查通过</span>}
                    <span className={r.titleOk ? 'pub-ready ok' : 'pub-ready bad'}>标题</span>
                    <span className={r.bodyOk ? 'pub-ready ok' : 'pub-ready bad'}>正文</span>
                    <span className={r.tagCount > 0 ? 'pub-ready ok' : 'pub-ready'}>标签 {r.tagCount}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* 右:发布流程 */}
      <section className="panel glass copy-editor" aria-label="图文发布">
        {cur && state ? (
          <>
            <div className="copy-editor-head">
              <div>
                <span className="copy-eyebrow">小红书 · 图文发布</span>
                <h1>发布前准备</h1>
                <p className="pub-preparation-tip">准备新笔记内容,复制后前往小红书手动发布。</p>
              </div>
              <button className="btn btn-sec btn-sm" onClick={goEdit} title="回「博客编辑」修改这篇">去编辑修改</button>
            </div>

            <div className="pub-field">
              <div className="copy-field-head">
                <label>标题</label>
                <span className={state.titleCount > XHS_TITLE_LIMIT ? 'copy-count-num over' : 'copy-count-num'}>{state.titleCount}/{XHS_TITLE_LIMIT}</span>
              </div>
              <div className="pub-title-preview">{cur.title || '(未命名,去编辑填写)'}</div>
            </div>

            <div className="pub-field">
              <div className="copy-field-head">
                <label>正文</label>
                <span className={state.bodyCount > XHS_BODY_LIMIT ? 'copy-count-num over' : 'copy-count-num'}>{state.bodyCount}/{XHS_BODY_LIMIT}</span>
              </div>
              <pre className="pub-body-preview">{cur.body || '(空白,去编辑写正文)'}</pre>
            </div>

            <ul className="copy-pub-check">
              <li className={state.titleOk ? 'ok' : 'bad'}>标题{state.titleOk ? '' : ' · 还没写或超限'}</li>
              <li className={state.bodyOk ? 'ok' : 'bad'}>正文{state.bodyOk ? '' : ' · 还没写或超限'}</li>
              <li className={tags.length > 0 ? 'ok' : ''}>标签{tags.length > 0 ? ` · 已有 ${tags.length} 个` : ' · 加 1~3 个更容易被搜到'}</li>
              <li>图片 · 发布页需上传至少 1 张</li>
            </ul>

            {tags.length > 0 && (
              <div className="copy-pub-tags">
                {tags.slice(0, 10).map((t) => <span key={t} className="copy-pub-tag">#{t}</span>)}
                {tags.length > 10 && <span className="copy-pub-tag more">+{tags.length - 10}</span>}
              </div>
            )}
            <input
              className="copy-pub-add"
              value={tagInput}
              placeholder="加个话题标签,回车写入正文末尾"
              maxLength={30}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
            />

            <div className="copy-pub-actions">
              <button type="button" className="btn btn-sec btn-sm" disabled={!cur.title.trim()} onClick={() => void copyTitle()}>复制标题</button>
              <button type="button" className="btn btn-sec btn-sm" disabled={!cur.body.trim()} onClick={() => void copyBody()}>复制正文</button>
              <button
                type="button"
                className="btn btn-pri btn-sm copy-pub-go"
                disabled={state.blocked}
                title="复制正文并用默认浏览器打开小红书创作者中心发布页"
                onClick={() => void goPublish()}
              >
                <PaperPlaneTilt weight="bold" /> 去发布
              </button>
            </div>
            <p className="pub-tip">发布页操作(选话题/传图/点发布)由你本人完成,工作台只准备内容。</p>

            <PublishAssociation key={cur.id} draft={cur} writePending={associationBusy} onCommit={writeAssociation} onPending={onPending} onOpenCreator={onOpenCreator} />
          </>
        ) : (
          <div className="copy-empty">
            <p>选中左边一篇博客,或先去「博客编辑」写一篇。</p>
            <button className="btn btn-pri" onClick={goEdit}>去博客编辑</button>
          </div>
        )}
      </section>
    </div>
  );
}
