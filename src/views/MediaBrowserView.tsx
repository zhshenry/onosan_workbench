/**
 * 「我的小红书」创作者后台。
 * 页头不再提供素材浏览器入口；采集模块、共享浏览器与登录分区仍保留在各自文件中。
 */
import { XHS_CREATOR_HOME, XHS_CREATOR_WORKSPACE } from '../../shared/browser-contracts';
import { BrowserWorkspacePane as BrowserPane } from '../../modules/browser/ui/automation';

export function MediaBrowserView({ onPending }: {
  onPending(message: string): void;
}) {
  return (
    <section className="view on media-browser-view" id="view-media-browser">
      <div className="media-browser-header">
        <div>
          <h1>我的小红书</h1>
          <p>请在下方登录创作者后台 · 作品同步暂未接入</p>
        </div>
      </div>
      <BrowserPane
        workspace={XHS_CREATOR_WORKSPACE}
        initialUrl={XHS_CREATOR_HOME}
        readOnlyAddress
        onPending={onPending}
      />
    </section>
  );
}
