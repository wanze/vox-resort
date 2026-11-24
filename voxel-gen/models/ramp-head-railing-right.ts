import { postRailing, rampTreadAt, WHITE } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ramp-head-railing-right',
  label: 'Ramp Railing (Head, Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, (z) => rampTreadAt('head', z), WHITE, 'right'),
});
