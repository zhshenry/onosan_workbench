# 日程与会议纪要高保真生成记录

日期：2026-11-17。方式：内置 ImageGen。状态：两张互相衔接的界面设计稿，使用虚构会议与待办数据，尚未实现功能。

- 总览：`01-schedule-overview.png`
- 会议详情与纪要：`02-meeting-minutes.png`
- 第一张参考本机工作台总览截图。第二张沿用第一张高保真稿的外壳和材质。
- 用户确认：第一版以手动速记、粘贴内容为主。
- 日期锚点：2026-11-17，周二；示例画面设定为当日下午 14:32。
- 目标画布：1600×1024。两张实际输出均为 1568×1003，保持生成结果原尺寸，未拉伸或裁切。
- 检查：两图外壳位置、导航、日期、会议标题、纪要状态与关联待办相互对应；标题卡、工作区共用普通玻璃材质；连续正文与列表不逐段套卡。

## 总览最终提示词

```text
Use case: ui-mockup.
Asset type: High-fidelity desktop Electron application screen, a careful redesign of the attached ONO Workbench schedule screenshot. Create ONE complete screen, straight-on and flat, no device mockup, at target dimensions 1600 x 1024. This is the schedule overview screen of a TWO-SCREEN same-product workflow, not competing visual directions. Preserve the attached application's design system and shell.

Create realistic, production-quality UI with clear hierarchy, strong typography, purposeful spacing and readable Simplified Chinese. This frame shows the main use case: see today's meetings, find their minutes, and keep personal todos alongside. Do not add feature inventory, charts, dashboard metrics or unrequested functionality. User has confirmed manual note-taking and pasting as the first version. No recorder, audio waveforms, transcription or AI generation buttons.

Input image role: exact grounding for the existing app's topbar, current floating collapsed Bot sidebar, colors, materials, typography, workspace framing, controls and bottom floating assistant. Remove the unrelated operating-system notification visible in the screenshot. Keep all the native window controls. Do not add an application name to the top-left logo capsule.

Design language and tokens: current pale mist-blue upper-left, warm peach upper-right, faint lavender lower-left and pale teal lower-right ambient gradient. Ordinary frosted glass: translucent white gradients approx #ffffffc2 to #ffffffa3, blur 18px, saturation 1.15, fine white rim, restrained low shadow. Title card AND main workspace panels share this material and show a slight coherent background tint. Dark charcoal primary text, slate-gray secondary text, muted indigo #4c68a5 accent, teal complete states, restrained red only for overdue. Chinese sans typography similar to Microsoft YaHei / Noto Sans SC, body 15–16px, page title 28px, section title 20px. Buttons use rounded rectangles 10px, functional panels softly rounded 20–24px, floating navigation capsules as in source. Strong typographic contrast and spacious readable rows. No excessive borders or multiple horizontal lines. No separate cards around every list row.

Shell invariants: source's compact logo+sidebar-toggle capsule at top left, NO wordmark; centered schedule+todo global capsule; tools/avatar capsule and minimize/maximize/close at upper right; centered floating left vertical Bot rail containing the source's seven softly colored 3D avatar icons, second purple schedule Bot selected with source-like softly tinted rounded-square highlight, settings separate bottom-left capsule. Keep rail width and content left edge fixed. Source's wide glass workspace begins about x108 at this scale and y92 and occupies remaining canvas with sensible 20px outer gutters. Its top bar reads "工作区" followed by two small rounded-rectangle tabs "日程待办" active and "会议纪要" inactive, with the existing workspace-collapse icon at far right. Preserve source floating bottom assistant capsule with sparkle and "问问日程…", unobtrusive.

Date anchor: current client date is 2026-11-17, Tuesday, Asia/Shanghai. Illustrative UI state depicts 14:32 on that date; these are fictional sample records. Calendar week is Monday Nov16, Tuesday Nov17, Wednesday Nov18, Thursday Nov19, Friday Nov20, Saturday Nov21, Sunday Nov22. Mark Tuesday17 selected. Do not use dates from 2025.

Page layout: inside workspace, a distinct full-width glass TITLE CARD with "日程待办", a small secondary line "11月17日 周二 · 3项日程，4项待办", and one dark primary "+ 新增" button at right. Below it exactly two generous neighboring working panels, schedule left about56% and todos right about44%. Both aligned top and bottom, subtle shared frosted material. Avoid giant empty space and avoid crowding.
Left panel: heading "日程", day/week segmented control "日" active / "周", compact date control "2026年11月17日" and "今天". A clean weekly date strip using the exact dates above. Below, heading "今天的日程" small count "3项". Three meeting rows, each grouped by whitespace, one light separator per row only. Each row shows time, title, time status and an independent readable minutes status with small document icon. Use:
"09:30–10:00" / "晨间同步" / "已结束" / "纪要已整理".
"14:00–15:00" / "产品设计评审" / "进行中" / "纪要记录中".
"16:30–17:00" / "项目进度同步" / "未开始" / "未记录".
The middle ongoing meeting is visibly selected using an extremely subtle indigo translucent row tint and a small indigo accent, with an inline "继续记录 →" action aligned to the right. This action should visibly lead into meeting minutes.
Right panel: heading "待办" with count4, compact "全部事项" action. Four realistic one-line todo rows with circular completion controls, supporting category/date text, and no nested cards:
"确认纪要编辑交互" / "产品" / "今天 18:00".
"整理设计评审反馈" / "设计" / "今天".
"补充项目验收清单" / "项目" / "明天".
"更新会议跟进事项" / "工作" / "11月20日".
First item has small document-source metadata "产品设计评审", linking this screen to the second screen. Keep total4 and global topbar todo progress "1/4" plausible with 1 completed task if showing completion; use topbar label "待办" without extra progress if necessary. Topbar schedule capsule may show "14:00–15:00 产品设计评审". No permanently visible "已保存，重启后继续使用", no tiny unreadable dense copy.

Typography/layout priority: spacing, alignment and grouped hierarchy first; single row separators second; subtle tint third. Keep text crisp and well formed. No decorative illustrations inside working panels, no repeated page titles, no extra marketing headings. All content fits naturally with clean margins. Output only the polished complete application screen.
```

