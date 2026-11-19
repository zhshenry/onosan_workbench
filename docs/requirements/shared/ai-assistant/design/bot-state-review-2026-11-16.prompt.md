# Bot 缺失状态高保真生成记录

日期：2026-11-16。工具：内置 ImageGen。用途：六个同一方案的状态评审，不是互斥方案；生成时尚待用户确认，不涉及应用代码改造。用户随后已确认作为开发基线，记录见[状态稿](bot-state-review-2026-11-16.md)。全图为不透明背景，保留原始像素尺寸，不裁切或拉伸。

主参考图已目视检查；两张旧浮动图只提供胶囊、输入、答复和任务详情关系，不沿用旧身份行或资料入口。当前日期锚点为 2026-11-16 周一，提醒示例为 11-20 周五 09:00；内容及已接入能力均是方案示意，不是实际运行回执。

## Bot 名片展开

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`

完整指令：

```text
Use case: ui-mockup. Create a realistic production-quality high-fidelity desktop UI screenshot, a single coherent state of the existing OnO Bot Workbench, not a collage, no option labels, no explanatory annotations outside the application.
Target dimensions: 1544 x 1018 landscape, matching the attached reference aspect ratio. Keep natural proportions and sharply readable Simplified Chinese Microsoft YaHei-like typography; no warped screen or device frame.
Actual date anchor: 2026-11-16 Monday. The fictional UI date is "11月16日 周一"; the task's upcoming reminder is "11月20日 周五 09:00". This is illustrative mock data, not actual execution.
Visual language: use attached classic navigation screenshot as the exact design reference: warm beige afternoon window shadows, translucent ivory glass shells, white hairline borders, large soft radii, calm shadows, black readable text, cobalt blue selected controls. Preserve the single continuous full-width top horizontal capsule and the separate nearly full-height left vertical capsule, both inset from window edges and disconnected from each other. Do NOT split the top bar into four capsules.
Topbar: circular OnO logo and nav toggle on left; calendar/date and todo 2/8 in center; original utility icons and account avatar followed by minimize/maximize/close on right, in one long capsule.
Left capsule: seven contacts in order: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试; 工具助理 / 小工具. Preserve the source avatars for the first six; a simple pale teal toolkit avatar for 工具助理. Settings stays at bottom inside sidebar. Names and labels crisp. No bot identity strip above main panels. Preserve business-page title and action headers inside their existing shells.
Respect the source's typography, toolbar icon family, proportions and restraint. Do not introduce dashboard metrics, fake permission toggles, new navigation sections, development jargon, arbitrary features, extra per-row cards, status badges everywhere, or a white film over the whole reading area. Overlay panels must be sufficiently opaque to prevent underlying glyphs showing through. One primary action per focused surface.
STATE: BOT CONTACT POPOVER.
Use the attached classic screenshot as the base and keep the current parallel layout, with 小墨 selected, chat panel at x≈256–764 and native article workspace x≈774–1536 starting immediately below the topbar at y≈100. Chat header keeps "对话" left and "并排", "任务", "交付件" on right. Article title "让 AI 成为日常工作的好搭档" and existing editor remain in place.
Show a compact anchored popover opened by the independent circled information icon beside 小墨. Put the popover beside the contact around x≈242,y≈295,width≈365,height≈460. Its pointer/position should clearly connect to the 小墨 info icon. It overlays the left part of chat only; it does not shift panels, alter selection, or add an identity row. Opaque warm-white glass face, gentle elevation, clean padding.
Popover content hierarchy:
avatar plus "小墨", small subtitle "自媒体", close ×;
section "职责" with "文章整理、改稿与发布协作";
section "工作说明" with two short readable lines "保留原意，先给修改建议。" and "发布前由你确认。";
section "已接入能力", unboxed compact rows "稿件读取", "修改建议", "跨 Bot 协作";
a quiet row "记忆" and "3 条 ›";
one blue primary button "编辑资料" at the bottom.
All other page content remains the same ongoing article-editing and calendar coordination task, with status waiting for calendar review, never falsely showing the reminder as created.
```

## Bot 资料编辑

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`

完整指令：

