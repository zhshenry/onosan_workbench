import { randomUUID } from 'node:crypto';
import type { BrowserAction, BrowserCondition, BrowserElement, BrowserObservation, BrowserQuery, BrowserTabInfo } from '../../shared/browser-automation-contracts';
import { browserQuerySchema, browserRecordUrl } from '../../shared/browser-automation-contracts';
import { queryDocument, type AXNode, type QueryNode } from './query';

export interface BrowserPort {
  preserveFocus?(): Promise<() => Promise<void>>;
  input?(method: string, params: Record<string, unknown>, sessionId?: string): Promise<unknown>;
  info(): BrowserTabInfo;
  send(method: string, params?: Record<string, unknown>, sessionId?: string): Promise<any>;
  navigate(url: string): Promise<void>;
}
interface Target { backendNodeId: number; frameId: string; sessionId?: string; url: string; signature?: string; }
function axState(node: AXNode) {
  const property = (name: string) => node.properties?.find(property => property.name === name)?.value.value;
  const boolean = (name: string) => property(name) === undefined ? undefined : property(name) === true || property(name) === 'true';
  return { disabled: boolean('disabled') ?? false, checked: property('checked') === 'mixed' ? 'mixed' as const : boolean('checked'), selected: boolean('selected'), expanded: boolean('expanded') };
}
const interactive = new Set(['button', 'link', 'textbox', 'searchbox', 'combobox', 'listbox', 'option', 'checkbox', 'radio', 'switch', 'slider', 'spinbutton', 'tab', 'menuitem', 'treeitem']);
function jpegSize(data: string): { width: number; height: number } {
  const bytes = Buffer.from(data, 'base64');
  for (let offset = 2; offset + 9 < bytes.length;) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if ([0xc0, 0xc1, 0xc2].includes(marker)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
    const length = bytes.readUInt16BE(offset + 2);
    if (length < 2) break;
    offset += length + 2;
  }
  throw new BrowserControlError('screenshot-error', '浏览器返回的截图无法解析，请重新截图。');
}
const stampCode = `(() => {
  if (!globalThis.__onoObservation) {
    const state = { token: Math.random().toString(36), revision: 0 };
    new MutationObserver(() => state.revision++).observe(document, { subtree: true, childList: true, attributes: true, characterData: true });
    globalThis.__onoObservation = state;
  }
  return { ...globalThis.__onoObservation, width: innerWidth, height: innerHeight, dpr: devicePixelRatio, x: scrollX, y: scrollY };
})()`;

export class BrowserControlError extends Error {
  constructor(readonly code: string, message: string, readonly details?: unknown) { super(message); }
}
export class BrowserDriver {
  private refs = new Map<string, Target>();
  private generation = 0;
  private observation?: BrowserObservation;
  private shotStamp = '';
  private contexts = new Map<string, number>();
  private sessions = new Map<string, string>();
  private frameSessions = new Map<string, string | undefined>();
  private sessionParents = new Map<string, string | undefined>();
  private beforeInput?: () => Promise<void>;
  private protectedFocus = false;
  private readPermission?: (url: string, frameId: string) => boolean | Promise<boolean>;
  constructor(private readonly port: BrowserPort) {}
  setReadPermission(permission?: (url: string, frameId: string) => boolean | Promise<boolean>): void { this.readPermission = permission; }

