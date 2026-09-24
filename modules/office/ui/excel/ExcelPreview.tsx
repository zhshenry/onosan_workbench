/** Excel 预览的轻入口:按文件名选格式,重型 FortuneSheet 分块只在打开文件时加载。
 * 结构对应 DSH 的 LazyExcelBody + excel.tsx 懒加载边界。 */
import { lazy, Suspense, type ReactNode } from 'react';
import { excelFormat, type ExcelFormat } from './format';
import { ExcelPreviewError } from './error';
import { EXCEL_LIMITS, type ExcelLimits } from './model';

const ExcelSurface = lazy(async () => ({ default: (await import('./ExcelSurface')).ExcelSurface }));

/** @param props - 完整文件字节与文件名(后缀决定解析器);limits 缺省用共享上限。 */
export function ExcelPreview({ data, filename, limits = EXCEL_LIMITS }: { data: Uint8Array<ArrayBuffer>; filename: string; limits?: ExcelLimits }): ReactNode {
  let format: ExcelFormat;
  try {
    format = excelFormat(filename);
  } catch (error) {
    const code = error instanceof ExcelPreviewError ? error.code : 'invalid';
    return (
      <div style={{ padding: 24, fontSize: 13, color: '#5a6b7a' }} role="alert">
        {code === 'tooLarge' ? '文件超过预览上限' : '无法解析的表格文件'}
      </div>
    );
  }
  return (
    <div style={{ position: 'relative', height: '100%' }}>
      <Suspense fallback={<div style={{ padding: 24, fontSize: 13, color: '#5a6b7a' }} role="status">正在加载表格渲染器…</div>}>
        <ExcelSurface data={data} format={format} limits={limits} />
      </Suspense>
    </div>
  );
}
