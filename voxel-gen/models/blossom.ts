import { bed, BARK, crown, LEAF, limb, noise, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'blossom',
  label: 'Blossom Tree',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const N = 15;
    const PETAL = [0xd45c8d, 0xef7ba6, 0xf7bcd4] as const;
    const bark = { colors: [BARK.brownDark, BARK.brown] as const, limit: N };

    plinth(b, N);
    bed(b, 4, 11, 4, 11);

    limb(b, [7.5, 2, 7.5], [7, 11, 8], 1.8, 1.1, bark);

    const boughs = [
      [3, 17, 6],
      [12, 16, 7],
      [8, 19, 12],
      [6, 18, 3],
    ] as const;
    for (const [fx, fy, fz] of boughs) limb(b, [7, 10, 8], [fx, fy, fz], 1.0, 0.6, bark);

    for (const [cx, cy, cz, salt] of [
      [3, 18, 6, 4],
      [12, 17, 7, 14],
      [8, 20, 12, 24],
      [6, 19, 3, 34],
      [7, 20, 8, 44],
    ] as const) {
      crown(b, cx, cy, cz, 5, 4, 5, { palette: PETAL, limit: N, floor: 11, gap: 0.2, salt });
    }

    for (let y = 13; y <= 22; y++) {
      for (let z = 1; z <= 14; z++) {
        for (let x = 1; x <= 14; x++) {
          if (noise(x, y, z, 71) > 0.06) continue;
          if (!b.voxels.has(`${x},${y},${z}`)) continue;
          set(x, y, z, LEAF.mid);
        }
      }
    }

    for (let z = 2; z <= 13; z++) {
      for (let x = 2; x <= 13; x++) {
        if (noise(x, 0, z, 83) > 0.16) continue;
        set(x, 1, z, PETAL[Math.floor(noise(x, 1, z, 97) * 3)]!);
      }
    }
  },
});
