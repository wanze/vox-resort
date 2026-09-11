/**
 * A pedal boat out on the bay: the hire craft the rental hut on the sand lets
 * out. 9 x 5 x 12 voxels, 2.25 x 3 m. Bow towards +z.
 *
 * The whole of it is the shared part, because the point of the part is that the
 * ones tied up outside `models/pedalo-rental.ts` and the ones out on the water
 * are the same boat. What is declared here is only which one of the rack has
 * been taken out — the turquoise one. See `parts/boat.ts`.
 */

import { PALETTE } from '../palette.ts';
import { pedalo } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'pedalo',
  label: 'Pedal Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => pedalo(b, { x: 0, z: 0, y: 0, trim: PALETTE.water }),
});
