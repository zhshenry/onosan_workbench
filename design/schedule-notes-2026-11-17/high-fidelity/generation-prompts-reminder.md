# 日程提醒态高保真生成记录

日期：2026-11-17。方式：内置 ImageGen 编辑。状态：设计建议，尚未实现该提醒样式。

- 图片：`03-schedule-reminder.png`
- 参照：已确认方向的 `01-schedule-overview-v2.png`。
- 场景：虚构示例，2026-11-17周二13:50，14:00–15:00的产品设计评审触发会前10分钟提醒；正式触发时间遵循各日程的提醒设置。
- 保留：无工作区Tab、紧凑单行日期工具栏、日程待办双栏及现有玻璃主题。
- 新增状态：标题卡下的非模态提醒条、对应日程行的文字与暖色标识、打开日程／稍后10分钟／收起本次提醒。
- 操作语义：打开对应日程详情及纪要；延后只改变提醒时间，会议起止不变；关闭本次提示不完成或删除日程。
- 现状依据：当前 `src/views/TodoView.tsx` 的提醒条只有事项名称与稍后10分钟；本图为改进后的设计稿，并非现有运行效果。
- 检查：会前状态为10分钟后开始，纪要未记录；未误用进行中；其余列表仍完整可见。

## 最终编辑提示词

```text
Use case: ui-mockup. Edit the attached approved ONO Workbench schedule overview to show ONE clear realistic MEETING REMINDER state.
Output ONE high-fidelity complete desktop application screen, flat front-on, target1568 x1003 matching the original canvas and aspect ratio. This is a state of the existing design, not a new app or new visual direction.

User question: what does the schedule/todo page look like when a scheduled meeting reminder triggers? Show the answer directly in the UI.

HARD INVARIANTS FROM APPROVED REFERENCE:
Preserve the source pale blue/peach/lavender/teal ambient background; ordinary frosted-white glass, fine white rim and restrained shadows; all existing typography/spacing/design language; native top-left logo/toggle WITHOUT wordmark; global schedule/todo bar; tools/profile/native window controls; seven avatar floating left rail; lower settings capsule; bottom "问问日程…" assistant.
Workspace top header has ONLY "工作区" left and the existing collapse icon right. NO "日程待办/会议纪要" tabs.
Keep the title card with "日程待办", subtitle"11月17日 周二 · 3项日程，4项待办", and dark"+ 新增" on right.
Preserve the approved compact SINGLE-LINE toolbar at the top of the left schedule panel: "日程", previous-chevron, date"11月17日 周二", next-chevron, "今天", 日/周 with 日 selected. Do NOT restore a week strip, multirow date controls or full calendar.
Keep the two schedule/todo panels with their same widths, readable rows and no per-row nested cards. Todo content remains exactly as source.
No modal dialog, darkened background, desktop/OS notification, giant alarm graphic, ringing animation lines, unrelated recording/transcription features or AI summary controls.

REMINDER SCENARIO AND DATE:
Current client date2026-11-17 Tuesday Asia/Shanghai. Illustrative sample screen depicts13:50 that day; the meeting"产品设计评审" starts14:00 and ends15:00. Its configured reminder has just triggered ten minutes before start. This is fictional sample data.
Morning meeting09:30–10:00 ended. Afternoon16:30–17:00 is not started. The14:00 meeting is NOT currently in progress; fix the source's stale "进行中" state accordingly. Its notes are"未记录"; do not show completed/recording minutes before the user starts them.

PRIMARY NOTICE:
Insert ONE compact non-modal reminder strip between the existing page title card and the two main panels. It spans the content width, about56–60px tall, with subtle warm amber/cream frosted tint, small amber bell icon, no thick border or large shadow. Keep the title card in its original place. Move the tops of the two content panels downward only enough for this strip, retaining their original bottom edge and width. All three meeting rows and four todo rows must still fit naturally with breathing room.
Strip layout is a single clean horizontal grouping:
left small bell, strong text"10分钟后开始：产品设计评审";
secondary time"14:00–15:00";
right a compact dark primary"打开日程" button, lighter secondary"稍后10分钟" button, and small close X at the far right.
Use readable dark brown/charcoal text on warm translucent cream, NOT red error styling. Only this strip has reminder actions. Do not add a separate floating toast or repeat the same banner inside another panel. Buttons are source-matching rounded rectangles around32–36px high.
The message can use amber text for"10分钟后开始" and strong black for the meeting name. Make it noticeable and calm, not emergency-like.

CORRESPONDING MEETING ROW:
Under "今天的日程", keep three rows:
09:30–10:00 / 晨间同步 / 已结束 / 纪要已整理.
14:00–15:00 / 产品设计评审 / "10分钟后开始" amber status / document icon"未记录" / right inline blue"记录纪要 →".
16:30–17:00 / 项目进度同步 / 未开始 / 未记录.
For the14:00 row replace the source selected lavender background and indigo bar with a very subtle amber translucent highlight and narrow amber accent. This gently connects the strip to its actual schedule, without making the whole panel yellow. The reminder status uses real text and a small clock/bell, not color alone. Keep original row alignment and one faint separator at most between rows.
At top global schedule capsule keep the14:00–15:00 产品设计评审 summary and optionally a tiny amber indicator, but do not add more repeated countdown wording.

RIGHT TODO PANEL UNCHANGED:
heading"待办4", button"全部事项"; confirmed completed first item"确认纪要编辑交互" with source会议metadata; pending"整理设计评审反馈"; "补充项目验收清单"; "更新会议跟进事项". Keep dates and source row details from reference. Global todo progress remains1/4.
All visible dates must match2026-11-17 Tuesday; no today weekday mismatches.
Polish: strong hierarchy, original body font sizes, no dense microcopy, no excessive outlines or decorative panels, no explanatory labels outside the UI. This should look like an actual reminder occurring in the very same approved application.
```
