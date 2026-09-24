/** 共享的显示单元格、资源上限与解析失败类别。移植自 DSH excel/model.ts。 */
import { update as formatNumber, type Cell, type Sheet, type SheetConfig } from '@fortune-sheet/core';

/** 在分配 FortuneSheet 稠密单元格矩阵前施加的资源上限。 */
export interface ExcelLimits {
  /** 源文件最大字节数。 */
  maxBytes: number;
  /** 全部工作表合并矩形区域的最大单元格数。 */
  maxCells: number;
  /** 单个解析 Worker 的最长存活时间。 */
  timeoutMs: number;
}

/** 缺省上限(与 DSH 一致:16 MiB / 25 万单元格 / 15 秒)。 */
export const EXCEL_LIMITS: ExcelLimits = { maxBytes: 16_777_216, maxCells: 250_000, timeoutMs: 15_000 };

/** XLSX 预览省略的内容类别(按稳定顺序上报)。 */
export const EXCEL_UNSUPPORTED_FEATURES = ['charts', 'images', 'shapes', 'conditionalFormatting'] as const;

/** 检测到但预览不显示的工作簿内容。 */
export type ExcelUnsupportedFeature = (typeof EXCEL_UNSUPPORTED_FEATURES)[number];

/** 预览数据、缺失的公式结果数与检测到的不显示内容。 */
export interface ExcelPreview {
  sheets: Sheet[];
  missingResults: number;
  unsupportedFeatures: ExcelUnsupportedFeature[];
}

/** 保留可寻址的 A1 选区(含 A1 合并);用作激活工作表时的初始选区。 */
export function initialSelection(config: SheetConfig): NonNullable<Sheet['luckysheet_select_save']> {
  const merge = config.merge?.['0_0'];
  return [{ row: [0, (merge?.rs ?? 1) - 1], column: [0, (merge?.cs ?? 1) - 1], row_focus: 0, column_focus: 0 }];
}

/** 应用数字格式与默认对齐,不重新计算公式。 */
export function formatCell(cell: Cell, numberFormat: string): Cell {
  if (cell.ht === undefined) cell.ht = typeof cell.v === 'number' ? 2 : typeof cell.v === 'boolean' ? 0 : 1;
  if (cell.ct === undefined)
    cell.ct = { fa: numberFormat, t: typeof cell.v === 'number' ? 'n' : typeof cell.v === 'boolean' ? 'b' : 's' };
  const formatted = typeof cell.v === 'number' ? (formatNumber(numberFormat, cell.v) as string | number) : cell.v;
  cell.m = formatted === undefined ? '' : String(formatted);
  return cell;
}
