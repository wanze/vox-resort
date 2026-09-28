const WINDOW_IDS = [
  'build',
  'overview',
  'advice',
  'guests',
  'books',
  'camera',
  'resort',
  'saves',
  'debug',
  'inspect',
] as const;

export type WindowId = (typeof WINDOW_IDS)[number];

export interface WindowSpot {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly width: number;
  readonly height: number;
}

export interface WindowLayout {
  readonly open: readonly WindowId[];
  // Back to front. A window never raised is not in it and sits under every one that was.
  readonly stack: readonly WindowId[];
  // Only windows the player has dragged; the rest keep the stylesheet's default place.
  readonly spots: Readonly<Partial<Record<WindowId, WindowSpot>>>;
  // The window the player last opened, which may take the keyboard. Never restored, so a
  // reload does not grab the keys before anything has been clicked.
  readonly focus: WindowId | null;
}

export const DEFAULT_LAYOUT: WindowLayout = { open: ['build'], stack: [], spots: {}, focus: null };

const MARGIN = 6;
// Enough of the title bar to grab, so a window pushed off an edge can always be pulled back.
const GRIP = 44;

export function isOpen(layout: WindowLayout, id: WindowId): boolean {
  return layout.open.includes(id);
}

export function raiseWindow(layout: WindowLayout, id: WindowId): WindowLayout {
  if (layout.stack.at(-1) === id) return layout;
  return { ...layout, stack: [...layout.stack.filter((each) => each !== id), id] };
}

export function showWindow(layout: WindowLayout, id: WindowId, shown: boolean): WindowLayout {
  if (!shown) {
    if (!isOpen(layout, id)) return layout;
    const focus = layout.focus === id ? null : layout.focus;
    return { ...layout, open: layout.open.filter((each) => each !== id), focus };
  }
  const opened = isOpen(layout, id) ? layout : { ...layout, open: [...layout.open, id], focus: id };
  return raiseWindow(opened, id);
}

export function toggleWindow(layout: WindowLayout, id: WindowId): WindowLayout {
  return showWindow(layout, id, !isOpen(layout, id));
}

export function moveWindow(layout: WindowLayout, id: WindowId, spot: WindowSpot): WindowLayout {
  return { ...layout, spots: { ...layout.spots, [id]: spot } };
}

export function resetPlaces(layout: WindowLayout): WindowLayout {
  return { ...layout, stack: [], spots: {} };
}

export function depthOf(layout: WindowLayout, id: WindowId): number {
  return layout.stack.indexOf(id) + 1;
}

const clamp = (value: number, low: number, high: number): number =>
  Math.min(Math.max(value, low), high);

export function clampSpot(spot: WindowSpot, size: Box, viewport: Box, top: number): WindowSpot {
  const right = Math.max(MARGIN, viewport.width - size.width - MARGIN);
  const bottom = Math.max(top, viewport.height - GRIP);
  return {
    x: Math.round(clamp(spot.x, MARGIN, right)),
    y: Math.round(clamp(spot.y, top, bottom)),
  };
}

const isWindowId = (value: unknown): value is WindowId =>
  typeof value === 'string' && (WINDOW_IDS as readonly string[]).includes(value);

const idsOf = (value: unknown): readonly WindowId[] =>
  Array.isArray(value) ? [...new Set(value.filter(isWindowId))] : [];

function spotOf(value: unknown): WindowSpot | null {
  if (typeof value !== 'object' || value === null) return null;
  const { x, y } = value as { x?: unknown; y?: unknown };
  if (typeof x !== 'number' || typeof y !== 'number') return null;
  return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
}

function spotsOf(value: unknown): WindowLayout['spots'] {
  if (typeof value !== 'object' || value === null) return {};
  const spots: Partial<Record<WindowId, WindowSpot>> = {};
  for (const [id, raw] of Object.entries(value)) {
    const spot = spotOf(raw);
    if (isWindowId(id) && spot) spots[id] = spot;
  }
  return spots;
}

// Whatever was stored by an older build, or by hand, comes back as something usable.
export function parseLayout(value: unknown): WindowLayout {
  if (typeof value !== 'object' || value === null) return DEFAULT_LAYOUT;
  const { open, stack, spots } = value as { open?: unknown; stack?: unknown; spots?: unknown };
  if (!Array.isArray(open)) return DEFAULT_LAYOUT;
  return { open: idsOf(open), stack: idsOf(stack), spots: spotsOf(spots), focus: null };
}
