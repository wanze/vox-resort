/**
 * Stone pine: a bare, slightly leaning trunk carrying a broad flat-bottomed
 * canopy well above head height, the parasol shape that lines a Mediterranean
 * promenade. 32x32 footprint, a 2x2 tile, about 13 m tall.
 */
import { bed, BARK, crown, LEAF, limb, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'pine',
  label: 'Stone Pine',
  category: 'grounds',
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const N = 31;
    const NEEDLE = [LEAF.darkest, LEAF.dark, LEAF.mid] as const;
    const bark = { colors: [BARK.brown, BARK.brownDark] as const, limit: N };

    plinth(b, N);
    bed(b, 10, 21, 10, 21);

    // A tall bare trunk: the canopy starts at 8 m, so the tree shades a path
    // without anything having to duck under it.
    limb(b, [15, 2, 16], [17, 33, 14], 2.6, 1.4, bark);

    // Boughs fanning out just under the canopy, holding it wide.
    for (const [dx, dz] of [
      [-9, -3],
      [8, -6],
      [-4, 8],
      [7, 7],
    ] as const) {
      limb(b, [17, 30, 14], [16 + dx, 41, 15 + dz], 1.2, 0.7, bark);
    }

    // The parasol: one wide, shallow dome with a flat underside, roughed up by
    // three lumps so the top is not a dome from every angle.
    crown(b, 16, 44, 15, 14, 6, 14, { palette: NEEDLE, limit: N, floor: 40, gap: 0.1, salt: 3 });
    crown(b, 9, 47, 11, 7, 4, 7, { palette: NEEDLE, limit: N, floor: 42, salt: 11 });
    crown(b, 22, 46, 19, 8, 4, 8, { palette: NEEDLE, limit: N, floor: 42, salt: 23 });
    crown(b, 16, 49, 14, 7, 4, 7, { palette: NEEDLE, limit: N, floor: 44, salt: 37 });
  },
});
