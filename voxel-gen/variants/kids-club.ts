import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { poolWater } from '../parts/pool.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = 48;
const EDGE = PLOT - 1;

const BODY = { x: 3, z: 3, w: 22, d: 18 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;

const TOWER = { x: 26, z: 3, w: 8, d: 10 } as const;
const TOWER_FRONT = TOWER.z + TOWER.d - 1;

const GROUND = 3;
const LAWN_Y = GROUND - 1;

const GATE = { x0: 11, x1: 17 } as const;

// The slide runs off a landing on the tower's front, beside the house rather than before it.
const LANDING = {
  x0: TOWER.x + 1,
  x1: TOWER.x + 6,
  z0: TOWER_FRONT + 1,
  z1: TOWER_FRONT + 3,
} as const;
const LANDING_Y = GROUND + 5;

const POOL = { x: 32, z: 24, w: 13, d: 12 } as const;
const PIT = { x0: 3, x1: 13, z0: 31, z1: 40 } as const;

const EAST_LAWN = TOWER.x + TOWER.w;
const SLIDE_FOOT = LANDING.z1 + 12;

// The east lawn, between the tower and the fence, in front of the animator.
const YARD = { x: EAST_LAWN + 1, z: TOWER.z + 2, w: 11, d: 17 } as const;

const PLAYERS = [
  { x: LANDING.x0 + 2, y: GROUND, z: SLIDE_FOOT, facing: 0, child: true },
  { x: LANDING.x0 - 4, y: GROUND, z: SLIDE_FOOT, facing: 1, child: true },
  ...[TOWER.z + 6, TOWER.z + 11, TOWER.z + 16].flatMap((z) =>
    [EAST_LAWN + 3, EAST_LAWN + 9].map((x) => ({
      x,
      y: GROUND,
      z,
      facing: 2 as const,
      child: true as const,
      act: 'tag' as const,
      yard: YARD,
    })),
  ),
  ...[PIT.z0 + 1, PIT.z0 + 6].flatMap((z) =>
    [PIT.x1 + 6, PIT.x1 + 12].map((x) => ({
      x,
      y: GROUND,
      z,
      facing: 2 as const,
      child: true as const,
    })),
  ),
  ...[PIT.x0 + 1, PIT.x0 + 7].map((x) => ({
    x,
    y: GROUND,
    z: PIT.z0 - 4,
    facing: 0 as const,
    child: true as const,
  })),
  ...[POOL.x + 3, POOL.x + 9].map((x) => ({
    x,
    y: GROUND,
    z: POOL.z + POOL.d + 4,
    facing: 2 as const,
    child: true as const,
  })),
  { x: PIT.x0 + 2, y: GROUND, z: PIT.z1 + 4, facing: 2, child: true },
] as const;

const BENCH = { x0: 21, x1: 31, z: 41, z1: 43 } as const;
const BENCH_HIPS = GROUND + 2;

export default defineModel({
  id: 'kids-club-b',
  label: 'Kids Club B',
  category: 'leisure',
  tiles: { x: 3, z: 3 },
  windows: WINDOW_GLASS,
  water: [PALETTE.water.base],
  seats: [23, 27].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 2 as const })),
  venue: {
    role: 'activity',
    stage: true,
    satisfies: [{ need: 'fun', amount: 0.9 }],
    capacity: 20,
    dwellSeconds: { min: 3600, max: 10_800 },
    spots: [
      ...PLAYERS,
      { x: PIT.x0 + 2, y: GROUND + 1, z: PIT.z1 - 2, facing: 1, child: true },
      { x: EAST_LAWN + 6, y: GROUND, z: TOWER.z + 1, facing: 0, for: 'animator' },
    ],
    doors: [{ x: 14, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, grass, sand, stone, stucco, teak, terracotta, water } =
      PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT, d: PLOT });
    if (ground !== GROUND) throw new Error('The plinth moved under the bench');

    box(1, EDGE - 1, LAWN_Y, LAWN_Y, FRONT + 1, EDGE - 1, grass.base);
    box(TOWER.x + TOWER.w + 1, EDGE - 1, LAWN_Y, LAWN_Y, 1, FRONT, grass.base);
    box(GATE.x0 + 1, GATE.x1 - 1, LAWN_Y, LAWN_Y, FRONT + 1, EDGE, stone.light);

    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    box(LEFT, BODY.x + BODY.w - 1, ground + 10, ground + 10, BODY.z, FRONT, amber.base);
    hipRoof(b, { ...BODY, y: eaves });

    // Every opening a different colour: the one place this model is allowed to be loud.
    const paints: readonly Ramp[] = [bloom, amber, water, foliage];
    doorway(b, { face: 'z+', at: FRONT, along: 12, y: ground, w: 5, h: 8, timber: glass });
    for (const [i, along] of [5, 20].entries()) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 3, timber: paints[i]! });
    }
    for (const [i, along] of [6, 12].entries()) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 3, timber: paints[i + 2]! });
    }

    const upper = ground + STOREY_VOXELS;
    const towerTop = stuccoWall(b, { ...TOWER, y: ground, storeys: 2, wall: stucco });
    const spire = hipRoof(b, { ...TOWER, y: towerTop, overhang: 1, tile: bloom });
    box(TOWER.x + 3, TOWER.x + 4, spire, spire + 3, TOWER.z + 4, TOWER.z + 5, teak.shade);
    box(TOWER.x + 5, TOWER.x + 7, spire + 1, spire + 3, TOWER.z + 4, TOWER.z + 4, amber.base);
    shutteredWindow(b, {
      face: 'z+',
      at: TOWER_FRONT,
      along: TOWER.x + 3,
      y: upper + 2,
      timber: water,
    });
    doorway(b, {
      face: 'z+',
      at: TOWER_FRONT,
      along: TOWER.x + 2,
      y: LANDING_Y + 1,
      w: 4,
      h: 5,
      timber: amber,
    });

    box(LANDING.x0, LANDING.x1, LANDING_Y, LANDING_Y, LANDING.z0, LANDING.z1, teak.light);
    for (const x of [LANDING.x0, LANDING.x1]) {
      box(x, x, ground, LANDING_Y - 1, LANDING.z1, LANDING.z1, teak.base);
    }
    balustrade(b, {
      x: LANDING.x1,
      z: LANDING.z0,
      y: LANDING_Y + 1,
      w: 3,
      along: 'z',
      height: 3,
      rail: teak,
    });
    for (let rung = ground + 1; rung < LANDING_Y; rung += 2) {
      box(LANDING.x0 - 1, LANDING.x0 - 1, rung, rung, LANDING.z0, LANDING.z1, teak.light);
    }
    box(LANDING.x0 - 1, LANDING.x0 - 1, ground, LANDING_Y, LANDING.z0, LANDING.z0, teak.base);
    box(LANDING.x0 - 1, LANDING.x0 - 1, ground, LANDING_Y, LANDING.z1, LANDING.z1, teak.base);

    // 1:2 drop to run, the same as every step and terrace in the catalogue.
    const drop = LANDING_Y - ground;
    for (let step = 0; step < drop; step++) {
      const z = LANDING.z1 + 1 + step * 2;
      const y = LANDING_Y - step;
      box(LANDING.x0 + 1, LANDING.x0 + 4, ground, y - 1, z, z + 1, terracotta.deep);
      box(LANDING.x0 + 1, LANDING.x0 + 4, y, y, z, z + 1, amber.base);
      for (const x of [LANDING.x0 + 1, LANDING.x0 + 4])
        box(x, x, y + 1, y + 1, z, z + 1, amber.shade);
    }

    poolWater(b, { ...POOL, shape: 'round', deck: ground });
    const duck = { x: POOL.x + 8, z: POOL.z + 5 } as const;
    box(duck.x, duck.x + 1, ground - 1, ground - 1, duck.z, duck.z + 2, amber.base);
    b.set(duck.x, ground, duck.z + 2, amber.base);

    box(PIT.x0, PIT.x1, ground, ground, PIT.z0, PIT.z1, teak.base);
    box(PIT.x0 + 1, PIT.x1 - 1, ground, ground, PIT.z0 + 1, PIT.z1 - 1, sand.base);
    box(6, 7, ground + 1, ground + 2, 34, 35, bloom.base);
    box(10, 10, ground + 1, ground + 3, 37, 37, amber.base);
    box(9, 11, ground + 1, ground + 1, 33, 34, sand.shade);

    // Bunting under the front eave, one voxel a pennant, for the colour a camera this far up sees.
    const line = FRONT + 3;
    box(LEFT, BODY.x + BODY.w - 1, eaves - 2, eaves - 2, line, line, stucco.light);
    for (let x = LEFT + 1, n = 0; x < BODY.x + BODY.w - 1; x += 2, n++) {
      b.set(x, eaves - 3, line, paints[n % paints.length]!.base);
    }

    // A low hedge rather than the fence: the garden reads as enclosed without a wall across it.
    const hedge = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, ground, ground + 2, z0, z1, foliage.base);
    hedge(1, GATE.x0 - 1, EDGE - 1, EDGE - 1);
    hedge(GATE.x1 + 1, EDGE - 1, EDGE - 1, EDGE - 1);
    hedge(EDGE - 1, EDGE - 1, 1, EDGE - 1);
    hedge(TOWER.x + TOWER.w + 1, EDGE - 1, 1, 1);
    hedge(1, 1, FRONT + 2, EDGE - 1);

    for (const x of [BENCH.x0 + 1, BENCH.x1 - 1]) {
      box(x, x, ground, ground, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x0, BENCH.x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
    box(BENCH.x0, BENCH.x1, BENCH_HIPS, BENCH_HIPS + 1, BENCH.z1 + 1, BENCH.z1 + 1, teak.shade);

    for (const x of [GATE.x0 - 2, GATE.x1 + 1]) {
      pottedPlant(b, { x, z: FRONT + 2, y: ground, leaf: foliage });
    }
    box(GATE.x0, GATE.x0, ground, ground + 4, EDGE - 1, EDGE - 1, teak.shade);
    box(GATE.x1, GATE.x1, ground, ground + 4, EDGE - 1, EDGE - 1, teak.shade);
  },
});
