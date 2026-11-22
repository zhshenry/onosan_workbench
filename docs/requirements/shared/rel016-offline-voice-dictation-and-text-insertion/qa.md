# 内置语音听写验收 · 2026-10-19

当前状态：设计与功能验收通过。已在合并 origin/main 后的 v1.2.0 开发构建和正式便携包中分别完成 15 项听写检查；本机全量回归有两项既有 Windows 符号链接权限限制，见下文。

选定视觉：方案 2 的原样式与最后一张更扁的卡片细化稿。录音、波形和转写均以真实运行结果验收，生成图不作为功能证据。

验收使用项目 Playwright Electron 路径：Browser plugin not available。使用独立 appData/userData、明确的虚拟麦克风、系统合成英语及上游公开中文测试音频，不录取现场声音，不使用真实聊天、凭据或游戏存档。

## 视觉与布局

- 对照本机保留的最终细化稿与实际录音卡片截图，保留标题、麦克风标识、本地标记、设置、双下拉、浅蓝音量区和取消/停止操作，通过缩小上下留白保持扁平比例；颜色和字阶使用工作台现有 token。
- 正式包录音卡片实测 354×173.78px，与输入框外框等宽；输入框在打开前后均为 x=902、y=690.72、352×60.28px，未产生布局位移。卡片底边与输入外框保留约 8px 间距。
- 模型、麦克风、发送按顺序排布，麦克风宽 34px；录音卡片固定悬浮，不挤压消息或草稿。1024×680 下三主题均在视口内，无横向溢出。
- 已打开核对正式包的录音卡片、转写预览及窄窗截图；结果区使用真实可编辑文本与内部滚动，波形取自麦克风实时输入。

## 真实流程与边界

开发构建与正式包各 15 项均通过：

| 检查 | 结果 |
|---|---|
| 主页面标题、真实内容与应用版本 | 两者均为 1.2.0；正式包 app.isPackaged=true |
| 上游公开中文音频的原生识别 | 返回中文结果；仅证明流水线运行，不作为准确率结论 |
| 音频加视频的混合权限请求 | 返回 NotAllowedError；未使用绕过权限策略的 fake-ui 参数 |
| 悬浮录音与工具栏位置 | 输入框不移动，卡片约 174px，高度与控件顺序符合约定 |
| MediaRecorder → WAV → 原生识别 → 编辑预览 → 插入 | 英语音频返回真实转写；插入前原草稿不变，聊天消息数为 0；处理后切换模型仍保留已确认草稿 |
| 录音期间修改草稿 | 只有明确点击追加才写入，已有文字保留 |
| Escape、切换会话、取消推理 | 旧结果不插入，识别子进程释放，取消中的 Promise 返回取消结果 |
| 麦克风拒绝 | 草稿保留，展示重试入口 |
| mist / cool / warm 三主题 1024×680 | 分别检查真实主题变量、卡片边界与输入框几何，三项通过 |
| 其他应用窗口调用听写 IPC | 被拒绝，只允许可信主窗口主框架 |
| 渲染健康 | 无 pageerror、console error 或框架错误遮罩 |

## 独立安装内容与构建

- 正式执行 `npm run dist:installer` 生成 v1.2.0 NSIS、完整便携 ZIP、blockmap、latest.yml 与 SHA256 清单；`npm run release:check` 通过，版本、文件名、字节数、SHA512 与 SHA256 一致。
- 从生成的便携 ZIP 解压到源码目录之外，删除测试进程继承的 NODE_PATH，并将工作目录设为便携程序目录后运行；使用包内自身 resources/app，不依赖源码 node_modules 或 DSH 安装。
- 3 份固定模型/词表的字节数和 SHA256、5 个 Windows 原生文件、8 份许可说明全部与清单和来源一致；10 个前端/主进程构建文件与本次测试产物逐一匹配。原生 JS 和二进制依赖都解析到包内，便携版不含更新源文件。
- 两次实际界面验收均将渲染器设为离线；识别仍成功，运行时资源全部来自本机安装内容。
- `npm run verify` 通过字阶、完整 TypeScript 和生产构建检查。全量测试 754 项：752 通过、2 失败、无跳过；失败均为在 `tests/ono-render-pilot.test.ts:274`、`tests/windows-pilot.test.ts:43` 创建文件符号链接时的 Windows EPERM，未修改测试或系统权限来规避。

## 证据与验收限制

本机留存的原始报告与截图不公开提交：[开发态报告](evidence/dev-report.json)、[正式包报告](evidence/packaged-report.json)、[资源校验](evidence/v1.2.0-package-resources.json)、[全量测试摘要](evidence/v1.2.0-tests-summary.json)、[录音卡片](evidence/packaged-recording-card.png)、[转写预览](evidence/packaged-transcript-review.png)、[mist](evidence/packaged-recording-narrow-mist.png)、[cool](evidence/packaged-recording-narrow-cool.png)、[warm](evidence/packaged-recording-narrow-warm.png)。

本次实际运行验收的是解压后的正式便携载荷；NSIS 完成构建及元数据校验，未覆盖安装向导、现场麦克风噪声、方言准确率、全新 Windows 环境或跨版本自动安装升级。个人配置、对话、游戏存档和已有桌面安装均未改动。

final result: passed within the stated validation scope
