import { useEffect, useMemo, useRef, useState } from 'react';
import {
  READING_STATUS_LABEL, READING_CURRENT_BOOK_KEY, SCAN_SKIP_HINT, booksPendingImport,
  type BookEntry, type ReadingStatus, type ReadingStoreData, type BookAggregate, type BookCandidate,
} from '../../shared/reading-contracts';
import { Modal, Segmented, Select, errorText } from '../ui/controls';
import { ArrowClockwise, ArrowSquareOut, BookOpen, Check, ChatCircle, DotsThree, FileText, Info, Link, Plus, X } from '@phosphor-icons/react';

type ImportCandidate = Pick<BookCandidate, 'folder' | 'name' | 'noteCount'>;

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
        <DotsThree size={18} aria-hidden="true" /><span className="rd-sr-only">删除书目</span>
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
const CUR_KEY = READING_CURRENT_BOOK_KEY;

const STATUS_ORDER: ReadingStatus[] = ['reading', 'wish', 'done', 'paused'];
/** 选择器只提供三态。历史「搁置」仍可读、可改选，但不能再选回去。 */
const STATUS_PICKER: ReadingStatus[] = ['wish', 'reading', 'done'];

function listProgressPct(book: BookEntry): number | undefined {
  if (book.progressPct !== undefined) return book.progressPct;
  if (book.chapterCurrent !== undefined && book.chapterTotal) return Math.round((book.chapterCurrent / book.chapterTotal) * 100);
  if (book.status === 'reading') return 0;
  return undefined;
}
export function ReadingView({ onPending, onAskAI, onCurrentBook }: {
  onPending(message: string): void;
  onAskAI(prompt: string, bookId: string): void;
  onCurrentBook(book: { id: string; title: string } | null): void;
}) {
  const [storeData, setStoreData] = useState<ReadingStoreData | null>(null);
  const [curId, setCurId] = useState<string | null>(null);
  const [agg, setAgg] = useState<BookAggregate | null>(null);
  const [statusFilter, setStatusFilter] = useState<ReadingStatus | 'all'>('all');
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
  const loadedOnce = useRef(false);

  useEffect(() => { if (vaultDialogOpen) vaultInputRef.current?.focus(); }, [vaultDialogOpen]);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.reading.list().then((data) => {
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
      (raw) => setAgg(raw),
      (e) => onPending(errorText(e)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book?.id, book?.link?.folder, storeData?.vaultPath]);

  const apply = (raw: ReadingStoreData, okMsg?: string): void => {
    setStoreData(raw);
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
  const visibleBooks = (storeData?.books ?? []).filter((b) =>
    (statusFilter === 'all' || b.status === statusFilter) && (!tagFilter || b.tags.includes(tagFilter)),
  ).sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

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
        const candidates = await wb.reading.scan(value);
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
        let latest!: ReadingStoreData;
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

  const openNew = (): void => {
    setMTitle(''); setMAuthor(''); setMStatus('wish'); setMTags(''); setMFolder('');
    if (storeData?.vaultPath) {
      void wb.reading.scan(storeData.vaultPath).then(
        (raw) => setFolders(raw),
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
    }).then((data) => {
      apply(data, `已添加「${title}」`);
      setCurId(data.books[data.books.length - 1]?.id ?? null);
      localStorage.setItem(CUR_KEY, data.books[data.books.length - 1]?.id ?? '');
    }, (e) => onPending(errorText(e)));
    setModalOpen(false);
  };

  if (!storeData) {
    return (
      <section className="view on reading-view" id="view-reading">
        <div className="greet rd-heading"><h1>阅读清单</h1></div>
        <div className="rd-workspace rd-empty" role="status">正在读取书单…</div>
      </section>
    );
  }

  const chapterPct = book?.progressPct
    ?? (book?.chapterCurrent !== undefined && book?.chapterTotal ? Math.round((book.chapterCurrent / book.chapterTotal) * 100) : undefined);

  return (
    <section className="view on reading-view" id="view-reading">
      <div className="greet rd-heading">
        <div className="rd-heading-copy">
          <h1>阅读清单</h1>
          <div className="gsub">
            {storeData.books.length} 本书 · 在读 <b>{storeData.books.filter((b) => b.status === 'reading').length}</b>
            {' · 想读 '}{storeData.books.filter((b) => b.status === 'wish').length}
            {' · 已读 '}{storeData.books.filter((b) => b.status === 'done').length}
          </div>
        </div>
        <div className="gbtns">
          <button className="btn btn-sec" onClick={openImport} disabled={scanning || importBusy} aria-haspopup="dialog">
            <ArrowClockwise size={16} aria-hidden="true" />
            从库导入
          </button>
          <button className="btn btn-pri" onClick={openNew}>
            <Plus size={16} aria-hidden="true" />
            添加书目
          </button>
        </div>
      </div>

      <div className="rd-workspace">
      {!storeData.vaultPath && (
        <div className="rd-vault">
          <div className="rd-vault-text">
            <b>关联你的读书笔记库</b>
            <span>填写 Obsidian 读书库的本地路径(需含 .obsidian 文件夹),例如 C:/Myself/Obsidian/读书笔记。工作台只读取其中的书目活动,不改动任何笔记。</span>
          </div>
          <button className="btn btn-pri btn-sm" onClick={openImport} aria-haspopup="dialog">选择读书笔记库</button>
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
          <div className="rd-empty">
            <BookOpen size={36} aria-hidden="true" />
            <b>书单还是空的</b>
            <p>点「从库导入」填写读书笔记库路径并选择书目,或「添加书目」手动录入。</p>
          </div>
        )
      ) : (
        <div className="rd-cols">
          <div className="rd-library">
            <div className="rd-library-tools">
              <Segmented aria-label="书单状态" value={statusFilter} onChange={value => setStatusFilter(value as ReadingStatus | 'all')} options={[
                { value: 'all', label: '全部' },
                ...['reading', 'wish', 'done', ...(storeData.books.some(b => b.status === 'paused') ? ['paused'] : [])].map(status => ({ value: status, label: READING_STATUS_LABEL[status as ReadingStatus] })),
              ]} />
              {allTags.length > 0 && <div className="rd-tagfilter" role="group" aria-label="按标签筛选">
                <button className={tagFilter === null ? 'rd-tf on' : 'rd-tf'} aria-pressed={tagFilter === null} onClick={() => setTagFilter(null)}>全部</button>
                {allTags.map(tag => <button key={tag} className={tagFilter === tag ? 'rd-tf on' : 'rd-tf'} aria-pressed={tagFilter === tag} onClick={() => setTagFilter(tagFilter === tag ? null : tag)}>{tag}</button>)}
              </div>}
            </div>
            <div className="rd-library-list" aria-label="书单">
                  {visibleBooks.length === 0 ? <div className="empty-note">没有符合筛选条件的书目。</div> : visibleBooks.map((b) => {
                    const pct = listProgressPct(b);
                    return (
                      <div
                        key={b.id}
                        className={b.id === book?.id ? 'bookcard on' : 'bookcard'}
                        role="button"
                        tabIndex={0}
                        aria-pressed={b.id === book?.id}
                        onClick={() => { setCurId(b.id); localStorage.setItem(CUR_KEY, b.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setCurId(b.id); localStorage.setItem(CUR_KEY, b.id); } }}
                      >
                        <span className="cover" aria-hidden="true"><BookOpen size={27} weight="light" /></span>
                        <div className="b-main">
                          <div className="b-title-row"><div className="b-title" title={b.title}>{b.title}</div><span className={`shelf-badge ${b.status}`}>{READING_STATUS_LABEL[b.status]}</span></div>
                          {b.author && <div className="b-meta"><span>{b.author}</span></div>}
                          <div className="b-side">
                          {b.status === 'done' && b.rating
                            ? <span className="stars">{'★'.repeat(b.rating)}<span className="off">{'★'.repeat(5 - b.rating)}</span></span>
                            : pct !== undefined
                              ? <><span className="b-progress">{b.status === 'reading' ? `${pct}%` : (b.chapterCurrent !== undefined && b.chapterTotal ? `第 ${b.chapterCurrent} 章 / ${b.chapterTotal}` : `${pct}%`)}</span>
                                  <progress className="b-progbar" aria-label={`${b.title}阅读进度`} max={100} value={pct} /></>
                              : <span className="b-recent">{b.status === 'wish' ? '待开始' : ''}</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
            </div>
          </div>

          {book && (
            <div className="detail">
              <div className="rd-detail-body">
                <div className="rd-detail-actions">
                  <RemoveBookButton key={book.id} onRemove={confirmRemove} />
                  <button type="button" className="rd-close" aria-label="关闭面板" onClick={closeDetail}>
                    <span className="rd-close-x" aria-hidden="true"><X size={13} weight="bold" /></span>
                  </button>
                </div>
                <div className="d-head">
                  <span className="d-cover" aria-hidden="true"><BookOpen size={44} weight="light" /></span>
                  <div className="d-t">
                    <div className="d-title">{book.title}</div>
                    {book.author && <div className="d-author">{book.author}</div>}
                    {book.link && <span className="b-link" title={book.link.folder}><Link size={13} aria-hidden="true" />关联 Obsidian 笔记</span>}
                    <div className="d-state">
                      {book.status === 'paused' && <p className="rd-paused-now">当前为搁置</p>}
                      <div className="pseg" role="radiogroup" aria-label="阅读状态">
                        {STATUS_PICKER.map((s) => (
                          <button key={s} type="button" role="radio" aria-checked={book.status === s} className={book.status === s ? 'on' : ''} onClick={() => save({ status: s })}>
                            {READING_STATUS_LABEL[s]}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="d-sec">
                  <div className="progress-row">
                    <span className="d-label">阅读进度</span>
                    <input
                      type="range" min={0} max={100} value={chapterPct ?? 0}
                      aria-label="阅读进度百分比"
                      onChange={(e) => save({ progressPct: Number(e.target.value) })}
                    />
                    <span className="pct">{chapterPct !== undefined ? `${chapterPct}%` : '未设置'}</span>
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

                <div className="d-sec rd-tags">
                  <div className="d-label">标签</div>
                  <div className="tagrow">
                    {book.tags.map((tag) => (
                      <button key={tag} type="button" className="b-tag on" aria-label={`删除标签 ${tag}`}
                        title="移除标签"
                        onClick={() => save({ tags: book.tags.filter((t) => t !== tag) })}
                      >{tag}<X size={11} aria-hidden="true" /></button>
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
                  <div className="d-sec rd-divide">
                    <h2 className="rd-notes-title">关联笔记</h2>
                    <div className="linkbox">
                      <div className="linkrow">
                        <span className="k">Obsidian库</span><span className="v">{vaultName}</span>
                        <button className="open" onClick={() => openInObsidian()}><ArrowSquareOut size={14} aria-hidden="true" />在 Obsidian 打开</button>
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

                <div className="d-sec ai-card rd-divide">
                  <div className="d-label">AI读书</div>
                  <div className="ai-row">
                    <button className="ai-chip" disabled={!book.link} onClick={() => onAskAI(`请基于《${book.title}》的笔记，把主要概念串联成一份结构化总结：先列核心概念与关系，再指出笔记间的引用脉络；资料不足时明确说明。`, book.id)}><Link size={14} aria-hidden="true" />串联概念总结</button>
                    <button className="ai-chip" disabled={!book.link} onClick={() => onAskAI(`请基于《${book.title}》的笔记出 10 道自测题（混合概念辨析与应用场景），先只给题目；等我回答后逐题给出参考答案与笔记出处。`, book.id)}><FileText size={14} aria-hidden="true" />出 10 道自测题</button>
                    <button className="ai-chip" onClick={() => onAskAI(book.comment ? `我给《${book.title}》的短评是「${book.comment}」。请结合我的短评与笔记，和我聊聊这本书的价值与值得再读的部分。` : `请结合笔记与我聊聊《${book.title}》这本书的价值与阅读建议。`, book.id)}><ChatCircle size={14} aria-hidden="true" />结合短评聊这本书</button>
                  </div>
                  <div className="ai-hint">AI 只读取<b>规范页摘要与最近笔记</b>,正文需要时按篇取用(只读);解读在右侧 AI 面板进行。</div>
                </div>
              </div>
            </div>
          )}
          {!book && <div className="rd-detail-empty"><BookOpen size={32} aria-hidden="true" /><b>选择一本书</b><p>查看阅读进度与关联笔记。</p></div>}
        </div>
      )}
      </div>

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
                <Segmented aria-label="阅读状态" value={mStatus} options={STATUS_PICKER.map((s) => ({ value: s, label: READING_STATUS_LABEL[s] }))} onChange={(v: string) => setMStatus(v as ReadingStatus)} />
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
