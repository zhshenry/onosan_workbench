import type { BrowserElement, BrowserQuery, BrowserSelector } from '../../shared/browser-automation-contracts';
import { browserTextMatcher } from './text-match';

export interface AXNode {
  ignored?: boolean; backendDOMNodeId?: number; role?: { value?: string }; name?: { value?: string }; value?: { value?: string };
  properties?: { name: string; value: { value?: unknown } }[];
}
interface DOMNode { nodeId: number; backendNodeId: number; nodeType: number; nodeName: string; nodeValue?: string; attributes?: string[]; children?: DOMNode[]; shadowRoots?: DOMNode[]; }
interface IndexedNode { dom: DOMNode; ax?: AXNode; parent?: IndexedNode; children: IndexedNode[]; attrs: Map<string, string>; text: string; rawText: string; }
export interface QueryNode { node: AXNode; signature?: string; tag?: string; context?: string; attributes?: Record<string, string>; cells?: BrowserElement['cells']; cellsTruncated?: boolean; }
type Send = (method: string, params?: Record<string, unknown>) => Promise<any>;
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const interactive = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'treeitem']);

/** Queries use Chromium's CSS engine and AX names; model input never becomes executable JavaScript. */
export async function queryDocument(send: Send, contextId: number, nodes: AXNode[], query: BrowserQuery, signal?: AbortSignal): Promise<{ nodes: QueryNode[]; text: string; incomplete?: boolean }> {
  const container = query.within?.[0];
  const scoped = container?.by === 'css';
  let { root } = await send('DOM.getDocument', { depth: scoped ? 1 : -1, pierce: true });
  const currentDocument = async (): Promise<number> => {
    const document = await send('Runtime.evaluate', { expression: 'document', contextId });
    try { return (await send('DOM.requestNode', { objectId: document.result.objectId })).nodeId; }
    finally { await send('Runtime.releaseObject', { objectId: document.result.objectId }); }
  };
  let documentId = await currentDocument();
  if (scoped) {
    const { nodeIds } = await send('DOM.querySelectorAll', { nodeId: documentId, selector: container.value });
    if (nodeIds.length) {
      const roots: DOMNode[] = [];
      for (const nodeId of nodeIds) roots.push((await send('DOM.describeNode', { nodeId, depth: -1, pierce: true })).node);
      const unbound: DOMNode[] = [];
      const bind = (node: DOMNode): void => { if (!node.nodeId && node.nodeType === 1) unbound.push(node); for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? [])]) bind(child); };
      roots.forEach(bind);
      if (unbound.length) {
        const bound = await send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: unbound.map(node => node.backendNodeId) });
        unbound.forEach((node, index) => { node.nodeId = bound.nodeIds[index]; });
      }
      const contains = (node: DOMNode, id: number): boolean => [...(node.children ?? []), ...(node.shadowRoots ?? [])].some(child => child.nodeId === id || contains(child, id));
      const outer = roots.filter(node => !roots.some(other => other !== node && contains(other, node.nodeId)));
      root = { nodeId: documentId, backendNodeId: 0, nodeType: 9, nodeName: '#document', children: outer };
      nodes = [];
      for (const node of outer) nodes.push(...(await send('Accessibility.queryAXTree', { backendNodeId: node.backendNodeId })).nodes);
    } else {
      root = (await send('DOM.getDocument', { depth: -1, pierce: true })).root;
      documentId = await currentDocument();
      nodes = (await send('Accessibility.getFullAXTree')).nodes;
    }
  }
  const findDocument = (node: DOMNode): DOMNode | undefined => node.nodeId === documentId ? node : [...(node.children ?? []), ...(node.shadowRoots ?? []), ...((node as any).contentDocument ? [(node as any).contentDocument] : [])].map(findDocument).find(Boolean);
  const scopedRoot = findDocument(root);
  if (!scopedRoot) throw new Error('无法读取此框架的 DOM，请重新观察。');
  const ax = new Map(nodes.filter(node => !node.ignored && node.backendDOMNodeId).map(node => [node.backendDOMNodeId!, node]));
  const indexed: IndexedNode[] = [], cssRoots: DOMNode[] = [], ids = new Map<string, IndexedNode>();
  const index = (dom: DOMNode, parent?: IndexedNode): IndexedNode => {
    const attrs = new Map<string, string>(); for (let i = 0; i < (dom.attributes?.length ?? 0); i += 2) attrs.set(dom.attributes![i], dom.attributes![i + 1]);
    const item: IndexedNode = { dom, ax: ax.get(dom.backendNodeId), parent, children: [], attrs, text: '', rawText: '' };
    indexed.push(item); if (attrs.has('id')) ids.set(attrs.get('id')!, item);
    if (dom.nodeType === 9 || dom.nodeType === 11) cssRoots.push(dom);
    item.children = [...(dom.children ?? []), ...(dom.shadowRoots ?? [])].map(child => index(child, item));
    const separator = dom.nodeName === 'TR' || item.ax?.role?.value === 'row' || attrs.get('role') === 'row' ? '\t' : '';
    item.text = dom.nodeType === 3 ? item.ax?.name?.value ?? dom.nodeValue ?? '' : item.children.filter(child => !['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(child.dom.nodeName)).map(child => child.text).join(separator).slice(0, 2000000);
    item.rawText = (dom.nodeType === 3 ? dom.nodeValue ?? '' : item.children.filter(child => child.dom.nodeType !== 11).map(child => child.rawText).join('')).slice(0, 1000);
    return item;
  };
  const tree = index(scopedRoot), css = new Map<string, Set<number>>();
  const selectors = [query.selector, ...(query.within ?? []), ...(query.and ?? []), ...(query.or ?? []), query.has, query.hasNot].filter(Boolean) as BrowserSelector[];
  for (const selector of selectors.filter(selector => selector.by === 'css')) if (!css.has(selector.value as string)) {
    const matches = new Set<number>();
    for (const dom of cssRoots) for (const nodeId of (await send('DOM.querySelectorAll', { nodeId: dom.nodeId, selector: selector.value })).nodeIds) matches.add(nodeId);
    css.set(selector.value as string, matches);
  }
  let visible: Set<number> | undefined;
  if (query.visible !== undefined) {
    const snapshot = await send('DOMSnapshot.captureSnapshot', { computedStyles: ['display', 'visibility'], includeDOMRects: true });
    visible = new Set<number>();
    for (const document of snapshot.documents) document.layout.nodeIndex.forEach((nodeIndex: number, index: number) => {
      const style = document.layout.styles[index], rect = document.layout.bounds[index];
      if (rect[2] > 0 && rect[3] > 0 && snapshot.strings[style[0]] !== 'none' && !['hidden', 'collapse'].includes(snapshot.strings[style[1]])) visible!.add(document.nodes.backendNodeId[nodeIndex]);
    });
  }
  const explicitLabels = new Map<string, string[]>();
  for (const item of indexed) if (item.dom.nodeName === 'LABEL' && item.attrs.get('for')) { const id = item.attrs.get('for')!; explicitLabels.set(id, [...(explicitLabels.get(id) ?? []), item.text]); }
  const label = (item: IndexedNode): string => {
    if (item.attrs.has('aria-label')) return item.attrs.get('aria-label')!;
    if (item.attrs.has('aria-labelledby')) return item.ax?.name?.value ?? item.attrs.get('aria-labelledby')!.split(/\s+/).map(id => ids.get(id)?.text ?? '').join(' ');
    const labels = [...(explicitLabels.get(item.attrs.get('id') ?? '') ?? [])];
    for (let parent = item.parent; parent; parent = parent.parent) if (parent.dom.nodeName === 'LABEL') { labels.push(parent.text); break; }
    return labels.join(' ') || item.ax?.name?.value || '';
  };
  const patterns = [...selectors.flatMap(selector => [selector.value, ...(selector.name === undefined ? [] : [selector.name])]), ...(query.hasText === undefined ? [] : [query.hasText]), ...(query.hasNotText === undefined ? [] : [query.hasNotText])];
  const values = patterns.some(pattern => typeof pattern !== 'string') ? indexed.flatMap(item => [item.text, item.ax?.name?.value ?? '', label(item), item.attrs.get('placeholder') ?? '', item.attrs.get('data-testid') ?? '']) : [];
  const matchesText = await browserTextMatcher(patterns, values, signal);
  const match = (item: IndexedNode, selector: BrowserSelector): boolean => {
    if (selector.by === 'css') return css.get(selector.value as string)!.has(item.dom.nodeId);
    if (selector.by === 'role') return item.ax?.role?.value === selector.value && (selector.name === undefined || matchesText(item.ax.name?.value ?? '', selector.name, selector.exact, selector.ignoreCase));
    if (selector.by === 'label') return (['BUTTON', 'INPUT', 'METER', 'OUTPUT', 'PROGRESS', 'SELECT', 'TEXTAREA'].includes(item.dom.nodeName) || item.attrs.has('aria-label') || item.attrs.has('aria-labelledby')) && matchesText(label(item), selector.value, selector.exact, selector.ignoreCase) && !!label(item);
    if (selector.by === 'placeholder' || selector.by === 'testId') return matchesText(item.attrs.get(selector.by === 'testId' ? 'data-testid' : 'placeholder') ?? '', selector.value, selector.exact, selector.ignoreCase);
    return !['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'HEAD'].includes(item.dom.nodeName) && matchesText(item.text, selector.value, selector.exact, selector.ignoreCase) && !item.children.some(child => [1, 11].includes(child.dom.nodeType) && matchesText(child.text, selector.value, selector.exact, selector.ignoreCase));
  };
  const descendants = (item: IndexedNode, selector: BrowserSelector): boolean => item.children.some(child => child.dom.nodeType === 1 && match(child, selector) || descendants(child, selector));
  const within = (item: IndexedNode, chain = query.within ?? []): boolean => {
    let parent = item.parent;
    for (const selector of [...chain].reverse()) { while (parent && !match(parent, selector)) parent = parent.parent; if (!parent) return false; parent = parent.parent; }
    return true;
  };
  let selected = indexed.filter(item => item.dom.nodeType === 1 && within(item) &&
    ((query.selector ? match(item, query.selector) : interactive.has(item.ax?.role?.value ?? '')) || (query.or ?? []).some(selector => match(item, selector))) &&
    (query.and ?? []).every(selector => match(item, selector)) &&
    (!query.has || descendants(item, query.has)) && (!query.hasNot || !descendants(item, query.hasNot)) &&
    (query.hasText === undefined || matchesText(item.text, query.hasText, false)) &&
    (query.hasNotText === undefined || !matchesText(item.text, query.hasNotText, false)) &&
    (query.visible === undefined || visible!.has(item.dom.backendNodeId) === query.visible));
  const textRoots = query.nth !== undefined ? query.nth < 0 ? [] : selected.slice(query.nth, query.nth + 1) : query.selector ? selected : query.within?.length ? indexed.filter(item => match(item, query.within!.at(-1)!) && within(item, query.within!.slice(0, -1))) : [tree];
  const text: string[] = [];
  const read = async (item: IndexedNode) => {
    const resolved = await send('DOM.resolveNode', { backendNodeId: item.dom.backendNodeId, executionContextId: contextId });
    try {
      const result = await send('Runtime.callFunctionOn', { objectId: resolved.object.objectId, functionDeclaration: `function() { const output=[]; let length=0; const read=node=>{ if(['SCRIPT','STYLE','NOSCRIPT'].includes(node.nodeName)||length>=2000000)return; if(node.nodeType===3){const text=(node.nodeValue??'').slice(0,2000000-length);output.push(text);length+=text.length;} else for(const child of node.childNodes)read(child); };read(this);return output.join('\\n'); }`, returnByValue: true });
      if (result.exceptionDetails) throw new Error('局部正文读取失败，请重新观察。');
      text.push(String(result.result.value ?? ''));
    } finally { await send('Runtime.releaseObject', { objectId: resolved.object.objectId }); }
  };
  // A selected ancestor already includes its descendants; do not duplicate their text.
  const roots = new Set(textRoots); for (const item of textRoots) {
    let parent = item.parent; while (parent && !roots.has(parent)) parent = parent.parent;
    if (!parent) {
      await read(item);
      for (const shadow of indexed.filter(node => node.dom.nodeType === 11)) { let owner = shadow.parent; while (owner && owner !== item) owner = owner.parent; if (owner) await read(shadow); }
    }
  }
  const rowCells = (item: IndexedNode): Pick<QueryNode, 'cells' | 'cellsTruncated'> => {
    if (item.dom.nodeName !== 'TR' && item.ax?.role?.value !== 'row' && item.attrs.get('role') !== 'row') return {};
    const cells: NonNullable<BrowserElement['cells']> = [];
    let count = 0;
    const visit = (parent: IndexedNode) => { for (const child of parent.children) {
      const role = child.ax?.role?.value ?? child.attrs.get('role') ?? '';
      if (['TD', 'TH'].includes(child.dom.nodeName) || ['cell', 'gridcell', 'columnheader', 'rowheader'].includes(role)) {
        count++;
        if (cells.length < 50) { const text = normalize(child.text); cells.push({ text: text.slice(0, 1000), role: role || (child.dom.nodeName === 'TH' ? 'columnheader' : 'cell'), truncated: text.length > 1000 }); }
      } else if (child.dom.nodeName !== 'TR' && role !== 'row') visit(child);
    } };
    visit(item); return { cells, cellsTruncated: count > cells.length };
  };
  return { nodes: selected.map(item => ({ node: item.ax ?? { backendDOMNodeId: item.dom.backendNodeId, role: { value: item.attrs.get('role') ?? item.dom.nodeName.toLowerCase() }, name: { value: normalize(item.text).slice(0, 300) } }, tag: item.dom.nodeName.toLowerCase(), context: item.parent ? `${item.parent.dom.nodeName.toLowerCase()}${item.parent.attrs.get('id') ? '#' + item.parent.attrs.get('id') : ''} ${normalize(item.parent.attrs.get('aria-label') ?? item.parent.ax?.name?.value ?? '').slice(0, 120)}` : undefined, attributes: Object.fromEntries([...item.attrs].filter(([name]) => ['id', 'class', 'role', 'data-testid', 'placeholder', 'for', 'type', 'aria-label', 'aria-labelledby', 'rowspan', 'colspan', 'aria-rowindex', 'aria-colindex'].includes(name)).map(([name, value]) => [name, value.slice(0, 300)])), ...rowCells(item), ...(!item.ax ? { signature: JSON.stringify([item.dom.nodeName, item.dom.attributes ?? [], normalize(item.rawText).slice(0, 300)]) } : {}) })), text: text.join('\n'), incomplete: text.some(part => part.length >= 2000000) || (selectors.some(selector => ['text', 'label'].includes(selector.by)) || query.hasText !== undefined || query.hasNotText !== undefined) && indexed.some(item => item.text.length >= 2000000) };
}
