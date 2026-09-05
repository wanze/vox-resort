/**
 * Whitewashed holiday cottage: a terracotta tiled pitched roof, shuttered
 * windows, a small porch and a flower box, on a low platform. 32x48x26
 * (8x12 m plot, a 7x11 m cottage 6.5 m to the ridge), a 2x3 tile.
 * Front (porch) faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "cottage",
  label: "Cottage",
  tiles: { x: 2, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xefe9dc,
      wallShade: 0xd9d2c1,
      roofA: 0xc06a3f,
      roofB: 0xa9572f,
      ridge: 0xcf7b4e,
      door: 0x7a5330,
      window: 0x9fd0dc,
      shutter: 0x4f8a86,
      porch: 0x8a6b45,
      planter: 0x6b4a2c,
      bloomA: 0xe0473f,
      bloomB: 0xf2c24c,
      leaf: 0x3f8a48,
    };

    const NX = 31;
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

    // whitewashed body, 7 x 11 m
    box(2, 29, 3, 16, 2, 45, C.wall);
    for (let z = 2; z <= 45; z++) box(2, 2, 3, 16, z, z, C.wallShade); // -x side tone

    // terracotta pitched roof, ridge running along z (the long axis)
    for (let step = 0; step <= 7; step++) {
      const y = 17 + step;
      const lo = 1 + step * 2;
      const hi = 30 - step * 2;
      if (lo > hi) break;
      box(lo, hi, y, y, 1, 46, step % 2 === 0 ? C.roofA : C.roofB);
    }
    box(15, 16, 25, 25, 1, 46, C.ridge);

    // front (z=45): door + porch overhang on posts
    box(13, 18, 3, 12, 45, 45, C.door);
    box(10, 21, 13, 13, 45, 47, C.porch);
    for (const x of [10, 21]) box(x, x, 3, 12, 46, 46, C.porch); // porch posts

    // shuttered windows: two on the front, three down the -x side
    const window = (wx: number, wy: number, wz: number, side: "z" | "x") => {
      if (side === "z") {
        box(wx, wx + 2, wy, wy + 4, wz, wz, C.window);
        box(wx - 1, wx - 1, wy, wy + 4, wz, wz, C.shutter);
        box(wx + 3, wx + 3, wy, wy + 4, wz, wz, C.shutter);
      } else {
        box(2, 2, wy, wy + 4, wz, wz + 2, C.window);
        box(2, 2, wy, wy + 4, wz - 1, wz - 1, C.shutter);
        box(2, 2, wy, wy + 4, wz + 3, wz + 3, C.shutter);
      }
    };
    window(5, 7, 45, "z");
    window(24, 7, 45, "z");
    window(0, 7, 11, "x");
    window(0, 7, 22, "x");
    window(0, 7, 33, "x");

    // flower box under a front window
    box(4, 10, 5, 6, 46, 46, C.planter);
    for (let x = 4; x <= 10; x++) set(x, 7, 46, [C.bloomA, C.bloomB, C.leaf][x % 3]!);
  },
});
