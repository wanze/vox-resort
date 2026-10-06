import { jetSki, jetSkiSeats } from '../parts/boat.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const AT = { x: 0, y: 0, z: 0 } as const;

export default defineModel({
  id: 'jet-ski',
  label: 'Jet Ski',
  category: 'sea',
  tiles: { x: 1, z: 1 },
  seats: jetSkiSeats(AT),
  build: (b: VoxelBuilder) => jetSki(b, AT),
});
