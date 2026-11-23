export const BOT_SPLIT_MIN_WIDTH = 340;
export const BOT_SPLIT_BASE_MAX_WIDTH = 560;

const WIDE_WORKSPACE_MIN_WIDTH = 600;
// Expanded contacts, the left inset, the two panel gaps and the right inset.
const WIDE_SHELL_RESERVED_WIDTH = 208 + 10 + 10 + 10 + 12;

export function botSplitWidthLimit(viewportWidth: number): number {
  return Math.max(BOT_SPLIT_BASE_MAX_WIDTH, viewportWidth - WIDE_SHELL_RESERVED_WIDTH - WIDE_WORKSPACE_MIN_WIDTH);
}
