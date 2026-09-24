/**
 * PDF 渲染视图:每个文档一个真实 module Worker(不回退主线程解析),连续纵向页面,
 * IntersectionObserver 懒渲染 + 官方 TextLayer 文本选择,适应宽度/固定缩放。
 * 机制对应 DSH documentpreview 的 pdf/runtime.ts + pdf.tsx,资源改走 wb-pdf:// 协议。
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { getDocument, PDFWorker, TextLayer, type PDFDocumentProxy } from 'pdfjs-dist';
import PdfWorkerImpl from 'pdfjs-dist/build/pdf.worker.min.mjs?worker';

type ZoomChoice = 'fit' | 0.5 | 0.75 | 1 | 1.5 | 2;

const scroll: CSSProperties = { position: 'absolute', inset: 0, overflow: 'auto', background: '#525659', padding: '12px 0' };
const toolbar: CSSProperties = {
  display: 'flex', gap: 8, alignItems: 'center', padding: '6px 10px',
  background: '#3c4043', color: '#e8eaed', fontSize: 12,
};
const select: CSSProperties = { background: '#525659', color: '#e8eaed', border: '1px solid #5f6368', borderRadius: 6, padding: '3px 6px', fontSize: 12 };

// 官方 textLayer 样式要点(选中/透明文字/光标),类名前缀 wb-pdf- 避免与宿主冲突
const TEXT_LAYER_CSS = `
.wb-pdf-textLayer{position:absolute;text-align:initial;inset:0;overflow:clip;opacity:1;line-height:1;text-size-adjust:none;forced-color-adjust:none;transform-origin:0 0;caret-color:CanvasText;z-index:2}
.wb-pdf-textLayer :is(span,br){color:transparent;position:absolute;white-space:pre;cursor:text;transform-origin:0 0}
.wb-pdf-textLayer span.markedContent{top:0;height:0}
.wb-pdf-textLayer .highlight{margin:-1px;padding:1px;background-color:rgb(0 100 0/.2);border-radius:4px}
.wb-pdf-textLayer .endOfContent{display:block;position:absolute;inset:100% 0 0;border-top:1px solid transparent;user-select:none;cursor:default;z-index:0}
`;

interface PageDims {
  width: number;
  height: number;
}

export function PdfView({ bytes }: { bytes: Uint8Array<ArrayBuffer> }): ReactNode {
  const [doc, setDoc] = useState<PDFDocumentProxy | undefined>(undefined);
  const [error, setError] = useState<string | undefined>(undefined);
  const [zoom, setZoom] = useState<ZoomChoice>('fit');
  const [fitScale, setFitScale] = useState(1);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    let bridge: PDFWorker | undefined;
    let raw: Worker | undefined;
    let loading: { destroy(): Promise<void> } | undefined;
    void (async () => {
      try {
        raw = new PdfWorkerImpl({ name: 'workbench-pdf' });
        bridge = PDFWorker.create({ port: raw });
        const task = getDocument({
          data: bytes.slice(),
          worker: bridge,
          cMapPacked: true,
          cMapUrl: 'wb-pdf://cmaps/',
          standardFontDataUrl: 'wb-pdf://standard_fonts/',
          wasmUrl: 'wb-pdf://wasm/',
          useWorkerFetch: true,
          enableXfa: false,
          stopAtErrors: true,
        });
        loading = task;
        const document = await task.promise;
        if (cancelled) {
          void loading.destroy();
          return;
        }
        setDoc(document);
      } catch (cause) {
        if (!cancelled) setError(String(cause instanceof Error ? cause.message : cause));
      }
    })();
    return () => {
      cancelled = true;
      void loading?.destroy();
      bridge?.destroy();
      raw?.terminate();
    };
  }, [bytes]);

  // 适应宽度:随容器宽度换算缩放
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || !doc) return;
    const update = (): void => {
      void doc
        .getPage(1)
        .then((page) => {
          const base = page.getViewport({ scale: 1 });
          setFitScale(Math.max(0.1, (container.clientWidth - 24) / base.width));
        })
        .catch(() => {});
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(container);
    return () => observer.disconnect();
  }, [doc]);

  const scale = zoom === 'fit' ? fitScale : zoom;

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column' }}>
      <style>{TEXT_LAYER_CSS}</style>
      <div style={toolbar}>
        <select
          style={select}
          value={String(zoom)}
          onChange={(e) => setZoom(e.target.value === 'fit' ? 'fit' : (Number(e.target.value) as ZoomChoice))}
        >
          <option value="fit">适应宽度</option>
          <option value="0.5">50%</option>
          <option value="0.75">75%</option>
          <option value="1">100%</option>
          <option value="1.5">150%</option>
          <option value="2">200%</option>
        </select>
        <span>{doc ? `${doc.numPages} 页` : ''}</span>
        {error && <span style={{ color: '#f28b82' }}>PDF 打开失败:{error}</span>}
      </div>
      <div style={scroll} ref={scrollRef}>
        {doc &&
          Array.from({ length: doc.numPages }, (_v, index) => (
            <PdfPage key={index + 1} doc={doc} pageNumber={index + 1} scale={scale} />
          ))}
      </div>
    </div>
  );
}

/** 单页:懒渲染(接近视口才画)+ 文本层;缩放变化时取消旧渲染重画。 */
function PdfPage({ doc, pageNumber, scale }: { doc: PDFDocumentProxy; pageNumber: number; scale: number }): ReactNode {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [base, setBase] = useState<PageDims | undefined>(undefined);

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: '600px 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    void doc
      .getPage(pageNumber)
      .then((page) => {
        const viewport = page.getViewport({ scale: 1 });
        setBase({ width: viewport.width, height: viewport.height });
      })
      .catch(() => {});
  }, [doc, pageNumber]);

  useEffect(() => {
    if (!visible || !base) return;
    let cancelled = false;
    let renderTask: { cancel(): void } | undefined;
    let layerTask: { cancel(): void } | undefined;
    void (async () => {
      const canvas = canvasRef.current;
      const textHost = textRef.current;
      if (!canvas || !textHost) return;
      const page = await doc.getPage(pageNumber);
      if (cancelled) return;
      const viewport = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(viewport.width * dpr);
      canvas.height = Math.floor(viewport.height * dpr);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;
      textHost.replaceChildren();
      textHost.style.width = `${Math.floor(viewport.width)}px`;
      textHost.style.height = `${Math.floor(viewport.height)}px`;
      textHost.style.setProperty('--scale-factor', String(scale));
      const task = page.render({
        canvas: null,
        canvasContext: canvas.getContext('2d') as CanvasRenderingContext2D,
        viewport,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      });
      renderTask = task;
      try {
        await task.promise;
      } catch {
        return; // 取消或渲染失败,静默
      }
      if (cancelled) return;
      const layer = new TextLayer({ textContentSource: page.streamTextContent(), container: textHost, viewport });
      layerTask = layer;
      await layer.render().catch(() => {});
    })();
    return () => {
      cancelled = true;
      renderTask?.cancel();
      layerTask?.cancel();
    };
  }, [visible, base, doc, pageNumber, scale]);

  const width = base ? Math.floor(base.width * scale) : 180;
  const height = base ? Math.floor(base.height * scale) : 240;
  return (
    <div
      ref={hostRef}
      style={{ position: 'relative', margin: '0 auto 12px', width, minHeight: height, boxShadow: '0 1px 6px rgba(0,0,0,.25)', background: '#fff' }}
    >
      <canvas ref={canvasRef} style={{ display: 'block', width, height: base ? height : undefined }} />
      <div ref={textRef} className="wb-pdf-textLayer" />
    </div>
  );
}
