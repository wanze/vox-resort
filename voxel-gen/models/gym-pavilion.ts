import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;

const GROUND = 3;
const FLOOR_Y = GROUND - 1;

const FRAME = { x: 4, z: 4, w: 40, d: 26 } as const;
const FX1 = FRAME.x + FRAME.w - 1;
const FZ1 = FRAME.z + FRAME.d - 1;
const BLOCK = { x: FRAME.x, z: FRAME.z, w: FRAME.w, d: 6 } as const;
const MIRROR_Z = BLOCK.z + BLOCK.d - 1;

const HEAD = GROUND + 11;
const PLATE = HEAD + 1;

const PULL_UP = { x0: 8, x1: 15, z: 22 } as const;
const MATS = [21, 25, 29] as const;
const MAT_Z = { z0: 21, z1: 26 } as const;
const RACK = { x0: 38, x1: 41, z0: 20, z1: 28 } as const;

const YARD = { x0: 47, x1: 61, z0: 4, z1: 29 } as const;
const RIG = { x0: 49, x1: 60, z0: 8, z1: 21 } as const;

const ATHLETES = [
  { x: (PULL_UP.x0 + PULL_UP.x1) >> 1, y: GROUND, z: PULL_UP.z, facing: 0 },
  ...[MATS[0], MATS[2]].map((x) => ({
    x: x + 1,
    y: GROUND + 1,
    z: MAT_Z.z0 + 2,
    facing: 2 as const,
  })),
  { x: RACK.x0 - 2, y: GROUND, z: (RACK.z0 + RACK.z1) / 2, facing: 1 },
  ...[RIG.x0 + 3, RIG.x1 - 3].flatMap((x) => [
    { x, y: GROUND, z: RIG.z1 - 4, facing: 2 as const },
    { x, y: GROUND, z: YARD.z1 - 6, facing: 0 as const },
  ]),
] as const;

const BENCHES = [
  [6, 36],
  [30, 36],
] as const;
const BENCH_HIPS = GROUND + 2;

const LANTERN = PALETTE.amber.light;
const LANTERNS = [
  [14, 20],
  [34, 20],
] as const;

