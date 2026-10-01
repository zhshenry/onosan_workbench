# Product

<!-- impeccable:product-schema 1 -->

## Platform

web(Electron 桌面壳,Windows 为主;渲染层为 Web 技术)

## Stack

当前已实现:Electron + React 19 + TypeScript(strict)+ Vite(渲染层)+ esbuild(主进程)。已接入 electron-builder 的 Windows x64 NSIS 打包与 electron-updater 的 GitHub Releases 自动更新;发布流程与 To-Do-List 一致,通过 `npm run release` 构建安装包和便携包并使用 `gh release` 发布、核验五项资产。首个正式版本 [v0.1.0](https://github.com/zhshenry/onosan_workbench/releases/tag/v0.1.0) 已于 2026-10-01 发布,五项附件的服务器 SHA256、下载地址和更新元数据核验通过;真实跨版本安装升级待验收。发布步骤见 docs/RELEASE.md。
依据:用户简报指定「EXE 可安装可更新,参考 C:\Myself\vibe_coding\To-Do-List」,该栈与参考实现一致。(推断自简报,未逐项确认)

## Users

单一主要用户:OnoSan 本人(开发者/创作者),在 Windows 个人电脑上日常使用。场景:打开一个应用完成当日个人事务——待办与日程管理、Office 文档查看编辑、网页查阅,并承载后续自用的创作与兴趣工具(自媒体制作、个人网页设计、个人游戏设计、八字等)。

## Product Purpose

个人工作台:把现有 To-Do-List(悬浮待办 + AI 日程助手)的完整能力内嵌为首页模块,并作为可长期生长的外壳,逐步纳入文档中心(Word/PPT/Excel 预览编辑)、内置浏览器、CLI 工具挂载与未来的创作模块。成功标准:日常只打开这一个应用即可覆盖主要个人事务;待办模块与 To-Do-List 行为零漂移并同步更新。

## Positioning

不对外分发的通用效率套件,而是「一个人的操作系统」:模块按本人工作流定制,导航与路由为插件式预留,新模块可低成本挂载。

## Operating Context

- Windows 10/11 桌面;采用 NSIS 安装包 + GitHub Releases 自动更新(机制参考 To-Do-List:electron-updater、latest.yml 校验);完整便携 ZIP 使用手动替换,打包命令不自动发布。
- 参考实现一:C:\Myself\vibe_coding\To-Do-List(Electron 44 / React 19 / TS;node:sqlite SQLite;托盘、系统通知提醒、AI 建议-确认制)。
- 参考实现二:C:\Myself\vibe_coding\sample_dont_use\deepseek-harness-master(webview 租约内置浏览器、Office→PDF 预览、xlsx 前端解析、node-pty 终端、插件挂载模式)。
- 布局约定:左侧两层导航(左上角 logo);顶栏承载日程与待办速览;右上角个人头像与设置。

## Capabilities and Constraints

已确认:
- 内嵌 To-Do-List 全部功能且保持一致、同步更新(待办/日程双类型、优先级、标签、提醒、事项库、软删除、AI 建议等)。
- 内置 Office 预览/编辑;内置浏览器;为未来 CLI 工具挂载预留。
- 导航分两层;规划中模块:自媒体制作、个人网页设计、个人游戏设计、八字等(本期仅占位入口)。
- 视觉候选方向两套(磨砂玻璃质感 / 沿用 To-Do-List 纸感风格),由用户评审设计稿后选定。
- **AI 能力(2026-09-23 已定,当日修订)**:与 To-Do-List 同源的 Pi Agent Loop(`@earendil-works/pi-coding-agent`),主进程「AI 内核 + 模块工具注册」:各模块按 `AiModuleContribution` 注册工具与上下文;写入一律走「建议-确认卡」事务应用。**AI 与 To-Do-List 完全独立(用户明确要求)**:供应商/模型/Key/启用开关/对话会话均为工作台自有存储(userData 的 ai-config.json 与 chats.db),不读写共享库的 settings/chats 表;仅待办数据(tasks/categories)同库共享。
- **待办同步策略(2026-09-23 已定,当日修订)**:以 To-Do-List 为上游,清单化移植(固定文件清单:contracts/store/任务 UI/编辑器/事项库/提醒/AI 任务工具)+ 移植其测试作为一致性安全网 + 上游 drift 检查脚本 + 「To-Do-List 每次发版触发一次同步」流程;工作台侧不为待办做上游没有的功能,有新功能想法先进上游再同步回来,防分叉。**修订:待办数据与 To-Do-List 跨应用共享同一个库文件**(`%APPDATA%/To-Do-List/tasks.db`,WAL 多进程并发),两边增删改互通;工作台不写该库的 settings/chats 表;上游 schema(user_version)变更的同步因此成为硬性要求(详见 modules/todo/SYNC.md)。长期方案见 docs/TODOLIST-SHARED-KIT-PLAN.md(共享包 ono-todo-kit)。
- **设置模块(2026-09-24 已定)**:三形态高保真比选后用户选定 **方案 C——设置作为第六个大工作台**,复用「图标栏 + 二级目录」两级导航(设计稿 `design/mockups/settings-form-c-workbench.html`)。**M1 已上线**:通用(开机自启/关闭行为/语言/二级导航默认收起)+ AI 助手(自 AiPanel 弹窗整体迁入,面板齿轮变跳转,单一来源)+ 关于(版本/数据目录/应用更新,2026-10-01 接入);**M2 已上线(同日)**:待办与数据(共享库路径/连接状态/结构版本/数据规模,只读,IPC `todo:info`)+ 通知(待办提醒总开关,主进程轮询读取 `remindersEnabled`);**外观已上线(M3,同日更新)**:界面主题三选——mist 雾灰轻雾(默认)/ cool 冷灰凝霜 / warm 暖砂柔雾,渲染层写 `<html data-theme>` 驱动 shell.css 三主题;**个人资料已上线(M3 收官,同日)**:个人资料 = 两形态比选后用户选定方案 A 设置分区(设计稿 `design/mockups/profile-form-a-section.html`,popover 方案 B 落选备查),`profile.name` 驱动头像首字与首页问候,头像点击跳该分区。应用设置存 `userData/app-settings.json`(与 ai-config.json 平级,与 To-Do-List 无关),契约见 `shared/contracts.ts` 的 AppSettingsSchema,存储与测试见 `electron/app-settings.ts`、`tests/app-settings.test.ts`。

开放决策(不臆造):
- 产品正式命名(暂以「个人工作台」占位)。
- Office 编辑深度:预览 + 调用系统应用编辑(轻)vs 内嵌编辑引擎(重),待技术验证后定。

## Brand Commitments

- **视觉方向(2026-09-24 修订,三主题)**:磨砂玻璃材质不变,用户从三张高保真稿中选定 mist「雾灰·轻雾」为默认,以 cool「冷灰·凝霜」与 warm「暖砂·柔雾」作为换肤;原「晴蓝 A+」由 cool 替代,已有 sunny 设置值读入时映射为 cool。三款保留近黑激活/主行动、雾蓝数据色、红色仅逾期/警示,用色场与玻璃透明度区分氛围。切换入口:设置 → 外观(`uiTheme` 字段,存 app-settings.json,默认 mist);token 权威:`src/shell.css` + `DESIGN.md`。顶部日程条胶囊造型、圆角体系 18/14/10、Bahnschrift 数字字体延续不变。
- **导航模型**:左侧图标栏 = 一级「大工作台」切换(首页/文档中心/内置浏览器/终端/创作工坊/生活,可扩展);图标栏右侧列表 = 当前工作台的二级目录,随一级联动。权威文件:`design/README.md` 与 `design/mockups/design-a-glass.html`。
- To-Do-List 设计 token 保留为落选备查方向(`design/mockups/design-b-paper.html`),不再作为默认。
- 用户提供的四张参考图(日程条顶栏、双列双层导航、浅色数据面板、米黄 inventory 风格)是整体布局与气质参考。

## Evidence on Hand

- To-Do-List 完整源码与 DESIGN.md(设计 token 权威):C:\Myself\vibe_coding\To-Do-List
- DSH 源码(内嵌能力参考):C:\Myself\vibe_coding\sample_dont_use\deepseek-harness-master
- 四张参考图存于 ZCode 会话图片缓存。
- 无真实用户数据;界面演示数据均为合成,不得对外宣称或虚构商业信息。

## Product Principles

1. 一站直达:打开即见今日待办与日程,核心信息一次注视可达。
2. 模块可生长:新增工作台模块不改外壳,导航/路由/主题均为插件式预留。
3. 与 To-Do-List 零漂移:内嵌待办的功能、交互、数据结构与原应用一比一。
4. 本地优先:数据本地 SQLite;浏览器/更新等联网能力不绑架核心功能。
5. 克制的表达:工具属性(Operate)优先,风格服务于长时使用的舒适度。

## Accessibility & Inclusion

- 中文为主 UI;正文对比度 ≥ 4.5:1;控件键盘可达且有可见焦点环。
- 尊重 prefers-reduced-motion 与 forced-colors(沿 To-Do-List 先例)。
