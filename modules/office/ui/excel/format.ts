/** 文件名到解析器的选择,放在重型表格分块之外。移植自 DSH excel/format.ts。 */
import { ExcelPreviewError } from './error';

/** 表格预览支持的格式。 */
export type ExcelFormat = 'xlsx' | 'xls' | 'csv' | 'tsv';

/** @param path - 文件名(可含路径)。 @returns 支持的后缀;不支持则抛 invalid。 */
export function excelFormat(path: string): ExcelFormat {
  const suffix = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  if (suffix === 'xlsx' || suffix === 'xls' || suffix === 'csv' || suffix === 'tsv') return suffix;
  throw new ExcelPreviewError('invalid');
}
