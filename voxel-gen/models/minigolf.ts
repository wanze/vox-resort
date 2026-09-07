/**
 * Mini-golf course: small greens with a windmill, obstacle props, winding paths
 * and flags, on a low platform. 80x64 (20x16 m, a compact course), a 5x4 tile.
 *
 * Six knee-high bollards line the spine path so the course can be played after
 * dark. They are deliberately small — a short reach each, rather than one lamp
 * flooding the whole course — so the holes read as a lit trail.
 */
import { defineModel, type VoxelBuilder } from "../voxelgen.ts";

const GLOW = 0xffe3a3;

/** Bollards down both sides of the spine path, staggered so the trail reads. */
const BOLLARDS: ReadonlyArray<readonly [number, number]> = [
  [14, 29],
  [38, 29],
  [66, 29],
  [22, 34],
  [50, 34],
  [74, 34],
];

export default defineModel({
  id: "minigolf",
  label: "Minigolf",
  category: "leisure",
  tiles: { x: 5, z: 4 },
  emissive: [GLOW],
  lights: BOLLARDS.map(([x, z]) => ({
    x,
    z,
    y: 7,
    color: GLOW,
    intensity: 34,
    distance: 28,
  })),
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);

    const C = {
      base: 0xcdb98f,
      baseDark: 0xb5a274,
      green: 0x4aa757,
      greenDark: 0x3d914a,
      curb: 0xe6e0d2,
      path: 0xcbb083,
      pathDark: 0xb99a6a,
      hole: 0x1e1a16,
      pole: 0xf0ece0,
      flag: 0xe0473f,
      mill: 0xe6e0d2,
      millRoof: 0x9b5de5,
      blade: 0xdf8a3c,
      obstacle: 0x3f6fb0,
      water: 0x37abd2,
      bollard: 0x3a4048,
      glow: GLOW,
    };

    const NX = 79;
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

    // grassy greens
    for (let x = 2; x <= 77; x++)
      for (let z = 2; z <= 61; z++) set(x, 3, z, (x + z) % 2 === 0 ? C.green : C.greenDark);

    // winding sand path linking the holes
    const path = (x0: number, x1: number, z0: number, z1: number) => {
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) set(x, 3, z, (x + z) % 2 === 0 ? C.path : C.pathDark);
    };
    path(6, 73, 30, 33); // spine
    path(8, 11, 6, 33);
    path(26, 29, 6, 33);
    path(58, 61, 6, 33);
    path(42, 45, 33, 58);
    path(70, 73, 33, 58);

    // holes with flags
    const holeFlag = (hx: number, hz: number) => {
      set(hx, 3, hz, C.hole);
      box(hx + 1, hx + 1, 4, 13, hz, hz, C.pole);
      box(hx + 1, hx + 4, 11, 13, hz, hz, C.flag);
    };
    holeFlag(9, 7);
    holeFlag(27, 7);
    holeFlag(59, 7);
    holeFlag(43, 56);
    holeFlag(71, 56);

    // curbed edges around a couple of greens for readability
    for (let z = 6; z <= 22; z++) {
      set(5, 4, z, C.curb);
      set(15, 4, z, C.curb);
    }
    for (let x = 5; x <= 15; x++) set(x, 4, 6, C.curb);

    // windmill prop
    box(60, 71, 3, 12, 42, 53, C.mill);
    box(58, 73, 13, 16, 40, 55, C.millRoof);
    const wx = 59; // blades on the -x face
    for (let i = 1; i <= 8; i++) {
      set(wx, 8 + i, 47, C.blade);
      set(wx, 8 - i, 47, C.blade);
      set(wx, 8, 47 + i, C.blade);
      set(wx, 8, 47 - i, C.blade);
    }

    // obstacle props + a small water hazard
    box(16, 25, 3, 7, 44, 52, C.obstacle);
    box(30, 42, 3, 3, 10, 22, C.water);
    for (let x = 30; x <= 42; x++) {
      set(x, 4, 10, C.curb);
      set(x, 4, 22, C.curb);
    }
    for (let z = 10; z <= 22; z++) {
      set(30, 4, z, C.curb);
      set(42, 4, z, C.curb);
    }

    // path bollards: a stubby post, a glowing head and a dark cap
    for (const [x, z] of BOLLARDS) {
      box(x, x, 4, 6, z, z, C.bollard);
      set(x, 7, z, C.glow);
      set(x, 8, z, C.bollard);
    }
  },
});
