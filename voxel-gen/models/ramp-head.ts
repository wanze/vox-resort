// The upper half of a ramp, on the tile against the step, standing where stairs would.
import { ramp } from '../parts/flight.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'ramp-head',
  label: 'Ramp (Head)',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  cost: 30,
  build: (b: VoxelBuilder) => ramp(b, 'head'),
});
