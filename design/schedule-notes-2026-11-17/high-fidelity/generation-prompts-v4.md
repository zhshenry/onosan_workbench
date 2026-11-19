# 会议纪要返回入口高保真修订记录 v4

日期：2026-11-17。方式：内置 ImageGen 编辑。状态：设计稿，尚未实现功能。

- 最终图片：`02-meeting-minutes-v4.png`。
- 参照图片：`02-meeting-minutes-v3.png`。
- 用户反馈：把会议标题旁的返回入口放到左侧。
- 调整：返回日程移至左侧列表的标题行右端，与日程标题同行；右侧会议名称左对齐日期、会前说明和正文。
- 保留：单块玻璃工作区、搜索框和列表的纵向位置、会议正文与待办状态、按钮和全部导航；不增加额外返回行。
- 窄工作区设计：左侧列表隐藏时，返回入口保留在单栏页头左侧，实施时验收。
- 场景：2026-11-17周二14:32的虚构示例；图片保持原始尺寸，未裁切或拉伸。
- 检查：返回仅一处，位于左侧；会议标题与右侧内容左缘对齐，列表和编辑区无额外下移。

## 最终编辑提示词

```text
Use case: ui-mockup. Surgical edit of the attached approved ONO Workbench meeting-minutes screen.
Output ONE revised complete application UI at1568 x1003, matching the original framing/aspect ratio and all existing design details.

USER'S ONE CHANGE:
Move the blue "‹ 返回日程" navigation link from beside the meeting title in the RIGHT editor pane to the title row of the LEFT schedule directory.

EXACT PLACEMENT:
- Left schedule column is approximatelyx130–443.
- Preserve its existing bold"日程" heading atx155,y198.
- Place the same small blue"‹ 返回日程" link at the RIGHT END of this LEFT column's heading row, aboutx302–419,y198, horizontally aligned with"日程". It fits comfortably before the vertical divider. Use the original link typography/color, no new pill or filled button, no oversized icon.
- Keep the search input"搜索日程" at its originaly238, and keep all left date groups, selected meeting row, list spacing and text EXACTLY unchanged. Do not add a new row or move the search/list down.
- Remove the original return link from the right pane completely; there must be only ONE return link in the entire screen.
- Move ONLY the right meeting title"产品设计评审" leftward to aboutx475 so its left edge aligns with the existing date/metadata line, collapsed meeting-info row, toolbar and document text. Keep its current vertical position, font size and weight.
- Keep"编辑安排" and"标记已整理" buttons at their original top-right positions, unchanged.

LOCK EVERYTHING ELSE:
One continuous glass content workspace with a full-height left directory and right editor; same vertical divider and outer rounded boundary. Do not reintroduce separate upper and lower cards.
No workspace tabs; global"工作区" row stays unchanged.
Same ordinary frosted glass, faint blue/peach/lavender/teal backdrop, typefaces, control radii, avatar rail, global topbar capsules, logo without wordmark, native window buttons, bottom settings and"问问日程…"assistant.
Same selected"产品设计评审", metadata"11月17日 周二14:00–15:00", blue"进行中", notes"记录中".
All document text, bullets, heading positions, tool icons, caret, conclusions, three follow-up action rows, completion status, links and"+ 转为待办" remain exactly as attached. Keep all row geometry and document starting height unchanged.
No new features, help text, navigation, cards, recorder, reminders, extra back button, annotation or comparison layout.
Date anchor2026-11-17 Tuesday Asia/Shanghai, original fictional14:32 scenario.
Return only the polished final revised application screen.
```
