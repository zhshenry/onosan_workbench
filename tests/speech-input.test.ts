import assert from 'node:assert/strict';
import test from 'node:test';
import { JSDOM } from 'jsdom';
import { act, createElement, createRef, useState } from 'react';
import { encodeSpeechWave } from '../shared/speech-audio';
import { SpeechRecorder } from '../src/ui/speech-recorder';

test('speech review preserves edited results and the original draft across recording segments', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const globals = ['window', 'document', 'HTMLElement', 'HTMLDialogElement', 'Node', 'navigator', 'localStorage', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const descriptors = globals.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  globals.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true
    : name === 'ResizeObserver' ? class { observe() {} disconnect() {} }
    : name === 'requestAnimationFrame' ? (callback: FrameRequestCallback) => { callback(0); return 0; }
    : name === 'window' ? dom.window : dom.window[name as keyof typeof dom.window] }));
  const matches = dom.window.HTMLElement.prototype.matches;
  dom.window.HTMLElement.prototype.matches = function (selector) { return selector === ':popover-open' ? this.dataset.open === 'true' : matches.call(this, selector); };
  Object.assign(dom.window.HTMLElement.prototype, { showPopover() { this.dataset.open = 'true'; }, hidePopover() { delete this.dataset.open; } });
  dom.window.HTMLCanvasElement.prototype.getContext = (() => null) as never;
  Object.defineProperty(dom.window.navigator, 'mediaDevices', { value: { enumerateDevices: async () => [] } });
  const original = { start: SpeechRecorder.prototype.start, finish: SpeechRecorder.prototype.finish, cancel: SpeechRecorder.prototype.cancel };
  let interrupted = () => {}, captures = 0, cancels = 0;
  SpeechRecorder.prototype.start = async function (_device, onInterrupted) { captures++; interrupted = onInterrupted; };
  SpeechRecorder.prototype.finish = async function () { return encodeSpeechWave(new Float32Array(160)); };
  SpeechRecorder.prototype.cancel = function () { cancels++; };
  let result = '第一段', prepare = async () => {}, transcribe = async () => ({ text: result });
  Object.assign(dom.window, { workbench: { speech: { prepare: () => prepare(), transcribe: () => transcribe(), cancel: async () => {} } } });
  const { SpeechInput } = await import('../src/views/SpeechInput');
  const { createRoot } = await import('react-dom/client');
  const root = createRoot(dom.window.document.getElementById('root')!);
  const anchor = createRef<HTMLDivElement>();
  let setDraft!: (value: string) => void, context = 'first', visible = true, instance = 0, changes = 0;
  const onBusyChange = () => {};
  function Harness() {
    const [draft, updateDraft] = useState('AAA旧BBB'); setDraft = updateDraft;
    return createElement('div', null,
      createElement('div', { ref: anchor }, createElement('div', { className: 'ai-compose-input' }, createElement('textarea', { className: 'draft', value: draft, onChange: (event: { target: { value: string } }) => updateDraft(event.target.value) }))),
      createElement(SpeechInput, { anchor, contextKey: context, draft, onChange(value) { changes++; updateDraft(value); }, enabled: true, visible, onBusyChange }));
  }
  const render = async () => { await act(async () => root.render(createElement(Harness, { key: instance }))); };
  const query = <T extends Element>(selector: string) => dom.window.document.querySelector<T>(selector)!;
  const preview = () => query<HTMLTextAreaElement>('.ai-speech-review textarea');
  const button = (label: string) => [...dom.window.document.querySelectorAll<HTMLButtonElement>('button')].find(value => value.textContent === label)!;
  const click = async (value: HTMLElement) => { assert.ok(value); await act(async () => value.click()); };
  const edit = async (value: string) => { await act(async () => {
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(preview(), value);
    preview().dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  }); };
  const finish = async (value: string) => { result = value; await click(button('停止并转写')); };
  const open = async () => { await click(query<HTMLButtonElement>('[aria-label="语音听写"]')); };
  const reset = async () => {
    result = '第一段'; prepare = async () => {}; transcribe = async () => ({ text: result });
    context = 'first'; visible = true; changes = 0; captures = 0; cancels = 0; instance++;
    await render(); query<HTMLTextAreaElement>('.draft').setSelectionRange(3, 4);
  };
  try {
    await t.test('append uses manual edits and retains the first selection even after focus changes', async () => {
      await reset(); await open(); await finish('原识别'); await edit('已改好的文字');
      query<HTMLTextAreaElement>('.draft').setSelectionRange(0, 0);
      await click(button('继续录音')); assert.match(query('.ai-speech-status').textContent!, /补充录音中/);
      await finish('补充一'); assert.equal(preview().value, '已改好的文字\n补充一');
      await click(button('继续录音')); await finish('补充二');
      assert.equal(preview().value, '已改好的文字\n补充一\n补充二'); assert.equal(changes, 0);
      await click(button('插入草稿'));
      assert.equal(query<HTMLTextAreaElement>('.draft').value, 'AAA已改好的文字\n补充一\n补充二BBB'); assert.equal(changes, 1);
    });
    await t.test('cancelling append and replacement preserves edited text and releases capture', async () => {
      await reset(); await open(); await finish('原识别'); await edit('保留手动修改');
      for (const label of ['继续录音', '重新录音']) {
        await click(button(label)); const before = cancels;
        await click(button('取消本段')); assert.ok(cancels > before);
        assert.equal(preview().value, '保留手动修改'); assert.equal(changes, 0);
      }
    });
    await t.test('successful replacement can restore exactly once; editing clears the stale backup', async () => {
      await reset(); await open(); await finish('原识别'); await edit('修改后的原文');
      await click(button('重新录音')); await finish('新的识别结果'); assert.equal(preview().value, '新的识别结果');
      await click(button('恢复上次结果')); assert.equal(preview().value, '修改后的原文'); assert.equal(button('恢复上次结果'), undefined);
      await click(button('重新录音')); await finish('再次识别'); await edit('进一步修改');
      assert.equal(button('恢复上次结果'), undefined); assert.equal(preview().value, '进一步修改');
    });
    await t.test('preparation, recognition, silence and device failures retain the existing result', async () => {
      for (const failure of ['prepare', 'recognition', 'silence', 'device']) {
        await reset(); await open(); await finish('需要保留');
        if (failure === 'prepare') prepare = async () => { throw new Error('引擎暂不可用'); };
        await click(button('继续录音'));
        if (failure === 'recognition') transcribe = async () => { throw new Error('识别失败'); };
        if (failure === 'device') await act(async () => interrupted());
        else if (failure !== 'prepare') await finish('');
        assert.equal(preview().value, '需要保留'); assert.ok(query('[role="alert"]').textContent);
        assert.equal(button('插入草稿').disabled, false); assert.equal(changes, 0);
      }
    });
    await t.test('a late cancelled transcript cannot replace a newer appended result', async () => {
      await reset(); await open(); await finish('前文');
      let resolve!: (value: { text: string }) => void;
      transcribe = () => new Promise(value => { resolve = value; });
      await click(button('继续录音')); await click(button('停止并转写'));
      await click(button('取消本段')); assert.equal(preview().value, '前文');
      transcribe = async () => ({ text: '有效补充' });
      await click(button('继续录音')); await click(button('停止并转写'));
      await act(async () => resolve({ text: '过期结果' })); assert.equal(preview().value, '前文\n有效补充');
    });
    await t.test('a draft edited between segments is appended to instead of being overwritten', async () => {
      await reset(); await open(); await finish('语音一'); await act(async () => setDraft('新草稿'));
      await click(button('继续录音')); await finish('语音二');
      assert.equal(query<HTMLTextAreaElement>('.draft').value, '新草稿');
      await click(button('追加到草稿')); assert.equal(query<HTMLTextAreaElement>('.draft').value, '新草稿\n语音一\n语音二');
    });
    await t.test('Escape and window blur cancel only the current segment, while hiding closes the card', async () => {
      await reset(); await open(); await finish('保留前文');
      await click(button('继续录音'));
      await act(async () => dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape' })));
      assert.equal(preview().value, '保留前文');
      await click(button('重新录音')); await act(async () => dom.window.dispatchEvent(new dom.window.Event('blur')));
      assert.equal(preview().value, '保留前文');
      visible = false; await render(); assert.equal(query('.ai-speech-card'), null); assert.equal(changes, 0);
    });
    await t.test('switching conversation ignores an outstanding segment and clears the backup', async () => {
      await reset(); await open(); await finish('旧会话原文'); await click(button('重新录音')); await finish('替换后');
      let resolve!: (value: { text: string }) => void;
      transcribe = () => new Promise(value => { resolve = value; });
      await click(button('继续录音')); await click(button('停止并转写'));
      context = 'second'; await render(); await act(async () => resolve({ text: '旧会话补充' }));
      assert.equal(query('.ai-speech-card'), null); assert.equal(changes, 0);
      transcribe = async () => ({ text: '新会话' }); await open(); await finish('新会话');
      assert.equal(preview().value, '新会话'); assert.equal(button('恢复上次结果'), undefined);
    });
  } finally {
    await act(async () => root.unmount());
    Object.assign(SpeechRecorder.prototype, original); dom.window.close();
    globals.forEach((name, index) => { const descriptor = descriptors[index]; if (descriptor) Object.defineProperty(globalThis, name, descriptor); else Reflect.deleteProperty(globalThis, name); });
  }
});
