import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;

const GROUND = 3;
const FLOOR_Y = GROUND - 1;

const HALL = { x: 20, z: 3, w: 42, d: 22 } as const;
const HX1 = HALL.x + HALL.w - 1;
const FRONT = HALL.z + HALL.d - 1;
// Three bays of 13: piers stay 3 wide and the middle arch lands on the door.
const ARCH = { pier: 3, height: 8, rise: 3 } as const;
const LOGGIA = { x0: HALL.x + 3, x1: HX1 - 3, z0: 15, z1: FRONT - 2 } as const;
const DOOR = 39;

const PERGOLA = { x0: 2, x1: 15, z0: 4, z1: 24 } as const;
const RAFTER_Y = GROUND + 12;

const BENCHES = [29, 38] as const;
const BENCH_X = 35;
const BENCH_HIPS = GROUND + 2;

const LANTERN = PALETTE.amber.light;
const LANTERNS = [
  [9, 16],
  [DOOR + 2, 19],
] as const;

export default defineModel({
  id: 'gym-pavilion-b',
  label: 'Gym Pavilion B',
  category: 'leisure',
  tiles: { x: 4, z: 3 },
  emissive: [LANTERN],
  windows: WINDOW_GLASS,
  lights: LANTERNS.map(
    ([x, z]) => ({ x, y: GROUND + 9, z, color: LANTERN, intensity: 60, distance: 40 }) as const,
  ),
  seats: BENCHES.flatMap((z0) =>
    [z0 + 1, z0 + 5].map((z) => ({ x: BENCH_X + 1, y: BENCH_HIPS, z, facing: 3 as const })),
  ),
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.4 },
      { need: 'energy', amount: -0.5 },
    ],
    capacity: 12,
    dwellSeconds: { min: 1800, max: 3600 },
    doors: [{ x: DOOR + 2, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { amber, bloom, foliage, glass, grass, metal, slate, stone, teak, terracotta, thatch } =
      PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');

    const eaves = stuccoWall(b, { ...HALL, y: ground, storeys: 1 });
    arcade(b, {
      ...ARCH,
      x: HALL.x,
      z: FRONT - 1,
      w: HALL.w,
      d: 2,
      y: ground,
      along: 'x',
      bays: 3,
    });
    // The loggia keeps the wall's top two courses as its ceiling, so the roof never shows its underside.
    for (let x = LOGGIA.x0; x <= LOGGIA.x1; x++) {
      for (let y = ground; y <= eaves - 4; y++) {
        for (let z = LOGGIA.z0; z <= LOGGIA.z1; z++) b.del(x, y, z);
      }
    }
    box(LOGGIA.x0, LOGGIA.x1, FLOOR_Y, FLOOR_Y, LOGGIA.z0, FRONT, teak.base);
    gableRoof(b, { ...HALL, y: eaves, ridge: 'x', overhang: 1 });

    const hallFront = LOGGIA.z0 - 1;
    doorway(b, { face: 'z+', at: hallFront, along: DOOR, y: ground, w: 4 });
    for (const along of [26, 50]) {
      shutteredWindow(b, {
        face: 'z+',
        at: hallFront,
        along,
        y: ground + 3,
        w: 6,
        h: 6,
        shutters: false,
      });
    }
    for (const along of [7, 17]) {
      shutteredWindow(b, { face: 'x-', at: HALL.x, along, y: ground + 4 });
    }
    for (const along of [30, 48]) {
      shutteredWindow(b, { face: 'z-', at: HALL.z, along, y: ground + 6, w: 5, h: 3 });
    }

    for (const x of [24, 28]) {
      const z = LOGGIA.z0 + 1;
      box(x, x + 2, ground, ground, z, z + 5, metal.deep);
      for (const post of [x, x + 2])
        box(post, post, ground + 1, ground + 4, z + 5, z + 5, metal.base);
      box(x, x + 2, ground + 5, ground + 5, z + 4, z + 5, slate.light);
    }
    for (const x of [51, 55]) {
      const z = LOGGIA.z0 + 1;
      box(x, x + 1, ground, ground, z, z + 5, metal.deep);
      box(x, x + 1, ground + 1, ground + 2, z + 1, z + 1, metal.base);
      box(x, x + 1, ground + 3, ground + 3, z, z + 2, slate.deep);
      box(x, x + 1, ground + 1, ground + 4, z + 5, z + 5, metal.base);
      box(x - 1, x + 2, ground + 5, ground + 5, z + 5, z + 5, metal.shade);
    }

    box(
      PERGOLA.x0 - 1,
      PERGOLA.x1 + 1,
      FLOOR_Y,
      FLOOR_Y,
      PERGOLA.z0 - 2,
      PERGOLA.z1 + 2,
      terracotta.deep,
    );
    for (const x of [PERGOLA.x0, PERGOLA.x1 - 1]) {
      for (const z of [PERGOLA.z0, PERGOLA.z1 - 1]) {
        box(x, x + 1, ground, RAFTER_Y - 2, z, z + 1, teak.shade);
      }
      box(x, x + 1, RAFTER_Y - 1, RAFTER_Y - 1, PERGOLA.z0 - 1, PERGOLA.z1 + 1, teak.deep);
    }
    for (let z = PERGOLA.z0; z <= PERGOLA.z1; z += 5) {
      box(PERGOLA.x0 - 1, PERGOLA.x1 + 1, RAFTER_Y, RAFTER_Y, z, z, teak.base);
    }
    box(5, 5, ground + 9, RAFTER_Y - 1, 9, 9, metal.base);
    box(5, 6, ground + 3, ground + 8, 9, 10, bloom.shade);
    box(7, 7, ground, RAFTER_Y - 1, 19, 19, thatch.light);
    box(9, 12, ground, ground + 2, 5, 7, teak.base);
    box(10, 12, ground + 3, ground + 4, 5, 7, teak.light);

    for (const [x, z] of LANTERNS) {
      const top = x === LANTERNS[0][0] ? RAFTER_Y - 1 : eaves - 4;
      box(x, x, GROUND + 10, top, z, z, teak.deep);
      set(x, GROUND + 9, z, LANTERN);
    }

    box(1, BENCH_X - 2, FLOOR_Y, FLOOR_Y, 29, PLOT.d - 3, grass.base);
    for (const [x, mat] of [
      [5, glass.shade],
      [12, bloom.shade],
      [19, foliage.light],
      [26, amber.shade],
    ] as const) {
      box(x, x + 3, ground, ground, 32, 40, mat);
    }

    box(DOOR - 1, DOOR + 4, FLOOR_Y, FLOOR_Y, FRONT + 1, PLOT.d - 1, stone.light);
    steps(b, { x: DOOR - 1, z: PLOT.d - 4, w: 6, y: FLOOR_Y, treads: 2, descends: 'z+' });
    for (let x = DOOR - 1; x <= DOOR + 4; x++) {
      for (const z of [PLOT.d - 2, PLOT.d - 1]) b.del(x, FLOOR_Y, z);
    }
    for (const x of [DOOR - 4, DOOR + 6]) pottedPlant(b, { x, z: FRONT + 3, y: ground, size: 2 });

    for (const z0 of BENCHES) {
      box(BENCH_X, BENCH_X + 2, ground, ground + 1, z0, z0 + 6, teak.base);
      box(BENCH_X + 3, BENCH_X + 3, BENCH_HIPS, BENCH_HIPS + 1, z0, z0 + 6, teak.shade);
    }

    box(47, 61, FLOOR_Y, FLOOR_Y, 30, 41, terracotta.deep);
    box(58, 60, ground, ground + 2, 31, 40, metal.deep);
    for (const z of [32, 37]) box(58, 60, ground + 3, ground + 3, z, z + 1, metal.base);
    box(51, 52, ground, ground + 1, 33, 38, metal.shade);
    box(50, 53, ground + 2, ground + 2, 33, 38, teak.shade);
    box(48, 50, ground, ground + 2, 40, 41, teak.base);

    flowerBox(b, {
      x: 1,
      z: PLOT.d - 2,
      y: ground,
      w: BENCH_X - 3,
      along: 'x',
      blooms: [foliage.base],
    });
    flowerBox(b, { x: 47, z: PLOT.d - 3, y: ground, w: 15, along: 'x', blooms: [bloom.base] });
  },
});
