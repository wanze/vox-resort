/**
 * Grand resort entrance gate: two stone pillars carrying a blank arch nameplate
 * with open wrought-iron gates between them, flanked by palms, on a low platform.
 * 48x16x28 (12x4 m, 7 m to the top of the arch), a 3x1 tile. Gate faces +z.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "entrance",
  label: "Entrance",
  tiles: { x: 3, z: 1 },
  lights: [
    { x: 6, y: 22, z: 8, color: 0xffdca8, intensity: 100, distance: 56 },
    { x: 41, y: 22, z: 8, color: 0xffdca8, intensity: 100, distance: 56 },
  ],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      stone: 0xcac3b4,
      stoneDark: 0xb0a893,
      cap: 0xd8d2c4,
      plate: 0xe8e2d2,
      plateFrame: 0x9b7b46,
      iron: 0x2f2b28,
      ironCap: 0x4a4440,
      trunk: 0x7a5a34,
      frondA: 0x2f7d45,
      frondB: 0x4ca05e,
    };

    const NX = 47;
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

    // two stone pillars with plinths and caps
    const pillar = (x0: number) => {
      box(x0 - 1, x0 + 3, 3, 4, 5, 10, C.stoneDark); // plinth
      box(x0, x0 + 2, 5, 20, 6, 9, C.stone); // 5 m shaft
      for (let y = 5; y <= 20; y += 4) box(x0, x0 + 2, y, y, 6, 9, C.stoneDark); // courses
      box(x0 - 1, x0 + 3, 21, 22, 5, 10, C.cap); // cap
    };
    pillar(9);
    pillar(36);

    // arch nameplate spanning the pillars
    box(9, 38, 21, 26, 6, 9, C.stone);
    box(12, 35, 22, 25, 9, 9, C.plateFrame); // front frame (+z)
    box(13, 34, 23, 24, 9, 9, C.plate); // blank nameplate panel
    box(9, 38, 27, 27, 5, 10, C.cap); // top cap

    // open wrought-iron gates between the pillars (about 3 m to the finials)
    for (let x = 13; x <= 34; x += 3) box(x, x, 3, 14, 7, 7, C.iron); // vertical bars
    box(13, 34, 8, 8, 7, 7, C.iron); // mid rail
    box(13, 34, 14, 15, 7, 7, C.ironCap); // top rail
    for (let x = 13; x <= 34; x += 6) set(x, 16, 7, C.ironCap); // finials

    // palms flanking the outer corners
    const palm = (tx: number, tz: number) => {
      box(tx, tx, 3, 15, tz, tz, C.trunk);
      set(tx, 15, tz, C.frondB);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        set(tx + dx, 15, tz + dz, C.frondA);
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const)
        set(tx + dx, 14, tz + dz, C.frondA);
      set(tx, 16, tz, C.frondB);
    };
    palm(3, 8);
    palm(44, 8);
  },
});
