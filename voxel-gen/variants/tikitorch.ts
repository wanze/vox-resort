import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const { amber, bloom } = PALETTE;

// These three are emissive wherever they appear, so nothing but the flames may use them.
const FLAME = { root: bloom.base, body: amber.base, tip: amber.light } as const;

// Side by side across the view rather than one behind the other, or the short one hides the tall.
const TORCHES = [
  { x: 10, z: 10, height: 11 },
  { x: 4, z: 5, height: 6 },
] as const;

const BED = 6;

const flameTop = (height: number): number => BED + height + 3;

export default defineModel({
  id: 'tikitorch-b',
  label: 'Tiki Torch B',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  emissive: [FLAME.root, FLAME.body, FLAME.tip],
  // One light between the pair: two lights this close bake to the same glow at twice the cost.
  lights: [
    {
      x: 8,
      y: (flameTop(TORCHES[0].height) + flameTop(TORCHES[1].height)) / 2,
      z: 8.5,
      color: 0xff9a3c,
      intensity: 44,
      distance: 32,
    },
  ],
  build: (b: VoxelBuilder) => {
    const { foliage, grass, stone, thatch } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand });

    b.box(3, 12, ground, BED - 2, 3, 12, stone.light);
    b.box(4, 11, BED - 1, BED - 1, 4, 11, foliage.base);
    for (const [x, z] of [
      [5, 10],
      [9, 5],
    ] as const) {
      b.box(x, x + 1, BED, BED + 1, z, z + 1, grass.base);
    }

    for (const { x, z, height } of TORCHES) {
      const cup = BED + height;
      b.box(x, x + 1, BED, cup - 1, z, z + 1, thatch.light);
      // One node, on the tall cane only: the short one is too short to show a joint.
      if (height > 8) b.box(x, x + 1, BED + 5, BED + 5, z, z + 1, thatch.shade);
      b.box(x - 1, x + 2, cup, cup, z - 1, z + 2, thatch.shade);
      b.box(x, x + 1, cup + 1, cup + 1, z, z + 1, FLAME.root);
      b.box(x, x + 1, cup + 2, cup + 2, z, z + 1, FLAME.body);
      b.set(x, cup + 3, z + 1, FLAME.tip);
    }
  },
});
