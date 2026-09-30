import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { hipRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 3, z: 5, w: 26, d: 18 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// Wide enough for a cart, so the door reads as a service entrance rather than a front door.
const DOOR = { along: 7, w: 6 } as const;

export default defineModel({
  id: 'staff-house',
  label: 'Staff House',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  // Back-of-house: one per quarter or so, not a street of them.
  placement: { perResort: { min: 1, max: 3 } },
  depot: { doors: [{ x: DOOR.along + DOOR.w / 2, z: FRONT, facing: 0 }] },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1, wall: PALETTE.slate });
    hipRoof(b, { ...BODY, y: eaves, tile: PALETTE.metal, overhang: 1 });

    doorway(b, { face: 'z+', at: FRONT, along: DOOR.along, y: ground, w: DOOR.w, h: 8 });
    shutteredWindow(b, { face: 'z+', at: FRONT, along: 19, y: ground + 4, w: 5, h: 3 });
    for (const face of ['x-', 'x+'] as const) {
      const at = face === 'x-' ? LEFT : RIGHT;
      shutteredWindow(b, { face, at, along: 12, y: ground + 4, shutters: false });
    }

    b.box(15, 18, ground, ground + 3, FRONT + 2, FRONT + 5, PALETTE.teak.base);
    b.box(15, 18, ground + 3, ground + 3, FRONT + 2, FRONT + 5, PALETTE.teak.shade);
    b.box(19, 21, ground, ground + 2, FRONT + 3, FRONT + 5, PALETTE.teak.shade);
    b.box(15, 17, ground + 4, ground + 5, FRONT + 3, FRONT + 5, PALETTE.teak.light);
  },
});
