/** Office 文档预览:主进程转 PDF 后复用 PdfView。改编自 DSH office/OfficeBody 的编排职责。 */
import { lazy, Suspense, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { isOfficeDocumentName, type OfficeConvertErrorCode } from '../../../../shared/office-contracts';

const PdfView = lazy(async () => ({ default: (await import('../pdf/PdfView')).PdfView }));

type State =
  | { kind: 'loading' }
  | { kind: 'error'; code: OfficeConvertErrorCode }
  | { kind: 'done'; pdf: Uint8Array<ArrayBuffer>; missingFonts: string[] };

const LABELS: Record<OfficeConvertErrorCode, string> = {
  'unsupported-format': '不支持的文档格式(仅支持 doc/docx/ppt/pptx)',
  'input-too-large': '文件超过转换上限(50 MiB)',
  'output-too-large': '转换后的 PDF 超过上限',
  'invalid-document': '无法解析的文档内容',
  'invalid-output': '转换产物异常',
  timeout: '转换超时(60 秒)',
  unavailable: '转换服务不可用',
  failed: '转换失败',
};

const status: CSSProperties = {
  display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center',
  padding: 24, fontSize: 13, color: '#d8d8d8', position: 'absolute', inset: 0,
};
const notice: CSSProperties = {
  margin: '8px 10px 0', padding: '6px 10px', border: '1px solid #e8d9a0',
  background: '#fdf6e3', borderRadius: 8, fontSize: 12, color: '#7a5c00',
};

/** @param props - 完整文件字节与文件名(后缀决定是否可转)。 */
export function OfficePreview({ data, filename }: { data: Uint8Array<ArrayBuffer>; filename: string }): ReactNode {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    if (!isOfficeDocumentName(filename)) {
      setState({ kind: 'error', code: 'unsupported-format' });
      return;
    }
    const controller = new AbortController();
    setState({ kind: 'loading' });
    void window.workbench.office.convert(filename, data).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) setState({ kind: 'done', pdf: result.pdf, missingFonts: result.missingFonts });
      else setState({ kind: 'error', code: result.code });
    });
    return () => {
      controller.abort();
    };
  }, [data, filename]);

  if (state.kind === 'loading') {
    return (
      <div style={status} role="status">
        正在转换为 PDF…(最长约 1 分钟)
      </div>
    );
  }
  if (state.kind === 'error') {
    return (
      <div style={status} role="alert">
        {LABELS[state.code]}
      </div>
    );
  }
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      {state.missingFonts.length > 0 && (
        <div style={notice} role="note">
          缺少字体:{state.missingFonts.join('、')}(显示可能近似)
        </div>
      )}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Suspense fallback={<div style={status} role="status">正在加载 PDF 渲染器…</div>}>
          <PdfView bytes={state.pdf} />
        </Suspense>
      </div>
    </div>
  );
}
