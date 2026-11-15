# 并排 Bot 工作台移除身份行 · 生成提示词

日期：2026-11-15。使用内置 ImageGen，透明背景关闭。以下为两次实际调用的完整提示词；结果属于设计稿。

## 布局修订

实际输入：

- 编辑目标：`C:/Users/henry/.codex/generated_images/01a1d374-1476-71a3-b6f1-45afb2903318/exec-7b47abe1-6f78-486d-b0dc-132efeefe6ca.png`（项目中的并排 v1）。
- 定位参考：`C:/Users/henry/AppData/Local/Temp/codex-clipboard-4c308149-1f5c-411a-98d4-70500a26daa8.png`（用户圈定区域的截图）。

输出：`exec-fd1bb6d4-fb82-4305-826a-5a47f49b4944.png`，用作下一步编辑输入，未替代项目中的最终图。

```text
Use case: precise-object-edit
Asset type: high-fidelity desktop app UI mockup, Chinese OnO Bot workbench.
Primary request: surgically revise the attached selected parallel-mode screen to REMOVE THE ENTIRE SEPARATE BOT IDENTITY AND MODE TOOLBAR ROW between the global topbar and the two content panels. Recover that vertical space for the conversation and business workspace. This is a targeted revision of the selected design, not a new design direction.

Input images:
1. The full 1568 x 1003 OnO screen is the EDIT TARGET. Preserve its appearance, scene and all unrelated structure.
2. The 456 x 66 crop is ONLY an identification guide to the exact identity/control strip the user wants removed. Do not paste this crop anywhere in the result.

Target dimensions: match the full reference 1568 x 1003 landscape desktop canvas and its aspect ratio. Do not stretch or warp text or icons. Output one full app screenshot, no presentation board, no annotations, no inset screenshots.

Required geometry:
- Keep the four compact floating topbar groups exactly where they are: logo/nav toggle, centered calendar/todo, tools/avatar, window controls. Topbar bottom is around y=74.
- Eliminate the separate large avatar, "小墨", "文章与内容负责人", and the standalone "并排 / 任务 / 资料" pill at y=100..163.
- Move the TOP edges of BOTH conversation and workspace panels from y=185 up to about y=94. Both top edges must align immediately below the global topbar with an approximately 20px gap. Their BOTTOM edges remain around y=976. Keep the conversation x=260..775, workspace x=784..1560; keep current gutter and width ratio. Both panels gain actual usable vertical height. Do not leave an empty header band.
- Preserve the left Bot contact navigation shell and fixed bottom-left "设置", including all six names/avatars/responsibility labels and selected 小墨 state. Do not expand the navigation to fill the screen. Use the same recognizable blue 小墨 avatar everywhere.
- In the selected 小墨 contact row, add a small quiet circled-i profile button at its far right. This is the explicit entry for Bot name, responsibility, instructions and configuration; row body remains the workbench selection target. The profile popover is CLOSED in this default screenshot.
- Keep a SINGLE compact built-in conversation panel title row, at the new panel top: "对话" on the left; on the same line at the right a small "并排⌄" mode dropdown followed by a "任务" control with a checklist icon. These controls replace the removed outer toolbar; do not add another row.
- Keep the workspace title "工作区" in its existing built-in panel title row at the new top; place a small "资料" control with a folder icon at the far right of THAT SAME ROW. The existing module tabs, save status and publish action stay immediately beneath, inside the workspace. Do not create a new strip above the panel.

Content:
Preserve the article editor, tabs "博客编辑 / 图文发布 / 我的小红书", save timestamp, 发布 button, article title "让 AI 成为日常工作的好搭档", rich text toolbar, revision-highlight strip and prose.
Preserve the ongoing chat asking to revise the article and remind about publishing Friday, assistant revision reply, inline task "整理文章与发布提醒", 小墨 → 小历 handoff, 查看改稿 and 协作记录, and 小历's message that it is checking the calendar.
Preserve only one input composer, anchored at the bottom of the conversation. Keep the regained height as usable reading space, not a new oversized heading.
Current date anchor: 2026-11-15, Sunday. Preserve topbar "11月15日 周日". The requested Friday reminder means 2026-11-20 09:00. The task remains waiting for calendar verification, not successfully registered and not published.

Visual invariants:
Use precisely the source's warm window-shadow afternoon background, blue accents, suspended glass navigation, high-opacity reading areas, fine bright glass edges, restrained shadows, typography and radii.
Glass belongs to main shells. Chat/task subsections use simple separators and subtle flat tints; no extra nested glass cards.
Chinese text must be clean and readable with stable hierarchy. Preserve the source avatar/icon designs as closely as possible.
No duplicate Bot identity banner, no giant title, no full-width second topbar, no profile dialog open in this frame, no new dashboard content or features, no decorative mockup frame.
Create realistic, production-quality UI with clear hierarchy and purposeful spacing, focused on the same chat-and-article workflow.
```

## 联系人导航位置校正

实际输入：上一步输出作为编辑目标；并排 v1 作为原导航尺寸与位置参考。

最终输出：`exec-e73f7b6b-1824-4588-acdb-79cb4406e551.png`。项目副本：[并排 v2](bot-parallel-windowlight-afternoon-2026-11-15-v2.png)。

```text
Use case: precise-object-edit
Asset type: final high-fidelity OnO desktop Bot workbench revision.
Target dimensions: 1568 x 1003, matching both references. Output ONE full app screenshot.

Input 1 is the EDIT TARGET: the updated screen with conversation/workspace beginning near y=103 and no outer Bot identity strip. Keep the entire content at x>=260 EXACTLY as in input 1: panel geometry, headings, mode and task buttons, resources control, conversation, article, input, whitespace and all text. Keep its topbar, window-shadow background and bottom-left Settings unchanged.
Input 2 is a SUPPORTING REFERENCE for the ORIGINAL LEFT NAVIGATION HEIGHT AND POSITION ONLY. It has the older unwanted Bot identity strip: DO NOT restore any part of that strip or move the main panels down.

Change ONLY the left floating Bot contact navigation, confined to x=8..250 and y=100..875.
- It has accidentally grown upward to y=103 in input 1. Restore the compact original navigation shell from input 2: top near y=185, bottom near y=870, width x=8..250 and original round corners. Background window shadows must show in the restored empty area above the nav, y=103..184.
- Move the six contact rows back to their exact original positions from input 2: Ono around y=240, 小历 around y=320, selected 小墨 around y=400, 游伴 around y=475, 小舟 around y=555, 小测 around y=630. Preserve all names, blue/purple avatars, domain labels, selection tint, original glass and row spacing.
- KEEP the new small circled-i profile button at the far right of the selected 小墨 row, centered around x=215,y=400. This button is the Bot profile entry. Profile popover remains closed.
- Leave fixed bottom-left Settings at its original y=915..976. Do not join navigation to topbar or Settings.
All other pixels and content must follow input 1. The two large work panels remain top-aligned near y=103 directly below the global topbar. No outer avatar/title/mode toolbar row is permitted.
Date context remains 2026-11-15 Sunday; Friday reminder is still pending calendar verification. No new features, words, inset callouts or presentation framing. This is a surgical geometry correction, not restyling.
```
