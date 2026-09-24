import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 143;
const NZ = 79;

const TURF = 3;
const ON_TURF = TURF + 1;

const VERGE = { x0: 2, x1: 141, z0: 2, z1: 77 } as const;

const CLAY = { x0: 16, x1: 127, z0: 10, z1: 69 } as const;

// 96 x 44 rather than the real 95: an odd span cannot be centred on a 144-voxel plot.
const COURT = { x0: 24, x1: 119, z0: 18, z1: 61 } as const;
const SINGLES = 5;
const SERVICE = { x0: 45, x1: 98 } as const;

const NET = { x: 71, z0: COURT.z0 - 4, z1: COURT.z1 + 4, top: ON_TURF + 3 } as const;

const GATE = { x0: 62, x1: 81, z0: 33, z1: 46 } as const;

const FLIGHT = 12;

const MASTS: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [45, 7, 1],
  [98, 7, 1],
  [45, 72, -1],
  [98, 72, -1],
];

const BENCHES: ReadonlyArray<readonly [number, number, 1 | -1]> = [
  [24, 5, 1],
  [106, 5, 1],
  [24, 74, -1],
  [106, 74, -1],
];

const HIPS = ON_TURF + 2;
const SITTERS = [3, 7, 11] as const;

// Amber, not white: an emissive colour glows everywhere in the model, and white
// would set every court line glowing.
const LANTERN = PALETTE.amber.light;

const LAMPS = 26;

// The bake has only point lamps, so each mast declares two anchors where its beam
// lands, over the clay. Tuned against `pointLightAttenuation` to light the court
// at about twice a street lamp's pool.
const AIM = 14;
const THROW = 15;

