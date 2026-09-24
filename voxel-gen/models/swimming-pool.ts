import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 127;
const Z = 95;

// Written down because a seat declaration cannot read a local; build checks the two agree.
const TOP_LAYER = 4;

const NORTH_ROW = { z: 2, at: [20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120] } as const;
const SOUTH_ROW = { z: 85, at: [6, 16, 26, 36, 46, 56, 66, 76, 86, 96, 106, 116] } as const;

const LENGTHS = { x: 6, z: 26, w: 80, d: 38 } as const;
const PADDLING = { x: 90, z: 14, w: 32, d: 28 } as const;
const SPLASH = { x: 90, z: 58, w: 24, d: 20 } as const;

const TOWER = { x: 117, z: 62, w: 5, d: 7, y: 11 } as const;
const CHUTE = { from: 116, to: 104, top: TOWER.y, end: 3, z: 64 } as const;

export default defineModel({
  id: 'swimming-pool',
  label: 'Swimming Pool',
  category: 'leisure',
  tiles: { x: 8, z: 6 },
  seats: [
    ...NORTH_ROW.at.map(
      (x) => ({ x: x + 1, y: TOP_LAYER + 2, z: NORTH_ROW.z + 4, facing: 0, pose: 'lie' }) as const,
    ),
    ...SOUTH_ROW.at.map(
      (x) => ({ x: x + 1, y: TOP_LAYER + 2, z: SOUTH_ROW.z + 1, facing: 2, pose: 'lie' }) as const,
    ),
  ],
  water: [PALETTE.water.base],
  // No voxel emits these: the water is simply lit at night.
  lights: [
    { x: 26, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 66, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 106, y: 4, z: 28, color: 0x7fd8ee, intensity: 90, distance: 52 },
    { x: 102, y: 4, z: 68, color: 0x7fd8ee, intensity: 90, distance: 52 },
  ],
  // A negative amount is a need a visit makes worse: a swim spends energy.
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.2 },
    ],
    capacity: 30,
    dwellSeconds: { min: 1800, max: 5400 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { stone, water, teak, stucco, amber, metal } = PALETTE;

    // One flat colour: the mesher merges coplanar faces of one colour, a checker would not.
    const top = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });
    if (top !== TOP_LAYER) throw new Error('The deck and the loungers must agree on its surface');
    const deck = top - 1;

    const surface = poolWater(b, { ...LENGTHS, deck });
    poolWater(b, { ...PADDLING, shape: 'round', deck, depth: 1 });
    poolWater(b, { ...SPLASH, deck });

    box(82, 84, surface, surface, 30, 50, stone.light);

    const ladder = (x: number, z: number, over: number): void => {
      for (const rail of [x, x + 3]) {
        box(rail, rail, top, top + 3, z, z, metal.base);
        set(rail, top + 3, over, metal.base);
      }
      for (const rung of [top, top + 2]) box(x + 1, x + 2, rung, rung, z, z, metal.base);
    };
    ladder(40, 63, 62);
    ladder(100, 58, 59);

    steps(b, { x: 12, z: 19, w: 4, y: top + 2, treads: 3, descends: 'z-' });
    box(12, 15, top, top + 2, 20, 22, stone.light);
    box(12, 15, top + 3, top + 3, 20, 34, teak.base);
    box(12, 15, top + 3, top + 3, 34, 34, teak.shade);

    box(106, 106, deck, deck + 3, 28, 28, water.light);

    for (const x of [TOWER.x, TOWER.x + TOWER.w - 1]) {
      for (const z of [TOWER.z, TOWER.z + TOWER.d - 1])
        box(x, x, top, TOWER.y - 1, z, z, teak.shade);
    }
    box(
      TOWER.x,
      TOWER.x + TOWER.w - 1,
      TOWER.y,
      TOWER.y,
      TOWER.z,
      TOWER.z + TOWER.d - 1,
      teak.base,
    );
    for (const rail of [63, 67]) box(122, 122, top, TOWER.y + 3, rail, rail, metal.base);
    for (const rung of [top + 1, top + 3, top + 5, top + 7])
      box(122, 122, rung, rung, 64, 66, metal.base);

    // Squared, not linear, so the chute flattens into a runout instead of reading as stairs.
    const run = CHUTE.from - CHUTE.to;
    const chuteFloor = (step: number): number =>
      Math.round(CHUTE.end + (CHUTE.top - CHUTE.end) * (1 - step / run) ** 2);
    for (let step = 0; step <= run; step++) {
      const x = CHUTE.from - step;
      const y = chuteFloor(step);
      box(x, x, y, y + 1, CHUTE.z, CHUTE.z + 2, amber.base);
      for (const rail of [CHUTE.z - 1, CHUTE.z + 3]) box(x, x, y, y + 2, rail, rail, amber.shade);
    }
    box(115, 115, top, chuteFloor(1) - 1, 65, 65, teak.shade);
    box(110, 110, deck, chuteFloor(6) - 1, 65, 65, teak.shade);

    // Timber rather than metal: a grey post on grey paving is a post nobody sees.
    box(49, 52, deck, deck, 70, 76, stone.shade);
    box(50, 50, top, top + 8, 72, 73, teak.base);
    box(50, 50, top + 8, top + 8, 74, 75, teak.shade);
    set(50, top + 7, 75, metal.light);
    box(50, 50, top + 2, top + 6, 75, 75, water.light);

    const lounger = (x: number, z: number, headNorth: boolean): void => {
      const head = headNorth ? z : z + 5;
      const foot = headNorth ? z + 1 : z;
      for (const lx of [x, x + 3]) {
        for (const lz of [z, z + 5]) set(lx, top, lz, teak.shade);
      }
      box(x, x + 3, top + 1, top + 1, foot, foot + 4, stucco.light);
      box(
        x,
        x + 3,
        top + 2,
        top + 2,
        headNorth ? z + 3 : z + 2,
        headNorth ? z + 3 : z + 2,
        amber.base,
      );
      box(x, x + 3, top + 2, top + 3, head, head, stucco.light);
      box(x, x + 3, top + 4, top + 4, head, head, teak.base);
    };
    for (const x of NORTH_ROW.at) lounger(x, NORTH_ROW.z, true);
    for (const x of SOUTH_ROW.at) lounger(x, SOUTH_ROW.z, false);

    for (const [x, z] of [
      [26, 5],
      [56, 5],
      [86, 5],
      [116, 5],
      [12, 88],
      [42, 88],
      [72, 88],
      [102, 88],
    ] as const)
      parasol(b, { x, z, y: top });

    for (const [x, z] of [
      [1, 1],
      [1, 93],
      [125, 1],
      [125, 93],
      [125, 46],
      [1, 46],
    ] as const)
      pottedPlant(b, { x, z, y: top });
  },
});
