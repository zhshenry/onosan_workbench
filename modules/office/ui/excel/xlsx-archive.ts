/** XLSX 预览的内存副本剔除 DrawingML 部件;工作表 XML 与源字节保持不变。移植自 DSH excel/xlsx-archive.ts。 */
import { strFromU8, unzipSync, zipSync, type Unzipped } from 'fflate';
import { XMLParser } from 'fast-xml-parser';
import type { ExcelUnsupportedFeature } from './model';

/** 持有解包后的预览副本与检测到的不支持内容。 */
export class XlsxPreviewArchive {
  /** 检测到的工作簿中预览不显示的内容。 */
  readonly unsupportedFeatures = new Set<ExcelUnsupportedFeature>();
  private readonly files: Unzipped;

  /** @param bytes - 完整 XLSX 源字节;不修改借用的源缓冲。 */
  constructor(private readonly bytes: Uint8Array<ArrayBuffer>) {
    this.files = unzipSync(bytes);
  }

  /**
   * 在 ExcelJS 解析前剔除 DrawingML 部件;调用方还需忽略工作表的 drawing 引用。
   * @returns 无部件可剔除时返回源字节,否则返回未压缩的临时 ZIP。
   */
  withoutDrawings(): Uint8Array<ArrayBuffer> {
    const entries = Object.entries(this.files);
    const retained = entries.filter(([path, bytes]) => {
      if (/^xl\/worksheets\/[^/]+\.xml$/.test(path)) {
        this.inspectContent(bytes);
        return true;
      }
      if (/^xl\/drawings\/[^/]+\.xml$/.test(path)) {
        this.inspectContent(bytes);
      } else if (!/^xl\/drawings\/_rels\/[^/]+\.xml\.rels$/.test(path)) {
        return true;
      }
      return false;
    });
    return retained.length === entries.length ? this.bytes : new Uint8Array(zipSync(Object.fromEntries(retained), { level: 0 }));
  }

  private inspectContent(bytes: Uint8Array): void {
    new XMLParser({
      removeNSPrefix: true,
      processEntities: false,
      parseTagValue: false,
      stopNodes: ['*.sheetData'],
      updateTag: (tag: string) => {
        if (tag === 'chart') this.unsupportedFeatures.add('charts');
        if (tag === 'pic' || tag === 'picture') this.unsupportedFeatures.add('images');
        if (tag === 'sp' || tag === 'grpSp' || tag === 'cxnSp') this.unsupportedFeatures.add('shapes');
        if (tag === 'conditionalFormatting') this.unsupportedFeatures.add('conditionalFormatting');
        if (tag === 'sheetData') return false;
        return tag;
      },
    }).parse(strFromU8(bytes));
  }
}
