# 每日签到技术规格

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
