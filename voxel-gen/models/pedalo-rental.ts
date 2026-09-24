// The boats are drawn from parts/boat.ts, the part sea/pedalo.ts uses on the water,
// so a boat on the rack and one taken out are the same boat.
import { PALETTE } from '../palette.ts';
import { PEDALO_BEAM, PEDALO_LENGTH, pedalo } from '../parts/boat.ts';
import { plinth } from '../parts/ground.ts';
import { thatchRoof } from '../parts/roof.ts';
import {
  awning,
  doorway,
  shutteredWindow,
  STOREY_VOXELS,
  stuccoWall,
  WINDOW_GLASS,
} from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const SLAB = { x: 0, z: 0, w: 32, d: 32, height: 2, stone: PALETTE.sand } as const;

const GROUND = SLAB.height;

const HUT = { x: 4, z: 3, w: 14, d: 10 } as const;

const FRONT = HUT.z + HUT.d - 1;

const RACK = [PEDALO_BEAM + 1, 16, 31 - PEDALO_BEAM] as const;
const RACK_Z = 31 - PEDALO_LENGTH;

export default defineModel({
  id: 'pedalo-rental',
  label: 'Pedalo Rental',
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
    doors: [{ x: HUT.x + 7, z: FRONT + 2, facing: 0 }],
  },
  tiles: { x: 2, z: 2 },
  windows: WINDOW_GLASS,
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { amber, bloom, stucco, teak, water } = PALETTE;

    plinth(b, SLAB);

    const eaves = stuccoWall(b, {
      x: HUT.x,
      z: HUT.z,
      w: HUT.w,
      d: HUT.d,
      y: GROUND,
      storeys: 1,
      wall: teak,
      trim: PALETTE.stone,
      skirting: 1,
    });
    thatchRoof(b, { ...HUT, y: eaves, overhang: 2 });

    const hatch = GROUND + 4;
    doorway(b, { face: 'z+', at: FRONT, along: HUT.x + 4, y: hatch, w: 6, h: 5, timber: teak });
    box(HUT.x + 3, HUT.x + 11, hatch - 1, hatch - 1, FRONT, FRONT + 2, teak.light);
    box(HUT.x + 3, HUT.x + 11, GROUND, hatch - 2, FRONT + 1, FRONT + 2, teak.shade);
    awning(b, {
      face: 'z+',
      at: FRONT,
      along: HUT.x + 2,
      w: 11,
      y: GROUND + STOREY_VOXELS - 2,
      reach: 3,
      canvas: bloom,
    });

    shutteredWindow(b, {
      face: 'x+',
      at: HUT.x + HUT.w - 1,
      along: HUT.z + 3,
      y: GROUND + 5,
      w: 3,
      h: 4,
      timber: teak,
    });

    box(HUT.x, HUT.x, GROUND + 4, GROUND + 8, HUT.z + 2, HUT.z + 6, stucco.light);
    for (const z of [HUT.z + 2, HUT.z + 6]) {
      box(HUT.x - 1, HUT.x - 1, GROUND + 5, GROUND + 8, z, z + 2, bloom.base);
      box(HUT.x - 1, HUT.x - 1, GROUND + 6, GROUND + 7, z + 1, z + 1, stucco.light);
    }

    for (const [index, x] of RACK.entries()) {
      pedalo(b, { x, z: RACK_Z, y: GROUND, trim: [water, bloom, amber][index]! });
    }

    const rail = GROUND + 6;
    for (const z of [HUT.z, HUT.z + 8]) box(24, 24, GROUND, rail, z, z, teak.base);
    box(24, 24, rail, rail, HUT.z, HUT.z + 8, teak.light);
    for (const z of [HUT.z + 1, HUT.z + 4, HUT.z + 7]) {
      box(24, 24, rail - 4, rail - 1, z, z, amber.base);
    }
  },
});
