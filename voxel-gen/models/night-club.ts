import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type ModelSpot, type VoxelBuilder } from '../voxelgen.ts';

// The game hall already lights bloom.light and water.light; these are the nearest tones no
// other model glows in, so the club's neon is its own.
const NEON_PINK = PALETTE.bloom.base;
const NEON_CYAN = PALETTE.water.base;

const PLOT = { x: 64, z: 48 } as const;

// Five up rather than the usual three: a sofa this high is out of a passer-by's reach from the
// paving (walkNetwork's SEAT_RISE), so nobody sits in the club while it is shut.
const GROUND = 5;
const APRON = { z: 40, top: 2 } as const;

const WALLS = { x: 2, x1: 61, z: 2, z1: 37 } as const;
const EAVES = GROUND + 11;

// Only the back strip is roofed: no roof is cut away for the camera, and a dance floor under
// one would be danced on unseen.
const ROOF_Z1 = 11;

const GATE = { x: 22, x1: 41, y: 12, y1: 18 } as const;
const OPENING = { x: 26, x1: 37 } as const;
const FLIGHT = { x: 28, w: 8 } as const;

const FLOOR = { x: 18, z: 12, w: 28, d: 16, y: GROUND } as const;

const BOOTH = { x: 26, x1: 37, z: 7, z1: 9 } as const;
const DJ_SPOT: ModelSpot = { x: 32, y: GROUND, z: 5, facing: 0, for: 'animator' };

const BAR = { x: 54, x1: 56, z: 5, z1: 34 } as const;
const STOOL_X = BAR.x - 3;
const STOOLS = Array.from({ length: 10 }, (_, stool) => BAR.z + stool * 3);

const LOUNGE = { x: 4, x1: 8, arm: 14 } as const;
const SOFA_HIPS = GROUND + 2;
const STOOL_HIPS = GROUND + 3;

const STANDING: readonly ModelSpot[] = [
  ...[19, 22, 25, 28, 31, 34, 37, 40].map((x) => ({ x, z: FLOOR.z + FLOOR.d + 1 })),
  ...[13, 16, 19, 22, 25].flatMap((z) => [
    { x: FLOOR.x - 2, z },
    { x: FLOOR.x + FLOOR.w + 1, z },
  ]),
].map(({ x, z }) => ({ x, y: GROUND, z, facing: 2 }));

const LINE: readonly ModelSpot[] = [4, 8, 12, 16, 20, 24, 39, 43, 47, 51, 55, 59].map((x) => ({
  x,
  y: APRON.top,
  z: 44,
  facing: 2,
  for: 'watcher',
}));

const CLEANER_SPOT: ModelSpot = { x: BAR.x1 + 1, y: GROUND, z: 20, facing: 3, for: 'staff' };

// Three wide and five high, one voxel between them: the sign over the gate reads CLUB.
const LETTERS = [
  ['###', '#..', '#..', '#..', '###'],
  ['#..', '#..', '#..', '#..', '###'],
  ['#.#', '#.#', '#.#', '#.#', '###'],
  ['##.', '#.#', '##.', '#.#', '##.'],
] as const;

