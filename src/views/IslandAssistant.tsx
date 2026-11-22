import { useEffect, useLayoutEffect, useState } from 'react';
import { ArrowSquareOut, PushPin, X, ChatCircleText, Tray } from '@phosphor-icons/react';
import type { BotCard } from '../../shared/bot-contracts';
import { IconButton, errorText } from '../ui/controls';
import { useIslandState } from './island-state';
import { IslandAgentMessages } from './IslandAgentMessages';
import { BotAvatar } from './BotAvatar';
import { botDraft, BotPanel } from './BotPanel';
import './desktop-island.css';
import './island-assistant.css';

const wb = window.workbench;
export function IslandAssistant() {
  const island = useIslandState();
  const [cards, setCards] = useState<BotCard[]>([]), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [tab, setTab] = useState('chat'), [pinned, setPinned] = useState(true), [visible, setVisible] = useState(true), [opening, setOpening] = useState(0);
  const coordinator = cards.find(bot => bot.seedKey === 'coordinator');
  const unread = island.state?.agentMessages?.filter(message => message.readAt === null).length ?? 0;
  const run = async (job: () => Promise<unknown>): Promise<boolean> => { if (busy) return false; setBusy(true); setError(''); try { await job(); return true; } catch (cause) { setError(errorText(cause)); return false; } finally { setBusy(false); } };
  const close = () => void run(async () => { if (coordinator) await botDraft(coordinator.mainChatId).stop(); setVisible(false); await wb.island.assistant('hide'); });
  useLayoutEffect(() => { document.documentElement.classList.add('island-document'); return () => document.documentElement.classList.remove('island-document'); }, []);
  useEffect(() => { let live = true; void wb.bot.list().then(value => { if (live) setCards(value); }, cause => { if (live) setError(errorText(cause)); }); void wb.island.assistant('state').then(value => { if (live) setPinned(value.pinned); }); const off = wb.bot.onChanged(event => { if (event.kind === 'profile') void wb.bot.list().then(value => { if (live) setCards(value); }); }); return () => { live = false; off(); }; }, []);
  useEffect(() => wb.island.onAssistantOpen(() => { setVisible(true); setTab('chat'); setOpening(value => value + 1); }), []);
  useLayoutEffect(() => { if (coordinator || error) void wb.island.assistant('ready').catch(cause => setError(errorText(cause))); }, [opening, coordinator, error]);
  useEffect(() => { const key = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector(':modal') && !document.querySelector('.select-menu')) close(); }; window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key); });
  return <main className="island-assistant-app" aria-label="Ono 总 Bot">
    <header className="island-assistant-header"><BotAvatar avatar={coordinator?.avatar ?? 'blue'} /><h1>{coordinator?.name ?? 'Ono'} · 总 Bot</h1><div>
      <IconButton label="前往总台" onClick={() => void run(async () => { if (coordinator) await botDraft(coordinator.mainChatId).stop(); setVisible(false); await wb.island.navigate({ view: 'home' }); await wb.island.assistant('hide'); })}><ArrowSquareOut size={18} /></IconButton>
      <IconButton label={pinned ? '取消置顶总 Bot' : '置顶总 Bot'} aria-pressed={pinned} onClick={() => void run(async () => setPinned((await wb.island.assistant('pin')).pinned))}><PushPin size={18} weight={pinned ? 'fill' : 'regular'} /></IconButton>
      <IconButton label="关闭总 Bot 小窗" onClick={close}><X size={18} /></IconButton>
    </div></header>
    <div className="island-assistant-tabs content-tabs" role="tablist" aria-label="助手内容">{[{ value: 'chat', label: '对话', icon: <ChatCircleText size={16} aria-hidden="true" /> }, { value: 'messages', label: `消息${unread ? ` ${unread}` : ''}`, icon: <Tray size={16} aria-hidden="true" /> }].map((item, index) => <button key={item.value} role="tab" id={`assistant-tab-${item.value}`} aria-controls={`assistant-${item.value}`} aria-selected={tab === item.value} tabIndex={tab === item.value ? 0 : -1} onClick={() => setTab(item.value)} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = index ? 'chat' : 'messages'; setTab(next); document.getElementById(`assistant-tab-${next}`)?.focus(); } }}>{item.icon}{item.label}</button>)}</div>
    <section className="island-assistant-messages" id="assistant-messages" role="tabpanel" aria-labelledby="assistant-tab-messages" hidden={tab !== 'messages'}>{island.state && <IslandAgentMessages embedded state={island.state} now={Date.now()} busy={busy} run={run} close={close} showReminders={() => { void run(() => wb.island.navigate({ view: 'todo' })); }} />}{island.error && <p role="alert">{island.error}</p>}</section>
    <section className="island-assistant-conversation" id="assistant-chat" role="tabpanel" aria-labelledby="assistant-tab-chat" hidden={tab !== 'chat'}>{coordinator ? <BotPanel key={`${coordinator.id}:${opening}`} bot={coordinator} cards={cards} open={visible && tab === 'chat'} island context={{ scope: { module: 'workbench', viewId: 'home' }, label: '总台', object: '总台' }} onClose={close} onOpenSettings={() => void run(async () => { await wb.island.navigate({ view: 'settings-ai' }); await wb.island.assistant('hide'); setVisible(false); })}
      onOpenTodo={id => void run(async () => { await wb.island.navigate({ view: 'todo', taskId: id }); await wb.island.assistant('hide'); setVisible(false); })} /> : <p className="bot-empty">{error || '正在连接总 Bot…'}</p>}</section>
    {error && <p className="bot-error" role="alert">{error}<button onClick={() => void run(async () => setCards(await wb.bot.list()))}>重新连接</button></p>}
  </main>;
}
