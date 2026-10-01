/**
 * 素材采集共享状态钩子:整页浏览器与编辑器侧栏共用同一份列表与操作。
 * 主进程广播 media-capture:changed(右键存图等主进程侧写入)时自动刷新;
 * media-capture:failed(如原图抓取失败)转 toast。
 */
import { useEffect, useRef, useState } from 'react';
import { errorText } from '../todo/ui/ui';
import type { MediaCaptureItem } from '../../shared/media-capture-contracts';

const wb = window.workbench;

export function useMediaCaptures(onPending: (message: string) => void) {
  const [items, setItems] = useState<MediaCaptureItem[]>([]);
  const onPendingRef = useRef(onPending);
  onPendingRef.current = onPending;
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current) return;
    loadedOnce.current = true;
    void wb.mediaCapture.list().then(
      (raw) => setItems(raw as MediaCaptureItem[]),
      (e) => onPendingRef.current(errorText(e)),
    );
  }, []);
  useEffect(() => wb.mediaCapture.onChanged((raw) => setItems(raw as MediaCaptureItem[])), []);
  useEffect(() => wb.mediaCapture.onFailed((message) => onPendingRef.current(message)), []);

  const save = async (shot: { url: string; title: string; png: string; thumb: string }): Promise<void> => {
    const raw = await wb.mediaCapture.save({
      url: shot.url, title: shot.title || shot.url, png: shot.png, thumb: shot.thumb,
    });
    setItems(raw as MediaCaptureItem[]);
    onPendingRef.current('已采集:链接 + 标题 + 整页截图');
  };

  const remove = (id: string): void => {
    void wb.mediaCapture.remove(id).then(
      (raw) => setItems(raw as MediaCaptureItem[]),
      (e) => onPendingRef.current(errorText(e)),
    );
  };

  const setNote = (id: string, note: string): void => {
    void wb.mediaCapture.setNote(id, note).then(
      (raw) => setItems(raw as MediaCaptureItem[]),
      (e) => onPendingRef.current(errorText(e)),
    );
  };

  return { items, save, remove, setNote };
}
