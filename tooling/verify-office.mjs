// Office 转换端到端验证:exceljs 造一个 xlsx → LibreOffice kit 转 PDF → 校验产物头尾。
// 独立于 vitest(引擎 332MB,不适合进常规测试),发布链/大改动后手动跑:node tooling/verify-office.mjs
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createConverter } from '@deepseek-ai/libreoffice-kit';

const directory = await mkdtemp(join(tmpdir(), 'workbench-verify-office-'));
try {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('验证');
  sheet.getCell('A1').value = '你好,工作台';
  sheet.getCell('B1').value = 123.45;
  sheet.getCell('A2').value = new Date();
  const inputPath = join(directory, 'source.xlsx');
  await writeFile(inputPath, await workbook.xlsx.writeBuffer());

  const converter = await createConverter({ timeoutMs: 60_000 });
  try {
    const result = await converter.render({ inputPath, outputPath: join(directory, 'converted.pdf') });
    const pdf = await readFile(join(directory, 'converted.pdf'));
    const head = pdf.subarray(0, 8).toString('ascii');
    const tail = pdf.subarray(-1024).toString('ascii').trimEnd();
    if (!/^%PDF-\d\.\d/.test(head) || !tail.endsWith('%%EOF')) {
      throw new Error(`产物不是完整 PDF: head=${head} size=${pdf.byteLength}`);
    }
    console.log(`VERIFY_OFFICE_OK backend=${result.backend} missingFonts=${JSON.stringify(result.missingFonts)} bytes=${pdf.byteLength}`);
  } finally {
    await converter.dispose();
  }
} finally {
  await rm(directory, { recursive: true, force: true });
}
