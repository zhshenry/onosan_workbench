import { useId, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowSquareOut, CheckSquare, DotsThree, FileText, ImageSquare } from '@phosphor-icons/react';
import type { BotArtifact, BotCard, BotResourceRef } from '../../shared/bot-contracts';
import { AiResponse } from './AiResponse';

const workTime = (value: string) => new Date(value).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
const libraryFilters = ['全部', '文档', '图片', '其他'] as const;
type LibraryFilter = typeof libraryFilters[number];
type ArtifactFormat = 'Markdown' | 'PDF' | 'Word' | 'Excel' | '图片' | '其他';
const shortArtifactDate = new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric' });

function artifactFormat(artifact: BotArtifact): ArtifactFormat | undefined {
  const mediaType = (artifact.mediaType ?? '').split(';', 1)[0].trim().toLowerCase();
  if (mediaType === 'application/x-ono-copy') return undefined;
  if (mediaType.startsWith('image/')) return '图片';
  if (mediaType === 'text/markdown') return 'Markdown';
  if (mediaType === 'application/pdf') return 'PDF';
  if (mediaType === 'application/msword' || mediaType.startsWith('application/vnd.ms-word.') ||
      mediaType.startsWith('application/vnd.openxmlformats-officedocument.wordprocessingml.')) return 'Word';
  if (mediaType === 'application/vnd.ms-excel' || mediaType.startsWith('application/vnd.ms-excel.') ||
      mediaType.startsWith('application/vnd.openxmlformats-officedocument.spreadsheetml.')) return 'Excel';

  if (!mediaType || mediaType === 'application/octet-stream') {
    for (const name of [artifact.resource.label, artifact.title]) {
      const filename = name?.trim();
      if (!filename) continue;
      if (/\.(md|markdown)$/i.test(filename)) return 'Markdown';
      if (/\.pdf$/i.test(filename)) return 'PDF';
      if (/\.(doc[xm]?|dot[xm]?)$/i.test(filename)) return 'Word';
      if (/\.(xls[xmb]?|xlt[xm]?)$/i.test(filename)) return 'Excel';
      if (/\.(png|jpe?g|gif|webp|bmp|svg|tiff?|ico|avif|hei[cf])$/i.test(filename)) return '图片';
    }
  }
  return '其他';
}

function ArtifactRow({ artifact, image, selected, onOpen, onTask, onOpenResource }: {
  artifact: BotArtifact; image: boolean; selected: boolean; onOpen(artifact: BotArtifact): void;
  onTask(id: string): void; onOpenResource?(ref: BotResourceRef): void;
}) {
  const menuId = useId(), trigger = useRef<HTMLButtonElement>(null), menu = useRef<HTMLDivElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const linked = artifact.resource.kind !== 'artifact';
  const created = Date.parse(artifact.createdAt);
  const Icon = linked ? ArrowSquareOut : image ? ImageSquare : FileText;
  const closeActions = () => { menu.current?.hidePopover(); trigger.current?.focus({ preventScroll: true }); };

  return <li className="bot-delivery-row" data-selected={selected}>
    <button type="button" className="bot-work-row" data-artifact-id={artifact.id} aria-label={artifact.title} title={artifact.title}
      aria-current={selected || undefined} onClick={() => onOpen(artifact)}>
      <Icon size={18} weight="duotone" aria-hidden="true" /><strong>{artifact.title}</strong>
      {Number.isFinite(created) && <time dateTime={artifact.createdAt} title={workTime(artifact.createdAt)}>{shortArtifactDate.format(created)}</time>}
    </button>
    <button ref={trigger} type="button" className="bot-delivery-more" aria-label={`${artifact.title}的更多操作`} title="更多操作"
      aria-haspopup="menu" aria-expanded={actionsOpen} aria-controls={menuId} popoverTarget={menuId}
      onKeyDown={event => { if (event.key === 'ArrowDown') { event.preventDefault(); menu.current?.showPopover(); } }}>
      <DotsThree size={18} weight="bold" aria-hidden="true" />
    </button>
    <div ref={menu} id={menuId} popover="auto" role="menu" aria-label="资料操作" className="bot-delivery-menu"
      onBeforeToggle={event => setActionsOpen(event.newState === 'open')}
      onToggle={event => {
        if (event.newState !== 'open' || !trigger.current) return;
        const popup = event.currentTarget, anchor = trigger.current.getBoundingClientRect();
        const bounds = trigger.current.closest('.bot-inspector')?.getBoundingClientRect();
        popup.toggleAttribute('data-above', !!bounds && bounds.bottom - anchor.bottom < popup.offsetHeight + 4 && anchor.top - bounds.top > bounds.bottom - anchor.bottom);
        popup.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus({ preventScroll: true });
      }}
      onBlur={event => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) menu.current?.hidePopover(); }}
      onKeyDown={event => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeActions(); return; }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        event.stopPropagation();
        const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'));
        const index = items.findIndex(item => item === document.activeElement);
        const next = (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : next]?.focus({ preventScroll: true });
      }}>
      {actionsOpen && <>
        {linked && onOpenResource
          ? <button type="button" role="menuitem" tabIndex={-1} onClick={() => { closeActions(); onOpenResource(artifact.resource); }}><ArrowSquareOut size={16} />打开原件</button>
          : <button type="button" role="menuitem" tabIndex={-1} onClick={() => { closeActions(); onOpen(artifact); }}><FileText size={16} />查看内容</button>}
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => { closeActions(); onTask(artifact.taskId); }}><CheckSquare size={16} />查看来源任务</button>
      </>}
    </div>
  </li>;
}

