/**
 * Premium resort villa: whitewashed two-storey walls, a terracotta hipped roof,
 * an arched veranda colonnade along the front and a small rectangular plunge pool
 * inset into a side terrace, on a low platform. 64x64x40 (16x16 m plot, a
 * 9.5x10 m villa with two 3 m storeys, 10 m to the ridge), a 4x4 tile.
 * Veranda faces +z; the plunge pool sits on the -x terrace.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "villa",
  label: "Villa",
  tiles: { x: 4, z: 4 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const del = b.del.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      terrace: 0xd8d2c4,
      terraceDark: 0xc3bca9,
      coping: 0xe4dfd0,
      water: 0x37abd2,
      waterHi: 0x69c9e0,
      wall: 0xf1ede2,
      wallShade: 0xdcd6c6,
      quoin: 0xe0cfa8,
      column: 0xeae4d6,
      arch: 0xd8d0bd,
      roofA: 0xc06a3f,
      roofB: 0xa9572f,
      ridge: 0xcf7b4e,
      door: 0x6b4a2c,
      window: 0x9fd0dc,
      shutter: 0x3f7d76,
      rail: 0xe4dfd0,
      lounger: 0xf3efe6,
    };

    const N = 63;

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

    // paved terrace (two layers) across the footprint
    for (let x = 2; x <= 61; x++)
      for (let z = 2; z <= 61; z++) {
        box(x, x, 3, 4, z, z, C.terraceDark);
        set(x, 4, z, (Math.floor(x / 4) + Math.floor(z / 4)) % 2 === 0 ? C.terrace : C.terraceDark);
      }

    // plunge pool inset into the -x terrace (recessed one level, coping rim)
    for (let x = 5; x <= 18; x++)
      for (let z = 20; z <= 51; z++) {
        const border = x === 5 || x === 18 || z === 20 || z === 51;
        if (border) {
          set(x, 4, z, C.coping);
          continue;
        }
        del(x, 4, z);
        set(x, 3, z, (x * 5 + z * 3) % 9 < 2 ? C.waterHi : C.water);
      }
    // a pair of loungers beside the pool
    for (const lz of [26, 40]) box(20, 23, 5, 5, lz, lz + 5, C.lounger);

    // whitewashed two-storey body (3 m a floor) with corner quoins
    box(22, 59, 5, 28, 12, 52, C.wall);
    for (let x = 22; x <= 59; x++) box(x, x, 5, 28, 12, 12, C.wallShade); // plain back (-z)
    for (const [x, z] of [
      [22, 12],
      [59, 12],
      [22, 52],
      [59, 52],
    ] as const)
      box(x, x, 5, 28, z, z, C.quoin);
    box(22, 59, 16, 16, 12, 52, C.quoin); // floor-divider band

    // terracotta hipped roof over the body
    for (let s = 0; s <= 9; s++) {
      const y = 29 + s;
      const xlo = 22 + 2 * s;
      const xhi = 59 - 2 * s;
      const zlo = 12 + 2 * s;
      const zhi = 52 - 2 * s;
      if (xlo > xhi || zlo > zhi) break;
      box(xlo, xhi, y, y, zlo, zhi, s % 2 === 0 ? C.roofA : C.roofB);
    }
    box(40, 41, 39, 39, 30, 34, C.ridge);

    // shuttered windows: upper storey on the front (+z, z=52), both on the -x side
    const winZ = (wx: number, wy: number) => {
      box(wx, wx + 3, wy, wy + 5, 52, 52, C.window);
      box(wx - 1, wx - 1, wy, wy + 5, 52, 52, C.shutter);
      box(wx + 4, wx + 4, wy, wy + 5, 52, 52, C.shutter);
    };
    for (const wx of [26, 35, 46, 55]) winZ(wx, 19);
    for (const wx of [26, 55]) winZ(wx, 8);
    const winX = (wy: number, wz: number) => {
      box(22, 22, wy, wy + 5, wz, wz + 3, C.window);
      box(22, 22, wy, wy + 5, wz - 1, wz - 1, C.shutter);
      box(22, 22, wy, wy + 5, wz + 4, wz + 4, C.shutter);
    };
    for (const wz of [17, 29, 41]) winX(19, wz);
    for (const wz of [17, 41]) winX(8, wz);

    // arched veranda colonnade along the front (+z)
    const cols: readonly number[] = [22, 31, 40, 49, 58];
    for (const x of cols) box(x, x + 1, 5, 22, 56, 57, C.column);
    box(22, 59, 23, 25, 56, 57, C.arch); // entablature spanning the columns
    // carve arch openings between neighbouring columns
    for (let i = 0; i < cols.length - 1; i++) {
      const a = cols[i]! + 2;
      const c = cols[i + 1]! - 1;
      for (let x = a; x <= c; x++)
        for (let z = 56; z <= 57; z++) {
          del(x, 23, z);
          if (x > a + 1 && x < c - 1) del(x, 24, z);
        }
    }
    // veranda roof + a low front rail with an entrance gap
    box(21, 60, 26, 26, 52, 58, C.roofB);
    box(22, 59, 27, 27, 52, 58, C.roofA);
    for (let x = 22; x <= 59; x++) if (x < 36 || x > 45) set(x, 5, 58, C.rail);
    box(36, 45, 5, 16, 52, 52, C.door); // arched entrance doorway
  },
});
