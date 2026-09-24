import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 79;

// Duplicated from what the plinths in `build` return, because the seat declarations
// cannot read a local; `build` checks the two agree.
const TOP_LAYER = 6;

const DECK = { x: 2, z: 2, w: 92, d: 64 } as const;
const BRINK = DECK.z + DECK.d - 1;
const LEFT = DECK.x;
const RIGHT = DECK.x + DECK.w - 1;

const STOOLS = [7, 12, 17, 22, 27, 32, 37, 42] as const;

// The only tall thing on the plot, so it stands against the back edge where it hides
// nothing from the 30-degree camera.
const BAR = { x: 5, z: 4, w: 40, d: 10 } as const;

// Stools stand clear of the eave: seen from 30 degrees, everything under it is roof.
const COUNTER = BAR.z + BAR.d - 2;
const EAVE_OVERHANG = 2;

const LOUNGE = { x: 58, z: 4, x1: 89, z1: 30 } as const;

const FLIGHTS = [15, 43, 71] as const;
const FLIGHT_W = 6;

// The only lit amber; everything else amber is amber.base so the lanterns read as lit.
const LANTERN = PALETTE.amber.light;

const DAYBEDS = [
  [4, 54],
  [22, 54],
  [32, 54],
  [50, 54],
  [60, 54],
  [80, 54],
  [6, 34],
  [20, 34],
  [34, 34],
  [48, 34],
  [62, 34],
  [76, 34],
] as const;

