import { PALETTE } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const W = 48;
const D = 32;
const X = W - 1;
const Z = D - 1;

const FLOOR = 3;

const FRAME = { x: 5, z: 5, w: 38, d: 22 } as const;

const HEAD = FLOOR + 12;
const PLATE = HEAD + 1;

const DAYBEDS = [11, 20] as const;

// Nothing else on this model is amber, so nothing else reads as lit.
const LANTERN = PALETTE.amber.light;

const LANTERNS = [
  [17, DAYBEDS[0] + 2],
  [30, DAYBEDS[0] + 2],
  [17, DAYBEDS[1] + 2],
  [30, DAYBEDS[1] + 2],
] as const;

export default defineModel({
  id: 'spa-pavilion',
  label: 'Spa Pavilion',
  category: 'leisure',
  tiles: { x: 3, z: 2 },
  emissive: [LANTERN],
  seats: DAYBEDS.map((bz) => ({ x: 20, y: 7, z: bz + 2, facing: 1, pose: 'lie' }) as const),
  // Short throw on purpose: only the couch below needs light, and the plot stands six of these,
  // so four short lamps bake into less volume than two long ones.
  lights: LANTERNS.map(
    ([x, z]) => ({ x, y: PLATE - 2, z, color: LANTERN, intensity: 60, distance: 36 }) as const,
  ),
  venue: {
    role: 'activity',
    satisfies: [
      { need: 'fun', amount: 0.6 },
      { need: 'energy', amount: 0.5 },
    ],
    capacity: 10,
    dwellSeconds: { min: 1800, max: 5400 },
    doors: [{ x: 23, z: D - 1, facing: 0 }],
  },
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { foliage, stone, stucco, teak, terracotta } = PALETTE;

    const floor = plinth(b, { x: 0, z: 0, w: W, d: D });
    if (floor !== FLOOR) throw new Error('The plinth moved under the daybeds');
    steps(b, { x: 18, z: D - 4, w: 12, y: FLOOR - 1, treads: 2, descends: 'z+' });

    box(
      FRAME.x,
      FRAME.x + FRAME.w - 1,
      FLOOR - 1,
      FLOOR - 1,
      FRAME.z,
      FRAME.z + FRAME.d - 1,
      teak.base,
    );

    const posts = [
      [FRAME.x, FRAME.z],
      [FRAME.x, FRAME.z + FRAME.d - 2],
      [FRAME.x + FRAME.w - 2, FRAME.z],
      [FRAME.x + FRAME.w - 2, FRAME.z + FRAME.d - 2],
    ] as const;
    for (const [x, z] of posts) box(x, x + 1, FLOOR, HEAD, z, z + 1, teak.shade);
    box(FRAME.x, FRAME.x + FRAME.w - 1, PLATE, PLATE, FRAME.z, FRAME.z + 1, teak.deep);
    box(
      FRAME.x,
      FRAME.x + FRAME.w - 1,
      PLATE,
      PLATE,
      FRAME.z + FRAME.d - 2,
      FRAME.z + FRAME.d - 1,
      teak.deep,
    );
    box(FRAME.x, FRAME.x + 1, PLATE, PLATE, FRAME.z, FRAME.z + FRAME.d - 1, teak.deep);
    box(
      FRAME.x + FRAME.w - 2,
      FRAME.x + FRAME.w - 1,
      PLATE,
      PLATE,
      FRAME.z,
      FRAME.z + FRAME.d - 1,
      teak.deep,
    );

    hipRoof(b, { ...FRAME, y: PLATE + 1, overhang: 2, tile: terracotta });

    // Flat panels with folded edges: a column-by-column weave came out as 32 rectangles a face.
    const drape = (wall: 'x' | 'z', across: number, along: number, width: number): void => {
      for (let step = 0; step < width; step++) {
        const fold = step === 0 || step === width - 1;
        const x = wall === 'x' ? across : along + step;
        const z = wall === 'z' ? across : along + step;
        box(x, x, FLOOR + 1, HEAD, z, z, fold ? stucco.base : stucco.light);
      }
    };

    for (let x = FRAME.x + 2; x + 5 <= FRAME.x + FRAME.w - 3; x += 8) drape('z', FRAME.z + 1, x, 6);
    for (let z = FRAME.z + 2; z + 5 <= FRAME.z + FRAME.d - 3; z += 8) drape('x', FRAME.x + 1, z, 6);

    for (const bz of DAYBEDS) {
      box(14, 33, FLOOR, 5, bz, bz + 4, teak.deep);
      box(14, 33, 6, 6, bz, bz + 4, stucco.light);
      box(14, 17, 7, 7, bz + 1, bz + 3, stucco.base);
    }

    box(20, 27, FLOOR, 5, 16, 19, teak.shade);
    box(21, 26, 6, 6, 16, 19, stucco.light);

    for (const [x, z] of LANTERNS) {
      box(x, x, PLATE - 1, PLATE - 1, z, z, teak.deep);
      set(x, PLATE - 2, z, LANTERN);
    }

    // The crown stays one flat layer: loose single-voxel fronds are what this grid is worst at.
    const palm = (x: number, z: number): void => {
      box(x, x + 2, FLOOR, FLOOR + 1, z, z + 2, terracotta.shade);
      box(x, x + 2, FLOOR + 2, FLOOR + 2, z, z + 2, terracotta.base);
      box(x + 1, x + 1, FLOOR + 3, FLOOR + 9, z + 1, z + 1, teak.shade);
      const crown = FLOOR + 10;
      box(x, x + 2, crown, crown, z, z + 2, foliage.base);
      box(x - 1, x + 3, crown, crown, z + 1, z + 1, foliage.base);
      box(x + 1, x + 1, crown, crown, z - 1, z + 3, foliage.base);
      set(x + 1, crown + 1, z + 1, foliage.light);
    };

    for (const [x, z] of [
      [1, 1],
      [1, Z - 3],
      [X - 3, 1],
      [X - 3, Z - 3],
    ] as const) {
      palm(x, z);
    }

    for (const x of [15, 31]) pottedPlant(b, { x, z: Z - 2, y: FLOOR, size: 2, leaf: foliage });

    for (const [x, z] of posts) box(x - 1, x + 2, FLOOR - 1, FLOOR - 1, z - 1, z + 2, stone.shade);
  },
});
