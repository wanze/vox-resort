export interface Tap {
  readonly x: number;
  readonly y: number;
  readonly at: number;
}

// Android's own double-tap window; the slop is wider than a single tap's, as the second finger
// rarely lands on the first one's spot.
export const DOUBLE_TAP_MS = 300;
export const DOUBLE_TAP_SLOP = 40;

export function isDoubleTap(previous: Tap | null, next: Tap): boolean {
  if (!previous) return false;
  const apart = next.at - previous.at;
  if (apart < 0 || apart > DOUBLE_TAP_MS) return false;
  return Math.hypot(next.x - previous.x, next.y - previous.y) <= DOUBLE_TAP_SLOP;
}
