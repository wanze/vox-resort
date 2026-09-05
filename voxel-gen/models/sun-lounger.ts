/**
 * Single sun lounger: low reclined seat with a striped cushion, an angled
 * backrest, a small folded parasol and a solid frame, on a low square base.
 * 16x16x8 (4x2 m), a 1x1 tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "sun-lounger",
  label: "Sun Lounger",
  tiles: { x: 1, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      frame: 0xe9e9e2,
      cushion: 0x2fa0a8,
      stripe: 0xede6d6,
      pole: 0xb0b4ba,
      canopy: 0xdd5b6e,
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

    // frame legs + rails (seat spans x3..12, z3..11)
    for (const [lx, lz] of [
      [3, 3],
      [12, 3],
      [3, 11],
      [12, 11],
    ] as const)
      box(lx, lx, 2, 3, lz, lz, C.frame);
    box(3, 12, 3, 3, 3, 11, C.frame);

    // striped seat pad (flat part z5..11), backrest ramps up toward z3
    for (let z = 5; z <= 11; z++) box(3, 12, 4, 4, z, z, z % 2 === 0 ? C.cushion : C.stripe);
    box(3, 12, 4, 4, 4, 4, C.frame);
    box(3, 12, 4, 5, 4, 4, C.cushion);
    box(3, 12, 5, 6, 3, 3, C.cushion);
    box(3, 12, 4, 4, 3, 3, C.stripe);

    // small folded parasol standing at the head corner (2 m over the deck)
    box(13, 13, 2, 5, 13, 13, C.pole);
    box(12, 14, 5, 6, 12, 14, C.canopy);
    set(13, 7, 13, C.canopy);
  },
});
