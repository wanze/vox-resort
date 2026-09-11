/**
 * A pedal boat out on the bay: the hire craft the rental hut on the sand lets
 * out. 9 x 5 x 12 voxels, 2.25 x 3 m. Bow towards +z.
 *
 * The whole of it is the shared part, because the point of the part is that the
 * ones tied up outside `models/pedalo-rental.ts` and the ones out on the water
 * are the same boat. What is declared here is only which one of the rack has
 * been taken out — the turquoise one. See `parts/boat.ts`.
 *
 * **It carries its seat and the racked ones do not**, which is the one place the
 * two part ways. A pedalo afloat is a pedalo somebody hired, and `features/sea/`
 * puts a figure on it while it is out; a pedalo drawn up on the sand beside the
 * hut is stock, and a figure sitting in the rack would be somebody waiting in a
 * boat on a beach. See `sea/domain/passengers.ts`.
 */

import { PALETTE } from '../palette.ts';
import { pedalo, pedaloSeats } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

/** Where the craft is drawn, which is also what its seat is measured against. */
const AT = { x: 0, y: 0, z: 0 } as const;

export default defineModel({
  id: 'pedalo',
  label: 'Pedal Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  seats: pedaloSeats(AT),
  build: (b: VoxelBuilder) => pedalo(b, { ...AT, trim: PALETTE.water }),
});
