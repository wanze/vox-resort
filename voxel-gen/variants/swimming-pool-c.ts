import { PALETTE, type Ramp } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { parasol, pottedPlant, pottedTree } from '../parts/props.ts';
import { flatRoof } from '../parts/roof.ts';
import { arcade, arcadeTop } from '../parts/veranda.ts';
import { doorway } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 127;
const Z = 95;

// Written down because a seat declaration cannot read a local; build checks the two agree.
const TOP_LAYER = 4;
const DECK = TOP_LAYER - 1;

// The deck's layer, the water's top face: the basins flood up to one below it.
const SURFACE = DECK;

// A lido: a long pool with round ends, a diving tower at the west end, a paddling pool to
// the east, and a colonnade of changing cabins along the back under a clock tower.
const LIDO = { xa: 40, xb: 88, z: 44, r: 14, x0: 26, x1: 101, z0: 30, z1: 57 } as const;
const PADDLING = { x: 114, z: 44, r: 9 } as const;

const LANES = [31, 40, 49] as const;
const DIVE = { x: 28, z: 38, w: 10, d: 12 } as const;
const PADDLE = {
  x: PADDLING.x - PADDLING.r + 1,
  z: PADDLING.z - PADDLING.r + 1,
  w: 2 * PADDLING.r - 2,
  d: 2 * PADDLING.r - 2,
} as const;

const COLONNADE = {
  x: 4,
  z: 8,
  w: 120,
  d: 2,
  y: TOP_LAYER,
  along: 'x',
  bays: 13,
  pier: 3,
  height: 9,
} as const;
const CABINS = { z0: 2, z1: 4 } as const;
const TOWER = { x0: 57, x1: 70, z0: 1, z1: 11, top: TOP_LAYER + 24 } as const;

const PYLON = { x0: 12, x1: 17, z0: 41, z1: 46, top: TOP_LAYER + 13 } as const;

const CHAIR = { x: 62, z: 60, seat: TOP_LAYER + 7 } as const;

const NORTH = { head: 16, pairs: [6, 24, 42, 78, 96, 114] } as const;
const SOUTH = { head: 88, pairs: [6, 24, 42, 78, 96, 114] } as const;
const PAIR = [0, 7] as const;

const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

const inLido = (x: number, z: number): boolean => {
  const px = x + 0.5;
  const dx = px < LIDO.xa ? px - LIDO.xa : px > LIDO.xb ? px - LIDO.xb : 0;
  const dz = z + 0.5 - LIDO.z;
  return dx * dx + dz * dz <= LIDO.r * LIDO.r;
};

const inPaddling = (x: number, z: number): boolean =>
  (x + 0.5 - PADDLING.x) ** 2 + (z + 0.5 - PADDLING.z) ** 2 <= PADDLING.r ** 2;

// Blue tile: the shade step, since only the water's base tone is drawn as water.
const TILE = PALETTE.water.shade;
const AWNING: Ramp = { ...PALETTE.stucco, base: TILE };

