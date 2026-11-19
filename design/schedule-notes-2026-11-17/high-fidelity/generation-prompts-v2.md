# 日程与会议纪要高保真修订记录 v2

日期：2026-11-17。方式：内置 ImageGen 编辑。状态：界面设计稿，尚未实现功能。两张输出均保留原始画布，未做人工裁切或拉伸。第一版图片与提示词保留，供比对。

- 总览：`01-schedule-overview-v2.png`
- 详情：`02-meeting-minutes-v2.png`
- 依据：用户认可整体方向，要求取消工作区的日程待办／会议纪要 Tab，纪要从对应日程进入；重排日程卡片上方日期和按钮，减少占高。
- 处理：工作区只保留标题与收放入口；日视图将日期导航、今天和日／周切换合为单行，月历按需打开；周视图才展示紧凑周条。详情左侧改为日程列表。
- 原始参考：`01-schedule-overview.png`、`02-meeting-minutes.png`；详情同时参照本次总览结果以对齐外壳。
- 日期：2026-11-17，周二，虚构示例场景14:32。
- 检查：两个Tab均已移除；日视图无常驻周日期条，会议列表上移；会议详情仍对应产品设计评审，记录状态和两个关联待办保持一致。

## 总览最终编辑提示词

```text
Use case: ui-mockup. Precise revision of the attached ONO Workbench high-fidelity SCHEDULE OVERVIEW.
Target: ONE revised desktop application screen at the SAME original 1568 x 1003 canvas and aspect ratio. Edit the input rather than redesigning the app. Preserve all unrelated content, app framing, geometry, typography, exact glass materials, background, native controls, seven Bot avatar rail, selected Bot, header card, right todo panel, bottom assistant capsule. This is a user-approved design with TWO narrowly scoped corrections. No new features and no alternative design direction.

A. REMOVE TOP WORKSPACE TABS:
In the internal workspace header at the top, remove BOTH rounded-rectangle buttons/tabs labeled "日程待办" and "会议纪要". The header now contains ONLY "工作区" aligned left at its original location and the existing workspace-collapse icon aligned at far right. No replacement navigation, no segmented control, no standalone minutes library entry. Keep header height, title-card position and all other panel bounds exactly unchanged. Meeting minutes are entered through their corresponding meeting row.

B. COMPACT THE TOP OF THE LEFT "日程" PANEL:
The existing layout wastes vertical room with day/week on one row, a separate date/today row and an always-visible seven-day calendar strip. Replace that whole multirow control area with ONE compact horizontal toolbar across the panel top, about36px high, with body-size text.
Toolbar arrangement left to right: section title "日程" (20–22px, strong); in the remaining space a compact previous-chevron control; date picker label "11月17日 周二" with a subtle downward chevron; next-chevron control; a small "今天" control; a short "日 / 周" segmented switch with 日 selected. All these controls align on ONE baseline and fit within the original left-panel padding. Use small 28–32px rounded-rectangle icon hit areas and compact source-matching controls, not oversized pills. The date label must be readable, not squeezed. A compact clustered toolbar with subtle inline separation is preferred; no big full-width date box.
In the daily view shown, REMOVE the permanently visible weekday/date strip entirely. Do not show the Monday16–Sunday22 strip below the toolbar. The date picker opens a month calendar on demand (closed in this image). The week view would show a compact week strip, but this image is the selected DAY view.
Immediately below this single toolbar, after a modest20–24px gap, move the entire EXISTING "今天的日程" section upward. Keep its small "3项" count, exact three meetings, same row grouping, selected ongoing tint and "继续记录 →" action; do not change their information or style. Reclaim at least about140px of wasted control height for the meeting list; don't replace it with a giant spacer. The first meeting starts near the upper middle of the panel, the ongoing meeting is directly below, and unused space can naturally remain below the list.
Meeting rows unchanged:
09:30–10:00 / 晨间同步 / 已结束 / 纪要已整理.
14:00–15:00 / 产品设计评审 / 进行中 / 纪要记录中 / 继续记录 →.
16:30–17:00 / 项目进度同步 / 未开始 / 未记录.
Do not place every meeting inside its own separate card. At most one faint separator between rows.

Everything else must remain as the original:
Title card "日程待办", subtitle "11月17日 周二 · 3项日程，4项待办", dark "+ 新增" on right.
Right panel "待办4", "全部事项", four tasks with the exact existing completion status and metadata.
The top global schedule/todo bar is NOT the workspace tab row; preserve that global bar untouched.
Preserve source light ordinary glass with faint blue/peach tint, delicate white rim, dark charcoal text, muted indigo accent. Keep title-card surfaces. No recorder, transcription, AI summary, extra tooltips or explanatory annotations. No caption outside the application.

Date anchor is current client date2026-11-17 Tuesday Asia/Shanghai; keep the illustrative14:32 scenario and all example data. Sharp legible Chinese. Output only the complete revised app screen, no split before/after, no perspective or device mockup.
```

