import { rampTreadAt, timberRailing } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-ramp-head-railing-left',
  label: 'Boardwalk Ramp Railing (Head, Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => timberRailing(b, (z) => rampTreadAt('head', z), 'left'),
});
