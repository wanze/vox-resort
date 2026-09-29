import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { poolWater } from '../parts/pool.ts';
import { hipRoof } from '../parts/roof.ts';
import { arcade } from '../parts/veranda.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const W = 48;
const D = 32;
const X = W - 1;
const Z = D - 1;

const FLOOR = 3;

// Placed so the middle front arch sits on the door the venue declares.
const PAV = { x: 9, z: 5, w: 30, d: 24 } as const;
const PAV_X1 = PAV.x + PAV.w - 1;
const PAV_Z1 = PAV.z + PAV.d - 1;
const ARCH = { height: 8, rise: 3, pier: 3, skirting: 2 } as const;

const DAYBEDS = [11, 20] as const;

const LANTERN = PALETTE.amber.light;

const LANTERNS = [
  [17, DAYBEDS[0] + 2],
  [30, DAYBEDS[0] + 2],
  [17, DAYBEDS[1] + 2],
  [30, DAYBEDS[1] + 2],
] as const;

// On the west side, which the camera sees, as a narrow channel between the palms.
const POOL = { x: 2, z: 7, w: 5, d: 18 } as const;

export default defineModel({
  id: 'spa-pavilion-b',
  label: 'Spa Pavilion B',
  category: 'leisure',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  water: [PALETTE.water.base],
  seats: DAYBEDS.map((bz) => ({ x: 20, y: 7, z: bz + 2, facing: 1, pose: 'lie' }) as const),
  // Short throw: only the couch below needs light, and short lamps bake into less volume.
  lights: LANTERNS.map(
    ([x, z]) => ({ x, y: FLOOR + 11, z, color: LANTERN, intensity: 60, distance: 36 }) as const,
  ),
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.6 },
      { need: 'energy', amount: 0.5 },
    ],
    capacity: 10,
    dwellSeconds: { min: 1800, max: 5400 },
    price: 6,
    doors: [{ x: 23, z: D - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { foliage, grass, stone, stucco, teak } = PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: W, d: D });
    if (floor !== FLOOR) throw new Error('The plinth moved under the daybeds');
    // The flight is cut into the plinth's front edge, so its lower tread is a real step down.
    steps(b, { x: 18, z: D - 4, w: 12, y: FLOOR - 1, treads: 2, descends: 'z+' });
    for (let x = 18; x < 30; x++) {
      for (const z of [D - 2, D - 1]) b.del(x, FLOOR - 1, z);
    }
    box(PAV.x + 2, PAV_X1 - 2, FLOOR - 1, FLOOR - 1, PAV.z + 2, PAV_Z1 - 2, teak.base);

    // Arches on all four sides instead of posts and drapes: the same privacy from a whitewashed
    // shell, and the villa's loggia language.
    for (const z of [PAV.z, PAV_Z1 - 1]) {
      arcade(b, { ...ARCH, x: PAV.x, z, w: PAV.w, d: 2, y: FLOOR, along: 'x', bays: 3 });
    }
    let eaves = FLOOR;
    for (const x of [PAV.x, PAV_X1 - 1]) {
      eaves = arcade(b, { ...ARCH, x, z: PAV.z, w: 2, d: PAV.d, y: FLOOR, along: 'z', bays: 2 });
    }
    // One voxel of eave, not two: a deeper one hides the arch heads from 30 degrees.
    hipRoof(b, { ...PAV, y: eaves, overhang: 1 });

    for (const bz of DAYBEDS) {
      box(14, 26, FLOOR, 5, bz, bz + 4, teak.deep);
      box(14, 26, 6, 6, bz, bz + 4, stucco.light);
      box(14, 16, 7, 7, bz + 1, bz + 3, stucco.base);
    }
    box(19, 24, FLOOR, 4, 16, 19, teak.shade);
    box(20, 23, 5, 5, 17, 18, stone.light);

    for (const [x, z] of LANTERNS) {
      box(x, x, eaves - 2, eaves - 1, z, z, teak.deep);
      set(x, eaves - 3, z, LANTERN);
    }

    box(1, POOL.x + POOL.w + 1, FLOOR - 1, FLOOR - 1, POOL.z - 2, POOL.z + POOL.d + 1, teak.light);
    poolWater(b, { ...POOL, deck: FLOOR });

    // Potted palms in the corners, the crown kept to one flat layer: loose single-voxel
    // fronds are what this grid is worst at.
    const palm = (x: number, z: number): void => {
      box(x, x + 2, FLOOR, FLOOR + 1, z, z + 2, PALETTE.terracotta.shade);
      box(x, x + 2, FLOOR + 2, FLOOR + 2, z, z + 2, PALETTE.terracotta.base);
      box(x + 1, x + 1, FLOOR + 3, FLOOR + 11, z + 1, z + 1, teak.shade);
      const crown = FLOOR + 12;
      box(x, x + 2, crown, crown, z, z + 2, foliage.base);
      box(x - 1, x + 3, crown, crown, z + 1, z + 1, foliage.base);
      box(x + 1, x + 1, crown, crown, z - 1, z + 3, foliage.base);
      for (const [dx, dz] of [
        [-2, 1],
        [4, 1],
        [1, -2],
        [1, 4],
      ] as const) {
        set(x + dx, crown - 1, z + dz, foliage.base);
      }
      set(x + 1, crown + 1, z + 1, foliage.light);
    };
    for (const [x, z] of [
      [3, 2],
      [3, Z - 4],
      [X - 4, 2],
      [X - 4, Z - 4],
    ] as const) {
      palm(x, z);
    }

    box(PAV_X1 + 2, X - 1, FLOOR - 1, FLOOR - 1, 7, Z - 7, grass.base);
    box(PAV_X1 + 3, X - 2, FLOOR, FLOOR + 1, 9, Z - 9, foliage.base);
    for (const x of [14, 31]) pottedPlant(b, { x, z: Z - 2, y: FLOOR, size: 2 });
    box(POOL.x + POOL.w, POOL.x + POOL.w + 1, FLOOR, FLOOR + 1, 3, 4, stucco.light);
  },
});
