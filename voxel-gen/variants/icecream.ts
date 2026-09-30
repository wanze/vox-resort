import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const CART = { x0: 3, x1: 12, z0: 5, z1: 10 } as const;
const POLE = { x: 7, z: 7 } as const;
const GROUND = 2;

// Three abreast is all the front takes beside the A-board, so the fourth waits behind them.
const QUEUE = [
  { x: CART.x0, y: GROUND, z: CART.z1 + 3, facing: 2 },
  { x: CART.x0 + 3, y: GROUND, z: CART.z1 + 3, facing: 2 },
  { x: CART.x0 + 6, y: GROUND, z: CART.z1 + 3, facing: 2 },
  { x: CART.x0 + 2, y: GROUND, z: CART.z1 + 5, facing: 2 },
] as const;

// Eight wedges, alternating: each wedge is one flat region, so the stripes cost a
// handful of quads instead of one per voxel like a checkerboard would.
const WEDGES = [PALETTE.bloom.base, PALETTE.stucco.light] as const;

function wedgeAt(dx: number, dz: number): number {
  const turn = (Math.atan2(dz, dx) + Math.PI) / (Math.PI / 4);
  return WEDGES[Math.floor(turn) % WEDGES.length]!;
}

// Octagonal so the wedge seams fall on the axes and diagonals, where voxels draw a clean line.
const within = (dx: number, dz: number, r: number): boolean =>
  Math.max(Math.abs(dx), Math.abs(dz)) <= r && Math.abs(dx) + Math.abs(dz) <= r * 1.5;

export default defineModel({
  id: 'icecream-b',
  label: 'Ice Cream Cart B',
  category: 'amenities',
  tiles: { x: 1, z: 1 },
  venue: {
    shelter: 'open',
    role: 'food',
    satisfies: [
      { need: 'hunger', amount: 0.25 },
      { need: 'fun', amount: 0.15 },
    ],
    capacity: 4,
    dwellSeconds: { min: 120, max: 300 },
    price: 2,
    spots: QUEUE,
    doors: [{ x: 8, z: 12, facing: 0 }],
    litter: 0.06,
  },
  build: (b: VoxelBuilder) => {
    const { amber, bloom, foliage, glass, metal, stone, stucco, teak, water } = PALETTE;
    const ground = plinth(b, { x: 0, z: 0, w: 16, d: 16, height: 2 });
    if (ground !== GROUND) throw new Error('The plinth moved under the queue');

    const axle = ground + 2;
    // Spoked and open between the spokes: a solid disc reads as a door from this far off.
    for (const x of [CART.x0 - 1, CART.x1 + 1]) {
      const hub = CART.z0 + 2;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dz = -2; dz <= 2; dz++) {
          const rim = Math.max(Math.abs(dy), Math.abs(dz)) === 2 && Math.abs(dy) + Math.abs(dz) < 4;
          const spoke = dy === 0 || dz === 0;
          if (rim || spoke) b.set(x, axle + dy, hub + dz, rim ? teak.deep : teak.shade);
        }
      }
      b.set(x, axle, hub, metal.base);
    }
    b.box(CART.x0 + 7, CART.x0 + 7, ground, axle, CART.z1 - 1, CART.z1 - 1, metal.base);

    // Low enough that the counter sits at a guest's waist and the parasol just clears their head.
    const deck = ground + 2;
    b.box(CART.x0, CART.x1, deck, deck + 2, CART.z0, CART.z1, teak.base);
    b.box(CART.x0, CART.x1, deck, deck, CART.z0, CART.z1, teak.shade);
    b.box(CART.x0 + 1, CART.x1 - 1, deck + 1, deck + 1, CART.z1 + 1, CART.z1 + 1, stucco.light);
    const top = deck + 3;
    b.box(CART.x0 - 1, CART.x1 + 1, top, top, CART.z0 - 1, CART.z1 + 1, stone.light);

    // The handle is the one thing that says it is pushed rather than parked.
    b.box(CART.x1 + 2, CART.x1 + 3, top, top, CART.z0, CART.z0, metal.base);
    b.box(CART.x1 + 2, CART.x1 + 3, top, top, CART.z1, CART.z1, metal.base);
    b.box(CART.x1 + 3, CART.x1 + 3, top, top, CART.z0, CART.z1, metal.shade);

    const lid = top + 1;
    b.box(CART.x0, CART.x0 + 4, lid, lid + 2, CART.z0, CART.z0 + 4, stucco.light);
    b.box(CART.x0 + 1, CART.x0 + 3, lid + 2, lid + 2, CART.z0 + 1, CART.z0 + 3, glass.light);
    for (const [x, color] of [
      [CART.x0 + 1, bloom.light],
      [CART.x0 + 2, amber.light],
      [CART.x0 + 3, water.light],
    ] as const) {
      b.set(x, lid + 2, CART.z0 + 2, color);
    }

    b.box(CART.x1 - 3, CART.x1, lid, lid + 1, CART.z0 + 1, CART.z1 - 1, bloom.shade);
    b.box(CART.x1 - 3, CART.x1, lid + 2, lid + 2, CART.z0 + 1, CART.z1 - 1, stucco.light);
    for (const [x, color] of [
      [CART.x0 + 6, amber.base],
      [CART.x0 + 7, foliage.light],
    ] as const) {
      b.box(x, x, lid, lid + 1, CART.z1, CART.z1, color);
    }

    const pole = lid + 6;
    b.box(POLE.x, POLE.x, lid, pole, POLE.z, POLE.z, stucco.light);
    for (let dx = -7; dx <= 7; dx++) {
      for (let dz = -7; dz <= 7; dz++) {
        const x = POLE.x + dx;
        const z = POLE.z + dz;
        if (x < 0 || x > 15 || z < 0 || z > 15) continue;
        const wedge = wedgeAt(dx, dz);
        if (within(dx, dz, 6)) b.set(x, pole - 1, z, wedge);
        if (within(dx, dz, 4)) b.set(x, pole, z, wedge);
        if (within(dx, dz, 2)) b.set(x, pole + 1, z, wedge);
      }
    }
    b.set(POLE.x, pole + 2, POLE.z, teak.shade);

    // An A-board beside the cart, blank: a chalkboard with nothing on it.
    b.box(11, 14, ground, ground + 5, 14, 14, teak.shade);
    b.box(12, 13, ground + 2, ground + 4, 14, 14, metal.deep);
    b.box(11, 14, ground + 3, ground + 4, 13, 13, teak.shade);
  },
});
