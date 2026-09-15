/**
 * Gym pavilion: an open-sided fitness pavilion under a hipped tile roof — a
 * stucco block of changing rooms along the back with a mirror across its face,
 * treadmills and bikes facing the mirror, a rack and mats at the front — and an
 * outdoor training yard beside it with a pull-up rig and plyo boxes on a rubber
 * floor. 64x48x31 (16 x 12 m plot, a 10 x 6.5 m pavilion), a 4x3 tile. The open
 * front faces +z.
 *
 * The spa pavilion's frame and roof, because the two are the resort's two
 * open-air wellness buildings and should be recognisably one family. What is
 * under the roof is drawn as flat blocks at the scale a machine actually is,
 * which at 25 cm a voxel is a handful of boxes each: a treadmill is a deck and a
 * console, a bike is a frame and a flywheel. The floor is dark rubber so the
 * machines read against it from above.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;

/** Surface of the plinth, and the course the floors are laid into. */
const GROUND = 3;
const FLOOR_Y = GROUND - 1;

/** The whole pavilion under the roof, and the changing-room block at its back. */
const FRAME = { x: 4, z: 4, w: 40, d: 26 } as const;
const FX1 = FRAME.x + FRAME.w - 1;
const FZ1 = FRAME.z + FRAME.d - 1;
const BLOCK = { x: FRAME.x, z: FRAME.z, w: FRAME.w, d: 6 } as const;
const MIRROR_Z = BLOCK.z + BLOCK.d - 1;

/** Top of the posts; the plate over them meets the block's cornice. */
const HEAD = GROUND + 11;
const PLATE = HEAD + 1;

/** The outdoor yard east of the pavilion. */
const YARD = { x0: 47, x1: 61, z0: 4, z1: 29 } as const;

/** Benches along the front of the plot, looking back into the pavilion. */
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
    doors: [{ x: 31, z: PLOT.d - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, slate, stone, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');

    // Rubber floors: dark slate under the roof, red in the yard.
    box(FRAME.x, FX1, FLOOR_Y, FLOOR_Y, FRAME.z, FZ1, slate.deep);
    box(YARD.x0, YARD.x1, FLOOR_Y, FLOOR_Y, YARD.z0, YARD.z1, terracotta.deep);

    // The changing rooms along the back, windowed on the outside and mirrored
    // across the face the machines look at.
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
    box(FX1 - 8, FX1 - 5, ground, ground + 8, MIRROR_Z + 1, MIRROR_Z + 1, teak.deep); // door

    // Posts at the front corners and the middle of the front, and the plate.
    for (const x of [FRAME.x, FRAME.x + 19, FX1 - 1]) {
      box(x, x + 1, ground, HEAD, FZ1 - 1, FZ1, teak.shade);
    }
    box(FRAME.x, FX1, PLATE, PLATE, FZ1 - 1, FZ1, teak.deep);
    for (const x of [FRAME.x, FX1 - 1]) box(x, x + 1, PLATE, PLATE, MIRROR_Z + 1, FZ1, teak.deep);

    hipRoof(b, { ...FRAME, y: PLATE + 1 });

    // Three treadmills facing the mirror: a deck, a darker belt, and a console.
    for (const x of [8, 14, 20]) {
      const z = MIRROR_Z + 3;
      box(x, x + 3, ground, ground, z, z + 7, metal.base);
      box(x + 1, x + 2, ground, ground, z + 1, z + 6, metal.deep);
      for (const post of [x, x + 3]) box(post, post, ground + 1, ground + 4, z, z, metal.base);
      box(x, x + 3, ground + 5, ground + 5, z, z + 1, slate.light);
    }

    // Three bikes beside them: a frame, a flywheel at the front, a saddle.
    for (const x of [29, 33, 37]) {
      const z = MIRROR_Z + 3;
      box(x, x + 1, ground, ground, z, z + 6, metal.deep);
      box(x, x + 1, ground + 1, ground + 3, z, z + 1, metal.base);
      box(x, x + 1, ground + 1, ground + 2, z + 5, z + 5, metal.base);
      box(x, x + 1, ground + 3, ground + 3, z + 4, z + 6, slate.deep);
      box(x - 1, x + 2, ground + 5, ground + 5, z, z, metal.shade);
    }

    // The front half: a squat rack with a loaded bar, a bench under it, three
    // mats, and a dumbbell rack down the east side.
    for (const x of [8, 15]) box(x, x, ground, ground + 9, 22, 23, metal.base);
    box(6, 17, ground + 7, ground + 7, 22, 22, metal.light);
    for (const x of [7, 16]) box(x, x, ground + 6, ground + 8, 21, 23, bloom.base);
    box(10, 13, ground, ground + 1, 24, 28, slate.deep);
    for (const [x, mat] of [
      [21, glass.shade],
      [25, bloom.shade],
      [29, foliage.light],
    ] as const) {
      box(x, x + 2, ground, ground, 21, 26, mat);
    }
    box(38, 41, ground, ground + 2, 20, 28, metal.deep);
    box(38, 41, ground + 3, ground + 3, 20, 28, metal.base);

    // The lanterns off the plate, over the two halves of the floor.
    for (const [x, z] of LANTERNS) {
      box(x, x, PLATE - 1, PLATE, z, z, teak.deep);
      b.set(x, PLATE - 2, z, LANTERN);
    }

    // The yard: a pull-up rig of four posts and three bars, and plyo boxes.
    for (const x of [49, 59]) {
      for (const z of [8, 20]) box(x, x + 1, ground, ground + 11, z, z + 1, metal.base);
      box(x, x + 1, ground + 11, ground + 11, 8, 21, metal.shade);
    }
    for (const z of [8, 14, 20]) box(49, 60, ground + 11, ground + 11, z, z, metal.light);
    box(51, 54, ground, ground + 2, 25, 27, teak.base);
    box(56, 59, ground, ground + 3, 25, 27, teak.shade);
    box(52, 53, ground, ground + 1, 12, 13, amber.shade);

    // The way in: a paved apron from the plot edge to the middle post.
    box(20, 27, FLOOR_Y, FLOOR_Y, FZ1 + 1, PLOT.d - 2, stone.shade);

    // Two benches either side of the apron, and planting at the corners.
    for (const [x0, z] of BENCHES) {
      box(x0, x0 + 11, ground, ground, z, z + 2, teak.deep);
      box(x0, x0 + 11, ground + 1, ground + 1, z, z + 2, teak.base);
      box(x0, x0 + 11, BENCH_HIPS, BENCH_HIPS + 1, z + 3, z + 3, teak.shade);
    }
    for (const x of [1, PLOT.w - 4]) pottedPlant(b, { x, z: PLOT.d - 5, y: ground, size: 3 });
    flowerBox(b, { x: YARD.x0, z: 33, y: ground, w: 15, along: 'x', blooms: [foliage.base] });
  },
});
