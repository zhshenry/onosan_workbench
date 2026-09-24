/**
 * 主进程 LibreOffice 转换服务:私有磁盘输入/输出 + 有界转换。
 * 核心机制移植自 DSH packages/document/office-to-pdf 的 convertBytes/readPdf;
 * 去掉个人应用不需要的授权层/共享队列/内容寻址缓存(Converter 本身自带操作串行化)。
 */
import { constants } from 'node:fs';
import { lstat, mkdtemp, open, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConverter, type Converter, type ConverterOptions } from '@deepseek-ai/libreoffice-kit';

export type OfficeExtension = 'doc' | 'docx' | 'ppt' | 'pptx';

/** 转换上限(与 DSH 配置默认一致)。 */
export const OFFICE_CONVERT_OPTIONS: ConverterOptions = {
  timeoutMs: 60_000,
  maxInputBytes: 50 * 1024 * 1024,
  maxOutputBytes: 100 * 1024 * 1024,
  maxImageResolution: 192,
  maxArchiveEntries: 10_000,
  maxUncompressedBytes: 250 * 1024 * 1024,
};

/** 拒绝缺失、链接形、超限、截断与非 PDF 输出;返回与暂存文件无关的完整字节。 */
async function readPdf(path: string, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  signal.throwIfAborted();
  const entry = await lstat(path);
  if (!entry.isFile()) throw new Error('invalid-output');
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await file.stat();
    if (info.size > limit) throw new Error('output-too-large');
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      signal.throwIfAborted();
      const read = await file.read(bytes, length, bytes.length - length, null);
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    signal.throwIfAborted();
    if (length > limit) throw new Error('output-too-large');
    const pdf = bytes.subarray(0, length);
    if (
      length !== info.size ||
      !pdf.subarray(0, 8).toString('ascii').match(/^%PDF-\d\.\d/u) ||
      !pdf.subarray(-1024).toString('ascii').trimEnd().endsWith('%%EOF')
    ) {
      throw new Error('invalid-output');
    }
    return pdf;
  } finally {
    await file.close();
  }
}

export class OfficeConverter {
  private converter: Promise<Converter> | undefined;

  /** @param options - 渲染与上限配置;进程生命周期内不变。 */
  constructor(private readonly options: ConverterOptions = OFFICE_CONVERT_OPTIONS) {}

  /**
   * 转换 Office 字节为 PDF;源文件不改动,临时目录用后即删。
   * @returns 调用方持有的 PDF 字节与缺失字体族。
   */
  async convert(
    bytes: Uint8Array<ArrayBuffer>,
    extension: OfficeExtension,
    signal: AbortSignal = new AbortController().signal,
  ): Promise<{ pdf: Uint8Array<ArrayBuffer>; missingFonts: string[] }> {
    if (bytes.byteLength > (this.options.maxInputBytes ?? 64 * 1024 * 1024)) {
      const error = new Error('input-too-large') as Error & { code: string };
      error.code = 'input-too-large';
      throw error;
    }
    // Converter 内部串行化文档操作,无需自建队列
    this.converter ??= createConverter(this.options);
    const converter = await this.converter;
    signal.throwIfAborted();
    const directory = await mkdtemp(join(tmpdir(), 'workbench-office-'));
    try {
      const inputPath = join(directory, `source.${extension}`);
      const outputPath = join(directory, 'converted.pdf');
      await writeFile(inputPath, bytes, { flag: 'wx', mode: 0o600, signal });
      signal.throwIfAborted();
      const result = await converter.render({ inputPath, outputPath }, signal);
      signal.throwIfAborted();
      const pdf = await readPdf(outputPath, this.options.maxOutputBytes ?? 128 * 1024 * 1024, signal);
      return { pdf: new Uint8Array(pdf), missingFonts: result.missingFonts };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  /** 归类转换失败;引擎细节保留在 cause 里。 */
  static codeOf(error: unknown): string {
    if (typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string') {
      const known = ['input-too-large', 'output-too-large', 'invalid-document', 'unsupported-format', 'invalid-output', 'timeout', 'unavailable'];
      if (known.includes(error.code)) return error.code;
    }
    return 'failed';
  }

  async dispose(): Promise<void> {
    const converter = this.converter;
    this.converter = undefined;
    if (converter !== undefined) {
      try {
        await (await converter).dispose();
      } catch (error) {
        console.error('LibreOffice converter disposal failed', error);
      }
    }
  }
}
