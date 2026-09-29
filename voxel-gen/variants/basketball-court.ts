// Lines and zones are straight on purpose: arcs on this grid are single-voxel
// staircases the mesher cannot merge. Rim at 3 m so a crowd figure under it reads to scale.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 128;
const NZ = 80;

const SURFACE = 2;
const ON = SURFACE + 1;

const COURT = { x0: 8, x1: 119, z0: 14, z1: 73 } as const;
const MID_X = (COURT.x0 + COURT.x1 + 1) / 2;
const MID_Z = (COURT.z0 + COURT.z1 + 1) / 2;

const KEY = { depth: 23, half: 10 } as const;
const THREE = { depth: 28, inset: 4 } as const;

const RIM = 12;
const BOARD = 5;

const TIERS = 3;
const tierZ = (k: number): number => 9 - 3 * k;
const tierTop = (k: number): number => ON + 1 + 3 * k;
const BLOCKS = [16, 70] as const;
const BLOCK_LEN = 42;
const AISLE = { x0: BLOCKS[0] + BLOCK_LEN, x1: BLOCKS[1] - 1 } as const;
const SITTERS = BLOCKS.flatMap((x0) => Array.from({ length: 6 }, (_, i) => x0 + 3 + i * 7));

const WALL = { x0: 14, x1: 113 } as const;
const PERGOLA = ON + 17;
const VINES = [
  [2, 15],
  [22, 37],
] as const;

const GATE = { x0: 56, x1: 71 } as const;

const LANTERN = PALETTE.amber.light;
const MAST_TOP = ON + 23;
const MASTS: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [10, 1, 1],
  [116, 1, 1],
  [36, 76, -1],
  [92, 76, -1],
];

