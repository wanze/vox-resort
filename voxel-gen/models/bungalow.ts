/**
 * Rustic thatched-roof beach bungalow: a hut raised on four wooden stilts with
 * woven palm walls, a pyramidal thatched roof, a small porch and a ladder, on a
 * low platform. 32x32x32 (8x8 m plot, a 6x6 m hut standing 8 m), a 2x2 tile.
 * Porch faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "bungalow",
  label: "Bungalow",
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xdcc79a,
      baseDark: 0xc3ad80,
      stilt: 0x6b4a2c,
      stiltDark: 0x543a22,
      deck: 0xb5834e,
      deckDark: 0xa5763f,
      wallA: 0xc9a86a,
      wallB: 0xb5934f,
      door: 0x5a3f26,
      window: 0x8fc4cf,
      thatchA: 0xc7a24e,
      thatchB: 0xad8636,
      finial: 0x4a3320,
      rail: 0x7a5330,
    };

    const N = 31;

    // low sandy platform base + darker lip
    box(0, N, 0, 1, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 1, 0, C.baseDark);
      set(x, 1, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 1, z, C.baseDark);
      set(N, 1, z, C.baseDark);
    }

    // four wooden stilts
    for (const [x, z] of [
      [5, 5],
      [24, 5],
      [5, 24],
      [24, 24],
    ] as const) {
      box(x, x + 1, 2, 7, z, z + 1, C.stilt);
      set(x, 7, z, C.stiltDark);
    }

    // raised deck floor
    for (let x = 4; x <= 27; x++)
      for (let z = 4; z <= 27; z++) set(x, 8, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);

    // woven palm walls (two-tone), open front porch bay
    const wall = (x0: number, x1: number, z0: number, z1: number) => {
      for (let x = x0; x <= x1; x++)
        for (let y = 9; y <= 17; y++)
          for (let z = z0; z <= z1; z++) set(x, y, z, (x + y + z) % 2 === 0 ? C.wallA : C.wallB);
    };
    wall(6, 25, 6, 6); // back (-z)
    wall(6, 6, 6, 25); // -x
    wall(25, 25, 6, 25); // +x
    wall(6, 12, 25, 25); // front left
    wall(19, 25, 25, 25); // front right (door gap between)
    box(13, 18, 9, 16, 25, 25, C.door); // doorway on the front
    box(8, 10, 12, 15, 6, 6, C.window); // back window
    box(21, 23, 12, 15, 6, 6, C.window); // back window
    box(6, 6, 12, 15, 12, 15, C.window); // side window
    box(25, 25, 12, 15, 16, 19, C.window); // side window

    // pyramidal thatched roof (slabs inset 1 a side) + finial
    let layer = 0;
    for (let lo = 4, hi = 27; lo < hi; lo++, hi--, layer++) {
      const y = 18 + layer;
      box(lo, hi, y, y, lo, hi, layer % 2 === 0 ? C.thatchA : C.thatchB);
    }
    box(15, 16, 18 + layer, 19 + layer, 15, 16, C.finial);

    // front porch with a railing + a ladder down to the sand
    for (let x = 11; x <= 20; x++)
      for (let z = 28; z <= 29; z++) set(x, 8, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);
    for (const x of [11, 20]) box(x, x, 9, 12, 28, 29, C.rail);
    box(11, 20, 12, 12, 29, 29, C.rail);
    box(15, 16, 2, 8, 30, 30, C.stilt); // ladder stringers
    for (let y = 3; y <= 7; y += 2) box(15, 16, y, y, 29, 30, C.rail); // rungs
  },
});
