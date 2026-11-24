import { flightTreadAt, timberRailing } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-stair-railing-right',
  label: 'Boardwalk Stair Railing (Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => timberRailing(b, flightTreadAt, 'right'),
});
