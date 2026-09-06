/**
 * Tennis court: a green-and-terracotta playing surface with white line markings,
 * a central net and a surrounding fence, on a low platform. 144x80 (36x20 m:
 * a 23.75x11.25 m court with full run-off), a 9x5 tile.
 *
 * Four floodlight masts stand over the fence, one off each service line, so the
 * court can be played in the evening. They are the tallest lamps on the plot —
 * 6.75 m — and the only ones that light a surface rather than a walkway.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

const FLOOD = 0xfff0d8;

/** Mast feet, off each service line and clear of the fence line. */
const MASTS: ReadonlyArray<readonly [number, number]> = [
  [45, 5],
  [97, 5],
  [45, 74],
  [97, 74],
];

export default defineModel({
  id: "tennis-court",
  label: "Tennis Court",
  tiles: { x: 9, z: 5 },
  emissive: [FLOOD],
  lights: MASTS.map(([x, z]) => ({
    x,
    z,
    y: 23, // just under the lamp face, so the light falls on the court
    color: FLOOD,
    intensity: 140,
    distance: 70,
  })),
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      surround: 0x2f7d45,
      clay: 0xb96a45,
      clayDark: 0xa85c3a,
      line: 0xf0ece0,
      netPost: 0xd8d8d0,
      net: 0x3a3a3a,
      fence: 0x8f9aa2,
      mast: 0x5a626b,
      housing: 0x3a4048,
      flood: FLOOD,
    };

    const NX = 143;
    const NZ = 79;

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

    // green surround, then the terracotta clay court inside it
    for (let x = 2; x <= 141; x++) for (let z = 2; z <= 77; z++) set(x, 3, z, C.surround);
    const cx0 = 24;
    const cx1 = 118; // baselines, 23.75 m apart
    const cz0 = 18;
    const cz1 = 62; // doubles sidelines, 11.25 m apart
    for (let x = cx0; x <= cx1; x++)
      for (let z = cz0; z <= cz1; z++) set(x, 3, z, (x + z) % 2 === 0 ? C.clay : C.clayDark);

    // white line markings
    const hLine = (z: number, from: number, to: number) => {
      for (let x = from; x <= to; x++) set(x, 3, z, C.line);
    };
    const vLine = (x: number, from: number, to: number) => {
      for (let z = from; z <= to; z++) set(x, 3, z, C.line);
    };
    hLine(cz0, cx0, cx1);
    hLine(cz1, cx0, cx1); // doubles sidelines
    hLine(cz0 + 6, cx0, cx1);
    hLine(cz1 - 6, cx0, cx1); // singles sidelines (tramlines between)
    vLine(cx0, cz0, cz1);
    vLine(cx1, cz0, cz1); // baselines
    const svc0 = 45;
    const svc1 = 97; // service lines, 6.4 m either side of the net
    vLine(svc0, cz0 + 6, cz1 - 6);
    vLine(svc1, cz0 + 6, cz1 - 6);
    hLine(40, svc0, svc1); // centre service line
    for (const x of [cx0 + 1, cx1 - 1]) set(x, 3, 40, C.line); // centre marks

    // net across the middle with posts 0.9 m outside the doubles lines
    const nx = 71;
    for (const z of [cz0 - 4, cz1 + 4]) box(nx, nx + 1, 4, 8, z, z, C.netPost);
    for (let z = cz0 - 4; z <= cz1 + 4; z++)
      for (let y = 4; y <= 7; y++) if ((z + y) % 2 === 0) set(nx, y, z, C.net);
    for (let z = cz0 - 4; z <= cz1 + 4; z++) set(nx, 7, z, C.netPost); // white tape

    // perimeter fence (posts + top rail)
    for (let x = 2; x <= 141; x += 4) {
      box(x, x, 4, 15, 2, 2, C.fence);
      box(x, x, 4, 15, 77, 77, C.fence);
    }
    for (let z = 2; z <= 77; z += 4) {
      box(2, 2, 4, 15, z, z, C.fence);
      box(141, 141, 4, 15, z, z, C.fence);
    }
    box(2, 141, 15, 15, 2, 2, C.fence);
    box(2, 141, 15, 15, 77, 77, C.fence);
    box(2, 2, 15, 15, 2, 77, C.fence);
    box(141, 141, 15, 15, 2, 77, C.fence);

    // floodlight masts: a slim pole, a glowing lamp band and a housing over it
    for (const [mx, mz] of MASTS) {
      box(mx, mx + 1, 4, 23, mz, mz + 1, C.mast);
      box(mx - 1, mx + 2, 24, 24, mz - 1, mz + 2, C.flood);
      box(mx - 1, mx + 2, 25, 26, mz - 1, mz + 2, C.housing);
    }
  },
});
