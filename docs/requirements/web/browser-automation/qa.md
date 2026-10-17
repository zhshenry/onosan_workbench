## 浏览器确认组合 · 2026-10-16

范围：方案 1 的紧凑双行浏览器，合入方案 3 的逐回复任务记录入口。保留既有 AI 面板头部、消息样式、三主题和小红书单页/站点限制；不增设开发工具或常驻关联提示。

### 视觉与运行证据

- source visual truth：[确认组合稿](design/browser-combined-2026-10-16.png)，1536×1024 设计评审画布。
- implementation screenshot：[菜单与回复入口](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-combined-menu.png)。Electron 请求客户区 1280×820，实测 CSS 1279×820、DPR=2、PNG 2558×1640。
- [完整与局部对照](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-comparison.png)：源图剔除评审标题与下方运行态示意，实机取完整客户区；两者等比缩至 660px 列宽，没有拉伸。另并排检查标签/地址栏、菜单、回复页脚。评审稿窗口比例与实际默认窗口不同，不据此声称全窗口逐像素还原。
- state：mist、真实本地合成网页、AI 任务已核验、菜单键盘选中任务记录、助手展开；源图的菜单未选中，实机焦点环属于需要保留的交互状态。测试网页比设计稿多出的控件不属于宿主设计差异。
- [记录弹窗](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-reply-record.png)、[窄窗运行控制](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/browser-running-1024.png)。窄窗请求 1024×680，实测 CSS 1023×681、DPR=2；工具栏暂停/停止的中心点命中真实按钮。
- [流程及布局报告](C:/Users/henry/.codex/visualizations/2026/10/14/01a13b12-abb2-7811-a837-f485b142a6c3/browser-combined-20261016-t08zc8/report.json)覆盖 mist/cool/warm × 1280/1024 六种布局及各自菜单展开截图，网页本身滚动，宿主控件没有被助手覆盖。默认浏览与四标签状态的网页顶部均为 y=180 CSS px。

### 修正历程

1. [P1，已修复] 菜单/记录的 Escape 会触发原有 AI 面板全局关闭处理。修正为原生弹窗和展开的 popover 优先；菜单焦点移到输入框后也不能先关闭助手。最终 Electron 验收包含焦点返回和助手仍展开的断言。
2. [P2，已修复] 四个长标签产生额外横向滚动条。标签改为先压缩，保留可访问标题；六种布局均断言四标签没有额外水平滚动，较多标签仍可滚动访问。
3. [证据修正] 首次记录弹窗截图捕获了 180ms 入场动画中的透明帧。采集改为等待有限动画完成；最终截图确认前景不透字。未通过修改业务界面来美化截图。

### 五项对照

| 项目 | 结果 |
|---|---|
| 字体与排版 | 复用现有字体及 type-control/type-support，不新增字体；标题省略、完整提示和键盘焦点可用。 |
| 间距与结构 | 标签与地址栏合为单一浏览器表面，移除通用浏览器大页头及两行常驻工具；原 AI 头部按现有合同保留。 |
| 颜色与 token | 复用 glass/ink/acc/ai-panel/radius；三主题菜单均是不透字的主题前景；失败和未核验不伪装成成功。 |
| 图像与图标 | 使用既有雾面背景与 Phosphor 图标；设计图仅作参考，运行界面由真实控件渲染，未把 UI 截图当成页面。 |
| 文案与内容 | 四个菜单入口及“查看操作记录”一致；记录来自已绑定任务。AI 回复不额外硬编码绿色成功标志，任务成功仍以实际核验状态为准。 |

### 验证与边界

- npm run verify 通过：字阶、两个 TypeScript 配置、生产构建；最终相关组件/AI 导航测试 3/3 通过。
- node tooling/browser-automation-pilot.mjs 最终 24/24 流程通过：真实 guest 点击填写、原生 popover、暂停/继续/停止、助手收起与窗口隐藏时运行、跨站授权、小红书与博客协作、历史清理、逐回复关联和正常重启；renderer error 与 console error 均为 0。
- 记录组件测试覆盖淘汰后不回退到新任务、读取失败重试和实时更新不被迟到快照覆盖；正常重启后逐回复任务标识仍一致。
- npm test 为 626/628 通过；另两项原有符号链接测试因本机 Windows symlink EPERM 失败。没有跳过测试、削弱检查或修改系统权限。
- 全局严格静态审计仍为 9 项既有发现；前后按 file/ruleId/message 比较新增 0。全局审计未通过，不能据此宣称整个应用静态合规。本次变更没有引入对应新问题。
- DESIGN.md 官方 lint 为 0 errors、1 条既有“无 YAML”格式提示。文档继续沿用仓库现有格式。
- 使用隔离数据与本地合成网页/模型，验收的是开发 Electron 构建；未发布安装包，未据此声称真实网站全覆盖或跨版本升级已验收。

浏览器改动范围的视觉与交互验收未发现剩余 P0/P1/P2 问题；全局测试权限及既有审计问题按上文保留。

final result: passed
