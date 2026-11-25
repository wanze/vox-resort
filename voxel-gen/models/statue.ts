import { PALETTE } from '../palette.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const PLINTH_TOP = 6;
const FEET = PLINTH_TOP + 1;

// Facing +z and two voxels deep: at this size a figure reads only by its outline, so every
// limb stands clear of the body by a voxel of air.
const FRONT_Z = 7;
const BACK_Z = 8;

export default defineModel({
  id: 'statue',
  label: 'Statue',
  category: 'grounds',
  scenery: 0.8,
  tiles: { x: 1, z: 1 },
  onTerrain: true,
  build: (b: VoxelBuilder) => {
    const { stone, verdigris } = PALETTE;
    const figure = (x0: number, x1: number, y0: number, y1: number): void =>
      b.box(x0, x1, y0, y1, FRONT_Z, BACK_Z, verdigris.base);

    b.box(4, 11, 2, PLINTH_TOP - 1, 4, 11, stone.base);
    b.box(3, 12, PLINTH_TOP, PLINTH_TOP, 3, 12, stone.shade);

    figure(6, 6, FEET, FEET + 4);
    figure(9, 9, FEET, FEET + 4);
    figure(6, 9, FEET + 5, FEET + 9);
    figure(5, 10, FEET + 10, FEET + 10);
    b.box(7, 8, FEET + 11, FEET + 11, BACK_Z, BACK_Z, verdigris.base);
    figure(7, 8, FEET + 12, FEET + 14);

    figure(4, 4, FEET + 6, FEET + 10);
    // The raised arm lifts a wreath clear above the head, the one shape no other prop has.
    figure(11, 11, FEET + 10, FEET + 15);
    b.box(10, 12, FEET + 16, FEET + 18, BACK_Z, BACK_Z, verdigris.light);
    b.del(11, FEET + 17, BACK_Z);
  },
});
