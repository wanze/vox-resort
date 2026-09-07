/**
 * Two-storey holiday house: colour-washed walls, a terracotta pitched roof with
 * a chimney, shuttered windows on two floors and a front door with steps, on a
 * low platform. 48x48x39 (12x12 m plot, a 10x10 m house with two 3 m storeys
 * and a 9.75 m ridge), a 3x3 tile. Front faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "house",
  label: "House",
  category: "lodging",
  tiles: { x: 3, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xf0d9b0,
      wallShade: 0xdcc39a,
      corner: 0xe7e1d2,
      roofA: 0xc06a3f,
      roofB: 0xa9572f,
      ridge: 0xcf7b4e,
      door: 0x7a5330,
      window: 0x9fd0dc,
      shutter: 0x3f7d76,
      chimney: 0xb0a893,
      chimneyDark: 0x968f80,
      step: 0xc9c2b4,
    };

    const N = 47;

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

    // two-storey body (3 m a floor) with lightened corner quoins
    box(4, 43, 3, 26, 4, 43, C.wall);
    for (let x = 4; x <= 43; x++) box(x, x, 3, 26, 4, 4, C.wallShade); // plain back (-z)
    for (const [x, z] of [
      [4, 4],
      [43, 4],
      [4, 43],
      [43, 43],
    ] as const)
      box(x, x, 3, 26, z, z, C.corner);
    box(4, 43, 14, 14, 4, 43, C.corner); // floor-divider band

    // terracotta pitched roof, ridge running along x at z=23
    for (let step = 0; step <= 10; step++) {
      const y = 27 + step;
      const lo = 2 + step * 2;
      const hi = 45 - step * 2;
      if (lo > hi) break;
      box(0, N, y, y, lo, hi, step % 2 === 0 ? C.roofA : C.roofB);
    }
    box(0, N, 38, 38, 23, 24, C.ridge);

    // chimney rising out of the -z roof slope
    box(32, 36, 28, 42, 9, 13, C.chimney);
    box(32, 36, 42, 42, 9, 13, C.chimneyDark);

    // shuttered windows, two floors on the front (z=43) + side (-x)
    const winZ = (wx: number, wy: number) => {
      box(wx, wx + 3, wy, wy + 5, 43, 43, C.window);
      box(wx - 1, wx - 1, wy, wy + 5, 43, 43, C.shutter);
      box(wx + 4, wx + 4, wy, wy + 5, 43, 43, C.shutter);
    };
    for (const wx of [9, 34]) winZ(wx, 6); // ground floor
    for (const wx of [9, 21, 34]) winZ(wx, 17); // upper floor
    for (const wz of [12, 23, 34]) {
      box(4, 4, 17, 22, wz, wz + 3, C.window);
      box(4, 4, 17, 22, wz - 1, wz - 1, C.shutter);
      box(4, 4, 17, 22, wz + 4, wz + 4, C.shutter);
    }
    for (const wz of [14, 30]) {
      box(4, 4, 6, 11, wz, wz + 3, C.window);
      box(4, 4, 6, 11, wz - 1, wz - 1, C.shutter);
      box(4, 4, 6, 11, wz + 4, wz + 4, C.shutter);
    }

    // front door + steps
    box(20, 25, 3, 13, 43, 43, C.door);
    box(19, 26, 3, 3, 44, 46, C.step);
    box(20, 25, 3, 4, 44, 45, C.step);
  },
});
