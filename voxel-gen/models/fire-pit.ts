import { PALETTE } from '../palette.ts';
import { defineModel, type ModelSpot, type QuarterTurns, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;

// One course with no lip, as the volleyball court: the pit lies in the beach, not on it.
const SURFACE = 0;
const GROUND = SURFACE + 1;

// Between the middle four columns: the flames and the light rise from the very centre.
const CENTRE = (N + 1) / 2;

const RING = { inner: 3.5, outer: 4.7 } as const;
const TRAMPLED = 11.5;
const STICKS = 6;

// Two voxels thick, so the hips sit on the back half and the legs hang over the front.
const NEAR = 5;
const LOGS = [
  [10, N - 10, NEAR, NEAR + 1],
  [N - NEAR - 1, N - NEAR, 10, N - 10],
  [10, N - 10, N - NEAR - 1, N - NEAR],
  [NEAR, NEAR + 1, 10, N - 10],
] as const;
const HIPS = GROUND + 2;
const ALONG = [11, 14, 17, 20] as const;

const distance = (x: number, z: number): number => Math.hypot(x + 0.5 - CENTRE, z + 0.5 - CENTRE);

// Each log's hip line, facing the fire; mirrored through the centre as the model is.
const SIDES: readonly { readonly at: (along: number) => [number, number]; facing: QuarterTurns }[] =
  [
    { at: (along) => [along, NEAR], facing: 0 },
    { at: (along) => [N - NEAR, along], facing: 3 },
    { at: (along) => [N - along, N - NEAR], facing: 2 },
    { at: (along) => [NEAR, N - along], facing: 1 },
  ];

// Spots, not seats: a seat joins the walk network, and a beach roamer would sit by a cold pit.
const AROUND: readonly ModelSpot[] = SIDES.flatMap(({ at, facing }) =>
  ALONG.map((along) => {
    const [x, z] = at(along);
    return { x, y: HIPS, z, facing, pose: 'sit' } as const;
  }),
);

export default defineModel({
  id: 'fire-pit',
  label: 'Fire Pit',
  category: 'leisure',
  sound: 'bonfire',
  tiles: { x: 2, z: 2 },
  // Its derived cost is a ring of logs, cheaper than any bench; the evenings are what it sells.
  cost: 500,
  placement: { ground: 'beach', perResort: { min: 1, max: 1 } },
  venue: {
    role: 'activity',
    shelter: 'open',
    sign: 'bonfire',
    names: [
      'The Driftwood Fire',
      'Falò della Luna',
      'Sunset Embers',
      'The Fire Circle',
      'Ember Cove',
      'Fuoco di Spiaggia',
      'The Glowing Sands',
      'Starlight Fire',
      'The Beach Hearth',
      'Moonfire',
    ],
    // Nothing a guest walks over for: only a bonfire evening's audience is sent here.
    satisfies: [],
    capacity: AROUND.length,
    dwellSeconds: { min: 1800, max: 5400 },
    spots: AROUND,
    hearth: {
      x: CENTRE - 0.5,
      y: GROUND + 1,
      z: CENTRE - 0.5,
      light: { color: 0xff9a3c, intensity: 120, distance: 64 },
    },
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { metal, sand, slate, stone, teak, water } = PALETTE;

    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        set(x, SURFACE, z, distance(x, z) < TRAMPLED ? sand.shade : sand.base);
      }
    }

    // In eighths round the ring, so the stones read as stones and not as a dither.
    for (let x = 8; x <= N - 8; x++) {
      for (let z = 8; z <= N - 8; z++) {
        const from = distance(x, z);
        if (from >= RING.inner && from < RING.outer) {
          const eighth = Math.floor(
            ((Math.atan2(z + 0.5 - CENTRE, x + 0.5 - CENTRE) + Math.PI) / (2 * Math.PI)) * 8,
          );
          box(x, x, GROUND, GROUND + 1, z, z, eighth % 2 === 0 ? stone.base : stone.shade);
        } else if (from < RING.inner) {
          set(x, GROUND, z, slate.shade);
        }
      }
    }

    // Last night's sticks, leaning together and charred black where the flames reached.
    for (let stick = 0; stick < STICKS; stick++) {
      const angle = ((stick + 0.5) / STICKS) * 2 * Math.PI;
      for (let rise = 0; rise < 4; rise++) {
        const reach = 2.4 - 0.6 * rise;
        const x = Math.floor(CENTRE + Math.cos(angle) * reach);
        const z = Math.floor(CENTRE + Math.sin(angle) * reach);
        set(x, GROUND + 1 + rise, z, rise < 2 ? teak.deep : metal.deep);
      }
    }

    for (const [x0, x1, z0, z1] of LOGS) {
      box(x0, x1, GROUND, GROUND + 1, z0, z1, teak.base);
      // The cut ends, paler than the bark.
      if (x1 - x0 > z1 - z0) {
        box(x0, x0, GROUND, GROUND + 1, z0, z1, teak.light);
        box(x1, x1, GROUND, GROUND + 1, z0, z1, teak.light);
      } else {
        box(x0, x1, GROUND, GROUND + 1, z0, z0, teak.light);
        box(x0, x1, GROUND, GROUND + 1, z1, z1, teak.light);
      }
    }

    // Tomorrow's firewood, and a bucket of water beside it, as a beach fire needs.
    box(26, 29, GROUND, GROUND + 1, 27, 28, teak.shade);
    box(27, 28, GROUND + 2, GROUND + 2, 27, 28, teak.shade);
    box(26, 26, GROUND, GROUND + 1, 27, 28, teak.light);
    box(3, 4, GROUND, GROUND + 1, 26, 27, metal.base);
    box(3, 4, GROUND + 2, GROUND + 2, 26, 27, water.base);
  },
});
