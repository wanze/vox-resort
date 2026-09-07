/**
 * Poolside tiki bar: pyramidal thatched roof over a curved counter (solid bamboo
 * cabinet), drum stools, blenders + cocktails on the top, hanging string lights,
 * on a low platform. 32x32x30 (8x8 m, 6.75 m to the apex), a 2x2 tile.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "poolside-bar",
  label: "Poolside Bar",
  category: "amenities",
  tiles: { x: 2, z: 2 },
  emissive: [0xf4d57c],
  lights: [{ x: 15, y: 22, z: 16, color: 0xffd489, intensity: 110, distance: 60 }],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      deck: 0xcbb78d,
      deckDark: 0xb39e74,
      barLight: 0xc79a5b,
      barDark: 0xb0864a, // low contrast -> counter reads solid
      counter: 0x6b4a2c,
      post: 0x5a3f26,
      beam: 0x4a3320,
      thatchA: 0xc7a24e,
      thatchB: 0xad8636,
      finial: 0x4a3320,
      rattan: 0xb98b4e,
      cushion: 0x3e7f86,
      bulb: 0xf4d57c,
      wire: 0x3a2f22,
      blender: 0x40444a,
      jar: 0xc2e0e8,
      straw: 0xede6d6,
    };
    const drinks = [0xe85d8a, 0x6fbf59, 0xee9a3c, 0xf2d45e];

    const cx = 15.5;
    const cz = 1.5; // curve center near the back edge
    const dist = (x: number, z: number) => Math.hypot(x + 0.5 - cx, z + 0.5 - cz);
    const N = 31;

    // low platform base + darker top lip
    box(0, N, 0, 2, 0, N, C.deck);
    for (let x = 0; x <= N; x++) {
      set(x, 2, 0, C.deckDark);
      set(x, 2, N, C.deckDark);
    }
    for (let z = 0; z <= N; z++) {
      set(0, 2, z, C.deckDark);
      set(N, 2, z, C.deckDark);
    }

    // curved bar: solid bamboo-slat cabinet + overhanging counter top
    for (let x = 0; x <= N; x++)
      for (let z = 0; z <= N; z++) {
        const d = dist(x, z);
        if (z + 0.5 < cz) continue; // front crescent only
        if (d >= 17.3 && d <= 20.3) {
          const ang = Math.atan2(z + 0.5 - cz, x + 0.5 - cx);
          const slat = Math.floor(ang / (Math.PI / 24)) % 2 === 0 ? C.barLight : C.barDark;
          box(x, x, 3, 8, z, z, slat);
        }
        if (d >= 16.8 && d <= 20.8) set(x, 9, z, C.counter);
      }

    // drum stools around the curved front
    const stoolAngles = [46, 60, 75, 90, 105, 120, 134];
    for (const deg of stoolAngles) {
      const a = (deg * Math.PI) / 180;
      const r = 21.9;
      const ex = Math.round(cx - 0.5 + r * Math.cos(a));
      const ez = Math.round(cz - 0.5 + r * Math.sin(a));
      box(ex, ex + 1, 3, 6, ez, ez + 1, C.rattan);
      box(ex, ex + 1, 7, 7, ez, ez + 1, C.cushion);
    }

    // corner posts + top plate frame (2.5 m of headroom under the beams)
    const posts: ReadonlyArray<readonly [number, number]> = [
      [4, 4],
      [4, 26],
      [26, 4],
      [26, 26],
    ];
    for (const [x, z] of posts) box(x, x + 1, 3, 12, z, z + 1, C.post);
    for (let x = 4; x <= 27; x++) for (const z of [4, 5, 26, 27]) set(x, 13, z, C.beam);
    for (let z = 4; z <= 27; z++) for (const x of [4, 5, 26, 27]) set(x, 13, z, C.beam);

    // pyramidal thatched roof (filled slabs, inset 1/side) + finial
    let layer = 0;
    for (let lo = 2, hi = 29; lo < hi; lo++, hi--, layer++) {
      const y = 14 + layer;
      box(lo, hi, y, y, lo, hi, layer % 2 === 0 ? C.thatchA : C.thatchB);
    }
    box(15, 16, 14 + layer, 15 + layer, 15, 16, C.finial);

    // hanging string lights under the front & side eaves
    const lights = [
      ...[8, 12, 16, 20, 24].map((x): [number, number, number] => [x, 11, 26]),
      ...[10, 15, 20].map((z): [number, number, number] => [5, 11, z]),
      ...[10, 15, 20].map((z): [number, number, number] => [26, 11, z]),
    ];
    for (const [x, y, z] of lights) {
      set(x, y, z, C.bulb);
      set(x, y + 1, z, C.wire);
    }

    // blenders on the bartender (inner) edge
    for (const deg of [78, 102]) {
      const a = (deg * Math.PI) / 180;
      const r = 17.8;
      const bx = Math.round(cx - 0.5 + r * Math.cos(a));
      const bz = Math.round(cz - 0.5 + r * Math.sin(a));
      set(bx, 10, bz, C.blender);
      box(bx, bx, 11, 12, bz, bz, C.jar);
      set(bx, 13, bz, drinks[1]!);
    }

    // cocktails in front of each stool (outer counter edge) with straws
    stoolAngles.forEach((deg, i) => {
      const a = (deg * Math.PI) / 180;
      const r = 19.6;
      const dx = Math.round(cx - 0.5 + r * Math.cos(a));
      const dz = Math.round(cz - 0.5 + r * Math.sin(a));
      set(dx, 10, dz, drinks[i % drinks.length]!);
      set(dx, 11, dz, C.straw);
    });
  },
});
