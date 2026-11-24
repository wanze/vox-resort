import { rampTreadAt, timberRailing } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-ramp-head-railing-right',
  label: 'Boardwalk Ramp Railing (Head, Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => timberRailing(b, (z) => rampTreadAt('head', z), 'right'),
});
