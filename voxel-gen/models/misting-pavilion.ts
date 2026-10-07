import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { pottedPlant } from '../parts/props.ts';
import { defineModel, type ModelSeat, type QuarterTurns, type VoxelBuilder } from '../voxelgen.ts';

const N = 31;
const GROUND = 2;

const POSTS = [2, N - 3] as const;
const BEAM = 15;
const SLATS = { y: 16, width: 2, gap: 2 } as const;
const PIPE = BEAM - 1;
const NOZZLE_EVERY = 6;

// Between the middle four columns, as the fountain's: an octagon reads round from 30 degrees.
const CENTRE = (N + 1) / 2;
const BASIN = { reach: 5, chamfer: 2, rim: 1 } as const;
const SPOUT = { x0: 15, x1: 16, top: GROUND + 5 } as const;

// As the massage tent's bench: a backrest, then a plank three deep with the hips on its middle.
const PLANK = GROUND + 1;
const HIPS = PLANK + 1;
const BACK = 5;
const ALONG = [12, 16, 20] as const;

// Each bench's hip line, facing the basin; mirrored through the centre as the model is.
const SIDES: readonly { readonly at: (along: number) => [number, number]; facing: QuarterTurns }[] =
  [
    { at: (along) => [along, BACK + 2], facing: 0 },
    { at: (along) => [N - BACK - 2, along], facing: 3 },
    { at: (along) => [N - along, N - BACK - 2], facing: 2 },
    { at: (along) => [BACK + 2, N - along], facing: 1 },
  ];

const BENCHES: readonly ModelSeat[] = SIDES.flatMap(({ at, facing }) =>
  ALONG.map((along) => {
    const [x, z] = at(along);
    return { x, y: HIPS, z, facing } as const;
  }),
);

const inBasin = (x: number, z: number, reach: number): boolean => {
  const dx = Math.abs(x + 0.5 - CENTRE);
  const dz = Math.abs(z + 0.5 - CENTRE);
  return dx <= reach && dz <= reach && dx + dz <= reach + BASIN.chamfer;
};

export default defineModel({
  id: 'misting-pavilion',
  label: 'Misting Pavilion',
  category: 'amenities',
  tiles: { x: 2, z: 2 },
  // Its derived cost is a pergola and some benches; the pipes and the pump are what it sells.
  cost: 600,
  scenery: 0.3,
  // A free place every guest wants in a heatwave: more than two empty the beach and the bars.
  placement: { perResort: { min: 1, max: 2 } },
  sound: 'mist',
  water: [PALETTE.water.base],
  seats: BENCHES,
  venue: {
    role: 'service',
    sign: 'mist',
    names: [
      'The Cool Corner',
      'Oasi Fresca',
      'The Mist Garden',
      'Breeze Pergola',
      'Fontana Fresca',
      'The Shady Rest',
      'Rugiada',
      'The Cooling Court',
      'Ombra e Acqua',
      'The Dew Drop',
    ],
    cools: true,
    // A sip of water and a sit in the cool, not a drink: a free thirst place must not take the
    // bars' trade.
    satisfies: [
      { need: 'energy', amount: 0.3 },
      { need: 'thirst', amount: 0.15 },
    ],
    capacity: BENCHES.length,
    dwellSeconds: { min: 600, max: 1500 },
    shelter: 'covered',
    doors: [
      { x: 16, z: N, facing: 0 },
      { x: 0, z: 16, facing: 3 },
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const { foliage, metal, stone, teak, water } = PALETTE;
    const [west, east] = POSTS;

    plinth(b, { x: 0, z: 0, w: N + 1, d: N + 1, height: GROUND });
    // Wet under the mist, where the paving never quite dries.
    box(west + 2, east - 1, GROUND - 1, GROUND - 1, west + 2, east - 1, stone.shade);

    for (const x of POSTS) {
      for (const z of POSTS) box(x, x + 1, GROUND, BEAM - 1, z, z + 1, teak.shade);
    }
    for (const z of POSTS) box(0, N, BEAM, BEAM, z, z + 1, teak.base);
    for (let x = 1; x + SLATS.width <= N; x += SLATS.width + SLATS.gap) {
      box(x, x + SLATS.width - 1, SLATS.y, SLATS.y + 1, 0, N, teak.light);
    }

    // Along the inner face of each beam, fed up the first post, a nozzle under it every few voxels.
    for (const z of [west + 2, east - 1]) {
      box(west + 2, east - 1, PIPE, PIPE, z, z, metal.light);
      box(west + 2, west + 2, GROUND, PIPE - 1, z, z, metal.light);
      for (let x = west + 5; x < east - 1; x += NOZZLE_EVERY) b.set(x, PIPE - 1, z, metal.base);
    }

    for (let x = 0; x <= N; x++) {
      for (let z = 0; z <= N; z++) {
        if (!inBasin(x, z, BASIN.reach)) continue;
        if (inBasin(x, z, BASIN.reach - BASIN.rim)) box(x, x, GROUND, GROUND, z, z, water.base);
        else box(x, x, GROUND, GROUND + 1, z, z, stone.light);
      }
    }
    box(SPOUT.x0, SPOUT.x1, GROUND, SPOUT.top, SPOUT.x0, SPOUT.x1, stone.base);
    box(SPOUT.x0, SPOUT.x1, SPOUT.top + 1, SPOUT.top + 1, SPOUT.x0, SPOUT.x1, stone.light);
    // A tap toward each door, for the drinking fountain it is.
    box(SPOUT.x0, SPOUT.x1, SPOUT.top - 1, SPOUT.top - 1, SPOUT.x1 + 1, SPOUT.x1 + 1, metal.light);
    box(SPOUT.x0 - 1, SPOUT.x0 - 1, SPOUT.top - 1, SPOUT.top - 1, SPOUT.x0, SPOUT.x1, metal.light);

    for (const { at, facing } of SIDES) {
      const across = facing === 0 || facing === 2;
      const [x0, z0] = at(ALONG[0] - 2);
      const [x1, z1] = at(ALONG[2] + 1);
      const row = across ? z0 : x0;
      const from = across ? Math.min(x0, x1) : Math.min(z0, z1);
      const to = across ? Math.max(x0, x1) : Math.max(z0, z1);
      const back = row + (facing === 0 || facing === 1 ? -2 : 2);
      const paint =
        (a0: number, a1: number, y0: number, y1: number, r0: number, r1: number) =>
        (color: number): void =>
          across ? box(a0, a1, y0, y1, r0, r1, color) : box(r0, r1, y0, y1, a0, a1, color);
      paint(from, to, PLANK, PLANK, row - 1, row + 1)(teak.base);
      for (const leg of [from + 1, to - 1])
        paint(leg, leg, GROUND, GROUND, row - 1, row + 1)(teak.deep);
      paint(from, to, HIPS, HIPS + 1, back, back)(teak.shade);
      paint(from, to, HIPS + 2, HIPS + 2, back, back)(teak.light);
    }

    for (const x of [11, 19]) pottedPlant(b, { x, z: N - 2, y: GROUND, size: 2, leaf: foliage });
  },
});
