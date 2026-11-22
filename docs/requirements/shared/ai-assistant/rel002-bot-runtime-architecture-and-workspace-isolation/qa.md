# OnO Bot 实施与验证记录

日期：2026-11-16。范围：用户确认的 OnO M0–M5，包含独立本地 Host；CMO 暂不开发。代码留在当前工作区，未提交、发布或替换已安装应用。本文区分已实现行为、实际验证和环境限制；高保真图片本身不作为运行证据。

## 追加确认：各入口独立草稿

主窗口与灵动岛分别持久保存正文、引用和任务回复目标，取消跨窗口草稿编辑权和手动接管；并排／浮动继续使用主窗口同一份草稿。两处共享已发送消息、回复和任务进度，同 Bot 请求串行执行；发送重试保持原请求 ID，提交仅清空来源草稿。保存及发送期间继续输入的内容保留。SQLite schema v3→v4 先备份再事务迁移，旧共享草稿及原版本只进入 main，island 初始为空。

实际验证：构建通过；Bot/草稿 26 项、AI 引用/范围 20 项、独立 Host 9 项通过；最终 Electron 界面 15 组通过、24 张截图、pageerror 为 0，包含两处独立输入、消息同步、排队和完整 UI/Host 重启恢复。退出时阻止草稿恢复重新拉起 Host。证据见仓库 `test-results/bot-ui-independent-drafts-verified/report.json`、`test-results/bot-independent-drafts-*.log` 和根目录 design-qa.md 的对应追加记录。本轮模型验收使用本地确定性服务。

### 追加修复：常驻旧 Host 的开发启动兼容

契约提升为 bot-workbench/v2，认证 hello 传回实际版本。Gateway 在界面读取前识别旧后台，空闲时正常替换，存在执行中/排队任务或未知版本时返回明确错误并保留后台。控制器校验草稿返回结构；旧包装或损坏回执不能把输入字段写成 undefined，提交回执不明继续保持原请求 ID。

新增复现与去重测试后 Bot/草稿 28 项通过；构建通过；使用实际 localhost:5174 开发页面及旧后台模拟的 16 组 Electron 流程通过，25 张截图，pageerror 为 0。随后正常更新真实空闲旧 Host，schema 自动备份迁移成功，7 个 Bot、11 条对话、2 个任务及原草稿摘要/版本全部核对保留。证据见根目录 design-qa.md 与 test-results/bot-live-host-upgrade.json。

## 实施结果

| 阶段 | 已实现内容 | 主要代码 |
| --- | --- | --- |
| M0 | 七个稳定身份、唯一主对话、精确历史归属、schema 迁移、按入口独立版本草稿 | `shared/bot-contracts.ts`、`electron/bot-store.ts`、`electron/bot-service.ts`、`src/bot-draft.ts` |
| M1 | Pi JSONL 持久会话、请求去重、队列、取消/继续、确认操作与回执、未知结果核对、原稿撤销 | `electron/ai-core.ts`、`electron/bot-host.ts`、`electron/bot-runtime.ts` |
| M2 | 公开名录发现、直接委派、父子任务、结果回送、协作记录、交付件和显式资源引用 | `electron/bot-host.ts`、`electron/bot-runtime.ts`、`src/views/BotTasks.tsx` |
| M3 | 七联系人、独立待办工作台、原生业务页面、名片/编辑、记忆、任务/交付件、并排/浮动、两套导航、灵动岛总 Bot | `src/App.tsx`、`src/views/Bot*.tsx`、`src/views/bot.css`、`src/views/IslandAssistant.tsx` |
| M4 | 单次/每日/间隔计划、时区、漏期合并和触发去重、托盘期间继续运行、退出/暂停记录、未读结果 | `electron/bot-store.ts`、`electron/bot-host.ts`、`src/views/BotTasks.tsx` |
| M5 | 独立无界面 Electron Host、认证命名管道、Windows 系统托管、单实例、浏览器资源桥、后台通知和原事项提醒 | `electron/bootstrap.ts`、`electron/bot-host-entry.ts`、`electron/bot-gateway.ts`、`electron/bot-transport.ts`、`electron/bot-supervisor.ts`、`electron/bot-encryption.ts` |

设置保持人工入口；首页保留当前看板，完整总台首页按原约定另行设计。游戏、AI 测试、签到、网站页面保持现有功能，Bot 名片只列实际接入能力，不把业务名称变成未实现的工具权限。当前交付件支持 Markdown 成果及原生稿件引用；本次没有新增图片生成、任意文件执行或跨产品通信。

## 使用入口

