import { PALETTE } from '../palette.ts';
import { plinth } from '../parts/ground.ts';
import { poolWater } from '../parts/pool.ts';
import { pottedPlant } from '../parts/props.ts';
import { gableRoof, hipRoof } from '../parts/roof.ts';
import { awning, doorway, shutteredWindow, stuccoWall } from '../parts/wall.ts';
import { defineModel, type VoxelBuilder } from '../voxelgen.ts';

const X = 143;
const Z = 111;

const GREEN = 3;
const WALK = 4;

const LAWN = { x0: 2, x1: 141, z0: 2, z1: 109 } as const;

// One winding walk rather than a grid: in at the front gate, west along the lower
// walk, up past the clubhouse and east along the upper walk, so the holes play in order.
const UPPER = 35;
const LOWER = 71;
const WEST = 20;
const FRONT_GATE = 104;
const BACK_GATE = 76;

interface Area {
  readonly x0: number;
  readonly x1: number;
  readonly z0: number;
  readonly z1: number;
}

interface Disc {
  readonly x: number;
  readonly z: number;
  readonly r: number;
}

type Hazard = 'gatehouse' | 'jars' | 'chicane' | 'bunker' | 'plateau' | 'pergola' | 'none';

interface Hole {
  readonly lane: readonly Area[];
  readonly disc?: Disc;
  readonly tee: readonly [number, number];
  readonly cup: readonly [number, number];
  readonly hazard: Hazard;
  readonly at: Area;
}

const LAKE = { x0: 53, x1: 113, z0: 43, z1: 66 } as const;
const ISLAND = { x: 83.5, z: 53.5, r: 7.5 } as const;

const straight = (
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  hazard: Hazard,
  reverse = false,
): Hole => {
  const area = { x0, x1, z0, z1 };
  const alongX = x1 - x0 > z1 - z0;
  const midX = Math.floor((x0 + x1) / 2);
  const midZ = Math.floor((z0 + z1) / 2);
  const near: [number, number] = alongX ? [x0 + 2, midZ] : [midX, z0 + 2];
  const far: [number, number] = alongX ? [x1 - 3, midZ] : [midX, z1 - 3];
  return {
    lane: [area],
    tee: reverse ? far : near,
    cup: reverse ? near : far,
    hazard,
    at: area,
  };
};

const HOLES: readonly Hole[] = [
  straight(FRONT_GATE - 48, FRONT_GATE - 6, 78, 86, 'gatehouse', true),
  {
    lane: [
      { x0: 72, x1: 98, z0: 99, z1: 107 },
      { x0: 56, x1: 80, z0: 90, z1: 98 },
    ],
    tee: [95, 103],
    cup: [59, 94],
    hazard: 'bunker',
    at: { x0: 72, x1: 98, z0: 99, z1: 107 },
  },
  straight(9, 50, 99, 107, 'jars', true),
  straight(9, 50, 78, 86, 'pergola'),
  straight(26, 34, 40, 69, 'jars', true),
  straight(38, 46, 40, 69, 'plateau'),
  straight(60, 68, 40, 69, 'none', true),
  {
    lane: [{ x0: 81, x1: 85, z0: 60, z1: 69 }],
    disc: ISLAND,
    tee: [83, 67],
    cup: [83, 50],
    hazard: 'none',
    at: { x0: 81, x1: 85, z0: 60, z1: 69 },
  },
  straight(94, 102, 40, 69, 'pergola'),
  straight(131, 139, 40, 69, 'chicane', true),
  straight(86, 115, 19, 27, 'plateau', true),
  {
    lane: [{ x0: 86, x1: 121, z0: 5, z1: 13 }],
    disc: { x: 130, z: 13, r: 9 },
    tee: [88, 9],
    cup: [135, 16],
    hazard: 'bunker',
    at: { x0: 86, x1: 121, z0: 5, z1: 13 },
  },
  straight(20, 70, 5, 13, 'gatehouse', true),
  {
    lane: [
      { x0: 5, x1: 40, z0: 22, z1: 30 },
      { x0: 34, x1: 70, z0: 17, z1: 25 },
    ],
    tee: [67, 21],
    cup: [8, 26],
    hazard: 'chicane',
    at: { x0: 5, x1: 40, z0: 22, z1: 30 },
  },
  straight(112, 120, 78, 107, 'plateau'),
  straight(126, 134, 78, 107, 'jars', true),
];

