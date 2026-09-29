import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const HUT = { x: 11, z: 3, w: 26, d: 14 } as const;
const FRONT = HUT.z + HUT.d - 1;
const LEFT = HUT.x;
const RIGHT = HUT.x + HUT.w - 1;
const DOOR = HUT.x + 11;

const DECK = { x0: 6, x1: 41, z0: 1, z1: 23 } as const;

// A metre and a half: tall enough that the stilts read as stilts under the deck's shadow.
const STILTS = 6;

const LADDER = { x: 12, w: 4 } as const;

const PORCH = 4;

export default defineModel({
  id: 'bungalow-b',
  label: 'Bungalow B',
  category: 'lodging',
  tiles: { x: 3, z: 2 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 20,
    doors: [{ x: DOOR + 2, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { sand, teak } = PALETTE;
    const beach = plinth(b, { x: 0, z: 0, w: 48, d: 32, height: 2, stone: sand });

    const floor = beach + STILTS;
    for (const x of [DECK.x0, 16, 26, 35, DECK.x1 - 1]) {
      for (const z of [DECK.z0, 12, DECK.z1 - 1]) {
        b.box(x, x + 1, beach, floor - 1, z, z + 1, teak.shade);
      }
    }
    b.box(DECK.x0, DECK.x1, floor - 1, floor - 1, DECK.z0, DECK.z1, teak.shade);
    b.box(DECK.x0 + 1, DECK.x1 - 1, floor - 1, floor - 1, DECK.z0 + 1, DECK.z1 - 1, teak.deep);
    b.box(DECK.x0, DECK.x1, floor, floor, DECK.z0, DECK.z1, teak.base);

    // Woven palm walls in sand, framed by teak posts: the frame is what reads as a hut rather than a box.
    const plate = stuccoWall(b, {
      ...HUT,
      y: floor + 1,
      storeys: 1,
      wall: sand,
      trim: teak,
      skirting: 1,
      quoins: false,
    });
    b.box(LEFT, RIGHT, floor + 6, floor + 6, HUT.z, FRONT, sand.shade);
    for (const x of [LEFT, LEFT + 9, RIGHT - 9, RIGHT]) {
      for (const z of [HUT.z, FRONT]) b.box(x, x, floor + 1, plate - 1, z, z, teak.base);
    }
    for (const x of [LEFT, RIGHT])
      b.box(x, x, floor + 1, plate - 1, HUT.z + 7, HUT.z + 7, teak.base);

    // The roof runs on over the porch on two posts, so it dominates the hut as it does in the reference.
    const porch = FRONT + PORCH;
    for (const x of [LEFT, RIGHT]) b.box(x, x, floor + 1, plate - 1, porch, porch, teak.base);
    thatchRoof(b, { ...HUT, d: HUT.d + PORCH, y: plate, overhang: 3, ridge: 'x' });

    doorway(b, { face: 'z+', at: FRONT, along: DOOR, y: floor + 1, w: 4, trim: teak });
    const window = { y: floor + 3, h: 5, trim: teak, timber: teak } as const;
    for (const along of [LEFT + 3, RIGHT - 6]) {
      shutteredWindow(b, { ...window, face: 'z+', at: FRONT, along, w: 4 });
    }
    for (const along of [HUT.z + 2, HUT.z + 9]) {
      shutteredWindow(b, { ...window, face: 'x-', at: LEFT, along, w: 3 });
      shutteredWindow(b, { ...window, face: 'x+', at: RIGHT, along, w: 3 });
    }
    for (const along of [LEFT + 4, RIGHT - 7]) {
      shutteredWindow(b, { ...window, face: 'z-', at: HUT.z, along, w: 4 });
    }

    const rail = floor + 1;
    balustrade(b, {
      x: DECK.x0,
      z: DECK.z1,
      y: rail,
      w: LADDER.x - DECK.x0,
      along: 'x',
      rail: teak,
    });
    balustrade(b, {
      x: LADDER.x + LADDER.w,
      z: DECK.z1,
      y: rail,
      w: DECK.x1 - LADDER.x - LADDER.w + 1,
      along: 'x',
      rail: teak,
    });
    for (const x of [DECK.x0, DECK.x1]) {
      balustrade(b, { x, z: DECK.z0, y: rail, w: DECK.z1 - DECK.z0, along: 'z', rail: teak });
    }
    balustrade(b, {
      x: DECK.x0,
      z: DECK.z0,
      y: rail,
      w: DECK.x1 - DECK.x0 + 1,
      along: 'x',
      rail: teak,
    });

    // One rise to one going, as steep as a beach hut's steps get before they are a ladder.
    for (let tread = 0; tread < STILTS; tread++) {
      const y = floor - 1 - tread;
      const z = DECK.z1 + 1 + tread;
      b.box(LADDER.x, LADDER.x + LADDER.w - 1, y, y, z, z, teak.light);
    }
    for (const x of [LADDER.x - 1, LADDER.x + LADDER.w]) {
      for (let tread = 0; tread <= STILTS; tread++) {
        const z = DECK.z1 + tread;
        b.box(x, x, floor - tread, floor + 3 - tread, z, z, teak.shade);
      }
    }

    pottedPlant(b, { x: DECK.x1 - 3, z: DECK.z1 - 3, y: floor + 1 });
    pottedPlant(b, { x: DECK.x0 + 1, z: DECK.z1 - 3, y: floor + 1 });
    b.box(RIGHT - 4, RIGHT - 1, floor + 1, floor + 3, FRONT + 3, FRONT + 4, teak.light);
    b.box(RIGHT - 4, RIGHT - 1, floor + 1, floor + 5, FRONT + 5, FRONT + 5, teak.light);
  },
});
