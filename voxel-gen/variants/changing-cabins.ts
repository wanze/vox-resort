import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { thatchRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

// Sand on sand is invisible, so the deck reads as laid on the beach.
const SLAB = { x: 0, z: 0, w: 32, d: 16, height: 2, stone: PALETTE.sand } as const;
const DECK = SLAB.height;
const FLOOR = DECK + 1;

const ROW = { x: 2, z: 2, w: 28, d: 9 } as const;
const FRONT = ROW.z + ROW.d - 1;
const WALL = 10;
const PLATE = FLOOR + WALL - 1;

// Two cabins, one per declared door, with the shower bay between them under the same roof.
const CABINS: readonly {
  readonly x0: number;
  readonly x1: number;
  readonly door: number;
  readonly paint: Ramp;
}[] = [
  { x0: 2, x1: 13, door: 6, paint: PALETTE.water },
  { x0: 18, x1: 29, door: 21, paint: PALETTE.bloom },
];
const BAY = { x0: 14, x1: 17 } as const;

export default defineModel({
  id: 'changing-cabins-b',
  label: 'Changing Cabins B',
  category: 'amenities',
  placement: { ground: 'beach' },
  venue: {
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 0.3 }],
    capacity: 2,
    dwellSeconds: { min: 60, max: 180 },
    doors: [
      { x: 8, z: FRONT, facing: 0 },
      { x: 23, z: FRONT, facing: 0 },
    ],
  },
  tiles: { x: 2, z: 1 },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, metal, slate, stucco, teak } = PALETTE;

    plinth(b, SLAB);
    // One tone, so the deck is a single quad from above.
    box(1, 30, DECK, DECK, 1, 14, teak.base);
    box(1, 30, DECK, DECK, 14, 14, teak.shade);

    for (const cabin of CABINS) {
      // Solid: a cavity gets its own inside surface and costs more than it saves.
      box(cabin.x0, cabin.x1, FLOOR, PLATE, ROW.z, FRONT, cabin.paint.light);
      box(cabin.x0, cabin.x1, FLOOR, FLOOR, ROW.z, FRONT, cabin.paint.shade);
      for (const x of [cabin.x0, cabin.x1]) {
        for (const z of [ROW.z, FRONT]) box(x, x, FLOOR, PLATE, z, z, stucco.light);
      }
      box(cabin.x0, cabin.x1, PLATE, PLATE, ROW.z, FRONT, stucco.light);

      const along = cabin.door;
      doorway(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: FLOOR,
        w: 4,
        h: 8,
        trim: stucco,
        timber: cabin.paint,
      });
      b.set(along + 3, FLOOR + 4, FRONT - 1, metal.light);
    }
    for (const [face, at] of [
      ['x-', ROW.x],
      ['x+', ROW.x + ROW.w - 1],
    ] as const) {
      shutteredWindow(b, {
        face,
        at,
        along: ROW.z + 3,
        y: FLOOR + 6,
        w: 3,
        h: 2,
        trim: stucco,
        shutters: false,
      });
    }

    box(BAY.x0, BAY.x1, FLOOR, PLATE, ROW.z, ROW.z + 1, teak.shade);
    box(BAY.x0, BAY.x1, FLOOR, PLATE, ROW.z + 1, ROW.z + 1, teak.light);
    box(BAY.x0, BAY.x1, DECK, DECK, ROW.z + 2, FRONT, slate.light);
    box(15, 16, FLOOR, PLATE - 1, ROW.z + 2, ROW.z + 2, metal.base);
    box(15, 16, PLATE - 1, PLATE - 1, ROW.z + 3, ROW.z + 4, metal.light);
    box(BAY.x0, BAY.x1, PLATE, PLATE, ROW.z, FRONT, stucco.light);

    // Towels on the bay's front rail are the one bright thing between the cabins.
    box(BAY.x0, BAY.x1, FLOOR + 7, FLOOR + 7, FRONT, FRONT, teak.deep);
    box(BAY.x0, BAY.x0 + 1, FLOOR + 4, FLOOR + 6, FRONT, FRONT, amber.base);
    box(BAY.x1, BAY.x1, FLOOR + 3, FLOOR + 6, FRONT, FRONT, bloom.light);

    thatchRoof(b, { ...ROW, y: PLATE + 1, overhang: 2, ridge: 'x' });
  },
});