```text
Use case: ui-mockup. Create a realistic production-quality high-fidelity desktop UI screenshot, a single coherent state of the existing OnO Bot Workbench, not a collage, no option labels, no explanatory annotations outside the application.
Target dimensions: 1544 x 1018 landscape, matching the attached reference aspect ratio. Keep natural proportions and sharply readable Simplified Chinese Microsoft YaHei-like typography; no warped screen or device frame.
Actual date anchor: 2026-11-16 Monday. The fictional UI date is "11月16日 周一"; the task's upcoming reminder is "11月20日 周五 09:00". This is illustrative mock data, not actual execution.
Visual language: use attached classic navigation screenshot as the exact design reference: warm beige afternoon window shadows, translucent ivory glass shells, white hairline borders, large soft radii, calm shadows, black readable text, cobalt blue selected controls. Preserve the single continuous full-width top horizontal capsule and the separate nearly full-height left vertical capsule, both inset from window edges and disconnected from each other. Do NOT split the top bar into four capsules.
Topbar: circular OnO logo and nav toggle on left; calendar/date and todo 2/8 in center; original utility icons and account avatar followed by minimize/maximize/close on right, in one long capsule.
Left capsule: seven contacts in order: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试; 工具助理 / 小工具. Preserve the source avatars for the first six; a simple pale teal toolkit avatar for 工具助理. Settings stays at bottom inside sidebar. Names and labels crisp. No bot identity strip above main panels. Preserve business-page title and action headers inside their existing shells.
Respect the source's typography, toolbar icon family, proportions and restraint. Do not introduce dashboard metrics, fake permission toggles, new navigation sections, development jargon, arbitrary features, extra per-row cards, status badges everywhere, or a white film over the whole reading area. Overlay panels must be sufficiently opaque to prevent underlying glyphs showing through. One primary action per focused surface.
STATE: EDIT BOT PROFILE MODAL.
Use the attached classic screenshot as the base, retaining the parallel chat and article workspace, selected 小墨 and the seven-contact sidebar. Show a centered edit-profile modal above a lightly dimmed recognizable background. Natural modal size about 630 x 760 at x≈450,y≈132, fully visible with comfortable margins, clearly opaque enough for crisp text. This is one screen, not a collection of modal variants.
Modal title "编辑 Bot 资料" with close ×. Top identity area has the source blue 小墨 avatar, a small "更换头像" secondary link, and "小墨 · 自媒体".
Make a clean single-column form; avoid cards within the modal:
label "名称", one-line field value "小墨";
label "职责", one-line field value "文章整理、改稿与发布协作";
label "工作说明", small helper "决定它如何协助你", multiline field containing exactly:
"保留原意，先给修改建议。"
"需要日程安排时，与小历协作。"
"发布前由我确认。"
Below, a low-emphasis read-only line "已接入能力：稿件读取、修改建议、跨 Bot 协作" with no permission toggles or edit switches.
A simple separator and a row "记忆" with "查看与管理  ›", not a full memory editor.
Footer aligned right with secondary "取消" and blue primary "保存". There is no permanent success banner, no developer information, no runtime identifiers or source code. Show populated editing state only, not a conflict/error variant. Modal text should be sharper and more prominent than the dimmed background. Preserve title cards and original controls behind it.
```

