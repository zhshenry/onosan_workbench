/** 表格解析失败的稳定分类(渲染层据此显示对应文案)。移植自 DSH excel/error.ts。 */
export class ExcelPreviewError extends Error {
  /** @param code - 用户可理解的解析失败类别。 */
  constructor(
    readonly code: 'invalid' | 'tooLarge' | 'timeout' | 'encoding',
    options?: ErrorOptions,
  ) {
    super(code, options);
    this.name = 'ExcelPreviewError';
  }
}
