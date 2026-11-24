import { flightTreadAt, postRailing, TIMBER } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-stair-railing-left',
  label: 'Boardwalk Stair Railing (Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, flightTreadAt, TIMBER, 'left'),
});
