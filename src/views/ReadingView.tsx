import { useEffect, useMemo, useRef, useState } from 'react';
import {
  READING_STATUS_LABEL, READING_STATUSES, SCAN_SKIP_HINT, booksPendingImport,
  type BookEntry, type ReadingStatus, type ReadingStoreData,
} from '../../shared/reading-contracts';
import { Modal, Segmented, Select, errorText } from '../../modules/todo/ui/ui';
import { Check, Info, X } from '@phosphor-icons/react';

interface ImportCandidate {
  folder: string;
  name: string;
  noteCount: number;
}

function ImportConfirmPanel({ candidates, checked, busy, onToggle, onCancel, onConfirm }: {
  candidates: ImportCandidate[];
  checked: Set<string>;
  busy: boolean;
  onToggle(folder: string): void;
  onCancel(): void;
  onConfirm(): void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);
  const selected = candidates.filter((candidate) => checked.has(candidate.folder)).length;
  return (
    <section className="rd-import" aria-label="确认导入">
      <h2>确认导入</h2>
      <p className="rd-import-sub">识别到 {candidates.length} 本书，勾选后导入工作台（不改 Obsidian 库）</p>
      <ul className="rd-import-list">
        {candidates.map((candidate) => {
          const on = checked.has(candidate.folder);
          return (
            <li key={candidate.folder}>
              <label className={on ? 'rd-import-row on' : 'rd-import-row'}>
                <input
                  type="checkbox"
                  aria-label={candidate.name}
                  checked={on}
                  disabled={busy}
                  onChange={() => onToggle(candidate.folder)}
                />
                <span className="rd-import-box" aria-hidden="true">{on ? <Check size={12} weight="bold" /> : null}</span>
                <span className="rd-import-text">
                  <b>{candidate.name}</b>
                  <small>文件夹名</small>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <p className="rd-import-skip"><Info size={14} aria-hidden="true" />已跳过 {SCAN_SKIP_HINT}</p>
      <div className="rd-import-actions">
        <button type="button" className="btn btn-sec" onClick={onCancel} disabled={busy}>取消</button>
        <button type="button" className="btn btn-pri" onClick={onConfirm} disabled={busy || selected === 0}>确认导入</button>
      </div>
    </section>
  );
}

function RemoveBookButton({ onRemove }: { onRemove(): void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent): void => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div className="rd-remove-wrap" ref={wrap}>
      <button
        type="button"
        className="rd-remove"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((value) => !value)}
      >
        删除书目
      </button>
      {open && (
        <div className="rd-remove-pop" role="dialog" aria-modal="false" aria-label="确认删除书目">
          <p>仅移除工作台书目，不碰 Obsidian</p>
          <div className="rd-remove-actions">
            <button type="button" className="btn btn-sec btn-sm" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="rd-remove-go" onClick={() => { setOpen(false); onRemove(); }}>删除</button>
          </div>
        </div>
      )}
    </div>
  );
}

const wb = window.workbench;
const CUR_KEY = 'wb.reading.curBookId';

const STATUS_ORDER: ReadingStatus[] = ['reading', 'wish', 'done', 'paused'];
const COVER_TONES = [
  'linear-gradient(140deg,#4a67a3,#31517e)', 'linear-gradient(140deg,#6f5f9e,#57497f)',
  'linear-gradient(140deg,#3e7d44,#2f6234)', 'linear-gradient(140deg,#bd6a2e,#9a5522)',
  'linear-gradient(140deg,#5f7f9e,#47637e)',
];
const coverTone = (title: string): string => COVER_TONES[[...title].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COVER_TONES.length];

interface Aggregate {
  noteCount: number;
  lastUpdated: string;
  maturity: { draft: number; shaped: number };
  totalChapters: number | null;
  notes: { rel: string; title: string; status: string; updated: string; draft: boolean }[];
  chapters: { rel: string; name: string; count: number; lastUpdated: string }[];
}


export function ReadingView({ onPending, onAskAI, onCurrentBook }: {
  onPending(message: string): void;
  onAskAI(prompt: string, bookId: string): void;
  onCurrentBook(book: { id: string; title: string } | null): void;
}) {
  const [storeData, setStoreData] = useState<ReadingStoreData | null>(null);
  const [curId, setCurId] = useState<string | null>(null);
  const [agg, setAgg] = useState<Aggregate | null>(null);
  const [tagFilter, setTagFilter] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [mTitle, setMTitle] = useState('');
  const [mAuthor, setMAuthor] = useState('');
  const [mStatus, setMStatus] = useState<ReadingStatus>('wish');
  const [mTags, setMTags] = useState('');
  const [mFolder, setMFolder] = useState('');
  const [vaultInput, setVaultInput] = useState('');
  const [vaultDialogOpen, setVaultDialogOpen] = useState(false);
  const [vaultError, setVaultError] = useState('');
  const vaultInputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<{ folder: string; name: string; noteCount: number }[]>([]);
  const [importCandidates, setImportCandidates] = useState<ImportCandidate[] | null>(null);
  const [importChecked, setImportChecked] = useState<Set<string>>(new Set());
  const [importBusy, setImportBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const importLock = useRef(false);
  const [commentDraft, setCommentDraft] = useState('');
  const commentTimer = useRef<number | undefined>(undefined);
  const loadedOnce = useRef(false);

  useEffect(() => { if (vaultDialogOpen) vaultInputRef.current?.focus(); }, [vaultDialogOpen]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.reading.list().then((raw) => {
      const data = raw as ReadingStoreData;
      setStoreData(data);
      const saved = localStorage.getItem(CUR_KEY);
      setCurId(data.books.some((b) => b.id === saved) ? saved : data.books[0]?.id ?? null);
      if (data.vaultPath) setVaultInput(data.vaultPath);
    }, (e) => onPending(errorText(e)));
  }, []);

  const book = storeData?.books.find((b) => b.id === curId) ?? null;

  useEffect(() => {
    onCurrentBook(book ? { id: book.id, title: book.title } : null);
  }, [book?.id, book?.title, onCurrentBook]);

  useEffect(() => {
    setAgg(null);
    if (!storeData?.vaultPath || !book?.link) return;
    void wb.reading.aggregate(book.link.folder).then(
      (raw) => setAgg(raw as Aggregate),
      (e) => onPending(errorText(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, book?.link?.folder, storeData?.vaultPath]);

  useEffect(() => { setCommentDraft(book?.comment ?? ''); }, [book?.id, book?.comment]);

  const apply = (raw: unknown, okMsg?: string): void => {
    setStoreData(raw as ReadingStoreData);
    if (okMsg) onPending(okMsg);
  };
  const save = (patch: Partial<BookEntry>, id = book!.id, okMsg?: string): void => {
    const target = storeData!.books.find((b) => b.id === id);
    if (!target) return;
    const payload: Record<string, unknown> = { ...target, ...patch, id };
    delete payload.createdAt;
    delete payload.updatedAt;
    void wb.reading.save(payload).then(
      (raw) => apply(raw, okMsg),
      (e) => onPending(errorText(e)),
    );
  };

  const allTags = useMemo(
    () => [...new Set((storeData?.books ?? []).flatMap((b) => b.tags))].sort(),
    [storeData?.books],
  );
  const visibleBooks = (list: BookEntry[]): BookEntry[] =>
    tagFilter ? list.filter((b) => b.tags.includes(tagFilter)) : list;

  const vaultName = storeData?.vaultPath ? storeData.vaultPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '' : '';

  const openInObsidian = (rel?: string): void => {
    if (!storeData?.vaultPath) { onPending('请先配置读书笔记库路径'); return; }
    void wb.reading.openObsidian(vaultName, rel).catch((e) => onPending(errorText(e)));
  };

  const linkedFolders = (): string[] => storeData?.books.flatMap((item) => item.link ? [item.link.folder] : []) ?? [];

  const openImport = (): void => {
    setVaultInput(storeData?.vaultPath ?? '');
    setVaultError('');
    setImportCandidates(null);
    setVaultDialogOpen(true);
  };

  const scanAndImport = (): void => {
    if (scanning) return;
    const value = vaultInput.trim();
    if (!value) { setVaultError('请填写读书笔记库的本地文件夹路径'); vaultInputRef.current?.focus(); return; }
    setScanning(true);
    setVaultError('');
    void (async () => {
      try {
        const candidates = await wb.reading.scan(value) as ImportCandidate[];
        if (value !== storeData?.vaultPath) apply(await wb.reading.setVault(value));
        setVaultDialogOpen(false);
        const fresh = booksPendingImport(candidates, linkedFolders(), candidates.map((candidate) => candidate.folder));
        if (!fresh.length) { setImportCandidates(null); onPending('库内没有新的书文件夹'); return; }
        setImportCandidates(fresh);
        setImportChecked(new Set(fresh.map((candidate) => candidate.folder)));
      } catch (e) {
        setVaultError(errorText(e));
        vaultInputRef.current?.focus();
      } finally {
        setScanning(false);
      }
    })();
  };

  const cancelImport = (): void => {
    if (importBusy) return;
    setImportCandidates(null);
  };

  const toggleImport = (folder: string): void => {
    setImportChecked((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  };

  const confirmImport = (): void => {
    if (!importCandidates || importLock.current) return;
    const pending = booksPendingImport(importCandidates, linkedFolders(), importChecked);
    if (!pending.length) { setImportCandidates(null); return; }
    importLock.current = true;
    setImportBusy(true);
    void (async () => {
      try {
        let latest: unknown = null;
        for (const candidate of pending) {
          latest = await wb.reading.save({
            title: candidate.name,
            status: candidate.noteCount > 1 ? 'reading' : 'wish',
            link: { vault: vaultName, folder: candidate.folder },
          });
        }
        apply(latest, `已从库导入 ${pending.length} 本:${pending.map((candidate) => candidate.name).join('、')}`);
        setImportCandidates(null);
      } catch (e) {
        onPending(errorText(e));
      } finally {
        importLock.current = false;
        setImportBusy(false);
      }
    })();
  };

  const closeDetail = (): void => {
    setCurId(null);
    localStorage.removeItem(CUR_KEY);
  };

  const confirmRemove = (): void => {
    if (!book) return;
    const id = book.id;
    void wb.reading.remove(id).then((raw) => {
      apply(raw, '已删除书目');
      if (curId === id) {
        setCurId(null);
        localStorage.removeItem(CUR_KEY);
      }
    }, (e) => onPending(errorText(e)));
  };

  const setComment = (text: string): void => {
    setCommentDraft(text);
    if (!book) return;
    window.clearTimeout(commentTimer.current);
    commentTimer.current = window.setTimeout(() => save({ comment: text.trim() || undefined }), 600);
  };

  const openNew = (): void => {
    setMTitle(''); setMAuthor(''); setMStatus('wish'); setMTags(''); setMFolder('');
    if (storeData?.vaultPath) {
      void wb.reading.scan(storeData.vaultPath).then(
        (raw) => setFolders(raw as { folder: string; name: string; noteCount: number }[]),
        () => setFolders([]),
      );
    }
    setModalOpen(true);
  };
  const saveModal = (): void => {
    const title = mTitle.trim();
    if (!title) { onPending('请填写书名'); return; }
    const tags = mTags.split(/[,，、\s]+/).map((t) => t.trim()).filter(Boolean).slice(0, 8);
    void wb.reading.save({
      title,
      author: mAuthor.trim() || undefined,
      status: mStatus,
      tags,
      link: vaultName && mFolder ? { vault: vaultName, folder: mFolder } : undefined,
    }).then((raw) => {
      const data = raw as ReadingStoreData;
      apply(data, `已添加「${title}」`);
      setCurId(data.books[data.books.length - 1]?.id ?? null);
      localStorage.setItem(CUR_KEY, data.books[data.books.length - 1]?.id ?? '');
    }, (e) => onPending(errorText(e)));
    setModalOpen(false);
  };

  if (!storeData) {
    return (
      <section className="view on" id="view-reading">
        <div className="todo-loading" role="status">正在读取书单…</div>
      </section>
    );
  }

  const chapterPct = book?.progressPct
    ?? (book?.chapterCurrent !== undefined && book?.chapterTotal ? Math.round((book.chapterCurrent / book.chapterTotal) * 100) : undefined);

  return (
    <section className="view on reading-view" id="view-reading">
      <div className="greet">
        <div>
          <h1>阅读清单</h1>
          <div className="gsub">
            {(storeData.books.length || 0)} 本书 · 在读 <b>{storeData.books.filter((b) => b.status === 'reading').length}</b>
            {storeData.vaultPath
              ? <> · 关联库「{vaultName}」共 <b>{agg?.noteCount ?? '…'}</b> 篇笔记 · <b>只读</b>不改动你的库</>
              : <> · 尚未关联读书笔记库</>}
          </div>
        </div>
        <div className="gbtns">
          <button className="btn btn-sec" onClick={openImport} disabled={scanning || importBusy} aria-haspopup="dialog">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round"><path d="M20 12a8 8 0 1 1-2.4-5.7M20 3.8v3.4h-3.4"/></svg>
            从库导入
          </button>
          <button className="btn btn-pri" onClick={openNew}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
            添加书目
          </button>
        </div>
      </div>

      {!storeData.vaultPath && (
        <div className="panel glass rd-vault">
          <div className="rd-vault-text">
            <b>关联你的读书笔记库</b>
            <span>填写 Obsidian 读书库的本地路径(需含 .obsidian 文件夹),例如 C:/Myself/Obsidian/读书笔记。工作台只读取其中的书目活动,不改动任何笔记。</span>
          </div>
          <button className="btn btn-pri btn-sm" onClick={openImport} aria-haspopup="dialog">选择读书笔记库</button>
        </div>
      )}

      {allTags.length > 0 && (
        <div className="rd-tagfilter" role="group" aria-label="按标签筛选">
          <button className={tagFilter === null ? 'rd-tf on' : 'rd-tf'} onClick={() => setTagFilter(null)}>全部</button>
          {allTags.map((tag) => (
            <button key={tag} className={tagFilter === tag ? 'rd-tf on' : 'rd-tf'} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>
              {tag}
            </button>
          ))}
        </div>
      )}

      {importCandidates && (
        <ImportConfirmPanel
          candidates={importCandidates}
          checked={importChecked}
          busy={importBusy}
          onToggle={toggleImport}
          onCancel={cancelImport}
          onConfirm={confirmImport}
        />
      )}

      {storeData.books.length === 0 ? (
        importCandidates ? null : (
          <div className="bazi-empty glass rd-empty">
            <b>书单还是空的</b>
            <p>点「从库导入」填写读书笔记库路径并选择书目,或「添加书目」手动录入。</p>
          </div>
        )
      ) : (
        <div className="rd-cols">
          <div>
            {STATUS_ORDER.map((status) => {
              const list = visibleBooks(storeData.books.filter((b) => b.status === status));
              return (
                <div className="shelf" key={status}>
                  <div className="shelf-head">
                    <span className={`shelf-badge ${status}`}>{READING_STATUS_LABEL[status]}</span>
                    <span className="shelf-count">{list.length} 本</span>
                  </div>
                  {list.length === 0 ? (
                    <div className="empty-note">{tagFilter ? '该标签下没有这个状态的书。' : status === 'paused' ? '暂时没有搁置的书。' : '还没有书目。'}</div>
                  ) : list.map((b) => {
                    const pct = b.progressPct ?? (b.chapterCurrent !== undefined && b.chapterTotal ? Math.round((b.chapterCurrent / b.chapterTotal) * 100) : undefined);
                    return (
                      <div
                        key={b.id}
                        className={b.id === book?.id ? 'bookcard on' : 'bookcard'}
                        role="button"
                        tabIndex={0}
                        onClick={() => { setCurId(b.id); localStorage.setItem(CUR_KEY, b.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurId(b.id); localStorage.setItem(CUR_KEY, b.id); } }}
                      >
                        <span className="cover" style={{ background: coverTone(b.title) }}>{[...b.title][0]}</span>
                        <div className="b-main">
                          <div className="b-title">{b.title}</div>
                          {b.author && <div className="b-meta"><span>{b.author}</span></div>}
                          <div className="b-tags">
                            {b.link && <span className="b-link">库 · {agg && b.id === book?.id ? agg.noteCount : '已关联'}</span>}
                            {b.tags.map((tag) => <span key={tag} className="b-tag">{tag}</span>)}
                          </div>
                        </div>
                        <div className="b-side">
                          {b.status === 'done' && b.rating
                            ? <span className="stars">{'★'.repeat(b.rating)}<span className="off">{'★'.repeat(5 - b.rating)}</span></span>
                            : pct !== undefined
                              ? <><span className="b-progress">{b.chapterCurrent !== undefined && b.chapterTotal ? `第 ${b.chapterCurrent} 章 / ${b.chapterTotal}` : `${pct}%`}</span>
                                  <span className="b-progbar"><i style={{ width: `${pct}%` }} /></span></>
                              : <span className="b-recent">{b.status === 'wish' ? '待开始' : ''}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {book && (
            <div className="detail">
              <div className="panel glass">
                <div className="phead">
                  <span className="ptitle">书籍详情</span>
                  {book.link && <span className="pcount">关联文件夹:{book.link.folder}</span>}
                  <button type="button" className="rd-close" aria-label="关闭面板（不删书）" onClick={closeDetail}>
                    <span>关闭面板（不删书）</span>
                    <span className="rd-close-x" aria-hidden="true"><X size={13} weight="bold" /></span>
                  </button>
                </div>
                <div className="d-head">
                  <span className="d-cover" style={{ background: coverTone(book.title) }}>{[...book.title][0]}</span>
                  <div className="d-t">
                    <div className="d-title">{book.title}</div>
                    {book.author && <div className="d-author">{book.author}</div>}
                    <div className="d-state">
                      <div className="pseg" role="radiogroup" aria-label="阅读状态">
                        {READING_STATUSES.map((s) => (
                          <button key={s} className={book.status === s ? 'on' : ''} onClick={() => save({ status: s })}>
                            {READING_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                    <RemoveBookButton key={book.id} onRemove={confirmRemove} />
                  </div>
                </div>

                <div className="d-sec">
                  <div className="d-label">
                    进度
                    <span className="val">
                      {book.chapterCurrent !== undefined && book.chapterTotal ? `第 ${book.chapterCurrent} 章 / 共 ${book.chapterTotal} 章 · ` : ''}
                      {chapterPct !== undefined ? `${chapterPct}%` : '未设置'}
                    </span>
                  </div>
                  <div className="progress-row">
                    <input
                      type="range" min={0} max={100} value={chapterPct ?? 0}
                      aria-label="阅读进度百分比"
                      onChange={(e) => save({ progressPct: Number(e.target.value) })}
                    />
                    <span className="pct">{chapterPct ?? 0}%</span>
                  </div>
                  <div className="rd-chaprow">
                    <span className="d-label" style={{ margin: 0 }}>读到第</span>
                    <input
                      className="rd-num" type="number" min={0} max={9999}
                      aria-label="当前章" placeholder="—" value={book.chapterCurrent ?? ''}
                      onChange={(e) => save({ chapterCurrent: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    章 / 共
                    <input
                      className="rd-num" type="number" min={0} max={9999}
                      aria-label="总章数" placeholder="—" value={book.chapterTotal ?? ''}
                      onChange={(e) => save({ chapterTotal: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                    章
                  </div>
                </div>

                <div className="d-sec">
                  <div className="d-label">评分与短评</div>
                  <div className="rate-row">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <button
                        key={star}
                        className={book.rating && star <= book.rating ? 'rd-star on' : 'rd-star'}
                        aria-label={`${star} 星`}
                        onClick={() => save({ rating: book.rating === star ? undefined : star })}
                      >★</button>
                    ))}
                  </div>
                  <textarea
                    className="shortcut"
                    placeholder="写一句话短评…"
                    value={commentDraft}
                    maxLength={300}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </div>

                <div className="d-sec">
                  <div className="d-label">标签</div>
                  <div className="tagrow">
                    {book.tags.map((tag) => (
                      <span key={tag} className="b-tag on" role="button" tabIndex={0}
                        title="移除标签"
                        onClick={() => save({ tags: book.tags.filter((t) => t !== tag) })}
                        onKeyDown={(e) => { if (e.key === 'Enter') save({ tags: book.tags.filter((t) => t !== tag) }); }}
                      >{tag} ✕</span>
                    ))}
                    <input
                      className="rd-tagadd" aria-label="添加标签" placeholder="+ 添加"
                      maxLength={12}
                      onKeyDown={(e) => {
                        if (e.key !== 'Enter') return;
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value && !book.tags.includes(value) && book.tags.length < 8) save({ tags: [...book.tags, value] });
                        (e.target as HTMLInputElement).value = '';
                      }}
                    />
                  </div>
                </div>

                {book.link && (
                  <div className="d-sec">
                    <div className="d-label">Obsidian 关联<span className="val">只读 · 不改动你的库</span></div>
                    <div className="linkbox">
                      <div className="linkrow">
                        <span className="k">库</span><span className="v">{vaultName}</span>
                        <button className="open" onClick={() => openInObsidian()}>在 Obsidian 打开</button>
                      </div>
                      {agg ? (
                        <>
                          <div className="d-note-count">
                            <span><b>{agg.noteCount}</b> 篇笔记</span>
                            <span className="maturity"><i className="dot shaped" />成型 {agg.maturity.shaped}</span>
                            <span className="maturity"><i className="dot draft" />草稿 {agg.maturity.draft}</span>
                          </div>
                          <div className="chapters">
                            {agg.notes.slice(0, 30).map((n) => (
                              <button key={n.rel} className="chapter" onClick={() => openInObsidian(n.rel)} title="在 Obsidian 中打开">
                                <span className={n.draft ? 'dot draft' : 'dot shaped'} />
                                <span className="cn">{n.title}</span>
                                <span className="cm">{n.updated}</span>
                              </button>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="rd-aggregating">正在读取库内活动…</div>
                      )}
                    </div>
                  </div>
                )}

                <div className="d-sec ai-card">
                  <div className="d-label">AI 协助<span className="val">{book.link ? '只读笔记,不改库' : '关联笔记后可用'}</span></div>
                  <div className="ai-row">
                    <button className="ai-chip" disabled={!book.link} onClick={() => onAskAI(`请基于《${book.title}》的笔记，把主要概念串联成一份结构化总结：先列核心概念与关系，再指出笔记间的引用脉络；资料不足时明确说明。`, book.id)}>串联概念总结</button>
                    <button className="ai-chip" disabled={!book.link} onClick={() => onAskAI(`请基于《${book.title}》的笔记出 10 道自测题（混合概念辨析与应用场景），先只给题目；等我回答后逐题给出参考答案与笔记出处。`, book.id)}>出 10 道自测题</button>
                    <button className="ai-chip" onClick={() => onAskAI(book.comment ? `我给《${book.title}》的短评是「${book.comment}」。请结合我的短评与笔记，和我聊聊这本书的价值与值得再读的部分。` : `请结合笔记与我聊聊《${book.title}》这本书的价值与阅读建议。`, book.id)}>结合短评聊这本书</button>
                  </div>
                  <div className="ai-hint">AI 只读取<b>规范页摘要与最近笔记</b>,正文需要时按篇取用(只读);解读在右侧 AI 面板进行。</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {vaultDialogOpen && <Modal title="从库导入" className="rd-vault-dialog" close={() => { if (!scanning) setVaultDialogOpen(false); }}>
        <form className="form-body" noValidate aria-busy={scanning} onSubmit={event => { event.preventDefault(); scanAndImport(); }}>
          <p className="field-help" id="reading-vault-help">填写 Obsidian 库的本地文件夹路径，需包含 .obsidian 文件夹。确认后记住此路径并扫描书目，笔记库保持只读。</p>
          <label htmlFor="reading-vault-path">读书笔记库路径</label>
          <input id="reading-vault-path" ref={vaultInputRef} aria-label="读书笔记库路径" placeholder="如：C:/Myself/Obsidian/读书笔记" readOnly={scanning} value={vaultInput}
            aria-invalid={Boolean(vaultError)} aria-describedby={vaultError ? 'reading-vault-help reading-vault-error' : 'reading-vault-help'}
            onChange={event => { setVaultInput(event.target.value); setVaultError(''); }} onKeyDown={event => { if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault(); }} />
          {storeData.books.some(item => item.link) && <p className="field-help">当前为单库关联，更改路径会更新已有书目的笔记来源；书目和阅读进度保留。</p>}
          {vaultError && <p className="error" id="reading-vault-error" role="alert">{vaultError}</p>}
          <div className="bazi-form-actions"><button type="button" className="btn btn-sec" disabled={scanning} onClick={() => setVaultDialogOpen(false)}>取消</button><button type="submit" className="btn btn-pri" disabled={scanning}>{scanning ? '正在扫描…' : '关联并扫描'}</button></div>
        </form>
      </Modal>}

      {modalOpen && (
        <Modal title="添加书目" close={() => setModalOpen(false)}>
          <div className="form-body">
            <div className="bazi-form">
              <div className="bazi-form-field bazi-form-wide">
                <span className="bazi-form-label">书名</span>
                <input aria-label="书名" placeholder="如:DAMA 数据管理知识体系指南" maxLength={60} value={mTitle} onChange={(e) => setMTitle(e.target.value)} autoFocus />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">作者(可选)</span>
                <input aria-label="作者" placeholder="如:兰小欢" maxLength={40} value={mAuthor} onChange={(e) => setMAuthor(e.target.value)} />
              </div>
              <div className="bazi-form-field">
                <span className="bazi-form-label">状态</span>
                <Segmented aria-label="阅读状态" value={mStatus} options={READING_STATUSES.map((s) => ({ value: s, label: READING_STATUS_LABEL[s] }))} onChange={(v: string) => setMStatus(v as ReadingStatus)} />
              </div>
              <div className="bazi-form-field bazi-form-wide">
                <span className="bazi-form-label">标签(逗号分隔,可选)</span>
                <input aria-label="标签" placeholder="如:技术, 考试" maxLength={60} value={mTags} onChange={(e) => setMTags(e.target.value)} />
              </div>
              {storeData.vaultPath && (
                <div className="bazi-form-field bazi-form-wide">
                  <span className="bazi-form-label">关联库内文件夹(可选)</span>
                  <Select aria-label="关联库内文件夹" value={mFolder} options={[{ value: '', label: '暂不关联' }, ...folders.map((c) => ({ value: c.folder, label: `${c.name}(${c.noteCount} 篇)` }))]} onChange={setMFolder} />
                </div>
              )}
            </div>
            <div className="bazi-form-actions">
              <button className="btn btn-sec" onClick={() => setModalOpen(false)}>取消</button>
              <button className="btn btn-pri" onClick={saveModal}>添加</button>
            </div>
          </div>
        </Modal>
      )}
    </section>
  );
}
