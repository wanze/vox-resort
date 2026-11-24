import { postRailing, WHITE } from '../parts/flight.ts';
import { defineModel, PAVING_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'railing',
  label: 'Handrail',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: the layout stands it wherever a drop runs beside a path.
  groundDecides: true,
  // The climbs' railing on level paving, so a handrail runs on up a flight unchanged.
  build: (b: VoxelBuilder) => postRailing(b, () => PAVING_VOXELS - 1, WHITE, 'left'),
});
