import { crown, limb, noise } from '../models/foliage.ts';
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 15;
const FORK = 8;

// An almond flowers before it leafs, on a vase of bare boughs: the blossom sits
// in separate clouds at the bough ends, and the dark wood shows between them.
const BOUGHS = [
  { x: 3.5, y: 14, z: 4, r: 3.7, salt: 5 },
  { x: 12, y: 13, z: 4.5, r: 3.5, salt: 15 },
  { x: 11.5, y: 14.5, z: 11.5, r: 3.7, salt: 25 },
  { x: 4, y: 13, z: 11.5, r: 3.5, salt: 35 },
  { x: 7.5, y: 18, z: 7.5, r: 4, salt: 45 },
] as const;

export default defineModel({
  id: 'blossom-b',
  label: 'Blossom Tree B',
  category: 'grounds',
  scenery: 0.5,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { bloom, sand, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: sand });
    const soil = ground - 1;
    b.box(3, 12, soil, soil, 3, 12, teak.deep);

    const bark = { colors: [teak.shade, teak.deep] as const, limit: EDGE, floor: ground };
    limb(b, [7.5, ground, 7.5], [7.5, ground + FORK, 8], 1.4, 1, bark);
    for (const { x, y, z } of BOUGHS) {
      limb(b, [7.5, ground + FORK - 1, 8], [x, ground + y - 1, z], 0.9, 0.5, bark);
    }

    for (const { x, y, z, r, salt } of BOUGHS) {
      crown(b, x, ground + y, z, r, r * 0.75, r, {
        palette: [stucco.light],
        limit: EDGE,
        floor: ground + FORK + 1,
        gap: 0.3,
        salt,
      });
    }

    // The flush of pink is at the heart of each flower, so it shows only on the
    // undersides the camera catches, never across the white tops.
    for (const { x, y, z, color } of b) {
      if (color !== stucco.light) continue;
      if (b.has(x, y - 1, z)) continue;
      if (noise(x, y, z, 71) < 0.22) b.set(x, y, z, bloom.light);
    }

    // Petals fallen into the bed, painted into its surface so they cost no height.
    for (let z = 3; z <= 12; z++) {
      for (let x = 3; x <= 12; x++) {
        if (noise(x, soil, z, 83) < 0.14) b.set(x, soil, z, stucco.light);
      }
    }
  },
});
