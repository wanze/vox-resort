import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type Color, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 31;

type Point = readonly [number, number, number];

const clamp = (value: number): number => Math.min(EDGE, Math.max(0, Math.round(value)));

function disc(b: VoxelBuilder, cx: number, cz: number, y: number, r: number, color: Color): void {
  for (let z = clamp(cz - r); z <= clamp(cz + r); z++) {
    for (let x = clamp(cx - r); x <= clamp(cx + r); x++) {
      if ((x + 0.5 - cx) ** 2 + (z + 0.5 - cz) ** 2 <= r * r) b.set(x, y, z, color);
    }
  }
}

// A square section stepped along a line, so a limb is a few long boxes rather than a lumpy tube.
function bough(b: VoxelBuilder, from: Point, to: Point, size: number, color: Color): void {
  const span = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const steps = Math.max(1, Math.round(span));
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const x = Math.round(from[0] + (to[0] - from[0]) * t - size / 2);
    const y = Math.round(from[1] + (to[1] - from[1]) * t);
    const z = Math.round(from[2] + (to[2] - from[2]) * t - size / 2);
    b.box(x, x + size - 1, y, y, z, z + size - 1, color);
  }
}

interface Lobe {
  readonly cx: number;
  readonly cz: number;
  readonly r: number;
}

interface Tier {
  readonly y: number;
  readonly leaf: Color;
  readonly lobes: readonly Lobe[];
}

// Plates narrower underneath and on top, so each tier reads as a flat cushion and
// the canopy as a stack of them: the flat umbrella that makes a stone pine.
const TIERS: readonly Tier[] = [
  {
    y: 37,
    leaf: PALETTE.foliage.shade,
    lobes: [
      { cx: 7, cz: 11, r: 7 },
      { cx: 11, cz: 7, r: 6 },
    ],
  },
  {
    y: 38,
    leaf: PALETTE.foliage.shade,
    lobes: [
      { cx: 17, cz: 24, r: 7.5 },
      { cx: 24, cz: 21, r: 6 },
    ],
  },
  {
    y: 40,
    leaf: PALETTE.foliage.base,
    lobes: [
      { cx: 24, cz: 10, r: 7 },
      { cx: 19, cz: 6, r: 5.5 },
    ],
  },
  {
    y: 42,
    leaf: PALETTE.foliage.base,
    lobes: [
      { cx: 15, cz: 15, r: 8.5 },
      { cx: 10, cz: 19, r: 5.5 },
      { cx: 21, cz: 16, r: 6 },
    ],
  },
];

export default defineModel({
  id: 'pine-b',
  label: 'Stone Pine B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const { sand, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32, height: 2, stone: sand });
    b.box(11, 20, ground - 1, ground - 1, 11, 20, teak.deep);

    // Straight up the middle of the plot and forking high, so a path underneath stays
    // clear to 8 m. Even widths only: the plot is 32 wide, so odd ones sit off-centre.
    b.box(13, 18, ground, ground, 13, 18, teak.shade);
    const fork: Point = [16, 27, 16];
    for (let y = ground; y < fork[1]; y++) {
      const [x0, x1] = y < 14 ? [14, 17] : [15, 16];
      b.box(x0, x1, y, y, x0, x1, teak.base);
    }
    for (const { y, lobes } of TIERS) {
      const [{ cx, cz }] = lobes as [Lobe];
      bough(b, fork, [cx, y, cz], 2, teak.shade);
    }

    for (const { y, leaf, lobes } of TIERS) {
      for (const { cx, cz, r } of lobes) {
        disc(b, cx, cz, y, r - 2, leaf);
        for (let lift = 1; lift <= 3; lift++) disc(b, cx, cz, y + lift, r, leaf);
        disc(b, cx, cz, y + 4, r - 2, leaf);
      }
    }
  },
});
