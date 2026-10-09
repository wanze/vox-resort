import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { leanTo } from '../parts/roof.ts';
import { plankRail } from '../parts/veranda.ts';
import { doorway, rubble, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const BODY = { x: 5, z: 2, w: 38, d: 15 } as const;
const FRONT = BODY.z + BODY.d - 1;
const LEFT = BODY.x;
const RIGHT = BODY.x + BODY.w - 1;

// The stone-clad end stands in for the rubble piers between the units in the reference.
const CLAD = 31;

const DECK = { x0: LEFT, x1: CLAD - 1, z0: FRONT + 1, z1: FRONT + 8 } as const;

// A metre on a rubble footing: the plot falls away, so the terrace sits proud of it.
const FOOTING = 4;

const STAIR = { z: DECK.z0 + 3, w: 4 } as const;

const DOOR = LEFT + 10;

export default defineModel({
  id: 'bungalow-c',
  label: 'Bungalow C',
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
    const { glass, metal, slate, stucco, teak, terracotta } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 48, d: 32, height: 2, stone: PALETTE.sand });

    const floor = ground + FOOTING;
    // Set back a voxel under the terrace so its white slab casts a line of shadow on the footing.
    rubble(b, { ...BODY, y: ground, h: FOOTING });
    rubble(b, {
      x: DECK.x0 + 1,
      z: DECK.z0,
      w: DECK.x1 - DECK.x0,
      d: DECK.z1 - DECK.z0,
      y: ground,
      h: FOOTING - 1,
    });
    b.box(LEFT, CLAD - 1, floor - 1, floor - 1, BODY.z, DECK.z1, stucco.light);
    b.box(DECK.x0, DECK.x1, floor, floor, DECK.z0, DECK.z1, teak.base);

    const plate = stuccoWall(b, {
      ...BODY,
      y: floor,
      storeys: 1,
      wall: { ...stucco, base: stucco.light },
      trim: stucco,
      skirting: 0,
      quoins: false,
    });
    rubble(b, { x: CLAD, z: BODY.z, w: RIGHT - CLAD + 1, d: BODY.d, y: floor, h: plate - floor });

    // A thick white fascia over a dark membrane: from above, the white rim is what reads as the reference.
    b.box(LEFT - 1, RIGHT + 1, plate, plate + 1, BODY.z - 1, FRONT + 1, stucco.light);
    b.box(LEFT, RIGHT, plate + 1, plate + 1, BODY.z, FRONT, terracotta.shade);

    const panel = { x0: RIGHT - 10, x1: RIGHT - 3, z: BODY.z + 2 } as const;
    b.box(panel.x0, panel.x1, plate + 2, plate + 2, panel.z, panel.z + 4, metal.base);
    for (let row = 0; row < 4; row++) {
      b.box(
        panel.x0,
        panel.x1,
        plate + 3 + row,
        plate + 3 + row,
        panel.z + 3 - row,
        panel.z + 3 - row,
        glass.deep,
      );
    }

    const sill = floor + 1;
    const shutters = { trim: stucco, timber: slate } as const;
    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: DOOR,
      y: sill,
      w: 4,
      h: 9,
      trim: stucco,
      timber: slate,
    });
    for (const along of [LEFT + 3, LEFT + 18]) {
      shutteredWindow(b, { ...shutters, face: 'z+', at: FRONT, along, y: sill, w: 4, h: 8 });
    }
    // Rolled down, as they are all afternoon: a slate panel rather than glass.
    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: CLAD + 4,
      y: sill + 2,
      w: 4,
      h: 6,
      glass: slate,
      trim: stucco,
      shutters: false,
    });
    shutteredWindow(b, {
      ...shutters,
      face: 'x-',
      at: LEFT,
      along: BODY.z + 6,
      y: sill + 2,
      w: 3,
      h: 5,
    });
    shutteredWindow(b, {
      ...shutters,
      face: 'x+',
      at: RIGHT,
      along: BODY.z + 6,
      y: sill + 2,
      w: 3,
      h: 5,
    });
    for (const along of [LEFT + 6, LEFT + 20]) {
      shutteredWindow(b, { ...shutters, face: 'z-', at: BODY.z, along, y: sill + 5, w: 3, h: 3 });
    }

    // Tucked under the fascia and falling a voxel every three towards the rail, like the tin roofs in the photo.
    const eaves = leanTo(b, {
      x: DECK.x0 - 1,
      z: DECK.z0,
      w: DECK.x1 - DECK.x0 + 3,
      d: DECK.z1 - DECK.z0 + 2,
      y: plate - 2,
    });
    // In line with a rail post, so the middle post does not stand in front of the door.
    for (const x of [DECK.x0, DECK.x0 + 15, DECK.x1]) {
      b.box(x, x, floor + 1, eaves, DECK.z1, DECK.z1, teak.shade);
    }

    const rail = { y: floor + 1 } as const;
    plankRail(b, { ...rail, x: DECK.x0, z: DECK.z1, w: DECK.x1 - DECK.x0 + 1, along: 'x' });
    plankRail(b, { ...rail, x: DECK.x0, z: DECK.z0, w: DECK.z1 - DECK.z0 + 1, along: 'z' });
    plankRail(b, { ...rail, x: DECK.x1, z: DECK.z0, w: STAIR.z - DECK.z0, along: 'z' });

    steps(b, {
      x: DECK.x1 + 1,
      z: STAIR.z,
      w: STAIR.w,
      y: floor - 1,
      treads: FOOTING,
      descends: 'x+',
      stone: teak,
    });

    pottedPlant(b, { x: LEFT + 2, z: DECK.z1 + 3, y: ground });
    b.box(DECK.x1 - 5, DECK.x1 - 3, floor + 1, floor + 2, DECK.z0 + 2, DECK.z0 + 4, teak.light);
  },
});