export default defineModel({
  id: 'tennis-court',
  label: 'Tennis Court',
  category: 'leisure',
  tiles: { x: 9, z: 5 },
  emissive: [LANTERN],
  // On the outermost tile row on purpose: a seat with no paving within a tile is never used.
  seats: BENCHES.flatMap(([x0, zBack, dir]) =>
    SITTERS.map((along) => ({
      x: x0 + along,
      y: HIPS,
      z: zBack + dir * 2,
      facing: dir === 1 ? (0 as const) : (2 as const),
    })),
  ),
  lights: [
    ...MASTS.flatMap(([x, z, dir]) =>
      [x - AIM, x + AIM].map((along) => ({
        x: along,
        z: z + dir * THROW,
        y: LAMPS - 2,
        color: LANTERN,
        intensity: 120,
        distance: 100,
      })),
    ),
    ...[
      [GATE.x0 + 1, 4],
      [GATE.x1 - 1, 4],
      [GATE.x0 + 1, 75],
      [GATE.x1 - 1, 75],
    ].map(([x, z]) => ({
      x: x!,
      z: z!,
      y: ON_TURF + 10,
      color: LANTERN,
      intensity: 40,
      distance: 30,
    })),
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
    doors: [
      { x: (GATE.x0 + GATE.x1) / 2, z: 0, facing: 2 },
      { x: (GATE.x0 + GATE.x1) / 2, z: 79, facing: 0 },
      { x: 0, z: (GATE.z0 + GATE.z1) / 2, facing: 3 },
      { x: 143, z: (GATE.z0 + GATE.z1) / 2, facing: 1 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, grass, metal, stone, stucco, teak, terracotta } = PALETTE;

    plinth(b, { x: 0, z: 0, w: NX + 1, d: NZ + 1 });
    box(VERGE.x0, VERGE.x1, TURF, TURF, VERGE.z0, VERGE.z1, grass.base);

    // One flat tone: a checker costs a quad per cell (8 550 triangles) and is invisible
    // from the camera's distance.
    box(CLAY.x0, CLAY.x1, TURF, TURF, CLAY.z0, CLAY.z1, terracotta.base);

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
    box(SERVICE.x0, SERVICE.x1, TURF, TURF, 39, 40, stucco.light);
    for (const x of [COURT.x0 + 1, COURT.x1 - 1]) box(x, x, TURF, TURF, 39, 40, stucco.light);

    // A panel rather than a woven mesh: a 25 cm weave costs a quad per cell and is
    // invisible at this distance.
    for (const z of [NET.z0, NET.z1]) box(NET.x, NET.x + 1, ON_TURF, NET.top + 1, z, z, metal.base);
    box(NET.x, NET.x, ON_TURF, NET.top - 1, NET.z0, NET.z1, metal.shade);
    box(NET.x, NET.x, NET.top, NET.top, NET.z0, NET.z1, stucco.light);

    const CROWN = ON_TURF + 4;
    const clipped = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, ON_TURF, CROWN - 1, z0, z1, foliage.shade);
      box(x0, x1, CROWN, CROWN, z0, z1, foliage.base);
    };

    for (const z of [3, 75]) {
      clipped(3, GATE.x0 - 1, z, z + 1);
      clipped(GATE.x1 + 1, 140, z, z + 1);
    }
    for (const x of [3, 139]) {
      clipped(x, x + 1, 3, GATE.z0 - 1);
      clipped(x, x + 1, GATE.z1 + 1, 76);
    }

    // Three treads land on layer 1, the top of a path tile (PAVING_VOXELS is two), so
    // the court is entered level with the walk.
    const walk = Math.floor((NX + 1 - FLIGHT) / 2);
    steps(b, { x: walk, z: 5, w: FLIGHT, y: TURF, treads: 3, descends: 'z-' });
    steps(b, { x: walk, z: NZ - 5, w: FLIGHT, y: TURF, treads: 3, descends: 'z+' });
    const across = Math.floor((NZ + 1 - FLIGHT) / 2);
    steps(b, { x: 5, z: across, w: FLIGHT, y: TURF, treads: 3, descends: 'x-' });
    steps(b, { x: NX - 5, z: across, w: FLIGHT, y: TURF, treads: 3, descends: 'x+' });

    box(walk, walk + FLIGHT - 1, TURF, TURF, 5, CLAY.z0 - 1, stone.base);
    box(walk, walk + FLIGHT - 1, TURF, TURF, CLAY.z1 + 1, NZ - 5, stone.base);
    box(5, CLAY.x0 - 1, TURF, TURF, across, across + FLIGHT - 1, stone.base);
    box(CLAY.x1 + 1, NX - 5, TURF, TURF, across, across + FLIGHT - 1, stone.base);

    const pier = (x0: number, z0: number): void => {
      const cap = ON_TURF + 8;
      box(x0, x0 + 2, ON_TURF, cap - 1, z0, z0 + 2, stone.base);
      box(x0 - 1, x0 + 3, cap, cap + 1, z0 - 1, z0 + 3, stone.light);
      set(x0 + 1, cap + 2, z0 + 1, LANTERN);
      set(x0 + 1, cap + 3, z0 + 1, metal.deep);
    };
    for (const z of [3, 74]) {
      pier(GATE.x0, z);
      pier(GATE.x1 - 2, z);
    }
    for (const z of [7, 71]) {
      pottedPlant(b, { x: GATE.x0 - 3, z, y: TURF });
      pottedPlant(b, { x: GATE.x1 + 1, z, y: TURF });
    }

    // The plank is one course, not slats: a slat stripe costs a quad per voxel.
    const courtBench = (x0: number, zBack: number, dir: 1 | -1): void => {
      const x1 = x0 + 13;
      const plank = HIPS - 1;
      const z0 = Math.min(zBack + dir, zBack + dir * 3);
      const z1 = Math.max(zBack + dir, zBack + dir * 3);
      for (const x of [x0 + 1, x1 - 1]) box(x, x + 1, ON_TURF, ON_TURF, z0, z1, teak.deep);
      box(x0, x1, plank, plank, z0, z1, teak.base);
      box(x0, x1, HIPS, HIPS + 1, zBack, zBack, teak.shade);
      box(x0, x1, HIPS + 2, HIPS + 2, zBack, zBack, teak.light);
      for (const x of [x0, x1]) box(x, x, HIPS, HIPS, z0, z1, teak.light);
    };
    for (const [x0, zBack, dir] of BENCHES) courtBench(x0, zBack, dir);

    // The lamps hang a course below the cowl so their burning underside is exposed.
    const mast = (mx: number, mz: number, dir: 1 | -1): void => {
      box(mx - 1, mx + 2, ON_TURF, ON_TURF + 1, mz - 1, mz + 2, metal.deep);
      box(mx, mx + 1, ON_TURF, LAMPS - 1, mz, mz + 1, metal.shade);
      const over = mz + dir * 2;
      box(
        mx - 4,
        mx + 5,
        LAMPS + 1,
        LAMPS + 2,
        Math.min(mz, over),
        Math.max(mz + 1, over + 1),
        metal.deep,
      );
      for (const lx of [mx - 3, mx, mx + 3]) box(lx, lx + 1, LAMPS, LAMPS, over, over + 1, LANTERN);
    };
    for (const [mx, mz, dir] of MASTS) mast(mx, mz, dir);
  },
});
