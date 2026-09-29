import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const GLOW = 0xffe3a3;

export default defineModel({
  id: 'street-lamp',
  label: 'Street Lamp',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  emissive: [GLOW],
  lights: [{ x: 7, y: 18, z: 7, color: GLOW, intensity: 90, distance: 46 }],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      stone: 0x8f8a80,
      stoneDark: 0x777268,
      post: 0x3a4048,
      postDark: 0x2b3037,
      trim: 0x5a6270,
      glow: GLOW,
    };

    const N = 15;

    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    const cx = 7;
    const cz = 7;

    // Socket and lantern stay within a voxel of the post: the post cannot get thinner
    // and still stand on the tile's centre, so the rest slims down around it.
    box(cx - 1, cx + 2, 2, 2, cz - 1, cz + 2, C.stoneDark);
    box(cx - 1, cx + 2, 3, 3, cz - 1, cz + 2, C.stone);
    box(cx - 1, cx + 2, 4, 4, cz - 1, cz + 2, C.trim);

    box(cx, cx + 1, 5, 15, cz, cz + 1, C.post);
    for (let y = 5; y <= 15; y++) {
      set(cx + 1, y, cz + 1, C.postDark);
    }

    box(cx, cx + 1, 16, 16, cz, cz + 1, C.trim);
    box(cx, cx + 1, 17, 19, cz, cz + 1, C.glow);
    box(cx - 1, cx + 2, 20, 20, cz - 1, cz + 2, C.trim);
    box(cx, cx + 1, 21, 21, cz, cz + 1, C.postDark);
  },
});
