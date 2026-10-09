# 历史方案 A 首页 · 原生附件版本记录 v1

这是历史原型的试点记录，不是当前产品方案、开发批准或产品视觉验收。
关联 [issue #7](https://github.com/zhshenry/onosan_workbench/issues/7)。本次只补齐
既有图片与源码版本的对应关系；不改历史 HTML、现行产品方案或原评论。

## 版本与来源

- 记录版本：v1（2026-10-09）
- 图片版本：`historical-design-a-home@7313fddf62f69561c492d553ca02548b7b704126`
- 状态：`historical-design-a-home`，初始首页；1440 × 1024，deviceScaleFactor 1
- 源文件：[`design/mockups/design-a-glass.html` 的固定版本](https://github.com/zhshenry/onosan_workbench/blob/7313fddf62f69561c492d553ca02548b7b704126/design/mockups/design-a-glass.html)
- 完整源码提交：`7313fddf62f69561c492d553ca02548b7b704126`
- HTML SHA256（原始 UTF-8 字节）：`e5841f61e2edd7c4c60e50bec7edd999e6d23e8e6f06d9fcea2ec92e3f136d8d`
- PNG SHA256：`b3ea95d3363593d98e3380fbedde82742bd52cd1599a639282a52a4cbd93f7e8`
- 来源：[Actions run 37881203730](https://github.com/zhshenry/onosan_workbench/actions/runs/37881203730)，attempt 1，workflow_dispatch，success
- 上传审计标记：`ono-render-20261009-7313fdd`；此标记不是人工批准凭据，不得重放
- 对应图片评论：[issue #7 / comment 6073909178](https://github.com/zhshenry/onosan_workbench/issues/7#issuecomment-6073909178)

图片版本由原评论已有的 State 和 Approved source SHA 组成。此记录将相同
state / SHA / run / attempt / PNG hash 绑定到同一评论及原生附件 URL；没有给
原评论补写新的批准或修改它的正文。将来引用本记录时，使用审阅后的固定提交链接。

## 直接嵌入的历史高保真原型图

![历史方案 A / historical-design-a-home@7313fddf62f69561c492d553ca02548b7b704126 / 初始首页](https://github.com/user-attachments/assets/5a50874f-d48c-416a-bd7f-ce0d517890a9)

上图复用原评论中的完全相同 URL。只存在那次已上传的原生附件；本次没有下载
或提交图片、重新渲染、二次上传、base64、图片 artifact 或额外备份。
HTML/CSS 属于正常可审阅源码，可以保留在仓库。普通 CI 的 3 天 artifact
规则不变，不能把短期 artifact 当作本图来源。

## 已核对与未覆盖

- 2026-10-09 只读回读原评论及 Actions run，核对上述来源、状态、SHA、attempt、hash 和唯一附件 URL
- 本文与评论均在正文用 Markdown 实际嵌图；回归测试检查本记录的版本字段、唯一附件及固定源码 hash
- 本 PR 不重新下载图片，也不把记录中的 hash 声明或测试通过当作本轮图片字节核验
- 历史评论仍标注 Visual review: pending；本记录不把它提升为 approved-high-fidelity
- 这是单个初始视口，未覆盖全部页面、状态或交互；Ubuntu 字体回退可能与 Windows 不同
- 图片可访问性可能变化；用于新的方案审批前需重新打开两处并完成相应视觉审阅。GitHub 附件不保证永久存在，失效时先标明证据缺失，不擅自补备份或重传

后续图片或实质 UI 变化需要新版本及对应主对话批准，不能把本历史图换绑到新
源码或当前产品方案。最终方案正文（含实际附件 URL）的摘要在正文定稿后计算，
不把会自我改变的摘要写进它自己的正文。参见[参数准备与未接通边界](ONO-PROTOTYPE-RENDER-PILOT.md#assistant-parameter-preparation-not-a-trigger)。
