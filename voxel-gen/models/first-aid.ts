/**
 * Small first-aid medical hut: a white rendered building with a red cross on
 * its front, a canvas canopy over the door, a bench beside it and two potted
 * palms at the corners of its forecourt. 32x32 (8x8 m plot, a 6x5 m hut 4.5 m
 * tall), a 2x2 tile. Front (cross and door) faces +z.
 *
 * Same vocabulary as the cottage; see `docs/art-direction.md`.
 */
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 4, z: 4, w: 24, d: 20 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;

export default defineModel({
  id: 'first-aid',
  label: 'First Aid',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 32 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    flatRoof(b, { ...BODY, y: eaves });

    doorway(b, { face: 'z+', at: FRONT, along: 6, y: ground });
    for (const along of [8, 16]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 5, shutters: false });
    }

    // The red cross, the one thing on the plot that has to be seen from a
    // distance, so it is painted on the wall rather than hung off it.
    b.box(14, 17, ground + 4, ground + 11, FRONT, FRONT, PALETTE.bloom.base);
    b.box(12, 19, ground + 7, ground + 8, FRONT, FRONT, PALETTE.bloom.base);

    // Canvas canopy over the door, on the forecourt side.
    b.box(4, 12, ground + 9, ground + 9, FRONT + 1, FRONT + 3, PALETTE.foliage.light);
    for (let x = 4; x <= 12; x++) b.set(x, ground + 9, FRONT + 3, PALETTE.foliage.base);

    // A bench beside it, and a palm at each corner of the forecourt.
    b.box(19, 26, ground + 1, ground + 1, FRONT + 2, FRONT + 4, PALETTE.teak.base);
    for (const x of [19, 26]) {
      b.box(x, x, ground, ground, FRONT + 2, FRONT + 4, PALETTE.teak.shade);
      b.box(x, x, ground + 2, ground + 3, FRONT + 4, FRONT + 4, PALETTE.teak.base);
    }
    for (const x of [3, 27]) pottedPlant(b, { x, z: 29, y: ground });
  },
});
