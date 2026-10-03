import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'tool-bulldozer',
  label: 'Bulldozer',
  category: 'props',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const body = PALETTE.amber;
    const metal = PALETTE.metal;
    b.box(3, 14, 0, 2, 2, 4, metal.shade);
    b.box(3, 14, 0, 2, 11, 13, metal.shade);
    b.box(4, 13, 3, 5, 3, 12, body.base);
    b.box(9, 13, 6, 9, 4, 11, body.shade);
    b.box(9, 12, 7, 8, 4, 11, PALETTE.glass.base);
    b.box(9, 13, 10, 10, 4, 11, body.base);
    b.box(5, 6, 6, 7, 6, 6, metal.deep);
    b.box(2, 3, 2, 3, 6, 9, metal.base);
    b.box(0, 1, 0, 5, 1, 14, metal.base);
    b.box(0, 0, 5, 5, 1, 14, metal.light);
  },
});
