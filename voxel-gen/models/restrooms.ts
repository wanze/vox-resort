/**
 * Small public restroom block: a rendered building with two doors under
 * pictogram plaques, a high slit window and a planter along the front, under a
 * flat roof with a parapet. 32x16 (8x4 m, 4.5 m tall), a 2x1 tile.
 * Doors face +z (toward the preview camera).
 *
 * Drawn from `docs/references/restrooms.jpg`. The reference tiles its walls in
 * a fine grid, which is the one thing here not copied: a pattern dithered
 * across a face defeats the coplanar merge and costs more triangles than the
 * whole building. See `docs/art-direction.md`.
 */
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
  },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 16 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1, wall: PALETTE.slate });
    flatRoof(b, { ...BODY, y: eaves });

    for (const along of [7, 21]) {
      doorway(b, { face: 'z+', at: FRONT, along, y: ground, w: 4, h: 8 });
      // A plaque over each door: a pictogram at this scale is a mark, not a
      // drawing, so it is drawn as one.
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
