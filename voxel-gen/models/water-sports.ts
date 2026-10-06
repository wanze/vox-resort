// The racked craft are drawn from parts/boat.ts, as the ones on the water are, so a jet ski on
// the trestles and one taken out are the same jet ski.
import { PALETTE } from '../palette.ts';
import { banana, jetSki } from '../parts/boat.ts';
import { plinth } from '../parts/ground.ts';
import { thatchRoof } from '../parts/roof.ts';
import {
  awning,
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 48, d: 32, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const HUT = { x: 4, z: 3, w: 18, d: 12 } as const;

const FRONT = HUT.z + HUT.d - 1;

const COUNTER_X = HUT.x + 9;

const JET_SKIS = [8, 17] as const;
const JET_SKI_Z = 18;

const BANANA = { x: 28, z: 10 } as const;

const DECK = { x: 34, x1: 45, z: 16, z1: 29 } as const;
const DECK_TOP = GROUND + 2;

const CHAIR = { x: 40, z: 23 } as const;
const CHAIR_SEAT = DECK_TOP + 5;

const FLAGS = [
  { x: 25, z: 3 },
  { x: 46, z: 3 },
] as const;

export default defineModel({
  id: 'water-sports',
  label: 'Water Sports',
  category: 'leisure',
  sound: 'watersports',
  cost: 2_800,
  placement: { ground: 'shore', perResort: { min: 1, max: 1 } },
  // The banana first, so four hirers together take it out rather than two jet skis.
  hire: {
    fleets: [
      { craft: 'speedboat', count: 1, riders: 4, pace: 2.2, tows: 'banana' },
      { craft: 'jet-ski', count: 4, riders: 2, pace: 2.6 },
    ],
  },
  venue: {
    shelter: 'open',
    role: 'activity',
    sign: 'watersports',
    names: [
      'Splash Point',
      'Onda Sports',
      'The Wave Riders',
      'Banana Bay',
      'Jet Set Beach',
      'Spruzzo',
      'Blue Thrill',
      'The Spray Shack',
      'Surf & Speed',
      'Mare Veloce',
      'Wake Up Watersports',
      'Full Throttle',
    ],
    // Back wet and salty, which is what sends them on to the beach shower.
    satisfies: [
      { need: 'fun', amount: 0.9 },
      { need: 'energy', amount: -0.3 },
      { need: 'hygiene', amount: -0.2 },
    ],
    // Four on the banana and two on each jet ski.
    capacity: 12,
    dwellSeconds: { min: 1200, max: 2700 },
    price: 10,
    // Motors, which give out well over twice as often as the game hall's machines.
    reliability: 30,
    bathing: true,
    spots: [
      { x: CHAIR.x, y: CHAIR_SEAT + 1, z: CHAIR.z, facing: 0, pose: 'sit', for: 'lifeguard' },
    ],
    doors: [{ x: COUNTER_X, z: FRONT + 2, facing: 0 }],
  },
  tiles: { x: 3, z: 2 },
  windows: WINDOW_GLASS,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, metal, stucco, teak, water } = PALETTE;

    plinth(b, SLAB);

    const eaves = stuccoWall(b, {
      x: HUT.x,
      z: HUT.z,
      w: HUT.w,
      d: HUT.d,
      y: GROUND,
      storeys: 1,
      wall: teak,
      trim: PALETTE.stone,
      skirting: 1,
    });
    thatchRoof(b, { ...HUT, y: eaves, overhang: 2 });

    const hatch = GROUND + 4;
    doorway(b, { face: 'z+', at: FRONT, along: COUNTER_X - 4, y: hatch, w: 8, h: 5, timber: teak });
    box(COUNTER_X - 5, COUNTER_X + 4, hatch - 1, hatch - 1, FRONT, FRONT + 2, teak.light);
    box(COUNTER_X - 5, COUNTER_X + 4, GROUND, hatch - 2, FRONT + 1, FRONT + 2, teak.shade);
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HUT.x + 2,
      w: HUT.w - 4,
      y: GROUND + STOREY_VOXELS - 2,
      reach: 3,
      canvas: water,
    });

    shutteredWindow(b, {
      face: 'x+',
      at: HUT.x + HUT.w - 1,
      along: HUT.z + 4,
      y: GROUND + 5,
      w: 3,
      h: 4,
      timber: teak,
    });

    for (const [index, x] of JET_SKIS.entries()) {
      for (const z of [JET_SKI_Z + 2, JET_SKI_Z + 7])
        box(x - 2, x + 2, GROUND, GROUND, z, z, teak.base);
      jetSki(b, { x, z: JET_SKI_Z, y: GROUND + 1, trim: [bloom, water][index]! });
    }

    for (const z of [BANANA.z + 3, BANANA.z + 13]) {
      box(BANANA.x - 2, BANANA.x + 2, GROUND, GROUND, z, z, teak.base);
    }
    banana(b, { ...BANANA, y: GROUND + 1 });

    box(DECK.x, DECK.x1, GROUND, DECK_TOP - 1, DECK.z, DECK.z1, teak.shade);
    box(DECK.x, DECK.x1, DECK_TOP, DECK_TOP, DECK.z, DECK.z1, teak.light);
    box(DECK.x - 1, DECK.x - 1, GROUND, GROUND, DECK.z + 4, DECK.z + 8, teak.base);

    // High enough that the lifeguard sees over the racked banana to the water.
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        box(
          CHAIR.x + dx,
          CHAIR.x + dx,
          DECK_TOP + 1,
          CHAIR_SEAT - 1,
          CHAIR.z + dz,
          CHAIR.z + dz,
          teak.base,
        );
      }
    }
    box(CHAIR.x - 1, CHAIR.x + 1, CHAIR_SEAT, CHAIR_SEAT, CHAIR.z - 1, CHAIR.z + 1, teak.light);
    box(
      CHAIR.x - 1,
      CHAIR.x + 1,
      CHAIR_SEAT + 1,
      CHAIR_SEAT + 4,
      CHAIR.z - 2,
      CHAIR.z - 2,
      bloom.base,
    );
    box(
      CHAIR.x - 2,
      CHAIR.x + 2,
      CHAIR_SEAT + 1,
      CHAIR_SEAT + 1,
      CHAIR.z - 1,
      CHAIR.z - 1,
      metal.base,
    );

    for (const [index, flag] of FLAGS.entries()) {
      const cloth = [bloom, water][index]!;
      box(flag.x, flag.x, GROUND, GROUND + 20, flag.z, flag.z, stucco.light);
      box(flag.x - 5, flag.x - 1, GROUND + 16, GROUND + 19, flag.z, flag.z, cloth.base);
      box(flag.x - 5, flag.x - 1, GROUND + 17, GROUND + 18, flag.z, flag.z, stucco.light);
    }
  },
});
