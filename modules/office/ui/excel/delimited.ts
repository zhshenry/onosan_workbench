/** CSV/TSV 解析:所有字段保留为字面文本。移植自 DSH excel/delimited.ts。 */
import Papa from 'papaparse';
import type { Sheet } from '@fortune-sheet/core';
import { ExcelPreviewError } from './error';
import { formatCell, initialSelection, type ExcelLimits, type ExcelPreview } from './model';

/** 解析 UTF-8 或带 BOM 的 UTF-16 分隔文本,不做类型推断。 */
export function convertDelimited(bytes: Uint8Array<ArrayBuffer>, format: 'csv' | 'tsv', limits: ExcelLimits): ExcelPreview {
  const encoding = (bytes[0] === 0xff && bytes[1] === 0xfe ? 'utf-16le' : bytes[0] === 0xfe && bytes[1] === 0xff ? 'utf-16be' : 'utf-8') as string;
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch (error) {
    throw new ExcelPreviewError('encoding', { cause: error });
  }
  const celldata: NonNullable<Sheet['celldata']> = [];
  let row = 0;
  let column = 1;
  let failure: ExcelPreviewError | undefined;
  Papa.parse<string[]>(text, {
    delimiter: format === 'csv' ? ',' : '\t',
    header: false,
    dynamicTyping: false,
    skipEmptyLines: false,
    step(result, parser) {
      row += 1;
      column = Math.max(column, result.data.length);
      if (result.errors.length > 0 || row * column > limits.maxCells) {
        failure = new ExcelPreviewError(result.errors.length > 0 ? 'invalid' : 'tooLarge');
        parser.abort();
        return;
      }
      result.data.forEach((value, c) => {
        celldata.push({ r: row - 1, c, v: formatCell({ v: value }, '@') });
      });
    },
  });
  if (failure !== undefined) throw failure;
  return {
    sheets: [
      {
        id: '1', name: format.toUpperCase(), order: 0, status: 1, hide: 0,
        row: Math.max(1, row), column, celldata, config: {}, luckysheet_select_save: initialSelection({}),
      },
    ],
    missingResults: 0,
    unsupportedFeatures: [],
  };
}
