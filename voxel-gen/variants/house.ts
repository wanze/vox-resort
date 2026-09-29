import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import {
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const WING = { x: 4, z: 4, w: 20, d: 24 } as const;
const WING_FRONT = WING.z + WING.d - 1;
const MAIN = { x: WING.x + WING.w, z: 4, w: 20, d: 36 } as const;
const MAIN_FRONT = MAIN.z + MAIN.d - 1;
const MAIN_RIGHT = MAIN.x + MAIN.w - 1;

const DOOR = 12;
const PORCH = { x0: WING.x + 1, x1: MAIN.x - 2, z1: WING_FRONT + 6 } as const;
const CHIMNEY = { x: 37, z: 8 } as const;

export default defineModel({
  id: 'house-b',
  label: 'House B',
  category: 'lodging',
  tiles: { x: 3, z: 3 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 6,
    beds: 6,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 22,
    doors: [{ x: DOOR + 1, z: WING_FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { bloom, foliage, grass, stone, stucco, teak, terracotta } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 48, d: 48 });
    const lower = ground + 3;
    const upper = lower + STOREY_VOXELS;

    // A solid parapet, not balusters: forty of them would double the house's triangles.
    const terrace = stuccoWall(b, { ...WING, y: ground, storeys: 1 });
    b.box(WING.x, MAIN.x, terrace - 1, terrace - 1, WING.z, WING_FRONT, stone.light);
    b.box(WING.x, MAIN.x, terrace, terrace + 2, WING_FRONT - 1, WING_FRONT, stucco.base);
    b.box(WING.x, WING.x + 1, terrace, terrace + 2, WING.z, WING_FRONT, stucco.base);
    b.box(WING.x, MAIN.x, terrace + 3, terrace + 3, WING_FRONT - 1, WING_FRONT, stone.light);
    b.box(WING.x, WING.x + 1, terrace + 3, terrace + 3, WING.z, WING_FRONT, stone.light);
    b.box(WING.x, MAIN.x, terrace, terrace + 2, WING.z, WING.z + 1, stucco.base);
    b.box(WING.x, MAIN.x, terrace + 3, terrace + 3, WING.z, WING.z + 1, stone.light);
    // A planter behind the parapet, showing just above the coping, dresses the terrace for a few quads.
    b.box(
      WING.x + 2,
      WING.x + 10,
      terrace,
      terrace + 4,
      WING_FRONT - 3,
      WING_FRONT - 2,
      foliage.base,
    );
    b.box(
      WING.x + 2,
      WING.x + 3,
      terrace,
      terrace + 4,
      WING_FRONT - 10,
      WING_FRONT - 4,
      foliage.base,
    );
    b.box(
      WING.x + 3,
      WING.x + 8,
      terrace + 5,
      terrace + 5,
      WING_FRONT - 3,
      WING_FRONT - 2,
      bloom.base,
    );

    const eaves = stuccoWall(b, { ...MAIN, y: ground, storeys: 2 });
    const crest = gableRoof(b, { ...MAIN, y: eaves, ridge: 'z' });
    b.box(CHIMNEY.x, CHIMNEY.x + 2, eaves, crest + 2, CHIMNEY.z, CHIMNEY.z + 2, stucco.base);
    b.box(
      CHIMNEY.x - 1,
      CHIMNEY.x + 3,
      crest + 3,
      crest + 3,
      CHIMNEY.z - 1,
      CHIMNEY.z + 3,
      stone.light,
    );

    doorway(b, { face: 'z+', at: WING_FRONT, along: DOOR, y: ground });
    for (const along of [WING.z + 6, WING.z + 16]) {
      shutteredWindow(b, { face: 'x-', at: WING.x, along, y: lower, w: 4 });
    }
    doorway(b, { face: 'x-', at: MAIN.x, along: WING.z + 11, y: terrace, w: 3, h: 8 });
    for (const y of [lower, upper]) {
      shutteredWindow(b, { face: 'x-', at: MAIN.x, along: WING_FRONT + 5, y, w: 4 });
      shutteredWindow(b, { face: 'x+', at: MAIN_RIGHT, along: MAIN.z + 16, y, w: 4 });
    }
    for (const along of [MAIN.x + 3, MAIN_RIGHT - 5]) {
      shutteredWindow(b, { face: 'z+', at: MAIN_FRONT, along, y: lower, w: 3 });
      flowerBox(b, {
        x: along,
        z: MAIN_FRONT + 1,
        y: lower - 3,
        w: 3,
        along: 'x',
        blooms: [bloom.base],
      });
    }
    shutteredWindow(b, { face: 'z+', at: MAIN_FRONT, along: MAIN.x + 8, y: upper, w: 4 });

    // Hung below the terrace slab so the parapet still reads as one unbroken line above it.
    for (const x of [PORCH.x0, PORCH.x1]) {
      b.box(x, x, ground, terrace - 6, PORCH.z1, PORCH.z1, teak.shade);
    }
    b.box(PORCH.x0, PORCH.x1, ground - 1, ground - 1, WING_FRONT + 1, PORCH.z1, teak.base);
    for (let course = 0; course < 3; course++) {
      const y = terrace - 3 - course;
      const z0 = WING_FRONT + 1 + course * 2;
      const tone = course === 2 ? terracotta.deep : terracotta.base;
      b.box(PORCH.x0 - 1, PORCH.x1 + 1, y, y, z0, z0 + 1, tone);
    }

    const garden = PORCH.z1 + 2;
    b.box(1, 46, ground - 1, ground - 1, garden, 46, grass.base);
    b.box(MAIN.x - 1, 46, ground - 1, ground - 1, MAIN_FRONT + 3, 46, grass.base);
    b.box(DOOR - 1, DOOR + 4, ground - 1, ground - 1, PORCH.z1 + 1, 47, stone.light);
    for (const x of [DOOR - 4, DOOR + 6]) pottedPlant(b, { x, z: PORCH.z1 - 2, y: ground });
  },
});
