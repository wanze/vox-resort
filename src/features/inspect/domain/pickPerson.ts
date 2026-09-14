/**
 * Which person the pointer is on.
 *
 * **Not** the ground pick with a radius round it, and the difference matters:
 * the plot is drawn from a high angle, so a click on somebody's head lands the
 * ground ray a tile or two past their feet, and picking by distance on the
 * ground would select whoever is standing behind them. So this goes the other
 * way - every person is projected forward onto the screen and the nearest one in
 * **pixels** wins, which is the question a click actually asks.
 *
 * The forward projection is the same matrix the ground pick inverts, so the
 * camera is already handing both out. See `build/domain/groundPick.ts`.
 *
 * ## A pass over everybody, on a click
 *
 * Six hundred projections is a few microseconds and it happens when a button
 * goes down, not when the pointer moves. There is no spatial index here on
 * purpose: one would have to be rebuilt every frame for a crowd that walks, which
 * is exactly the cost `crowdField.ts` refuses to pay for the draw.
 *
 * Matrices arrive column-major, the layout Three.js uses in `Matrix4.elements`.
 */

import type { PointerPosition, Viewport } from '../../build/domain/groundPick';

/** How far from a person, in CSS pixels, a click still counts as on them. */
export const PICK_PIXELS = 24;

/** Where the people are: the crowd's own columns, and nothing else. */
export interface PickablePeople {
  readonly count: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly z: Float32Array;
}

/**
 * The person under the pointer, or -1.
 *
 * `aimHeight` is how far above a person's feet to aim, in voxels: about half a
 * figure, so a click anywhere on a body is close to the point being tested
 * rather than to the ground under it.
 *
 * Ties go to the lower index, so the same click on the same frame always picks
 * the same person.
 */
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
    // The inverse of the mapping `groundPointAt` makes, so both picks agree
    // about where the pointer is.
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
