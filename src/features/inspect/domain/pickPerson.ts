// Picks by screen pixels, not ground distance: from a high angle a click on a head
// lands the ground ray past their feet. No spatial index, because a walking crowd
// would need it rebuilt every frame.

import type { PointerPosition, Viewport } from '../../build/domain/groundPick';

export const PICK_PIXELS = 24;

export interface PickablePeople {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
}

// Squared, in pixels; infinite for anybody behind the eye, whom the divide would mirror back
// onto the screen.
function pixelsAway(
  pointer: PointerPosition,
  viewport: Viewport,
  m: ArrayLike<number>,
  x: number,
  y: number,
  z: number,
): number {
  const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
  if (w <= 0) return Number.POSITIVE_INFINITY;
  const ndcX = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
  const ndcY = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
  // The inverse of the groundPointAt mapping, so both picks agree about the pointer.
  const dx = ((ndcX + 1) / 2) * viewport.width - pointer.x;
  const dy = ((1 - ndcY) / 2) * viewport.height - pointer.y;
  return dx * dx + dy * dy;
}

export function pickPerson(
  pointer: PointerPosition,
  viewport: Viewport,
  viewProjection: ArrayLike<number>,
  people: PickablePeople,
  aimHeight: number,
  maxPixels: number = PICK_PIXELS,
): number {
  if (viewProjection.length < 16) throw new Error('Expected a 4x4 matrix of 16 elements');
  if (viewport.width <= 0 || viewport.height <= 0) return -1;

  let best = -1;
  let bestSquared = maxPixels * maxPixels;
  for (let i = 0; i < people.count; i++) {
    const y = people.y[i]! + aimHeight;
    const squared = pixelsAway(pointer, viewport, viewProjection, people.x[i]!, y, people.z[i]!);
    // Strictly nearer, so an equal distance keeps the lower index.
    if (squared < bestSquared || (best === -1 && squared === bestSquared)) {
      best = i;
      bestSquared = squared;
    }
  }
  return best;
}

export type Picked = { readonly person: number } | { readonly worker: number } | null;

// Guests and staff are two crowds; the nearer on screen wins, a guest on a tie.
export function pickGuestOrWorker(
  pointer: PointerPosition,
  viewport: Viewport,
  viewProjection: ArrayLike<number>,
  crowds: { readonly guests: PickablePeople; readonly staff: PickablePeople },
  aimHeight: number,
): Picked {
  const person = pickPerson(pointer, viewport, viewProjection, crowds.guests, aimHeight);
  const worker = pickPerson(pointer, viewport, viewProjection, crowds.staff, aimHeight);
  if (worker < 0) return person < 0 ? null : { person };
  if (person < 0) return { worker };
  const away = (people: PickablePeople, i: number): number =>
    pixelsAway(
      pointer,
      viewport,
      viewProjection,
      people.x[i]!,
      people.y[i]! + aimHeight,
      people.z[i]!,
    );
  const nearer = away(crowds.staff, worker) < away(crowds.guests, person);
  return nearer ? { worker } : { person };
}
