import type { Ramp } from '../palette.ts';
import { PALETTE } from '../palette.ts';
import type { VoxelBuilder } from '../voxelgen.ts';

// Deliberately oversized for a lantern: fifty metres up, one drawn to scale is a few pixels.
const SPAN = 10;

// Written out rather than computed: it is a drawing, and easier to nudge as numbers.
const PROFILE = [1.6, 2.6, 3.4, 4.0, 4.4, 4.5, 4.4, 4.1, 3.6, 2.9, 2.0, 1.1] as const;

const MOUTH = 4;

export interface LanternOptions {
  readonly paper: Ramp;
  readonly rigging?: Ramp;
}

// Banded lighter at the mouth, because the flame is at the bottom.
export function lantern(b: VoxelBuilder, o: LanternOptions): void {
  const rigging = o.rigging ?? PALETTE.teak;
  const centre = SPAN / 2;

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

// The whole envelope glows: a paper lantern lit from inside has no shaded side.
// Only the basket is shaded, which is what makes the envelope read as lit.
export const lanternGlow = (paper: Ramp): readonly number[] => [
  paper.light,
  paper.base,
  paper.shade,
];
