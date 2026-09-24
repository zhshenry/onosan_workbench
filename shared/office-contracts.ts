// 文档转 PDF 契约(主进程 ↔ 渲染层共享)。Word/PPT 由主进程经 LibreOffice kit 转 PDF;
// 错误码与 kit 的 ConversionErrorCode 对齐(DSH office-to-pdf 同款分类)。

export type OfficeConvertErrorCode =
  | 'unsupported-format'
  | 'input-too-large'
  | 'output-too-large'
  | 'invalid-document'
  | 'invalid-output'
  | 'timeout'
  | 'unavailable'
  | 'failed';

export interface OfficeConvertOk {
  ok: true;
  pdf: Uint8Array<ArrayBuffer>;
  /** 声明了但本机缺失的 OOXML 字体族(二进制 doc/ppt 返回空)。 */
  missingFonts: string[];
}

export interface OfficeConvertFail {
  ok: false;
  code: OfficeConvertErrorCode;
}

export type OfficeConvertResult = OfficeConvertOk | OfficeConvertFail;

/** 文档中心走"转 PDF 预览"的四种后缀(xls/xlsx 走前端 Excel 解析,不转 PDF)。 */
export const OFFICE_DOCUMENT_EXTENSIONS = ['doc', 'docx', 'ppt', 'pptx'] as const;

export function isOfficeDocumentName(name: string): boolean {
  const suffix = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
  return (OFFICE_DOCUMENT_EXTENSIONS as readonly string[]).includes(suffix);
}
