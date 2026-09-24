// Wider rather than deeper so it fits the shelf on top of the dune. Walls and
// thatch are flat: dithering them defeated the mesher's merge (6 070 voxels cost
// 5 440 triangles), so variation comes from geometry instead.
import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { thatchRoof } from '../parts/roof.ts';
import { balustrade } from '../parts/veranda.ts';
import { doorway, shutteredWindow, stuccoWall, WINDOW_GLASS } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const HUT = { x: 6, z: 3, w: 36, d: 14 } as const;
const FRONT = HUT.z + HUT.d - 1;
const LEFT = HUT.x;
const RIGHT = HUT.x + HUT.w - 1;

// The hut is wide and shallow so the hipped roof has a ridge for the pole to run on.
const DECK = { z: FRONT + 1, d: 6 } as const;
const BRINK = DECK.z + DECK.d - 1;

const STILTS = 3;

export default defineModel({
  id: 'bungalow',
  label: 'Bungalow',
  category: 'lodging',
  tiles: { x: 3, z: 2 },
  windows: WINDOW_GLASS,
  venue: {
    role: 'lodging',
    capacity: 4,
    beds: 4,
    dwellSeconds: { min: 25_200, max: 32_400 },
    doors: [{ x: HUT.x + 18, z: FRONT, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const sand = plinth(b, { x: 0, z: 0, w: 48, d: 32, height: 2, stone: PALETTE.sand });

    const floor = sand + STILTS;
    for (const x of [HUT.x, HUT.x + 17, RIGHT - 1]) {
      for (const z of [HUT.z, FRONT - 1, BRINK - 1]) {
        b.box(x, x + 1, sand, floor - 1, z, z + 1, PALETTE.teak.shade);
      }
    }

    b.box(HUT.x, RIGHT, floor, floor, HUT.z, BRINK, PALETTE.teak.base);
    b.box(HUT.x, RIGHT, floor, floor, BRINK, BRINK, PALETTE.teak.shade);
    for (const x of [HUT.x, RIGHT]) {
      b.box(x, x, floor, floor, DECK.z, BRINK, PALETTE.teak.shade);
    }

    const plate = stuccoWall(b, {
      ...HUT,
      y: floor + 1,
      storeys: 1,
      wall: PALETTE.teak,
      trim: PALETTE.teak,
      skirting: 0,
    });
    thatchRoof(b, { ...HUT, d: HUT.d + DECK.d, y: plate });

    // One plane rather than boards: two quads a face instead of one per board.
    const sill = floor + 4;
    b.box(HUT.x, RIGHT, sill, sill, HUT.z, FRONT, PALETTE.teak.light);

    doorway(b, {
      face: 'z+',
      at: FRONT,
      along: HUT.x + 16,
      y: floor + 1,
      w: 4,
      h: 9,
      trim: PALETTE.teak,
    });
    for (const along of [HUT.x + 4, HUT.x + 10, RIGHT - 12, RIGHT - 6]) {
      shutteredWindow(b, {
        face: 'z+',
        at: FRONT,
        along,
        y: sill + 1,
        w: 3,
        trim: PALETTE.teak,
        shutters: false,
      });
    }
    for (const along of [HUT.z + 5]) {
      for (const face of ['x-', 'x+'] as const) {
        shutteredWindow(b, {
          face,
          at: face === 'x-' ? LEFT : RIGHT,
          along,
          y: sill + 1,
          w: 3,
          trim: PALETTE.teak,
          shutters: false,
        });
      }
    }
    for (const along of [HUT.x + 6, HUT.x + 16, RIGHT - 8]) {
      shutteredWindow(b, {
        face: 'z-',
        at: HUT.z,
        along,
        y: sill + 1,
        w: 3,
        trim: PALETTE.teak,
        shutters: false,
      });
    }

    // The posts go on last so the rail stops against them rather than painting over them.
    const rail = floor + 1;
    for (const x of [HUT.x, RIGHT - 14]) {
      balustrade(b, { x, z: BRINK, y: rail, w: 15, along: 'x', rail: PALETTE.teak });
    }
    for (const x of [HUT.x, RIGHT]) {
      balustrade(b, { x, z: DECK.z, y: rail, w: DECK.d, along: 'z', rail: PALETTE.teak });
      b.box(x, x, rail, plate - 1, BRINK, BRINK, PALETTE.teak.light);
    }

    steps(b, {
      x: HUT.x + 15,
      z: BRINK + 1,
      w: 6,
      y: floor,
      treads: 4,
      descends: 'z+',
      stone: PALETTE.teak,
    });

    const { amber, stucco, teak } = PALETTE;
    const head = BRINK + 3;
    for (const x of [HUT.x + 3, RIGHT - 6]) {
      b.box(x, x + 3, sand, sand, head, head + 5, teak.shade);
      b.box(x, x + 3, sand + 1, sand + 1, head, head + 5, stucco.light);
      b.box(x, x + 3, sand + 2, sand + 2, head + 3, head + 3, amber.base);
      b.box(x, x + 3, sand + 2, sand + 3, head, head, stucco.light);
      b.box(x, x + 3, sand + 4, sand + 4, head, head, teak.base);
    }
    parasol(b, { x: HUT.x + 10, z: head + 3, y: sand });
    pottedPlant(b, { x: HUT.x + 22, z: head + 1, y: sand });
  },
});
