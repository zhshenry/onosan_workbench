import { useId } from 'react';
import { ArrowRight, ArrowUpRight, Check, Sparkle } from '@phosphor-icons/react';
import { Select } from '../../../src/ui/controls';
import { ASTRO_READING_TOPICS, ASTRO_READING_TOPIC_IDS, type AstroReadingTopic } from '../../../shared/astro-reading';

export interface AstroReadingDraft { topic: AstroReadingTopic; question: string; }
export const DEFAULT_ASTRO_READING_DRAFT: AstroReadingDraft = { topic: 'overview', question: '' };

export function AstroReading({ draft, onChange, busy, checking, configured, configError, onRetryConfig, onStart }: {
  draft: AstroReadingDraft; onChange(draft: AstroReadingDraft): void;
  busy: boolean; checking: boolean; configured: boolean; configError: string;
  onRetryConfig(): void; onStart(): void;
}) {
  const id = useId(), topic = ASTRO_READING_TOPICS[draft.topic];
  return <section className="bazi-as-reading" aria-labelledby={`${id}-title`}>
    <header><h3 id={`${id}-title`}><Sparkle size={22} weight="fill" aria-hidden="true" />想了解星盘的哪一面？</h3></header>
    <div className="bazi-as-reading-field">
      <label htmlFor={`${id}-topic`}>解读主题</label>
      <Select id={`${id}-topic`} aria-label="解读主题" aria-describedby={`${id}-description`} value={draft.topic}
        onChange={value => onChange({ ...draft, topic: value as AstroReadingTopic })}
        options={ASTRO_READING_TOPIC_IDS.map(value => ({ value, label: ASTRO_READING_TOPICS[value].label }))} />
      <p id={`${id}-description`}>{topic.description}</p>
    </div>
    <div className="bazi-as-reading-field">
      <div className="bazi-as-reading-label"><strong>你可以这样问</strong><span>点击填入，可修改</span></div>
      <div className="bazi-as-reading-questions" role="group" aria-label="问题示例">
        {topic.questions.map(question => <button type="button" key={question} aria-pressed={draft.question === question}
          onClick={() => onChange({ ...draft, question })}>
          <span>{question}</span>{draft.question === question ? <Check size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
        </button>)}
      </div>
    </div>
    <div className="bazi-as-reading-field">
      <div className="bazi-as-reading-label"><label htmlFor={`${id}-question`}>你的问题</label></div>
      <textarea id={`${id}-question`} value={draft.question} maxLength={10000} rows={3}
        placeholder="写下你想了解的问题，也可以直接开始解读。" onChange={event => onChange({ ...draft, question: event.target.value })} />
    </div>
    {configError && <p className="bazi-as-reading-error" role="alert">{configError}<button type="button" className="bazi-as-text-button" onClick={onRetryConfig}>重新读取</button></p>}
    {!checking && !configError && !configured && !busy && <p className="bazi-as-reading-help">请先配置并启用一个对话模型，主题和问题会为你保留。</p>}
    <footer>
      <button type="button" className="btn btn-pri" disabled={!busy && (checking || !!configError)} onClick={onStart}>
        <Sparkle size={16} weight="fill" aria-hidden="true" />{busy ? '查看解读' : checking ? '读取 AI 配置…' : configured ? '开始解读' : '去配置 AI'}<ArrowUpRight size={15} aria-hidden="true" />
      </button>
    </footer>
  </section>;
}
