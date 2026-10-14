import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 16, d: 16, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const DECK = { x: 3, x1: 12, z: 3, z1: 12 } as const;

const LEG_HEIGHT = 8;

const DECK_TOP = GROUND + LEG_HEIGHT;

// The hut takes the back of the deck and the lookout the front, so the roof is never
// over the sitter and the camera sees them against the white wall.
const HUT = { x: DECK.x, x1: DECK.x1, z: DECK.z, z1: DECK.z + 3, top: DECK_TOP + 7 } as const;

const BENCH = { x: 4, x1: 8, z: HUT.z1 + 1, z1: HUT.z1 + 2 } as const;

const PLANK = DECK_TOP + 2;

const SITTER = 6;

const DOOR = { x: 9, x1: 11 } as const;

// On the side the camera sees, so the way up is part of the picture.
const LADDER = { x: DECK.x - 1, z: HUT.z1 + 1, z1: HUT.z1 + 4 } as const;

const EAVES = HUT.top + 1;

// The cloth hangs four voxels below the top and droops further in still air, so the pole
// stands high enough to keep the tip off the roof.
const FLAGPOLE = { x: HUT.x1 - 1, z: HUT.z + 1, top: EAVES + 9 } as const;

export default defineModel({
  id: 'lifeguard-tower-b',
  label: 'Lifeguard Tower B',
  category: 'amenities',
  placement: { ground: 'shore' },
  tiles: { x: 1, z: 1 },
  // Only taken up on sand: inland there is no paving within reach of a deck this high,
  // so the seat is quietly dropped.
  seats: [{ x: SITTER, y: PLANK + 1, z: BENCH.z1, facing: 0, post: 'lifeguard' }],
  flags: [{ x: FLAGPOLE.x, y: FLAGPOLE.top + 1, z: FLAGPOLE.z }],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    for (const x of [DECK.x, DECK.x1 - 1]) {
      for (const z of [DECK.z, DECK.z1 - 1]) {
        box(x, x + 1, GROUND, DECK_TOP - 1, z, z + 1, teak.base);
      }
    }
    const brace = GROUND + Math.floor(LEG_HEIGHT / 2);
    box(DECK.x, DECK.x1, brace, brace, DECK.z, DECK.z, teak.shade);
    box(DECK.x, DECK.x1, brace, brace, DECK.z1, DECK.z1, teak.shade);
    box(DECK.x, DECK.x, brace, brace, DECK.z, DECK.z1, teak.shade);
    box(DECK.x1, DECK.x1, brace, brace, DECK.z, DECK.z1, teak.shade);

    box(DECK.x, DECK.x1, DECK_TOP, DECK_TOP, DECK.z, DECK.z1, teak.shade);

    box(HUT.x, HUT.x1, DECK_TOP + 1, HUT.top, HUT.z, HUT.z1, stucco.light);
    box(DOOR.x, DOOR.x1, DECK_TOP + 1, DECK_TOP + 6, HUT.z1 - 1, HUT.z1 - 1, teak.base);
    box(HUT.x + 1, HUT.x + 1, DECK_TOP + 3, DECK_TOP + 5, HUT.z + 1, HUT.z + 2, teak.deep);
    for (let y = DECK_TOP + 1; y <= DECK_TOP + 6; y++) {
      for (let x = DOOR.x; x <= DOOR.x1; x++) b.del(x, y, HUT.z1);
    }
    for (let y = DECK_TOP + 3; y <= DECK_TOP + 5; y++) {
      for (let z = HUT.z + 1; z <= HUT.z + 2; z++) b.del(HUT.x, y, z);
    }

    box(HUT.x - 1, HUT.x1 + 1, EAVES, EAVES, HUT.z - 1, HUT.z1 + 1, bloom.base);
    box(HUT.x, HUT.x1, EAVES + 1, EAVES + 1, HUT.z, HUT.z1, bloom.base);

    box(FLAGPOLE.x, FLAGPOLE.x, EAVES + 2, FLAGPOLE.top, FLAGPOLE.z, FLAGPOLE.z, teak.light);

    for (const x of [BENCH.x, BENCH.x1]) {
      box(x, x, DECK_TOP + 1, DECK_TOP + 1, BENCH.z, BENCH.z1, teak.deep);
    }
    box(BENCH.x, BENCH.x1, PLANK, PLANK, BENCH.z, BENCH.z1, teak.light);

    const rail = DECK_TOP + 3;
    box(DECK.x, DECK.x1, DECK_TOP + 1, DECK_TOP + 2, DECK.z1, DECK.z1, stucco.light);
    box(DECK.x1, DECK.x1, DECK_TOP + 1, DECK_TOP + 2, HUT.z1 + 1, DECK.z1, stucco.light);
    box(DECK.x, DECK.x1, rail, rail, DECK.z1, DECK.z1, teak.light);
    box(DECK.x1, DECK.x1, rail, rail, HUT.z1 + 1, DECK.z1, teak.light);
    box(DECK.x, DECK.x, DECK_TOP + 1, DECK_TOP + 2, LADDER.z1 + 1, DECK.z1, stucco.light);
    box(DECK.x, DECK.x, rail, rail, LADDER.z1, DECK.z1, teak.light);

    for (const z of [LADDER.z, LADDER.z1]) {
      box(LADDER.x, LADDER.x, GROUND, rail, z, z, teak.base);
    }
    for (let y = GROUND + 2; y < DECK_TOP; y += 2) {
      box(LADDER.x, LADDER.x, y, y, LADDER.z + 1, LADDER.z1 - 1, teak.light);
    }
  },
});
