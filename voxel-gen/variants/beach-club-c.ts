import { PALETTE, type Ramp } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { awning } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 95;
const Z = 79;

// Written down because the seats are declared against it; `build` checks the two agree.
const GROUND = 2;

// A Riviera club laid straight on the sand: bathing huts and a bar along the back, a
// bandstand shell in the middle, striped cabanas either side and loungers down the front.
const HUTS = [3, 11, 19, 27, 35, 43] as const;
const HUT = { z0: 4, z1: 9, h: 9 } as const;

const BAR = { x0: 54, x1: 91, z0: 3, roof: GROUND + 11 } as const;
const COUNTER = 10;
const STOOLS = [57, 61, 65, 69, 74, 78, 82, 86] as const;

const STAGE = { x0: 38, x1: 57, z0: 26, z1: 35 } as const;
const STAGE_TOP = GROUND + 2;
const SHELL = { x: 48, r: 10 } as const;
const FLOOR = { x: 28, z: STAGE.z1 + 3, w: 40, d: 8, y: GROUND } as const;

const CABANAS = [4, 20, 62, 78] as const;
const CABANA_Z = 27;

const WALK = { x0: 45, x1: 50, z0: FLOOR.z + FLOOR.d, z1: FLOOR.z + FLOOR.d + 3 } as const;
const LOUNGERS = [4, 20, 65, 81] as const;
const LOUNGER_Z = 54;
const DECKCHAIRS = [8, 16, 24, 32, 63, 71, 79, 87] as const;
const DECKCHAIR_Z = 68;

const LANTERN = PALETTE.amber.light;

// Blue: the shade step, since only the water's base tone is drawn as water.
const BLUE = PALETTE.water.shade;
const STRIPE: Ramp = { ...PALETTE.water, base: BLUE, shade: PALETTE.water.deep };

