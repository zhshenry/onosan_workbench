/**
 * 整页「素材浏览器」(自媒体工作台):通用 BrowserPane(多标签) + 素材采集 + AI 看这页。
 * 找素材与创作者后台复用浏览器外壳,分别保留登录态。
 */
import { useRef } from 'react';
import { XHS_CREATOR_HOME, XHS_CREATOR_WORKSPACE } from '../../shared/browser-contracts';
import { BrowserPane, type BrowserPaneApi } from '../../modules/browser/ui/pane';
import { CaptureStrip } from '../../modules/media-capture/ui/CaptureStrip';
import { MEDIA_PLATFORMS } from '../../modules/media-capture/platforms';
import { useMediaCaptures } from '../../modules/media-capture/useMediaCaptures';

export type MediaBrowserMode = 'browse' | 'creator';

export function MediaBrowserView({ mode, onModeChange, onPending, onAskAI }: {
  mode: MediaBrowserMode;
  onModeChange(mode: MediaBrowserMode): void;
  onPending(message: string): void;
  /** 打开 AI 面板并把提示词作为种子消息发送 */
  onAskAI(prompt: string): void;
}) {
  const captures = useMediaCaptures(onPending);
  const apiRef = useRef<BrowserPaneApi | null>(null);

  const onAskPage = (page: { url: string; title: string; text: string }): void => {
    onAskAI([
      '我正在浏览一个网页,请基于页面内容帮我总结要点,并提炼适合做自媒体内容的话题角度。',
      `页面:${page.title}(${page.url})`,
      '正文摘录:',
      page.text,
    ].join('\n'));
  };

  return (
    <section className="view on media-browser-view" id="view-media-browser">
      <div className="media-browser-header">
        <div>
          <h1>{mode === 'creator' ? '我的小红书' : '找素材'}</h1>
          <p>{mode === 'creator' ? '请在下方登录创作者后台 · 作品同步暂未接入' : '浏览平台、采集灵感，登录态保留在本机'}</p>
        </div>
        <button type="button" className="btn btn-sec btn-sm" onClick={() => onModeChange(mode === 'creator' ? 'browse' : 'creator')}>
          {mode === 'creator' ? '找素材' : '返回我的小红书'}
        </button>
      </div>
      {mode === 'browse' ? (
        <BrowserPane
          key="browse"
          workspace="media"
          tabs
          slogan={<>逛平台、找选题,<b>看到即采集</b> —— 链接、标题与整页截图一并存下</>}
          chips={MEDIA_PLATFORMS}
          capture={{ label: '采集到素材', onCapture: captures.save }}
          onAskPage={onAskPage}
          apiRef={apiRef}
          onPending={onPending}
          startSlot={
            <CaptureStrip
              items={captures.items}
              onOpen={(url) => apiRef.current?.loadUrl(url)}
              onRemove={captures.remove}
              onSetNote={captures.setNote}
            />
          }
        />
      ) : (
        <BrowserPane
          key="creator"
          workspace={XHS_CREATOR_WORKSPACE}
          initialUrl={XHS_CREATOR_HOME}
          readOnlyAddress
          onPending={onPending}
        />
      )}
    </section>
  );
}
