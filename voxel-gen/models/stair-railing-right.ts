import { flightTreadAt, postRailing, WHITE } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'stair-railing-right',
  label: 'Stair Railing (Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, flightTreadAt, WHITE, 'right'),
});
