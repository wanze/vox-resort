/**
 * Small first-aid medical hut: a boxy white building with a red cross, a green
 * canopy over the door and a bench, on a low platform. 32x32x17 (8x8 m plot,
 * 6x5 m hut, 4 m tall), a 2x2 tile. Front (cross + door) faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "first-aid",
  label: "First Aid",
  tiles: { x: 2, z: 2 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xf2efe8,
      wallShade: 0xdedad0,
      roof: 0xcdd2d6,
      roofEdge: 0xb4bac0,
      cross: 0xd83a3a,
      door: 0x7fb3c4,
      canopy: 0x3f9d5a,
      canopyDark: 0x2f8347,
      bench: 0x8a6b45,
      window: 0x9fd0dc,
      pot: 0x4a6f74,
      leaf: 0x3f7d45,
    };

    const N = 31;

    // low platform base (3 layers) + darker top lip
    box(0, N, 0, 2, 0, N, C.base);
    for (let x = 0; x <= N; x++) {
      set(x, 2, 0, C.baseDark);
      set(x, 2, N, C.baseDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 2, z, C.baseDark);
      set(N, 2, z, C.baseDark);
    }

    // white building body, 6 x 5 m, set back to leave a forecourt on +z
    box(4, 27, 3, 15, 3, 23, C.wall);
    for (let x = 4; x <= 27; x++) box(x, x, 3, 15, 3, 3, C.wallShade); // plain back wall (-z)
    // flat roof with an edge lip
    box(3, 28, 16, 16, 2, 24, C.roof);
    for (let x = 3; x <= 28; x++) {
      set(x, 16, 2, C.roofEdge);
      set(x, 16, 24, C.roofEdge);
    }

    // red cross on the front wall (z=23)
    box(14, 17, 7, 14, 23, 23, C.cross);
    box(12, 19, 10, 11, 23, 23, C.cross);

    // door on the front + windows on the -x side
    box(6, 9, 3, 11, 23, 23, C.door);
    box(4, 4, 8, 12, 8, 11, C.window);
    box(4, 4, 8, 12, 16, 19, C.window);

    // green canopy over the door + bench beside it (front, +z)
    box(4, 12, 12, 13, 21, 26, C.canopy);
    for (let x = 4; x <= 12; x++) set(x, 12, 26, C.canopyDark);
    box(19, 26, 4, 4, 25, 27, C.bench);
    for (const x of [19, 26]) box(x, x, 3, 3, 25, 27, C.bench);
    for (const x of [19, 26]) box(x, x, 5, 6, 27, 27, C.bench); // backrest

    // potted plants marking the front corners of the forecourt
    for (const px of [3, 27]) {
      box(px, px + 1, 3, 5, 29, 30, C.pot);
      box(px - 1, px + 2, 6, 8, 28, 31, C.leaf);
    }
  },
});
