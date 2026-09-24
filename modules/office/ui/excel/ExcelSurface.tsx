/** 只读电子表格渲染面(FortuneSheet)。改编自 DSH excel/excel.tsx:
 * DSH 的 primitives(Button/Tooltip/StateDot)换成普通元素,文案内置中文,其余行为逐行保留。 */
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { Workbook } from '@fortune-sheet/react';
import fortuneCss from '@fortune-sheet/react/dist/index.css?inline';
import type { ExcelFormat } from './format';
import type { ExcelLimits, ExcelPreview } from './model';
import { parseExcel } from './parse';

type State = { data: Uint8Array<ArrayBuffer>; format: ExcelFormat } & ({ value: ExcelPreview } | { error: string });
const scopedStyles = `@scope ([data-excel-preview]) { ${fortuneCss} }`;

const LABELS: Record<string, string> = {
  invalid: '无法解析的表格文件',
  tooLarge: '文件超过预览上限',
  timeout: '解析超时',
  encoding: '无法识别的文本编码',
};
const FEATURES: Record<string, string> = { charts: '图表', images: '图片', shapes: '形状', conditionalFormatting: '条件格式' };

const notice: CSSProperties = {
  display: 'flex', gap: 6, alignItems: 'center', margin: '8px 10px 0', padding: '6px 10px',
  border: '1px solid #e8d9a0', background: '#fdf6e3', borderRadius: 8, fontSize: 12, color: '#7a5c00',
};
const status: CSSProperties = { display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center', padding: 24, fontSize: 13, color: '#5a6b7a' };
const workbook: CSSProperties = { position: 'absolute', inset: 0 };

/** @param props - 完整工作簿字节、后缀名与解析上限。 */
export function ExcelSurface({ data, format, limits }: { data: Uint8Array<ArrayBuffer>; format: ExcelFormat; limits: ExcelLimits }): ReactNode {
  const [state, setState] = useState<State>();
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setState(undefined);
    void parseExcel(data, format, limits, controller.signal).then(
      (value) => {
        if (!controller.signal.aborted) setState({ data, format, value });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setState({ data, format, error: error instanceof Error ? error.message : 'invalid' });
      },
    );
    return () => {
      controller.abort();
    };
  }, [data, format, limits, attempt]);

  if (state === undefined || state.data !== data || state.format !== format) {
    return (
      <div style={status} role="status">
        正在解析 {format.toUpperCase()}…
      </div>
    );
  }
  if ('error' in state) {
    return (
      <div style={status} role="alert">
        <span>{LABELS[state.error] ?? LABELS.invalid}</span>
        <button style={{ cursor: 'pointer' }} onClick={() => setAttempt((v) => v + 1)}>
          重试
        </button>
      </div>
    );
  }
  const hasFormulas = state.value.sheets.some((sheet) => sheet.celldata?.some((cell) => cell.v?.f !== undefined));
  return (
    <section style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }} data-excel-preview aria-label="电子表格预览">
      <style>{scopedStyles}</style>
      {state.value.unsupportedFeatures.length > 0 && (
        <div style={notice} role="note">
          <span>
            检测到未显示的内容:{state.value.unsupportedFeatures.map((f) => FEATURES[f] ?? f).join('、')}
            (建议用系统应用打开)
          </span>
        </div>
      )}
      {hasFormulas && (
        <div style={{ ...notice, marginTop: 8 }} role="note">
          <span>仅显示文件里已保存的计算结果,公式不会重新计算。</span>
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div style={workbook}>
          <Workbook
            key={`${attempt}`}
            data={state.value.sheets}
            lang="zh"
            allowEdit={false}
            showToolbar={false}
            showFormulaBar
            showSheetTabs
            forceCalculation={false}
            cellContextMenu={['copy']}
            headerContextMenu={[]}
            sheetTabContextMenu={[]}
            filterContextMenu={[]}
          />
        </div>
      </div>
    </section>
  );
}
