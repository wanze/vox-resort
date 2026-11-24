import { postRailing, rampTreadAt, WHITE } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ramp-foot-railing-right',
  label: 'Ramp Railing (Foot, Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, (z) => rampTreadAt('foot', z), WHITE, 'right'),
});
