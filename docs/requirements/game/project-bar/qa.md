## 游戏项目栏 · 方案 1 · 2026-10-17

范围：按用户选择整理游戏项目顶栏。紧凑单行保留项目、服务状态、启动和面板开关，项目目录与设置收入项目「⋯」；游戏预览菜单、终端会话和原有服务操作继续沿用。

### 视觉对照

- source visual truth：`docs/requirements/game/project-bar/design/game-project-option-1-2026-10-17.png`，1981×793，用户选定的第一张「轻量单行」。
- implementation screenshot：[最终原生窗口](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/header-final.png)，1600×1000；[参考宽度窗口](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/header-reference-width.png)，1052×720。均为 mist、服务停止、检查展开、项目菜单展开，原生客户区 DPR=1。
- [完整目标组件组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/comparison-header.png)与[操作区局部组合对照](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/comparison-actions.png)：左为选定稿，右为实机；按项目栏等比归一至 962px 宽，未拉伸。比较范围为本次修改的项目栏及菜单。

| 维度 | 检查结果 |
|---|---|
| 字体与字阶 | 沿用宿主中文字体和共享字阶；项目名突出，目录与服务状态次要，按钮文字保持可读。没有为效果稿另造一套字体。 |
| 布局与间距 | 64×48 原有缩略图、项目名/目录靠左，状态在标题旁；启动、分隔线、终端、检查和更多按选定顺序排列。选中检查与更多清楚，小窗口允许分组换行。 |
| 颜色与材质 | 主行动近黑，展开面板与更多为雾蓝选中态，服务运行使用现有青绿。边线、圆角、背景全部复用宿主 mist/cool/warm token。 |
| 图像与图标 | 缩略图复用游戏雨窗素材，图标沿用 Phosphor，没有用生成图代替真实控件或游戏预览。 |
| 文案与内容 | 面板按钮固定为「终端」「检查」，以选中态表示展开；菜单显示「打开项目目录」「项目设置」。实际路径、服务错误和外部服务状态来自运行结果。 |

可接受的差异：实机菜单沿用现有浏览器菜单的 240px 宽度、40px 最小行高和共享字号，比等比归一后的生成稿菜单更宽，保持可读与点击区域一致；键盘焦点环是实际可访问状态。生成稿在未运行时仍展示示例游戏画面，实机保留真实停止态插图，本次不修改下方游戏内容来模拟效果稿。没有宣称逐像素一致，项目栏内无剩余 P0/P1/P2 差异。

### 行为与回归验证

- `npm run verify` 通过；最后响应式 CSS 修正后 `npm run build` 通过。游戏服务、终端与 GuestFrame 相关单元回归 11/11 通过。
- [项目栏原生验收](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-project-header/report.json)10/10 通过：菜单键盘与 Escape 回焦、目录原生调用边界、共享设置弹窗、面板切换保留终端 PID、真实服务启动/重启/停止、运行时设置禁用、端口冲突错误、外部服务断开不停止其进程。
- [预览菜单回归](C:/Users/henry/.codex/visualizations/2026/10/16/01a1428e-2c14-77f3-a87b-7907203e1553/game-preview-menu/report.json)9/9 通过：真实 guest 缩放与重置、实际截图、外部打开调用边界、独立试玩分区、菜单互斥及导航/切页关闭，同一 guest 不重建。两份原生验收报告 errors 均为空。
- 三主题 1280×820、窄窗 1024×680、1280 宽 AI 停靠及参考宽度窗口均无项目控件重叠或菜单越界；减少动态效果和强制颜色偏好检查通过。1024 下原有 AI 面板为覆盖式，其自身布局不在本次修改范围内。
- 严格静态审计仍有 8 项其他视图的既有发现，GameView/game.css 无发现；官方 DESIGN lint 为 0 errors、1 条既有无 YAML 提示。不宣称全应用审计通过。
- Browser skill 未提供，使用仓库 Playwright Electron 通道与隔离 appData；外部打开由测试截获以验证调用，没有操纵用户浏览器。真实游戏源码、安装版与用户档案未修改；未打包发布。

final result: passed
