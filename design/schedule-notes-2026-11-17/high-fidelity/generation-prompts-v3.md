# 会议纪要单面板高保真生成记录 v3

日期：2026-11-17。方式：内置 ImageGen 编辑，先合并工作区，再针对右侧页头占高做一次精修。状态：设计稿，尚未实现功能。

- 最终图片：`02-meeting-minutes-v3.png`。
- 参考图片：`02-meeting-minutes-v2.png`；第一次合并结果作为第二次精修的输入。
- 变更依据：用户同意查看合并上方会议标题卡与下方纪要工作区的高保真。
- 最终结构：一个连续玻璃工作区；左侧日程列表通顶，右侧紧凑会议信息、会前说明、工具栏和纪要正文；不再独立设置上方标题卡。
- 保留：玻璃主题、全局顶栏与导航、无工作区Tab、纪要从对应日程进入、原始示例文字和关联待办。
- 交互设计意图：右侧页头与工具栏保持可用，左侧列表和正文独立滚动；此项尚未经过实现与实机验证。
- 日期：2026-11-17周二，示例14:32，虚构会议数据。
- 输出保持生成图片原尺寸，未裁切或拉伸；第一版和v2保留供比对。
- 视觉检查：只剩一层内容工作区外框，左侧从顶部开始；会议标题与操作归属右侧；返回与标题合为同一行；正文上移，三段记录和三条行动项仍可见。

## 合并工作区提示词

```text
Use case: ui-mockup. Precise high-fidelity revision of the attached approved ONO Workbench MEETING DETAIL / MINUTES screen.
Create ONE complete desktop application screenshot-style UI, flat front-on, target1568 x1003 matching the input canvas/aspect ratio. This is a single-panel refinement of the selected design. Do not invent an alternative app or style.

USER-APPROVED CHANGE:
The separate full-width meeting-title card at the top and the schedule/minutes panel underneath must become ONE continuous shared glass workspace. The left schedule list starts at the top of this combined surface. The selected meeting's title, metadata and actions belong INSIDE THE RIGHT EDITOR PANE, above its notes. This is the central required change; make it unmistakable.

APP SHELL LOCKED:
Preserve exactly the original outer app geometry, top-left logo+navigation-toggle capsule without wordmark, global schedule/todo capsule, tools/profile/native window controls, seven-avatar floating left Bot rail with current selected second purple Bot, separate bottom settings capsule and bottom floating"问问日程…"assistant.
Keep source pale mist-blue top-left / peach top-right / faint lavender and teal lower ambient gradient; ordinary frosted white glass with delicate white rim, faint backdrop tint, blur and restrained low shadow.
Keep the internal header at abouty90–150 with just"工作区" at left and collapse icon far right. No workspace "日程待办" or "会议纪要" tabs.
Do not alter the top global schedule/todo bar. No reminder banner in this frame. No recorder, transcription, AI summaries, new filters, new actions or decorative metrics.

UNIFIED MAIN SURFACE GEOMETRY:
Below"工作区", from approximatelyx130 y160 throughx1530 y950, draw ONE softly rounded glass rectangle about24px corner radius. It replaces BOTH old upper and lower cards and their intervening gap. One common outer outline/background only.
Inside this ONE rectangle keep the existing narrow left column (roughlyx130–443) and the wide right region(x443–1530). A single faint vertical divider runs from the TOP to the bottom of this shared surface.
Absolutely NO independent meeting header card above it, no horizontal full-width title area spanning both columns, no second rounded panel below, no nested white boxes.
This left-to-right composition should clearly read as one continuous functional workspace.

LEFT SCHEDULE DIRECTORY:
Move the existing schedule directory upward so it begins near the unified surface top, aroundy195 instead ofy340. It occupies the FULL panel height, independent of the right meeting header. Preserve internal padding and source styling.
Heading"日程".
Search input"搜索日程".
Date group"11月17日":
selected"产品设计评审" / "14:00 · 记录中" with original subtle indigo row tint and narrow indigo accent.
"晨间同步" / "09:30 · 已整理".
Date group"11月16日":
"项目周会" / "15:00 · 已整理".
No separate cards around list entries. Keep source readable spacing and selected item. Show no extra minutes-library entry.

RIGHT PANE COMPACT HEADER:
The header starts at the same top edge as the left directory and is PART OF the shared glass surface, not an elevated/rounded card.
Use a compact two-line arrangement occupying about90px:
First line: a small blue"‹ 返回日程" at the left, followed by large28px"产品设计评审". Right-align the existing secondary"编辑安排" and dark primary"标记已整理" buttons, around36–40px high, on this same header line. All must fit naturally in the roughly1000px right-pane width; do not crowd.
Second line: calendar icon and"11月17日 周二 14:00–15:00", with source small blue"进行中" state. This metadata is clearly attached to the meeting title.
Use purposeful alignment and compact gaps; remove excessive top padding from the old full-width title card.

RIGHT NOTES AREA:
Immediately below the compact header, add the existing light collapsible"会前说明" row with summary"目标：确认纪要记录与会后跟进流程". It stays collapsed and secondary.
Below that keep the minimal inline text toolbar: heading, bold, list, checkbox, link, undo; right side"记录中". Use a single fine line below the toolbar and minimal other horizontal lines.
Then give the rest of the continuous surface to the note document. Because the standalone title card and gap were removed, the document heading should start noticeably higher, aroundy365–385 instead ofy455. Keep source generous18px CJK body type and comfortable line spacing, readable line length, and at least24–32px horizontal editor padding.
Do not make discussion, conclusions or actions into separate cards.

DOCUMENT CONTENT / STATE MUST REMAIN:
"讨论记录"
- "日程总览保留日历与待办双栏，会议行展示纪要状态。"
- "会议详情提供连续编辑空间，支持速记和粘贴。"
"会议结论"
- "新增安排沿用共用弹框，纪要在详情页记录。"
- "会议结束后保留纪要，可按日期和关键词回查。"
"后续行动" with small adjacent"已关联2项待办".
First action"确认纪要编辑交互", teal completed checkbox and strike-through, secondary"今天18:00 · 已完成", trailing"查看待办 ↗".
Second"整理设计评审反馈", empty checkbox, "今天 · 待办", trailing"查看待办 ↗".
Third"补充纪要检索验收场景", plain unlinked bullet, trailing"+ 转为待办" control.
Keep actions cleanly aligned on the same surface, no per-row boxed cards. Keep caret after the second discussion line to suggest editing. No save button or persistent"已保存" notice.

Typography/material: source CJK sans, dark charcoal headings, slate secondary text, muted indigo accents, teal completion. Controls10px corners, common outer workspace24px. Shared glass background should subtly show source gradient across both columns, with no visual reset behind the meeting header. Hierarchy comes from typography, spacing, alignment and light dividers.
Scrolling behavior is only a visual design intention: left directory and right note body can scroll independently with right compact header/toolbar remaining available; don't add decorative scrollbars when content fits.

Date anchor: current client date2026-11-17 Tuesday Asia/Shanghai, fictional illustrative14:32 state matching source. Keep all dates, meeting state and linked todo state coherent.
Output only ONE polished complete application UI. No labels about redesign, no comparison board, no perspective, no device bezel.
```

