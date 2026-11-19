# 会议纪要返回入口文案修订记录 v5

日期：2026-11-17。方式：内置 ImageGen 编辑。状态：设计稿，尚未实现功能。

- 最终图片：`02-meeting-minutes-v5.png`。
- 原参考：`02-meeting-minutes-v4.png`。
- 用户要求：「返回日程」改为「返回首页」。
- 位置与布局沿用v4，返回行为沿用原方案，回到日程工作台首页（日程待办总览）；本次为入口文案调整。
- 首次生成中会前说明标签出现额外变更，追加一次文字校正；最终只采用校正稿。
- 图片保持生成原尺寸，未裁切或拉伸；旧稿保留供比对。

## 返回文案编辑提示词

```text
Use case: text-localization. Edit the attached existing ONO Workbench meeting-minutes design.
Output ONE full application image at1568 x1003, original aspect ratio.
Make ONLY this exact text replacement in the blue navigation link at the TOP RIGHT OF THE LEFT SCHEDULE COLUMN:
OLD: "‹ 返回日程"
NEW: "‹ 返回首页"
The link is aroundx334–419,y198, on the same row as the black"日程" column heading.
Preserve its exact placement, blue color, font size, weight and left chevron. Only replace"日程" with"首页" inside this one return link. Do NOT change the black column title"日程", the global schedule label, search placeholder or any other occurrence of日程.
Keep EVERY OTHER pixel/composition element as close to the original as possible: unified glass workspace, left list and search, meeting title, metadata, document content, toolbar, actions, all buttons, avatars, topbar, background and framing. Do not redesign or reflow anything. No new rows, features, captions or extra images.
Current client date2026-11-17 Asia/Shanghai; preserve all existing illustrative dates and state.
Return only the complete edited application image.
```

## 会前说明文字校正提示词

```text
Use case: text-localization. Correct exactly ONE unintended text change in the attached ONO Workbench UI.
The blue return link in the upper left directory already correctly reads"‹ 返回首页": KEEP IT EXACTLY AS IS.
The small collapsible section label under the meeting date incorrectly reads"会议说明". Replace ONLY that label with its original wording"会前说明".
Exact desired text: 会前说明 (four Chinese characters: 会 / 前 / 说 / 明).
Keep the chevron before it, the summary"目标：确认纪要记录与会后跟进流程", spacing, baseline, typeface, font size, weight and color unchanged.
Do not change any other words or elements. Preserve all pixel geometry/composition, meeting title, global bars, left list, headings and note text, controls, completed/unfinished todos, frosted glass materials, ambient gradient and navigation. Do not move or add anything.
Output one complete final image, same1568 x1003 framing/aspect ratio, with both exact labels"返回首页" and"会前说明". Current date2026-11-17 Asia/Shanghai, preserve all existing illustrative dates.
No captions or comparison board.
```
