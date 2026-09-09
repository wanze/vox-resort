/**
 * Stylish standalone resort bar: a wooden deck with a long counter and stools,
 * bottle shelves and string lights, on a low platform. 48x32x21 (12x8 m deck,
 * 5.25 m to the light rail), a 3x2 tile. The open bar side faces +z.
 *
 * The string lights are emissive and the deck is lit after dark by a pair of
 * lamps hung under the rail — the same treatment the poolside bar gets, spread
 * over a counter half again as long.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BULB = 0xf4d57c;

export default defineModel({
  id: 'resort-bar',
  label: 'Resort Bar',
  category: 'amenities',
  tiles: { x: 3, z: 2 },
  emissive: [BULB],
  // Two lamps under the light rail, a third of the way in from each end.
  lights: [
    { x: 15, y: 18, z: 20, color: 0xffd489, intensity: 90, distance: 54 },
    { x: 32, y: 18, z: 20, color: 0xffd489, intensity: 90, distance: 54 },
  ],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      deck: 0xc09a63,
      deckDark: 0xa9854f,
      counter: 0x5a3a22,
      counterTop: 0x7a5330,
      back: 0x6b4a2c,
      shelf: 0x4a3320,
      stool: 0x2f2a26,
      stoolSeat: 0xc24d5a,
      post: 0x4a3320,
      bulb: BULB,
      wire: 0x3a2f22,
      bottleA: 0x4bbcd6,
      bottleB: 0x6fbf59,
      bottleC: 0xe85d8a,
    };

    const NX = 47;
    const NZ = 31;

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

    // wooden deck top
    for (let x = 2; x <= 45; x++)
      for (let z = 2; z <= 29; z++) set(x, 3, z, (x + z) % 2 === 0 ? C.deck : C.deckDark);

    // back bar unit with bottle shelves against the far side (z 3..5)
    box(3, 44, 4, 16, 3, 5, C.back);
    for (const y of [8, 11, 14]) box(4, 43, y, y, 5, 5, C.shelf);
    const bottles = [C.bottleA, C.bottleB, C.bottleC];
    for (let x = 4; x <= 43; x += 2) for (const y of [9, 12]) set(x, y, 5, bottles[(x + y) % 3]!);

    // long counter in front of the back bar (z 8..11) + overhanging top toward +z
    box(3, 44, 4, 9, 8, 11, C.counter);
    box(3, 44, 10, 10, 8, 12, C.counterTop);

    // stools in front of the counter (nearer +z)
    for (const x of [6, 12, 18, 24, 30, 36, 42]) {
      box(x, x + 1, 4, 7, 14, 15, C.stool);
      box(x, x + 1, 8, 8, 14, 15, C.stoolSeat);
    }

    // corner posts + a light rail carrying string lights around the open sides
    const posts: ReadonlyArray<readonly [number, number]> = [
      [3, 3],
      [44, 3],
      [3, 28],
      [44, 28],
    ];
    for (const [x, z] of posts) box(x, x, 3, 20, z, z, C.post);
    box(3, 44, 20, 20, 28, 28, C.post);
    box(3, 3, 20, 20, 3, 28, C.post);
    box(44, 44, 20, 20, 3, 28, C.post);
    for (let x = 6; x <= 41; x += 3) {
      set(x, 19, 28, C.bulb);
      set(x, 20, 28, C.wire);
    }
    for (let z = 6; z <= 25; z += 4) {
      for (const x of [3, 44]) {
        set(x, 19, z, C.bulb);
        set(x, 20, z, C.wire);
      }
    }
  },
});
