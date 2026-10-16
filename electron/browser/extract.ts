import { createHash, randomUUID } from 'node:crypto';
import { browserRecordUrl, type BrowserExtract } from '../../shared/browser-automation-contracts';
import type { BrowserDriver } from './driver';

type Collect = Extract<BrowserExtract, { operation: 'collect' }>;
interface Row { values: Record<string, string | number | null>; raw: Record<string, string>; source: { url: string; tabUrl: string; frameId: string; row: number; at: string }; }
interface Collection { tabId: string; origin?: string; signature: string; rows: Map<string, Row>; pages: Map<string, { total: number; offsets: Set<number> }>; issues: string[]; invalid: number; total?: number; ended: boolean; }
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');

export function parseBrowserField(raw: string, type: Collect['fields'][number]['type']): string | number | null {
  const value = raw.replace(/\s+/g, ' ').trim();
  if (type === 'text') return value;
  if (!value) return null;
  if (type === 'number') {
    const number = value.replace(/^[￥¥$€£]\s*/, '');
    const parsed = Number(number.replaceAll(',', ''));
    return /^-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(number) && Number.isFinite(parsed) && (number.includes('.') || Number.isSafeInteger(parsed)) ? parsed : null;
  }
  const date = /^(\d{4})[-/年](\d{1,2})[-/月](\d{1,2})日?$/.exec(value);
  if (!date) return null;
  const [, year, month, day] = date.map(Number), parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day ? `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
}

/** Collections belong to one live task and tab. Page navigation stays in the normal guarded action loop. */
export class BrowserCollections {
  private collections = new Map<string, Collection>();
  clear(): void { this.collections.clear(); }
  async extract(tabId: string, input: BrowserExtract, driver: BrowserDriver, signal?: AbortSignal) {
    let id = input.collectionId;
    let collection = id ? this.collections.get(id) : undefined;
    if (id && (!collection || collection.tabId !== tabId)) throw new Error('提取集合已失效或不属于此任务标签，请重新收集。');
    if (input.operation === 'collect') {
      const names = input.fields.map(field => field.name);
      if (new Set(names).size !== names.length || new Set(input.keyFields).size !== input.keyFields.length || input.keyFields.some(name => !names.includes(name))) throw new Error('字段名不能重复，去重字段必须来自提取字段。');
      const signature = digest({ fields: input.fields, keyFields: input.keyFields, query: { ...input.query, offset: 0, limit: 250, textOffset: 0 }, totalQuery: input.totalQuery, endCondition: input.endCondition });
      if (collection && collection.signature !== signature) throw new Error('字段、范围或完整性条件已变化，请新建提取集合。');
      if (!collection) {
        if (this.collections.size >= 8) throw new Error('本任务最多保留 8 个提取集合。');
        id = randomUUID(); collection = { tabId, signature, rows: new Map(), pages: new Map(), issues: [], invalid: 0, ended: false };
        this.collections.set(id, collection);
      }
      const observation = await driver.observe(false, false, signal, input.query);
      const at = new Date().toISOString(), url = browserRecordUrl(observation.tab.url);
      const origin = new URL(observation.tab.url).origin;
      if (collection.origin && collection.origin !== origin) throw new Error('提取来源站点已变化，请新建集合。');
      collection.origin = origin;
      const issue = (message: string) => { collection!.invalid++; if (collection!.issues.length < 30) collection!.issues.push(message); };
      const pageId = digest([url, observation.text, observation.page?.totalElements]);
      const page = collection.pages.get(pageId) ?? { total: observation.page?.totalElements ?? observation.elements.length, offsets: new Set<number>() };
      const offset = observation.page?.offset ?? 0;
      for (let index = 0; index < observation.elements.length; index++) {
        const element = observation.elements[index]; page.offsets.add(offset + index);
        if (element.cells?.length && element.cells.every(cell => ['columnheader', 'rowheader'].includes(cell.role))) continue;
        if (!element.cells || element.cellsTruncated) { issue(`第 ${offset + index + 1} 行未完整读取到表格单元格。`); continue; }
        const raw: Row['raw'] = Object.create(null), values: Row['values'] = Object.create(null);
        let valid = true;
        for (const field of input.fields) {
          const cell = element.cells[field.column];
          raw[field.name] = cell?.text ?? '';
          const parsed = parseBrowserField(raw[field.name], field.type);
          values[field.name] = parsed;
          if (!cell || cell.truncated || field.required && !raw[field.name].trim() || raw[field.name].trim() && parsed === null) { valid = false; issue(`第 ${offset + index + 1} 行「${field.name}」缺失、截断或类型不符。`); }
        }
        if (input.keyFields.some(name => values[name] === null || values[name] === '')) { issue(`第 ${offset + index + 1} 行缺少去重键。`); continue; }
        const key = digest(input.keyFields.map(name => values[name]));
        const previous = collection.rows.get(key);
        if (previous && digest(previous.raw) !== digest(raw)) { issue(`去重键相同但字段值变化：${input.keyFields.map(name => raw[name]).join(' / ')}。`); continue; }
        if (!previous) {
          if (collection.rows.size >= 1000) { issue('集合达到 1000 条上限，请按筛选范围拆分收集。'); break; }
          collection.rows.set(key, { values, raw, source: { url: browserRecordUrl(observation.frames.find(frame => frame.id === element.frameId)?.url ?? observation.tab.url), tabUrl: url, frameId: element.frameId, row: offset + index + 1, at } });
        }
        if (!valid) collection.ended = false;
      }
      collection.pages.set(pageId, page);
      if (observation.queryIncomplete || observation.frames.some(frame => !frame.available && (!input.query.frameId || frame.id === input.query.frameId))) issue('有未授权或未读到的框架，不能声称完整。');
      if (input.totalQuery) {
        const total = await driver.observe(false, false, signal, input.totalQuery);
        const match = /^\D*(\d[\d,]*)\D*$/.exec(total.text.trim());
        const count = match ? Number(match[1].replaceAll(',', '')) : NaN;
        if (!match || !Number.isSafeInteger(count) || total.truncated || total.queryIncomplete || total.elements.length !== 1) issue('页面总数无法唯一、完整地读取。');
        else if (collection.total !== undefined && collection.total !== count) issue('收集期间页面总数发生变化，请重新收集。');
        else collection.total = count;
      }
      if (input.endCondition) collection.ended ||= (await driver.check(input.endCondition, signal)).passed;
    }
    if (!collection) throw new Error('提取集合不存在。');
    const loadedComplete = [...collection.pages.values()].every(page => page.offsets.size === page.total);
    const complete = loadedComplete && !collection.invalid && collection.ended && collection.total !== undefined && collection.rows.size === collection.total;
    const rows = [...collection.rows.values()];
    const selected: Row[] = []; let size = 0;
    for (const row of rows.slice(input.resultOffset, input.resultOffset + input.resultLimit)) { const length = JSON.stringify(row).length; if (selected.length && size + length > 64000) break; selected.push(row); size += length; }
    const nextOffset = input.resultOffset + selected.length;
    return { collectionId: id!, rows: selected, nextOffset: nextOffset < rows.length ? nextOffset : undefined,
      coverage: { status: complete ? 'complete' : collection.total !== undefined || !loadedComplete || collection.invalid ? 'partial' : 'unknown', collected: rows.length, expectedTotal: collection.total, pagesRead: collection.pages.size, loadedComplete, endVerified: collection.ended, invalid: collection.invalid,
        reason: complete ? '唯一记录数与页面总数一致，已核对末页条件，所读行完整。' : '完整性尚未确认；按网页继续翻页/滚动并使用同一 collectionId 收集，不要把当前结果称为全部。' }, issues: collection.issues };
  }
}
