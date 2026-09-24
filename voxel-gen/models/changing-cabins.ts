import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Sand on sand is invisible, so the huts read as standing on the beach.
const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const CABIN = { w: 8, z: 2, d: 9 } as const;

const FRONT = CABIN.z + CABIN.d - 1;

const WALL = 10;

const PLATE = GROUND + WALL - 1;
const EAVES = PLATE + 1;

const DOOR = { inset: 2, w: 4, h: 8 } as const;

const CABINS: readonly { readonly x: number; readonly paint: Ramp }[] = [
  { x: 1, paint: PALETTE.bloom },
  { x: 12, paint: PALETTE.amber },
  { x: 23, paint: PALETTE.water },
];

const WALK = { z: 12, z1: 15 } as const;

export default defineModel({
  id: 'changing-cabins',
  label: 'Changing Cabins',
  category: 'amenities',
  placement: { ground: 'beach' },
  venue: {
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.3 }],
    capacity: 2,
    dwellSeconds: { min: 60, max: 180 },
    doors: [
      { x: 8, z: FRONT, facing: 0 },
      { x: 23, z: FRONT, facing: 0 },
    ],
  },
  tiles: { x: 2, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { stucco, teak, metal } = PALETTE;

    plinth(b, SLAB);

    // Flat and in one tone, so it is a single quad from above.
    box(SLAB.x, SLAB.x + SLAB.w - 1, GROUND, GROUND, WALK.z, WALK.z1, teak.shade);

    for (const cabin of CABINS) {
      const x1 = cabin.x + CABIN.w - 1;

      // Solid: a cavity would get its own inside surface and cost more triangles than it saves voxels.
      box(cabin.x, x1, GROUND, PLATE, CABIN.z, FRONT, stucco.base);
      box(cabin.x, x1, GROUND, GROUND, CABIN.z, FRONT, teak.shade);
      box(cabin.x, x1, PLATE, PLATE, CABIN.z, FRONT, stucco.light);
      for (const x of [cabin.x, x1]) {
        for (const z of [CABIN.z, FRONT]) box(x, x, GROUND, PLATE, z, z, teak.base);
      }

      gableRoof(b, {
        x: cabin.x,
        z: CABIN.z,
        w: CABIN.w,
        d: CABIN.d,
        y: EAVES,
        // One voxel rather than the usual two, which would have neighbouring roofs touching.
        overhang: 1,
        ridge: 'z',
        tile: cabin.paint,
      });

      const along = cabin.x + DOOR.inset;
      doorway(b, { face: 'z+', at: FRONT, along, y: GROUND, w: DOOR.w, h: DOOR.h });
      b.set(along + DOOR.w - 1, GROUND + 4, FRONT - 1, metal.light);
    }
  },
});
