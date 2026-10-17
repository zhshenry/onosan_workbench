import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('');
Object.defineProperty(globalThis, 'window', { value: dom.window, configurable: true });
const { renderAiMarkdown } = await import('../src/ai-markdown');
const { renderMarkdown } = await import('../src/markdown');
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

test('project Markdown keeps document links and anchors while preserving the AI link policy and sanitization', () => {
  const text = '[运行说明](docs/运行%20说明.md#启动) [返回](../README.md) [本页](#开始游戏) [网页](https://example.com/docs) <a href="javascript:alert.md" onclick="alert(1)">危险</a><a href="file:///secret.md">文件</a><img src="https://example.com/track"><h2 id="unsafe">章节</h2><script>window.bad=1</script>';
  const body = dom.window.document.createElement('div'); body.innerHTML = renderMarkdown(text, true);
  assert.deepEqual([...body.querySelectorAll('a[href]')].map(a => decodeURI(a.getAttribute('href')!)), ['docs/运行 说明.md#启动', '../README.md', '#开始游戏', 'https://example.com/docs']);
  assert.equal(body.querySelector('script, img, [onclick], [id]'), null);
  assert.deepEqual([...parse(text).querySelectorAll('a[href]')].map(a => a.getAttribute('href')), ['https://example.com/docs']);
});
