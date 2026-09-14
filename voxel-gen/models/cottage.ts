/**
 * Whitewashed holiday cottage: a terracotta gable roof over a single
 * whitewashed storey, shuttered windows on three sides, and a paved front
 * terrace with a doorstep, a window box and two potted palms.
 * 32x48 (8x12 m plot, a 7x9 m cottage 6.25 m to the ridge), a 2x3 tile.
 * Front (terrace) faces +z.
 *
 * Drawn from `docs/references/house.jpg`; see `docs/art-direction.md` for what
 * the parts below are and why the cottage is nothing but a composition of them.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The body, inset so the +z end of the plot is left as a terrace. */
const BODY = { x: 2, z: 2, w: 28, d: 36 } as const;
/** The outer surface of each wall a part is hung on. */
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

export default defineModel({
  id: 'cottage',
  label: 'Cottage',
  category: 'lodging',
  tiles: { x: 2, z: 3 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
  },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'z' });

    doorway(b, { face: 'z+', at: FRONT, along: 14, y: ground });
    steps(b, { x: 13, z: FRONT + 1, w: 6, y: ground, descends: 'z+' });

    for (const along of [6, 22]) {
      shutteredWindow(b, { face: 'z+', at: FRONT, along, y: ground + 4 });
    }
    for (const along of [8, 18, 28]) {
      shutteredWindow(b, { face: 'x-', at: LEFT, along, y: ground + 4 });
      shutteredWindow(b, { face: 'x+', at: RIGHT, along, y: ground + 4 });
    }

    flowerBox(b, { x: 5, z: FRONT + 1, y: ground, w: 7, along: 'x' });
    for (const x of [10, 20]) pottedPlant(b, { x, z: FRONT + 2, y: ground });

    // A porch canopy on two posts, over the terrace the door opens onto.
    b.box(11, 20, ground + 10, ground + 10, FRONT + 1, FRONT + 4, PALETTE.teak.base);
    for (const x of [11, 20]) {
      b.box(x, x, ground, ground + 9, FRONT + 4, FRONT + 4, PALETTE.teak.shade);
    }
  },
});
