/**
 * The lucky balloon: a glowing paper envelope over a little slung basket.
 *
 * One part rather than three models drawn by hand, for the reason `figure.ts`
 * is one part: the balloons differ only in the paper they are papered with, and
 * three copies of the same profile are three places for the profile to drift.
 *
 * The whole envelope is emissive, which is not a shortcut. A paper lantern lit
 * from inside *is* a lamp with a shape — there is no lit side and no shaded one
 * — so shading it would give it a dark half it does not have, a hundred voxels
 * up in a night sky with nothing else to shade it against. The basket is not:
 * it hangs under the glow, and being the one part the scene shades is exactly
 * what makes the envelope read as lit rather than as painted.
 *
 * Authored the way everything else here is — Y up, 25 cm a voxel — so the
 * envelope is 2 m across and the whole thing 4 m tall. Large for a lantern,
 * and deliberately: a balloon fifty metres up is a handful of pixels, and the
 * one that is drawn to scale is the one nobody sees go up.
 */

import type { Ramp } from '../palette.ts';
import { PALETTE } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

/**
 * The square the envelope's discs are cut out of, in voxels.
 *
 * Wider than the balloon: the corners of it are never filled, so the model's
 * own footprint comes out at eight — 2 m across and 4 m tall, which is the
 * proportion a lantern has and not the sphere a single radius would give.
 */
const SPAN = 10;

/**
 * The envelope's half-width, layer by layer, from the mouth up.
 *
 * A balloon rather than a sphere: widest a third of the way up, drawn in to a
 * narrow mouth below and a rounded crown above. Written out rather than
 * computed because it is a drawing, and nine numbers are easier to nudge than
 * the curve that would have to fit them.
 */
const PROFILE = [1.6, 2.6, 3.4, 4.0, 4.4, 4.5, 4.4, 4.1, 3.6, 2.9, 2.0, 1.1] as const;

/** Where the basket ends and the envelope's mouth begins. */
const MOUTH = 4;

export interface LanternOptions {
  /** The paper the envelope is papered with; its three lit tones are used. */
  readonly paper: Ramp;
  /** The basket and the cords. Teak unless a balloon wants otherwise. */
  readonly rigging?: Ramp;
}

/**
 * Paints one balloon with its basket on the origin.
 *
 * The envelope is banded rather than flat — lighter at the mouth, deeper at the
 * crown — because the flame is at the bottom and that is the one thing about a
 * lit lantern that is not uniform. Three bands of one ramp, so it is the paper's
 * own colour throughout and not a light painted onto it.
 */
export function lantern(b: VoxelBuilder, o: LanternOptions): void {
  const rigging = o.rigging ?? PALETTE.teak;
  const centre = SPAN / 2;

  // The basket, with a darker rim round its mouth, and the two voxels of cord
  // that carry the envelope over it.
  b.box(3, 6, 0, 1, 3, 6, rigging.shade);
  b.box(3, 6, 1, 1, 3, 6, rigging.deep);
  b.box(4, 5, 1, 1, 4, 5, rigging.shade);
  b.box(4, 5, 2, MOUTH - 1, 4, 5, rigging.deep);

  PROFILE.forEach((radius, layer) => {
    const y = MOUTH + layer;
    const tone = layer < 4 ? o.paper.light : layer < 9 ? o.paper.base : o.paper.shade;
    for (let x = 0; x < SPAN; x++) {
      for (let z = 0; z < SPAN; z++) {
        const distance = Math.hypot(x + 0.5 - centre, z + 0.5 - centre);
        if (distance <= radius) b.set(x, y, z, tone);
      }
    }
  });
}

/** The tones one paper's envelope glows in, which is what the model declares. */
export const lanternGlow = (paper: Ramp): readonly number[] => [
  paper.light,
  paper.base,
  paper.shade,
];
