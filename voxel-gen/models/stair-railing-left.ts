import { flightTreadAt, postRailing, WHITE } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'stair-railing-left',
  label: 'Stair Railing (Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, flightTreadAt, WHITE, 'left'),
});
