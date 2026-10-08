export interface Offset {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

const MARGIN = 8;

const keep = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(value, Math.max(low, high)));

// `box` is where the card stood at `from`; it is moved by the difference and kept on screen, its
// top-left winning on a screen too small for all of it.
export function keptOnScreen(
  wanted: Offset,
  from: Offset,
  box: Rect,
  view: { readonly width: number; readonly height: number },
): Offset {
  return {
    x: keep(wanted.x, from.x + MARGIN - box.left, from.x + view.width - MARGIN - box.right),
    y: keep(wanted.y, from.y + MARGIN - box.top, from.y + view.height - MARGIN - box.bottom),
  };
}