export default defineModel({
  id: 'swimming-pool-c',
  label: 'Swimming Pool C',
  category: 'leisure',
  tiles: { x: 8, z: 6 },
  // Mostly water, which the size rule reads as cheap.
  cost: 5_000,
  seats: [
    ...NORTH.pairs.flatMap((x) =>
      PAIR.map(
        (dx) =>
          ({ x: x + dx + 1, y: TOP_LAYER + 2, z: NORTH.head + 4, facing: 0, pose: 'lie' }) as const,
      ),
    ),
    ...SOUTH.pairs.flatMap((x) =>
      PAIR.map(
        (dx) =>
          ({ x: x + dx + 1, y: TOP_LAYER + 2, z: SOUTH.head - 4, facing: 2, pose: 'lie' }) as const,
      ),
    ),
  ],
  water: [PALETTE.water.base],
  // No voxel emits these: the water is simply lit at night.
  lights: [
    { x: 34, y: 4, z: 44, color: 0x7fd8ee, intensity: 90, distance: 52 },
    { x: 54, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 78, y: 4, z: 44, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 114, y: 4, z: 44, color: 0x7fd8ee, intensity: 90, distance: 52 },
  ],
  // A negative amount is a need a visit makes worse: a swim spends energy.
  venue: {
    shelter: 'open',
    role: 'activity',
    bathing: true,
    satisfies: [
      { need: 'fun', amount: 0.8 },
      { need: 'energy', amount: -0.2 },
    ],
    capacity: 16,
    dwellSeconds: { min: 1800, max: 5400 },
    reliability: 120,
    order: ['areas', 'spots', 'seats'],
    areas: [
      ...LANES.map(
        (z) =>
          ({
            kind: 'swim',
            x: LIDO.xa,
            z,
            w: LIDO.xb - LIDO.xa,
            d: 8,
            surface: SURFACE,
            places: 4,
            laps: true,
          }) as const,
      ),
      { kind: 'swim', ...DIVE, surface: SURFACE, places: 2 },
      { kind: 'wade', ...PADDLE, round: true, surface: SURFACE, places: 6, for: 'child' },
    ],
    spots: [
      {
        x: CHAIR.x + 1,
        y: CHAIR.seat + 1,
        z: CHAIR.z + 1,
        facing: 2,
        pose: 'sit',
        for: 'lifeguard',
      },
    ],
  },
  build: (b: VoxelBuilder) => {
    const box = b.box.bind(b);
    const set = b.set.bind(b);
    const { bloom, foliage, metal, stone, stucco, teak, water } = PALETTE;

    const top = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });
    if (top !== TOP_LAYER) throw new Error('The deck and the loungers must agree on its surface');
    box(2, X - 2, DECK, DECK, 2, Z - 2, stucco.light);
    box(61, 66, DECK, DECK, TOWER.z1 + 1, LIDO.z0 - 1, stone.light);

    // poolWater draws one rectangle or ellipse, and the lido is neither: a stadium.
    const basin = (
      inside: (x: number, z: number) => boolean,
      bounds: { x0: number; x1: number; z0: number; z1: number },
      depth: number,
    ): void => {
      const floor = DECK - depth;
      for (let x = bounds.x0 - 1; x <= bounds.x1 + 1; x++) {
        for (let z = bounds.z0 - 1; z <= bounds.z1 + 1; z++) {
          const wet = inside(x, z);
          if (SIDES.some(([dx, dz]) => inside(x + dx, z + dz) !== wet)) {
            box(x, x, wet ? floor : DECK, DECK, z, z, TILE);
          } else if (wet) {
            box(x, x, floor, DECK - 1, z, z, water.base);
            b.del(x, DECK, z);
          }
        }
      }
    };
    basin(inLido, LIDO, 2);
    const paddling = {
      x0: PADDLING.x - PADDLING.r,
      x1: PADDLING.x + PADDLING.r - 1,
      z0: PADDLING.z - PADDLING.r,
      z1: PADDLING.z + PADDLING.r - 1,
    };
    basin(inPaddling, paddling, 1);

    // A toadstool shower in the paddling pool.
    box(PADDLING.x - 1, PADDLING.x, DECK, DECK + 5, PADDLING.z - 1, PADDLING.z, stucco.base);
    for (let x = PADDLING.x - 4; x < PADDLING.x + 4; x++) {
      for (let z = PADDLING.z - 4; z < PADDLING.z + 4; z++) {
        const d2 = (x + 0.5 - PADDLING.x) ** 2 + (z + 0.5 - PADDLING.z) ** 2;
        if (d2 <= 16) set(x, DECK + 6, z, bloom.base);
        if (d2 <= 6) set(x, DECK + 7, z, bloom.base);
      }
    }
    for (const [x, z] of [
      [PADDLING.x - 3, PADDLING.z],
      [PADDLING.x + 1, PADDLING.z - 3],
      [PADDLING.x, PADDLING.z + 2],
    ] as const) {
      set(x, DECK + 7, z, stucco.light);
    }

    const ladder = (x: number, z: number, over: number): void => {
      for (const rail of [x, x + 3]) {
        box(rail, rail, top, top + 3, z, z, metal.light);
        set(rail, top + 3, over, metal.light);
      }
      for (const rung of [top, top + 2]) box(x + 1, x + 2, rung, rung, z, z, metal.light);
    };
    for (const x of [50, 76]) {
      ladder(x, LIDO.z0, LIDO.z0 + 1);
      ladder(x, LIDO.z1, LIDO.z1 - 1);
    }

    // The diving tower: a stepped pylon with a board over the deep end, banded in tile.
    box(PYLON.x0, PYLON.x1, top, PYLON.top, PYLON.z0, PYLON.z1, stucco.base);
    for (const y of [top + 4, top + 9]) {
      box(PYLON.x0, PYLON.x1, y, y, PYLON.z0, PYLON.z1, TILE);
    }
    const board = PYLON.top + 1;
    box(PYLON.x0, 30, board, board, PYLON.z0 + 1, PYLON.z1 - 1, stucco.light);
    box(PYLON.x0, 30, board - 1, board - 1, PYLON.z0 + 1, PYLON.z1 - 1, TILE);
    for (const z of [PYLON.z0 + 1, PYLON.z1 - 1]) {
      box(PYLON.x0, 22, board + 1, board + 3, z, z, metal.light);
    }
    const climb = PYLON.x0 - 1;
    for (const z of [PYLON.z0 + 1, PYLON.z1 - 1])
      box(climb, climb, top, board + 3, z, z, metal.light);
    for (let rung = top + 1; rung <= board; rung += 2) {
      box(climb, climb, rung, rung, PYLON.z0 + 2, PYLON.z1 - 2, metal.light);
    }
    box(20, 23, top, top + 1, 34, 36, stucco.base);
    box(21, 32, top + 2, top + 2, 34, 36, stucco.light);

    // The colonnade runs the length of the back; the cabins behind it show through the arches.
    const roofline = arcadeTop(COLONNADE);
    box(
      COLONNADE.x,
      COLONNADE.x + COLONNADE.w - 1,
      top,
      roofline - 1,
      CABINS.z0,
      CABINS.z1,
      stucco.base,
    );
    box(COLONNADE.x, COLONNADE.x + COLONNADE.w - 1, top, top + 1, CABINS.z0, CABINS.z1, stone.base);
    for (let bay = 0; bay < COLONNADE.bays; bay++) {
      const x = COLONNADE.x + bay * 9 + 4;
      box(x, x + 3, top, top + 8, CABINS.z1, CABINS.z1, bay % 2 ? bloom.base : TILE);
      box(x - 1, x + 4, top + 9, top + 9, CABINS.z1, CABINS.z1, stucco.light);
    }
    arcade(b, { ...COLONNADE, wall: stucco, trim: stone });
    flatRoof(b, {
      x: COLONNADE.x,
      z: CABINS.z0,
      w: COLONNADE.w,
      d: COLONNADE.z + COLONNADE.d - CABINS.z0,
      y: roofline,
      cover: stucco,
    });

    box(TOWER.x0, TOWER.x1, top, TOWER.top, TOWER.z0, TOWER.z1, stucco.base);
    for (const x of [TOWER.x0 + 2, TOWER.x1 - 2]) {
      box(x, x, top + 11, TOWER.top - 1, TOWER.z1, TOWER.z1, TILE);
    }
    doorway(b, { face: 'z+', at: TOWER.z1, along: 61, y: top, w: 6, h: 10, trim: stone });
    box(61, 66, top + 15, top + 20, TOWER.z1, TOWER.z1, stucco.light);
    box(63, 63, top + 17, top + 19, TOWER.z1, TOWER.z1, metal.deep);
    box(64, 65, top + 17, top + 17, TOWER.z1, TOWER.z1, metal.deep);
    const crown = TOWER.top + 1;
    box(TOWER.x0 + 1, TOWER.x1 - 1, crown, crown + 1, TOWER.z0 + 1, TOWER.z1 - 1, stucco.light);
    box(TOWER.x0 + 3, TOWER.x1 - 3, crown + 2, crown + 3, TOWER.z0 + 3, TOWER.z1 - 3, stucco.base);
    box(63, 64, crown + 4, crown + 4, 5, 6, TILE);
    box(63, 63, crown + 5, crown + 12, 6, 6, metal.light);
    box(64, 67, crown + 9, crown + 11, 6, 6, bloom.base);

    for (const x of [CHAIR.x, CHAIR.x + 3]) {
      for (const z of [CHAIR.z, CHAIR.z + 3]) box(x, x, top, top + 6, z, z, stucco.base);
    }
    box(CHAIR.x, CHAIR.x + 3, top + 3, top + 3, CHAIR.z, CHAIR.z, stucco.base);
    box(CHAIR.x, CHAIR.x + 3, CHAIR.seat, CHAIR.seat, CHAIR.z, CHAIR.z + 3, TILE);
    box(CHAIR.x, CHAIR.x + 3, top + 8, top + 10, CHAIR.z + 3, CHAIR.z + 3, stucco.base);
    box(CHAIR.x - 1, CHAIR.x + 4, top + 13, top + 13, CHAIR.z - 1, CHAIR.z + 4, bloom.base);
    box(CHAIR.x + 3, CHAIR.x + 3, top + 11, top + 12, CHAIR.z + 3, CHAIR.z + 3, metal.light);

    const lounger = (x: number, head: number, headNorth: boolean): void => {
      const z0 = headNorth ? head : head - 5;
      const lean = headNorth ? head + 1 : head - 1;
      box(x, x + 3, top, top, z0, z0 + 5, metal.light);
      box(x, x + 3, top + 1, top + 1, z0, z0 + 5, TILE);
      box(x, x + 3, top + 2, top + 2, lean, lean, TILE);
      box(x, x + 3, top + 2, top + 3, head, head, TILE);
      box(x, x + 3, top + 4, top + 4, head, head, stucco.light);
    };
    NORTH.pairs.forEach((x, index) => {
      for (const dx of PAIR) lounger(x + dx, NORTH.head, true);
      const canvas = index % 2 ? stucco : AWNING;
      parasol(b, { x: x + 5, z: NORTH.head - 1, y: top, reach: 3, canvas });
    });
    SOUTH.pairs.forEach((x, index) => {
      for (const dx of PAIR) lounger(x + dx, SOUTH.head, false);
      const canvas = index % 2 ? AWNING : stucco;
      parasol(b, { x: x + 5, z: SOUTH.head + 1, y: top, reach: 3, canvas });
    });

    for (const x of [14, 40, 86, 110]) pottedTree(b, { x, z: 70, y: top, pot: stucco });

    const shower = { x: 100, z: 64 } as const;
    box(shower.x - 1, shower.x + 2, DECK, DECK, shower.z - 1, shower.z + 2, TILE);
    box(shower.x, shower.x, top, top + 9, shower.z, shower.z, metal.light);
    box(shower.x + 1, shower.x + 1, top + 9, top + 9, shower.z, shower.z, metal.light);
    box(shower.x + 1, shower.x + 1, top + 2, top + 7, shower.z, shower.z, water.light);

    for (const [x, z] of [
      [1, 92],
      [124, 92],
      [1, 30],
      [124, 30],
      [124, 60],
    ] as const) {
      pottedPlant(b, { x, z, y: top, pot: stucco, leaf: foliage });
    }
    box(2, 9, top, top + 1, 60, 61, teak.base);
    box(2, 9, top + 2, top + 2, 60, 61, teak.light);
  },
});
