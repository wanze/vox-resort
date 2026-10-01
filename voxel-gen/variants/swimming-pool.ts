import { PALETTE, type Ramp } from '../palette.ts';
import { plinth, steps } from '../parts/ground.ts';
import { parasol, pottedPlant } from '../parts/props.ts';
import { hipRoof } from '../parts/roof.ts';
import { doorway, shutteredWindow, stuccoWall } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 127;
const Z = 95;

// Written down because a seat declaration cannot read a local; build checks the two agree.
const TOP_LAYER = 4;

const LAGOON = { x: 8, z: 28, w: 82, d: 38 } as const;
const ISLAND = { x: 49, z: 47, r: 6.5 } as const;
const CHANNEL = { x0: 86, x1: 97, z0: 44, z1: 49 } as const;
const SPA = { x: 109, z: 47, r: 12 } as const;
const HUT = { x: 102, z: 3, w: 20, d: 11 } as const;

// The raised spa holds the only single layer of water, so it stands in for a paddling pool.
const SPA_WATER = TOP_LAYER + 2;

// The deck's layer, the lagoon's top face: the basin floods up to one below it.
const SURFACE = TOP_LAYER - 1;

// Rectangles of open water either side of the island, inside the coping. The west end is
// wandered; the long reaches north and south of the island are swum in laps.
const NORTH_REACH = { x: 20, z: LAGOON.z + 2, w: 58, d: 10 } as const;
const SOUTH_REACH = { x: 20, z: LAGOON.z + LAGOON.d - 12, w: 58, d: 10 } as const;
const WEST_END = { x: 11, z: 38, w: 31, d: 18 } as const;
// Inside the spa's stone ring, which takes its outermost voxel.
const SPA_POOL = { x: SPA.x - SPA.r + 1, z: SPA.z - SPA.r + 1, w: 2 * SPA.r - 2, d: 2 * SPA.r - 2 };

const CHAIR = { x: 56, z: 69, seat: TOP_LAYER + 7 } as const;

const NORTH = { head: 8, pairs: [4, 20, 36, 52, 68, 84] } as const;
const SOUTH = { head: 87, pairs: [6, 26, 46, 66, 86, 106] } as const;
const PAIR = [0, 7] as const;

const SIDES = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

const inCircle = (c: { x: number; z: number; r: number }, x: number, z: number): boolean =>
  (x + 0.5 - c.x) ** 2 + (z + 0.5 - c.z) ** 2 <= c.r * c.r;

const inLagoon = (x: number, z: number): boolean => {
  const half = LAGOON.d / 2;
  const west = LAGOON.x + half;
  const east = LAGOON.x + LAGOON.w - half;
  const px = x + 0.5;
  const dx = px < west ? px - west : px > east ? px - east : 0;
  const dz = z + 0.5 - (LAGOON.z + half);
  const inChannel = x >= CHANNEL.x0 && x <= CHANNEL.x1 && z >= CHANNEL.z0 && z <= CHANNEL.z1;
  return (dx * dx + dz * dz <= half * half && !inCircle(ISLAND, x, z)) || inChannel;
};

