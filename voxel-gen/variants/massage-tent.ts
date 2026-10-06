import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SIZE = 32;

// Sand on sand is invisible, so the platform reads as laid on the beach.
const SLAB = { x: 0, z: 0, w: SIZE, d: SIZE, height: 2, stone: PALETTE.sand } as const;
const GROUND = SLAB.height;

const DECK = { x: 2, z: 1, w: 28, d: 24 } as const;
const DECK_X1 = DECK.x + DECK.w - 1;
const DECK_Z1 = DECK.z + DECK.d - 1;
const FLOOR = 3;

const FRAME = { x: 3, z: 2, w: 26, d: 22 } as const;
const POSTS = [FRAME.x, FRAME.x + FRAME.w - 2] as const;
const POST_ROWS = [FRAME.z, FRAME.z + FRAME.d - 2] as const;
const EAVES = 15;

const TABLES = [
  { x: 7, x1: 11 },
  { x: 20, x1: 24 },
] as const;
const TABLE = { z: 7, z1: 17, top: FLOOR + 3 } as const;

// z is the hips: the figure runs four voxels back and three forward, so the head lands on the
// cradle and the feet short of the towel.
const TABLE_SEATS = TABLES.map(
  ({ x, x1 }) => ({ x: (x + x1) / 2, y: TABLE.top + 2, z: 12, facing: 0, pose: 'lie' }) as const,
);

const BENCH = { x: 10, x1: 21, z: DECK_Z1 + 2 } as const;
const HIPS = GROUND + 2;

// Backless stone, so the line looks out to sea over it; 4 apart, as a figure is three wide.
const BENCH_SEATS = [12, 16, 20].map(
  (x) => ({ x, y: HIPS, z: BENCH.z + 1, facing: 0, watches: true }) as const,
);

export default defineModel({
  id: 'massage-tent-b',
  label: 'Massage Tent B',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  placement: { ground: 'beach', perResort: { min: 1, max: 2 } },
  seats: [...TABLE_SEATS, ...BENCH_SEATS],
  venue: {
    role: 'service',
    satisfies: [
      { need: 'energy', amount: 0.7 },
      { need: 'fun', amount: 0.2 },
    ],
    capacity: 2,
    dwellSeconds: { min: 1800, max: 3600 },
    price: 7,
    shelter: 'covered',
    doors: [{ x: 16, z: SIZE - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, slate, stone, stucco, teak, thatch } = PALETTE;

    plinth(b, SLAB);
    plinth(b, { ...DECK, height: FLOOR, stone });

    for (const x of POSTS) {
      for (const z of POST_ROWS) box(x, x + 1, FLOOR, EAVES - 1, z, z + 1, teak.base);
    }

    // Woven reed behind the tables: the backdrop the open front looks onto.
    box(POSTS[0] + 2, POSTS[1] - 1, FLOOR, EAVES - 1, FRAME.z, FRAME.z, thatch.shade);
    for (let x = POSTS[0] + 4; x < POSTS[1]; x += 4) {
      box(x, x, FLOOR, EAVES - 1, FRAME.z + 1, FRAME.z + 1, teak.shade);
    }

    thatchRoof(b, { ...FRAME, y: EAVES, overhang: 2, ridge: 'x' });

    // Sheer curtains gathered at every post and tied, open on all sides to the breeze.
    for (const x of POSTS) {
      for (const z of POST_ROWS) {
        const side = x === POSTS[0] ? x - 1 : x + 2;
        box(side, side, FLOOR + 2, EAVES - 1, z, z + 1, stucco.light);
        box(side, side, FLOOR + 6, FLOOR + 6, z, z + 1, amber.base);
      }
    }

    for (const { x, x1 } of TABLES) {
      box(x + 1, x1 - 1, FLOOR, TABLE.top - 1, TABLE.z + 1, TABLE.z1 - 1, teak.shade);
      box(x, x1, TABLE.top, TABLE.top, TABLE.z, TABLE.z1, teak.base);
      box(x, x1, TABLE.top + 1, TABLE.top + 1, TABLE.z, TABLE.z1, stucco.light);
      box(x + 1, x1 - 1, TABLE.top + 2, TABLE.top + 2, TABLE.z, TABLE.z, stucco.base);
      box(x, x1, TABLE.top + 1, TABLE.top + 2, TABLE.z1 - 1, TABLE.z1, bloom.light);
    }

    const stool = { x: 14, x1: 17, z: 10, z1: 12 } as const;
    box(stool.x, stool.x1, FLOOR, FLOOR + 2, stool.z, stool.z1, teak.deep);
    box(stool.x, stool.x1, FLOOR + 3, FLOOR + 3, stool.z, stool.z1, bloom.base);
    box(stool.x + 1, stool.x1 - 1, FLOOR + 4, FLOOR + 4, stool.z, stool.z1, amber.light);
    pottedPlant(b, { x: 15, z: FRAME.z + 2, y: FLOOR, size: 2, leaf: foliage });

    box(BENCH.x, BENCH.x1, GROUND, HIPS - 1, BENCH.z, BENCH.z + 2, stone.shade);
    box(BENCH.x, BENCH.x1, HIPS - 1, HIPS - 1, BENCH.z, BENCH.z + 2, stone.base);

    for (const z of [SIZE - 3, SIZE - 2]) box(15, 16, GROUND - 1, GROUND - 1, z, z, slate.light);

    for (const x of [DECK.x, DECK_X1 - 1]) {
      pottedPlant(b, { x, z: DECK_Z1 + 2, y: GROUND, size: 2, leaf: foliage });
    }
  },
});
