/**
 * Olive tree: a short, thick, gnarled trunk that forks low into three leaning
 * limbs, under a loose silvery-green crown. The one tree here that is wider than
 * it is tall. 16x16 footprint, a 1x1 tile, about 5 m tall.
 *
 * Its greens are its own rather than the catalogue's: the dusty, half-grey leaf
 * is the whole reason an olive reads as an olive and not as a small oak.
 */
import { bed, crown, limb, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'olive',
  label: 'Olive Tree',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const N = 15;
    const SILVER = [0x5f7a56, 0x7d9670, 0x9db08c] as const;
    const bark = { colors: [0x9c917c, 0x7d7466] as const, limit: N };

    plinth(b, N);
    bed(b, 3, 12, 3, 12);

    // A squat trunk that is almost all fork: it splits at 2 m.
    limb(b, [7.5, 2, 7.5], [7.5, 8, 7.5], 2.4, 1.7, bark);

    const forks = [
      [4, 15, 6],
      [11, 16, 10],
      [7.5, 19, 8],
    ] as const;
    for (const [fx, fy, fz] of forks) limb(b, [7.5, 7, 7.5], [fx, fy, fz], 1.5, 0.7, bark);

    // A rounded crown full of holes, sat clear of the fork so the crooked wood
    // under it stays visible: an olive is as much bare limb as leaf.
    crown(b, 7.5, 18, 7.5, 6, 5, 6, { palette: SILVER, limit: N, floor: 12, gap: 0.3, salt: 7 });
    crown(b, 4, 16, 6, 4, 3.5, 4, { palette: SILVER, limit: N, floor: 12, gap: 0.32, salt: 19 });
    crown(b, 11, 17, 10, 4, 3.5, 4, { palette: SILVER, limit: N, floor: 12, gap: 0.32, salt: 29 });
  },
});
