# 冷灰与暖砂背景素材 · 2026-09-24

两款均由内置 imagegen 编辑对应已选参考稿,重建被界面遮挡的纯背景。图片仅用于色场;文字、图标、控件仍由应用渲染。生成尺寸均为 1567×1004 PNG;运行时以 `cover / center` 铺满,滤镜与玻璃值见 [DESIGN.md](../../DESIGN.md)。

## 冷灰·凝霜

- 参考: [theme-cool-2026-09-24.png](theme-cool-2026-09-24.png)
- 输出: [cool-field.png](../../src/assets/cool-field.png)
- 完整提示词:

```text
Use case: precise-object-edit
Asset type: full-bleed raster background for an existing desktop app, landscape about 1568×1004.
Input image 1: edit target and exact composition reference.
Primary request: reconstruct ONLY the underlying cold gray-blue atmospheric background from this UI mockup. Remove every UI element completely: all text, titlebar, sidebar, cards, panes, outlines, buttons, icons, bars and shadows belonging to the UI. Seamlessly inpaint the areas they covered.
Invariants: preserve the visible background cloud positions, irregular forms, brightness and restrained color depth as closely as possible. The top center has a deeper slate gray-blue cloud, upper left and left edge are lighter icy pearl blue; the middle and lower right have soft uneven gray-blue and pale blue cloud masses, with subtle alternating light and dark pools. Continue this organically into the areas formerly covered by UI.
Style: extremely defocused smooth cloudy light, tactile frosted atmospheric color field, low frequency irregular layered forms with softly feathered edges. This is an abstract background texture, not a UI rendering.
Palette: muted steel gray-blue, powder blue, icy blue-white; match reference saturation and brightness faithfully.
Constraints: pure opaque full-frame background, no text, no symbols, no UI, no frame, no card-shaped remnants, no straight panel seams, no glows or streaks, no grain/noise, no sharp cloud edges, no vivid saturated blue, no uniform linear gradient.
```

## 暖砂·柔雾

- 参考: [theme-warm-2026-09-24.png](theme-warm-2026-09-24.png)
- 输出: [warm-field.png](../../src/assets/warm-field.png)
- 完整提示词:

```text
Use case: precise-object-edit
Asset type: pure warm frosted-glass background field for a desktop app, landscape approximately 1568 x 1004.
Input image 1 is the exact EDIT TARGET and background reconstruction reference. Remove ALL interface content: every text label, icon, logo, chart, navigation rail, top bar, card, panel, border, button, row, and shadow belonging to those objects. Reconstruct the complete underlying abstract background where those objects were, preserving the visible background's existing mist placement and brightness as closely as possible.
Preserve: the original very low saturation warm ivory, warm sandy grey, pale peach, and small neutral grey areas; the soft defocused cloudy transitions; the top-right pale peach; gentle grey-beige center; interleaving warm white, pale peach, and grey clouds through the right middle, lower right and bottom.
Fill the full canvas edge to edge with only that soft abstract mist field. It should look almost neutral, luminous, satin-soft and spatially varied, with several broad irregular overlapping out-of-focus clouds and warm/cool tonal fluctuations inherited from the reference.
Avoid: a uniform creamy yellow wash, a simple orange gradient, strong saturation, diagonal stripes, beams, grain, noise, particles, recognizable objects, text, UI remnants, rectilinear panel outlines, borders, vignettes. No new elements. Output only the reconstructed background image.
```
