import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { arcade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 143;
const NZ = 79;

const TURF = 3;
const ON_TURF = TURF + 1;

// Forward of centre, so the stand's seats fall in the outermost tile row: a seat with
// no paving within a tile is never used.
// 96 x 44 rather than the real 95: an odd span cannot be centred on a 144-voxel plot.
const COURT = { x0: 24, x1: 119, z0: 25, z1: 68 } as const;
const SINGLES = 5;
const SERVICE = { x0: 45, x1: 98 } as const;
const MID = (COURT.z0 + COURT.z1 - 1) / 2;

const FENCE = { x0: 10, x1: 133, z0: 18, z1: 75, top: ON_TURF + 12 } as const;
// Sparse and mirrored about the net, which gets a double post; the gate piers stand in
// for the posts between.
const POSTS = [10, 34, 52, 71, 72, 91, 109, 133] as const;

const NET = { x: 71, z0: COURT.z0 - 3, z1: COURT.z1 + 3, top: ON_TURF + 3 } as const;

// Singles first, so the first two places are the baseline players; the net pair makes it doubles.
const PLAYERS = [
  { x: COURT.x0 - 2, y: ON_TURF, z: MID - 5, facing: 1 },
  { x: COURT.x1 + 2, y: ON_TURF, z: MID + 6, facing: 3 },
  { x: NET.x - 12, y: ON_TURF, z: MID + 6, facing: 1 },
  { x: NET.x + 13, y: ON_TURF, z: MID - 5, facing: 3 },
] as const;

const STAND = { x0: 36, x1: 107 } as const;
const TIERS = [
  { z0: 8, z1: 13, top: ON_TURF + 1 },
  { z0: 2, z1: 7, top: ON_TURF + 4 },
] as const;
const SITTERS = [42, 54, 66, 77, 89, 101] as const;

const GATE_W = 12;
const GATES = [16, NX + 1 - 16 - GATE_W] as const;

const WALK = { z0: 14, z1: 17 } as const;

const MASTS: ReadonlyArray<readonly [number, number, 1 | -1, 1 | -1]> = [
  [7, FENCE.z0 - 3, 1, 1],
  [NX - 8, FENCE.z0 - 3, -1, 1],
  [7, FENCE.z1 + 1, 1, -1],
  [NX - 8, FENCE.z1 + 1, -1, -1],
];

const CYPRESSES = [10, 38, 66] as const;

// Amber, not white: an emissive colour glows everywhere in the model, and white
// would set every court line glowing.
const LANTERN = PALETTE.amber.light;

const LAMPS = 26;

// The bake has only point lamps, so the floods are declared where their beams land,
// over the court, at the spacing the original tuned against `pointLightAttenuation`.
const BEAMS_X = [31, 59, 84, 112] as const;
const BEAMS_Z = [COURT.z0 + 4, COURT.z1 - 4] as const;

const PIER_TOP = ON_TURF + 7;

export default defineModel({
  id: 'tennis-court-b',
  label: 'Tennis Court B',
  category: 'leisure',
  tiles: { x: 9, z: 5 },
  emissive: [LANTERN],
  seats: TIERS.flatMap((tier) =>
    SITTERS.map((x) => ({
      x,
      y: tier.top + 1,
      z: tier.z1 - 2,
      facing: 0 as const,
      watches: true as const,
    })),
  ),
  lights: [
    ...BEAMS_X.flatMap((x) =>
      BEAMS_Z.map((z) => ({
        x,
        z,
        y: LAMPS - 2,
        color: LANTERN,
        intensity: 120,
        distance: 100,
      })),
    ),
    ...GATES.flatMap((x0) =>
      [FENCE.z0 - 1, FENCE.z1].map((z) => ({
        x: x0 < NX / 2 ? x0 - 2 : x0 + GATE_W,
        z,
        y: ON_TURF + 10,
        color: LANTERN,
        intensity: 40,
        distance: 30,
      })),
    ),
  ],
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.4 },
    ],
    capacity: 4,
    dwellSeconds: { min: 1800, max: 3600 },
    spots: PLAYERS,
    doors: GATES.flatMap((x0) => [
      { x: x0 + GATE_W / 2, z: 0, facing: 2 as const },
      { x: x0 + GATE_W / 2, z: NZ, facing: 0 as const },
    ]),
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, grass, metal, stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, { x: 0, z: 0, w: NX + 1, d: NZ + 1 });
    box(1, NX - 1, TURF, TURF, 1, NZ - 1, grass.base);
    box(FENCE.x0, FENCE.x1, TURF, TURF, FENCE.z0, FENCE.z1, terracotta.base);
    box(COURT.x0, COURT.x1, TURF, TURF, COURT.z0, COURT.z1, foliage.base);
    box(FENCE.x0, FENCE.x1, TURF, TURF, WALK.z0, WALK.z1, stone.light);

    const hLine = (z: number, from: number, to: number): void =>
      box(from, to, TURF, TURF, z, z, stucco.light);
    const vLine = (x: number, from: number, to: number): void =>
      box(x, x, TURF, TURF, from, to, stucco.light);
    hLine(COURT.z0, COURT.x0, COURT.x1);
    hLine(COURT.z1, COURT.x0, COURT.x1);
    hLine(COURT.z0 + SINGLES, COURT.x0, COURT.x1);
    hLine(COURT.z1 - SINGLES, COURT.x0, COURT.x1);
    vLine(COURT.x0, COURT.z0, COURT.z1);
    vLine(COURT.x1, COURT.z0, COURT.z1);
    vLine(SERVICE.x0, COURT.z0 + SINGLES, COURT.z1 - SINGLES);
    vLine(SERVICE.x1, COURT.z0 + SINGLES, COURT.z1 - SINGLES);
    // Two voxels wide, so they stay symmetric on a court of even width.
    box(SERVICE.x0, SERVICE.x1, TURF, TURF, MID, MID + 1, stucco.light);
    for (const x of [COURT.x0 + 1, COURT.x1 - 1]) box(x, x, TURF, TURF, MID, MID + 1, stucco.light);

    // A panel rather than a woven mesh: a 25 cm weave costs a quad per cell.
    for (const z of [NET.z0, NET.z1]) box(NET.x, NET.x + 1, ON_TURF, NET.top + 1, z, z, metal.base);
    box(NET.x, NET.x, ON_TURF, NET.top - 1, NET.z0, NET.z1, metal.shade);
    box(NET.x, NET.x, NET.top, NET.top, NET.z0, NET.z1, stucco.light);

    // The ends carry a windscreen where the balls fly; the long sides stay open rails so
    // the stand and the camera see the court through them.
    for (const z of [FENCE.z0, FENCE.z1]) {
      box(FENCE.x0, FENCE.x1, FENCE.top, FENCE.top, z, z, metal.deep);
      for (const x of POSTS) box(x, x, ON_TURF, FENCE.top - 1, z, z, metal.deep);
    }
    for (const x of [FENCE.x0, FENCE.x1]) {
      box(x, x, ON_TURF, FENCE.top - 1, FENCE.z0, FENCE.z1, foliage.deep);
      box(x, x, FENCE.top, FENCE.top, FENCE.z0, FENCE.z1, metal.deep);
    }

    // Three treads land on layer 1, the top of a path tile (PAVING_VOXELS is two), so
    // the court is entered level with the walk.
    for (const x0 of GATES) {
      const x1 = x0 + GATE_W - 1;
      steps(b, { x: x0, z: 5, w: GATE_W, y: TURF, treads: 3, descends: 'z-' });
      steps(b, { x: x0, z: NZ - 5, w: GATE_W, y: TURF, treads: 3, descends: 'z+' });
      box(x0, x1, TURF, TURF, 6, WALK.z0 - 1, stone.base);
      box(x0, x1, TURF, TURF, FENCE.z0, FENCE.z0, stone.base);
      const lamp = x0 < NX / 2 ? x0 - 2 : x1 + 1;
      for (const z of [FENCE.z0 - 1, FENCE.z1]) {
        for (const px of [x0 - 2, x1 + 1]) box(px, px + 1, ON_TURF, PIER_TOP, z, z + 1, stone.base);
        box(x0 - 2, x1 + 2, PIER_TOP + 1, PIER_TOP + 1, z, z + 1, metal.deep);
        box(lamp, lamp, PIER_TOP + 2, PIER_TOP + 2, z, z, LANTERN);
        set(lamp, PIER_TOP + 3, z, metal.deep);
      }
    }

    const [low, high] = TIERS;
    for (const tier of TIERS) {
      box(STAND.x0, STAND.x1, ON_TURF, tier.top - 1, tier.z0, tier.z1, stone.base);
      box(STAND.x0, STAND.x1, tier.top, tier.top, tier.z0, tier.z1, teak.base);
    }
    box(STAND.x0, STAND.x1, ON_TURF, high.top, 0, 1, stucco.base);
    const eaves = arcade(b, {
      x: STAND.x0,
      z: 0,
      w: STAND.x1 - STAND.x0 + 1,
      d: 2,
      y: high.top + 1,
      along: 'x',
      bays: 4,
      pier: 4,
      height: 6,
      rise: 2,
    });
    box(STAND.x0 - 1, STAND.x1 + 1, eaves, eaves, 0, 3, terracotta.shade);
    box(STAND.x0 - 1, STAND.x1 + 1, eaves + 1, eaves + 1, 0, 1, terracotta.base);
    for (const x of [STAND.x0 - 2, STAND.x1 + 1]) {
      box(x, x + 1, ON_TURF, eaves - 1, 0, high.z1, stucco.base);
      box(x, x + 1, ON_TURF, low.top + 1, low.z0, low.z1, stucco.base);
      box(x, x + 1, ON_TURF, ON_TURF, 0, low.z1, stone.base);
    }

    // Solid side boards rather than four legs: each leg costs four unmergeable quads.
    const umpire = { x0: NET.x - 1, x1: NET.x + 2, z0: FENCE.z0 + 1, z1: NET.z0 - 1 };
    const perch = ON_TURF + 9;
    for (const x of [umpire.x0, umpire.x1]) {
      box(x, x, ON_TURF, perch - 1, umpire.z0, umpire.z1, teak.shade);
    }
    box(umpire.x0, umpire.x1, perch, perch, umpire.z0, umpire.z1, teak.base);
    box(umpire.x0, umpire.x1, perch + 1, perch + 5, umpire.z0, umpire.z0, teak.base);
    box(umpire.x0 - 1, umpire.x1 + 1, perch + 6, perch + 6, umpire.z0 - 1, umpire.z1, stucco.light);

    for (const [x0, x1] of [
      [NET.x - 14, NET.x - 5],
      [NET.x + 6, NET.x + 15],
    ] as const) {
      box(x0, x1, ON_TURF, ON_TURF + 1, umpire.z0, umpire.z0 + 1, teak.base);
      box(x0, x1, ON_TURF + 2, ON_TURF + 3, umpire.z0, umpire.z0, teak.shade);
    }

    // Cypresses behind the windscreens: tall at the ends, where nothing hides behind them.
    for (const x of [3, NX - 6]) {
      for (const z of CYPRESSES) {
        box(x, x + 3, ON_TURF, ON_TURF + 14, z, z + 3, foliage.shade);
        box(x + 1, x + 2, ON_TURF + 15, ON_TURF + 17, z + 1, z + 2, foliage.base);
      }
    }

    const hedge = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, ON_TURF, ON_TURF + 1, z0, z1, foliage.shade);
      box(x0, x1, ON_TURF + 2, ON_TURF + 2, z0, z1, foliage.base);
    };
    hedge(GATES[0] + GATE_W + 3, GATES[1] - 4, NZ - 2, NZ - 1);
    for (const x0 of GATES) {
      hedge(x0 - 5, x0 - 3, 1, 3);
      hedge(x0 + GATE_W + 2, x0 + GATE_W + 4, 1, 3);
    }

    // Outside the fence corners: a mast through the windscreen splits it into many quads.
    const mast = ([mx, mz, dx, dz]: (typeof MASTS)[number]): void => {
      box(mx, mx + 1, ON_TURF, LAMPS - 1, mz, mz + 1, metal.shade);
      const hx0 = dx === 1 ? mx : mx - 6;
      const hz0 = dz === 1 ? mz : mz - 2;
      box(hx0, hx0 + 7, LAMPS + 1, LAMPS + 2, hz0, hz0 + 3, metal.deep);
      box(hx0 + 1, hx0 + 6, LAMPS, LAMPS, hz0 + 1, hz0 + 2, LANTERN);
    };
    for (const m of MASTS) mast(m);
  },
});
