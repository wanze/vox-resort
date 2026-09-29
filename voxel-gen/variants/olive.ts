import { crown, limb, noise } from '../models/foliage.ts';
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const EDGE = 15;

// Clumps rather than one dome: an old olive's crown sits on its limbs in tufts
// with sky between them, which is what tells it from an oak at this size.
const CLUMPS = [
  { x: 4, y: 13, z: 5, rx: 4.2, ry: 2.6, rz: 4, salt: 3 },
  { x: 11.5, y: 12, z: 10.5, rx: 4, ry: 2.4, rz: 4.2, salt: 13 },
  { x: 10.5, y: 14, z: 4.5, rx: 4, ry: 2.4, rz: 3.6, salt: 23 },
  { x: 4.5, y: 12.5, z: 11, rx: 3.8, ry: 2.3, rz: 3.8, salt: 33 },
  { x: 7.5, y: 15, z: 7.5, rx: 4, ry: 2.2, rz: 4, salt: 43 },
] as const;

export default defineModel({
  id: 'olive-b',
  label: 'Olive Tree B',
  category: 'grounds',
  scenery: 0.4,
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const { foliage, sand, slate, stone, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: sand });
    b.box(3, 12, ground - 1, ground - 1, 3, 12, teak.deep);

    const bark = { colors: [stone.shade, stone.deep] as const, limit: EDGE, floor: ground };
    // The old bole splits low into two stems that lean apart and twist back over the
    // middle, the gnarl that tells an olive from any other round crown.
    limb(b, [7.5, ground, 7.5], [7.5, ground + 1, 7.5], 2.2, 1.8, bark);
    limb(b, [6.5, ground + 1, 7], [4, ground + 5, 8.5], 1.3, 1, bark);
    limb(b, [4, ground + 5, 8.5], [4.5, ground + 10, 5], 1, 0.7, bark);
    limb(b, [9, ground + 1, 8], [11.5, ground + 4, 6.5], 1.2, 1, bark);
    limb(b, [11.5, ground + 4, 6.5], [11, ground + 9, 10.5], 0.9, 0.6, bark);
    limb(b, [11.5, ground + 4, 6.5], [10, ground + 10, 4], 0.8, 0.6, bark);

    const leaf = [foliage.shade, foliage.light, foliage.light];
    for (const { x, y, z, rx, ry, rz, salt } of CLUMPS) {
      crown(b, x, y + ground, z, rx, ry, rz, {
        palette: leaf,
        limit: EDGE,
        floor: ground + 9,
        gap: 0.28,
        salt,
      });
    }

    // The silver is the leaves' underside turned up by the wind: patches two voxels
    // across on the top surface, so it reads as a sheen and still meshes in quads.
    for (const [key, color] of b.voxels) {
      if (color !== foliage.light) continue;
      const [x, y, z] = key.split(',').map(Number) as [number, number, number];
      if (b.voxels.has(`${x},${y + 1},${z}`)) continue;
      if (noise(x >> 1, y, z >> 1, 61) < 0.25) b.set(x, y, z, slate.light);
    }
  },
});
