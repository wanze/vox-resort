/**
 * Small resort supermarket: a flat-roofed building with a green awning over wide
 * glass storefront windows, crates of fruit and a stacked drinks fridge by the
 * doors, on a low platform. 64x48x27 (16x12 m plot, a 15x8.5 m market 5.75 m
 * tall), a 4x3 tile. Storefront faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "supermarket",
  label: "Supermarket",
  category: "amenities",
  tiles: { x: 4, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xeee7d6,
      wallShade: 0xd8d0bd,
      roof: 0xcaccce,
      roofEdge: 0xacaeb0,
      awning: 0x3f9d5a,
      awningDark: 0x2f8347,
      glass: 0x8fd0dc,
      glassHi: 0xbfe6ee,
      mullion: 0xcfc9b8,
      door: 0x6f7d84,
      crate: 0xb07a3c,
      fruitA: 0xe0473f,
      fruitB: 0xf2c24c,
      fruitC: 0xe98a3c,
      fridge: 0xdfe6ea,
      drink: 0x4bbcd6,
    };

    const NX = 63;
    const NZ = 47;

    // low platform base (3 layers) + darker top lip
    box(0, NX, 0, 2, 0, NZ, C.base);
    for (let x = 0; x <= NX; x++) {
      set(x, 2, 0, C.baseDark);
      set(x, 2, NZ, C.baseDark);
    }
    for (let z = 0; z <= NZ; z++) {
      set(0, 2, z, C.baseDark);
      set(NX, 2, z, C.baseDark);
    }

    // building body, 15 x 8.5 m, set back to leave a service apron on +z
    box(2, 61, 3, 24, 3, 36, C.wall);
    for (let x = 2; x <= 61; x++) box(x, x, 3, 24, 3, 3, C.wallShade); // plain back (-z)
    // flat roof + edge
    box(1, 62, 25, 26, 2, 38, C.roof);
    for (let x = 1; x <= 62; x++) set(x, 25, 38, C.roofEdge);

    // wide glass storefront on the front (z=36) with mullions
    box(4, 59, 7, 20, 36, 36, C.glass);
    for (let x = 4; x <= 59; x++)
      for (let y = 7; y <= 20; y++) if ((x + y) % 4 === 0) set(x, y, 36, C.glassHi);
    for (let x = 4; x <= 59; x += 5) box(x, x, 7, 20, 36, 36, C.mullion);
    // central sliding doors
    box(28, 35, 3, 16, 36, 36, C.door);

    // green awning over the storefront
    box(1, 62, 21, 21, 36, 42, C.awning);
    for (let x = 1; x <= 62; x++) set(x, 21, 42, x % 2 === 0 ? C.awning : C.awningDark);
    box(1, 62, 22, 22, 36, 36, C.awningDark);

    // crates of fruit out front (+z)
    const fruits = [C.fruitA, C.fruitB, C.fruitC];
    for (let i = 0; i < 5; i++) {
      const x = 4 + i * 5;
      box(x, x + 3, 3, 6, 38, 41, C.crate);
      for (let dx = 0; dx <= 3; dx++)
        for (let dz = 0; dz <= 3; dz++) set(x + dx, 7, 38 + dz, fruits[(dx + dz + i) % 3]!);
    }

    // stacked drinks fridge by the doors
    box(40, 47, 3, 16, 38, 41, C.fridge);
    for (let y = 6; y <= 14; y += 3) box(41, 46, y, y, 38, 38, C.drink);

    // trolley bay at the far end of the apron
    for (const tx of [52, 56]) {
      box(tx, tx + 2, 3, 6, 39, 44, C.mullion);
      box(tx, tx + 2, 7, 7, 39, 44, C.roofEdge);
    }
  },
});
