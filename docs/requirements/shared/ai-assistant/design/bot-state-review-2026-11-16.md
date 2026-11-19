# Bot 主要状态高保真评审稿

日期：2026-11-16。状态：已获用户确认，作为首期开发的视觉基线，细节在开发后结合实机调整。本轮补绘六个主要状态，全部采用经典双长胶囊导航、窗影午后与 OnO 示例内容；不是六个互斥方案，也不是正式应用截图。悬浮导航继续保留，CMO 可复用交互结构，其权限/PBI 业务专属图尚未另绘。

确认记录（2026-11-16）：用户回复「可以，没有问题，先这样吧，有问题后面开发之后再细调」。确认范围为本文六张最终状态图，灵动岛采用校正稿；名片信息量先保留当前稿，不另行压缩。后续按此进入开发，具体间距、尺寸、窄窗和异常状态在实现与验收中细调；本次确认不表示已实施或通过运行验收。

以此前已确认的上移布局及交付件入口为基础，未更改应用代码或执行真实任务。图中日期为 11 月 16 日周一，提醒期望时间为 11 月 20 日周五 09:00，当前仍在等待日程核对。档案、能力、产物、消息和草稿均为演示内容。

## Bot 名片展开

名片紧邻联系人信息按钮，覆盖对话局部，不挤动正文；重点讨论信息量和浮层宽高。

![Bot 名片展开](bot-profile-popover-classic-2026-11-16-v1.png)

## Bot 资料编辑弹窗

名称、职责、工作说明组成单列表单；能力只读，记忆另有入口。重点讨论哪些信息应常显，哪些按需展开。

![Bot 资料编辑弹窗](bot-profile-edit-classic-2026-11-16-v1.png)

## 交付件列表与预览

交付件在原对话区域内切换，右侧预览成果，保留来源任务；返回对话时恢复输入。

![交付件列表与预览](bot-deliverables-classic-2026-11-16-v1.png)

## 浮动助手收起

保留原生工作区与按需任务详情，底部只有继续对话胶囊；模式、任务和交付件收在更多菜单。

![浮动助手收起](bot-floating-collapsed-classic-2026-11-16-v1.png)

## 浮动助手展开

答复在输入上方，二者可独立收起；保留回复任务和完整对话入口，覆盖层不透字。

![浮动助手展开](bot-floating-expanded-classic-2026-11-16-v1.png)

## 灵动岛总 Bot 对话

小窗直达 Ono，总台显示同一聊天与草稿；灵动岛拥有输入时，总台可点击在此继续输入交接。

![灵动岛总 Bot 对话](bot-island-coordinator-classic-2026-11-16-v1.png)

## 本轮取舍与讨论范围

- Bot 身份从左侧名片进入，详情在编辑弹窗处理，主区域不恢复身份行。
- 交付件列表替换对话的查看区域，右侧预览；不增加常驻第四栏，返回对话恢复原输入。
- 浮动模式的任务详情为按需打开，答复与输入可分别收起；更多菜单承载模式、任务、交付件入口。本轮展示菜单关闭状态。
- 灵动岛以这里的校正稿为准：Ono 头像一致，总台移除误带的自媒体页签，主窗口提供可点击的「在此继续输入」。小窗关闭不代表取消任务。
- 当前先讨论信息量、占位与入口。保存冲突、未保存退出、空态/缺失/无权限、窄窗及缩放状态仍按通用契约验收，没有把这些异常状态各画成完整截图。

静态图展示状态意图，不能证明跨窗口交接、实际工具权限、任务协作或后台运行已实现。后续组件应使用真实统一头像、控件和精确几何，不逐像素复制不同生成图的微小差异。

## 文件与生成来源

工具：内置 ImageGen，六张状态图加一次灵动岛定向校正。所有实际输入和完整指令见[生成记录](bot-state-review-2026-11-16.prompt.md)。原始生成文件位于 `C:/Users/henry/.codex/generated_images/01a1d374-1476-71a3-b6f1-45afb2903318/`，保持原文件不覆盖；下表为项目内最终评审副本，逐张与原始文件核对 SHA-256 一致。保留实际尺寸，没有裁切、拉伸或后处理。

| 状态 | 项目文件 | 实际尺寸 | 原始生成文件 |
| --- | --- | --- | --- |
| Bot 名片展开 | [bot-profile-popover-classic-2026-11-16-v1.png](bot-profile-popover-classic-2026-11-16-v1.png) | 1544 × 1018 | `exec-ccb39611-de0a-4c3e-85ef-fb8158b33963.png` |
| Bot 资料编辑弹窗 | [bot-profile-edit-classic-2026-11-16-v1.png](bot-profile-edit-classic-2026-11-16-v1.png) | 1544 × 1018 | `exec-8bdbcbe7-9322-47ee-ac9e-fca97b67780f.png` |
| 交付件列表与预览 | [bot-deliverables-classic-2026-11-16-v1.png](bot-deliverables-classic-2026-11-16-v1.png) | 1544 × 1018 | `exec-cba95a2f-ee47-4581-abef-96fa72374f9e.png` |
| 浮动助手收起 | [bot-floating-collapsed-classic-2026-11-16-v1.png](bot-floating-collapsed-classic-2026-11-16-v1.png) | 1544 × 1018 | `exec-f1ad5ed2-291b-4abc-8652-91d7189b0089.png` |
| 浮动助手展开 | [bot-floating-expanded-classic-2026-11-16-v1.png](bot-floating-expanded-classic-2026-11-16-v1.png) | 1544 × 1019 | `exec-4260b0fa-2d5f-4507-adb3-264cc591b38e.png` |
| 灵动岛总 Bot 对话 | [bot-island-coordinator-classic-2026-11-16-v1.png](bot-island-coordinator-classic-2026-11-16-v1.png) | 1545 × 1018 | `exec-98ff25c7-4646-4216-8656-c493994f2e3c.png` |

SHA-256：

- `bot-profile-popover-classic-2026-11-16-v1.png`：`13DB24C3F09E694411D51CC3DCDA7A4660522C0E073CCD947913279EB36E8E69`
- `bot-profile-edit-classic-2026-11-16-v1.png`：`51C368ED016EC283A154BAA81E6B46739F3E5699970B513246A53430E7970C9A`
- `bot-deliverables-classic-2026-11-16-v1.png`：`AB614B0821CB8435E88A24451418535572A1989725735A72DC8BADBAFDCED287`
- `bot-floating-collapsed-classic-2026-11-16-v1.png`：`648D4AD54376FE8E4852E2B368C04137BB73B1129FB96971D0E8D60BA04A6044`
- `bot-floating-expanded-classic-2026-11-16-v1.png`：`6AA98BD08CFFAC0D32268C918A539DECC3955701638B50ECFBF4F7DA880B4757`
- `bot-island-coordinator-classic-2026-11-16-v1.png`：`8D5EE3680D8E4DB8EE58AF8668FFCE6131CFFF021E05AA43619715449F711057`

PNG 仍遵循当前仓库忽略规则，本轮未改忽略规则或执行暂存/提交。跨项目交接时需显式携带这些图片和生成记录。相关规范：[通用方案](../bot-workbench-architecture.md)、[OnO 接入](../bot-architecture-proposal-2026-11-13.md)、[CMO 实施方案](../../../../design/cmo-bot-workbench-implementation-2026-11-15.md)、[视觉版本记录](bot-visual-revision-2026-11-15.md)。
