import { PALETTE } from '../palette.ts';
import { PEDALO_PAIR_BEAM, pedalo, pedaloSeats } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const AT = { x: 0, y: 0, z: 0 } as const;

export default defineModel({
  id: 'pedalo',
  label: 'Pedal Boat',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  seats: pedaloSeats(AT),
  build: (b: VoxelBuilder) => pedalo(b, { ...AT, beam: PEDALO_PAIR_BEAM, trim: PALETTE.water }),
});
