import { banana, bananaSeats } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const AT = { x: 0, y: 0, z: 0 } as const;

export default defineModel({
  id: 'banana',
  label: 'Banana Boat',
  category: 'sea',
  tiles: { x: 1, z: 2 },
  seats: bananaSeats(AT),
  build: (b: VoxelBuilder) => banana(b, AT),
});
