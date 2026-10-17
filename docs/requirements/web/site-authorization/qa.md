## 浏览器站点授权 · 方案 3 · 2026-10-17

- source visual truth: `docs/requirements/web/site-authorization/design/browser-site-approval-dock-2026-10-17.png`（1629×965）；用户选择第三张「底部待处理卡」。
- 首轮 Electron 原始截图：`C:/Users/henry/AppData/Local/Temp/ono-browser-pilot-ySd20L/site-approval-mist-1440.png`（2878×1704，CSS 客户区约 1439×852，devicePixelRatio=2）。归一到参考尺寸后比较。
- 首轮完整/局部组合对照：`C:/Users/henry/.codex/visualizations/2026/10/14/01a13aca-ea82-79d3-bbf1-1509791d9e94/browser-site-approval-20261017/comparison-initial.png`、`comparison-initial-card.png`。左侧参考，右侧实现。
- [P2] 首轮卡片的站点行多出整块浅蓝内衬，卡片比参考约高 26 CSS px，挤占聊天空间；已去除该行额外背景和内距，收紧正文行距。待重新截图比对。
- 首轮实际允许和拒绝均写入正确结果；拒绝后没有创建标签。验收脚本错误地要求空标签任务结束后仍有工具栏状态按钮，已改为核验取消状态、拒绝回执与标签数。

### 修正后复验

- 最终原始实机截图：`C:/Users/henry/.codex/visualizations/2026/10/14/01a13aca-ea82-79d3-bbf1-1509791d9e94/browser-site-approval-20261017/site-approval-selected.png`，2878×1704；参考 1629×965。实机客户区约 1439×852、devicePixelRatio=2；以同一待授权状态、mist 主题，将实机归一到参考尺寸。两者纵横比差低于 0.1%。
- 完整组合对照：同目录 `comparison-final.png`；局部组合对照：`comparison-final-card.png`。均左侧参考、右侧真实 Electron。卡片高度、站点行、按钮和输入框间距已接近选定稿，首轮 P2 已消除；没有未解决的 P0/P1/P2。
- 固定卡置于聊天滚动区外，正文可滚动，按钮不重叠输入框；三主题、1280×820 和 1024×680 的边界及命中检查全部通过，1440×852 用于与选定稿对照。定位入口将键盘焦点移回卡片。
- 内容差异：实际站点标题显示完整主机名 www.baidu.com，参考为“百度”；使用当前配置的合成模型名称，未替换用户模型设置。思考文本只在模型实际返回时显示；历史测试标签保留。这些是数据与既有行为，不伪造模型回复来匹配示例。
- 42 项相关回归通过；覆盖失败重试、提交去重、当前对话与分区隔离、过期请求不可操作、旧读取与旧 IPC 返回不能覆盖更新的授权、冷启动保留结果且使待授权失效。
- `npm run verify` 通过。隔离 Electron 32/32 实机检查通过，63 次本机合成模型请求；包含允许后实际导航、拒绝不创建标签、旧菜单入口、后台任务、主题布局、历史与正常重启。原始报告复制在同目录 `report.json`；console 无错误。
- Browser skill 未提供，使用仓库 Playwright Electron 通道。仅使用临时 appData、本机合成网页及模型；百度对照场景在授权前取消，没有访问真实百度页面。未验证真实外部模型输出质量、安装包或跨版本升级。
- Follow-up polish：无阻塞项；不在此次修改中调整已有浏览器标签和模型配置。

final result: passed
