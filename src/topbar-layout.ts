// Places the schedule + todo capsule group in the horizontal center of the
// topbar. The right cluster's real width is reserved on both sides so the
// group does not cover window controls. A single schedule chip may shrink its
// title down to a readable floor; the group shifts left only when that floor
// is wider than the centered band.
export const TOPBAR_CLUSTER_GAP = 12;
export const TOPBAR_TITLE_FLOOR = 24;

export interface TopbarCapsuleBox {
  barWidth: number;
  padLeft: number;
  /** Distance from the topbar's right border edge to the left edge of .tb-right. */
  rightInset: number;
  /** Unconstrained width of the capsule group, excluding popovers. */
  naturalWidth: number;
  /**
   * Minimum width that keeps an empty pair, or a single schedule date, intact.
   * Zero lets the group stop at the centered band (several chips scroll).
   */
  readableWidth: number;
  gap?: number;
}

export interface TopbarCapsulePlacement {
  width: number;
  /** Extra leftward shift after translateX(-50%). Zero keeps the true center. */
  nudge: number;
}

export function topbarCapsulePlacement(box: TopbarCapsuleBox): TopbarCapsulePlacement {
  const gap = box.gap ?? TOPBAR_CLUSTER_GAP;
  const side = Math.max(0, box.rightInset) + gap;
  // Negative when the right cluster is wider than half the bar. Keep the sign
  // so the nudge can still park the group against that cluster.
  const centeredSpan = box.barWidth - 2 * side;
  const freeWidth = Math.max(0, box.barWidth - side - Math.max(0, box.padLeft));
  const natural = Math.max(0, box.naturalWidth);
  const readable = Math.min(natural, Math.max(0, box.readableWidth));
  let width = Math.min(natural, Math.max(centeredSpan, readable));
  if (width <= 0 && natural > 0) width = Math.min(natural, freeWidth);
  width = Math.min(Math.max(width, 0), freeWidth);
  const nudge = width > centeredSpan ? (width - centeredSpan) / 2 : 0;
  return { width, nudge };
}

export function applyTopbarCapsulePlacement(bar: HTMLElement): void {
  const middle = bar.querySelector<HTMLElement>('.tb-middle');
  const right = bar.querySelector<HTMLElement>('.tb-right');
  if (!middle || !right) return;
  const barRect = bar.getBoundingClientRect();
  if (barRect.width < 1) return;

  const previousMax = middle.style.maxWidth;
  middle.style.maxWidth = 'none';
  const natural = middle.getBoundingClientRect().width;
  if (natural < 1) {
    middle.style.maxWidth = previousMax;
    return;
  }

  const chips = [...middle.querySelectorAll<HTMLElement>('.schip')].filter((chip) => chip.getClientRects().length > 0);
  let readable = 0;
  if (chips.length <= 1) {
    const chip = chips[0];
    const title = chip?.querySelector<HTMLElement>('.n');
    const titleWidth = title ? title.getBoundingClientRect().width : 0;
    const track = chip?.closest<HTMLElement>('.sched-track');
    // The track can be wider than a max-width-capped chip. That slack collapses
    // before the title does, so it is not part of the readable floor.
    const slack = track && chip ? Math.max(0, track.getBoundingClientRect().width - chip.getBoundingClientRect().width) : 0;
    const excess = Math.max(0, titleWidth - TOPBAR_TITLE_FLOOR) + slack;
    readable = Math.max(0, natural - excess);
  }

  const padLeft = Number.parseFloat(getComputedStyle(bar).paddingLeft) || 0;
  const placement = topbarCapsulePlacement({
    barWidth: barRect.width,
    padLeft,
    rightInset: barRect.right - right.getBoundingClientRect().left,
    naturalWidth: natural,
    readableWidth: readable,
  });
  const track = middle.querySelector<HTMLElement>('.sched-track');
  // display:none while the window is ≤1180. An inline pixel cap from that
  // measurement stays in force for the first frame after the track returns,
  // and a flex item with a 0 floor collapses to an empty box.
  const trackShown = !track || getComputedStyle(track).display !== 'none';
  middle.style.setProperty('--tb-middle-cap', `${placement.width}px`);
  middle.style.maxWidth = trackShown ? `${placement.width}px` : '';
  middle.style.transform = placement.nudge > 0.5 ? `translateX(calc(-50% - ${placement.nudge}px))` : '';
}
