# 设计验收索引

## 2026-11-19 · 日程页签、新增事项与通用控件

独立资料目录中的 Windows Electron 窗口实测。日程、待办和会议记录三项页签点击高度均为 44px，选中线为 36×3px。方向键切换后焦点留在新选项。页头新增按钮为 36px，新增弹框初始为 408×174px。「返回」为 44×32px，表单工具为 32×32px，「创建」切换到「创建中…」时保持 84×32px 和标题输入框宽度。

在 1024×680 窗口、125% 缩放下，核对顶栏逾期图标和数字、青瓷强玻璃下的摘要色、日期和时间浮层底部操作。200% 缩放时详细字段在弹框内滚动。主页面、Ctrl+N、顶栏日程和待办入口的 Esc 层级和焦点归还通过。模拟一次保存失败后保留草稿，重试通过真实接口写入一条记录。切页为 240ms 原位淡入，减少动态效果时切页和弹框直接显示，高对比模式仍显示选中线。

72 项相关回归、两套 TypeScript 检查、字阶检查和 Vite 渲染端构建通过。顶栏验收脚本增加紧凑尺寸和保存后归还焦点的断言。

## 2026-11-18 · Bot 名片与卡内侧栏

使用独立数据目录启动本项目的 Electron 窗口，通过本机模拟模型完成对话并保存交付件。核对顶部名片相对正文的中心位置、侧栏分隔线、头像与资料保存、工作台独立开合、右键和键盘菜单、资料库预览与来源任务、1024px 窗口和重启后的草稿。模型请求记录确认，分别选择模型的两个 Bot 实际发往各自配置的模型。

OnO 构建、68 项 Bot 回归和 23 组原有 Electron 界面流程通过。本轮另跑了六组隔离桌面流程，包括定时任务草稿跨页签保留、灵动岛查看工作记录并转到主窗口编辑资料。项目全量测试仍有 19 项失败，逐项在还原本轮改动的临时源码副本复现。

## Bot 原地协作与双方记录（2026-11-17）

final result: passed（六项隔离Electron核心流程），partial（完整P0–P5方案）。主对话原地澄清/确认、同卡补充、单次真实待办写入、原区域双方记录与草稿保留、浮动布局和1060px窄窗通过；宽窗约1586px。工作区矩形前后完全一致，双方记录无横向溢出，页面异常与Vite覆盖层为0。已人工查看浮动及窄窗截图。未改头像或侧栏外框。

Browser plugin not available，采用项目Playwright Electron、独立临时数据、loopback模型夹具。81项相关检查、类型检查、构建通过；扩大检查另有4项旧阅读引用夹具失败，详见[首批实施记录](docs/requirements/shared/ai-assistant/bot-collaboration-implementation-2026-11-17.md)。完整主题/缩放、灵动岛操作、真实模型负载及悬停延迟矩阵仍待验收。截图与report.json位于实施记录列出的bot-implementation目录。

## Bot 动效聚焦执行状态（2026-11-17）

final result: passed（本次头像动效范围；空闲与提醒规则以本节为准，替代下方增强动效版本的空闲循环）。

按用户确认，空闲与排队默认完全静止；悬停反馈 600ms 后自动结束，鼠标留在按钮内不重复播放，点击短弹 480ms。思考、搜索、执行、交接与回复继续使用明显的循环动作；等待协作改为 3.2 秒小幅慢摆。等待用户／资源或中断仅提醒一次，成功完成回弹一次后静止，保留原状态角标。主动执行增加固定实心状态点，等待协作使用空心点；展开侧栏显示真实阶段，折叠时沿用可访问名称和提示。30 秒无操作、隐藏与离屏仍暂停循环，固定状态点和文字保留；减少动态效果时关闭动作。消息、资料与选择器头像不参与动画。

本次生产代码限于 BotAvatar.tsx、bot-avatar-motion.ts、bot.css 与 App.tsx 的侧栏阶段文案；未修改任务协议、运行时或数据。npm run verify 通过字阶检查、两套 TypeScript 和前后端构建。该结果不代表并行架构任务或全库测试均通过。

Browser plugin not available，使用项目现有 Playwright Electron、独立测试资料、本机假模型与专用 5191 开发服务。DPR1 为 16/16，DPR2 为 15/15：真实思考／回复、后台执行、委派父子状态、等待用户、成功仅一次、取消／失败、空闲与排队无循环、有限悬停／点击、减少动态效果、可见性通知与真实离屏观察、图形头像实际位移均通过。DPR1 另等待 30.5 秒验证休息与唤醒，暂停后状态标记仍可见。两组页面和控制台错误均为 0。

补查真实宽窗口：DPR1 内容视口 1800×1000、DPR2 为 1799×1000，分别通过 3/3 检查。经典／悬浮的展开阶段文字实际可见，折叠后隐藏；42px 头像、54px 选中框及头像坐标保持。减少动态效果下实心／空心标记仍可区分。已直接查看原生截图；sidebar-state-focus.gif 由 DPR1 真实委派流程的 40 帧原生侧栏截图编码，保留采样时序，未缩放或重画。

验证修正与边界：最初测试服务受沙箱回环限制，改用本任务专用服务后可达；并行架构改动导致前后端 syncChat 版本短暂不一致，重新构建后恢复，未为此修改架构代码。悬停测试最初命中圆角外部，修正为按钮中心后通过。可见性使用模拟 document.hidden 与 visibilitychange，离屏用测试位移触发真实 IntersectionObserver；不等同于操作系统最小化实测。工具短阶段由生产组件受控画廊覆盖，不将其称为真实工具任务同时运行。未调用真实模型、修改真实账号资料或发布安装包。

静态工具：premium strict audit 与上一轮的文件／规则／消息集合相同，仍有 22 项原有问题；design.md lint 为 0 错误、1 个原有无 YAML 警告。git diff --check 通过。DESIGN.md、UX-CONTRACT.md、头像规范与三份外观方案均同步最新规则；CMO 仍仅更新设计实施输入。

证据目录：C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-motion-focus-2026-11-17/，含 1x.json、2x.json、wide-1x.json、wide-2x.json、premium-audit.json、原生截图、wide-recording.json 与 sidebar-state-focus.gif。脚本为目录上级 bot-motion-focus-check.mjs 和 bot-motion-focus-wide-check.mjs。

## Bot 分状态与增强动效（2026-11-17）

final result: passed（本次动效与状态范围；取代下一节的轻幅版本）。

按用户要求参考 DS-Bot，增大主体倾斜、跳动和压缩拉伸，42px 头像可见约 3–5px 的主体位移；思考、查找资料、执行、交接、回复分别表达。等待协作慢摆，等待用户／资源或中断短跳两次并保留问号提示；真实成功后回弹 1.1 秒。完成标记初次加载、重复刷新以及取消／失败都不触发成功回弹。空闲角色按身份错开节奏，悬停移眼、歪头，点击短弹，30 秒无输入暂停循环。消息正文、资料和选择器头像保持静止。

状态接线：BotRuntime 的思考、回复和工具回调更新 BotStore 内存 activity，只在阶段变化时通知；不修改任务 revision、时间戳或数据库结构。BotCard.runningCount 和等待计数保持；正在运行优先于旧等待任务。成功标记仅来自 completed 任务。Bot Host 合约更新为 v6，沿用空闲时替换旧 v1–v5 Host 的保护；开发版需要完整重启 npm run dev 才载入后台状态代码。

验证：npm run verify 通过字阶检查、两套 TypeScript 和前后端构建。四份相关测试 bot-avatar、bot-host、bot-activity、bot-thinking 共 26 项通过；首次沙箱运行中两项本机模型用例受回环网络限制失败，允许回环后单独复跑 bot-thinking 两项通过。覆盖阶段事件去重、状态优先级、任务版本不变、恢复／重试清理旧阶段、真实 thinking→searching→replying 和成功标记。不是全库测试结论。

Browser plugin not available，使用项目现有 Playwright Electron，在 http://127.0.0.1:5186/ 与全新隔离资料、本机假模型下验证。最终 DPR1 为 15/15，DPR2 为 14/14，页面错误和控制台错误均为 0。实测真实思考／回复、切换 Bot 后后台继续、委派父子状态、待确认、完成仅一次、失败／取消、鼠标与键盘、减少动态效果、导航经典／悬浮与展开／折叠、1024×600 窗口。42px 头像、54px 点击框和导航坐标保持。DPR1 另等候 30.5 秒验证休息与输入唤醒。图形头像实际路径在动画组内，有主体位移且没有角色眼睛。

边界：工具短阶段的各动作由生产 BotAvatar 受控属性画廊检查；真实运行流程另由前述本机模型验证，不把画廊当作八个后台任务同时执行。可见性检查通过模拟 document.hidden 与 visibilitychange；离屏通过测试专用位移触发真实 IntersectionObserver，未声称操作系统最小化或默认八项滚动均已实测。未实测已安装版升级或忙碌旧 Host 的版本接替。源码参考 DS-Bot 的 mark.js、styles.js、motion-rest.js，未运行对方应用，也未引入其依赖或角色资产。

静态工具：premium strict audit 仍为原有 22 项问题，未标记本次动效新增行；design.md lint 为 0 错误、1 个原有无 YAML 警告。保留原 npm 镜像配置和构建大分块警告，不扩大修改范围。DESIGN.md、UX-CONTRACT.md、头像规范与三份外观方案已同步；CMO 仅更新实施输入，不代表 CMO 已实现。

证据目录：C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-motion-v2-2026-11-17/，含 1x.json、2x.json、premium-audit.json、原生窗口截图和 state-motion.gif。检查脚本为目录上级 bot-motion-v2-check.mjs；动图由 bot-motion-v2-record.mjs 在生产组件画廊逐帧捕获后编码，录制时长保留在 recording.json。

## Bot 侧栏执行动效（2026-11-17）

final result: passed（本次目标流程）；项目全量静态审计仍有原有问题，详见本节边界。

用户确认“头像神态”。检查 DS-Bot 的 mark.js、styles.js、sidebar.js 与 motion-rest.js 后，采用真实任务驱动的 SVG 分层动作思路；ONO 沿用自己的头像形状、色板、状态和 CSS，不引入外部角色资产。BotCard.runningCount 仅统计 running，App 通过原 task 通知更新侧栏，选中态独立。角色轻微呼吸、眼神轻移并间歇眨眼，图形仅呼吸；消息记录、资料和选择器静止。等待用户／其他 Bot／资源、排队、完成、失败、取消和中断停止忙碌循环。窗口可见性通知与 IntersectionObserver 控制暂停，减少动态效果关闭动画。修正暂停选择器优先级，确保眼睛和主体都暂停。

验证命令：npm run verify；node node_modules/tsx/dist/cli.mjs --test tests/bot-avatar.test.ts tests/bot-host.test.ts。前者通过字阶检查、两套 TypeScript 与前后端构建，后者 22/22 通过；新增用例覆盖委派中的父子 Bot、队列、各等待／终止状态与恢复执行。不是全量测试套件结论。

Browser plugin not available，使用本地 Playwright Electron；入口 http://localhost:5174/，全新隔离资料和本地假模型，不连接真实账号。1400×1000、1024×600，DPR 1／2 各 11/11 检查通过：页面身份／非空／无错误覆盖；42px 头像和 54px 点击框；真实发送驱动动作且消息头像静止；眨眼形变；切换选择与待确认角标独立；经典／悬浮、展开／收起不改变头像坐标；减少动态效果；可见性通知暂停／恢复；完成；图形与取消；失败；真实 IntersectionObserver 离屏与返回。页面错误和控制台错误均为 0。截图已直接检查，选中底框、名字、角标、头像和导航布局保持。

边界：Playwright Electron 的窗口自动化设置使 document.hidden 在原生隐藏／最小化后仍保持 false；可见性监听使用模拟 visibilitychange 与 hidden 值验证，不能视为普通启动后的操作系统隐藏实测。离屏检查通过测试专用位移把头像移出视口，再复位，使用真实 IntersectionObserver，不声称默认八个联系人必然出现滚动条。未实测已安装应用升级或旧 v4 Host 在忙碌期间接替；v5 继续复用空闲升级保护，不强制终止旧任务。

静态工具：缓存中的 @google/design.md 0.4.0 lint DESIGN.md 为 0 错误、1 个原有无 YAML 格式警告；premium strict audit 为 22 个既有问题（原生 select 归属未声明、无动作按钮与表单 noValidate／textarea resize 静态规则），均不在本次新增头像／状态代码中，本轮不扩大范围修理，不能据此宣称全项目静态审计通过。

DESIGN.md、UX-CONTRACT.md、Bot 头像方案与三份外观方案已同步；CMO 仅补充设计输入。证据位于任务视觉目录 bot-motion-2026-11-17/1x.json、2x.json、premium-audit.json、sidebar-working.gif 及两种比例截图；测试脚本为同目录上级 bot-motion-check.mjs。


## Bot 加号引用弹层布局（2026-11-17）

final result: passed

原布局把资料类型下拉放在 `.bot-compose` 内，资料列表则单独 portal 到上方，打开“＋”会额外撑高输入卡片。现将 Bot 允许的资料类型通过 `AiReferencePicker` 的可选类型参数传入，在弹层顶部复用 `Segmented`；固定类型 Bot 显示原类型标题。旧助手未传类型参数时保持原展示。Bot 弹层最大 420×340px，水平边界不超出输入卡片，只有资料列表内部滚动；普通用途说明改为次要文字色。修正头部关闭按钮选择器对嵌套类型按钮的误匹配，保留完整点击区域；已处理子控件的键盘事件不再被列表导航接管。

`npm run verify` 通过。当前 5174 开发服务使用独立资料、25 条示例事项与两篇示例博文，在 DPR1／2 下各通过 8 组检查：打开前后输入卡片高度与位置一致，420×340px 长列表滚动，状态／类型筛选与空态，弹层内来源切换、博文搜索与多选确认，键盘来源切换，事项点击即选／关闭，窄短窗及 Escape 焦点／草稿保留，浮动与灵动岛边界。窄栏弹层宽 318px，灵动岛为 378px，高度均不超过 340px；所有类型按钮点击宽度至少 32px。两组页面错误均为 0。已直接检查最终截图，输入卡片不再出现多余的资料类型行；截图仅为隔离示例数据，没有调用模型或修改真实资料。DESIGN.md、UX-CONTRACT.md 与三份外观方案同步此规则；CMO 仍仅更新实施输入。

额外运行既有参考／选择器／导航测试共 23 项：首次 19 项通过，1 项本机模拟模型请求在沙箱回环限制下失败，允许回环网络复跑后通过；剩余 3 项失败来自 `tests/ai-reference.test.ts` 仍以旧 `workspace:life` 作为阅读／命理的共同工作台标识，与当前领域拆分不符。这些用例不导入本轮修改的 UI 组件，本轮未修改其领域校验、后台读取或测试期望，也未将它们记为通过。选择器组件与工作台导航两份测试通过。本节的 passed 指当前布局与交互范围，不代表全库测试通过。

证据：[DPR1](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/reference-popup-2026-11-17/1x.json)、[DPR2](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/reference-popup-2026-11-17/2x.json)、[最终实机截图](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/reference-popup-2026-11-17/2x-parallel-560.png)。Browser 插件未提供本次 Electron 能力，使用项目既有 Playwright Electron 路径；未将本次局部检查表述为全量 UI 回归。

## 工作详情底部入口精简（2026-11-17）

final result: passed

按用户标注移除嵌入式任务详情底部“在对话中继续”，并删除其专用空白样式；回对话统一使用顶部“返回对话”，不自动添加任务回复关联。任务确认、继续执行、取消、重试和子任务导航保持。DESIGN.md、UX-CONTRACT.md 和三份外观方案同步最新入口规则，既有 UI 回归脚本改走顶部返回并核对未添加回复目标。

`npm run verify` 通过；当前 5174 开发服务的隔离 Electron 检查通过：底部入口不存在，顶部返回保留草稿，固定目录、紧凑行、长标题、键盘、窄栏和浮动正常，页面错误为 0。未将本次局部检查当作全量回归通过。[实测记录](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/work-detail-return-2026-11-17/1x.json)。

## 工作进度目录固定宽度与紧凑行（2026-11-17）

final result: passed

工作进度双栏的左侧目录从 29% 比例改为固定 280px，右侧占剩余空间；交付件布局保持原规则。工作目录条目统一 72px 高，标题按原 body 字阶最多两行，状态与时间单行；列表省略不改写任务数据，原生完整标题提示与右侧全文均保留。选择、分类、普通聊天折叠、键盘进入详情、窄栏逐页返回和草稿沿用原逻辑。DESIGN.md、UX-CONTRACT.md 及三份外观方案同步该规则，CMO 文件仍仅为实施输入。

`npm run verify` 通过。当前 5174 开发服务使用独立复制的测试资料，在 DPR1／DPR2 下分别验证 1678、1280、1024px 窗口、手动 340px 对话栏、浮动、强制颜色与减弱动效；三组宽窗的目录均为 280px，全部可见条目均为 72px，无横向溢出，长标题最多两行、元数据一行。键盘选中后右侧显示完整标题；窄栏返回恢复原条目焦点，回对话后草稿保留。两组页面错误均为 0。已直接查看实机截图并对照用户提供的长标题页面，没有通过缩小字号压缩内容。未修改真实用户数据或调用模型。

证据：[DPR1 测量](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/progress-density-2026-11-17/1x.json)、[DPR2 测量](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/progress-density-2026-11-17/2x.json)、[开发版实机](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/progress-density-2026-11-17/1x-wide-1024.png)。沿用项目的隔离 Playwright Electron 检查，没有将本次局部检查表述为全量回归。

## Bot 输入卡片焦点与附件入口（2026-11-17）

final result: passed

修正前，文字区 2px 焦点描边外偏 3px，而工具栏紧邻文字区底边，描边覆盖发送按钮顶部。现在焦点描边沿整块 `.bot-compose` 外沿绘制，文字区不再单独描边；输入、工具栏和按钮的实际位置与尺寸保持。附件入口改用 18px Plus 图标，沿用原参考内容选择、禁用和草稿逻辑，引用标签内的回形针保留。

`npm run verify` 通过，包含 23 个 CSS 字阶检查、两套 TypeScript 和 Vite／Electron 构建。当前 `http://localhost:5174/` 隔离 Electron 在 DPR2 下验证 560px／340px 并排、浮动和灵动岛：文字区无内层焦点描边，外沿焦点可见，发送按钮没有覆盖，32px 加号入口不溢出；加号打开原参考内容选择器，Escape 关闭后恢复入口焦点，未发送草稿保留。页面错误为 0。已直接对照修改前后原生截图；不使用真实资料或远程模型，未将本次局部检查表述为全量回归。

证据：[测量结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/composer-focus-2026-11-17/after.json)、[修改前](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/composer-focus-2026-11-17/before-parallel-560.png)、[修改后](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/composer-focus-2026-11-17/after-parallel-560.png)。Browser 插件未提供本次 Electron 能力，沿用项目的 Playwright Electron 路径。

## Bot 工作记录默认入口修正（2026-11-17）

final result: passed

用户反馈的开发版单栏已复现：当前 main 的 `npm run dev` 运行在 `http://localhost:5174/`，并排对话可用宽度只有 340–560px，低于目录＋详情的 640px 内容断点；修正前实测 560px，详情被隐藏。页头已是新版，问题来自默认进入路径。此前工作记录验收先手动收起了工作区，漏验普通并排对话直接进入；本节补正该覆盖缺口，不把原宽态通过等同于默认入口通过。

`App.tsx` 将临时阅读状态与手动收起状态分开，`BotPanel.tsx` 在布局阶段通知进入／退出；工作进度、交付件进入时临时展开阅读区，返回对话恢复原布局，手动工作区开关仍优先。切换 Bot、收起助手、浮动模式以及灵动岛外置交付件预览继续使用原路径；复用既有原生工作区显示与激活控制，没有重挂原生内容。`bot.css` 仅关闭主对话浏览器滚动锚点，防止宽度恢复时干扰既有阅读位置恢复。三份外观方案（含 CMO）、DESIGN.md、UX-CONTRACT.md 及源图索引同步此规则；CMO 只更新实施输入。

### 当前开发服务实测

以下均从普通并排对话进入，没有预先手动收起工作区。使用隔离 Electron 资料连接现有 5174 开发服务，没有操作用户真实资料。原生截图不进行尺寸归一化。

| 内容视口 CSS px | DPR | 对话原宽 → 阅读区宽 | 目录／详情 | 返回阅读位置 | 结果 |
| --- | --- | --- | --- | --- | --- |
| 1678×1003 | 1 | 380 → 1438px | 同时可见 | 320 → 320px | 8/8 |
| 1677×1003 | 2 | 560 → 1437px | 同时可见 | 320 → 320px | 8/8 |
| 1023×1003 | 2 | 380 → 925px | 同时可见 | 320 → 320px | 8/8 |

三组均验证：默认工作进度、返回宽度／草稿／滚动恢复、交付件列表与预览及来源任务返回、手动覆盖、原先收起的工作区、切换 Bot、浮动切换、灵动岛指定交付件预览与关闭。页面身份及非空内容正确，无 Vite 错误覆盖层，报告页面错误为 0。已对照修正前后截图，原有主题、字阶、状态色和共享页头保持；默认进入已显示确认的目录＋详情。示例数据仅用于隔离验收。

- `npm run verify` 通过：23 个 CSS 字阶检查、两套 TypeScript、Vite／Electron 构建；Windows 换行规则的 `git diff --check` 通过。
- 草稿、工作分类与耗时共 16/16 测试通过。首次沙箱运行中两项耗时测试没有收到本机模拟流，允许回环网络的隔离复跑全部通过；未修改耗时代码来迎合测试。
- `tooling/bot-ui-pilot.mjs` 最终 23/23 通过，页面错误为 0，覆盖确认写入、浮动／窄栏、主窗口／灵动岛、Host 重启、原生浏览器及动效。脚本按新的宽态返回路径调整，手动最小宽度检查仍保留。一次中途截图超时后，隔离测试改用原生窗口捕获并关闭后台遮挡节流，完整重跑通过；未跳过失败项。
- Browser 插件未提供本次 Electron 能力，使用项目既有 Playwright Electron 路径。未额外安装依赖；Premium Python 静态审计与 DESIGN.md 第三方 linter 沿用环境不可用的边界，不计为通过。此次本地修正不包含安装包发布。

证据：[修正前默认入口](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-default-entry-2026-11-17/before-2x.json)、[开发版 DPR1](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-default-entry-2026-11-17/after-1x-380-1678.json)、[开发版 DPR2](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-default-entry-2026-11-17/after-2x-560-1678.json)、[窄窗 DPR2](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-default-entry-2026-11-17/after-2x-380-1024.json)、[完整 UI 回归](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-default-entry-2026-11-17/full-pilot-verified/report.json)。开发版截图：[默认工作进度](design/bot-work-records-2026-11-17/runtime-default-entry.png)、[默认交付件预览](design/bot-work-records-2026-11-17/runtime-default-preview.png)。


## Bot 工作进度与交付件（2026-11-17）

final result: passed

本轮根据用户确认落地两页：工作进度采用[目录＋详情稿](design/bot-work-records-2026-11-17/progress-selected.png)，交付件组合采用[空态](design/bot-work-records-2026-11-17/deliverables-empty.png)、[日期清单](design/bot-work-records-2026-11-17/deliverables-list.png)和[宽窗预览](design/bot-work-records-2026-11-17/deliverables-preview.png)。工作进度源图中的旧页头按最新确认统一为 `返回对话 | 工作进度  交付件`，保留原工作区开关。实现位于 `BotPanel.tsx`、`BotWorkViews.tsx`、`BotTasks.tsx` 及 `bot.css`，未迁移任务协议或数据库。

### 对照与修正

已把每张源图与对应实机截图放在同一次视觉输入中比较，另检查了窄栏页头、键盘返回、浮动侧面板与强制颜色状态。首轮与后续对照发现并修正以下 P2，修正后重新捕获验证：

- 页头分隔线贯穿整行，改为居中的短分隔；两个内容页保持同一 56px 几何及返回位置。
- 默认交付件清单缺少日期层级，补为本地日期分组，今天单独标识，条目继续使用单条分隔。
- 中等宽度目录挤压标题及原件图标，目录最小宽度改为 240px，行最小高 64px，并调整内距；不通过缩小字号挤入。
- 来源任务返回缺少明确焦点恢复，保存并恢复原触发按钮，同时保留预览选择与原滚动；原生脚本检查焦点返回。
- 空态标题过弱、图标缺少底面且位置偏低，改用共享 24px 字阶、主题图标底面和更紧凑的上方间距，并保留源图中的两层说明。

未遗留 P0/P1/P2。源图没有提供 DPR，因此不将位图像素直接当 CSS px；实机保留共享字号和字族。对照采用原生 DPR2 内容截图，按源图画幅等比归一化；不改变运行时布局来拼合截图。归一化前后的尺寸均记录于 `shipping-2x.json`，原始 PNG 以 `-native.png` 保留。

| 对照状态 | 源图像素 | 实机内容 CSS px / DPR | 原生像素 | 归一化结果 |
| --- | --- | --- | --- | --- |
| 工作进度 | 1568×1003 | 925×592 / 2 | 1850×1184 | [1568×1003](design/bot-work-records-2026-11-17/runtime-progress.png) |
| 交付件清单 | 1568×1003 | 925×592 / 2 | 1850×1184 | [1568×1003](design/bot-work-records-2026-11-17/runtime-deliverables-list.png) |
| 交付件预览 | 1487×1058 | 925×658 / 2 | 1850×1316 | [1487×1058](design/bot-work-records-2026-11-17/runtime-deliverables-preview.png) |
| 交付件空态 | 1568×1003 | 925×592 / 2 | 1850×1184 | [1568×1003](design/bot-work-records-2026-11-17/runtime-deliverables-empty.png) |

### 五项视觉检查

| 范围 | 结论与约束 |
| --- | --- |
| 字体与层级 | 沿用 Bahnschrift／Segoe UI／微软雅黑 UI 回退及共享 24/18/16/14/13/12px 字阶，正文复用 AiResponse；没有从生成图另建字体系统。目录标题与默认清单标题层级分开，实际长标题可换行 |
| 布局与间距 | 内容容器至少 640px 时目录＋详情，目录为 29% 且至少 240px；窄栏顺序进入详情，返回入口始终可达。空态位于上方阅读区，列表、工作结果与正文不重复套玻璃卡片 |
| 配色与材质 | 继续消费 appearance.css 的主题与材质变量。三档材质测得页头几何一致；完成用既有青绿色，等待确认保留中性／主色，失败与中断用危险色，状态均有文字。未另设页面背景来模拟源图 |
| 图标与清晰度 | 复用 Phosphor 的文档、勾选、时钟、返回和原件图标；图标、文字及玻璃仍由原生组件渲染，没有使用整张高保真作为页面，也没有新增伪造图片资产 |
| 内容与状态 | 使用真实 API 和独立测试资料中的持久化记录；日期、产出 Bot、类型、来源任务和正文关系均可回查。工作区引用没有正文时说明引用关系；图中的示例页脚不进入产品 |

共享字阶、真实 Bot 名称／时间、普通聊天折叠入口、工作区开关以及原 Markdown 项目符号属于明确的产品约束，与概念稿的不同不计为待修视觉错误。CMO 配套方案只更新实施输入，未据 ONO 验收推断 CMO 已实现。

### 运行检查

- `npm run verify` 通过：23 个 CSS 的字阶检查、两套 TypeScript 与 Vite／Electron 构建；最后状态色修正后构建再次通过。`git diff --check` 按 Windows 换行规则通过，新工作视图无尾随空白。
- 14/14 既有任务分类／草稿测试通过，覆盖普通聊天归档、待确认分类、发送幂等、保存失败、中文输入和跨表面草稿。
- 项目现有 `tooling/bot-ui-pilot.mjs` 按新入口更新后 23/23 通过，包含真实 UI 确认写入、来源与预览、普通聊天折叠、失败重试入口、340px 并排页头、主窗口／灵动岛、Host 重启、原生浏览器授权与浮动动效。
- 最终专项：DPR1 11/11、DPR2 12/12 通过，包含空态、日期清单、宽窗双栏、窄栏列表→详情→返回、来源任务与焦点恢复、打开原件、对话草稿／滚动恢复、待确认操作、浮动面板、三档材质、减弱动效和强制颜色。两次页面错误均为 0；DPR2 多一项源图画幅对照。
- 全部 Electron 实测使用 `WORKBENCH_TEST_DATA_DIR` 和 `WORKBENCH_ISOLATED=1`，没有访问真实用户资料；回归模型由本地模拟服务提供，未将其计作真实远程模型质量验收。

证据目录：[专项 DPR1](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-records-2026-11-17/shipping-1x.json)、[专项 DPR2](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-records-2026-11-17/shipping-2x.json)、[23 项 UI 回归](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-work-records-2026-11-17/full-pilot-final/report.json)。窄栏阅读见[工作详情](design/bot-work-records-2026-11-17/runtime-progress-narrow.png)与[交付件预览](design/bot-work-records-2026-11-17/runtime-preview-narrow.png)。本轮在本地 main 完成，没有发布安装包。

## Bot 侧栏两态选中框对齐（2026-11-17）

final result: passed

用户指出折叠与展开的选中框高度、左缘不同。修改前实测：折叠 54px 高、距侧栏左缘 6px；展开常规为 64px／12px，短窗为 55px／12px。以原折叠框为基准，将 `src/views/bot.css` 的联系人入口统一为高 54px、左右各外扩 6px并内距 6px，折叠 54×54px、常规展开 196×54px，沿用 14px 圆角。删除折叠、窄窗重复几何及旧短窗按钮高度覆盖；常规 64px、短窗 55px 行位保持。

`npm run verify` 通过，包含 23 个 CSS 的字阶、两套 TypeScript 及 Vite／Electron 构建。隔离 Electron 在 DPR1／DPR2 下各验证 6 种场景、12 个端态：经典／悬浮常规、经典／悬浮短窗、并排常规和窄窗自动图标态。所有正常颜色状态均为高 54px、左内距 6px，8 个头像的 42px 尺寸与修改前横纵坐标保持；动画共抽样 615 帧，选中框高度、左缘及头像位置保持。右键资料开关、焦点恢复、减弱动效和强制颜色检查通过，页面错误均为 0。强制颜色沿用原 1px 系统边线，按同一颜色状态比较两态，未将系统边线差异当成普通主题坐标。

已在同一视觉输入中对照修改前后、同尺寸的折叠与展开截图，核对选中框边界、头像和文字对齐，无遗留 P0/P1/P2。证据：[DPR1 结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-nav-alignment-2026-11-17/after-1x.json)、[DPR2 结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-nav-alignment-2026-11-17/after-2x.json)、[折叠截图](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-nav-alignment-2026-11-17/after-2x-collapsed.png)、[展开截图](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/bot-nav-alignment-2026-11-17/after-2x-expanded.png)。设计规范与三份外观方案同步该尺寸；未将待讨论的工作进度／交付件高保真作为本轮代码改动。

## 八类页签与标题条统一（2026-11-17）

final result: passed

范围为用户确认的[八类界面总览](design/header-unification-2026-11-17/overview-v1.png)，源图 1086×1448。它是组件对照板，不是新增的两列工作台页面；按各组件主体比较排布、层级和状态，保留运行时真实内容、现有外壳与浮层边界。已在同一视觉输入中打开源图及最终实机截图，检查宽屏、窄工作区、键盘焦点和强玻璃状态。资料浮层对照「资料」选中状态，读取记忆后等待忙碌结束再以 Home 返回，避免将不同面板误作同态比较。

运行时由 `src/ui/navigation.css` 统一短下划线与标题尺寸，`Segmented` 的内容变体沿用原选择与方向键。工作区页面导航保留 aria-current；命理和资料保留 tablist／panel 关联，命理补齐左右键、Home／End 和单个 Tab 停留项。模式筛选和可关闭文档维持原控件。三份外观方案、DESIGN.md 与 UX-CONTRACT.md 已同步本次确认；CMO 仅更新实施输入，不计为 CMO 已实施或验收。

### 视觉对照与修正

| 检查面 | 结论与证据 |
| --- | --- |
| 字体 | 复用现有字体、24px 页面／18px 局部标题及 14px 内容页签；公共工作区行内页签使用原 13px 控件字阶。没有扩大应用全局字号 |
| 间距与布局 | 标题卡最小 80px、12px 20px 内距，真实问候或说明自然增高；项目条实测三页均为 64px。博客目录与编辑标题同高，宽屏横向分组，窄窗换行后所有操作在本容器内可达 |
| 颜色与材质 | 页签复用 ink／acc／hairline，标题继续由 appearance.css 驱动。八主题×三材质的 24 组绘制检查中，命理页头几何保持一致；未复制独立玻璃配色 |
| 图片与图标 | 使用当前 BotAvatar、原项目封面与 Phosphor 图标；无新贴图、占位图片或图标重绘。源板未展示的资料浮层下半区继续沿用原内部滚动 |
| 文案与状态 | 保留原命例、状态、路径、说明和动作；移除单页重复导航与编辑器平台眉题。浏览器操作记录、草稿与命理样例仅存在于隔离测试目录 |

首轮发现并修正：选中项悬停仍出现胶囊底色（调整选择器优先级，所有内容组实际计算背景透明）；命理出现双分隔（保留一条）；两字页签的指示线被限宽为 34px（统一 36×3px）；三个项目标题条高度不一（统一 64px）；博客左侧目录标题仍为旧高度（与编辑标题对齐）。修正后重新构建、实测、截取并对照；未遗留 P0/P1/P2 视觉问题。键盘截图中的焦点环是预期状态。

### 验证结果

- `npm run verify` 通过：23 个 CSS 字阶检查、两套 TypeScript 检查和 Vite／Electron 构建；最终 CSS 修正后再次完成该命令。`git diff --check` 按项目 Windows 换行规则通过。
- 35/35 专项测试通过：签到 UI、工作台归属与导航、看板布局、媒体实例保留、外观保存与自动光影、日程周导航。未将此前全库测试的历史失败计为本轮通过。
- 隔离 Electron 在 1568×1003、1024×680、DPR1 和 DPR2 两种显示密度下各通过 15 组流程：页面身份／非空、签到方向键、日周模式保留、命理键盘及星盘内容、阅读标题、草稿跨页保留、AI 测试任务／记录、项目控件、浏览器新增与关闭标签／操作记录、资料页签、灵动岛设置、24 组材质主题几何、窄工作区／并排助手、减少动效和强制颜色。两个最终报告的页面错误与控制台警告均为 0。
- 报告与全部截图：[DPR1 结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verification-1x.json)、[DPR2 结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verification-2x.json)。Browser 插件未提供本次 Electron 能力，使用项目已有的 Playwright Electron 路径及专用 userData，未操作真实账号或调用模型。

代表性截图：[工作区与测试任务](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-ai-tasks.png)、[命理](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-bazi.png)、[资料浮层](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-bot-profile.png)、[编辑器](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-blog-editor.png)、[网页任务记录](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-browser-record.png)、[窄窗并排](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/header-unification-implementation-2026-11-17/verified-2x-parallel-narrow.png)。

辅助工具边界：Premium Python 静态审计因环境没有可用 Python 未运行；第三方 DESIGN.md linter 未在离线缓存中，未额外安装。上述结论来自项目检查、实际交互与源板对照，不宣称第三方静态审计或完整读屏合规。此次仅完成 ONO 本地界面调整及方案同步，未执行发布操作。

## 每日签到单行页头定稿（2026-11-17）

final result: passed

用户选定第一张单行下划线方案，视觉依据已保存为 [selected.png](design/checkin-header-2026-11-17/selected.png)，原图 2172×724，主体约 2096×156；背景留白只用于概念展示。实现仅调整 CheckinView 的页头结构及 checkin.css 对应样式，复用原 Segmented、按钮事件和主题材质，未修改签到、授权、记录和自动签到配置逻辑。

对照证据：1568×1003、DPR1 的 [完整页面](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/after-wide.png) 与 1444×80 的 [页头局部](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/after-header.png)；接近参考主体宽度的 CSS 1172×724、DPR2 场景输出 [2094×160 页头](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/visual-header.png)。已在同一视觉检查中打开源图与最终局部图，按主体而非背景留白比较；同时检查 [1024×680 并排助手](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/after-narrow.png) 的完整布局。

五项视觉检查：

- 字体：沿用工作台字体与 24px 标题、14px 页签、13px 操作字阶。图标返回、主标题、选中页签及次要操作层级清楚；概念稿放大的字面与按钮未直接变为全应用字号，这是沿用产品字阶的明确适配。
- 布局：返回、标题、分隔、文字页签和操作在宽屏同行并居中；页头高 80px。窄工作区操作换到下一行，高 118px，控件完整可见且无水平溢出。取消大块胶囊底面，下划线居中位于选中文本下方。
- 颜色与材质：主色、次级文字、细边线、控制底面及选中态使用既有 ink／acc／hairline／control 与公共材质映射，没有另建局部主题。
- 资产：返回、时钟、刷新和说明均使用现有 Phosphor 图标；无新增绘制的图标、栅格占位或变形图片。选定稿只作为设计依据，不作为界面截图贴图使用。
- 文案：保留每日签到、签到概览、签到记录、自动签到、刷新状态与说明入口；返回按钮通过 aria-label 和 title 表达「返回总台」。未添加示例奖励、指标或新业务入口。

验证：`npm run verify` 的字阶、两套 TypeScript 检查和构建通过；现有 `checkin-ui` 与 `workspace-checkin-navigation` 共 3 项测试通过。隔离 Electron 在 DPR1／DPR2 下均验证了单行布局、控件边界、页签方向键与真实内容切换、下划线选中态、说明弹框、自动签到设置及返回每日签到、返回总台后重进；页面错误 0。未触发真实领取或账号授权。首次配置引导曾挡住首轮截图，已在测试实例中收起后重新完整验收，未修改生产引导逻辑。

无待修复的 P0／P1／P2。参考未定义窄工作区，按现有容器宽度自动折行作为响应式适配；未进行完整读屏合规审计。Browser plugin not available，使用项目既有隔离 Playwright Electron 流程，结果为 [普通清晰度](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/after.json) 与 [200% 对照](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-inline-header/visual.json)。本节替代下方旧两行压缩方案的当前样式结论，历史证据保留。

## 每日签到页头压缩（2026-11-17）

final result: passed

本次仅修改 `src/views/checkin.css` 四处页头规则：返回入口与标题改为同行，上下内距由 20px 减为 12px、标题与页签间距由 18px 减为 8px，页签最小高度由 36px 减为 32px。标题字号、按钮、页签内容、卡片材质及业务事件保持原有实现。

构建与 22 个 CSS 文件字阶检查通过。隔离 Electron 中，1568×1003 与 1024×680 并排助手两种场景的页头均由 161.59px 降至 102.14px，减少约 37%；返回与标题垂直居中，右侧三项操作可见，无横向溢出。使用方向键切换签到概览／记录后，实际内容与选中状态一致，页面错误为 0。已查看宽屏局部及窄工作区截图；未触发真实签到、刷新或账号授权。

Browser plugin not available，沿用项目隔离 Playwright Electron 工作流。证据位于 [验收结果](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-compact-header/after.json)、[压缩前](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-compact-header/before-header.png)、[压缩后](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-compact-header/after-header.png) 与 [窄工作区](C:/Users/henry/.codex/visualizations/2026/11/15/01a1dddb-9256-79b0-ad61-ca21dc912b70/checkin-compact-header/after-narrow.png)。

## 日程与会议纪要首版（2026-11-17）

final result: passed

此结果限定为本次日程／纪要范围。本地实现完成，未发布。设计依据为 `docs/design/schedule-minutes-optimization-2026-11-17.md` 及 `design/schedule-notes-2026-11-17/high-fidelity/` 下总览 v2、详情 v5、提醒 v2。已在 1568×1003 同尺寸查看设计稿和实际截图，核对连续面板、通顶目录、左侧返回、正文层级、紧凑日期、提醒位置及真实状态；1024×680 并排助手下核对单栏正文、目录展开、独立滚动和提醒操作。

实现沿用现有壳的顶栏、Bot 头像、字阶和主题颜色；左侧目录按方案取 240px，标题 24px、正文 16px，其余使用共享字阶。高保真的放大壳和示例计数不作为全局重做目标；实机使用当前 Bot 系统、真实本地日期和隔离样例数据。首版提供手动纪要、可选模板、基本格式、自动保存、正文搜索、手动行动转待办及来源回跳，AI 整理、音频和结构化负责人留在后续范围。

验收：

- `npm run verify` 通过：22 个 CSS 文件字阶检查、两套 TypeScript 检查及 Vite／Electron 构建。
- 日程、纪要草稿、纪要存储、共享库和日期控件专项 28/28；最后补强的超长本地稿恢复用例又单独复跑草稿测试 7/7。涵盖中文组合输入、慢响应串行保存、失败重试、本地恢复、版本冲突、共享 schema 不变、日程删除恢复及行动去重／回滚。
- `node tooling/meeting-notes-pilot.mjs` 的 12 项实机流程全部通过、页面错误 0。完成创建／编辑弹框复用、富文本粘贴和格式工具、超过原 5000 字备注的独立纪要、跨会议保存、完成会议搜索、真实待办转换、原完成确认、来源跳转、返回日期保留和真实进程重启恢复。
- 提醒前后主内容几何完全一致：宽窗 x107/y255/w1413/h707；窄工作区 x489/y266.28125/w480/h899.609375，后者由工作区内部滚动承载。窄窗提醒弹层位于业务卡片上方，点击可打开对应纪要，不插入中间常驻行。
- 三档材质几何一致，实际计算值为纯色 `none`、普通 `blur(18px) saturate(1.15)`、强玻璃 `blur(30px) saturate(1.4)`。修正构建中标准滤镜声明被前缀声明覆盖的问题，保持公共材质 token；系统减少透明度与不支持滤镜时继续沿用公共降级。
- 日期键盘操作与日期边界有专项覆盖；详情初始焦点和返回焦点有显式处理。完整读屏和系统高对比度合规审计不在此次验收结论中。

全量检查实际为 1154 项、1141 通过、13 失败，未声称全库通过。失败集中在 AI 上下文／工作台名称与引用归属、设置测试的 SVG 加载，以及两个 Windows 符号链接权限用例；本次未修改这些失败文件。原沙箱全量曾因临时文件 EPERM 卡住，仅结束已识别的本轮测试树后用正常权限重跑得到上述结果。完整失败日志保留于本地 `test-results/meeting-notes/all-tests-native.log`。

Browser 插件未提供本次 Electron 能力，沿用项目的隔离 Playwright Electron 工作流；专用 userData 与待办库均位于测试目录，不调用外部模型、不写入真实业务样例。原生窗口截图和结构化结果已归档：

[验收报告](design/schedule-notes-2026-11-17/implementation/report.json) · [构建日志](design/schedule-notes-2026-11-17/implementation/verify.log) · [28 项专项](design/schedule-notes-2026-11-17/implementation/focused-tests.log) · [草稿最终复跑](design/schedule-notes-2026-11-17/implementation/draft-tests.log) · [总览提醒](design/schedule-notes-2026-11-17/implementation/01-reminder-overview.png) · [纪要详情](design/schedule-notes-2026-11-17/implementation/02-meeting-detail.png) · [窄窗纪要](design/schedule-notes-2026-11-17/implementation/03-narrow-meeting.png) · [共用新增弹框](design/schedule-notes-2026-11-17/implementation/04-convert-action-modal.png) · [窄窗提醒](design/schedule-notes-2026-11-17/implementation/05-narrow-reminder.png)。正在运行的旧开发主进程须重启 `npm run dev` 后加载新增纪要服务。

## 新头像重复构建的性能回退（2026-11-17）

用户报告新头像上线后全应用、侧栏及按钮悬停反馈迟缓。本轮只在产品源码中为 BotAvatar 增加 React.memo，保留 SVG、颜色、眼神光、全部尺寸、外框及动效。用户进程采样未发现 Bot 后台持续高 CPU；未修改用户数据、外观设置或后台策略。

在 200% 显示、强玻璃／悬浮导航、开发服务器和合成 20 条对话的同类场景采集 CPU profile。改前 12 次连续导航折叠中约 115ms 调用栈涉及 BotAvatar；改后该调用栈未再采样到。该轮脚本时间由约 816ms 降到 605ms，悬停帧间隔 p95 从约 25ms 降到 16.8ms；是本地隔离测量，不代表所有设备或用户窗口的固定数值。分别测试过隐藏头像、独立合成层、SVG 图像与位图覆盖，未观察到足够一致的收益，均未写入产品；也未取消强玻璃或流光。已有玻璃／流光的合成成本仍存在，未把它们直接认定为此次新增回退。

`npm run verify`、6 项头像／工作台测试、200% 显示的 16 项原生头像回归及 diff 检查通过。240 种组合、两类选择与颜色、取消／保存、未保存关闭保护、8 主题、窄窗、强制颜色及灵动岛显示保持；App.tsx 及导航外框规则与本轮改前一致。已清理此前中断验收残留的一个不响应且属于隔离目录的 Host 进程树，用户后台保留。

[改前调用栈](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/performance-regression/avatar-raster-stable/nav.cpuprofile)、[改后调用栈](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/performance-regression/avatar-memo-containment/nav.cpuprofile)、[改前测量](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/performance-regression/avatar-raster-stable/report.json)、[改后测量](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/performance-regression/avatar-memo-containment/report.json)。

## 命理／阅读拆分与签到设置迁移（2026-11-17）

final result: passed

命理、阅读清单各有导航和 Bot 主对话，签到归总台，无额外总台顶部 Tab。账号连接／授权／重连／断开迁至“设置 → 应用与账号”，自动配置迁至“设置 → 每日签到”；原鉴权、加密、周期、去重、核对及通知服务未改动。首页和概览直接定位应用；连接成功从签到返回原页，取消保留选中应用。自动配置显式保存，离开前保护未保存内容，保存失败保留输入。

数据升级前生成一致性备份；原工具助理 ID、混合主对话、草稿、任务和自定义资料留在命理，阅读对象历史转交新阅读身份。已有头像不重写；内部旧 utilities 标识保留以兼容既有任务。Host v4 沿用空闲升级保护，不打断旧后台正在执行的任务。迁移、幂等重开、队列／记忆／草稿保留、领域分开及旧入口兼容已覆盖；旧“小工具”激活路由按原子页恢复到新归属。

87 项相关测试通过，包含原签到服务、IPC 权限、授权取消／迟到响应、设备标识、首页、设置、会话归属、头像与 Host。原 Bot UI 24 项完整回归通过，包含 v3 Host 空闲接替、任务确认、资料／记忆／定时任务、双入口草稿及流式交互。隔离 Electron 100%／200% 各 8 项专项通过，pageerror 为 0；验证具体应用定位、连接取消、返回原页面实例、保存及未保存保护、无账号启用拦截、1024×680 窄窗、减弱动态和小窗顶部页签。消息→对话各连续切换三次，草稿保留，页签仍为 no-drag，无需新增页签修复。截图已查看。

`npm run verify`、最终构建与 diff 检查通过。新自动签到表单使用应用校验并声明 noValidate；补查该表单交互通过。Premium strict 仍为既有 22 项静态问题，无新增项，不计为全库审计通过。

Browser plugin not available，使用隔离资料的 Playwright Electron；仅状态读取与禁用状态下的本地设置保存，未执行真实短信、授权或领取。首次窗口验收启动停滞，已只清理本轮测试进程后重启通过；首次并行 Bot 回归在确认卡片等待超时，未改动业务逻辑，单独重跑 24 项通过。

[87 项测试](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/checkin-workspace-split/final-tests.log)、[100% 专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/checkin-workspace-split/retry/report.json)、[200% 专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/checkin-workspace-split/verified-200/report.json)、[24 项 Bot 回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/checkin-workspace-split/regression-serial/report.json)。

## Bot 矢量头像与独立色板（2026-11-17）

final result: passed (avatar scope)

按已确认的头像系统替换雪碧图裁切：角色／图形各 12 种、10 色共用，角色竖眼与柔和高光，图形使用固定浅底。编辑器仅替换原头像选择区；选择形状／颜色、两类别临时记忆、键盘单选、取消及保存已接入。读取旧值不写数据库，保存使用规范字符串。Host v3 沿用既有空闲升级保护兼容旧 v2 的头像校验，接口字段与数据库结构不变。

`npm run verify`、21 项头像／Host 测试通过。隔离 Electron 100% 的 13 项专项、200% 的 16 项专项及 24 项原 Bot UI 回归通过；两轮专项各绘制 240 种组合，pageerror 为 0。覆盖经典／悬浮导航两态、6×2 网格、10 色、形状和颜色独立、类别记忆／重置、键盘、保存重开、未保存关闭保护、8 主题、强制颜色、减弱动态、1024×680 窄窗和灵动岛。截图已查看。`src/App.tsx` 的 SHA256 及联系人／导航外框规则与改前逐字一致；实际两态头像保持 42px、坐标不移、外框圆角保持 14px。编辑预览 58px、名片 72px、灵动岛标题 30px 保持原占位。

Browser plugin not available，使用隔离资料的 Playwright Electron。额外执行的全量 `npm test` 在沙盒临时文件 rename 遇到 EPERM，多项失败且测试未结束，已仅停止本轮测试进程树，不计为全量通过；其中 Agent 消息与 Bot 待办补充共 25 项在正常权限隔离目录复核全部通过，日志为本目录外部验收文件 `bot-avatar-system/permission-recheck.log`。全库 premium strict 仍报告 22 项既有静态问题，不计为通过；未改动相邻 UI。

[100% 专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-avatar-system/verified/report.json)、[200% 与主题专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-avatar-system/verified-200/report.json)、[24 项 Bot 回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-avatar-system/regression/report.json)、[角色选择器](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-avatar-system/verified/character-picker.png)、[图形选择器](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-avatar-system/verified-200/graphic-picker.png)。

## 联系人资料改为右键打开（2026-11-17）

final result: passed

移除联系人旁的资料图标、选中文字为图标预留的右侧空间及展开／折叠／窄窗下的旧图标样式。右键整个 Bot 联系人区域直接打开原资料面板，锚定主联系人按钮并防止浏览器默认菜单；左键沿用原工作台切换。Shift+F10／菜单键提供相同入口，标题提示右键操作，关闭／Escape 后焦点回到原联系人。资料、记忆、定时任务及未保存确认继续复用原 BotProfile 和 Modal，未修改接口或数据契约。

已先验证改前右键无法打开资料。改后生产构建 100% 与 localhost:5174 开发态 200% 各 14 项、原 Bot UI 回归 23 项，共 51 项通过。覆盖经典／悬浮、展开／折叠、头像及选中联系人右键、两种键盘唤起、焦点恢复、窄窗自动图标导航、左键切换、资料编辑、记忆保存与删除确认、定时任务和主窗口／灵动岛草稿。右键非当前 Bot 不切换工作台，原生页面实例及当前草稿保留，资料面板保持在视口内，pageerror 为 0；实际折叠状态截图已查看。项目 UI 回归的旧信息按钮选择器已同步替换为右键和键盘入口。

npm run verify 与 diff 检查通过。Browser plugin not available，复用隔离资料的 Playwright Electron。首次测试启动的自动审批超时，按工具允许重试后成功；没有未完成的审批。全库 premium strict 仍为既有 22 项静态提示，不计为通过；官方 DESIGN lint 的离线缓存限制沿用前述记录，未安装额外依赖。

[改前验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-context/baseline/report.json)、[右键专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-context/verified/report.json)、[开发态及 200%](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-context/dev-verified/report.json)、[23 项 Bot UI 回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-context/regression/report.json)、[折叠状态右键资料](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-context/verified/悬浮-collapsed-profile.png)。

## 展开联系人与收起状态统一圆角（2026-11-17）

final result: passed

已复现悬浮导航的通用 .rail .ritem 规则将展开联系人覆盖为 24px，而收起状态为 14px。仅在 src/views/bot.css 增加一条 Bot 联系人圆角规则，复用 --r-card 的 14px，使展开后的选中、悬停及焦点底框与收起时一致；头像、行高、内距及外围导航胶囊保持原几何。

生产构建 100% 与 localhost:5174 开发态 200% 各 5 项，共 10 项通过。32 个采样覆盖经典／悬浮、展开／收起及选中／悬停／焦点，四角均为 14px；收起目标仍为 54×54，头像 42×42，展开行 184×64。生产基线与改后全部联系人、头像的坐标及宽高最大差为 0 CSS px。资料入口、关闭恢复焦点及工作台切换正常，pageerror 为 0；已查看实际展开悬停截图。

npm run build、npm run check:typography 与 diff 检查通过。Browser plugin not available，复用隔离资料的 Playwright Electron，不调用模型。全库 premium strict 仍为既有 22 项静态提示，不计为通过；官方 DESIGN lint 的离线缓存限制沿用前述记录，未扩改无关组件或安装依赖。

[复现报告](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-contact-radius/baseline/report.json)、[生产验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-contact-radius/verified/report.json)、[开发态及 200% 验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-contact-radius/dev-verified/report.json)、[展开悬停效果](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-contact-radius/dev-verified/expanded-hover.png)。

## 灵动岛对话深色气泡可读性（2026-11-17）

final result: passed

已复现浅色文字叠在白色回复气泡上的问题：新 BotPanel 继续复用共享 AiResponse，原来的深色规则仅匹配旧 `.island-assistant-message`；共享 `.ai-bubble` 仍有白色背景。改动仅限 `src/views/island-assistant.css` 的局部配色：回复气泡使用既有 --todo-subtle / --island-text / --island-line，代码块纸面映射至 --island-surface，分隔线沿用 --island-line。字体、尺寸、内距、圆角及对话行为保持。上一条验收记录中的暗色气泡遗留问题已解决。

真实 Electron 与本地 SSE 模型先复现再验证。改前正文对比度 1.08:1，引用、代码、表格及链接也不足；改后正文／标题／强调／引用／表格正文为 12.94:1，行内代码及表头 9.97:1，代码块 15.61:1，链接 6.18:1。用户消息 12.04:1、输入文字 15.61:1，11 类文字均超过 4.5:1。按实际背景透明度逐层合成后计算颜色，非仅比较 CSS 声明。主窗口同样 11 项前后计算色完全一致，继续使用浅色气泡。

生产构建 100% 与 localhost:5174 开发页面 200% 各 5 项，共 10 项通过，覆盖文字对比度、主窗口隔离、消息／对话往返及草稿、280×340 窄窗和代码横向滚动、无 pageerror／框架报错。默认小窗 400×610，实际截图已查看。npm run verify 和 diff 检查通过。Browser plugin not available，复用 Playwright Electron；全部使用临时资料及合成消息，不调用真实模型或发送真实内容。

全库 premium strict 仍为既有 22 项表单／选择器静态提示，不计为通过；未扩改无关组件。DESIGN.md 官方 lint 仍受前述本机无离线缓存限制，未安装额外依赖。

[复现报告](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-contrast/baseline/report.json)、[生产验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-contrast/verified/report.json)、[开发态及 200% 验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-contrast/dev-verified/report.json)、[实际效果](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-contrast/verified/conversation-top.png)。

## 灵动岛小窗消息返回对话（2026-11-17）

final result: passed for the top conversation/messages tabs

按顶部“对话／消息”页签处理。原实现每次离开对话会销毁 BotPanel，返回时重新加载主对话、配置、任务与交付件；现保留两个面板及对话组件状态，通过 hidden 显隐，仅当前面板进入布局及辅助技术范围。隐藏对话使用原 open 生命周期暂停输入、保存草稿，后台消息监听继续保留；页签显式设置为 no-drag，保留两个 aria-controls 目标及原有方向键操作。未改变消息列表“查看对话”的外部跳转。

改动前，独立生产窗口和 localhost:5174 开发窗口的基础往返、键盘与重新打开测试均通过，未重现用户现有窗口卡住。因此本次针对切页重建与页签目标不稳定做修正，不将新窗口测试通过宣称为原窗口根因已完全证实。电脑操作确认了用户当前项目的开发窗口和已有主对话；未发送真实消息或修改真实记录。自动化使用独立资料、12 条合成 Agent 消息和本地 SSE 模型，未依赖真实账号。

改动后生产构建 100%、开发页面 200% 各 9 项，共 18 项通过：两个有效面板目标及单一可见面板、鼠标往返、连续五轮切换、方向键及焦点、关闭重开、280×340 窄窗、消息筛选保留、流式回复跨页接收、控制台与活动面板数量。默认小窗为 400×610；流式用例只提交一次工作，切到消息后完成，返回可见完整回复，主窗口和灵动岛的独立草稿均保留。两组 pageerror 与 console error 均为 0，npm run verify 与改动文件 diff 检查通过。

Browser plugin not available，复用 Playwright Electron 验证。全库 premium strict 仍为原有 22 项表单／选择器静态提示，不计为通过；未重跑无关业务全流程。截图另外显示既有暗色答复气泡对比度不足，本次没有扩改该主题样式。

[生产验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-tabs/verified/report.json)、[开发态与 200% 验证](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-tabs/dev-verified/report.json)、[切回后的对话](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-island-tabs/dev-verified/conversation-with-reply.png)。

## 浮动／收起助手进入并排的统一动效（2026-11-17 追加确认）

final result: passed for the requested transition

工作区继续复用原有 240ms 横向收窄，右边界不动；对话面板直接定位到并排位置，在前 48ms 腾出空间后用 192ms 淡入。仅在浮动／收起进入并排时播放，保留首次加载、Bot 切换、导航伸缩与工作区收放的原行为。没有重挂工作区或改变草稿、消息及任务 API。正常结束、快速反向切换和运行中开启减弱动效均清理透明度动画及临时标记。

真实 Electron 隔离数据验收 18 项通过，窗口为 1280×820、1024×680，覆盖经典／悬浮导航、浮动入口、收起且上次为浮动／并排的入口、折叠导航、减弱动效、连续切换及动效偏好中途改变。15 组逐帧采样共 600 帧，工作区右边界最大偏差为 0 CSS px；13 组正常动效均有工作区中间位置和对话透明度中间值，对话锚点与宽度全程等于最终并排布局。页面实例、草稿、菜单焦点及所测滚动位置保留，未提交任务，pageerror 为 0。导航折叠的补充用例从页面顶部开始，避免把仪表盘变列时浏览器对底部的滚动锚定当成动画复位；不新增滚动拦截。

首次实测发现生产构建将 240ms 规范化为 .24s；已沿用导航现有的秒／毫秒换算，重新构建后完成上述验收。`npm run verify` 通过，最终时长换算调整后构建及类型检查再次通过。Browser plugin not available，使用仓库既有 Playwright Electron 路径；未打开真实用户资料。范围为模式切换展示，未重跑其他 Bot 业务全流程。

全库 premium strict 静态审计仍报告 22 项表单／选择器契约提示，涉及既有 Select 调用及 textarea 检测，未扩改这些控件；不将该审计宣称为通过。DESIGN.md 官方 lint 的离线命令因本机未缓存 @google/design.md 而未执行，不为此次局部改动安装依赖。

[逐帧与交互报告](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-parallel-enter/accepted/report.json)、[最终并排截图](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-parallel-enter/accepted/parallel-final.png)、[静态审计](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-parallel-enter/premium-audit.json)。

## 浮动助手按整个窗口横向居中（2026-11-17 追加确认）

删除原浮动定位中的半个展开侧栏宽度偏移，入口、展开输入框及常规答复共用整个应用窗口中线。只修改 src/views/bot.css 中一处 left 公式，保留宽度、底部距离、动效、草稿与对话行为；仓库 UI 验收补充入口和输入框的全窗口中点断言。

构建通过。隔离 Electron 几何验收 9 项通过，覆盖经典／悬浮、1280px／1024px、侧栏展开／收起，以及正常展开动画。各状态横向中点偏差最大 0.000 CSS px；动画 50 帧最大偏差 0.008 CSS px，pageerror 为 0。使用原有 Electron 验收，未打开实际资料。

[验收报告](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-center/verified/report.json)、[入口截图](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-center/verified/centered-pill.png)、[对话截图](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-center/verified/centered-conversation.png)。


## Bot 资料、记忆与定时任务三页签（2026-11-17 选定稿）

final result: passed

视觉依据是用户明确选择的第三张生成稿，原图已保存为[选中稿](docs/requirements/shared/ai-assistant/design/bot-profile-tabs-selected-2026-11-17.png)。已打开原图与最终同一“定时任务”状态的面板截图共同比较。原图 1199×1312px 含外围背景，主体约 1024px 宽；实现按桌面真实弹出面板适配为 440×500 CSS px，并在 200% 显示比例下捕获为 880×1000px。图片中的账号、任务是隔离验收数据，通过真实 Bot API 写入。参考稿“每周工作回顾”是示例文案；运行图使用现有调度接口实际支持的每日计划，不冒充新增每周能力。键盘操作截图保留可见焦点环，原稿未展示该状态。

顶部统一为头像、名称、职责和两行说明摘要，右上为编辑／关闭。资料、记忆、定时任务在同一面板切换，保持尺寸、锚点及外部工作台和草稿。定时任务列表参考稿件中的时钟、双行文案、开关与“已设置／新建”结构；新建表单在原内容区替换列表，取消后返回。完整工作说明在资料页可展开查看，6000 字无标点文本也不会挤掉页签。

初次比较发现并修正：P2 开关继承通用按钮的居中布局，使启用圆点超出轨道，改为沿共享 toggle 的块布局；P2 身份说明的 span 样式误影响头像内层，收紧到文字容器；P2 面板被旧 modal 的 420px 上限限制，明确 440px 变体；有预填文本的表单字段增加稳定的辅助名称，并为日期／时间按实例生成唯一 ID。已重新构建、操作并捕获最终面板。无剩余 P0/P1/P2；实际资料与平台运行条件文案造成的高度差属于功能适配。

| 核对面 | 最终结果 |
| --- | --- |
| 字体／层级 | 复用现有系统字体与共享字阶，名称 24px、身份说明 13px、页签 14px，分区标题 18px |
| 排列／间距 | 72px 头像、24px 面板内边距、36px 页签；身份和右上操作对齐，三态保持 440×500px |
| 颜色／控件 | 不透底的主题 overlay，主操作和启用态用主题主色，停用态中性灰，圆点保持在轨道内 |
| 图像质量 | 复用现有高清 Bot 头像与 Phosphor 图标，未使用截图代替交互界面 |
| 内容／行为 | 所有记忆、任务及开关来自真实接口；未保存表单跨页签保留，关闭先确认，写入保留版本校验 |

Windows Electron、打包后的 dist/index.html、经典／悬浮导航、1280×820 与 1024×680、200% 显示比例及减弱动效已验证。Browser plugin not available；界面依赖 Electron IPC，沿用仓库的隔离 Playwright Electron 验收。没有打开实际用户资料。

npm run verify 通过。仓库 UI 回归 23 项通过，新增覆盖资料面板内新建／暂停计划且不导航、不丢外部草稿；专项 7 项通过，覆盖键盘页签、真实启停、创建、记忆保存／编辑／取消删除、未保存关闭确认、资料编辑／焦点恢复、窄窗、长说明完整查看。两组 pageerror 均为 0；专项确认查看和管理资料没有创建 AI 工作。

证据：[23 项回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/regression/report.json)、[7 项专项](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/final-proof/report.json)。源代码归属为 src/views/BotProfile.tsx、BotTasks.tsx、bot.css 和 src/App.tsx；未新增调度或记忆后端协议。

- [定时任务页签](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/final-proof/profile-schedules-card.png)
- [资料页签](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/final-proof/profile-data-card.png)
- [记忆页签](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/final-proof/profile-memories-card.png)
- [窄窗真实界面](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-profile-tabs/final-proof/profile-schedules-1024.png)


## 日程待办统一新增弹框（2026-11-17）

按用户图一，将日程待办页「新增」和 Ctrl+N 的按钮下方浮层改为居中模态弹框，与顶栏新增日程／待办及悬浮待办宿主共用 `TaskEditor`。移除创建组件的锚定参数和专用浮层样式，保留类型切换、时间／优先级／标签／更多设置及「返回」。标题在弹框打开后的布局阶段聚焦，并使用 `preventScroll`；移除提前执行的输入框 `autoFocus`，保证关闭后恢复仍可用的触发前焦点。设计与交互规则同步到 `DESIGN.md`、`UX-CONTRACT.md`。

字阶检查、前后端构建、两份 TypeScript 及 64 项相关回归通过。独立 Electron 配置与待办数据库的 7 组实机检查通过、pageerror 为 0：页面新增真实待办；Ctrl+N、类型切换、继续编辑和放弃修改；日程缺少时间校验、日期选择器先响应 Escape、09:00—09:30 时间段真实保存；首页顶栏日程及待办两个入口；1024×680 下打开新增及已有事项编辑；最终只有两条待办与一条日程，放弃草稿没有新增记录。1280×820 下各新增入口均为 408×430、坐标 (436,195)，1024×680 下为同样尺寸、坐标 (308,125)，均在窗口中居中。已查看普通及小窗口实际截图。证据见[实机报告](test-results/task-create-modal/report.json)、[页面新增](test-results/task-create-modal/page-task-modal.png)、[小窗口新增](test-results/task-create-modal/small-window-modal.png)。

## 流光小入口、全局光波与紧凑浮动答复（2026-11-17）

按 11-16 用户提供的 metadata-analysis 截图和实际源码调整 OnO 浮动交互。初始只显示 300×44px 小入口，点击经 90ms 轻压、580ms 弹性展开为约 118px 高的输入；一次全局边缘流光／淡色折射光波位于顶栏下方，约 1 秒后移除。输入和答复保持不透底。普通答复只显示当前或最近一轮，最高 240px、短内容自然收缩；待确认、授权和异常保留原处理能力，不能被精简视图丢掉。完整对话回到并排中的同一主对话。

参考项目正式接口当前是 JSON；OnO 保留真实模型 SSE 增量，没有模拟打字或固定假答案。思考和工具明细沿用默认折叠组件。用户向上滚动时停留在当前位置，回到底部恢复跟随；关闭答复／收起输入／隐藏助手均保留文字和后台工作，停止回复才取消原任务。

实现由 src/views/BotPanel.tsx、src/views/bot.css 维护展示，src/bot-floating-motion.ts 维护一次性光波。electron/main.ts / preload.ts 与 shared/workbench-api.ts 只新增临时窗口画面接口，主窗口顶层 sender 校验通过后才返回；不落盘、不写聊天、不上传。GPU 或画面不可用时使用无折射的颜色光波；系统减弱动效时取消位移和光波。新界面遇到旧 preload 时可先展开，不依赖画面接口才能输入。

环境为独立临时用户资料、打包后的 dist/index.html、Windows Electron 与受控本地 SSE 模型。Browser plugin not available，使用仓库 Playwright Electron 验收；测试不打开实际用户资料。覆盖经典／悬浮导航、1544×1018、1280×820、1024×680、减弱动效及原生浏览器。

| 检查 | 结果与证据 |
| --- | --- |
| 构建与字阶 | npm run verify 通过：字阶、两端 TypeScript、Vite 和 Electron 构建 |
| 桌面行为 | tooling/bot-ui-pilot.mjs 的 22 项通过，包含原有草稿、行内确认、消息队列、灵动岛及独立 Host 恢复 |
| 流式与滚动 | 本地模型每 100ms 返回真实增量；当前轮只显示一条答复，长内容内部滚动，向上阅读保持位置，停止与恢复可操作 |
| 展开光波 | 实际获得 window-lens 渲染，边界在顶栏下 6px，pointer-events 为 none；结束及隐藏后无残留 |
| 原生浏览器 | 浏览器已加载本地网页时仍显示光波，原 webview 实例保留 |
| 降级与权限 | 测试中禁用 WebGL2 后走 2D 颜色光波；灵动岛请求临时画面被拒绝，主窗口可用 |
| 异常保留 | 旧失败提示与未决操作仍可查看，不能因当前轮为短答复就丢掉 |
| 运行错误 | 22 项验收 pageerror 为 0，无空白页或框架错误遮罩 |

实际证据：[22 项报告](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/accepted/report.json)、[最终界面定向复核](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/presentation/report.json)。截图是隔离模型数据；真实服务延迟和其他机器的 GPU 性能未在本轮实测。画面是一次临时快照，波前在约 1 秒内展示该帧的轻微折射；操作工作区或调整窗口尺寸会提前移除效果。

- [初始小入口](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/presentation/floating-entry.png)
- [展开输入框](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/presentation/floating-composer.png)
- [紧凑短答复](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/presentation/floating-compact-1024.png)
- [原生浏览器中的光波](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-floating-compact/accepted/floating-browser-wave.png)


## 联系人资料图标去白底（2026-11-16 追加确认）

按用户反馈，删除折叠和窄窗自动图标导航中资料入口的白色底板，保留原 17px 细线图标、32×32px 透明点击区域、右下角定位及悬停／键盘焦点反馈。只移除两处背景声明，不改变头像、未读角标、联系人行高或资料打开流程。

构建通过。复用隔离 Electron 导航验收并补充默认背景、边框、阴影和点击区域检查，19 项全部通过、pageerror 为 0，覆盖经典／悬浮、1280×820 与 1024×680、200% 显示比例以及减弱动效。默认背景透明、无描边或阴影，资料点击和键盘焦点恢复正常；已查看两种导航的实际截图。证据见 [资料图标去白底验收](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-info-frameless/verified/report.json)。

## 行内选择卡压缩与直接填写其他回答（2026-11-16 追加确认）

按用户对过高选项卡的反馈，卡片内边距由 16px 收为 12px，去掉标题默认上下留白；选项间距 6px、上下内边距 7px，保留标题与完整说明。原“补充回答”折叠入口改为直接可见的“其他 + 单行输入框 + 提交”，无选项的问题直接显示“你的回答”。输入与按钮同高 32px，空白禁用提交；支持 Enter，输入法合成期间的 Enter 阻止默认提交。原选项直接作答、真实回执、跳过、取消和继续原任务均保持。

`npm run verify` 和 28 项 Host／草稿测试通过。扩展现有隔离 Electron pilot 后，19 项流程检查全部通过、pageerror 为 0；窄窗检查整卡小于 290px、两条带说明的选项均低于 60px，无横向溢出。验证“其他”输入始终可见、无需展开、空白提交禁用、输入法合成事件被阻止、实际 Enter 提交得到原任务回执，以及无选项自由回答、跳过、取消、刷新、并排／浮动、灵动岛与独立 Host 回归。已查看紧凑卡片和填写“其他”的实际截图。Browser plugin 未提供，沿用仓库 Playwright Electron、本机模型夹具与临时数据。证据见 [19 项紧凑选择卡验收](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-compact-question/report.json)。

## 同一事项补充日期的确认去重（2026-11-16 修复）

复现“新增一条事项 → 尚未确认时补充明天完成”：模型虽然表示更新建议，原实现每轮各自保存一份 `create`，两张确认均能创建业务记录。现在向模型提供当前 Bot 主对话的建议标识和真实创建回执，并支持显式修订原新增建议；唯一同名、同类型的单条建议也可关联。完整新版预览与旧确认失效在同一 SQLite 事务提交，旧卡折叠显示“已被新建议替代”，保留原快照但不能再次确认。原建议已应用时使用真实事项 ID 改为修改确认，保留未明确修改的字段和版本保护。不同事项及明确另建的同名事项保持独立；同名歧义、执行中或未知结果不自动重建。此次未扩展批量或委派建议的自动合并。

新增 9 项真实 Runtime／本机模型夹具回归，先复现两项失败，再验证未确认修订、确认后修订、生成期间原卡被确认、迟到确认、不同事项、明确另建同名、显式标识更名、未知结果阻断、保存失败回滚和同名歧义处理。连同现有 Host、待办事务、组件、共享工具、引用和流式适配，73 项相关测试通过；`npm run verify` 通过。

隔离 Electron 的 5 项实机检查通过：同样的两轮输入仅保留一个可应用的确认；旧卡展开只读，迟到 RPC 不写入；刷新恢复替代回执、唯一确认及已保存草稿；确认后补充日期仍更新同一事项 ID，实际只有一条待办。pageerror 为 0，已查看旧卡只读与最终修改确认的截图。使用本机模拟模型和临时数据，验证的是状态与业务副作用，不是外部模型的语言理解质量；用户真实聊天与待办只读核对，未自动改写或清理。证据见 [补充日期实机验收](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-todo-followup/verified/report.json)。后端修复须在工作台及独立 Host 完整重启后载入。

## 设置入口内容左对齐（2026-11-16 追加确认）

设置按钮由整组居中改为左对齐，齿轮中心与 Bot 头像中心对齐，文字左缘与 Bot 名称对齐；原 20px 齿轮、胶囊尺寸和点击流程保持。构建与字体检查通过。隔离 Electron 在 1280×820、1024×680、200% 显示比例下核对经典／悬浮与展开／收起，共 8 项几何检查及键盘打开原设置弹框检查通过，pageerror 为 0；已查看两种导航的实际截图。证据见 [设置入口左对齐验收](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-settings-left/verified/report.json)。

## 待办修改建议紧凑行式（2026-11-16 追加确认）

按用户对过长修改预览的反馈，将逐项标题加大块“修改前／修改后”改为紧凑字段行，前后列标题只显示一次。短值行高 24px；缩小字段列、箭头、内边距和段间距，日期与时间有空间时保持同排。新增事项／标签只显示建议值，未设置字段默认折叠、可键盘展开；修改已有记录保留全部请求字段和前后值，长备注完整换行。字段“标签”缩短展示，原说明留在悬停标题。真实快照、选择、确认、放弃、删除警示及回执保持原流程。

`npm run verify`、最终构建与字体检查通过，9 项待办预览／事务／组件测试通过。隔离 Electron 的 10 项实机检查通过，覆盖 1544×1018 和 1024×680、200% 显示比例、并排与浮动；290px 宽卡片中的完整日期时间前后值均为单行，短值行高 24px，无横向溢出。确认新增只写入一次，取消全部选择后不能应用，放弃修改保留原值，删除警示可见且放弃不删除；未设置字段可用 Enter 展开／收起，长备注末尾完整。pageerror 为 0。已查看最终新增及前后对照截图。

首次实机检查发现窄卡片的字段列和内边距占用过多，日期时间仍换行，已进一步压缩后重新通过。Browser plugin 未提供，使用仓库 Playwright Electron、本地模型夹具及临时数据，未访问用户档案或真实外部模型；技能 Python 静态审计本次未执行。证据见 [10 项紧凑预览验收](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-compact-proposal/verified/report.json)，同目录保留截图。

## 折叠 Bot 导航改为圆角方块（2026-11-16 追加确认）

按用户提供的 Grok Bot 参考图，折叠及窄窗自动图标导航的 Bot 入口改为 54×54px、14px 圆角方块，选中和悬停共用该形状。使用内外边距抵消外扩，保留头像 42×42px 的原坐标及常规 64px／短窗 55px 的联系人行位；展开后的带文字入口、外层胶囊、设置和业务布局保持。

`npm run build` 和 `npm run check:typography` 通过。复用隔离 Electron 导航验收，15 项检查全部通过，覆盖经典／悬浮、1280×820 与 1024×680、200% 显示比例、普通及减弱动效：实际入口均为 54×54px、14px 圆角，头像均为 42×42px 且与按钮中心重合；折叠／展开采样的头像位置和尺寸最大偏移为 0，导航纵向锚点、设置位置、原生工作区与草稿保持。七个联系人逐一点击、资料打开／关闭和键盘切换正常，pageerror 为 0。已查看两种导航截图。Browser plugin 未提供，使用仓库 Playwright Electron 和临时数据；Python 静态审计仍因环境未安装 Python 未运行。证据见 [bot-nav-squares/verified](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-nav-squares/verified/report.json)。

## 主对话行内选择与确认（2026-11-16 追加确认）

参考用户提供的 Grok Bot 截图，将问题选项、补充回答及待办／文章／定时任务确认放到原回复下，直接处理现有 `BotAction`，不再要求先点“等待你确认”跳转任务详情。复用现有后台操作 ID、版本校验和真实回执；原任务与主对话 ID 保持，未发送草稿不变。全行 A/B/C/D 选项可显示说明，支持键盘确认；补充输入原地展开，无选项时直接显示输入，提交时禁用重复点击。已回答保留原问题和回执，已应用业务操作折叠展示，仍可展开查看及使用原有撤销。问题文字与当前回复相同时，待回答卡片使用短标题，避免重复提问。普通问候仍不生成工作卡；浏览器站点授权沿用原组件。共享方案、设计与交互契约已同步。

`npm run verify` 与最终补充可访问说明后的 `npm run build` 通过。隔离 Electron 的 19 项流程检查全部通过，pageerror 为 0：实际选项在主对话内用键盘作答；刷新前后恢复待答卡和已答回执；补充、跳过、取消在并排／浮动模式可用；回答后继续原任务，待办原地预览并明确确认后只写入一次，重复点击不重复创建；输入草稿保留。原有任务详情、交付件、原生浏览器资源桥、灵动岛和 Host 重启回归通过。截图已核对窄窗选项、浮动补充回答、刷新后的回执。

首次新增窄窗用例发现资料信息图标遮住联系人按钮中心，已把折叠状态的信息入口下移至行间留白，联系人头像和导航行高不变，后续完整用例通过。Browser plugin 未提供，使用仓库 Playwright Electron、本地模型夹具及临时数据；未调用真实外部模型，不据此判断模型选择标签的质量。当前没有 Python，技能 Python 静态审计未执行。证据见 [19 项行内交互与既有流程回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-inline-actions/report.json)，同目录保留界面截图。

## Bot 输入、资料和工作操作按钮统一（2026-11-16 追加确认）

按用户对三组建议的确认，输入栏附件、语音和发送共用 32×32px、10px 圆角及 18px 图标，模型选择器同高；资料信息和弹框关闭图标的点击区域统一为 32px，保留资料卡整行入口、联系人头像行位与关闭后的焦点恢复。Bot 紧凑工作操作高 32px，记忆和定时任务的添加、取消、保存／创建高 36px，使用主色／中性／危险语义；表单操作区与控件间隔 12px，主要确认靠右。列表“查看任务”改为“查看进度”，当前详情标题只读且去掉重复查看入口，继续对话和子任务逐级查看保持。

新建记忆空白时正确显示禁用的“保存记忆”，已有记忆仍须确认删除。实际保存检查发现表单展开整个读取对象，把只读 `updatedAt` 发给 strict IPC 导致保存失败；已改为显式提交接口允许的字段，后台 schema、版本校验和存储不变。既有 UI pilot 新增真实记忆增改删及取消删除回归，同时核对当前详情没有重复查看按钮。

`npm run verify` 及最终 CSS 调整后的 `npm run build` 通过。既有隔离 Electron pilot 的 17 项流程检查通过，覆盖主对话、任务确认、工作进度与详情、继续对话、交付件、灵动岛、原生浏览器资源桥与 Host 重启；新增隔离检查的 14 项全部通过，覆盖经典／悬浮导航、1544×1018 与 1024×680、并排／浮动模式，按钮普通、悬停、键盘焦点下的实际几何，资料卡关闭焦点恢复，以及记忆增改删、定时任务创建／取消／启停。记忆和计划均使用临时数据目录，测试计划最终暂停。pageerror 与新检查的 console error 均为 0；已查看输入栏、资料卡、记忆表单及定时任务截图。

Browser plugin 未提供，使用仓库 Playwright Electron。首次几何检查在弹窗入场动画中读取尺寸，已改为等待实际动画完成；随后发现并修复上述真实记忆保存失败。最后补齐表单间距后再次通过 14 项检查。当前没有已安装的 Python，技能的 Python 静态审计未执行。最终证据为 [17 项流程回归](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-button-consistency/full-pilot/report.json)与 [14 项样式及表单检查](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-button-consistency/verified/report.json)，截图位于各报告同目录。

## 移除对话标题栏的收起助手按钮（2026-11-16 追加确认）

按用户红框指定，移除并排对话标题栏右侧的“收起助手”图标，工作区展开和仅对话两种状态均不再渲染；工作进度、交付件和工作区收放保留，助手统一从顶栏 AI 下拉菜单收起。浮动答复的独立收放保持。清理失效的图标导入和专用样式，同步设计、交互契约及既有 UI pilot 的入口。

`npm run verify` 通过。隔离 Electron 的 14 项检查通过，覆盖经典／悬浮导航、1544×1018 与 1024×680、并排与仅对话状态：标题栏只保留两个文字按钮，工作进度、交付件、工作区恢复、全局菜单收起／重开及草稿保留可用；既有按钮高度 32px、圆角 10px 和浮动答复操作保持，pageerror 为 0。Browser plugin 未提供，使用仓库 Playwright Electron；首次沙箱启动失败后以临时数据目录运行。首次验证的标题断言早于页面标题初始化，修正测试等待后全部通过；未修改产品标题行为。证据见 [bot-remove-header-collapse/verified](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-remove-header-collapse/verified/)。当前环境没有已安装的 Python，技能的 Python 静态审计未执行。

## 标题栏按钮统一圆角矩形（2026-11-16 追加确认）

按用户明确补充，该行文字入口和图标按钮全部使用圆角矩形，统一为 `--r-ctl` 的 10px 圆角，并排标题行继续保持 32px 按钮高度；本条作为最终形状规范。保留共用底面、边线及悬停反馈，聚焦时也保持 10px 圆角。

`npm run verify` 通过。复用隔离 Electron 验收，14 项检查全部通过：经典／悬浮导航、宽窄窗口、并排／仅对话，普通、悬停和键盘聚焦状态的实际圆角全部为 10px；收起助手隐藏条件、工作区恢复、全局菜单、草稿及浮动答复操作保持。pageerror 为 0。最终报告与截图见 [bot-header-button-rectangles/verified](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-header-button-rectangles/verified/)。

## 标题栏按钮圆角与表面统一（2026-11-16 追加）

按用户截图，将工作区收起／展开按钮的圆角矩形底面统一为 32px 圆形，文字入口继续使用胶囊形。与对话侧按钮共用 `--control-bg` 底面、`--hairline` 边线及悬停亮度反馈；提高该入口样式的作用域优先级，确保全局焦点样式不会把圆形改回方角。位置、尺寸和点击逻辑保持。

`npm run verify` 通过。隔离 Electron 的 14 项检查通过，覆盖经典／悬浮导航、1544×1018 / 1024×680、并排与仅对话状态，检查普通、悬停和键盘聚焦下的圆角、底面、边线及尺寸，并回归工作区恢复、顶栏菜单、草稿和浮动答复收放。pageerror 为 0；已查看仅对话截图。首次试跑被新用户模型配置引导遮挡，关闭测试窗口的引导后完成验收，未修改引导行为。Browser plugin 未提供，使用仓库 Playwright Electron；最终证据见 [bot-header-button-shapes/verified](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-header-button-shapes/verified/)。

## 仅对话时隐藏收起助手按钮（2026-11-16 追加）

工作区已收起、仅显示对话时，隐藏对话标题栏的“收起助手”图标，保留工作进度、交付件及右侧“展开工作区”。展开工作区后恢复该图标；全局 AI 菜单继续可收起助手。复用已有工作区显隐状态，不增加新的模式状态。

`npm run verify` 通过。隔离 Electron 的 6 项检查通过：经典／悬浮导航分别覆盖 1544×1018 和 1024×680，验证按钮不再可见或出现在可访问按钮列表、工作区恢复入口可操作、工作进度与草稿保留、全局菜单收起／重开及恢复后的原按钮可用；两种导航的浮动答复收放均保持可用。标题栏仍为 56px，恢复按钮不与交付件重叠，pageerror 为 0。Browser plugin 未提供，使用仓库 Playwright Electron；证据见 [bot-chat-only-button](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-chat-only-button/)。

## 对话与工作区标题行高度统一（2026-11-16 追加）

复现总台的两侧标题栏高度为 54.14px / 58.19px，标题字号、上下留白与按钮高度使用不同规则。现共用 `--bot-header-height: 56px`，标题统一使用 16px 字阶及 1.2 行高，操作按钮与页面 Tab 均高 32px；两侧标题、按钮中心、分隔线和内容容器上缘对齐。工作区恢复按钮按同一标题行定位。Tab 滚动条保留在行内下方留白，消除其将按钮抬高 5px 的情况；聚焦 Tab 时滚入可见范围。

`npm run verify` 通过。隔离 Electron 的 50 项主验收通过，覆盖经典／悬浮导航、七个 Bot 工作台、1544×1018 / 1024×680 / 840×700 真实内容视口、340/560px 对话宽度及工作区收放。840px 仅在隔离窗口临时降低原生最小尺寸。追加 DPR=2 的 12 项验收通过，实际视口为 1279×820、1023×680、1543×1018。共 62 项通过；所有标题栏实测均为 56px，标题与控件的最大中心偏差均为 0px，pageerror 为 0。过长 Tab 的键盘滚动、按钮完整显示及草稿保留均已检查。

已查看悬浮导航的总台及最窄工作区截图。Browser plugin 未提供，使用仓库 Playwright Electron；最终报告、截图与构建日志见 [bot-header-alignment](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-header-alignment/)，通过报告位于 `verified/report.json` 和 `density2/report.json`，中间试跑不计入通过结果。

## 工作进度入口与普通聊天记录折叠（2026-11-16 追加）

用户确认将 Bot 的“任务”入口改名“工作进度”，并排标题栏、浮动菜单和灵动岛共用同一视图。列表默认展示“需要关注”（待确认、等待资源、失败和中断）及“进行中”（排队、执行、等待 Bot），已结束的工作与普通聊天记录分别使用默认关闭的原生 details/summary。失败或待确认聊天不能因 chat 类型而折叠；普通记录只收纳已完成／取消且没有资料、工具、建议、写入、协作或交付件证据的聊天。展开后的详情、确认、协作和“在对话中继续”沿用原处理。

新增 3 项分类测试通过，覆盖全部未结束状态、聊天与实际工作的证据区分、完整分组和空态。`npm run verify` 通过。隔离 Electron 的 16 组流程全部通过、30 张截图、pageerror 为 0，包含真实待办确认、失败聊天默认可见、普通记录默认收起及 Enter 展开、交付件记录保留为工作、浮动菜单、340px 对话栏、原对话继续，以及主窗口／灵动岛草稿、队列、重启和浏览器授权回归。已查看待确认、普通记录收起及最窄窗口截图。

Browser plugin 未提供，复用仓库 Playwright Electron 与本机确定性模型服务，不读取真实用户数据或调用外部模型。证据见 [bot-work-progress](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-work-progress/)，最终 UI 报告位于 `ui-final/report.json`。首次试跑在新增窄窗检查恢复窗口尺寸后，尚未等待布局动效结束就进入外观几何断言；已修正测试等待并重跑，首次失败不计入通过结果。

## 导航收放的头像与胶囊位置对齐（2026-11-16 追加）

按用户截图复现悬浮导航折叠：联系人胶囊由 y=160px 上移至 151px，首个头像同时从 x=28px 左移至 22px；头像两态本身均为 42×42px。原因是底部设置胶囊两态高度为 48/66px，改变联系人居中空间，且头像的展开内边距和折叠居中规则不同。现将设置胶囊统一为 48px 高，联系人横向内边距统一为 12px，并将头像固定在左侧；不调整正文布局算法、Bot 资料入口或设置交互。

`npm run verify` 通过。隔离 Electron 完成 38 项逐帧检查：经典／悬浮导航，1280×820、1544×1018、1024×680 窗口，并排／浮动／隐藏助手，两个伸缩方向及减弱动效。头像 x/y/宽/高、联系人胶囊 x/y/高、设置胶囊 x/y/高的最大偏差均为 0px；左上 Logo 和折叠开关的几何保持，原生页面、滚动和草稿保留，pageerror 为 0。已查看悬浮导航的展开／折叠截图。

追加 2 倍显示缩放的 6 项检查通过，实际内容视口为 1279×820px，DPR=2；同样核对两套导航、两个方向和减弱动效。总计 44 项通过，报告分别位于 `after/report.json` 和 `density2/report.json`。

Browser plugin 未提供，复用 Playwright Electron 与独立数据目录。复现、构建、逐帧报告和截图保存在 [bot-nav-alignment](C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bot-nav-alignment/)，未修改实际用户数据或生产窗口最小尺寸。

## 工作区图标收放与动效（2026-11-16 追加）

按用户截图，将工作区右上入口统一为右侧分隔的细线矩形图标：18px 图标、32px 点击区域，常态无底面，悬停使用共享控件底色。收起和展开保留同一按钮与锚点、可访问名称及展开状态；替换原文字恢复胶囊。工作区显隐和对话宽度沿用 240ms 导航动效，减弱动效下即时切换，快速反向点击不依赖定时器或卸载页面。

`npm run verify` 通过。隔离 Electron 完成 31 项检查，经典／悬浮导航各覆盖展开／折叠侧栏及真实 1544×1018、1024×680、840×700 内容视口；逐帧确认淡出和宽度中间态，并检查恢复、快速反向、键盘操作、模式切换、Tab／按钮避让及减弱动效。原生内容节点、按钮节点与焦点、滚动位置和输入草稿保持；pageerror 为 0。840px 仅在隔离验收窗口临时降低原生最小尺寸，生产窗口最小尺寸未调整。已查看悬浮导航的展开和收起截图。

追加 16 项导航边界回归全部通过，包括两套导航的最小／最大对话宽度、拖动即时响应、工作区收起后的完整对话和减弱动效。测试先等待工作区收起动效完成，再量测导航独立伸缩；此前把两段不同动画同时量测的失败试跑不计入结果。边界回归日志为 `test-results/bot-workspace-nav-edge.log`，报告保存在同目录 `nav-edge-report.json`。

Browser plugin 未提供，复用仓库 Playwright Electron。证据见 [test-results/bot-workspace-motion/](test-results/bot-workspace-motion/)，日志为 `test-results/bot-workspace-motion-{verify,ui-final}.log`。本机没有 Python 解释器，技能附加的 Python 静态审计未运行；本次采用项目字阶检查、TypeScript、构建和实际交互验证。

## 导航折叠只调整相邻区域（2026-11-16 追加）

并排对话可见时，工作区的分界线与尺寸固定，导航展开／收起释放或占用的空间全部交给对话区；工作区在动画中也保持稳定。浮动或隐藏助手时由工作区跟随导航，浮动输入与答复保持原锚点。收起工作区后的完整对话仍单独伸缩；≤1180px 的图标导航和≤900px 的覆盖式对话沿用原行为。拖动／键盘调宽时停用导航补偿过渡，避免对话和工作区不同步。

`npm run verify` 通过。此前隔离 Electron 几何验收共 64 项通过，覆盖经典／悬浮导航、1544/1280/1024px 实际窗口、并排／浮动／隐藏助手、两个折叠方向、基准最小/最大宽度、拖动、完整对话和减弱动效；当时请求的 840px 被原生最小宽度限制为 1024px，真实 840px 的收放验收见上节。逐帧检查的 26 个工作区固定场景，最大边界误差为 0.015625px；两套导航拖动 36px 均即时响应。原生内容节点、输入草稿和顶栏边界保持，pageerror 为 0。

已查看悬浮导航展开／收起的对比截图，确认工作区保持原位、导航释放空间只增加对话宽度。报告及截图见 [test-results/bot-nav-reflow/](test-results/bot-nav-reflow/)，最终日志为 `test-results/bot-nav-reflow-ui-final.log`、`test-results/bot-nav-reflow-verify.log`。此前调宽动画优先级问题已修复，未通过的试跑不计入通过结果。

## 开发启动连接旧后台导致输入框崩溃（2026-11-16 追加）

从用户当前 Vite 页面核对，报错行是 `draft.value.resources.length`。已确认该开发实例连接到上午残留的旧 Host：getDraft 返回 `{ draft, owner }`，新控制器按直接 DraftSnapshot 读取，导致 text/resources 被写成 undefined。此前使用全新隔离后台的验收未覆盖此升级场景；npm 镜像配置警告不是此次崩溃原因。

启动认证握手现在返回 `bot-workbench/v2` 契约版本。Gateway 只接入匹配版本；对 v1 或无版本标识的旧后台，先核对执行中/排队任务，空闲时正常关闭并启动当前后台。有任务或未知版本不自动停止。草稿读取、保存及提交回执经过结构校验，错误保留有效本地输入并显示提示；异常提交回执继续沿用原请求 ID，避免重复提交。

先用旧包装结构复现失败，再修复至 Bot/草稿 28/28 通过；构建通过。扩展既有 Electron 验收，模拟旧后台常驻，并直接使用当前 `http://localhost:5174` 开发页面：确认新界面读取草稿前旧后台已更新，16 组流程全部通过、25 张截图、pageerror 为 0。报告见 [test-results/bot-ui-host-upgrade-dev/](test-results/bot-ui-host-upgrade-dev/)，日志为 `test-results/bot-host-version-{repro,unit,verify,ui}.log`。模型为本地确定性服务。

隔离验收后，确认真实 OnO 旧后台空闲且原父进程已退出，正常更新该 Host。schema 3→4 自动备份成功；核对 7 个 Bot、11 条对话、2 个任务的 ID 以及原草稿摘要和版本全部保留。记录见 `test-results/bot-live-host-upgrade.json`，只保存标识、计数与内容摘要，不保存正文。原开发窗口处于最小化，未取得其可见状态；可见界面验证在上述同 URL 隔离开发窗口完成。

## Bot 能力标签按大类精简（2026-11-16 追加）

资料区标题改为“能帮你做什么”，保留大类只读标签，不细分具体写作动作。自媒体显示“文章辅助、网页操作、Bot 协作”；日程将长说明简写为“待办管理”。交付件和例行工作不再作为标签重复展示，继续从现有交付件与定时任务入口使用。网页操作的工作区条件放在标签下方，编辑资料页同步采用相同名称。后台能力名录、实际工具和权限保持原注册结果。

`npm run verify` 通过。复用隔离 Electron 名片检查，七个 Bot 及经典／悬浮／窄窗、鼠标移入资料卡共 12 个状态通过，pageerror 为 0；自媒体三个标签在 360px 资料卡内保持一行。检查编辑窗口说明、现有定时任务按钮、键盘关闭和焦点恢复，原后台名录仍包含交付件与例行工作。已查看经典与窄窗截图。证据见 [test-results/bot-capability-labels/](test-results/bot-capability-labels/)，日志为 `test-results/bot-capability-labels-verify.log`、`test-results/bot-capability-labels-ui.log`。

## 主窗口与灵动岛独立草稿（2026-11-16 追加）

未发送文字、引用和任务回复目标按主窗口／灵动岛分别保存；并排与浮动沿用主窗口同一份草稿。两处可以同时输入，移除编辑租约、续约、只读等待和“在此继续输入”。已发送消息、回复和任务状态仍共用总 Bot 主对话；同 Bot 请求进入同一串行队列，发送只清空来源入口。

SQLite v3→v4 在备份后事务新增 `bot_drafts`，以 chat_id + surface 存储独立版本；旧共享正文、版本、引用和回复目标只迁入 main，island 初始为空，Bot 和历史 ID 保持。保存失败保留输入并提供复制、重试；发送准备与迟到回执期间的新输入不被清空，回执不明沿用原请求 ID。主动退出时禁止连接和广播重连事件，避免草稿恢复重新拉起已停止的 Host。

`npm run verify` 通过。Bot/草稿测试 26/26、相关 AI 引用及范围回归 20/20；独立 Host 验收 9 项通过，包含进程重启、原生待办写入及发送去重。本轮使用本地确定性模型服务，没有重新测试外部模型。

最终隔离 Electron 验收 15 组全部通过、24 张截图、pageerror 为 0，覆盖两处同时编辑、主窗口切并排／浮动、灵动岛刷新、两处消息同步、先运行后排队、完整 UI 与 Host 重启后分别恢复草稿及再次执行。已查看 `main-independent-draft.png`、`island-independent-draft.png`，确认不同输入分别保留且没有接管提示。报告与截图见 [test-results/bot-ui-independent-drafts-verified/](test-results/bot-ui-independent-drafts-verified/)，构建及功能日志为 `test-results/bot-independent-drafts-{verify,unit,ai-regression,host,ui-verified}.log`。此前未完成的试跑不计入通过结论。

## 主对话不再重复追加执行记录（2026-11-16 追加）

普通消息仅显示用户消息、Bot 回复和必要的“正在回复…”提示；已完成、已取消记录不再作为卡片追加到主对话末尾。实际有操作/协作的执行、定时工作及待确认、等待资源、失败/中断显示简短状态入口，打开原任务详情处理。完整记录继续位于顶部“任务”；原“回复此任务”改为“在对话中继续”，仍关联原任务并使用同一主对话和输入框。后台任务及历史数据保留。

`npm run verify` 通过。更新既有 Electron 验收脚本，加入普通问候/咨询、失败恢复入口和主对话身份检查；最终 15 组流程全部通过，pageerror 为 0。普通消息处理中不生成任务卡，完成后仅有两问两答；任务页仍可查看两条记录，继续输入不改变主 chatId。待确认入口能打开并实际应用原生待办建议；失败入口能打开原因和继续操作。浮动模式、刷新、灵动岛草稿交接、浏览器授权及后台重启回归通过。

最终报告与 22 张截图见 [test-results/bot-ui-chat-records-final/](test-results/bot-ui-chat-records-final/)，构建日志为 `test-results/bot-chat-records-verify.log`。已查看 `single-main-chat.png`、`chat-execution-records.png`、`chat-pending-confirmation.png` 和 `chat-failure-notice.png`；普通聊天、待处理入口与完整记录的显示范围符合本轮确认。

## 移除并排输入框底行（2026-11-16 追加）

并排输入区不再渲染“草稿已保存 / 历史对话”底行，同步释放该行高度。草稿控制器、异常提示、附件、听写、模型选择和发送行为沿用原实现。

`npm run verify` 通过。使用既有隔离 Electron 验收脚本，13 组流程全部通过，包含草稿切 Bot、切模式、助手收起后恢复及刷新恢复，pageerror 为 0。已查看宽窄窗口截图，确认底行消失、工具栏与输入框边界正常。证据见 [test-results/bot-ui-compose-footer/](test-results/bot-ui-compose-footer/)，构建日志为 `test-results/bot-compose-footer-verify.log`。

## Bot 资料名片移除顶部名称行（2026-11-16 追加）

仅在 `.bot-profile-card` 隐藏重复名称标题，让关闭按钮与头像资料同排，移除原标题区和身份区叠加的顶部留白；资料名片继续以原 Bot 名称提供可访问名称。编辑与记忆窗口沿用原标题样式。

`npm run build` 通过。隔离 Electron 核对七个 Bot 及经典/悬浮、窗口缩放、底部联系人悬停，共 12 个名片场景：顶部不再有名称标题，头像距名片上缘约 20px，关闭按钮不与资料重叠；点击关闭或 Escape 后恢复入口焦点，编辑窗口仍居中，pageerror 为 0。已查看总 Bot 和窄窗名片截图；报告与截图见 [test-results/bot-profile-compact/](test-results/bot-profile-compact/)，构建日志为 `test-results/bot-profile-compact-build.log`。

## 模式下拉增加小示意图（2026-11-16 追加）

使用原 Select 的 `renderOption`，在并排/浮动名称前放置 24×18px 内联 SVG 示意图，颜色跟随文字，图形对辅助技术隐藏。菜单继续固定 148px，顶栏按钮、行高和选中勾保持原样。

`npm run verify` 通过。隔离 Electron 在经典与悬浮导航下，等待展开动画结束后实测菜单宽度均为 148px，无横向溢出；两个图形可见，收起选项没有图形，模式选择、收起后恢复、方向键和 Escape 焦点恢复通过，pageerror 为 0。已查看两种导航的菜单局部截图；证据见 [test-results/bot-mode-diagrams/](test-results/bot-mode-diagrams/)，构建日志为 `test-results/bot-mode-diagrams-verify.log`。

## 收起助手不显示底部胶囊（2026-11-16 追加）

移除全局收起状态的“和 Bot 继续工作”入口及其孤立样式。底部胶囊保留在浮动模式起始或收起输入框时；收起整个助手后，通过顶栏 AI 菜单选择模式重新展开。

`npm run verify` 通过；更新现有 `tooling/bot-ui-pilot.mjs` 的重新展开路径，并断言从面板或菜单收起后不存在助手面板和底部胶囊。隔离 Electron 的 13 组流程全部通过，草稿恢复、浮动胶囊展开/收起及顶栏键盘选择正常，pageerror 为 0。报告与 18 张截图见 [test-results/bot-ui-assistant-hidden/](test-results/bot-ui-assistant-hidden/)，已查看 `assistant-hidden.png` 与 `floating-collapsed.png`，构建日志为 `test-results/bot-assistant-hidden-verify.log`。

## 工作区标题下方留白收紧（2026-11-16 追加）

正文移除叠加的顶部外边距，分隔线到内容上缘统一为 12px，宽窗口原为 26px。`npm run build` 通过；隔离 Electron 在经典/悬浮、1544×1018 / 1024×680 的总台、日程、自媒体页共 12 个场景实测间距均为 12px，pageerror 为 0，已查看宽窄窗口截图。证据见 [test-results/bot-workspace-gap/](test-results/bot-workspace-gap/)，构建日志为 `test-results/bot-workspace-gap-build.log`。

## 工作区标题与页面 Tab 同行（2026-11-16 追加）

总台 `home`、日程 `todo` 移除顶部单项页面按钮，其余工作台的页面 Tab 与“工作区”标题同排，收起工作区按钮留在行尾。分隔线归标题行统一管理，Tab 容器在空间不足时独立横向滚动。

`npm run verify` 通过。隔离 Electron 完成 19 项检查：经典、悬浮导航各七个工作台；1024×680 窄窗、对话栏调至 560px 后的 Tab 滚动及三页切换、工作区收起恢复、助手收起。总台和日程无 Tab，其他页面选中态唯一且与标题同行，收起按钮始终在工作区内，pageerror 为 0。已查看总台、自媒体及最窄工作区截图。报告与八张截图见 [test-results/bot-workspace-header/](test-results/bot-workspace-header/)，构建日志为 `test-results/bot-workspace-header-verify.log`。

## AI 按钮恢复原单图标外观（2026-11-16 追加）

按后续截图确认，顶栏 AI 入口恢复原 36×36、12px 圆角、18px 暖色星芒图标，隐藏下拉箭头；点击仍打开并排、浮动、收起助手菜单，沿用当前选择、键盘操作及后台提示。此项覆盖早先“图标加独立小箭头”的外观记录。

`npm run verify` 通过。隔离 Electron 在经典和悬浮导航下确认按钮尺寸、图标居中与颜色一致；鼠标选择浮动/收起、方向键与 Enter 恢复并排、Escape 关闭并返回焦点均通过，pageerror 为 0。报告及实际截图见 [test-results/bot-ai-button/](test-results/bot-ai-button/)，构建日志为 `test-results/bot-ai-button-verify.log`。

## 左下设置按钮对齐（2026-11-16 追加）

设置入口保留既有胶囊材质、路由和悬停反馈，图标与文字作为一组居中，间距 10px。悬浮胶囊展开时维持 48px 外高，内部点击区域使用 40px，修复沿用 64px Bot 联系人行高导致内容下沉和点击范围溢出的问题。手动收起或窄窗自动折叠时隐藏文字、居中显示齿轮；经典导航同步组内对齐。

`npm run verify` 通过。隔离 Electron 实测两种导航各自的展开、收起、1024×680 窄窗，共六个状态；图标与外层垂直中心误差小于 1px，点击区域完全位于容器内。鼠标点击、Enter 打开、Escape 关闭及焦点恢复均通过，未切换当前 Bot，pageerror 为 0。已查看普通、悬停和收起截图；报告与截图见 [test-results/bot-settings-button/](test-results/bot-settings-button/)，构建日志为 `test-results/bot-settings-button-verify.log`。

## Bot 名片锚点定位（2026-11-16 追加）

名片清除通用 Modal 的 `inset: 0 / margin: auto` 居中约束，按联系人信息按钮在右侧展开；沿用约 12px 的窗口边缘留白与内容滚动。侧向弹层同时观察按钮父容器尺寸，跟随侧栏收起动画；名片打开期间保留信息按钮，避免鼠标移入非当前 Bot 的名片后锚点隐藏、弹层跳到左上角。编辑资料继续使用原居中模态框。

验证：`npm run verify` 通过。隔离 Electron 实测 1280×820 / 1024×680，经典、悬浮、打开后缩窗、底部联系人和鼠标移入名片五个场景，名片与信息按钮间距均为 8px，完整位于窗口内；Escape 关闭后焦点恢复，查看其他 Bot 不切换工作区，编辑窗口仍居中，pageerror 为 0。报告及六张截图位于 [test-results/bot-profile-placement/](test-results/bot-profile-placement/)，构建日志为 `test-results/bot-profile-placement-verify.log`。此轮仅修正定位相关样式、尺寸观察及信息按钮展开状态。

## AI 助手顶栏模式下拉（2026-11-16 追加）

按用户截图要求，将并排/浮动切换从对话标题栏移到全局顶栏 AI 助手图标。下拉包含并排、浮动和收起助手，选中项显示勾选；原按钮的 AI 色彩、后台生成提示和配置/完成气泡锚点保留，菜单打开期间避让气泡。面板内不再重复显示模式选择，任务、交付件、完整对话及独立收起行为保留。

验证：`npm run verify` 通过；顶栏避让和 AI 提示气泡 17 项既有测试通过，日志 `test-results/bot-mode-menu-tests.log`。更新原 Electron 验收脚本的真实入口后，13 组流程全部通过，pageerror 为 0；额外核对顶栏选中态、Escape 关闭/焦点恢复、方向键选择、从下拉收起后再展开及草稿内容保留。报告与 17 张截图保存在 `test-results/bot-ui-mode-menu/`，不覆盖上一轮 Bot 实施证据。

已查看 [经典导航下拉](test-results/bot-ui-mode-menu/topbar-mode-menu-classic.png) 和 [悬浮导航下拉](test-results/bot-ui-mode-menu/topbar-mode-menu-floating.png)。保留 18px AI 图标及独立小箭头，避免通用 Select 的箭头样式缩小/旋转 AI 图标；选项具有明确的可访问名称，勾选符号不混入名称。草稿、业务数据和 Host 协议没有更改，测试使用隔离数据。

## Bot 工作台、双模式与独立 Host（2026-11-16）

界面验收通过：实际 Electron / 正式构建 / 隔离数据，13 组操作检查、15 张截图、renderer pageerror 为 0。报告为 [test-results/bot-ui/report.json](test-results/bot-ui/report.json)，使用 `tooling/bot-ui-pilot.mjs`，包含实际本地 Pi 工具循环、确认写入和浏览器资源桥。完整实施及非 UI 检查结果见[实施与验证记录](docs/requirements/shared/ai-assistant/bot-implementation-validation-2026-11-16.md)。

来源：用户确认的经典双长胶囊、悬浮导航、移除 Bot 身份行、任务/交付件放在对话顶部及 [11-16 六状态稿](docs/requirements/shared/ai-assistant/design/bot-state-review-2026-11-16.md)。实际页面使用七个正式种子 Bot 与原生业务组件，不把设计示例正文做成产品假数据。字号按现有字阶而非生成图的大号文案映射；头像使用新本地资产，功能图标保持原 Phosphor。用户既有八主题和三档材质继续由唯一外观控制器管理。

实际截图目录为 `test-results/bot-ui/`（本地验证证据，Git 忽略）：

| 设计状态 | 实际证据 |
| --- | --- |
| 经典 / 悬浮并排 | `classic-parallel.png`、`floating-navigation-parallel.png` |
| 名片 / 编辑 | `profile-popover.png`、`profile-edit.png` |
| 浮动答复 / 收起胶囊 | `floating-expanded.png`、`floating-collapsed.png` |
| 窄窗 / 外观与键盘 | `narrow-parallel.png`、`keyboard-and-appearance.png` |
| 原生确认 / 浮动任务详情 | `task-confirmation.png`、`floating-task-approval.png` |
| 交付件预览 | `deliverables-preview.png` |
| 总 Bot 两窗口 | `coordinator-shared-draft.png`、`island-coordinator.png` |
| 浏览器授权 / 已核验 | `browser-site-approval.png`、`browser-verified.png` |

已打开检查经典、悬浮、名片、浮动任务、成果预览和浏览器授权截图。1544×1018 / 1024×680 CSS 窗口实测：对话与工作区顶边偏差≤1px、并排不重叠、窄窗工作区宽度>420px、输入框底边在窗口内；浮动输入右边小于任务面板左边。切换经典/悬浮、窗影/青瓷、强玻璃/纯色时工作区四维几何偏差≤1px，纯色 backdrop-filter 为 none。UI 输入来自隔离样本，生产代码不注入假稿件或假回执。

交互通过：七 Bot 可达，待办独立；草稿切 Bot、切模式、收起/展开、刷新后恢复；名片查看不切换 Bot，名称保存生效；当前 Bot 的名片键盘 Enter 打开、Escape 关闭并恢复焦点；任务确认写入真实隔离 Todo Store；交付件可打开和关闭；灵动岛固定总 Bot 并完成双向编辑权交接，非拥有者只读。独立 Host 发起浏览器操作时，实际原生站点授权卡出现、activeTasks 变成 0，批准后继续同一任务并取得浏览器核验结果。

实测修正：同一 Bot 的资料弹窗与对话组件曾重复 key，打开/关闭当前名片后留下重复面板；已使用各自命名空间，并回归断言 DOM 中只有一个助手。交付件预览下层模块标签透出、任务详情进入时自动滚到底部、浮动任务抽屉定位和主输入重叠也已修正并重新检查。异步持久化断言使用显式 await 轮询，先确认草稿已保存再刷新。

补充通过：主窗口位于小墨工作台时，灵动岛交付件可切至总 Bot 并打开具体成果；首次用户目录的模型密钥由 Host 保存后，主进程和 Host 都能解密使用；退出 UI/Host 后重开再次执行模型请求也通过。Bot/灵动岛最终关联回归 102/102 通过。

验证边界：13 组 UI 和构建通过；全量测试 1122 通过、2 个既有 Windows 文件 symlink fixture 因 EPERM 失败，不能记作全绿。Python 通用审计脚本因本机无 Python 未执行。真实外部模型 3 组、Windows 系统托管 5 组另有报告；没有人工验收通知中心点击、实际注销登录或完整休眠唤醒往返。未发布/安装，CMO 未开发。

## 阅读清单与每日签到方案一（2026-11-15）

final result: passed

范围：按用户确认的两张方案一参考重排阅读清单与每日签到页面。阅读页采用约 4:6 的书单／详情同卡布局；签到页采用三页签、集中应用清单与底部自动签到设置。两页标题和内容均在白色卡片上，沿用共享主题、系统字体、字阶与图标，没有修改顶栏、导航、AI 栏或业务存储。

视觉来源：[阅读确认稿](design/reading-list-selected-2026-11-15.png)、[签到确认稿](design/checkin-list-selected-2026-11-15.png)，均为 1568×1003px。实际[阅读页](design/reading-list-applied-2026-11-15.png)和[签到页](design/checkin-list-applied-2026-11-15.png)为原生 Electron 截图，CSS 1599×1000、设备 DPR 2，使用 CSS 比例导出为 1599×1000px。全图对照为 `.tmp/life-pages-native-qa/reading-comparison.png` 与 `checkin-comparison.png`；主卡裁切对照为同目录 `reading-detail-comparison.png` 与 `checkin-detail-comparison.png`。已打开并对照全图和局部，保留各图宽高比，以应用现有字阶映射生成稿的较大辅助字号。

书目资料和笔记来自独立 ReadingStore 与测试 Obsidian 目录，生产页面没有写入示例书目。当前契约不包含封面字段，书籍位置使用 Phosphor BookOpen 图标，不使用示意封面；书单继续按原状态排序。签到三家品牌标识沿用现有本地资产，连接状态、领取状态及未知奖励「—」分别显示。已领取仍保留核对入口，未关联书目的笔记总结／自测动作仍禁用。右侧 AI 区保留应用当前配置与现有上下文表现，没有仿造设计稿的已配置模型状态。

运行检查使用仓库已有 Playwright Electron 方式，在 `WORKBENCH_TEST_DATA_DIR` 和 `WORKBENCH_ISOLATED` 指定的独立目录中打开实际应用。26 组几何快照（含迭代复核）覆盖阅读、签到概览、账号连接、签到记录、三主题、导航展开／折叠、AI 展开／收起，以及 CSS 1599×1000、1279×820、1023×681 的实际视口；1024×680 的窗口请求受应用最小尺寸约束，不记作同尺寸的已渲染视口。两页页头顶边均为 74px，主卡底边为窗口底部减 12px，与侧栏可见玻璃外框及公共内容区一致；所有快照无文档级横向溢出。报告为 `.tmp/life-pages-native-qa/report.json`，页面异常为 0。

交互检查通过：状态与标签交集筛选不写书目；添加／导入弹窗取消不新增书目；Obsidian 打开参数正确；未关联书目的笔记 AI 操作禁用；刷新仅查询三家状态、不调用领取；底部自动签到开启先配置，取消不写入，保存及关闭正确；账号与记录页可切换；说明图标可见并能打开原帮助。签到状态由隔离 IPC 提供，本轮没有验证真实账号领取；Obsidian 打开操作被测试处理器截获，没有启动外部应用。

迭代修正：签到根容器初次受到通用 `.view.on` 规则覆盖，补强局部选择器后主卡延伸到公共底边；进度与标签改为紧凑行；清单窄排阈值调整到 580px，使 653px 内容区仍保留五列与完整底栏；19 本书、65 个标签的压力样本曾将书单挤到 16px，限制标签区为 96px 后书单恢复 465px 且能滚动到底；最小窗口下 12 本待导入书目的确认按钮保持可达。说明按钮原被后续按钮内距压缩图标，明确其局部内距后图标实测为 18×18px。以上问题均已重新截图检查，没有剩余 P0/P1/P2 布局问题。

验证：两份 TypeScript 检查、19 个 CSS 文件字阶检查、保留既有资源的 Vite 构建、主进程／preload 构建和差异空白检查通过。43 项阅读、签到界面、签到服务与 IPC 回归最终全部通过，新增覆盖状态／标签筛选无写入、刷新不领取、自动签到取消／保存／关闭。此前工作区临时目录运行出现间歇存储错误，最终使用系统临时目录运行通过，未修改签到持久化逻辑。截图及检查结果已保存；本轮临时测试窗口已关闭，未提交或发布。

## 命理单行页头确认稿（2026-11-15）

final result: passed

范围：仅重排命理页头，标题及分段切换居左，命例选择、编辑、新建和 AI 解读依次居右。保留共享外框、盘面、命例数据及原操作处理函数。顶栏仍在公共内容区的 74px 上边界。

来源及证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/mingli-header/`。`selected-reference.png` 为用户确认稿（2172×724）；`desktop.jpg` 为实际 App 组件渲染（1799×914），含长名称的命例菜单展开状态，`applied-header.jpg` 为对应页头裁切（1565×75）。`comparison.png` 将来源页头及实现页头按同宽并置；参考是独立组件稿，实现是应用全宽状态，保留应用字号和密度，不以整图缩放后的字号作像素级等同。`geometry.json` 记录 1799×914、1280×800、1000×800 CSS 可视区域及控件边界。

视觉检查：标题、细竖线、等宽胶囊切换和右侧操作顺序符合确认稿；字体沿用应用系统字体与字阶，颜色使用既有主题令牌；图标沿用 Phosphor，无新增图片资产。文案与原有动态 AI 按钮状态保持一致。初次长名称测试发现百分比最大宽度产生多余留白，改为明确的 240px 上限后，635px 内容宽度下操作组保持同一行，页头分为上下两行；1000px 窗口的页头高度约 126.63px，无文档级横向溢出。没有剩余 P0/P1/P2 布局问题。

交互检查：八字、紫微斗数、占星切换均更新所选项及盘面；命例菜单可切换长名称命例；编辑和新建分别打开对应表单，取消可返回。检查页未见控制台 error/warn 或框架错误遮罩，`npm run verify` 通过。使用模拟 IPC 与示例资料，未保存命例或调用真实 AI。内置预览无法连接本机服务，改用 Chrome 检查；窄窗口截图受到浏览器截图超时影响，窄窗口结论依据实际 DOM 几何，未作为视觉截图验收依据。截图仅用于检查，未发布。

## 各页面与侧栏上下边界对齐（2026-11-15）

final result: passed

统一公共内容区与侧栏玻璃外框的上下边界：上缘距顶栏 10px，下缘距窗口底部 12px。移除首页、自媒体、游戏、网页、AI 测试、命理等页面对公共内容区的纵向留白覆盖，保留横向留白、首页卡片尺寸和各页面内部布局；AI 栏同步使用公共上下边界。

使用实际 App 组件及隔离的模拟 IPC 数据，覆盖 15 个导航页面：首页，博客编辑、图文发布、我的小红书，游戏，浏览器、Hush-Hour、个人网站，对比测试、测试任务、运行记录，日程待办、命理、阅读清单、每日签到。侧栏展开／折叠与 1799×914、1280×800 两种 CSS 可视区域组成 60 组检查，公共内容区与侧栏外框上下边界偏差均小于 0.01px，未出现文档级溢出；补查了 AI 栏展开与冷灰主题。短页面的内部卡片按内容高度保留，长页面在公共内容区内滚动。

`npm run verify` 与顶栏布局、日程日期及 AI 工作台导航相关的 31 项回归通过。已查看实际组件渲染的博客编辑截图：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/page-alignment/copy-aligned.png`。本轮验证公共外框几何，未验证真实账号、嵌入网页或外部服务；未发布。

## 拖放避让保留可用对齐行（2026-11-14）

final result: passed

复现额度卡拖到签到卡右侧同一行时，预览被推到更低一格。原因是拖动已按 80px 网格吸附，碰撞避让又按 80px 向下取整，将可用的 352px 行推到 400px。修复只调整 `placeInCanvas` 的碰撞计算：普通空白仍按原网格吸附，碰撞后沿占用卡片底边保留原间距，复用现有默认像素精度，避免额外跨过可用行。预览和松手共用计算；宽高、邻卡位置、样式、业务数据及保存／取消边界不变。

`npm run verify` 和 19 项布局及页面上下文单测通过。隔离 Electron 新增 5 组检查通过：红框行与签到顶部对齐、预览等于松手几何、邻卡不动和取消恢复、保存及重载保留精确对齐行、真正占用区域继续避让且保留间距、普通空白继续 80px 吸附，并覆盖两列容器、暖主题及减少动态效果。目标顶部实测相对画布为 352px，与上方摘要间距 12px，卡片仍为 490×260px；保存的顶部为 4.4 个高度步长。原空白拖放、其他卡片调序、Escape、取消和窄窗口的相关回归继续通过；本轮复跑原落点预览 8 组，页面异常为 0。已查看与签到卡顶边对齐的真实窗口截图。严格静态审计保留 12 项既有发现，无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-row-edge-baseline.json`、`dashboard-row-edge-result.json`、`dashboard-row-edge-aligned-dragging.png`、`dashboard-row-edge-aligned-applied.png`、`dashboard-row-edge-audit.json` 及本轮 `dashboard-drop-preview-result.json`。使用独立测试数据，未发布。

## 卡片与原范围部分重叠时拖放（2026-11-14）

final result: passed

复现红框场景：额度卡向下移动时鼠标仍位于原卡片内部，原处理将它视作拖回自身、清空预览并阻止事件到达画布。修复后源卡片的拖放事件交由画布计算，源卡片不再作为自身调序目标；落点可与自身原范围部分重叠，仍按网格吸附并避让其他卡片。保留原卡片交互、其他卡片的落点排序与方向键排序，尺寸、样式及业务数据不变。

`npm run verify` 通过，19 项布局及页面上下文单测通过。隔离 Electron 先复现旧自动布局和已定位布局的两种失败，再完成 5 组修复验证：原列向下部分重叠、横向移动一列部分重叠、预览与松手几何一致、邻卡不动、取消不改写存储、完成及重载保持位置、Escape 清除预览且保留原位置。已定位额度卡下移 160px，预览及松手后均为 490×260px，位置一致；旧自动布局按既有 80px 网格吸附。原空白拖放、其他卡片落点排序、碰撞避让及窄容器的 8 组窗口回归再次通过，页面异常为 0。已查看部分重叠时的真实窗口截图。严格静态审计保留 12 项既有发现，无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-self-drop-baseline.json`、`dashboard-self-drop-result.json`、`dashboard-self-drop-positioned-dragging.png`、`dashboard-self-drop-positioned-applied.png`、`dashboard-self-drop-audit.json` 及 `dashboard-drop-preview-result.json`。使用独立测试数据，未发布。

## 拖动卡片完整落点预览（2026-11-14）

final result: passed

复现旧自动布局首次拖到右上空位时只显示小型「松开放置」标签。移除空白区域的旧插入排序分支，所有空白落点统一复用 `placeInCanvas`，显示卡片同尺寸、同落点的虚线预览框；预览和松手共用网格吸附与碰撞避让计算。拖到其他卡片调序、方向键排序、卡片尺寸、样式及业务数据不变，首次定位保留邻卡几何位置。清除因此不再使用的旧插入函数和对应单测。

`npm run verify`（字体、双端类型检查及构建）通过。隔离 Electron 8 组检查通过，页面异常为 0：首次拖到旧布局右上空位、下方空位、碰撞避让、Escape、离开画布、原卡片落点排序、取消、完成及重载，并覆盖两列窄容器、冷暖主题和减少动态效果。逐项比对预览与松手后的 x／y／宽／高，误差小于 1px；右上落点实测均为 490×260px。布局存储仅在完成后改写。静态审计保持 12 项既有发现，无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-drop-preview-baseline.json`、`dashboard-drop-preview-result.json`、`dashboard-drop-preview-upper-dragging.png`、`dashboard-drop-preview-applied.png`、`dashboard-drop-preview-audit.json`。使用独立测试数据，未发布。

## 添加卡片浮层缩小（2026-11-14）

final result: passed

按用户要求将添加目录从 640px 宽、最高 520px 缩为 520px 宽、最高 440px；真实预览由 144px 改为 96px，标题、分类、内容和底部内边距同步收紧，尺寸选项最小高度由 36px 改为 32px。浮层定位的高度上限同步为 440px，分类和底部操作固定，内容仍内部滚动。沿用原字号、三类卡片、固定尺寸档位、草稿及完成／取消流程，更换样式浮层保持原 480px 宽。

`npm run verify`（字体、双端类型检查及构建）通过。隔离 Electron 在三主题、100%／125%／225% 缩放、宽屏／短窗口／454px CSS 窄视口下验证三分类共 9 组通过、页面异常为 0。普通窗口实测 520×427.25px；分类、底部操作在可视区，尺寸选项文字保持单行且无裁切，无横向溢出，保持至少 12px 视口边距。实测分类切换、尺寸与样式选择、Escape／取消不改写保存布局，新增卡片仅进入草稿，完成及重载保留选定宽高，原邻卡不变。已查看日程待办两项与额度三项实际截图。严格静态审计保留 12 项既有发现，对比上次无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-small-catalog-result.json`、`dashboard-small-catalog-audit.json`、`dashboard-small-catalog-mist-schedule.png`、`dashboard-small-catalog-mist-quota.png` 等截图。使用独立测试数据，未发布。

## 更换样式采用画笔图标（2026-11-14）

final result: passed (icon replacement and build verification)

用户从三个实际图标候选中选定画笔。共享 `GameOptionsMenu` 仅将 dashboard 分支的 Swatches 换为 Phosphor PaintBrush，继续使用 16px 图标；26px 按钮、悬浮样式、菜单及键盘逻辑保持原实现。设计约定已同步。`npm run verify`（字体、双端类型检查及构建）和差异空白检查通过。严格静态审计仍为 12 项既有发现，对比上次无新增。选定图标的默认与悬浮预览见 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/style-icon-choices.png`；此轮未重跑原生窗口流程，未发布版本。

## 工作台公共外框稳定性（2026-11-14）

final result: passed (isolated shell geometry)

移除自媒体、网页和 AI 测试工作台对公共顶栏、侧栏外框的局部覆盖。修复前隔离浏览器实测：首页／小工具侧栏外框上缘为 74px，三个工作台为 80px，侧栏高度相差 6px；顶栏尺寸相同，但边框、材质和投影随工作台切换。修复后所有工作台复用共享外框样式，不修改页面内容布局、66px／200px 侧栏宽度、开合动画和导航选中滑块。

隔离页面加载生产 `src/shell.css` 与各模块样式，并使用公共外壳 DOM 验证工作台切换：三主题 × 两种开合状态 × 六工作台共 36 组，1100×750 CSS 窄窗口的两种状态共 12 组，窄窗口加 AI 栏与长内容共 6 组，合计 54 组、9 个对照组。按开合完成后的状态测量，顶栏、侧栏可见外框、Logo 的位置与尺寸及外框材质在各对照组内完全一致；顶栏左／上边距 10px、高 54px，侧栏左边距 10px、上缘 74px、宽 66px／200px，浏览器小数像素误差低于 0.01px。控制台错误为 0。此为公共外壳渲染验证，不代表各业务页面端到端验收。

`npm run verify`（字体、双端类型检查及构建）和顶栏布局、日期、验收脚本约束及工作台会话导航共 31 项测试通过。原生测试版仍在 `http://localhost:5174/`，未切换其页面或操作看板草稿；桌面访问受限，原生截图未作为验收证据。临时验证页已关闭，未发布。

边界数据与修复前对照：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/shell-stability/result.json`。

## 更换样式浮层缩小（2026-11-14）

final result: passed

按用户要求，仅收紧卡片右上角的更换样式浮层：宽度从 660px 改为 480px，内边距 12px 改为 10px，选项间距 8px 改为 6px，预览高度 144px 改为 96px，并收紧标题及预览外边距。沿用真实预览、字号、选择边框、勾选与原键盘交互；添加目录保持原 640px 宽及 144px 预览。

`npm run verify`（字体、双端类型检查及构建）通过。隔离 Electron 在三主题及 100%／125%／225% 缩放下验证签到两项、额度三项、图表两项，共 9 组通过、页面异常为 0。普通窗口实测 480×179.7px，较原约 660×239.7px 收紧；454px CSS 窄视口保持单列内部滚动和至少 8px 边距，未横向溢出。已有图表的禁用说明、Home／End、Escape／焦点恢复正常；浮层打开不移动原卡片，取消后保存数据不变，添加目录尺寸也未受影响。已查看普通窗口的三项预览与已有图表禁用截图。严格静态审计保留 12 项既有发现，按文件／规则／消息对比无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-compact-style-result.json`、`dashboard-compact-style-audit.json` 及 `dashboard-compact-style-mist-quota.png`、`dashboard-compact-style-mist-today.png` 等截图。使用独立测试数据，未发布。

## 签到移除应用并排选项（2026-11-14）

final result: passed

按用户红框要求，从添加目录与卡片更换样式共用的可选项中移除「应用并排」，仅保留列表和应用卡片。已有并排与领取进度卡片兼容显示；打开目录时预选列表，取消不改写，显式应用后才转换。已有列表／应用卡片保持当前预选，新增签到卡片默认列表。未改变领取、账号管理、布局格式或原默认看板。

`npm run verify`（字体、双端类型检查、构建）通过。隔离 Electron 三组实际流程通过、页面异常为 0：四种历史配置的目录选项与取消恢复；更换样式的键盘选择、尺寸不变及完成重载；新增卡片默认列表且取消撤销。已查看实际两种样式截图。严格静态审计仍为 12 项既有发现，按文件／规则／消息对比上次审计无新增；差异空白检查通过。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `checkin-remove-parallel-result.json`、`checkin-remove-parallel-audit.json` 及 `checkin-remove-parallel-catalog.png`。使用独立测试数据，未发布。

## 日程待办图表互相更换样式（2026-11-14）

final result: passed

修正添加目录已合并为「日程待办」、卡片自身仍按单独类型禁用入口的不一致。待办摘要与日程待办统计的入口均展示两张真实图表缩略图，选择同步更新原有卡片 ID、样式、标题与内容；宽高、顶部偏移、坐标、顺序及邻卡保持，完成保存、取消恢复。另一种图表已存在时，选项显示「已在看板中」并禁用，防止重复卡片；移除另一张后即可切换。沿用原存储格式，无迁移。

`npm run verify` 与 20 项首页／页面上下文回归通过。隔离 Electron 实测 4 组通过、页面异常为 0：鼠标与键盘双向切换及焦点返回；两个方向完成后重载、位置与大小持久化；两图同时存在时禁用、跳过及移除后转换；旧样式兼容、三主题、125%／225% 缩放、454px CSS 窄视口、减少动态效果及视口避让。已查看实际小图选择与已有图表禁用截图。严格静态审计保留 12 项既有发现，按文件／规则／消息对比上次缩略图审计无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-chart-style-switch-result.json`、`dashboard-chart-style-switch-audit.json`、`dashboard-chart-style-switch-summary-open.png`、`dashboard-chart-style-switch-statistics-open.png`、`dashboard-chart-style-switch-schedule-stats-already-present.png` 及三主题截图。使用独立测试数据，未改动真实账号或看板布局，未发布版本。

## 看板更换样式缩略图浮层（2026-11-14）

final result: passed

按用户参考，将卡片的文字样式菜单改成 660px 宽的缩略图浮层，复用添加目录的真实 `DashboardPreview` 与卡片内容，按当前宽高等比缩小；下方名称、选中边框和勾选对应同一选项，点击整张小图即时更新样式草稿。保留原位置、尺寸、完成保存及取消恢复；仅打开时挂载预览，预览内部 inert。扩展共享 dashboard 菜单的左右方向键，并在窄窗打开时将当前选项滚入浮层可视区；其他菜单变体保持原交互。

`npm run verify`（字体检查、双端类型检查及构建）和 20 项首页／页面上下文回归通过。隔离 Electron 实测 4 组通过、页面异常为 0：签到／额度／专注的真实小图、当前项及全部方向键、Home／End、Escape／焦点返回、整图点击与取消恢复；完成后重载只持久保存样式；旧样式转换及添加目录兼容；三主题、125% 与 225% 缩放、454px CSS 窄视口的单列滚动和选中项可见性、视口避让、减少动态效果、外部点击和实际画布滚动收起。预览源卡为 741×260px，与原卡尺寸一致；额度四个来源和签到三个平台均完整出现，卡片几何与保存坐标不变。已查看实际截图。严格静态审计保留 12 项既有发现、按文件／规则／消息对比无新增；差异空白检查通过。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-style-thumbnails-result.json`、`dashboard-style-thumbnails-audit.json`、`dashboard-style-thumbnails-checkin.png`、`dashboard-style-thumbnails-quota.png`、`dashboard-style-thumbnails-focus.png`、三主题截图及 `dashboard-style-thumbnails-narrow-current.png`。使用独立测试数据目录，未改动真实账号或布局，未发布版本。

## 看板三个工具按钮统一悬浮效果（2026-11-14）

final result: passed

排序、更换样式、移除统一使用 26×26px、6px 圆角、主题浅色悬浮底块、图标高亮和 150ms 过渡，工具区调整为 90px。原拖动手势和禁用状态保留；禁用样式按钮的底块与其他按钮一致，仅图标置灰。`npm run build` 通过。隔离 Electron 的三主题及禁用／减少动态效果共 4 组验收通过，真实 hover 后计算底色、图标颜色、尺寸、圆角、过渡参数完全一致，卡片位置和本机保存布局不变，页面异常为 0。严格静态审计保留 12 项既有问题、无新增；差异空白检查通过。

证据：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/dashboard-tool-hover-result.json`、`dashboard-tool-hover-audit.json`、`dashboard-tool-hover-drag.png`、`dashboard-tool-hover-style-trigger.png`、`dashboard-tool-hover-remove.png`。使用独立测试数据，未发布版本。

## 命理方案一主卡与右侧分析（2026-11-14）

final result: passed (selected layout and component regression)

按用户最新[方案一参考](docs/design/mingli-v1-2026-11-14/selected-reference.png)，将四柱命盘与大运流年合并到左侧主卡，右侧五行与神煞各自成卡，约 2:1 排列并对齐底边。页头保留已确认的胶囊页签及原操作；新增小环图读取真实五行数量，颜色与右侧统计共用语义 token。排盘、存储、紫微及占星算法、全局导航与 AI 路由未改动。保留完整大运、流年、十神与农历信息，因此实际内容比参考中的简化示意更密。

`npm run check:typography`、`npm run typecheck`、`npm run build` 通过。三个既有命理测试文件共 41 项：40 项整批通过，1 项命例清除可选字段的保存测试遭 Windows 临时文件重命名 EPERM，单独重跑通过，未修改存储实现。差异空白检查通过。

通过 Computer Use 在现有 Vite 服务的隔离夹具中加载实际 `BaziView`、真实排盘计算和共享样式，检查宽屏卡片关系、大运切换至 1998–2007 年、两份合成命例切换后环图与统计同步、编辑面板打开及取消、八字／紫微斗数／占星切换和 AI 入口。三个主题沿用原表面及五行颜色；720px 内容视口下分析卡并排移至主卡下方，400px 下全部单列，均未检测到横向溢出。夹具不读写真实命例或调用外部 AI，临时浏览器视口已恢复，Chrome 检查页已关闭；未新增 Electron 测试实例。

已人工核对[实际组件截图](docs/design/mingli-v1-2026-11-14/bazi-applied.png)及[同内容宽度参考对照](docs/design/mingli-v1-2026-11-14/reference-comparison.jpg)。保留产品既有字阶及完整数据，不复制「示例数据」标记到真实用户命盘。截图证据为隔离组件，原生 Electron 整窗及窄屏截图未完成（浏览器截图接口间歇超时）；窄屏结论来自实际 DOM 几何检查，未声称完成所有原生窗口流程的视觉验收。旧第三版的验收记录保留在下方供追溯；本次未发布。

## 看板卡片更换样式入口（2026-11-14）

final result: passed

编辑模式每张卡片右上角新增 26px「更换样式」图标按钮，位于排序柄和移除之间；普通模式隐藏，工具区保持 83px 以稳定标题位置。复用 `GameOptionsMenu` 的 dashboard 变体，菜单只提供该类型现有可用样式，显示当前勾选，选择即时修改草稿。宽高、坐标、顺序及业务入口保留，完成保存、取消恢复；没有其他样式时置灰并说明，旧配置可显式转为现有样式，转换后入口禁用时焦点移至排序柄。

`npm run verify`（字体检查、双端类型检查及构建）与 20 项首页／页面上下文回归通过。隔离 Electron 的 4 组验收通过、页面异常为 0：编辑态按钮与单样式禁用、同类选项及当前项、方向键选择与 Escape／焦点返回、实时更新后尺寸坐标不变及取消恢复；完成与重载仅保存样式；旧摘要／签到样式兼容且退出选项不重新出现；三主题、1000px 原生窄窗口及 125% 缩放、减少动态效果、视口边界、外部点击与实际滚动关闭。缩放截图使用 Electron `capturePage`，避免 Playwright 缩放裁切；实际 CSS 视口宽度为 818px。严格静态审计保留 12 项既有问题，按文件／规则／消息对比上次画布审计无新增；没有将其报告为全库审计通过。

证据：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/dashboard-style-menu-result.json`、`dashboard-style-menu-audit.json`、`dashboard-style-menu-open.png`、`dashboard-style-menu-applied.png`、`dashboard-style-menu-mist.png`、`dashboard-style-menu-cool.png`、`dashboard-style-menu-warm.png`。均使用独立测试数据目录，不改动真实账号或看板数据；未发布版本。

## 看板整片空白画布落位（2026-11-14）

final result: passed

用户确认拖到鼠标附近的网格位置并允许留白。先在隔离 Electron 复现：下方空白在原网格边界之外，真实拖动不改变卡片位置。修正为画布填满可用空白，横向按列、纵向按原 80px 步长吸附；同尺寸虚线框预览落点，占用区域向下寻找空位。首次定位保留其他卡片位置，坐标进入布局草稿，完成保存、取消恢复；旧布局、固定宽高和样式保留。定位后的缩放继续固定相对边，连续反向拖回原尺寸时恢复原坐标；临时缩窗只映射并避让，不覆盖其他卡片的保存位置。

`npm run verify`、17 项首页回归及差异空白检查通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，6 组验收通过、页面异常为 0：两张 741×260px 卡片中，额度从相对画布顶部 0px 移至 480px，预览与松手结果相同，签到位置及两卡尺寸不变；覆盖完成重载、取消、返回上方空位、碰撞避让、Escape、普通及 Alt 方向键、定位后的上下边锚点与连续反向缩放、三主题、1000px 窗口及 125% 缩放、受限单列容器、减少动态效果和新增卡片。另验证窄窗避让状态下的编辑，恢复宽窗后未编辑邻卡仍使用原坐标。已人工检查实际截图；strict 审计维持 13 项既有发现，无新增。测试仅写隔离布局，未发布或改动正式数据。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-canvas-drop-*` 文件。

## 卡片上下边缩放锚点（2026-11-14）

final result: passed

先在隔离 Electron 复现原问题：上边向下缩一档时顶边停在 204px，底边从 464px 上移到 384px。修正为上边调高固定底边、下边调高固定顶边；将上边缩高产生的顶部留白按原 80px 高度步长保存，向上扩展不越过所在网格行顶部。高度仍只有 1／2／3／4 行，原宽度、排序、细悬浮高亮和草稿保存边界保留；旧布局无位置字段时继续顶对齐，取消同时恢复高度和位置。

`npm run verify` 与 13 项首页回归通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，3 组界面验收通过、无页面异常：同布局修正后顶边从 204px 下移到 284px，底边保持 464px，同排签到位置不变；覆盖松手、完成重载、向上拉回及行顶部边界、下边固定顶边、Escape／取消、单卡独占一行、全高度档位、键盘、三主题、1000px 窗口与 125% 缩放及减少动态效果。已人工检查修正后截图；strict 审计维持 13 项既有发现、无新增。验收仅写隔离布局。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-resize-anchor-*` 文件。

## 命理系统分段按钮（2026-11-14）

final result: blocked (screenshot verification)

按[分段按钮参考](docs/design/mingli-v3-2026-11-14/system-tabs-reference.png)，仅调整 `.bazi-syseg` 的底槽、等宽排列与内距，沿用三主题颜色及原页签行为。`npm run check:typography`、`npx vite build` 通过；隔离命例实测底槽约 238×36px、三个按钮均约 76×30px，八字／紫微斗数／占星点击后选中态及可见命盘对应正确。截图接口超时，未完成像素截图核对；未将本项标记为完整视觉通过。临时检查服务已关闭。

## 卡片四边悬浮高亮收细（2026-11-14）

final result: passed

按用户要求，仅将共享尺寸柄的悬停／聚焦／拖动背景从整条 24px 命中区域收为居中的 4px 细带。命中范围、短柄、键盘焦点轮廓及固定档位拖动保持原实现，卡片内容和布局不变。颜色继续消费现有 `--acc-soft`，设计文档同步记录。

`npm run verify` 通过。Browser plugin not available；使用已安装 Playwright 与隔离数据目录的原生 Electron，3 组界面验收通过、无页面异常：四边实测高亮 4px／命中 24px，距细带中心 8px 的位置仍可启动拖动，尺寸按档位变化且 Escape 恢复；三主题保留 2px 键盘焦点轮廓和方向键调尺寸；1000px 窗口及 125% 缩放、减少动态效果、取消不改写布局均正常。已人工检查悬浮截图；strict 审计仍为 13 项既有发现、无新增。本次验收仅写隔离布局。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-resize-thin-*` 文件。

## 命理第三版卡片布局（2026-11-14）

final result: blocked (remaining visual verification)

已按[选定参考](docs/design/mingli-v3-2026-11-14/selected-reference.png)实施独立页头、四柱命盘、大运流年、五行与神煞卡片，统一干支粗体并保留五行语义色；紫微盘及辅助分析各自成卡，占星暗色盘继续沿用原实现。未变更排盘算法、命例读写、全局导航或 AI 路由。

`npm run verify` 通过。8 个既有测试文件共 85 项：整批 84 项通过，1 项命例保存测试受 Windows 临时文件重命名 EPERM 阻断，单独重跑通过。strict 审计维持 13 项既有发现，命理文件无新增发现。隔离命例的真实组件检查已确认四卡层次、无横向溢出、大运选择更新流年、运年收起与重新展开、紫微页签切换；未读写用户命例或看板布局。

已保存[首次结构截图](docs/design/mingli-v3-2026-11-14/bazi-applied.jpg)及[参考对照](docs/design/mingli-v3-2026-11-14/initial-comparison.jpg)，两者均拍摄于最终干支字体调整之前，不能作为最终视觉通过证据。截图核对途中，电脑控制因无法可靠确认 Windows 当前浏览器 URL 而中止；随后停止浏览器操作及临时检查服务。最终字体截图、占星页、三主题、窄容器、命例菜单与编辑入口、键盘全流程尚未完成视觉验收，不能标记 passed。

## 日程待办添加分类合并（2026-11-14）

final result: passed

按用户红框，将添加目录中的「待办摘要」和「日程待办统计」合并为「日程待办」，与每日签到、AI 额度形成三个分类。分类内保留完成与待办堆叠图、日程与待办对比图两个真实预览；切换分类保留图表选择及各自的尺寸草稿。沿用原卡片标识、统计口径、顺序和尺寸，两张卡片仍可共存，仅添加或应用当前选择；Escape、取消与主页面完成保持原保存边界。

`npm run verify` 与 11 项首页回归通过。Browser plugin not available；使用已安装 Playwright 与隔离数据目录的原生 Electron，4 组界面验收通过、无页面异常。覆盖三分类与双预览、选择和尺寸记忆、已有两卡独立更新、取消恢复、完成及重载、旧摘要样式保留、缺失卡片与空看板添加、预览和实际卡片几何一致、三主题、1000px 窗口及 125% 缩放、键盘选择与减少动态效果，签到及额度的样式目录保持。已人工检查合并目录截图；strict 审计维持 13 项既有发现、无新增。验收仅写隔离布局。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-schedule-category-*` 文件。

## 签到应用卡片样式（2026-11-14）

final result: passed

按用户要求，为每日签到新增「应用卡片」样式，沿用 AI 额度的品牌浅色单元、细边框与原 Logo。三个平台显示真实状态，确认领取后才显示奖励，零值与未知金额区分；并排、列表、旧领取进度及默认布局保留。一键签到与管理账号继续使用原操作，目录与看板共用内容组件、响应式断点和实际宽高。小尺寸减少汇总文案并按需滚动，所有平台与操作可达。

`npm run verify`、41 项签到／IPC／界面与首页回归通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，5 组界面验收通过、无页面异常。覆盖三样式选择、默认样式不变、Escape／取消不改写、完成重载、未连接与成功状态的预览几何和字体颜色一致、确认奖励／真实零／未知金额、所有非成功状态不显示奖励、处理中禁用、原一键签到参数、管理账号键盘导航、窄卡两行完整显示、1000px 窗口及 125% 缩放、三主题、减少动态效果、读取失败和延迟读取恢复。已人工检查宽卡与窄卡截图；strict 审计维持 13 项既有发现、无新增。本次界面验收使用合成状态，不连接或领取真实账号奖励。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-checkin-tiles-*` 文件。

## 看板空白格拖放（2026-11-14）

final result: passed

原实现仅给卡片绑定落点，截图中摘要右侧的空白格无法接收拖动。先在隔离 Electron 中以四列摘要、四列签到、两列额度复现失败，再为网格空白补上拖放处理：按视觉阅读顺序插入下一张卡片之前或末尾，悬停显示「松开放置」。仅更新顺序草稿，所有卡片尺寸和样式保持，原卡片目标与键盘排序沿用原实现。

`npm run verify` 与 11 项首页回归通过。Browser plugin not available；使用已安装 Playwright 与隔离数据目录的原生 Electron，3 组界面验收通过、无页面异常。覆盖截图中真实鼠标拖入首行右侧空白并与摘要同顶、取消恢复、完成及重载保留、末尾空位、原卡片落点和方向键、提示显示与 Escape 取消、三主题，以及 1000px 窗口、125% 缩放下的双列紧凑布局与减少动态效果。已人工核对空位提示及放置后截图。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-empty-drop-*` 文件。

## 看板排序柄移至右上角（2026-11-14）

final result: passed

按用户红框，将所有卡片的排序柄从标题左侧移至右上角、移除按钮左侧；左侧始终保留卡片类型图标，右侧预留 51px 工具空间，进入编辑时标题及正文位置稳定。只调整共享 `DashboardCard` 头部结构与工具区布局，拖动、方向键、草稿及保存流程沿用原实现。

`npm run verify` 通过。Browser plugin not available；使用已安装 Playwright 与隔离数据目录的原生 Electron，3 组界面验收通过、无页面异常。覆盖五种卡片的工具排列与对齐、编辑前后标题及正文几何一致、真实鼠标拖动及方向键排序、取消恢复、完成重载、相邻移除按钮、1000px 窗口与 125% 缩放、三主题焦点及减少动态效果。已人工核对编辑状态截图；strict 审计仍为 13 项既有发现、无新增。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-drag-top-right-*` 文件。

## 计划日期摘要与日程待办统计（2026-11-14）

final result: passed

按用户确认将待办摘要改为含今天的近七天任务堆叠图，按计划日期归组、当前完成状态分色：绿色已完成、蓝色待办（含进行中），更早未完成任务单列。新增日程待办统计卡片，展示今天起七天的未完成日程与待办，使用紫／蓝并排柱、分类数量和日期范围。新卡进入添加目录，默认四列两行；已有及默认看板不自动增加卡片，添加和尺寸调整沿用草稿、完成与取消边界。两图共用真实事项库、页面时钟及相同预览组件。

`npm run verify` 与 10 项首页回归通过，覆盖计划日期和实际完成日期不同、改期及重新打开、缺少完成时间、进行中、删除项、过去及窗口外事项、跨年和空数据。Browser plugin not available；使用已安装 Playwright 与隔离数据目录的原生 Electron，6 组界面验收通过、无页面异常：零值目录与取消、合成事项精确计数及保存重载、改期／状态／删除恢复实时更新、日程待办路由、窄窗与 125% 缩放／三主题／减少动态效果／小尺寸及四边尺寸键盘兼容、跨午夜自动推进窗口。三组预览与保存后卡片的文本、颜色和几何尺寸一致，普通两行卡片无内部溢出。已人工核对正常窗口和缩放截图；strict 审计维持 13 项既有发现、无新增。验收仅写隔离事项与布局。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-schedule-stats-*` 文件。

## 看板四边吸附调尺寸（2026-11-14）

final result: passed

按用户选择用上下左右四条边拖动替代原右下角调宽图标：左右仅吸附 2／3／4／6 列，上下仅吸附 1／2／3／4 行，继续由原网格自动排列。每边提供 24px 命中区域和短柄，拖动显示当前尺寸；Escape 或指针中断恢复该次拖动前的宽高，焦点移开后仍可用 Escape。松手只更新草稿，主页面完成／取消保持原保存边界；正常浏览和目录预览均不显示编辑工具。

`npm run verify` 与 8 项既有首页回归通过。Browser plugin not available；使用已安装 Playwright 与独立测试数据目录的原生 Electron，9 组界面验收通过、无页面异常。覆盖四类卡片的四边真实鼠标拖动、全部宽高档位及边界、网格重排中的指针捕获、Escape／失去捕获回退、方向键与 Home／End、排序及移除取消、完成与重载、目录预览尺寸一致、三主题焦点、减少动态效果、125% 两列和 200% 单列。响应式渲染宽度相同时保留原逻辑档位，避免不可见的保存值变化。已人工核对拖动尺寸提示和窄窗截图；strict 审计维持 13 项既有发现、无新增。验收仅使用隔离数据，未发布或修改真实看板布局。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-edge-resize-*` 文件。

## 用户昵称看板标题（2026-11-14）

final result: passed

首页页头改为「{个人资料昵称}的看板」，空白昵称回退「我的看板」，复用已有 `userName`。沿个人资料原头像更新回调路径传递昵称成功回调，保存成功后立即同步页头、问候与头像；设置中的昵称说明同步更新。布局、导航名称及统计不变。

`npm run verify` 与 9 项首页／设置回归通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，2 组界面验收通过、无页面异常。覆盖保存昵称后无需重载更新、首尾空白清理、重载保留、中文昵称、拒绝空昵称、20 字符长昵称、1000px 窄窗与 150% 缩放无标题水平溢出，原看板布局未改变；已人工核对昵称标题截图。strict 审计仍为 13 项既有发现、无新增。所有改名仅作用于隔离验收数据，未改真实个人资料。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-user-title-*` 文件。

## 待办摘要统一命名（2026-11-14）

final result: passed

按用户要求将「今日摘要」统一改为「待办摘要」，仅修改 `HomeView.tsx` 的共享名称映射，目录分类、内容标题、卡片预览、首页及相关无障碍控件名称同步更新；内部 `today` 标识、已有布局及七天完成统计不变。当前设计与需求文档同步采用新名称，历史验收记录保留原称。

`npm run verify` 通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，2 组验收通过，覆盖各展示位置与无障碍名称、取消后布局不变、重载后标题与七天统计保留，无页面异常。strict 审计维持 13 项既有发现、无新增。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-todo-summary-*` 文件。

## 卡片宽度选项单行显示（2026-11-14）

final result: passed

按用户红框将宽度标签改为「2 列 · 1/3」「3 列 · 1/2」「4 列 · 2/3」「6 列 · 整行」，仅修改 `HomeView.tsx` 的显示文案及目录尺寸按钮的换行规则，复用共享 `Segmented`；档位值、卡片尺寸计算及高度选项不变。宽度与高度按钮同高，未修改全局控件。

`npm run verify` 通过。Browser plugin not available；使用已安装 Playwright 与独立数据目录的原生 Electron，3 组验收通过，无页面异常。文本范围实测为单行，四个按钮同排同高，无裁切或水平溢出；覆盖全部宽度选择、方向键、应用／完成保存、取消恢复及重载，三主题、1000px 窄窗、125% 放大与 500px 浮层边界，Escape 恢复焦点。已人工核对实际浮层截图。strict 审计维持 13 项既有发现，无新增。证据在 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-width-inline-*` 文件。

## AI 额度四账号布局（2026-11-14）

final result: passed

取消首页额度内容只取前两项的限制，Codex、Z Code、Cursor、Grok Bot 四个来源完整显示，未连接项不被过滤。进度条与紧凑圆环默认 2×2，内容宽度达到 600px 时四列；列表为账号、周期／状态及剩余值对齐的四行。默认两行高度完整显示四项，一行小卡按需局部滚动。目录和首页继续共用同一组件与容器规则，不修改缓存读取、最低剩余窗口计算、实际接入数量或账号设置入口。

`npm run verify`、8 项首页回归及 `git diff --check` 通过。Browser plugin not available；使用已安装 Playwright 和独立数据根目录的原生 Electron，8 组界面验收、31 组预览／保存几何对比通过，页面异常及控制台警告均为 0。覆盖四项空态／已连接／混合连接状态，最低窗口、0%／100%、待授权、更新延迟、恢复中、缓存错误、读取中／失败恢复、三主题、全部宽高档位、1000px 窄窗、125% 放大、500px 浮层边界、减少动态效果、取消及设置导航。四家图标均解码且保持比例，默认卡片无水平或垂直溢出；预览／实际节点几何误差小于 0.3 CSS px。静态 strict 审计仍为 13 项既有发现，相对上次基线无新增，首页改动文件无命中。

真实截图人工核对三种四账号卡片及目录缩略图。额度数值为隔离进程的合成测试数据，仅替换主窗口主帧的 `island:quotas` 读处理器，原样恢复后关闭进程，未登录或操作真实账号。验收脚本、结果、构建日志、审计和截图位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-quota-four-*` 文件中。

## 日程待办共用页头新增入口（2026-11-14）

final result: passed for changed workflow

按用户标注将唯一「新增」入口从待办卡片移至页头卡片右侧并垂直居中，继续复用原按钮、锚定浮层与待办／日程表单；待办卡片保留「全部事项」。`npm run verify`、2 项日周导航／嵌套关闭回归及 `git diff --check` 通过。真实组件浏览器验收 8 组通过，覆盖位置、日程时间校验与创建、待办成功／失败重试、忙碌防重复、草稿保护、键盘及焦点、三主题和 1024／736／375px，无页面异常。证据位于 `.tmp/todo-create-header-qa/`；仅使用合成事项，未刷新有草稿的现有测试实例。DESIGN lint 无错误、1 项既有格式警告；全仓静态审计仍为其他页面的 13 项既有发现，改动文件无发现。

## 移除空看板提示卡（2026-11-14）

final result: passed

按用户确认移除「添加你的第一张卡片」整张占位卡及专属样式，空看板直接留空；页头「添加卡片」、现有目录、草稿取消与完成保存保持。`npm run verify`、8 项首页回归与 `git diff --check` 通过；strict 静态审计相对上次 13 项基线无新增。

Browser plugin not available；使用已安装 Playwright 与独立数据根目录的原生 Electron，3 组界面验收通过、页面异常为 0。覆盖空布局重载不回填、唯一页头添加入口、添加后焦点、取消恢复空布局、保存重载、移除最后一张卡片、1000px 窄窗及 Escape 焦点恢复。实际截图确认大面积白色提示卡消失，未操作真实业务数据。脚本、结果及截图保存在 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `dashboard-remove-empty-*` 文件中。

## 日程待办按钮下方新增浮层（2026-11-14）

final result: passed for changed workflow

复用共享 `Modal` 的非模态锚定变体及原 `TaskEditor`，主页面新增在按钮下方右对齐打开；默认高度由内容决定，详细设置受视口约束并内部滚动，下方不足时向上避让。编辑事项及其他宿主仍保持原模态形式。无数据或接口变更。

`npm run verify`、2 项嵌套关闭／日周导航回归及 `git diff --check` 通过。Playwright 真实组件验收 7 组通过：位置与焦点、重复点击／外部点击／Escape、草稿确认、创建成功／失败重试／忙碌防重复、优先级与标签及嵌套日历、日程时间校验与创建、Ctrl+N 与原编辑模态；覆盖三主题、1024／736／375px 和减少动态效果，无页面异常。合成事项仅用于独立浏览器夹具；证据在 `.tmp/todo-create-qa/`。DESIGN lint 无错误、1 项既有格式警告；全仓 premium 审计仍列出其他页面 13 项既有发现，本次改动文件无发现，未修改这些页面。只读确认现有 Electron 仍有布局编辑草稿，未强制刷新或新开测试实例。

## 卡片所见即所得与 AI 额度样式（2026-11-14）

final result: passed

目录与首页复用 `HomeView.tsx` 中的 `DashboardCard` 和同一内容组件，按当前画布列宽与所选行数确定真实尺寸后等比缩小。移除预览专用字号、图标竖排、隐藏底部操作及签到简化分支；保留完整标题、品牌、连接／管理按钮和分隔线。预览对应保存后的普通卡片，编辑工具不进入缩略图；内容 inert，选择按钮与卡片为同级节点。额度三样式分别为品牌进度条、并排圆环和对齐列表，未知值保留连接状态，真实零值及缓存状态区分显示。默认高度下无多余卡内滚动条。

`npm run verify`、8 项 `tests/home-dashboard.test.ts` 回归及 `git diff --check` 通过。Browser plugin not available；使用本机已安装 Playwright 和独立数据根目录的原生 Electron。8 组交互验收、27 组预览／保存对比通过，标题和正文的可见文本、字体、颜色、排列及缩放前几何一致，节点几何误差小于 0.3 CSS px。覆盖签到并排／列表、摘要、三种额度样式，全部宽高档位、三主题、1000px 窄窗、125% 缩放、500px 浮层边界压力检查、减少动态效果、Escape 焦点恢复、草稿取消及原账号设置入口；无页面异常或控制台警告。

额度使用真实隔离空态及合成 24%／68%、0%／100%、待授权、更新延迟、恢复中、连接异常、读取中与读取失败状态；保持取最低窗口及最多两项的口径，四家原图标均解码并按比例显示。合成数据只替换隔离验收进程的 `island:quotas` 读处理器，限定原主窗口主帧，并原样恢复函数后关闭进程；未登录、签到或修改真实账号。strict 静态审计仍有 13 项既有问题，相对前次 15 项基线无新增，本次卡片文件无命中，不能据此宣称全仓审计通过。

验收脚本、结果、构建日志和截图位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-quota-wysiwyg-pilot.mjs`、`dashboard-quota-wysiwyg-result.json`、`dashboard-quota-wysiwyg-final-verify.log`、`dashboard-wysiwyg-checkin-preview.png`／`dashboard-wysiwyg-checkin-applied.png`、`dashboard-quota-bars-fixture-preview.png` 及各样式的实际卡片截图。带 fixture 或 boundaries 的额度截图均为测试数据。本次不发布版本。

## 日程日期直选、日／周切换与移除今日复盘（2026-11-14）

final result: passed

日程卡复用共享月历和日／周分段控件：支持年月直选、逐日／逐周翻页、回到今天、跨年范围、周清单日期进入日视图及有日程圆点。本页移除今日复盘按钮、弹窗和 AI 总结回调；右卡事项库、新增、编辑和待办完成确认保留。

11 项日程与共享日期控件回归通过，`npm run verify` 通过。真实 `TodoView`、`TodayBoard` 和共享控件在隔离 Chrome 中完成交互检查，页面异常为 0；覆盖日期年月直选及 Escape 焦点恢复、日／周空态与跨年、日期浏览不写事项、右卡确认和事项库保留，三主题在 1280／1024／736／375px 下无横向溢出，并检查减少动态效果。较慢的 JSDOM 组合弹层检查改由真实浏览器覆盖，共享日期控件仍独立回归。未运行真实账户操作，检查浏览器已关闭。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`：`todo-date-actual-day.png`、`todo-date-actual-week.png`、`todo-date-actual-picker.png`、`todo-date-actual-narrow.png`、`todo-date-actual-qa.json`。截图使用示例事项。严格 Python 静态审计未运行（本机无已安装的 Python 解释器）；未打包或发布。

## 签到目录移除领取进度样式（2026-11-14）

final result: passed

按红框移除「领取进度」预览，签到目录仅保留并排与列表两种样式，常规窗口下等宽铺满可用区域；样式网格按实际选项数排列，今日摘要的一项、签到的两项和额度的三项均保持完整。旧进度卡片兼容显示，目录局部预选并排，关闭／取消不改写，明确应用后转换且保留宽高；没有修改签到账户、领取逻辑、记录或共享布局数据契约。

`npm run verify`、八项首页回归及差异空白检查通过。隔离原生 Electron 三项交互组通过，页面异常为 0：只有并排／列表两个预览且等宽，应用后取消恢复原样；旧 progress 配置关闭／取消后完整保留，明确应用后仅转换样式为 parallel，3 列／3 行尺寸不变；小宽度下分别检查一／二／三项样式，无横向溢出。窄窗操作前等待原有侧栏收起动效稳定；实际宽屏截图已查看，图标、品牌、字体与颜色沿用原样。

证据在 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-checkin-two-styles-wide.png`、`dashboard-checkin-two-styles-narrow.png`、`dashboard-checkin-two-styles-result.json`、`dashboard-checkin-two-styles-verify.log`、`dashboard-checkin-two-styles-tests.log`。Browser 插件不可用，使用已有 Playwright 的隔离 Electron；未操作真实账号或签到，实例已关闭。严格静态审计仍为十五项既有发现，见 `dashboard-checkin-two-styles-audit.json`。尚未打包或发布。

## 今日摘要目录仅保留柱状图（2026-11-14）

final result: passed

按用户红框移除目录中的「今天要做什么」及「最近做了什么」两个预览，只保留「近7天完成」柱状图；单个预览铺满原样式区域，签到与额度仍各有三种样式。仅目录可选项收敛，原布局的今日安排／最近完成配置兼容显示；打开目录时局部预选柱状图，取消不改写配置，明确应用后才转换，原宽高保留。

`npm run verify`、八项首页回归及差异空白检查通过。隔离原生 Electron 三项交互组通过、页面异常为 0：目录只出现一个已选中的柱状图且填满宽度；另两类仍有三个选项；分别加载两种旧样式后，关闭／取消保持原配置，应用并完成后只将样式改为 history，3 列／3 行尺寸不变；小宽度下唯一预览无溢出。实际宽屏截图已查看，字体、材质、颜色及其余控件沿用原样。Browser 插件不可用，使用项目已有 Playwright 的隔离 Electron，实例已关闭，未操作真实用户布局或数据。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-summary-only-wide.png`、`dashboard-summary-only-narrow.png`、`dashboard-summary-only-result.json`、`dashboard-summary-only-verify.log`、`dashboard-summary-only-tests.log`。严格静态审计仍为十五项既有发现，见 `dashboard-summary-only-audit.json`。尚未打包或发布。

## QQ 录屏场景的灵动岛原生显示恢复（2026-11-14）

用户确认 QQ 开始录屏后，灵动岛从电脑屏幕上消失，截图不触发。当前正式版为 v2.1.9，已存设置为 `enabled:true`、`hideFullscreen:false`，因此不能将该现象全部归因于全屏隐藏。源代码只有主动显示和全屏状态变化时恢复原生可见性／置顶状态，正常状态不变时不会修复外部隐藏；新增回归先复现窗口持续隐藏，再通过修复。

修复在现有一秒计时中检查应显示窗口的原生可见性与置顶属性，仅在异常时调用原有显示逻辑，保留不抢焦点、停靠、展开与计时状态。显示条件集中复用，用户主动关闭、锁屏、睡眠及启用的真正全屏隐藏不能被自恢复绕过。另修复两处相关漏洞：原几何判断把工具／透明／穿透等覆盖层误判为全屏，现排除这些窗口并使用客户端屏幕范围；全屏检测助手异常退出后清除旧全屏标记，避免长期隐藏。

84 项相关回归通过，包含一个真实 Win32 测试的十个场景：普通不透明全屏、不透明分层全屏仍识别为全屏；工具、穿透、非激活、半透明、色键透明、带边框的屏幕大小窗口、小窗口及隐藏窗口不触发。原生分类测试直接编译生产代码中的 C# 识别器，只替换前台句柄来源为本次创建的诊断窗口，不改变其 Win32 查询或规则；测试窗口不激活并立即销毁。首轮旧规则在其中七种场景失败，修复后全部通过。一次并行回归遇到既有暂存文件原子改名 `EPERM`，串行复跑全部通过，未修改存储代码。

在原隔离 Electron 进程 PID 25756 内加载当前实现，创建完全透明、无焦点且不接收鼠标的独立诊断窗及数据目录，不注册应用 IPC、不修改现有窗口和账号数据。另一个 Windows 进程对诊断窗调用 `ShowWindow(SW_HIDE)`、`SetWindowPos(HWND_NOTOPMOST)`，分别在实测 644ms、628ms 后恢复可见／置顶；Electron 的查询与原生标志一致。主动关闭和真实全屏隐藏在持续检查后仍保持隐藏。四组原生恢复检查通过，结束时诊断对象、监听器、定时器和窗口已销毁，原测试进程保留一个窗口。

`npm run verify` 通过。没有启动、保存或上传用户屏幕录制；完整 QQ 选区及录制流程尚未实测。当前正式安装版仍为 v2.1.9，未修改安装目录或正式设置，修复尚未发布。没有视觉布局、主题或动效改动。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包括 `island-recording-fullscreen-before.json`、`island-recording-fullscreen-results.json`、`island-recording-recovery-results.json`、两份原生 pilot 脚本与 `island-recording-verify.log`；自动化回归在 `tests/island-fullscreen.test.ts` 和 `tests/desktop-island.test.ts`。

## 添加目录移除专注栏目（2026-11-14）

final result: passed

仅从添加目录移除专注计时，目录现为今日摘要、每日签到和 AI 额度，三项等宽排列；默认添加类型也使用同一份过滤清单。清理专注预览及专为该预览读取的状态、样式；保留原布局数据、默认布局、既有专注卡片和活动计时，不改共享数据契约。三类现有样式及宽高、草稿保存流程保持不变。

`npm run verify`、八项首页回归与差异空白检查通过。隔离原生 Electron 三项交互组通过、页面异常为 0：确认目录没有专注入口且其余每类仍有三个预览；已存在的专注卡片可启动计时，打开／关闭目录后活动计时对象完全相同；专注卡片缺失时默认选中今日摘要，应用其他卡片不重新引入专注；小宽度下三项同宽、同行且无横向溢出。已查看实际截图，材质、字体、颜色及其余预览沿用原样。Browser 插件不可用，使用已安装 Playwright 的隔离 Electron，未改动真实用户数据。

证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-catalog-no-focus-wide.png`、`dashboard-catalog-no-focus-narrow.png`、`dashboard-catalog-no-focus-result.json`、`dashboard-catalog-no-focus-verify.log`、`dashboard-catalog-no-focus-tests.log`。严格静态审计仍为十五项既有发现，见 `dashboard-catalog-no-focus-audit.json`；隔离实例已关闭，尚未打包或发布。

## 添加卡片改为紧凑下拉浮层（2026-11-14）

final result: passed

根据用户图二的 nl2sql 组件目录形态，将原 1040px 居中模态改为「添加卡片」按钮下方的 640px 非模态浮层，最高 520px，无全屏遮罩。复核了本机 `nl2sql_data_agent/client/src/components/dataAgent/report/ReportComponentPicker.tsx` 的按钮锚定、外部关闭及视口约束模式；Ono 的四类目录、十二种真实样式、宽高设置和布局草稿沿用原业务。四分类顶部横排，预览收为 164px，关闭复用 `IconButton`、尺寸复用 `Segmented`，没有新增依赖或通用浮层抽象。字体、主题色、圆角、阴影及品牌资源沿用现有视觉系统。

实际宽屏为 1609×977 CSS px、截图为 3218×1954px，浮层实测 640×517.64px；按钮下方间距 8px，视口安全边距 12px。原生截图已查看：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/dashboard-popover-wide.png`，局部为同目录 `dashboard-popover-detail.png`。短窗口与小宽度截图分别为 `dashboard-popover-short.png`、`dashboard-popover-narrow.png`；预览及尺寸区滚动，页头、分类和底部操作保持可见。没有当前浮层范围内待修复的视觉或交互问题。

六项原生 Electron 交互组、十九组几何样本通过，页面异常为 0：反复开关、再次点击触发按钮、点击外部、Escape 及焦点返回；四分类各三种预览、宽高调整、应用只更新草稿、取消恢复、完成后重载持久化；三主题、1280／1024 宽度、600px 短窗口、125% 缩放、内部滚动；空看板入口按自身按钮定位，添加后将焦点还给仍存在的顶部入口，重复应用不生成重复卡片。窄窗口按既有交互收起会覆盖背景的 AI 侧栏后操作，不改变共享外壳规则；额外 500px 仅为本浮层的边界压力样本，不作为整应用手机布局验收。Browser 插件不可用，使用已安装 Playwright 的隔离原生 Electron；实例已关闭，未改动真实用户布局、账号或业务数据。

`npm run verify`、最终渲染构建与 TypeScript、八项原有首页回归及差异空白检查通过。证据为同目录 `dashboard-popover-result.json`、`dashboard-popover-verify.log`、`dashboard-popover-renderer.log`、`dashboard-popover-typecheck.log`、`dashboard-popover-tests.log`。严格静态审计仍为十五项既有发现，新增 0，见 `dashboard-popover-audit.json`；未把视觉验收等同于全库静态审计通过。尚未打包、安装或发布。

## 首页卡片移除铅笔入口（2026-11-14）

final result: passed

按用户红框指示，移除今日摘要、专注计时、每日签到、AI 额度卡片右上角的铅笔按钮，普通及布局编辑状态均不显示；同步清理失去用途的单卡打开参数与选择器，工具区只为原移除按钮保留 26px，标题与卡片尺寸保持稳定。顶部「编辑布局」仍负责排序、调宽和移除，已有卡片的样式／尺寸仍可从顶部「添加卡片」目录选中对应类型调整。

`npm run verify` 与八项原有首页回归通过；未新增仅重复删除实现的测试。隔离原生 Electron 验证四类卡片在普通／编辑状态下均无铅笔，顶部入口可用，编辑前后各卡片宽高完全相同；从目录应用已有卡片样式后，取消恢复已保存布局。三主题、1610×977 及 1024×760 窗口检查通过，无横向溢出，页面异常为 0。Browser 插件不可用，使用项目已有 Playwright 原生驱动；隔离实例已关闭，没有改动用户布局或账号。

视觉复核为真实四卡片默认布局，沿用原字体、间距、颜色、Logo 及业务内容，卡片右上角没有残留铅笔或新增装饰；用户截图中三卡片布局为已有布局配置差异，本次不调整。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`dashboard-no-pencil-wide.png`、`dashboard-no-pencil-editing.png`、`dashboard-no-pencil-narrow.png`、`dashboard-no-pencil-result.json`、`dashboard-no-pencil-verify.log`、`dashboard-no-pencil-tests.log`。严格静态审计仍为十五项原有发现，含只使用拖动／键盘事件的两个现有卡片控件；本次未增加发现，原生交互验证通过。差异空白检查通过，尚未打包或发布。

## 日程待办方案 2：独立卡片与周导航（2026-11-14）

final result: passed

用户选择的视觉真值为 [方案 2](design/todo-week-navigation-selected-2026-11-14.png)，实际原生 Electron 截图为 [实现效果](design/todo-week-navigation-applied-2026-11-14.png)。左侧日程、右侧待办为两张独立全高卡片，取消旧的共同白色外框和周概览；事项库、新增与复盘操作归右侧。左侧周导航只筛选日程，右侧继续显示全部未完成待办（包括未来计划）。编辑、事项库、完成二次确认和共享紧凑宿主保持原行为。

### 比较条件与证据

- 确认稿为 1609×977px；实际视口为 1609×977 CSS px，Electron 截图为 3218×1954px、密度 2。将实际截图按 1/2 归一到相同尺寸后比较；稿中的窗外灰色留白与原生窗口起点不同，按卡片内容对齐判断，不修改共享顶栏或侧栏来复制画布留白。
- 相同状态：浅色主题、折叠主导航、AI 侧栏打开、2026-11-14 周六、两个当日日程和六条未完成待办；使用隔离合成数据，未修改用户数据、系统时钟或账号。主渲染器测试时钟固定，截图前等待字体、布局及动效完成。
- 完整对照：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/todo-week-comparison.png`，确认稿与实现位于同一张输入图。
- 局部对照：同目录 `todo-week-detail-comparison.png`，并排核对日程标题、周日期、日期选择、日程行及次日提示；完整对照同时核对右侧标题、工具栏、进行中高亮、长任务和时间列。
- 原生结果与几何：同目录 `todo-week-result.json`；宽屏左卡 528.48px、右卡 572.52px，间距 16px、底边均为 y=965，透明宿主无公共白框、无横向溢出。

### 发现、修复与复验

- [P2，已修复] 1280px 窗口同时展开主导航和 AI 侧栏时，主内容仅约 653px；旧 600px 断点仍保留两栏，导致待办标题与操作拥挤。将此页面的容器断点提前至 760px，并保持待办标题不换行。证据：同目录 `todo-week-responsive-before.png` 与 `todo-week-responsive-after.png`。重新构建并重跑同状态原生验收后，两个卡片上下排列、日期导航与新增完整可用，可滚动访问两张卡片。
- 最后一轮同输入完整／局部比较未发现可执行的 P0／P1／P2 差异。宽屏比例、独立表面、日期条、日程列表与任务列表的信息层级符合所选方案。

### 五项视觉验收

- 字体：沿用项目字体与字阶，卡片标题为 28px，局部正文为 16px，辅助时间沿用共享任务行字号；长任务可以换行，时间保留独立对齐。未引入字体依赖。
- 布局：两栏比例 48:52，卡片内边距 24px、间距 16px，使用既有圆角与阴影；左右列表独立滚动，窄内容区改为上下排布。保留现有宿主外边距，不扩大改动到共享外壳。
- 颜色：使用既有卡片、主色、分隔线与阴影 token；选中日期和进行中任务为蓝色、逾期为红色。实际蓝色沿用产品主题，不为复制生成稿的饱和度新增颜色值；三主题均通过几何与可用性检查。
- 资源：复用产品原有 Logo、吉祥物与 Phosphor 图标；没有新增位图插画需求、占位图片或自绘替代图标。截图仅用于设计验收，页面由真实组件渲染。
- 文案与数据：日程名称、时间范围、数量和任务状态来自真实数据。保留既有元数据格式及摘要统计口径，因此头部未完成汇总包含当日日程，可能与右侧纯待办数不同；不复制稿中的静态数量、类别和相对时间。空状态使用「这一天没有日程。」。

### 验证与范围

- `npm run verify` 通过，包含字阶、主进程／渲染器 TypeScript 与生产构建；日志为同目录 `todo-week-verify.log`。
- 周导航、共享待办、首页摘要及媒体保活相关测试 25/25 通过；日志为 `todo-week-tests.log`。覆盖跨周／月／年、今天跟随、方向键／Home／End 焦点、日程排序、任务范围不变、确认保留、事项库和紧凑宿主。
- 原生 Electron 七项交互组、十四组布局样本通过：日期导航、次日跳转、事项库、两类编辑和新增弹窗、任务二次确认、长列表滚动，以及 1600／1280／1024 宽度、侧栏组合、三主题和 125% 缩放；页面异常为 0。Browser 插件不可用，使用项目已安装 Playwright 的原生 Electron 驱动，隔离实例验收后已关闭。
- 严格静态审计记录十五项其他模块发现，没有本次日程待办文件发现；全库审计仍非零，未以视觉通过声称全库静态审计通过。报告为 `todo-week-audit.json`。差异空白检查通过。
- 本次仅修改选中页面及必要的共享布局变体、测试和设计记录；保留其他本地工作，尚未打包、安装或发布。未发现阻塞验收的问题。

## 首页四类多样式卡片与固定尺寸（2026-11-14）

final result: passed。

按用户确认的 [今日摘要目录](design/dashboard-catalog-today-selected-2026-11-14.png) 和 [签到目录](design/dashboard-catalog-checkin-selected-2026-11-14.png) 实现四类卡片、十二种样式。添加与单卡编辑共用目录；宽度为 2／3／4／6 列，高度为 1／2／3／4 行（180／260／340／420px），保留草稿、取消、完成、拖动／键盘排序和调宽。常用入口与阅读清单只退出首页，原业务页面及数据不变。旧布局保留有效顺序和宽度，补齐默认样式、高度，不恢复用户主动移除的专注卡片。

实际组件为 [摘要目录](design/dashboard-catalog-today-applied-2026-11-14.png)、[签到目录](design/dashboard-catalog-checkin-applied-2026-11-14.png) 与 [默认四卡片](design/dashboard-four-card-applied-2026-11-14.png)。确认稿与实际截图在同一输入中复核：白色卡片、左侧四类目录、三个无外部标签的缩略图、固定宽高选项及底部操作符合目标；标题恢复 page 层级，摘要保留完成数量，签到列表使用三家真实国内版资源，所有预览保留可见的操作示意。实际尺寸控件沿用共享 `Segmented` 的轨道、滑块和键盘规则，已有卡片使用「应用设置」而非重复添加；真实空数据不复制稿中的示例事项、完成数量、账号或额度。没有样式数量、像素尺寸或额外尺寸预览。

发现与修复：

- P1：网格原先会分配剩余高度。改为每张卡片持有固定行高，网格仅排布位置；实测删除其他卡片后，所有存续卡片的宽高完全相同，进入和取消编辑时画布宽度不变。
- P1：摘要若直接使用每 30 秒刷新的宿主时钟，刚完成的事项暂不计数。改为数据更新时取当前时间；真实 IPC 完成测试在 300ms 后由 0 更新为 1，未来及无效完成时间仍被过滤。
- P2：最小档位出现 3～18px 的多余滚动，列表签到两行窄卡片也有 15px 溢出。仅收紧相应图表、图标与标签行高；摘要按高度限制显示条数，完整事项仍通过原编辑器和日程待办页访问。空数据／未连接状态下，十二种样式乘四档高度的 48 组检查均无横向或多余纵向溢出。
- P2：用于隐藏连接数量的缩略图选择器同时隐藏了操作示意。为数量添加独立样式类，恢复三个签到预览按钮，列表三个品牌图标均加载成功；目录预览不执行签到、专注或模型动作。

验证：122 项相关回归通过，覆盖看板恢复／迁移、真实完成时间聚合、跨年／午夜、签到、专注状态、共享待办和助手会话边界。`npm run verify` 通过；随后仅对目录标题和预览文字做局部样式校准，字阶检查与客户端生产构建再次通过。DESIGN lint 为 0 错误，保留既有无 YAML 内容的 1 条警告。

复用隔离 Electron 实例 PID 25756，未新增常驻测试环境。十组原生交互通过：目录／键盘／Escape 与焦点恢复、十二种样式与四档高度、移除和重新添加不拉伸其他卡片、指针调宽、键盘及真实拖拽排序、保存刷新／失败保留草稿后重试、事项即时更新并打开原编辑器、专注开始／暂停／继续／结束及换样式不重置结束时间、三主题／紧凑视口／减少动态效果，以及网页项目没有因预览和布局操作启动或构建。原生默认视口为 1415×828 CSS px、DPR 2，最窄两列档位卡片宽 294.66px，四档高度与设置一致，运行期页面异常为 0。目录最终稳定截图为 1040×647.90 CSS px；截取静态终态时结束当前有限时长的入场动画，没有修改产品动画或系统设置。

严格静态审计保留原有 15 项，按文件、规则和消息比较新增 0；其中首页的两个提示来自静态检查器未识别拖动／指针处理器，实际鼠标与键盘回归均已验证，不添加空点击处理器。其他既有发现不属于本次修改。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包括 `dashboard-variants-ui-report.json`（10 组、48 组几何数据）、`dashboard-variants-probe.json`（300ms 完成刷新）、`dashboard-variants-final-capture.json`、`dashboard-catalog-actual-{today,focus,checkin,quota}.png` 及三主题截图。静态报告为 `.tmp/dashboard-variants-tests/premium-audit-final.json`。测试合成事项已删除，专注已结束，保留原卡片选择和窗口尺寸，未发布。

## 日程待办左右分栏（2026-11-13）

独立日程待办页移除本周概览及专属图表样式，主面板内左日程、右待办等宽排列，两侧卡片、标题与内距对齐。600px 以下内容容器按日程在上、待办在下排列；原过滤、日程今天／明天／近期／更晚分组、事项库、编辑、新增、复盘与完成确认保留。共享 `TodayBoard` 的默认文档顺序仍是待办后接日程，仅该页面启用日程优先顺序；两种宿主均直接渲染校验。媒体保留 pilot 的布局测量同步从已移除的概览改为实际两栏，保留原尺寸、动画稳定、隐藏宿主和布局差异断言。

`npm run verify` 与 20 项相关回归通过。Browser plugin not available，使用已有 Playwright 驱动隔离 Electron，六项实际交互与 12 组布局采样通过，覆盖空状态、四组日程、长标题、1600／1280／1024 宽度下 AI 展开／收起、三主题、125% 缩放、展开导航后的窄容器上下排列、两侧编辑、新增、事项库返回及完成确认写回。页面异常为 0，宽屏和窄容器截图已目视复核，没有因本次调整改变数据条数。宽窗 AI 栏沿现有规则占独立空间，窄窗保留原覆盖规则；截图等待侧栏和 AI 动画稳定后采集。

静态审计当前有 15 项发现，其中两项新增于并行修改的首页按钮，与本次列表布局无关，未据此修改首页。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`，包含 `todo-split-pilot.mjs`、`todo-split-result.json`、`todo-split-{empty,wide,narrow,stacked}.png`、`todo-split-tests.log`、`todo-split-verify.log` 和 `todo-split-audit.json`。示例数据隔离，未改动正式安装版或发布。

## 首页编辑布局偏移修复（2026-11-13）

用户反馈进入编辑布局出现滚动条后页面偏移。原生测量确认主内容宽度从 947px 缩为 932px，编辑工具另使页面增高。首页局部固定滚动条占位，标题标签和操作区保持尺寸，拖动／移除工具复用同等占位，移除编辑态额外内边距及签到按钮位移规则。

复用原隔离实例，在 1415×828、1567×1003、1079×681 三个 CSS 视口比较正常、编辑与取消状态：画布宽度、标题及全部现有卡片的位置／大小、滚动高度与滚动位置均一致。小窗口保留正常滚动；未写入布局，用户移除的专注卡片未恢复。测量与截图为本次输出目录的 `home-dashboard-edit-offset-check.json` 和 `home-dashboard-edit-stable-*.png`。TypeScript、字号检查、客户端构建及 4 项看板回归通过。多样式卡片仍处于方案阶段，本次未实现。

## 首页自由网格看板（2026-11-13）

final result: passed。

视觉目标为 `design/home-dashboard-grid-selected-2026-11-13.png`，实际正常状态为 `design/home-dashboard-grid-applied-2026-11-13.png`。复用现有隔离 Electron 实例，没有新增开发服务器或额外测试实例。全幅与局部对照均将源图和实际编辑状态并排放在同一输入中复核；源图 1568×1003，实际 CSS 视口 1567×1003、DPR 2、截图 3134×2006。对照时归一到源图尺寸，1px 视口差为原生窗口边界取整，不作为排版错误。

发现与修复：

- P1：常用入口弹窗受到既有通用表单的输入宽度及纵向布局规则影响，复选框挤压名称、底部选项超出视口。新增该业务弹窗的双列布局、16px 原生复选框、内部滚动和固定头尾；真实鼠标勾选最后一项、保存及刷新后仍保留选择，修复后的弹窗截图已复核。
- P2：首轮标题与计时字阶偏小。首页局部使用已记录的语义字阶映射，其他页面与共享弹窗不变；全幅与标题／摘要／计时局部对照已重新检查。
- P2：常用 1416×828 窗口的默认六卡片有少量多余滚动。短窗口收紧标题空白和网格行的最小高度，最终 1415×828 与 1567×1003 两个 CSS 视口的主区滚动差、页面横向溢出均为 0，卡片自身无横向溢出。

五项视觉核对：字族沿用现有 Bahnschrift／Segoe UI／微软雅黑，标题、正文、数字与辅助信息层级清晰；标题卡和六卡片独立承载内容，间距、圆角、对齐及选中边框符合已选方向；三主题背景与白色卡面、雾蓝交互及语义状态色沿用现有 token；品牌图形直接使用既有国内版资源、标准图标使用 Phosphor；标题与入口使用实际模块名，日期为本机当天，未连接及空书单使用真实空态。

可接受差异：设计稿中的示例事项、账号、百分比和无单位余额不写入产品；实际空状态没有虚构额度条。网格宽度按 2／3／4／6 列吸附，右侧 AI 栏保留用户现有宽度、配置与上下文控件；编辑态补充移除和入口管理动作。P3 保留现有按钮与图标处理，不追逐生成稿中非功能性的装饰差异。

验证：122 项相关回归通过，含看板恢复／顺序、路由、待办数据共享、AI 会话隔离与参考选择、阅读和原生提醒；`npm run verify` 通过，后续仅 CSS 调整已重新构建并通过字号检查。原生窗口九组交互通过，覆盖添加移除取消、方向键排序、真实拖拽、指针调宽、保存刷新、常用入口、专注共享状态、摘要及提醒定位、三主题与紧凑窗口；另验证布局写入失败保留编辑状态及同一实例正常重启后保留布局。运行期页面异常为 0。合成事项只存在于原隔离测试库，并由本次验证清理。

静态样式审计报告为 15 项：13 项既有记录，新增 2 项为静态检测器未识别拖动柄的 Drag／KeyDown 与调宽柄的 Pointer／KeyDown 处理；上述真实鼠标与键盘测试已验证这些动作，未为消除提示添加空处理器，也未修改既有合同掩盖问题。

本轮证据位于 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`：`home-dashboard-ui-report.json`、`home-dashboard-restart-proof.json`、`home-dashboard-final-layout.json`、`home-dashboard-comparison-final.png`、`home-dashboard-comparison-detail.png`、`home-dashboard-shortcut-options.png` 和三主题截图。测试窗口恢复原尺寸及已保存布局，保留一套用于试用；未打包发布。

## 灵动岛跨天日期（2026-11-13）

日程待办当天内保留日期和浏览月份；跨天展开、返回本页、聚焦、恢复可见、唤醒或解锁时回到今天。正在查看今天时随零点更新，手动浏览其他日期或月份不跳转；待完成确认及保存期间延后，成功或取消后再同步。复用原有日期颜色、标题和三种停靠布局。唤醒／解锁通过现有状态广播携带运行期返回序号，避免依赖尚未刷新的定时器或不可靠的浏览器可见事件，不新增持久配置。

新增真实 React 日历交互回归先复现跨天仍选旧日期，随后与状态、原生窗口相关回归共 47 项通过；覆盖同日选择、隐藏后返回时钟未刷新、跨月／年、手动月份浏览、完成确认及异步保存、取消后恢复、唤醒信号和勿扰状态。`npm run verify` 通过，静态审计记录 13 项既有发现；不在本次改动中扩展处理。

Browser plugin not available，使用已有 Playwright 驱动隔离 Electron，以页面模拟时间和应用进程内的原生 suspend／resume 事件验证八项实际交互；没有改变系统时间、电源状态或真实数据。三种停靠截图已保存，顶部跨月及确认保护截图已目视复核，页面异常为 0，12 条示例事项的存储前后完全相同。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`，包含 `island-daily-date-pilot.mjs`、`island-daily-date-result.json`、`island-daily-date-{november,december,confirmation,top,left,right}.png`、`island-daily-date-tests.log` 及 `island-daily-date-verify.log`。未打包发布。

## 设置弹窗反向主题分层（2026-11-12）

final result: passed。按已选三主题高保真落地左侧浅白、右侧随主题、分组白色卡片的层次。颜色归属 `src/shell.css` 的 `--settings-nav-bg`、`--settings-content-bg`、`--settings-card-bg`，仅设置弹窗将原有卡片表面映射为白色；内嵌透明分组、蓝色选中态、字体、布局、动效和原控件继续复用。三张已选稿保存在 `design/settings-theme-reversed-*-selected-2026-11-12.png`。

37 组隔离原生 Electron 检查通过，覆盖六个设置分类、灵动岛五个页签、三主题和 960×620／760×620 窄窗。所有可见外层分组均为白色、无投影，布局无横向溢出，弹层 Escape 仅关闭下拉并恢复焦点，设置关闭正常，页面异常为 0。相同 1280×820 视口、1080×680 弹窗和 4320×2720 捕获尺寸下，已选稿与实际组件并排复核字体、间距、配色、图像和文案一致；逐像素比较中，暖砂相同，雾灰与冷灰超过每通道 3 色阶的差异像素分别为 0.0983% 与 0.0819%，无需要修复的可见差异。原生截图保留完整表单；局部控件继续沿用同源组件，字阶与几何无改动。

字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计保留既有 14 项发现、新增 0。测试实例 PID 86956 已同步编译样式，保留雾灰主题、自媒体工作台、通用与外观分类、66px 折叠侧栏及原有视口和页面／设置节点。证据为本轮 visualization 的 `settings-theme-applied-preview.json`、三主题／灵动岛／窄窗 PNG、`settings-theme-applied-comparison.png`、`settings-theme-applied-image-comparison.json`、`settings-theme-applied-live-test.json`／PNG 与 `settings-theme-applied-audit.json`。未发布。

## 小工具设置卡片紧凑排布（2026-11-12）

仅收紧专注计时、圆环伙伴、喝水提醒与久坐提醒四张卡片：标题区上下内距 10px，设置行最小高度 52px、上下内距 8px，卡片间距 12px。原生 1280×820 对照中，区域总高从 487.6px 降为 369.7px；12 个控件的宽高和所有字阶与修改前一致，两列卡片对齐，提醒时间仍为单行。

三主题、960×620 和 760×620 共五组原生 Electron 检查通过，无横向溢出或页面异常；时间标签关联、时间弹层与 Escape 焦点恢复、数字校验及其他分区说明保留。字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计维持 14 项既有发现、新增 0。测试实例 PID 86956 已同步实际编译样式，保留自媒体工作台、66px 折叠侧栏、1280×820 视口和现有页面节点。证据为本轮 visualization 的 `island-tools-density-report.json`、前后对照／三主题／窄窗 PNG、`island-tools-density-live-test.json`／PNG 及 `island-tools-density-audit.json`。未发布。

## 悬浮二级目录统一紧凑密度（2026-11-12）

悬浮与内联二级目录共用一处 36px 行高／4px 间距定义，悬浮目录从原 42px／6px 收紧；选中滑块尺寸和位移沿用这组 token。三行菜单卡片实测从约 198.8px 高缩为 176.8px，宽度仍为 200px，一级目录尺寸不变。

十二组原生 Electron 检查通过，覆盖五个工作台菜单、三个选中位置、三主题及 960×620 窄窗，标题和子项完整、选中块对齐、移出收起且无越界；页面异常为 0。字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。现有测试实例 PID 86956 已同步样式，保留自媒体工作台、66px 折叠侧栏、字体及 1280×820 视口，页面节点未重挂载。证据为本轮 visualization 的 `rail-flyout-compact-report.json`、三主题 PNG、`rail-flyout-compact-live-test.json`／PNG 及 `rail-flyout-compact-audit.json`。未发布。

## 灵动岛总开关文案精简（2026-11-12）

将概览名称从「桌面显示」改为「显示灵动岛」，移除右侧说明／停靠位置摘要段落及失去用途的两条段落样式，保留真实启用状态与原开关绑定。八组原生 Electron 检查覆盖启用／未启用、三主题、960×620 与 760×620：名称和无说明状态一致，开关往返正常，卡片仍为 66px 高、文字与开关居中且无横向溢出，页面异常为 0。

原显示器设置回归、TypeScript、字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计仍为 14 项既有发现、新增 0。确认无未保存编辑后刷新同一测试实例 PID 86956，恢复原自媒体／博客编辑、折叠侧栏、AI 收起、灵动岛设置「显示与交互」、滚动位置及 1280×820 视口；当前实际名称为「显示灵动岛」，说明段落为 0，未启用状态与开关一致。证据为本轮 visualization 的 `island-overview-copy-report.json`、三主题 PNG、`island-overview-copy-live-test.json`／PNG 及 `island-overview-copy-audit.json`。未发布。

## 提醒时间标签与时间同行（2026-11-12）

喝水与久坐的提醒时间改为「开始 09:00 — 结束 18:00」一行，标签与对应时间控件垂直居中，保留既有标签关联、字号及时间选择组件。仅调整小工具分区的时间组 flex 排布、标签／连接符边距和时间行控件可用宽度。

三主题、960×620 与 760×620 共五组原生 Electron 检查通过：四组标签与按钮的中心差小于 1px，开始与结束均不换行，时间组不越出卡片且无横向溢出；点击开始标签可打开时间弹层，Escape 仅收起弹层并恢复按钮焦点，数字校验提示保留，页面异常为 0。字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。现有测试实例 PID 86956 已同步样式，保留自媒体工作台、66px 折叠侧栏及 1280×820 视口，页面与设置节点未重挂载。证据为本轮 visualization 的 `island-period-inline-report.json`、三主题／窄窗 PNG、`island-period-inline-live-test.json`／PNG 及 `island-period-inline-audit.json`。未发布。

## 二级悬浮菜单收窄（2026-11-12）

仅将 `.rail-flyout` 总宽从 240px 改为 212px，保留 12px 指针过渡区域，可见卡片宽度为 200px。九组原生 Electron 检查覆盖五个工作台悬浮目录、三主题及 960×620 窄窗，标题和所有子项均完整显示，选中块贴合按钮，移出可收起，展开主侧栏仍为 200px，页面异常为 0。字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。

同一测试实例 PID 86956 已同步实际编译样式，现有悬浮菜单实测总宽 212px，保留自媒体工作台、66px 折叠侧栏、字体和 1280×820 视口，页面节点未重挂载。证据为本轮 visualization 的 `rail-flyout-narrow-report.json`、三主题 PNG、`rail-flyout-narrow-live-test.json`／PNG 及 `rail-flyout-narrow-audit.json`。未发布。

## 小工具卡片移除说明小字（2026-11-12）

仅在 `.island-settings-tools` 内隐藏设置项标题下的说明节点，覆盖专注计时、圆环伙伴、喝水提醒和久坐提醒四张卡片；时间字段标签、分钟单位与校验错误不受该选择器影响。三主题及 960×620 窄窗的原生 Electron 检查通过：10 个说明节点均不可见，10 个标题、5 个开关、3 个数字输入、4 个开始／结束标签及 3 个分钟单位保留；非法数字反馈仍可见，显示与交互页的 6 项说明保持原样，页面异常为 0。

字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。同一测试实例 PID 86956 已同步编译样式，保留自媒体工作台、66px 折叠侧栏及 1280×820 视口，页面与设置节点未重挂载。证据为本轮 visualization 的 `island-tools-copy-report.json`、三主题／窄窗 PNG、`island-tools-copy-live-test.json`／PNG 及 `island-tools-copy-audit.json`。未发布。

## 折叠导航菜单点击与悬停修复（2026-11-12）

旧版本原生复现点击一级入口后菜单关闭、指针仍在入口内无法再次展开。修复 `activate` 的菜单关闭冲突，离开区域时区分鼠标留下的焦点与键盘可见焦点，悬停期间其他区域获得焦点不强制关闭菜单；监听目录项尺寸变化，使菜单随分支高度变化持续贴合入口。悬浮目录复用内联目录的白色选中滑块、当前项字重／颜色及悬停样式，保留原悬浮菜单尺寸。

隔离原生 Electron 的 25 项交互检查通过，覆盖点击后无需重新移入、入口与菜单之间移动、移出收起、子项导航、再次打开、Escape／向右键、浮动与内联高亮一致、菜单跟随定位、三主题、960×620 窄窗和减少动态效果。为避免物理指针干扰截图，隔离 QA 窗口忽略物理鼠标事件，交互由 CDP 驱动；实际测试窗口另行确认键盘进入、键盘焦点保留菜单、选中滑块及 Escape 收起。页面异常为 0，TypeScript、字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。

确认无未保存编辑后刷新同一测试实例 PID 86956，恢复原小工具／命理页面、200px 展开侧栏、AI 收起、380px AI 栏宽度与 1280×820 视口。证据为本轮 visualization 的 `rail-flyout-baseline-report.json`、`rail-flyout-fixed-report.json`、三主题／窄窗截图、`rail-flyout-live-test.json`／PNG 及 `rail-flyout-audit.json`。未发布。

## 展开侧栏恢复 200px（2026-11-12）

按用户最新要求仅将展开态宽度从 184px 恢复至 200px。四个工作台分支、三主题、91 个开合动画帧、滑块、键盘悬浮菜单及窄窗检查通过，页面异常为 0；字体、二级目录紧凑间距与此前下移位置沿用原值。字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。同一测试实例 PID 86956 已同步编译样式，保留小工具工作台及 1280×820 视口，实际展开宽度已恢复至 200px。证据为本轮 visualization 的 `rail-restored-200-report.json`、三主题 PNG、`rail-restored-200-live-test.json`／PNG 及 `rail-restored-200-audit.json`。未发布。

## 补齐灵动岛其余页签的分组外框（2026-11-12）

修正上一轮仅检查灵动岛「显示与交互」而遗漏其他页签的问题：`.island-setting-card` 与 `.island-connection-layout` 从近白色 `--glass-line` 改用 `--hairline`。页面／文件暂存、提醒、额度账户连接与阈值、小工具分组现在均与「桌面显示」共用 1px 浅色边框、14px 圆角、浅色表面且无投影；内嵌 Rows 继续无重复边框，组合分组的内部竖线／横线及控件状态保留。

旧编译样式复现截图中两个页面分组的边框不一致，修复前后 20 个页面卡片、行和控件的几何与字号逐项相同。此次逐一遍历灵动岛五个页签、三个主题及 960×620 窄窗，共 20 组原生 Electron 检查通过，覆盖每个实际外层分组的边框／圆角／背景／投影；页面异常为 0。字阶、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。现有测试实例 PID 86956 已同步实际编译样式，保留小工具工作台、184px 展开侧栏及 1280×820 视口，页面节点未重挂载。证据为本轮 visualization 的 `island-all-frames-report.json`、五页签／主题／窄窗 PNG、`island-all-frames-live-test.json`／PNG 及 `island-all-frames-audit.json`。未发布。

## 展开侧栏继续收窄至 184px（2026-11-12）

仅将展开态 `--rail-width` 从 200px 改为 184px，保留折叠态 66px、14px 字号、一级 42px／6px、二级 36px／4px 及此前下移位置。自媒体、网页、AI 测试和小工具分支的实际名称均完整显示，一级与二级选中块保持对齐；三主题、98 个展开／收起动画帧、折叠悬浮菜单键盘操作、减少动态效果及 960×620 窄窗检查通过，页面异常为 0。实际网页分支截图与用户提供的目录结构一致。

字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计仍为 14 项既有发现、新增 0。同一测试实例 PID 86956 已同步编译样式，展开宽度由 200px 变为 184px，保留首页及 1280×820 视口，Logo／图标锚点、字体及页面节点未变。证据为本轮 visualization 的 `rail-184-report.json`、三主题／网页／窄窗 PNG、`rail-184-live-test.json`／PNG 及 `rail-184-audit.json`。未发布。

## 导航列表整体下移 8px（2026-11-12）

仅将 `.rail` 顶部内距从 76px 调至 84px，使首页及其后工作台入口整体下移 8px，首页顶边由 86px 改为 94px。实际新旧编译样式对比确认展开和折叠两态所有入口均精确下移 8px，Logo、顶栏、侧栏外框及底部设置位置保持；六组原生 Electron 检查覆盖多分支滑块对齐、两态纵向位置一致、键盘悬浮菜单、减少动态效果和 960×620 窄窗，页面异常为 0。

字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计仍为 14 项既有发现、新增 0。同一测试实例 PID 86956 已加载编译样式并重新对齐选中块，保留首页、灵动岛设置弹窗、展开态及 1280×820 视口，工作台与设置节点未重挂载。证据为本轮 visualization 下 `rail-downshift-report.json`、首页／展开／窄窗 PNG、`rail-downshift-live-test.json`／PNG 及 `rail-downshift-audit.json`。未发布。

## 设置分组统一细边框（2026-11-12）

共享 `.set-rows` 改用桌面灵动岛同款 1px `--hairline`、`--glass-hi` 表面和既有 14px 圆角，移除外投影与内高光。个人资料、通用与外观、AI 助手、待办与数据和关于页共用这套外框；灵动岛 Rows 继续透明且无重复边框，输入框、开关和主题预览沿用原样式。

24 组原生 Electron 检查通过，覆盖六分类、三主题及 960×620 窄窗，实际外框的边框／圆角／背景／投影与灵动岛概览一致；个人资料及通用页共 24 个卡片、行和控件的几何及字号与旧编译样式逐项一致，下拉 Escape 仅收起选项并恢复焦点。页面异常为 0，字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计仍为 14 项既有发现、新增 0。现有测试实例 PID 86956 已同步编译样式，保留首页、展开侧栏及 1280×820 视口，页面未重挂载。证据为本轮 visualization 的 `settings-card-outline-report.json`、三主题／窄窗截图、`settings-card-outline-live-test.json`／PNG 及 `settings-card-outline-audit.json`。未发布。

## 二级目录紧凑排布（2026-11-12）

仅在 `.rail-branch` 内将现有行高／间距 token 覆盖为 36px／4px，替代原 42px／6px；分支高度、占位及选中滑块共用新值，字体和一级入口沿用原尺寸。自媒体、AI 测试和小工具分支以及三主题的原生 Electron 检查通过，三个子项的选中块均与按钮完全重合，三行分支高度为 116px；折叠悬浮菜单仍为 42px／6px，键盘进入／关闭、减少动态效果、连续切换及 960×620 窄窗检查通过，页面异常为 0。

字阶、保留已有资源的 Vite 构建及差异空白检查通过；严格静态审计仍为 14 项既有发现，新增 0。现有测试实例 PID 86956 已加载实际编译样式，保留展开态、200px 宽度、网页工作台及 1280×820 视口；未重挂载页面。证据为本轮 visualization 下 `rail-child-compact-report.json`、三主题／窄窗截图、`rail-child-compact-live-test.json`／PNG 及 `rail-child-compact-audit.json`。未发布。

## 展开侧栏收窄至 200px（2026-11-12）

仅将展开态 `--rail-width` 从 220px 改为 200px，折叠态仍为 66px，保留图标锚点、14px 字号、42px 行高、6px 间距和现有动效。三主题及自媒体／AI 测试／小工具分支的原生 Electron 检查通过，一级与二级名称均完整显示，选中滑块持续对齐；99 个展开／收起动画帧确认中间宽度及 Logo／图标锚点正常，减少动态效果直接落到目标宽度。页面异常为 0，字阶、保留资源的 Vite 构建及差异空白检查通过，静态审计仍为 14 项既有发现、新增 0。

同一测试窗口 PID 86956 已加载实际编译样式，保留当前折叠状态、66px 宽度、首页及通用与外观弹窗，工作台／设置节点和 1280×820 视口均未重置。三主题实际截图已复核，证据为本轮 visualization 的 `rail-compact-report.json`、`rail-compact-{mist,cool,warm}.png`、`rail-compact-live-test.json`／PNG 及 `rail-compact-audit.json`。未发布。

## 关于页名称改为 OnO Workbench（2026-11-12）

应用信息接口的展示名称改为 `OnO Workbench`，关于页沿用原元信息渲染，保留实际版本号及 Electron／Chromium 信息。TypeScript、主进程／preload 构建和 11 项相关回归通过。正常重启原隔离测试实例后，真实接口及版本行均显示 `OnO Workbench v2.1.9`；工作台与待办数据路径、1439×852 视口、首页、AI 收起、导航折叠及 380px AI 栏宽度保留，当前显示关于弹窗。页面异常为 0，实际截图已核对；证据为本轮 visualization 的 `about-name-live-report.json`、`about-name-live.png`。新实例 PID 86956，调试端口记录已更新，未发布。

## 六个设置分类统一移除页头副说明（2026-11-12）

六个分类的页头统一只保留大标题，移除元信息中的副说明和对应渲染节点，各设置项内部说明保留。同一隔离测试窗口逐一切换六分类，确认副说明节点均为 0、原设置项说明继续存在，并恢复原工作台、分区、导航和 AI 栏状态；页面异常为 0。TypeScript、保留资源的 Vite 构建及差异空白检查通过，严格静态审计仍为 14 项既有发现、新增 0。证据为本轮 visualization 的 `settings-no-page-subtitles-live-test.json`、`settings-no-page-subtitles-general.png` 与 `settings-no-page-subtitles-audit.json`。未发布。

## 桌面显示卡片细边框（2026-11-12）

将设置弹窗内「桌面显示」概览卡原先接近白色的描边改为 1px `--hairline`，与下方分组轮廓一致，沿用原 14px 圆角、内距和开关。三主题原生 Electron 检查通过，四边均为 1px 实线并匹配当前主题分隔线颜色，卡片均为 775×66px，页面异常为 0。字阶、保留资源的 Vite 构建及差异空白检查通过；严格静态审计保持 14 项既有发现、新增 0。同一测试窗口已加载实际构建样式，原弹窗、设置分区与背景工作台节点保留。证据为本轮 visualization 的 `settings-overview-border-report.json`、三主题局部 PNG、`settings-overview-border-live-test.json` 及 `settings-overview-border-audit.json`。未发布。

## 设置内容改为上下滑动（2026-11-12）

右侧内容按左侧分类的上下顺序使用纵向 16px 入场：下方分类从下方滑入，上方分类从上方滑入，保留 240ms、既有淡入和减少动态效果规则。32 组原生布局／状态检查及 203 个实际动画帧通过，确认右侧横向位移始终为 0，快速切换只显示最后目标，键盘焦点及缩小弹窗布局保留。TypeScript、保留资源的 Vite 构建及差异空白检查通过；静态审计仍为 14 项既有发现、新增 0。

同一测试窗口 PID 60504 已更新，实际首帧分别为 `(0,+16)`／`(0,−16)`，恢复原 AI 测试／对比测试工作台、1279×820 视口、导航与 AI 栏状态，并停在通用与外观弹窗。证据为本轮 visualization 下 `settings-dialog-vertical-report.json`、`settings-dialog-vertical-live-test.json`／PNG 与 `settings-dialog-vertical-audit.json`。未发布。

## 个人资料移除页头说明（2026-11-12）

移除「称呼与头像,只用于界面展示,存在本机」，说明为空时不渲染该节点。TypeScript、保留资源的 Vite 构建及差异空白检查通过；同一隔离测试窗口已更新，实际确认个人资料标题下无说明节点，昵称、头像、问候预览三项控件保留，并恢复用户原来的工作台与设置分类。验证脚本及报告为本轮 visualization 的 `refresh-settings-profile-copy-test.mjs`、`settings-profile-copy-live-test.json`。未发布。

## 设置弹窗缩小（2026-11-12）

final result: passed

按用户要求将设置弹窗限制为最大 1080×680px，常规窗口四周至少保留 48px，窄视口继续受可用空间约束；字号、分类宽度和控件尺寸沿用原样。首轮截图发现 1024px 窗口的灵动岛双栏显示分组挤出单字换行，已将该弹窗内 720px 以下的显示分组改为单列，重新截图并确认说明完整一行。32 组原生布局／状态检查及 209 个动效帧通过，覆盖三主题、六分类、窄窗口、嵌套弹窗、菜单、Esc 与真实隔离保存；页面和相关控制台错误均为 0。字阶、保留资源的 Vite 构建及差异空白检查通过，静态审计保持 14 项既有发现、新增 0。

同一测试窗口 PID 60504 通过加载本次实际构建的样式更新，设置弹窗、当前分区及背景工作台节点均保留，避免重新加载编辑状态；1279×820 视口下弹窗实际为 1080×680，居中于 `(99.5,70)`，无横向溢出。证据位于本轮 visualization 的 `settings-dialog-compact-{report,live-test,audit}.json` 与 `settings-dialog-compact-live-test.png`／`settings-dialog-compact-1024.png`，实际截图已目视复核。未发布。

## 设置改为左侧分类弹窗（2026-11-12）

final result: passed

- 视觉依据：用户最新弹窗截图，原始 1900×1478 像素，仓库副本为 `design/settings-modal-selected-2026-11-12.png`。实现保留居中圆角面板、变暗背景、左侧图标分类、细竖分隔、右侧设置卡片及右上角关闭；分类内容沿用工作台六分区，不复制参考的订阅、账户或装饰图片。使用现有 Phosphor 图标和共享 Modal／Select，不新增图形资产。
- 对照证据：原生 Electron 在 1439×1120 CSS px、DPR 2 下捕获 `settings-dialog-reference-state.png`（2878×2240）。`settings-dialog-comparison.png` 将参考与实机分别等比归一为 900px 宽并排，完整对照已目视核验；`settings-dialog-nav-comparison.png` 分别裁取参考 `(60,40,402,600)` 与实机 `(80,64,416,660)`，等比归一为 320px 宽核对分类图标、字阶、圆角和行间距。参考提供的是样式与结构，分类栏按现有紧凑取向定为 208px，选中态保留原浅蓝语义色；实际设置比参考的其他产品设置更少，保留自然留白。
- 五项核对：字体使用原字体族，页标题／分类控件／辅助标记为 28／14／12px；布局采用常规 32px 外距、左栏 208px、44px 分类行与 6px 间距，窄窗左栏改为 188px；背景与卡片复用三主题 `--surface-card`，遮罩由现有墨色混合透明度；所有图标保持原库矢量清晰度，未手工替代参考中的品牌图片；内容来自真实设置组件，搜索仍移除，保存与失败提示保留。将昵称和岛内数字输入样式显式保留在设置弹窗变体内，避免通用 Modal 表单样式覆盖它们。
- 原生交互：使用既有 Playwright 驱动隔离 Electron，Browser plugin not available。32 组布局／状态验证覆盖三主题、六分类和目标 1440×910／1280×820／1024×680 窗口；211 个动画帧验证左侧滑块、右侧前后方向滑入、连续切换、键盘焦点与减少动态效果。侧栏设置、头像、AI 配置、灵动岛额度定位均打开同一弹窗；Tab 保留在弹窗、Esc／关闭恢复入口焦点，背景 Home、博客编辑器、AI 栏节点和开合状态保留。共享选择菜单置于弹窗顶层，Escape 只关菜单；AI 供应商子弹窗和放弃修改确认不会关闭整张设置。真实隔离设置保存并重载、长页面滚动后换分类回顶部均通过，页面及相关控制台错误均为 0。
- 工程检查：16 项设置回归及 21 项嵌套弹窗／发布关联脚本回归通过；TypeScript、字阶、保留旧资源的 Vite 生产构建、脚本语法与差异空白检查通过。两个维护的 pilot 已适配模态设置入口和返回工作台的关闭动作，此处未声明整个安装版 pilot 已执行。严格静态审计保持 14 项既有发现、新增 0。
- 测试窗口：同一 PID 60504 已更新，保留 1279×820 视口、AI 收起、导航折叠、380px AI 宽度，并恢复用户当前的 AI 测试／对比测试工作台。实际验证打开、Escape 返回原工作台及再次打开，现停在通用与外观弹窗；`settings-dialog-live-test.json`／PNG 记录最终状态，截图已目视检查。详细报告为本轮 visualization 下 `settings-dialog-report.json` 与 `settings-dialog-audit.json`。未发布。

## 设置分类左右滑动（2026-11-12）

六个设置分类复用一块浅蓝选中底层，按按钮实际位置和尺寸平滑滑动；页面按分类左右顺序以 16px 水平位移和淡入进入，统一使用 240ms 与现有缓动。分类文字及导航条不重新入场，设置表单取消叠加的向上淡入；首次进入、重复点击和减少动态效果直接定位。快速切换取消过时内容动效，始终只挂载当前分类，保留按钮节点、键盘焦点、现有数据读写与无搜索页头。

Browser plugin not available，使用既有 Playwright 驱动隔离原生 Electron；465 个实际动画帧验证左右方向、滑块中间位置、45／40／40ms 连续切换、重复点击、Enter 焦点、切换中启用减少动态效果、分类换行及 AI／导航宽度变化。首轮发现 1024px 窗口第一帧超出留白 8px，已将水平位移从 24px 收至 16px 后完整复测，所有帧均无横向溢出。三主题、六分类及宽窄尺寸的 49 组既有布局／状态复查通过，含真实隔离设置保存并重载；页面和相关控制台错误均为 0，实际截图已目视核对。16 项相关回归、TypeScript、字阶、保留既有资源的 Vite 生产构建及差异空白检查通过；严格静态审计保持 14 项既有发现、新增 0。

同一测试窗口 PID 60504 已刷新并验证左右首帧分别为 +16px／−16px，保留 1279×820 视口、AI 收起、导航折叠、380px AI 栏宽度和用户当前的「个人资料」分类。证据位于本轮 visualization，包含 `settings-motion-report.json`、`settings-motion-layout-report.json`、`settings-motion-live-test.json`／PNG、`settings-motion-narrow.png` 及 `settings-motion-audit.json`。未发布。

## 移除设置页头搜索（2026-11-12）

六个设置分类统一移除页头搜索框、清空按钮、搜索状态及右侧占位，清理仅服务于该控件的样式；页面使用空过滤条件展示完整内容，既有设置保存、模型分区、来源切换与灵动岛定位保留。相关检查改为确认无搜索入口和设置项持续可见，保留保存失败、状态恢复、更新进度／错误详情及旧设置入口回归；灵动岛 pilot 使用分区标签进入额度页，更新状态 pilot 沿用当前设置分类导航。

16 项相关回归、两份 TypeScript 工程、字阶检查、保留资源的 Vite 生产构建及差异空白检查通过。使用既有 Playwright 驱动隔离原生 Electron，三主题、六分类与目标 1440×910／1280×820／1024×680 下共 49 组布局／状态检查通过；各分类均无搜索或清空搜索控件，完整设置行、五分区切换、下拉／Escape、真实隔离保存并重载及 AI 开合正常，页面与相关控制台错误均为 0。静态审计仍为 14 项既有发现、新增 0；两个维护的 pilot 通过语法检查，未据此声明整个旧 pilot 流程通过。

原测试窗口 PID 60504 已更新并停在「通用与外观」，保留 1279×820 视口、AI 收起、导航折叠及 380px AI 栏宽度；四项设置完整、无搜索及横向溢出。证据目录沿用本轮 visualization，包含 `settings-no-search-{report,live-test}.json`、`settings-no-search-live-test.png`、`settings-no-search-regression.log` 和 `settings-no-search-audit.json`。实际截图已目视复核，未发布。

## 左右栏开合图标（2026-11-12）

按用户两张参考，导航开合按钮使用左分栏图标，AI 栏收起按钮使用镜像的右分栏图标；复用现有 Phosphor `SidebarSimple`，统一为 20px，保持按钮位置、颜色、提示和开合逻辑。原测试窗口 PID 60504 已更新：两图形均居中且方向正确，导航展开／收起及 AI 收起／重新打开均通过，当前设置页保留、页面异常为 0。TypeScript、保留资源的 Vite 生产构建及差异空白检查通过；静态审计仍为 14 项既有发现、新增 0。证据目录沿用本轮 visualization，文件为 `sidebar-icon-{left,right}.png`、`sidebar-icons-live.png`、`sidebar-icons-report.json`；局部截图已目视核对。未发布。

## 设置整页主卡片（2026-11-12）

final result: passed

- 视觉依据：用户重新附图选定的「整页容器」，仓库副本为 `design/settings-contained-selected-2026-11-12.png`，原图 1578×996。六个设置分类、页头、搜索及表单共用一张主卡片，顶栏、工作台侧栏及 AI 栏独立成卡；玻璃色场只在间隙中可见。现有 Logo、Phosphor 图标、三主题背景和控件均复用，没有新增位图资产或占位图。
- 实机及对照：实际隔离 Electron 内容视口约 1439×910 CSS px、DPR 2，截图 `settings-card-mist.png` 为 2878×1820；cool／warm 同尺寸。全图对照 `settings-card-comparison.png` 将原图与实机各等比归一为 1100px 宽，未拉伸或绘制替代 UI。局部对照 `settings-card-groups-comparison.png` 从原图取 `(126,450,1036,310)`、实机取 `(226,831,1874,544)`，各等比归一为 900px 宽；已同时目视复核整体与两组设置。
- 五项核对：字体沿用 Bahnschrift／Segoe UI／微软雅黑后备，设置卡片局部使用 28px 页标题、14px 分类／控件、12px 辅助标记；间距采用 24px 内距，窄窗改为 16px，主卡与 AI 栏同起于 y=74px、底边对齐、相隔 12px；三主题卡片表面由 `--surface-card` 持有，原 `--ai-panel-bg` 保留兼容映射，既有使用者计算颜色不变；图形资产保持原版；设置名称、单屏显示器、开关状态及说明来自真实组件和隔离数据。为保留已确认的壳层坐标，沿用现有 y=74px 卡片基线；AI 栏保留真实协助对象、会话选择和输入控件，不用设计稿的简化空态替换实际功能。
- 对照与修正：首轮发现页标题／分类偏小（P2）及最小窗口、展开导航、480px AI 栏下模型标题溢出（P2）；已补齐局部字阶，收进组内分隔线，并修正模型标题／徽标／帮助按钮的网格换行、昵称输入与头像控件的收缩、更新操作换行及灵动岛标签分行。窄窗改为 16px 内距。初轮证据为 `settings-card-comparison-initial.png`、`settings-card-groups-comparison-initial.png`、`settings-card-report-initial.json`／`settings-card-report-second.json`；修复后重新捕获并对照上述最终图，极窄六分类均无横向溢出，没有剩余可执行 P0／P1／P2 发现。
- 行为验证：目标原生尺寸 1440×910／1280×820／1024×680（实际存在 ±1px 系统取整），三主题、六分类、导航两态及 340／380／480px AI 栏共 49 组布局／状态检查通过。分类键盘焦点保留、跨分区搜索、无结果、清空搜索焦点、五个灵动岛分区、打开停靠下拉及 Escape、真实隔离 IPC 保存并重载、AI 收放的节点保留及返回首页清除设置限定样式均通过。页面异常及相关控制台错误为 0；停靠弹层在入场动画结束后核对宽度与边界。原导航滑块／柔光、顺序展开、快速切换和减少动态效果再次通过。9 项相关回归、两份 TypeScript 工程、字阶检查、保留旧资源的 Vite 生产构建及 `git diff --check` 通过；严格静态审计仍为 14 项既有发现，新增 0。
- 当前测试窗口的中宽双栏另发现显示器说明及「主屏」被拆成孤字（P2）。已在 641–900px 设置内容宽度内调整该行控制列比例，并保留显示器中文词组；新增同宽度实机复查，DOM Range 验证说明为一行、「主屏」两字不跨行。最终 `settings-card-medium.png` 与 `settings-card-live-test.png` 已目视复核，`settings-card-report.json` 中 `displayLines` 两项均为 1，关闭该发现。
- Browser plugin not available，使用仓库现有 Playwright 驱动原生 Electron。证据目录为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包括上述 PNG、`settings-card-report.json`、`settings-card-regression.log`、`settings-card-audit.json` 和 `navigation-accordion-report.json`。项目没有配置 formatter／designmd 命令，沿用原文档格式与运行时 token 映射人工核对。
- 原测试窗口 PID 60504 已更新并停在桌面灵动岛设置，展示 AI 栏；保留 1279×820 视口、380px AI 栏宽度及隔离数据，主卡片宽 787px，两组仍为双栏，分类为六项，横向溢出及页面异常为 0。最终实机证据为 `settings-card-live-test.json`／PNG。没有修改正式安装版、真实账号或版本号，未提交或发布。

## 工作台二级目录顺序展开（2026-11-12）

修正展开侧栏中旧分支收起与新分支展开同时进行，导致目标子项上飘的问题：旧分支先收起，目标一级项到位后再向下展开子项；移除子项文字独立位移，保留选中滑块、柔光及侧栏开合。页面立即切换，关闭分支立即不可交互，等待会被后续切换取消；没有旧分支和减少动态效果模式直接展开。

实际隔离 Electron 的「网页 ↔ AI 测试」双向逐帧检查通过：新分支开始显露时旧分支已归零、目标一级标题已稳定，三行按顺序裁切出现；一级名称节点持续保留且透明度／位移不重播，子项仅跟随既有 6px 间距向下展开，没有上飘。另验证滑块／柔光、二级选中、40ms 连续切换、55ms 反向开合及减少动态效果；709 帧检查、45 项相关回归、三主题两尺寸六组布局及八项交互流程通过，页面异常与相关控制台错误为 0。TypeScript、字阶及保留旧资源的 Vite 生产构建通过，静态审计仍为 14 项既有发现、新增 0。

Browser plugin not available，使用仓库已有 Playwright 驱动原生 Electron。证据目录为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `navigation-accordion-before.json`、`navigation-accordion-report.json`、`navigation-accordion-regression.log` 及 `animated-navigation-report.json`。同一测试窗口 PID 60504 已刷新并实际走过「网页 → AI 测试」，停在 AI 测试展开态，视口、数据目录及 Logo／顶栏位置保留；`navigation-accordion-live-test.json`／PNG 记录最终状态。未提交或发布。

## 工作台导航动效（2026-11-12）

final result: passed

- 一级选中滑块、二级白色选中块、分支高度及侧栏宽度统一采用 240ms 过渡；文字使用 160ms 淡入位移，切换工作台带 360ms 柔和蓝色光效。保留原选中配色、圆角、竖线及 42px／6px 排布，顶栏、Logo 与一级图标的水平锚点在开合过程中不移动。
- 使用已有 Playwright 驱动真实隔离 Electron，采集 564 个动画帧，验证中间宽度、文字透明度、滑块位置、光影变化与分支高度。40ms 连续切换及 55ms 开合反向后均停在最后目标，退出分支立即不可聚焦；减少动态效果模式即时完成且无残留光效。首轮发现生产构建把自定义时长压缩为秒单位，修正单位读取后重新通过全部动效检查。报告及脚本为证据目录下 `navigation-motion-report.json`／`navigation-motion-qa.mjs`。
- 三主题 × 两种原生尺寸的六组布局及八项既有交互流程复查通过，含悬停菜单、键盘与焦点、设置分类、草稿节点保留、AI 共存及短窗滚动；页面异常与相关控制台错误均为 0。45 项相关回归、两份 TypeScript 检查、字阶检查及保留既有资源的 Vite 生产构建通过。静态审计保持 14 项既有发现，新增 0。证据目录为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，另含 `animated-navigation-report.json`、`navigation-motion-regression.log` 和 `navigation-motion-final.png`。
- 已刷新同一测试窗口 PID 60504，保留 1279×820 视口、隔离数据与 AI 收起状态，停在展开的自媒体工作台。`integrated-navigation-live-test.json`／PNG 记录最新构建与实机截图，Logo 和顶栏中心均为 37px，三个子项及 14px 字阶正确，页面异常为 0；截图已目视复核。未提交或发布。

## 灵动岛日历统一筛选（2026-11-12）

移除「今天／全部」范围切换及专属样式，日程与未完成待办统一按左侧月历所选计划日期显示，保留右上角在工作台中打开图标。修改前已在隔离 Electron 复现今天混入昨日待办；修改后昨日／今天／明日及月末／月初五个日期、跨月方向键、回到今天、空日期、完成二次确认、切日取消确认、切页及收起后保留日期共九项交互检查通过。截止时间不同于计划日期的事项仍归属其计划日期；已完成事项不显示，13 条示例记录均保留。

顶部 580×270、左右两侧 320×560 的实际 Electron 布局均通过，无范围切换残留，标题与打开图标无重叠；截图已目视复核，页面异常为 0。`npm run verify` 通过，静态审计保持 14 项既有发现。Browser plugin not available，使用已有 Playwright 驱动隔离 Electron，没有改动真实待办或正式安装版。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`island-calendar-filter-pilot.mjs`、`island-calendar-{before,after}-result.json`、`island-calendar-after-{top,left,right}.png` 和 `island-calendar-verify.log`。尚未打包发布。

## 工作台导航整合（2026-11-12）

final result: passed

- 视觉依据：用户在本轮确认的无横向分叉版本，保存为 `design/navigation-integrated-selected-2026-11-12.png`（1512×1040）。实现截图为证据目录下的 `integrated-navigation-expanded-mist.png`、`integrated-navigation-collapsed-mist.png`，及 cool／warm 对应文件；原生内容视口约 1279×820 CSS px，DPR 2，完整截图 2558×1640。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`。
- 整体与局部同屏对照为 `integrated-navigation-comparison.png`。源图为双态设计画板，无法把画板尺寸当作应用视口；局部按 220px 导航宽度归一，源区域 `(626,280,288,636)` 保持比例缩放，实际区域从 DPR 2 截图取 `(20,148,440,1468)` 后缩至 CSS 像素。源画板的示意字距、压缩行距及窗口高度不作为第二套运行时规范，实际以用户确认的 42px 行高、6px 间距和现有字阶为准；底部设置随真实窗口高度停靠。
- 字体：保留现有 Bahnschrift／Segoe UI／微软雅黑后备。首次视觉对照发现新目录使用 13px 控件字阶，比原二级菜单偏小（P2）；已恢复 `--type-body:14px`，重新构建、捕获和对照后关闭。前一轮图为 `integrated-navigation-comparison-before-font.png`，修复后图为上述最终对照；全名完整，不增加圆点或「当前目录」标题。
- 布局：折叠 66px、展开 220px，一级选中项保持 42px 高及 13px 圆角；两态七个一级图标的 x／y 坐标逐项一致。展开时普通一级与二级行高均为 42px，中心间距均为 48px；折叠只隐藏当前分支文字并保留高度。细竖线宽 1px，无横向分支。Logo 与顶栏中心均为 y=37px，收放按钮不移动 Logo 或顶栏。
- 色彩、资产与文案：复用原三主题玻璃、深色选中背景、白色图标、4×20px 蓝色标记和白底蓝字子项；保留现有工作台图标及所有目录名称，新收放图标使用已有 Phosphor 图标库。源稿的示意房屋图形和偏蓝底色不替换实际产品资产与主题，不将标题、标尺或示例正文放进产品。没有剩余可执行的 P0／P1／P2 差异。
- 实际 Electron 三主题 × 1280×820／1024×680 六组布局检查通过；鼠标进入悬停菜单并实际点击、向右键进入子项、Escape 返回焦点、展开内联子页、六个设置分类的鼠标／键盘切换、主题保存、AI 展开共存、编辑节点及草稿保留、折叠偏好重载、日程／待办弹层和减少动态效果通过。设置只有一个底部入口，不出现悬停菜单或内联分支；分类位于设置页面内部，切页保持焦点。设置截图为 `integrated-navigation-settings.png`，交互报告及脚本为 `integrated-navigation-report.json`／`integrated-navigation-qa.mjs`；页面异常与控制台错误均为 0。
- 另以隔离验收窗口临时降低原生最小高度测试 1024×520，列表能滚动、悬停菜单在视口内可点击、底部设置保持可见；仅测试实例应用该尺寸覆盖，没有修改产品窗口的最小尺寸。截图为 `integrated-navigation-short.png`。Browser plugin not available，本次使用仓库已有 Playwright 驱动实际 Electron，没有访问正式安装版或真实账号。
- 45 项相关回归、两份 TypeScript 检查、字阶检查及保留既有资源的 Vite 生产构建通过。发布关联 pilot 已迁移到新的内联分支／设置分类入口，其布尔等待、动画稳定及存储断言保留。静态审计仍为 14 项既有发现，新增 0；未借此修改其他页面。项目没有配置 formatter／designmd 命令，设计文档按既有自定义格式及运行时 token 人工核对。
- 已将同一构建载入原测试主窗口 PID 60504，保留原 1279×820 视口、AI 收起状态及隔离数据目录，停在展开的自媒体工作台；标题为「个人工作台 · 导航测试版」。恢复窗口后实机截图为 `integrated-navigation-live-test.png`，同名 JSON 记录宽度 220px、14px 字阶、Logo 居中、三个子项及 0 页面异常。未提交、打包或发布。

## 灵动岛顶端日期固定居中（2026-11-12）

只读比较 CMO 的顶栏样式后，复用相对顶栏居中及按钮独立靠右的规则，仅修改 Ono 的三条顶部展开样式。修改前实测切换页签横向偏差为 6.5 CSS px，修改后为 0。580／520／440px × 100%／125%／150%／200% 共 12 组实际 Electron 检查通过，均切换四个页签；日期显示时相对顶栏居中、无标题或按钮重叠，窄视口的隐藏行为与原样相同，吉祥物及左右停靠几何与基线一致，无渲染异常。

`npm run verify` 通过。Browser plugin not available，使用已有 Playwright 与隔离数据目录运行真实 Electron，没有连接真实账户或改动用户任务；实例已关闭。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`island-date-anchor-pilot.mjs`、`island-date-{before,after}-result.json`、`island-date-after-{0,2}.png` 和 `island-date-verify.log`。尚未打包发布。

## 日程气泡完成与二次确认（2026-11-11）

日程伙伴气泡第三列补齐「完成 → 确认完成」，复用待办现有按版本写入已完成状态、保存成功后移除提醒的流程。保留「日程提醒／待办提醒」小标题、按钮坐标及 8px 底边间距；非气泡提醒列表的日程操作保持原样，没有修改存储协议或自动完成规则。

`npm run verify` 通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 DesktopIslandApp 和项目 CSS，验证日程／待办第一次点击不提交、第二次提交正确事项 ID、已完成状态及更新时间版本。模拟日程保存失败时不关闭提醒，原地确认重试成功后才移除；两次请求的版本均正确。三个停靠下正常／长标题及确认状态的三列按钮完全对齐，小标题、长标题无滚动、15 种提醒停靠组合的底边距离及原有查看／稍后／忽略／健康操作检查均通过，pageerror 为 0，截图已目视复核。

数据为隔离示例，未修改真实日程或待办。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `meeting-complete-bubble-qa.mjs`、`meeting-complete-bubble-render-qa.json`、`meeting-complete-bubble-verify.log`、`bubble-meeting-complete.png` 和 `bubble-meeting-confirm-complete.png`。未更新安装版或发布。

## 日程与待办气泡类型小标题（2026-11-11）

日程和待办顶部统一使用灰色 11px／400 字重小标题「日程提醒／待办提醒」，正文分别沿用日程 500、待办 700 字重。日程保留查看／稍后，待办另有完成及二次确认。共用 112px 提醒内容区，在既有窗口尺寸内保留日程两行、待办三行正文及操作行 8px 底边距离；两类共享按钮的尺寸和坐标一致。

`npm run verify` 通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 DesktopIslandApp 与项目 CSS；三个停靠位置均验证正确类型标签、常规字重灰色层级、完整悬停标题及正文容量。短／长／超长标题和确认状态的按钮几何保持，待办三行示例完整可见，气泡无溢出且不超出原生形状高度。五类提醒在三停靠的 15 组合仍为 8px 底边距离、24px 按钮；查看、稍后、忽略、完成确认、健康操作和错误重试检查通过，pageerror 为 0，截图已目视复核。

状态为隔离示例，未修改真实待办或消息。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `typed-bubble-headings-qa.{mjs,json}`、`bubble-{meeting,task,task-confirm}-typed.png` 及 `bubble-task-long-title-typed-{top,left,right}.png`。未更新安装版或发布。

排队后切换事项类型的补充验证通过，标签与查看按钮同步，只有待办显示完成操作。严格静态审计保留 14 项既有发现，按文件及规则对比无新增；DESIGN lint 为 0 错误、1 项既有 YAML 提示。

## 每日签到连接状态字体颜色（2026-11-11）

账号列表的「已连接」复用青绿色、未连接保留中性灰色，登录失效使用琥珀色；详情连接标记同步采用相同状态优先级，修正失效文案仍显示绿色的情况。字号、字重、选中高亮和控件布局保持。

`npm run verify` 与现有签到 UI 回归通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 CheckinView 和项目 CSS；三主题下逐项核对已连接、未连接、失效的计算颜色与语义 token 一致，选中／未选中及状态事件更新后颜色正确，列表与详情一致，状态变化不改变列表行尺寸。480／360px 下状态颜色正确且应用列表无溢出，pageerror 为 0，截图已目视复核。状态切换为隔离样本，未修改真实账号或提交签到。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `checkin-connection-colors-qa.{mjs,json}`、`checkin-account-status-colors.png`、`checkin-account-status-expired.png` 与 `checkin-connection-colors-{mist,cool,warm}.png`。未更新安装版或发布。

## 伙伴气泡操作区底部留白（2026-11-11）

气泡保留上方与左右 12px 内距，底部改为 8px；提醒区弹性填满最小高度，操作行靠底部排列，修正短标题下方额外的空白。按钮尺寸、横向列对齐、三行待办标题及全部动作沿用现有行为。

`npm run verify` 通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 DesktopIslandApp 与项目 CSS，逐项测量喝水、久坐、AI、日程、待办在顶部／左侧／右侧共 15 种组合的底边距离，均为 8px；按钮保持 24px 高、同一行且不溢出，气泡在既有原生形状限制内。长标题、日程／待办坐标对齐、二次确认、查看、稍后、忽略、健康确认及错误重试检查通过，pageerror 为 0。截图已目视复核，数据为隔离示例，没有修改真实事项或消息。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `closer-bubble-actions-qa.{mjs,json}`、`bubble-sedentary-closer-top.png` 与 `bubble-task-long-title-closer-{top,left,right}.png`。未更新安装版或发布。

## 签到记录仅保留成功结果（2026-11-11）

按用户选择，记录页及条数只接收平台已确认成功的记录，旧失败项不再展示；空状态明确为「还没有成功签到记录」。失败、暂无活动及待确认不新增历史，当前状态仍在概览可见。待确认回读成功后补记成功结果，领取防重复标记保留；已确认但积分未知时仍不虚报到账。

新增服务回归先复现三项失败，修复后签到专项 24／24 及 `npm run verify` 通过。覆盖旧混合历史过滤、新失败不追加、成功写入时仅保留成功历史、待确认跨重启与重连防重复、核对成功补记、再次核对不追加、自动成功的来源和积分及自动失败的处理通知。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 CheckinView 与项目 CSS，按服务公开状态验证条数、成功奖励、只有失败时的零成功空状态及键盘切页；1240／480／360px 下无横向溢出，pageerror 为 0，截图已目视复核。

截图使用已保留的脱敏历史按新服务规则呈现，列表为 1 条 WorkBuddy 成功记录；混合七条数据与失败空态为隔离样本。未修改真实账号、历史文件或安装版，也未提交真实领取。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `checkin-success-records-{before,tests}.log`、`checkin-success-records-qa.{mjs,json}` 及 `checkin-success-records-{page,empty,narrow}.png`。

## 伙伴气泡长标题免滚动（2026-11-11）

待办标题从两行内部滚动改为最多三行自然换行，利用原有 94px 提醒内容区，按钮行坐标与气泡尺寸保持。其他标题保留两行限制，日程仍为灰色标记和两行正文；标题不单独显示滚动条，超长内容省略并保留原生完整标题提示及查看入口。

`npm run verify` 通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 DesktopIslandApp 与项目 CSS。顶部、左侧、右侧下的 35 字示例均完整显示三行，标题不滚动且不与按钮重叠；超长标题稳定省略、完整悬停文本保留。逐项比对短标题／三行标题／超长标题／二次确认的按钮坐标及尺寸一致，气泡高度保持在原生形状限制内。原有查看、稍后、忽略、二次确认、日程对齐和错误重试检查通过，pageerror 为 0，截图已目视复核。

使用隔离示例状态，没有修改真实待办或消息。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包括 `expanded-bubble-title-qa.{mjs,json}` 与 `bubble-task-long-title-{top,left,right}.png`。未更新安装版或发布。

## 每日签到的独立记录标签（2026-11-11）

「账号连接」右侧新增「签到记录」，复用共享 Segmented 的点击、方向键与选中滑块。概览移除原最近记录卡片；记录页独占与标题对齐的玻璃面板，显示全部保留历史与条数，沿用原有结果语义色、应用和触发方式、时间、积分及空状态。三项分段等宽，采用既有语义字号与 Phosphor 历史图标。

`npm run verify` 与 22 项签到回归通过。Browser plugin 不可用，使用 Playwright／Edge 渲染真实 CheckinView 及项目 CSS，核对第三标签顺序、独立页面、切回概览／账号连接、方向键切换、七条记录完整展示、事件更新、空状态及切页不触发签到请求。1240／480／360px 下记录面板与标题的左边界和宽度完全一致，标签和记录行无横向溢出；截图已目视复核，pageerror 为 0。

主截图使用已有脱敏账户和历史信息，Qoder 使用前次只读查询确认的可领取状态；七条与空记录为隔离验证数据。未提交真实领取或修改账号、历史、安装版。证据目录为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包含 `checkin-records-tab-qa.{mjs,json}`、`checkin-records-page.png`、`checkin-overview-three-tabs.png`、`checkin-records-narrow.png`、`checkin-records-empty.png` 和 `checkin-records-regression.log`。

严格静态审计仍有 14 项既有发现，按文件及规则对比无新增；DESIGN lint 为 0 错误、1 项既有 YAML 提示，`git diff --check` 通过。

## 伙伴气泡的日程层级与事项按钮对齐（2026-11-11）

日程气泡改为灰色常规字重的「日程提醒」与 500 字重标题，标题最多两行并保留完整悬停文本。日程与待办共用紧凑三列及 94px 提醒内容区，底部操作行保持；两种气泡的查看／稍后按钮宽高和位置一致，日程的第三列留空。完成按钮切到二次确认时位置与尺寸保持。AI「稍后」沿用只收起当前提示、保留未读的语义。

`npm run verify` 通过。Browser plugin 不可用，使用现有 Playwright／Edge 渲染真实 DesktopIslandApp 及项目 CSS，隔离示例状态，不启动外部客户端、不写真实待办或消息。三类气泡的查看、稍后、关闭和待办二次确认转发检查通过；顶部 580×184、左右 320×360 下逐项比对日程与待办前两个按钮的 x／y／width／height，短标题、长标题均完全一致。待办三个按钮均同一行、文字完整、无横向溢出，确认前后位置与尺寸相同。长日程标题的字重、颜色、两行限制及关闭按钮边界检查通过；模拟导航失败后错误可读、气泡无溢出且重试可用，pageerror 为 0，截图已目视复核。

严格静态审计保留原有 14 项发现，按文件及规则对比无新增；DESIGN lint 为 0 错误、1 项既有 YAML 提示。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`，包括 `aligned-bubble-render-qa.mjs`、`aligned-bubble-render-qa.json`、`aligned-bubble-audit.json` 和 `bubble-{agent,meeting,task,task-confirm}-aligned.png`。本次为本地实现，未发布或更新安装版。

## 顶栏助手完成气泡（2026-11-10）

final result: passed。按用户给定的「配置模型，开启 AI 助手」气泡复用白色圆角卡片、阴影、指向星光图标的箭头、右上角关闭与右下角深色操作。原完成胶囊移除，完成气泡展示来源对话标题和「查看对话」；生成中、请求失败与浏览器任务入口保留。配置引导和完成提示共用 `AiTopbarHint`，配置读取与一次性关闭状态仍归 `AiSetupHint`；气泡不占顶栏布局宽度。

`npm run verify`、30 项相关回归和 11 项隔离 Electron 检查通过。覆盖后台完成自动出现、当前正在查看会话不弹、返回准确来源对话、重复终态去重、关闭及 Escape 焦点、外部点击、模态卸载后恢复、任务切换与排队保留，以及三主题、长标题、1024px 窗口和 200% 缩放下的气泡边界与箭头。原生测试发现模态卸载时关闭事件可能不再抵达 document，已在共用弹层中补充等待节点移除的恢复观察，并增加单测回归。

Browser plugin not available，使用已有 Playwright 驱动真实 Electron，URL、标题及有效内容均核对，无框架错误覆盖层，渲染与控制台错误／警告为 0。使用两个独立持久化合成会话及正常 preload 事件，不发真实模型请求、不改真实用户数据；对话内容、身份及草稿保持，排除既有自动草稿保存产生的更新时间差异。截图为原生捕获：常规尺寸保留顶栏与气泡，200% 使用完整原生窗口，避免 CSS 坐标裁切失真。

严格静态审计仍有 14 项既有发现，按规则及文件对比无新增；DESIGN lint 0 错误、保留原有 YAML 提示，`git diff --check` 通过。1024px／200% 下同时观察到顶栏日程／待办区域拥挤重叠，气泡的边界、箭头和操作正常；本轮不扩改其他顶栏控件排版。未打包、更新安装版、提交或发布。

证据：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/ai-completion-hint-{tests.log,verify.log,pilot.mjs,pilot.log,result.json,audit.json,design-lint.log}`，主效果图 `ai-completion-hint-main.png`，其余三主题与缩放图使用同前缀。较早脚本的重复按钮定位、表单「返回」文案及时间戳比较问题已修正，未为脚本修改产品行为或放宽数据内容断言。

## v2.1.5 发布候选（2026-11-10）

用户确认本版同时包含待办助手／消息改动及占星扩展相位。版本、锁文件和 CHANGELOG 已同步至 2.1.5。`npm run verify` 通过；全仓 1006 项测试在本机 1004 项通过，另外两项因 Windows 创建符号链接权限 EPERM 未能执行，保留原测试并由云端 Windows 流程完整验收。发布检查补齐旧占星测试的上限断言：按每组对象的 maxOrb 校验实际偏差，并限制六分不超过 6°、其余不超过 10°，不改变生产计算。

本条记录为发布前本地候选快照；正式发布仍须完成同一构建的五项文件校验、下载包装机及公开跨版本更新验收。日志：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/release-v2.1.5-{tests-final,verify}.log`。功能专项证据见下方消息与相位条目。

## 消息 · Codex 权限检查误报修复 · 2026-11-10

final result: passed。截图中的工具验证描述来自 PermissionRequest，自动审核也会产生；旧实现将请求直接认定为待授权，PostToolUse 后又保留为未读「已结束」，并不代表会话完成。新中继忽略该类请求，主进程过滤存储及旧中继送入的 Codex approval，列表、计数、琥珀点和气泡使用一致规则；底层历史及原始已读／处理状态保留，旧提醒队列单独清理。Stop 仍提醒本轮回复，设置不再承诺没有可靠状态源的待授权提醒。权限检查时长不作为用户等待证据；未修改客户端授权决定或信任记录。

78/78 相关回归、`npm run verify` 及 7 项隔离原生 Electron 验收通过。覆盖旧 pending／resolved 记录启动过滤、旧中继迟到请求不弹气泡、保留原始历史与其他事项、一键已读及跨窗口计数、真实 PowerShell 中继忽略请求但仍送达最终回复、重新加载与 320×420 布局，以及设置文案。主窗口和助手 URL／标题及非空内容正确，无框架错误覆盖层、无运行错误或控制台错误／警告。Browser 插件不可用，使用已有 Playwright 驱动 Electron。所有数据均为隔离合成内容，没有修改真实消息、客户端配置或凭据。

静态审计仍有 14 项既有发现，按规则及文件与上一轮报告比较无新增；DESIGN lint 0 错误，保留原有 YAML 提示。`git diff --check` 通过。沙箱首次回归因临时目录原子重命名 EPERM 失败，正常 Windows 权限下隔离重跑全部通过；早期原生脚本缺少测试收件目录，补建后 7 项通过，均非应用逻辑失败。

证据目录 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`agent-noise-{tests-native.log,verify.log,pilot.mjs,result.json,audit.json,design-lint.log}`，以及 `agent-noise-{filtered,final-reply,narrow}.png`。实际运行的是新构建的隔离实例；没有替换正在运行的安装版或真实中继，尚未打包发布。旧中继在更新工作台后同样受到主进程过滤，无需重复账户授权。

## 消息 · 一键全部已读 · 2026-11-10

final result: passed。在消息筛选主行右侧加入「全部已读」，无未读时禁用但不隐藏；待授权与事项提醒操作另行排列，固定尺寸筛选保持稳定。复用现有 Check 图标和 island token；消息按编号、更新时间快照批量保存，跳过后到消息及同编号的新版本，不把已读当作授权完成。保存成功后广播状态，批量清除对应 Agent 提醒并保留其他提醒。

74 项相关回归、9 组真实 Electron 交互／布局检查及 `npm run verify` 通过。新增回归验证历史和原已读时间保留、待授权不解除、晚到与更新消息保护、消息存储失败不改内存或旧文件、主 frame 权限校验及提醒队列隔离。实际 Electron 验证 Codex／Cursor 混合消息、一键清零、失败重试、跨窗口角标同步、持久化、版本冲突、320×420 及 150%／200% 缩放；预期写入失败被正常提示，无意外运行错误或控制台错误／警告。未使用 Browser 插件（不可用），通过已安装 Playwright 驱动原生 Electron；所有数据位于隔离目录，没有标记用户真实消息。

证据目录 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`agent-read-all-{tests.log,verify.log,pilot.mjs,result.json}`、`agent-read-all-{before,after}.png` 及缩放截图。当前改动尚未打包更新。

严格静态审计保留原有 14 项，按规则及文件比较无新增；DESIGN lint 无错误，保留 YAML 提示。`git diff --check` 通过。

## 待办助手 · 页签与筛选尺寸固定 · 2026-11-09

final result: passed。固定「对话／消息」页签宽度基准和「未读／全部」组宽，计数不再自动撑开按钮；两组使用等宽数字，窄视口可收缩，超长页签文字省略并可悬停查看全文。消息筛选的间距改用共享 `--segment-gap`，让实际按钮与选中背景按同一数值布局。未修改共享 Segmented 的全局样式、计数或消息逻辑。

生产构建及 6 组真实 Electron 布局检查通过：0／1／9／10／99／100／999／1000 条合成未读数据下，四个按钮的坐标、宽高与选中背景宽度均一致；切换筛选、页签和键盘焦点不改变几何尺寸，待授权入口出现时主按钮保持位置。复验 320×420、150% 和 200% 缩放，按钮可见且根容器无横向溢出。运行错误和控制台错误／警告为 0；使用隔离数据与已安装 Playwright 驱动 Electron（Browser 插件不可用），未修改真实消息。

证据目录 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`assistant-fixed-tabs-{result.json,pilot.mjs,pilot.log,verify.log}`、`assistant-fixed-tabs-{0,1000,comparison}.png` 和缩放截图。当前安装版未替换。

严格静态审计仍为原有 14 项，按规则与文件比较无新增；DESIGN lint 无错误，保留 YAML 提示。`git diff --check` 通过。

## Codex 消息 · 真实接入排查与信任审核 · 2026-11-09

final result: passed。初次接入在配置和本机中继自检完成后等待用户审核；后续四项 Hook 已记录信任，2026-11-09 23:41（Asia/Shanghai）只读检查实际消息库，确认 9 条回复与 4 条授权消息，共 13 条真实 Codex 消息，不含接入自检。各会话标识符合 Codex UUID 格式，补充证据为 `real-codex-delivery-confirmed.json`；未保存正文或读取完整对话。

初次只读排查时，运行中的安装版为 2.1.3；工作台对应的用户级 `~/.codex/hooks.json`、消息中继、收件目录及消息库均不存在。此前只有额度授权，消息监听未接入。采用现有 `AgentHooks.connect` 合并配置至真实用户目录，保留其他设置，不改额度授权或 Codex 信任记录；运行实际 PowerShell 中继发送一条明确标记「接入自检」的合成消息，运行中的工作台已消费并保存该条消息。未将合成测试冒充真实 Codex 回调。

源码修正「已开启」的误导性状态：本机配置存在显示「监听已配置」，说明 Codex 设置 → Hooks 的审核信任步骤；未配置显示「尚未接入，需单独开启」。消息空态增加同样引导，入口改为「接入与管理消息提醒」。`connected` 的配置含义已写入契约注释，不能把配置状态单独当作真实回调通过的证据。

11 项相关回归、生产构建与 12 条隔离 Electron 检查通过，运行错误和控制台错误／警告为 0；已查看空消息页的审核说明。严格静态审计仍为原有 14 项；DESIGN lint 无错误，保留 YAML 提示。日志位于同一证据目录：`codex-message-setup-{tests.log,verify.log,result.json,pilot.mjs}`。`real-codex-message-connection.json` 是初次合成自检快照，不能替代后续 `real-codex-delivery-confirmed.json` 的真实回调记录。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`。该次诊断未替换安装版二进制。

## 消息提醒 · 并入账户详情 · 2026-11-09

final result: passed。移除提醒分区的独立 Agent 连接卡片，将 Codex／Cursor「消息提醒」开关并入对应账户详情，消息空态改为「管理消息提醒」。保留既有监听状态、搜索及旧导航；开启和关闭消息仅使用原本机监听接口，不触发额度登录或注销，其他来源不显示未支持的开关。仅增加 Rows 的局部分隔与内距样式，三主题沿用共享 token。

45 项相关回归、11 条真实 Windows Electron 检查及 `npm run verify` 通过。扩展账户设置测试验证原状态保留、配置保存失败及重试、额度授权不受影响、搜索与旧入口定位；实际 Electron 使用隔离的真实 Hook 配置执行开关，并阻断及记录额度登录／注销调用（实际均为 0），验证重载恢复、消息页入口、三主题、原生最小窗口及 200% 缩放。实际内容区为 1023×800／100%，1359×900／200%；没有将原生最小宽度 1024 以下的请求误记为已验证视口。运行错误和控制台错误／警告均为 0，已查看主从详情和 200% 截图。额度账户状态为测试桩，未访问真实账户或用户客户端配置。

证据目录 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`agent-message-settings-{result.json,pilot.mjs,pilot.log,tests.log,verify.log}`、`agent-message-settings-{cursor,reminders,mist,cool,warm}.png` 和缩放截图。当前为本地改动，未更新安装版。

严格静态审计保留已有 14 项，按规则和文件比较无新增；DESIGN lint 无错误，保留原有 YAML 提示。`git diff --check` 通过。

## 待办助手 · 框内工具栏与回到底部 · 2026-11-09

final result: passed。按后续反馈将输入文字、模型选择和发送／停止按钮放入同一个圆角输入框，复用主助手 `ai-compose-input` 外框与聚焦样式，文字在上、工具栏在框内右下角；移除文本区和模型的独立边框。模型选择为 26px 高／12px 字阶，发送及停止为 28×28px／16px 图标，长名称省略。保留消息区「回到底部」：上翻时显示，保留历史阅读位置，点击回到最新消息并恢复跟随；支持键盘，并随内容或视口尺寸变化同步状态。仅修改 `IslandAssistant.tsx` 和 `island-assistant.css` 的运行时代码。

真实 Windows Electron 9 条交互／布局检查及 `npm run verify` 通过；检查了空态、多行草稿、外框聚焦、工具栏在边框内且不与文字重叠、流式回复、阅读位置保留、按钮键盘返回、长模型名、模型菜单及真实配置切换、400×610／320×420 和 150%／200% 缩放。已查看聚焦输入与 200% 缩放的真实截图。运行错误和控制台错误／警告为 0。Browser 插件不可用，使用已安装的 Playwright 库直接驱动 Electron；数据、账户配置及 SSE 模型均在隔离测试目录。最新证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`assistant-composer-result.json`、`assistant-composer-pilot.mjs`、`assistant-composer-{draft,history,bottom,model-menu}.png`、`assistant-composer-*.log` 及缩放截图。未改真实待办或更新安装版。

严格静态审计仍为已有 14 项，逐项比较规则与文件归属无新增；报告保存在 `assistant-composer-audit.json`。DESIGN lint 为 0 错误，保留原有 YAML 提示；`git diff --check` 通过。

## 灵动岛 · 随身待办对话窗 · 2026-11-08／09

final result: passed。按用户选定稿完成吉祥物打开独立待办助手、连续对话、现有模型选择、澄清提问、停止、独立置顶、关闭重开保留及 Agent 消息页。复用真实前后对照与确认执行链路，生成建议不写入待办；并发变化阻止旧建议覆盖，重启恢复聊天／已保存草稿并使待确认建议过期。

45 项相关回归、22 条真实 Electron 流程／布局检查及 `npm run verify` 通过。已同屏查看等比归一的选定稿与实际窗、修改卡，并复验三停靠、小尺寸及 150%／200% 缩放。全量 990/992 通过，另外两项仍因 Windows symlink 权限 EPERM 失败。严格静态审计原有 13 项及新增 1 项共享 Select 误报已如实记录。使用隔离待办及本机合成模型，没有调用真实供应商；未打包、安装或发布。详细对照、修复、证据和边界见[待办助手验收](docs/requirements/shared/desktop-island/qa-ai-assistant-2026-11-08.md)。

## 灵动岛 · 顶部展开的吉祥物移至左下 · 2026-11-08

final result: passed。仅调整 `DesktopIsland.tsx` 的顶部停靠 footer 顺序，吉祥物置于四页导航之前，左右侧停靠保留原顺序。真实 Electron 7 条检查通过：顶部 1／1.5／2 倍缩放无溢出、四页切换、消息点击／Escape 焦点返回及两侧位置；无运行错误或警告。32 项现有回归与 `npm run verify` 通过。未打包、安装或发布。

用户提供的标记截图为位置来源，实际正常尺寸为 580×270 CSS px、DPR 2；已查看修复截图，吉祥物在左下且四页导航完整。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/` 的 `mascot-left-top-{1,1.5,2}.png`、`mascot-left-result.json`、`mascot-left-tests.log` 和 `mascot-left-verify.log`。

## 占星 · 主题解读与右侧助手 · 2026-11-08

final result: passed。按最后确认稿实施八主题、问题示例、可编辑问题与完整本命盘联动，所有生成与续聊回到右侧助手；同命例复用占星会话，跨命例隔离，处理去重、复制、原主题重试、取消及配置导航。主题和问题在本次 renderer 运行内按命例保留，历史主题与命例名称持久保存。

48 项相关回归、23 条真实 Electron 流程／布局检查及生产构建通过；三主题、三尺寸，运行错误和警告均为 0。全量 971/973 通过，另外两项因 Windows 创建符号链接权限 EPERM 失败；严格 UI 审计保留原有 13 项。真实供应商未调用，未打包发布。完整同屏对照、修复记录、截图和测试边界见 [主题解读验收](docs/requirements/life/mingli/qa-astro-reading-2026-11-08.md)。

## Agent 对话提醒 · 吉祥物入口 · 2026-11-08

final result: passed。按确认稿去掉独立铃铛，完成伙伴角标、未读／全部列表、8 秒气泡、独立已读／待授权状态，以及 Codex／Cursor 本机 Hook 接入。70 项测试和生产构建通过；实际 Electron 12 条流程、14 组布局通过。真实用户的客户端对话与授权未操作，Cursor 目前按项目与会话编号定位；未打包发布。

详细范围、视觉对照、测试分层与证据见 [Agent 消息验收](docs/requirements/shared/desktop-island/qa-agent-messages-2026-11-08.md)。

## 占星 · 星体详情四项释义 · 2026-11-07

按要求将下方详情改为星体／点位、星座、宫位与结合解读，移除该卡的相关相位和查看全部。组合随所选对象、星座及宫位更新；缺宫位时说明原因并保留星体＋星座解释。沿用独立卡片、事实信息、选择／取消、盘表联动及完整相位页，清理移除内容造成的无用样式。

15 项占星回归及字阶、类型、生产构建通过；五组隔离 Electron 验证覆盖真实切换、三主题、三窗口尺寸、200%、助手展开、取消及相位页，运行错误与警告为 0。正常太阳卡四项同屏可见；已同屏检查用户原图与实际新卡片。严格静态审计维持原 13 项，无新增；DESIGN lint 无错误，保留原有 YAML 提示。详见[释义验收](docs/requirements/life/mingli/qa-astro-meanings-2026-11-07.md)。当前安装版未更新，之前的列宽候选包需在安装前重建以包含此次改动。

final result: passed

## 占星 · 列位移与运行版本复核 · 2026-11-07

确认当前正式版 2.1.1 未包含项目已有的固定列宽修复。隔离运行原安装资源，复现开关常用点位／小天体时 5.16–18.61px 的列偏移，包括没有滚动条的状态；不再重复修改已经稳定的布局代码。

对项目构建和真实打包程序分别完成七组窗口／助手状态、每组八次显示切换。相对列位置、绝对列位置、整表 X／Y／宽度变化均为 0px；另检查三主题、页签、选择、键盘和 200% 放大，运行错误与警告为 0。独立本地修复安装包已生成并校验；未发布，当前正式版未修改，更新等待用户确认退出程序。完整结果与安装包信息见[运行版本验收](docs/requirements/life/mingli/qa-astro-layout-runtime-2026-11-07.md)。

final result: passed

## 桌面灵动岛 · 额度页减少滚动条 · 2026-11-07

按用户截图收紧额度页布局：顶部环 96px、侧边环 112px，减少内距与行距，保留原字号和状态色。修改前侧边仅 1px 溢出也触发整条滚动条；现在常规双周期与错误提示、侧边三周期可同屏。更多周期／放大时保留内容滚动，底部操作固定；极窄时来源文字省略但保留可访问名称，重置时间独占一行，避免数据被裁掉。

字阶、类型、生产构建通过；19 组隔离 Electron 布局与来源切换／键盘／刷新／管理连接验证通过，运行错误和警告为 0。已同屏检查用户原图和实际修改前后，常规内容严格无纵向溢出；200% 时无横向溢出，操作及完整周期可达。严格静态审计维持原 13 项，无新增；DESIGN lint 无错误，保留原有 YAML 警告。完整边界及证据见[额度页布局验收](docs/requirements/shared/desktop-island/qa-quota-no-scroll-2026-11-07.md)。未更新正式安装版。

final result: passed

## 桌面灵动岛 · 久坐提醒 · 2026-11-07

按已确认的三停靠高保真增加独立久坐提醒，默认关闭／60 分钟；伙伴下方为喝水与久坐两条紧凑行，保留原专注环、分钟输入、待办关联、喝水计次及四页导航。支持已活动重置、10 分钟后、今天暂停／恢复、直达设置和关闭；锁屏、睡眠、勿扰及重启后从新间隔开始，不补弹离线提醒，不以无输入推断离座。

55 项相关回归、字阶、类型与生产构建通过。七组隔离 Electron 检查覆盖三种停靠的真实到点气泡、操作、设置导航／校验／重新加载，以及九组停靠／缩放和原生截图；运行错误与警告为 0。补充检查覆盖确认稿相同状态、设置三主题、1024×760＋AI 侧栏＋150% 放大。按钮最小宽度、侧边 200% 溢出、极窄设置单字竖排，以及清理提醒后残留空气泡已局部修复；最终已同屏比较整体及局部。严格静态审计与此前 13 项完全一致，无新增；DESIGN lint 无错误，保留原有 YAML 提示。

源稿、尺寸归一、修复过程、截图和时钟测试边界见[设计与运行验收](docs/requirements/shared/desktop-island/qa-sedentary-2026-11-07.md)。源码和本地构建完成，未更新正式安装版或发布。

final result: passed

## 占星 · 星体表列宽稳定 · 2026-11-06

星体表原有 `scrollbar-gutter: stable` 已保持整体宽度，但自动表格布局仍会因新增对象名称、符号及逆行标记重分配列宽。1488／1280／1024px 窗口实测切换十星、常用点位和全部扩展对象时，修复前最大位移分别为 7.17／5.16／11.58px。仅为星体表增加专属固定布局与 colgroup，保留滚动条占位、原有颜色、34px 行高及其他信息页的布局；修复后三种宽度的每列位移均为 0px，选中行加粗也不改变列位置。1488×1056 下覆盖实际无滚动（10／14 行）与有滚动（19 行）状态，表宽始终为 373.53px。

`npm run verify` 的字阶、类型与生产构建通过；14 项占星交互回归通过。回归首轮有 5 项因沙箱临时文件原子重命名返回 EPERM，宿主环境复跑同一测试后 14／14 通过。隔离 Electron 使用真实命例保存与计算、独立数据目录，不修改用户命例；检查三主题、三窗口宽度、200% 缩放、AI 侧栏、四页签、键盘选择与盘表联动，无横向溢出，渲染器错误和警告为 0。已检查原生截图；严格静态审计为其他既有组件的 13 项发现，本次两处代码无新增发现。

DESIGN lint 无错误，保留既有 YAML 警告；隔离窗口结束后已清理测试数据，保留报告与截图。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/03/01a1a1fd-4b70-7da2-8d0b-e6d4d4aacadb/astro-column-stability-2026-11-06/`。用户截图为 `reference.png`，实际修复前后同一窗口与相同状态为 `before-ten.png`／`after-ten.png`、`before-extended.png`／`after-extended.png`，对比为 `comparison.png`；`before.json`／`after.json` 记录各列表格几何，`check.cjs` 为窗口验证脚本，`premium-audit.json` 保留严格审计结果。未更新安装版或发布。

final result: passed

## 桌面灵动岛 · 额度来源品牌 Logo · 2026-11-05

按用户要求，将设置页四个通用图标替换为 Codex 蓝色终端标识、Z Code 黑白 Z、Cursor 立方体和 Grok Bot 机器人头像，右侧账户详情同步使用同一素材。资源取自官方品牌包／官网或本机官方应用包，保持原始图像、颜色及比例，本地打包；[素材出处](src/assets/quota-providers/README.md)逐项记录来源。图标外框沿用原尺寸和三主题表面，图片用 contain 显示，列表／详情为 26／30px，窄窗为 22／20px，空 alt 避免重复朗读品牌名称。

原额度设置交互回归、字阶、类型检查及生产构建通过。3 组隔离 Electron 检查确认四个资源均成功解码、列表和详情一致、没有染色／拉伸、三主题可辨识、窄窗及 150% 放大无横向溢出，页面错误为 0；已检查列表、详情和原生放大截图。严格静态审计当前有 13 项其它规则报告，较上一轮多出的 `IslandShelf.tsx` 文本域报告属于并行改动，本次品牌替换未新增发现。DESIGN lint 无错误，保留既有 YAML 警告。

运行中的工作台已刷新并核对四个 Logo；总设置、灵动岛设置与 AI 配置保持一致，恢复原 AI 助手分区。证据：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-brand-logos/`，窗口回归为 `qa-1793877443961/report.json`、`providers.png`、`theme-*.png`、`native-150.png`；实机为 `live-result.json`、`live-providers.png`、`live-overview.png`。

final result: passed

## AI 助手 · 首次配置引导气泡 · 2026-11-05

按已确认稿在顶栏 AI 入口下增加一次性配置气泡：无对话模型时延迟显示，关闭后本机不再自动弹出；直达 AI 设置并沿用首次模型自动启用。读取失败不误报、RLCD 不算对话模型；已有模型但关闭助手不提醒，自动出现不抢焦点，并避让原生弹层／模态框。

14 项相关回归、字阶、类型与生产构建通过；8 组隔离 Electron 检查通过，包含真实配置路径、关闭后重新加载、三主题／三尺寸和焦点。首轮修正指针边框偏移，最终中心偏差 0px；已将确认稿与实际窗口整体、局部归一化同屏检查。严格静态审计保留其他组件既有 12 项发现。详见[设计、行为与验收证据](docs/requirements/shared/ai-assistant/qa-setup-hint-2026-11-05.md)。

final result: passed

## 桌面灵动岛 · AI 额度连接方案 3 · 2026-11-05

采用用户选定的左侧四来源、右侧账户详情结构，官网／断开收进共享更多菜单，Z Code 按需打开新密钥编辑；刷新位于账户连接标题右侧，阈值为底部单行。草稿在来源、搜索、分区和刷新之间保留并重新掩码；失败可重试，成功或取消后清空。

20 项相关回归、字阶、类型与生产构建通过。8 组隔离 Electron 验收通过，覆盖连接状态、密钥编辑、菜单、异步请求、搜索、阈值、三主题与窄窗。首轮发现 150%／助手打开时来源列表挤压，已用极窄单列及换行修复，并以原生窗口截图确认动作及阈值可见。已同屏检查所选稿与实际渲染的整页和局部；无未解决的 P0／P1／P2。运行中的工作台已刷新，配置保持并恢复原分区。严格静态审计维持既有 12 项报告；DESIGN lint 无错误，保留既有 YAML 警告。

详见[所选设计、修复与证据](docs/requirements/shared/desktop-island/qa-quota-master-detail-2026-11-05.md)。

final result: passed

## AI 助手 · 供应商双栏页内配置 · 2026-11-05

采用用户选择的方案 1：左侧只显示手动添加的供应商，对话模型和决策模型共用相同的连接表单与连续模型列表。连接字段页内保存，草稿在本次渲染器运行中保留；密钥不回填，保存后清空输入。沿用原测试连接、模型编辑、图片输入与删除确认，保留紧凑启用栏和问号说明。

8 项相关回归、字阶、类型与生产构建通过；9 组隔离 Electron 检查通过，覆盖空配置无预置、真实添加与独立保存、草稿保留、重新加载、菜单和连接失败重试，以及三主题／三窗口尺寸。已检查设计稿与实际组件对比。严格静态审计保留其他组件既有 12 项发现，DESIGN lint 因离线缓存未命中未执行。详见[范围、证据与验收边界](docs/requirements/shared/ai-assistant/qa-inline-provider-2026-11-05.md)。

final result: passed

## 设置 · 数据目录入口归类 · 2026-11-05

应用数据目录及待办共享库的打开操作归入「待办与数据」，与原共享库路径入口合并，保留真实路径、同步状态、库版本和数据规模；「关于」仅保留版本及应用更新，页头说明同步调整。两个目录操作在共享库状态尚未读取或失败时仍可使用，打开失败在当前页显示对应错误；复用原接口，不改变实际数据位置。

新回归先记录待办与数据页缺少应用目录入口，再验证目录调用、唯一共享库行、正常／加载／读取失败、打开失败反馈、搜索及关于页移除入口。原关于页目录测试迁至数据页，保留版本／更新回归。15 项相关测试、字阶、类型和构建通过。4 组隔离 Electron 检查通过，覆盖目录动作对应、当前页搜索、关于页两行和最小窗口宽度；目录打开接口使用测试替身，不启动系统资源管理器。严格静态审计维持既有 12 项报告。

运行中的工作台已刷新，确认两个目录操作位于待办与数据、共享库仅一条、关于页仅版本和更新，配置保持一致并恢复原设置分区。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/settings-data-directories/`；窗口回归为 `qa-1793861698359/report.json`，实机为 `live-result.json`、`live-data.png`、`live-about.png`。

final result: passed

## 设置 · 通用与外观合并 · 2026-11-05

二级目录合并为「通用&外观」，使用 settings-general 统一入口与助手对象名称；开机自启、窗口关闭行为、待办提醒、界面语言及三款主题共用一个 Rows 列表和设置快照，搜索只产生一个匹配结果区。旧 settings-appearance／settings-notifications 归并到同一页并保留正确导航高亮，不迁移或重置既有设置。

新增 React 回归先记录通用页缺少主题行，再验证合并、跨项搜索、一般设置与主题连续保存、写入失败回退及历史入口。15 项设置／助手上下文／关于页回归、字阶、类型与构建通过。6 组隔离 Electron 检查通过：六个导航入口和五项设置、三主题即时保存、跨区搜索及唯一空态、旧入口与高亮、最小窗口宽度下助手展开／收起、刷新后保存值恢复。已检查窗口截图；严格静态审计维持既有 12 项报告。

运行中的工作台已在确认无未保存输入后刷新，实际设置目录与页头均显示「通用&外观」，五项设置可见；刷新前后配置逐项一致，主题保持原值。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/settings-general-appearance/`；窗口回归为 `qa-1793860244645/report.json`，实机为 `live-result.json`、`live-merged.png`。

final result: passed

## 桌面灵动岛 · 清空记录按钮缩小 · 2026-11-05

置物架右下角清空记录及其确认／取消按钮改为 24px 高、11px 字阶、2px／10px 内距，仅调整该操作区的样式。字阶、类型与构建通过；隔离 Electron 检查覆盖顶部／左侧／右侧的空列表禁用、有文件、确认与取消状态，以及侧边 150% 缩放。各按钮实测高 24px、文字 11px，确认仍只移除记录，合成原文件保留。已检查原生截图。严格静态审计维持既有 12 项报告。

当前运行窗口已即时应用：实测字号由 14px 变为 11px、最小高度由 32px 变为 24px。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-clear-button/`；布局报告 `qa-1793859438186/report.json`，实际样式前后记录 `live-result.json`。

final result: passed

## 桌面灵动岛 · 侧栏上下分区与额度居中 · 2026-11-05

左右侧收起态改为上下独立排布：伙伴和日历固定在上方，额度容器占满分割线下的剩余空间，四个来源作为一组纵向居中；保留上一轮 24px 伙伴／额度环和 20px 日历。紧凑高度下使用对称内距，提醒按钮保留自己的空间，状态文字不会挤出窗口。

字阶、类型和构建通过；8 组隔离 Electron 检查通过，覆盖三种停靠、100%／150% 缩放、已连接／未连接／加载／异常及过期、长日程加提醒和悬停收放。所有侧栏样例同时校验额度组中心与分割线下可用区域中心的偏差小于 1px，日历位于分割线上方。已检查原生截图。严格静态审计维持既有 12 项报告。当前应用已直接加载样式，用户当前顶部／小工具／未固定选择保留，顶部前后尺寸和位置一致。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-side-centering/`；布局与居中报告为 `qa-1793859081841/report.json`，实时样式应用记录为 `live-result.json`。

final result: passed

## 桌面灵动岛 · 侧栏图标放大与上移 · 2026-11-05

左右侧收起态的常规额度环与伙伴从 18px 放大为 24px，日历从 16px 放大为 20px；收紧纵向间距并将内容略向上排布。紧凑高度下仍使用原有小尺寸，保证放大显示、四家状态文字与提醒同时出现时不溢出。改动仅在侧栏收起样式中，窗口尺寸、顶部及展开页布局保持原样。

字阶、类型和生产构建通过，复用的 8 组隔离 Electron 检查覆盖顶部／左侧／右侧、100%／150% 缩放、已连接／未连接／加载／异常及过期、长日程加提醒、真实周期、悬停收放和底部操作位置。严格静态审计维持既有 12 项报告。已检查原生截图，并直接应用样式到运行中的右侧栏：伙伴上移 20px、日历上移 16px，实际尺寸分别为 24px／20px，额度环为 24px；四家名称、64×360 外框及当前页面／固定／停靠设置均保留。

证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-side-icons/`；布局报告为 `qa-1793858693197/report.json`，实机前后坐标为 `live-result.json`，截图为 `live-before.png`、`live-after.png`。

final result: passed

## 桌面灵动岛 · 收起摘要补齐四家额度 · 2026-11-05

收起摘要改为复用完整来源列表，常驻显示 Codex、Z Code、Cursor、Grok Bot，分别使用紫、绿、蓝、橙色；状态放在名称下方，保留真实周期的单环／双环及无数据灰环。顶部收起为 580×40，左右侧收起为 64×360 并纵向排列；放大时收紧间距，名称和状态完整显示。日程可省略，提醒与额度保持可见，展开页刷新、管理连接位置不变。

47 项窗口／存储／额度回归、字阶、类型和构建通过。8 组隔离 Electron 检查覆盖四家均已连接／未连接／加载／错误及过期状态、三种停靠位置、100%／150% 缩放、长日程加提醒、真实周期顺序与单环、四种颜色、悬停及底部操作固定；已检查原生截图。5 组原生区域检查确认可见区域和鼠标命中一致、透明画布穿透、快速反转、固定及减少动态效果正常。严格静态审计维持既有 12 项报告，含已确认的共享 Select 误报；DESIGN lint 无错误、保留既有 YAML 警告。

运行中的工作台已正常重启加载修复，顶部／左侧／右侧均显示四家来源，收起逐帧检查保持画布与摘要稳定；原位置、页面、固定及全屏隐藏设置已恢复。通过应用正常接口复查四家均已返回 ready 状态。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-four-providers/`，布局报告为 `qa-1793856008985/report.json`，原生报告为 `input-1793855894155/report.json`，实机记录为 `live-result.json`。

final result: passed

## 桌面灵动岛 · 收起闪烁修复 · 2026-11-05

收放改为固定原生窗口画布，在动画结束后通过原生区域裁剪可见与鼠标命中范围，避免收起末尾再次缩放 Chromium 画布；收起摘要不再重复淡入。摘要响应自身区域的鼠标进入，确保连续换边后仍可悬停展开。收起摘要的紧凑布局按自身容器尺寸适配，边缘间距按展开尺寸约束，短屏仍保持同一锚点；透明区域允许点击穿透。

三位置逐帧对比先记录旧行为：画布／视口发生切换，摘要重新淡入、局部位置变化；修复后顶部、左侧、右侧均保持画布／视口和摘要坐标稳定，收起摘要始终不透明。30 项窗口／存储回归、类型、字阶及构建通过，补查短屏与最大偏移时的共同锚点通过。5 组 Electron／Windows 检查通过，原生区域与实际可见框一致，命中检查确认窄条可交互、透明画布点击穿透，覆盖 150% 放大、快速反转、固定与减少动态效果。另有 4 组停靠交互回归通过，覆盖六种换边、在内／在外鼠标、固定与设置入口。严格静态审计保留原有 12 项报告，含已确认的共享 Select 误报；DESIGN lint 无错误、保留既有 YAML 警告。

运行中的工作台已正常重启加载修复，三个位置逐帧检查通过，原位置、页面、固定及全屏隐藏设置已恢复。证据目录：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-collapse/`；对比为 `frame-regression.json`，原生命中报告为 `input-1793854677175/report.json`，实机记录为 `live-result.json`；换边回归为相邻 `island-dock-hover/qa-1793855044975/report.json`。

final result: passed

## 桌面灵动岛 · 切换位置后的自动收起修复 · 2026-11-05

修复窗口换边后旧悬停状态仍被保留的问题：停靠位置改变时读取系统鼠标坐标，重新判定是否在新窗口内；未固定且鼠标在外时按既有动画立即收起。右上角切换返回收起状态后同时清理渲染端悬停记录，避免请求结束时再次发送旧的保持展开状态。鼠标仍在新窗口内或图钉已固定时保持展开；不增加轮询或延迟，不改变页面、连接和固定偏好。

两个新增回归先复现异常再通过；30 项窗口／存储回归、字阶、类型及构建通过。4 组隔离 Electron 检查通过：顶部／左侧／右侧六种方向切换，在切换后不补发鼠标移动或移出事件也会收起；鼠标在新窗口内时保持展开，随后移出正常收起；已固定时三个位置均保持展开；设置页入口行为一致。严格静态审计维持原有 12 项报告，含已确认的共享 Select 误报；DESIGN lint 无错误、保留既有 YAML 警告。

已正常重启运行中的工作台，用真实系统鼠标位置核对顶部、左侧、右侧均能自动收起，固定后均保持展开；最终恢复原顶部、页面、固定与全屏隐藏设置。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-dock-hover/`：`qa-1793853656134/report.json`、`live-result.json`。

final result: passed

## 桌面灵动岛 · 侧边展开改为竖向面板 · 2026-11-05

按用户纠正，左右停靠展开为 320×560 竖向面板，侧边提醒为 320×180；顶部尺寸和布局保持原样。侧边页头分为标题／操作与日期两行，底部导航图标在上、名称在下；完整月历与事项、额度环与周期信息、专注与伙伴上下排列，置物架改为纵向文件列表。额度刷新、管理连接继续固定在内容区底部，不随来源和连接状态跳动。

先用两个尺寸／边缘回归复现横向问题，再验证修复；28 项存储和窗口回归、字阶、类型及构建通过。7 组隔离 Electron 检查通过，含左右四页、42 格月历、长标题和文件名、单双来源／无额度状态的按钮坐标、150% 放大、窗口边界、快速收放、位置菜单键盘操作与减少动态效果。四页逐张截图检查，150% 下允许内容滚动，页头和底部操作可达。严格静态审计仍为 12 项原有报告，含上一轮已确认的共享 Select 误报；DESIGN lint 无错误、保留既有 YAML 警告。

运行中的工作台已正常重启并加载新版。首次实机自动化在全屏隐藏设置生效时等待可见控件超时；临时关闭该设置后，左右展开／收起实测通过，最终恢复原设置、顶部位置、页面和固定状态。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-portrait/`：`qa-1793851263043/report.json`、四页截图、`live-result.json` 与 `live-left-expanded.png`。

final result: passed

## 桌面灵动岛 · 顶部／左侧／右侧停靠 · 2026-11-05

右上角在固定按钮前新增停靠位置菜单，复用共享 Select 与 Phosphor 图标；设置页同步选择并持久保存，旧配置默认顶部。侧边以 48×240 窄条展示伙伴、日程入口与额度环，在所选工作区垂直居中，向屏幕内展开；动画保持停靠边缘与中心，原生窗口仍只在动画边界调整。展开页面、额度操作按钮与既有数据逻辑保持一致。

类型、字阶和生产构建通过；40 项存储、窗口和额度回归通过，新增用例先复现缺失行为，再覆盖配置迁移／保存、左右边缘、负坐标显示器、边界夹取、快速动画反转及切换期间取消旧缩窗。6 组隔离 Electron 检查通过，覆盖键盘菜单、三个停靠位置、固定／未固定、四页切换、设置同步、重新加载、150% 放大、未连接／提醒与减少动态效果。已正常重启运行中的应用，左右两侧实测展开、收起正常，最终恢复原顶部、页面和固定状态。

严格静态审计报告 12 项：11 项原有发现，以及新增菜单的 1 项误报。审计器将 JSX 标签名称转为小写，把从 `src/ui/controls.tsx` 导入的共享 `<Select>` 当作原生 `<select>`；本次未添加原生选择器。DESIGN lint 无错误、保留既有 YAML 警告。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-dock/`：`qa-1793850346932/report.json`、`live-result.json`、`live-menu.png`、`live-left-collapsed.png`、`live-right-expanded.png`。

final result: passed

## 桌面灵动岛 · 额度操作按钮固定 · 2026-11-05

刷新、管理连接统一常驻右下角，取消无额度状态中间的管理连接按钮；内容及错误提示在独立区域内滚动，避免挤动底部操作区。沿用现有按钮样式、顺序和图 1 的位置。四个来源、加载、连接中、无缓存失败、保留缓存失败和刷新忙碌状态的两个按钮坐标均一致；管理连接仍定位工作台的 AI 额度设置，4 组专项检查通过。类型、字阶和生产构建通过。严格静态审计仍有 11 项其它组件既有发现，DESIGN lint 无错误、保留 YAML 警告。

已刷新运行中的顶栏，实测四个来源坐标一致，恢复原来源、页面、展开和固定状态。证据位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-quota-actions/`，专项报告为 `qa-1793848726810/report.json`，实机报告和截图为 `live-result.json`、`live-fixed.png`。

final result: passed

## 桌面灵动岛 · 收起额度恢复同心环 · 2026-11-05

按用户最新选择恢复紧凑同心环：外圈 5h、内圈周额度；收起使用 26px，窄窗口 22px，保留紫色／青色来源区分。复用展开页环形组件，小环不显示中央图标，单个真实周期保持单环；保留 Z Code `unit + number` 周期解析修正。删除仅用于横线的样式，与用户所选同心环示意对照并保留已启用的圆环伙伴。

构建、类型和字阶检查通过；7 组 Electron 专项通过，覆盖无数据、双周期映射、四页固定摘要、单周期、0%／100%／过期、360px／150% 放大和悬停展开。实机顶栏已刷新，账户、页面及固定状态保留，实际 Z Code 显示 5h／周双环，Codex 当前只有周周期，显示单环。严格静态审计仍为其它组件 11 项既有发现，DESIGN lint 无错误、保留 YAML 警告。

截图与证据位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-rings-final/`；专项报告为 `qa-1793848407115/report.json`，实机截图为 `live-collapsed.png`。

final result: passed

## 桌面灵动岛 · Z Code 周期标签修正 · 2026-11-05

修正遗漏 `unit + number` 导致两个周期都显示「服务」的问题；5 小时与周周期正确解析，未知积分周期保留「积分配额」，不改变剩余比例和重置时间。回归先重现重复标签，再验证修复；额度及存储 26 项测试、类型、字阶和生产构建通过。通过应用自身正常刷新实测，Z Code 返回 5h 与周，两项当前均剩余 100%；运行中的顶栏标签已更新，原页面和固定状态保留。证据：`C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/zcode-labels/live-result.json` 与 `live-fixed.png`。

final result: passed

## 桌面灵动岛 · 收起额度双横线 · 2026-11-05

按用户选择，收起摘要采用双横线，5h 在上、周额度在下；展开额度页保留同心环。未知周期保留实际名称，单周期显示单条，悬停可查看具体百分比。沿用紫色／青色来源区分、共享字阶和灰色无数据轨道，与已选横线示意保持一致；保留后来增加的圆环伙伴。

构建、类型和字阶检查通过；隔离 Electron 的 6 组专项检查通过：未连接、双周期顺序和单周期、四页摘要固定且展开保留环形、0%／100%／过期、360px 和 150% 放大、悬停及运行时错误。修正了 150% 下额度条的轻微溢出。严格静态审计仍为其它组件的 11 项既有发现；DESIGN lint 无错误，保留既有 YAML 警告。本次不重复无关全屏检查。

运行中的顶栏已更新并保留账户、当前页及固定状态；实际 Codex 当前只返回周额度，显示单条，Z Code 的两项服务配额显示上下两条。截图、布局测量及检查报告位于 `C:/Users/henry/.codex/visualizations/2026/11/05/01a1a94c-41f5-70d2-ad4b-8da4f965aab7/island-bars/`，通过报告为 `qa-1793847498739/report.json`，实机截图为 `live-collapsed.png`。

final result: passed

## 桌面灵动岛 · 额度同心环 · 2026-11-05

收起与展开统一同心环；展开按来源切换，左环右侧周期／剩余比例／重置时间，真实单周期显示单环。构建、类型、字阶、28 项回归、10 组额度专项通过；完整桌面脚本 20 组通过并补完 3 组恢复检查，全屏检查因测试窗口未获得前台焦点未通过。严格静态审计保留 11 项其它组件既有发现。试用顶栏已更新，账户连接及原页面／固定状态保留。[视觉对照与验收边界](docs/requirements/shared/desktop-island/qa-rings-2026-11-05.md)。

final result: passed

## 桌面灵动岛 · 580×270 紧凑展开 · 2026-11-05

展开尺寸由 640×300 缩至 580×270，收紧标题／底栏、月历、文件区和专注环，沿用原有字阶，长内容内部滚动。构建、类型、字阶、27 项回归和 9 组隔离 Electron 检查通过，覆盖四页、月历与实际新增／完成、原生文件图标及重定位、额度、小工具、真实 360px 和 150% 缩放、移出／移入，0 个渲染／控制台错误。原试用目录已重启为新尺寸并恢复草稿、日期与文件引用；静态审计保留 11 项既有非本次文件发现。[验收与截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 紧凑底部导航 · 2026-11-05

四个按钮高 34→28px、字阶 14→13px、图标 18→16px，收紧内距与间距，底栏占高 44px。字阶和生产构建通过，5 组隔离 Electron 检查通过，含四页／键盘切换、选中态、真实 360px 窄窗和 150% 缩放，0 个渲染／控制台错误。原试用窗口已替换样式并核对实际尺寸，保留草稿与页面状态。[验收与截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 未固定移出即收起 · 2026-11-05

取消草稿、输入焦点、菜单、处理中请求和拖入阻止收起的例外；仅固定时在鼠标移出后保持展开，草稿及日期仍保留。已先复现未固定、鼠标在外仍展开的基线，再通过构建、类型、字阶、27 项回归和 10 组隔离 Electron 检查，覆盖菜单、请求、拖离、快速移回、提醒与减少动态效果，0 个渲染／控制台错误。原试用窗口已加载并验证移出收起。静态审计保留 11 项既有非本次文件发现。[验收记录](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 原生文件样式 · 2026-11-05

文件页改为横向桌面图标项，保留 Windows 实际 Shell 图标、原名和大小；快捷方式显示目标应用及链接标记，文件夹恢复原生样式，角标只移除引用。图标批量读取并复用到拖出，失败保留文件和操作。构建、类型、字阶、27 项回归和 12 组隔离 Electron 检查通过，覆盖真实文件拖入、打开路径、拖出图标、横滚、失效重定位、清空、360px 与 150% 缩放，0 个渲染／控制台错误。试用窗口已更新；静态审计保留 11 项既有发现，未打包发布。[验收与截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 日程待办合并 · 2026-11-05

日程与待办合为一个入口和设置开关，按所选日期查看和新增，保留切页／收起后的草稿及日期，兼容旧开关与停留页。紧凑列表让普通日程与待办同时可见，继续使用 640×300 外框。构建、类型、字阶通过；24 项相关测试和 15 组隔离 Electron 实机检查通过，含 360px、150% 缩放实际新增与失败恢复，0 个渲染／控制台错误。原试用目录已打开新版。静态审计保留 10 项既有发现及 2 项共享 Select 误报，未打包发布。[验收记录](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 设置页重设计 · 2026-11-04

将连续大行改为顶部总开关与五个分区，采用紧凑卡片、页面图标选项和独立账户连接区，搜索覆盖全部分区；窄窗改单列并避开 AI 助手。构建、类型、字阶及 19 项设置回归通过，18 组隔离 Electron 检查通过，含三主题、宽窄窗口、150% 缩放、键盘、搜索和失败恢复，0 个渲染错误。真实账户未连接；Python 不可执行，premium 严格静态审计未完成。[验收与原生截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 扁平展开体量 · 2026-11-04

展开外框由 640×360 改为 640×300，收紧标题／底栏与内容留白；月历「今天」收进标题行，小工具相应压缩，主计时字阶保持。构建、类型、字阶、17 项相关测试与 10 组隔离 Electron 布局检查通过，五页、工具全开、窄窗与 150% 缩放无操作覆盖，0 个渲染错误。[验收与原生截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 悬停直接完整展开 · 2026-11-04

按最新反馈移除中间两行预览，悬停 350ms 直接打开 640×360 完整面板，移出后延时收起，固定／输入／菜单期间保持。构建、类型、字阶、17 项相关测试及 20 组核心 Electron 检查通过；三组恢复检查另行通过。全屏复测受实际前台窗口不符影响未通过，保留具体边界与历史结果。[完整记录](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 悬停与短预览修正 · 2026-11-04

按用户实机截图反馈将摘要图标与文字整体居中，移除悬停浅色底框；收起 312×40 与短预览 312×72 保持相同宽度和顶部位置，只向下伸展。构建、类型、字阶、17 项相关测试及 22 组 Electron 检查通过；0 个渲染错误，已核对实际收起／预览截图。[验收与截图](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。

## 桌面灵动岛 · 2026-11-04

按原会话最后确认的 V2 方案替换顶栏／托盘悬浮待办入口，新增共享设置页并接入日程、待办、文件、额度和小工具。构建、类型、字阶及 23 项专用测试通过；22 组隔离 Electron 验收通过，包含三层展开、五页尺寸稳定、待办回写、文件引用、专注／喝水、360px 窄窗、150% 缩放、Windows 全屏恢复和重启，0 个渲染错误。全量 873 项中 871 通过，2 项原有 Windows symlink EPERM；Python 不可执行，premium 静态审计未完成。真实额度账户与跨应用拖放等边界、五项视觉复核和原生截图证据见[完整验收](docs/requirements/shared/desktop-island/qa-2026-11-04.md)。未打包发布。

final result: passed with the recorded environment and integration limitations

## 个人网站 · 内容目录细化 · 2026-11-04

按确认的局部高保真稿将目录标题和新建加号合并一行，简化分组图标／数量，减少缩进并使用 32px、8px 圆角的浅蓝选中行。构建、既有编辑组件回归和 5 组隔离 Electron 检查通过，覆盖三主题、三尺寸、新建、键盘折叠、草稿放弃保护及焦点恢复，无渲染错误。源图 `exec-a97d2289-815e-4002-a59b-b990034bfb9f.png` 为 1024×1536 放大局部，实机为 1600×1000、1x；原生目录截图与等宽同屏对照保存在本机 `personal-sidebar-qa/`。五项视觉复核、具体绝对路径与边界见[验收记录](docs/requirements/web/personal-website/qa-layout-2026-11-04.md)。严格静态审计保持 10 项既有发现，本轮目录修改文件中 0 项。未打包发布。

final result: passed

## 个人网站 · 紧凑布局与折叠预览 · 2026-11-04

按确认稿取消工作区页签，项目栏压薄，正式网页与设备、展开／收起保持一行。收起与展开保留正文、选择、滚动及同一网页会话；检查移入更多菜单的右侧抽屉。实测项目栏 48px、正文框至少 200px，默认编辑／预览约 6:4。`npm run verify`、8 项定向回归和 7 组隔离 Electron 实机检查通过，覆盖三主题、1600×1000／1280×820／1024×680、保存、失败重试、键盘和正式／开发会话切换。

源图为 `C:/Users/henry/.codex/generated_images/01a1a1fd-4b70-7da2-8d0b-e6d4d4aacadb/exec-f56fa615-6d5b-40b5-a6c1-d2bc6905c241.png`（1774×887 画板）；实现为 `C:/Users/henry/.codex/visualizations/2026/11/03/01a1a1fd-4b70-7da2-8d0b-e6d4d4aacadb/personal-site-qa/desktop-split.png`（1600×1000，1x）。同目录保留内容区、工具栏与收起状态的等宽、等比例对照；没有像素级一致性声明。五项视觉复核、修正历史、完整证据和测试边界见[验收记录](docs/requirements/web/personal-website/qa-layout-2026-11-04.md)。严格静态审计仍有 10 项既有发现，修改文件中 0 项；DESIGN 格式 CLI 因离线缺包未运行成功。未打包发布。

final result: passed

## 个人网站内容工作室 · 2026-11-03

按用户选择的方案 2 接入作品、博客、文库编辑与真实 Astro 预览。完成三主题、宽窗与 1024×680 窄短窗口、只读差异、草稿保护、真实构建和五页 HTTP 检查；修正预览视口、未保存博客地址、空栏目首次新增监听、弹框间距、正式地址保存切换和运行状态颜色。[完整验收记录](docs/requirements/web/personal-website/qa.md)。全量 850 项测试中 848 项通过，2 项既有 Windows 符号链接权限失败；定向回归 40/40 通过。实际网站源码副本的首次保存与后续热更新通过；最终 v2.0.0 发行载荷预览和中文终端通过，10 个编译文件与构建哈希一致，五项本地资产检查通过。

final result: passed with the recorded Windows test-environment limitations

## 占星扩展星体与点位 · 2026-11-02

新增四个点位与五个小天体,两组原生复选框统一控制盘面、表格和相位,保留原独立详情卡片与十星统计。[完整验收记录](docs/requirements/life/mingli/qa-astro-extended-2026-11-02.md)。490 项独立 JPL 参考校验、7 组平均点位基准、78 项回归和 `npm run verify` 通过;隔离 Electron 离线实测三主题、双尺寸、200% 缩放、键盘、显示切换及缺少地点,15 张原生截图,没有名称重叠或横向溢出。Python 入口不可运行,premium 静态审计未执行。未发布安装器。

## 占星星体详情 · 独立胶囊卡片 · 2026-11-02

按用户明确范围将行星表格下的选中星体详情拆成独立玻璃卡片,两卡等宽、间隔 12px、详情圆角 36px。既有选择、取消、盘表联动及相位入口保留。

[完整验收记录](docs/requirements/life/mingli/qa-astro-detail-capsule-2026-11-02.md)。13 项既有界面回归、`npm run verify` 与最终构建通过;隔离 Electron 检查三主题、双尺寸、200% 缩放、AI 侧栏、键盘选择与取消,无页面错误。已查看实际截图并核对卡片边界和相位颜色。Python 缺失,premium 静态审计未执行。未打包安装器。

## 占星时间基础 · 第二批第一部分 · 2026-11-02

命例编辑加入地区时区、历史夏令时自动换算、重复时刻选择和不存在时刻校验。旧命例保持固定 UTC+8，八字与紫微继续原口径。共享 Select 与原生单选沿用主题字阶，命例弹框在窄窗内固定标题、独立滚动表单。

[完整验收记录](docs/requirements/life/mingli/qa-astro-time-2026-11-02.md)。59 项命理/时区回归和 8 项 AI 范围回归通过；`npm run verify` 通过，滚动修正后再次构建及原生 QA 通过。隔离 Electron 实测三主题、1488×1056、1024×680、200% 缩放、菜单对齐与 Escape、重复时段键盘选择和重开、前后端空档拒绝。截图检查发现并修复了原透明标题与滚动表单重叠。Python 缺失，premium 静态审计未执行，不计作通过。未发布安装器。

## 星盘探索 · 第一批 · 2026-11-02

按确认高保真实现日月升概览、分布浮层、盘表联动、十二宫与现代守护、组合相位筛选及中文术语说明。右侧四页签共用卡片,桌面与左盘等高,选择不撑高布局。

[完整验收记录](docs/requirements/life/mingli/qa-astro-phase1-2026-11-02.md)。`npm run verify` 与 46 项相关回归通过;真实隔离 Electron 检查三主题、1488×1056/1024×680、200% 缩放、AI 侧栏、键盘操作、分布浮层与焦点恢复、筛选空态、四宫/五宫同步及选中相位语义色,无渲染或控制台错误。源图与同尺寸实机图已同屏复核。未发布或更新安装版。

final result: passed for astrology phase 1

## 命理占星 · 深色圆盘方案 2 · 2026-10-31

按用户选定的方案实现浅色玻璃外壳与深色分层星盘,保留真实黄经、整宫制、ASC/MC 和逆行;右侧复用共享 Segmented 切换行星落座与完整相位列表。文字标签防重叠仅调整显示位置,数据及计算不变。

[完整视觉与交互验收](docs/requirements/life/mingli/qa-astro-dark-2026-10-31.md)记录源图、同尺寸桌面截图、局部对照和修正历史。27 项命理回归、类型检查与构建通过;真实隔离 Electron 核对三主题、三视口、方向键焦点、相位滚动、缺少出生地、逆行、AI 侧栏及历史数据保留,无页面错误。全仓 premium 审计因未安装 Python 未能执行,未计作通过。

final result: passed

## Hush-Hour · 移除独立重启入口 · 2026-10-25

按用户确认移除「重启本地」按钮及组件对应分支，保留「构建并刷新」和随状态切换的「启动本地／停止」。沿用现有按钮、图标与主题样式，并同步行为规范和项目说明。

`npm run verify` 与 17 项既有 Hush-Hour 回归通过。隔离 Electron 中的真实组件通过 6 组验收：入口精简、键盘启停与焦点保留、启动失败恢复、构建成功刷新及失败重试、三主题与 1280×820／1024×680 布局、减少动态效果及零渲染错误。窗口验收使用受控服务／构建 bridge 和预览替身；真实服务与构建流程由既有隔离项目测试覆盖。截图、脚本及记录位于本机 `test-results/hush-hour-controls-20261025/`。

全仓严格静态审计仍有 10 项既有发现，所在源码均与 HEAD 一致；本次 Hush-Hour 组件无发现。未以静态审计代替交互验收。

final result: passed for Hush-Hour project actions

## Hush-Hour · 项目栏构建四态 · 2026-10-22

按用户确认稿将待构建、构建中、已同步和失败集中到项目名旁；失败同行查看日志，主按钮可重新构建。旧启动错误在构建中收起、恢复后清除，独立红色提示行移除。自动检测更新、手动构建及本地／正式预览行为保留。

[完整四态视觉与行为验收](docs/requirements/web/hush-hour/qa-build-status.md)。受控 bridge 下的真实 Electron 组件渲染通过 9 项验收，另有 17 项组件及隔离主进程回归与完整构建通过。已打开并对照确认稿和实际四态合并图；徽标对比度问题修复后重新验收，三主题与窄窗无未解决的 P0/P1/P2 发现。本轮未重新发布安装包。

final result: passed

## AI 测试工作台 · 配置工具栏分组 · 2026-10-22

按用户明确的分类要求，标题行保留任务名、操作状态和保存任务；工具栏分为「输入」（提示词、添加材料）、「模型」（对比模型、模型设置）、「校验」（统一校验配置）。每组提供小标题和可访问分组名称，桌面用细竖线分隔，空间受限时保留标题并省略竖线。按钮保持 32px 轻量描边样式，展开校验编辑独占下方整行。材料标签放在工具栏下方，标题和保存状态沿用原字阶及主题。

Browser plugin not available，使用新的 WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED=1，通过 Playwright Electron 验证 1490×1040 和 1024×680。5 组验收通过，覆盖页面身份、非空内容、三个分组名称与五入口同高顺序、两个弹框及焦点恢复、实际材料导入/只读查看/移除、模型勾选、键盘展开校验编辑、实际保存及窄窗弹层边界。无框架错误层、页面错误或控制台错误；未启动模型测试。npm run verify 及最后 CSS 调整后的构建通过，静态审计仍为 10 项既有提示。

桌面和窄窗截图、脚本、几何记录位于本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-grouped-toolbar-qa。

final result: passed for task-card layout and configuration controls

## AI 测试工作台 · 模型设置与代码折叠 · 2026-10-21

温度、单次输出上限、限时及 Agent 工具上限移入「模型设置」共享 Modal，保留应用、取消、未应用关闭确认和执行中只读。错误复用任务字段 schema 校验，关联并聚焦对应输入。「对比模型」仍为模型名、供应商和复选框组成的菜单，数字表示已选数量，最多四个。结果代码默认折叠，保留文件名、查看代码入口及只读标识；每列独立切换，将 112px 高度交给预览。

Browser plugin not available，使用 Playwright Electron、WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED=1，配置本地受控模型。1490×1040 和 1024×680 的 7 组验收通过：页面身份与非空内容、实际模型菜单及四模型上限、参数应用/取消/错误聚焦/放弃确认、保存及直出真实请求中的一致参数、执行中只读、代码独立折叠与 iframe 状态保留、大预览标签、Agent 工具限额、窄窗菜单和弹框边界。无框架错误层、页面错误或控制台警告。模型调用仅来自显式开始测试，折叠和查看不发起调用。

npm run verify 与 11 项相关回归通过。全仓静态审计仍为 10 项既有提示，无新增项。截图和脚本保存在本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-compact-qa；预览来自合成模型产物，本轮不评价真实模型能力。

final result: passed for compact settings, model picker and code disclosures

## AI 测试工作台 · 提示词弹框 · 2026-10-21

按用户截图反馈，System/User 从总览任务卡移入共享 Modal，主界面仅保留「提示词」入口。应用更新当前配置，取消丢弃弹框草稿；执行中只读。关闭放弃确认时先关闭子弹框，再恢复入口焦点。其余参数和结果布局沿用现有实现。

Browser plugin not available，使用隔离数据目录与本地合成模型的 Playwright Electron。1490×1040、1024×680 验证 6 组通过，覆盖紧凑总览、弹框初值与应用、取消和 Escape/放弃确认、键盘焦点、长内容、保存、直出及 Agent 实际发送的输入和执行中只读。页面身份、非空内容、无框架错误层、控制台健康与截图均通过；npm run verify 和 11 项相关回归通过。截图、脚本与请求证据位于本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-prompt-qa。本轮使用受控夹具验证输入链路，不评估真实模型质量。

全仓静态审计仍报告 10 项既有 Select 识别、textarea 和按钮项，本轮弹框无新增项；不以此声明全仓审计通过。DESIGN.md 官方 lint 的离线包缓存缺失（ENOTCACHED），未为此新增项目依赖。

final result: passed for prompt-dialog interaction and controlled model inputs

## AI 测试工作台 · 方案 1 与最终大预览 · 2026-10-21

[行为边界与已选高保真](docs/requirements/ai-test/workbench/README.md)。保留现有共享导航、三主题和 authored 控件；详情默认大预览，代码及校验过程按需展开。实际模型名称和状态取代设计稿中的示意内容。

使用隔离的 Electron 正式构建和本地 OpenAI 兼容服务验收。Browser plugin not available，使用 Playwright Electron；配置 WORKBENCH_TEST_DATA_DIR 与 WORKBENCH_ISOLATED。页面身份、非空内容、无框架错误层、控制台健康、截图和实际交互均通过。桌面 1490×1040、1280×820，窄窗 1050×800、1024×680；窄窗多标签的宽度挤出已修复，标签条独立滚动，工具栏和大预览保持在内容区内。

完整链路 13 组通过，覆盖并发直出、独立标签与状态保留、原始回复及输入快照、并发断言、真实失败隔离、取消、复跑、Agent 写入和网页操作、JavaScript、发现问题后修复复测、工具及时间上限、导入导出、保存和重启。补验两个独立供应商端点和合成密钥在同名模型下互不串线。示例中的刷新恢复缺陷真实得到 4/5，修复后得到 5/5，未使用预置通过状态。

与设计稿的有意差异：保留当前已发布的共享顶栏与导航；控件使用现有白色选中态，模型使用实际配置名称；不添加未经实现的版本选择或假评分。预览内容来自模型夹具生成的文件，用户代码的布局由产物自身决定。

测试脚本、截图及 JSON 证据保存在本机 Codex 可视化目录 2026/10/21/01a15c43-42fc-7ad1-8a96-c3e5358f675e/ai-test-qa，未写入个人数据或真实密钥。构建与字阶、类型检查通过；新增 11 项回归通过，项目回归 792 通过、2 项既有 Windows 符号链接 EPERM 失败。真实供应商质量、Node/Python 及依赖安装执行不在本轮验证范围。

final result: passed for local implementation and controlled fixtures

## 窗口内展开试玩 · 顶部细栏 · 2026-10-20

[查看高保真对照、实际截图与交互验收](docs/requirements/game/preview-expand/qa.md)

final result: passed

## 游戏终端工具栏 · 方案 3 · 2026-10-19

[查看高保真对照、实机截图与交互验收](docs/requirements/game/terminal/qa.md)

final result: passed

## 游戏测试检查 · 方案三下拉选择 · 2026-10-19

[查看高保真对照、实机截图与交互验收](docs/requirements/game/test-selector/qa.md)

## 内置离线语音听写 · 方案 2 扁平细化稿 · 2026-10-19

[查看设计、实际截图与功能验收](docs/requirements/shared/voice-input/qa.md)

2026-10-17：完整验收正文已按模块和需求迁入 docs/requirements；本页保留原标题作为历史链接入口。当前效果以 DESIGN / UX-CONTRACT 及对应日期的验收记录为准。此次目录整理未重跑历史实机流程。

[需求总索引](docs/requirements/README.md) · [全部资料与原路径映射](docs/RESOURCE-INDEX.md)

# 代码仓整理与整体设计核对 · 2026-10-17

[查看完整记录](docs/archive/audits/design-sync-2026-10-17.md)

# 试玩保留档重置 · 方案 1 · 2026-10-17

[查看完整记录](docs/requirements/game/trial-reset/qa.md)

# AI 收起时的其他工作台悬浮目录 · 2026-10-17

[查看完整记录](docs/requirements/shared/navigation/qa.md)

# 游戏工作台二级目录恢复 · 2026-10-17

[查看完整记录](docs/requirements/game/trail-detective/qa.md)

# AI 悬浮胶囊 · 2026-10-17 · 内嵌按钮修订

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 浏览器任务记录 · 2026-10-17 · 已选方案 2

[查看完整记录](docs/requirements/web/browser-task-record/qa.md)

# 顶栏日程/待办共享面板 · 2026-10-17 · 已选方案 2

[查看完整记录](docs/requirements/shared/topbar/qa.md)

# 应用更新改为主动安装 · 2026-10-17

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# AI 合并悬浮胶囊 · 2026-10-17 · 已选方案 3（历史阶段，已被内嵌按钮修订替代）

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 顶栏更新气泡紧凑调整 · 2026-10-17

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# 顶栏应用更新验收 · 2026-10-17 · 已选方案 1（初版）

[查看完整记录](docs/requirements/shared/app-update/qa.md)

# AI 连续任务状态验收 · 2026-10-17（历史阶段，44px 固定状态行已被替代）

[查看完整记录](docs/requirements/shared/ai-activity/qa.md)

# 三主题还原验收 · 2026-09-24

[查看完整记录](docs/requirements/shared/themes/qa.md)

## 浏览器确认组合 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-automation/qa.md)

## 浏览器网页缩放 · 2026-10-16

[查看完整记录](docs/requirements/web/page-zoom/qa.md)

## 阅读库路径入口修复 · 2026-10-16

[查看完整记录](docs/requirements/life/reading-import-51/qa.md)

## 浏览器运行胶囊动效 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-activity/qa.md)

## 浏览器 AI 状态框持续动效 · 2026-10-16

[查看完整记录](docs/requirements/web/browser-activity/qa.md)

## 轨迹侦探双区联调 · 2026-10-16

[查看完整记录](docs/requirements/game/trail-detective/qa.md)

## 游戏项目终端 · 方案 2 · 2026-10-16

[查看完整记录](docs/requirements/game/terminal/qa.md)

## 浏览器站点授权 · 方案 3 · 2026-10-17

[查看完整记录](docs/requirements/web/site-authorization/qa.md)

## 游戏项目栏 · 方案 1 · 2026-10-17

[查看完整记录](docs/requirements/game/project-bar/qa.md)

## 双环境试玩与线上侧栏 · 方案 1 细化稿 · 2026-10-17

[查看完整记录](docs/requirements/game/online-preview/qa.md)

## 游戏项目说明 · 内置只读 Markdown 弹窗 · 2026-10-17

[查看完整记录](docs/requirements/game/run-instructions/qa.md)

## 试玩更新提示 · 方案 3 · 2026-10-17

[查看完整记录](docs/requirements/game/preview-refresh/qa.md)

## 2026-10-17 问题反馈方案 2：记录入口、持久保存与 ZIP

[查看完整记录](docs/requirements/game/issue-feedback/qa.md)

## 伙伴气泡提醒 · 2026-11-05

选定视觉为 `docs/requirements/shared/desktop-island/design/mascot-speech-approved-2026-11-05.png`（1881×836，含桌面留白和方案标题）。实现截图位于 `C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/island-speech-reminders/`：`water.png`、`schedule.png`、`quota.png`、`left.png`、`right.png`、`failure.png`、`narrow.png`、`zoom-150.png`、`long-title.png`、`water-actual.png`；运行证据为 `report.json` 与 `responsive-report.json`。截图使用隔离任务库与合成提醒，额度连接均为真实未连接状态，没有调用真实供应商或改动用户提醒计划；浅色桌面底仅为隔离截图背景。

### 对照口径与结果

- 实机原生画布为顶部 580×270 DIP；气泡状态外框为 580×184 DIP，截图为 1160×368 像素，显示密度 2x。150% 缩放截图使用 Electron webContents.capturePage 的原生 DIP 区域，避免 Playwright locator 截图在 Electron 缩放下产生额外裁切。侧边外框为 320×360 DIP。源稿包含方案说明，不将其留白或标题当成应用内容；按同一 40 DIP 顶栏比较主体，保留当前应用的字号、窗口边缘和真实连接状态。
- 全景与局部对照：同一轮视觉检查中打开确认稿与 `water.png`，核对保留顶栏、左侧唯一伙伴、指向伙伴的气泡、主次按钮和关闭入口；再检查日程、额度、左右停靠、错误、长标题、窄窗和缩放截图。可读内容均为真实组件，主次操作可达。
- 字体：复用 Segoe UI／微软雅黑字体栈及共享 14px 正文、11px 操作字阶，保持中文换行与完整长标题滚动，不重新生成或栅格化 UI 文字。
- 布局：气泡宽 264 DIP、距顶栏 12 DIP，内距 16 DIP、圆角 18 DIP；保留 112 DIP 最小高度以容纳不同类型操作，长标题最多占用 48 DIP 并可滚动。顶栏几何在收起／气泡之间不变。原生区域跟随实际气泡高度，不在卡片下方留下不可见的点击遮挡。
- 颜色：复用 `island-surface`（#1b1d21）、白色正文和蓝色主按钮。与概念稿的轻微高光相比，使用现有应用的平面 token；灰色未连接环为真实数据状态，属于预期差异。
- 图像／图标：复用既有圆环伙伴、原生 SVG 额度组件与 Phosphor 图标；新增的气泡指向使用 Caret 图标，没有用整张设计稿代替可交互界面。无新栅格素材、占位图或虚构额度。
- 文案：喝水为「喝口水，歇一下吧。」；日程保留真实标题；额度保留来源、周期与真实百分比，并简写为「只剩…啦」。查看额度会选中触发提醒的来源。

### 检查及修复历史

1. [已修复 P2] 150% 缩放时气泡变为 396 DIP，超出 264 DIP 原生裁剪区域。气泡按窗口缩放比例补偿，顶栏高度及侧条宽度同步换算。修复前证据为 `zoom-150-before.png`，修复后为 `zoom-150.png`；原生区域与控件边界断言通过。
2. [已修复 P2] 固定最大裁剪区域会在短气泡下方留下透明命中区。通过只接受本岛主帧的实际高度同步，并对尺寸限幅；实测单行卡片的原生下沿为 164 DIP，与气泡底部一致，其他空白穿透。
3. 额度句子精简为单行，并从提醒标识定位来源；隔离实机确认点击 Cursor 提醒的「查看额度」进入 Cursor 来源。
4. 前台键盘焦点和指针悬停分别核对；8 秒保持与移开重计时由原生假时钟回归验证，实机定时到点后闲置约 8 秒恢复顶栏。验证脚本显式确认前台焦点，避免将后台窗口的 DOM focus 当作真实键盘操作。

### 验证

- `npm run verify`：字阶、两个 TypeScript 工程与 Vite／Electron 构建通过。保留现有 npm 配置与大 bundle 提示。
- 55 项相关回归通过：`tests/desktop-island.test.ts` 21 项、`tests/island-store.test.ts` 17 项、`tests/island-quotas.test.ts` 17 项。覆盖隐藏喝水静默、提醒优先级／去重、普通卡片回退、信任边界、原生区域、悬停计时与三类提醒。
- 隔离 Electron 实机 13 组检查通过，0 个 pageerror，响应式检查无 console warning/error：三类气泡、日程稍后写回、喝水失败重试／去重、查看对应额度来源、真实到点自动弹出与收回、左右停靠、360px 窄窗、150% 缩放、长标题、减少动态效果与 Escape。
- `DESIGN.md` lint：0 错误，保留既有 YAML 提示。变更文件 diff whitespace 检查通过。
- Python premium 静态审计未执行成功：`py -3` 返回 `No installed Python found!`；不声称全仓静态审计通过。未运行无关全仓测试、真实账号低额度或 Windows 系统通知。
- 主进程与 preload 已更新；当前用户预览未强制重启，需要重启才能使用新提醒模式。测试实例全部关闭。

无未解决的 P0／P1／P2；平面色 token 与现有窗口体量是明确的产品适配。后续可再微调气泡的轻微高光，不影响当前交互。

final result: passed

## 提醒气泡收紧 · 2026-11-05

- 根据用户最新反馈，将单行提醒气泡从 264×112 DIP 收紧至 224×84 DIP，面积减少约 36%；内距 16→12px、圆角 18→14px、正文 14→13px、按钮高度 28→24px、内容间距 14→10px、按钮间距 8→6px。顶部顶栏、气泡锚点、提醒队列和自动收回规则保持。
- 顶部与左右停靠的原生可见／命中区域同步收紧，右侧气泡继续贴近伙伴；实际高度仍随内容测量。长标题使用两行高度的内部滚动，多按钮允许换行，确认完成不再挤出边界。
- `npm run verify` 通过；55 项相关回归通过。隔离 Electron 的 14 组检查通过：三类提醒和失败重试、对应额度来源、实际到点与约 8 秒收回、左右停靠、360px 窄窗、150% 缩放、长标题、减少动态效果、Escape，以及三操作待办的二次完成换行与真实写回。
- 实测普通喝水卡片 224×84 DIP，原生下沿 136 DIP；无 pageerror。150% 截图使用 Electron 原生捕获，避免 locator 截图裁切。
- 最新证据在 `C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/island-speech-compact/`，包含 `water.png`、`schedule.png`、`quota.png`、`task-confirm.png`、`zoom-150.png`、`report.json`、`responsive-report.json`、`wrap-report.json`。此前 `island-speech-reminders/` 的尺寸和截图保留为历史对照，不作为本次尺寸结果。
- DESIGN lint 无错误，保留已有 YAML 提示；既有 Python premium 静态审计缺少解释器的限制仍在，不据此声明全仓静态审计通过。本轮未改动用户真实提醒或账号。原生裁剪更新需重启当前预览后完整生效。

final result: passed

## 置物架方案 1 · 2026-11-05

视觉目标为用户最新选择的附件，已保存到 docs/requirements/shared/desktop-island/design/shelf-split-approved-2026-11-05.png（948×1659）。没有将此前未选中的方案当作目标，也没有创建独立演示页面。实际组件为 IslandShelf.tsx，接入现有 DesktopIsland、受限 IPC 与本机原子存储。

### 对照口径

- 同轮检查确认稿与 side-final.png 的全景，再检查编辑器、记录卡片、原生图标和更多菜单局部。参考按宽度缩放到 640px 时高度为 1120px；实机侧边为 320×560 DIP、2x 捕获得到 640×1120px，使用同一尺度比较。顶部为 580×270 DIP，截图 1160×540px；未扩大窗口迎合概念稿。
- 字体：沿用 Segoe UI／微软雅黑与既有字阶，分区标题 13px、文件名／正文 12px、时间与辅助说明 10px，中文保持真实可选择文本。顶部长文件名省略但路径提示完整，编辑器可取出全文。
- 布局：侧边三列网格在上、文字在下；顶部网格在左、文字在右。侧边内容左右 16 DIP，编辑器约 78 DIP 高，卡片 46 DIP 起，底栏保持常驻；清空入口移入文件区菜单。360px 窄窗与 150% 缩放叠放分区、允许内容滚动，保存和导航仍可达。
- 颜色：复用深黑背景 #090a0c、炭灰表面 #1b1d21、蓝色 #76aeff 与既有选中态。空草稿的保存按钮按真实校验状态禁用；固定按钮因稳定截图处于开启态。这些状态差异不用于仿造概念数据。
- 图像与图标：使用系统读取的 Cursor、VS Code、Edge、PowerShell、文件夹与 Word 关联图标；快捷方式角标和应用实际图标属于 Windows 原生结果。复用 Phosphor 的文件夹、复制、加号、关闭及更多图标；没有生成替代品牌图或将整张稿栅格化。
- 内容与交互：应用与文件、文字、粘贴或写点什么、保存、复制和更多菜单对应选稿。测试样例只写入隔离目录；日常实例没有新增示例卡片。文件原名／大小继续保留既有业务信息。文字 CRUD、草稿与清空文件引用相互独立，没有剪贴板后台监听。

### 问题与修复

1. 已修复：初版外层与文字列表同时预留滚动条槽，导致右边距多出 30 DIP。只在置物架取消无滚动时的预留槽，文件与文字重新对齐两侧 16 DIP；未改变其他页面的滚动样式。
2. 验证脚本初版在原生重设窗口后立即截图，截到上一帧布局且图标未载入；已拒绝该截图作为通过证据，增加实际布局、原生图标和绘制等待后重拍。键盘菜单检查等待真实首项聚焦后再发送 End，避免把异步打开时间误报为产品缺陷。
3. 360px 测试最初被生产窗口的不可调整大小属性阻止。仅在隔离测试实例临时允许调整，再恢复固定尺寸；未修改生产窗口行为。150% 使用原生 capturePage，避免 Electron 缩放下的 locator 截图裁切。

### 所有权与验证

- 文字表单属于 IslandShelf，输入使用原生 textarea；限制与草稿 Schema 在 shared/island-contracts.ts，主进程 IslandStore 再次校验。更多菜单扩展 GameOptionsMenu 的 island 业务变体，保留已有项目／预览／终端菜单行为；忙碌与错误复用 DesktopIsland.run，复制使用既有 clipboard.write。
- Browser 插件未提供，按本机 Electron 项目使用 Playwright _electron，通过真实 preload／IPC 操作。15 组实机检查全部通过，0 个 pageerror；除打开参数与剪贴板参数在测试实例内被记录外，不模拟产品的保存、迁移或窗口恢复。未断言外部应用启动结果或系统原生拖出接收结果。
- 62 项相关回归通过：island-store 22、desktop-island 23、island-quotas 17。npm run verify 通过字阶、两个 TypeScript 工程和 Vite／Electron 构建；保留现有 npm 配置及 bundle 大小提示。DESIGN lint 0 错误、1 条既有 YAML 提示。
- Python premium 静态审计仍因本机没有 Python 解释器而未运行；不据此声称全仓审计通过。未执行无关全仓测试。无未解决的本次 P0／P1／P2。
- 证据目录：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/island-shelf-split/，包含 side-final.png、side-empty-files.png、left-final.png、top-final.png、narrow-360-text.png、top-150-percent.png、top-150-text.png、report.json 和 qa.mjs。所有测试实例关闭，当前用户实例未强制重启；需完整重启以载入新的主进程和 preload。

final result: passed

## 占星星体分表与四轴（2026-11-09）

- 按用户提供的测测分组参考，将「星体」页改为「行星信息」「小天体」两张表，去掉显示复选框。前表为十颗主要星体和四轴，后表为五颗小天体与四个点位。沿用原表格、配色、字阶和滚动区；四轴只读，星体保留盘表选择和独立详情。
- 宫头边界检查发现，直接用经度分配普拉西德天底时，浮点误差会把它归入第三宫。已按该宫制的四轴宫头定义使用 1／7／4／10 宫；整宫制继续按实际黄经分配。本次补充上海 2020-04-09 11:34 边界回归，并核对高纬度整宫制天顶在十一宫、天底在五宫。无地点时四轴显示破折号，极区分宫不可用时保留角度但不填造宫位。
- `npm run verify` 通过字阶、两个 TypeScript 工程及生产构建；`node --import tsx --test tests/bazi-astro-house.test.ts tests/astro-extended.test.ts tests/astro-reading.test.ts tests/astro-calculation.test.ts` 最终 45 项通过、0 失败。测试辅助函数起初误把整宫制宫头当成四轴，已修正预期；计算规则和原始命例未改动。
- Browser 插件未提供，使用 Playwright Electron 与独立数据目录完成 8 组实机检查：14／9 行、无开关、19 个对象常驻盘面、三主题、1488×1056 与 1024×680、列内文字边界及末行滚动可达、鼠标／键盘选择与取消、相位筛选、缺地点及两种宫制。0 个页面或控制台错误。已查看最终真实截图，未修改截图内容或用合成图替代验收。
- 证据目录：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/astro-tables-2026-11-09/，含 pilot.mjs、report.json、tests.log、verify.log、tables-1488-mist.png 及其他主题／窄窗口截图。验收脚本最初误用了不存在的命例标题类名，已改用真实节点重新通过，没有为脚本定位修改产品。
- Python premium 静态审计仍因本机无 Python 解释器而未执行，不计为通过。保留既有 Vite 包体提示；本次未运行无关全仓回归，未发布安装包。隔离测试实例已关闭，未重启用户当前实例。

## 星体详情滚动条内缩（2026-11-09）

- 修复前已在独立 Electron 复现：圆角 36px 的详情外框直接滚动，滚动条距外框右边及上下均为 0。将滚动移到卡片内层，外框保留上下 18px、左右 12px 内距和圆角裁切，内层左右各 10px 文字内距；继承全局滚动条样式，滚动区可聚焦并支持键盘操作。
- 最终实测滚动区距外框右边 13px、上下各 19px（含边框）；1488×900 时卡片高度仍为 345.92px。三主题、1488×900／1280×850／1024×680 及 200% 缩放均检查；有溢出时 End／Home 和鼠标滚轮可到达内容，无溢出时自然展开。四项释义、选择取消与原始数据保持。
- `npm run verify` 通过字阶、前后端类型及生产构建；`node --import tsx --test tests/bazi-astro-house.test.ts` 为 16 项通过、0 失败。6 组原生验收通过，无页面错误；已查看修复前后及最终缩放截图。Python premium 审计受此前确认的本机无解释器限制，未执行，不计为通过。
- 证据：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/astro-detail-scroll-2026-11-09/，含 before.png、before.json、after-mist.png、after-cool.png、after-warm.png、after-1488-2.png、report.json、tests.log、verify.log 和 pilot.mjs。初版放大截图因自动化裁切坐标失准被拒用，最终改用 DOM 滚动定位与 Electron capturePage 原生截图，未为脚本修改产品布局。测试实例已关闭；未发布或重启用户实例。

## 宫位详情与星体卡片统一（2026-11-09）

- 修复前用回归场景复现：选中太阳再手动切到宫位，旧太阳详情仍出现在宫位表之前。最终手动切页清除旧选择；点击当前页签保持选择，宫内星体及现代守护链接仍自动进入对应星体页，盘面选取也按对象进入对应页签。
- 宫位详情从表格内移到表格下方，复用星体详情的独立玻璃卡片及内容滚动层；标题、事实行、分项说明与「已选中 · 取消」统一。保留真实宫头、宫位主题、宫内对象、现代守护及空宫说明；无新排盘算法或对象数据。清除不再使用的宫位双列事实样式。
- 原生实测两种卡片宽度相同（426.13px）、间隔均 12px、圆角 36px、外层内距 18px 12px、标题 18px、取消入口 12px，滚动内容距右边框 13px、上下边框 19px。核对三主题、1488×900／1280×850／1024×680 和 200% 缩放，无横向溢出，宫内多对象可完整显示并点击。
- `npm run verify` 通过字阶、两个 TypeScript 工程及生产构建；`node --import tsx --test tests/bazi-astro-house.test.ts tests/astro-reading.test.ts` 为 23 项通过、0 失败。新增回归覆盖跨页重复、独立卡片位置、同页签保留、同行二次点击、取消、盘面联动及宫内对象跳转。9 组隔离 Electron 验收通过，包括空宫、6 个对象的宫位、真实键盘操作和缺少地点，无页面或控制台错误。
- 证据：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/astro-house-card-2026-11-09/，含 before-tests.log、tests.log、verify.log、pilot.mjs、report.json、house-layout.png、house-mist.png、house-cool.png、house-warm.png、house-1024.png、house-zoom-200.png。已查看最终实际截图；缩放截图等待布局后采用 DOM 定位和 Electron capturePage，拒用先前未定位到卡片的截图。
- Python premium 静态审计仍受此前确认的本机无解释器限制，未执行；本次未运行无关全仓回归或发布安装包。隔离测试实例已关闭，用户当前实例未强制重启。

## v2.1.4 本地发布预检（2026-11-09）

- 本次候选包含已完成的占星分表、四轴、文案精简、星体／宫位独立详情与滚动边界，以及灵动岛助手输入区、回到底部和账户消息设置调整。版本文件同步到 2.1.4，发布说明记录真实改动，Codex 真实 Hook 回调仍取决于客户端审核，不把本机自检或配置存在写成真实消息已验收。
- 版本同步后 `npm run verify` 通过。完整本机测试在允许回环服务的环境运行，995 项中 993 通过；2 项真实文件符号链接夹具因本机 EPERM 未完成，未跳过或修改测试，发布须由全新云端 Windows 环境覆盖全量回归及装机验收。受限沙箱中的首次完整测试因回环服务／文件权限不满足而终止，不计作通过。
- 已定位到 Codex 随附的 Python 运行时并补跑 premium 严格静态检查，报告 14 项启发式结果（6 项归属识别、8 项字面模式提示），没有计作全仓静态通过。共享 React Select 在旧版即存在；其余按钮／textarea 命中位于本次未修改的文件，未为发版扩大无关改动。此前「未找到 Python」记录指当次默认入口不可用、未定位到随附运行时，并非确认整台机器没有解释器。
- 证据：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/release-v2.1.4/，含 tests-unrestricted.log、verify.log、premium-audit.json。正式验收沿用仓库已有流程：同一次构建的五项资产经草稿完整下载校验、下载包装机验收后发布，再独立校验公开文件及 v2.1.3→v2.1.4 的真实更新。

## Astrodienst 相位规则与分组（2026-11-10）

- 用户确认以有出处的 Astrodienst 规则为参照，并明确选择「只计算已有官方依据的对象，其他对象仍显示位置」。采用 2.GW / Liz Greene 100% 的五大相位子集：十星及凯龙星 10°／六分 6°；数学点为 0°，配对取平均得到 5°／六分 3°，点位间不计算、不启用 to all objects、不增加四轴相位。谷神、智神、婚神、灶神仅保留位置、落宫、顺逆行和详情。原星历、时区、平均交点与宫制算法保留。来源及适用范围已写入 UX-CONTRACT。
- 相位页复用既有表格、共享 Select 与 caption 字阶，主星及扩展关系分表，组内按偏差升序；新增「实际偏差」「上限」两列及按需展开的规则和官方来源。筛选、索引选中、取消及盘面连线仍使用同一结果；AI 上下文同步来源、实际偏差与上限，不再声明扩展统一 3°。TEST 命例新结果为 39 条（主星 23、扩展 16），没有为了减少数量修改官方上限。
- `npm run verify` 通过字阶检查、前后端类型及生产构建；五份占星计算／界面／解读测试共 52 项通过。新增边界、跨零点、舍入前判定、点位配对、位置对象不参与相位及完整 AI 上下文回归。首次受限测试中的存储 EPERM 在专用临时目录及允许原子写入的运行环境中消除，未改动存储实现或弱化断言。
- Browser plugin not available，采用独立合成数据的 Playwright Electron 实测：页面身份、23/16 分组、四列数据、原生 disclosure 键盘、共享 combobox Escape 与焦点恢复、组合筛选／盘面连线、空结果恢复、扩展行索引、全部位置及详情、三主题、1488×900／1024×680／200% 缩放均通过，9 组检查且无渲染或控制台错误。已查看主表、展开规则、窄窗口和原生缩放截图。QA 脚本早期的英文标题／button 角色定位已按真实中文标题和 combobox 语义修正，未为脚本修改产品。
- Premium 严格静态审计仍报告 14 项既有提示，均位于本次相位改动之外（6 项归属识别、8 项字面模式），未计作全仓静态通过；没有扩大到其他任务的灵动岛、AI 或语音页面。未运行全仓发布验收，未发布或重启用户实例；隔离验收实例已关闭。
- 证据：C:/Users/henry/.codex/visualizations/2026/11/04/01a1a746-c52f-7451-8935-d81fa6f8fde7/astro-aspects-2026-11-10/，含 tests.log、verify.log、pilot.mjs、pilot.log、report.json、premium-audit.json、aspects-main.png、aspects-rules.png、aspects-extended.png、aspects-filtered.png、三主题截图及窄窗／200% 原生截图。

## 待办助手打开防闪动（2026-11-10）

- 用户确认每次点击打开都会闪。检查发现复用窗口仍执行相同的原生边界重设及重复显示，切回对话页发生在显示之后；回归先复现了加载时第二次点击提前暴露窗口的问题。改为组件提交初始化／对话页就绪后，在透明准备阶段恢复绘制并等待完整画面，再一次显露和聚焦；已显示窗口只聚焦。
- 66 项相关回归通过，覆盖加载中的合并打开、关闭取消、晚到帧不能显露后续请求、绘制失败后恢复节流并可重试、独立置顶与 IPC 窗口边界。`npm run verify` 通过字阶、类型及 Vite／Electron 构建。
- Browser plugin not available；使用已有 Playwright 驱动隔离的 Windows Electron。5 组原生检查通过：冷启动连续三次请求只显露一次；从消息页关闭后重开三次均先准备对话页；可见窗口重复点击只聚焦并保留手动调整的尺寸；调整大小后在左／右停靠重开正常；6 次实际显露均在非空画面和对话页就绪之后，没有冗余边界重设或渲染异常。首次及再次打开的实际准备帧均已查看，确认不是加载页或旧消息页。
- 初始化的布局提交与已绘制画面分别等待；透明预热使重新分配尺寸后的窗口也能绘制，准备后恢复后台节流。测试使用独立数据目录，未接触真实账户、模型调用或待办；实例已关闭。尚未打包发布，原顶端位置对齐改动保留。
- 证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`assistant-open-result.json`、`assistant-open-pilot.mjs`、`assistant-prepared-frame-{0,1}.png`、`assistant-flash-{repro-test,tests,verify}.log`。静态 premium 审计保留 14 项既有发现，新增 0。

## 顶端吉祥物收起／展开位置对齐（2026-11-10）

- 仅调整顶部停靠的伙伴样式。原生 Electron 基线显示常规展开后横移 -3px、纵移 -2px，200% 页面缩放时纵向偏差为 16px；窗口定位不变，差异来自两态内距、行高及入口缩放。统一顶部左内距并独立对齐 40px 收起栏／36px 顶栏的中心，保留原顶栏行高和单面板内容布局。
- 实际构建后的独立 Electron 检查通过：580／520／480／440px 四种宽度 × 100%／125%／150%／200% 共 16 组，两态头像中心最大差异不足 0.01 DIP；四个页面与 52 帧展开／收起动画保持同一位置，顶栏按钮无重叠，收起及展开入口均可直接打开助手。左右停靠的原生坐标和几何数据与修改前完全相同，无渲染异常。
- `npm run verify` 通过字阶、类型和生产构建。Premium 静态审计保留 14 项既有发现，新增 0；未扩大改动到其他界面。测试数据和账户全部隔离，额度截图如实显示未连接状态；测试实例已关闭。尚未打包或发布。
- 证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`island-top-anchor-pilot.mjs`、`top-anchor-{before,after}-result.json`、`top-anchor-after-{collapsed,expanded}.png`、`top-anchor-verify.log` 与 `top-anchor-audit.json`。Browser plugin not available，使用已有 Playwright 驱动隔离的实际 Electron 应用；实际两态截图已一起复核，位置及原有内容布局保持预期。

## 灵动岛吉祥物统一左上角（2026-11-10）

- 用户最终要求为左侧、右侧及顶端下拉统一左上角，视觉参考为 `docs/requirements/shared/desktop-island/design/mascot-top-left-approved-2026-11-10.png`。实际复用原顶栏、伙伴、字号和单面板；不保留额外竖栏，底栏仅保留四项导航。与参考图中的 18% 样例不同，隔离实例未连接账户，截图如实显示灰色环和未连接状态。
- 64 项相关回归通过：`desktop-island`、`island-state`、`island-store`。`npm run verify` 通过字阶检查、两份 TypeScript 工程及 Vite／Electron 构建。首次沙箱运行受临时文件原子重命名 EPERM 影响，使用正常本机临时目录的隔离测试重跑后全部通过。
- Browser plugin not available；使用已安装的 Playwright 驱动隔离原生 Electron。13 组检查通过：三种停靠各四页的顶栏头像与底栏无重复、留白／头像悬停不展开、收起态单击直达独立助手、摘要快速经过取消预览／停留展开／移出收起、关闭悬停后点击仍可展开、150%／200% 缩放、两侧 280px 窄窗、伙伴开关和键盘 Enter。未发现按钮重叠或裁切、渲染异常或相关控制台错误。
- 静态 premium 审计仍为 14 项既有发现，新增 0；未将全仓旧问题记作本次通过。正常展开尺寸保留顶部 580×270、侧边 320×560；未改动真实额度、消息、模型或任务数据。测试实例已关闭，未打包、发布或替换正式安装版。
- 证据位于 `C:/Users/henry/.codex/visualizations/2026/11/08/01a1bb32-d93e-7333-9ccd-ece9f90bfb10/`：`island-mascot-top-left-result.json`、`island-mascot-top-left-{left,right,top}.png`、`island-mascot-top-left-{left,right}-280.png`、对应 pilot、verify、tests 和 audit 文件。

## 每日签到（2026-11-10）

已完成实现、隔离桌面检查、20 项签到专项和 31 项相关回归；真实登录与领奖按用户选择稍后验证。完整记录见 [每日签到验收](docs/requirements/shared/checkin/qa-2026-11-10.md)。

## 首页每日签到「并排速览」（2026-11-11）

final result: passed

- 视觉依据：用户选定的「并排速览」高保真，原图 1774 × 887；稳定副本为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/checkin-columns-reference.png`。
- 实现：实际 Electron 开发版首页，窗口截图 1281 × 821（约 1280 × 820 CSS px，系统缩放 1 倍），使用独立 `checkin-columns-acceptance-data`，三家均未连接；原有待办、日程、每周统计和首页移除「更多工作台」的改动保留。
- 完整视图：`checkin-columns-wide.png`、`checkin-columns-narrow.png`。分别在 AI 助手收起／展开时检查约 770px／376px 卡片，按钮、名称、状态与底部操作完整可见。窄图有其他置顶窗口覆盖页面上方，未覆盖本次卡片；不据此声明其他窗口通过验收。
- 对照方式：从原图取约 `(92, 279, 1588, 366)` 的卡片区域，从实机取约 `(91, 390, 770, 184)` 的对应区域；以只读 HTML 显示原始图片，将两者等比例归一到 720px 卡片宽度。最终对照共同放大 2 倍，源图和实机同时出现在 `checkin-columns-comparison-final.png` 中，未使用生成图片替换实际截图。

### 对照与修正

1. 首轮：同宽对照发现宽卡片标题及应用名称偏小（P2），证据 `checkin-columns-comparison-before.png`；当时视觉结果仍需修正。
2. 修正：宽卡片标题采用 lead 18px、应用名采用 section 16px，说明／底部采用 control 13px；微调分组上下间距。窄卡片沿用 16px 标题、12px 应用名、11px 状态和 28px 图标容器，避免挤压。
3. 复查：重新捕获宽／窄卡片及最终同宽对照，标题、主操作、三个横向品牌分组、细分隔线和底部管理入口均符合选定布局；没有剩余可执行的 P0/P1/P2 问题。

### 五项视觉核对

- 字体：沿用项目 Bahnschrift／Segoe UI／微软雅黑后备及语义字号，标题、应用名与状态层级明确，三家名称在窄卡片中完整显示。
- 间距：标题与主按钮同一行，图标与名称／状态相邻；三列在同一表面用细分隔线区分，底部连接数和管理入口分别对齐左右边缘。
- 色彩：复用原玻璃面板、深色主按钮、蓝色管理链接；中性未连接状态使用灰色，真实完成／进行／异常状态继续使用已有语义色。
- 资产：复用原官方图形和项目 Gift／ArrowRight／Circle 图标；TRAE 图形与国内官网 CDN 下载文件的 SHA256 完全一致（488 字节）。对照图的实机区域放大后较软属于截图取样，不是替换资产；原生尺寸截图已复核。
- 文案：保留「每日签到」「三个应用，一处领取」「连接账号」「管理账号」与实际连接计数；按用户确认明确标注「TRAE CN」，不将画布标题「并排速览」带入产品。

### 行为和国内版核对

- 首页「连接账号」与「管理账号」均进入现有每日签到页面；账号连接页能选择 TRAE CN，连接说明明确显示 `www.trae.cn` 和「TRAE CN 国内版账号」，Escape 可关闭。未发起本人账号登录或真实领取。
- 代码保持国内授权地址 `www.trae.cn/authorization`、账号接口 `api.trae.com.cn`、签到接口 `api.trae.cn`、请求区域 `CN` 及国内应用设备元数据目录。仅补齐显示名，没有迁移既有 provider ID 或账号数据。
- 官方核对依据：[TRAE CN 套餐与计费](https://docs.trae.cn/ide_plans-and-billing)、[国内官网](https://www.trae.cn/)。20 / 20 签到专项回归通过，增加的断言验证实际适配器请求的国内状态接口和 `X-User-Region: CN`；最终 `npm run verify` 和 `git diff --check` 通过。
- 开发日志无相关渲染错误。证据目录为上述 visualization 目录，另含 `checkin-columns-trae-cn.png`。真实账号兼容性与奖励发放仍需用户连接后验证；未提交、发布或替换安装版。

## 待办提醒归入待办与数据（2026-11-11）

- 「待办提醒」从通用与外观移到待办与数据首行；页说明和当前页搜索同步归属，旧 `settings-notifications` 入口转到待办与数据。沿用原 `remindersEnabled` 配置键和提醒执行逻辑，不迁移或重置设置。
- 5 项相关回归通过：通用页不再出现／匹配提醒行；数据页读取与保存已有开关值、离开重进保留值、写入失败回退；共享库读取失败不影响提醒控件；旧入口与 AI 页面名称正确。`npm run verify` 和 `git diff --check` 通过。
- 原生开发版可访问性状态确认通用页只保留启动、窗口、语言与主题。截图捕获与目标窗口前景不一致，因此不将该截图或待办与数据页记为原生视觉验收；迁移后的页面行为以实际 SettingsView 的 DOM 回归为依据。

## Logo 居中与首页按钮微调（2026-11-12）

final result: passed

- Logo 沿用原 40px 图形与水平位置，改为顶栏高度垂直居中；首页按钮下移 6px，其他六个侧栏按钮保持原位，选中标记跟随首页按钮。
- 同一测试窗口（PID 60504、1279×820 CSS px）更新前后实测：Logo 顶边由 24px 调整至 17px，中心与顶栏中心同为 37px；首页顶边由 80px 调整至 86px，其余按钮及顶栏右侧操作区坐标不变。证据为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/shell-alignment-after.png` 及同目录 before／after JSON。
- 隔离 Electron 三主题、两种窗口尺寸共六组布局检查通过；日程／待办弹层、AI 展开、悬浮目录、Escape 焦点返回、首页／设置与主题选择通过，无页面异常。报告为 `aligned-shell-after-report.json`。字阶检查、保留原资源的 Vite 生产构建及 `git diff --check` 通过；已刷新当前测试窗口，未发布。

## 全宽顶栏与侧栏顶部缩短（2026-11-12）

final result: passed

- 按用户第二步要求，顶栏左缘由 88px 延伸至 10px，右缘和 54px 高度保持；Logo 归入顶栏，原图形、悬停动画及窗口内位置保持。侧栏外框上缘改为 74px，与顶栏下缘相隔 10px，其余按钮保留原布局占位。
- 在同一个正在运行的测试窗口（PID 60504、1279×820 CSS px）分别记录更新前后坐标：Logo 均为 `(23,24,40,40)`；七个侧栏按钮的 x／y／宽／高逐项一致，右侧操作区也完全一致。无窗口重启、数据目录或尺寸变更。实机截图为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/sidebar-test-shell-after.png`，同目录保留 before 截图及两份坐标 JSON。
- 隔离 Electron 三主题、1280×820／1024×680 六组检查通过，逐一比对上一步六组按钮基线；检查原生尺寸 ±1px 取整差异。日程／待办弹层、AI 展开、悬浮目录点击与 Escape 返回、首页／设置切换及真实主题控件通过，页面异常为 0。报告为 `joined-shell-after-report.json`，截图为 `joined-shell-after-{mist,cool,warm}.png`。
- 保留原字体、颜色、图标和文案。10 项现有导航／顶栏／主题回归、字阶检查、两份 TypeScript 检查及生产构建通过；Vite 保留已有资源，避免正在使用的测试页面丢失旧文件。静态审计保留 14 项既有发现，新增 0。已更新当前测试窗口，未发布。

## 一级导航独立圆角侧栏（2026-11-12）

final result: passed

- 依据本轮用户提供的一级图标栏截图，只调整外框：保留 66px 宽度，增加左／上 10px、底 12px 留白，使用现有 18px 面板圆角与顶栏玻璃 token。内描边避免改变图标和选中标记的几何。
- 实际隔离 Electron 的三主题、1280×820／1024×680 六组检查通过（Windows 内容视口存在 ±1px 原生取整）；图标、底部设置和选中标记完整，顶端与顶栏对齐。AI 展开时菜单不被圆角裁切，菜单点击、Escape 焦点返回、首页／设置导航与真实主题选择均通过；页面异常为 0。
- 稳定完成截图为 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/floating-rail-after-mist.png`，侧栏细节为 `floating-rail-after-mist-detail.png`；同目录有 before 基线、cool／warm 截图和 `floating-rail-after-report.json`。主窗口截图为 2558×1640 像素、DPR 2；最后一次点击首页后的过渡帧 `floating-rail-implemented.png` 不作为验收截图。真实账户和安装版未被修改。
- 字体、颜色、图标资产和文案保持；视觉变化仅为外边距、圆角、投影和内描边。10 项既有相关回归及 `npm run verify`、`git diff --check` 通过；静态审计仍为 14 项既有发现，新增 0。未提交或发布。

## 灵动岛伙伴与摘要交互边界（2026-11-11）

final result: passed

- 视觉依据：用户本轮选定的「清晰的交互边界」稿，原图 1536×1024；仓库副本为 `docs/requirements/shared/desktop-island/design/mascot-interaction-boundary-selected-2026-11-11.png`，SHA256 为 `0A44F25D1E6B4B74667584E82AC3FB705E4A47F87ECB3502079C08D9DD629BF5`。
- 渲染实现：使用正常 Windows Electron、独立 `boundary-native-data-*`，三种停靠均为真实未连接状态。顶部原生视口 580×270 CSS px，侧边 320×560 CSS px；收起区域仍为 580×40／64×360，系统密度 2，实际区域截图为 1160×80／128×720 像素。Browser plugin 不可用，因此使用已安装的 Playwright Electron；附加 Edge 实际组件夹具覆盖小高度与消息角标，不把合成数据当作真实登录验收。
- 证据目录：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/`。原生截图为 `island-boundary-native-{left,right,top}-hover.png`；完整与局部同屏对照为 `island-boundary-comparison.png`，生成页面为 `island-boundary-comparison.html`。
- 归一方式：从原图取侧条 `(82,202,144,770)`，保持比例缩至与实际侧条相同的 720px 高；顶部取 `(482,202,1010,80)`，与原生 1160×80 截图按相同像素尺度显示，明确保留已有 580×40 产品宽度。局部对照单独展示伙伴、短线和日历，避免从整个画布判断细节。画布标题、引线与说明不进入产品。

### 对照结论与差异分类

- 没有剩余可执行的 P0/P1/P2 差异；边界位于伙伴之后，侧边为横线、顶部为竖线，日程与四家额度不再被线分开；侧边伙伴出现独立圆形悬停底色。首次正式视觉对照即通过，没有因视觉发现而修改后遗漏复查的迭代。
- 本次只改变交互边界，保留原有顶栏凹角、固定尺寸、额度文字／圆环排列与字号。设计稿的暗色自定义提示框改为原有原生 `title` 提示，文案为「点击打开助手」，外观和出现延时由系统控制；不新增提示窗口、原生裁剪协议或新绘制资产。这些为既有产品范围和平台约束下的明确保留项。

### 五项视觉核对

- 字体：复用既有 Bahnschrift／Segoe UI／微软雅黑与 caption／micro 字阶，名称、状态、长文本处理不变；不把示意稿放大的字体当作生产字号。
- 间距：正常侧边入口 44×44px、伙伴图形 24px，保持图形中心；分割线为 36×1px，顶部为 1×16px。280px 以下侧边入口沿用 28×28px、横线 24px，四家额度不裁切。未读角标相对伙伴图形的位置保持。
- 色彩：沿用近黑岛背景、`--island-line` 悬停底色和分割线、蓝紫伙伴环与蓝色日历；连接、过期及真实额度语义不变。
- 资产：直接复用原 `IslandMascot`、Phosphor 日历和真实额度环组件；没有替换为新生成图形，没有新增占位资产。
- 文案：提示为「点击打开助手」，已有辅助名称仍包含未读及事项数。产品不显示画布说明；未连接文案来自真实隔离账户状态。

### 行为与验证

- 实际组件 15 组布局覆盖顶部／左右的收起、提醒气泡与兼容消息列表，及侧边 260px 高度；11 组交互／布局检查通过。覆盖角标、关闭伙伴但保留消息入口、入口完全隐藏时无残留分割线、点击／Enter／空格、30ms 摘要悬停和 200ms 展开动画。页面异常及相关控制台错误为 0。
- 三种原生停靠验证通过：伙伴悬停不展开，点击确实显示独立助手，日程／额度摘要展开，关闭伙伴时短线一并消失；正常截图和原生可见性均核对。原生首帧验证等待窗口真正显示，不以 DOM 加载完成替代可见性。
- 64 项现有相关回归通过（desktop-island、agent-messages、tray-window）。沙箱临时目录原子重命名受限，改用正常本机隔离目录后通过；未改弱断言。两份 TypeScript 检查、字阶检查、保留旧资源的 Vite 生产构建和 `git diff --check` 通过。premium 静态审计仍为 14 项既有发现，新增 0；DESIGN lint 为 0 错误及 1 项既有缺少 YAML 提示。
- 已把渲染更新载入原 PID 64320 的本地测试版，主窗口标记与数据保留。检测到测试岛已关闭，因此保留关闭状态，没有强制重新开启；不以关闭窗口的缩放／截图声明原生视觉通过，原生视觉证据来自上述独立实例。清除了自动截图的临时视口覆盖；未改正式安装版、未提交或发布。


## 2026-11-13 自媒体工作台卡片布局

- 范围：用户确认的同一方案三个子页。[博客方案](design/selfmedia-card-blog-selected-2026-11-13.png)与[实际博客](design/selfmedia-card-blog-applied-2026-11-13.png)、[发布方案](design/selfmedia-card-publish-selected-2026-11-13.png)与[实际发布](design/selfmedia-card-publish-applied-2026-11-13.png)、[小红书方案](design/selfmedia-card-creator-selected-2026-11-13.png)与[实际小红书](design/selfmedia-card-creator-applied-2026-11-13.png)。代码归 CopyView / PublishView / copy.css、pane.css，以及以 media 限定的 shell.css 表面；details/summary 为原生控件，不新增组件库。
- 视觉对照：主卡列表与编辑合并，内部细线分隔；写作区取消嵌套纸张。顶栏、导航、主内容、AI 区均在不透明卡片上，背景仅出现在间隙。主卡与 AI 均从 y=80 到窗口底部 12px，水平间隔 12px；小红书页头与浏览器共用外框。宽窗列表 224px、窄窗 180px，沿用既有字阶、图标、18px 外圆角和语义高亮。日期、保存时间、草稿排序和平台登录内容按真实状态展示，Windows 原生尺寸取整造成最多 1px 宽度差异。
- 修正及复查：发现旧内容区选择器覆盖小红书顶部留白，已在该选择器统一为 16px / 12px / 12px，并重查小红书与 AI 同顶同底。模拟视口截图曾出现合成差异，最终证据改为真实 BrowserWindow 尺寸与原生截图，不注入预览 CSS 或替换业务 DOM。
- 行为：58 项相关存储、关联、浏览器保留与 AI 上下文回归通过；调整关联 pilot 的展开入口和真实滚动容器后，其 20 项测试再次通过。11 组原生流程通过，包含新建、真实自动保存、切页立即保存、重载读回、关联开合键盘与输入保留／切博客重置、错误及取消不写入、三个发布按钮真实 IPC、底部固定、三主题、原生最小窗口与 webview 实例保留。剪贴板和外部浏览器只在隔离测试主进程拦截，没有实际发布作品。
- 尺寸：原生目标 1600×1000、1280×820、最小 1024×680；Windows 实际 CSS 视口为 1599×1000、1279×820、1023×681。三种布局无页面横向溢出，按钮完整保留；小红书切页前后 DOM 和 guest ID 相同，AI 手动收放偏好保留。原生 UI pageerror 为 0；JSDOM 的既有 webview getZoomFactor 模拟警告未造成回归失败。
- 静态：字阶、两份 TypeScript 检查、Vite 客户端构建通过。premium 严格审计仍为 14 项既有发现（6 未决、8 违反），与基线逐项比较新增 0；未把基线问题记为通过，也未修改无关代码。
- 测试环境：已更新原 PID 86956 的隔离测试版，保留雾灰主题、折叠导航、AI 收起、小红书登录页和实际数据。最终样式同步校验 rail / 内容 / webview 节点身份不变。当前是本地测试修改，未提交或发布。


## 2026-11-13 网页工作台浏览器卡片

- 用户确认[高保真](design/web-workbench-browser-selected-2026-11-13.png)，对应[原生实际界面](design/web-workbench-browser-applied-2026-11-13.png)。复用自媒体表面 token、200px / 66px 导航和既有 AI 卡；BrowserView 只为起始页提供标题与原文案，标签、地址、GuestFrame、历史与任务接口不改。浏览器内部取消玻璃渐变，标签、工具栏和网页统一在白色主卡。
- 与确认稿对照：主卡和 AI 在 y=80 对齐，底边距 12px、横向间隔 12px；18px 圆角、白色内容区和浅灰工具栏一致。沿用既有 180×36px 标签、字体和图标，不把高保真中 GitHub 示例预置到用户记录。原生证据中的「布局验证页」来自本机合成 HTTP 页面；保留 AI 空态原有的「网页工作台」范围名称。
- 9 组原生检查通过：新标签及真实地址导航、后退／前进／刷新、键盘切标签、历史搜索与任务弹框按钮、三主题、AI 栏收放、导航收放、标签关闭及切工作台后相同 guest / 页面输入保留。网页自身的测试背景未被宿主样式改变。Browser plugin 未提供，验证复用仓库 Playwright Electron 流程，截图使用真实窗口，不注入预览 CSS。
- 覆盖 1600×1000、1280×820、最小 1024×680 目标尺寸；Windows 实际 CSS 视口按像素取整为 1599×1000、1279×820、1023×681。无页面横向溢出，地址、导航、新标签和更多入口均在主卡内；页面异常为 0。
- 21 项浏览器、历史、站点授权、状态保留和 AI 范围回归通过，字阶、两份 TypeScript 检查、保留旧资源的 Vite 构建通过。JSDOM 仍有既有 webview getZoomFactor 模拟警告，但测试全数通过。premium 严格审计为 14 项既有发现，逐项比较新增 0。
- 原隔离测试窗口 PID 86956 正在游戏工作台，未刷新或替换其页面。另开 PID 10684「OnO Workbench · 网页布局测试」，使用独立干净数据目录，已定位到新浏览器页；当前修改未提交或发布。


## 2026-11-13 Hush-Hour 与浏览器一体工作舱

- 目标：[用户直接选中的附件](design/hush-browser-unified-selected-2026-11-13.png)，不采用另外两套控制台／纵向结构。[Hush-Hour 实际界面](design/hush-browser-unified-hush-applied-2026-11-13.png)、[浏览器实际界面](design/hush-browser-unified-browser-applied-2026-11-13.png)。既有 BrowserPane / BrowserAddress 与当前一体主卡已经对应此方向，保留其结构并再次验证标签操作。
- Hush-Hour 根卡、项目栏与预览取消内层边框、圆角、投影和背景滤镜；保留根卡 18px 圆角与细边线。项目栏下接环境、地址／尺寸和网页，消除分卡空隙；路径从可见副标题移至现有 title 和目录菜单，预览空态不再重复启动按钮。字体、Phosphor 图标、三主题、200px 导航和 AI 收放偏好沿用原组件与 token。
- 对照：宽窗主卡从 y=80 到底部 12px，与 AI 同顶同底，间隔 12px；项目名、状态和右侧操作同排，窄工作区按既有容器规则换行且按钮完整。项目操作最小高 32px，主按钮最小宽 124px，页头最小高 76px。真实状态、日志和运行地址随服务变化；截图的启动失败来自现有隔离实例项目启动结果，未用静态的「未启动」或成功文案替换真实错误。
- 9 组原生验证通过：单卡几何／唯一启动入口、构建日志和项目菜单、实际正式地址保存与合成网页载入、切环境和工作台后同一个 guest 及输入保留、尺寸选择／展开还原、真实终端收放、三主题、1280×820 及原生最小 1024×680、浏览器新增／关闭标签。外部网页拥有自己的背景，UI pageerror 为 0。原生功能验证使用本机 HTTP 合成页面并在隔离数据目录配置正式地址；没有触发用户真实项目构建，终端未输入命令。
- 21 项 Hush-Hour 服务／真实合成构建／构建状态及浏览器状态回归通过。两份 TypeScript、字阶检查、保留旧资源的 Vite 前端构建和 diff 空白检查通过。JSDOM 的既有 webview getZoomFactor 模拟警告未造成失败。premium 严格审计仍为 14 项既有发现，按规则／文件／消息比较新增 0。Browser plugin 未提供，原生检查复用现有 Playwright Electron 流程。
- 现有网页测试窗口 PID 10684 存在保留中的网页，未刷新。另开 PID 26604「OnO Workbench · 一体工作舱测试」，独立数据目录，已显示 Hush-Hour 单卡且浏览器可由左侧切换。正常后台绘制节流已恢复；未提交或发布。

## 个人网站一体工作舱（2026-11-13）

- final result: passed
- source visual truth：[确认高保真](design/personal-website-unified-selected-2026-11-13.png)，1568×1003px。实现：[真实运行截图](design/personal-website-unified-applied-2026-11-13.png)，3198×2000px，对应原生 Electron CSS 视口 1599×1000、DPR 2；服务由测试显式点击「启动本地」开启，当前作品 Data Harness，表单已保存、预览为桌面、AI 打开。
- 全图对照：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/personal-unified-comparison.png`。两图各以保留宽高比的方式缩放至 1000px 宽放在同一输入中，无拉伸。编辑区及工具栏分别用 `personal-unified-editor-comparison.png`、`personal-unified-toolbar-comparison.png` 放大核对；截图、几何和交互结果见同目录 `personal-unified-qa.json`。
- 字体：沿用现有 14／12px 控件和辅助字阶、现有字体与 Phosphor 图标；编辑标题与状态层次明确，字段和长正文可读。未按生成图额外添加顶栏品牌文字。颜色：主卡 `--workbench-card-bg` 白色、目录与地址工具区 `--workbench-muted-bg` 浅灰，语义状态继续使用既有绿色／错误色；三主题只透出卡片外的色场。
- 布局：取消项目行／编辑区／预览区的独立玻璃卡、投影和 10px 间隙，根表面与外轮廓继续归 `.media-browser-view`。主卡 y=80～988，与 AI 同顶同底且相隔 12px；项目行高 56px、目录宽 150px，正文表单独立滚动，保存栏保持可见。预览放大去掉左侧分隔、收起释放编辑宽度，内部不增加第二层圆角框。
- 图像／内容：封面读取真实网站已有的 `data-harness.svg`，不生成或仿画替代素材。真实预览标题为「作品 — OnOSaN」，保留站点本身的布局、奶白色背景及原有 1024px 桌面／390px 手机视口；高保真中的站点内容为示意，不将其外观或截图替代真实网页。实际字段、目录和 Markdown 仍从项目读取。
- 对照历史：首轮宽窗实现已移除内部玻璃分卡，字段间距压到 12px，封面为 112px／3:2，并保留固定保存栏。全图、编辑区与工具栏放大对照无待修 P0／P1／P2；三主题、1280×820、1200×780、1160×780 和原生最小 1024×680 补充截图均检查。1200px 请求宽度对应内容容器 573px，目录移至顶部，保存栏和显示预览入口可用；1160px 请求实际 CSS 宽 1159px，AI 沿既有外壳规则转为覆盖模式，不将其误判为主卡紧凑断点。
- 8 组原生验证通过：单卡几何与唯一手动启动；显式启动加载真实 Astro 网页且不生产构建；收起／显示／展开／Escape／手机与桌面切换保留同一 guest；字段校验、固定保存栏及未保存草稿切页保留；网站检查抽屉不自动构建；原生项目终端收放；三主题；四个窄窗档位与预览返回路径。未将测试内容保存到真实网站，未执行真实网站生产构建，终端未输入命令；测试退出清理自己启动的服务。
- 13 项个人网站内容／进程／编辑器及 Hush-Hour 手动入口回归通过，覆盖临时项目真实 Markdown 保存、冲突和草稿恢复。两份 TypeScript、字阶检查、保留既有资源的 Vite 前端构建通过。原生窗口身份、非空、框架错误层、交互、截图及控制台检查通过，pageerror／console error 为 0。Browser plugin 未提供，使用仓库已有的 Playwright Electron；premium 严格审计仍为 14 项既有其他页面发现，按文件／规则／消息比较新增 0。
- 新开 PID 44640「OnO Workbench · 个人网站布局测试」，使用独立数据，初始服务为 stopped、构建为 idle，正常后台绘制节流已恢复。窗口按当前工作区限制为 1416×828px，折叠主导航后仍可同时查看目录、编辑、预览与 AI；用户可自行展开主导航。原有测试窗口及其运行中的个人网站预览未刷新或关闭。未提交、发布应用或发布网站。

## AI 测试工作台 · 上下分卡方案 2 · 2026-11-13

- final result: passed
- source visual truth：用户再次附上的[方案 2](design/ai-test-stacked-selected-2026-11-13.png)，1568×1003px；实际[原生实现](design/ai-test-stacked-applied-2026-11-13.png)，3198×2000px，对应 CSS 1599×1000、DPR 2。示例任务通过真实 Electron IPC 调用仅本机的合成模型接口，实际产物由既有隔离协议加载；模型名和产物中均标明本机合成验收，不评估供应商能力。
- 全图与局部同屏对照位于 `C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/ai-test-stacked-comparison.png`、`ai-test-stacked-config-comparison.png`、`ai-test-stacked-results-comparison.png`。全图保持各自宽高比缩放，配置卡和结果卡分别裁切放大核对；最终轮已检查标题、分组、细线、留白、预览及操作区，无待修 P0／P1／P2。
- 字体与控件复用既有 `--type-page`／`--type-lead`／`--type-section`／`--type-control` 等共享字阶和 Phosphor 图标，模型名允许省略并可查看完整标题。未将示意顶栏品牌文字或示例模型成绩写入生产视图。颜色使用工作台白色卡面、浅灰工具区、既有蓝色选中和独立语义状态；三主题保留卡片外背景色场。没有新增生产位图、仿画产物或替换原模型文件。
- 上卡承载任务、模式、开始／保存及输入／模型／校验三组；下卡承载结果标签、结果操作、模型列和固定校验栏。两卡间隙 12px，与 AI 栏同顶同底且相隔 12px；宽窗配置卡高 198.09px、结果卡高 697.91px，默认每列预览高 310.34px。代码展开后该列预览保留 198.34px；进入详情配置卡隐藏，结果卡高 908px。结果标签和工作台通过隐藏切换保留已创建的 iframe。任务与历史页面使用同样的独立列表卡。
- 8 组原生验收通过：空态及进入不调用模型；提示词、模型参数应用／取消、模型复选与校验配置；双模型同输入流式生成及独立运行状态；实际鼠标操作预览、展开代码、内部标签、分屏、原始回复／输入快照及工作台往返保留 iframe；两模型各 5 项统一断言通过；任务保存／历史查看／复跑新增记录；三主题／AI 收放／多尺寸几何；单模型停止及停止全部互不混淆。测试报告为同目录 `ai-test-stacked-qa.json`，pageerror／console error 均为 0。
- 响应式截图包括 CSS 1599×1000、1279×820 及应用原生最小内容视口 1023×681；960×620 和 760×620 的窗口请求均受应用最小尺寸限制，不能将其记为已渲染的窄尺寸。较短窗口的模型列保留滚动，校验栏保持可见；AI 在既有外壳断点下使用覆盖模式，未修改全局侧栏策略。
- 已有 11 项产物提取、路径隔离、快照、恢复和主文档全屏权限回归通过；TypeScript、字阶、保留既有资源的 Vite 构建及本次文件差异空白检查通过。Browser plugin 未提供，使用仓库 Playwright Electron。严格静态审计按文件／规则／消息比较新增 0；原 14 项降为 13 项，清除本视图校验 textarea 的 resize 规则发现，其余已有发现保留。
- 新开 PID 51276「OnO Workbench · AI 测试布局 · 本机样例」，1416×828px，保留展开导航及 AI；独立数据目录中载入本机合成结果，可继续试用手动开始与校验。本机模型服务随该测试应用进程退出而关闭，未接触个人密钥、待办库或真实模型调用。正常后台绘制节流已恢复，原有测试窗口未刷新或关闭。证据为 `ai-test-stacked-preview-session.json` 和 `ai-test-stacked-user-preview.png`。未提交或发布。

## AI 测试工作台 · 测试任务与运行记录 · 2026-11-13

- final result: passed
- source visual truth：用户确认同时开发的[测试任务](design/ai-test-tasks-selected-2026-11-13.png)与[运行记录](design/ai-test-history-selected-2026-11-13.png)，分别为 1569×1002 和 1569×1003px。实际[任务页](design/ai-test-tasks-applied-2026-11-13.png)／[记录页](design/ai-test-history-applied-2026-11-13.png)均为 3198×2000px，CSS 1599×1000、DPR 2，展开导航并打开 AI。数据来自独立 SQLite 测试目录，包含三份保存的任务及结束／包含失败／停止三种记录；生产视图没有写入样例行。
- 全图与局部对照：`C:/Users/henry/.codex/visualizations/2026/11/10/01a1c510-4514-7b22-91cf-c582289e0c7b/ai-test-library-tasks-comparison.png`、`ai-test-library-tasks-detail-comparison.png`、`ai-test-library-history-comparison.png`、`ai-test-library-history-detail-comparison.png`。原图与实现按各自宽高比缩放，列表区另行裁切核对。任务实际排序和更新时间遵循数据库；示意的模型名、数量和状态在测试中通过保存快照验证，不将设计稿数字用作真实模型成绩。
- 字体与图像：保留应用既有字体、24／18／16／13／12px 字阶和 Phosphor 图标，没有生成新的生产位图或仿画图标；生成稿较大的辅助字号按全应用控件字阶映射。任务标题与提示词层次分明，提示词两行截取并有完整 title；模型名称允许缩略并以 title 保留供应商与完整名称。顶栏继续使用既有 Logo，没有额外加入概念稿品牌文字。
- 布局与颜色：两页各为 118px 标题操作卡和下方独立列表卡，中间露出 12px 背景，与 AI 同顶同底。白色卡面、细边框与共享 18px 圆角，列表列标题／行使用轻分隔线，行悬浮使用浅灰。模式和查看入口为既有蓝色，包含失败为琥珀色，结束／停止为中性色；状态同时有图标和明确文字。数据表复用原生 table、th、time 和 button，无新表格框架。三主题及真实多条记录已检查，无待修 P0／P1／P2。
- 原生验收 6 组通过：空任务／空记录；新建与载入配置的提示词、模式及数量；历史模型改名后仍显示快照、结束／失败／停止及查看结果保留 iframe；手动开始后历史执行中实时变化并在完成后解除输入按钮禁用；三主题与 AI 收放及中等／最小窗口；长名称、长提示词和 19 条记录的内部滚动。进入、刷新、查看结果、新建和载入均未发出模型请求；只有人工点击开始后的 2 个本机合成请求。pageerror／console error 为 0。
- 内容区 850px 以下重排紧凑行，历史两个操作始终同高且不换行。请求窗口 1600×1000、1416×828、1280×820、1024×680，实际 CSS 为 1599×1000、1415×828、1279×820、1023×681；既有 AI 覆盖断点和原生窗口最小尺寸保持不变。表格、行与列标题语义在这些宽度下逐一验证；长列表滚动不移动标题操作卡。测试报告与截图为同目录 `ai-test-library-qa.json` 和 `ai-test-library-*.png`。
- 新增运行摘要的模型名称／供应商快照和失败／停止计数，直接从既有保存的运行计算，无数据库迁移。新增回归覆盖已结束、排队／执行、部分失败、全部停止及排序，既有退出恢复另核对失败计数。AI 产物、隔离、快照与权限共 12 项回归通过；两份 TypeScript、字阶、Vite 和主进程／preload 构建通过。严格审计按文件／规则／消息与前轮比较仍为 13 项既有发现，新增 0。Browser plugin 未提供，使用仓库 Playwright Electron。
- 新开 PID 79172「OnO Workbench · AI 测试任务与记录 · 本机样例」，1416×828px，独立数据与本机合成模型服务，保留三份任务／记录；主导航折叠以在当前屏幕中展示完整列，用户可自行展开。默认停在测试任务，两页可切换，正常后台绘制节流恢复。证据为 `ai-test-library-preview-session.json`、`ai-test-library-user-preview.png` 和 `ai-test-library-user-preview-history.png`。未关闭或刷新其他窗口，未提交或发布。

## 命理命例下拉遮挡修复（2026-11-17）

- 复现了玻璃顶栏内的命例菜单被命盘盖住，以及窄布局换行后被工作区边界裁切的问题。菜单改用浏览器顶层浮层，按按钮右边缘定位并限制在视口内；保留原有外观、入场动画和命例操作。定位用布局尺寸测量，避免入场位移干扰锚点，也避免短列表出现多余滚动条。源码改动仅限 BaziView.tsx 和 bazi.css。
- 长列表限定高度并内部滚动；点击外部、Escape、窗口缩放或页面滚动关闭菜单，Escape 恢复按钮焦点。菜单内部滚动继续保留浮层。
- Browser plugin 未提供，使用仓库 Playwright 驱动隔离原生 Electron，合成命例保存到独立数据目录。23 组检查通过：1280／1024 CSS 窗口宽度 × 三种玻璃强度 × 八字／紫微斗数／占星的所有命例行及新建入口可点击且处于窗口内；新建、编辑、删除确认入口及取消；Escape 焦点、外部点击、窗口缩放、页面滚动关闭；14 个命例的内部滚动和新建入口可达。无渲染器异常。已核对原生截图，菜单与按钮保持 6px 间距，短列表无内部溢出。
- npm run verify 通过字阶检查、前后端类型检查及生产构建（退出码 0）。证据：C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/bazi-profile-menu/ 下的 before/report.json、before/covered-menu.png、final/report.json、final/visible-menu.png 和 final-verify.log。

## 占星移除分布概览（2026-11-17）

- 按用户要求移除占星顶栏「分布概览」、对应浮层及专用样式，清理组件导出和引用。命理三系统切换、命例选择／新建及原有星盘和详情继续保留；未修改星体、宫位、相位或分布算法。
- Browser plugin not available；通过现有 Playwright 驱动独立 Electron 和合成命例，在 1280／1024 CSS 宽度、普通／强玻璃／纯色下检查三系统切换、概览入口与浮层缺席、占星盘渲染及命例菜单切换，共 24 组通过，无渲染器异常或 Vite 错误覆盖层。已检查顶栏原生截图。npm run verify 的字阶、两份类型检查和生产构建通过，退出码 0。
- 证据：C:/Users/henry/.codex/visualizations/2026/11/13/01a1d374-1476-71a3-b6f1-45afb2903318/astro-no-summary/ 的 report.json、astro-header.png、inspect.mjs 与 verify.log。

## 首页看板固定页头（2026-11-19）

- 用户选定的参考布局把看板名、日期、添加卡片和编辑布局纳入工作区页头。两端均使用 56px 固定单行页头与 36px 操作按钮，卡片从页头下方 12px 开始。看板名用 24px 页标题字阶，日期用 14px 正文字阶。标题和按钮沿用主题文字与操作表面，页头和卡片区共享外壳。
- 隔离 Electron 实窗检查覆盖 1420×830 与 968×592 CSS 视口。125% 缩放下，480px 工作区把操作排到第二行。对话栏调至 560px 时，两端在约 239px 工作区内仍可点击添加和编辑，按钮文字完整。
- 验证固定页头下的卡片滚动、进入和取消编辑时的位置、卡片目录锚定与 Escape 焦点返回、应用与完成持久化，以及切换其他工作区再返回。无渲染异常。字阶检查、两份类型检查、渲染层与 Electron 构建、本项目 16 项看板回归均通过。
- 截图使用独立资料名与示例卡片布局，额度保留各自的未连接状态。[选定图与双端实窗对照](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/workbench-dashboard-comparison.png) · [125% 缩放实窗](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/ono-dashboard-zoom-edit.png) · [验收记录](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/ono-dashboard-qa.json)。

final result: passed

## 首页看板卡片调宽（2026-11-19）

- 在 693px 画布使用两个 3 列卡片复现。旧的两列映射把 2 列和 3 列都画成 340.5px，向内拖动后宽度仍是 340.5px。
- 画布超过 480px 时保留六列网格，拖到 2 列后宽度为 223px。已验证左右拖柄、4／6 列切换、Escape 回退、取消、完成保存和重开。窄卡在编辑时将工具排到标题下方。
- 原生 Electron 隔离数据中验证 100% 与 125% 缩放。单列铺满画布，横向拖柄只在键盘聚焦时显示，仍可键盘设置宽窗尺寸并拖动高度。字阶、前端类型检查、Vite 构建和看板回归均通过。
- [修复前](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-resize/ono-before-ineffective-drag.png) · [拖窄后](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-resize/ono-after-shrink.png) · [验收记录](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-resize/ono-after.json)。

## 看板尺寸跟随样式刷新（2026-11-19）

- 用截图对应的 1439×852 CSS 视口、560px 对话栏和已定位的卡片复核。572px 画布选择「AI 额度 → 2 列 → 应用设置 → 完成」，卡片由 280px 缩到 182.66px，预览同步缩小，重开保留尺寸。卡片拖边也能达到同一宽度档。
- 模拟开发窗口旧两列样式切到六列且画布尺寸不变，复现已定位的 2 列卡片仍显示旧半宽。摆放、拖动吸附和目录预览改用同一份画布计算。样式刷新后，2 列仍保持 181.33px 的实际列宽。
- 两端构建、前端类型检查和既有看板回归通过。使用隔离示例数据截图。[尺寸对照](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-resize/exact-width-comparison.png) · [验收记录](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-resize/ono-exact-resize.json)。

## 看板卡片四边拖动（2026-11-19）

- 隔离实窗复现旧版自动布局中缩小左卡会带动右卡填空。572px 画布中，从右边缩小待办卡片后，左边保持原位，旁边额度卡片距画布左边仍为 292.00px（调整前 292.00px）。
- 验证四条边的对边固定、12px 碰撞间距、物理方向键、Home／End、Escape 撤销和保存重开。目录使用左上角锚定，空间不足时保留弹层提示。125% 的单列调高后保留纵向空白，恢复宽窗仍读原坐标。滚动到底缩短末张卡片，编辑区松手位置稳定。
- 两端前端类型、字阶、Vite 构建和看板回归通过。实窗使用隔离数据。[拖边对照](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-anchors/independent-card-resize.png) · [本端验收](C:/Users/henry/.codex/visualizations/2026/11/19/01a1f1c1-8493-74e3-b21a-e636df95ee62/dashboard-anchors/ono-fixed.json)。
