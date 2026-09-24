import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, PaperPlaneRight, Plus, Stop, GearSix, Sparkle } from '@phosphor-icons/react';
import type { AIAction, AIModel, AIProvider, ChatSession, ChatSummary } from '../../shared/todo-contracts';
import { errorText } from '../../modules/todo/ui/ui';

const wb = window.workbench;

export interface AiConfig {
  aiEnabled: boolean;
  providers: AIProvider[];
  models: AIModel[];
  activeModelId: string;
  hasConnection: boolean;
}

function actionSummary(action: AIAction): { verb: string; detail: string; danger?: boolean } {
  switch (action.type) {
    case 'create':
      return { verb: action.task.kind === 'meeting' ? '新增日程' : '新增待办', detail: `${action.task.title}${action.task.dueAt ? ` · ${new Date(action.task.dueAt).toLocaleString('zh-CN')}` : ''}` };
    case 'update':
      return { verb: '修改事项', detail: Object.entries(action.patch).map(([key, value]) => `${key}: ${value === null ? '清空' : String(value).slice(0, 40)}`).join(' · ') || '无字段' };
    case 'remove':
      return { verb: '删除事项', detail: action.id.slice(0, 8), danger: true };
    case 'create_category':
      return { verb: '新增标签', detail: action.category.name };
    case 'update_category':
      return { verb: '修改标签', detail: action.id.slice(0, 8) };
    case 'remove_category':
      return { verb: '删除标签', detail: action.id.slice(0, 8), danger: true };
  }
}

