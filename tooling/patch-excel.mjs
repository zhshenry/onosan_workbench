// FortuneSheet 1.0.4 只读预览补丁(npm 无 patchedDependencies,用精确替换实现,等价于 DSH 的
// @fortune-sheet__core@1.0.4.patch 与 @fortune-sheet__react@1.0.4.patch):
//   core: 复制为 HTML 表格时用 lodash escape 转义单元格内容(防 XSS)
//   react: 只读时公式栏 literal 显示公式且不注入 HTML;切表保留 A1 选区
// 版本锁定 1.0.4;换版本必须先在 DSH 上游核对补丁是否仍适用。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const checks = [];

function patch(relPath, version, replacements) {
  const pkgDir = join(root, 'node_modules', relPath);
  const pkgJson = join(pkgDir, 'package.json');
  if (!existsSync(pkgJson)) {
    console.warn(`patch-excel: 跳过 ${relPath}(未安装)`);
    return;
  }
  if (JSON.parse(readFileSync(pkgJson, 'utf8')).version !== version) {
    throw new Error(`patch-excel: ${relPath} 版本不是 ${version},补丁不适用,请人工核对`);
  }
  for (const file of replacements) {
    const target = join(pkgDir, file.path);
    let source = readFileSync(target, 'utf8');
    for (const { find, replace, all = false } of file.edits) {
      const count = source.split(find).length - 1;
      if (count === 0) {
        if (source.includes(replace)) continue; // 已打过补丁
        throw new Error(`patch-excel: 在 ${relPath}/${file.path} 未找到替换目标:\n${find.slice(0, 120)}`);
      }
      if (!all && count > 1) throw new Error(`patch-excel: ${relPath}/${file.path} 目标出现 ${count} 次,需更精确的锚点`);
      source = source.split(find).join(replace);
    }
    writeFileSync(target, source);
  }
  checks.push(relPath);
}

patch('@fortune-sheet/core', '1.0.4', [
  {
    path: 'dist/index.esm.js',
    edits: [{ find: 'column += escapeHTMLTag(c_value);', replace: 'column += _.escape(c_value);' }],
  },
  {
    path: 'dist/index.js',
    edits: [{ find: 'column += escapeHTMLTag(c_value);', replace: "column += ___default['default'].escape(c_value);" }],
  },
]);

patch('@fortune-sheet/react', '1.0.4', [
  {
    path: 'dist/index.esm.js',
    edits: [
      {
        find: 'if (!context.allowEdit) {\n      setContext(function (ctx) {\n        var flowdata = getFlowdata(ctx);',
        replace: 'if (!context.allowEdit && context.forceFormulaRef) {\n      setContext(function (ctx) {\n        var flowdata = getFlowdata(ctx);',
      },
      {
        find: 'value = getCellValue(r, c, d, "f");',
        replace: 'value = context.allowEdit === false ? cell.f : getCellValue(r, c, d, "f");',
      },
      {
        find: 'refs.fxInput.current.innerHTML = escapeHTMLTag(escapeScriptTag(value));',
        replace:
          'if (context.allowEdit === false) {\n        refs.fxInput.current.textContent = value;\n      } else {\n        refs.fxInput.current.innerHTML = escapeHTMLTag(escapeScriptTag(value));\n      }',
      },
      {
        find: 'draftCtx.luckysheet_select_status = false;\n        draftCtx.luckysheet_select_save = undefined;',
        replace:
          'draftCtx.luckysheet_select_status = false;\n        var currentSheet = draftCtx.luckysheetfile.find(function (s) { return s.id === draftCtx.currentSheetId; });\n        draftCtx.luckysheet_select_save = currentSheet && currentSheet.luckysheet_select_save;',
        all: true,
      },
    ],
  },
  {
    path: 'dist/index.js',
    edits: [
      {
        find: 'if (!context.allowEdit) {\n      setContext(function (ctx) {\n        var flowdata = core.getFlowdata(ctx);',
        replace: 'if (!context.allowEdit && context.forceFormulaRef) {\n      setContext(function (ctx) {\n        var flowdata = core.getFlowdata(ctx);',
      },
      {
        find: 'value = core.getCellValue(r, c, d, "f");',
        replace: 'value = context.allowEdit === false ? cell.f : core.getCellValue(r, c, d, "f");',
      },
      {
        find: 'refs.fxInput.current.innerHTML = core.escapeHTMLTag(core.escapeScriptTag(value));',
        replace:
          'if (context.allowEdit === false) {\n        refs.fxInput.current.textContent = value;\n      } else {\n        refs.fxInput.current.innerHTML = core.escapeHTMLTag(core.escapeScriptTag(value));\n      }',
      },
      {
        find: 'draftCtx.luckysheet_select_status = false;\n        draftCtx.luckysheet_select_save = undefined;',
        replace:
          'draftCtx.luckysheet_select_status = false;\n        var currentSheet = draftCtx.luckysheetfile.find(function (s) { return s.id === draftCtx.currentSheetId; });\n        draftCtx.luckysheet_select_save = currentSheet && currentSheet.luckysheet_select_save;',
        all: true,
      },
    ],
  },
]);

console.log(`patch-excel: 已应用补丁到 ${checks.join(', ')}`);
