export interface ThinkingTiming { thinkingMs?: number; thinkingStartedAt?: number; }

export function thinkingElapsedMs(timing: ThinkingTiming, now = Date.now()): number {
  return (timing.thinkingMs ?? 0) + (timing.thinkingStartedAt === undefined ? 0 : Math.max(0, now - timing.thinkingStartedAt));
}

export function recordThinkingPhase(timing: ThinkingTiming, active: boolean, now = Date.now()): void {
  if (active) {
    timing.thinkingMs ??= 0;
    timing.thinkingStartedAt ??= now;
  } else if (timing.thinkingStartedAt !== undefined) {
    timing.thinkingMs = thinkingElapsedMs(timing, now);
    delete timing.thinkingStartedAt;
  }
}
