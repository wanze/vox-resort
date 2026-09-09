/**
 * Willow: a low dome of yellow-green with long strands hanging almost to the
 * ground off its rim: the tree you stand beside water. 32x32 footprint, a 2x2
 * tile, about 9 m tall.
 */
import { bed, BARK, crown, limb, noise, plinth } from './foliage.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'willow',
  label: 'Willow',
  category: 'grounds',
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const N = 31;
    const WHIP = [0x5f8c3c, 0x7ea850, 0x9cc262] as const;
    const bark = { colors: [BARK.brown, BARK.brownDark] as const, limit: N };

    plinth(b, N);
    bed(b, 10, 21, 10, 21);

    limb(b, [15, 2, 16], [16, 19, 15], 2.8, 1.8, bark);
    for (const [dx, dy, dz] of [
      [-8, 26, -4],
      [8, 25, -6],
      [-6, 25, 8],
      [7, 27, 7],
    ] as const) {
      limb(b, [16, 18, 15], [16 + dx, dy, 15 + dz], 1.6, 0.8, bark);
    }

    // A shallow dome, because the mass of a willow is in what hangs off it rather
    // than in the crown itself.
    crown(b, 16, 30, 15, 14, 7, 14, { palette: WHIP, limit: N, floor: 24, gap: 0.1, salt: 6 });
    crown(b, 9, 31, 11, 8, 5, 8, { palette: WHIP, limit: N, floor: 26, gap: 0.14, salt: 16 });
    crown(b, 23, 30, 19, 8, 5, 8, { palette: WHIP, limit: N, floor: 26, gap: 0.14, salt: 26 });

    // The strands: single files of leaf falling out of the dome, each from its
    // own radius so they hang in depth rather than in one curtain, drifting a
    // voxel sideways here and there and thinning out towards the tip.
    const strands = 30;
    for (let i = 0; i < strands; i++) {
      const angle = (i / strands) * Math.PI * 2 + 0.3;
      const reach = 9.5 + noise(i, 0, 0, 53) * 4.5;
      let x = Math.round(16 + Math.cos(angle) * reach);
      let z = Math.round(15 + Math.sin(angle) * reach);
      const from = 26 + Math.floor(noise(i, 1, 0, 61) * 4);
      const to = 7 + Math.floor(noise(i, 2, 0, 67) * 10);
      for (let y = from; y >= to; y--) {
        const drift = noise(i, y, 0, 73);
        if (drift < 0.1) x += 1;
        else if (drift > 0.9) z += drift > 0.95 ? 1 : -1;
        if (x < 0 || x > N || z < 0 || z > N) break;
        // A strand frays towards its tip rather than stopping square, and once
        // it has frayed through it is done, since a leaf hanging in mid air is not.
        const spent = (from - y) / Math.max(1, from - to);
        if (spent > 0.6 && noise(x, y, z, 87) < (spent - 0.6) * 1.4) break;
        set(x, y, z, WHIP[Math.floor(noise(x, y, z, 79) * 3)]!);
      }
    }
  },
});