## 最终页头精修提示词

```text
Use case: ui-mockup. Make ONE targeted spacing correction to the attached ONO Workbench merged meeting-minutes UI. Output one final complete screen at1568 x1003, same aspect ratio. Treat the attachment as the edit target; all design, app shell, SINGLE continuous glass panel, left schedule directory and document content are locked.

KEEP the successful unified surface: one outer glass rectangle from approximatelyx130 y160 to1530 y950, left schedule list begins at its top, faint vertical divider atx443, meeting title and minutes both inside RIGHT pane. Do NOT reintroduce separate upper and lower cards or workspace tabs. Preserve the left column, topbars, avatars, glass, background, all colors and the bottom assistant EXACTLY as attached.

ONLY CORRECTION: the right meeting header still uses three vertical rows and too much space before the document. Compress it into TWO rows and lift the rest of the right-hand document by about55–65 pixels.
- First row near y197: place the small "‹ 返回日程" link INLINE atx476, then "产品设计评审" at aboutx590 on the SAME baseline. Keep title around27–28px and link14px so both are clear. Align "编辑安排" and primary"标记已整理" on this same first row at the right. These actions retain their text and styling.
- Second row near y236: calendar icon and"11月17日 周二 14:00–15:00" plus blue"进行中" state. Keep their current text and visual treatment.
- Place collapsed"会前说明" plus summary"目标：确认纪要记录与会后跟进流程" near y275, immediately below the compact header with normal spacing.
- Place the existing heading/bold/list/checkbox/link/undo toolbar and right "记录中" near y318. Use just one faint divider beneath it.
- The document heading"讨论记录" should start near y370, followed by its existing two bullet lines; then"会议结论" with its existing two bullet lines; then"后续行动" with exact same three action rows, statuses and controls. Move this whole document block upward, maintaining the existing generous spacing between its sections and exact left alignment. Do not scale or shrink body text.
- Remove any duplicate horizontal line between the collapsible explanation and toolbar; one line below toolbar is enough.

No other changes. Keep exact selected meeting, sample notes,2 linked todos, completed first item, dates, "查看待办" links and "+ 转为待办" button. Preserve comfortable Chinese body type. No empty placeholder blocks, no extra features, no save banner, no new UI cards. Current client date2026-11-17 Tuesday Asia/Shanghai; illustrative14:32 scenario and all content remain unchanged.
Return only the final polished complete app screen; no comparison board, callouts or redesign labels.
```
