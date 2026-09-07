/**
 * Small tropical spa pavilion: stone platform, four corner posts, a many-stepped
 * low hip roof, draped linen curtains on two sides, potted palms at the corners.
 * 48x32x27 (12x8 m, 6.75 m to the ridge), a 3x2 tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

/** Wavy curtain hem: the height the linen starts at, cycling 6/8/7. */
const hem = (i: number): number => 6 + (i % 3 === 0 ? 0 : i % 3 === 1 ? 2 : 1);

export default defineModel({
  id: "spa-pavilion",
  label: "Spa Pavilion",
  category: "leisure",
  tiles: { x: 3, z: 2 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      stone: 0xc9c2b4,
      stoneDark: 0xb3a992,
      deck: 0xb5834e,
      deckDark: 0xa5763f,
      post: 0x6b4a2e,
      beam: 0x4e3620,
      roof: 0xb9553c,
      roofRidge: 0xcf6b4e,
      linen: 0xede6d6,
      linenShade: 0xd8cfba,
      pot: 0x4a6f74,
      potRim: 0x5f878c,
      trunk: 0x7a5a34,
      frondA: 0x2f7d45,
      frondB: 0x4ca05e,
    };

    const NX = 47;
    const NZ = 31;

    // platform base (3 layers) with a stepped-in deck + darker top lip
    box(0, NX, 0, 2, 0, NZ, C.stone);
    for (let x = 0; x <= NX; x++) {
      set(x, 2, 0, C.stoneDark);
      set(x, 2, NZ, C.stoneDark);
    }
    for (let z = 0; z <= NZ; z++) {
      set(0, 2, z, C.stoneDark);
      set(NX, 2, z, C.stoneDark);
    }
    for (let x = 2; x <= 45; x++)
      for (let z = 2; z <= 29; z++) set(x, 3, z, z % 2 === 0 ? C.deck : C.deckDark);

    // corner posts (2x2, inset) + top plate frame
    const posts: ReadonlyArray<readonly [number, number]> = [
      [5, 5],
      [5, 25],
      [41, 5],
      [41, 25],
    ];
    for (const [x, z] of posts) box(x, x + 1, 4, 16, z, z + 1, C.post);
    for (let x = 5; x <= 42; x++) for (const z of [5, 6, 25, 26]) set(x, 17, z, C.beam);
    for (let z = 5; z <= 26; z++) for (const x of [5, 6, 41, 42]) set(x, 17, z, C.beam);

    // low-pitch hip roof: rings shrink 2 a side until the short axis closes,
    // then a ridge cap runs along the long axis
    for (let i = 0; i <= 7; i++) {
      box(i * 2, NX - i * 2, 18 + i, 18 + i, i * 2, NZ - i * 2, C.roof);
    }
    box(16, 31, 26, 26, 15, 16, C.roofRidge);

    // draped linen curtains on two sides (wavy hem), front open
    for (let x = 8; x <= 39; x++)
      for (let y = hem(x); y <= 15; y++) set(x, y, 5, x % 2 === 0 ? C.linen : C.linenShade);
    for (let z = 9; z <= 22; z++)
      for (let y = hem(z); y <= 15; y++) set(5, y, z, z % 2 === 0 ? C.linen : C.linenShade);

    // two treatment daybeds under the roof, heads toward the curtained side
    for (const bz of [11, 20]) {
      box(14, 33, 4, 5, bz, bz + 4, C.deckDark); // frame
      box(14, 33, 6, 6, bz, bz + 4, C.linen); // linen top
      box(14, 17, 7, 7, bz + 1, bz + 3, C.linenShade); // bolster
    }

    // potted palms at the four platform corners (3x3 pot, tall trunk, full crown)
    const palms = [
      { px: 0, pz: 0, tx: 2, tz: 2 },
      { px: 0, pz: 29, tx: 2, tz: 29 },
      { px: 45, pz: 0, tx: 45, tz: 2 },
      { px: 45, pz: 29, tx: 45, tz: 29 },
    ];
    for (const { px, pz, tx, tz } of palms) {
      box(px, px + 2, 3, 5, pz, pz + 2, C.pot);
      box(px, px + 2, 5, 5, pz, pz + 2, C.potRim);
      box(tx, tx, 6, 13, tz, tz, C.trunk);
      set(tx, 13, tz, C.frondB);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        set(tx + dx, 13, tz + dz, C.frondA);
      for (const [dx, dz] of [
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
      ] as const)
        set(tx + dx, 13, tz + dz, C.frondB);
      set(tx, 14, tz, C.frondB);
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const)
        set(tx + dx, 14, tz + dz, C.frondA);
      set(tx, 15, tz, C.frondB); // tip
      for (const [dx, dz] of [
        [2, 0],
        [-2, 0],
        [0, 2],
        [0, -2],
      ] as const)
        set(tx + dx, 12, tz + dz, C.frondA);
    }
  },
});
