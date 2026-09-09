/**
 * Small rectangular flower bed: a low box of dark soil bursting with red, pink
 * and yellow blossoms across the top, on a low square base. 16x16 footprint,
 * fits a 1x1 tile.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'flowerbed',
  label: 'Flower Bed',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      rim: 0x8a6b45,
      rimDark: 0x74593a,
      soil: 0x4a382a,
      leaf: 0x3f7d45,
      red: 0xe0473f,
      pink: 0xef7ba6,
      yellow: 0xf2d24e,
    };

    const N = 15;

    // low platform base + darker top lip
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    // wooden planter box (rim) with soil inside
    box(2, 13, 2, 5, 2, 13, C.rim);
    for (let x = 2; x <= 13; x++) {
      set(x, 5, 2, C.rimDark);
      set(x, 5, 13, C.rimDark);
    }
    for (let z = 2; z <= 13; z++) {
      set(2, 5, z, C.rimDark);
      set(13, 5, z, C.rimDark);
    }
    box(3, 12, 5, 5, 3, 12, C.soil);

    // blossoms + foliage rising out of the soil
    const bloom = [C.red, C.pink, C.yellow];
    for (let x = 3; x <= 12; x++)
      for (let z = 3; z <= 12; z++) {
        const h = (x * 5 + z * 3) % 3;
        set(x, 6, z, C.leaf);
        if (h > 0) set(x, 7, z, bloom[(x + z) % 3]!);
        if (h > 1) set(x, 8, z, bloom[(x * 2 + z) % 3]!);
      }
  },
});
