import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
const { renderAiMarkdown } = await import('../src/ai-markdown');
const parse = (text: string) => {
  const body = dom.window.document.createElement('div');
  body.innerHTML = renderAiMarkdown(text);
  return body;
};

test('AI Markdown 渲染标题、强调、列表、引用、表格与代码，保留不完整流式代码', () => {
  const body = parse('## 小结\n\n**重点**和*说明*\n\n- 第一项\n- 第二项\n\n> 引用\n\n| 项目 | 结果 |\n| --- | --- |\n| A | 完成 |\n\n```js\nconst html = "<button>";\n');
  assert.equal(body.querySelector('h2')?.textContent, '小结');
  assert.equal(body.querySelector('strong')?.textContent, '重点');
  assert.equal(body.querySelector('em')?.textContent, '说明');
  assert.equal(body.querySelectorAll('li').length, 2);
  assert.equal(body.querySelectorAll('table td').length, 2);
  assert.match(body.querySelector('blockquote')?.textContent ?? '', /引用/);
  assert.match(body.querySelector('pre code')?.textContent ?? '', /<button>/);
  assert.equal(body.querySelector('button'), null);
});

test('AI Markdown 清理脚本、事件、嵌入内容、危险链接和可伪装界面的属性', () => {
  const body = parse('<script>alert(1)</script><style>body{display:none}</style><img src="https://example.com/tracker" onerror="alert(1)"><iframe src="https://example.com"></iframe><svg onload="alert(1)"></svg><form><input autofocus></form>\n\n<a href="javascript:alert(1)" onclick="alert(1)" style="position:fixed" class="ai-send" id="fake">危险</a> <a href="file:///C:/private">文件</a> <a href="data:text/html,hello">数据</a> [正常链接](https://example.com/docs)');
  assert.equal(body.querySelector('script, style, img, iframe, svg, form, input'), null);
  assert.equal(body.querySelector('[onclick], [onerror], [style], [class], [id]'), null);
  assert.deepEqual([...body.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), ['https://example.com/docs']);
});
