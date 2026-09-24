import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 63;
const Z = 47;

const GROUND = 3;

const LAWN = { x0: 1, x1: 62, z0: 1, z1: 46 } as const;

// One rectangle of one colour, so the whole mat is two triangles.
const MAT = { x0: 5, x1: 58, z0: 5, z1: 30 } as const;

const PIT = { x0: 5, x1: 24, z0: 33, z1: 42 } as const;

const TOWER = { x: 7, z: 10, w: 8, d: 8 } as const;
const DECK = GROUND + 7;

const SWING = { x0: 34, x1: 50, z0: 11, top: GROUND + 11 } as const;

const SWINGS = [38, 42, 46] as const;

const BARS = { x0: 37, x1: 54, z0: 22, z1: 27, top: GROUND + 9 } as const;
const RUNGS = [41, 44, 47, 50] as const;

const GATE = { lo: 29, hi: 34 } as const;

const BENCHES = [
  [51, 7],
  [28, 36],
  [38, 36],
  [48, 36],
] as const;

export default defineModel({
  id: 'playground',
  label: 'Playground',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  // The plank is at GROUND + 3, so hips rest on GROUND + 4; the back rail is on +z,
  // so everybody faces -z.
  seats: BENCHES.flatMap(
    ([x, z]) =>
      [
        { x: x + 1, y: GROUND + 4, z, facing: 2 },
        { x: x + 4, y: GROUND + 4, z, facing: 2 },
      ] as const,
  ),
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.9 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 12,
    dwellSeconds: { min: 900, max: 2400 },
    doors: [{ x: GATE.lo + 2, z: LAWN.z1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, metal, sand, teak } = PALETTE;

    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(LAWN.x0, LAWN.x1, GROUND, GROUND, LAWN.z0, LAWN.z1, grass.base);

    const bed = (
      x0: number,
      x1: number,
      z0: number,
      z1: number,
      fill: number,
      kerb: number,
    ): void => {
      box(x0, x1, GROUND, GROUND, z0, z1, fill);
      box(x0, x1, GROUND + 1, GROUND + 1, z0, z0, kerb);
      box(x0, x1, GROUND + 1, GROUND + 1, z1, z1, kerb);
      box(x0, x0, GROUND + 1, GROUND + 1, z0, z1, kerb);
      box(x1, x1, GROUND + 1, GROUND + 1, z0, z1, kerb);
    };

    bed(MAT.x0, MAT.x1, MAT.z0, MAT.z1, PALETTE.terracotta.deep, teak.base);
    bed(PIT.x0, PIT.x1, PIT.z0, PIT.z1, sand.base, teak.base);

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
      for (const z of [TOWER.z, south]) box(x, x, DECK + 1, DECK + 5, z, z, teak.base);
    }
    hipRoof(b, { ...TOWER, y: DECK + 6, overhang: 2 });

    for (const z of [TOWER.z + 2, TOWER.z + 4])
      box(TOWER.x - 1, TOWER.x - 1, GROUND + 1, DECK, z, z, metal.base);
    for (let rung = GROUND + 2; rung <= DECK; rung += 2)
      box(TOWER.x - 1, TOWER.x - 1, rung, rung, TOWER.z + 2, TOWER.z + 4, metal.light);

    // 1:2 drop to run, the same as every step and terrace in the catalogue.
    const chute = (from: number): void => {
      const bed0 = TOWER.z + 2;
      const bed1 = TOWER.z + 5;
      const fall = DECK - (GROUND + 1);
      for (let step = 0; step <= fall; step++) {
        const x = from + step;
        const y = DECK - step;
        box(x, x, GROUND + 1, y, bed0, bed1, bloom.shade);
        box(x, x, y, y, bed0, bed1, bloom.base);
        set(x, y + 1, bed0 - 1, bloom.base);
        set(x, y + 1, bed1 + 1, bloom.base);
      }
      box(from + fall + 1, from + fall + 3, GROUND + 1, GROUND + 1, bed0, bed1, bloom.base);
    };
    chute(east + 1);

    // Feet as flat plates rather than splayed legs: a diagonal on this grid is a
    // staircase that costs about what a dithered plane does.
    const beam = SWING.z0;
    for (const x of [SWING.x0, SWING.x1 - 1]) {
      box(x, x + 1, GROUND + 1, SWING.top - 1, beam, beam + 1, metal.base);
      box(x, x + 1, GROUND + 1, GROUND + 1, beam - 3, beam + 4, metal.deep);
    }
    box(SWING.x0, SWING.x1, SWING.top, SWING.top + 1, beam, beam + 1, metal.base);
    for (const x of SWINGS) {
      for (const chain of [x, x + 2])
        box(chain, chain, GROUND + 5, SWING.top - 1, beam, beam, metal.light);
      box(x, x + 2, GROUND + 4, GROUND + 4, beam - 1, beam + 1, amber.base);
    }

    for (const x of [BARS.x0, BARS.x1 - 1]) {
      for (const z of [BARS.z0, BARS.z1 - 1])
        box(x, x + 1, GROUND + 1, BARS.top - 1, z, z, metal.base);
    }
    for (const z of [BARS.z0, BARS.z1 - 1])
      box(BARS.x0, BARS.x1, BARS.top, BARS.top, z, z, metal.base);
    for (const x of RUNGS) box(x, x, BARS.top, BARS.top, BARS.z0 + 1, BARS.z1 - 1, amber.base);
    for (let rung = GROUND + 3; rung < BARS.top; rung += 2)
      box(BARS.x0, BARS.x0 + 1, rung, rung, BARS.z0, BARS.z1 - 1, amber.base);

    const springer = (x: number, z: number, paint: Ramp): void => {
      box(x, x, GROUND + 1, GROUND + 3, z, z, metal.base);
      box(x - 1, x + 1, GROUND + 4, GROUND + 4, z - 1, z + 1, paint.base);
      box(x - 1, x + 1, GROUND + 5, GROUND + 6, z - 1, z - 1, paint.shade);
    };
    springer(11, 26, bloom);
    springer(19, 26, amber);
    springer(27, 26, bloom);

    const bench = (x: number, z: number): void => {
      for (const leg of [x, x + 5]) box(leg, leg, GROUND + 1, GROUND + 2, z, z + 1, teak.deep);
      box(x, x + 5, GROUND + 3, GROUND + 3, z, z + 1, teak.base);
      box(x, x + 5, GROUND + 4, GROUND + 5, z + 1, z + 1, teak.base);
    };
    for (const [x, z] of BENCHES) bench(x, z);

    parasol(b, { x: (PIT.x0 + PIT.x1) >> 1, z: (PIT.z0 + PIT.z1) >> 1, y: GROUND, reach: 3 });

    const clipped = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GROUND + 1, GROUND + 3, z0, z1, foliage.base);
    clipped(LAWN.x0 + 1, LAWN.x1 - 1, LAWN.z0 + 1, LAWN.z0 + 2);
    clipped(LAWN.x0 + 1, GATE.lo - 1, LAWN.z1 - 2, LAWN.z1 - 1);
    clipped(GATE.hi + 1, LAWN.x1 - 1, LAWN.z1 - 2, LAWN.z1 - 1);
    clipped(LAWN.x0 + 1, LAWN.x0 + 2, LAWN.z0 + 1, LAWN.z1 - 1);
    clipped(LAWN.x1 - 2, LAWN.x1 - 1, LAWN.z0 + 1, LAWN.z1 - 1);

    for (const x of [GATE.lo - 3, GATE.hi + 1]) pottedPlant(b, { x, z: LAWN.z1 - 2, y: GROUND });
    for (const x of [28, 38, 48]) {
      flowerBox(b, { x, z: 32, y: GROUND, w: 6, along: 'x', blooms: [foliage.base] });
    }
    for (const z of [PIT.z0, PIT.z1 - 1]) pottedPlant(b, { x: PIT.x1 + 3, z, y: GROUND });
  },
});
