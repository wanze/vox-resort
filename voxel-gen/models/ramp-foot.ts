// The lower half of a ramp, on the tile before the step; ramp-head.ts carries it up the rest.
import { ramp } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ramp-foot',
  label: 'Ramp (Foot)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  cost: 30,
  build: (b: VoxelBuilder) => ramp(b, 'foot'),
});
