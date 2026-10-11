# [OnO] Issue #13：设计源与固定渲染支持 v1

状态：**设计准备 PR；不是正式 UI 方案审批或产品实现。** 这份记录不包含已生成的设计图。实际渲染、图片可访问性和视觉审阅均待完成；不能凭测试绿色进入产品开发。

- 需求：[新建命例日期可按年跳转](https://github.com/zhshenry/onosan_workbench/issues/13)
- 代码及视觉来源基线：`9aaafdd526870c10d156b6929845608df834bb43`
- 已实际查看 Issue 原图，对照 `DatePicker`、命例表单、`DESIGN.md`、`UX-CONTRACT.md` 和当前主题 token。
- 原型源：[issue-13-year-picker-v1.html](../design/mockups/issue-13-year-picker-v1.html)
- 固定 state：`issue-13-year-picker-v1`
- 源文件 SHA256：`d70bbcb521974b7ca94740a06729b9cd4f787fb5c1579e18de118bb9aae8a240`
- 输出：一张 1440×1024、1× 的三状态审阅图。三个状态共处一个固定页面，不分三次上传。
- 执行环境：dot 自带云电脑准备源与检查，GitHub Actions 承担已批准的渲染及 CI。不依赖用户电脑或另行保存的 Codex 环境。
- 流程边界：沿用 v1.1 人工流程说明；不迁移 core-v1 的历史规范 pin，不启用接单、可信审批或自动调度。

## 拟议交互与三状态

1. **打开日历**：保留当前 240px 日期浮层与逐月箭头。年月标题中的年份变成带下拉提示的可点击入口。
2. **直接选年**：在同一浮层内显示四位年份输入、“跳转”及可按十年翻页的年份格。范围为 1900–2100 年，包含端点。
3. **返回目标月份**：示例从 2026 年 10 月跳至 1990 年 10 月。跳年仅改变浏览位置，生日仍为空；选择具体日期后，才填写生日并关闭日期浮层。

输入框 Enter 只跳年，不提交命例。非法输入停留原视图并显示纠正提示；输入法组合中的 Enter 不触发跳转。Escape 从选年层返回日历，再关闭日期浮层。闰日跳至平年只修正浏览焦点，不静默改变原生日。

## 产品范围

将来的产品实现应扩展现有共享 `DatePicker` 的显式可选能力，只由命例生日字段开启。命例新建与编辑共用，因此保持一致；其他待办、日程和提醒调用保持默认行为。年份边界复用 `compute.ts` 的现有常量，不修改日期格式、排盘算法、出生时间或存储。

本 PR 仅加入独立设计源、固定渲染候选、相关测试和文档。`src/`、`modules/`、`electron/` 与产品数据接口均不变。

## 视觉与原型边界

- 复用当前雾灰表单、双列布局、字体栈、圆角、边线、阴影及 `--todo-*` / `--acc-*` token。
- 三列外框是审阅画布；内部只重建与需求相关的命例表单和日期浮层，不冒充完整应用截图。
- 一个内联 HTML 页面，无外部字体、图片、iframe、网络请求、产品 API 或持久化。日期示例固定为 2026-10-11，避免不同运行日期改变方案内容。
- 审阅图使用雾灰主题；三主题、最小窗口、Windows 字体与实际 Electron 行为留到产品实现的专项验收。
- 表单中的“保存并排盘”和出生时间入口只给出明确的本地原型提示，不保存数据或执行排盘。

## 新候选的固定约束

中央代码白名单只允许历史 `historical-design-a-home` 与本次 `issue-13-year-picker-v1`。历史默认值与行为保留。新候选固定源路径、SHA256、1440×1024 尺寸、三状态 DOM 检查、用途及 Issue 13；workflow 输入不能提供任意路径、URL、JavaScript、selector、尺寸或 hash。

源文件通过单项 `.gitattributes` 强制 LF，保证 Windows 和 Linux 的源字节一致。渲染前验证源 hash；上传前将 manifest 与当前源重新校验，并在最后一次公开写入前再核验。manifest 绑定源/state/issue、完整 main SHA、run/attempt、尺寸及 PNG/pixel digest。新候选只能以明确发布参数定位 Issue 13，换目标会在访问 GitHub 前失败。

保留已有约束：owner 与数字 ID、准确批准 main SHA、手动触发、非 root Chromium sandbox、内核断网 namespace、空白环境与新 HOME、离线 context、严格 CSP、阻止全部请求/WebSocket、禁止下载与服务 worker。安装/渲染不获 PAT；浏览器退出后，独立发布步骤才取得原有 PAT。没有新增权限、secret 或外部服务。

发布仍默认关闭。开启时仅 attempt 1、共享 concurrency、两次当前仓库/main/issue 检查与 marker 去重、一次 `--attach`，失败或结果不确定不自动重试。图片只在临时输出目录，清理由 `always()` 执行；不入 Git，不加 artifact/cache/备份，不放宽 4 百万像素与 20 MB 上限。marker 和 source hash 都不是用户批准本身。

## 参数准备

`prepare-dispatch.mjs` 仍只输出参数，不触发 workflow。新候选需显式加入 `--prototype-state issue-13-year-picker-v1`；不传则维持历史默认。两个完整 SHA 必须相同，且调用方仍须独立核对当前 main 和有效主聊天批准。

渲染与发布不得在本 PR 或普通 CI 中执行。本 PR 的批准只涵盖准备与测试，不涵盖合入、dispatch、公开上传或产品功能。

## 验证

- `node --import tsx --test tests/ono-issue13-prototype.test.ts`：19 项 DOM 测试通过。覆盖三状态、真实按钮行为、唯一 ID/标签引用、选年不提交、1900/2100、非法输入、闰日、方向键、PageUp/PageDown、Enter/输入法、Escape、外部点击、今天/清除、关闭重开和本地提示。
- 原版 `audit_project.py --mode strict` 对该候选源的独立同字节副本：0 错误。最初动态绑定导致的不可检测按钮行为已改为可审阅的真实声明式事件入口，并有实际事件测试；没有修改、取消或跳过审计规则。此项只说明该原型源的静态结果，不声称全仓库旧原型均通过。
- 渲染/发布测试使用合成 PNG fixture 和 mock，不产生本方案截图、不触发上传。新增跨候选替换、源 hash 漂移、错误目标、三状态缺失、凭据与 no-retry 回归。
- `npm run verify`（字号、typecheck、完整 build）通过。`npm test` 的 tsx CLI 在本地创建 IPC socket 时受限，改用等价入口 `TZ=UTC node --import tsx --test tests/*.test.ts`：434 项，432 通过、2 项已有打包测试跳过；Asia/Shanghai 下同样通过。默认 America/Los_Angeles 下，3 项未修改的待办日期测试失败，未为此更改产品或测试。PR 的 Linux/Windows CI 另绑定最终提交记录；现有 Windows 待办验收不能替代本需求日期专项验收。
- **实际新候选渲染、图片上传、视觉检查：未执行。** 本地 CUA 的 localhost 连接失败，file 协议被 URL 策略拒绝；未绕过该限制、改 sandbox 或借用旧图。

## 后续批准与证据

1. 审阅本设计准备 PR 的准确 head SHA，主聊天单独批准合入。
2. 对合入后的准确 main SHA、固定新 state 和本次图的目标取得适用批准；准备参数不等于 dispatch。
3. 实际渲染三状态并核验；公开发布仍需与准确目标匹配的有效授权。新图不能引用历史 A 的授权或结果。
4. 图上传一次后，正式方案正文与 Issue #13 的 `[OnO]` 方案 comment 嵌入**同一个**原生附件 URL，记录源 SHA、PNG SHA256、run/attempt、原评论链接及视觉/可访问性结果，再计算最终方案摘要。
5. 用户在主聊天确认这一准确完整方案后，才进入产品实现。没有真实相关图，不把本文当作完整 UI 方案，也不请求产品开发批准。

产品实现时再验收：新建/编辑回显、跳年/选日/取消/重开、三主题与 1280×820/1024×680、Windows/Electron 键盘及浮层定位、保存与重启持久化、其他共享日期调用回归。
