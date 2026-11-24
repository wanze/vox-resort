import { rampTreadAt, postRailing, TIMBER } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'boardwalk-ramp-foot-railing-left',
  label: 'Boardwalk Ramp Railing (Foot, Left)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => postRailing(b, (z) => rampTreadAt('foot', z), TIMBER, 'left'),
});
