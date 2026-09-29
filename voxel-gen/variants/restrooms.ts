import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { flowerBox, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 2, z: 2, w: 28, d: 10 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const DOORS = [7, 21] as const;
const TROUGH = { x0: 13, x1: 18 } as const;

export default defineModel({
  id: 'restrooms-b',
  label: 'Restrooms B',
  category: 'amenities',
  tiles: { x: 2, z: 1 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'service',
    satisfies: [{ need: 'hygiene', amount: 1 }],
    capacity: 4,
    dwellSeconds: { min: 60, max: 180 },
    doors: [
      { x: 9, z: FRONT, facing: 0 },
      { x: 23, z: FRONT, facing: 0 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { bloom, foliage, glass, metal, slate, stone, teak, terracotta } = PALETTE;

    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 16 });
    // A tall slate dado, the reference's darker lower band, which is also what takes the splashing.
    const eaves = stuccoWall(b, { ...BODY, y: ground, storeys: 1, trim: slate, skirting: 4 });
    box(LEFT, RIGHT, ground + 4, ground + 4, BODY.z, FRONT, stone.light);
    hipRoof(b, { ...BODY, y: eaves, overhang: 2, tile: terracotta });

    // A round sign on each leaf, as in the reference: blue and red stand in for the pictograms.
    const signs: readonly Ramp[] = [glass, bloom];
    for (const [index, along] of DOORS.entries()) {
      doorway(b, { face: 'z+', at: FRONT, along, y: ground, w: 4, h: 8, timber: teak });
      box(along + 1, along + 2, ground + 9, ground + 9, FRONT, FRONT, glass.deep);
      const sign = signs[index]!;
      box(along + 1, along + 2, ground + 5, ground + 6, FRONT - 1, FRONT - 1, sign.light);
    }

    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: TROUGH.x0,
      y: ground + 7,
      w: TROUGH.x1 - TROUGH.x0 + 1,
      h: 3,
      shutters: false,
    });
    box(TROUGH.x0, TROUGH.x1, ground, ground + 2, FRONT + 1, FRONT + 2, stone.base);
    box(TROUGH.x0, TROUGH.x1, ground + 3, ground + 3, FRONT + 1, FRONT + 2, stone.light);
    box(TROUGH.x0 + 1, TROUGH.x1 - 1, ground + 3, ground + 3, FRONT + 2, FRONT + 2, glass.light);
    for (const x of [TROUGH.x0 + 1, TROUGH.x1 - 1]) {
      box(x, x, ground + 4, ground + 5, FRONT + 1, FRONT + 1, metal.light);
    }

    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: BODY.z + 4, y: ground + 7, w: 3, h: 3 });
    }

    flowerBox(b, {
      x: 0,
      z: BODY.z + 1,
      y: ground,
      w: 8,
      along: 'z',
      blooms: [foliage.base, bloom.base, foliage.light],
    });
    pottedPlant(b, { x: 1, z: 13, y: ground });
    pottedPlant(b, { x: 29, z: 13, y: ground });
  },
});
