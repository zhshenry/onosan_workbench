# Bot 并排工作台 · 经典与悬浮导航生成记录

日期：2026-11-15。使用内置 ImageGen，透明背景关闭。两次独立生成均以已目视检查的[并排 v3](bot-parallel-windowlight-afternoon-2026-11-15-v3.png)为实际图片输入，使用 `referenced_image_paths` 传入完整本地路径。

两张均为「助手并排 + 强玻璃 + 窗影·午后」，仅比较导航样式，不是让用户在并排和浮动助手之间二选一。原 v3 保留，新图作为本轮评审稿。

| 导航 | 项目副本 | 原始生成文件 |
| --- | --- | --- |
| 经典 | [经典导航](bot-parallel-classic-windowlight-afternoon-2026-11-15-v1.png) | `exec-9e9a9ec3-e611-453d-a256-3c3a5582b51b.png` |
| 悬浮 | [悬浮导航](bot-parallel-floating-windowlight-afternoon-2026-11-15-v1.png) | `exec-b0c034b8-77ce-459c-a169-254966965585.png` |

原始文件位于 `C:/Users/henry/.codex/generated_images/01a1d374-1476-71a3-b6f1-45afb2903318/`。项目副本保持原始像素，未拉伸或裁切；尺寸和校验见[视觉修订记录](bot-visual-revision-2026-11-15.md)。生成结果未精确满足全部坐标约束，尤其悬浮胶囊较原 v3 收紧；不将图片尺寸差异当作实施时改变共享几何的依据。

## 经典导航 · 完整提示词

```text
Create a realistic, production-quality high-fidelity Chinese desktop UI design, faithful to the attached OnO Bot workbench screenshot. Focus on its existing article editing and Bot collaboration use case; add no new features or panels.
Use case: precise-object-edit.
Asset type: one complete desktop app high-fidelity mockup.
Input image: the supplied approved parallel v3 PNG is the actual EDIT TARGET, not merely a color inspiration.
Target dimensions: 1552 x 1013, match the supplied image's canvas and aspect ratio. No device frame, comparison collage, external title or explanatory callouts. Do not stretch, squash, crop, or warp.
Common invariants:
- Keep the same warm afternoon window-shadow background, strong frosted-glass materials, restrained blue accent, Chinese typography and icon family.
- Keep the current Bot content and six contacts: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试. 小墨 is selected and has a small info button. Same avatars.
- Keep the two main panels at their existing positions: conversation approximately x=257..768, workspace x=776..1544; both start y=103 and finish near y=985. Preserve widths, gutter, article content, editor controls, chat messages, task summary and bottom-anchored single composer.
- Conversation header has 对话 at left and 并排, 任务, 交付件 at right on ONE line. No extra Bot identity row. NO 资料 button on the workspace.
- Workspace: 工作区; 博客编辑 (selected), 图文发布, 我的小红书; 已保存 14:11; 发布. Title 让 AI 成为日常工作的好搭档, original formatting toolbar, blue inline revision highlight and existing paragraphs.
- User request 帮我整理这篇文章，周五上午提醒我发布。; 小墨 reply 改稿建议已准备，请查看右侧。已请小历核对周五日程。; task 整理文章与发布提醒 / 改稿建议已就绪 · 等待日程核对; 小墨 → 小历; 查看改稿 / 协作记录; final 小历：已收到，正在核对日程。 Preserve pending status; do not imply publishing or scheduling completed.
- Date anchor 2026-11-15 Sunday, visible 11月15日 周日; Friday is 2026-11-20. Keep original 14:10, 14:11, 14:12 times and 待办 2/8.
- Keep comfortable whitespace, legible Chinese labels, clear glass panel separation. Use spacing and subtle dividers inside existing surfaces, no extra card nesting. Main panel content must not move when navigation style changes.

Direction name: 经典导航.
Change ONLY navigation shell styling and contact placement to true CLASSIC navigation:
1. Replace the four floating top capsules with ONE continuous full-width frosted-glass top toolbar from x=0 to the right window edge, y=0 to about y=86, with a subtle bottom divider. Keep ALL topbar icons and controls at the same centers as in the reference: logo and expand icon left, centered date/todo, tools/avatar right, and minimize/maximize/close far right. Do NOT enclose those groups in separate floating capsule containers. No app name text.
2. Left navigation becomes an attached continuous vertical sidebar, approximately x=0..247, spanning from below the topbar to the bottom edge. It visually joins the application shell, with a fine right divider and no floating outer rounded capsule or detached drop shadow.
3. Align the six Bot contact rows from the top of this classic sidebar, first avatar centered about y=145; retain the original row spacing and readable labels. Selected 小墨 is a soft blue rounded row. Do not change the contact order or identity.
4. Place 设置 as a normal bottom-anchored row INSIDE the continuous sidebar, same general bottom position as the reference, separated by a subtle divider if needed; remove the detached settings pill.
5. Same sidebar reserved width and exact main content geometry as the floating reference. The main panels are still rounded strong-glass work surfaces. Classic navigation is a geometry choice, not a switch to a different theme or glass strength.
Preserve every unrelated feature and layout. Make the classic attached topbar/left sidebar visually unmistakable.
```

