import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 3, z: 3, w: 26, d: 34 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const DOOR = 14;
const PORCH = { x0: 10, x1: 21, z1: FRONT + 5 } as const;
const CHIMNEY = { x: 21, z: 9 } as const;

export default defineModel({
  id: 'cottage-b',
  label: 'Cottage B',
  category: 'lodging',
  tiles: { x: 2, z: 3 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 22,
    doors: [{ x: DOOR + 1, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { bloom, foliage, grass, stone, stucco, teak, terracotta } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1, quoins: false });

    // Dressed-stone corners, two wide so they read at this scale; one-voxel quoins vanish.
    for (const [x, z] of [
      [LEFT, BODY.z],
      [RIGHT - 1, BODY.z],
      [LEFT, FRONT - 1],
      [RIGHT - 1, FRONT - 1],
    ] as const) {
      b.box(x, x + 1, ground, eaves - 2, z, z + 1, stone.base);
    }

    const ridge = hipRoof(b, { ...BODY, y: eaves });
    b.box(CHIMNEY.x, CHIMNEY.x + 2, eaves, ridge, CHIMNEY.z, CHIMNEY.z + 2, stucco.base);
    b.box(
      CHIMNEY.x - 1,
      CHIMNEY.x + 3,
      ridge + 1,
      ridge + 1,
      CHIMNEY.z - 1,
      CHIMNEY.z + 3,
      stone.light,
    );
    b.box(
      CHIMNEY.x + 1,
      CHIMNEY.x + 1,
      ridge + 1,
      ridge + 1,
      CHIMNEY.z + 1,
      CHIMNEY.z + 1,
      teak.deep,
    );

    doorway(b, { face: 'z+', at: FRONT, along: DOOR, y: ground });
    for (const along of [5, 24]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 4 });
      flowerBox(b, { x: along, z: FRONT + 1, y: ground + 1, w: 3, along: 'x' });
    }
    for (const along of [8, 16, 24, 31]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 4 });
      shutteredWindow(b, { face: 'x+', at: RIGHT, along, y: ground + 4 });
    }
    for (const along of [8, 21]) {
      shutteredWindow(b, { face: 'z-', at: BODY.z, along, y: ground + 4 });
    }

    // A lean-to on two posts, one course a step, stepping down as the main roof does.
    b.box(PORCH.x0, PORCH.x1, ground, ground, FRONT + 1, PORCH.z1, teak.base);
    for (const x of [PORCH.x0, PORCH.x1]) {
      b.box(x, x, ground + 1, eaves - 4, PORCH.z1, PORCH.z1, teak.shade);
    }
    for (let course = 0; course < 3; course++) {
      const y = eaves - 1 - course;
      const z0 = FRONT + 1 + course * 2;
      const tone = course === 2 ? terracotta.deep : terracotta.base;
      b.box(PORCH.x0 - 1, PORCH.x1 + 1, y, y, z0, z0 + 1, tone);
    }

    // The front garden: two lawns either side of the path, planted where the camera looks.
    const garden = FRONT + 2;
    for (const [x0, x1] of [
      [1, PORCH.x0 - 2],
      [PORCH.x1 + 2, 30],
    ] as const) {
      b.box(x0, x1, ground - 1, ground - 1, garden, 46, grass.base);
      b.box(x0, x1, ground, ground + 1, 45, 46, foliage.base);
      for (let x = x0 + 1; x < x1; x += 2) b.set(x, ground, garden + 3, bloom.base);
    }
    b.box(DOOR - 1, DOOR + 4, ground - 1, ground - 1, PORCH.z1 + 1, 47, stone.light);
    pottedPlant(b, { x: DOOR - 3, z: FRONT + 2, y: ground + 1 });
    pottedPlant(b, { x: DOOR + 5, z: FRONT + 2, y: ground + 1 });
  },
});