export default defineModel({
  id: 'gym-pavilion',
  label: 'Gym Pavilion',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: LANTERNS.map(
    ([x, z]) => ({ x, y: PLATE - 2, z, color: LANTERN, intensity: 60, distance: 40 }) as const,
  ),
  seats: BENCHES.flatMap(([x0, z]) =>
    [x0 + 3, x0 + 8].map((x) => ({ x, y: BENCH_HIPS, z: z + 1, facing: 2 as const })),
  ),
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.4 },
      { need: 'energy', amount: -0.5 },
    ],
    capacity: 12,
    dwellSeconds: { min: 1800, max: 3600 },
    spots: ATHLETES,
    doors: [{ x: 31, z: PLOT.d - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, slate, stone, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');

    box(FRAME.x, FX1, FLOOR_Y, FLOOR_Y, FRAME.z, FZ1, slate.deep);
    box(YARD.x0, YARD.x1, FLOOR_Y, FLOOR_Y, YARD.z0, YARD.z1, terracotta.deep);

    const cornice = stuccoWall(b, { ...BLOCK, y: ground, storeys: 1 });
    if (cornice !== PLATE + 1) throw new Error('The plate must meet the block cornice');
    for (const along of [10, 30]) {
      shutteredWindow(b, {
        face: 'z-',
        at: BLOCK.z,
        along,
        y: ground + 6,
        w: 6,
        h: 3,
        shutters: false,
      });
    }
    box(FRAME.x + 4, FX1 - 12, ground + 3, ground + 9, MIRROR_Z + 1, MIRROR_Z + 1, glass.light);
    box(FX1 - 8, FX1 - 5, ground, ground + 8, MIRROR_Z + 1, MIRROR_Z + 1, teak.deep);

    for (const x of [FRAME.x, FRAME.x + 19, FX1 - 1]) {
      box(x, x + 1, ground, HEAD, FZ1 - 1, FZ1, teak.shade);
    }
    box(FRAME.x, FX1, PLATE, PLATE, FZ1 - 1, FZ1, teak.deep);
    for (const x of [FRAME.x, FX1 - 1]) box(x, x + 1, PLATE, PLATE, MIRROR_Z + 1, FZ1, teak.deep);

    hipRoof(b, { ...FRAME, y: PLATE + 1 });

    for (const x of [8, 14, 20]) {
      const z = MIRROR_Z + 3;
      box(x, x + 3, ground, ground, z, z + 7, metal.base);
      box(x + 1, x + 2, ground, ground, z + 1, z + 6, metal.deep);
      for (const post of [x, x + 3]) box(post, post, ground + 1, ground + 4, z, z, metal.base);
      box(x, x + 3, ground + 5, ground + 5, z, z + 1, slate.light);
    }

    for (const x of [29, 33, 37]) {
      const z = MIRROR_Z + 3;
      box(x, x + 1, ground, ground, z, z + 6, metal.deep);
      box(x, x + 1, ground + 1, ground + 3, z, z + 1, metal.base);
      box(x, x + 1, ground + 1, ground + 2, z + 5, z + 5, metal.base);
      box(x, x + 1, ground + 3, ground + 3, z + 4, z + 6, slate.deep);
      box(x - 1, x + 2, ground + 5, ground + 5, z, z, metal.shade);
    }

    for (const x of [PULL_UP.x0, PULL_UP.x1]) {
      box(x, x, ground, ground + 9, PULL_UP.z, PULL_UP.z + 1, metal.base);
    }
    box(6, 17, ground + 7, ground + 7, 22, 22, metal.light);
    for (const x of [7, 16]) box(x, x, ground + 6, ground + 8, 21, 23, bloom.base);
    box(10, 13, ground, ground + 1, 24, 28, slate.deep);
    const mats = [glass.shade, bloom.shade, foliage.light] as const;
    MATS.forEach((x, i) => box(x, x + 2, ground, ground, MAT_Z.z0, MAT_Z.z1, mats[i]!));
    box(RACK.x0, RACK.x1, ground, ground + 2, RACK.z0, RACK.z1, metal.deep);
    box(RACK.x0, RACK.x1, ground + 3, ground + 3, RACK.z0, RACK.z1, metal.base);

    for (const [x, z] of LANTERNS) {
      box(x, x, PLATE - 1, PLATE, z, z, teak.deep);
      b.set(x, PLATE - 2, z, LANTERN);
    }

    for (const x of [RIG.x0, RIG.x1 - 1]) {
      for (const z of [RIG.z0, RIG.z1 - 1])
        box(x, x + 1, ground, ground + 11, z, z + 1, metal.base);
      box(x, x + 1, ground + 11, ground + 11, RIG.z0, RIG.z1, metal.shade);
    }
    for (const z of [RIG.z0, (RIG.z0 + RIG.z1 - 1) / 2, RIG.z1 - 1]) {
      box(RIG.x0, RIG.x1, ground + 11, ground + 11, z, z, metal.light);
    }
    box(51, 54, ground, ground + 2, 25, 27, teak.base);
    box(56, 59, ground, ground + 3, 25, 27, teak.shade);
    box(52, 53, ground, ground + 1, 12, 13, amber.shade);

    box(20, 27, FLOOR_Y, FLOOR_Y, FZ1 + 1, PLOT.d - 2, stone.shade);

    for (const [x0, z] of BENCHES) {
      box(x0, x0 + 11, ground, ground, z, z + 2, teak.deep);
      box(x0, x0 + 11, ground + 1, ground + 1, z, z + 2, teak.base);
      box(x0, x0 + 11, BENCH_HIPS, BENCH_HIPS + 1, z + 3, z + 3, teak.shade);
    }
    for (const x of [1, PLOT.w - 4]) pottedPlant(b, { x, z: PLOT.d - 5, y: ground, size: 3 });
    flowerBox(b, { x: YARD.x0, z: 33, y: ground, w: 15, along: 'x', blooms: [foliage.base] });
  },
});
