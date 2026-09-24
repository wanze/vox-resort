import { bed, crown, limb, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'olive',
  label: 'Olive Tree',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const N = 15;
    // Its own dusty greens, not the catalogue's: the grey leaf is what reads as olive.
    const SILVER = [0x5f7a56, 0x7d9670, 0x9db08c] as const;
    const bark = { colors: [0x9c917c, 0x7d7466] as const, limit: N };

    plinth(b, N);
    bed(b, 3, 12, 3, 12);

    limb(b, [7.5, 2, 7.5], [7.5, 8, 7.5], 2.4, 1.7, bark);

    const forks = [
      [4, 15, 6],
      [11, 16, 10],
      [7.5, 19, 8],
    ] as const;
    for (const [fx, fy, fz] of forks) limb(b, [7.5, 7, 7.5], [fx, fy, fz], 1.5, 0.7, bark);

    crown(b, 7.5, 18, 7.5, 6, 5, 6, { palette: SILVER, limit: N, floor: 12, gap: 0.3, salt: 7 });
    crown(b, 4, 16, 6, 4, 3.5, 4, { palette: SILVER, limit: N, floor: 12, gap: 0.32, salt: 19 });
    crown(b, 11, 17, 10, 4, 3.5, 4, { palette: SILVER, limit: N, floor: 12, gap: 0.32, salt: 29 });
  },
});
