# OnO 原生附件试验（已退役入口）

状态：2026-10-12 简化候选删除 `.github/workflows/ono-attachment-test.yml`。保留 `tooling/ono/attachment-test.mjs` 及安全回归测试；它们不是日常上传器或正式任务入口。候选合入前后状态须核实准确提交，本文不声称当前远端已完成删除，也不授权恢复或运行。

完整旧试验步骤和配置留在[固定历史说明](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/docs/ONO-ATTACHMENT-TEST.md)及[固定历史 YAML](https://github.com/zhshenry/onosan_workbench/blob/673febb3ba2e24d17772092bc7d8956642574bee/.github/workflows/ono-attachment-test.yml)。旧说明的“待实测”、连接器能力与主聊天审批流程均为当时记录，不是当前能力或日常操作指引。正常工作按[Issue 规范](ONO-ISSUE-WORKFLOW.md)由正式任务唤醒 dot 执行。

## 保留代码的安全边界

- 仅绑定 `zhshenry/onosan_workbench`（repository ID `1372377655`）、准确 main SHA、可信来源/明确公开上传范围和目标 Issue；输入 `approval_id`、同账号评论或 `[OnO]` 标识不能证明真人批准。
- 保留默认只读、精确身份/权限/main/目标核对、marker 查重、仅首 attempt 一次写入、写前再核对的拒绝路径。保留脚本不等于授权接入新触发器、任意 PR 或新凭据。
- 历史运行器将 PAT 仅注入最终可信发布步骤，不保存、不打印、不扩大权限；本次清理不读取或改变 `ONOSAN_GH_TOKEN`，也不改变 Actions/security 设置。
- 写入超时或结果不明先查询。无匹配评论不能证明没有孤立附件，不能改 marker 盲试；concurrency 不是跨系统事务或持久幂等保证。
- 返回附件 URL 不等于已确认用户可打开、实际显示、字节/hash 正确或高保真。合成 16×16 PNG 不能充当 UI 方案或应用实测图。

## 证据与保留

PNG 只允许临时处理并清理，不入 Git、不新增 artifact/cache/备份；仅保存代码、回归和必要来源/hash/结果记录。原生附件不保证永久存在或可删除，删评论不等于删资产。本清理不删除任何远端附件。

本文件不把旧文档中未知的 PAT scope 或上传结果变成成功；真实历史图试点结果见[原型记录](ONO-PROTOTYPE-RENDER-PILOT.md)。权限或安全拒绝必须停，不自行扩权或换 token/路径绕过。

## 回归检查

`node --test tests/ono-attachment-test.test.ts` 可在 Node 24 运行。正常 `npm test` 保留输入、secret、身份、权限、目标、main 漂移、只读、单次写入、重放、部分失败先查、无重试和合成 PNG 反例，并验证退役 YAML 不存在。测试使用 mock，不连接 GitHub、不读取真实 secret、不证明真实附件权限。完整 Windows 构建、安装、UI、重启及证据验收仍由[Windows workflow](WINDOWS-CLOUD-PILOT.md)承担。