export default defineModel({
  id: 'basketball-court-b',
  label: 'Basketball Court B',
  category: 'leisure',
  tiles: { x: 8, z: 5 },
  emissive: [LANTERN],
  // Hips at the back of each terrace, legs down onto the tread below.
  seats: Array.from({ length: TIERS }, (_, k) =>
    SITTERS.map((x) => ({ x, y: tierTop(k) + 1, z: tierZ(k) + 1, facing: 0 as const })),
  ).flat(),
  lights: [
    [36, 30],
    [92, 30],
    [36, 58],
    [92, 58],
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
    const { bloom, foliage, grass, metal, stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, { x: 0, z: 0, w: NX, d: NZ });
    box(COURT.x0, COURT.x1, SURFACE, SURFACE, COURT.z0, COURT.z1, terracotta.base);

    const line = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, SURFACE, SURFACE, z0, z1, stucco.light);
    const outline = (x0: number, x1: number, z0: number, z1: number): void => {
      line(x0, x1, z0, z0);
      line(x0, x1, z1, z1);
      line(x0, x0, z0, z1);
      line(x1, x1, z0, z1);
    };
    const zone = (x0: number, x1: number, z0: number, z1: number, fill: number): void => {
      box(x0, x1, SURFACE, SURFACE, z0, z1, fill);
      outline(x0, x1, z0, z1);
    };

    for (const end of [-1, 1] as const) {
      const baseline = end === -1 ? COURT.x0 : COURT.x1;
      const inward = (d: number): number => baseline - end * d;
      const span = (from: number, to: number): [number, number] => {
        const [lo, hi] = [inward(from), inward(to)].toSorted((p, q) => p - q);
        return [lo!, hi!];
      };
      const [threeLo, threeHi] = span(0, THREE.depth);
      zone(threeLo, threeHi, COURT.z0 + THREE.inset, COURT.z1 - THREE.inset, terracotta.shade);
      const [keyLo, keyHi] = span(0, KEY.depth);
      zone(keyLo, keyHi, MID_Z - KEY.half, MID_Z + KEY.half - 1, foliage.shade);

      // A gantry rather than a single post: padded, so the post reads as a thing players hit.
      const pole = baseline + end * 5;
      box(pole - 1, pole + 1, ON, ON + 5, MID_Z - 2, MID_Z + 1, foliage.base);
      box(pole, pole, ON + 6, ON + RIM + 4, MID_Z - 1, MID_Z, metal.shade);
      const board = inward(BOARD);
      box(
        Math.min(pole, board),
        Math.max(pole, board),
        ON + RIM + 3,
        ON + RIM + 3,
        MID_Z - 1,
        MID_Z,
        metal.shade,
      );
      box(board, board, ON + RIM - 1, ON + RIM + 4, MID_Z - 5, MID_Z + 4, stucco.light);
      box(board, board, ON + RIM, ON + RIM + 2, MID_Z - 2, MID_Z + 1, terracotta.base);

      const [rimLo, rimHi] = span(BOARD + 1, BOARD + 4);
      box(rimLo, rimHi, ON + RIM - 1, ON + RIM - 1, MID_Z - 2, MID_Z + 1, bloom.base);
      for (let x = rimLo + 1; x < rimHi; x++) {
        for (let z = MID_Z - 1; z <= MID_Z; z++) b.del(x, ON + RIM - 1, z);
      }
    }

    outline(COURT.x0, COURT.x1, COURT.z0, COURT.z1);
    zone(MID_X - 7, MID_X + 6, MID_Z - 7, MID_Z + 6, foliage.shade);
    line(MID_X - 1, MID_X, COURT.z0, COURT.z1);

    for (let k = 0; k < TIERS; k++) {
      const z = tierZ(k);
      for (const [x0, x1] of [
        [WALL.x0, AISLE.x0 - 1],
        [AISLE.x1 + 1, WALL.x1],
      ] as const) {
        box(x0, x1, ON, tierTop(k), z, z + 2, k % 2 === 0 ? stucco.light : stucco.base);
      }
    }
    const summit = tierTop(TIERS - 1);
    for (let z = tierZ(TIERS - 1); z <= tierZ(0) + 2; z++) {
      const tread = Math.min(summit, ON + tierZ(0) + 2 - z);
      box(AISLE.x0, AISLE.x1, ON, tread, z, z, stone.light);
    }

    // The wall carries the back of the pergola, so only its front needs posts.
    box(WALL.x0, WALL.x1, ON, PERGOLA - 2, 1, 2, stucco.base);
    box(WALL.x0 - 1, WALL.x1 + 1, PERGOLA - 1, PERGOLA - 1, 1, 3, stucco.light);
    const front = tierZ(0) + 1;
    for (const x0 of BLOCKS) {
      const x1 = x0 + BLOCK_LEN - 1;
      for (const x of [x0, x1 - 1]) box(x, x + 1, ON, PERGOLA - 1, front, front + 1, teak.shade);
      for (const z of [1, front]) box(x0, x1, PERGOLA, PERGOLA, z, z + 1, teak.base);
      // Vines rather than a roof, so the terraces stay readable from above.
      for (const [a, c] of VINES)
        box(x0 + a, x0 + c, PERGOLA + 1, PERGOLA + 1, 0, front + 2, foliage.base);
    }

    box(1, NX - 2, SURFACE, SURFACE, NZ - 5, NZ - 2, grass.base);
    box(GATE.x0, GATE.x1, SURFACE, SURFACE, COURT.z1 + 1, NZ - 1, stone.light);
    const hedge = (x0: number, x1: number): void => {
      box(x0, x1, ON, ON + 2, NZ - 4, NZ - 3, foliage.shade);
      box(x0, x1, ON + 3, ON + 3, NZ - 4, NZ - 3, foliage.base);
    };
    hedge(2, GATE.x0 - 4);
    hedge(GATE.x1 + 4, NX - 3);

    // Clipped into steps, not grown: a round crown here is a staircase of single voxels.
    const cypress = (x0: number, z0: number): void => {
      box(x0, x0 + 3, ON, ON + 17, z0, z0 + 3, foliage.shade);
      box(x0 + 1, x0 + 2, ON + 18, ON + 21, z0 + 1, z0 + 2, foliage.base);
    };
    cypress(2, 3);
    cypress(NX - 6, 3);

    // The lamps hang a course below the cowl so their burning underside is exposed.
    for (const [mx, mz, dir] of MASTS) {
      box(mx, mx + 1, ON, MAST_TOP - 1, mz, mz + 1, metal.shade);
      const over = mz + dir * 3;
      const z0 = Math.min(mz, over);
      const z1 = Math.max(mz + 1, over + 1);
      box(mx - 5, mx + 6, MAST_TOP + 1, MAST_TOP + 1, z0, z1, metal.deep);
      box(mx - 4, mx + 5, MAST_TOP, MAST_TOP, over, over + 1, LANTERN);
    }
  },
});
