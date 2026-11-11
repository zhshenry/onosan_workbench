# 通用与外观设置

所属：设置。资料状态：已选 C 与历史 A/B 原型。

当前规范：[视觉](../../../../DESIGN.md) · [行为](../../../../UX-CONTRACT.md)。需求方案、历史原型和旧截图均按其日期解读；整理目录不代表新增实施或重新验收。

## 当前页面

2026-11-11：导航、页标题和 AI 助手中的页面名称统一显示为「通用与外观」；「待办提醒」移到「待办与数据」首行，沿用原有开关值、即时保存及失败回退，当前页搜索随设置归属变化。旧通知入口转到「待办与数据」。

2026-11-05：原「通用」「外观」合并为「通用&外观」，同一列表包含开机自启、关闭窗口行为、待办提醒、界面语言与界面主题，保留既有设置值、即时保存及三款主题。搜索统一覆盖所有设置项；旧外观及通知路径仍可打开合并页，并高亮统一导航入口。

## 原型与依赖

- [settings-form-a-overlay.html](prototype/settings-form-a-overlay.html)
- [settings-form-b-modal.html](prototype/settings-form-b-modal.html)
- [settings-form-c-workbench.html](prototype/settings-form-c-workbench.html)

## 验收证据

- [settings-form-c-workbench.png](evidence/settings-form-c-workbench.png)（仅本机，Git 忽略）

验收截图、测量和报告统一存放在 evidence/；本机资料继续由 Git 忽略，原有验收图的提交范围通过显式规则保留。设计稿保留在 design/，临时调试输出放 test-results/。