const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const cellsOf = (hole: Hole): Set<string> => {
  const cells = new Set<string>();
  for (const r of hole.lane) {
    for (let x = r.x0; x <= r.x1; x++) {
      for (let z = r.z0; z <= r.z1; z++) cells.add(`${x},${z}`);
    }
  }
  const disc = hole.disc;
  if (disc) {
    for (let x = Math.floor(disc.x - disc.r); x <= disc.x + disc.r; x++) {
      for (let z = Math.floor(disc.z - disc.r); z <= disc.z + disc.r; z++) {
        const dx = Math.abs(x + 0.5 - disc.x);
        const dz = Math.abs(z + 0.5 - disc.z);
        if (Math.max(dx, dz) <= disc.r && dx + dz <= disc.r * 1.45) cells.add(`${x},${z}`);
      }
    }
  }
  return cells;
};

interface Frame {
  readonly alongX: boolean;
  readonly lo: number;
  readonly hi: number;
  readonly left: number;
  readonly right: number;
}
const frameOf = (r: Area): Frame => {
  const alongX = r.x1 - r.x0 > r.z1 - r.z0;
  return alongX
    ? { alongX, lo: r.x0, hi: r.x1, left: r.z0, right: r.z1 }
    : { alongX, lo: r.z0, hi: r.z1, left: r.x0, right: r.x1 };
};
const at = (f: Frame, t: number): number => Math.round(f.lo + (f.hi - f.lo) * t);

const TOWER = { x: 5, z: 5, w: 10, d: 10 } as const;
const BELFRY = GREEN + 22;
const CLUBHOUSE = { x: 5, z: 44, w: 12, d: 20 } as const;
const COUNTER = CLUBHOUSE.x + CLUBHOUSE.w - 1;

const LANTERN = PALETTE.amber.light;

// Only eight, one to each stretch of walk: the course stands on a plot several times.
const LAMPS: ReadonlyArray<readonly [number, number]> = [
  [WEST - 1, UPPER - 1],
  [48, UPPER - 1],
  [100, UPPER - 1],
  [128, UPPER + WALK],
  [BACK_GATE - 1, 20],
  [30, LOWER + WALK],
  [80, LOWER + WALK],
  [FRONT_GATE + WALK, 92],
];

