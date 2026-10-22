import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { oleander, picnicTable } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { plankRail, SLATS } from '../parts/veranda.ts';
import {
  doorway,
  LOUVRES,
  rubble,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 9, z: 3, w: 30, d: 22 } as const;
const FRONT = BODY.z + BODY.d - 1;

// Stone-clad ends and a middle pier run the full depth; the loggias sit between them.
const PIERS = [
  { x0: 3, x1: 8 },
  { x0: 22, x1: 25 },
  { x0: 39, x1: 44 },
] as const;
const BAYS = [
  { x0: 9, x1: 21 },
  { x0: 26, x1: 38 },
] as const;
const LOGGIA = { z0: FRONT + 1, z1: FRONT + 8 } as const;
const BACK = 2;

const DOOR_W = 4;
const doorAt = (bay: (typeof BAYS)[number]): number => bay.x0 + 8;

export default defineModel({
  id: 'house-c',
  label: 'House C',
  category: 'lodging',
  tiles: { x: 3, z: 3 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 6,
    beds: 6,
    dwellSeconds: { min: 25_200, max: 32_400 },
    price: 22,
    doors: BAYS.map((bay) => ({ x: doorAt(bay) + 2, z: FRONT, facing: 0 })),
  },
  build: (b: VoxelBuilder) => {
    const { grass, sand, stone, stucco, teak } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 48, d: 48 });

    const eaves = stuccoWall(b, {
      ...BODY,
      y: ground,
      storeys: 2,
      wall: stucco,
      trim: stucco,
      skirting: 1,
      quoins: false,
    });
    const upper = ground + STOREY_VOXELS + 1;
    for (const { x0, x1 } of PIERS) {
      rubble(b, {
        x: x0,
        z: BACK,
        w: x1 - x0 + 1,
        d: LOGGIA.z1 - BACK + 1,
        y: ground,
        h: eaves - ground,
        stone: sand,
      });
    }

    // Thick white slabs proud of the piers: the floor lines are what make the photo read.
    for (const { x0, x1 } of BAYS) {
      b.box(x0, x1, ground, ground, LOGGIA.z0, LOGGIA.z1, stucco.light);
      b.box(x0, x1, upper - 2, upper - 1, LOGGIA.z0, LOGGIA.z1 + 1, stucco.light);
      b.box(x0, x1, eaves - 2, eaves - 1, LOGGIA.z1, LOGGIA.z1 + 1, stucco.light);
    }

    const shutters = { trim: stucco, timber: LOUVRES } as const;
    for (const bay of BAYS) {
      const door = doorAt(bay);
      for (const y of [ground + 1, upper]) {
        doorway(b, {
          face: 'z+',
          at: FRONT,
          along: door,
          y,
          w: DOOR_W,
          trim: stucco,
          timber: LOUVRES,
        });
        shutteredWindow(b, {
          ...shutters,
          face: 'z+',
          at: FRONT,
          along: bay.x0 + 2,
          y: y + 3,
          w: 3,
        });
      }
    }
    for (const y of [ground + 4, upper + 3]) {
      for (const [face, at] of [
        ['x-', PIERS[0].x0],
        ['x+', PIERS[2].x1],
      ] as const) {
        shutteredWindow(b, { ...shutters, face, at, along: BACK + 6, y, w: 3 });
        shutteredWindow(b, { ...shutters, face, at, along: LOGGIA.z0 + 2, y, w: 3 });
      }
      for (const along of [BODY.x + 4, BODY.x + BODY.w - 7]) {
        shutteredWindow(b, { ...shutters, face: 'z-', at: BODY.z, along, y, w: 3 });
      }
    }

    const rail = { along: 'x', rail: SLATS, pitch: 64 } as const;
    for (const bay of BAYS) {
      const gate = doorAt(bay);
      plankRail(b, { ...rail, x: bay.x0, z: LOGGIA.z1 + 1, y: upper, w: bay.x1 - bay.x0 + 1 });
      plankRail(b, { ...rail, x: bay.x0, z: LOGGIA.z1, y: ground + 1, w: gate - bay.x0 - 1 });
    }

    const roof = {
      x: PIERS[0].x0,
      z: BACK,
      w: PIERS[2].x1 - PIERS[0].x0 + 1,
      d: LOGGIA.z1 + 2 - BACK + 1,
      y: eaves,
      step: 3,
    } as const;
    hipRoof(b, { ...roof, gutter: teak });
    b.box(PIERS[0].x0 - 1, PIERS[0].x0 - 1, ground, eaves - 2, LOGGIA.z1, LOGGIA.z1, teak.deep);

    const garden = roof.z + roof.d + 2;
    b.box(1, 46, ground - 1, ground - 1, garden, 46, grass.base);
    for (const bay of BAYS) {
      const gate = doorAt(bay);
      b.box(gate, gate + DOOR_W - 1, ground - 1, ground - 1, LOGGIA.z1 + 1, 47, stone.light);
    }

    // The oleander at the corner of the photo, kept low so it hides no door.
    oleander(b, { x: 40, z: garden + 3, y: ground });

    picnicTable(b, { x: 19, z: garden + 4, y: ground });
  },
});
