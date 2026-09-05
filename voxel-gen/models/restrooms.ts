/**
 * Small public restroom block: a tiled building with two pictogram doors and a
 * low planter, on a low platform. 32x16x17 (8x4 m, 4.25 m tall), a 2x1 tile.
 * Doors face +z (toward the preview camera).
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "restrooms",
  label: "Restrooms",
  tiles: { x: 2, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xcfd6db,
      wallShade: 0xb9c1c7,
      tile: 0xaeb7bd,
      roof: 0x5f6b73,
      roofEdge: 0x4c565d,
      door: 0x3a5a6b,
      signM: 0x3f6fb0,
      signW: 0xc24d8a,
      planter: 0x8a6b45,
      leaf: 0x3f7d45,
    };

    const NX = 31;
    const NZ = 15;

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

    // tiled building body, 7 x 2.5 m
    box(2, 29, 3, 14, 2, 11, C.wall);
    for (let x = 2; x <= 29; x++)
      for (let y = 3; y <= 14; y++) if ((x + y) % 3 === 0) set(x, y, 11, C.tile); // front tiling
    for (let x = 2; x <= 29; x++) box(x, x, 3, 14, 2, 2, C.wallShade); // plain back wall (-z)

    // flat roof with lip
    box(1, 30, 15, 16, 1, 12, C.roof);
    for (let x = 1; x <= 30; x++) set(x, 15, 12, C.roofEdge);

    // two doors on the front (z=11) with pictogram signs above
    box(7, 10, 3, 10, 11, 11, C.door);
    box(21, 24, 3, 10, 11, 11, C.door);
    box(8, 9, 12, 13, 11, 11, C.signM);
    box(22, 23, 12, 13, 11, 11, C.signW);

    // low planter along the front base (+z)
    box(2, 29, 3, 4, 13, 14, C.planter);
    for (let x = 3; x <= 28; x += 2) set(x, 5, 14, C.leaf);
  },
});
