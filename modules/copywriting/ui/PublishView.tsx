import { useEffect, useState } from 'react';
import { PaperPlaneTilt } from '@phosphor-icons/react';
import {
  copyStoreDataSchema, extractXhsTags, XHS_BODY_LIMIT, XHS_PUBLISH_URL, XHS_TITLE_LIMIT,
  type CopyStoreData,
} from '../../../shared/copy-contracts';
import { parseXhsNoteUrl } from '../xhs-publish';
import { errorText } from '../../todo/ui/ui';

const wb = window.workbench;
const PUB_KEY = 'wb.copy.pubDraftId';
const EDIT_KEY = 'wb.copy.curDraftId';

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
  const [publishUrl, setPublishUrl] = useState('');
  const [checkedUrl, setCheckedUrl] = useState<{ url: string; remoteId: string } | null>(null);
  const [publishBusy, setPublishBusy] = useState(false);

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

  const drafts = storeData?.drafts ?? [];
  const cur = drafts.find((d) => d.id === curId);
  const state = cur ? readiness(cur) : null;
  const tags = cur ? extractXhsTags(cur.body) : [];

  const select = (id: string): void => {
    setCurId(id);
    setPublishUrl('');
    setCheckedUrl(null);
    localStorage.setItem(PUB_KEY, id);
  };

  const checkPublishedUrl = (): void => {
    try { setCheckedUrl(parseXhsNoteUrl(publishUrl)); }
    catch (error) { setCheckedUrl(null); onPending(errorText(error)); }
  };

  const markPublished = async (): Promise<void> => {
    if (!cur || !checkedUrl || publishBusy) return;
    setPublishBusy(true);
    try {
      setStoreData(copyStoreDataSchema.parse(await wb.copy.markXhsPublished(cur.id, checkedUrl.url)));
      setPublishUrl('');
      setCheckedUrl(null);
      onPending('作品链接已关联,状态来源为手动确认');
    } catch (error) { onPending(errorText(error) || '关联失败,请重试'); }
    finally { setPublishBusy(false); }
  };

  const clearPublished = async (): Promise<void> => {
    if (!cur || publishBusy) return;
    setPublishBusy(true);
    try {
      setStoreData(copyStoreDataSchema.parse(await wb.copy.clearXhsPublished(cur.id)));
      onPending('已移除手动发布标记');
    } catch (error) { onPending(errorText(error) || '移除失败,请重试'); }
    finally { setPublishBusy(false); }
  };

  const copyPublishedUrl = async (): Promise<void> => {
    if (!cur?.xhsPublished) return;
    try { await wb.clipboard.write(cur.xhsPublished.url); onPending('作品链接已复制'); }
    catch (error) { onPending(errorText(error) || '复制失败'); }
  };

  const saveBody = (nextBody: string): void => {
    if (!curId) return;
    void wb.copy.save({ id: curId, body: nextBody }).then((raw) => {
      setStoreData(copyStoreDataSchema.parse(raw));
    }).catch((error: unknown) => onPending(errorText(error) || '保存失败,请重试'));
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
              <div key={d.id} className={d.id === curId ? 'copy-item on' : 'copy-item'} onClick={() => select(d.id)}>
                <div className="copy-item-main">
                  <span className="copy-item-title">{d.title || '(未命名)'}</span>
                  <span className="copy-item-snip">{snippetOf(d.body) || '空笔记'}</span>
                  <span className="pub-ready-row">
                    {d.xhsPublished && <span className="pub-ready ok">已发布 · 手动确认</span>}
                    {!d.xhsPublished && !r.blocked && <span className="pub-ready ok">本地文字检查通过</span>}
                    <span className={r.titleOk ? 'pub-ready ok' : 'pub-ready bad'}>标题</span>
                    <span className={r.bodyOk ? 'pub-ready ok' : 'pub-ready bad'}>正文</span>
                    <span className={r.tagCount > 0 ? 'pub-ready ok' : 'pub-ready'}>标签 {r.tagCount}</span>
                  </span>
                </div>
              </div>
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
                <h1>发布准备</h1>
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
            <p className="pub-tip">发布页操作(选话题/传图/点发布)由你本人完成,工作台只准备内容,账号零风险。</p>

            <section className="pub-linked" aria-label="已发布作品关联">
              <div className="copy-pub-head">
                <span className="copy-pub-title">已发布作品</span>
                <span className="copy-pub-tip">{cur.xhsPublished ? '用户手动确认' : '尚未关联'}</span>
              </div>
              <button type="button" className="btn btn-sec btn-sm" onClick={onOpenCreator}>在工作台打开小红书创作者中心</button>
              {cur.xhsPublished && (
                <div className="pub-linked-record">
                  <span>作品 ID · {cur.xhsPublished.remoteId}</span>
                  <span>确认于 {new Date(cur.xhsPublished.confirmedAt).toLocaleString('zh-CN')}</span>
                  <button type="button" className="btn btn-sec btn-sm" onClick={() => void copyPublishedUrl()}>复制作品链接</button>
                  <button type="button" className="btn btn-sec btn-sm" disabled={publishBusy} onClick={() => void clearPublished()}>移除标记</button>
                </div>
              )}
              <p className="pub-tip">已发布后可粘贴作品直链并手动关联。此标记不表示工作台已从小红书后台核验。</p>
              <div className="pub-linked-input">
                <input type="url" aria-label="小红书已发布作品直链" placeholder="https://www.xiaohongshu.com/explore/..." value={publishUrl} onChange={(event) => { setPublishUrl(event.target.value); setCheckedUrl(null); }} />
                <button type="button" className="btn btn-sec btn-sm" disabled={!publishUrl.trim() || publishBusy} onClick={checkPublishedUrl}>核对链接</button>
              </div>
              {checkedUrl && (
                <div className="pub-linked-preview">
                  <span>将《{cur.title || '未命名博客'}》关联到作品 ID {checkedUrl.remoteId}。请确认链接对应这篇笔记。</span>
                  <button type="button" className="btn btn-pri btn-sm" disabled={publishBusy} onClick={() => void markPublished()}>确认关联</button>
                </div>
              )}
            </section>
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
