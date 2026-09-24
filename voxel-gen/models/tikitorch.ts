import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'tikitorch',
  label: 'Tiki Torch',
  category: 'grounds',
  tiles: { x: 1, z: 1 },
  // Drawn unlit so the flame still burns after dark.
  emissive: [0xf2c33c, 0xef7a2f, 0xe0473f],
  lights: [{ x: 7, y: 8, z: 7, color: 0xff9a3c, intensity: 40, distance: 30 }],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      stone: 0x8f8a80,
      stoneDark: 0x777268,
      bamboo: 0xb79a54,
      bambooDark: 0x9a7f3f,
      bowl: 0x4a3320,
      flameA: 0xf2c33c,
      flameB: 0xef7a2f,
      flameC: 0xe0473f,
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
    for (let x = 4; x <= 11; x++)
      for (let z = 4; z <= 11; z++) {
        const d = Math.hypot(x + 0.5 - (cx + 0.5), z + 0.5 - (cz + 0.5));
        if (d <= 3.6) box(x, x, 2, 3, z, z, d > 2.6 ? C.stoneDark : C.stone);
      }

    box(cx, cx + 1, 4, 5, cz, cz + 1, C.bamboo);
    box(cx, cx + 1, 5, 5, cz, cz + 1, C.bambooDark);

    box(cx - 1, cx + 2, 6, 6, cz - 1, cz + 2, C.bowl);
    box(cx, cx + 1, 7, 7, cz, cz + 1, C.flameC);
    box(cx, cx + 1, 8, 8, cz, cz + 1, C.flameB);
    set(cx, 9, cz, C.flameA);
    set(cx + 1, 9, cz + 1, C.flameA);
  },
});
