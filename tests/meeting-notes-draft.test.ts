import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createElement } from 'react';
import { JSDOM } from 'jsdom';
import { emptyMeetingNote, type MeetingNote, type MeetingNoteDraft } from '../shared/meeting-notes';

test('纪要草稿：串行保存、IME、失败恢复和冲突选择均保留正确内容', async t => {
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/', pretendToBeVisual: true });
  const names = ['window', 'document', 'HTMLElement', 'Node', 'navigator', 'localStorage', 'IS_REACT_ACT_ENVIRONMENT'] as const;
  const previous = names.map(name => Object.getOwnPropertyDescriptor(globalThis, name));
  names.forEach(name => Object.defineProperty(globalThis, name, { configurable: true, value: name === 'IS_REACT_ACT_ENVIRONMENT' ? true : dom.window[name as keyof typeof dom.window] }));
  const { createRoot } = await import('react-dom/client');
  const { useMeetingDraft, cleanMeetingHtml } = await import('../src/meeting-notes');
  const saved = new Map<string, MeetingNote>(), calls: { id: string; body: string; revision: number }[] = [];
  let release: (() => void) | undefined, gate: Promise<void> | undefined, failure = '';
  Object.assign(dom.window, { workbench: { meetingNotes: {
    list: async () => [...saved.values()],
    save: async (id: string, draft: MeetingNoteDraft, revision: number) => {
      calls.push({ id, body: draft.body, revision });
      const wait = gate; gate = undefined; if (wait) await wait;
      if (failure) throw new Error(failure);
      const note: MeetingNote = { ...draft, actions: draft.actions.map(action => ({ ...action, taskId: null })), meetingId: id, revision: revision + 1, updatedAt: new Date().toISOString() };
      saved.set(id, note); return note;
    },
  } } });
  let handle!: ReturnType<typeof useMeetingDraft>;
  function Harness({ id }: { id: string }) { handle = useMeetingDraft(id, saved.get(id), note => saved.set(id, note)); return null; }
  let root = createRoot(dom.window.document.getElementById('root')!);
  const mount = async (id: string) => act(async () => root.render(createElement(Harness, { key: id, id })));
  try {
    await t.test('慢响应之后仍保存更新的正文，后一个请求使用新版本', async () => {
      await mount('serial');
      await act(async () => handle.change({ ...emptyMeetingNote(), body: '<p>第一版</p>' }));
      gate = new Promise<void>(resolve => { release = resolve; });
      let saving!: Promise<boolean>;
      await act(async () => { saving = handle.flush(); });
      await act(async () => handle.change({ ...emptyMeetingNote(), body: '<p>第二版</p>' }));
      await act(async () => { release!(); assert.equal(await saving, true); });
      assert.deepEqual(calls.filter(call => call.id === 'serial').map(call => [call.body, call.revision]), [['<p>第一版</p>', 0], ['<p>第二版</p>', 1]]);
      assert.equal(saved.get('serial')?.body, '<p>第二版</p>');
      assert.equal(localStorage.getItem('wb.meeting-note.draft.serial'), null);
    });
    await t.test('中文组合输入期间不提交，结束后自动保存', async () => {
      await mount('ime'); const before = calls.length;
      await act(async () => { handle.composition(true); handle.change({ ...emptyMeetingNote(), body: '中文输入' }); await new Promise(resolve => setTimeout(resolve, 560)); });
      assert.equal(calls.length, before);
      await act(async () => { handle.composition(false); await new Promise(resolve => setTimeout(resolve, 560)); });
      assert.equal(saved.get('ime')?.body, '中文输入');
    });
    await t.test('写入失败保留本地稿，重挂载后由用户恢复再保存', async () => {
      await mount('recover'); failure = '磁盘暂时不可写';
      await act(async () => { handle.change({ ...emptyMeetingNote(), body: '不能丢失' }); assert.equal(await handle.flush(), false); });
      assert.equal(handle.status, 'error'); assert.ok(localStorage.getItem('wb.meeting-note.draft.recover'));
      await act(async () => root.unmount());
      root = createRoot(dom.window.document.getElementById('root')!); failure = '';
      await mount('recover');
      assert.equal(handle.recovery?.body, '不能丢失'); assert.equal(saved.has('recover'), false);
      await act(async () => handle.resolve(true));
      assert.equal(saved.get('recover')?.body, '不能丢失'); assert.equal(handle.recovery, null);
    });
    await t.test('冲突不覆盖远端；选用已保存版本后清理待同步稿', async () => {
      await mount('conflict');
      saved.set('conflict', { ...emptyMeetingNote(), meetingId: 'conflict', actions: [], body: '新版内容', revision: 3, updatedAt: '' });
      failure = '纪要已在其他操作中更新，请载入新版本或保留本地稿';
      await act(async () => { handle.change({ ...emptyMeetingNote(), body: '本地旧稿' }); assert.equal(await handle.flush(), false); });
      assert.equal(handle.status, 'conflict'); assert.equal(saved.get('conflict')?.body, '新版内容');
      failure = ''; await act(async () => handle.resolve(false));
      assert.equal(handle.value.body, '新版内容'); assert.equal(handle.revision(), 3);
      assert.equal(localStorage.getItem('wb.meeting-note.draft.conflict'), null);
    });
    await t.test('只修改正文时保留本地稿，合入其他操作保存的行动清单', async () => {
      const id = 'body-conflict';
      const actionId = 'a3cb9c78-df4d-4ce4-8525-eba1c3e02530';
      const initial: MeetingNote = { ...emptyMeetingNote(), meetingId: id, actions: [], body: '初稿', revision: 1, updatedAt: '' };
      saved.set(id, initial);
      await mount(id);
      saved.set(id, { ...initial, revision: 2, actions: [{ id: actionId, title: '新增行动', taskId: null }] });
      failure = '纪要已在其他操作中更新，请载入新版本或保留本地稿';
      await act(async () => { handle.change({ ...handle.value, body: '新正文' }); assert.equal(await handle.flush(), false); });
      failure = '';
      await act(async () => handle.resolve(true));
      assert.equal(saved.get(id)?.body, '新正文');
      assert.deepEqual(saved.get(id)?.actions, [{ id: actionId, title: '新增行动', taskId: null }]);
      assert.equal(saved.get(id)?.revision, 3);
    });
    await t.test('超过保存上限的本地正文仍可恢复并缩短后保存', async () => {
      const body = '长'.repeat(200001);
      localStorage.setItem('wb.meeting-note.draft.oversized', JSON.stringify({ ...emptyMeetingNote(), body }));
      await mount('oversized'); assert.equal(handle.recovery?.body, body);
      failure = '纪要内容过长，请分段整理';
      await act(async () => handle.resolve(true)); assert.equal(handle.status, 'error');
      failure = '';
      await act(async () => { handle.change({ ...emptyMeetingNote(), body: '整理后的记录' }); assert.equal(await handle.flush(), true); });
      assert.equal(saved.get('oversized')?.body, '整理后的记录');
    });
    await t.test('粘贴内容移除脚本、事件、样式和非HTTP链接，保留正文格式', () => {
      const html = cleanMeetingHtml('<h2 onclick="alert(1)">结论</h2><script>alert(1)</script><p style="position:fixed">记录<b>要点</b><a href="javascript:alert(1)">链接</a></p>');
      assert.match(html, /<h2>结论<\/h2>/); assert.match(html, /<b>要点<\/b>/);
      assert.doesNotMatch(html, /script|onclick|style=|javascript:/);
    });
  } finally {
    await act(async () => root.unmount()); dom.window.close();
    names.forEach((name, index) => { if (previous[index]) Object.defineProperty(globalThis, name, previous[index]!); else Reflect.deleteProperty(globalThis, name); });
  }
});