export default defineModel({
  id: 'night-club',
  label: 'Night Club',
  category: 'leisure',
  sound: 'bar',
  tiles: { x: 4, z: 3 },
  cost: 2_400,
  placement: { perResort: { min: 1, max: 1 } },
  emissive: [NEON_PINK, NEON_CYAN],
  seats: [
    ...[7, 10, 13, 16].map((z) => ({ x: LOUNGE.x1 - 1, y: SOFA_HIPS, z, facing: 1 }) as const),
    ...[22, 25, 28, 31].map((z) => ({ x: LOUNGE.x1 - 1, y: SOFA_HIPS, z, facing: 1 }) as const),
    ...[10, 13].map((x) => ({ x, y: SOFA_HIPS, z: 8, facing: 0 }) as const),
    ...[10, 13].map((x) => ({ x, y: SOFA_HIPS, z: 32, facing: 2 }) as const),
    ...STOOLS.map((z) => ({ x: STOOL_X, y: STOOL_HIPS, z, facing: 1 }) as const),
  ],
  lights: [
    { x: 32, y: 14, z: 20, color: NEON_PINK, intensity: 90, distance: 56 },
    { x: 52, y: 13, z: 20, color: NEON_CYAN, intensity: 70, distance: 40 },
    { x: 32, y: 11, z: 42, color: NEON_PINK, intensity: 70, distance: 40 },
  ],
  venue: {
    role: 'activity',
    sign: 'nightclub',
    names: [
      'Club Luna',
      'The Velvet Room',
      'Neon Tide',
      'Discoteca Marea',
      'The Moon Bar',
      'Club Coralle',
      'Midnight Lagoon',
      'The Echo',
      'Club Notturno',
      'Sala Notte',
      'The Glow Room',
      'Afterdark',
    ],
    hours: { opens: 20 * 60, closes: 2 * 60 },
    dj: true,
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'thirst', amount: 0.3 },
      { need: 'energy', amount: -0.2 },
    ],
    capacity: 40,
    dwellSeconds: { min: 2700, max: 7200 },
    price: 8,
    litter: 0.04,
    reliability: 60,
    floor: FLOOR,
    order: ['seats', 'spots'],
    spots: [...STANDING, ...LINE, DJ_SPOT, CLEANER_SPOT],
    doors: [{ x: 32, z: PLOT.z - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, foliage, glass, metal, slate, stone, stucco, teak } = PALETTE;

    const top = plinth(b, { x: 0, z: 0, w: PLOT.x, d: APRON.z, height: GROUND, stone: slate });
    if (top !== GROUND) throw new Error('The podium and the seats must agree on its surface');
    const apron = plinth(b, {
      x: 0,
      z: APRON.z,
      w: PLOT.x,
      d: PLOT.z - APRON.z,
      height: 2,
      stone: slate,
    });
    if (apron !== APRON.top) throw new Error('The apron and the line must agree on its surface');
    steps(b, { ...FLIGHT, z: APRON.z, y: GROUND - 1, treads: 3, descends: 'z+', stone: slate });

    const floor = GROUND - 1;
    box(WALLS.x + 2, WALLS.x1 - 2, floor, floor, WALLS.z + 2, WALLS.z1 - 2, teak.shade);
    box(FLOOR.x, FLOOR.x + FLOOR.w - 1, floor, floor, FLOOR.z, FLOOR.z + FLOOR.d - 1, teak.light);

    const wall = stucco.deep;
    box(WALLS.x, WALLS.x1, GROUND, EAVES, WALLS.z, WALLS.z + 1, wall);
    for (const x of [WALLS.x, WALLS.x1 - 1]) box(x, x + 1, GROUND, EAVES, WALLS.z, WALLS.z1, wall);
    for (const [x0, x1] of [
      [WALLS.x, OPENING.x - 1],
      [OPENING.x1 + 1, WALLS.x1],
    ] as const) {
      box(x0, x1, GROUND, GROUND + 2, WALLS.z1 - 1, WALLS.z1, wall);
      box(x0, x1, GROUND + 3, GROUND + 3, WALLS.z1 - 1, WALLS.z1, metal.shade);
    }
    // A cyan line round the top of the walls draws the club's outline on the dark plot.
    for (const x of [WALLS.x + 1, WALLS.x1 - 1]) {
      box(x, x, EAVES, EAVES, ROOF_Z1 + 1, WALLS.z1, NEON_CYAN);
    }

    box(WALLS.x, WALLS.x1, EAVES + 1, EAVES + 1, WALLS.z, ROOF_Z1, metal.shade);
    box(WALLS.x + 2, WALLS.x1 - 2, EAVES - 1, EAVES, ROOF_Z1, ROOF_Z1, wall);
    box(WALLS.x + 2, WALLS.x1 - 2, EAVES - 2, EAVES - 2, ROOF_Z1, ROOF_Z1, NEON_PINK);

    for (const x of [OPENING.x - 2, OPENING.x1 + 1]) {
      box(x, x + 1, GROUND, GATE.y - 1, WALLS.z1 - 1, WALLS.z1, wall);
    }
    box(GATE.x, GATE.x1, GATE.y, GATE.y1, WALLS.z1 - 1, WALLS.z1, metal.deep);
    box(GATE.x, GATE.x1, GATE.y, GATE.y, WALLS.z1, WALLS.z1, NEON_PINK);
    box(GATE.x, GATE.x1, GATE.y1, GATE.y1, WALLS.z1, WALLS.z1, NEON_PINK);
    for (const [index, letter] of LETTERS.entries()) {
      const x0 = GATE.x + 2 + index * 4;
      for (const [row, line] of letter.entries()) {
        for (const [column, mark] of [...line].entries()) {
          if (mark === '#') b.set(x0 + column, GATE.y1 - 1 - row, WALLS.z1, NEON_CYAN);
        }
      }
    }

    box(BOOTH.x, BOOTH.x1, GROUND, GROUND + 1, BOOTH.z, BOOTH.z1, metal.deep);
    box(BOOTH.x, BOOTH.x1, GROUND + 2, GROUND + 2, BOOTH.z, BOOTH.z1, metal.base);
    for (const x of [BOOTH.x + 2, BOOTH.x1 - 4]) {
      box(x, x + 2, GROUND + 3, GROUND + 3, BOOTH.z, BOOTH.z + 1, NEON_CYAN);
    }
    box(DJ_SPOT.x - 1, DJ_SPOT.x, GROUND + 3, GROUND + 3, BOOTH.z, BOOTH.z, NEON_PINK);
    for (const x of [BOOTH.x - 5, BOOTH.x1 + 3]) {
      box(x, x + 2, GROUND, GROUND + 7, WALLS.z + 2, WALLS.z + 4, metal.deep);
      box(x + 1, x + 1, GROUND + 2, GROUND + 5, WALLS.z + 5, WALLS.z + 5, metal.base);
    }

    box(BAR.x, BAR.x1, GROUND, GROUND + 2, BAR.z, BAR.z1, teak.deep);
    box(BAR.x, BAR.x1, GROUND + 3, GROUND + 3, BAR.z, BAR.z1, stone.light);
    const shelf = WALLS.x1 - 2;
    box(shelf, shelf, GROUND + 4, GROUND + 4, BAR.z + 2, BAR.z1 - 2, teak.shade);
    const BOTTLES = [foliage.base, amber.base, glass.base] as const;
    for (let bottle = 0; bottle < 9; bottle++) {
      const z = BAR.z + 3 + bottle * 3;
      box(shelf, shelf, GROUND + 5, GROUND + 6, z, z, BOTTLES[bottle % BOTTLES.length]!);
    }
    for (const z of STOOLS) {
      box(STOOL_X, STOOL_X + 1, GROUND, GROUND + 1, z, z + 1, metal.base);
      box(STOOL_X, STOOL_X + 1, GROUND + 2, GROUND + 2, z, z + 1, teak.light);
    }

    const cushion = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, GROUND, GROUND, z0, z1, teak.deep);
      box(x0, x1, GROUND + 1, GROUND + 1, z0, z1, stucco.shade);
    };
    const back = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, GROUND, GROUND + 3, z0, z1, teak.deep);
    };
    for (const [z0, z1, armZ0, armZ1, backZ0, backZ1] of [
      [6, 18, 8, 9, 6, 7],
      [22, 34, 31, 32, 33, 34],
    ] as const) {
      back(LOUNGE.x, LOUNGE.x + 1, z0, z1);
      cushion(LOUNGE.x + 2, LOUNGE.x1, z0, z1);
      back(LOUNGE.x1 + 1, LOUNGE.arm, backZ0, backZ1);
      cushion(LOUNGE.x1 + 1, LOUNGE.arm, armZ0, armZ1);
    }
    for (const z of [12, 25]) {
      box(10, 13, GROUND, GROUND, z, z + 3, teak.shade);
      box(10, 13, GROUND + 1, GROUND + 1, z, z + 3, metal.base);
    }

    for (const x of [FLIGHT.x - 3, FLIGHT.x + FLIGHT.w + 1]) {
      pottedPlant(b, { x, z: APRON.z + 1, y: APRON.top });
    }
  },
});