export default defineModel({
  id: 'beach-club',
  label: 'Beach Club',
  category: 'leisure',
  tiles: { x: 6, z: 5 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: TOP_LAYER + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...[LOUNGE.x + 3, LOUNGE.x + 8, LOUNGE.x + 13, LOUNGE.x + 18, LOUNGE.x + 23].map(
      (x) => ({ x, y: TOP_LAYER + 2, z: LOUNGE.z + 2, facing: 0 }) as const,
    ),
    ...[LOUNGE.z + 8, LOUNGE.z + 14, LOUNGE.z + 20].map(
      (z) => ({ x: LOUNGE.x1 - 3, y: TOP_LAYER + 2, z, facing: 3 }) as const,
    ),
    ...DAYBEDS.map(
      ([x, z]) => ({ x: x + 2, y: TOP_LAYER + 2, z: z + 4, facing: 0, pose: 'lie' }) as const,
    ),
  ],
  lights: [{ x: 25, y: 15, z: 12, color: LANTERN, intensity: 90, distance: 52 }],
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.7 },
      { need: 'thirst', amount: 0.4 },
    ],
    capacity: 25,
    dwellSeconds: { min: 1800, max: 5400 },
    doors: FLIGHTS.map((x) => ({ x: x + FLIGHT_W / 2, z: BRINK + 4, facing: 0 as const })),
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, sand, stone, stucco, teak } = PALETTE;

    const beach = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 2, stone: sand });

    // One flat colour on purpose: a dithered deck defeats the coplanar merge entirely.
    const top = plinth(b, { ...DECK, y: beach, height: 4, stone: teak });
    if (top !== TOP_LAYER) throw new Error('The deck and its furniture must agree on its surface');
    const deck = top - 1;

    box(BAR.x - 2, BAR.x + BAR.w + 1, deck, deck, DECK.z + 1, COUNTER + 6, teak.light);

    const wall = top + 8;
    box(BAR.x, BAR.x + BAR.w - 1, top, wall, BAR.z, BAR.z + 1, stucco.base);
    box(BAR.x, BAR.x + BAR.w - 1, top, top + 1, BAR.z, BAR.z + 1, stone.base);
    box(BAR.x, BAR.x + BAR.w - 1, wall, wall, BAR.z, BAR.z + 1, stucco.light);
    box(BAR.x + 1, BAR.x + BAR.w - 2, top + 4, top + 4, BAR.z + 2, BAR.z + 2, teak.shade);
    const BOTTLES = [foliage.base, amber.base, bloom.base] as const;
    for (let bottle = 0; bottle < 12; bottle++) {
      const x = BAR.x + 3 + bottle * 3;
      box(x, x, top + 5, top + 6, BAR.z + 2, BAR.z + 2, BOTTLES[bottle % BOTTLES.length]!);
    }

    box(BAR.x, BAR.x + BAR.w - 1, top, top + 3, COUNTER, COUNTER + 1, teak.shade);
    box(BAR.x, BAR.x + BAR.w - 1, top + 4, top + 4, COUNTER, COUNTER + 1, stone.light);

    const stool = (x: number): void => {
      box(x, x + 1, top, top + 1, COUNTER + 3, COUNTER + 4, teak.deep);
      box(x, x + 1, top + 2, top + 2, COUNTER + 3, COUNTER + 4, amber.base);
    };
    for (const x of STOOLS) stool(x);

    const eaves = top + 12;
    for (const x of [BAR.x, BAR.x + BAR.w - 1]) {
      for (const z of [BAR.z, BAR.z + BAR.d - 1]) box(x, x, top, eaves - 1, z, z, teak.base);
    }
    thatchRoof(b, { ...BAR, y: eaves, ridge: 'x', overhang: EAVE_OVERHANG });

    const lantern = (x: number): void => {
      box(x, x, eaves - 3, eaves - 2, COUNTER + 2, COUNTER + 2, LANTERN);
      box(x, x, eaves - 1, eaves - 1, COUNTER + 2, COUNTER + 2, teak.shade);
    };
    for (const x of [BAR.x + 4, BAR.x + 15, BAR.x + 26, BAR.x + 36]) lantern(x);

    const sofa = (x0: number, x1: number, z0: number, z1: number, back: 'x+' | 'z-'): void => {
      box(x0, x1, top, top, z0, z1, teak.base);
      box(x0, x1, top + 1, top + 1, z0, z1, stucco.light);
      const [bx0, bz0] = back === 'x+' ? [x1 - 1, z0] : [x0, z0];
      const [bx1, bz1] = back === 'x+' ? [x1, z1] : [x1, z0 + 1];
      box(bx0, bx1, top + 2, top + 3, bz0, bz1, stucco.base);
      box(bx0, bx1, top + 4, top + 4, bz0, bz1, teak.shade);
    };

    sofa(LOUNGE.x, LOUNGE.x1, LOUNGE.z, LOUNGE.z + 3, 'z-');
    sofa(LOUNGE.x1 - 3, LOUNGE.x1, LOUNGE.z + 4, LOUNGE.z1, 'x+');
    box(LOUNGE.x + 8, LOUNGE.x + 17, top, top + 1, LOUNGE.z + 10, LOUNGE.z + 17, teak.shade);
    box(LOUNGE.x + 7, LOUNGE.x + 18, top + 2, top + 2, LOUNGE.z + 9, LOUNGE.z + 18, teak.light);
    for (const x of [LOUNGE.x + 5, LOUNGE.x + 15, LOUNGE.x + 25]) {
      box(x, x + 2, top + 2, top + 3, LOUNGE.z + 1, LOUNGE.z + 1, amber.base);
    }
    for (const z of [LOUNGE.z + 7, LOUNGE.z1 - 4]) {
      box(LOUNGE.x1 - 1, LOUNGE.x1 - 1, top + 2, top + 3, z, z + 2, amber.base);
    }

    const daybed = (x: number, z: number): void => {
      box(x, x + 7, top, top, z, z + 6, teak.shade);
      box(x, x + 7, top + 1, top + 1, z, z + 6, stucco.light);
      box(x, x + 7, top + 2, top + 2, z + 4, z + 4, amber.base);
      box(x, x + 7, top + 2, top + 3, z, z, stucco.light);
      box(x, x + 7, top + 4, top + 4, z, z, teak.base);
    };

    for (const [x, z] of DAYBEDS) {
      daybed(x, z);
      parasol(b, { x: x + 4, z: z + 3, y: top });
    }

    // Every baluster is four unmergeable quads, hence the wider pitch.
    for (const x of [LEFT, RIGHT]) {
      balustrade(b, { x, z: DECK.z, y: top, w: DECK.d, along: 'z', pitch: 3, rail: teak });
    }
    const starts = [LEFT, ...FLIGHTS.map((x) => x + FLIGHT_W)];
    const ends = [...FLIGHTS.map((x) => x - 1), RIGHT];
    for (const [i, from] of starts.entries()) {
      const to = ends[i]!;
      balustrade(b, {
        x: from,
        z: BRINK,
        y: top,
        w: to - from + 1,
        along: 'x',
        pitch: 3,
        rail: teak,
      });
    }
    for (const x of FLIGHTS) {
      steps(b, { x, z: BRINK + 1, w: FLIGHT_W, y: deck, treads: 4, descends: 'z+', stone: teak });
    }

    for (const x of FLIGHTS) {
      for (const at of [x - 3, x + FLIGHT_W + 1]) pottedPlant(b, { x: at, z: BRINK - 2, y: top });
    }
    for (const x of [LEFT + 1, RIGHT - 2]) pottedPlant(b, { x, z: BRINK - 2, y: top });
    // A single green: three colours alternating along 15 m reads as bunting and costs 60 quads.
    flowerBox(b, {
      x: LEFT,
      z: DECK.z,
      y: top,
      w: DECK.w,
      along: 'x',
      blooms: [foliage.base],
    });

    for (const x of [6, 26, 36, 56, 64, 86]) {
      box(x, x + 3, beach, beach, 70, 75, teak.shade);
      box(x, x + 3, beach + 1, beach + 1, 70, 75, stucco.light);
      box(x, x + 3, beach + 2, beach + 2, 73, 73, amber.base);
      box(x, x + 3, beach + 2, beach + 3, 70, 70, stucco.light);
      box(x, x + 3, beach + 4, beach + 4, 70, 70, teak.base);
    }
  },
});
