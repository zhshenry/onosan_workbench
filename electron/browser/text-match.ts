import { Worker } from 'node:worker_threads';
import type { BrowserText } from '../../shared/browser-automation-contracts';

export const normalizeBrowserText = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Regex runs off the main thread with a deadline, including hostile backtracking patterns. */
export async function browserTextMatcher(patterns: BrowserText[], values: string[], signal?: AbortSignal) {
  const regexes = [...new Map(patterns.filter(value => typeof value !== 'string').map(value => [JSON.stringify(value), value])).values()];
  const normalized = regexes.length ? [...new Set(values.map(normalizeBrowserText))] : [];
  const matches = new Map<string, Set<string>>();
  if (regexes.length) {
    signal?.throwIfAborted();
    const worker = new Worker(`const { parentPort, workerData } = require('node:worker_threads');
      try { parentPort.postMessage(workerData.patterns.map(({pattern,flags}) => { const re=new RegExp(pattern,flags); return workerData.values.map((value,index) => re.test(value) ? index : -1).filter(index=>index>=0); })); }
      catch { parentPort.postMessage({error:true}); }`, { eval: true, workerData: { patterns: regexes, values: normalized } });
    const result = await new Promise<number[][]>((resolve, reject) => {
      const finish = (error?: Error, value?: number[][]) => { clearTimeout(timer); signal?.removeEventListener('abort', abort); void worker.terminate(); error ? reject(error) : resolve(value!); };
      const abort = () => finish(new Error('文字匹配已停止。'));
      const timer = setTimeout(() => finish(new Error('正则匹配超时，请缩小容器或简化表达式。')), 1000);
      worker.once('message', value => value?.error ? finish(new Error('正则表达式无效，请检查 pattern 和 flags。')) : finish(undefined, value));
      worker.once('error', () => finish(new Error('正则匹配失败，请重新观察。')));
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    regexes.forEach((pattern, index) => matches.set(JSON.stringify(pattern), new Set(result[index].map(index => normalized[index]))));
  }
  return (actual: string, expected: BrowserText, exact = true, ignoreCase = false): boolean => {
    const text = normalizeBrowserText(actual);
    if (typeof expected !== 'string') return matches.get(JSON.stringify(expected))?.has(text) ?? false;
    const left = ignoreCase ? text.toLocaleLowerCase() : text, right = ignoreCase ? normalizeBrowserText(expected).toLocaleLowerCase() : normalizeBrowserText(expected);
    return exact ? left === right : left.includes(right);
  };
}
