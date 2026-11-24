import { rampTreadAt, timberRailing } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-ramp-foot-railing-right',
  label: 'Boardwalk Ramp Railing (Foot, Right)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => timberRailing(b, (z) => rampTreadAt('foot', z), 'right'),
});
