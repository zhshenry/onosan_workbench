# 每日签到

入口：总台「每日签到」卡片 → 查看全部。每家国内版先支持一个账号。

## 2026-11-17 设置归属调整（已实施）

签到页只保留“签到概览／签到记录”。「设置 → Agent连接 → Agent签到连接」上方管理账号登录、官方授权、重新连接和断开，下方配置自动签到开关、时间、参与应用、补查和通知。卡片与概览的“去连接／重新连接”直接选中对应应用；从签到进入后，连接成功自动返回，取消或关闭保留原签到页面。自动签到设置随修改保存，保存失败恢复上次设置，不改变原领取、去重、加密或授权取消机制。

命理与阅读清单已各自独立，“小工具”导航移除；签到归总台且不新增顶部 Tab 或签到 Bot。以下 2026-11-15 布局记录中的三页签与页内配置入口已由本条替代。验收见[设计验收](../../../../design-qa.md)。

## 2026-11-15 方案一

采用[确认稿](../../../../design/checkin-list-selected-2026-11-15.png)的集中清单布局：页头承载三页签与刷新／自动签到入口，概览主卡承载本轮进度、三家应用及连接／领取操作，自动签到开关与配置位于底部。刷新状态不提交领取；开启开关后先进入配置，保存才启用，取消不变更。账号连接与成功记录沿用原流程，窄窗口在卡内滚动，公共顶栏与侧栏位置保持不变。验收见[设计验收](../../../../design-qa.md)。

首页添加卡片目录提供应用并排、列表、应用卡片三种样式。「应用卡片」沿用 AI 额度的浅色品牌单元，三个平台分别显示真实状态；仅平台确认领取后显示奖励，未知金额用「—」。目录与看板共用 `CheckinHomeContent`，选择和预览不触发领取；一键签到与账号管理沿用原业务流程。

## 使用

1. 在「设置 → Agent连接 → Agent签到连接」选择应用。WorkBuddy 输入手机号、获取短信验证码后登录；Qoder 和 TRAE CN 点击前往授权，在系统浏览器完成官方登录后返回工作台。浏览器授权最多等待五分钟，可取消、重新打开。
2. 连接成功后查询活动资格。概览点击「一键签到」或单家「立即签到」，程序读取状态后仅领取符合条件的每日奖励。
3. 「领取待确认」只提供结果核对；程序不会因为网络超时、重复点击或重启而再次提交同账号同周期的未知领取。
4. 在「设置 → Agent连接 → Agent签到连接」下方配置自动签到，默认关闭、北京时间 10:05。可选择应用、启动／唤醒补查、需处理时系统提醒。完全退出或关机期间不执行。
5. 「断开连接」移除该应用的本机凭据，保留历史与用于防重复的本轮标记。重新连接同账号继续核对，不影响其他应用。

金额未知显示「—」。平台确认本轮签到与积分到账是不同信息；积分延迟发放时，不展示臆测的到账金额。

顶部依次为「签到概览」「签到记录」。签到记录只展示本机发起领取且经平台确认成功的历史（最多 100 条），保留应用、手动／自动、奖励与时间；条数只计成功项，旧失败记录不显示。失败、暂无活动与待确认不新增历史，状态仍在概览处理；待确认核对成功后补记一次，成功记录与同账号同周期的已记录标记一并原子保存。重复核对、自动再查、重启及同账号重新连接不追加记录；仅查询到平台已签到而没有本机领取请求时，只更新概览。新周期或另一账号的实际领取成功分别记录，现有历史保留。概览不再放置最近记录，查看历史不触发签到或改变记录。

## 接入与边界

| 应用 | 授权 | 签到读取／领取 |
| --- | --- | --- |
| WorkBuddy | `www.workbuddy.cn/v2/plugin/login/send-sms`、`login/token`；腾讯 token refresh | `v2/billing/meter/checkin-activity-status`、`daily-checkin` |
| Qoder CN | `qoder.com.cn/device/selectAccounts`，S256 PKCE；`openapi.qoder.com.cn/api/v1/deviceToken/poll`／`refresh` | `sash/api/v1/me/campaigns`，只匹配唯一的每日 Credits 活动；按 campaign ID 领取 |
| TRAE CN | `www.trae.cn/authorization`，TRAE IDE 标识与 S256 PKCE；仅绑定 127.0.0.1 随机端口的固定 `/authorize` 路径，接收 `authCodeInfo.AuthCode` 并核对本轮 `loginTraceID`；`api.trae.cn/trae/api/v3/oauth/ExchangeToken`、GetUserInfo | `api.trae.cn/trae/api/v2/ug/checkin_credits/status`、`claim`，均 POST `{ req_source: 1 }`，签到请求使用官方初始化的本机设备 ID |

