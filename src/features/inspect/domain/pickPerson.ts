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
  const m = viewProjection;

  let best = -1;
  let bestSquared = maxPixels * maxPixels;
  for (let i = 0; i < people.count; i++) {
    const x = people.x[i]!;
    const y = people.y[i]! + aimHeight;
    const z = people.z[i]!;
    const w = m[3]! * x + m[7]! * y + m[11]! * z + m[15]!;
    // Behind the eye: the divide would mirror them back onto the screen.
    if (w <= 0) continue;
    const ndcX = (m[0]! * x + m[4]! * y + m[8]! * z + m[12]!) / w;
    const ndcY = (m[1]! * x + m[5]! * y + m[9]! * z + m[13]!) / w;
    // The inverse of the groundPointAt mapping, so both picks agree about the pointer.
    const dx = ((ndcX + 1) / 2) * viewport.width - pointer.x;
    const dy = ((1 - ndcY) / 2) * viewport.height - pointer.y;
    const squared = dx * dx + dy * dy;
    // Strictly nearer, so an equal distance keeps the lower index.
    if (squared < bestSquared || (best === -1 && squared === bestSquared)) {
      best = i;
      bestSquared = squared;
    }
  }
  return best;
}
