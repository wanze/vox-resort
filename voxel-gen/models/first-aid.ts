import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 4, z: 4, w: 24, d: 20 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;

const GROUND = 3;

export default defineModel({
  id: 'first-aid',
  label: 'First Aid',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  // The plank is at GROUND + 1 (no plinth of its own) and the back is the +z row, so sitters face -z.
  seats: [
    { x: 21, y: GROUND + 2, z: FRONT + 2, facing: 2 },
    { x: 24, y: GROUND + 2, z: FRONT + 2, facing: 2 },
  ],
  venue: {
    role: 'service',
    capacity: 4,
    dwellSeconds: { min: 300, max: 900 },
    doors: [{ x: 8, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32 });
    if (ground !== GROUND) throw new Error('The forecourt and its bench must agree on its surface');
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    flatRoof(b, { ...BODY, y: eaves });

    doorway(b, { face: 'z+', at: FRONT, along: 6, y: ground });
    for (const along of [8, 16]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 5, shutters: false });
    }

    b.box(14, 17, ground + 4, ground + 11, FRONT, FRONT, PALETTE.bloom.base);
    b.box(12, 19, ground + 7, ground + 8, FRONT, FRONT, PALETTE.bloom.base);

    b.box(4, 12, ground + 9, ground + 9, FRONT + 1, FRONT + 3, PALETTE.foliage.light);
    for (let x = 4; x <= 12; x++) b.set(x, ground + 9, FRONT + 3, PALETTE.foliage.base);

    b.box(19, 26, ground + 1, ground + 1, FRONT + 2, FRONT + 4, PALETTE.teak.base);
    for (const x of [19, 26]) {
      b.box(x, x, ground, ground, FRONT + 2, FRONT + 4, PALETTE.teak.shade);
      b.box(x, x, ground + 2, ground + 3, FRONT + 4, FRONT + 4, PALETTE.teak.base);
    }
    for (const x of [3, 27]) pottedPlant(b, { x, z: 29, y: ground });
  },
});
