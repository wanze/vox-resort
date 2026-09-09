/**
 * Two-storey holiday house: colour-washed walls over a stone skirting, a
 * terracotta gable roof with a chimney, shuttered windows on two floors and
 * three sides, and a front door on a paved terrace.
 * 48x48 (12x12 m plot, a 10x8 m house with two 3 m storeys and a 9.5 m ridge),
 * a 3x3 tile. Front faces +z.
 *
 * Drawn from `docs/references/house.jpg`; see `docs/art-direction.md`.
 */
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { gableRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, STOREY_VOXELS, stuccoWall } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** The body, inset so the +z end of the plot is left as a terrace. */
const BODY = { x: 4, z: 8, w: 40, d: 32 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

export default defineModel({
  id: 'house',
  label: 'House',
  category: 'lodging',
  tiles: { x: 3, z: 3 },
  build: (b: VoxelBuilder) => {
    const ground = plinth(b, { x: 0, z: 0, w: 48, d: 48 });
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 2 });
    gableRoof(b, { ...BODY, y: eaves, ridge: 'x' });

    // Chimney out of the -z slope, standing clear of the ridge.
    b.box(32, 35, eaves, eaves + 13, 12, 15, PALETTE.slate.base);
    b.box(32, 35, eaves + 13, eaves + 13, 12, 15, PALETTE.slate.shade);

    doorway(b, { face: 'z+', at: FRONT, along: 22, y: ground });
    steps(b, { x: 21, z: FRONT + 1, w: 6, y: ground, descends: 'z+' });
    for (const x of [19, 27]) pottedPlant(b, { x, z: FRONT + 2, y: ground });

    // Both floors: sills 1 m up the storey they belong to.
    const lower = ground + 3;
    const upper = lower + STOREY_VOXELS;
    for (const y of [lower, upper]) {
      for (const along of [9, 33]) {
        shutteredWindow(b, { face: 'z+', at: FRONT, along, y, w: 4 });
      }
      for (const along of [14, 28]) {
        shutteredWindow(b, { face: 'x-', at: LEFT, along, y, w: 4 });
        shutteredWindow(b, { face: 'x+', at: RIGHT, along, y, w: 4 });
      }
    }
    shutteredWindow(b, { face: 'z+', at: FRONT, along: 21, y: upper, w: 6 });
  },
});
