/** 按格式分发解析,不重新计算已保存的公式。移植自 DSH excel/convert.ts。 */
import type { ExcelFormat } from './format';
import { ExcelPreviewError } from './error';
import type { ExcelLimits, ExcelPreview } from './model';
import { convertXlsx } from './xlsx';
import { convertXls } from './xls';
import { convertDelimited } from './delimited';

/** @param bytes - 借用的完整文件字节。 @param limits - 文件与矩阵分配上限。 */
export async function convertExcel(bytes: Uint8Array<ArrayBuffer>, format: ExcelFormat, limits: ExcelLimits): Promise<ExcelPreview> {
  if (bytes.byteLength > limits.maxBytes) throw new ExcelPreviewError('tooLarge');
  if (format === 'xlsx') return convertXlsx(bytes, limits);
  if (format === 'xls') return convertXls(bytes, limits);
  return convertDelimited(bytes, format, limits);
}
