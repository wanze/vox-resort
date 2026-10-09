import type { ViewMode } from './followRig';

export type SheetSwipe = 'open' | 'shut';

// Far enough that a tap which wobbles stays a tap.
export const SWIPE_PX = 24;

// Up opens and down shuts; a drag more sideways than up or down is neither.
export function swipeOf(dx: number, dy: number): SheetSwipe | null {
  if (Math.abs(dy) < SWIPE_PX || Math.abs(dy) < Math.abs(dx)) return null;
  return dy < 0 ? 'open' : 'shut';
}

// Looking through a guest's eyes is when the scene matters most, so the card gets out of the way;
// it stays as the player left it otherwise, and opening it again in first person is theirs to do.
export function collapsedOnView(
  collapsed: boolean,
  before: ViewMode | null,
  after: ViewMode | null,
): boolean {
  return after === 'first' && before !== 'first' ? true : collapsed;
}
