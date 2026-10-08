// A drag's money still visibly counts down, while React renders the HUD four times a second
// instead of once a frame.
const REPORT_GAP_MS = 250;

export function reportDue(
  lastMs: number | null,
  nowMs: number,
  gapMs: number = REPORT_GAP_MS,
): boolean {
  return lastMs === null || nowMs - lastMs >= gapMs;
}
