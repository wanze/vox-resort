/**
 * Upscale beach club: a raised wooden deck with daybeds and parasols, a bar and
 * lounge seating, on a low platform. 64x64x20 (16x16 m), a 4x4 tile.
 * The open lounge faces +z.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'beach-club',
  label: 'Beach Club',
  category: 'leisure',
  tiles: { x: 4, z: 4 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      deck: 0xceac74,
      deckDark: 0xb6945d,
      skirt: 0x9a7a4c,
      daybed: 0xf3efe6,
      daybedFrame: 0xa9855a,
      pole: 0xededed,
      canopyA: 0x3f9d8f,
      canopyB: 0xf0ead9,
      barBody: 0x6b4a2c,
      barTop: 0x8a5f36,
      shelf: 0x4a3320,
      stool: 0x2f2a26,
      bottle: 0x4bbcd6,
      cushion: 0xe0a24a,
    };

    const NX = 63;
    const NZ = 63;

    // low platform base (2 layers) + darker lip
    box(0, NX, 0, 1, 0, NZ, C.base);
    for (let x = 0; x <= NX; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, NZ, C.baseDark);
    }
    for (let z = 0; z <= NZ; z++) {
      set(0, 1, z, C.baseDark);
      set(NX, 1, z, C.baseDark);
    }

    // raised wooden deck (skirt + planked top)
    box(2, 61, 2, 4, 2, 59, C.skirt);
    for (let x = 2; x <= 61; x++)
      for (let z = 2; z <= 59; z++) set(x, 5, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);
    // front steps down toward +z
    box(24, 39, 4, 4, 60, 60, C.deck);
    box(24, 39, 2, 3, 61, 61, C.deckDark);

    // bar along the back (-z)
    box(6, 34, 6, 11, 4, 8, C.barBody);
    box(6, 34, 12, 12, 4, 9, C.barTop);
    box(6, 34, 6, 18, 3, 3, C.shelf);
    for (let x = 7; x <= 33; x += 2) for (const y of [10, 14]) set(x, y, 3, C.bottle);
    for (const x of [10, 17, 24, 31]) {
      box(x, x + 1, 6, 9, 11, 12, C.stool);
      box(x, x + 1, 10, 10, 11, 12, C.cushion);
    }

    // daybeds with parasols on the open deck (+z side)
    const daybed = (cx: number, cz: number) => {
      box(cx, cx + 7, 6, 6, cz, cz + 6, C.daybedFrame);
      box(cx, cx + 7, 7, 7, cz, cz + 6, C.daybed);
      box(cx, cx + 7, 8, 10, cz, cz, C.daybed); // headboard
    };
    const parasol = (cx: number, cz: number) => {
      box(cx, cx, 7, 19, cz, cz, C.pole);
      for (let r = 4; r >= 1; r--) {
        const y = 16 + (4 - r);
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++)
            if (Math.abs(dx) + Math.abs(dz) <= r + 1)
              set(cx + dx, y, cz + dz, (dx + dz) % 2 === 0 ? C.canopyA : C.canopyB);
      }
    };
    for (const [dx, dz] of [
      [4, 24],
      [20, 24],
      [4, 44],
      [20, 44],
    ] as const) {
      daybed(dx, dz);
      parasol(dx + 4, dz + 3);
    }

    // lounge cluster toward +x: an L of low sofas around a coffee table
    box(54, 59, 6, 8, 16, 48, C.daybedFrame); // sofa along the +x edge
    box(54, 59, 9, 9, 16, 48, C.cushion);
    box(58, 59, 10, 13, 16, 48, C.daybed); // backrest
    box(42, 53, 6, 8, 16, 21, C.daybedFrame); // sofa along the -z edge
    box(42, 53, 9, 9, 16, 21, C.cushion);
    box(42, 53, 10, 13, 16, 17, C.daybed); // backrest
    box(45, 52, 6, 7, 30, 40, C.daybedFrame); // coffee table
    box(44, 53, 8, 8, 29, 41, C.daybed);
  },
});
