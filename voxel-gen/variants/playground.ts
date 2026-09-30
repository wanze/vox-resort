import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 63;
const Z = 47;

const GROUND = 3;

// Four kerbed mats on a cross of paths, as the reference lays them out, each one a single
// rectangle of one colour.
const PATH = { x0: 29, x1: 34, z0: 22, z1: 25 } as const;
const MATS = {
  nw: { x0: 3, x1: 27, z0: 3, z1: 20 },
  ne: { x0: 36, x1: 60, z0: 3, z1: 20 },
  sw: { x0: 3, x1: 27, z0: 27, z1: 43 },
  se: { x0: 36, x1: 60, z0: 27, z1: 43 },
} as const;

const TOWER = { x: 6, z: 6, w: 8, d: 8 } as const;
const DECK = GROUND + 6;

const SWING = { x0: 39, x1: 57, z: 11, top: GROUND + 11 } as const;
const SWINGS = [42, 46, 50, 54] as const;

const CLIMBERS = [
  { x: TOWER.x + 2, y: DECK + 1, z: TOWER.z + 2, facing: 1 },
  { x: TOWER.x + 5, y: DECK + 1, z: TOWER.z + 2, facing: 1 },
  { x: TOWER.x + 2, y: DECK + 1, z: TOWER.z + 5, facing: 0 },
  { x: TOWER.x + 5, y: DECK + 1, z: TOWER.z + 5, facing: 0 },
] as const;

const PIT = { x0: 20, x1: 25, z0: 38, z1: 42 } as const;

const GATE = { lo: PATH.x0, hi: PATH.x1 } as const;

// On the path's north verge, backs to the path, so the parents watch the swings and the tower.
const BENCHES = [6, 18, 39, 51] as const;
const BENCH_Z = PATH.z0;