1. 启动开发版后，左侧选择 Bot；首次选择并排或浮动模式，之后从顶栏 AI 助手图标的下拉菜单选择「并排」「浮动」「收起助手」。11-16 追加调整后，对话顶部不再放模式切换。
2. 联系人旁的信息按钮打开资料；编辑名字、头像、职责和提示词，或管理私人/共享记忆。资料冲突保留本地编辑，显式读取最新版本后再保存。
3. 对话顶部的“任务”查看状态与待确认操作，“交付件”预览成果和定位来源。任务详情可进入协作子任务，返回时保留原层级。
4. Bot 名片或任务页进入定时任务；支持单次、每日指定时区、固定分钟间隔，新建后可启用/暂停。模型提出的定时安排先生成确认卡；未保存计划不能报告已安排。
5. **设置 → 通用 → 独立 Bot 后台**开启 Windows 托管。默认关闭：UI 正常退出会停止 Host；开启后：UI 完全退出仍保留 Host，重新打开 UI 连接原进程。关闭该开关会注销系统托管，当前 UI 会话仍可使用 Host，退出后停止。
6. 灵动岛 AI 小窗固定连接 Ono 总 Bot。与主窗口共用主对话和任务；两处分别保存未发送的文字、引用和回复目标，可以直接输入，无需交接编辑权。

“后台”只运行在本机。Windows 托管使用当前用户的交互会话、普通权限登录触发、每分钟恢复触发及失败重启；不安装云端电脑，不使用无人登录的 Session 0。设备休眠/关机时不能执行，唤醒后合并漏掉的周期，不逐条补跑。依赖窗口/浏览器的工作在资源缺失时等待，确认卡不会因为窗口关闭而自动批准。

## 数据与运行契约

运行目录仍为原 OnO 数据目录。`chats.db` 升至 schema 4，Bot 身份、关系、草稿版本、任务、消息、操作回执、记忆、计划和成果元数据与原 chats/settings 共库；原生待办、稿件、书目、命例仍由各自业务库负责。业务写入继续复用既有校验、版本和应用接口。

- 迁移前通过 `VACUUM INTO` 生成 `chats-before-bots-*.db`，覆盖已提交 WAL 内容。事务中创建/绑定身份，未知未来版本拒绝打开；重复运行不重建 UUID、不拼接历史。对象或混合 scope 聊天保留为历史，未知/设置/损坏记录在总 Bot 的只读历史区保留；未知历史不能作为模型引用。
- `bot_chat_links` 记录唯一主对话；`bot_drafts` 按 chat_id + main/island 保存独立正文、引用、回复目标和版本。旧共享草稿及版本只迁入 main，island 初始为空；旧无版本 `ai:chat:draft`、新建/删除等旧写入口不能改写 Bot 聊天。
- 取消草稿编辑租约、续约和跨窗口交接，保留每个入口 250ms 防抖、版本检查与串行保存；输入法组合结束后保存本入口草稿。Host 只保证恢复已确认的草稿版本，进程退出前未送达的按键不能宣称已持久化。失败/冲突保留本地输入供复制，发送回执不明时沿用同一请求 ID 核对，不新建重复任务。
- 普通主对话稳定关联 Pi JSONL；带对象/引用、委派和例行工作使用任务自己的会话。路径保存于数据库，文件位于 `bot-sessions/<botId>/`，工作目录为 `bot-runtime/<botId>/`。上下文过滤对象历史；协作仅传递明确共享引用，不读取其他 Bot 私人说明和记忆。
- 最大同时执行 2 项、单 Bot 1 项；等待协作/用户确认不占执行名额。协作深度最多 4、同一根任务最多 20 个子任务，拒绝循环委派。取消传播到后代，迟到结果不恢复已取消任务。
- 写入前持久记录 operation；重复确认返回已有回执。崩溃期间的 executing 操作变成 unknown，先由用户核对真实结果，不自动重放；原稿撤销核对应用后版本，不能覆盖后续人工修改。
- Markdown 成果内容在数据库中为权威记录，`bot-artifacts/<taskId>/<artifactId>.md` 为可重建导出；原件删除不删除交付记录。Bot 资料和记忆不存供应商密钥。
- UI 与 Host 通过按数据目录派生的 Windows 命名管道及本地随机密钥认证，不开放网络端口。Host 的 `bot-process` 目录复用主应用 **已经由系统保护的 OSCrypt key**，以解密原 AI 配置；首次启动等待主应用加密状态落盘后才启动 Host，不导出明文密钥。Windows 系统任务名为 `OnoBot-<数据目录哈希>`。

回退时先关闭后台开关并退出应用，确认该数据实例的 Host 已停止；保留整个当前数据目录和 Pi/成果文件，再恢复迁移前一致性备份到兼容程序。不要让旧程序写入 schema 3。待办创建、稿件修改和外部发布等真实业务效果不随聊天库回退自动撤销。

