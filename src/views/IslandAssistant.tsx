import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { PaperPlaneRight, PushPin, Stop, X } from '@phosphor-icons/react';
import type { ChatSession } from '../../shared/todo-contracts';
import type { AiConfig } from '../../shared/workbench-api';
import { chatContextScope } from '../../shared/ai-scope';
import { IconButton, Select, errorText } from '../ui/controls';
import { IslandMascot } from '../ui/IslandMascot';
import { useIslandState } from './island-state';
import { IslandAgentMessages } from './IslandAgentMessages';
import { AiResponse } from './AiResponse';
import { TodoProposalCard } from './TodoProposalCard';
import './desktop-island.css';
import './island-assistant.css';

const wb = window.workbench;
const CHAT_KEY = 'wb.island.ai.chat.v1';
type Question = { id: string; sessionId: string; question: string; options: { label: string; description?: string }[] };

export function IslandAssistant() {
  const island = useIslandState();
  const [tab, setTab] = useState('chat'), [pinned, setPinned] = useState(true);
  const [config, setConfig] = useState<AiConfig | null>(null), [chat, setChat] = useState<ChatSession | null>(null);
  const [input, setInput] = useState(''), [loading, setLoading] = useState(true), [sending, setSending] = useState(false);
  const [error, setError] = useState(''), [busyAction, setBusyAction] = useState(false), [switching, setSwitching] = useState(false);
  const [configError, setConfigError] = useState('');
  const [question, setQuestion] = useState<Question | null>(null);
  const chatRef = useRef(chat), inputRef = useRef(input), editor = useRef<HTMLTextAreaElement>(null), scroll = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false), actionRef = useRef(false), follow = useRef(true);
  const configSequence = useRef(0);
  chatRef.current = chat; inputRef.current = input;
  const streaming = !!chat?.entries.some(entry => entry.streaming), busy = sending || streaming;
  const unread = island.state?.agentMessages?.filter(message => message.readAt === null).length ?? 0;
  const close = () => { void wb.island.assistant('hide').catch(cause => setError(errorText(cause))); };
  const readConfig = async (): Promise<void> => {
    const sequence = ++configSequence.current; setConfigError('');
    try { const value = await wb.ai.config(); if (sequence === configSequence.current) setConfig(value); }
    catch (cause) { if (sequence === configSequence.current) setConfigError(errorText(cause)); }
  };
  useLayoutEffect(() => {
    document.documentElement.classList.add('island-document');
    return () => document.documentElement.classList.remove('island-document');
  }, []);
  const run = async (action: () => Promise<unknown>): Promise<boolean> => {
    if (actionRef.current) return false;
    actionRef.current = true; setBusyAction(true); setError('');
    try { await action(); return true; } catch (cause) { setError(errorText(cause)); return false; }
    finally { actionRef.current = false; setBusyAction(false); }
  };
  useEffect(() => {
    let live = true;
    const stop = wb.ai.onConfigChanged(value => { if (live) { ++configSequence.current; setConfig(value); setConfigError(''); } });
    void readConfig();
    void wb.island.assistant('state').then(value => { if (live) setPinned(value.pinned); }, cause => { if (live) setError(errorText(cause)); });
    void (async () => {
      const list = await wb.ai.chatList();
      const eligible = list.filter(item => chatContextScope(item).module === 'todo');
      const saved = eligible.find(item => item.id === localStorage.getItem(CHAT_KEY)) ?? eligible[0];
      const current = saved ? await wb.ai.chatOpen(saved.id) : null;
      if (!live) return;
      setChat(current); setInput(current?.draft ?? '');
      if (current) localStorage.setItem(CHAT_KEY, current.id);
    })().catch(cause => { if (live) setError(errorText(cause)); }).finally(() => { if (live) setLoading(false); });
    return () => { live = false; ++configSequence.current; stop(); };
  }, []);
  useEffect(() => wb.ai.onChat(value => {
    if (value.id !== chatRef.current?.id) return;
    setChat(value);
    if (!value.entries.some(entry => entry.streaming)) setQuestion(null);
  }), []);
  useEffect(() => wb.ai.onAsk(value => { if (value.sessionId === chatRef.current?.id) setQuestion(value); }), []);
  useEffect(() => wb.island.onAssistantOpen(() => { setTab('chat'); requestAnimationFrame(() => editor.current?.focus()); }), []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector(':modal')) close(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    if (!loading && config?.aiEnabled && tab === 'chat') editor.current?.focus();
  }, [loading, config?.aiEnabled]);
  useEffect(() => {
    if (!chat?.id || loading) return;
    const id = chat.id;
    const timer = window.setTimeout(() => { void wb.ai.chatDraft(id, input).catch(cause => setError(errorText(cause))); }, 250);
    return () => window.clearTimeout(timer);
  }, [chat?.id, input, loading]);
  useLayoutEffect(() => {
    if (follow.current && tab === 'chat') scroll.current?.scrollTo({ top: scroll.current.scrollHeight });
  }, [chat, question, error, tab]);
  const send = async (): Promise<void> => {
    const text = inputRef.current.trim();
    if (!text || !config?.aiEnabled || !config.hasConnection || loading || switching) return;
    if (question) {
      wb.ai.answerAsk({ id: question.id, sessionId: question.sessionId, kind: 'text', value: text });
      setQuestion(null); setInput(''); return;
    }
    if (sendingRef.current || chatRef.current?.entries.some(entry => entry.streaming)) return;
    sendingRef.current = true; setSending(true); setError(''); setInput(''); follow.current = true;
    try {
      const current = chatRef.current ?? await wb.ai.chatNew({ module: 'todo' });
      chatRef.current = current; setChat(current); localStorage.setItem(CHAT_KEY, current.id);
      await wb.ai.ask(current.id, text, { scope: { module: 'todo' }, pageScope: { module: 'todo' } });
    } catch (cause) { setError(errorText(cause)); setInput(previous => previous || text); }
    finally { sendingRef.current = false; setSending(false); }
  };
  const settings = () => void run(async () => { await wb.island.navigate({ view: 'settings-ai' }); await wb.island.assistant('hide'); });
  return <main className="island-assistant-app" aria-label="待办助手">
    <header className="island-assistant-header"><IslandMascot /><h1>待办助手</h1><div>
      <IconButton label={pinned ? '取消置顶待办助手' : '置顶待办助手'} aria-pressed={pinned} onClick={() => void run(async () => setPinned((await wb.island.assistant('pin')).pinned))}><PushPin size={18} weight={pinned ? 'fill' : 'regular'} /></IconButton>
      <IconButton label="关闭待办助手" onClick={close}><X size={18} /></IconButton>
    </div></header>
    <div className="island-assistant-tabs" role="tablist" aria-label="助手内容">
      {[{ value: 'chat', label: '对话' }, { value: 'messages', label: `消息${unread ? ` ${unread}` : ''}` }].map((item, index) => <button key={item.value} role="tab" id={`assistant-tab-${item.value}`} aria-controls={`assistant-${item.value}`} aria-selected={tab === item.value} tabIndex={tab === item.value ? 0 : -1}
        onClick={() => setTab(item.value)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = index ? 'chat' : 'messages'; setTab(next); document.getElementById(`assistant-tab-${next}`)?.focus(); } }}>{item.label}</button>)}
    </div>
    {tab === 'messages' ? <section className="island-assistant-messages" id="assistant-messages" role="tabpanel" aria-labelledby="assistant-tab-messages">
      {island.state && <IslandAgentMessages embedded state={island.state} now={Date.now()} busy={busyAction} run={run} close={close} showReminders={() => { void run(() => wb.island.navigate({ view: 'home' })); }} />}
      {island.error && <p role="alert">{island.error}</p>}
    </section> : <section className="island-assistant-conversation" id="assistant-chat" role="tabpanel" aria-labelledby="assistant-tab-chat">
      <div className="island-assistant-scroll" ref={scroll} role="region" aria-label="待办对话消息" tabIndex={0}
        onScroll={event => { const node = event.currentTarget; follow.current = node.scrollHeight - node.scrollTop - node.clientHeight < 64; }}>
        {loading ? <p className="island-assistant-empty" role="status">正在读取对话…</p> : !chat?.entries.length && <div className="island-assistant-empty"><IslandMascot /><h2>今天，想先做哪一件？</h2><p>可以查询、安排或调整待办。修改前会先给出建议，等你确认。</p></div>}
        {chat?.entries.map(entry => <article key={entry.id} className={`island-assistant-message ${entry.role}`}>
          {entry.role === 'assistant' && <IslandMascot />}
          <div>{entry.role === 'user' ? <p className="island-assistant-user">{entry.content}</p> : <AiResponse entry={entry} showTools={false} />}
            {entry.error && <p className="island-assistant-error" role="alert">{entry.error}</p>}
            {entry.proposal && <TodoProposalCard variant="island" key={entry.proposal.token} entry={entry} busy={busy} apply={(token, indices) => wb.ai.apply(token, indices)} discard={token => wb.ai.discard(token)} />}
          </div>
        </article>)}
        {question && <section className="island-assistant-question" aria-label="AI 澄清问题"><p>{question.question}</p><div>{question.options.map(option => <button key={option.label} type="button" title={option.description} onClick={() => { wb.ai.answerAsk({ id: question.id, sessionId: question.sessionId, kind: 'option', value: option.label }); setQuestion(null); }}>{option.label}</button>)}<button type="button" onClick={() => { wb.ai.answerAsk({ id: question.id, sessionId: question.sessionId, kind: 'skip' }); setQuestion(null); }}>跳过问题</button></div></section>}
        {error && <p className="island-assistant-error" role="alert">{error}</p>}
      </div>
      <div className="island-assistant-compose">
        {!config ? configError ? <div className="island-assistant-config"><p role="alert">配置读取失败：{configError}</p><button type="button" onClick={() => void readConfig()}>重新读取</button></div> : <p role="status">正在读取 AI 配置…</p>
          : !config.aiEnabled || !config.hasConnection ? <div className="island-assistant-config"><p>{config.hasConnection ? 'AI 尚未启用' : '配置一个对话模型，就能开始安排待办。'}</p><button type="button" onClick={config.hasConnection ? () => void run(async () => setConfig(await wb.ai.setEnabled(true))) : settings}>{config.hasConnection ? '启用 AI' : '去配置 AI'}</button></div> : null}
        <textarea ref={editor} className="resize-none" aria-label="对待办助手说" rows={3} maxLength={10000} value={input} disabled={!config?.aiEnabled || !config.hasConnection || loading}
          placeholder={question ? '补充你的回答…' : '继续聊聊这条待办…'} onChange={event => setInput(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); void send(); } }} />
        <div className="island-assistant-toolbar"><Select aria-label="对话模型" title="对话模型" value={config?.activeModelId ?? ''} disabled={!config?.models.length || busy || switching} menuClassName="island-assistant-model-menu"
          options={config?.models.length ? config.models.map(model => ({ value: model.id, label: model.name })) : [{ value: '', label: '对话模型' }]}
          onChange={value => { setSwitching(true); void wb.ai.activateModel(value).then(setConfig, cause => setError(errorText(cause))).finally(() => setSwitching(false)); }} />
          {busy && !question ? <IconButton label="停止生成" onClick={() => { if (chat) wb.ai.cancel(chat.id); }}><Stop size={18} weight="fill" /></IconButton>
            : <IconButton label={question ? '提交回答' : '发送'} disabled={!input.trim() || !config?.aiEnabled || !config.hasConnection || loading || switching} onClick={() => void send()}><PaperPlaneRight size={18} weight="fill" /></IconButton>}
        </div>
      </div>
    </section>}
    {tab === 'messages' && error && <p className="island-assistant-error" role="alert">{error}</p>}
  </main>;
}
