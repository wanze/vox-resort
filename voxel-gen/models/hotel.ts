/**
 * Multi-storey resort hotel block: floors of balconied rooms, a grand ground
 * entrance and a rooftop terrace, on a low platform. 96x64x55 (24x16 m, four
 * 3 m storeys and a 13.5 m parapet), a 6x4 tile. Balconied facades face +z and -x.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

export default defineModel({
  id: "hotel",
  label: "Hotel",
  tiles: { x: 6, z: 4 },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      wall: 0xeadfca,
      wallShade: 0xd6cab2,
      band: 0xd2b98c,
      rail: 0xf4efe4,
      glass: 0x5aa6c0,
      glassDark: 0x3f88a4,
      roofFloor: 0xc9b7d0,
      door: 0x7a5330,
      canopy: 0xc24d5a,
      pot: 0x4a6f74,
      leaf: 0x3f7d45,
      water: 0x37abd2,
    };

    const NX = 95;
    const NZ = 63;

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

    // building body: four 3 m storeys, y 3..50
    box(4, 91, 3, 50, 6, 57, C.wall);
    for (let x = 4; x <= 91; x++) for (let y = 3; y <= 50; y++) set(x, y, 6, C.wallShade); // back

    // ground floor: windows either side of the entrance
    for (const wx of [10, 22, 34, 60, 72, 84]) {
      box(wx, wx + 5, 6, 12, 57, 57, (wx / 6) % 2 === 0 ? C.glass : C.glassDark);
    }

    // upper storeys: floor bands, windows and balconies on +z and -x
    const floors = [15, 27, 39];
    for (const fy of floors) {
      box(4, 91, fy - 1, fy - 1, 57, 57, C.band);
      box(4, 4, fy - 1, fy - 1, 6, 57, C.band);

      // +z facade
      for (let x = 8; x <= 82; x += 10) {
        box(x, x + 5, fy + 3, fy + 9, 57, 57, (x / 10) % 2 === 0 ? C.glass : C.glassDark);
        box(x - 1, x + 6, fy - 1, fy - 1, 58, 59, C.rail); // balcony slab
        box(x - 1, x + 6, fy, fy + 1, 59, 59, C.rail); // front rail
        box(x - 1, x - 1, fy, fy + 1, 58, 59, C.rail);
        box(x + 6, x + 6, fy, fy + 1, 58, 59, C.rail);
      }
      // -x facade
      for (let z = 10; z <= 46; z += 10) {
        box(4, 4, fy + 3, fy + 9, z, z + 5, (z / 10) % 2 === 0 ? C.glass : C.glassDark);
        box(2, 3, fy - 1, fy - 1, z - 1, z + 6, C.rail);
        box(2, 2, fy, fy + 1, z - 1, z + 6, C.rail);
        box(2, 3, fy, fy + 1, z - 1, z - 1, C.rail);
        box(2, 3, fy, fy + 1, z + 6, z + 6, C.rail);
      }
    }

    // grand ground entrance on +z with a canopy on columns
    box(42, 53, 3, 14, 57, 57, C.door);
    box(38, 57, 15, 16, 57, 62, C.canopy);
    for (const cx of [38, 56]) box(cx, cx + 1, 3, 14, 61, 62, C.rail);
    for (const [px, pz] of [
      [34, 60],
      [60, 60],
    ] as const) {
      box(px, px + 2, 3, 6, pz, pz + 2, C.pot);
      box(px - 1, px + 3, 7, 10, pz - 1, pz + 3, C.leaf);
    }

    // rooftop terrace: floor, parapet, a plunge pool and loungers
    box(4, 91, 51, 51, 6, 57, C.roofFloor);
    for (let x = 4; x <= 91; x++) {
      box(x, x, 52, 53, 6, 6, C.rail);
      box(x, x, 52, 53, 57, 57, C.rail);
    }
    for (let z = 6; z <= 57; z++) {
      box(4, 4, 52, 53, z, z, C.rail);
      box(91, 91, 52, 53, z, z, C.rail);
    }
    box(14, 38, 52, 52, 16, 46, C.water);
    for (const x of [50, 58, 66, 74]) box(x, x + 2, 52, 54, 20, 28, C.rail); // loungers
  },
});
