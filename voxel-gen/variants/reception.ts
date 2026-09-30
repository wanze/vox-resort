import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLOT = { w: 64, d: 48 } as const;

const HALL = { x: 22, z: 4, w: 20, d: 24 } as const;
const HALL_FRONT = HALL.z + HALL.d - 1;
const WINGS = [
  { x: 4, z: 6, w: 18, d: 20 },
  { x: 42, z: 6, w: 18, d: 20 },
] as const;
const WING_FRONT = WINGS[0].z + WINGS[0].d - 1;

const PORCH = { x0: 24, x1: 39, z0: HALL_FRONT + 1, z1: HALL_FRONT + 8 } as const;
const DOOR = { x: 29, w: 6 } as const;
const DESKS = [DOOR.x + DOOR.w / 2, PORCH.x0 + 2, PORCH.x1 - 2] as const;

const GROUND = 3;

const BENCH = { z: WING_FRONT + 2, z1: WING_FRONT + 4 } as const;
const BENCH_HIPS = GROUND + 2;
// Mirrored about the plot's centre line, like everything else on the front.
const BENCHES = [10, PLOT.w - 16] as const;

const ISLAND = { x0: 26, x1: 37, z0: 38, z1: 45 } as const;

const SIGN = PALETTE.amber.light;

export default defineModel({
  id: 'reception-b',
  label: 'Reception B',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  // Every tycoon resort must buy one, and it sells nothing.
  cost: 600,
  emissive: [SIGN],
  windows: WINDOW_GLASS,
  lights: [{ x: 32, y: 12, z: 44, color: SIGN, intensity: 90, distance: 50 }],
  seats: BENCHES.flatMap((x0) =>
    [x0 + 1, x0 + 4].map((x) => ({ x, y: BENCH_HIPS, z: BENCH.z + 1, facing: 0 as const })),
  ),
  venue: {
    role: 'service',
    capacity: 12,
    dwellSeconds: { min: 120, max: 480 },
    spots: DESKS.map((x) => ({ x, y: GROUND, z: PORCH.z0 + 3, facing: 2 as const })),
    doors: [{ x: 31, z: HALL_FRONT, facing: 0 }],
    receives: true,
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, grass, metal, stone, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: PLOT.w, d: PLOT.d });
    if (ground !== GROUND) throw new Error('The plinth moved under the benches');

    box(1, PLOT.w - 2, ground - 1, ground - 1, WING_FRONT + 1, PLOT.d - 2, grass.base);
    box(1, PLOT.w - 2, ground - 1, ground - 1, WING_FRONT + 1, BENCH.z1 + 2, stone.light);
    box(PORCH.x0 - 2, PORCH.x1 + 2, ground - 1, ground - 1, PORCH.z0, PLOT.d - 2, stone.shade);
    box(PORCH.x0, PORCH.x1, ground - 1, ground - 1, PORCH.z0, PORCH.z1, stone.light);

    // The wings go first so the hall's solid body swallows the ends of their roofs.
    for (const wing of WINGS) {
      const eaves = stuccoWall(b, { ...wing, y: ground, storeys: 1 });
      gableRoof(b, { ...wing, y: eaves, ridge: 'x' });
      const left = wing.x;
      const right = wing.x + wing.w - 1;
      const outer = left < HALL.x ? left : right;
      for (const along of [left + 2, right - 4]) {
        shutteredWindow(b, { face: 'z+', at: WING_FRONT, along, y: ground + 4, w: 3, h: 5 });
      }
      shutteredWindow(b, {
        face: outer === left ? 'x-' : 'x+',
        at: outer,
        along: wing.z + wing.d / 2 - 2,
        y: ground + 4,
        w: 4,
        h: 5,
      });
    }

    const eaves = stuccoWall(b, { ...HALL, y: ground, storeys: 2 });
    gableRoof(b, { ...HALL, y: eaves, ridge: 'z' });
    const upper = ground + STOREY_VOXELS;

    doorway(b, {
      face: 'z+',
      at: HALL_FRONT,
      along: DOOR.x,
      y: ground,
      w: DOOR.w,
      h: 9,
      timber: glass,
    });
    doorway(b, { face: 'z+', at: HALL_FRONT, along: 30, y: upper, w: 4, h: 8, timber: glass });
    for (const along of [24, 37]) {
      shutteredWindow(b, { face: 'z+', at: HALL_FRONT, along, y: ground + 3, w: 3, h: 6 });
      shutteredWindow(b, { face: 'z+', at: HALL_FRONT, along, y: upper + 3, w: 3, h: 5 });
    }

    // The porch roof is the upper floor's balcony, so it lands on the hall's floor band.
    const deck = upper;
    for (const x of [PORCH.x0, PORCH.x1 - 1]) {
      box(x, x + 1, ground, ground, PORCH.z1 - 1, PORCH.z1, stone.base);
      box(x, x + 1, ground + 1, deck - 3, PORCH.z1 - 1, PORCH.z1, stucco.light);
    }
    box(PORCH.x0, PORCH.x1, deck - 2, deck - 1, PORCH.z0, PORCH.z1, stone.light);
    balustrade(b, {
      x: PORCH.x0,
      z: PORCH.z1,
      y: deck,
      w: PORCH.x1 - PORCH.x0 + 1,
      along: 'x',
      pitch: 4,
    });
    // Solid cheeks: seen end-on from the camera, balusters there would cost more than they show.
    for (const x of [PORCH.x0, PORCH.x1]) {
      box(x, x, deck, deck + 2, PORCH.z0, PORCH.z1 - 1, stucco.base);
      box(x, x, deck + 3, deck + 3, PORCH.z0, PORCH.z1 - 1, stone.light);
    }
    for (const x of [PORCH.x0 + 2, PORCH.x1 - 2]) {
      b.set(x, deck - 3, PORCH.z1 - 1, SIGN);
    }

    for (const x0 of BENCHES) {
      const x1 = x0 + 5;
      box(x0, x1, ground, ground, BENCH.z, BENCH.z1, teak.deep);
      box(x0, x1, ground + 1, ground + 1, BENCH.z, BENCH.z1, teak.base);
      box(x0, x1, BENCH_HIPS, BENCH_HIPS + 1, BENCH.z - 1, BENCH.z - 1, teak.shade);
      box(x0, x1, BENCH_HIPS + 2, BENCH_HIPS + 2, BENCH.z - 1, BENCH.z - 1, teak.light);

      // A vine pergola off the wing, so the benches wait in shade under the eaves.
      const beam = ground + 10;
      const post = BENCH.z1 + 1;
      for (const x of [x0 - 1, x1 + 1]) {
        box(x, x, ground, beam - 1, post, post, teak.base);
      }
      box(x0 - 1, x1 + 1, beam, beam, WING_FRONT + 1, post, teak.shade);
      box(x0 - 1, x1 + 1, beam + 1, beam + 1, WING_FRONT + 1, post, foliage.base);
    }

    box(ISLAND.x0 + 1, ISLAND.x1 - 1, ground, ground, ISLAND.z0, ISLAND.z1, stone.light);
    box(ISLAND.x0, ISLAND.x1, ground, ground, ISLAND.z0 + 1, ISLAND.z1 - 1, stone.light);
    box(
      ISLAND.x0 + 2,
      ISLAND.x1 - 2,
      ground + 1,
      ground + 1,
      ISLAND.z0 + 1,
      ISLAND.z1 - 1,
      foliage.base,
    );
    box(
      ISLAND.x0 + 1,
      ISLAND.x1 - 1,
      ground + 1,
      ground + 1,
      ISLAND.z0 + 2,
      ISLAND.z1 - 2,
      foliage.base,
    );
    for (const x of [ISLAND.x0 + 2, ISLAND.x1 - 3]) {
      box(x, x + 1, ground + 2, ground + 2, ISLAND.z0 + 2, ISLAND.z1 - 2, bloom.base);
    }
    box(29, 34, ground + 1, ground + 2, 41, 42, stone.base);
    box(29, 34, ground + 3, ground + 7, 42, 42, metal.base);
    box(30, 33, ground + 4, ground + 6, 43, 43, SIGN);

    for (const x of [PORCH.x0 - 4, PORCH.x1 + 2]) {
      pottedPlant(b, { x, z: PORCH.z1 - 2, y: ground, size: 3 });
    }
    for (const [x0, x1] of [
      [2, 20],
      [43, 61],
    ] as const) {
      box(x0, x1, ground, ground + 1, PLOT.d - 4, PLOT.d - 3, foliage.base);
      // Oleander: flowers in clumps on the hedge top, since a continuous band reads as a kerb.
      for (let x = x0 + 2; x + 2 < x1; x += 6) {
        box(x, x + 2, ground + 2, ground + 2, PLOT.d - 4, PLOT.d - 3, bloom.base);
      }
    }
  },
});
