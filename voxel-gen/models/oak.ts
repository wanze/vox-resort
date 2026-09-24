import { bed, BARK, crown, LEAF, limb, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'oak',
  label: 'Oak',
  category: 'grounds',
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const N = 31;
    const FOLIAGE = [LEAF.darkest, LEAF.dark, LEAF.mid, LEAF.light] as const;
    const bark = { colors: [BARK.brown, BARK.brownDark] as const, limit: N };

    plinth(b, N);
    bed(b, 9, 22, 9, 22);

    limb(b, [15, 2, 16], [16, 21, 15], 3.0, 2.0, bark);

    for (const [dx, dy, dz] of [
      [-9, 30, -5],
      [9, 29, -7],
      [-7, 28, 9],
      [8, 31, 8],
    ] as const) {
      limb(b, [16, 19, 15], [16 + dx, dy, 15 + dz], 1.8, 0.9, bark);
    }

    crown(b, 16, 34, 15, 14, 10, 14, { palette: FOLIAGE, limit: N, floor: 22, gap: 0.08, salt: 2 });
    crown(b, 8, 36, 11, 8, 7, 8, { palette: FOLIAGE, limit: N, floor: 24, gap: 0.12, salt: 13 });
    crown(b, 24, 34, 19, 8, 7, 8, { palette: FOLIAGE, limit: N, floor: 24, gap: 0.12, salt: 31 });
    crown(b, 12, 32, 24, 8, 6, 7, { palette: FOLIAGE, limit: N, floor: 24, gap: 0.12, salt: 47 });
    crown(b, 17, 42, 14, 8, 6, 8, { palette: FOLIAGE, limit: N, floor: 34, gap: 0.1, salt: 59 });
  },
});