## 验证记录

所有可写测试都在隔离目录或系统临时目录执行，未迁移真实 OnO 用户库，未修改 CMO。真实模型试验仅复用本机已配置的加密连接，业务样本仍为隔离数据。

| 验证 | 结果与证据 |
| --- | --- |
| 构建 | `npm run verify` 通过：字阶检查、前后端 TypeScript、Vite、Electron/preload；记录 `test-results/bot-verify.log` |
| 全量回归 | 1124 项中 1122 通过、2 项环境受限失败；记录 `test-results/bot-unit-final.log`，详见下方限制 |
| 重点回归 | 89/89：Bot、草稿、浏览器、Pi、首页和设置；记录 `test-results/bot-focused-final.log` |
| 最后核心复核 | 20/20：迁移、租约、回执去重、权限边界、协作、恢复、计划/DST、浏览器等待名额和撤销崩溃核对；记录 `test-results/bot-core-final.log` |
| 最后 Bot/灵动岛复核 | 102/102，覆盖 Bot/草稿、桌面灵动岛、岛状态与持久存储；记录 `test-results/bot-island-final.log` |
| 独立 Host 确定性端到端 | 9 组通过：实际 Pi 工具循环、JSONL、确认跨进程重启、原生待办写入/去重、旧写入口拒绝、无 UI 浏览器准确等待；记录 `test-results/bot-host-pilot.log` |
| 真实模型 | 3 组通过：deepseek-flash 生成成果→小墨委派小历→确认原生待办→结果回送；两轮主会话持久记忆；原稿确认写入及撤销。`test-results/bot-live/report.json` |
| Windows 系统托管 | 5 组通过：UI 开启真实系统任务；UI 退出后计划仅触发一次；第二 Host 不抢单实例；杀死实际 Host 后系统恢复；恢复不重复触发。`test-results/bot-supervisor/report.json` |
| Electron 界面 | 13 组通过、15 张截图、pageerror 为 0。真实 App/IPC、1544×1018 和 1024×680，七联系人、草稿/模式/工作区恢复、名片键盘焦点、确认/交付件、外观不改几何、刷新及灵动岛交接；真实浏览器站点授权释放名额，批准后继续并取得核验结果；灵动岛成果从其他工作台准确打开总 Bot 的对应预览。新用户目录使用隔离密钥实测 Host 写入、主进程解密和 Host 模型执行兼容；完全退出 UI/Host 再重开后仍能用原加密配置执行下一次请求，测试服务核对真实 Authorization 头。`test-results/bot-ui/report.json` |

重复 Bot 组件 key 造成名片关闭后残留面板的问题已通过实际 UI 操作复现并修复；回归明确断言只剩一个面板。草稿刷新测试等待 Host 返回已保存文本后再刷新，未用固定延迟假定保存完成。

测试脚本：`tooling/bot-host-pilot.ts`、`tooling/bot-live-pilot.ts`、`tooling/bot-supervisor-pilot.ts`、`tooling/bot-ui-pilot.mjs`。它们使用自己的隔离数据目录；系统托管脚本仅注册/清理自己的测试任务，不触碰其他 Windows 任务。真实模型脚本会调用当前配置的模型；其复制的加密连接文件在结束时删除，报告不含凭据。

## 验证边界

- 全量回归的两项失败均发生在既有文件符号链接测试创建 fixture 时，Windows 返回 `EPERM`：`tests/ono-render-pilot.test.ts` 的 “symlinked image, manifest or output directory is rejected before GitHub access” 和 `tests/windows-pilot.test.ts` 的 “Windows pilot refuses real evidence file symlinks on every platform”。没有修改系统开发者模式或放宽权限，也没有把这两项记为通过。
- 登录触发器已真实注册核查；本轮没有实际注销/重新登录或重启电脑。崩溃拉起已对测试 Host 实测，不能替代所有机器上的登录启动验收。
- 电源 suspend/resume 处理已接入，中断与漏期恢复有测试；完整设备休眠—唤醒后的 UI/模型恢复没有另行实机往返验收。最终按用户要求休眠不等于已验证唤醒结果。
- 后台系统通知和原事项提醒、点击定位路径已实现；Windows 通知中心显示/点击没有单独人工验收。原生浏览器只验证隔离本机测试页，不代表真实网站登录、发布或账号操作成功。
- 通用设计技能附带的 Python 审计脚本因本机没有 Python 未执行；采用仓库字阶校验、TypeScript、实际 Electron 截图、DOM 几何和交互验证。没有以构建代替视觉检查。
- 未打安装包或替换已安装应用；发行、真实用户库首次升级和其他电脑的托管兼容性应按正式发版流程复核。
