import { defineModel, TILE_VOXELS, type VoxelBuilder } from '../voxelgen.ts';

const PAVING_TOP = 2;

const RAIL_HEIGHT = 4;

// Buried feet are drawn a voxel in from the edge: flush, they would z-fight with the
// paving's outer face. They cannot be omitted, because voxelgen shifts a model onto
// its own origin and the rail would drop two voxels.
const BURIED_IN = 1;

export default defineModel({
  id: 'railing',
  label: 'Handrail',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Never picked: the layout stands it wherever a drop runs beside a path.
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      post: 0xb08d5f,
      rail: 0xe4d9c4,
    };

    const N = TILE_VOXELS - 1;
    const top = PAVING_TOP + RAIL_HEIGHT;

    const inward = (v: number): number => Math.min(N - BURIED_IN, Math.max(BURIED_IN, v));

    for (const x of [0, Math.floor(TILE_VOXELS / 2) - 1, TILE_VOXELS - 2]) {
      box(x, x + 1, PAVING_TOP, top - 1, 0, 1, C.post);
      box(inward(x), inward(x + 1), 0, PAVING_TOP - 1, inward(0), inward(1), C.post);
    }
    box(0, N, top - 1, top, 0, 1, C.rail);
    box(0, N, PAVING_TOP + 1, PAVING_TOP + 1, 0, 1, C.rail);
  },
});
