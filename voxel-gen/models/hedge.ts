/**
 * Neatly trimmed rectangular green hedge: a solid block of dense foliage with a
 * flat top and even sides, on a low base. 16x16x8 (4x2 m), a 1x1 tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "hedge",
  label: "Hedge",
  category: "grounds",
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      leaf: 0x3f8a48,
      leafDark: 0x347439,
      leafLight: 0x54a35c,
    };

    const N = 15;

    // low base + darker lip
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    // dense hedge block with a lightly stippled surface (2 m of hedge above the base)
    const top = 7;
    box(2, 13, 2, top, 2, 13, C.leaf);
    for (let x = 2; x <= 13; x++)
      for (let z = 2; z <= 13; z++)
        set(x, top, z, (x * 3 + z * 5) % 4 === 0 ? C.leafLight : C.leaf);
    for (let x = 2; x <= 13; x++)
      for (let y = 2; y <= top; y++) {
        if ((x + y) % 3 === 0) set(x, y, 2, C.leafDark);
        if ((x + y) % 3 === 1) set(x, y, 13, C.leafLight);
      }
  },
});
