# 每日签到

入口：首页「每日签到」卡片，或小工具 → 每日签到。每家国内版先支持一个账号。

## 使用

1. 在「账号连接」选择应用。WorkBuddy 输入手机号、获取短信验证码后登录；Qoder 和 TRAE CN 点击前往授权，在系统浏览器完成官方登录后返回工作台。浏览器授权最多等待五分钟，可取消、重新打开。
2. 连接成功后查询活动资格。概览点击「一键签到」或单家「立即签到」，程序读取状态后仅领取符合条件的每日奖励。
3. 「领取待确认」只提供结果核对；程序不会因为网络超时、重复点击或重启而再次提交同账号同周期的未知领取。
4. 可设置自动签到，默认关闭、北京时间 10:05。可选择应用、启动／唤醒补查、需处理时系统提醒。完全退出或关机期间不执行。
5. 「断开连接」移除该应用的本机凭据，保留历史与用于防重复的本轮标记。重新连接同账号继续核对，不影响其他应用。

金额未知显示「—」。平台确认本轮签到与积分到账是不同信息；积分延迟发放时，不展示臆测的到账金额。

顶部依次为「签到概览」「账号连接」「签到记录」。签到记录只展示平台已确认成功的历史（最多 100 条），保留应用、手动／自动、奖励与时间；条数只计成功项，旧失败记录不显示。失败、暂无活动与待确认不新增历史，状态仍在概览处理；待确认核对成功后补记成功结果，防重复标记继续保留。概览不再放置最近记录，查看历史不触发签到或改变记录。

## 接入与边界

| 应用 | 授权 | 签到读取／领取 |
| --- | --- | --- |
| WorkBuddy | `www.workbuddy.cn/v2/plugin/login/send-sms`、`login/token`；腾讯 token refresh | `v2/billing/meter/checkin-activity-status`、`daily-checkin` |
| Qoder CN | `qoder.com.cn/device/selectAccounts`，S256 PKCE；`openapi.qoder.com.cn/api/v1/deviceToken/poll`／`refresh` | `sash/api/v1/me/campaigns`，只匹配唯一的每日 Credits 活动；按 campaign ID 领取 |
| TRAE CN | `www.trae.cn/authorization`；仅绑定 127.0.0.1 的随机路径回调；ExchangeToken、GetUserInfo | `api.trae.cn/trae/api/v2/ug/checkin_credits/status`、`claim`，均 POST |

平台签到接口并非本项目可保证稳定的公开 API。登录成功不能保证活动存在、设备合格或积分即时到账，真实兼容性需本人账号验证；平台变化时明确报错并提供官方说明入口。

Qoder 的活动键可能是不含每日语义的 `act-…`。每日活动同时核对中英文标题，识别「每日」「每天」「签到」及 Daily，中文存在时不忽略英文；仍只接受唯一的 Credits 每日活动，不领取首次订阅、新人或兑换码福利。2026-11-11 的实际「每天领 100 Credits」响应已验证可正确识别。

连接需要用户主动完成官方登录，不扫描或解密其他应用的凭据。TRAE 仅尝试读取官方应用的 `machineid` 设备元数据，否则使用本机持久化标识；Qoder 可调用已安装官方 CN 桌面端的 `runtime-info.exe` 获取一次真实设备信息。未安装时不编造机器证明。不存在身份轮换、风控绕过、活动刷量或其他奖励领取。

## 数据与安全

- 独立文件：`app.getPath('userData')/checkin.json`，不使用待办数据库。
- 登录令牌和原生设备证明整体通过 Electron `safeStorage` 加密；系统加密不可用时拒绝保存，不降级为明文。
- 主进程处理授权、凭据刷新、签到、调度。IPC 限主窗口、主框架及工作台文档，输入经过 Zod 校验；不会向页面返回令牌或完整平台错误内容。
- 固定 HTTPS 平台地址、拒绝重定向、隔离网络会话、不附带浏览器 Cookie、单请求 20 秒、响应大小上限 2 MiB。保持默认 TLS 验证。
- 原子保存刷新后的凭据、领取前待确认标记、最多 100 条成功记录与调度标记。保存失败不继续提交。
- 不新增依赖，不创建系统计划任务，不改变正式版安装或发布流程。

## 代码与验证

- 契约：`shared/checkin-contracts.ts`。
- 主进程：`electron/checkin.ts`、`checkin-providers.ts`、`checkin-auth.ts`、`checkin-runtime.ts`、`checkin-ipc.ts`。
- 页面与首页卡片：`src/views/CheckinView.tsx`、`checkin.css`。
- 回归：`node --import tsx --test tests/checkin.test.ts tests/checkin-ipc.test.ts tests/checkin-ui.test.ts`。
- 构建：`npm run verify`。
- 桌面验收：`qa-2026-11-10.md`；Qoder 真实状态识别复核见 [2026-11-11 修复验收](qa-qoder-2026-11-11.md)。

## 参考

官方规则：[WorkBuddy 设置](https://www.workbuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Setting)、[Qoder 每日积分](https://docs.qoder.cn/events/100credits)、[Qoder CLI 登录](https://docs.qoder.cn/cli/authentication)、[TRAE 方案与计费](https://docs.trae.cn/ide_plans-and-billing)。

协议核查参考：[WorkBuddy-Daily](https://github.com/L0NE-6/WorkBuddy-Daily)、[qoder2api-hub](https://github.com/shuishuipingan/qoder2api-hub)、[AICreditPunch](https://github.com/huxc573/AICreditPunch)。只用于核对端点及返回字段，未采用其中的关闭 TLS、凭据扫描、身份轮换、领取其他活动或模拟使用等行为。