## 悬浮导航 · 完整提示词

```text
Create a realistic, production-quality high-fidelity Chinese desktop UI design, faithful to the attached OnO Bot workbench screenshot. Focus on its existing article editing and Bot collaboration use case; add no new features or panels.
Use case: precise-object-edit.
Asset type: one complete desktop app high-fidelity mockup.
Input image: the supplied approved parallel v3 PNG is the actual EDIT TARGET, not merely a color inspiration.
Target dimensions: 1552 x 1013, match the supplied image's canvas and aspect ratio. No device frame, comparison collage, external title or explanatory callouts. Do not stretch, squash, crop, or warp.
Common invariants:
- Keep the same warm afternoon window-shadow background, strong frosted-glass materials, restrained blue accent, Chinese typography and icon family.
- Keep the current Bot content and six contacts: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试. 小墨 is selected and has a small info button. Same avatars.
- Keep the two main panels at their existing positions: conversation approximately x=257..768, workspace x=776..1544; both start y=103 and finish near y=985. Preserve widths, gutter, article content, editor controls, chat messages, task summary and bottom-anchored single composer.
- Conversation header has 对话 at left and 并排, 任务, 交付件 at right on ONE line. No extra Bot identity row. NO 资料 button on the workspace.
- Workspace: 工作区; 博客编辑 (selected), 图文发布, 我的小红书; 已保存 14:11; 发布. Title 让 AI 成为日常工作的好搭档, original formatting toolbar, blue inline revision highlight and existing paragraphs.
- User request 帮我整理这篇文章，周五上午提醒我发布。; 小墨 reply 改稿建议已准备，请查看右侧。已请小历核对周五日程。; task 整理文章与发布提醒 / 改稿建议已就绪 · 等待日程核对; 小墨 → 小历; 查看改稿 / 协作记录; final 小历：已收到，正在核对日程。 Preserve pending status; do not imply publishing or scheduling completed.
- Date anchor 2026-11-15 Sunday, visible 11月15日 周日; Friday is 2026-11-20. Keep original 14:10, 14:11, 14:12 times and 待办 2/8.
- Keep comfortable whitespace, legible Chinese labels, clear glass panel separation. Use spacing and subtle dividers inside existing surfaces, no extra card nesting. Main panel content must not move when navigation style changes.

Direction name: 悬浮导航.
Produce the FLOATING navigation counterpart, continuing the approved v3:
1. Keep four DISTINCT floating glass topbar groups, with wallpaper gaps visible between them: compact logo+expand; date+todo; tools+avatar; Windows controls. Keep their current centers and positions. No full-width toolbar background.
2. Left Bot navigation is a separate rounded frosted-glass capsule, detached from window edges, within the same left width reservation as classic. Keep it approximately x=8..247, top y=204, bottom y=878, visually vertically centered between topbar and bottom settings. Six Bot contact rows remain in the same order and relative positions as the provided screenshot. Do not move it up to align with the main panels.
3. 设置 is a separate floating bottom-left capsule near x=15..238, y=920..985. Preserve the clear wallpaper gap above it. No full-height sidebar background joining this capsule to the topbar.
4. Preserve main panels exactly at the shared coordinates, including the 对话 header with 并排 / 任务 / 交付件, and no extra Bot identity strip or workspace 资料 button.
5. Same background, strong glass, typography, controls, content and panel sizes as the classic counterpart; differentiate ONLY the grouped floating topbar and centered detached contact capsule.
High fidelity crisp product mockup, no labels advertising the style within the app, no additional controls.
```
