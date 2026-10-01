/** 已采集列表:搜索过滤 + 打开/删除/备注编辑。起始页网格与侧栏抽屉共用。 */
import { useState } from 'react';
import { MagnifyingGlass, Note, X } from '@phosphor-icons/react';
import type { MediaCaptureItem } from '../../../shared/media-capture-contracts';

export function CaptureStrip({ items, onOpen, onRemove, onSetNote }: {
  items: MediaCaptureItem[];
  onOpen(url: string): void;
  onRemove(id: string): void;
  onSetNote(id: string, note: string): void;
}) {
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState('');

  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter((c) => `${c.title}\n${c.url}\n${c.note ?? ''}`.toLowerCase().includes(q))
    : items;

  const startNote = (c: MediaCaptureItem): void => {
    setEditingId(c.id);
    setNoteDraft(c.note ?? '');
  };
  const saveNote = (id: string): void => {
    onSetNote(id, noteDraft);
    setEditingId(null);
  };

  return (
    <div className="mbp-recent">
      <div className="mbp-rlabel">
        最近采集
        {items.length > 3 && (
          <span className="mbp-search">
            <MagnifyingGlass size={12} />
            <input
              aria-label="搜索采集"
              placeholder="搜索标题 / 链接 / 备注"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            {query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={10} weight="bold" /></button>}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="mbp-caps-empty">还没有采集 —— 打开一个页面,点右上「采集到素材」试试。</div>
      ) : filtered.length === 0 ? (
        <div className="mbp-caps-empty">没有匹配「{query}」的采集。</div>
      ) : (
        <div className="mbp-capgrid">
          {filtered.map((c) => (
            <div key={c.id} className="mbp-capcard">
              <div
                className="mbp-capthumb"
                role="button"
                tabIndex={0}
                title="在浏览器中打开"
                onClick={() => onOpen(c.url)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(c.url); } }}
              >
                {c.thumb
                  ? <img src={c.thumb} alt="" loading="lazy" />
                  : <div style={{ width: '70%' }}><div className="mbp-ph" style={{ width: '100%' }} /><div className="mbp-ph" style={{ width: '72%', marginBottom: 0 }} /></div>}
              </div>
              <div className="mbp-capbody">
                <div className="t" role="button" tabIndex={0} title={c.title}
                  onClick={() => onOpen(c.url)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onOpen(c.url); } }}
                >
                  {c.title}
                </div>
                <div className="u">{c.url.replace(/^https?:\/\//, '')}</div>
                {editingId === c.id ? (
                  <div className="mbp-note-edit">
                    <textarea
                      aria-label="编辑备注"
                      value={noteDraft}
                      maxLength={200}
                      autoFocus
                      placeholder="备注:为什么值得留(最多 200 字)"
                      onChange={(e) => setNoteDraft(e.target.value)}
                    />
                    <div className="mbp-note-actions">
                      <button className="cancel" onClick={() => setEditingId(null)}>取消</button>
                      <button className="save" onClick={() => saveNote(c.id)}>保存</button>
                    </div>
                  </div>
                ) : (
                  <>
                    {c.note && <div className="mbp-note-text" title={c.note}>{c.note}</div>}
                    <div className="mbp-card-acts">
                      <span
                        className="mbp-capdel"
                        role="button"
                        aria-label={`编辑备注 ${c.title}`}
                        title="编辑备注"
                        onClick={(e) => { e.stopPropagation(); startNote(c); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); startNote(c); } }}
                      >
                        <Note size={10} />
                      </span>
                      <span
                        className="mbp-capdel"
                        role="button"
                        aria-label={`删除采集 ${c.title}`}
                        title="删除"
                        onClick={(e) => { e.stopPropagation(); onRemove(c.id); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRemove(c.id); } }}
                      >
                        <X size={10} weight="bold" />
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
