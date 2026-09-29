// Symmetric front to back like the original: the same gate stands at both ends of the promenade.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { gableRoof, hipRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 63;
const NZ = 15;

// Two layers so the promenade runs straight through without a step.
const GROUND = 2;

const ROAD = { x0: 16, x1: 47 } as const;
const ARCH = { x: 8, z: 3, w: 48, d: 10, height: 12, pier: 8 } as const;
const SPRINGING = GROUND + ARCH.height;

const PIER = { x0: 8, x1: 15, z0: 2, z1: 13 } as const;
const ATTIC = { z0: 4, z1: 11 } as const;
const PIER_TOP = 36;

const SCONCE = { x0: 11, x1: 12, y: 18 } as const;
const HANG = { x0: 31, x1: 32, z0: 7, z1: 8, y: 18 } as const;

const LANTERN = PALETTE.amber.light;

const mirror = (x: number): number => NX - x;

export default defineModel({
  id: 'entrance-b',
  label: 'Entrance B',
  category: 'amenities',
  tiles: { x: 4, z: 1 },
  gateway: true,
  emissive: [LANTERN],
  lights: [
    // One per pier rather than per sconce: both faces of a pier are one lamp once baked.
    { x: 11, y: SCONCE.y + 1, z: 8, color: LANTERN, intensity: 60, distance: 40 },
    { x: mirror(11), y: SCONCE.y + 1, z: 8, color: LANTERN, intensity: 60, distance: 40 },
    { x: 32, y: HANG.y, z: 8, color: LANTERN, intensity: 110, distance: 60 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, grass, metal, sand, stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, { x: 0, z: 0, w: NX + 1, d: NZ + 1, height: GROUND });
    box(ROAD.x0, ROAD.x1, GROUND - 1, GROUND - 1, 0, NZ, stone.light);

    const crown = arcade(b, {
      ...ARCH,
      y: GROUND,
      along: 'x',
      bays: 1,
      wall: sand,
      trim: stone,
    });

    const pier = (x0: number, x1: number): void => {
      box(x0 - 1, x1 + 1, GROUND, GROUND + 1, PIER.z0 - 1, PIER.z1 + 1, stone.shade);
      box(x0, x1, GROUND + 2, PIER_TOP, PIER.z0, PIER.z1, sand.base);
      box(x0, x1, SPRINGING - 1, SPRINGING - 1, PIER.z0, PIER.z1, stone.light);
      box(x0 - 1, x1 + 1, PIER_TOP + 1, PIER_TOP + 1, PIER.z0 - 1, PIER.z1 + 1, stone.light);
      hipRoof(b, {
        x: x0,
        z: PIER.z0,
        w: x1 - x0 + 1,
        d: PIER.z1 - PIER.z0 + 1,
        y: PIER_TOP + 2,
        overhang: 1,
        tile: terracotta,
      });
    };
    pier(PIER.x0, PIER.x1);
    pier(mirror(PIER.x1), mirror(PIER.x0));

    const atticTop = crown + 5;
    box(ROAD.x0, ROAD.x1, crown, atticTop, ATTIC.z0, ATTIC.z1, sand.base);
    box(ROAD.x0, ROAD.x1, atticTop, atticTop, ATTIC.z0, ATTIC.z1, sand.light);
    gableRoof(b, {
      x: ROAD.x0,
      z: ATTIC.z0,
      w: ROAD.x1 - ROAD.x0 + 1,
      d: ATTIC.z1 - ATTIC.z0 + 1,
      y: atticTop + 1,
      ridge: 'x',
      overhang: 1,
      tile: terracotta,
    });

    // The nameplate stands proud on the arch's ledge, blank because lettering does not fit the grid.
    for (const z of [ATTIC.z0 - 1, ATTIC.z1 + 1]) {
      box(22, mirror(22), crown, atticTop, z, z, teak.shade);
      box(23, mirror(23), crown + 1, atticTop - 1, z, z, stucco.light);
    }

    for (const [x0, x1] of [
      [SCONCE.x0, SCONCE.x1],
      [mirror(SCONCE.x1), mirror(SCONCE.x0)],
    ] as const) {
      for (const z of [PIER.z0 - 1, PIER.z1 + 1]) {
        box(x0, x1, SCONCE.y - 1, SCONCE.y - 1, z, z, metal.deep);
        box(x0, x1, SCONCE.y, SCONCE.y + 1, z, z, LANTERN);
        box(x0, x1, SCONCE.y + 2, SCONCE.y + 2, z, z, metal.deep);
      }
    }

    box(HANG.x0, HANG.x1, HANG.y + 4, crown - 3, HANG.z0, HANG.z1, metal.deep);
    box(HANG.x0 - 1, HANG.x1 + 1, HANG.y + 3, HANG.y + 3, HANG.z0 - 1, HANG.z1 + 1, metal.deep);
    box(HANG.x0, HANG.x1, HANG.y, HANG.y + 2, HANG.z0, HANG.z1, LANTERN);
    box(HANG.x0, HANG.x1, HANG.y - 1, HANG.y - 1, HANG.z0, HANG.z1, metal.deep);

    // Folded back flat against the piers: a leaf standing open across the road would block it.
    const leaf = (x0: number): void => {
      const x1 = x0 + 1;
      const top = GROUND + 12;
      for (const z of [ATTIC.z0, 6, 8, 10, ATTIC.z1]) box(x0, x1, GROUND, top, z, z, metal.deep);
      for (const y of [GROUND + 1, GROUND + 7, top]) {
        box(x0, x1, y, y, ATTIC.z0, ATTIC.z1, metal.shade);
      }
      for (const z of [5, 7, 9]) box(x0, x1, top + 1, top + 1, z, z, metal.shade);
    };
    leaf(ROAD.x0);
    leaf(mirror(ROAD.x0) - 1);

    // A palm in a bed at each end, kept short of the pier caps so it frames rather than hides them.
    const palm = (x: number): void => {
      box(x - 3, x + 3, GROUND, GROUND, 2, 13, stone.shade);
      box(x - 2, x + 2, GROUND, GROUND, 3, 12, grass.base);
      for (const z of [4, 11])
        box(x - 1, x + 1, GROUND + 1, GROUND + 2, z - 1, z + 1, foliage.base);
      const top = GROUND + 26;
      box(x, x, GROUND + 1, top - 1, 7, 8, teak.base);
      for (let y = GROUND + 5; y < top; y += 5) box(x, x, y, y, 7, 8, teak.light);
      box(x - 3, x + 3, top, top, 6, 9, foliage.base);
      box(x - 1, x + 1, top, top, 3, 12, foliage.base);
      box(x - 2, x + 2, top + 1, top + 1, 6, 9, foliage.light);
      for (const [dx, z] of [
        [-3, 5],
        [3, 5],
        [-3, 10],
        [3, 10],
      ] as const) {
        b.set(x + dx, top - 1, z, foliage.base);
      }
      box(x - 1, x + 1, top - 1, top - 1, 2, 2, foliage.base);
      box(x - 1, x + 1, top - 1, top - 1, 13, 13, foliage.base);
    };
    palm(3);
    palm(mirror(3));
  },
});