## 交付件列表展开

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`

完整指令：

```text
Use case: ui-mockup. Create a realistic production-quality high-fidelity desktop UI screenshot, a single coherent state of the existing OnO Bot Workbench, not a collage, no option labels, no explanatory annotations outside the application.
Target dimensions: 1544 x 1018 landscape, matching the attached reference aspect ratio. Keep natural proportions and sharply readable Simplified Chinese Microsoft YaHei-like typography; no warped screen or device frame.
Actual date anchor: 2026-11-16 Monday. The fictional UI date is "11月16日 周一"; the task's upcoming reminder is "11月20日 周五 09:00". This is illustrative mock data, not actual execution.
Visual language: use attached classic navigation screenshot as the exact design reference: warm beige afternoon window shadows, translucent ivory glass shells, white hairline borders, large soft radii, calm shadows, black readable text, cobalt blue selected controls. Preserve the single continuous full-width top horizontal capsule and the separate nearly full-height left vertical capsule, both inset from window edges and disconnected from each other. Do NOT split the top bar into four capsules.
Topbar: circular OnO logo and nav toggle on left; calendar/date and todo 2/8 in center; original utility icons and account avatar followed by minimize/maximize/close on right, in one long capsule.
Left capsule: seven contacts in order: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试; 工具助理 / 小工具. Preserve the source avatars for the first six; a simple pale teal toolkit avatar for 工具助理. Settings stays at bottom inside sidebar. Names and labels crisp. No bot identity strip above main panels. Preserve business-page title and action headers inside their existing shells.
Respect the source's typography, toolbar icon family, proportions and restraint. Do not introduce dashboard metrics, fake permission toggles, new navigation sections, development jargon, arbitrary features, extra per-row cards, status badges everywhere, or a white film over the whole reading area. Overlay panels must be sufficiently opaque to prevent underlying glyphs showing through. One primary action per focused surface.
STATE: DELIVERABLES OPEN INSIDE THE CHAT PANEL.
Use the attached classic screenshot as the exact base. Keep 小墨 selected and the seven-contact sidebar. Keep chat panel at x≈256–764 and native workspace at x≈774–1536, both starting under the topbar. Do not add a permanent fourth column or move the deliverables button to the workspace.
Keep top chat header "对话" and its three buttons "并排", "任务", "交付件"; highlight "交付件" as the current view. Under that header show a subtle "‹ 返回对话" control, then title "交付件" and small count "3".
Replace the messages/composer region in this same chat panel with one clean continuous list of three saved outputs, not three floating cards. Use small file icons, titles, muted metadata and dividers:
Selected first row light blue:
"文章改稿.md"
"Markdown · 小墨 · 14:11"
"来源：整理文章与发布提醒"
Second row:
"发布摘要.txt"
"文本 · 小墨 · 14:11"
"来源：整理文章与发布提醒"
Third row:
"配图建议.md"
"Markdown · 小墨 · 14:12"
"来源：整理文章与发布提醒"
Below selected item or at list footer, a quiet link "查看来源任务 ›". Leave intentional whitespace. No upload button, search dashboard, input materials or memory records in this list. The chat composer is hidden while viewing this list; returning to chat restores it.
Right native workspace previews the selected saved "文章改稿.md" in its existing shell, with a compact title row "文章改稿.md" and "打开文件" button. Show the source article heading "让 AI 成为日常工作的好搭档", a few legible paragraphs matching the original article, and a small line "小墨生成 · 14:11". Read-only preview, not a second file browser. Do not show publication as completed or add a "资料" button.
Focus on a calm list-to-preview workflow with obvious provenance, well-spaced Chinese labels and no visual crowding.
```

## 浮动助手收起

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`
- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-floating-collapsed-windowlight-afternoon-2026-11-15-v1.png`

完整指令：

```text
undefined
```

## 浮动助手展开

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`
- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-floating-expanded-windowlight-afternoon-2026-11-15-v1.png`

完整指令：

```text
Use case: ui-mockup. Create a realistic production-quality high-fidelity desktop UI screenshot, a single coherent state of the existing OnO Bot Workbench, not a collage, no option labels, no explanatory annotations outside the application.
Target dimensions: 1544 x 1018 landscape, matching the attached reference aspect ratio. Keep natural proportions and sharply readable Simplified Chinese Microsoft YaHei-like typography; no warped screen or device frame.
Actual date anchor: 2026-11-16 Monday. The fictional UI date is "11月16日 周一"; the task's upcoming reminder is "11月20日 周五 09:00". This is illustrative mock data, not actual execution.
Visual language: use attached classic navigation screenshot as the exact design reference: warm beige afternoon window shadows, translucent ivory glass shells, white hairline borders, large soft radii, calm shadows, black readable text, cobalt blue selected controls. Preserve the single continuous full-width top horizontal capsule and the separate nearly full-height left vertical capsule, both inset from window edges and disconnected from each other. Do NOT split the top bar into four capsules.
Topbar: circular OnO logo and nav toggle on left; calendar/date and todo 2/8 in center; original utility icons and account avatar followed by minimize/maximize/close on right, in one long capsule.
Left capsule: seven contacts in order: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试; 工具助理 / 小工具. Preserve the source avatars for the first six; a simple pale teal toolkit avatar for 工具助理. Settings stays at bottom inside sidebar. Names and labels crisp. No bot identity strip above main panels. Preserve business-page title and action headers inside their existing shells.
Respect the source's typography, toolbar icon family, proportions and restraint. Do not introduce dashboard metrics, fake permission toggles, new navigation sections, development jargon, arbitrary features, extra per-row cards, status badges everywhere, or a white film over the whole reading area. Overlay panels must be sufficiently opaque to prevent underlying glyphs showing through. One primary action per focused surface.
STATE: FLOATING ASSISTANT EXPANDED WITH RESPONSE ABOVE THE INPUT.
Image 1 is the exact primary style/layout-shell reference for classic long-capsule navigation and headerless main content. Image 2 is ONLY the old interaction reference for a floating reply above an input, and an optional task sidebar. Do NOT inherit image 2's extra Bot identity strip, segmented topbar, separate settings capsule or "资料" button.
Keep the main geometry of the new collapsed state: topbar single long capsule, seven-contact full-height sidebar with 小墨 selected, article workspace from x≈256 to x≈1164 and task-details panel from x≈1174 to x≈1536, panels starting at y≈100 immediately below the topbar. NO permanent center chat column. No Bot identity row above the article.
Native article workspace remains visible with its title "工作区", tabs "博客编辑", "图文发布", "我的小红书", save indicator and "发布" action, article "让 AI 成为日常工作的好搭档", editor toolbar, highlighted suggested opening, and readable paragraphs.
Right task panel remains outside overlays and entirely readable: "任务详情"; "整理文章与发布提醒"; "改稿建议已就绪 · 等待日程核对"; "改稿" with summary "保留原意，调整开头与段落顺序。"; "发布提醒" with "11月20日 周五 09:00", blue 小墨 → purple 小历; "小历：正在核对日程。"; bottom link "协作记录 ›". Do not mark reminder created or publication completed.
Replace the collapsed bottom capsule with exactly TWO vertically stacked floating surfaces INSIDE the article workspace, centered around x≈710:
1. Reply surface approx x≈425,y≈535,width≈570,height≈290. Opaque warm-white face with subtle glass edge, blocking underlying glyphs. Compact header blue 小墨 avatar + "小墨" + "14:11", right down-chevron to collapse reply alone. Body title "改稿建议已准备", short text "保留了原意，调整了开头和段落顺序。"; separator; "发布提醒 · 11月20日 周五 09:00"; "小历正在核对日程，确认后再安排。"; bottom blue primary "查看改稿" and secondary "协作记录 ›".
2. Input surface approx x≈425,y≈837,width≈570,height≈145. Top small reply target "回复：整理文章与发布提醒", top right horizontal collapse line and separate ellipsis menu control. Editable area with placeholder "继续和小墨聊…". Bottom attachment plus, microphone, compact "当前模型" selector and blue send icon. A quiet "完整对话 ↗" link is available without creating another toolbar. Mode/tasks/交付件 are in the ellipsis menu (closed in this state), no outdated "资料" label.
Keep the two surfaces separated by a narrow gap, visually subordinate to native work, and contained within the article panel so they do not cover sidebar/task details or overlap window controls. No text should show through the overlays. One editable input only. This is a single full-screen state, not a before/after collage.
```

## 灵动岛总 Bot 对话初稿

实际图片输入：

- `C:/Myself/vibe_coding/onosan_workbench/docs/requirements/shared/ai-assistant/design/bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png`

完整指令：

```text
Use case: ui-mockup. Create a realistic production-quality high-fidelity desktop UI screenshot, a single coherent state of the existing OnO Bot Workbench, not a collage, no option labels, no explanatory annotations outside the application.
Target dimensions: 1544 x 1018 landscape, matching the attached reference aspect ratio. Keep natural proportions and sharply readable Simplified Chinese Microsoft YaHei-like typography; no warped screen or device frame.
Actual date anchor: 2026-11-16 Monday. The fictional UI date is "11月16日 周一"; the task's upcoming reminder is "11月20日 周五 09:00". This is illustrative mock data, not actual execution.
Visual language: use attached classic navigation screenshot as the exact design reference: warm beige afternoon window shadows, translucent ivory glass shells, white hairline borders, large soft radii, calm shadows, black readable text, cobalt blue selected controls. Preserve the single continuous full-width top horizontal capsule and the separate nearly full-height left vertical capsule, both inset from window edges and disconnected from each other. Do NOT split the top bar into four capsules.
Topbar: circular OnO logo and nav toggle on left; calendar/date and todo 2/8 in center; original utility icons and account avatar followed by minimize/maximize/close on right, in one long capsule.
Left capsule: seven contacts in order: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试; 工具助理 / 小工具. Preserve the source avatars for the first six; a simple pale teal toolkit avatar for 工具助理. Settings stays at bottom inside sidebar. Names and labels crisp. No bot identity strip above main panels. Preserve business-page title and action headers inside their existing shells.
Respect the source's typography, toolbar icon family, proportions and restraint. Do not introduce dashboard metrics, fake permission toggles, new navigation sections, development jargon, arbitrary features, extra per-row cards, status badges everywhere, or a white film over the whole reading area. Overlay panels must be sufficiently opaque to prevent underlying glyphs showing through. One primary action per focused surface.
STATE: DESKTOP ISLAND SMALL WINDOW CHATTING WITH ONO COORDINATOR, SAME CONVERSATION AS HOME.
Use the attached OnO classic screenshot as visual reference. Produce one desktop composition 1544 x 1018 with the main application visible and ONE independent small assistant window floating over its right side. This is a desktop companion window, NOT a phone notch, NOT mobile UI. No phone bezel, no diagram arrows, no explanatory captions.
Keep the classic one horizontal top capsule and vertical sidebar, seven contacts. In this scene select "Ono / 总 Bot · 总台". Main content still begins under the topbar, with main chat center-left and the native "总台" workspace on right. Keep the total desk simple: a business title and a short current-task list, not a redesigned dashboard.
The main chat shows a user message "帮我整理文章，周五上午提醒我发布。" and Ono response "已交给小墨整理文章，小历正在核对日程。" with one compact task row "整理文章与发布提醒" / "等待日程核对". Main chat header remains 对话 with mode/tasks/交付件. In the main composer area show the draft preview "把发布时间改成周五上午十点。" and a quiet state "正在灵动岛输入", with a small secondary text control "在此继续输入". This main composer is visibly inactive/read-only and has no enabled send button. No error warning or scary lock graphic.
The independent floating island conversation window sits on the right around x≈1010,y≈185,width≈500,height≈730, retaining outside margins. Rounded opaque ivory glass with a defined edge and subtle shadow, independent from the app workspace, not a browser popup. It must not cover the main chat or nav.
Small-window header has the SAME circular blue Ono avatar, title "Ono", subtitle "总 Bot · 总台", a pin icon and close ×. Below header keep tabs "对话" (active) and "消息" (inactive) and a quiet "打开完整对话 ↗" action.
Inside the small window repeat the SAME two messages as the visible main chat (same texts, no different task history), with smaller timestamps 14:10 and 14:11 and a slim task link. Clear airy reading area.
At bottom of island show the active input with identical draft "把发布时间改成周五上午十点。", a visible caret, compact attachment and microphone icons, model label "当前模型", and the ONLY enabled blue send button in this two-window conversation. Include a small reply target "回复：整理文章与发布提醒".
This scene makes it obvious the island speaks to Ono directly and owns current input; moving back uses "在此继续输入". Do not show database IDs, leases, technical implementation text, all-bot permissions, duplicate live inputs or an extra Island Bot contact.
```

## 灵动岛定向校正

初稿目视发现 Ono 消息使用小墨头像，且总台残留自媒体页签和文章标题。保留双窗口和输入交接结构，进行一次定向编辑；初稿保留在生成目录，最终采用校正稿。

实际图片输入：`C:\Users\henry\.codex\generated_images\01a1d374-1476-71a3-b6f1-45afb2903318\exec-d14fb3e4-4e28-4737-b50b-f29d6715d49a.png`

完整指令：

```text
undefined
```
