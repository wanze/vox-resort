// Stands on the lower tile of a step, turned so it climbs towards the higher ground;
// unturned it climbs north. The lowest tread is one voxel above path.ts's slab and
// the highest is flush with a path one level up.
import {
  defineModel,
  LEVEL_VOXELS,
  PAVING_VOXELS,
  TILE_VOXELS,
  type VoxelBuilder,
} from '../voxelgen.ts';

const TREADS = LEVEL_VOXELS;

const GOING = TILE_VOXELS / TREADS;

export default defineModel({
  id: 'stairs',
  label: 'Stairs',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  groundDecides: true,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);

    const C = {
      core: 0x9a8a6a,
      treadA: 0xc3b189,
      treadB: 0xb6a379,
      treadC: 0xcdbc95,
    };
    const treads = [C.treadA, C.treadB, C.treadC];

    const N = TILE_VOXELS - 1;

    // Highest tread first, at the north edge; each tread's exposed south face is the riser.
    for (let step = 0; step < TREADS; step++) {
      const top = PAVING_VOXELS + LEVEL_VOXELS - 1 - step;
      const z0 = step * GOING;
      const z1 = z0 + GOING - 1;
      box(0, N, 0, top - 1, z0, z1, C.core);
      box(0, N, top, top, z0, z1, treads[step % treads.length]!);
    }
  },
});
