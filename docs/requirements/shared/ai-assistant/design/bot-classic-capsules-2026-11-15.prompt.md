# Bot 经典导航 · 双长胶囊修订记录

日期：2026-11-15。用户反馈：经典版顶栏和左边栏参考当前应用，改为“一横一竖两个长条胶囊”。使用内置 ImageGen，透明背景关闭，未改造应用代码。

## 实际图片输入

- 编辑目标：[经典导航 v1](bot-parallel-classic-windowlight-afternoon-2026-11-15-v1.png)，完整本地路径作为第一个 `referenced_image_paths` 输入。
- 外形参考：用户提供的当前应用截图 `C:/Users/henry/AppData/Local/Temp/codex-clipboard-302a27ef-c4fb-4381-a6fa-bd61e40b9e76.png`，作为第二个实际输入；[项目内保留副本](bot-classic-navigation-user-reference-2026-11-15.png)与原文件一致。
- 两张图片均已目视检查。第二张仅提供长胶囊外形、留边和分离关系；不复制其看板内容、收起导航状态或右侧 AI 布局。

## 输出

- [经典导航 v2 · 双长胶囊](bot-parallel-classic-windowlight-afternoon-2026-11-15-v2.png)。
- 原始文件：`C:/Users/henry/.codex/generated_images/01a1d374-1476-71a3-b6f1-45afb2903318/exec-924ce446-23c6-42e0-af4b-2090b9f6d697.png`。
- 原始输出和旧版均保留。项目副本未拉伸或裁切；实际尺寸、SHA-256 和当前版本规则见[视觉修订记录](bot-visual-revision-2026-11-15.md)。

## 完整提示词

```text
Use case: precise-object-edit.
Asset type: high-fidelity Chinese OnO desktop Bot workbench UI mockup.
Create realistic, production-quality UI with faithful typography, clear hierarchy, readable surfaces and purposeful spacing.
INPUT IMAGE 1 is the sole EDIT TARGET: the classic Bot workbench, 1544 x 1019.
INPUT IMAGE 2 is the user's ACTUAL CURRENT APP screenshot: use ONLY as reference for the TWO LONG ROUNDED NAVIGATION CONTAINERS (the top horizontal capsule and the tall left capsule), their inset margins, rounded edges and separation. Do NOT copy its dashboard content, sidebar collapsed state, right-side AI chat placement, theme, scale or text.

Target dimensions: 1544 x 1019, same canvas and aspect ratio as image 1. One complete app screenshot, no device frame, external captions, style labels, comparison collage or crop.

Make ONLY this two-container shape correction to image 1:
1. TOPBAR: turn the current full-bleed rectangular toolbar into ONE long horizontal rounded capsule inset from all window edges, like image 2. Rough bounds x=12..1532, y=12..83, fully rounded left/right ends with radius roughly 35px. The warm window-shadow wallpaper must remain visible above, below and at its ends. It is ONE continuous glass surface containing ALL existing toolbar controls: logo and navigation toggle, date and todo, tools and avatar, minimize/maximize/close. Preserve their current horizontal order and centers; shift vertically a few pixels only if needed to center them within the capsule. Do not split into four floating topbar pills.
2. LEFT NAVIGATION: turn the current edge-attached flat sidebar into ONE tall rounded capsule, inset from left, top and bottom, like the tall sidebar in image 2. Rough bounds x=8..246, y=102..1005, radius about 30px. There must be a visible wallpaper gap between this capsule and the topbar; it must not join the topbar or touch the canvas edges. Keep its near-full-height long form, NOT a shorter centered capsule.
3. KEEP the left navigation EXPANDED exactly as image 1: all six Bot avatars, names and responsibilities remain visible, in the same top-aligned positions. Do not collapse to icons-only just because image 2 is collapsed. Keep 小墨 selected and its information icon. Preserve the original left reserved width.
4. 设置 remains bottom anchored INSIDE the same tall left capsule, with its existing subtle divider. Do not detach Settings into another floating pill.
5. Give these two capsules the same frosted-glass material, subtle white rim and gentle shadow as the existing main work panels. Retain the warm afternoon window-shadow palette from image 1. Remove obsolete full-bleed flat surface outside the two capsules and restore continuous wallpaper in those margins.

STRICT INVARIANTS:
- Do not move or resize the conversation and workspace panels. Keep their top edge near y=101, bottom near y=990, shared widths and gutter.
- No extra Bot identity row or added toolbar.
- Conversation header remains 对话 with 并排, 任务, 交付件 on the same line.
- Workspace remains 工作区; tabs 博客编辑 / 图文发布 / 我的小红书; 已保存 14:11 and 发布; NO 资料 button.
- Keep the original six contacts and identities: Ono / 总 Bot · 总台; 小历 / 待办与日程; 小墨 / 自媒体; 游伴 / 游戏; 小舟 / 网页与网站; 小测 / AI 测试.
- Preserve all chat messages, task summary, 小墨 → 小历 collaboration, pending calendar verification, buttons, and single bottom-anchored message composer.
- Preserve article title 让 AI 成为日常工作的好搭档, formatting controls, blue revision highlight, paragraphs, icon details, body typography and spacing.
- Date anchor remains 2026-11-15 Sunday, visible 11月15日 周日, 待办 2/8. Friday reminder is still awaiting verification.
- Do not import the dashboard, quota cards, today's tasks, white theme, alternate model name, account data or any other content from image 2.
This is a surgical outer-shape correction: one long horizontal capsule and one tall vertical capsule around the existing classic navigation, with everything else faithfully retained.
```
