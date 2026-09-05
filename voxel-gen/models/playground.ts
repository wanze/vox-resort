/**
 * Colorful children's playground: a slide, swings and a climbing frame on soft
 * rubber matting, plus a sandpit, on a low platform. 64x48 (16x12 m), a 4x3
 * tile. Equipment keeps child-scale heights: the slide platform is 2.25 m.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "playground",
  label: "Playground",
  tiles: { x: 4, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      mat1: 0x4fb0d0,
      mat2: 0x6fbf59,
      mat3: 0xf2c94c,
      frame: 0xd94f4f,
      frameB: 0x3f6fb0,
      slide: 0xf2c94c,
      platform: 0x9b5de5,
      swing: 0x2f2a26,
      seat: 0xf07f3c,
      bar: 0xe0e0e0,
      rim: 0x8a6b45,
      sand: 0xe4d3a8,
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

    // soft rubber matting in colored blocks
    const mats = [C.mat1, C.mat2, C.mat3];
    for (let x = 2; x <= 61; x++)
      for (let z = 2; z <= 45; z++)
        set(x, 3, z, mats[(Math.floor(x / 6) + Math.floor(z / 6)) % 3]!);

    // slide: a raised platform on posts with a chute descending toward +x
    for (const [x, z] of [
      [6, 6],
      [14, 6],
      [6, 14],
      [14, 14],
    ] as const)
      box(x, x + 1, 4, 12, z, z + 1, C.frameB);
    box(6, 15, 12, 12, 6, 15, C.platform);
    for (let i = 0; i <= 5; i++)
      box(16 + 2 * i, 17 + 2 * i, 12 - 2 * i, 12 - 2 * i, 8, 13, C.slide);
    for (let y = 4; y <= 11; y++) set(10, y, 5, C.bar); // ladder rail

    // swing set: an A-frame with three hanging swings
    for (const x of [26, 46]) {
      box(x, x, 4, 13, 20, 20, C.frame);
      box(x, x, 4, 13, 30, 30, C.frame);
    }
    box(26, 46, 13, 13, 25, 25, C.frame); // top bar
    for (const x of [31, 36, 41]) {
      box(x, x, 8, 12, 25, 25, C.swing); // chains
      box(x, x, 7, 7, 24, 26, C.seat);
    }

    // climbing frame: a cube of monkey bars
    for (const [x, z] of [
      [48, 32],
      [60, 32],
      [48, 44],
      [60, 44],
    ] as const)
      box(x, x, 4, 11, z, z, C.frameB);
    for (const y of [7, 11]) {
      box(48, 60, y, y, 32, 32, C.bar);
      box(48, 60, y, y, 44, 44, C.bar);
      box(48, 48, y, y, 32, 44, C.bar);
      box(60, 60, y, y, 32, 44, C.bar);
    }

    // sandpit: a timber rim ring around a bed of sand
    box(5, 25, 3, 4, 25, 25, C.rim);
    box(5, 25, 3, 4, 45, 45, C.rim);
    box(5, 5, 3, 4, 25, 45, C.rim);
    box(25, 25, 3, 4, 25, 45, C.rim);
    box(6, 24, 3, 3, 26, 44, C.sand);
  },
});
