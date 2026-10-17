# 规范入口

规范是跨需求长期有效的约定；需求目录保存具体方案和带日期的验收。全局规范保持唯一正文及原路径，避免产生多个权威副本。

| 规范 | 内容 |
|---|---|
| [PRODUCT](../../PRODUCT.md) | 产品范围与决策 |
| [DESIGN](../../DESIGN.md) | 视觉规则与组件归属 |
| [UX-CONTRACT](../../UX-CONTRACT.md) | 可观察交互和数据边界 |
| [SYNC](../../modules/todo/SYNC.md) | To-Do-List 移植和共享数据契约 |

## 需求资料放置规则

```text
docs/requirements/<工作台>/<需求>/
  README.md          范围、状态及资料入口
  spec.md            已有需求正文（有则保留）
  prototype/         HTML 与配套 CSS/JS/许可证
  design/            选定图及生成来源
  evidence/          验收截图、测量与报告
  qa.md              带日期的既有验收正文
```

evidence/ 统一保存有保留用途的截图、测量与报告，qa.md 写验收结论。Git 策略与目录用途分开：证据默认忽略，仅将原有 18 张验收图列为显式例外；本机设计 PNG 继续忽略，不扩大公开范围。原始外部证据按绝对路径记录，不整套复制临时 profile、数据库或业务来源。临时调试输出使用 test-results/；确认要保留的终态再归入对应需求。

固定渲染源、发行说明和账本保留原路径，例外及原因列在 [资源索引](../RESOURCE-INDEX.md)。