  event(method: string, params: any, sessionId?: string): void {
    if (method === 'Target.attachedToTarget' && params.targetInfo?.type === 'iframe') { this.sessions.set(params.targetInfo.targetId, params.sessionId); this.sessionParents.set(params.sessionId, sessionId || undefined); }
    if (method === 'Target.detachedFromTarget') {
      for (const [frame, session] of this.sessions) if (session === params.sessionId) this.sessions.delete(frame);
      this.sessionParents.delete(params.sessionId);
    }
    if (method === 'Runtime.executionContextsCleared' || method === 'Page.frameNavigated' || method === 'Page.navigatedWithinDocument' || method === 'DOM.documentUpdated') {
      this.invalidate(); this.contexts.clear();
    }
  }
  invalidate(): void { this.generation++; this.refs.clear(); this.frameSessions.clear(); this.observation = undefined; this.shotStamp = ''; }
  private async send(method: string, params: Record<string, unknown> = {}, sessionId?: string, signal?: AbortSignal): Promise<any> {
    signal?.throwIfAborted();
    if (method.startsWith('Input.') && !['mouseReleased', 'keyUp'].includes(String(params.type))) await this.beforeInput?.();
    return this.bounded(method.startsWith('Input.') && this.port.input ? this.port.input(method, params, sessionId) : this.port.send(method, params, sessionId), signal);
  }
  private async bounded<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new BrowserControlError('timeout', '浏览器响应超时，请重新观察页面；已发送的操作可能已经生效，不要盲目重试。')), 12000);
          abort = () => reject(new BrowserControlError('cancelled', '浏览器操作已停止；已完成的网页操作不会撤销。'));
          signal?.addEventListener('abort', abort, { once: true });
        }),
      ]);
    } finally { clearTimeout(timer); if (abort) signal?.removeEventListener('abort', abort); }
  }
  private async world(frameId: string, sessionId?: string): Promise<number> {
    const key = `${sessionId ?? ''}:${frameId}`;
    let context = this.contexts.get(key);
    if (!context) {
      const result = await this.send('Page.createIsolatedWorld', { frameId, worldName: 'ono-browser-observation' }, sessionId);
      context = result.executionContextId as number;
      this.contexts.set(key, context);
    }
    return context;
  }
  private async stamp(frameId: string, sessionId?: string): Promise<any> {
    const contextId = await this.world(frameId, sessionId);
    const result = await this.send('Runtime.evaluate', { expression: stampCode, contextId, returnByValue: true }, sessionId);
    if (result.exceptionDetails || !result.result?.value) throw new BrowserControlError('page-unavailable', '页面还未就绪，请等待后重新观察。');
    return result.result.value;
  }
  private async frameStamps(frames: BrowserObservation['frames']): Promise<string> {
    const result = [];
    for (const frame of frames) if (frame.available) result.push([frame.id, await this.stamp(frame.id, this.frameSessions.get(frame.id))]);
    return JSON.stringify(result);
  }
  async observe(screenshot = false, fullPage = false, signal?: AbortSignal, rawQuery?: BrowserQuery): Promise<BrowserObservation> {
    const query = rawQuery ? browserQuerySchema.parse(rawQuery) : undefined;
    // A settling viewport may require another read. Never replay a dispatched input.
    for (let attempt = 0; ; attempt++) {
      try { return await this.readObservation(screenshot, fullPage, signal, query); }
      catch (error) {
        if (attempt >= 2 || signal?.aborted || !(error instanceof BrowserControlError) || !['page-changing', 'stale-observation'].includes(error.code)) throw error;
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
  }
  private async readObservation(screenshot: boolean, fullPage: boolean, signal?: AbortSignal, query?: BrowserQuery): Promise<BrowserObservation> {
    signal?.throwIfAborted();
    const generation = this.generation;
    const { frameTree } = await this.send('Page.getFrameTree', {}, undefined, signal);
    const frames: { id: string; url: string; available: boolean }[] = [];
    const elements: BrowserElement[] = [], text: string[] = [];
    let truncated = false, protectedFocus = false, queryIncomplete = false;
    const candidates: { node: AXNode; target: Target; metadata: Pick<QueryNode, 'tag' | 'context' | 'attributes' | 'cells' | 'cellsTruncated'> }[] = [];
    const refs = new Map<string, Target>();
    const observationId = randomUUID();
    const visit = async (tree: any, parentSession?: string): Promise<void> => {
      const frame = tree.frame;
      if (frames.some(value => value.id === frame.id)) return;
      if (this.readPermission && !await this.readPermission(frame.url, frame.id)) { frames.push({ id: frame.id, url: frame.url, available: false }); for (const child of tree.childFrames ?? []) await visit(child, parentSession); return; }
      const sessionId = this.sessions.get(frame.id) ?? parentSession;
      this.frameSessions.set(frame.id, sessionId);
      let available = true;
      try {
        await this.world(frame.id, sessionId);
        const nodes: AXNode[] = query?.within?.[0]?.by === 'css' ? [] : (await this.send('Accessibility.getFullAXTree', { frameId: frame.id }, sessionId, signal)).nodes;
        for (const node of nodes) if (node.properties?.some(property => property.name === 'focused' && property.value.value === true) && node.backendDOMNodeId) protectedFocus ||= await this.protectedNode(node, sessionId, signal);
        if (!query?.frameId || query.frameId === frame.id) {
          const domQuery = query && (query.selector || query.within?.length || query.and?.length || query.or?.length || query.has || query.hasNot || query.hasText !== undefined || query.hasNotText !== undefined || query.visible !== undefined || query.nth !== undefined);
          const result: { nodes: QueryNode[]; text: string; incomplete?: boolean } = domQuery ? await queryDocument((method, params) => this.send(method, method === 'Accessibility.getFullAXTree' ? { ...params, frameId: frame.id } : params, sessionId, signal), await this.world(frame.id, sessionId), nodes, { ...query!, nth: query?.nth === undefined ? undefined : query.nth - candidates.length }, signal) : {
            nodes: nodes.filter(node => !node.ignored && interactive.has(node.role?.value ?? '') && node.backendDOMNodeId).map(node => ({ node, signature: undefined })),
            text: nodes.filter(node => !node.ignored && node.role?.value === 'StaticText').map(node => node.name?.value ?? '').join('\n'),
          };
          queryIncomplete ||= result.incomplete === true;
          if (result.text) text.push(result.text);
          for (const item of result.nodes) candidates.push({ node: item.node, target: { backendNodeId: item.node.backendDOMNodeId!, frameId: frame.id, sessionId, url: frame.url, signature: item.signature }, metadata: { tag: item.tag, context: item.context, attributes: item.attributes, cells: item.cells, cellsTruncated: item.cellsTruncated } });
        }
      } catch (error) { if (signal?.aborted || query && (!query.frameId || query.frameId === frame.id)) throw error; available = false; }
      frames.push({ id: frame.id, url: frame.url, available });
      for (const child of tree.childFrames ?? []) await visit(child, sessionId);
    };
    await visit(frameTree);
    for (const sessionId of this.sessions.values()) {
      try { const remote = await this.send('Page.getFrameTree', {}, sessionId, signal); await visit(remote.frameTree, sessionId); }
      catch (error) { if (signal?.aborted) throw error; }
    }
    if (!frames[0]?.available) throw new BrowserControlError('page-unavailable', '无法读取页面，请等待加载完成或关闭此页面的开发者工具后重试。');
    if (query?.frameId && !frames.some(frame => frame.id === query.frameId && frame.available)) throw new BrowserControlError('frame-unavailable', '查询框架已失效，请重新观察框架列表。');
    if (query?.nth !== undefined) { const chosen = candidates[query.nth]; candidates.splice(0, candidates.length, ...(chosen ? [chosen] : [])); }
    const offset = query?.offset ?? 0, limit = query?.limit ?? 250, textOffset = query?.textOffset ?? 0, textLimit = query?.textLimit ?? 14000;
    for (const { node, target, metadata } of candidates.slice(offset, offset + limit)) {
      const ref = `${observationId.slice(0, 8)}:e${elements.length + 1}`; refs.set(ref, target);
      const value = await this.protectedNode(node, target.sessionId, signal) ? undefined : String(node.value?.value ?? '');
      elements.push({ ref, role: node.role?.value ?? '', name: String(node.name?.value ?? '').slice(0, 300), value: value?.slice(0, 1000), ...(value && value.length > 1000 ? { valueTruncated: true } : {}), frameId: target.frameId, ...axState(node), ...metadata });
    }
    const fullText = text.join('\n'), nextOffset = offset + limit < candidates.length ? offset + limit : undefined, nextTextOffset = textOffset + textLimit < fullText.length ? textOffset + textLimit : undefined;
    truncated = queryIncomplete || offset > 0 || textOffset > 0 || nextOffset !== undefined || nextTextOffset !== undefined;
    const result: BrowserObservation = { id: observationId, tab: this.port.info(), text: fullText.slice(textOffset, textOffset + textLimit), elements, frames, truncated, ...(queryIncomplete ? { queryIncomplete: true } : {}), page: { totalElements: candidates.length, offset, nextOffset, totalTextLength: fullText.length, textOffset, nextTextOffset } };
    let shotStamp = '';
    if (screenshot) {
      const before = await this.stamp(frameTree.frame.id);
      const framesBefore = await this.frameStamps(frames);
      const metrics = await this.send('Page.getLayoutMetrics', {}, undefined, signal);
      const cssWidth = fullPage ? Math.min(16000, metrics.cssContentSize?.width ?? before.width) : before.width;
      const cssHeight = fullPage ? Math.min(16000, metrics.cssContentSize?.height ?? before.height) : before.height;
      const scale = Math.min(1, 1280 / (cssWidth * before.dpr), 4096 / (cssHeight * before.dpr));
      const { data } = await this.send('Page.captureScreenshot', { format: 'jpeg', quality: 70, captureBeyondViewport: fullPage, clip: { x: fullPage ? 0 : before.x, y: fullPage ? 0 : before.y, width: cssWidth, height: cssHeight, scale } }, undefined, signal);
      const after = await this.stamp(frameTree.frame.id);
      const framesAfter = await this.frameStamps(frames);
      if (JSON.stringify(before) !== JSON.stringify(after) || framesBefore !== framesAfter) throw new BrowserControlError('page-changing', '截图时页面发生变化，请重新观察后操作。');
      shotStamp = framesAfter;
      result.screenshot = { id: randomUUID(), data, mimeType: 'image/jpeg', ...jpegSize(data), cssWidth, cssHeight, deviceScaleFactor: before.dpr, scrollX: before.x, scrollY: before.y, fullPage };
    }
    if (generation !== this.generation) throw new BrowserControlError('stale-observation', '观察期间页面发生跳转，请重新观察。');
    this.refs = refs; this.observation = result; this.shotStamp = shotStamp; this.protectedFocus = protectedFocus;
    return result;
  }
  private async protectedNode(node: AXNode, sessionId?: string, signal?: AbortSignal): Promise<boolean> {
    let protectedNode = node.properties?.some(property => property.name === 'protected' && property.value.value === true) ?? false;
    if (['textbox', 'searchbox', 'spinbutton', 'combobox'].includes(node.role?.value ?? '') && node.backendDOMNodeId) {
      const { node: dom } = await this.send('DOM.describeNode', { backendNodeId: node.backendDOMNodeId }, sessionId, signal);
      const attributes = new Map<string, string>(); for (let i = 0; i < (dom.attributes?.length ?? 0); i += 2) attributes.set(dom.attributes[i], dom.attributes[i + 1]);
      protectedNode ||= attributes.get('type')?.toLowerCase() === 'password' || /(?:current|new)-password/.test(attributes.get('autocomplete') ?? '');
    }
    return protectedNode;
  }
  private target(ref: string): Target {
    const target = this.refs.get(ref);
    if (!target) throw new BrowserControlError('stale-element', '元素引用已失效，请重新观察后选择元素。');
    return target;
  }
  private async pointInSession(point: { x: number; y: number }, sessionId?: string): Promise<{ x: number; y: number }> {
    if (!sessionId) return point;
    const frameId = [...this.sessions].find(([, session]) => session === sessionId)?.[0];
    if (!frameId) throw new BrowserControlError('frame-unavailable', '嵌入页面控制连接已经变化，请重新观察。');
    const parentSession = this.sessionParents.get(sessionId);
    const owner = await this.send('DOM.getFrameOwner', { frameId }, parentSession);
    const { model } = await this.send('DOM.getBoxModel', { backendNodeId: owner.backendNodeId }, parentSession);
    const quad = model?.content;
    if (!quad) throw new BrowserControlError('frame-unavailable', '嵌入页面不在当前视口，请滚动后重新观察。');
    const parentPoint = await this.pointInSession(point, parentSession);
    const viewport = await this.stamp(frameId, sessionId);
    const ux = (quad[2] - quad[0]) / viewport.width, uy = (quad[3] - quad[1]) / viewport.width;
    const vx = (quad[6] - quad[0]) / viewport.height, vy = (quad[7] - quad[1]) / viewport.height;
    const determinant = ux * vy - uy * vx;
    if (!determinant) throw new BrowserControlError('frame-unavailable', '嵌入页面当前不可见。');
    const dx = parentPoint.x - quad[0], dy = parentPoint.y - quad[1];
    return { x: (dx * vy - dy * vx) / determinant, y: (dy * ux - dx * uy) / determinant };
  }
  private async withNode<T>(target: Target, fn: (objectId: string) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const { object } = await this.send('DOM.resolveNode', { backendNodeId: target.backendNodeId, executionContextId: await this.world(target.frameId, target.sessionId) }, target.sessionId, signal);
    if (!object?.objectId) throw new BrowserControlError('stale-element', '元素已经消失，请重新观察。');
    try { return await fn(object.objectId); }
    finally { void this.send('Runtime.releaseObject', { objectId: object.objectId }, target.sessionId).catch(() => {}); }
  }
  private async nodeCall(target: Target, objectId: string, functionDeclaration: string, args: unknown[] = [], signal?: AbortSignal): Promise<any> {
    const result = await this.send('Runtime.callFunctionOn', { objectId, functionDeclaration, arguments: args.map(value => ({ value })), returnByValue: true }, target.sessionId, signal);
    if (result.exceptionDetails) throw new BrowserControlError('element-unavailable', '目标元素不可操作，请重新观察或手动接管。');
    return result.result?.value;
  }
  private async actLocator(action: Extract<BrowserAction, { type: 'locator' }>, guard: (url?: string) => Promise<void>, signal?: AbortSignal): Promise<BrowserObservation> {
    const deadline = Date.now() + action.timeoutMs;
    do {
      signal?.throwIfAborted(); await guard();
      const observation = await this.observe(false, false, signal, { ...action.query, visible: true, offset: 0, limit: 2 });
      if (observation.elements.length > 1) throw new BrowserControlError('ambiguous-locator', '定位条件匹配多个元素，请增加容器、文字或 nth 条件后重试。', { count: observation.page?.totalElements, candidates: observation.elements.map(({ role, name, frameId, context }) => ({ role, name, frameId, context })) });
      let dispatched = false;
      if (observation.elements.length === 1) {
        try { return await this.act({ ...action.action, ref: observation.elements[0].ref }, guard, signal, () => { dispatched = true; }); }
        catch (error) {
          if (dispatched || !(error instanceof BrowserControlError) || !['element-blocked', 'stale-element'].includes(error.code)) throw error;
        }
      }
      if (Date.now() >= deadline) break;
      await new Promise(resolve => setTimeout(resolve, Math.min(250, deadline - Date.now())));
    } while (Date.now() <= deadline);
    throw new BrowserControlError('locator-timeout', '等待可操作元素超时，请检查定位条件或重新观察；没有自动重放已发出的输入。');
  }
  async act(action: BrowserAction, guard: (url?: string) => Promise<void>, signal?: AbortSignal, onInput?: () => void): Promise<BrowserObservation> {
    if (action.type === 'locator') return this.actLocator(action, guard, signal);
    const restoreFocus = await this.port.preserveFocus?.();
    const generation = this.generation;
    const checked = async (url?: string) => { await guard(url); signal?.throwIfAborted(); if (generation !== this.generation) throw new BrowserControlError('stale-element', '授权等待期间页面已变化，请重新观察后操作。'); };
    this.beforeInput = async () => { await checked(); onInput?.(); };
    try {
    if ('ref' in action && action.ref) {
      const target = this.target(action.ref);
      await checked(target.url);
      await this.withNode(target, async objectId => {
        const state = await this.nodeCall(target, objectId, String.raw`function() {
          if (!this.isConnected) return { ok: false };
          this.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
          const rect = this.getBoundingClientRect(), style = getComputedStyle(this);
          const hit = this.getRootNode().elementFromPoint?.(rect.x + rect.width/2, rect.y + rect.height/2) ?? this.ownerDocument.elementFromPoint(rect.x + rect.width/2, rect.y + rect.height/2);
          const moving = this.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getKeyframes().some(frame => Object.keys(frame).some(key => /^(transform|translate|rotate|scale|top|left|right|bottom|width|height|margin|padding)/.test(key))));
          return { moving, ok: rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && !!hit && (hit === this || this.contains(hit)), disabled: !!this.disabled, readOnly: !!this.readOnly, tag: this.tagName, type: this.type, secret: /(?:current|new)-password/.test(this.autocomplete ?? ''), editable: this.isContentEditable, signature: JSON.stringify([this.nodeName, [...this.attributes].flatMap(attribute => [attribute.name,attribute.value]), (this.textContent ?? '').replace(/\s+/g,' ').trim().slice(0,300)]) };
        }`, [], signal);
        if (state?.moving) throw new BrowserControlError('element-blocked', '元素的位置动画尚未结束，请等待稳定后操作。');
        if (!state?.ok || state.disabled) throw new BrowserControlError('element-blocked', '元素隐藏、禁用或被其他内容遮挡，请重新观察。');
        if (state.type === 'file' || state.type === 'password' || state.secret) throw new BrowserControlError('manual-required', '密码与文件选择请手动完成，完成后点击继续。');
        const expected = this.observation?.elements.find(element => element.ref === action.ref);
        const { nodes } = await this.send('Accessibility.getPartialAXTree', { backendNodeId: target.backendNodeId, fetchRelatives: false }, target.sessionId, signal) as { nodes: AXNode[] };
        const current = nodes.find(node => node.backendDOMNodeId === target.backendNodeId && !node.ignored);
        const currentState = current && axState(current);
        if (currentState?.disabled) throw new BrowserControlError('element-blocked', '元素已禁用，请重新观察。');
        if (target.signature ? target.signature !== state.signature : !expected || !current || current.role?.value !== expected.role || String(current.name?.value ?? '').slice(0, 300) !== expected.name ||
          expected.value !== undefined && expected.value !== String(current.value?.value ?? '').slice(0, 1000) ||
          (['checked', 'selected', 'expanded'] as const).some(key => expected[key] !== currentState?.[key])) {
          throw new BrowserControlError('stale-element', '目标元素的名称、值或状态已经变化，请重新观察后操作。');
        }
        await checked(target.url);
        if (action.type === 'fill' || action.type === 'pressSequentially') {
          if (state.readOnly || (!['INPUT', 'TEXTAREA'].includes(state.tag) && !state.editable)) throw new BrowserControlError('not-editable', '该元素不能输入文字。');
          await this.send('DOM.focus', { backendNodeId: target.backendNodeId }, target.sessionId, signal);
          if (action.type === 'fill') {
            await this.nodeCall(target, objectId, `function() { if (this.isContentEditable) { const range = this.ownerDocument.createRange(); range.selectNodeContents(this); const selection = this.ownerDocument.getSelection(); selection.removeAllRanges(); selection.addRange(range); } else this.select(); }`, [], signal);
            await this.send('Input.insertText', { text: action.text }, target.sessionId, signal);
          } else {
            for (const character of action.text) {
              if (/^[a-zA-Z0-9 ]$/.test(character)) {
                const params = { key: character, text: character, windowsVirtualKeyCode: character.toUpperCase().charCodeAt(0) };
                try { await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }, target.sessionId, signal); }
                finally { await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, target.sessionId); }
              } else await this.send('Input.insertText', { text: character }, target.sessionId, signal);
              if (action.delayMs) await new Promise(resolve => setTimeout(resolve, action.delayMs));
            }
          }
        } else if (action.type === 'press') {
          await this.send('DOM.focus', { backendNodeId: target.backendNodeId }, target.sessionId, signal);
          await this.press(action.key, signal, target.sessionId);
        } else if (action.type === 'select') {
          if (state.tag !== 'SELECT') throw new BrowserControlError('not-select', '该元素不是原生下拉框，请使用点击或键盘操作。');
          const ok = await this.nodeCall(target, objectId, `function(values, by) { const options = [...this.options], chosen = []; if (!this.multiple && values.length !== 1) return false; for (const value of values) { const matches = options.filter(option => (by === 'label' ? option.label.trim() : option.value) === value && !option.disabled && !option.closest('optgroup[disabled]')); if (matches.length !== 1) return false; chosen.push(matches[0]); } for (const option of options) option.selected = chosen.includes(option); this.dispatchEvent(new Event('input', { bubbles: true })); this.dispatchEvent(new Event('change', { bubbles: true })); return true; }`, [action.values, action.by ?? 'value'], signal);
          if (!ok) throw new BrowserControlError('invalid-option', '下拉选项不存在、不唯一或已禁用，请重新观察。');
        } else {
          const { quads } = await this.send('DOM.getContentQuads', { backendNodeId: target.backendNodeId }, target.sessionId, signal);
          const quad = quads?.[0];
          if (!quad) throw new BrowserControlError('element-blocked', '无法定位元素，请重新观察。');
          await new Promise(resolve => setTimeout(resolve, 100));
          const next = (await this.send('DOM.getContentQuads', { backendNodeId: target.backendNodeId }, target.sessionId, signal)).quads?.[0];
          if (!next || quad.some((value: number, index: number) => Math.abs(value - next[index]) > 0.5)) throw new BrowserControlError('element-blocked', '元素仍在移动，请等待位置稳定后操作。');
          const x = (quad[0] + quad[2] + quad[4] + quad[6]) / 4, y = (quad[1] + quad[3] + quad[5] + quad[7]) / 4;
          if (action.type === 'setChecked') {
            if (!['checkbox', 'radio', 'switch'].includes(current?.role?.value ?? '') || state.type === 'radio' && !action.checked) throw new BrowserControlError('not-checkable', '请选择复选框、开关或要选中的单选项。');
            if (currentState?.checked !== action.checked) await this.click(x, y, 'left', 1, signal, target.sessionId);
            const deadline = Date.now() + 1500;
            for (;;) {
              await checked(target.url);
              const checkedTree = await this.send('Accessibility.getPartialAXTree', { backendNodeId: target.backendNodeId, fetchRelatives: false }, target.sessionId, signal);
              const checkedNode = checkedTree.nodes.find((node: AXNode) => node.backendDOMNodeId === target.backendNodeId);
              if (checkedNode && axState(checkedNode).checked === action.checked) break;
              if (Date.now() >= deadline) throw new BrowserControlError('check-failed', '控件未达到指定勾选状态，请重新观察。');
              await new Promise(resolve => setTimeout(resolve, 50));
            }
          }
          else if (action.type === 'hover') await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, target.sessionId, signal);
          else if (action.type === 'click') await this.click(x, y, action.button, action.count, signal, target.sessionId);
        }
      }, signal);
    } else if ('screenshotId' in action) {
      const observation = this.observation, shot = observation?.screenshot;
      if (!shot || shot.id !== action.screenshotId || shot.fullPage) throw new BrowserControlError('stale-screenshot', '请先获取当前视口截图，再使用该截图的 CSS 坐标操作。');
      if (await this.frameStamps(observation.frames) !== this.shotStamp) throw new BrowserControlError('stale-screenshot', '页面布局或滚动位置已经变化，请重新截图。');
      const points = action.type === 'drag' ? [action.from, action.to] : [action.point];
      const routed: { point: { x: number; y: number }; sessionId?: string }[] = [];
      for (const point of points) {
        if (point.x >= shot.cssWidth || point.y >= shot.cssHeight) throw new BrowserControlError('outside-viewport', '坐标超出截图对应的 CSS 视口。');
        const hit = await this.send('DOM.getNodeForLocation', { x: Math.round(point.x), y: Math.round(point.y), includeUserAgentShadowDOM: true }, undefined, signal);
        let frameId = hit.frameId;
        if (!this.sessions.has(frameId)) {
          const { node } = await this.send('DOM.describeNode', { backendNodeId: hit.backendNodeId }, undefined, signal);
          frameId = node.frameId ?? frameId;
        }
        const frame = observation.frames.find(frame => frame.id === frameId);
        if (!frame?.available) throw new BrowserControlError('frame-unavailable', '此坐标对应的嵌入页面尚未就绪，请重新观察或手动接管。');
        await checked(frame.url);
        const sessionId = this.frameSessions.get(frameId);
        routed.push({ point: await this.pointInSession(point, sessionId), sessionId });
      }
      if (await this.frameStamps(observation.frames) !== this.shotStamp) throw new BrowserControlError('stale-screenshot', '授权等待期间页面发生变化，请重新截图。');
      const sessionId = routed[0].sessionId;
      if (action.type === 'coordinate') await this.click(routed[0].point.x, routed[0].point.y, action.button, action.count, signal, sessionId);
      else if (action.type === 'scroll') await this.send('Input.dispatchMouseEvent', { type: 'mouseWheel', ...routed[0].point, deltaX: action.deltaX, deltaY: action.deltaY }, sessionId, signal);
      else {
        if (routed[1].sessionId !== sessionId) throw new BrowserControlError('frame-unavailable', '跨进程页面之间的拖动请手动完成。');
        const from = routed[0].point, to = routed[1].point;
        try {
          await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button: 'left', clickCount: 1 }, sessionId, signal);
          for (let step = 1; step <= 12; step++) { signal?.throwIfAborted(); await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * step / 12, y: from.y + (to.y - from.y) * step / 12, button: 'left', buttons: 1 }, sessionId, signal); }
        } finally { await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, button: 'left', clickCount: 1 }, sessionId); }
      }
    } else {
      if (!this.observation) throw new BrowserControlError('observe-first', '请先观察当前页面。');
      await checked();
      // Keyboard operations must not write into an unobserved password/file field.
      const focused = await this.send('Runtime.evaluate', { expression: `(() => { let e = document.activeElement; while(e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement; return { type: e?.type, secret: /(?:current|new)-password/.test(e?.autocomplete ?? ''), frame: e?.tagName === 'IFRAME', opaque: e && !e.isContentEditable && !['BODY','HTML','INPUT','TEXTAREA','SELECT','BUTTON','CANVAS'].includes(e.tagName) }; })()`, returnByValue: true }, undefined, signal);
      if (this.protectedFocus || ['password', 'file'].includes(focused.result?.value?.type) || focused.result?.value?.secret || focused.result?.value?.frame || focused.result?.value?.opaque) throw new BrowserControlError('manual-required', '请使用明确的元素输入，或手动完成当前敏感字段/嵌入页面输入。');
      if (action.type === 'press') await this.press(action.key, signal);
      else if (action.type === 'type') await this.send('Input.insertText', { text: action.text }, undefined, signal);
    }
    } finally { this.beforeInput = undefined; await restoreFocus?.(); }
    this.invalidate();
    // Every action returns a fresh view; this is technical feedback, not proof of the user's business goal.
    await new Promise(resolve => setTimeout(resolve, 120));
    return this.observe(false, false, signal);
  }
  private async click(x: number, y: number, button: string, count: number, signal?: AbortSignal, sessionId?: string): Promise<void> {
    await this.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }, sessionId, signal);
    for (let clickCount = 1; clickCount <= count; clickCount++) {
      try { await this.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button, clickCount }, sessionId, signal); }
      finally { await this.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button, clickCount }, sessionId); }
    }
  }
  private async press(chord: string, signal?: AbortSignal, sessionId?: string): Promise<void> {
    const key = chord.split('+').at(-1)!;
    const code: Record<string, number> = { Enter: 13, Space: 32, Tab: 9, Escape: 27, Backspace: 8, Delete: 46, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, Home: 36, End: 35, PageUp: 33, PageDown: 34, A: 65 };
    const params = { key: key === 'A' ? 'a' : key === 'Space' ? ' ' : key, code: key === 'A' ? 'KeyA' : key, windowsVirtualKeyCode: code[key], modifiers: chord.includes('Control+') ? 2 : chord.includes('Shift+') ? 8 : 0, ...(key === 'Enter' || key === 'Space' ? { text: key === 'Enter' ? '\r' : ' ' } : {}) };
    try { await this.send('Input.dispatchKeyEvent', { type: 'keyDown', ...params }, sessionId, signal); }
    finally { await this.send('Input.dispatchKeyEvent', { type: 'keyUp', ...params }, sessionId); }
  }
  async navigate(url: string, signal?: AbortSignal): Promise<BrowserObservation> {
    signal?.throwIfAborted(); this.invalidate();
    await this.bounded(this.port.navigate(url), signal);
    return this.observe(false, false, signal);
  }
  async check(condition: BrowserCondition, signal?: AbortSignal): Promise<{ passed: boolean; evidence: string; actual: string; complete: boolean; observation: BrowserObservation }> {
    if (condition.type === 'state') {
      const { state } = condition;
      const observation = await this.observe(false, false, signal, { ...condition.query, visible: ['visible', 'hidden', 'stable'].includes(state) ? true : condition.query.visible, offset: 0, limit: 250 });
      const count = observation.page?.totalElements ?? observation.elements.length;
      const complete = !observation.queryIncomplete && !observation.frames.some(frame => !frame.available && (!condition.query.frameId || frame.id === condition.query.frameId));
      let passed = ['detached', 'hidden'].includes(state) ? count === 0 && complete : ['enabled', 'disabled'].includes(state) ? count === 1 && observation.elements[0]?.disabled === (state === 'disabled') : count > 0;
      if (state === 'stable' && passed) {
        if (count !== 1) passed = false;
        else {
          const target = this.target(observation.elements[0].ref);
          const moving = await this.withNode(target, objectId => this.nodeCall(target, objectId, `function() { return this.getAnimations().some(animation => animation.playState === 'running' && animation.effect?.getKeyframes().some(frame => Object.keys(frame).some(key => /^(transform|translate|rotate|scale|top|left|right|bottom|width|height|margin|padding)/.test(key)))); }`, [], signal), signal);
          const before = (await this.send('DOM.getContentQuads', { backendNodeId: target.backendNodeId }, target.sessionId, signal)).quads?.[0];
          await new Promise(resolve => setTimeout(resolve, 100));
          const after = (await this.send('DOM.getContentQuads', { backendNodeId: target.backendNodeId }, target.sessionId, signal)).quads?.[0];
          passed = !moving && !!before && !!after && before.every((value: number, index: number) => Math.abs(value - after[index]) <= 0.5);
        }
      }
      const actual = `匹配 ${count} 项：${observation.elements.slice(0, 5).map(element => `${element.name || '未命名元素'}（${element.disabled ? '已禁用' : '可用'}）`).join('；')}`;
      return { passed, complete, actual, evidence: `${state}，匹配 ${count} 个元素 → ${passed ? '条件符合' : complete ? '条件不符合' : '观察不完整'}`, observation };
    }
    const query = condition.type === 'locator' ? condition.query : condition.type === 'element' || condition.type === 'field'
      ? browserQuerySchema.parse({ frameId: condition.frameId, selector: { by: 'role', value: condition.role, name: condition.name } })
      : condition.type === 'text' ? browserQuerySchema.parse({ selector: { by: 'text', value: condition.text, exact: false }, visible: true }) : undefined;
    const observation = await this.observe(false, false, signal, query ? { ...query, offset: 0, limit: 250 } : undefined);
    const count = observation.page?.totalElements ?? observation.elements.length;
    const states = ['value', 'checked', 'selected', 'expanded'] as const;
    const hasState = condition.type === 'field' || condition.type === 'locator' && states.some(key => condition[key] !== undefined);
    const exists = condition.type === 'url' ? observation.tab.url.includes(condition.text) : hasState
      ? observation.elements.some(element => !('value' in condition && element.valueTruncated) && states.every(key => !(key in condition) || condition[key as keyof typeof condition] === undefined || element[key] === condition[key as keyof typeof condition])) : count > 0;
    const incomplete = observation.queryIncomplete === true || observation.elements.some(element => hasState && 'value' in condition && element.valueTruncated) || observation.frames.some(frame => !frame.available && (!query?.frameId || query.frameId === frame.id)) || hasState && observation.page?.nextOffset !== undefined;
    const expected = condition.type === 'locator' && condition.count !== undefined ? condition.count > 0 : 'present' in condition ? condition.present : true;
    const passed = exists === expected && !(condition.type !== 'url' && !exists && incomplete)
      && !(condition.type === 'locator' && condition.count !== undefined && (count !== condition.count || incomplete));
    const target = condition.type === 'locator' ? `局部定位，匹配 ${count} 个元素` : condition.type === 'field' || condition.type === 'element' ? `${condition.role} / ${condition.name}` : condition.text;
    const actual = condition.type === 'url' ? browserRecordUrl(observation.tab.url) : `匹配 ${count} 项：${observation.elements.slice(0, 5).map(element => [element.name || '未命名元素', element.value === undefined ? '' : `实际值：${element.value}${element.valueTruncated ? '（已截断）' : ''}`, element.checked === undefined ? '' : `勾选：${element.checked === 'mixed' ? '部分选中' : element.checked ? '是' : '否'}`, element.selected === undefined ? '' : `选中：${element.selected ? '是' : '否'}`, element.expanded === undefined ? '' : `展开：${element.expanded ? '是' : '否'}`].filter(Boolean).join(' / ')).join('；')}`.slice(0, 2000);
    const observedActual = condition.type !== 'url' && observation.text ? `${actual}\n读取文字：${observation.text.slice(0, 1000)}${observation.page?.nextTextOffset !== undefined || observation.text.length > 1000 ? '（已截断）' : ''}` : actual;
    return { passed, actual: observedActual, complete: !incomplete, evidence: condition.type === 'url' ? browserRecordUrl(observation.tab.url) : `${target} → ${passed ? '条件符合' : incomplete ? '观察不完整，无法确认条件' : '条件不符合'}`, observation };
  }
}