export function BotArtifactsView({ artifacts, cards, selectedId, onSelect, onTask, onOpenResource, onExternalPreview }: {
  artifacts: BotArtifact[]; cards: BotCard[]; selectedId?: string; onSelect(id?: string): void;
  onTask(id: string): void; onOpenResource?(ref: BotResourceRef): void; onExternalPreview?(artifact: BotArtifact): void;
}) {
  const directory = useRef<HTMLElement>(null), detail = useRef<HTMLElement>(null);
  const [filter, setFilter] = useState<LibraryFilter>('全部');
  const availableFilters = new Set<LibraryFilter>(['全部']);
  const typedArtifacts = artifacts.flatMap(artifact => {
    const label = artifactFormat(artifact);
    if (!label) return [];
    const type = label === '图片' || label === '其他' ? label : '文档';
    availableFilters.add(type);
    return [{ artifact, type, label }];
  });
  const activeFilter = availableFilters.has(filter) ? filter : '全部';
  const selected = typedArtifacts.find(item => item.artifact.id === selectedId);
  const monday = new Date();
  monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const groups: Record<'本周' | '更早', typeof typedArtifacts> = { 本周: [], 更早: [] };
  for (const item of typedArtifacts) {
    if (activeFilter === '全部' || activeFilter === item.type) groups[Date.parse(item.artifact.createdAt) >= monday.getTime() ? '本周' : '更早'].push(item);
  }
  const owner = (artifact: BotArtifact) => cards.find(card => card.id === artifact.producerBotId)?.name ?? 'Bot';
  const open = (artifact: BotArtifact) => { if (onExternalPreview) onExternalPreview(artifact); else { onSelect(artifact.id); requestAnimationFrame(() => detail.current?.focus()); } };
  const back = () => { onSelect(undefined); requestAnimationFrame(() => directory.current?.querySelector<HTMLButtonElement>(`button[data-artifact-id="${selectedId}"]`)?.focus()); };
  return <div className="bot-work-view bot-artifacts-view" data-detail-open={!!selected}>
    <section className="bot-work-directory" ref={directory} aria-label={selected ? '交付件目录' : '交付件清单'}>
      {selected && <button className="bot-text-button bot-artifact-list-back" onClick={back}><ArrowLeft size={15} />全部交付件</button>}
      {typedArtifacts.length > 0 && <div className="bot-library-filters" role="group" aria-label="资料分类">
        {libraryFilters.filter(value => availableFilters.has(value)).map(value => <button type="button" key={value} aria-pressed={activeFilter === value} onClick={() => { setFilter(value); if (selected) onSelect(undefined); }}>{value}</button>)}
      </div>}
      {Object.entries(groups).map(([period, items]) => items.length > 0 && <section key={period} className="bot-library-group" aria-label={period}>
        <h3>{period}</h3><ul>{items.map(({ artifact, type }) => <ArtifactRow key={artifact.id} artifact={artifact} image={type === '图片'} selected={selectedId === artifact.id}
          onOpen={open} onTask={onTask} onOpenResource={onOpenResource} />)}</ul>
      </section>)}
      {!groups.本周.length && !groups.更早.length && <p className="bot-library-empty">{typedArtifacts.length ? '该分类暂无资料' : '这个 Bot 保存的资料会显示在这里。'}</p>}
    </section>
    {selected && <section className="bot-work-detail bot-delivery-preview" ref={detail} aria-label="交付件预览" tabIndex={-1}>
      <button className="bot-text-button bot-work-root-back" onClick={back}><ArrowLeft size={15} />返回交付件</button>
      <header className="bot-delivery-heading"><h3>{selected.artifact.title}</h3><div><p>{owner(selected.artifact)} · {selected.label} · {workTime(selected.artifact.createdAt)}</p><button className="bot-button" onClick={() => onTask(selected.artifact.taskId)}>查看来源任务<ArrowRight size={15} /></button></div></header>
      {selected.artifact.resource.kind !== 'artifact' && onOpenResource && <button className="bot-text-button" onClick={() => onOpenResource(selected.artifact.resource)}>打开原件<ArrowSquareOut size={15} /></button>}
      {selected.artifact.content ? <AiResponse entry={{ id: selected.artifact.id, role: 'assistant', content: selected.artifact.content }} /> : <p className="bot-work-muted">{selected.artifact.resource.kind !== 'artifact' ? '此交付件关联工作区原件，打开原件可查看最新内容。' : '此交付件没有保存正文。'}</p>}
    </section>}
  </div>;
}