## 纪要详情最终提示词

```text
Use case: ui-mockup.
Asset type: High-fidelity desktop Electron application UI, the MEETING DETAIL / MINUTES screen that follows the attached schedule overview. Create ONE complete flat front-facing screen, target dimensions 1600 x 1024, same framing and proportions as the attached image. This is the second complementary screen in the same workflow, NOT an alternative visual direction.

Primary request: faithfully preserve the attached ONO Workbench's entire application shell and visual system, and replace its inner schedule/todo overview with a focused manual meeting-minutes workspace. The user chose manual quick notes and pasted meeting content for the first version. Produce realistic, production-quality UI, clear hierarchy, readable Simplified Chinese, purposeful spacing. Focus on one specific meeting and its linked follow-up actions.

Input image is the authoritative same-product style and shell reference: preserve the exact blue/peach/lavender/teal ambient backdrop, frosted-white material, typography scale, outer panel framing, left Bot rail position and seven avatars, top-left logo-and-toggle capsule WITHOUT a wordmark, global topbar capsules with schedule/todo information, profile and native window controls, and bottom floating assistant. Keep shell geometry and main content left edge the same. In the inner "工作区" header keep the two tabs "日程待办" and "会议纪要", with "会议纪要" active this time; keep the workspace-collapse button at the right. Do not add extra sidebar links, widgets, recording controls, transcription or AI summarizing tools.

Material/typography: ordinary frosted glass white gradients #ffffffc2 to #ffffffa3, blur18px, fine white rim, soft low shadow, and subtly visible shared ambient background tint. Page TITLE CARD and continuous main WORKSPACE surface both follow the same material. Dark charcoal text, slate secondary text, muted indigo #4c68a5 accents, teal completed state. CJK sans font, body15–16px with 1.6 line-height, section headings20px, meeting title28px. Soft20–24px main panel corners,10px controls. Prioritize spacing/grouping/typography, then a single subtle divider where needed. No cards inside cards and no boxes around each paragraph or action item. The writing area is calm and readable, a slightly denser white tint is acceptable but the workspace still belongs to the same glass theme.

Date anchor: current client date2026-11-17, Tuesday, Asia/Shanghai. Fictional sample UI scenario depicts14:32 that afternoon, same as attached overview. Current meeting is "产品设计评审", "11月17日 周二 14:00–15:00", time status"进行中", notes status"记录中". Both statuses are independent. This is illustrative data, not real user records.

MAIN CONTENT:
A separate full-width glass title card below the "工作区" toolbar. A small "‹ 返回日程" link at upper left. Below it large "产品设计评审" and a compact date/time line with a modest "进行中" status. On the right a secondary "编辑安排" button and one clear dark primary "标记已整理" button. Keep this card compact enough for abundant editor room. No redundant "日程详情" title.

Below the title card, ONE continuous frosted working panel. Inside it a narrow about240px navigation column and the main editing region separated by ONE faint vertical divider; they are not independent floating cards.
Left inner column: small heading"会议纪要", simple search input"搜索纪要", date group"11月17日", two compact entries:
selected "产品设计评审" / "14:00 · 记录中";
"晨间同步" / "09:30 · 已整理".
Then date group"11月16日" with "项目周会" / "15:00 · 已整理".
Selected row subtle indigo tint. Keep other rows unboxed, no large feature-heavy filters. This sidebar helps retrieve notes from completed meetings.

Right editor region:
At its top a light compact collapsible line "会前说明" with chevron and one-line summary"目标：确认纪要记录与会后跟进流程". Preserve enough spacing so it is visually secondary and collapsed, not a big information card.
Below it a minimal inline text-formatting toolbar with real line-icon conventions for heading, bold, list, checkbox, link, undo. Small note-status text"记录中" aligned right. No save button; autosave is assumed and no permanent "已保存" slogan.
The editor itself is roomy and continuously editable, aligned on one comfortable reading column of about700–780px maximum. Render realistic Chinese note text with crisp glyphs and intentional line spacing. Use these clear headings and text verbatim as much as possible:

Heading "讨论记录"
Bullet "日程总览保留日历与待办双栏，会议行展示纪要状态。"
Bullet "会议详情提供连续编辑空间，支持速记和粘贴。"

Heading "会议结论"
Bullet "新增安排沿用共用弹框，纪要在详情页记录。"
Bullet "会议结束后保留纪要，可按日期和关键词回查。"

Heading "后续行动" with a small adjacent muted label"已关联2项待办".
Three clean aligned rows on the same editor surface, no row cards and no repeated dividers:
1. Teal completed checkbox, text"确认纪要编辑交互" softly struck through, secondary source/status"今天18:00 · 已完成", trailing"查看待办 ↗".
2. Empty checkbox, text"整理设计评审反馈", secondary"今天 · 待办", trailing"查看待办 ↗".
3. Plain small bullet rather than linked checkbox, text"补充纪要检索验收场景", trailing small outlined rounded-rectangle"+ 转为待办" control. This is deliberately NOT yet a linked todo, visibly distinguishing it from the first two.
An understated editor caret or active text cursor after the last discussion line can suggest writing without obscuring text.

Let the three note headings and their content feel like a readable document, not a dashboard. No attendee avatar rows, arbitrary tags, extra insights cards, status dashboards or side-by-side AI chat. Keep the bottom source-like floating"问问日程…" assistant pill unobtrusive outside the document reading column. No unrelated OS notification. All important content fits cleanly in the canvas, preserve margins, do not crop controls, no perspective, no external caption or presentation-board headings. Output only the polished complete application screen.
```