平台签到接口并非本项目可保证稳定的公开 API。登录成功不能保证活动存在、设备合格或积分即时到账，真实兼容性需本人账号验证；平台变化时明确报错并提供官方说明入口。

Qoder 的活动键可能是不含每日语义的 `act-…`。每日活动同时核对中英文标题，识别「每日」「每天」「签到」及 Daily，中文存在时不忽略英文；仍只接受唯一的 Credits 每日活动，不领取首次订阅、新人或兑换码福利。2026-11-11 的实际「每天领 100 Credits」响应已验证可正确识别。

连接需要用户主动完成官方登录，不扫描或解密其他应用的凭据。TRAE CN 授权保留原有绑定标识（`Trae CN/machineid`，缺失时使用本机持久化标识）；签到请求单独读取 `Trae CN/logs` 最近一次官方启动日志头部的设备初始化成功标记，取得本机已注册的设备 ID，不混用机器标识或 SOLO 目录。读取上限 256 KiB，无法识别时停止请求并提示先打开官方应用，不生成替代设备身份，也不回退到旧启动记录。首次授权生成本连接的 P-256 密钥，公钥随授权码交换提交，续期用同一私钥签署设备证明；旧连接缺少密钥时提示重新连接。浏览器本机回调仅允许官方 `https://www.trae.cn` 来源，支持该来源的预检请求，不开放任意来源。Qoder 可调用已安装官方 CN 桌面端的 `runtime-info.exe` 获取一次真实设备信息。未安装时不编造机器证明。不存在身份轮换、风控绕过、活动刷量或其他奖励领取。

## 数据与安全

- 独立文件：`app.getPath('userData')/checkin.json`，不使用待办数据库。
- 登录令牌、TRAE 本连接的设备签名密钥和原生设备证明整体通过 Electron `safeStorage` 加密；私钥不传给网页或平台。系统加密不可用时拒绝保存，不降级为明文。
- 主进程处理授权、凭据刷新、签到、调度。IPC 限主窗口、主框架及工作台文档，输入经过 Zod 校验；不会向页面返回令牌或完整平台错误内容。
- 固定 HTTPS 平台地址、拒绝重定向、隔离网络会话、不附带浏览器 Cookie、单请求 20 秒、响应大小上限 2 MiB。保持默认 TLS 验证。
- 原子保存刷新后的凭据、领取前待确认标记、最多 100 条成功记录与调度标记。保存失败不继续提交。
- 不新增依赖，不创建系统计划任务，不改变正式版安装或发布流程。

## 代码与验证

- 契约：`shared/checkin-contracts.ts`。
- 主进程：`electron/checkin.ts`、`checkin-providers.ts`、`checkin-auth.ts`、`checkin-runtime.ts`、`checkin-ipc.ts`。
- 页面与首页卡片：`src/views/CheckinView.tsx`、`checkin.css`。
- 回归：`node --import tsx --test tests/checkin.test.ts tests/checkin-trae-auth.test.ts tests/checkin-trae-device.test.ts tests/checkin-ipc.test.ts tests/checkin-ui.test.ts`。
- 构建：`npm run verify`。
- 桌面验收：`qa-2026-11-10.md`；Qoder 真实状态识别复核见 [2026-11-11 修复验收](qa-qoder-2026-11-11.md)；TRAE CN 授权修正及真实登录边界见 [2026-11-15 授权复核](qa-trae-auth-2026-11-15.md)。

## 参考

官方规则：[WorkBuddy 设置](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting)、[Qoder 每日积分](https://docs.qoder.cn/events/100credits)、[Qoder CLI 登录](https://docs.qoder.cn/cli/authentication)、[TRAE 方案与计费](https://docs.trae.cn/ide_plans-and-billing)。

协议核查参考：[WorkBuddy-Daily](https://github.com/L0NE-6/WorkBuddy-Daily)、[qoder2api-hub](https://github.com/shuishuipingan/qoder2api-hub)、[AICreditPunch](https://github.com/huxc573/AICreditPunch)。只用于核对端点及返回字段，未采用其中的关闭 TLS、凭据扫描、身份轮换、领取其他活动或模拟使用等行为。
