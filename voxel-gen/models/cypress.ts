import { bed, BARK, LEAF, limb, noise, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'cypress',
  label: 'Cypress',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const N = 15;
    const NEEDLE = [LEAF.darkest, LEAF.darkest, LEAF.dark, LEAF.mid] as const;

    plinth(b, N);
    bed(b, 5, 10, 5, 10);

    // Only the foot of the trunk is ever visible; the foliage swallows the rest.
    limb(b, [7.5, 2, 7.5], [7.5, 10, 7.5], 1.4, 1.0, {
      colors: [BARK.brown, BARK.brownDark],
      limit: N,
    });

    const top = 51;
    for (let y = 3; y <= top; y++) {
      const t = (y - 3) / (top - 3);
      const r = 3.9 * (1 - t) ** 0.5 * Math.min(1, 0.3 + t * 6);
      const k = Math.ceil(r);
      for (let dz = -k; dz <= k; dz++) {
        for (let dx = -k; dx <= k; dx++) {
          const grain = noise(7 + dx, y, 7 + dz, 5);
          if (Math.hypot(dx, dz) > r + (grain - 0.5) * 0.9) continue;
          const edge = Math.hypot(dx, dz) / Math.max(0.6, r);
          const shade = Math.floor((edge * 0.55 + grain * 0.7 + t * 0.4) * NEEDLE.length);
          set(7 + dx, y, 7 + dz, NEEDLE[Math.min(NEEDLE.length - 1, Math.max(0, shade))]!);
        }
      }
    }
  },
});
