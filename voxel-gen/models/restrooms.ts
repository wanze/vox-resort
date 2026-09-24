// The reference tiles its walls in a fine grid, left out on purpose: a dithered face
// defeats the coplanar merge and costs more triangles than the whole building.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 2, z: 2, w: 28, d: 10 } as const;
const FRONT = BODY.z + BODY.d - 1;

export default defineModel({
  id: 'restrooms',
  label: 'Restrooms',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 1 }],
    capacity: 4,
    dwellSeconds: { min: 60, max: 180 },
    doors: [
      { x: 9, z: FRONT, facing: 0 },
      { x: 23, z: FRONT, facing: 0 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 16 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1, wall: PALETTE.slate });
    flatRoof(b, { ...BODY, y: eaves });

    for (const along of [7, 21]) {
      doorway(b, { face: 'z+', at: FRONT, along, y: ground, w: 4, h: 8 });
      b.box(along + 1, along + 2, ground + 9, ground + 9, FRONT, FRONT, PALETTE.glass.deep);
    }
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: 14,
      y: ground + 5,
      w: 4,
      h: 3,
      shutters: false,
    });

    flowerBox(b, {
      x: 4,
      z: FRONT + 2,
      y: ground,
      w: 24,
      along: 'x',
      blooms: [PALETTE.foliage.base, PALETTE.foliage.light],
    });
  },
});
