import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SIZE = 32;

// Sand on sand is invisible, so the deck reads as laid on the beach.
const SLAB = { x: 0, z: 0, w: SIZE, d: SIZE, height: 2, stone: PALETTE.sand } as const;
const GROUND = SLAB.height;

const DECK = { x: 2, z: 1, w: 28, d: 24 } as const;
const DECK_X1 = DECK.x + DECK.w - 1;
const DECK_Z1 = DECK.z + DECK.d - 1;
const FLOOR = 3;

const POSTS = [DECK.x, DECK_X1 - 1] as const;
const POST_ROWS = [DECK.z, DECK_Z1 - 1] as const;
const EAVES = 16;

const ROOF = { x: DECK.x - 1, x1: DECK_X1 + 1, z: DECK.z - 1, z1: DECK_Z1 + 1 } as const;
const MIDDLE = (ROOF.x + ROOF.x1) / 2;

const roofTop = (x: number): number =>
  EAVES + 1 + Math.floor((MIDDLE - Math.abs(x - MIDDLE) - ROOF.x + 0.5) / 2);

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

const BENCH = { x: 10, x1: 21, back: DECK_Z1 + 1 } as const;
const PLANK = GROUND + 1;
const HIPS = PLANK + 1;

// A figure is three voxels wide, so 4 apart keeps the outer two clear of the arms.
const BENCH_SEATS = [12, 16, 20].map(
  (x) => ({ x, y: HIPS, z: BENCH.back + 2, facing: 0, watches: true }) as const,
);

export default defineModel({
  id: 'massage-tent',
  label: 'Massage Tent',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  // The size rule asks about 150 for canvas, which would make it a throwaway.
  cost: 450,
  sound: 'massage',
  placement: { ground: 'beach', perResort: { min: 1, max: 2 } },
  seats: [...TABLE_SEATS, ...BENCH_SEATS],
  venue: {
    role: 'service',
    sign: 'massage',
    names: [
      'The Sea Breeze Massage',
      "Mani d'Oro",
      'Tide & Touch',
      'The Driftwood Rest',
      'Massaggi al Mare',
      'Calm Hands',
      'The Salt Stone',
      'Sole e Relax',
      'The Kneading Tent',
      'Shell & Spa',
      'Siesta Tent',
      'The Quiet Shore',
    ],
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
    const { amber, bloom, foliage, stucco, teak, water } = PALETTE;

    plinth(b, SLAB);
    plinth(b, { ...DECK, height: FLOOR, stone: teak });

    for (const x of POSTS) {
      for (const z of POST_ROWS) box(x, x + 1, FLOOR, EAVES - 1, z, z + 1, teak.shade);
    }

    for (let x = ROOF.x; x <= ROOF.x1; x++) {
      const top = roofTop(x);
      // Two voxels thick, as the parasol's: a one-voxel shell is see-through along every step.
      box(x, x, top - 1, top, ROOF.z, ROOF.z1, stucco.light);
      for (const z of [ROOF.z, ROOF.z1]) box(x, x, top - 1, top, z, z, bloom.base);
      // Behind the tables: the canvas backdrop the open front looks onto.
      if (x > DECK.x + 1 && x < DECK_X1 - 1) box(x, x, FLOOR, top - 2, DECK.z, DECK.z, stucco.base);
    }
    for (const x of [ROOF.x, ROOF.x1]) box(x, x, EAVES - 1, EAVES - 1, ROOF.z, ROOF.z1, bloom.base);

    // Drawn from the back post to halfway, the front half tied back to the front post.
    const curtainZ1 = Math.floor((DECK.z + DECK_Z1) / 2);
    for (const x of [DECK.x, DECK_X1]) {
      for (let z = DECK.z + 2; z <= curtainZ1; z++) {
        const fold = z === curtainZ1 || (z - DECK.z) % 4 === 0;
        box(x, x, FLOOR + 1, EAVES - 1, z, z, fold ? stucco.base : stucco.light);
      }
      const tie = DECK_Z1 - 3;
      box(x, x, FLOOR + 3, EAVES - 1, tie, tie + 1, stucco.base);
      box(x, x, FLOOR + 6, FLOOR + 6, tie, tie + 1, bloom.base);
    }

    for (const { x, x1 } of TABLES) {
      for (const lx of [x, x1]) {
        for (const lz of [TABLE.z, TABLE.z1]) box(lx, lx, FLOOR, TABLE.top - 1, lz, lz, teak.deep);
      }
      box(x, x1, TABLE.top, TABLE.top, TABLE.z, TABLE.z1, teak.base);
      box(x, x1, TABLE.top + 1, TABLE.top + 1, TABLE.z, TABLE.z1, stucco.light);
      box(x + 1, x1 - 1, TABLE.top + 2, TABLE.top + 2, TABLE.z, TABLE.z, stucco.base);
      box(x, x1, TABLE.top + 2, TABLE.top + 2, TABLE.z1 - 1, TABLE.z1, water.light);
    }

    const shelf = { x: 13, x1: 18, z: DECK.z + 2, z1: DECK.z + 3 } as const;
    box(shelf.x, shelf.x1, FLOOR, FLOOR + 2, shelf.z, shelf.z1, teak.deep);
    for (const [i, towel] of [bloom.light, water.light, amber.light].entries()) {
      const x = shelf.x + i * 2;
      box(x, x + 1, FLOOR + 3, FLOOR + 4, shelf.z, shelf.z1, towel);
    }

    const front = BENCH.back + 1;
    for (const x of [BENCH.x + 1, BENCH.x1 - 1]) {
      box(x, x, GROUND, GROUND, front, front + 2, teak.deep);
    }
    box(BENCH.x, BENCH.x1, PLANK, PLANK, front, front + 2, teak.base);
    box(BENCH.x, BENCH.x1, HIPS, HIPS + 1, BENCH.back, BENCH.back, teak.shade);
    box(BENCH.x, BENCH.x1, HIPS + 2, HIPS + 2, BENCH.back, BENCH.back, teak.light);

    for (const x of POSTS) pottedPlant(b, { x, z: DECK_Z1 + 2, y: GROUND, size: 2, leaf: foliage });
  },
});
