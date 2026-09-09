/**
 * Open-air resort restaurant: a tiled gable roof over a pavilion with terrace
 * tables under parasols and potted plants, on a low platform. 64x48x27
 * (16x12 m, 6.75 m to the ridge), a 4x3 tile. Terrace opens toward +z.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'restaurant',
  label: 'Restaurant',
  category: 'amenities',
  tiles: { x: 4, z: 3 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      deck: 0xc7a26a,
      deckDark: 0xb08d56,
      post: 0x6b4a2c,
      beam: 0x4e3620,
      roofA: 0xb9553c,
      roofB: 0xa2472f,
      ridge: 0xcf6b4e,
      tableLeg: 0x8a8f96,
      tableTop: 0xe6e0d2,
      chair: 0x7a5330,
      poleA: 0xededed,
      canopyA: 0xe0473f,
      canopyB: 0xf0ead9,
      pot: 0x4a6f74,
      leaf: 0x3f7d45,
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

    // tiled deck floor
    for (let x = 2; x <= NX - 2; x++)
      for (let z = 2; z <= NZ - 2; z++) set(x, 3, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);

    // pavilion posts over the back region (z 3..21) + top beams
    const posts: ReadonlyArray<readonly [number, number]> = [
      [3, 3],
      [23, 3],
      [42, 3],
      [60, 3],
      [3, 21],
      [23, 21],
      [42, 21],
      [60, 21],
    ];
    for (const [x, z] of posts) box(x, x, 4, 12, z, z, C.post);
    box(3, 60, 13, 13, 3, 3, C.beam);
    box(3, 60, 13, 13, 21, 21, C.beam);

    // tiled gable roof spanning the full width, ridge running along x at z=12
    for (let step = 0; step <= 12; step++) {
      const y = 13 + step;
      const lo = step;
      const hi = 24 - step;
      if (lo > hi) break;
      box(0, NX, y, y, lo, hi, step % 2 === 0 ? C.roofA : C.roofB);
    }
    box(0, NX, 26, 26, 12, 12, C.ridge);

    // tables under the pavilion
    const table = (cx: number, cz: number) => {
      box(cx, cx + 1, 4, 5, cz, cz + 1, C.tableLeg);
      box(cx - 1, cx + 2, 6, 6, cz - 1, cz + 2, C.tableTop);
      for (const dx of [-3, 4]) box(cx + dx, cx + dx, 4, 6, cz, cz + 1, C.chair);
    };
    for (const cx of [9, 24, 39, 54]) {
      table(cx, 7);
      table(cx, 16);
    }

    // parasol tables on the open terrace toward +z
    const parasol = (cx: number, cz: number) => {
      box(cx, cx + 1, 4, 5, cz, cz + 1, C.tableLeg);
      box(cx - 1, cx + 2, 6, 6, cz - 1, cz + 2, C.tableTop);
      box(cx, cx, 6, 14, cz, cz, C.poleA);
      for (let r = 4; r >= 1; r--) {
        const y = 12 + (4 - r);
        for (let dx = -r; dx <= r; dx++)
          for (let dz = -r; dz <= r; dz++)
            if (Math.abs(dx) + Math.abs(dz) <= r + 1)
              set(cx + dx, y, cz + dz, (dx + dz) % 2 === 0 ? C.canopyA : C.canopyB);
      }
    };
    for (const cx of [11, 26, 41, 56]) parasol(cx, 34);

    // potted plants along the terrace edge
    for (const [px, pz] of [
      [2, 43],
      [20, 43],
      [38, 43],
      [58, 43],
    ] as const) {
      box(px, px + 1, 3, 6, pz, pz + 1, C.pot);
      box(px - 1, px + 2, 7, 9, pz - 1, pz + 2, C.leaf);
      set(px, 10, pz, C.leaf);
    }
  },
});
