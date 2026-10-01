import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { flowerBox, parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { arcade, balustrade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 79;

// Duplicated from what the build paints, because the seat declarations cannot read
// a local; `build` checks the two agree.
const DECK_TOP = 4;
const TERRACE_TOP = 8;
const PIT_TOP = 4;

const LEFT = 2;
const RIGHT = X - 2;
const TERRACE_BACK = 2;
const TERRACE_FRONT = 25;
const DECK_BACK = TERRACE_FRONT + 1;
const BRINK = 67;

// Tall things stand at the back edge, where they hide nothing from the 30-degree camera.
const BAR = { x: 54, z: 4, w: 36, d: 12 } as const;
const BAR_X1 = BAR.x + BAR.w - 1;
const BAR_FRONT = BAR.z + BAR.d - 1;
const COUNTER = BAR_FRONT - 1;
const MID_PIER = 71;
const STOOLS = [57, 61, 65, 69, 74, 78, 82, 86] as const;
const EAVES = TERRACE_TOP + 12;

const PIT = { x0: 7, x1: 41, z0: 5, z1: 21 } as const;
const PIT_BACK = [13, 20, 27, 34] as const;
const PIT_SIDES = [11, 17] as const;
const FIRE = { x: 24, z: 12 } as const;

const TERRACE_STEPS = { x: 42, w: 10 } as const;

const CABANAS = [6, 23, 59, 76] as const;
const CABANA_Z = DECK_BACK + 8;
const DAYBEDS = [8, 20, 68, 80] as const;
const DAYBED_Z = DECK_BACK + 28;
const STAGE = { x0: 41, x1: 54, z0: DECK_BACK + 19, z1: DECK_BACK + 26 } as const;
// In front of the stage, between the daybeds either side.
const FLOOR = { x: 28, z: STAGE.z1 + 2, w: 40, d: 7, y: DECK_TOP } as const;

const FRONT_FLIGHT = { x: 40, w: 16 } as const;
const SIDE_FLIGHT = { z: DECK_BACK + 18, w: 8 } as const;

const LANTERN = PALETTE.amber.light;

export default defineModel({
  id: 'beach-club-b',
  label: 'Beach Club B',
  category: 'leisure',
  tiles: { x: 6, z: 5 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: TERRACE_TOP + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...PIT_BACK.map((x) => ({ x, y: PIT_TOP + 2, z: PIT.z0 + 1, facing: 0 }) as const),
    ...PIT_SIDES.map((z) => ({ x: PIT.x0 + 1, y: PIT_TOP + 2, z, facing: 1 }) as const),
    ...PIT_SIDES.map((z) => ({ x: PIT.x1 - 1, y: PIT_TOP + 2, z, facing: 3 }) as const),
    ...CABANAS.flatMap((x) =>
      [x + 3, x + 10].map(
        (hips) => ({ x: hips, y: DECK_TOP + 2, z: CABANA_Z + 4, facing: 0, pose: 'lie' }) as const,
      ),
    ),
    ...DAYBEDS.map(
      (x) => ({ x: x + 3, y: DECK_TOP + 2, z: DAYBED_Z + 4, facing: 0, pose: 'lie' }) as const,
    ),
  ],
  lights: [
    { x: 72, y: EAVES - 3, z: COUNTER + 3, color: LANTERN, intensity: 90, distance: 52 },
    { x: FIRE.x, y: PIT_TOP + 4, z: FIRE.z + 2, color: LANTERN, intensity: 50, distance: 28 },
  ],
  venue: {
    shelter: 'open',
    role: 'activity',
    stage: true,
    satisfies: [
      { need: 'fun', amount: 0.7 },
      { need: 'thirst', amount: 0.4 },
    ],
    capacity: 25,
    dwellSeconds: { min: 1800, max: 5400 },
    price: 4,
    spots: [
      {
        x: (STAGE.x0 + STAGE.x1 + 1) / 2,
        y: DECK_TOP + 2,
        z: STAGE.z0 + 4,
        facing: 0,
        for: 'animator',
      },
    ],
    floor: FLOOR,
    doors: [
      { x: FRONT_FLIGHT.x + FRONT_FLIGHT.w / 2, z: BRINK + 2, facing: 0 },
      { x: 0, z: SIDE_FLIGHT.z + SIDE_FLIGHT.w / 2, facing: 3 },
      { x: X, z: SIDE_FLIGHT.z + SIDE_FLIGHT.w / 2, facing: 1 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, stone, stucco, teak, terracotta } = PALETTE;

    const beach = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 2, stone: PALETTE.sand });
    const deck = { x: LEFT, z: DECK_BACK, w: RIGHT - LEFT + 1, d: BRINK - DECK_BACK + 1 };
    if (plinth(b, { ...deck, y: beach, height: 2, stone: teak }) !== DECK_TOP) {
      throw new Error('The deck and its furniture must agree on its surface');
    }

    const paving = TERRACE_TOP - 1;
    const terrace = (y0: number, y1: number, z0: number, color: number): void =>
      box(LEFT, RIGHT, y0, y1, z0, TERRACE_FRONT, color);
    terrace(beach, paving - 1, TERRACE_BACK, stucco.base);
    terrace(beach, beach, TERRACE_BACK, stone.shade);
    terrace(paving, paving, TERRACE_BACK, stone.base);
    terrace(paving, paving, TERRACE_FRONT, stone.light);

    steps(b, { ...TERRACE_STEPS, z: DECK_BACK, y: paving - 1, treads: 3, descends: 'z+' });
    const flight = { y: beach, treads: 1, stone: teak } as const;
    steps(b, { ...flight, ...FRONT_FLIGHT, z: BRINK + 1, descends: 'z+' });
    steps(b, { ...flight, x: 1, z: SIDE_FLIGHT.z, w: SIDE_FLIGHT.w, descends: 'x-' });
    steps(b, { ...flight, x: X - 1, z: SIDE_FLIGHT.z, w: SIDE_FLIGHT.w, descends: 'x+' });

    // Sunk rather than raised, so the lounge reads from the deck instead of walling it off.
    for (let y = PIT_TOP; y <= paving; y++) {
      for (let x = PIT.x0; x <= PIT.x1; x++) for (let z = PIT.z0; z <= PIT.z1; z++) b.del(x, y, z);
    }
    box(PIT.x0, PIT.x1, PIT_TOP - 1, PIT_TOP - 1, PIT.z0, PIT.z1, terracotta.light);
    const bench = (x0: number, x1: number, z0: number, z1: number): void => {
      box(x0, x1, PIT_TOP, PIT_TOP, z0, z1, stucco.base);
      box(x0, x1, PIT_TOP + 1, PIT_TOP + 1, z0, z1, stucco.light);
    };
    bench(PIT.x0, PIT.x1, PIT.z0, PIT.z0 + 2);
    bench(PIT.x0, PIT.x0 + 2, PIT.z0 + 3, PIT.z1);
    bench(PIT.x1 - 2, PIT.x1, PIT.z0 + 3, PIT.z1);
    const cushion = PIT_TOP + 2;
    for (const x of [16, 23, 30]) box(x, x + 2, cushion, cushion, PIT.z0, PIT.z0, amber.base);
    for (const x of [PIT.x0, PIT.x1]) box(x, x, cushion, cushion, 14, 15, amber.base);
    steps(b, { x: FIRE.x - 3, z: PIT.z1, w: 7, y: paving - 1, treads: 3, descends: 'z-' });
    box(FIRE.x - 4, FIRE.x + 4, PIT_TOP, PIT_TOP + 1, FIRE.z - 2, FIRE.z + 2, stone.light);
    box(FIRE.x - 2, FIRE.x + 2, PIT_TOP + 1, PIT_TOP + 1, FIRE.z - 1, FIRE.z + 1, LANTERN);
    box(FIRE.x - 1, FIRE.x + 1, PIT_TOP + 2, PIT_TOP + 2, FIRE.z, FIRE.z, LANTERN);

    const back = { z: TERRACE_BACK, y: TERRACE_TOP, along: 'x', blooms: [foliage.base] } as const;
    flowerBox(b, { ...back, x: PIT.x0, w: BAR.x - PIT.x0 - 1 });

    box(BAR.x, BAR_X1, TERRACE_TOP, EAVES - 1, BAR.z, BAR.z + 2, stucco.base);
    box(BAR.x, BAR_X1, TERRACE_TOP, TERRACE_TOP, BAR.z, BAR.z + 2, stone.base);
    box(BAR_X1 - 1, BAR_X1, TERRACE_TOP, EAVES - 1, BAR.z, BAR_FRONT, stucco.base);
    box(BAR_X1 - 1, BAR_X1, TERRACE_TOP, TERRACE_TOP + 1, BAR.z, BAR_FRONT, stone.base);
    arcade(b, { ...BAR, w: 2, y: TERRACE_TOP, along: 'z', bays: 1, height: 8 });
    box(MID_PIER, MID_PIER + 1, TERRACE_TOP, EAVES - 1, COUNTER, BAR_FRONT, stucco.base);
    box(MID_PIER, MID_PIER + 1, TERRACE_TOP, TERRACE_TOP + 1, COUNTER, BAR_FRONT, stone.base);

    const shelf = BAR.z + 3;
    const BOTTLES = [foliage.base, amber.base, bloom.base, glass.light] as const;
    box(BAR.x + 2, BAR_X1 - 2, TERRACE_TOP + 5, TERRACE_TOP + 5, shelf, shelf, teak.shade);
    for (let bottle = 0; bottle < 10; bottle++) {
      const x = BAR.x + 4 + bottle * 3;
      const color = BOTTLES[bottle % BOTTLES.length]!;
      box(x, x, TERRACE_TOP + 6, TERRACE_TOP + 7, shelf, shelf, color);
    }

    const counterTop = TERRACE_TOP + 4;
    for (const [x0, x1] of [
      [BAR.x + 2, MID_PIER - 1],
      [MID_PIER + 2, BAR_X1 - 2],
    ] as const) {
      box(x0, x1, TERRACE_TOP, counterTop - 1, COUNTER, COUNTER + 1, teak.shade);
      box(x0, x1, counterTop, counterTop, COUNTER, COUNTER + 1, stone.light);
    }
    for (const [x, drink] of [
      [60, bloom.light],
      [67, amber.light],
      [79, foliage.light],
    ] as const) {
      b.set(x, counterTop + 1, COUNTER, glass.light);
      b.set(x, counterTop + 2, COUNTER, drink);
    }

    for (const x of STOOLS) {
      box(x, x, TERRACE_TOP, TERRACE_TOP + 1, COUNTER + 3, COUNTER + 3, metal.base);
      box(x, x + 1, TERRACE_TOP + 2, TERRACE_TOP + 2, COUNTER + 3, COUNTER + 4, teak.base);
    }

    hipRoof(b, { ...BAR, y: EAVES });
    const cord = BAR_FRONT + 1;
    box(BAR.x, BAR_X1, EAVES - 1, EAVES - 1, cord, cord, teak.deep);
    for (let x = BAR.x + 2; x < BAR_X1; x += 3) b.set(x, EAVES - 2, cord, LANTERN);

    // Olive in the one corner behind everything, where its crown shades the lounge.
    box(LEFT, LEFT + 3, TERRACE_TOP, TERRACE_TOP + 2, TERRACE_BACK, TERRACE_BACK + 3, stucco.light);
    box(3, 4, TERRACE_TOP + 3, TERRACE_TOP + 9, 3, 4, teak.shade);
    box(4, 5, TERRACE_TOP + 7, TERRACE_TOP + 10, 4, 5, teak.shade);
    const crown = TERRACE_TOP + 10;
    box(0, 9, crown, crown + 1, 1, 8, foliage.base);
    box(1, 8, crown, crown + 1, 0, 9, foliage.base);
    box(1, 8, crown + 2, crown + 3, 1, 8, foliage.base);
    box(2, 7, crown + 4, crown + 4, 2, 7, foliage.light);

    const rail = { y: TERRACE_TOP, pitch: 3, rail: stone } as const;
    balustrade(b, { ...rail, x: LEFT, z: TERRACE_BACK + 4, w: TERRACE_FRONT - 5, along: 'z' });
    balustrade(b, { ...rail, x: LEFT, z: TERRACE_FRONT, w: TERRACE_STEPS.x - LEFT, along: 'x' });
    const past = TERRACE_STEPS.x + TERRACE_STEPS.w;
    balustrade(b, { ...rail, x: past, z: TERRACE_FRONT, w: RIGHT - past + 1, along: 'x' });

    for (const x of [TERRACE_STEPS.x - 3, past + 1, RIGHT - 2]) {
      pottedPlant(b, { x, z: TERRACE_FRONT - 3, y: TERRACE_TOP });
    }

    const bed = { z: DECK_BACK, y: DECK_TOP, along: 'x', blooms: [bloom.base] } as const;
    flowerBox(b, { ...bed, x: LEFT + 1, w: TERRACE_STEPS.x - LEFT - 1 });
    flowerBox(b, { ...bed, x: past, w: RIGHT - past });

    const cabana = (x: number): void => {
      const z = CABANA_Z;
      box(x, x + 13, DECK_TOP, DECK_TOP, z, z + 7, teak.shade);
      box(x, x + 13, DECK_TOP + 1, DECK_TOP + 1, z, z + 7, stucco.light);
      box(x, x + 13, DECK_TOP + 2, DECK_TOP + 3, z, z, stucco.base);
      for (const pillow of [x + 2, x + 9]) {
        box(pillow, pillow + 2, DECK_TOP + 2, DECK_TOP + 2, z + 1, z + 1, amber.base);
      }
      const roof = DECK_TOP + 10;
      for (const px of [x - 1, x + 14]) {
        for (const pz of [z - 1, z + 8]) box(px, px, DECK_TOP, roof - 1, pz, pz, teak.base);
        box(px, px, roof, roof, z, z + 7, teak.base);
      }
      box(x - 1, x + 14, roof, roof, z - 1, z - 1, teak.base);
      box(x - 1, x + 14, roof, roof, z + 8, z + 8, teak.base);
      // Canvas over the pillows only, so the camera still sees who is lying there.
      box(x, x + 13, roof, roof, z, z + 3, stucco.light);
      box(x, x + 13, roof - 3, roof - 1, z - 1, z - 1, stucco.light);
      for (const px of [x, x + 13]) box(px, px, DECK_TOP + 4, roof - 1, z + 8, z + 8, stucco.light);
    };
    for (const x of CABANAS) cabana(x);

    box(STAGE.x0 + 1, STAGE.x1 - 1, DECK_TOP, DECK_TOP + 1, STAGE.z0, STAGE.z1, teak.shade);
    box(STAGE.x0, STAGE.x1, DECK_TOP, DECK_TOP + 1, STAGE.z0 + 1, STAGE.z1 - 1, teak.shade);
    box(
      STAGE.x0 + 1,
      STAGE.x1 - 1,
      DECK_TOP + 1,
      DECK_TOP + 1,
      STAGE.z0 + 1,
      STAGE.z1 - 1,
      teak.light,
    );
    const booth = DECK_TOP + 2;
    box(45, 50, booth, booth + 2, STAGE.z0 + 1, STAGE.z0 + 2, teak.deep);
    for (const x of [46, 49]) b.set(x, booth + 3, STAGE.z0 + 2, metal.base);
    for (const x of [STAGE.x0 + 1, STAGE.x1 - 1]) {
      box(x, x, booth, booth + 6, STAGE.z1 - 1, STAGE.z1 - 1, teak.base);
      b.set(x, booth + 7, STAGE.z1 - 1, LANTERN);
    }

    const daybed = (x: number): void => {
      const z = DAYBED_Z;
      box(x, x + 7, DECK_TOP, DECK_TOP, z, z + 7, teak.shade);
      box(x, x + 7, DECK_TOP + 1, DECK_TOP + 1, z, z + 7, stucco.light);
      box(x, x + 7, DECK_TOP + 2, DECK_TOP + 3, z, z, stucco.base);
      box(x + 2, x + 5, DECK_TOP + 2, DECK_TOP + 2, z + 1, z + 1, amber.base);
    };
    for (const x of DAYBEDS) daybed(x);
    for (const x of [17, X - 17]) {
      parasol(b, { x, z: DAYBED_Z + 3, y: DECK_TOP, reach: 3, canvas: stucco });
    }

    const beside = [SIDE_FLIGHT.z - 3, SIDE_FLIGHT.z + SIDE_FLIGHT.w + 1, BRINK - 3];
    for (const z of beside) {
      for (const x of [LEFT + 1, RIGHT - 2]) pottedPlant(b, { x, z, y: DECK_TOP });
    }
    for (const x of [FRONT_FLIGHT.x - 3, FRONT_FLIGHT.x + FRONT_FLIGHT.w + 1]) {
      pottedPlant(b, { x, z: BRINK - 3, y: DECK_TOP, size: 3 });
    }

    for (const x of [FRONT_FLIGHT.x - 3, FRONT_FLIGHT.x + FRONT_FLIGHT.w + 2]) {
      box(x, x, beach, beach + 6, BRINK + 3, BRINK + 3, teak.base);
      box(x, x, beach + 7, beach + 8, BRINK + 3, BRINK + 3, LANTERN);
    }
    for (const [x, towel] of [
      [8, bloom.base],
      [20, glass.light],
      [70, amber.base],
      [82, stucco.light],
    ] as const) {
      box(x, x + 4, beach, beach, BRINK + 3, BRINK + 9, towel);
    }
  },
});