export default defineModel({
  id: 'swimming-pool-b',
  label: 'Swimming Pool B',
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
    { x: 24, y: 4, z: 47, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 74, y: 4, z: 47, color: 0x7fd8ee, intensity: 120, distance: 66 },
    { x: 109, y: 8, z: 47, color: 0x7fd8ee, intensity: 90, distance: 52 },
    { x: 49, y: 4, z: 60, color: 0x7fd8ee, intensity: 90, distance: 52 },
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
    capacity: 30,
    dwellSeconds: { min: 1800, max: 5400 },
    reliability: 120,
    order: ['areas', 'spots', 'seats'],
    areas: [
      { kind: 'swim', ...NORTH_REACH, surface: SURFACE, places: 4, laps: true },
      { kind: 'wade', ...SPA_POOL, round: true, surface: SPA_WATER + 1, places: 6, for: 'child' },
      { kind: 'swim', ...SOUTH_REACH, surface: SURFACE, places: 4, laps: true },
      { kind: 'swim', ...WEST_END, surface: SURFACE, places: 4 },
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
    const { stone, water, teak, stucco, terracotta, foliage, grass, thatch, metal, bloom } =
      PALETTE;

    const top = plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1, height: 4 });
    if (top !== TOP_LAYER) throw new Error('The deck and the loungers must agree on its surface');
    const deck = top - 1;
    box(2, X - 2, deck, deck, 2, Z - 2, teak.light);

    // poolWater draws one rectangle or ellipse; two overlapping would leave a coping seam across
    // the water, so the lagoon, its island and the spa channel share one outline here.
    const basin = (inside: (x: number, z: number) => boolean, coping: Ramp): void => {
      const floor = deck - 2;
      for (let x = LAGOON.x - 1; x <= CHANNEL.x1 + 1; x++) {
        for (let z = LAGOON.z - 1; z <= LAGOON.z + LAGOON.d; z++) {
          const wet = inside(x, z);
          if (SIDES.some(([dx, dz]) => inside(x + dx, z + dz) !== wet)) {
            box(x, x, wet ? floor : deck, deck, z, z, coping.light);
          } else if (wet) {
            box(x, x, floor, deck - 1, z, z, water.base);
            b.del(x, deck, z);
          }
        }
      }
    };
    basin(inLagoon, stone);

    for (let x = ISLAND.x - 7; x <= ISLAND.x + 7; x++) {
      for (let z = ISLAND.z - 7; z <= ISLAND.z + 7; z++) {
        if (!inCircle(ISLAND, x, z)) continue;
        const edge = !inCircle({ ...ISLAND, r: ISLAND.r - 1 }, x, z);
        box(x, x, deck, top, z, z, edge ? stone.light : grass.base);
      }
    }
    for (const [x, z] of [
      [45, 44],
      [51, 50],
      [45, 50],
    ] as const)
      box(x, x + 1, top + 1, top + 2, z, z + 1, foliage.base);

    // The trunk leans away from the camera so the crown never hides the lagoon's near rim.
    const crown = top + 24;
    let tx = ISLAND.x - 1;
    let tz = ISLAND.z - 1;
    for (let y = top + 1; y < crown; y++) {
      if (y > top + 10 && y % 5 === 0) tx++;
      if (y > top + 14 && y % 6 === 0) tz--;
      box(tx, tx + 1, y, y, tz, tz + 1, thatch.shade);
    }
    for (const [dx, dz] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const) {
      const reach = dx !== 0 && dz !== 0 ? 5 : 7;
      for (let step = 1; step <= reach; step++) {
        const droop = step > reach - 3 ? step - reach + 3 : 0;
        const fx = tx + (dx > 0 ? 1 : 0) + dx * step;
        const fz = tz + (dz > 0 ? 1 : 0) + dz * step;
        const leaf = step > reach - 2 ? foliage.light : foliage.base;
        set(fx, crown - droop, fz, leaf);
        if (step < 2 || step > reach - 2) continue;
        if (dx === 0 || dz === 0) {
          set(fx + dz, crown - droop, fz + dx, leaf);
          set(fx - dz, crown - droop, fz - dx, leaf);
        } else {
          set(fx - dx, crown - droop, fz, leaf);
        }
      }
    }
    box(tx, tx + 1, crown, crown + 1, tz, tz + 1, foliage.light);
    box(tx - 1, tx - 1, crown - 1, crown - 1, tz, tz + 1, teak.deep);

    // Raised a metre so it reads as a spa rather than a second pool, and so it can spill.
    const spaTop = SPA_WATER;
    for (let x = SPA.x - SPA.r; x < SPA.x + SPA.r; x++) {
      for (let z = SPA.z - SPA.r; z < SPA.z + SPA.r; z++) {
        if (!inCircle(SPA, x, z)) continue;
        const ring = SIDES.some(([dx, dz]) => !inCircle(SPA, x + dx, z + dz));
        box(x, x, 1, spaTop, z, z, stucco.base);
        if (ring) set(x, spaTop + 1, z, stone.light);
        else set(x, spaTop, z, water.base);
      }
    }
    const lip = SPA.x - SPA.r;
    for (let z = CHANNEL.z0 + 1; z < CHANNEL.z1; z++) {
      b.del(lip, spaTop + 1, z);
      set(lip, spaTop, z, stone.light);
      // Not the water colour: the shader only takes horizontal water, so the spill is a sheet.
      box(lip - 1, lip - 1, deck, spaTop, z, z, water.light);
    }
    steps(b, { x: SPA.x - 2, z: SPA.z + SPA.r, w: 4, y: spaTop, treads: 3, descends: 'z+' });

    const ladder = (x: number, z: number, over: number): void => {
      for (const rail of [x, x + 3]) {
        box(rail, rail, top, top + 3, z, z, metal.base);
        set(rail, top + 3, over, metal.base);
      }
      for (const rung of [top, top + 2]) box(x + 1, x + 2, rung, rung, z, z, metal.base);
    };
    ladder(32, LAGOON.z, LAGOON.z + 1);
    ladder(64, LAGOON.z + LAGOON.d - 1, LAGOON.z + LAGOON.d - 2);

    box(3, 6, top, top + 1, 45, 48, stone.base);
    box(3, 13, top + 2, top + 2, 46, 47, stucco.light);

    for (const x of [CHAIR.x, CHAIR.x + 3]) {
      for (const z of [CHAIR.z, CHAIR.z + 3]) box(x, x, top, top + 6, z, z, teak.shade);
    }
    box(CHAIR.x, CHAIR.x + 3, top + 3, top + 3, CHAIR.z, CHAIR.z, teak.base);
    box(CHAIR.x, CHAIR.x + 3, CHAIR.seat, CHAIR.seat, CHAIR.z, CHAIR.z + 3, teak.base);
    box(CHAIR.x, CHAIR.x + 3, top + 8, top + 10, CHAIR.z + 3, CHAIR.z + 3, teak.base);
    box(CHAIR.x + 1, CHAIR.x + 2, top + 4, top + 5, CHAIR.z + 4, CHAIR.z + 4, bloom.base);

    const lounger = (x: number, head: number, headNorth: boolean): void => {
      const z0 = headNorth ? head : head - 5;
      const lean = headNorth ? head + 1 : head - 1;
      box(x, x + 3, top, top, z0, z0 + 5, teak.shade);
      box(x, x + 3, top + 1, top + 1, z0, z0 + 5, stucco.light);
      box(x, x + 3, top + 2, top + 2, lean, lean, stucco.light);
      box(x, x + 3, top + 2, top + 3, head, head, stucco.light);
      box(x, x + 3, top + 4, top + 4, head, head, terracotta.light);
    };
    for (const x of NORTH.pairs) {
      for (const dx of PAIR) lounger(x + dx, NORTH.head, true);
      parasol(b, { x: x + 5, z: NORTH.head - 1, y: top, reach: 3, canvas: terracotta });
    }
    for (const x of SOUTH.pairs) {
      for (const dx of PAIR) lounger(x + dx, SOUTH.head, false);
      parasol(b, { x: x + 5, z: SOUTH.head + 1, y: top, reach: 3, canvas: terracotta });
    }

    // A garden wall only along the back edge, where it cannot hide anything from the camera.
    box(1, HUT.x - 1, top, top + 4, 1, 2, stucco.base);
    box(1, HUT.x - 1, top + 5, top + 5, 1, 2, terracotta.base);

    const eaves = stuccoWall(b, { ...HUT, y: top, storeys: 1 });
    hipRoof(b, { ...HUT, y: eaves });
    const front = HUT.z + HUT.d - 1;
    doorway(b, { face: 'z+', at: front, along: 110, y: top });
    shutteredWindow(b, { face: 'z+', at: front, along: 104, y: top + 4 });
    shutteredWindow(b, { face: 'z+', at: front, along: 117, y: top + 4 });
    box(103, 108, top, top + 1, front + 1, front + 2, teak.base);
    box(104, 105, top + 2, top + 2, front + 1, front + 2, stucco.light);
    box(106, 107, top + 2, top + 3, front + 1, front + 2, terracotta.light);

    for (const [x, z] of [
      [1, 4],
      [1, 92],
      [124, 16],
      [124, 92],
      [124, 60],
      [115, front + 1],
      [98, 4],
    ] as const)
      pottedPlant(b, { x, z, y: top });

    const shower = { x: 97, z: 22 } as const;
    box(shower.x - 1, shower.x + 2, deck, deck, shower.z - 1, shower.z + 2, stone.shade);
    box(shower.x, shower.x, top, top + 9, shower.z, shower.z, teak.base);
    box(shower.x + 1, shower.x + 1, top + 9, top + 9, shower.z, shower.z, teak.shade);
    set(shower.x + 1, top + 8, shower.z, metal.light);
    box(shower.x + 1, shower.x + 1, top + 2, top + 7, shower.z, shower.z, water.light);
  },
});