## 详情最终编辑提示词

```text
Use case: ui-mockup. Precise restrained revision of an approved ONO Workbench meeting-minutes detail UI.
Output ONE complete desktop application screen at exactly the target1568 x1003 canvas and original aspect ratio. Input image1 is the EDIT TARGET (original meeting detail). Input image2 is the newly approved revised schedule overview and serves ONLY as shell/navigation consistency reference. Do not turn the detail screen into the overview.

User feedback: no "日程待办 / 会议纪要" tabs above the workspace. Meeting minutes are always entered through the corresponding meeting/schedule. Apply ONLY the following navigation revisions; keep all existing document content, formatting tools, meeting header, buttons, dates, linked todos, panel geometry, glass theme, all avatars, and global topbar intact.

1. Internal workspace top header: remove BOTH the "日程待办" and "会议纪要" tab buttons completely. Leave just the existing "工作区" heading on the left and the existing workspace-collapse button far right, like input image2. Preserve the workspace header height, content top edge, title-card position and spacing. Do NOT remove the global schedule/todo capsule at the very top of the application; that global topbar is unrelated to the removed workspace tabs.

2. The left INSIDE directory is now explicitly a SCHEDULE list, not a standalone minutes library:
- Change its heading from "会议纪要" to "日程".
- Change the search placeholder from "搜索纪要" to "搜索日程".
- Keep its present narrow width, original date groups and three meeting entries exactly at their current places:
11月17日: 产品设计评审 / 14:00 · 记录中 (selected), 晨间同步 / 09:30 · 已整理.
11月16日: 项目周会 / 15:00 · 已整理.
These are meeting entries; selecting a meeting displays that meeting's own notes in the adjoining editor. No independent minutes tab or new library entrance.

Everything else is invariant:
Top-left logo capsule has only logo and navigation-toggle, NO app name.
Global topbar has "日程" and14:00–15:00 产品设计评审, todo1/4, tools/profile/native window controls.
Floating collapsed Bot avatar rail and independent lower settings capsule match exactly.
Title card includes "‹ 返回日程", "产品设计评审", "11月17日 周二 14:00–15:00", "进行中", and right-side "编辑安排" / dark primary "标记已整理".
Large main glass working panel, narrow schedule list left, faint vertical divider, roomy writing surface right. All ordinary frosted white with faint blue/peach ambient tint and restrained outlines/shadow.
Editor top "会前说明" and summary"目标：确认纪要记录与会后跟进流程", then existing minimal heading/bold/list/checkbox/link/undo toolbar and "记录中" at right.
Document Chinese content unchanged:
"讨论记录"
"日程总览保留日历与待办双栏，会议行展示纪要状态。"
"会议详情提供连续编辑空间，支持速记和粘贴。"
"会议结论"
"新增安排沿用共用弹框，纪要在详情页记录。"
"会议结束后保留纪要，可按日期和关键词回查。"
"后续行动" with "已关联2项待办".
"确认纪要编辑交互" completed teal checkbox and struck-through, 今天18:00 · 已完成, 查看待办.
"整理设计评审反馈" incomplete checkbox, 今天 · 待办, 查看待办.
"补充纪要检索验收场景" unlinked bullet and "+ 转为待办" action.
No per-paragraph nested cards, no excessive dividers, no save button, no permanent save-success message.
Bottom floating assistant"问问日程…" stays unchanged and unobtrusive.

Date anchor:2026-11-17 Tuesday Asia/Shanghai, fictional illustrative14:32 scenario. Keep all original precise CJK typography, alignment and spacing. No new recording, AI summarizing, comments or feature panels. No explanatory labels or before/after presentation. Return only the polished revised complete application UI.
```
