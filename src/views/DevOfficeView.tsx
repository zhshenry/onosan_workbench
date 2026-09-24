/**
 * 开发调试页(不进导航,经 #dev/office 进入):
 * office 模块的最小验收入口——表格走前端解析,Word/PPT 走主进程转 PDF。
 */
import { useState, type CSSProperties } from 'react';
import { ExcelPreview } from '../../modules/office/ui/excel/ExcelPreview';
import { OfficePreview } from '../../modules/office/ui/office/OfficePreview';

const page: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100vh',
  fontFamily: 'system-ui, sans-serif',
  background: '#eef3f8',
};
const bar: CSSProperties = {
  display: 'flex',
  gap: 10,
  alignItems: 'center',
  padding: '10px 12px',
  borderBottom: '1px solid #d7e2ec',
  background: '#fff',
  fontSize: 13,
};
const btn: CSSProperties = {
  cursor: 'pointer',
  border: '1px solid #c9d6e2',
  background: '#f7fafc',
  borderRadius: 8,
  padding: '6px 12px',
};

type Mode = 'excel' | 'office';

export function DevOfficeView() {
  const [mode, setMode] = useState<Mode>('excel');
  const [file, setFile] = useState<{ name: string; bytes: Uint8Array<ArrayBuffer> } | undefined>(undefined);
  const accept = mode === 'excel' ? '.xlsx,.xls,.csv,.tsv' : '.doc,.docx,.ppt,.pptx';

  const pick = (reset: boolean): void => {
    setFile(undefined);
    void reset;
  };

  return (
    <div style={page}>
      <div style={bar}>
        <button style={btn} onClick={() => { setMode('excel'); pick(true); }}>表格解析</button>
        <button style={btn} onClick={() => { setMode('office'); pick(true); }}>Office 转 PDF</button>
        <label style={btn}>
          {mode === 'excel' ? '选择表格文件(.xlsx / .xls / .csv / .tsv)' : '选择文档(.doc / .docx / .ppt / .pptx)'}
          <input
            type="file"
            accept={accept}
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              void f.arrayBuffer().then((buffer) => setFile({ name: f.name, bytes: new Uint8Array(buffer) }));
            }}
          />
        </label>
        <span style={{ color: '#5a6b7a' }}>{file ? file.name : '未选择文件'}</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {file && mode === 'excel' && <ExcelPreview data={file.bytes} filename={file.name} />}
        {file && mode === 'office' && <OfficePreview data={file.bytes} filename={file.name} />}
      </div>
    </div>
  );
}
