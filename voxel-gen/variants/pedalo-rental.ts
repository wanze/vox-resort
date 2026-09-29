// The boats are drawn from parts/boat.ts, the part sea/pedalo.ts uses on the water,
// so a boat on the beach and one taken out are the same boat.
import { PALETTE } from '../palette.ts';
import { PEDALO_BEAM, PEDALO_LENGTH, pedalo } from '../parts/boat.ts';
import { plinth } from '../parts/ground.ts';
import { gableRoof } from '../parts/roof.ts';
import { awning, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 32, d: 32, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const HUT = { x: 4, z: 3, w: 14, d: 10 } as const;
const FRONT = HUT.z + HUT.d - 1;
const LEFT = HUT.x;
const RIGHT = HUT.x + HUT.w - 1;

const HATCH = { along: HUT.x + 3, w: 8, h: 5 } as const;

// Nose to the sea, side by side along the front, as they are left on a beach.
const FLEET = [PEDALO_BEAM + 1, 15, 30 - PEDALO_BEAM] as const;
const FLEET_Z = 31 - PEDALO_LENGTH;

const FLAG = { x: 28, z: 4 } as const;

export default defineModel({
  id: 'pedalo-rental-b',
  label: 'Pedalo Rental B',
  category: 'leisure',
  placement: { ground: 'shore', perResort: { min: 1, max: 1 } },
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.3 },
    ],
    capacity: 8,
    dwellSeconds: { min: 1200, max: 2700 },
    price: 4,
    doors: [{ x: HUT.x + 7, z: FRONT + 2, facing: 0 }],
  },
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, foliage, stone, stucco, teak, water } = PALETTE;

    plinth(b, SLAB);
    box(1, 30, GROUND - 1, GROUND - 1, FRONT + 1, FLEET_Z - 2, teak.light);

    // A whitewashed boathouse under a painted tin roof: blue so it reads as the sea's building.
    const eaves = stuccoWall(b, { ...HUT, y: GROUND, storeys: 1, trim: stone, skirting: 1 });
    gableRoof(b, { ...HUT, y: eaves, ridge: 'x', tile: water });

    shutteredWindow(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along,
      y: GROUND + 4,
      w: HATCH.w,
      h: HATCH.h,
      glass: teak,
      shutters: false,
    });
    box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      GROUND + 3,
      GROUND + 3,
      FRONT,
      FRONT + 2,
      teak.light,
    );
    box(
      HATCH.along - 1,
      HATCH.along + HATCH.w,
      GROUND,
      GROUND + 2,
      FRONT + 1,
      FRONT + 1,
      teak.shade,
    );
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HATCH.along - 1,
      w: HATCH.w + 2,
      y: GROUND + 10,
      reach: 3,
      canvas: stucco,
    });
    for (const [face, at] of [
      ['x-', LEFT],
      ['x+', RIGHT],
    ] as const) {
      shutteredWindow(b, { face, at, along: HUT.z + 2, y: GROUND + 4, w: 3, h: 4, timber: water });
    }

    // A lifebuoy on the side the camera sees; four tones would be dithering, two are its bands.
    const ring = { z: HUT.z + 6, y: GROUND + 3 } as const;
    for (const [dz, dy] of [
      [0, 1],
      [0, 2],
      [3, 1],
      [3, 2],
      [1, 0],
      [2, 0],
      [1, 3],
      [2, 3],
    ] as const) {
      b.set(LEFT - 1, ring.y + dy, ring.z + dz, dy === 0 || dy === 3 ? bloom.base : stucco.light);
    }

    for (const [index, x] of FLEET.entries()) {
      box(
        x - 2,
        x - 2,
        GROUND - 1,
        GROUND - 1,
        FLEET_Z + 1,
        FLEET_Z + PEDALO_LENGTH - 2,
        teak.shade,
      );
      box(
        x + 2,
        x + 2,
        GROUND - 1,
        GROUND - 1,
        FLEET_Z + 1,
        FLEET_Z + PEDALO_LENGTH - 2,
        teak.shade,
      );
      pedalo(b, { x, z: FLEET_Z, y: GROUND, trim: [bloom, water, foliage][index]! });
    }

    // Life jackets on a rail beside the hut, then the flag the beach finds the rental by.
    const rail = GROUND + 7;
    for (const x of [RIGHT + 3, RIGHT + 9])
      box(x, x, GROUND, rail, HUT.z + 1, HUT.z + 1, teak.base);
    box(RIGHT + 3, RIGHT + 9, rail, rail, HUT.z + 1, HUT.z + 1, teak.light);
    for (const x of [RIGHT + 4, RIGHT + 6, RIGHT + 8]) {
      box(x, x, rail - 4, rail - 1, HUT.z + 1, HUT.z + 1, amber.base);
    }
    box(FLAG.x, FLAG.x, GROUND, GROUND + 22, FLAG.z, FLAG.z, stucco.light);
    box(FLAG.x - 5, FLAG.x - 1, GROUND + 18, GROUND + 21, FLAG.z, FLAG.z, bloom.base);
    box(FLAG.x - 5, FLAG.x - 1, GROUND + 19, GROUND + 20, FLAG.z, FLAG.z, stucco.light);
  },
});
