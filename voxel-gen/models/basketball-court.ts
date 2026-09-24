// Lines are straight on purpose: arcs and circles on this grid are single-voxel
// staircases the mesher cannot merge. Rim at 3 m so a crowd figure under it reads to scale.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 128;
const NZ = 80;

const SURFACE = 2;
const ON = SURFACE + 1;

const COURT = { x0: 8, x1: 119, z0: 12, z1: 67 } as const;
const MID_X = (COURT.x0 + COURT.x1 + 1) / 2;
const MID_Z = (COURT.z0 + COURT.z1 + 1) / 2;

const KEY = { depth: 23, half: 10 } as const;
const THREE = { depth: 28, inset: 4 } as const;

const RIM = 12;
const BOARD = 5;

const STAND = { x0: 32, x1: 95 } as const;
const TIERS = 3;
const tierZ = (k: number): number => COURT.z0 - 3 - 2 * k;
const tierTop = (k: number): number => ON + 1 + 2 * k;

const SITTERS = Array.from({ length: 11 }, (_, i) => STAND.x0 + 2 + i * 6);

const LANTERN = PALETTE.amber.light;
const MAST_TOP = ON + 22;
const MASTS = [
  [2, 2],
  [NX - 4, 2],
  [2, NZ - 4],
  [NX - 4, NZ - 4],
] as const;

export default defineModel({
  id: 'basketball-court',
  label: 'Basketball Court',
  category: 'leisure',
  tiles: { x: 8, z: 5 },
  emissive: [LANTERN],
  seats: Array.from({ length: TIERS }, (_, k) =>
    SITTERS.map((x) => ({ x, y: tierTop(k) + 1, z: tierZ(k) - 1, facing: 0 as const })),
  ).flat(),
  lights: [
    [36, 26],
    [92, 26],
    [36, 54],
    [92, 54],
  ].map(([x, z]) => ({
    x: x!,
    y: MAST_TOP - 4,
    z: z!,
    color: LANTERN,
    intensity: 120,
    distance: 90,
  })),
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 10,
    dwellSeconds: { min: 1200, max: 2700 },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, glass, metal, slate, stucco, teak, terracotta } = PALETTE;

    plinth(b, { x: 0, z: 0, w: NX, d: NZ, stone: slate });
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, glass.shade);

    const line = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, SURFACE, SURFACE, z0, z1, stucco.light);
    const outline = (x0: number, x1: number, z0: number, z1: number): void => {
      line(x0, x1, z0, z0);
      line(x0, x1, z1, z1);
      line(x0, x0, z0, z1);
      line(x1, x1, z0, z1);
    };

    for (const end of [-1, 1] as const) {
      const baseline = end === -1 ? COURT.x0 : COURT.x1;
      const inward = (d: number): number => baseline - end * d;
      const [threeLo, threeHi] = [inward(0), inward(THREE.depth)].toSorted((p, q) => p - q);
      outline(threeLo!, threeHi!, COURT.z0 + THREE.inset, COURT.z1 - THREE.inset);
      const [keyLo, keyHi] = [inward(0), inward(KEY.depth)].toSorted((p, q) => p - q);
      box(
        keyLo!,
        keyHi!,
        SURFACE,
        SURFACE,
        MID_Z - KEY.half,
        MID_Z + KEY.half - 1,
        terracotta.base,
      );
      outline(keyLo!, keyHi!, MID_Z - KEY.half, MID_Z + KEY.half - 1);

      const pole = baseline + end * 5;
      box(pole - 1, pole + 1, ON, ON + 4, MID_Z - 2, MID_Z + 1, bloom.shade);
      box(pole, pole, ON, ON + RIM + 3, MID_Z - 1, MID_Z, metal.base);
      const board = inward(BOARD);
      box(
        Math.min(pole, board),
        Math.max(pole, board),
        ON + RIM + 2,
        ON + RIM + 2,
        MID_Z - 1,
        MID_Z,
        metal.shade,
      );
      box(board, board, ON + RIM - 1, ON + RIM + 3, MID_Z - 4, MID_Z + 3, stucco.light);
      box(board, board, ON + RIM, ON + RIM + 1, MID_Z - 2, MID_Z + 1, bloom.base);

      const [rimLo, rimHi] = [inward(BOARD + 1), inward(BOARD + 4)].toSorted((p, q) => p - q);
      box(rimLo!, rimHi!, ON + RIM - 1, ON + RIM - 1, MID_Z - 2, MID_Z + 1, amber.base);
      for (let x = rimLo! + 1; x < rimHi!; x++) {
        for (let z = MID_Z - 1; z <= MID_Z; z++) b.del(x, ON + RIM - 1, z);
      }
    }

    outline(COURT.x0, COURT.x1, COURT.z0, COURT.z1);
    box(MID_X - 7, MID_X + 6, SURFACE, SURFACE, MID_Z - 7, MID_Z + 6, terracotta.base);
    outline(MID_X - 7, MID_X + 6, MID_Z - 7, MID_Z + 6);
    line(MID_X - 1, MID_X, COURT.z0, COURT.z1);

    for (let k = 0; k < TIERS; k++) {
      const z = tierZ(k);
      box(STAND.x0, STAND.x1, ON, tierTop(k) - 1, z - 1, z, teak.shade);
      box(STAND.x0, STAND.x1, tierTop(k), tierTop(k), z - 1, z, teak.base);
    }
    const back = tierZ(TIERS - 1) - 2;
    box(STAND.x0, STAND.x1, ON, tierTop(TIERS - 1) + 3, back, back, metal.base);

    box(60, 61, ON, ON + 1, COURT.z0 + 3, COURT.z0 + 4, amber.shade);

    for (const [x, z] of MASTS) {
      box(x, x + 1, ON, MAST_TOP - 1, z, z + 1, metal.shade);
      box(x - 1, x + 2, MAST_TOP, MAST_TOP + 1, z - 1, z + 2, metal.deep);
      box(x - 1, x + 2, MAST_TOP - 1, MAST_TOP - 1, z - 1, z + 2, LANTERN);
    }
  },
});