export function AiPanel({ open, onClose, seed, onOpenSettings }: {
  open: boolean;
  onClose(): void;
  /** 外部模块进线(如八字「AI 解读」):打开面板时新建会话并直接发送 */
  seed?: { text: string; nonce: number } | null;
  /** AI 设置已迁至「设置 → AI 助手」,齿轮跳转(2026-09-24) */
  onOpenSettings(): void;
}) {
  const [config, setConfig] = useState<AiConfig | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [current, setCurrent] = useState<ChatSession | null>(null);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [listOpen, setListOpen] = useState(false);
  const [consumedSeed, setConsumedSeed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastFromEvent = useRef<string | null>(null);

  const reloadConfig = (): void => {
    void wb.ai.config().then((raw) => setConfig(raw as AiConfig), (e) => setError(errorText(e)));
  };
  const reloadChats = (): void => {
    void wb.ai.chatList().then((raw) => setChats(raw as ChatSummary[]), () => undefined);
  };

  useEffect(() => {
    if (!open) return;
    reloadConfig();
    reloadChats();
    void wb.ai.chatOpen().then((raw) => { const chat = raw as ChatSession; setCurrent(chat); if (current?.id !== chat.id) setInput(chat.draft); }, () => undefined);
  }, [open]);

  // 外部进线:新建会话并直接把 seed 文本发给 AI(current 直接指向新会话,无 chatOpen 竞态)
  useEffect(() => {
    if (!open || !seed || seed.nonce === consumedSeed) return;
    setConsumedSeed(seed.nonce);
    let cancelled = false;
    void wb.ai.chatNew().then(
      (raw) => {
        if (cancelled) return;
        const chat = raw as ChatSession;
        setCurrent(chat);
        setBusy(true);
        void wb.ai.ask(chat.id, seed.text).catch((e) => {
          setError(errorText(e));
          setBusy(false);
        });
      },
      (e) => setError(errorText(e)),
    );
    return () => { cancelled = true; };
  }, [open, seed, consumedSeed]);

  useEffect(() => {
    const off = wb.ai.onChat((raw) => {
      const chat = raw as ChatSession;
      lastFromEvent.current = chat.id;
      setCurrent((prev) => (prev && prev.id === chat.id ? chat : prev));
      reloadChats();
      setBusy(chat.entries.some(e => e.streaming));
    });
    return off;
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [current?.entries.length, current?.entries[current.entries.length - 1]?.content]);

  const send = (): void => {
    if (!current || !input.trim() || busy) return;
    setError('');
    const text = input.trim();
    setInput('');
    setBusy(true);
    void wb.ai.ask(current.id, text).catch((e) => {
      setError(errorText(e));
      setInput((previous) => previous || text);
      setBusy(false);
    });
  };

  if (!open) return null;
  const activeModel = config?.models.find((m) => m.id === config?.activeModelId) ?? config?.models[0];
  const activeProvider = config?.providers.find((p) => p.id === activeModel?.providerId);

  return (
    <>
      <aside className="ai-panel" role="complementary" aria-label="AI 助手">
        <header className="ai-panel-head">
          {listOpen ? (
            <button className="ai-text-btn" onClick={() => setListOpen(false)}><ArrowLeft size={15} />返回</button>
          ) : (
            <button className="ai-text-btn" onClick={() => setListOpen(true)}>会话列表</button>
          )}
          <span className="ai-panel-title"><Sparkle size={15} weight="fill" /> AI 助手</span>
          <span className="ai-panel-model" title={activeProvider ? `${activeProvider.name} · ${activeModel?.name ?? ''}` : '未配置模型'}>{config?.aiEnabled && activeModel ? activeModel.name : '未启用'}</span>
          <button className="ai-icon-btn" title="AI 设置" onClick={onOpenSettings}><GearSix size={16} /></button>
          <button className="ai-icon-btn" title="关闭" onClick={onClose}>✕</button>
        </header>

        {listOpen ? (
          <div className="ai-session-list">
            <button className="ai-new-chat" onClick={() => { void wb.ai.chatNew().then((raw) => { setCurrent(raw as ChatSession); setInput(''); setListOpen(false); }, (e) => setError(errorText(e))); }}><Plus size={14} />新对话</button>
            {chats.map((chat) => (
              <button key={chat.id} className={current?.id === chat.id ? 'ai-session on' : 'ai-session'} onClick={() => { void wb.ai.chatOpen(chat.id).then((raw) => { const opened = raw as ChatSession; setCurrent(opened); setInput(opened.draft); setListOpen(false); }, () => undefined); }}>
                <span className="ai-session-title">{chat.title}</span>
                <span className="ai-session-remove" title="删除会话" onClick={(e) => { e.stopPropagation(); void wb.ai.chatRemove(chat.id).then((raw) => { setCurrent(raw as ChatSession); reloadChats(); }, (err) => setError(errorText(err))); }}>✕</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            <div className="ai-messages" ref={scrollRef}>
              {!current || current.entries.length === 0 ? (
                <div className="ai-empty">
                  <span className="ai-empty-avatar"><Sparkle size={24} weight="fill" /></span>
                  <b>待办与工作台 AI 助手</b>
                  <p>查询今天的安排、让它帮忙建事项改日程——所有写入都会先变成建议,由你确认后应用。AI 配置与对话为工作台独立;写入待办仍与 To-Do-List 同库互通。</p>
                </div>
              ) : (
                current.entries.map((entry) => (
                  <div key={entry.id} className={entry.role === 'user' ? 'ai-msg user' : 'ai-msg'}>
                    {entry.role === 'assistant' && entry.tools && entry.tools.length > 0 && (
                      <div className="ai-tools">
                        {entry.tools.map((tool) => (
                          <span key={tool.id} className={`ai-tool ${tool.status}`}>{tool.label}{tool.status === 'running' ? '…' : tool.status === 'error' ? ' ✕' : ' ✓'}</span>
                        ))}
                      </div>
                    )}
                    {entry.content ? <div className="ai-bubble">{entry.content}{entry.streaming ? <span className="ai-caret" /> : null}</div> : entry.streaming ? <div className="ai-typing"><i /><i /><i /></div> : null}
                    {entry.error && <div className="ai-error" role="alert">{entry.error}</div>}
                    {entry.proposal && entry.actionState === 'pending' && entry.proposal && (
                      <div className="ai-proposal">
                        <div className="ai-proposal-head">请确认以下 {entry.proposal.actions.length} 项操作</div>
                        {entry.proposal.actions.map((action, index) => {
                          const summary = actionSummary(action);
                          return (
                            <label key={index} className={summary.danger ? 'ai-proposal-item danger' : 'ai-proposal-item'}>
                              <input type="checkbox" checked={selected.includes(index)} onChange={(e) => setSelected((ids) => (e.target.checked ? [...ids, index] : ids.filter((i) => i !== index)))} />
                              <span className="ai-proposal-verb">{summary.verb}</span>
                              <span className="ai-proposal-detail">{summary.detail}</span>
                            </label>
                          );
                        })}
                        <div className="ai-proposal-actions">
                          <button className="ai-apply" disabled={!selected.length || busy} onClick={() => { void wb.ai.apply(entry.proposal!.token, selected).then(() => setSelected([]), (e) => setError(errorText(e))); }}>应用所选({selected.length})</button>
                          <button className="ai-discard" onClick={() => { void wb.ai.discard(entry.proposal!.token); setSelected([]); }}>放弃</button>
                        </div>
                      </div>
                    )}
                    {entry.actionState && entry.actionState !== 'pending' && (
                      <div className={`ai-action-state ${entry.actionState}`}>
                        {({ applied: '已应用', discarded: '已放弃', expired: '已过期,未应用', revised: '已被后续对话更新' } as const)[entry.actionState]}
                      </div>
                    )}
                  </div>
                ))
              )}
              {error && <div className="ai-error" role="alert">{error}</div>}
            </div>
            <footer className="ai-compose">
              <textarea
                value={input}
                placeholder={config?.aiEnabled ? '让 AI 帮你安排或查询待办…' : '请先在 AI 设置中配置并启用'}
                disabled={!config?.aiEnabled}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
              />
              {busy ? (
                <button className="ai-send cancel" title="停止生成" onClick={() => wb.ai.cancel()}><Stop size={16} weight="fill" /></button>
              ) : (
                <button className="ai-send" title="发送" disabled={!input.trim() || !config?.aiEnabled} onClick={send}><PaperPlaneRight size={16} weight="fill" /></button>
              )}
            </footer>
          </>
        )}
      </aside>
    </>
  );
}