export default defineModel({
  id: 'minigolf-b',
  label: 'Minigolf B',
  category: 'leisure',
  placement: { perResort: { min: 1, max: 3 } },
  venue: {
    shelter: 'open',
    role: 'activity',
    satisfies: [{ need: 'fun', amount: 0.7 }],
    capacity: 16,
    dwellSeconds: { min: 1800, max: 3600 },
    price: 3,
    doors: [
      { x: BACK_GATE + 1, z: 0, facing: 2 },
      { x: FRONT_GATE + 1, z: Z, facing: 0 },
      { x: 0, z: LOWER + 1, facing: 3 },
      { x: X, z: UPPER + 1, facing: 1 },
    ],
  },
  tiles: { x: 9, z: 7 },
  emissive: [LANTERN],
  water: [PALETTE.water.base],
  lights: [
    ...LAMPS.map(([x, z]) => ({
      x,
      z,
      y: GREEN + 5,
      color: LANTERN,
      intensity: 34,
      distance: 28,
    })),
    {
      x: TOWER.x + TOWER.w / 2,
      y: BELFRY + 4,
      z: TOWER.z + TOWER.d / 2,
      color: LANTERN,
      intensity: 60,
      distance: 40,
    },
    {
      x: COUNTER + 2,
      y: GREEN + 9,
      z: CLUBHOUSE.z + 10,
      color: LANTERN,
      intensity: 50,
      distance: 32,
    },
  ],
  build: (b: VoxelBuilder) => {
    const set = b.set.bind(b);
    const box = b.box.bind(b);
    const { amber, bloom, foliage, grass, metal, sand, stone, stucco, teak, terracotta, water } =
      PALETTE;

    plinth(b, { x: 0, z: 0, w: X + 1, d: Z + 1 });
    box(LAWN.x0, LAWN.x1, GREEN, GREEN, LAWN.z0, LAWN.z1, grass.base);

    // A dry-stone wall instead of a hedge, broken only where the walk comes through.
    const wall = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GREEN + 1, GREEN + 2, z0, z1, stone.shade);
    const gatePier = (x: number, z: number): void =>
      box(x, x + 1, GREEN + 1, GREEN + 4, z, z + 1, stone.light);
    wall(LAWN.x0, BACK_GATE - 1, LAWN.z0, LAWN.z0 + 1);
    wall(BACK_GATE + WALK, LAWN.x1, LAWN.z0, LAWN.z0 + 1);
    wall(LAWN.x0, FRONT_GATE - 1, LAWN.z1 - 1, LAWN.z1);
    wall(FRONT_GATE + WALK, LAWN.x1, LAWN.z1 - 1, LAWN.z1);
    wall(LAWN.x0, LAWN.x0 + 1, LAWN.z0, LOWER - 1);
    wall(LAWN.x0, LAWN.x0 + 1, LOWER + WALK, LAWN.z1);
    wall(LAWN.x1 - 1, LAWN.x1, LAWN.z0, UPPER - 1);
    wall(LAWN.x1 - 1, LAWN.x1, UPPER + WALK, LAWN.z1);
    for (const x of [BACK_GATE - 2, BACK_GATE + WALK]) gatePier(x, LAWN.z0);
    for (const x of [FRONT_GATE - 2, FRONT_GATE + WALK]) gatePier(x, LAWN.z1 - 1);
    for (const z of [LOWER - 2, LOWER + WALK]) gatePier(LAWN.x0, z);
    for (const z of [UPPER - 2, UPPER + WALK]) gatePier(LAWN.x1 - 1, z);

    const pave = (x0: number, x1: number, z0: number, z1: number): void =>
      box(x0, x1, GREEN, GREEN, z0, z1, stone.base);
    pave(WEST, LAWN.x1, UPPER, UPPER + WALK - 1);
    pave(LAWN.x0, FRONT_GATE + WALK - 1, LOWER, LOWER + WALK - 1);
    pave(WEST, WEST + WALK - 1, UPPER, LOWER + WALK - 1);
    pave(FRONT_GATE, FRONT_GATE + WALK - 1, LOWER, LAWN.z1);
    pave(BACK_GATE, BACK_GATE + WALK - 1, LAWN.z0, UPPER - 1);
    // Mitred bends, so the walk reads as one path turning rather than two crossing.
    for (let i = 0; i < 3; i++) {
      for (let j = 0; i + j < 3; j++) {
        set(WEST + i, GREEN, UPPER + j, grass.base);
        set(WEST + WALK + i, GREEN, UPPER + WALK + j, stone.base);
        set(FRONT_GATE + WALK - 1 - i, GREEN, LOWER + j, grass.base);
        set(FRONT_GATE - 1 - i, GREEN, LOWER + WALK + j, stone.base);
      }
    }

    poolWater(b, {
      x: LAKE.x0,
      z: LAKE.z0,
      w: LAKE.x1 - LAKE.x0 + 1,
      d: LAKE.z1 - LAKE.z0 + 1,
      deck: GREEN,
      depth: 2,
      water,
    });

    // Each tier's water is flat; the spill over each notch is foam-coloured, since any
    // face in the water colour gets the ripple shader, vertical or not.
    const tier = (area: Area, deck: number, lip: Area): void => {
      box(area.x0, area.x1, GREEN, deck, area.z0, area.z1, stone.shade);
      poolWater(b, {
        x: area.x0 + 1,
        z: area.z0 + 1,
        w: area.x1 - area.x0 - 1,
        d: area.z1 - area.z0 - 1,
        deck,
        depth: 2,
        water,
      });
      box(lip.x0, lip.x1, deck - 2, deck - 1, lip.z0, lip.z1, water.light);
      for (let z = lip.z0; z <= lip.z1; z++) b.del(lip.x0, deck, z);
    };
    tier({ x0: 114, x1: 122, z0: 46, z1: 63 }, GREEN + 2, { x0: 114, x1: 114, z0: 52, z1: 58 });
    tier({ x0: 121, x1: 129, z0: 41, z1: 59 }, GREEN + 5, { x0: 121, x1: 121, z0: 47, z1: 53 });
    box(125, 129, GREEN + 3, GREEN + 7, 41, 44, stone.base);
    box(127, 129, GREEN + 8, GREEN + 10, 41, 43, stone.shade);

    const overLake = (x: number, z: number): boolean =>
      x >= LAKE.x0 && x <= LAKE.x1 && z >= LAKE.z0 && z <= LAKE.z1;

    // Over the lake the felt rides on a solid causeway, so no water face hides under it.
    const lane = (cells: ReadonlySet<string>, island: boolean): void => {
      for (const cell of cells) {
        const [x, z] = cell.split(',').map(Number) as [number, number];
        const edge = SIDES.some(([dx, dz]) => !cells.has(`${x + dx},${z + dz}`));
        const wet = overLake(x, z);
        if (wet) box(x, x, 1, GREEN - 1, z, z, stone.base);
        set(x, GREEN, z, grass.light);
        if (!edge) continue;
        if (wet) box(x, x, 1, GREEN + 1, z, z, island ? stone.light : teak.shade);
        else set(x, GREEN + 1, z, teak.base);
      }
    };

    const cup = (x: number, z: number, y: number, flag: number): void => {
      set(x, y, z, metal.deep);
      box(x, x, y + 1, y + 7, z, z, stucco.light);
      box(x + 1, x + 3, y + 6, y + 7, z, z, flag);
    };

    const put = (
      f: Frame,
      a0: number,
      a1: number,
      c0: number,
      c1: number,
      y0: number,
      y1: number,
      color: number,
    ): void => {
      if (f.alongX) box(a0, a1, y0, y1, c0, c1, color);
      else box(c0, c1, y0, y1, a0, a1, color);
    };
    const gatehouse = (f: Frame): void => {
      const mid = at(f, 0.5);
      const a0 = mid - 4;
      const a1 = mid + 3;
      const c0 = f.left - 1;
      const c1 = f.right + 1;
      const body = f.alongX
        ? { x: a0, z: c0, w: a1 - a0 + 1, d: c1 - c0 + 1 }
        : { x: c0, z: a0, w: c1 - c0 + 1, d: a1 - a0 + 1 };
      const eaves = stuccoWall(b, { ...body, y: GREEN + 1, storeys: 1, skirting: 1 });
      gableRoof(b, { ...body, y: eaves, ridge: f.alongX ? 'x' : 'z', overhang: 1 });
      for (let a = a0; a <= a1; a++) {
        for (let c = f.left + 1; c <= f.right - 1; c++) {
          for (let y = GREEN + 1; y <= GREEN + 5; y++) {
            if (f.alongX) b.del(a, y, c);
            else b.del(c, y, a);
          }
        }
      }
      for (const a of [a0, a1]) {
        put(f, a, a, f.left, f.right, GREEN + 6, GREEN + 6, stone.light);
        put(f, a, a, f.left, f.left, GREEN + 1, GREEN + 5, stone.light);
        put(f, a, a, f.right, f.right, GREEN + 1, GREEN + 5, stone.light);
      }
    };

    const jars = (f: Frame): void => {
      const inner = f.left + 1;
      const offsets = [0, 4, 2];
      [0.3, 0.5, 0.7].forEach((t, index) => {
        const a = at(f, t) - 1;
        const c = inner + offsets[index]!;
        put(f, a, a + 2, c, c + 2, GREEN + 1, GREEN + 3, terracotta.base);
        put(f, a + 1, a + 1, c + 1, c + 1, GREEN + 4, GREEN + 4, terracotta.shade);
      });
    };

    // Baffles from alternate kerbs, so the ball has to weave rather than aim.
    const chicane = (f: Frame): void => {
      [0.35, 0.5, 0.65].forEach((t, index) => {
        const a = at(f, t);
        const fromLeft = index % 2 === 0;
        const c0 = fromLeft ? f.left + 1 : f.right - 5;
        const c1 = fromLeft ? f.left + 5 : f.right - 1;
        put(f, a, a, c0, c1, GREEN + 1, GREEN + 2, teak.light);
      });
    };

    const bunker = (f: Frame): void => {
      put(f, at(f, 0.35), at(f, 0.55), f.left + 2, f.right - 2, GREEN, GREEN, sand.light);
    };

    // The raised end is solid felt on a timber face, with one course of ramp to climb it.
    const plateau = (f: Frame, cupEnd: number): number => {
      const high = cupEnd > (f.lo + f.hi) / 2;
      const edge = at(f, high ? 0.6 : 0.4);
      const [a0, a1] = high ? [edge, f.hi] : [f.lo, edge];
      put(f, a0, a1, f.left + 1, f.right - 1, GREEN + 1, GREEN + 2, grass.light);
      put(f, a0, a1, f.left, f.left, GREEN + 1, GREEN + 3, teak.base);
      put(f, a0, a1, f.right, f.right, GREEN + 1, GREEN + 3, teak.base);
      const endA = high ? f.hi : f.lo;
      put(f, endA, endA, f.left, f.right, GREEN + 1, GREEN + 3, teak.base);
      const ramp = high ? edge - 1 : edge + 1;
      put(f, ramp, ramp, f.left + 1, f.right - 1, GREEN + 1, GREEN + 1, grass.light);
      put(f, ramp, ramp, f.left, f.left, GREEN + 2, GREEN + 2, teak.base);
      put(f, ramp, ramp, f.right, f.right, GREEN + 2, GREEN + 2, teak.base);
      return GREEN + 2;
    };

    const pergola = (f: Frame): void => {
      const a0 = at(f, 0.5) - 4;
      const a1 = a0 + 8;
      const c0 = f.left - 1;
      const c1 = f.right + 1;
      for (const a of [a0, a1]) {
        for (const c of [c0, c1]) put(f, a, a, c, c, 1, GREEN + 8, teak.base);
      }
      for (const c of [c0, c1]) put(f, a0, a1, c, c, GREEN + 9, GREEN + 9, teak.shade);
      put(f, a0, a1, c0, c1, GREEN + 10, GREEN + 10, foliage.base);
      put(f, a0 + 1, a0 + 3, c0 + 1, c0 + 4, GREEN + 11, GREEN + 11, bloom.base);
      put(f, a1 - 4, a1 - 1, c1 - 3, c1 - 1, GREEN + 11, GREEN + 11, bloom.base);
    };

    // Solid blocks of bloom, since a bed dotted flower by flower defeats the mesher.
    const bed = (x0: number, x1: number, z0: number, z1: number, flower: number): void => {
      box(x0, x1, GREEN + 1, GREEN + 1, z0, z1, terracotta.deep);
      box(x0 + 1, x1 - 1, GREEN + 2, GREEN + 2, z0, z1, flower);
    };

    const olive = (x: number, z: number, y = GREEN + 1): void => {
      box(x, x + 1, y, y + 4, z, z + 1, teak.shade);
      box(x - 2, x + 3, y + 5, y + 8, z - 2, z + 3, foliage.light);
    };

    HOLES.forEach((hole, index) => {
      const cells = cellsOf(hole);
      lane(cells, hole.disc === ISLAND);
      const [tx, tz] = hole.tee;
      const start = hole.lane.find((r) => tx >= r.x0 && tx <= r.x1 && tz >= r.z0 && tz <= r.z1)!;
      const s = frameOf(start);
      const near = (s.alongX ? tx : tz) < (s.lo + s.hi) / 2;
      const [t0, t1] = near ? [s.lo + 1, s.lo + 2] : [s.hi - 2, s.hi - 1];
      put(s, t0, t1, s.left + 1, s.right - 1, GREEN, GREEN, grass.deep);
      const f = frameOf(hole.at);
      const [cx, cz] = hole.cup;
      let surface = GREEN;
      if (hole.hazard === 'gatehouse') gatehouse(f);
      else if (hole.hazard === 'jars') jars(f);
      else if (hole.hazard === 'chicane') chicane(f);
      else if (hole.hazard === 'bunker') bunker(f);
      else if (hole.hazard === 'plateau') surface = plateau(f, f.alongX ? cx : cz);
      else if (hole.hazard === 'pergola') pergola(f);
      cup(cx, cz, surface, index % 2 === 0 ? bloom.base : amber.base);
    });

    // The lollipop green plays round a planted island.
    box(128, 131, GREEN + 1, GREEN + 1, 11, 14, stone.light);
    olive(129, 12, GREEN + 2);

    const tower = (): void => {
      const x1 = TOWER.x + TOWER.w - 1;
      const z1 = TOWER.z + TOWER.d - 1;
      box(TOWER.x, x1, GREEN + 1, BELFRY - 2, TOWER.z, z1, stucco.base);
      box(TOWER.x, x1, GREEN + 1, GREEN + 2, TOWER.z, z1, stone.base);
      box(TOWER.x, x1, GREEN + 12, GREEN + 12, TOWER.z, z1, stucco.light);
      box(TOWER.x - 1, x1 + 1, BELFRY - 1, BELFRY - 1, TOWER.z - 1, z1 + 1, stone.light);
      for (const [x, z] of [
        [TOWER.x, TOWER.z],
        [x1, TOWER.z],
        [TOWER.x, z1],
        [x1, z1],
      ] as const) {
        box(x, x, GREEN + 1, BELFRY - 2, z, z, stucco.light);
      }
      doorway(b, { face: 'z+', at: z1, along: TOWER.x + 3, y: GREEN + 1, w: 4, h: 8 });
      shutteredWindow(b, { face: 'x+', at: x1, along: TOWER.z + 4, y: GREEN + 14, w: 2, h: 4 });
      shutteredWindow(b, { face: 'z+', at: z1, along: TOWER.z + 4, y: GREEN + 14, w: 2, h: 4 });
      for (const x of [TOWER.x, x1 - 1]) {
        for (const z of [TOWER.z, z1 - 1]) box(x, x + 1, BELFRY, BELFRY + 7, z, z + 1, stucco.base);
      }
      box(TOWER.x + 3, x1 - 3, BELFRY + 3, BELFRY + 4, TOWER.z + 3, z1 - 3, amber.deep);
      box(TOWER.x + 4, x1 - 4, BELFRY + 5, BELFRY + 7, TOWER.z + 4, z1 - 4, amber.deep);
      box(TOWER.x + 4, x1 - 4, BELFRY, BELFRY + 1, TOWER.z + 4, z1 - 4, LANTERN);
      box(TOWER.x - 1, x1 + 1, BELFRY + 8, BELFRY + 8, TOWER.z - 1, z1 + 1, stone.light);
      hipRoof(b, { ...TOWER, y: BELFRY + 9, overhang: 1 });
    };
    tower();

    const clubhouse = (): void => {
      const eaves = stuccoWall(b, { ...CLUBHOUSE, y: GREEN + 1, storeys: 1 });
      gableRoof(b, { ...CLUBHOUSE, y: eaves, ridge: 'z' });
      const back = CLUBHOUSE.z;
      const front = CLUBHOUSE.z + CLUBHOUSE.d - 1;
      pave(CLUBHOUSE.x, WEST - 1, front + 1, LOWER - 1);
      pave(COUNTER + 1, WEST - 1, back, front);
      shutteredWindow(b, {
        face: 'x+',
        at: COUNTER,
        along: back + 6,
        y: GREEN + 5,
        w: 8,
        h: 4,
        shutters: false,
      });
      box(COUNTER + 1, COUNTER + 1, GREEN + 4, GREEN + 4, back + 5, back + 14, stone.light);
      awning(b, {
        face: 'x+',
        at: COUNTER,
        along: back + 4,
        w: 12,
        y: GREEN + 11,
        reach: 2,
        canvas: amber,
      });
      for (const z of [back + 3, back + 16])
        box(COUNTER + 1, COUNTER + 1, GREEN + 7, GREEN + 8, z, z, LANTERN);
      doorway(b, { face: 'z+', at: front, along: CLUBHOUSE.x + 4, y: GREEN + 1 });
      shutteredWindow(b, { face: 'z-', at: back, along: CLUBHOUSE.x + 5, y: GREEN + 5 });
      bed(CLUBHOUSE.x, CLUBHOUSE.x + 3, front + 1, front + 1, bloom.base);
      bed(CLUBHOUSE.x + 8, CLUBHOUSE.x + 11, front + 1, front + 1, bloom.base);
      const rack = COUNTER + 2;
      for (const z of [front - 5, front - 3, front - 1])
        box(rack, rack, GREEN + 1, GREEN + 5, z, z, metal.base);
      box(rack, rack, GREEN + 5, GREEN + 5, front - 5, front - 1, teak.base);
    };
    clubhouse();

    const cypress = (x: number, z: number): void => {
      box(x, x + 2, GREEN + 1, GREEN + 12, z, z + 2, foliage.deep);
      box(x + 1, x + 1, GREEN + 13, GREEN + 15, z + 1, z + 1, foliage.deep);
    };
    for (const x of [BACK_GATE - 4, BACK_GATE + WALK + 1]) cypress(x, LAWN.z0 + 2);
    for (const x of [FRONT_GATE - 4, FRONT_GATE + WALK + 1]) cypress(x, LAWN.z1 - 4);
    cypress(LAWN.x1 - 4, UPPER - 4);
    cypress(TOWER.x + TOWER.w + 2, TOWER.z);

    for (const [x, z] of [
      [15, 91],
      [36, 92],
      [62, 102],
      [88, 91],
      [125, 26],
      [9, 38],
    ] as const)
      olive(x, z);
    bed(22, 29, 93, 95, bloom.base);
    bed(43, 50, 93, 95, amber.base);
    bed(122, 124, 82, 88, amber.base);
    bed(122, 124, 96, 102, bloom.base);
    for (const [x, z] of [
      [LAWN.x0 + 2, LOWER - 3],
      [LAWN.x0 + 2, LOWER + WALK + 1],
    ] as const)
      pottedPlant(b, { x, z, y: GREEN });

    for (const [x, z] of LAMPS) {
      box(x, x, GREEN + 1, GREEN + 4, z, z, metal.deep);
      set(x, GREEN + 5, z, LANTERN);
      set(x, GREEN + 6, z, metal.deep);
    }
  },
});
