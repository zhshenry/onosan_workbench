/** 每个工作簿一个一次性解析 Worker;公式与外部链接永不执行。移植自 DSH excel/worker.ts。 */
import { convertExcel } from './convert';
import type { ExcelFormat } from './format';
import { ExcelPreviewError } from './error';
import type { ExcelLimits } from './model';

globalThis.onmessage = (event: MessageEvent<{ bytes: Uint8Array<ArrayBuffer>; format: ExcelFormat; limits: ExcelLimits }>) => {
  void convertExcel(event.data.bytes, event.data.format, event.data.limits).then(
    (value) => {
      globalThis.postMessage({ ok: true, value });
    },
    (error: unknown) => {
      globalThis.postMessage({ ok: false, code: error instanceof ExcelPreviewError ? error.code : 'invalid' });
    },
  );
};
