# 页头整合日程提醒高保真生成记录 v2

日期：2026-11-17。方式：内置 ImageGen 编辑。状态：页头整合提醒态 v2 的布局与醒目程度已获用户确认，尚未实现功能。

- 最终图片：`03-schedule-reminder-v2.png`。
- 编辑参照：`01-schedule-overview-v2.png`提供正常态的几何位置；`03-schedule-reminder.png`提供提醒文字与日程行状态。
- 用户反馈：提醒不要单独挤占工作区中间的位置。
- 用户确认（2026-11-17）：同意提醒整合进标题卡的呈现与醒目程度，以本版图片为视觉依据。
- 调整：复用现有日程待办标题卡右侧空白，显示会议名称、倒计时、时间与处理按钮；保留新增按钮；移除独立中间提醒条。
- 几何规则：标题卡高度、两栏起点和大小在提醒出现／收起前后保持一致；不挤占正文高度。
- 状态：示例为2026-11-17周二13:50，14:00–15:00会议提前10分钟提醒；实际按日程设置触发。会议行同步显示即将开始，纪要未记录。
- 操作：打开日程进入对应详情；稍后10分钟只延后提醒；关闭收起本次提示，不完成或删除日程。
- 视觉检查：提醒位于原有标题卡内部，无独立外框；两栏顶部恢复正常态位置；原日程、待办、单行工具栏、玻璃主题与导航均保留。
- 图片保持原始尺寸，未裁切或拉伸；旧提醒态与生成记录保留供比对。

## 最终编辑提示词

```text
Use case: ui-mockup. Precise revision of the ONO Workbench meeting reminder state.
Output ONE polished complete desktop app UI at1568 x1003, same original aspect ratio, flat front-on.

IMAGE ROLES:
Input image1 is the authoritative edit target for the NORMAL OVERVIEW GEOMETRY. All title-card and main-panel coordinates/sizes must match image1.
Input image2 is the previous reminder design, used ONLY for reminder wording and the meeting's warm-highlight state. The user rejected its separate full-width reminder strip between the heading and panels. Do NOT reproduce that strip.

USER REQUEST:
The reminder must not occupy a separate horizontal band in the middle of the workspace or push the main content downward. Integrate the reminder into the UNUSED RIGHT-HAND SPACE OF THE EXISTING "日程待办" TITLE CARD instead. Keep that title card's original height and position; preserve "+ 新增". Reminder appearing/disappearing should cause NO movement or resizing of either content panel.

LOCKED GEOMETRY FROM IMAGE1:
Original single page title card aboutx130 y164 width1398 height116.
Left schedule panel top atabouty300, bottom949. Right todo panel top atabouty300, bottom949. Same widths and original gutter. Match these coordinates. Do not use image2's lower panel tops near388. There is NO new container between the title card and panels.
Shell remains unchanged: current pale blue/peach/lavender/teal ambient background, source ordinary frosted white glass, subtle white rim and low shadow; compact logo/toggle at upper left without wordmark; schedule/todo capsule and tools/profile/native controls; seven-avatar floating Bot rail and settings capsule; bottom"问问日程…"assistant.
Workspace header only"工作区" plus far-right collapse control; no tabs.

TITLE CARD / INTEGRATED REMINDER:
Retain left heading"日程待办" and subtitle"11月17日 周二 · 3项日程，4项待办" at their original coordinates, with original type scale.
Keep dark"+ 新增" button at the original far-right position aroundx1394 y197.
Use the EMPTY MIDDLE-RIGHT AREA within THIS SAME title card, roughlyx570–1340 andy188–258, for a compact inline reminder group. It must NOT have its own rounded outer box, separate background, border, elevation or large amber surface. Same continuous glass backing as the existing title card. At most a faint small vertical divider between the left title block and reminder group.
Inline reminder composition:
- Small warm-amber bell icon aroundx580.
- Two-line text group beginningaroundx615:
  upperline bold readable18px"产品设计评审" followed by a small warm-amber text/badge"10分钟后开始";
  lowerline muted14–15px"14:00–15:00".
- To the right of the text, compact source-style actions in one row: "打开日程" (small indigo or subtle dark primary), "稍后10分钟" (neutral secondary), and small X for dismiss. Keep action heights32–34px, restrained10px corner radius. All fit inside the title card BEFORE the separate far-right"+ 新增" button, without overlap or crowding. Example actions aroundx1030,1145 and1290; use sane spacing.
- Do not add"提醒" as another heading or copy the countdown into another banner.
- Amber only on the small bell, countdown and corresponding meeting-row emphasis. The title card itself keeps its original ordinary-glass neutral tint.
This should feel like a natural compact status/action region of the page header, not another card placed inside it.

LEFT SCHEDULE PANEL EXACT SOURCE LAYOUT:
Single-line compact toolbar"日程", previous chevron, date"11月17日 周二", next chevron, "今天", 日/周 with日 active. No permanent week strip, no restored calendar grid.
"今天的日程" and3项 retain ORIGINAL image1 positions, not shifted down.
Three meeting rows retain their original image1 positions and spacing:
09:30–10:00 / 晨间同步 / 已结束 / 纪要已整理.
14:00–15:00 / 产品设计评审 / small amber status"10分钟后开始" / 未记录 / blue"记录纪要 →".
16:30–17:00 / 项目进度同步 / 未开始 / 未记录.
The14:00 row uses the subtle warm tint and narrow amber left accent from image2, but its geometry remains image1. Do not say"进行中" for this upcoming meeting. No extra per-row cards or new controls.

RIGHT TODO PANEL:
Completely preserve image1 coordinates, four rows, first completed teal checkbox, headings, dates, categories, meeting-source metadata and"全部事项" action. Do not compact/rearrange tasks to make room for a banner, because there is no banner.

TOP GLOBAL SCHEDULE:
Keep14:00–15:00 产品设计评审 and an optional tiny amber indicator as in image2, but no extra global notification popover or giant badge.

DATE/STATE:
Current client date2026-11-17 Tuesday Asia/Shanghai. Fictional sample state13:50, upcoming14:00–15:00 meeting, reminder set10minutes before. Page counts3meetings/4tasks, global todo1/4. All dates and states coherent.
No modal, overlay toast, desktop OS notification, new floating card, extra horizontal strip, explanatory callouts, annotations, split-screen comparison, device mockup, or new features.
Use the original crisp readable CJK sans typography and original glass design. Return only the final full application screen.
```
