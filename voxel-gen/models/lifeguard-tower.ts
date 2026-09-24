import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const DECK = { x: 3, x1: 12, z: 3, z1: 12 } as const;

const LEGS = [
  { x: DECK.x, z: DECK.z },
  { x: DECK.x1 - 1, z: DECK.z },
  { x: DECK.x, z: DECK.z1 - 1 },
  { x: DECK.x1 - 1, z: DECK.z1 - 1 },
] as const;

const LEG_HEIGHT = 8;

const DECK_TOP = GROUND + LEG_HEIGHT;

// Western half only, leaving the eastern half for the parasol: a canopy directly
// over the sitter would hide them from the camera.
const BENCH = { x: 4, x1: 9, z: 4, z1: 5 } as const;

const PLANK = DECK_TOP + 2;

const SITTER = 6;

export default defineModel({
  id: 'lifeguard-tower',
  label: 'Lifeguard Tower',
  category: 'amenities',
  placement: { ground: 'shore' },
  tiles: { x: 1, z: 1 },
  // Only taken up on sand: inland there is no paving within reach of a deck this high,
  // so the seat is quietly dropped.
  seats: [{ x: SITTER, y: PLANK + 1, z: BENCH.z1, facing: 0 }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    const brace = GROUND + Math.floor(LEG_HEIGHT / 2);
    const rail = DECK_TOP + 3;

    for (const leg of LEGS) {
      box(leg.x, leg.x + 1, GROUND, DECK_TOP - 1, leg.z, leg.z + 1, teak.base);
    }
    box(DECK.x, DECK.x1, brace, brace, DECK.z, DECK.z, teak.shade);
    box(DECK.x, DECK.x1, brace, brace, DECK.z1, DECK.z1, teak.shade);
    box(DECK.x, DECK.x, brace, brace, DECK.z, DECK.z1, teak.shade);
    box(DECK.x1, DECK.x1, brace, brace, DECK.z, DECK.z1, teak.shade);

    for (let y = GROUND + 2; y < DECK_TOP; y += 3) {
      box(DECK.x + 3, DECK.x1 - 3, y, y, DECK.z1, DECK.z1, teak.light);
    }

    box(DECK.x, DECK.x1, DECK_TOP, DECK_TOP, DECK.z, DECK.z1, teak.shade);

    for (const x of [BENCH.x, BENCH.x1]) {
      box(x, x, DECK_TOP + 1, DECK_TOP + 1, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x, BENCH.x1, PLANK, PLANK, BENCH.z, BENCH.z1, teak.light);

    box(DECK.x, DECK.x1, DECK_TOP + 1, rail + 1, DECK.z, DECK.z, bloom.base);
    box(DECK.x, DECK.x1, PLANK, PLANK, DECK.z, DECK.z, stucco.light);

    for (const x of [DECK.x, DECK.x1]) {
      box(x, x, DECK_TOP + 1, DECK_TOP + 2, DECK.z, DECK.z1, bloom.base);
      box(x, x, rail, rail, DECK.z, DECK.z1, teak.light);
    }
    box(DECK.x, DECK.x1, DECK_TOP + 2, DECK_TOP + 2, DECK.z1, DECK.z1, teak.light);

    // Two voxels of reach: wider than the deck, the canopy reads as a roof sliding off.
    parasol(b, {
      x: DECK.x1 - 1,
      z: 7,
      y: DECK_TOP + 1,
      height: 6,
      reach: 2,
      pole: teak,
      canvas: bloom,
    });
  },
});