export default defineModel({
  id: 'playground-b',
  label: 'Playground B',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  // The plank is at GROUND + 3, so hips rest on GROUND + 4; the back rail is on +z.
  seats: BENCHES.flatMap(
    (x) =>
      [
        { x: x + 1, y: GROUND + 4, z: BENCH_Z, facing: 2 },
        { x: x + 4, y: GROUND + 4, z: BENCH_Z, facing: 2 },
      ] as const,
  ),
  venue: {
    shelter: 'open',
    role: 'activity',
    stage: true,
    satisfies: [
      { need: 'fun', amount: 0.9 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 12,
    dwellSeconds: { min: 900, max: 2400 },
    spots: [
      ...SWINGS.slice(0, 3).map((x) => ({
        x: x + 1,
        y: GROUND + 5,
        z: SWING.z,
        facing: 0 as const,
        pose: 'sit' as const,
      })),
      ...CLIMBERS,
      // Ground sitters are lifted by the crowd's GROUND_SIT_RISE, so the hips sit 1.5 above the sand.
      ...(
        [
          [PIT.x0, 1],
          [PIT.x1, 3],
        ] as const
      ).map(([x, facing]) => ({
        x,
        y: GROUND + 2.5,
        z: PIT.z0 + 1,
        facing,
        pose: 'sit' as const,
      })),
      {
        x: (MATS.ne.x0 + MATS.ne.x1) >> 1,
        y: GROUND + 1,
        z: MATS.ne.z1 - 3,
        facing: 2,
        for: 'animator',
      },
    ],
    doors: [{ x: GATE.lo + 2, z: Z - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, metal, sand, stone, teak, terracotta, water } = PALETTE;

    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(1, X - 1, GROUND, GROUND, 1, Z - 1, grass.base);
    box(PATH.x0, PATH.x1, GROUND, GROUND, 1, Z, stone.light);
    box(1, X - 1, GROUND, GROUND, PATH.z0, PATH.z1, stone.light);

    const mat = (m: (typeof MATS)[keyof typeof MATS], fill: number): void => {
      box(m.x0, m.x1, GROUND, GROUND, m.z0, m.z1, fill);
      box(m.x0, m.x1, GROUND + 1, GROUND + 1, m.z0, m.z0, teak.base);
      box(m.x0, m.x1, GROUND + 1, GROUND + 1, m.z1, m.z1, teak.base);
      box(m.x0, m.x0, GROUND + 1, GROUND + 1, m.z0, m.z1, teak.base);
      box(m.x1, m.x1, GROUND + 1, GROUND + 1, m.z0, m.z1, teak.base);
    };
    mat(MATS.nw, terracotta.deep);
    mat(MATS.ne, foliage.deep);
    mat(MATS.sw, foliage.deep);
    mat(MATS.se, terracotta.deep);

    // A hip rather than a gable, because the deck is square.
    const east = TOWER.x + TOWER.w - 1;
    const south = TOWER.z + TOWER.d - 1;
    for (const x of [TOWER.x, east - 1]) {
      for (const z of [TOWER.z, south - 1])
        box(x, x + 1, GROUND + 1, DECK - 1, z, z + 1, teak.base);
    }
    box(TOWER.x, east, DECK, DECK, TOWER.z, south, teak.light);
    for (const z of [TOWER.z, south]) {
      balustrade(b, {
        x: TOWER.x,
        z,
        y: DECK + 1,
        w: TOWER.w,
        along: 'x',
        height: 3,
        pitch: 3,
        rail: teak,
      });
    }
    for (const x of [TOWER.x, east]) {
      for (const z of [TOWER.z, south]) box(x, x, DECK + 1, DECK + 6, z, z, teak.base);
    }
    hipRoof(b, { ...TOWER, y: DECK + 7, overhang: 2, tile: bloom });
    for (let rung = GROUND + 2; rung < DECK; rung += 2) {
      box(TOWER.x + 2, TOWER.x + 5, rung, rung, south + 1, south + 1, amber.base);
    }
    for (const x of [TOWER.x + 2, TOWER.x + 5])
      box(x, x, GROUND + 1, DECK, south + 1, south + 1, metal.base);

    // 1:2 drop to run, the same as every step and terrace in the catalogue.
    const bed0 = TOWER.z + 2;
    const bed1 = TOWER.z + 5;
    const fall = DECK - (GROUND + 1);
    for (let step = 0; step <= fall; step++) {
      const x = east + 1 + step * 2;
      const y = DECK - step;
      box(x, x + 1, GROUND + 1, y - 1, bed0 + 1, bed1 - 1, amber.shade);
      box(x, x + 1, y, y, bed0, bed1, amber.base);
      box(x, x + 1, y + 1, y + 1, bed0, bed0, amber.base);
      box(x, x + 1, y + 1, y + 1, bed1, bed1, amber.base);
    }

    // Feet as flat plates rather than splayed legs: a diagonal on this grid is a staircase.
    for (const x of [SWING.x0, SWING.x1 - 1]) {
      box(x, x + 1, GROUND + 1, SWING.top - 1, SWING.z, SWING.z + 1, water.shade);
      box(x, x + 1, GROUND + 1, GROUND + 1, SWING.z - 3, SWING.z + 4, water.deep);
    }
    box(SWING.x0, SWING.x1, SWING.top, SWING.top + 1, SWING.z, SWING.z + 1, water.shade);
    const seats: readonly Ramp[] = [amber, bloom, amber, bloom];
    SWINGS.forEach((x, index) => {
      for (const chain of [x, x + 2]) {
        box(chain, chain, GROUND + 5, SWING.top - 1, SWING.z, SWING.z, metal.light);
      }
      box(x, x + 2, GROUND + 4, GROUND + 4, SWING.z - 1, SWING.z + 1, seats[index]!.base);
    });

    // A roundabout: an octagonal disc on a hub, with one hand bar across it.
    const round = { x: 15, z: 35 } as const;
    for (let x = round.x - 4; x <= round.x + 4; x++) {
      for (let z = round.z - 4; z <= round.z + 4; z++) {
        const dx = Math.abs(x - round.x);
        const dz = Math.abs(z - round.z);
        if (dx + dz <= 6) set(x, GROUND + 2, z, dx + dz <= 1 ? amber.base : bloom.base);
      }
    }
    box(round.x, round.x, GROUND + 1, GROUND + 1, round.z, round.z, metal.base);
    box(round.x, round.x, GROUND + 3, GROUND + 5, round.z, round.z, metal.base);
    box(round.x - 3, round.x + 3, GROUND + 5, GROUND + 5, round.z, round.z, metal.light);
    box(round.x, round.x, GROUND + 5, GROUND + 5, round.z - 3, round.z + 3, metal.light);

    box(PIT.x0, PIT.x1, GROUND, GROUND, PIT.z0, PIT.z1, sand.base);
    box(22, 23, GROUND + 1, GROUND + 2, 39, 40, bloom.base);
    for (const [z, paint] of [
      [31, bloom],
      [39, amber],
    ] as const) {
      box(6, 6, GROUND + 1, GROUND + 3, z, z, metal.base);
      box(5, 7, GROUND + 4, GROUND + 4, z - 1, z + 1, paint.base);
      box(5, 7, GROUND + 5, GROUND + 6, z - 1, z - 1, paint.shade);
    }

    // A see-saw on each side of a climbing frame, both low enough to see over.
    const seesaw = (x0: number, z: number, paint: Ramp): void => {
      box(x0 + 5, x0 + 6, GROUND + 1, GROUND + 2, z, z + 1, metal.base);
      box(x0, x0 + 3, GROUND + 2, GROUND + 2, z, z + 1, paint.base);
      box(x0 + 4, x0 + 7, GROUND + 3, GROUND + 3, z, z + 1, paint.base);
      box(x0 + 8, x0 + 11, GROUND + 4, GROUND + 4, z, z + 1, paint.base);
      for (const x of [x0 + 1, x0 + 10]) {
        const y = x === x0 + 1 ? GROUND + 3 : GROUND + 5;
        box(x, x, y, y + 1, z, z + 1, metal.light);
      }
    };
    seesaw(39, 30, amber);
    seesaw(39, 40, water);

    const frame = { x0: 53, x1: 58, z0: 30, z1: 41, top: GROUND + 8 } as const;
    for (const x of [frame.x0, frame.x1]) {
      for (const z of [frame.z0, frame.z1]) box(x, x, GROUND + 1, frame.top, z, z, metal.base);
    }
    for (const y of [GROUND + 4, frame.top]) {
      for (const x of [frame.x0, frame.x1]) box(x, x, y, y, frame.z0, frame.z1, metal.base);
    }
    for (let z = frame.z0 + 2; z < frame.z1; z += 2) {
      box(frame.x0, frame.x1, frame.top, frame.top, z, z, amber.base);
    }

    const bench = (x: number, z: number): void => {
      for (const leg of [x, x + 5]) box(leg, leg, GROUND + 1, GROUND + 2, z, z + 1, teak.deep);
      box(x, x + 5, GROUND + 3, GROUND + 3, z, z + 1, teak.base);
      box(x, x + 5, GROUND + 4, GROUND + 5, z + 1, z + 1, teak.base);
    };
    for (const x of BENCHES) bench(x, BENCH_Z);

    // A low wall rather than a hedge: the mats still read over it, and the gate is a gap in it.
    const wall = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, GROUND + 1, GROUND + 1, z0, z1, stone.base);
      box(x0, x1, GROUND + 2, GROUND + 2, z0, z1, stone.light);
    };
    wall(1, X - 1, 1, 1);
    wall(1, 1, 1, Z - 1);
    wall(X - 1, X - 1, 1, Z - 1);
    wall(1, GATE.lo - 1, Z - 1, Z - 1);
    wall(GATE.hi + 1, X - 1, Z - 1, Z - 1);

    for (const x of [GATE.lo - 3, GATE.hi + 2]) pottedPlant(b, { x, z: Z - 3, y: GROUND, size: 2 });
  },
});
