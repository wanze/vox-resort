import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = 48;
const EDGE = PLOT - 1;

const BODY = { x: 3, z: 3, w: 26, d: 18 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const GROUND = 3;
const LAWN_Y = GROUND - 1;

const FENCE_Z = EDGE - 1;
const FENCE_X = EDGE - 1;
const GATE = { x0: 10, x1: 17 } as const;

const SLIDE = { x: 35, z: 6, deck: GROUND + 5 } as const;

const PIT = { x0: 19, x1: 30, z0: 26, z1: 35 } as const;
const HOUSE = { x: 35, z: 29, w: 7, d: 7 } as const;

// West of the pit, across the path to the gate's fence posts, in front of the animator.
const YARD = { x: 2, z: FRONT + 8, w: 16, d: 17 } as const;

const PLAYERS = [
  { x: SLIDE.x + 1, y: GROUND, z: SLIDE.z + 15, facing: 0, child: true },
  { x: SLIDE.x + 1, y: GROUND, z: SLIDE.z - 3, facing: 0, child: true },
  ...[SLIDE.z + 3, SLIDE.z + 9].map((z) => ({
    x: SLIDE.x - 3,
    y: GROUND,
    z,
    facing: 1 as const,
    child: true as const,
  })),
  ...[SLIDE.z - 2, SLIDE.z + 4, SLIDE.z + 10].map((z) => ({
    x: FENCE_X - 3,
    y: GROUND,
    z,
    facing: 3 as const,
    child: true as const,
  })),
  ...[FRONT + 11, FRONT + 16, FRONT + 21].flatMap((z) =>
    [GATE.x0 - 7, GATE.x0 - 1].map((x) => ({
      x,
      y: GROUND,
      z,
      facing: 2 as const,
      act: 'tag' as const,
      yard: YARD,
      child: true as const,
    })),
  ),
  { x: HOUSE.x + 3, y: GROUND, z: HOUSE.z + HOUSE.d + 3, facing: 2, child: true },
  { x: HOUSE.x, y: GROUND, z: HOUSE.z - 3, facing: 0, child: true },
  { x: HOUSE.x + HOUSE.w - 1, y: GROUND, z: HOUSE.z - 3, facing: 0, child: true },
] as const;

// Up the ladder and over the deck's back rail, down the chute's steps and round its east legs.
const RIDE_X = SLIDE.x + 1.5;
const BACK_X = SLIDE.x + 5.5;
const FOOT_Z = SLIDE.z + 15.5;

const SLIDE_LOOP = {
  places: 2,
  for: 'child',
  points: [
    { x: RIDE_X, y: GROUND, z: SLIDE.z - 2.5, pose: 'climb' },
    { x: RIDE_X, y: SLIDE.deck + 3, z: SLIDE.z - 2.5, pose: 'walk' },
    { x: RIDE_X, y: SLIDE.deck + 3, z: SLIDE.z, pose: 'walk' },
    { x: RIDE_X, y: SLIDE.deck + 1, z: SLIDE.z + 1.5, pose: 'walk' },
    { x: RIDE_X, y: SLIDE.deck + 1, z: SLIDE.z + 3.5, pose: 'slide' },
    { x: RIDE_X, y: GROUND + 2, z: SLIDE.z + 12.5, pose: 'slide' },
    { x: RIDE_X, y: GROUND + 1.5, z: SLIDE.z + 14.5, pose: 'slide' },
    { x: RIDE_X, y: GROUND, z: FOOT_Z, pose: 'walk' },
    { x: BACK_X, y: GROUND, z: FOOT_Z, pose: 'walk' },
    { x: BACK_X, y: GROUND, z: SLIDE.z + 6, pose: 'walk' },
    { x: BACK_X, y: GROUND, z: SLIDE.z - 2.5, pose: 'walk' },
  ],
} as const;

const BENCH = { x0: 21, x1: 31, z: 41, z1: 43 } as const;
const BENCH_HIPS = GROUND + 2;

export default defineModel({
  id: 'kids-club',
  label: 'Kids Club',
  category: 'leisure',
  tiles: { x: 3, z: 3 },
  windows: WINDOW_GLASS,
  seats: [23, 27].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 2 as const })),
  venue: {
    role: 'activity',
    sign: 'kids',
    names: [
      'The Sandcastle Club',
      'Little Crabs',
      'Club Delfino',
      'The Treasure Cove',
      'Starfish Club',
      'Mini Mariners',
      'The Pirate Hideout',
      'Seashell Club',
      'Little Explorers',
      'The Paddle Pals',
      'Club Polpo',
      'Tiny Tides',
    ],
    stage: true,
    satisfies: [{ need: 'fun', amount: 0.9 }],
    capacity: 20,
    dwellSeconds: { min: 3600, max: 10_800 },
    spots: [
      ...PLAYERS,
      { x: PIT.x1 - 2, y: GROUND + 1, z: PIT.z1 - 2, facing: 3, child: true },
      { x: BENCH.x0 + 1, y: GROUND, z: BENCH.z - 3, facing: 2 },
      { x: GATE.x0 - 4, y: GROUND, z: FRONT + 6, facing: 0, for: 'animator' },
    ],
    loops: [SLIDE_LOOP],
    doors: [{ x: 14, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, sand, stone, stucco, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    if (ground !== GROUND) throw new Error('The plinth moved under the bench');

    box(1, EDGE - 1, LAWN_Y, LAWN_Y, FRONT + 1, EDGE - 1, grass.base);
    box(RIGHT + 2, EDGE - 1, LAWN_Y, LAWN_Y, 1, FRONT, grass.base);
    box(8, 19, LAWN_Y, LAWN_Y, FRONT + 1, FRONT + 4, stone.shade);
    box(GATE.x0 + 1, GATE.x1 - 1, LAWN_Y, LAWN_Y, FRONT + 5, EDGE - 1, stone.shade);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    box(LEFT, RIGHT, ground + 10, ground + 10, BODY.z, FRONT, amber.base);
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    const shutters: readonly Ramp[] = [bloom, amber, PALETTE.glass];
    doorway(b, { face: 'z+', at: FRONT, along: 12, y: ground, w: 5, h: 8, timber: PALETTE.glass });
    for (const [i, along] of [5, 21].entries()) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, timber: shutters[i]! });
    }
    for (const [i, along] of [7, 15, 22].entries()) {
      shutteredWindow(b, {
        face: 'z-',
        at: BODY.z,
        along,
        y: ground + 3,
        timber: shutters[i % shutters.length]!,
      });
    }
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: 10, y: ground + 3, timber: bloom });
    }

    const fence = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, ground, ground + 2, z0, z1, stucco.light);
    };
    fence(1, GATE.x0 - 1, FENCE_Z, FENCE_Z);
    fence(GATE.x1 + 1, FENCE_X, FENCE_Z, FENCE_Z);
    fence(FENCE_X, FENCE_X, 1, FENCE_Z);
    fence(RIGHT + 2, FENCE_X, 1, 1);
    for (let x = 1; x <= FENCE_X; x += 8) {
      if (x < GATE.x0 || x > GATE.x1) box(x, x, ground, ground + 3, FENCE_Z, FENCE_Z, teak.base);
    }
    for (let z = 1; z < FENCE_Z; z += 8) box(FENCE_X, FENCE_X, ground, ground + 3, z, z, teak.base);
    for (const x of [GATE.x0 - 1, GATE.x1 + 1]) {
      box(x, x, ground, ground + 4, FENCE_Z, FENCE_Z, teak.shade);
    }

    box(SLIDE.x - 2, SLIDE.x + 5, LAWN_Y, LAWN_Y, SLIDE.z - 3, SLIDE.z + 16, terracotta.deep);
    for (const x of [SLIDE.x, SLIDE.x + 3]) {
      for (const z of [SLIDE.z, SLIDE.z + 3]) box(x, x, ground, SLIDE.deck - 1, z, z, teak.base);
    }
    box(SLIDE.x, SLIDE.x + 3, SLIDE.deck, SLIDE.deck, SLIDE.z, SLIDE.z + 3, bloom.base);
    box(SLIDE.x, SLIDE.x + 3, SLIDE.deck + 1, SLIDE.deck + 2, SLIDE.z, SLIDE.z, bloom.shade);
    for (let rung = ground + 1; rung < SLIDE.deck; rung += 2) {
      box(SLIDE.x + 1, SLIDE.x + 2, rung, rung, SLIDE.z - 1, SLIDE.z - 1, teak.light);
    }
    const drop = SLIDE.deck - ground;
    for (let step = 0; step < drop; step++) {
      const z = SLIDE.z + 4 + step * 2;
      box(SLIDE.x + 1, SLIDE.x + 2, SLIDE.deck - step - 1, SLIDE.deck - step, z, z + 1, amber.base);
    }

    box(PIT.x0, PIT.x1, ground, ground, PIT.z0, PIT.z1, teak.base);
    box(PIT.x0 + 1, PIT.x1 - 1, ground, ground, PIT.z0 + 1, PIT.z1 - 1, sand.base);
    box(26, 27, ground + 1, ground + 2, 29, 30, bloom.base);
    parasol(b, { x: 23, z: 30, y: ground + 1, height: 9, reach: 3, canvas: bloom });

    const hx1 = HOUSE.x + HOUSE.w - 1;
    const hz1 = HOUSE.z + HOUSE.d - 1;
    box(HOUSE.x, hx1, ground, ground + 5, HOUSE.z, hz1, stucco.base);
    box(HOUSE.x + 2, HOUSE.x + 4, ground, ground + 3, hz1, hz1, PALETTE.glass.deep);
    gableRoof(b, { ...HOUSE, y: ground + 6, ridge: 'z', overhang: 1, tile: bloom });

    for (const z of [FRONT + 7, FRONT + 11, FRONT + 15]) {
      box(GATE.x0 + 2, GATE.x1 - 2, LAWN_Y, LAWN_Y, z, z + 2, stucco.light);
    }

    for (const x of [BENCH.x0 + 1, BENCH.x1 - 1]) {
      box(x, x, ground, ground, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x0, BENCH.x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
    box(BENCH.x0, BENCH.x1, BENCH_HIPS, BENCH_HIPS + 1, BENCH.z1 + 1, BENCH.z1 + 1, teak.shade);

    for (const x of [9, 18]) pottedPlant(b, { x, z: FRONT + 2, y: ground, leaf: foliage });
  },
});