export default defineModel({
  id: 'beach-club-c',
  label: 'Beach Club C',
  category: 'leisure',
  tiles: { x: 6, z: 5 },
  emissive: [LANTERN],
  seats: [
    ...STOOLS.map((x) => ({ x, y: GROUND + 3, z: COUNTER + 3, facing: 2 }) as const),
    ...CABANAS.flatMap((x) =>
      [x + 3, x + 10].map(
        (hips) => ({ x: hips, y: GROUND + 2, z: CABANA_Z + 4, facing: 0, pose: 'lie' }) as const,
      ),
    ),
    ...LOUNGERS.flatMap((x) =>
      [x + 2, x + 9].map(
        (hips) => ({ x: hips, y: GROUND + 2, z: LOUNGER_Z + 4, facing: 0, pose: 'lie' }) as const,
      ),
    ),
    ...DECKCHAIRS.map((x) => ({ x, y: GROUND + 1, z: DECKCHAIR_Z, facing: 0 }) as const),
  ],
  lights: [
    { x: 72, y: GROUND + 8, z: COUNTER + 4, color: LANTERN, intensity: 90, distance: 52 },
    { x: SHELL.x, y: GROUND + 8, z: FLOOR.z + 4, color: LANTERN, intensity: 90, distance: 52 },
  ],
  venue: {
    shelter: 'open',
    role: 'activity',
    stage: true,
    satisfies: [
      { need: 'fun', amount: 0.7 },
      { need: 'thirst', amount: 0.4 },
    ],
    capacity: 18,
    dwellSeconds: { min: 1800, max: 5400 },
    price: 4,
    spots: [{ x: SHELL.x, y: STAGE_TOP, z: STAGE.z0 + 5, facing: 0, for: 'animator' }],
    floor: FLOOR,
    doors: [
      { x: SHELL.x, z: Z, facing: 0 },
      { x: 0, z: WALK.z0 + 2, facing: 3 },
      { x: X, z: WALK.z0 + 2, facing: 1 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, glass, metal, sand, stucco, teak } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 2, stone: sand });
    if (ground !== GROUND) throw new Error('The beach and its furniture must agree on its surface');

    // Boards are laid into the sand rather than on it, so the dance floor is level with the beach.
    const boards = ground - 1;
    box(BAR.x0 - 1, BAR.x1 + 1, boards, boards, BAR.z0, COUNTER + 7, teak.light);
    const floorX1 = FLOOR.x + FLOOR.w - 1;
    box(FLOOR.x, floorX1, boards, boards, FLOOR.z, FLOOR.z + FLOOR.d - 1, teak.light);
    box(1, X - 1, boards, boards, WALK.z0, WALK.z1, teak.base);
    box(WALK.x0, WALK.x1, boards, boards, WALK.z1 + 1, Z, teak.base);

    // Each hut its own colour: a stripe per hut costs nothing, a stripe per plank a quad each.
    const HUES = [BLUE, bloom.base, amber.base, foliage.light, glass.base, stucco.base] as const;
    for (const [index, x] of HUTS.entries()) {
      const top = ground + HUT.h - 1;
      box(x, x + 5, ground, top, HUT.z0, HUT.z1, HUES[index % HUES.length]!);
      box(x + 2, x + 3, ground, ground + 5, HUT.z1, HUT.z1, stucco.light);
      box(x, x + 5, ground, ground, HUT.z1 + 1, HUT.z1 + 2, teak.base);
      for (let step = 0; step < 4; step++) {
        const y = top + 1 + step;
        box(x - 1 + step, x + 6 - step, y, y, HUT.z0 - 1, HUT.z1 + 1, stucco.light);
      }
    }
    for (const [z, board] of [
      [3, amber.base],
      [6, BLUE],
      [9, bloom.base],
    ] as const) {
      box(1, 1, ground, ground + 9, z, z + 1, board);
      b.set(1, ground + 10, z, board);
    }

    const mast = ground + 21;
    box(51, 51, ground, mast, 6, 6, metal.light);
    for (const [y, band] of [
      [mast - 5, bloom.base],
      [mast - 3, stucco.light],
      [mast - 1, BLUE],
    ] as const) {
      box(52, 59, y, y + 1, 6, 6, band);
    }

    box(BAR.x0, BAR.x1, ground, BAR.roof - 1, BAR.z0, BAR.z0 + 1, stucco.light);
    for (const x of [BAR.x0, BAR.x1 - 1]) {
      box(x, x + 1, ground, BAR.roof - 1, BAR.z0, COUNTER + 1, stucco.light);
    }
    const fascia = COUNTER + 3;
    box(BAR.x0 - 1, BAR.x1 + 1, BAR.roof, BAR.roof, BAR.z0 - 1, fascia - 1, stucco.light);
    box(BAR.x0 - 1, BAR.x1 + 1, BAR.roof, BAR.roof + 1, fascia, fascia, BLUE);
    for (let x = BAR.x0; x <= BAR.x1; x += 2) {
      const canvas = (x - BAR.x0) % 4 ? PALETTE.stucco : STRIPE;
      awning(b, { face: 'z+', at: fascia, along: x, w: 2, y: BAR.roof - 1, canvas });
    }
    for (const x of [59, 67, 76, 84]) b.set(x, BAR.roof - 1, fascia, LANTERN);

    const shelf = BAR.z0 + 2;
    const BOTTLES = [foliage.base, amber.base, bloom.base, glass.light] as const;
    box(BAR.x0 + 3, BAR.x1 - 3, ground + 5, ground + 5, shelf, shelf, teak.shade);
    for (let bottle = 0; bottle < 10; bottle++) {
      const x = BAR.x0 + 4 + bottle * 3;
      box(x, x, ground + 6, ground + 7, shelf, shelf, BOTTLES[bottle % BOTTLES.length]!);
    }

    const counterTop = ground + 4;
    box(BAR.x0 + 2, BAR.x1 - 2, ground, counterTop - 1, COUNTER, COUNTER + 1, BLUE);
    box(BAR.x0 + 2, BAR.x1 - 2, counterTop, counterTop, COUNTER, COUNTER + 1, stucco.light);
    for (const [x, drink] of [
      [60, bloom.light],
      [72, amber.light],
      [83, foliage.light],
    ] as const) {
      b.set(x, counterTop + 1, COUNTER, glass.light);
      b.set(x, counterTop + 2, COUNTER, drink);
    }
    for (const x of STOOLS) {
      box(x, x, ground, ground + 1, COUNTER + 3, COUNTER + 3, metal.light);
      box(x, x + 1, ground + 2, ground + 2, COUNTER + 3, COUNTER + 4, bloom.base);
    }

    box(STAGE.x0, STAGE.x1, ground, STAGE_TOP - 2, STAGE.z0, STAGE.z1, teak.shade);
    box(STAGE.x0, STAGE.x1, STAGE_TOP - 1, STAGE_TOP - 1, STAGE.z0, STAGE.z1, stucco.light);
    steps(b, { x: SHELL.x - 4, z: STAGE.z1 + 1, w: 8, y: ground, treads: 1, descends: 'z+' });

    // A bandstand shell, ribbed like a scallop: it stands square to the camera, so it reads whole.
    for (let x = STAGE.x0; x <= STAGE.x1; x++) {
      for (let y = STAGE_TOP; y < STAGE_TOP + SHELL.r; y++) {
        const dx = x + 0.5 - SHELL.x;
        const dy = y + 0.5 - STAGE_TOP;
        const r = Math.hypot(dx, dy);
        if (r > SHELL.r) continue;
        const rib = Math.floor(Math.atan2(dy, dx) / (Math.PI / 9)) % 2 ? stucco.light : BLUE;
        let color = rib;
        if (r > SHELL.r - 1) color = bloom.base;
        else if (r < 2) color = stucco.light;
        box(x, x, y, y, STAGE.z0, STAGE.z0 + 1, color);
      }
    }
    for (const x of [STAGE.x0, STAGE.x1 - 1]) {
      box(x, x + 1, STAGE_TOP, STAGE_TOP + 3, STAGE.z1 - 1, STAGE.z1, metal.deep);
      box(x, x + 1, STAGE_TOP + 1, STAGE_TOP + 2, STAGE.z1, STAGE.z1, metal.base);
    }

    // Strung across the floor high enough that the dancers under it never reach it.
    const festoon = ground + 9;
    const strung = FLOOR.z + FLOOR.d / 2;
    for (const x of [FLOOR.x - 2, floorX1 + 2])
      box(x, x, ground, festoon, strung, strung, teak.base);
    box(FLOOR.x - 1, floorX1 + 1, festoon, festoon, strung, strung, metal.deep);
    for (let x = FLOOR.x + 1; x < floorX1; x += 4) b.set(x, festoon - 1, strung, LANTERN);

    const cabana = (x: number): void => {
      const z = CABANA_Z;
      const roof = ground + 9;
      box(x, x + 13, ground, ground, z, z + 7, teak.shade);
      box(x, x + 13, ground + 1, ground + 1, z, z + 7, stucco.light);
      box(x, x + 13, ground + 2, ground + 3, z, z, BLUE);
      for (const pillow of [x + 2, x + 9]) {
        box(pillow, pillow + 2, ground + 2, ground + 2, z + 1, z + 1, bloom.base);
      }
      box(x, x + 13, ground + 4, roof - 1, z - 1, z - 1, stucco.light);
      for (const px of [x - 1, x + 14]) {
        for (const pz of [z - 1, z + 8]) box(px, px, ground, roof - 1, pz, pz, teak.base);
        box(px, px, roof, roof, z - 1, z + 8, teak.base);
      }
      box(x, x + 13, roof, roof, z + 8, z + 8, teak.base);
      // Canvas over the pillows only, so the camera still sees who is lying there.
      for (let stripe = 0; stripe < 7; stripe++) {
        const sx = x + stripe * 2;
        const color = stripe % 2 ? stucco.light : BLUE;
        box(sx, sx + 1, roof, roof, z - 1, z + 3, color);
        box(sx, sx + 1, roof - 1, roof - 1, z + 3, z + 3, color);
      }
    };
    for (const x of CABANAS) cabana(x);

    const lounger = (x: number, mattress: number): void => {
      const z = LOUNGER_Z;
      box(x, x + 3, ground, ground, z, z + 6, teak.shade);
      box(x, x + 3, ground + 1, ground + 1, z, z + 6, mattress);
      box(x, x + 3, ground + 2, ground + 3, z, z, mattress);
      box(x, x + 3, ground + 2, ground + 2, z + 1, z + 1, mattress);
    };
    const brolly = (x: number, z: number): void => {
      const canopy = ground + 8;
      box(x, x, ground, canopy - 1, z, z, stucco.light);
      // Quartered in two colours, the panels of a beach umbrella as they read from above.
      for (let dx = -3; dx <= 3; dx++) {
        for (let dz = -3; dz <= 3; dz++) {
          b.set(x + dx, canopy, z + dz, dx * dz > 0 ? BLUE : stucco.light);
        }
      }
      b.set(x, canopy + 1, z, bloom.base);
    };
    for (const x of LOUNGERS) {
      lounger(x, stucco.light);
      lounger(x + 7, BLUE);
      brolly(x + 5, LOUNGER_Z + 2);
    }

    const SLINGS = [bloom.base, BLUE, amber.base, stucco.light] as const;
    for (const [index, x] of DECKCHAIRS.entries()) {
      const z = DECKCHAIR_Z;
      const sling = SLINGS[index % SLINGS.length]!;
      for (const side of [x - 2, x + 2]) {
        box(side, side, ground, ground, z - 1, z + 1, teak.base);
        box(side, side, ground, ground + 3, z - 2, z - 2, teak.base);
      }
      box(x - 1, x + 1, ground, ground, z, z + 1, sling);
      box(x - 1, x + 1, ground + 1, ground + 1, z - 1, z - 1, sling);
      box(x - 1, x + 1, ground + 2, ground + 3, z - 2, z - 2, sling);
    }

    for (const z of [56, 66, 76]) {
      for (const x of [WALK.x0 - 2, WALK.x1 + 2]) {
        box(x, x, ground, ground + 6, z, z, teak.base);
        box(x, x, ground + 7, ground + 8, z, z, LANTERN);
      }
    }

    box(36, 40, ground, ground + 1, 73, 77, sand.shade);
    for (const x of [36, 40]) {
      for (const z of [73, 77]) box(x, x, ground + 2, ground + 3, z, z, sand.shade);
    }
    box(38, 38, ground + 2, ground + 4, 75, 75, sand.shade);
    box(33, 34, ground, ground + 1, 76, 77, bloom.base);
  },
});
