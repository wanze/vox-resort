import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { plankRail, SLATS } from '../parts/veranda.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 4, z: 4, w: 24, d: 29 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

const LOGGIA = { x0: 9, x1: 22, z0: FRONT + 1, z1: FRONT + 7 } as const;
const DOOR = LOGGIA.x0 + 7;
const DOOR_W = 4;

// Stone where house C has its piers: the corners, and a pilaster halfway along each side.
const STONES = [
  { x0: 3, x1: 6, z0: 3, z1: 7 },
  { x0: 25, x1: 28, z0: 3, z1: 7 },
  { x0: 3, x1: 4, z0: 17, z1: 20 },
  { x0: 27, x1: 28, z0: 17, z1: 20 },
  { x0: 3, x1: LOGGIA.x0 - 1, z0: FRONT - 3, z1: LOGGIA.z1 },
  { x0: LOGGIA.x1 + 1, x1: 28, z0: FRONT - 3, z1: LOGGIA.z1 },
] as const;

export default defineModel({
  id: 'cottage-c',
  label: 'Cottage C',
  category: 'lodging',
  tiles: { x: 2, z: 3 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 22,
    doors: [{ x: DOOR + 2, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const { grass, sand, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 32, d: 48 });

    const eaves = stuccoWall(b, {
      ...BODY,
      y: ground,
      storeys: 1,
      wall: stucco,
      trim: stucco,
      skirting: 1,
      quoins: false,
    });
    for (const { x0, x1, z0, z1 } of STONES) {
      const box = { x: x0, z: z0, w: x1 - x0 + 1, d: z1 - z0 + 1 };
      rubble(b, { ...box, y: ground, h: eaves - ground, stone: sand });
    }

    b.box(LOGGIA.x0, LOGGIA.x1, ground, ground, LOGGIA.z0, LOGGIA.z1 + 1, stucco.light);
    b.box(LOGGIA.x0, LOGGIA.x1, eaves - 2, eaves - 1, LOGGIA.z1, LOGGIA.z1 + 1, stucco.light);

    const shutters = { trim: stucco, timber: LOUVRES } as const;
    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR,
      y: ground + 1,
      w: DOOR_W,
      trim: stucco,
      timber: LOUVRES,
    });
    shutteredWindow(b, { ...shutters, face: 'z+', at: FRONT, along: LOGGIA.x0 + 2, y: ground + 4 });
    for (const along of [11, 24]) {
      shutteredWindow(b, { ...shutters, face: 'x-', at: LEFT, along, y: ground + 4 });
      shutteredWindow(b, { ...shutters, face: 'x+', at: RIGHT, along, y: ground + 4 });
    }
    for (const along of [11, 18]) {
      shutteredWindow(b, { ...shutters, face: 'z-', at: BODY.z, along, y: ground + 4 });
    }

    plankRail(b, {
      x: LOGGIA.x0,
      z: LOGGIA.z1,
      y: ground + 1,
      w: DOOR - LOGGIA.x0 - 1,
      along: 'x',
      rail: SLATS,
      pitch: 64,
    });

    const roof = { x: 3, z: 3, w: 26, d: LOGGIA.z1 + 1 - 3 + 1, y: eaves, step: 3 } as const;
    hipRoof(b, { ...roof, gutter: teak });
    b.box(2, 2, ground, eaves - 2, LOGGIA.z1, LOGGIA.z1, teak.deep);

    const garden = roof.z + roof.d + 2;
    b.box(1, 30, ground - 1, ground - 1, garden, 46, grass.base);
    b.box(DOOR, DOOR + DOOR_W - 1, ground - 1, ground - 1, LOGGIA.z1 + 2, 47, stone.light);
    for (const x of [DOOR - 3, DOOR + DOOR_W + 2]) pottedPlant(b, { x, z: garden + 1, y: ground });
  },
});
