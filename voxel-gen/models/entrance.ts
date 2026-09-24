// Symmetric front to back: there is a gate at each end of the promenade, turned opposite ways.
import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const NX = 63;
const NZ = 15;

// Two layers rather than the catalogue's three: the promenade runs straight through, and a
// three-layer plinth would be a step in the main street.
const SLAB = { x: 0, z: 0, w: NX + 1, d: NZ + 1, height: 2 } as const;

const GROUND = SLAB.height;

const ROAD = { x0: 16, x1: 47 } as const;

const FOOT = { x0: 2, x1: 15, z0: 1, z1: 14 } as const;
const SHAFT = { x0: 4, x1: 13, z0: 3, z1: 12 } as const;
const COURSES = [4, 10, 16, 22] as const;

const CORBEL = 26;
const BEAM = 28;
const CORNICE = 34;
const CAP = 36;

const FRIEZE = { z0: 4, z1: 11 } as const;

const NICHE = { x0: 8, x1: 9, y0: 18, y1: 20 } as const;
const BEACON = { x0: 7, x1: 10, z0: 6, z1: 9 } as const;

const LEAF = { z0: 4, z1: 11, bars: [4, 6, 8, 10] as const, height: 18 } as const;

const LANTERN = PALETTE.amber.light;

const mirror = (x: number): number => NX - x;

export default defineModel({
  id: 'entrance',
  label: 'Entrance',
  category: 'amenities',
  tiles: { x: 4, z: 1 },
  gateway: true,
  emissive: [LANTERN],
  lights: [
    { x: 8, y: CAP + 2, z: 8, color: LANTERN, intensity: 110, distance: 60 },
    { x: mirror(8), y: CAP + 2, z: 8, color: LANTERN, intensity: 110, distance: 60 },
    // Once per pier rather than per face: a lamp is baked, and two faces of one pier are one lamp.
    { x: 8, y: NICHE.y0 + 1, z: 8, color: LANTERN, intensity: 45, distance: 32 },
    { x: mirror(8), y: NICHE.y0 + 1, z: 8, color: LANTERN, intensity: 45, distance: 32 },
  ],
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { metal, stone, stucco, teak } = PALETTE;

    plinth(b, SLAB);

    box(ROAD.x0, ROAD.x1, GROUND - 1, GROUND - 1, 0, NZ, stone.light);

    const pier = (flip: boolean): void => {
      const at = (x: number): number => (flip ? mirror(x) : x);
      const [fx0, fx1] = [Math.min(at(FOOT.x0), at(FOOT.x1)), Math.max(at(FOOT.x0), at(FOOT.x1))];
      const [sx0, sx1] = [
        Math.min(at(SHAFT.x0), at(SHAFT.x1)),
        Math.max(at(SHAFT.x0), at(SHAFT.x1)),
      ];

      box(fx0, fx1, GROUND, GROUND + 1, FOOT.z0, FOOT.z1, stone.shade);
      box(sx0, sx1, GROUND + 2, CORBEL - 1, SHAFT.z0, SHAFT.z1, stone.base);
      for (const y of COURSES) box(sx0, sx1, y, y, SHAFT.z0, SHAFT.z1, stone.shade);

      const inner = flip ? at(SHAFT.x0) + 1 : at(SHAFT.x0) - 1;
      box(
        Math.min(inner, at(SHAFT.x0)),
        Math.max(inner, at(SHAFT.x0)),
        CORBEL,
        BEAM - 1,
        SHAFT.z0,
        SHAFT.z1,
        stone.light,
      );

      const [nx0, nx1] = [
        Math.min(at(NICHE.x0), at(NICHE.x1)),
        Math.max(at(NICHE.x0), at(NICHE.x1)),
      ];
      for (const [face, behind] of [
        [SHAFT.z1, SHAFT.z1 - 1],
        [SHAFT.z0, SHAFT.z0 + 1],
      ] as const) {
        for (let x = nx0; x <= nx1; x++) {
          for (let y = NICHE.y0; y <= NICHE.y1; y++) b.del(x, y, face);
        }
        box(nx0, nx1, NICHE.y0, NICHE.y1, behind, behind, LANTERN);
      }

      const [bx0, bx1] = [
        Math.min(at(BEACON.x0), at(BEACON.x1)),
        Math.max(at(BEACON.x0), at(BEACON.x1)),
      ];
      box(bx0, bx1, CAP + 1, CAP + 1, BEACON.z0, BEACON.z1, metal.deep);
      box(bx0 + 1, bx1 - 1, CAP + 2, CAP + 3, BEACON.z0 + 1, BEACON.z1 - 1, LANTERN);
      box(bx0, bx1, CAP + 4, CAP + 4, BEACON.z0, BEACON.z1, metal.deep);
    };
    pier(false);
    pier(true);

    box(SHAFT.x0, mirror(SHAFT.x0), BEAM, BEAM, SHAFT.z0, SHAFT.z1, stone.shade);
    box(SHAFT.x0, mirror(SHAFT.x0), BEAM + 1, CORNICE - 1, FRIEZE.z0, FRIEZE.z1, stone.base);
    box(FOOT.x0, mirror(FOOT.x0), CORNICE, CAP - 1, FOOT.z0 + 1, FOOT.z1 - 1, stone.light);
    box(SHAFT.x0, mirror(SHAFT.x0), CAP, CAP, SHAFT.z0, SHAFT.z1, stone.shade);

    for (const [face, behind] of [
      [FRIEZE.z1, FRIEZE.z1 - 1],
      [FRIEZE.z0, FRIEZE.z0 + 1],
    ] as const) {
      box(18, mirror(18), BEAM + 1, CORNICE - 1, face, face, teak.shade);
      for (let x = 20; x <= mirror(20); x++) {
        for (let y = BEAM + 2; y <= CORNICE - 2; y++) b.del(x, y, face);
      }
      box(20, mirror(20), BEAM + 2, CORNICE - 2, behind, behind, stucco.light);
    }

    // Single-voxel bars are normally built solid, but a wrought-iron gate is bars, and a leaf drawn as
    // a panel would be a wall standing in the carriageway.
    const leaf = (flip: boolean): void => {
      const x0 = flip ? mirror(ROAD.x0 - 1) - 1 : ROAD.x0 - 2;
      const x1 = x0 + 1;
      const top = GROUND + LEAF.height;
      for (const z of LEAF.bars) box(x0, x1, GROUND, top - 2, z, z, metal.deep);
      box(x0, x1, GROUND, top - 2, LEAF.z1, LEAF.z1, metal.deep);
      for (const y of [GROUND, GROUND + 7]) box(x0, x1, y, y, LEAF.z0, LEAF.z1, metal.deep);
      box(x0, x1, top - 1, top, LEAF.z0, LEAF.z1, metal.shade);
      for (const z of LEAF.bars) box(x0, x1, top + 1, top + 1, z, z, metal.shade);
    };
    leaf(false);
    leaf(true);

    for (const x of [ROAD.x0, mirror(ROAD.x0) - 2]) {
      for (const z of [0, NZ - 2]) pottedPlant(b, { x, z, y: GROUND, size: 3 });
    }
  },
});
