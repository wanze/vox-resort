/**
 * Small snack bar kiosk: a boxy building with a striped awning over a serving
 * counter, stacked drink crates and a blank sign, on a low platform. 32x16x19
 * (8x4 m kiosk, 4.75 m to the sign), a 2x1 tile. Front (counter) faces +z. The isometric preview
 * camera sits in the +z/-x octant, so detail lives on those two faces.
 */
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

export default defineModel({
  id: 'snack-bar',
  label: 'Snack Bar',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xf0ead9,
      wallShade: 0xdcd4c0,
      roof: 0x7c5236,
      counter: 0x8a5a34,
      counterTop: 0xa9743f,
      awningA: 0xe0473f,
      awningB: 0xf0ead9,
      crate: 0xcaa25a,
      bottle: 0x4bbcd6,
      window: 0x9fd0dc,
      sign: 0xe8e2d2,
      signFrame: 0x5a3f26,
    };

    const NX = 31;
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

    // kiosk body against the back (2 m deep, z 2..9)
    box(3, 28, 3, 14, 2, 9, C.wall);
    for (let x = 3; x <= 28; x++) box(x, x, 3, 14, 2, 2, C.wallShade); // back wall shade
    // serving opening in the front wall of the kiosk (z=9)
    box(7, 24, 8, 12, 9, 9, C.wallShade);
    // side window on the -x face
    box(3, 3, 8, 11, 4, 7, C.window);

    // flat roof overhang
    box(2, 29, 15, 16, 1, 11, C.roof);

    // serving counter jutting forward (+z)
    box(4, 27, 3, 7, 10, 12, C.counter);
    box(4, 27, 8, 8, 10, 12, C.counterTop);

    // striped awning over the counter, hung high so the serving side stays open
    for (let x = 2; x <= 29; x++) box(x, x, 15, 15, 10, 14, x % 2 === 0 ? C.awningA : C.awningB);
    for (let x = 2; x <= 29; x++) set(x, 14, 14, x % 2 === 0 ? C.awningA : C.awningB);

    // stacked drink crates + bottles on the counter
    box(5, 9, 9, 11, 10, 11, C.crate);
    for (const x of [5, 7, 9]) set(x, 12, 11, C.bottle);
    box(22, 26, 9, 10, 10, 11, C.crate);

    // blank sign above the serving opening
    box(12, 19, 15, 18, 9, 9, C.signFrame);
    box(13, 18, 16, 17, 9, 9, C.sign);
  },
});
